import {
  gameRoot,
  graphDbExists,
  openKnowledgeGraph,
  relatedFunctions as queryRelatedFunctions,
  resourceGraphDbPath,
  type RelatedFunctionsQuery,
  type RelatedFunctionsResult,
} from "@server/core/knowledge";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_GAME_ID } from "@server/core/game-registry";

import { formatLocator } from "../locator.js";
import type { PrioritizedTargetRow } from "../migration/prioritize.js";
import type { KnowledgeStoreHandle } from "../records/index.js";
import type {
  EntityIdentityStatus,
  EntityKind,
  EventCause,
  EventKind,
  Integration,
  Outcome,
  TargetIdentityStatus,
  WorkerErrorType,
} from "../storage/schema.js";
import type {
  Kv2UnitMemberTarget,
  Kv2UnitPullRequest,
  Kv2UnitSummary,
} from "../tools.js";
import {
  knowledgeRecord,
  targetLedger,
  unitView,
  type KnowledgeRecord,
  type TargetLedgerEntry,
} from "../views/index.js";

export type BackfillMechanicalEntityKind = Extract<
  EntityKind,
  "translation_unit" | "struct" | "struct_field" | "parameter"
>;

export interface BackfillTargetStatus {
  target_id: string;
  match_pct: number;
  linked: boolean;
  size: number | null;
  content_hash: string | null;
  report_revision: string;
  updated_at: string;
}

export interface BackfillPassTarget {
  id: string;
  kind: PrioritizedTargetRow["kind"];
  unit: string;
  unit_entity_id: string;
  symbol: string | null;
  stable_key: string;
  address: string | null;
  identity_status: TargetIdentityStatus;
  report_revision: string;
  target_status: BackfillTargetStatus | null;
  match_pct: number | null;
  linked: boolean;
  named_symbol: boolean;
  unit_named_ratio: number;
}

export interface BackfillUnitContext {
  status: "ok";
  unit: Kv2UnitSummary;
  members: Kv2UnitMemberTarget[];
  pull_requests: Kv2UnitPullRequest[];
  total_pr_count: number;
  count: number;
  truncated: boolean;
}

export interface BackfillMechanicalEntity {
  id: string;
  kind: BackfillMechanicalEntityKind;
  locator: string;
  parent_entity_id: string | null;
  identity_status: EntityIdentityStatus;
  merged_into_id: string | null;
}

export interface BackfillGroupedLedger {
  runs: Array<{
    id: string;
    goal: string;
    baseline: Record<string, unknown>;
    summary: string | null;
    final_outcome: Outcome;
    error_type: WorkerErrorType | null;
    integration: Integration | null;
    started_at: string;
    ended_at: string | null;
    submissions: Array<{
      seq: number;
      score: number;
      description: string;
      hypothesis: string | null;
      submitted_at: string;
      locator: string;
    }>;
  }>;
  pull_requests: Array<{
    locator: string;
    pr_ref: string;
    outcome: Outcome;
    summary: string;
    merged_at: string;
  }>;
  events: Array<{
    kind: EventKind;
    cause: EventCause | null;
    summary: string;
    created_at: string;
  }>;
}

export type BackfillSourceSpan =
  | { locator: string; text: string; truncated: boolean }
  | { locator: null; reason: string };

export interface BackfillAnalogEntry {
  stable_key: string;
  relation: "opseq_analog" | "caller" | "callee";
  score: number | null;
  match_pct: number | null;
  has_facts: boolean;
}

export type BackfillAnalogs =
  | {
    opseq_analogs: BackfillAnalogEntry[];
    callers: BackfillAnalogEntry[];
    callees: BackfillAnalogEntry[];
  }
  | { unavailable: true; reason: string };

export interface BackfillTargetMaterial {
  source: BackfillSourceSpan;
  analogs: BackfillAnalogs;
}

export type BackfillRelatedFunctions = (
  query: RelatedFunctionsQuery,
) => RelatedFunctionsResult;

export interface BackfillContextOptions {
  checkoutRoot?: string;
  checkoutRev?: string;
  graphDbPath?: string;
  relatedFunctions?: BackfillRelatedFunctions;
}

