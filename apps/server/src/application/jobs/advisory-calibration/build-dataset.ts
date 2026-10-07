// `build-dataset`: collects the historical llm_review advisories into
// candidates.jsonl and notes.jsonl (plan §6.9 "Candidates"). History is read
// from `--source-root` without a single write: runner validation summaries
// with `detail.llm_review` findings, the attempt patch (`qa_diff.patch`, else
// the normalized `qa_diff.raw.patch`), and the checkpoint row and worker note
// from orchestrator.sqlite. One item per advisory fingerprint and checkpoint.
import { readdirSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

import { extractHunk } from "@server/core/agent-catalog/agents/running/worker/advisory-adjudication/hunks.js";
import {
  advisoryFingerprint,
  fullFlaggedLineFromPatch,
  isAdvisoryFinding,
  normalizeAdvisoryPath,
} from "@server/core/validation/qa/advisory-fingerprint.js";
import type { QaScanFinding } from "@server/core/validation/qa/scan-diff.js";

import { assertKnownFlags, requiredFlag, stringFlag, type CalibrationArgs } from "./args.js";
import { baseGroupKey } from "./groups.js";
import { createSanitizer, type Sanitize } from "./sanitize.js";
import { openSourceRoot, type SourceRoot } from "./source-root.js";
import { calibrationPaths, DEFAULT_CALIBRATION_DIR, readJsonl, sha256Hex, writeJson, writeJsonl } from "./store.js";
import type { CalibrationFinding, CalibrationItem, CodeFacts, NoteRecord } from "./types.js";

const SUMMARY_FILE = /^attempt-(\d+)\.runner_validation\.summary\.json$/;
/** Raw patches name both sides by absolute path: `<…>/runner_validation/pre_worker_source/<file>` and `<…>/attempt-N.qa_current/<file>`. */
const RAW_ANCHOR = /^(?:.*\/)?runner_validation\/(?:pre_worker_source|attempt-\d+\.qa_current)\/(.+)$/;
const FILE_HEADER = /^(---|\+\+\+) (a|b)\/(.*?)\s*$/;
const GIT_HEADER = /^diff --git a\/(.+?) b\/(.+?)\s*$/;

export interface CheckpointRow {
  id: string;
  run_id: string;
  worker_state_id: string;
  attempt_index: number;
  old_score: number | null;
  new_score: number | null;
  exact_match: number;
  artifact_path: string | null;
  metadata_json: string;
}

export interface HistoryDatasetStats {
  summaries_scanned: number;
  summaries_with_advisories: number;
  /** Summaries that mention llm_review but are not valid JSON. */
  summaries_unparseable: number;
  findings: number;
  unreadable_lines: number;
  items: number;
  checkpoints_matched: number;
  checkpoints_unmatched: number;
  notes: number;
}

export interface HistoryDataset {
  items: CalibrationItem[];
  notes: NoteRecord[];
  stats: HistoryDatasetStats;
}

export interface CalibrationManifest {
  schema: "advisory_calibration_manifest_v1";
  game: string;
  source_root: "<source-root>";
  built_at: string;
  counts: HistoryDatasetStats;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseObject(text: string | null): Record<string, unknown> {
  if (!text) return {};
  try {
    const value = JSON.parse(text) as unknown;
    return isRecord(value) ? value : {};
  } catch {
    return {};
  }
}

export function isScanFinding(value: unknown): value is QaScanFinding {
  return (
    isRecord(value) &&
    typeof value.rule_id === "string" &&
    typeof value.file === "string" &&
    Number.isSafeInteger(value.line) &&
    typeof value.excerpt === "string" &&
    typeof value.severity === "string"
  );
}

/** `adv-` + the first 20 hex digits of sha256(fingerprint + "\n" + checkpoint id, or `<worker state>:<attempt>` without a checkpoint). */
export function calibrationItemId(fingerprint: string, checkpointKey: string): string {
  return `adv-${sha256Hex(`${fingerprint}\n${checkpointKey}`).slice(0, 20)}`;
}

export function calibrationFinding(finding: QaScanFinding): CalibrationFinding {
  return {
    rule_id: finding.rule_id,
    severity: finding.severity === "info" ? "info" : "warning",
    standard_id: finding.standard_id ?? null,
    file: finding.file,
    line: finding.line,
    excerpt: finding.excerpt,
    message: typeof finding.message === "string" ? finding.message : "",
    detail: finding.detail ?? {},
  };
}

function headerPath(path: string, files: readonly string[]): string {
  const anchored = RAW_ANCHOR.exec(path);
  if (anchored) return anchored[1]!;
  // Older raw patches compared against a checkout or worktree: keep the finding's repo-relative suffix.
  for (const file of files) if (path !== file && path.endsWith(`/${file}`)) return file;
  return path;
}

/**
 * Rewrites the absolute header paths of a `qa_diff.raw.patch` to the
 * repo-relative `a/<file>` / `b/<file>` the scanner saw. Clean patches pass
 * through unchanged.
 */
export function normalizePatchHeaders(patch: string, files: readonly string[] = []): string {
  const wanted = [...new Set(files.map(normalizeAdvisoryPath))];
  return patch
    .split("\n")
    .map((line) => {
      const header = FILE_HEADER.exec(line);
      if (header) {
        const path = headerPath(header[3]!, wanted);
        return path === header[3] ? line : `${header[1]} ${header[2]}/${path}`;
      }
      const git = line.startsWith("diff --git ") ? GIT_HEADER.exec(line) : null;
      if (git) {
        const [from, to] = [headerPath(git[1]!, wanted), headerPath(git[2]!, wanted)];
        return from === git[1] && to === git[2] ? line : `diff --git a/${from} b/${to}`;
      }
      return line;
    })
    .join("\n");
}

/** The attempt patch: `qa_diff.patch`, else `qa_diff.raw.patch` with its headers normalized; null when neither has content. */
export function readAttemptPatch(source: SourceRoot, dir: string, attempt: number, files: readonly string[]): string | null {
  const clean = source.readText(join(dir, `attempt-${attempt}.qa_diff.patch`));
  const text = clean?.trim() ? clean : source.readText(join(dir, `attempt-${attempt}.qa_diff.raw.patch`));
  return text?.trim() ? normalizePatchHeaders(text, files) : null;
}

/** A text file recorded in history (legacy or current root), read-only; null when outside the root or missing. */
export function readRecordedText(source: SourceRoot, recorded: unknown): string | null {
  if (typeof recorded !== "string" || !recorded) return null;
  const local = source.rebase(recorded);
  if (local === null) return null;
  try {
    return source.readText(local);
  } catch {
    return null;
  }
}

/**
 * The worker note of a checkpoint: the final-message file at
 * `agent_output_path` (or `agentOutputPath`), else the parsed `agent_note`
 * pretty-printed, else null.
 */
export function readCheckpointNote(
  source: SourceRoot,
  metadata: Record<string, unknown>,
  agentOutputPath?: unknown,
): { source: NoteRecord["source"]; text: string } | null {
  for (const path of [agentOutputPath, metadata.agent_output_path]) {
    const text = readRecordedText(source, path);
    if (text?.trim()) return { source: "agent_output", text };
  }
  const note = metadata.agent_note;
  if (note === undefined || note === null) return null;
  const text = typeof note === "string" ? note : JSON.stringify(note, null, 2);
  return text.trim() ? { source: "agent_note", text } : null;
}

export function noteRecord(
  key: string,
  row: { checkpointId: string | null; workerStateId: string; attempt: number },
  note: { source: NoteRecord["source"]; text: string },
  sanitize: Sanitize,
): NoteRecord {
  const text = sanitize(note.text);
  return {
    key,
    checkpoint_id: row.checkpointId,
    worker_state_id: row.workerStateId,
    attempt_index: row.attempt,
    source: note.source,
    sha256: sha256Hex(text),
    text,
  };
}

export function codeFactsOfRow(row: Pick<CheckpointRow, "exact_match" | "old_score" | "new_score">): CodeFacts {
  return { exact: row.exact_match === 1, old_score: finiteOrNull(row.old_score), new_score: finiteOrNull(row.new_score) };
}

interface SummaryFile {
  runId: string;
  workerStateId: string;
  attempt: number;
  dir: string;
  path: string;
}

function directories(path: string): string[] {
  try {
    return readdirSync(path, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

function* summaryFiles(source: SourceRoot): Generator<SummaryFile> {
  for (const runId of directories(source.runsDir)) {
    const statesDir = join(source.runsDir, runId, "worker_state");
    for (const workerStateId of directories(statesDir)) {
      const dir = join(statesDir, workerStateId, "runner_validation");
      let names: string[];
      try {
        names = readdirSync(dir).sort();
      } catch {
        continue;
      }
      for (const name of names) {
        const match = SUMMARY_FILE.exec(name);
        if (match) yield { runId, workerStateId, attempt: Number(match[1]), dir, path: join(dir, name) };
      }
    }
  }
}

function zeroStats(): HistoryDatasetStats {
  return {
    summaries_scanned: 0,
    summaries_with_advisories: 0,
    summaries_unparseable: 0,
    findings: 0,
    unreadable_lines: 0,
    items: 0,
    checkpoints_matched: 0,
    checkpoints_unmatched: 0,
    notes: 0,
  };
}

/** Walks the history under `source` and builds one item per advisory fingerprint and checkpoint. Read-only. */
export function buildHistoryDataset(opts: { source: SourceRoot; sanitize: Sanitize }): HistoryDataset {
  const { source, sanitize } = opts;
  const stats = zeroStats();
  const items = new Map<string, CalibrationItem>();
  const notes = new Map<string, NoteRecord>();
  const store = source.openOrchestratorDb();
  try {
    const checkpointsOf = store.db.query<CheckpointRow, [string]>(`
      SELECT id, run_id, worker_state_id, attempt_index, old_score, new_score, exact_match, artifact_path, metadata_json
      FROM worker_checkpoints WHERE worker_state_id = ? ORDER BY id`);
    const targetOf = store.db.query<{ target_key: string }, [string]>("SELECT target_key FROM worker_state WHERE id = ?");
    const workerStates = new Map<string, { rows: CheckpointRow[]; targetKey: string | null }>();

    for (const summary of summaryFiles(source)) {
      stats.summaries_scanned += 1;
      const text = source.readText(summary.path);
      if (text === null || !text.includes('"llm_review"')) continue;
      let parsed: Record<string, unknown>;
      try {
        const value = JSON.parse(text) as unknown;
        parsed = isRecord(value) ? value : {};
      } catch {
        stats.summaries_unparseable += 1;
        continue;
      }
      const qaLint = isRecord(parsed.qaLint) ? parsed.qaLint : {};
      const findings = (Array.isArray(qaLint.findings) ? qaLint.findings : []).filter(isScanFinding).filter(isAdvisoryFinding);
      if (findings.length === 0) continue;
      stats.summaries_with_advisories += 1;
      stats.findings += findings.length;

      let workerState = workerStates.get(summary.workerStateId);
      if (!workerState) {
        workerState = {
          rows: checkpointsOf.all(summary.workerStateId),
          targetKey: targetOf.get(summary.workerStateId)?.target_key ?? null,
        };
        workerStates.set(summary.workerStateId, workerState);
      }
      const summaryRel = source.relative(summary.path);
      const row =
        workerState.rows.find((candidate) => candidate.artifact_path !== null && source.relative(candidate.artifact_path) === summaryRel) ??
        workerState.rows.find((candidate) => candidate.attempt_index === summary.attempt) ??
        null;
      if (row) stats.checkpoints_matched += 1;
      else stats.checkpoints_unmatched += 1;

      const target = isRecord(parsed.target) ? parsed.target : {};
      const targetKey =
        workerState.targetKey ??
        (typeof target.unit === "string" && typeof target.symbol === "string" ? `${target.unit}::${target.symbol}` : `ws:${summary.workerStateId}`);
      const codeFacts: CodeFacts = row
        ? codeFactsOfRow(row)
        : { exact: target.exact === true, old_score: finiteOrNull(target.before), new_score: finiteOrNull(target.after) };
      const checkpointKey = row?.id ?? `${summary.workerStateId}:${summary.attempt}`;
      const note = row ? readCheckpointNote(source, parseObject(row.metadata_json)) : null;
      const noteKey = row && note ? row.id : null;
      const patch = readAttemptPatch(source, summary.dir, summary.attempt, findings.map((finding) => finding.file));

      let produced = false;
      for (const finding of findings) {
        const fullLine = patch === null ? null : fullFlaggedLineFromPatch(patch, finding.file, finding.line, finding.excerpt);
        if (fullLine === null) {
          stats.unreadable_lines += 1;
          continue;
        }
        const fingerprint = advisoryFingerprint(finding, fullLine);
        const id = calibrationItemId(fingerprint, checkpointKey);
        produced = true;
        if (items.has(id)) continue;
        const hunk = extractHunk(patch!, finding.file, finding.line);
        items.set(id, {
          schema: "advisory_calibration_item_v1",
          id,
          source: "history",
          synthetic: false,
          fingerprint,
          checkpoint_id: row?.id ?? null,
          run_id: summary.runId,
          worker_state_id: summary.workerStateId,
          attempt_index: summary.attempt,
          target_key: targetKey,
          finding: calibrationFinding(finding),
          full_line: fullLine,
          hunk: hunk === null ? null : sanitize(hunk),
          note_key: noteKey,
          code_facts: codeFacts,
          group_key: baseGroupKey(targetKey, finding.rule_id, fullLine),
        });
      }
      if (produced && row && note && noteKey) {
        notes.set(noteKey, noteRecord(noteKey, { checkpointId: row.id, workerStateId: summary.workerStateId, attempt: summary.attempt }, note, sanitize));
      }
    }
  } finally {
    store.close();
  }
  stats.items = items.size;
  stats.notes = notes.size;
  return {
    items: [...items.values()].sort(byId),
    notes: [...notes.values()].sort(byKey),
    stats,
  };
}

export function byId(a: { id: string }, b: { id: string }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function byKey(a: { key: string }, b: { key: string }): number {
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

/** Calibration output never lands under the history it was read from. */
export function assertOutsideSourceRoot(dir: string, source: SourceRoot, command: string): void {
  const rel = relative(source.root, resolve(dir));
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) {
    throw new Error(`advisory-calibration ${command}: --dir ${dir} is inside --source-root; history is read-only`);
  }
}

/** notes.jsonl merged: produced notes replace their key; older notes stay while an item still points at them. */
export function mergeNotes(existing: readonly NoteRecord[], produced: readonly NoteRecord[], referenced: ReadonlySet<string>): NoteRecord[] {
  const byNoteKey = new Map<string, NoteRecord>();
  for (const note of existing) if (referenced.has(note.key)) byNoteKey.set(note.key, note);
  for (const note of produced) byNoteKey.set(note.key, note);
  return [...byNoteKey.values()].sort(byKey);
}

/** Note keys of every item in the dataset directory (candidates plus synthetic). */
export function referencedNoteKeys(candidates: readonly CalibrationItem[], syntheticPath: string): Set<string> {
  const keys = new Set<string>();
  for (const item of [...candidates, ...readJsonl<CalibrationItem>(syntheticPath)]) if (item.note_key) keys.add(item.note_key);
  return keys;
}

export interface BuildDatasetResult {
  dir: string;
  manifest: CalibrationManifest;
  items: CalibrationItem[];
  notes: NoteRecord[];
}

export async function buildDatasetCommand(args: CalibrationArgs, print: (line: string) => void = console.log): Promise<BuildDatasetResult> {
  assertKnownFlags(args, ["--source-root", "--game", "--dir"]);
  const source = openSourceRoot(requiredFlag(args, "--source-root"), stringFlag(args, "--game") ?? "melee");
  const paths = calibrationPaths(stringFlag(args, "--dir") ?? DEFAULT_CALIBRATION_DIR);
  assertOutsideSourceRoot(paths.dir, source, args.command);
  const dataset = buildHistoryDataset({ source, sanitize: createSanitizer({ sourceRoot: source.root }) });

  // History is rebuilt whole: earlier history rows go, other sources stay unless re-produced here.
  const merged = new Map<string, CalibrationItem>();
  for (const row of readJsonl<CalibrationItem>(paths.candidates)) if (row.source !== "history") merged.set(row.id, row);
  for (const item of dataset.items) merged.set(item.id, item);
  const items = [...merged.values()].sort(byId);
  const notes = mergeNotes(readJsonl<NoteRecord>(paths.notes), dataset.notes, referencedNoteKeys(items, paths.synthetic));
  const manifest: CalibrationManifest = {
    schema: "advisory_calibration_manifest_v1",
    game: source.game,
    source_root: "<source-root>",
    built_at: new Date().toISOString(),
    counts: dataset.stats,
  };
  writeJsonl(paths.candidates, items);
  writeJsonl(paths.notes, notes);
  writeJson(paths.manifest, manifest);

  const s = dataset.stats;
  print(
    `build-dataset: ${s.summaries_scanned} summaries, ${s.summaries_with_advisories} with advisories, ` +
      `${s.findings} findings (${s.unreadable_lines} unreadable), ${s.items} items, ${s.notes} notes, ` +
      `checkpoints ${s.checkpoints_matched} matched / ${s.checkpoints_unmatched} unmatched` +
      `${s.summaries_unparseable > 0 ? `, ${s.summaries_unparseable} unparseable summaries` : ""} → ${paths.dir}`,
  );
  return { dir: paths.dir, manifest, items, notes };
}
