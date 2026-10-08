import { existsSync, readFileSync } from "node:fs";
import { copyFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { getHarnessState } from "@server/core/harness-state/state.js";
import type { StateStore } from "@server/core/orchestrator-state";

/**
 * The epoch worktree persists across runs and Syncs, so its rolling
 * baseline.json can describe a commit far behind the head an epoch started
 * from. This sidecar records which commit the baseline report was built at,
 * so settlement only diffs against a baseline it can prove matches the epoch
 * start.
 */
export const BASELINE_SOURCE_FILE = "baseline.source.json";

interface BaselineSource {
  version: 1;
  commit_sha: string;
  report_path: string | null;
  recorded_at: string;
}

export type EpochBaselineDecision =
  | { status: "verified"; startHead: string; resetBaseline: false }
  | { status: "seeded"; startHead: string; resetBaseline: false; seededFrom: string; savePointId: string; staleCommit: string | null }
  | { status: "unverified"; startHead: string | null; resetBaseline: true; reason: string; staleCommit: string | null };

export function baselineSourcePath(baselinePath: string): string {
  return resolve(dirname(baselinePath), BASELINE_SOURCE_FILE);
}

export function readBaselineSourceCommit(baselinePath: string): string | null {
  try {
    const value = JSON.parse(readFileSync(baselineSourcePath(baselinePath), "utf8")) as Partial<BaselineSource>;
    return value.version === 1 && typeof value.commit_sha === "string" && value.commit_sha ? value.commit_sha : null;
  } catch {
    return null;
  }
}

export async function writeBaselineSource(baselinePath: string, commitSha: string, reportPath: string | null): Promise<void> {
  const value: BaselineSource = { version: 1, commit_sha: commitSha, report_path: reportPath, recorded_at: new Date().toISOString() };
  await writeFile(baselineSourcePath(baselinePath), `${JSON.stringify(value, null, 2)}\n`);
}

/** The accepted head the epoch was admitted at; falls back to the harness's current accepted head. */
export function epochStartHead(store: StateStore, epochId: string, gameId: string | null | undefined): string | null {
  const rows = store.db.query(`
    SELECT json_extract(payload_json, '$.evidence.accepted_head') AS head
      FROM harness_timeline_entries
     WHERE event_id IN (?, ?)
     ORDER BY CASE WHEN event_id = ? THEN 0 ELSE 1 END, id DESC
  `).all(`epoch-admitted:${epochId}`, `epoch-prepared:${epochId}`, `epoch-admitted:${epochId}`) as Array<{ head: unknown }>;
  const recorded = rows.map((row) => row.head).find((head): head is string => typeof head === "string" && head.length > 0);
  if (recorded) return recorded;
  if (!gameId) return null;
  const head = getHarnessState(store.db, gameId)?.source.head;
  return typeof head === "string" && head ? head : null;
}

function insideDir(dir: string, path: string): boolean {
  const rel = relative(resolve(dir), resolve(path));
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

/**
 * Newest save-point report for `commitSha` that is an archived copy under the
 * state directory. Live-checkout report paths are rejected: later builds
 * overwrite them, so they cannot prove which commit they describe.
 */
export function acceptedReportForCommit(store: StateStore, stateDir: string, commitSha: string): { path: string; savePointId: string } | null {
  const rows = store.db.query(`
    SELECT id, report_path FROM save_points
     WHERE commit_sha = ? AND report_path IS NOT NULL
     ORDER BY created_at DESC, id DESC
  `).all(commitSha) as Array<{ id: string; report_path: string }>;
  for (const row of rows) {
    if (!insideDir(stateDir, row.report_path) || !existsSync(row.report_path)) continue;
    try {
      JSON.parse(readFileSync(row.report_path, "utf8"));
    } catch {
      continue;
    }
    return { path: row.report_path, savePointId: row.id };
  }
  return null;
}

/**
 * Make `baselinePath` hold the report of the commit the epoch started from.
 * Keeps a baseline whose recorded commit already matches, otherwise seeds it
 * from the accepted report for the start head. When neither is possible the
 * caller must reset the baseline (no regressions computed) rather than diff
 * against a report from an unknown commit.
 */
export async function prepareEpochBaseline(input: {
  store: StateStore;
  stateDir: string;
  epochId: string;
  gameId: string | null | undefined;
  baselinePath: string;
}): Promise<EpochBaselineDecision> {
  const startHead = epochStartHead(input.store, input.epochId, input.gameId);
  const recorded = existsSync(input.baselinePath) ? readBaselineSourceCommit(input.baselinePath) : null;
  if (!startHead) {
    return {
      status: "unverified", startHead: null, resetBaseline: true, staleCommit: recorded,
      reason: `epoch ${input.epochId} has no recorded start head; refusing to diff against an unverified baseline`,
    };
  }
  if (recorded === startHead) return { status: "verified", startHead, resetBaseline: false };
  const accepted = acceptedReportForCommit(input.store, input.stateDir, startHead);
  if (accepted) {
    await copyFile(accepted.path, input.baselinePath);
    await writeBaselineSource(input.baselinePath, startHead, accepted.path);
    return { status: "seeded", startHead, resetBaseline: false, seededFrom: accepted.path, savePointId: accepted.savePointId, staleCommit: recorded };
  }
  return {
    status: "unverified", startHead, resetBaseline: true, staleCommit: recorded,
    reason: `no archived accepted report for epoch start head ${startHead.slice(0, 10)}`
      + (existsSync(input.baselinePath) ? ` (existing baseline is from ${recorded?.slice(0, 10) ?? "an unrecorded commit"})` : ""),
  };
}
