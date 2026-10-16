import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WorkerChangeValidation } from "@server/core/agent-catalog/agents/running/worker/change-validation";
import {
  admitEpochTargets,
  bestCheckpointForWorkerState,
  claimNextEpochTarget,
  createRun,
  openState,
  recordWorkerCheckpoint,
  startSchedulerEpoch,
  workerCheckpointsForWorkerState,
} from "@server/core/harness-runtime/run-state";
import { initializeHarnessState, transitionHarnessState } from "@server/core/harness-state/state.js";
import { STEERING_LOCATED_INSTRUCTION, UNUSED_BODY_INSTRUCTION, type WorkerSteeringResult } from "@server/core/validation/steering/steering-check.js";
import type { SteeringGateMode } from "@server/core/game-registry/resolver.js";
import { UNVERIFIED_MATCH_INSTRUCTION } from "@server/core/agent-catalog/agents/running/worker/steering-validation.js";
import {
  claimStackOnlyShortcutAllowed,
  workerCheckpointHardGatesPassed,
  workerContinuationDecision,
  workerFacingRepairRequest,
  workerRepairInstruction,
  workerSteeringRepairFields,
} from "./worker-cycle.js";

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

const UNIT = "mario/M3DUtil/MActor";
const SYMBOL = "setLightData__6MActorFv";
const PROBE = { function: SYMBOL, unit: UNIT, steering_edits: [{ file: "src/M3DUtil/MActor.cpp", line: 11, shapes: ["temp_alias"] }] };

function steering(mode: SteeringGateMode, attempt: "pass" | "steering_located" = "steering_located"): WorkerSteeringResult {
  return {
    mode,
    error: null,
    artifactPath: "/tmp/attempt-0.steering.json",
    durationMs: 12,
    decision: {
      attempt,
      reasons: [],
      functions: [{
        unit: UNIT, name: SYMBOL, decision: attempt, semantic: attempt === "pass" ? "clean" : "steering", analysis: "complete",
        audit_label: "steering", match: { base: 90, candidate: 100, real_only: 96.5 },
      }],
      removable_noncosmetic: attempt === "pass" ? [] : ["g1"],
      probes: attempt === "pass" ? [] : [PROBE],
    },
  };
}

/** An exact attempt the enforced steering gate rejected (what applySteeringToValidation returns). */
function steeringRejected(mode: SteeringGateMode = "enforce"): WorkerChangeValidation {
  const reason = `steering_located: steering located in ${SYMBOL} (without steering: 96.5%). ${STEERING_LOCATED_INSTRUCTION}`;
  return {
    status: mode === "enforce" ? "steering_located" : "passed",
    reasons: mode === "enforce" ? [reason] : [],
    target: { unit: UNIT, symbol: SYMBOL, before: 90, after: 100, improved: true, exact: true },
    qaLint: null,
    steering: steering(mode),
  };
}

/** A fresh store with one claimed SMS target whose worker baseline is `fuzzy`. */
function withClaim(fuzzy: number, run: (store: ReturnType<typeof openState>, claim: NonNullable<ReturnType<typeof claimNextEpochTarget>>, runId: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "steering-checkpoint-"));
  dirs.push(dir);
  const store = openState(dir);
  try {
    initializeHarnessState(store.db, { gameId: "sms", worktree: dir, configurationRevision: "test", commandId: "init" });
    transitionHarnessState(store.db, {
      gameId: "sms", expectedRevision: 0, commandId: "seed",
      patch: { readiness: { build: "ready", sources: "ready", sandbox: "ready", evidence: "ready" }, source: { head: "base" } },
    });
    const created = createRun(store, "matched_code_percent", 100, 1, { gameId: "sms" }, { baseRevision: "base" });
    const epoch = startSchedulerEpoch(store, created.id, { workerPoolSize: 1 });
    admitEpochTargets(store, {
      epochId: epoch.id,
      runId: created.id,
      candidates: [{ kind: "function", unit: UNIT, symbol: SYMBOL, sourcePath: "src/M3DUtil/MActor.cpp", size: 64, fuzzy }],
      workerPoolSize: 1,
    });
    run(store, claimNextEpochTarget({ store, runId: created.id, workerId: "worker-1", baseRev: "base", ttlSeconds: 1800 })!, created.id);
  } finally {
    store.db.close();
  }
}