/** One entry of the ordered fill-out loop: linked entities first, the target last. */
export type BackfillFillOutSubject =
  | {
    order: number;
    kind: "entity";
    entity_kind: BackfillMechanicalEntityKind;
    entity_locator: string;
    record: KnowledgeRecord;
    /** Present on the translation_unit entry: its members and recent pull requests. */
    material?: BackfillUnitContext;
  }
  | {
    order: number;
    kind: "target";
    target_stable_key: string;
    detail: BackfillPassTarget;
    ledger: BackfillGroupedLedger;
    material: BackfillTargetMaterial;
    record: KnowledgeRecord;
  };

/** A connected curated subject: context to read, not owed facts. */
export interface BackfillSupportingSubject {
  kind: "game_concept" | "pattern";
  entity_locator: string;
  record: KnowledgeRecord;
}

export interface BackfillApplyScope {
  targetStableKeys: string[];
  entityLocators: string[];
}

export interface BackfillPassContext {
  target: BackfillPassTarget;
  ledger: TargetLedgerEntry[];
  unitContext: BackfillUnitContext;
  linkedEntities: BackfillMechanicalEntity[];
  /** The ordered fill-out loop the agent works: linked entities first, the target last. */
  fillOut: BackfillFillOutSubject[];
  /** Connected game concepts and patterns: supporting context, not owed facts. */
  supporting: BackfillSupportingSubject[];
  scope: BackfillApplyScope;
}

export interface TargetRow {
  id: string;
  kind: PrioritizedTargetRow["kind"];
  unit: string;
  unit_entity_id: string;
  symbol: string | null;
  stable_key: string;
  address: string | null;
  identity_status: TargetIdentityStatus;
  report_revision: string;
}

interface TargetStatusRow {
  target_id: string;
  match_pct: number;
  linked: number;
  size: number | null;
  content_hash: string | null;
  report_revision: string;
  updated_at: string;
}

interface UnitPullRequestRow {
  id: string;
  pr_ref: string;
  summary: string;
  outcome: Outcome;
  merged_at: string;
}

const UNIT_PR_LIMIT = 15;
const ANALOG_LIMIT = 8;
const SOURCE_LINE_LIMIT = 200;
const checkoutRevisions = new Map<string, string>();

/** Group ordered ledger entries into runs, pull requests, and events. */
export function groupedLedger(entries: TargetLedgerEntry[]): BackfillGroupedLedger {
  const runs = new Map<string, BackfillGroupedLedger["runs"][number]>();
  for (const entry of entries) {
    if (entry.type !== "submission") continue;
    let run = runs.get(entry.workerRun.id);
    if (!run) {
      run = {
        id: entry.workerRun.id,
        goal: entry.workerRun.goal,
        baseline: entry.workerRun.baseline,
        summary: entry.workerRun.summary,
        final_outcome: entry.workerRun.finalOutcome,
        error_type: entry.workerRun.errorType,
        integration: entry.workerRun.integration,
        started_at: entry.workerRun.startedAt,
        ended_at: entry.workerRun.endedAt,
        submissions: [],
      };
      runs.set(run.id, run);
    }
    run.submissions.push({
      seq: entry.seq,
      score: entry.score,
      description: entry.description,
      hypothesis: entry.hypothesis,
      submitted_at: entry.timestamp,
      locator: formatLocator({
        kind: "attempt",
        runId: entry.workerRun.id,
        submissionSequence: entry.seq,
      }),
    });
  }

  const orderedRuns = [...runs.values()]
    .map((run) => ({
      ...run,
      submissions: run.submissions.sort((left, right) => left.seq - right.seq),
    }))
    .sort((left, right) =>
      right.started_at.localeCompare(left.started_at) || right.id.localeCompare(left.id));
  const pullRequests = entries
    .filter((entry) => entry.type === "pull_request")
    .sort((left, right) =>
      right.timestamp.localeCompare(left.timestamp) || right.id.localeCompare(left.id))
    .map((entry) => ({
      locator: formatLocator({ kind: "pr", pullRequestId: entry.id }),
      pr_ref: entry.prRef,
      outcome: entry.outcome,
      summary: entry.summary,
      merged_at: entry.timestamp,
    }));
  const events = entries
    .filter((entry) => entry.type === "event")
    .sort((left, right) =>
      right.timestamp.localeCompare(left.timestamp) || right.id.localeCompare(left.id))
    .map((entry) => ({
      kind: entry.kind,
      cause: entry.cause,
      summary: entry.summary,
      created_at: entry.timestamp,
    }));
  return { runs: orderedRuns, pull_requests: pullRequests, events };
}

