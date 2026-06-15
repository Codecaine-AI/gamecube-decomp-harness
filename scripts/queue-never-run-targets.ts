/**
 * Seed a run with every currently open report function that has no prior
 * worker pi_session in the state DB.
 *
 * Dry-run by default:
 *   bun scripts/queue-never-run-targets.ts --state-dir projects/melee/state \
 *     --repo-root projects/melee/checkout
 *
 * Create and seed a 32-worker no-refill sweep run:
 *   bun scripts/queue-never-run-targets.ts --state-dir projects/melee/state \
 *     --repo-root projects/melee/checkout --graph-db projects/melee/graph/graph.sqlite \
 *     --create-run --desired-workers 32 --apply
 */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadBoardSnapshot } from "@decomp-orchestrator/core/board";
import { createRun, getLatestRun, openState, prioritizeQueuedTargets } from "@decomp-orchestrator/core/state";
import type { RunProjectMetadata, TargetCandidate } from "@decomp-orchestrator/core/types";

function argValue(flag: string): string {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? (process.argv[index + 1] ?? "") : "";
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function intArg(flag: string, fallback: number): number {
  const raw = argValue(flag);
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : fallback;
}

function targetKey(unit: string, symbol: string): string {
  return `${unit}::${symbol}`;
}

function countBy<T>(values: T[], key: (value: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    const id = key(value);
    counts[id] = (counts[id] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])));
}

function priorWorkerSessionKeys(store: ReturnType<typeof openState>): Set<string> {
  const rows = store.db
    .query(
      `
        SELECT DISTINCT targets.unit AS unit, targets.symbol AS symbol
        FROM pi_sessions
        JOIN leases ON leases.id = pi_sessions.lease_id
        JOIN queue ON queue.id = leases.queue_id
        JOIN targets ON targets.id = queue.target_id
      `,
    )
    .all() as Record<string, unknown>[];
  return new Set(rows.map((row) => targetKey(String(row.unit), String(row.symbol))));
}

function statusBucket(store: ReturnType<typeof openState>, candidate: TargetCandidate): string {
  const rows = store.db
    .query(
      `
        SELECT status, COUNT(*) AS count
        FROM targets
        WHERE unit = ? AND symbol = ?
        GROUP BY status
        ORDER BY status
      `,
    )
    .all(candidate.unit, candidate.symbol) as Record<string, unknown>[];
  if (rows.length === 0) return "no_db_target";
  return rows.map((row) => `${String(row.status)}:${Number(row.count ?? 0)}`).join(",");
}

function projectMetadata(params: { graphDbPath: string; projectDescriptor: string; projectId: string; projectKind: string; repoRoot: string; stateDir: string }): RunProjectMetadata {
  return {
    projectId: params.projectId,
    projectKind: params.projectKind,
    repoRoot: params.repoRoot,
    stateDir: params.stateDir,
    graphDbPath: params.graphDbPath,
    descriptorPath: params.projectDescriptor,
  };
}

const stateDir = resolve(argValue("--state-dir") || ".decomp-orchestrator-state");
const repoRoot = resolve(argValue("--repo-root") || ".");
const graphDbPath = resolve(argValue("--graph-db") || "knowledge/resource_graph/graph.sqlite");
const projectId = argValue("--project-id") || "melee";
const projectKind = argValue("--project-kind") || "doldecomp-melee";
const projectDescriptor = resolve(argValue("--project-descriptor") || "projects/melee/project.json");
const desiredWorkers = intArg("--desired-workers", 32);
const candidateLimit = intArg("--limit", 0);
const apply = hasFlag("--apply");
const create = hasFlag("--create-run");
const reasonPrefix = argValue("--reason-prefix") || "never-run-sweep:";
const goalKind = argValue("--goal-kind") || "never_run_sweep";
const goalValue = Number(argValue("--goal-value") || 100);
const boardLimit = intArg("--board-limit", 1_000_000);

const store = openState(stateDir);
try {
  const board = loadBoardSnapshot(repoRoot, boardLimit);
  const priorSessions = priorWorkerSessionKeys(store);
  const neverRun = board.candidates.filter((candidate) => !priorSessions.has(targetKey(candidate.unit, candidate.symbol)));
  const selected = candidateLimit > 0 ? neverRun.slice(0, candidateLimit) : neverRun;
  const selectedWithReasons = selected.map((candidate) => ({
    ...candidate,
    reason: `${reasonPrefix} ${candidate.reason}`,
  }));
  const buckets = selected.map((candidate) => statusBucket(store, candidate));

  let runId = argValue("--run-id");
  let createdRun = null as ReturnType<typeof createRun> | null;
  if (apply && create) {
    createdRun = createRun(
      store,
      goalKind,
      goalValue,
      Math.max(1, desiredWorkers),
      projectMetadata({ graphDbPath, projectDescriptor, projectId, projectKind, repoRoot, stateDir }),
    );
    runId = createdRun.id;
  } else if (!runId) {
    runId = getLatestRun(store)?.id ?? "";
  }
  if (apply && !runId) throw new Error("No run id available. Pass --run-id or --create-run.");

  const queued = apply ? prioritizeQueuedTargets(store, runId, selectedWithReasons) : 0;
  const summary = {
    generatedAt: new Date().toISOString(),
    apply,
    createdRun,
    runId: runId || null,
    stateDir,
    repoRoot,
    graphDbPath,
    reportPath: board.reportPath,
    objdiffPath: board.objdiffPath,
    openFunctionTargets: board.candidates.length,
    priorWorkerSessionTargets: priorSessions.size,
    neverRunTargets: neverRun.length,
    selectedTargets: selected.length,
    queuedOrRefreshedTargets: queued,
    statusBuckets: countBy(buckets, (bucket) => bucket),
    topSourcePaths: countBy(selected, (candidate) => candidate.sourcePath || "(missing source)"),
    topTargets: selected.slice(0, 40).map((candidate, index) => ({
      index: index + 1,
      priority: Number(candidate.priority.toFixed(4)),
      fuzzy: Number(candidate.fuzzy.toFixed(5)),
      size: candidate.size,
      unit: candidate.unit,
      symbol: candidate.symbol,
      sourcePath: candidate.sourcePath,
      statusBucket: buckets[index],
    })),
  };

  if (apply && runId) {
    const snapshotDir = resolve(stateDir, "runs", runId, "snapshots");
    await mkdir(snapshotDir, { recursive: true });
    await writeFile(resolve(snapshotDir, "never_run_queue_seed.json"), JSON.stringify(summary, null, 2));
  }

  console.log(JSON.stringify(summary, null, 2));
} finally {
  store.db.close();
}