describe("steering repair request", () => {
  test("an enforced rejection carries the gate's probe and the steering instruction, not the gate-failed-exact one", () => {
    const validation = steeringRejected();
    const fields = workerSteeringRepairFields(validation);
    expect(fields).toEqual({ steering_probe: PROBE });
    // The probe survives the worker-facing sanitizer.
    expect(workerFacingRepairRequest({ reasons: validation.reasons, ...fields }).steering_probe).toEqual(PROBE);

    const instruction = workerRepairInstruction({
      runnerValidation: validation,
      latestCheckpoint: { exactMatch: true, hardGatesPassed: false },
      repairReasons: validation.reasons,
      scoreText: " at 100%",
      stopAtFrame: true,
    });
    expect(instruction).toContain(STEERING_LOCATED_INSTRUCTION);
    expect(instruction).toStartWith("Your last submission was rejected: steering_located:");
    expect(instruction).not.toContain("hard gates failed");
  });

  test("a dead UNUSED body gets the UNUSED-body instruction instead of the steering one", () => {
    const base = steeringRejected();
    const passing = steering("enforce", "pass");
    const violation = { kind: "dead_unused_body", unit: UNIT, file: "src/M3DUtil/MActor.cpp", function: "MActor::unusedHelper" };
    const validation: WorkerChangeValidation = {
      ...base,
      steering: { ...passing, certificate: { sourceChanged: true, reduceAnalysis: "complete", unresolvedGroups: [] }, decision: { ...passing.decision!, attempt: "rule_violation", units: [{ unit: UNIT, built: true, compared: true }], violations: [violation], unused_checks: [] } },
    };
    const instruction = workerRepairInstruction({ runnerValidation: validation, latestCheckpoint: null, repairReasons: [], scoreText: "", stopAtFrame: true });
    expect(instruction).toContain(UNUSED_BODY_INSTRUCTION);
    expect(instruction).not.toContain(STEERING_LOCATED_INSTRUCTION);
  });

  test("shadow never feeds the probe back; other rejections keep today's instructions", () => {
    const shadow = steeringRejected("shadow");
    expect(workerSteeringRepairFields(shadow)).toEqual({});
    const passed = workerRepairInstruction({ runnerValidation: shadow, latestCheckpoint: null, repairReasons: [], scoreText: " at 100%", stopAtFrame: false });
    expect(passed).toBe("Your last submission was validated and checkpointed at 100%. Continue toward exact from the current source. Submit each verified improvement. Preserve pre-existing dirty work, return a compact validation-ready JSON note, and do not use whole-file destructive reset/restore/checkout/clean commands.");
    const gateFailedExact = workerRepairInstruction({
      runnerValidation: { status: "failed", reasons: ["qa"], qaLint: null },
      latestCheckpoint: { exactMatch: true, hardGatesPassed: false },
      repairReasons: ["qa"],
      scoreText: "",
      stopAtFrame: false,
    });
    expect(gateFailedExact).toStartWith("The runner measured an exact target score, but hard gates failed.");
    expect(gateFailedExact).not.toContain(STEERING_LOCATED_INSTRUCTION);
  });
});

describe("steering-rejected checkpoints", () => {
  test("a rejected exact attempt fails hard gates, is never selectable, and does not stop the worker as exact", () => {
    const validation = steeringRejected();
    const hardGatesPassed = workerCheckpointHardGatesPassed({
      runnerValidation: validation,
      reviewLint: { status: "passed", reasons: [], findings: [] } as never,
      outOfWriteSetChanges: [],
    });
    expect(hardGatesPassed).toBe(false);

    const dir = mkdtempSync(join(tmpdir(), "steering-checkpoint-"));
    dirs.push(dir);
    const store = openState(dir);
    try {
      initializeHarnessState(store.db, { gameId: "sms", worktree: dir, configurationRevision: "test", commandId: "init" });
      transitionHarnessState(store.db, {
        gameId: "sms", expectedRevision: 0, commandId: "seed",
        patch: { readiness: { build: "ready", sources: "ready", sandbox: "ready", evidence: "ready" }, source: { head: "base" } },
      });
      const run = createRun(store, "matched_code_percent", 100, 1, { gameId: "sms" }, { baseRevision: "base" });
      const epoch = startSchedulerEpoch(store, run.id, { workerPoolSize: 1 });
      admitEpochTargets(store, {
        epochId: epoch.id,
        runId: run.id,
        candidates: [{ kind: "function", unit: UNIT, symbol: SYMBOL, sourcePath: "src/M3DUtil/MActor.cpp", size: 64, fuzzy: 90 }],
        workerPoolSize: 1,
      });
      const claim = claimNextEpochTarget({ store, runId: run.id, workerId: "worker-1", baseRev: "base", ttlSeconds: 1800 })!;
      const checkpoint = recordWorkerCheckpoint(store, {
        authority: { host: "worker-cycle-steering-test" },
        workerStateId: claim.workerStateId,
        runId: run.id,
        epochId: claim.epochId,
        epochTargetId: claim.epochTargetId,
        targetClaimId: claim.claimId,
        attemptIndex: 0,
        oldScore: 90,
        newScore: 100,
        exactMatch: true,
        hardGatesPassed,
        buildStatus: "compiled",
        qaStatus: null,
        objdiffStatus: "available",
        validationStatus: validation.status,
        artifactPath: null,
        patchPath: null,
        diffPath: null,
        writeSet: ["src/M3DUtil/MActor.cpp"],
        failureReasons: validation.reasons,
        metadata: {},
      });
      expect(checkpoint.selectable).toBe(false);
      expect(checkpoint.exactMatch).toBe(true);
      expect(bestCheckpointForWorkerState(store, claim.workerStateId)).toBeNull();
      const decision = workerContinuationDecision({
        attemptIndex: 0,
        checkpoints: workerCheckpointsForWorkerState(store, claim.workerStateId),
        repairReasons: validation.reasons,
        dryRun: false,
      });
      expect(decision.stopReason).not.toBe("accepted_exact");
      expect(decision.shouldContinue).toBe(true);
    } finally {
      store.db.close();
    }
  });
});

