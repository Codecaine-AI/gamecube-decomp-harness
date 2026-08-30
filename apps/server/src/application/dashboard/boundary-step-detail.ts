import { closeSync, lstatSync, openSync, readdirSync, readSync, realpathSync } from "node:fs";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { Database } from "bun:sqlite";
import { BOUNDARY_STEP_KEYS, boundaryDashboardForRun, projectBoundaryDashboard, type BoundaryEpochRow, type BoundaryEventRow, type BoundaryGameEventRow, type BoundarySavePointRow, type BoundaryView } from "./boundary-view";

export interface BoundaryStepDetail {
  runId: string;
  epochId: string;
  ordinal: number | null;
  attempt: number;
  step: string;
  window: { from: string | null; to: string | null };
  stepWindow: { from: string | null; to: string | null };
  events: Array<{ id: string; event_type: string; created_at: string; payload: Record<string, unknown> }>;
  error: string | null;
  artifactDir: string | null;
  artifacts: Array<{ name: string; sizeBytes: number; text: string | null; truncated: boolean }>;
  stderrLog: { path: string; from: string; to: string; lines: string[]; truncated: boolean } | null;
}

export interface BoundaryStepDetailQuery {
  epochId: string;
  attempt: number;
  step: string;
}

export interface BoundaryStepDetailNotFound {
  error: string;
  notFound: "epoch" | "attempt" | "step";
}

export interface BoundaryDetailFsEntry {
  name: string;
  sizeBytes: number;
  isDirectory?: boolean;
  isSymbolicLink?: boolean;
}

export interface BoundaryDetailFs {
  readBytes(path: string, offset: number, length: number): Buffer | null;
  realpath(path: string): string | null;
  list(dir: string): BoundaryDetailFsEntry[];
}

const TEXT_EXTENSIONS = new Set([".txt", ".json", ".md", ".log", ".patch"]);
const MAX_TEXT_BYTES = 64 * 1024;
const MAX_TEXT_FILE_BYTES = 256 * 1024;
const MAX_EVENTS = 200;
const MAX_LOG_LINES = 400;
const MAX_LOG_BYTES = 2 * 1024 * 1024;

const nodeFs: BoundaryDetailFs = {
  readBytes(path, offset, length) {
    let fd: number | null = null;
    try {
      fd = openSync(path, "r");
      const buffer = Buffer.alloc(length);
      let total = 0;
      while (total < length) {
        const count = readSync(fd, buffer, total, length - total, offset + total);
        if (count === 0) break;
        total += count;
      }
      return buffer.subarray(0, total);
    } catch {
      return null;
    } finally {
      if (fd !== null) closeSync(fd);
    }
  },
  realpath(path) {
    try { return realpathSync(path); } catch { return null; }
  },
  list(dir) {
    try {
      return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        try {
          const stat = lstatSync(path);
          return [{ name, sizeBytes: stat.isFile() ? stat.size : 0, isDirectory: stat.isDirectory(), isSymbolicLink: stat.isSymbolicLink() }];
        } catch {
          return [];
        }
      });
    } catch { return []; }
  },
};

const GATE_EVENTS: Record<string, readonly string[]> = {
  boundary_sync: ["boundary_sync"],
  master_breakage_gate: ["boundary_breakage_gate"],
  ci_parity_gate: ["ci_parity_gate"],
  pre_commit_gate: ["ci_parity_gate"],
  draft_pr_publish: ["draft_pr_publish"],
  regression_repair: ["epoch_regression_pause"],
  knowledge_maintenance: ["epoch_full_refresh_started", "epoch_full_refresh_finished"],
  admission: ["epoch_admitted"],
  typed_close: ["epoch_cycle_error", "epoch_finished", "epoch_boundary_retry_scheduled", "epoch_boundary_retry_exhausted"],
};

function payloadOf(row: BoundaryEventRow): Record<string, unknown> {
  try {
    const value = JSON.parse(row.payload_json) as unknown;
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch { return {}; }
}

function inWindow(value: string, from: string | null, to: string | null): boolean {
  return (!from || value >= from) && (!to || value <= to);
}

function artifactTimestamp(name: string): number {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d{3}Z)$/.exec(name);
  return match ? Date.parse(`${match[1]}:${match[2]}:${match[3]}.${match[4]}`) : Number.NaN;
}

function timestampDirectory(stateDir: string, from: string | null, to: string | null, fs: BoundaryDetailFs): string | null {
  const root = join(stateDir, "epochs");
  const fromMs = from ? Date.parse(from) : Number.NEGATIVE_INFINITY;
  const toMs = to ? Date.parse(to) : Number.POSITIVE_INFINITY;
  return fs.list(root).filter((entry) => !entry.isSymbolicLink && entry.isDirectory !== false)
    .map((entry) => ({ ...entry, timestamp: artifactTimestamp(entry.name) }))
    .filter((entry) => Number.isFinite(entry.timestamp) && entry.timestamp >= fromMs && entry.timestamp <= toMs)
    .sort((a, b) => b.timestamp - a.timestamp)
    .map((entry) => join(root, entry.name))[0] ?? null;
}

