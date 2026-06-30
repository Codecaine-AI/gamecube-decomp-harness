import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TargetCandidate } from "@server/core/shared/types/index.js";
import { openState, type StateStore } from "@server/core/orchestrator-state";
import {
  activeClaimsForSession,
  admitEpochTargets,
  bestCheckpointForWorkerState,
  claimNextEpochTarget,
  closeSchedulerEpoch,
  closeWorkerState,
  enqueueWorkerOutputIntegration,
  parseEpochSize,
  recordWorkerCheckpoint,
  refreshEpochTargetAvailability,
  schedulerEpochProgress,
  selectEpochAdmissionCandidates,
  startSchedulerEpoch,
} from "./index.js";
import { createRun } from "./runs.js";
import { processWorkerOutputIntegrationQueue } from "@server/core/session-runtime/phases/running/integration/worker-output-queue.js";

const tempDirs: string[] = [];

function tempState(): { dir: string; store: StateStore } {
  const dir = mkdtempSync(join(tmpdir(), "scheduler-epoch-state-"));
  tempDirs.push(dir);
  return { dir, store: openState(dir) };
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
  const run = createRun(store, "matched_code_percent", 100, desiredWorkers);
  const epoch = startSchedulerEpoch(store, run.id, {
    size: { mode: "fixed", value: candidates.length },
    workerPoolSize: desiredWorkers,
    candidateWindow: 16,
  });
  const admission = admitEpochTargets(store, {
    epochId: epoch.id,
    runId: run.id,
    candidates,
    size: { mode: "fixed", value: candidates.length },
    workerPoolSize: desiredWorkers,
  });
  return { run, epoch, admission };
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

describe("epoch size parsing", () => {
  test("parses fixed and full epoch sizes", () => {
    expect(parseEpochSize("32")).toEqual({ mode: "fixed", value: 32 });
    expect(parseEpochSize(64)).toEqual({ mode: "fixed", value: 64 });
    expect(parseEpochSize("Full")).toEqual({ mode: "full", value: null });
  });

  test("rejects invalid epoch sizes", () => {
    expect(() => parseEpochSize("0")).toThrow();
    expect(() => parseEpochSize("-1")).toThrow();
    expect(() => parseEpochSize("half")).toThrow();
  });
});

describe("epoch admission selection", () => {
  test("round-robins targets by source file while admitting duplicates", () => {
    const selected = selectEpochAdmissionCandidates({
      candidates: [
        candidate(1, "src/a.c", 500),
        candidate(2, "src/a.c", 499),
        candidate(3, "src/b.c", 498),
        candidate(4, "src/c.c", 497),
      ],
      size: { mode: "fixed", value: 3 },
    });

    expect(selected.selected.map((entry) => entry.symbol)).toEqual(["fn_1", "fn_3", "fn_4"]);
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
      size: { mode: "fixed", value: 5 },
    });

    expect(selected.selected.map((entry) => entry.symbol)).toEqual(["fn_1", "fn_5"]);
    expect(selected.skippedMissingSource).toBe(1);
    expect(selected.skippedExisting).toBe(2);
  });

  test("full mode admits every eligible board candidate without spinning on an empty board", () => {
    const full = selectEpochAdmissionCandidates({
      candidates: [candidate(1, "src/a.c"), candidate(2, "src/a.c"), candidate(3, "src/b.c")],
      size: { mode: "full", value: null },
    });
    expect(full.selected.map((entry) => entry.symbol)).toEqual(["fn_1", "fn_3", "fn_2"]);

    const empty = selectEpochAdmissionCandidates({ candidates: [], size: { mode: "full", value: null } });
    expect(empty.selected).toEqual([]);
  });
});