describe("claimStackOnlyShortcutAllowed", () => {
  const base = {
    stopAtFrame: true,
    stackRemainingClass: "stack_only",
    measuredBaselineScore: 99.5,
    coverage: null,
    baseRev: "claim-base",
    hostRepoRoot: "/host/sms",
  };

  test("off and shadow keep today's shortcut; non-stack-only or exact targets never take it", () => {
    const isAncestor = () => {
      throw new Error("coverage is not consulted outside enforce");
    };
    for (const steeringGate of ["off", "shadow"] as const) {
      expect(claimStackOnlyShortcutAllowed({ ...base, steeringGate, isAncestor })).toBe(true);
    }
    expect(claimStackOnlyShortcutAllowed({ ...base, steeringGate: "off", stopAtFrame: false })).toBe(false);
    expect(claimStackOnlyShortcutAllowed({ ...base, steeringGate: "off", stackRemainingClass: "code" })).toBe(false);
    expect(claimStackOnlyShortcutAllowed({ ...base, steeringGate: "off", measuredBaselineScore: 100 })).toBe(false);
  });

  test("enforce needs a clean coverage row whose baseline is an ancestor of the claim base", () => {
    const ancestorCalls: string[][] = [];
    const isAncestor = (repo: string, ancestor: string, descendant: string) => {
      ancestorCalls.push([repo, ancestor, descendant]);
      return ancestor === "baseline-good";
    };
    const enforce = { ...base, steeringGate: "enforce" as const, isAncestor };
    expect(claimStackOnlyShortcutAllowed(enforce)).toBe(false);
    expect(claimStackOnlyShortcutAllowed({ ...enforce, coverage: { baselineRev: "baseline-good", clean: false, analyzedRev: "x" } })).toBe(false);
    expect(claimStackOnlyShortcutAllowed({ ...enforce, coverage: { baselineRev: "baseline-other-branch", clean: true, analyzedRev: "x" } })).toBe(false);
    expect(claimStackOnlyShortcutAllowed({ ...enforce, coverage: { baselineRev: "baseline-good", clean: true, analyzedRev: "x" }, baseRev: null })).toBe(false);
    expect(claimStackOnlyShortcutAllowed({ ...enforce, coverage: { baselineRev: "baseline-good", clean: true, analyzedRev: "x" } })).toBe(true);
    expect(ancestorCalls).toEqual([
      ["/host/sms", "baseline-other-branch", "claim-base"],
      ["/host/sms", "baseline-good", "claim-base"],
    ]);
  });
});

