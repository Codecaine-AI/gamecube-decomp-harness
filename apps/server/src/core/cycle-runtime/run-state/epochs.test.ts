import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TargetCandidate } from "@server/core/shared/types/index.js";
import { openState, type StateStore } from "@server/core/orchestrator-state";
import {
  activeClaimsForRun,
  admitEpochTargets,
  bestCheckpointForWorkerState,
  claimNextEpochTarget as claimNextEpochTargetRaw,
  closeSchedulerEpoch,
  closeWorkerState as closeWorkerStateRaw,
  enqueueWorkerOutputIntegration,
  nextWorkerOutputIntegrationConflictForResolver,
  recordWorkerCheckpoint as recordWorkerCheckpointRaw,
  refreshEpochTargetAvailability,
  refreshEpochTargetPriorities,
  schedulerEpochProgress,
  selectEpochAdmissionCandidates,
  startSchedulerEpoch,
  updateWorkerStateBaselineScore as updateWorkerStateBaselineScoreRaw,
} from "./index.js";
import { createRun } from "./runs.js";
import { processWorkerOutputIntegrationQueue } from "@server/core/cycle-runtime/phases/running/integration/worker-output-queue.js";
import { initializeHarnessState, requestDispatch } from "@server/core/harness-state";
import {
  cancelJob,
  claimNextJob,
  completeJob,
  getJobByDedupeKey,
} from "@server/core/job-queue/kernel.js";

const tempDirs: string[] = [];
const TEST_WORKER_TIMEOUT_SECONDS = 1800;

function tempState(): { dir: string; store: StateStore } {
  const dir = mkdtempSync(join(tmpdir(), "scheduler-epoch-state-"));
  tempDirs.push(dir);
  return { dir, store: openState(dir) };
}

function claimNextEpochTarget(params: Omit<Parameters<typeof claimNextEpochTargetRaw>[0], "ttlSeconds"> & { ttlSeconds?: number }) {
  return claimNextEpochTargetRaw({ ...params, ttlSeconds: params.ttlSeconds ?? TEST_WORKER_TIMEOUT_SECONDS });
}

function closeWorkerState(store: StateStore, input: Omit<Parameters<typeof closeWorkerStateRaw>[1], "authority">): void {
  closeWorkerStateRaw(store, { ...input, authority: { host: "epochs-test" } });
}

function recordWorkerCheckpoint(store: StateStore, input: Omit<Parameters<typeof recordWorkerCheckpointRaw>[1], "authority">) {
  return recordWorkerCheckpointRaw(store, { ...input, authority: { host: "epochs-test" } });
}

