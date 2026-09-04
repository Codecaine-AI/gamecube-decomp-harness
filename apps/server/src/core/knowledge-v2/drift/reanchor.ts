import { createHash } from "node:crypto";

import { createCodeFileCache, type CodeFileCache } from "../apply/resolver.js";
import { formatLocator, parseLocator, type CodeLocator } from "../locator.js";
import type { KnowledgeStoreHandle, SubjectRef } from "../records/index.js";
import { immediateTransaction } from "../storage/store.js";
import { flagCodeDrift, type DriftEvidenceStatus } from "./flagger.js";

type LibrarianReason = "content_changed" | "path_gone";

export interface ReanchorSummary {
  scanned: number;
  reanchored: number;
  original_unreadable: number;
  reanchored_same_path: number;
  reanchored_moved_path: number;
  reanchored_shifted: number;
  left_for_librarian: Record<LibrarianReason, number>;
  touched_subjects: number;
  by_status: {
    before: Record<DriftEvidenceStatus, number>;
    after: Record<DriftEvidenceStatus, number>;
  };
}

export interface ReanchorCodeDriftOptions {
  checkoutRoot: string;
  headRevision: string;
  limit?: number;
  dryRun?: boolean;
  codeFileCache?: CodeFileCache;
}

interface EvidenceRow {
  evidence_id: string;
  locator: string;
  target_id: string | null;
  entity_id: string | null;
  unit_key: string;
}

interface Match {
  path: string;
  startLine: number;
  endLine: number;
  span: string;
  moved: boolean;
  shifted: boolean;
}

const emptyStatuses = (): Record<DriftEvidenceStatus, number> => ({
  unchanged: 0,
  drifted: 0,
  unresolvable: 0,
});

function digest(span: string): string {
  return `sha256:${createHash("sha256").update(span).digest("hex").slice(0, 16)}`;
}

function evidenceRows(store: KnowledgeStoreHandle, limit: number | undefined): IterableIterator<EvidenceRow> {
  return store.db.query<EvidenceRow, [number]>(`
    WITH RECURSIVE lineage(root_id, id, kind, parent_entity_id) AS (
      SELECT id, id, kind, parent_entity_id FROM entity
      UNION ALL
      SELECT child.root_id, parent.id, parent.kind, parent.parent_entity_id
      FROM lineage child JOIN entity parent ON parent.id = child.parent_entity_id
    ), entity_unit AS (
      SELECT root_id, MIN(id) AS unit_entity_id
      FROM lineage WHERE kind = 'translation_unit' GROUP BY root_id
    )
    SELECT evidence.id AS evidence_id, evidence.locator, fact.target_id, fact.entity_id,
      COALESCE(target.unit_entity_id, entity_unit.unit_entity_id, fact.entity_id, fact.target_id) AS unit_key
    FROM evidence
    JOIN fact ON fact.id = evidence.fact_id
    LEFT JOIN target ON target.id = fact.target_id
    LEFT JOIN entity_unit ON entity_unit.root_id = fact.entity_id
    WHERE evidence.kind = 'code'
    ORDER BY unit_key, evidence.id
    LIMIT ?
  `).iterate(limit ?? -1);
}

function unitMoves(store: KnowledgeStoreHandle): Map<string, string> {
  const rows = store.db.query<{ old_path: string; new_path: string }, []>(`
    SELECT loser.locator AS old_path, winner.locator AS new_path
    FROM entity loser
    JOIN entity winner ON winner.id = loser.merged_into_id
    WHERE loser.kind = 'translation_unit' AND winner.kind = 'translation_unit'
      AND loser.identity_status = 'merged'
  `).all();
  return new Map(rows.map((row) => [row.old_path, row.new_path]));
}

interface TargetUnitPathRow {
  current_path: string;
  old_path: string | null;
}

function targetUnitPaths(store: KnowledgeStoreHandle, targetId: string): TargetUnitPathRow[] {
  return store.db.query<TargetUnitPathRow, [string]>(`
    SELECT current_unit.locator AS current_path, old_unit.locator AS old_path
    FROM target
    JOIN entity current_unit ON current_unit.id = target.unit_entity_id
    LEFT JOIN entity old_unit ON old_unit.merged_into_id = current_unit.id
      AND old_unit.kind = 'translation_unit' AND old_unit.identity_status = 'merged'
    WHERE target.id = ?
    ORDER BY old_unit.id
  `).all(targetId);
}

type ReadableCodeFile = Extract<ReturnType<CodeFileCache["read"]>, { ok: true }>;
type LineIndex = Map<string, number[]>;

const lineIndexes = new WeakMap<ReadableCodeFile, [LineIndex | undefined, LineIndex | undefined]>();
const ANCHOR_LINE_LIMIT = 8;
const COMMENT_ONLY_CANDIDATE_LIMIT = 50;