describe("unverified_match targets", () => {
  test("a 100 -> 100 checkpoint is selectable only with the gate's certification for this worker state's own target", () => {
    withClaim(100, (store, claim, runId) => {
      let attemptIndex = 0;
      const checkpoint = (extra: Partial<Parameters<typeof recordWorkerCheckpoint>[1]> = {}) => recordWorkerCheckpoint(store, {
        authority: { host: "worker-cycle-steering-test" },
        workerStateId: claim.workerStateId,
        runId,
        epochId: claim.epochId,
        epochTargetId: claim.epochTargetId,
        targetClaimId: claim.claimId,
        attemptIndex: attemptIndex++,
        oldScore: 100,
        newScore: 100,
        exactMatch: true,
        hardGatesPassed: true,
        validationStatus: "passed",
        writeSet: ["src/M3DUtil/MActor.cpp"],
        ...extra,
      });
      const own = { kind: "unverified_match" as const, unit: UNIT, symbol: SYMBOL };
      // An ordinary no-op exact attempt, and certifications that do not hold for this checkpoint.
      const rejected = [
        checkpoint(),
        checkpoint({ verificationImprovement: { ...own, symbol: "calcLight__6MActorFv" } }),
        checkpoint({ verificationImprovement: own, hardGatesPassed: false }),
        checkpoint({ verificationImprovement: own, exactMatch: false }),
      ];
      expect(rejected.map((row) => row.selectable)).toEqual([false, false, false, false]);
      expect(bestCheckpointForWorkerState(store, claim.workerStateId)).toBeNull();
      expect(workerContinuationDecision({ attemptIndex: attemptIndex - 1, checkpoints: workerCheckpointsForWorkerState(store, claim.workerStateId), repairReasons: [], dryRun: false }).stopReason).not.toBe("accepted_exact");

      const certified = checkpoint({ verificationImprovement: own });
      expect(certified.selectable).toBe(true);
      expect(bestCheckpointForWorkerState(store, claim.workerStateId)?.id).toBe(certified.id);
      expect(workerContinuationDecision({ attemptIndex: certified.attemptIndex, checkpoints: workerCheckpointsForWorkerState(store, claim.workerStateId), repairReasons: [], dryRun: false }).stopReason).toBe("accepted_exact");
    });
  });

  test("a certified stack-only checkpoint that keeps the baseline is selectable; losing score never is", () => {
    withClaim(99.5, (store, claim, runId) => {
      const base = {
        authority: { host: "worker-cycle-steering-test" },
        workerStateId: claim.workerStateId,
        runId,
        epochId: claim.epochId,
        epochTargetId: claim.epochTargetId,
        targetClaimId: claim.claimId,
        oldScore: 99.5,
        exactMatch: false,
        hardGatesPassed: true,
        validationStatus: "passed",
        verificationImprovement: { kind: "unverified_match" as const, unit: UNIT, symbol: SYMBOL, targetStackOnly: true },
      };
      expect(recordWorkerCheckpoint(store, { ...base, attemptIndex: 0, newScore: 99.4 }).selectable).toBe(false);
      expect(recordWorkerCheckpoint(store, { ...base, attemptIndex: 1, newScore: 99.5 }).selectable).toBe(true);
    });
  });

  test("an uncertified unverified target is told to produce a gate-certified version, not to undo steering", () => {
    const reason = `unverified_match: ${SYMBOL} matches but is not certified (the steering gate against the trusted base did not pass this function). ${UNVERIFIED_MATCH_INSTRUCTION}`;
    const validation: WorkerChangeValidation = {
      status: "steering_located",
      reasons: [reason],
      target: { unit: UNIT, symbol: SYMBOL, before: 100, after: 100, improved: false, exact: true },
      qaLint: null,
      steering: steering("enforce", "pass"),
      unverifiedTarget: { unit: UNIT, symbol: SYMBOL, trustedBaseRev: "trusted-base", baseline: steering("enforce", "steering_located") },
    };
    const instruction = workerRepairInstruction({ runnerValidation: validation, latestCheckpoint: { exactMatch: true, hardGatesPassed: false }, repairReasons: [reason], scoreText: " at 100%", stopAtFrame: true });
    expect(instruction).toContain(UNVERIFIED_MATCH_INSTRUCTION);
    expect(instruction).not.toContain(STEERING_LOCATED_INSTRUCTION);
    expect(instruction).not.toContain("hard gates failed");
  });

  test("the claim-time stack-only shortcut never closes an unverified target, even with clean coverage", () => {
    const params = {
      stopAtFrame: true,
      stackRemainingClass: "stack_only",
      measuredBaselineScore: 99.5,
      steeringGate: "enforce" as const,
      coverage: { baselineRev: "baseline-good", clean: true, analyzedRev: "x" },
      baseRev: "claim-base",
      hostRepoRoot: "/host/sms",
      isAncestor: () => true,
    };
    expect(claimStackOnlyShortcutAllowed(params)).toBe(true);
    expect(claimStackOnlyShortcutAllowed({ ...params, unverifiedMatch: true })).toBe(false);
  });
});