describe("scheduler epoch and worker state lifecycle", () => {
  test("persists fixed admission and claims admitted targets directly", () => {
    const { store } = tempState();
    try {
      const { run, epoch, admission } = setupEpoch(store, [candidate(1, "src/a.c"), candidate(2, "src/b.c"), candidate(3, "src/c.c")]);

      expect(admission.admitted).toBe(3);
      expect(refreshEpochTargetAvailability(store, epoch.id)).toMatchObject({ inserted: 0, availableBefore: 3, availableAfter: 3 });
      expect(schedulerEpochProgress(store, epoch.id)).toMatchObject({ admitted: 3, available: 3, claimed: 0, finished: 0, remaining: 3 });

      const claim = claimNextEpochTarget({ store, sessionId: run.id, workerId: "worker-1", baseRev: "base" });
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

  test("board admission skips target keys from the immediately previous epoch", () => {
    const { store } = tempState();
    try {
      const { run, epoch } = setupEpoch(store, [candidate(1, "src/a.c")], 1);
      const claim = claimNextEpochTarget({ store, sessionId: run.id, workerId: "worker-1", baseRev: "base" });
      expect(claim).not.toBeNull();
      closeWorkerState(store, {
        workerStateId: claim?.workerStateId ?? "",
        lifecycleStatus: "finished",
        summary: { source: "test" },
      });
      closeSchedulerEpoch(store, epoch.id, { status: "completed" });

      const nextEpoch = startSchedulerEpoch(store, run.id, {
        size: { mode: "fixed", value: 2 },
        workerPoolSize: 2,
        candidateWindow: 2,
      });
      const admission = admitEpochTargets(store, {
        epochId: nextEpoch.id,
        runId: run.id,
        candidates: [candidate(1, "src/a.c"), candidate(2, "src/b.c")],
        size: { mode: "fixed", value: 2 },
        workerPoolSize: 2,
      });

      expect(admission).toMatchObject({ admitted: 1, skippedExisting: 1 });
      const rows = store.db.query("SELECT target_key FROM epoch_targets WHERE epoch_id = ?").all(nextEpoch.id) as Record<string, unknown>[];
      expect(rows.map((row) => row.target_key)).toEqual(["unit_2::fn_2"]);
    } finally {
      store.db.close();
    }
  });

  test("board admission can revisit older epoch targets while guarding against the last epoch", () => {
    const { store } = tempState();
    try {
      const { run, epoch: firstEpoch } = setupEpoch(store, [candidate(1, "src/a.c")], 1);
      const firstClaim = claimNextEpochTarget({ store, sessionId: run.id, workerId: "worker-1", baseRev: "base" });
      expect(firstClaim).not.toBeNull();
      closeWorkerState(store, {
        workerStateId: firstClaim?.workerStateId ?? "",
        lifecycleStatus: "finished",
        summary: { source: "test" },
      });
      closeSchedulerEpoch(store, firstEpoch.id, { status: "completed" });

      const secondEpoch = startSchedulerEpoch(store, run.id, {
        size: { mode: "fixed", value: 1 },
        workerPoolSize: 1,
        candidateWindow: 1,
      });
      admitEpochTargets(store, {
        epochId: secondEpoch.id,
        runId: run.id,
        candidates: [candidate(2, "src/b.c")],
        size: { mode: "fixed", value: 1 },
        workerPoolSize: 1,
      });
      const secondClaim = claimNextEpochTarget({ store, sessionId: run.id, workerId: "worker-2", baseRev: "base" });
      expect(secondClaim).not.toBeNull();
      closeWorkerState(store, {
        workerStateId: secondClaim?.workerStateId ?? "",
        lifecycleStatus: "finished",
        summary: { source: "test" },
      });
      closeSchedulerEpoch(store, secondEpoch.id, { status: "completed" });

      const thirdEpoch = startSchedulerEpoch(store, run.id, {
        size: { mode: "fixed", value: 3 },
        workerPoolSize: 3,
        candidateWindow: 3,
      });
      const admission = admitEpochTargets(store, {
        epochId: thirdEpoch.id,
        runId: run.id,
        candidates: [candidate(1, "src/a.c"), candidate(2, "src/b.c"), candidate(3, "src/c.c")],
        size: { mode: "fixed", value: 3 },
        workerPoolSize: 3,
      });

      expect(admission).toMatchObject({ admitted: 2, skippedExisting: 1 });
      const rows = store.db.query("SELECT target_key FROM epoch_targets WHERE epoch_id = ? ORDER BY admission_index").all(thirdEpoch.id) as Record<
        string,
        unknown
      >[];
      expect(rows.map((row) => row.target_key)).toEqual(["unit_1::fn_1", "unit_3::fn_3"]);
    } finally {
      store.db.close();
    }
  });

  test("repair admission can intentionally requeue a previously finished target once per epoch", () => {
    const { store } = tempState();
    try {
      const { run, epoch } = setupEpoch(store, [candidate(1, "src/a.c")], 1);
      const claim = claimNextEpochTarget({ store, sessionId: run.id, workerId: "worker-1", baseRev: "base" });
      expect(claim).not.toBeNull();
      closeWorkerState(store, {
        workerStateId: claim?.workerStateId ?? "",
        lifecycleStatus: "finished",
        summary: { source: "test" },
      });
      closeSchedulerEpoch(store, epoch.id, { status: "completed" });

      const nextEpoch = startSchedulerEpoch(store, run.id, {
        size: { mode: "fixed", value: 1 },
        workerPoolSize: 1,
        candidateWindow: 1,
      });
      const admission = admitEpochTargets(store, {
        epochId: nextEpoch.id,
        runId: run.id,
        candidates: [candidate(1, "src/a.c")],
        size: { mode: "fixed", value: 1 },
        workerPoolSize: 1,
        allowPreviouslyFinished: true,
      });
      const duplicateAdmission = admitEpochTargets(store, {
        epochId: nextEpoch.id,
        runId: run.id,
        candidates: [candidate(1, "src/a.c")],
        size: { mode: "fixed", value: 1 },
        workerPoolSize: 1,
        allowPreviouslyFinished: true,
      });

      expect(admission).toMatchObject({ admitted: 1, skippedExisting: 0 });
      expect(duplicateAdmission).toMatchObject({ admitted: 0, skippedExisting: 1 });
    } finally {
      store.db.close();
    }
  });

  test("does not file-lock same-source targets across separate claims", () => {
    const { store } = tempState();
    try {
      const { run, epoch } = setupEpoch(store, [candidate(1, "src/shared.c", 500), candidate(2, "src/shared.c", 499)], 2);

      const first = claimNextEpochTarget({ store, sessionId: run.id, workerId: "worker-1", baseRev: "base" });
      const second = claimNextEpochTarget({ store, sessionId: run.id, workerId: "worker-2", baseRev: "base" });

      expect(first).not.toBeNull();
      expect(second).not.toBeNull();
      expect(first?.writeSet).toEqual(["src/shared.c"]);
      expect(second?.writeSet).toEqual(["src/shared.c"]);
      expect(activeClaimsForSession(store, run.id)).toHaveLength(2);
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

      const first = claimNextEpochTarget({ store, sessionId: run.id, workerId: "worker-1", baseRev: "base" });
      const second = claimNextEpochTarget({ store, sessionId: run.id, workerId: "worker-2", baseRev: "base" });

      expect(first?.target.source_path).toBe("src/a.c");
      expect(second?.target.source_path).toBe("src/b.c");
      expect(activeClaimsForSession(store, run.id)).toHaveLength(2);
    } finally {
      store.db.close();
    }
  });

  test("can requeue a setup-failed target after closing the claim", () => {
    const { store } = tempState();
    try {
      const { run, epoch } = setupEpoch(store, [candidate(1, "src/a.c")], 1);
      const first = claimNextEpochTarget({ store, sessionId: run.id, workerId: "worker-1", baseRev: "base" });
      expect(first).not.toBeNull();

      closeWorkerState(store, {
        workerStateId: first?.workerStateId ?? "",
        lifecycleStatus: "error",
        epochTargetStatus: "admitted",
        errorSummary: "setup failed before worker session",
        summary: { source: "test" },
      });

      expect(activeClaimsForSession(store, run.id)).toHaveLength(0);
      expect(schedulerEpochProgress(store, epoch.id)).toMatchObject({ available: 1, claimed: 0, finished: 0, remaining: 1 });

      const second = claimNextEpochTarget({ store, sessionId: run.id, workerId: "worker-2", baseRev: "base" });
      expect(second).not.toBeNull();
      expect(second?.epochTargetId).toBe(first?.epochTargetId);
      expect(second?.claimId).toBe(first?.claimId);
      expect(second?.workerStateId).toBe(first?.workerStateId);
      expect(count(store, "SELECT COUNT(*) AS count FROM target_claims WHERE epoch_target_id = ?", first?.epochTargetId ?? "")).toBe(1);
      expect(activeClaimsForSession(store, run.id)[0]?.workerId).toBe("worker-2");
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
      const first = claimNextEpochTarget({ store, sessionId: run.id, workerId: "worker-1", baseRev: "base" });
      expect(first).not.toBeNull();
      recordWorkerCheckpoint(store, {
        workerStateId: first?.workerStateId ?? "",
        sessionId: run.id,
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
      const second = claimNextEpochTarget({ store, sessionId: run.id, workerId: "worker-2", baseRev: "base" });
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
      const claim = claimNextEpochTarget({ store, sessionId: run.id, workerId: "worker-1", baseRev: "base" });
      expect(claim).not.toBeNull();
      const base = {
        workerStateId: claim?.workerStateId ?? "",
        sessionId: run.id,
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
      const claim = claimNextEpochTarget({ store, sessionId: run.id, workerId: "worker-1", baseRev: "base" });
      expect(claim).not.toBeNull();
      recordWorkerCheckpoint(store, {
        workerStateId: claim?.workerStateId ?? "",
        sessionId: run.id,
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

  test("error close preserves a prior selectable best checkpoint", () => {
    const { store } = tempState();
    try {
      const { run } = setupEpoch(store, [candidate(1, "src/a.c")]);
      const claim = claimNextEpochTarget({ store, sessionId: run.id, workerId: "worker-1", baseRev: "base" });
      expect(claim).not.toBeNull();
      const checkpoint = recordWorkerCheckpoint(store, {
        workerStateId: claim?.workerStateId ?? "",
        sessionId: run.id,
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

  test("applies selected worker checkpoint patches through the integration queue", async () => {
    const { dir, store } = tempState();
    try {
      const repo = setupGitRepo();
      const patchPath = join(dir, "worker.patch");
      writePatch(repo, patchPath, "int value = 1;\n");

      const { run } = setupEpoch(store, [candidate(1, "src/a.c", 100)], 1);
      const claim = claimNextEpochTarget({ store, sessionId: run.id, workerId: "worker-1", baseRev: "base" });
      expect(claim).not.toBeNull();
      const checkpoint = recordWorkerCheckpoint(store, {
        workerStateId: claim?.workerStateId ?? "",
        sessionId: run.id,
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
        sessionId: run.id,
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

      const result = await processWorkerOutputIntegrationQueue({ dryRun: false, repoRoot: repo, sessionId: run.id, stateDir: dir, store });
      expect(result.processed).toHaveLength(1);
      expect(result.processed[0]?.id).toBe(item.id);
      expect(result.processed[0]?.status).toBe("applied");
      expect(readFileSync(join(repo, "src/a.c"), "utf8")).toBe("int value = 1;\n");
      expect(count(store, "SELECT COUNT(*) AS count FROM worker_output_integrations WHERE id = ? AND status = 'applied'", item.id)).toBe(1);
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
      const claim = claimNextEpochTarget({ store, sessionId: run.id, workerId: "worker-1", baseRev: "base" });
      expect(claim).not.toBeNull();
      const checkpoint = recordWorkerCheckpoint(store, {
        workerStateId: claim?.workerStateId ?? "",
        sessionId: run.id,
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
        sessionId: run.id,
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

      const result = await processWorkerOutputIntegrationQueue({ dryRun: false, repoRoot: repo, sessionId: run.id, stateDir: dir, store });
      expect(result.processed).toHaveLength(1);
      expect(result.processed[0]?.status).toBe("conflict");
      expect(result.processed[0]?.conflictPaths).toContain("src/a.c");
      const row = store.db.query("SELECT item_path FROM worker_output_integrations WHERE id = ?").get(item.id) as Record<string, unknown>;
      expect(typeof row.item_path).toBe("string");
      expect(existsSync(String(row.item_path))).toBe(true);
      expect(readFileSync(String(row.item_path), "utf8")).toContain("\"schema_version\": \"integration_conflict_item_v1\"");
      expect(readFileSync(join(repo, "src/a.c"), "utf8")).toBe("int value = 2;\n");
      expect(count(store, "SELECT COUNT(*) AS count FROM events WHERE run_id = ? AND event_type = 'worker_integration_conflict'", run.id)).toBe(1);
    } finally {
      store.db.close();
    }
  });
});