function checkoutRevision(checkoutRoot: string): string {
  const cached = checkoutRevisions.get(checkoutRoot);
  if (cached !== undefined) return cached;
  let revision = "unknown";
  try {
    revision = execFileSync(
      "git",
      ["-C", checkoutRoot, "rev-parse", "--short", "HEAD"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim() || "unknown";
  } catch {
    // A missing or non-git fixture checkout still produces a valid fail-soft locator revision.
  }
  checkoutRevisions.set(checkoutRoot, revision);
  return revision;
}

function sanitizedCSource(source: string): string {
  let result = "";
  let state: "code" | "line_comment" | "block_comment" | "string" | "char" = "code";
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]!;
    const next = source[index + 1];
    if (state === "code") {
      if (char === "/" && next === "/") {
        result += "  ";
        index += 1;
        state = "line_comment";
      } else if (char === "/" && next === "*") {
        result += "  ";
        index += 1;
        state = "block_comment";
      } else if (char === "\"") {
        result += " ";
        state = "string";
      } else if (char === "'") {
        result += " ";
        state = "char";
      } else {
        result += char;
      }
      continue;
    }
    if (state === "line_comment") {
      if (char === "\n") {
        result += char;
        state = "code";
      } else {
        result += " ";
      }
      continue;
    }
    if (state === "block_comment") {
      if (char === "*" && next === "/") {
        result += "  ";
        index += 1;
        state = "code";
      } else {
        result += char === "\n" ? "\n" : " ";
      }
      continue;
    }
    result += char === "\n" ? "\n" : " ";
    if (escaped) {
      escaped = false;
    } else if (char === "\\") {
      escaped = true;
    } else if ((state === "string" && char === "\"") || (state === "char" && char === "'")) {
      state = "code";
    } else if (char === "\n") {
      state = "code";
    }
  }
  return result;
}

function regexEscape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Read the target function's bounded source span from its translation unit. */
export function sourceSpan(
  unitLocator: string,
  target: TargetRow,
  options: BackfillContextOptions,
): BackfillSourceSpan {
  if (target.kind === "data") return { locator: null, reason: "section target" };
  if (target.symbol === null) return { locator: null, reason: "target symbol unavailable" };
  try {
    const checkoutRoot = resolve(options.checkoutRoot ?? resolve(gameRoot(DEFAULT_GAME_ID), "checkout"));
    const sourcePath = unitLocator.replace(/^translation_unit:/, "");
    const filePath = resolve(checkoutRoot, sourcePath);
    if (!existsSync(filePath)) return { locator: null, reason: "unit source file not found" };

    const source = readFileSync(filePath, "utf8").replace(/\r\n?/g, "\n");
    const sanitized = sanitizedCSource(source);
    const sourceLines = source.split("\n");
    const sanitizedLines = sanitized.split("\n");
    const escapedSymbol = regexEscape(target.symbol);
    const startsWithSymbol = new RegExp(`^${escapedSymbol}\\s*\\(`);
    const signatureWithReturnType = new RegExp(
      `^[A-Za-z_][A-Za-z0-9_ \t*]*[ \t*]+${escapedSymbol}\\s*\\(`,
    );
    const candidates: number[] = [];
    for (let index = 0; index < sanitizedLines.length; index += 1) {
      const originalLine = sourceLines[index] ?? "";
      const line = (sanitizedLines[index] ?? "").trimEnd();
      if (!line || /^[ \t]/.test(originalLine) || line.startsWith("#") || line.endsWith(";")) {
        continue;
      }
      if (startsWithSymbol.test(line) || signatureWithReturnType.test(line)) candidates.push(index);
    }
    if (candidates.length === 0) {
      return { locator: null, reason: "symbol not found in unit source" };
    }
    if (candidates.length > 1) return { locator: null, reason: "ambiguous symbol match" };

    const definitionLine = candidates[0]!;
    let startLine = definitionLine;
    if (startsWithSymbol.test(sanitizedLines[definitionLine] ?? "")) {
      for (let index = definitionLine - 1; index >= 0; index -= 1) {
        const previous = (sanitizedLines[index] ?? "").trim();
        if (!previous) continue;
        if (/^[A-Za-z_][A-Za-z0-9_ \t*]*$/.test(previous)) startLine = index;
        break;
      }
    }

    let definitionOffset = 0;
    for (let index = 0; index < definitionLine; index += 1) {
      definitionOffset += (sanitizedLines[index]?.length ?? 0) + 1;
    }
    const openBrace = sanitized.indexOf("{", definitionOffset);
    const declarationEnd = sanitized.indexOf(";", definitionOffset);
    if (declarationEnd !== -1 && (openBrace === -1 || declarationEnd < openBrace)) {
      return { locator: null, reason: "symbol not found in unit source" };
    }
    if (openBrace === -1) return { locator: null, reason: "unterminated function body" };

    let depth = 0;
    let endOffset = -1;
    for (let index = openBrace; index < sanitized.length; index += 1) {
      if (sanitized[index] === "{") depth += 1;
      else if (sanitized[index] === "}") {
        depth -= 1;
        if (depth === 0) {
          endOffset = index;
          break;
        }
      }
    }
    if (endOffset === -1) return { locator: null, reason: "unterminated function body" };

    const endLine = sanitized.slice(0, endOffset).split("\n").length - 1;
    const fullLineCount = endLine - startLine + 1;
    const revision = options.checkoutRev?.trim() || checkoutRevision(checkoutRoot);
    return {
      locator: formatLocator({
        kind: "code",
        revision,
        path: sourcePath,
        startLine: startLine + 1,
        endLine: endLine + 1,
      }),
      text: sourceLines.slice(startLine, startLine + Math.min(fullLineCount, SOURCE_LINE_LIMIT)).join("\n"),
      truncated: fullLineCount > SOURCE_LINE_LIMIT,
    };
  } catch {
    return { locator: null, reason: "source span unavailable" };
  }
}