function listArtifacts(root: string, fs: BoundaryDetailFs): BoundaryStepDetail["artifacts"] {
  const result: BoundaryStepDetail["artifacts"] = [];
  const visit = (dir: string, prefix: string, depth: number) => {
    for (const entry of fs.list(dir).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isSymbolicLink) continue;
      const name = prefix ? `${prefix}/${entry.name}` : entry.name;
      const path = join(dir, entry.name);
      if (entry.isDirectory) {
        if (depth < 2) visit(path, name, depth + 1);
        continue;
      }
      let text: string | null = null;
      let truncated = false;
      if (entry.sizeBytes <= MAX_TEXT_FILE_BYTES && TEXT_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
        const bytes = fs.readBytes(path, 0, MAX_TEXT_BYTES + 1);
        if (bytes !== null) {
          truncated = bytes.length > MAX_TEXT_BYTES;
          text = bytes.subarray(0, MAX_TEXT_BYTES).toString("utf8");
        }
      }
      result.push({ name, sizeBytes: entry.sizeBytes, text, truncated });
    }
  };
  visit(root, "", 0);
  return result;
}

function stderrDetail(stateDir: string, step: string, attempt: number, from: string | null, to: string | null, fs: BoundaryDetailFs): BoundaryStepDetail["stderrLog"] {
  const dir = join(stateDir, "ui-processes");
  const logs = fs.list(dir).filter((entry) => !entry.isDirectory && !entry.isSymbolicLink && entry.name.endsWith(".stderr.log")).sort((a, b) => b.sizeBytes - a.sizeBytes);
  const selected = logs[0];
  if (!selected) return null;
  const path = join(dir, selected.name);
  const offset = Math.max(0, selected.sizeBytes - MAX_LOG_BYTES);
  const source = fs.readBytes(path, offset, Math.min(selected.sizeBytes, MAX_LOG_BYTES));
  if (source === null) return null;
  // Timestamp and phase-window heuristics intentionally search only this bounded tail.
  const allLines = source.toString("utf8").split(/\r?\n/);
  const iso = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)/;
  const hasTimestamps = allLines.some((line) => iso.test(line));
  let lines: string[];
  if (hasTimestamps) {
    let includeContinuation = false;
    lines = allLines.filter((line) => {
      const timestamp = iso.exec(line)?.[1];
      if (timestamp) includeContinuation = inWindow(timestamp, from, to);
      return includeContinuation;
    });
  } else {
    const starts = allLines.map((line, index) => line.includes("[epoch]") && line.includes(` ${step} started`) ? index : -1).filter((index) => index >= 0);
    const start = starts[attempt - 1] ?? starts[0] ?? -1;
    if (start >= 0) {
      const relativeEnd = allLines.slice(start + 1).findIndex((line) => (/\[epoch\].+\S+ started/.test(line) || line.includes("[run-loop] epoch")));
      lines = allLines.slice(start, relativeEnd < 0 ? undefined : start + 1 + relativeEnd);
    } else lines = allLines.slice(-MAX_LOG_LINES);
  }
  const truncated = offset > 0 || lines.length > MAX_LOG_LINES;
  lines = lines.slice(-MAX_LOG_LINES);
  return { path, from: from ?? "", to: to ?? "", lines, truncated };
}

function payloadArtifactDirectory(stateDir: string, candidate: string, fs: BoundaryDetailFs): string | null {
  const epochsRoot = fs.realpath(resolve(stateDir, "epochs"));
  const artifactDir = fs.realpath(resolve(candidate));
  if (!epochsRoot || !artifactDir) return null;
  const pathFromRoot = relative(epochsRoot, artifactDir);
  if (pathFromRoot === "" || (pathFromRoot !== ".." && !pathFromRoot.startsWith(`..${sep}`) && !isAbsolute(pathFromRoot))) return artifactDir;
  return null;
}

