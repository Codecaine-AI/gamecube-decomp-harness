import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  addEvent,
  admitEpochTargets,
  claimNextEpochTarget,
  closeWorkerState,
  createRun,
  openState,
  recordWorkerCheckpoint,
  startSchedulerEpoch,
  type StateStore,
} from "@server/core/session-runtime/run-state";
import { createRunCheckpoint } from "./checkpoint.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempState(): { dir: string; store: StateStore } {
  const dir = mkdtempSync(join(tmpdir(), "pr-validation-state-"));
  tempDirs.push(dir);
  return { dir, store: openState(dir) };
}

function exactCheckpoint(store: StateStore, validationState: "tentative" | "confirmed" | "regressed") {
  const run = createRun(store, "matched_code_percent", 100, 1, { projectId: "test" }, { baseRevision: "base-test" });
  const epoch = startSchedulerEpoch(store, run.id, {
    size: { mode: "fixed", value: 1 },
    workerPoolSize: 1,
    candidateWindow: 1,
  });
  admitEpochTargets(store, {
    epochId: epoch.id,
    runId: run.id,
    candidates: [
      {
        unit: "unit_a",
        symbol: "exact_fn",
        sourcePath: "src/exact.c",
        size: 128,
        fuzzy: 90,
        priority: 100,
        reason: "test target",
      },
    ],
    size: { mode: "fixed", value: 1 },
    workerPoolSize: 1,
  });
  const claim = claimNextEpochTarget({
    store,
    runId: run.id,
    workerId: "worker-1",
    baseRev: "base",
    ttlSeconds: 1_800,
  });
  if (!claim) throw new Error("expected test claim");
  recordWorkerCheckpoint(store, {
    workerStateId: claim.workerStateId,
    runId: run.id,
    epochId: claim.epochId,
    epochTargetId: claim.epochTargetId,
    targetClaimId: claim.claimId,
    attemptIndex: 0,
    oldScore: 90,
    newScore: 100,
    exactMatch: true,
    hardGatesPassed: true,
    validationStatus: "passed",
    validationState,
    patchPath: "/tmp/exact.patch",
    diffPath: "/tmp/exact.patch",
    writeSet: ["src/exact.c"],
  });
  closeWorkerState(store, { workerStateId: claim.workerStateId, lifecycleStatus: "exact" });
  return run;
}

describe("confirmed-only PR eligibility", () => {
  test("keeps the legacy tentative default eligible when feature flags never ran", () => {
    const { dir, store } = tempState();
    try {
      const run = exactCheckpoint(store, "tentative");
      const result = createRunCheckpoint(store, run.id, { artifactDir: resolve(dir, "checkpoint") });

      expect(result.eligibility).toMatchObject({ confirmedOnly: false, excludedTentative: 0 });
      expect(result.items[0]).toMatchObject({ disposition: "pr_candidate", prCandidate: true, validationState: "tentative" });
    } finally {
      store.db.close();
    }
  });

  test("excludes tentative candidates when the run recorded feature flags", () => {
    const { dir, store } = tempState();
    try {
      const run = exactCheckpoint(store, "tentative");
      addEvent(store, run.id, "write_set_integration_flags", "test", {
        merge_on_finish: true,
        write_set_widening: "header",
      });
      const result = createRunCheckpoint(store, run.id, { artifactDir: resolve(dir, "checkpoint") });

      expect(result.eligibility).toMatchObject({ confirmedOnly: true, excludedTentative: 1 });
      expect(result.items[0]).toMatchObject({ disposition: "deferred_patch", prCandidate: false, validationState: "tentative" });
      expect(readFileSync(result.checkpoint.summaryPath, "utf8")).toContain("confirmed-only PR eligibility gate requires confirmed");
    } finally {
      store.db.close();
    }
  });

  test("ships confirmed candidates and routes regressed candidates to rework", () => {
    const confirmedState = tempState();
    try {
      const run = exactCheckpoint(confirmedState.store, "confirmed");
      const result = createRunCheckpoint(confirmedState.store, run.id, {
        artifactDir: resolve(confirmedState.dir, "checkpoint"),
      });
      expect(result.eligibility.confirmedOnly).toBe(true);
      expect(result.items[0]).toMatchObject({ disposition: "pr_candidate", prCandidate: true, validationState: "confirmed" });
    } finally {
      confirmedState.store.db.close();
    }

    const regressedState = tempState();
    try {
      const run = exactCheckpoint(regressedState.store, "regressed");
      const result = createRunCheckpoint(regressedState.store, run.id, {
        artifactDir: resolve(regressedState.dir, "checkpoint"),
      });
      expect(result.eligibility).toMatchObject({ confirmedOnly: true, excludedRegressed: 1 });
      expect(result.items[0]).toMatchObject({ disposition: "needs_rework", prCandidate: false, validationState: "regressed" });
    } finally {
      regressedState.store.db.close();
    }
  });
});