interface AnalogStatusRow {
  stable_key: string;
  match_pct: number | null;
  fact_count: number;
}

/** Resolve graph analogs and enrich them with stored target status. */
export function analogsForTarget(
  store: KnowledgeStoreHandle,
  target: TargetRow,
  options: BackfillContextOptions,
): BackfillAnalogs {
  if (target.symbol === null) return { unavailable: true, reason: "target symbol unavailable" };
  try {
    let result: RelatedFunctionsResult;
    if (options.relatedFunctions) {
      result = options.relatedFunctions({ unit: target.unit, symbol: target.symbol, limit: ANALOG_LIMIT });
    } else {
      const graphDbPath = options.graphDbPath ?? resourceGraphDbPath();
      if (!graphDbExists(graphDbPath)) {
        return { unavailable: true, reason: "knowledge graph unavailable" };
      }
      const graph = openKnowledgeGraph(graphDbPath);
      try {
        result = queryRelatedFunctions(graph, {
          unit: target.unit,
          symbol: target.symbol,
          limit: ANALOG_LIMIT,
        });
      } finally {
        graph.db.close();
      }
    }

    const related = result.functions[0];
    const mapEntries = (
      rows: Array<Record<string, unknown>>,
      relation: BackfillAnalogEntry["relation"],
    ): BackfillAnalogEntry[] => rows
      .flatMap((row) => {
        const unit = typeof row.unit === "string" ? row.unit.trim() : "";
        const symbol = typeof row.symbol === "string" ? row.symbol.trim() : "";
        if (!unit || !symbol) return [];
        return [{
          stable_key: `${unit}:${symbol}`,
          relation,
          score: relation === "opseq_analog" && typeof row.score === "number"
            ? row.score
            : null,
          match_pct: null,
          has_facts: false,
        }];
      })
      .slice(0, ANALOG_LIMIT);
    const opseqAnalogs = mapEntries(related?.opseq_analogs ?? [], "opseq_analog");
    const callers = mapEntries(related?.callers ?? [], "caller");
    const callees = mapEntries(related?.callees ?? [], "callee");
    const allEntries = [...opseqAnalogs, ...callers, ...callees];
    const stableKeys = [...new Set(allEntries.map((entry) => entry.stable_key))];
    const statusByStableKey = new Map<string, AnalogStatusRow>();
    if (stableKeys.length > 0) {
      const placeholders = stableKeys.map(() => "?").join(", ");
      const rows = store.db.query<AnalogStatusRow, string[]>(`
        SELECT t.stable_key, ts.match_pct, COUNT(f.id) AS fact_count
        FROM target t
        LEFT JOIN target_status ts ON ts.target_id = t.id
        LEFT JOIN fact f ON f.target_id = t.id
        WHERE t.identity_status = 'current'
          AND t.stable_key IN (${placeholders})
        GROUP BY t.id, t.stable_key, ts.match_pct
      `).all(...stableKeys);
      for (const row of rows) statusByStableKey.set(row.stable_key, row);
    }
    for (const entry of allEntries) {
      const status = statusByStableKey.get(entry.stable_key);
      entry.match_pct = status?.match_pct ?? null;
      entry.has_facts = (status?.fact_count ?? 0) > 0;
    }
    return { opseq_analogs: opseqAnalogs, callers, callees };
  } catch {
    return { unavailable: true, reason: "analog lookup failed" };
  }
}