function comparableLine(line: string, trimTrailing: boolean): string {
  return trimTrailing ? line.replace(/\s+$/u, "") : line;
}

function lineIndex(file: ReadableCodeFile, trimTrailing: boolean): LineIndex {
  let indexes = lineIndexes.get(file);
  if (indexes === undefined) {
    indexes = [undefined, undefined];
    lineIndexes.set(file, indexes);
  }
  const slot = trimTrailing ? 1 : 0;
  let index = indexes[slot];
  if (index !== undefined) return index;
  index = new Map();
  for (let lineNumber = 0; lineNumber < file.lines.length; lineNumber += 1) {
    const text = comparableLine(file.lines[lineNumber]!, trimTrailing);
    const positions = index.get(text);
    if (positions === undefined) index.set(text, [lineNumber]);
    else positions.push(lineNumber);
  }
  indexes[slot] = index;
  return index;
}

function rangeEqual(
  fileLines: readonly string[],
  fileStart: number,
  spanLines: readonly string[],
  spanStart: number,
  spanLength: number,
  trimTrailing: boolean,
): boolean {
  if (fileStart < 0 || fileStart + spanLength > fileLines.length) return false;
  for (let offset = 0; offset < spanLength; offset += 1) {
    if (comparableLine(fileLines[fileStart + offset]!, trimTrailing)
      !== comparableLine(spanLines[spanStart + offset]!, trimTrailing)) return false;
  }
  return true;
}

function commentOnly(line: string): boolean {
  return /^\s*(?:\/\/.*|\/\*.*\*\/|\/\*.*|\*.*|\*\/)?\s*$/u.test(line);
}

function findBlock(
  file: ReadableCodeFile,
  spanLines: readonly string[],
  spanStart: number,
  spanLength: number,
  trimTrailing: boolean,
): number[] {
  const index = lineIndex(file, trimTrailing);
  let anchorOffset = -1;
  let anchorPositions: readonly number[] | undefined;
  let nonBlankSeen = 0;
  let onlyBlankOrComments = true;

  for (let offset = 0; offset < spanLength; offset += 1) {
    const rawLine = spanLines[spanStart + offset]!;
    if (!commentOnly(rawLine)) onlyBlankOrComments = false;
    const text = comparableLine(rawLine, trimTrailing);
    if (text.trim().length === 0) continue;
    const positions = index.get(text) ?? [];
    if (anchorPositions === undefined || positions.length < anchorPositions.length) {
      anchorOffset = offset;
      anchorPositions = positions;
    }
    nonBlankSeen += 1;
    if (nonBlankSeen === ANCHOR_LINE_LIMIT) break;
  }

  if (anchorPositions === undefined) {
    anchorOffset = 0;
    anchorPositions = index.get(comparableLine(spanLines[spanStart]!, trimTrailing)) ?? [];
  }
  if (onlyBlankOrComments && anchorPositions.length > COMMENT_ONLY_CANDIDATE_LIMIT) return [];

  const matches: number[] = [];
  for (const anchorPosition of anchorPositions) {
    const candidate = anchorPosition - anchorOffset;
    if (rangeEqual(file.lines, candidate, spanLines, spanStart, spanLength, trimTrailing)) {
      matches.push(candidate);
      if (spanLength >= 3) break;
    }
  }
  return matches;
}

function findMatch(
  cache: CodeFileCache,
  headRevision: string,
  parsed: CodeLocator,
  originalFile: ReadableCodeFile,
  originalStart: number,
  originalLength: number,
  candidates: readonly string[],
): { match?: Match; readablePath: boolean } {
  let readablePath = false;
  for (const path of candidates) {
    const file = cache.read(headRevision, path);
    if (!file.ok) continue;
    readablePath = true;
    for (const trimTrailing of [false, true]) {
      const sameStart = parsed.startLine - 1;
      if (rangeEqual(file.lines, sameStart, originalFile.lines, originalStart, originalLength, trimTrailing)) {
        return {
          readablePath,
          match: {
            path,
            startLine: parsed.startLine,
            endLine: parsed.endLine,
            span: file.lines.slice(sameStart, sameStart + originalLength).join("\n"),
            moved: path !== parsed.path,
            shifted: false,
          },
        };
      }
      const matches = findBlock(file, originalFile.lines, originalStart, originalLength, trimTrailing);
      if (matches.length === 0) continue;
      if (originalLength < 3 && matches.length !== 1) continue;
      const start = matches[0]!;
      return {
        readablePath,
        match: {
          path,
          startLine: start + 1,
          endLine: start + originalLength,
          span: file.lines.slice(start, start + originalLength).join("\n"),
          moved: path !== parsed.path,
          shifted: start + 1 !== parsed.startLine,
        },
      };
    }
  }
  return { readablePath };
}