function updateWorkerStateBaselineScore(store: StateStore, workerStateId: string, score: number | null): void {
  updateWorkerStateBaselineScoreRaw(store, workerStateId, score, { host: "epochs-test" });
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

function candidate(index: number, sourcePath: string, priority = 100 - index): TargetCandidate {
  return {
    unit: `unit_${index}`,
    symbol: `fn_${index}`,
    sourcePath,
    size: 64 + index,
    fuzzy: 99 - index / 100,
    priority,
    reason: `candidate ${index}`,
  };
}

function setupEpoch(store: StateStore, candidates: TargetCandidate[], desiredWorkers = 2) {
  const run = createRun(store, "matched_code_percent", 100, desiredWorkers, { gameId: "test" }, { baseRevision: "base-test" });
  const epoch = startSchedulerEpoch(store, run.id, {
    workerPoolSize: desiredWorkers,
  });
  const admission = admitEpochTargets(store, {
    epochId: epoch.id,
    runId: run.id,
    candidates,
    workerPoolSize: desiredWorkers,
  });
  return { run, epoch, admission };
}

function integrationLease(store: StateStore, runId: string): string {
  initializeHarnessState(store, { gameId: "test", traceId: "trace-game-test" });
  const decision = requestDispatch(store, {
    actor: "operator",
    commandId: `command-integrate-${runId}`,
    correlationId: runId,
    kind: "run",
    gameId: "test",
    reason: "test worker output integration",
    workflowId: runId,
  });
  if (decision.queued) throw new Error("test integration lease was unexpectedly queued");
  return decision.leaseId;
}

function git(repo: string, args: string[]): string {
  const proc = Bun.spawnSync(["git", "-C", repo, ...args], { stdout: "pipe", stderr: "pipe" });
  if (proc.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${proc.stderr.toString() || proc.stdout.toString()}`);
  }
  return proc.stdout.toString();
}

function setupGitRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), "worker-output-integration-repo-"));
  tempDirs.push(repo);
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, "src/a.c"), "int value = 0;\n");
  git(repo, ["init"]);
  git(repo, ["config", "user.email", "test@example.com"]);
  git(repo, ["config", "user.name", "Test User"]);
  git(repo, ["add", "src/a.c"]);
  git(repo, ["commit", "-m", "initial"]);
  return repo;
}

function writePatch(repo: string, outputPath: string, nextSource: string): void {
  writeFileSync(join(repo, "src/a.c"), nextSource);
  writeFileSync(outputPath, git(repo, ["diff", "--", "src/a.c"]));
  git(repo, ["checkout", "--", "src/a.c"]);
}

function count(store: StateStore, sql: string, ...params: Array<string | number | null>): number {
  const row = store.db.query(sql).get(...params) as Record<string, unknown>;
  return Number(row.count ?? 0);
}

describe("epoch admission selection", () => {
  test("admits every eligible candidate in board priority order", () => {
    const selected = selectEpochAdmissionCandidates({
      candidates: [
        candidate(1, "src/a.c", 500),
        candidate(2, "src/a.c", 499),
        candidate(3, "src/b.c", 498),
        candidate(4, "src/c.c", 497),
      ],
    });

    expect(selected.selected.map((entry) => entry.symbol)).toEqual(["fn_1", "fn_2", "fn_3", "fn_4"]);
    expect(selected.skippedExisting).toBe(0);
  });

  test("excludes missing, duplicate, and existing target keys", () => {
    const selected = selectEpochAdmissionCandidates({
      candidates: [
        candidate(1, "src/a.c"),
        candidate(2, ""),
        candidate(1, "src/a.c"),
        candidate(4, "src/existing.c"),
        candidate(5, "src/b.c"),
      ],
      existingKeys: new Set(["unit_4::fn_4"]),
    });

    expect(selected.selected.map((entry) => entry.symbol)).toEqual(["fn_1", "fn_5"]);
    expect(selected.skippedMissingSource).toBe(1);
    expect(selected.skippedExisting).toBe(2);
  });

  test("handles an empty eligible board", () => {
    const full = selectEpochAdmissionCandidates({
      candidates: [candidate(1, "src/a.c"), candidate(2, "src/a.c"), candidate(3, "src/b.c")],
    });
    expect(full.selected.map((entry) => entry.symbol)).toEqual(["fn_1", "fn_2", "fn_3"]);

    const empty = selectEpochAdmissionCandidates({ candidates: [] });
    expect(empty.selected).toEqual([]);
  });
});

describe("scheduler epoch and worker state lifecycle", () => {
  test("admission enqueues one durable worker job per target without duplicates", () => {
    const { store } = tempState();
    try {
      const candidates = [candidate(1, "src/a.c", 501), candidate(2, "src/b.c", 302)];
      const { run, epoch } = setupEpoch(store, candidates);
      const rows = store.db
        .query(
          `
            SELECT jobs.*, epoch_targets.target_key
            FROM jobs
            JOIN epoch_targets ON epoch_targets.id = jobs.dedupe_key
            WHERE epoch_targets.epoch_id = ?
            ORDER BY epoch_targets.admission_index
          `,
        )
        .all(epoch.id) as Array<Record<string, unknown>>;

      expect(rows).toHaveLength(2);
      for (const [index, row] of rows.entries()) {
        const payload = JSON.parse(String(row.payload_json)) as Record<string, unknown>;
        expect(row.kind).toBe("worker");
        expect(row.status).toBe("queued");
        expect(row.execution_class).toBe("sandbox");
        expect(row.dedupe_key).toBe(payload.epoch_target_id);
        expect(Number(row.priority)).toBe(candidates[index]!.priority);
        expect(row.run_id).toBe(run.id);
        expect(row.game_id).toBe("test");
        expect(payload).toEqual({
          epoch_target_id: row.dedupe_key,
          epoch_id: epoch.id,
          target_key: row.target_key,
        });
      }

      const duplicate = admitEpochTargets(store, {
        epochId: epoch.id,
        runId: run.id,
        candidates,
        workerPoolSize: 2,
      });
      expect(duplicate).toMatchObject({ admitted: 0, skippedExisting: 2 });
      expect(count(store, "SELECT COUNT(*) AS count FROM jobs WHERE kind = 'worker'")).toBe(2);
    } finally {
      store.db.close();
    }
  });

  test("priority refresh updates queued worker jobs but leaves claimed jobs untouched", () => {
    const { store } = tempState();
    try {
      const initial = [candidate(1, "src/a.c", 500), candidate(2, "src/b.c", 400)];
      const { run, epoch } = setupEpoch(store, initial);
      const claimed = claimNextJob(store, { kind: "worker", concurrencyLimit: 2, leaseMs: 60_000 });
      expect(claimed?.job.priority).toBe(500);

      const refreshedCandidates = [candidate(1, "src/a.c", 100), candidate(2, "src/b.c", 450)];
      const refreshed = refreshEpochTargetPriorities(store, {
        epochId: epoch.id,
        runId: run.id,
        candidates: refreshedCandidates,
      });
      const targets = store.db
        .query("SELECT id, target_key FROM epoch_targets WHERE epoch_id = ? ORDER BY admission_index")
        .all(epoch.id) as Array<{ id: string; target_key: string }>;
      const claimedJob = getJobByDedupeKey(store, "worker", targets[0]!.id);
      const queuedJob = getJobByDedupeKey(store, "worker", targets[1]!.id);

      expect(refreshed.refreshed).toBe(2);
      expect(claimedJob).toMatchObject({ status: "claimed", priority: 500 });
      expect(queuedJob).toMatchObject({ status: "queued", priority: 450 });
    } finally {
      store.db.close();
    }
  });

  test("persists every eligible board candidate", () => {
    const { store } = tempState();
    try {
      const run = createRun(store, "matched_code_percent", 100, 2, { gameId: "test" }, { baseRevision: "base-test" });
      const epoch = startSchedulerEpoch(store, run.id, {
        workerPoolSize: 2,
      });
      const admission = admitEpochTargets(store, {
        epochId: epoch.id,
        runId: run.id,
        candidates: [candidate(1, "src/a.c"), candidate(2, "src/b.c"), candidate(3, "src/c.c")],
        workerPoolSize: 2,
      });

      expect(admission).toMatchObject({ admitted: 3, candidateCount: 3 });
      expect(count(store, "SELECT COUNT(*) AS count FROM epoch_targets WHERE epoch_id = ?", epoch.id)).toBe(3);
      expect(schedulerEpochProgress(store, epoch.id)).toMatchObject({ admitted: 3, available: 3, remaining: 3 });
    } finally {
      store.db.close();
    }
  });

  test("claims admitted targets directly", () => {
    const { store } = tempState();
    try {
      const { run, epoch, admission } = setupEpoch(store, [candidate(1, "src/a.c"), candidate(2, "src/b.c"), candidate(3, "src/c.c")]);

      expect(admission.admitted).toBe(3);
      expect(refreshEpochTargetAvailability(store, epoch.id)).toMatchObject({ availableBefore: 3, availableAfter: 3 });
      expect(schedulerEpochProgress(store, epoch.id)).toMatchObject({ admitted: 3, available: 3, claimed: 0, finished: 0, remaining: 3 });

      const claim = claimNextEpochTarget({ store, runId: run.id, workerId: "worker-1", baseRev: "base" });
      expect(claim).not.toBeNull();
      expect(schedulerEpochProgress(store, epoch.id)).toMatchObject({ admitted: 3, available: 2, claimed: 1, finished: 0, remaining: 3 });
      expect(count(store, "SELECT COUNT(*) AS count FROM worker_state WHERE target_claim_id = ?", claim?.claimId ?? "")).toBe(1);

      closeWorkerState(store, {
        workerStateId: claim?.workerStateId ?? "",
        lifecycleStatus: "timeout",
        timeoutSummary: "test timeout",
        summary: { source: "test" },
      });
      expect(schedulerEpochProgress(store, epoch.id)).toMatchObject({ admitted: 3, available: 2, claimed: 0, finished: 1, remaining: 2 });
    } finally {
      store.db.close();
    }
  });

  test("availability refresh retires exact targets, cancelling queued jobs but preserving claimed jobs", () => {
    const { store } = tempState();
    try {
      const { run, epoch } = setupEpoch(store, [candidate(1, "src/a.c"), candidate(2, "src/b.c"), candidate(3, "src/c.c")]);
      const claimed = claimNextJob(store, { kind: "worker", concurrencyLimit: 2, leaseMs: 60_000 });
      expect(claimed?.job.dedupeKey).toBeDefined();

      const refresh = refreshEpochTargetAvailability(store, epoch.id, {
        exactTargetKeys: new Set(["unit_1::fn_1", "unit_2::fn_2"]),
      });

      expect(refresh).toMatchObject({ retiredExact: 2, availableBefore: 3, availableAfter: 1 });
      expect(schedulerEpochProgress(store, epoch.id)).toMatchObject({ admitted: 3, available: 1, finished: 2, remaining: 1 });
      const retiredTargets = store.db
        .query("SELECT id, target_key FROM epoch_targets WHERE epoch_id = ? AND target_key IN ('unit_1::fn_1', 'unit_2::fn_2')")
        .all(epoch.id) as Array<{ id: string; target_key: string }>;
      const jobsByTarget = Object.fromEntries(
        retiredTargets.map((target) => [target.target_key, getJobByDedupeKey(store, "worker", target.id)?.status]),
      );
      expect(jobsByTarget).toEqual({ "unit_1::fn_1": "claimed", "unit_2::fn_2": "cancelled" });

      const claim = claimNextEpochTarget({ store, runId: run.id, workerId: "worker-1", baseRev: "base" });
      expect(claim?.target.symbol).toBe("fn_3");
    } finally {
      store.db.close();
    }
  });

  test("each new epoch re-admits every eligible board target", () => {
    const { store } = tempState();
    try {
      const { run, epoch } = setupEpoch(store, [candidate(1, "src/a.c")], 1);
      const claim = claimNextEpochTarget({ store, runId: run.id, workerId: "worker-1", baseRev: "base" });
      expect(claim).not.toBeNull();
      closeWorkerState(store, {
        workerStateId: claim?.workerStateId ?? "",
        lifecycleStatus: "finished",
        summary: { source: "test" },
      });
      closeSchedulerEpoch(store, epoch.id, { status: "completed" });

      const nextEpoch = startSchedulerEpoch(store, run.id, {
        workerPoolSize: 2,
      });
      const admission = admitEpochTargets(store, {
        epochId: nextEpoch.id,
        runId: run.id,
        candidates: [candidate(1, "src/a.c"), candidate(2, "src/b.c")],
        workerPoolSize: 2,
      });

      const duplicateAdmission = admitEpochTargets(store, {
        epochId: nextEpoch.id,
        runId: run.id,
        candidates: [candidate(1, "src/a.c")],
        workerPoolSize: 1,
      });

      expect(admission).toMatchObject({ admitted: 2, skippedExisting: 0 });
      expect(duplicateAdmission).toMatchObject({ admitted: 0, skippedExisting: 1 });
      const rows = store.db.query("SELECT target_key FROM epoch_targets WHERE epoch_id = ? ORDER BY admission_index").all(nextEpoch.id) as Record<
        string,
        unknown
      >[];
      expect(rows.map((row) => row.target_key)).toEqual(["unit_1::fn_1", "unit_2::fn_2"]);
    } finally {
      store.db.close();
    }
  });

  test("does not file-lock same-source targets across separate claims", () => {
    const { store } = tempState();
    try {
      const { run, epoch } = setupEpoch(store, [candidate(1, "src/shared.c", 500), candidate(2, "src/shared.c", 499)], 2);

      const first = claimNextEpochTarget({ store, runId: run.id, workerId: "worker-1", baseRev: "base" });
      const second = claimNextEpochTarget({ store, runId: run.id, workerId: "worker-2", baseRev: "base" });

      expect(first).not.toBeNull();
      expect(second).not.toBeNull();
      expect(first?.writeSet).toEqual(["src/shared.c"]);
      expect(second?.writeSet).toEqual(["src/shared.c"]);
      expect(activeClaimsForRun(store, run.id)).toHaveLength(2);
      expect(schedulerEpochProgress(store, epoch.id)).toMatchObject({ available: 0, claimed: 2, finished: 0 });
    } finally {
      store.db.close();
    }
  });

  test("claim selection prefers source files with fewer active claims", () => {
    const { store } = tempState();
    try {
      const { run } = setupEpoch(
        store,
        [candidate(1, "src/a.c", 500), candidate(2, "src/a.c", 499), candidate(3, "src/b.c", 300)],
        3,
      );

      const first = claimNextEpochTarget({ store, runId: run.id, workerId: "worker-1", baseRev: "base" });
      const second = claimNextEpochTarget({ store, runId: run.id, workerId: "worker-2", baseRev: "base" });

      expect(first?.target.source_path).toBe("src/a.c");
      expect(second?.target.source_path).toBe("src/b.c");
      expect(activeClaimsForRun(store, run.id)).toHaveLength(2);
    } finally {
      store.db.close();
    }
  });

  test("can requeue a setup-failed target after closing the claim", () => {
    const { store } = tempState();
    try {
      const { run, epoch } = setupEpoch(store, [candidate(1, "src/a.c")], 1);
      const first = claimNextEpochTarget({ store, runId: run.id, workerId: "worker-1", baseRev: "base" });
      expect(first).not.toBeNull();

      closeWorkerState(store, {
        workerStateId: first?.workerStateId ?? "",
        lifecycleStatus: "error",
        epochTargetStatus: "admitted",
        errorSummary: "setup failed before worker cycle",
        summary: { source: "test" },
      });

      expect(activeClaimsForRun(store, run.id)).toHaveLength(0);
      expect(schedulerEpochProgress(store, epoch.id)).toMatchObject({ available: 1, claimed: 0, finished: 0, remaining: 1 });

      const second = claimNextEpochTarget({ store, runId: run.id, workerId: "worker-2", baseRev: "base" });
      expect(second).not.toBeNull();
      expect(second?.epochTargetId).toBe(first?.epochTargetId);
      expect(second?.claimId).toBe(first?.claimId);
      expect(second?.workerStateId).toBe(first?.workerStateId);
      expect(count(store, "SELECT COUNT(*) AS count FROM target_claims WHERE epoch_target_id = ?", first?.epochTargetId ?? "")).toBe(1);
      expect(activeClaimsForRun(store, run.id)[0]?.workerId).toBe("worker-2");
      const row = store.db.query("SELECT lifecycle_status, worker_id, ended_at FROM worker_state WHERE id = ?").get(first?.workerStateId ?? "") as
        | Record<string, unknown>
        | undefined;
      expect(row?.lifecycle_status).toBe("running");
      expect(row?.worker_id).toBe("worker-2");
      expect(row?.ended_at).toBeNull();
    } finally {
      store.db.close();
    }
  });

  test("requeued target with prior nonselectable evidence can be claimed again", () => {
    const { store } = tempState();
    try {
      const { run, epoch } = setupEpoch(store, [candidate(1, "src/a.c")], 1);
      const first = claimNextEpochTarget({ store, runId: run.id, workerId: "worker-1", baseRev: "base" });
      expect(first).not.toBeNull();
      recordWorkerCheckpoint(store, {
        workerStateId: first?.workerStateId ?? "",
        runId: run.id,
        epochId: first?.epochId ?? "",
        epochTargetId: first?.epochTargetId ?? "",
        targetClaimId: first?.claimId ?? "",
        attemptIndex: 0,
        oldScore: 98.99,
        newScore: 99.1,
        exactMatch: false,
        hardGatesPassed: false,
        validationStatus: "failed",
      });

      closeWorkerState(store, {
        workerStateId: first?.workerStateId ?? "",
        lifecycleStatus: "error",
        epochTargetStatus: "admitted",
        errorSummary: "interrupted after validation evidence",
        summary: { source: "test" },
      });

      expect(schedulerEpochProgress(store, epoch.id)).toMatchObject({ available: 1, claimed: 0, finished: 0, remaining: 1 });
      const second = claimNextEpochTarget({ store, runId: run.id, workerId: "worker-2", baseRev: "base" });
      expect(second).not.toBeNull();
      expect(second?.epochTargetId).toBe(first?.epochTargetId);
      expect(second?.claimId).toBe(first?.claimId);
      expect(second?.workerStateId).toBe(first?.workerStateId);
      expect(count(store, "SELECT COUNT(*) AS count FROM target_claims WHERE epoch_target_id = ?", first?.epochTargetId ?? "")).toBe(1);
      expect(count(store, "SELECT COUNT(*) AS count FROM worker_checkpoints WHERE worker_state_id = ?", first?.workerStateId ?? "")).toBe(0);
    } finally {
      store.db.close();
    }
  });

  test("selects best checkpoints by exactness, score, then earliest attempt", () => {
    const { store } = tempState();
    try {
      const { run } = setupEpoch(store, [candidate(1, "src/a.c")]);
      const claim = claimNextEpochTarget({ store, runId: run.id, workerId: "worker-1", baseRev: "base" });
      expect(claim).not.toBeNull();
      const base = {
        workerStateId: claim?.workerStateId ?? "",
        runId: run.id,
        epochId: claim?.epochId ?? "",
        epochTargetId: claim?.epochTargetId ?? "",
        targetClaimId: claim?.claimId ?? "",
        oldScore: 99,
        buildStatus: "compiled",
        qaStatus: "clean",
        objdiffStatus: "available",
        validationStatus: "passed",
      };

      const noImprovement = recordWorkerCheckpoint(store, {
        ...base,
        attemptIndex: 0,
        newScore: 99,
        exactMatch: false,
        hardGatesPassed: true,
      });
      expect(noImprovement.selectable).toBe(false);
      expect(bestCheckpointForWorkerState(store, base.workerStateId)).toBeNull();

      const firstTie = recordWorkerCheckpoint(store, {
        ...base,
        attemptIndex: 1,
        newScore: 99.4,
        exactMatch: false,
        hardGatesPassed: true,
      });
      recordWorkerCheckpoint(store, {
        ...base,
        attemptIndex: 2,
        newScore: 99.4,
        exactMatch: false,
        hardGatesPassed: true,
      });
      expect(bestCheckpointForWorkerState(store, base.workerStateId)?.id).toBe(firstTie.id);

      const higherScore = recordWorkerCheckpoint(store, {
        ...base,
        attemptIndex: 3,
        newScore: 99.6,
        exactMatch: false,
        hardGatesPassed: true,
      });
      expect(bestCheckpointForWorkerState(store, base.workerStateId)?.id).toBe(higherScore.id);

      recordWorkerCheckpoint(store, {
        ...base,
        attemptIndex: 4,
        newScore: 99.9,
        exactMatch: false,
        hardGatesPassed: false,
        validationStatus: "failed",
      });
      expect(bestCheckpointForWorkerState(store, base.workerStateId)?.id).toBe(higherScore.id);

      const exact = recordWorkerCheckpoint(store, {
        ...base,
        attemptIndex: 5,
        newScore: 100,
        exactMatch: true,
        hardGatesPassed: true,
      });
      expect(bestCheckpointForWorkerState(store, base.workerStateId)?.id).toBe(exact.id);
    } finally {
      store.db.close();
    }
  });

  test("timeout keeps baseline when no checkpoint improves over baseline", () => {
    const { store } = tempState();
    try {
      const { run } = setupEpoch(store, [candidate(1, "src/a.c")]);
      const claim = claimNextEpochTarget({ store, runId: run.id, workerId: "worker-1", baseRev: "base" });
      expect(claim).not.toBeNull();
      recordWorkerCheckpoint(store, {
        workerStateId: claim?.workerStateId ?? "",
        runId: run.id,
        epochId: claim?.epochId ?? "",
        epochTargetId: claim?.epochTargetId ?? "",
        targetClaimId: claim?.claimId ?? "",
        attemptIndex: 0,
        oldScore: 99,
        newScore: 99,
        exactMatch: false,
        hardGatesPassed: true,
        validationStatus: "passed",
      });
      closeWorkerState(store, {
        workerStateId: claim?.workerStateId ?? "",
        lifecycleStatus: "timeout",
        timeoutSummary: "no improved checkpoint",
        summary: { source: "test" },
      });

      const row = store.db.query("SELECT lifecycle_status, best_checkpoint_id, best_score, exact FROM worker_state WHERE id = ?").get(claim?.workerStateId ?? "") as
        | Record<string, unknown>
        | undefined;
      expect(row?.lifecycle_status).toBe("timeout");
      expect(row?.best_checkpoint_id).toBeNull();
      expect(Number(row?.best_score)).toBeCloseTo(98.99, 5);
      expect(Number(row?.exact)).toBe(0);
    } finally {
      store.db.close();
    }
  });

  test("recomputed worker baseline updates the comparison floor without creating an attempt", () => {
    const { store } = tempState();
    try {
      const { run } = setupEpoch(store, [candidate(1, "src/a.c")]);
      const claim = claimNextEpochTarget({ store, runId: run.id, workerId: "worker-1", baseRev: "base" });
      expect(claim).not.toBeNull();

      updateWorkerStateBaselineScore(store, claim?.workerStateId ?? "", 87.25);

      const row = store.db.query("SELECT baseline_score, best_score FROM worker_state WHERE id = ?").get(claim?.workerStateId ?? "") as
        | Record<string, unknown>
        | undefined;
      expect(Number(row?.baseline_score)).toBe(87.25);
      expect(Number(row?.best_score)).toBe(87.25);
      expect(count(store, "SELECT COUNT(*) AS count FROM worker_checkpoints WHERE worker_state_id = ?", claim?.workerStateId ?? "")).toBe(0);

      const checkpoint = recordWorkerCheckpoint(store, {
        workerStateId: claim?.workerStateId ?? "",
        runId: run.id,
        epochId: claim?.epochId ?? "",
        epochTargetId: claim?.epochTargetId ?? "",
        targetClaimId: claim?.claimId ?? "",
        attemptIndex: 0,
        oldScore: 87.25,
        newScore: 87.3,
        exactMatch: false,
        hardGatesPassed: true,
        validationStatus: "passed",
      });

      expect(checkpoint.improvedOverBaseline).toBe(true);
      expect(checkpoint.selectable).toBe(true);
      expect(bestCheckpointForWorkerState(store, claim?.workerStateId ?? "")?.id).toBe(checkpoint.id);
    } finally {
      store.db.close();
    }
  });

  test("selects clean exact checkpoints when validation baseline was already exact", () => {
    const { store } = tempState();
    try {
      const { run } = setupEpoch(store, [candidate(1, "src/a.c")]);
      const claim = claimNextEpochTarget({ store, runId: run.id, workerId: "worker-1", baseRev: "base" });
      expect(claim).not.toBeNull();

      const checkpoint = recordWorkerCheckpoint(store, {
        workerStateId: claim?.workerStateId ?? "",
        runId: run.id,
        epochId: claim?.epochId ?? "",
        epochTargetId: claim?.epochTargetId ?? "",
        targetClaimId: claim?.claimId ?? "",
        attemptIndex: 0,
        oldScore: 100,
        newScore: 100,
        exactMatch: true,
        hardGatesPassed: true,
        buildStatus: "compiled",
        qaStatus: "clean",
        objdiffStatus: "available",
        validationStatus: "passed",
      });

      expect(checkpoint.delta).toBe(0);
      expect(checkpoint.improvedOverBaseline).toBe(true);
      expect(checkpoint.selectable).toBe(true);
      expect(bestCheckpointForWorkerState(store, claim?.workerStateId ?? "")?.id).toBe(checkpoint.id);
    } finally {
      store.db.close();
    }
  });

  test("error close preserves a prior selectable best checkpoint", () => {
    const { store } = tempState();
    try {
      const { run } = setupEpoch(store, [candidate(1, "src/a.c")]);
      const claim = claimNextEpochTarget({ store, runId: run.id, workerId: "worker-1", baseRev: "base" });
      expect(claim).not.toBeNull();
      const checkpoint = recordWorkerCheckpoint(store, {
        workerStateId: claim?.workerStateId ?? "",
        runId: run.id,
        epochId: claim?.epochId ?? "",
        epochTargetId: claim?.epochTargetId ?? "",
        targetClaimId: claim?.claimId ?? "",
        attemptIndex: 0,
        oldScore: 98.99,
        newScore: 99.5,
        exactMatch: false,
        hardGatesPassed: true,
        validationStatus: "passed",
      });
      closeWorkerState(store, {
        workerStateId: claim?.workerStateId ?? "",
        lifecycleStatus: "error",
        errorSummary: "provider failed after checkpoint",
        summary: { source: "test" },
      });

      const row = store.db.query("SELECT lifecycle_status, best_checkpoint_id, best_score, exact FROM worker_state WHERE id = ?").get(claim?.workerStateId ?? "") as
        | Record<string, unknown>
        | undefined;
      expect(row?.lifecycle_status).toBe("error");
      expect(row?.best_checkpoint_id).toBe(checkpoint.id);
      expect(Number(row?.best_score)).toBe(99.5);
      expect(Number(row?.exact)).toBe(0);
    } finally {
      store.db.close();
    }
  });

  test("closes active epochs without adopting old queued runtime rows", () => {
    const { store } = tempState();
    try {
      const { epoch } = setupEpoch(store, [candidate(1, "src/a.c")]);
      const closed = closeSchedulerEpoch(store, epoch.id, { status: "completed", boundaryStatus: "dry_run" });
      expect(closed).toMatchObject({ epochId: epoch.id, status: "completed" });
    } finally {
      store.db.close();
    }
  });

  test("closing an epoch cancels queued worker jobs and preserves terminal jobs", () => {
    const { store } = tempState();
    try {
      const { epoch } = setupEpoch(
        store,
        [candidate(1, "src/a.c", 500), candidate(2, "src/b.c", 400), candidate(3, "src/c.c", 300)],
        3,
      );
      const first = claimNextJob(store, { kind: "worker", concurrencyLimit: 3, leaseMs: 60_000 });
      expect(first).not.toBeNull();
      completeJob(store, first!.token, {});
      const cancelledTarget = store.db
        .query("SELECT id FROM epoch_targets WHERE epoch_id = ? AND target_key = 'unit_2::fn_2'")
        .get(epoch.id) as { id: string };
      const cancelled = getJobByDedupeKey(store, "worker", cancelledTarget.id);
      cancelJob(store, { jobId: cancelled!.jobId, actor: "runner", reason: "test_terminal" });

      closeSchedulerEpoch(store, epoch.id, { status: "completed" });

      const statuses = store.db
        .query(
          `
            SELECT epoch_targets.target_key, jobs.status
            FROM epoch_targets
            JOIN jobs ON jobs.kind = 'worker' AND jobs.dedupe_key = epoch_targets.id
            WHERE epoch_targets.epoch_id = ?
            ORDER BY epoch_targets.admission_index
          `,
        )
        .all(epoch.id) as Array<{ target_key: string; status: string }>;
      expect(statuses).toEqual([
        { target_key: "unit_1::fn_1", status: "succeeded" },
        { target_key: "unit_2::fn_2", status: "cancelled" },
        { target_key: "unit_3::fn_3", status: "cancelled" },
      ]);
    } finally {
      store.db.close();
    }
  });

  test("applies selected worker checkpoint patches through the integration queue", async () => {
    const { dir, store } = tempState();
    try {
      const repo = setupGitRepo();
      const patchPath = join(dir, "worker.patch");
      writePatch(repo, patchPath, "int value = 1;\n");

      const { run } = setupEpoch(store, [candidate(1, "src/a.c", 100)], 1);
      const claim = claimNextEpochTarget({ store, runId: run.id, workerId: "worker-1", baseRev: "base" });
      expect(claim).not.toBeNull();
      const checkpoint = recordWorkerCheckpoint(store, {
        workerStateId: claim?.workerStateId ?? "",
        runId: run.id,
        epochId: claim?.epochId ?? "",
        epochTargetId: claim?.epochTargetId ?? "",
        targetClaimId: claim?.claimId ?? "",
        attemptIndex: 0,
        oldScore: 99,
        newScore: 100,
        exactMatch: true,
        hardGatesPassed: true,
        validationStatus: "passed",
        patchPath,
        diffPath: patchPath,
      });
      const item = enqueueWorkerOutputIntegration(store, {
        runId: run.id,
        epochId: claim?.epochId ?? "",
        epochTargetId: claim?.epochTargetId ?? "",
        targetClaimId: claim?.claimId ?? "",
        workerStateId: claim?.workerStateId ?? "",
        workerCheckpointId: checkpoint.id,
        targetKey: "unit_1::fn_1",
        patchPath,
        diffPath: patchPath,
        writeSet: ["src/a.c"],
      });

      const result = await processWorkerOutputIntegrationQueue({ dryRun: false, leaseId: integrationLease(store, run.id), repoRoot: repo, runId: run.id, stateDir: dir, store });
      expect(result.processed).toHaveLength(1);
      expect(result.processed[0]?.id).toBe(item.id);
      expect(result.processed[0]?.status).toBe("applied");
      expect(readFileSync(join(repo, "src/a.c"), "utf8")).toBe("int value = 1;\n");
      expect(count(store, "SELECT COUNT(*) AS count FROM integration_outcomes WHERE id = ? AND status = 'applied'", item.id)).toBe(1);
      expect(count(store, "SELECT COUNT(*) AS count FROM events WHERE run_id = ? AND event_type = 'worker_integration_applied'", run.id)).toBe(1);
    } finally {
      store.db.close();
    }
  });

  test("records stale selected checkpoint patches as integration conflicts", async () => {
    const { dir, store } = tempState();
    try {
      const repo = setupGitRepo();
      const patchPath = join(dir, "stale-worker.patch");
      writePatch(repo, patchPath, "int value = 1;\n");
      writeFileSync(join(repo, "src/a.c"), "int value = 2;\n");

      const { run } = setupEpoch(store, [candidate(1, "src/a.c", 100)], 1);
      const claim = claimNextEpochTarget({ store, runId: run.id, workerId: "worker-1", baseRev: "base" });
      expect(claim).not.toBeNull();
      const checkpoint = recordWorkerCheckpoint(store, {
        workerStateId: claim?.workerStateId ?? "",
        runId: run.id,
        epochId: claim?.epochId ?? "",
        epochTargetId: claim?.epochTargetId ?? "",
        targetClaimId: claim?.claimId ?? "",
        attemptIndex: 0,
        oldScore: 99,
        newScore: 100,
        exactMatch: true,
        hardGatesPassed: true,
        validationStatus: "passed",
        patchPath,
        diffPath: patchPath,
      });
      const item = enqueueWorkerOutputIntegration(store, {
        runId: run.id,
        epochId: claim?.epochId ?? "",
        epochTargetId: claim?.epochTargetId ?? "",
        targetClaimId: claim?.claimId ?? "",
        workerStateId: claim?.workerStateId ?? "",
        workerCheckpointId: checkpoint.id,
        targetKey: "unit_1::fn_1",
        patchPath,
        diffPath: patchPath,
        writeSet: ["src/a.c"],
      });

      const result = await processWorkerOutputIntegrationQueue({ dryRun: false, leaseId: integrationLease(store, run.id), repoRoot: repo, runId: run.id, stateDir: dir, store });
      expect(result.processed).toHaveLength(1);
      expect(result.processed[0]?.status).toBe("conflict");
      expect(result.processed[0]?.conflictPaths).toContain("src/a.c");
      const row = store.db.query("SELECT item_path FROM integration_outcomes WHERE id = ?").get(item.id) as Record<string, unknown>;
      expect(typeof row.item_path).toBe("string");
      expect(existsSync(String(row.item_path))).toBe(true);
      expect(readFileSync(String(row.item_path), "utf8")).toContain("\"schema_version\": \"integration_conflict_item_v1\"");
      expect(nextWorkerOutputIntegrationConflictForResolver(store, run.id)?.id).toBe(item.id);
      expect(nextWorkerOutputIntegrationConflictForResolver(store, run.id, [item.id])).toBeNull();
      expect(readFileSync(join(repo, "src/a.c"), "utf8")).toBe("int value = 2;\n");
      expect(count(store, "SELECT COUNT(*) AS count FROM events WHERE run_id = ? AND event_type = 'worker_integration_conflict'", run.id)).toBe(1);
    } finally {
      store.db.close();
    }
  });
});