export function loadTargetRow(
  store: KnowledgeStoreHandle,
  targetId: string,
): TargetRow | null {
  return store.db.query<TargetRow, [string]>(
    "SELECT * FROM target WHERE id = ?",
  ).get(targetId);
}

export function buildUnitContext(
  store: KnowledgeStoreHandle,
  unitEntityId: string,
): BackfillUnitContext {
  const unit = unitView(store).find((candidate) => candidate.unit.id === unitEntityId);
  if (!unit) throw new Error(`Backfill unit not found: ${unitEntityId}`);

  const unitPrRows = store.db.query<UnitPullRequestRow, [string]>(`
    SELECT id, pr_ref, summary, outcome, merged_at
    FROM pull_request
    WHERE entity_id = ?
    ORDER BY merged_at DESC, id
  `).all(unitEntityId);
  const unitPullRequests: Kv2UnitPullRequest[] = unitPrRows.slice(0, UNIT_PR_LIMIT).map((row) => ({
    id: row.id,
    locator: formatLocator({ kind: "pr", pullRequestId: row.id }),
    pr_ref: row.pr_ref,
    summary: row.summary,
    outcome: row.outcome,
    merged_at: row.merged_at,
  }));
  return {
    status: "ok",
    unit: {
      locator: unit.unit.locator,
      identity_status: unit.unit.identityStatus,
      match_pct: unit.matchPct,
    },
    members: unit.targets.map((member) => ({
      stable_key: member.stableKey,
      kind: member.kind,
      match_pct: member.status?.matchPct ?? null,
      named: member.symbol !== null,
    })),
    pull_requests: unitPullRequests,
    total_pr_count: unitPrRows.length,
    count: unitPullRequests.length,
    truncated: unitPrRows.length > UNIT_PR_LIMIT,
  };
}

export function buildTargetMaterial(
  store: KnowledgeStoreHandle,
  targetRow: TargetRow,
  options: BackfillContextOptions,
): BackfillTargetMaterial {
  const unit = store.db.query<{ locator: string }, [string]>(
    "SELECT locator FROM entity WHERE id = ?",
  ).get(targetRow.unit_entity_id);
  return {
    source: sourceSpan(unit?.locator ?? "", targetRow, options),
    analogs: analogsForTarget(store, targetRow, options),
  };
}

export function linkedMechanicalEntities(
  store: KnowledgeStoreHandle,
  targetRow: TargetRow,
): BackfillMechanicalEntity[] {
  return store.db.query<BackfillMechanicalEntity, [string, string, string, string]>(`
    SELECT e.id, e.kind, e.locator, e.parent_entity_id, e.identity_status, e.merged_into_id
    FROM entity e
    WHERE e.kind IN ('translation_unit', 'struct', 'struct_field', 'parameter')
      AND (
        e.id = ?
        OR EXISTS (
          SELECT 1
          FROM link l
          WHERE (l.from_target_id = ? AND l.to_entity_id = e.id)
             OR (l.to_target_id = ? AND l.from_entity_id = e.id)
        )
      )
    ORDER BY CASE WHEN e.id = ? THEN 0 ELSE 1 END, e.locator, e.id
  `).all(targetRow.unit_entity_id, targetRow.id, targetRow.id, targetRow.unit_entity_id);
}