function subjectFor(row: EvidenceRow): SubjectRef {
  return row.target_id === null ? { entityId: row.entity_id! } : { targetId: row.target_id };
}

function subjectKey(subject: SubjectRef): string {
  return subject.targetId === undefined ? `e:${subject.entityId}` : `t:${subject.targetId}`;
}

export function reanchorCodeDrift(
  store: KnowledgeStoreHandle,
  options: ReanchorCodeDriftOptions,
): ReanchorSummary {
  const cache = options.codeFileCache ?? createCodeFileCache(options.checkoutRoot);
  const moves = unitMoves(store);
  const targetPaths = new Map<string, TargetUnitPathRow[]>();
  const summary: ReanchorSummary = {
    scanned: 0,
    reanchored: 0,
    original_unreadable: 0,
    reanchored_same_path: 0,
    reanchored_moved_path: 0,
    reanchored_shifted: 0,
    left_for_librarian: { content_changed: 0, path_gone: 0 },
    touched_subjects: 0,
    by_status: { before: emptyStatuses(), after: emptyStatuses() },
  };
  const matchesByUnit = new Map<string, Array<{ row: EvidenceRow; match: Match }>>();
  const subjects = new Map<string, SubjectRef>();

  for (const row of evidenceRows(store, options.limit)) {
    summary.scanned += 1;
    let parsed: CodeLocator;
    try {
      const locator = parseLocator(row.locator, "code");
      if (locator.kind !== "code") continue;
      parsed = locator;
    } catch {
      summary.original_unreadable += 1;
      continue;
    }
    const original = cache.read(parsed.revision, parsed.path);
    if (!original.ok || parsed.startLine > parsed.endLine || parsed.endLine > original.lines.length) {
      summary.original_unreadable += 1;
      continue;
    }
    const originalStart = parsed.startLine - 1;
    const originalLength = parsed.endLine - originalStart;
    const candidates = [parsed.path];
    const movedPath = moves.get(parsed.path);
    if (movedPath !== undefined && !candidates.includes(movedPath)) candidates.push(movedPath);
    if (row.target_id !== null) {
      let paths = targetPaths.get(row.target_id);
      if (paths === undefined) {
        paths = targetUnitPaths(store, row.target_id);
        targetPaths.set(row.target_id, paths);
      }
      const targetPath = paths.find(({ old_path }) => old_path === parsed.path)?.current_path;
      if (targetPath !== undefined && !candidates.includes(targetPath)) candidates.push(targetPath);
    }
    const result = findMatch(cache, options.headRevision, parsed, original, originalStart, originalLength, candidates);
    if (!result.match) {
      summary.left_for_librarian[result.readablePath ? "content_changed" : "path_gone"] += 1;
      continue;
    }
    if (result.match.shifted) summary.reanchored_shifted += 1;
    else if (result.match.moved) summary.reanchored_moved_path += 1;
    else summary.reanchored_same_path += 1;
    summary.reanchored += 1;
    const subject = subjectFor(row);
    subjects.set(subjectKey(subject), subject);
    const unitMatches = matchesByUnit.get(row.unit_key) ?? [];
    unitMatches.push({ row, match: result.match });
    matchesByUnit.set(row.unit_key, unitMatches);
  }

  summary.touched_subjects = subjects.size;
  for (const subject of subjects.values()) {
    const report = flagCodeDrift(store, { ...options, subject, codeFileCache: cache });
    for (const evidence of report.evidence) summary.by_status.before[evidence.status] += 1;
  }

  if (!options.dryRun) {
    for (const matches of matchesByUnit.values()) {
      immediateTransaction(store.db, () => {
        const update = store.db.query("UPDATE evidence SET locator = ?, digest = ? WHERE id = ?");
        for (const { row, match } of matches) {
          update.run(formatLocator({
            kind: "code",
            revision: options.headRevision,
            path: match.path,
            startLine: match.startLine,
            endLine: match.endLine,
          }), digest(match.span), row.evidence_id);
        }
      });
    }
  }

  if (options.dryRun) {
    summary.by_status.after = { ...summary.by_status.before };
    const matchedIds = new Set([...matchesByUnit.values()].flat().map(({ row }) => row.evidence_id));
    for (const subject of subjects.values()) {
      const report = flagCodeDrift(store, { ...options, subject, codeFileCache: cache });
      for (const evidence of report.evidence) {
        if (!matchedIds.has(evidence.evidence_id)) continue;
        summary.by_status.after[evidence.status] -= 1;
        summary.by_status.after.unchanged += 1;
      }
    }
  } else {
    for (const subject of subjects.values()) {
      const report = flagCodeDrift(store, { ...options, subject, codeFileCache: cache });
      for (const evidence of report.evidence) summary.by_status.after[evidence.status] += 1;
    }
  }
  return summary;
}