export function buildBoundaryStepDetail(input: {
  runId?: string;
  view: BoundaryView;
  epochRow: BoundaryEpochRow;
  events: BoundaryEventRow[];
  attempt: number;
  step: string;
  stateDir: string;
  now: string | number | Date;
  fs?: BoundaryDetailFs;
}): BoundaryStepDetail | null {
  if (!BOUNDARY_STEP_KEYS.includes(input.step as typeof BOUNDARY_STEP_KEYS[number])) return null;
  const attemptIndex = input.attempt - 1;
  const attempt = input.view.attempts[attemptIndex];
  const step = attempt?.steps.find((candidate) => candidate.key === input.step);
  if (!attempt || !step) return null;
  const fs = input.fs ?? nodeFs;
  const from = attempt.startedAt;
  const to = input.view.attempts[attemptIndex + 1]?.startedAt ?? input.epochRow.closed_at ?? new Date(input.now).toISOString();
  const gates = GATE_EVENTS[input.step] ?? [];
  const related = input.events.map((row) => ({ row, payload: payloadOf(row) })).filter(({ row, payload }) => {
    if (!inWindow(row.created_at, from, to)) return false;
    if (row.event_type === "epoch_cycle_error" || row.event_type.startsWith("epoch_boundary_retry_")) return true;
    return (row.event_type === "epoch_checkpoint_progress" && payload.phase === input.step) || gates.includes(row.event_type);
  }).sort((a, b) => a.row.created_at.localeCompare(b.row.created_at)).slice(-MAX_EVENTS);
  const events = related.map(({ row, payload }) => ({ id: row.id ?? "", event_type: row.event_type, created_at: row.created_at, payload }));
  const latestCycleError = [...related].reverse().find(({ row }) => row.event_type === "epoch_cycle_error");
  const fallbackError = latestCycleError?.payload.error;
  const payloadArtifact = [...related].reverse().map(({ payload }) => payload.artifact_dir).find((value): value is string => typeof value === "string" && value.length > 0);
  const artifactDir = payloadArtifact === undefined
    ? timestampDirectory(input.stateDir, from, to, fs)
    : payloadArtifactDirectory(input.stateDir, payloadArtifact, fs);
  const logFrom = step.startedAt ?? from;
  const logTo = step.finishedAt ?? to;
  return {
    runId: input.runId ?? "",
    epochId: input.view.epochId,
    ordinal: input.view.ordinal ?? null,
    attempt: input.attempt,
    step: input.step,
    window: { from, to },
    stepWindow: { from: step.startedAt, to: step.finishedAt },
    events,
    error: step.error ?? (typeof fallbackError === "string" ? fallbackError : null),
    artifactDir,
    artifacts: artifactDir ? listArtifacts(artifactDir, fs) : [],
    stderrLog: stderrDetail(input.stateDir, input.step, input.attempt, logFrom, logTo, fs),
  };
}

export function boundaryStepDetailForRun(
  db: Database,
  stateDir: string,
  runId: string,
  query: BoundaryStepDetailQuery,
  now: string | number | Date = new Date(),
): BoundaryStepDetail | BoundaryStepDetailNotFound | { error: string } {
  if (!runId || !query.epochId || !Number.isInteger(query.attempt) || query.attempt < 1 || !BOUNDARY_STEP_KEYS.includes(query.step as typeof BOUNDARY_STEP_KEYS[number])) {
    return { error: "Invalid boundary step detail query" };
  }
  const dashboard = boundaryDashboardForRun(db, runId, now);
  let view = dashboard.current?.epochId === query.epochId ? dashboard.current : dashboard.recent.find((candidate) => candidate.epochId === query.epochId) ?? null;
  const epochRow = db.query(`SELECT id, ordinal, status, admitted_count, finished_count, boundary_status, boundary_attempt_count, boundary_next_attempt_at, created_at, closed_at FROM epochs WHERE run_id = ? AND id = ?`).get(runId, query.epochId) as BoundaryEpochRow | null;
  if (!epochRow) return { error: "Boundary epoch not found", notFound: "epoch" };
  const nextEpoch = db.query(`SELECT created_at FROM epochs WHERE run_id = ? AND created_at > ? ORDER BY created_at ASC LIMIT 1`).get(runId, epochRow.created_at) as { created_at: string } | null;
  const eventRows = db.query(`SELECT id, event_type, payload_json, created_at FROM events WHERE run_id = ? AND created_at >= ? AND (? IS NULL OR created_at < ?) ORDER BY created_at ASC`)
    .all(runId, epochRow.created_at, nextEpoch?.created_at ?? null, nextEpoch?.created_at ?? null) as BoundaryEventRow[];
  if (!view) {
    const savePoints = db.query(`SELECT id, trigger_kind, matched_code_percent, payload_json, created_at FROM save_points WHERE run_id = ? AND created_at >= ? AND (? IS NULL OR created_at < ?) ORDER BY created_at ASC`)
      .all(runId, epochRow.created_at, nextEpoch?.created_at ?? null, nextEpoch?.created_at ?? null) as BoundarySavePointRow[];
    const gameEvents = db.query(`SELECT event_type, payload_json, occurred_at FROM game_events WHERE subject_kind = 'run' AND subject_id = ? AND event_type = 'run.epoch_integrated' ORDER BY occurred_at ASC`)
      .all(runId) as BoundaryGameEventRow[];
    const projected = projectBoundaryDashboard({ epochs: [epochRow], events: eventRows, savePoints, gameEvents, now });
    view = projected.current?.epochId === query.epochId ? projected.current : projected.recent.find((candidate) => candidate.epochId === query.epochId) ?? null;
  }
  if (!view || !view.attempts[query.attempt - 1]) return { error: "Boundary attempt not found", notFound: "attempt" };
  if (!view.attempts[query.attempt - 1]!.steps.some((step) => step.key === query.step)) {
    return { error: "Boundary step not found", notFound: "step" };
  }
  return buildBoundaryStepDetail({ runId, view, epochRow, events: eventRows, attempt: query.attempt, step: query.step, stateDir, now })
    ?? { error: "Boundary step not found", notFound: "step" };
}
