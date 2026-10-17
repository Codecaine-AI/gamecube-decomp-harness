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
  enqueueWorkerOutputIntegration,
  openState,
  recordWorkerCheckpoint,
  startSchedulerEpoch,
  updateWorkerOutputIntegration,
  type StateStore,
} from "@server/core/harness-runtime/run-state";
import { initializeHarnessState, transitionHarnessState } from "@server/core/harness-state";
import { recordSteeringRollback } from "@server/core/harness-runtime/run-state/steering.js";
import { clearUnverifiedMatch, recordUnverifiedMatch } from "@server/core/harness-runtime/run-state/unverified-matches.js";
import { createRunCheckpoint, latestCheckpointSummary, recheckCheckpointPrCandidates } from "./checkpoint.js";
import { branchSteeringHolds, steeringPrHolds } from "./steering-holds.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempState(): { dir: string; store: StateStore } {
  const dir = mkdtempSync(join(tmpdir(), "pr-validation-state-"));
  tempDirs.push(dir);
  return { dir, store: openState(dir) };
}

function exactCheckpoint(
  store: StateStore,
  validationState: "tentative" | "confirmed" | "regressed",
  options: { metadata?: Record<string, unknown>; gameId?: string; unit?: string } = {},
) {
  const gameId = options.gameId ?? "test";
  initializeHarnessState(store.db, { gameId, worktree: store.stateDir, configurationRevision: "test-config", commandId: "initialize" });
  transitionHarnessState(store.db, { gameId, expectedRevision: 0, commandId: "accept", patch: { source: { head: "base-test" }, readiness: { build: "ready", evidence: "ready", sources: "ready", sandbox: "ready" } } });
  const run = createRun(store, "matched_code_percent", 100, 1, { gameId }, { baseRevision: "base-test" });
  const epoch = startSchedulerEpoch(store, run.id, {
    workerPoolSize: 1,
  });
  admitEpochTargets(store, {
    epochId: epoch.id,
    runId: run.id,
    candidates: [
      {
        kind: "function",
        unit: options.unit ?? "unit_a",
        symbol: "exact_fn",
        sourcePath: "src/exact.c",
        size: 128,
        fuzzy: 90,
      },
    ],
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
    authority: { host: "checkpoint-validation-state-test" },
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
    ...(options.metadata ? { metadata: options.metadata } : {}),
  });
  closeWorkerState(store, {
    workerStateId: claim.workerStateId,
    authority: { host: "checkpoint-validation-state-test" },
    lifecycleStatus: "exact",
  });
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

  test("a recorded off mode does not activate confirmed-only eligibility", () => {
    const { dir, store } = tempState();
    try {
      const run = exactCheckpoint(store, "tentative");
      addEvent(store, run.id, "write_set_integration_flags", "test", {
        write_set_widening: "off",
      });
      const result = createRunCheckpoint(store, run.id, { artifactDir: resolve(dir, "checkpoint") });

      expect(result.eligibility).toMatchObject({ confirmedOnly: false, excludedTentative: 0 });
      expect(result.items[0]).toMatchObject({ disposition: "pr_candidate", prCandidate: true });
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

const STEERING_GAME = { gameId: "test", steeringGate: "enforce" } as const;

function markUnverified(store: StateStore): void {
  recordUnverifiedMatch(store, {
    gameId: "test", unit: "unit_a", symbol: "exact_fn", analyzedRev: "head-1", baseRev: "trusted-base",
    match: { base: 90, candidate: 100, real_only: 92 }, reasons: ["unresolved group g1"],
  });
}

/** Rolls `exact_fn` back at `at`; the checkpoint was validated at `checkpointAt`. */
function rollBack(store: StateStore, runId: string, at: string, checkpointAt: string, target: { gameId?: string; unit?: string } = {}): void {
  const id = recordSteeringRollback(store, {
    gameId: target.gameId ?? "test", unit: target.unit ?? "unit_a", symbol: "exact_fn", analyzedRev: "steered-head", initialVerdict: "steering_located",
    finalVerdict: "pass", rules: ["steering"], report: {}, status: "reverified",
  });
  store.db.query("UPDATE steering_rollbacks SET recorded_at = ?, updated_at = ? WHERE id = ?").run(at, at, id);
  store.db.query("UPDATE worker_checkpoints SET validation_time = ? WHERE run_id = ?").run(checkpointAt, runId);
}

/** The worker gate's enforce result: a whole-certificate pass of `exact_fn`, edited, its unit built and compared. */
function enforcedPass(overrides: { mode?: string; units?: unknown[]; unit?: string } = {}): Record<string, unknown> {
  return {
    runner_validation: {
      status: "passed",
      steering: {
        mode: overrides.mode ?? "enforce", error: null, artifactPath: null, durationMs: 1,
        decision: {
          attempt: "pass", reasons: [], removable_noncosmetic: [], probes: [], violations: [], unused_checks: [], order_checks: [],
          functions: [{
            unit: overrides.unit ?? "unit_a", name: "exact_fn", decision: "pass", semantic: "clean", analysis: "complete", audit_label: "clean",
            match: { base: 90, candidate: 100, real_only: 100 }, groups: ["g1"],
          }],
          units: overrides.units ?? [{ unit: overrides.unit ?? "unit_a", built: true, compared: true }],
        },
      },
    },
  };
}

describe("steering holds on PR eligibility", () => {
  test("an active unverified_match holds a confirmed exact checkpoint out of every shipping count; an inactive gate ignores it", () => {
    const { dir, store } = tempState();
    try {
      const run = exactCheckpoint(store, "confirmed");
      markUnverified(store);
      const held = createRunCheckpoint(store, run.id, { artifactDir: resolve(dir, "held"), ...STEERING_GAME });
      expect(held.items[0]).toMatchObject({ disposition: "steering_hold", prCandidate: false, exactMatch: false, validationState: "confirmed" });
      expect(held.counts).toMatchObject({ pr_candidate: 0, exact_match: 0, steering_hold: 1, carry_forward: 1 });
      expect(held.eligibility).toMatchObject({ steeringGate: "enforce", excludedSteeringHold: 1 });
      expect(readFileSync(held.checkpoint.prCandidatesPath, "utf8")).toContain("0 exact-match candidate(s) ship");
      expect(readFileSync(held.checkpoint.carryForwardPath, "utf8")).toContain("steering hold (unverified_match)");

      // Melee: no active gate, so steering state is never read.
      const melee = createRunCheckpoint(store, run.id, { artifactDir: resolve(dir, "melee"), gameId: "test", steeringGate: "off" });
      expect(melee.items[0]).toMatchObject({ disposition: "pr_candidate", exactMatch: true });
      expect(melee.counts).toMatchObject({ pr_candidate: 1, exact_match: 1, steering_hold: 0 });
    } finally {
      store.db.close();
    }
  });

  test("a rollback after the checkpoint holds its stale exact even when the rollback reads reverified", () => {
    const { dir, store } = tempState();
    try {
      const run = exactCheckpoint(store, "confirmed", { metadata: enforcedPass() });
      rollBack(store, run.id, "2026-10-02T00:00:00.000Z", "2026-10-01T00:00:00.000Z");
      const result = createRunCheckpoint(store, run.id, { artifactDir: resolve(dir, "checkpoint"), ...STEERING_GAME });
      expect(result.items[0]).toMatchObject({ disposition: "steering_hold", exactMatch: false });
      expect(result.counts).toMatchObject({ pr_candidate: 0, exact_match: 0, steering_hold: 1 });
    } finally {
      store.db.close();
    }
  });

  for (const scenario of [
    { name: "an enforced whole-certificate pass validated after the rollback ships", metadata: enforcedPass(), ships: true },
    { name: "a shadow pass after the rollback stays held", metadata: enforcedPass({ mode: "shadow" }), ships: false },
    { name: "an enforced pass whose unit was not compared stays held", metadata: enforcedPass({ units: [{ unit: "unit_a", built: true, compared: false }] }), ships: false },
    { name: "a checkpoint without gate evidence stays held", metadata: undefined, ships: false },
  ]) {
    test(`rollback before the checkpoint: ${scenario.name}`, () => {
      const { dir, store } = tempState();
      try {
        const run = exactCheckpoint(store, "confirmed", { metadata: scenario.metadata });
        rollBack(store, run.id, "2026-10-01T00:00:00.000Z", "2026-10-02T00:00:00.000Z");
        const result = createRunCheckpoint(store, run.id, { artifactDir: resolve(dir, "checkpoint"), ...STEERING_GAME });
        expect(result.items[0]?.disposition).toBe(scenario.ships ? "pr_candidate" : "steering_hold");
        expect(result.counts).toMatchObject({ pr_candidate: scenario.ships ? 1 : 0, exact_match: scenario.ships ? 1 : 0 });
      } finally {
        store.db.close();
      }
    });
  }

  test("a checkpoint written before the function became unverified is rechecked, not trusted", () => {
    const { dir, store } = tempState();
    try {
      const run = exactCheckpoint(store, "confirmed");
      const written = createRunCheckpoint(store, run.id, { artifactDir: resolve(dir, "checkpoint"), ...STEERING_GAME });
      expect(written.counts.pr_candidate).toBe(1);

      markUnverified(store);
      const recheck = recheckCheckpointPrCandidates(store, written.checkpoint.id, STEERING_GAME);
      expect(recheck.shipping).toHaveLength(0);
      expect(recheck.held.map(({ hold }) => hold.reason)).toEqual(["unverified_match"]);
      const summary = latestCheckpointSummary(store, run.id, STEERING_GAME);
      expect(summary).toMatchObject({ counts: { pr_candidate: 0, steering_hold: 1 }, recordedCounts: { pr_candidate: 1 } });

      clearUnverifiedMatch(store, { gameId: "test", unit: "unit_a", symbol: "exact_fn", clearedBy: "integration:certified" });
      expect(recheckCheckpointPrCandidates(store, written.checkpoint.id, STEERING_GAME).shipping).toHaveLength(1);
    } finally {
      store.db.close();
    }
  });
});

/** Records the run's checkpoint integration as `status` with the given integration metadata. */
function integrate(store: StateStore, runId: string, status: "applied" | "rejected", metadata: Record<string, unknown>, targetKey = "unit_a::exact_fn"): void {
  const row = store.db.query("SELECT * FROM worker_checkpoints WHERE run_id = ?").get(runId) as Record<string, string>;
  const queued = enqueueWorkerOutputIntegration(store, {
    runId, epochId: row.epoch_id!, epochTargetId: row.epoch_target_id!, targetClaimId: row.target_claim_id!,
    workerStateId: row.worker_state_id!, workerCheckpointId: row.id!, targetKey,
  });
  updateWorkerOutputIntegration(store, queued.id, { status, disposition: status === "applied" ? "clean_apply" : "confirmation_regressed_reverted", metadata });
}

/** The clean apply's metadata with a landed-content proof bound to it (the fixture claims at `base`, `src/exact.c`). */
function landed(proof: Record<string, unknown> | null = {}): Record<string, unknown> {
  return {
    pre_apply_rev: "pre-apply-rev",
    integrated_rev: "integrated-rev",
    ...(proof === null ? {} : {
      steering_content_freshness: {
        fresh: true, target_key: "unit_a::exact_fn", source_path: "src/exact.c", claim_base_rev: "base",
        pre_apply_rev: "pre-apply-rev", integrated_rev: "integrated-rev", ...proof,
      },
    }),
  };
}

describe("branch steering holds after a rollback", () => {
  const ancestorOf = (accepted: string[]) => async (rev: string) => accepted.includes(rev);

  for (const scenario of [
    { name: "a certified checkpoint whose bound content landed at an ancestor of the head releases the hold", metadata: enforcedPass(), status: "applied", integration: landed(), ancestors: ["integrated-rev"], released: true },
    { name: "the same integration at a rev off the published head stays held", metadata: enforcedPass(), status: "applied", integration: landed(), ancestors: [], released: false },
    { name: "a certified integration the confirmation pass reverted stays held", metadata: enforcedPass(), status: "rejected", integration: landed(), ancestors: ["integrated-rev"], released: false },
    { name: "an integrated checkpoint whose gate run was shadow stays held", metadata: enforcedPass({ mode: "shadow" }), status: "applied", integration: landed(), ancestors: ["integrated-rev"], released: false },
    { name: "a legacy integration without a landed-content proof stays held", metadata: enforcedPass(), status: "applied", integration: landed(null), ancestors: ["integrated-rev"], released: false },
    // The certified version was staged, then the function's source changed before it landed.
    { name: "a proof saying the landed content is not the certified version stays held", metadata: enforcedPass(), status: "applied", integration: landed({ fresh: false }), ancestors: ["integrated-rev"], released: false },
    { name: "a proof bound to another landing stays held", metadata: enforcedPass(), status: "applied", integration: landed({ integrated_rev: "other-rev" }), ancestors: ["integrated-rev", "other-rev"], released: false },
    { name: "a proof against another claim base stays held", metadata: enforcedPass(), status: "applied", integration: landed({ claim_base_rev: "other-base" }), ancestors: ["integrated-rev"], released: false },
    { name: "a proof for another function stays held", metadata: enforcedPass(), status: "applied", integration: landed({ target_key: "unit_a::other_fn" }), ancestors: ["integrated-rev"], released: false },
  ] as const) {
    test(scenario.name, async () => {
      const { store } = tempState();
      try {
        const run = exactCheckpoint(store, "confirmed", { metadata: scenario.metadata });
        rollBack(store, run.id, "2026-10-01T00:00:00.000Z", "2026-10-02T00:00:00.000Z");
        integrate(store, run.id, scenario.status, scenario.integration);
        const holds = await branchSteeringHolds(store, STEERING_GAME, ancestorOf([...scenario.ancestors]));
        expect(holds.map((hold) => `${hold.reason}:${hold.symbol}`)).toEqual(scenario.released ? [] : ["steering_rollback:exact_fn"]);
      } finally {
        store.db.close();
      }
    });
  }

  test("a certified checkpoint integrated before the rollback stays held", async () => {
    const { store } = tempState();
    try {
      const run = exactCheckpoint(store, "confirmed", { metadata: enforcedPass() });
      rollBack(store, run.id, "2026-10-02T00:00:00.000Z", "2026-10-01T00:00:00.000Z");
      integrate(store, run.id, "applied", landed());
      expect((await branchSteeringHolds(store, STEERING_GAME, ancestorOf(["integrated-rev"]))).map((hold) => hold.reason)).toEqual(["steering_rollback"]);
    } finally {
      store.db.close();
    }
  });
});

describe("module-prefixed worker units (SMS)", () => {
  const SMS = { gameId: "sms", steeringGate: "enforce" } as const;
  const REPORT_UNIT = "mario/Animal/AnimalBase";
  const STEERING_UNIT = "Animal/AnimalBase";
  const unverified = (store: StateStore, gameId: string, symbol: string) => recordUnverifiedMatch(store, {
    gameId, unit: STEERING_UNIT, symbol, analyzedRev: "head-1", baseRev: "trusted-base",
    match: { base: 90, candidate: 100, real_only: 92 }, reasons: ["unresolved group g1"],
  });
  const rollback = (store: StateStore, gameId: string, symbol: string) => recordSteeringRollback(store, {
    gameId, unit: STEERING_UNIT, symbol, analyzedRev: "steered-head", initialVerdict: "steering_located",
    finalVerdict: "pass", rules: ["steering"], report: {}, status: "reverified",
  });

  test("holdFor with the prefixed worker unit finds short-unit rows; a short-unit gate certificate clears the rollback", () => {
    const { store } = tempState();
    try {
      unverified(store, "sms", "held");
      rollback(store, "sms", "exact_fn");
      const holds = steeringPrHolds(store, SMS);
      expect(holds.holdFor(REPORT_UNIT, "held", null)?.reason).toBe("unverified_match");
      expect(holds.holdFor(REPORT_UNIT, "exact_fn", null)?.reason).toBe("steering_rollback");
      const certified = { validationTime: "2099-01-01T00:00:00.000Z", runnerValidation: (enforcedPass({ unit: STEERING_UNIT }).runner_validation as Record<string, unknown>) };
      expect(holds.holdFor(REPORT_UNIT, "exact_fn", certified)).toBeNull();
    } finally {
      store.db.close();
    }
  });

  test("Melee (no module prefixes) never strips a path component", () => {
    const { store } = tempState();
    try {
      unverified(store, "melee", "held");
      const holds = steeringPrHolds(store, { gameId: "melee", steeringGate: "enforce" });
      expect(holds.holdFor(REPORT_UNIT, "held", null)).toBeNull();
      expect(holds.holdFor(STEERING_UNIT, "held", null)?.reason).toBe("unverified_match");
    } finally {
      store.db.close();
    }
  });

  test("a prefixed exact checkpoint is held by a short-unit row, in the checkpoint and its recheck", () => {
    const { dir, store } = tempState();
    try {
      const run = exactCheckpoint(store, "confirmed", { gameId: "sms", unit: REPORT_UNIT });
      const written = createRunCheckpoint(store, run.id, { artifactDir: resolve(dir, "before"), ...SMS });
      expect(written.counts.pr_candidate).toBe(1);
      unverified(store, "sms", "exact_fn");
      expect(createRunCheckpoint(store, run.id, { artifactDir: resolve(dir, "held"), ...SMS }).items[0]).toMatchObject({ disposition: "steering_hold", exactMatch: false });
      expect(recheckCheckpointPrCandidates(store, written.checkpoint.id, SMS).held.map(({ hold }) => hold.reason)).toEqual(["unverified_match"]);
    } finally {
      store.db.close();
    }
  });

  test("a short-unit rollback is released by a certified integration under the prefixed report target key", async () => {
    const { store } = tempState();
    try {
      const run = exactCheckpoint(store, "confirmed", { gameId: "sms", unit: REPORT_UNIT, metadata: enforcedPass({ unit: STEERING_UNIT }) });
      rollBack(store, run.id, "2026-10-01T00:00:00.000Z", "2026-10-02T00:00:00.000Z", { gameId: "sms", unit: STEERING_UNIT });
      integrate(store, run.id, "applied", landed({ target_key: `${REPORT_UNIT}::exact_fn` }), `${REPORT_UNIT}::exact_fn`);
      expect(await branchSteeringHolds(store, SMS, async (rev) => rev === "integrated-rev")).toEqual([]);
      expect((await branchSteeringHolds(store, SMS, async () => false)).map((hold) => `${hold.reason}:${hold.unit}::${hold.symbol}`))
        .toEqual([`steering_rollback:${STEERING_UNIT}::exact_fn`]);
    } finally {
      store.db.close();
    }
  });

  test("a cleared unverified_match holds published source its certifying revision is not an ancestor of", async () => {
    const { store } = tempState();
    try {
      for (const symbol of ["certified", "unrecorded"]) unverified(store, "sms", symbol);
      clearUnverifiedMatch(store, { gameId: "sms", unit: REPORT_UNIT, symbol: "certified", clearedBy: "integration:i1", clearedRev: "repair-rev" });
      clearUnverifiedMatch(store, { gameId: "sms", unit: STEERING_UNIT, symbol: "unrecorded", clearedBy: "backfill" });
      const holds = async (heads: string[]) => (await branchSteeringHolds(store, SMS, async (rev) => heads.includes(rev)))
        .map((hold) => `${hold.reason}:${hold.unit}::${hold.symbol}`);
      // Older source (the repair is not its ancestor) does not inherit the later clearance.
      expect(await holds([])).toEqual([`unverified_match:${STEERING_UNIT}::certified`, `unverified_match:${STEERING_UNIT}::unrecorded`]);
      // Source that contains the repair is certified; a clear without a revision never is.
      expect(await holds(["repair-rev"])).toEqual([`unverified_match:${STEERING_UNIT}::unrecorded`]);
      // Melee-style games without an active gate read nothing.
      expect(await branchSteeringHolds(store, { gameId: "melee", steeringGate: "off" }, async () => false)).toEqual([]);
    } finally {
      store.db.close();
    }
  });
});
