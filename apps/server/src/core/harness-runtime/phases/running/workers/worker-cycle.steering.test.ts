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
import { STEERING_LOCATED_INSTRUCTION, type WorkerSteeringResult } from "@server/core/validation/steering/steering-check.js";
import type { SteeringGateMode } from "@server/core/game-registry/resolver.js";
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