export function supportingSubjects(
  store: KnowledgeStoreHandle,
  targetId: string,
): BackfillSupportingSubject[] {
  const rows = store.db.query<
    { id: string; kind: "game_concept" | "pattern"; locator: string },
    [string, string]
  >(`
    SELECT e.id, e.kind, e.locator
    FROM entity e
    WHERE e.kind IN ('game_concept', 'pattern')
      AND EXISTS (
        SELECT 1
        FROM link l
        WHERE (l.from_target_id = ? AND l.to_entity_id = e.id)
           OR (l.to_target_id = ? AND l.from_entity_id = e.id)
      )
    ORDER BY e.locator, e.id
  `).all(targetId, targetId);
  return rows.map((row) => ({
    kind: row.kind,
    entity_locator: row.locator,
    record: knowledgeRecord(store, { entityId: row.id }),
  }));
}

export function targetDetail(
  store: KnowledgeStoreHandle,
  targetRow: TargetRow,
  overrides: Partial<Pick<
    BackfillPassTarget,
    "match_pct" | "linked" | "named_symbol" | "unit_named_ratio"
  >> = {},
): BackfillPassTarget {
  const statusRow = store.db.query<TargetStatusRow, [string]>(
    "SELECT * FROM target_status WHERE target_id = ?",
  ).get(targetRow.id);
  const targetStatus: BackfillTargetStatus | null = statusRow === null
    ? null
    : { ...statusRow, linked: statusRow.linked === 1 };
  return {
    ...targetRow,
    target_status: targetStatus,
    match_pct: "match_pct" in overrides ? overrides.match_pct! : statusRow?.match_pct ?? null,
    linked: "linked" in overrides ? overrides.linked! : statusRow?.linked === 1,
    named_symbol: "named_symbol" in overrides
      ? overrides.named_symbol!
      : targetRow.symbol !== null,
    unit_named_ratio: "unit_named_ratio" in overrides ? overrides.unit_named_ratio! : 0,
  };
}

/** Assemble one backfill pass from mechanical store relationships only. */
export function buildPassContext(
  store: KnowledgeStoreHandle,
  prioritized: PrioritizedTargetRow,
  options: BackfillContextOptions = {},
): BackfillPassContext {
  const targetRow = loadTargetRow(store, prioritized.target_id);
  if (!targetRow) throw new Error(`Backfill target not found: ${prioritized.target_id}`);

  const unitContext = buildUnitContext(store, targetRow.unit_entity_id);

  const linkedEntities = linkedMechanicalEntities(store, targetRow);
  if (!linkedEntities.some((entity) => entity.id === targetRow.unit_entity_id)) {
    throw new Error(`Backfill unit entity not found: ${targetRow.unit_entity_id}`);
  }

  const detail = targetDetail(store, targetRow, {
    match_pct: prioritized.match_pct,
    linked: prioritized.linked,
    named_symbol: prioritized.named_symbol,
    unit_named_ratio: prioritized.unit_named_ratio,
  });
  const ledger = targetLedger(store, targetRow.id);
  const targetMaterial = buildTargetMaterial(store, targetRow, options);
  const fillOut: BackfillFillOutSubject[] = [
    ...linkedEntities.map((entity, index): BackfillFillOutSubject => ({
      order: index + 1,
      kind: "entity",
      entity_kind: entity.kind,
      entity_locator: entity.locator,
      record: knowledgeRecord(store, { entityId: entity.id }),
      ...(entity.id === targetRow.unit_entity_id ? { material: unitContext } : {}),
    })),
    {
      order: linkedEntities.length + 1,
      kind: "target",
      target_stable_key: targetRow.stable_key,
      detail,
      ledger: groupedLedger(ledger),
      material: targetMaterial,
      record: knowledgeRecord(store, { targetId: targetRow.id }),
    },
  ];

  const supporting = supportingSubjects(store, targetRow.id);

  return {
    target: detail,
    ledger,
    unitContext,
    linkedEntities,
    fillOut,
    supporting,
    scope: {
      targetStableKeys: [prioritized.stable_key],
      entityLocators: linkedEntities.map((entity) => entity.locator),
    },
  };
}
