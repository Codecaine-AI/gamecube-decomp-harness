import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WorkerRunnerValidation } from "@server/core/agent-catalog/agents/running/worker/runner-validation.js";
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
import {
  budgetExtensionMode,
  certificationGrantCount,
  certifiedBaseline,
  certifiedProgress,
  CHECKPOINT_CERTIFICATION_KEY,
  listCertificationRestorations,
  type BaseIdentityProof,
} from "@server/core/harness-runtime/run-state/certification.js";
import { recordSteeringObservation } from "@server/core/harness-runtime/run-state/steering.js";
import type { UnverifiedMatchRecord } from "@server/core/harness-runtime/run-state/unverified-matches.js";
import { initializeHarnessState, transitionHarnessState } from "@server/core/harness-state/state.js";
import { checkpointUnverifiedCertification } from "@server/core/validation/steering/unverified-certification.js";
import type { WorkerSteeringResult } from "@server/core/validation/steering/steering-check.js";
import { commitWorkerAttemptCertification, workerAttemptCertification, workerCertificationLane } from "./worker-certification.js";
import { workerContinuationDecision } from "./worker-cycle.js";

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

const GAME = "sms";
const UNIT = "mario/M3DUtil/MActor";
const SYMBOL = "setLightData__6MActorFv";
const SOURCE = "src/M3DUtil/MActor.cpp";
const TRUSTED = "trusted-81248bda";
const CLAIM_BASE = "base";

type Store = ReturnType<typeof openState>;
type Claim = NonNullable<ReturnType<typeof claimNextEpochTarget>>;

function withClaim(fuzzy: number, run: (store: Store, claim: Claim, runId: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "certification-lane-"));
  dirs.push(dir);
  const store = openState(dir);
  try {
    initializeHarnessState(store.db, { gameId: GAME, worktree: dir, configurationRevision: "test", commandId: "init" });
    transitionHarnessState(store.db, {
      gameId: GAME, expectedRevision: 0, commandId: "seed",
      patch: { readiness: { build: "ready", sources: "ready", sandbox: "ready", evidence: "ready" }, source: { head: CLAIM_BASE } },
    });
    const created = createRun(store, "matched_code_percent", 100, 1, { gameId: GAME }, { baseRevision: CLAIM_BASE });
    const epoch = startSchedulerEpoch(store, created.id, { workerPoolSize: 1 });
    admitEpochTargets(store, {
      epochId: epoch.id,
      runId: created.id,
      candidates: [{ kind: "function", unit: UNIT, symbol: SYMBOL, sourcePath: SOURCE, size: 64, fuzzy }],
      workerPoolSize: 1,
    });
    run(store, claimNextEpochTarget({ store, runId: created.id, workerId: "worker-1", baseRev: CLAIM_BASE, ttlSeconds: 1800 })!, created.id);
  } finally {
    store.db.close();
  }
}

const UNVERIFIED: UnverifiedMatchRecord = {
  gameId: GAME, unit: UNIT, symbol: SYMBOL, analyzedRev: CLAIM_BASE, baseRev: TRUSTED, sourcePath: SOURCE, functionSourceSha: null,
  match: { base: 90, candidate: 100, real_only: 92 }, reasons: ["unresolved"], report: {}, recordedAt: "then", clearedAt: null, clearedBy: null, clearedRev: null,
};

function gate(decision: "pass" | "unresolved", groups: string[] = ["g1"]): WorkerSteeringResult {
  return {
    mode: "enforce",
    error: null,
    artifactPath: "/tmp/attempt.steering.json",
    durationMs: 5,
    decision: {
      attempt: decision,
      reasons: [],
      functions: [{
        unit: UNIT, name: SYMBOL, decision, semantic: decision === "pass" ? "clean" : "unresolved", analysis: "complete",
        audit_label: decision === "pass" ? "real" : "unresolved", match: { base: 90, candidate: 95, real_only: 95 }, groups,
      }],
      removable_noncosmetic: [],
      probes: [],
      units: [{ unit: UNIT, built: true, compared: true }],
    },
  };
}

/** A validated attempt on the unverified target: the claim-base run passes; the trusted-base run decides certification. */
function unverifiedAttempt(before: number, after: number, trusted: WorkerSteeringResult | null): WorkerRunnerValidation {
  return {
    status: "passed",
    reasons: [],
    target: { unit: UNIT, symbol: SYMBOL, before, after, improved: after > before, exact: after >= 100 },
    steering: gate("pass"),
    unverifiedTarget: { unit: UNIT, symbol: SYMBOL, trustedBaseRev: TRUSTED, baseline: trusted },
  };
}

function diff(line: string): string {
  return `diff --git a/${SOURCE} b/${SOURCE}\n--- a/${SOURCE}\n+++ b/${SOURCE}\n@@ -10 +10 @@\n-    old;\n+    ${line}\n`;
}

/** What worker-cycle does for one validated attempt: certify, record the checkpoint, commit the mark and ledger, decide the budget. */
function settleAttempt(store: Store, claim: Claim, runId: string, params: {
  attemptIndex: number;
  validation: WorkerRunnerValidation;
  diffText: string;
  unverified: UnverifiedMatchRecord | null;
  measuredBaselineScore: number;
  budget: "score" | "certified";
  laneOpen?: "unverified_match" | "steering_located" | null;
}) {
  const certification = workerAttemptCertification({
    store,
    validation: params.validation,
    gateEnforced: true,
    gameId: GAME,
    unit: UNIT,
    symbol: SYMBOL,
    claimBaseRev: CLAIM_BASE,
    unverified: params.unverified,
    measuredBaselineScore: params.measuredBaselineScore,
    diffText: params.diffText,
    laneOpen: params.laneOpen ?? (params.unverified ? "unverified_match" : null),
  });
  const checkpoint = recordWorkerCheckpoint(store, {
    authority: { host: "certification-test" },
    workerStateId: claim.workerStateId,
    runId,
    epochId: claim.epochId,
    epochTargetId: claim.epochTargetId,
    targetClaimId: claim.claimId,
    attemptIndex: params.attemptIndex,
    oldScore: params.validation.target?.before ?? null,
    newScore: params.validation.target?.after ?? null,
    exactMatch: Boolean(params.validation.target?.exact) && !certification?.restoration,
    hardGatesPassed: params.validation.status === "passed",
    validationStatus: params.validation.status,
    writeSet: [SOURCE],
    ...(certification?.improvement ? { certifiedImprovement: certification.improvement } : {}),
    metadata: {
      ...(certification ? { [CHECKPOINT_CERTIFICATION_KEY]: certification.metadata } : {}),
      ...(certification?.unverifiedCertification ? { unverified_match_certification: certification.unverifiedCertification } : {}),
    },
  });
  const committed = commitWorkerAttemptCertification({
    store,
    certification,
    checkpoint,
    gameId: GAME,
    unverified: params.unverified,
    measuredBaselineScore: params.measuredBaselineScore,
    laneOpen: params.laneOpen ?? (params.unverified ? "unverified_match" : null),
    grant: params.budget === "certified",
    runId,
    targetClaimId: claim.claimId,
  });
  const decision = workerContinuationDecision({
    attemptIndex: params.attemptIndex,
    checkpoints: workerCheckpointsForWorkerState(store, claim.workerStateId),
    repairReasons: [],
    dryRun: false,
    budgetExtension: params.budget,
    certifiedGrants: params.budget === "certified" ? certificationGrantCount(store, claim.claimId) : undefined,
    gateEnforced: true,
  });
  return { certification, checkpoint, committed, decision };
}

describe("certified budget and settlement (SMS, budgetExtension certified)", () => {
  test("unverified 100 -> certified 95 -> certified 96 is accepted, settles on 96 and grants twice", () => {
    withClaim(100, (store, claim, runId) => {
      const common = { unverified: UNVERIFIED, measuredBaselineScore: 100, budget: "certified" as const };
      const first = settleAttempt(store, claim, runId, { ...common, attemptIndex: 0, validation: unverifiedAttempt(100, 95, gate("pass")), diffText: diff("a = 1;") });
      expect(first.certification?.metadata).toMatchObject({ kind: "gate_pass", progress: "first_certificate", revision: TRUSTED, score: 95 });
      expect(first.checkpoint.selectable).toBe(true);
      expect(first.committed).toMatchObject({ progress: "first_certificate", granted: true });
      expect(first.decision.improvementGrants).toBe(1);

      const second = settleAttempt(store, claim, runId, { ...common, attemptIndex: 1, validation: unverifiedAttempt(100, 96, gate("pass")), diffText: diff("a = 2;") });
      // Selection: nothing has landed yet, so it is still the target's first certificate; the budget judges against the stored mark.
      expect(second.certification?.metadata).toMatchObject({ progress: "first_certificate", high_water_before: null });
      expect(second.committed).toMatchObject({ progress: "raised_high_water", highWaterBefore: 95, granted: true });
      expect(second.decision.improvementGrants).toBe(2);
      expect(second.decision.attemptBudget).toBe(9);

      expect(bestCheckpointForWorkerState(store, claim.workerStateId)?.id).toBe(second.checkpoint.id);
      expect(certifiedBaseline(store, { gameId: GAME, unit: UNIT, symbol: SYMBOL })).toMatchObject({ certifiedScore: 96, revision: TRUSTED, attemptId: second.checkpoint.id });
    });
  });

  test("the same certificate twice grants once; a lower certified score is accepted but never grants or moves the mark", () => {
    withClaim(100, (store, claim, runId) => {
      const common = { unverified: UNVERIFIED, measuredBaselineScore: 100, budget: "certified" as const, diffText: diff("a = 1;") };
      settleAttempt(store, claim, runId, { ...common, attemptIndex: 0, validation: unverifiedAttempt(100, 95, gate("pass")) });
      const again = settleAttempt(store, claim, runId, { ...common, attemptIndex: 1, validation: unverifiedAttempt(100, 95, gate("pass")) });
      expect(again.certification?.certificate?.certificateHash).toBeDefined();
      expect(again.committed).toMatchObject({ progress: null, granted: false });
      expect(again.decision.improvementGrants).toBe(1);
      const lower = settleAttempt(store, claim, runId, { ...common, attemptIndex: 2, validation: unverifiedAttempt(100, 94, gate("pass")), diffText: diff("a = 3;") });
      expect(lower.checkpoint.selectable).toBe(true);
      expect(lower.committed).toMatchObject({ granted: false });
      expect(lower.decision.improvementGrants).toBe(1);
      expect(certifiedBaseline(store, { gameId: GAME, unit: UNIT, symbol: SYMBOL })?.certifiedScore).toBe(95);
      // Settlement still takes the best certified checkpoint.
      expect(bestCheckpointForWorkerState(store, claim.workerStateId)?.newScore).toBe(95);
    });
  });

  test("an uncertified 100 never grants, is never selectable and never stops the worker as exact", () => {
    withClaim(100, (store, claim, runId) => {
      const unresolved = settleAttempt(store, claim, runId, {
        attemptIndex: 0,
        validation: { ...unverifiedAttempt(100, 100, gate("unresolved")), status: "steering_located" },
        diffText: diff("a = 1;"),
        unverified: UNVERIFIED,
        measuredBaselineScore: 100,
        budget: "certified",
      });
      expect(unresolved.certification).toBeNull();
      expect(unresolved.checkpoint.exactMatch).toBe(true);
      expect(unresolved.checkpoint.selectable).toBe(false);
      expect(unresolved.decision.improvementGrants).toBe(0);
      expect(unresolved.decision.stopReason).not.toBe("accepted_exact");
      expect(certificationGrantCount(store, claim.claimId)).toBe(0);
      expect(bestCheckpointForWorkerState(store, claim.workerStateId)).toBeNull();
    });
  });

  test("a certified checkpoint is selected over a higher uncertified one", () => {
    withClaim(80, (store, claim, runId) => {
      const unverified = { ...UNVERIFIED, match: { base: 70, candidate: 80, real_only: 75 } };
      const uncertified = settleAttempt(store, claim, runId, {
        attemptIndex: 0, validation: unverifiedAttempt(80, 90, gate("unresolved")), diffText: diff("a = 1;"), unverified, measuredBaselineScore: 80, budget: "certified",
      });
      expect(uncertified.certification).toBeNull();
      expect(uncertified.checkpoint.selectable).toBe(true);
      const certified = settleAttempt(store, claim, runId, {
        attemptIndex: 1, validation: unverifiedAttempt(80, 85, gate("pass")), diffText: diff("a = 2;"), unverified, measuredBaselineScore: 80, budget: "certified",
      });
      expect(certified.checkpoint.selectable).toBe(true);
      expect(bestCheckpointForWorkerState(store, claim.workerStateId)?.id).toBe(certified.checkpoint.id);
      // Only the certified attempt earned an extension; the uncertified score gain did not.
      expect(certified.decision.improvementGrants).toBe(1);
    });
  });

  test("restoration clears the unverified state at integration without exact credit, budget or a new high-water mark", () => {
    withClaim(100, (store, claim, runId) => {
      const proof: BaseIdentityProof = {
        trustedBaseRev: TRUSTED, claimBaseRev: CLAIM_BASE, sourcePath: SOURCE, inputs: [{ path: SOURCE, blob: "aaa1" }], dependenciesKnown: true, proofHash: "e".repeat(64),
      };
      const validation: WorkerRunnerValidation = {
        ...unverifiedAttempt(100, 100, gate("pass", [])),
        certificationLane: { reason: "unverified_match", scoreStatus: "no_official_score_change", scoreReasons: [], outcome: "restored", restoration: proof },
      };
      const restored = settleAttempt(store, claim, runId, { attemptIndex: 0, validation, diffText: diff("restore;"), unverified: UNVERIFIED, measuredBaselineScore: 100, budget: "certified" });
      expect(restored.certification?.metadata).toMatchObject({ kind: "restoration", progress: null });
      expect(restored.checkpoint.exactMatch).toBe(false);
      expect(restored.checkpoint.selectable).toBe(true);
      expect(restored.decision.stopReason).not.toBe("accepted_exact");
      expect(restored.decision.improvementGrants).toBe(0);
      expect(certifiedBaseline(store, { gameId: GAME, unit: UNIT, symbol: SYMBOL })).toBeNull();
      expect(listCertificationRestorations(store, { gameId: GAME, unit: UNIT, symbol: SYMBOL })).toEqual([
        expect.objectContaining({ trustedBaseRev: TRUSTED, proofHash: proof.proofHash }),
      ]);
      // Integration's clear reads the same proof shape it reads for a gate pass, bound to the trusted base.
      expect(checkpointUnverifiedCertification({ unverified_match_certification: restored.certification!.unverifiedCertification })).toMatchObject({
        base_rev: TRUSTED, claim_base_rev: CLAIM_BASE, decision: "pass",
      });
    });
  });
});

/**
 * Lands a checkpoint: an applied integration of it at `landed-<id>`, with the
 * landed-content proof the integration queue records, bound to the claim.
 */
function land(store: Store, claim: Claim, runId: string, checkpointId: string): void {
  const integratedRev = `landed-${checkpointId}`;
  store.db.query(`INSERT INTO integration_outcomes (id, run_id, epoch_id, epoch_target_id, target_claim_id, worker_state_id, worker_checkpoint_id,
      status, target_key, metadata_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'applied', ?, ?, 'then', 'then')`).run(
    `int-${checkpointId}`, runId, claim.epochId, claim.epochTargetId, claim.claimId, claim.workerStateId, checkpointId, `${UNIT}::${SYMBOL}`,
    JSON.stringify({
      integrated_rev: integratedRev, pre_apply_rev: "pre-apply",
      steering_content_freshness: { fresh: true, target_key: `${UNIT}::${SYMBOL}`, source_path: SOURCE, claim_base_rev: CLAIM_BASE, pre_apply_rev: "pre-apply", integrated_rev: integratedRev },
    }),
  );
}

describe("an un-landed certificate never blocks a later repair (selection vs budget)", () => {
  test("a certified 96 whose integration never landed leaves a later certified 95 repair selectable, without a second grant", () => {
    withClaim(100, (store, claim, runId) => {
      const common = { unverified: UNVERIFIED, measuredBaselineScore: 100, budget: "certified" as const };
      // An earlier claim certified 96; it was banked (stored mark) but its integration failed.
      settleAttempt(store, claim, runId, { ...common, attemptIndex: 0, validation: unverifiedAttempt(100, 96, gate("pass")), diffText: diff("a = 96;") });
      expect(certifiedBaseline(store, { gameId: GAME, unit: UNIT, symbol: SYMBOL })?.certifiedScore).toBe(96);
      const repair = settleAttempt(store, claim, runId, { ...common, attemptIndex: 1, validation: unverifiedAttempt(100, 95, gate("pass")), diffText: diff("a = 95;") });
      expect(repair.certification?.metadata).toMatchObject({ progress: "first_certificate", high_water_before: null });
      expect(repair.checkpoint.selectable).toBe(true);
      expect(repair.committed).toMatchObject({ progress: null, granted: false });
      expect(certificationGrantCount(store, claim.claimId)).toBe(1);
      expect(certifiedBaseline(store, { gameId: GAME, unit: UNIT, symbol: SYMBOL })?.certifiedScore).toBe(96);
    });
  });

  test("once the 96 landed, a later certified 95 is no progress and is not selectable", () => {
    withClaim(100, (store, claim, runId) => {
      const common = { unverified: UNVERIFIED, measuredBaselineScore: 100, budget: "certified" as const };
      const landed = settleAttempt(store, claim, runId, { ...common, attemptIndex: 0, validation: unverifiedAttempt(100, 96, gate("pass")), diffText: diff("a = 96;") });
      land(store, claim, runId, landed.checkpoint.id);
      const lower = settleAttempt(store, claim, runId, { ...common, attemptIndex: 1, validation: unverifiedAttempt(100, 95, gate("pass")), diffText: diff("a = 95;") });
      expect(lower.certification?.metadata).toMatchObject({ progress: null, high_water_before: 96 });
      expect(lower.checkpoint.selectable).toBe(false);
    });
  });
});

describe("a steering_located target's certified repair (lane open: steering_located)", () => {
  /** A rewrite of a target whose latest attempt located steering, accepted on the lane: the claim-base gate certified it. */
  function steeringRepair(before: number, after: number): WorkerRunnerValidation {
    return {
      status: "passed",
      reasons: [],
      target: { unit: UNIT, symbol: SYMBOL, before, after, improved: after > before, exact: after >= 100 },
      steering: gate("pass"),
      certificationLane: { reason: "steering_located", scoreStatus: "target_regressed", scoreReasons: [], outcome: "certified" },
    };
  }

  test("90 (uncertified) -> certified 88 is selectable and settles; it is the target's first certificate for the budget", () => {
    withClaim(90, (store, claim, runId) => {
      const repaired = settleAttempt(store, claim, runId, {
        attemptIndex: 0, validation: steeringRepair(90, 88), diffText: diff("real();"), unverified: null, measuredBaselineScore: 90, budget: "certified", laneOpen: "steering_located",
      });
      expect(repaired.certification?.metadata).toMatchObject({ kind: "gate_pass", lane: "steering_located", progress: "first_certificate", high_water_before: null, revision: "base" });
      expect(repaired.checkpoint.selectable).toBe(true);
      expect(bestCheckpointForWorkerState(store, claim.workerStateId)?.id).toBe(repaired.checkpoint.id);
      expect(repaired.committed).toMatchObject({ progress: "first_certificate", granted: true });
    });
  });

  test("a lane acceptance below the target's last landed certified score is not selectable; at it, it is (no grant)", () => {
    withClaim(90, (store, claim, runId) => {
      const common = { unverified: null, measuredBaselineScore: 90, budget: "certified" as const, laneOpen: "steering_located" as const };
      const first = settleAttempt(store, claim, runId, { ...common, attemptIndex: 0, validation: steeringRepair(90, 89), diffText: diff("a();") });
      land(store, claim, runId, first.checkpoint.id);
      const below = settleAttempt(store, claim, runId, { ...common, attemptIndex: 1, validation: steeringRepair(90, 88), diffText: diff("b();") });
      expect(below.certification?.metadata).toMatchObject({ progress: null, high_water_before: 89 });
      expect(below.checkpoint.selectable).toBe(false);
      const equal = settleAttempt(store, claim, runId, { ...common, attemptIndex: 2, validation: steeringRepair(90, 89), diffText: diff("c();") });
      expect(equal.checkpoint.selectable).toBe(true);
      expect(equal.committed).toMatchObject({ granted: false });
    });
  });

  test("the lane stays open through the claim: 99 -> certified 95, then a later certified 96 is still accepted and selected", () => {
    withClaim(99, (store, claim, runId) => {
      const laneParams = { store, gateEnforced: true, gameId: GAME, unit: UNIT, symbol: SYMBOL, sourcePath: SOURCE, claimBaseRev: "base", unverified: null, prove: async () => "unused" };
      recordSteeringObservation(store, { gameId: GAME, unit: UNIT, symbol: SYMBOL, verdict: "steering_located", mode: "enforce" });
      const opened = workerCertificationLane(laneParams);
      expect(opened).toMatchObject({ reason: "steering_located" });
      const common = { unverified: null, measuredBaselineScore: 99, budget: "certified" as const, laneOpen: "steering_located" as const };
      const first = settleAttempt(store, claim, runId, { ...common, attemptIndex: 0, validation: steeringRepair(99, 95), diffText: diff("e();") });
      expect(first.checkpoint.selectable).toBe(true);
      // The certified attempt leaves a `pass` observation: alone, it would close the lane.
      recordSteeringObservation(store, { gameId: GAME, unit: UNIT, symbol: SYMBOL, verdict: "pass", mode: "enforce" });
      expect(workerCertificationLane(laneParams)).toBeNull();
      expect(workerCertificationLane({ ...laneParams, openedEarlier: opened })).toBe(opened);
      const second = settleAttempt(store, claim, runId, { ...common, attemptIndex: 1, validation: steeringRepair(99, 96), diffText: diff("f();") });
      expect(second.checkpoint.selectable).toBe(true);
      expect(bestCheckpointForWorkerState(store, claim.workerStateId)?.id).toBe(second.checkpoint.id);
    });
  });

  test("without the lane, an ordinary target's measured baseline is trusted: a lower certified score is not selectable", () => {
    withClaim(90, (store, claim, runId) => {
      const ordinary = settleAttempt(store, claim, runId, {
        attemptIndex: 0, validation: { ...steeringRepair(90, 88), certificationLane: undefined }, diffText: diff("d();"),
        unverified: null, measuredBaselineScore: 90, budget: "certified", laneOpen: null,
      });
      expect(ordinary.certification?.metadata).toMatchObject({ progress: null, high_water_before: 90 });
      expect(ordinary.checkpoint.selectable).toBe(false);
    });
  });
});

describe("score budgeting (Melee) is unchanged", () => {
  test("each new best selectable score grants, and an exact checkpoint counts even when not selectable", () => {
    const checkpoints = [
      { attemptIndex: 0, exactMatch: false, hardGatesPassed: true, selectable: true, newScore: 80 },
      { attemptIndex: 1, exactMatch: false, hardGatesPassed: true, selectable: true, newScore: 80 },
      { attemptIndex: 2, exactMatch: false, hardGatesPassed: true, selectable: true, newScore: 85 },
      { attemptIndex: 3, exactMatch: true, hardGatesPassed: false, selectable: false, newScore: 100 },
    ];
    const melee = workerContinuationDecision({ attemptIndex: 3, checkpoints, repairReasons: [], dryRun: false });
    expect(melee.improvementGrants).toBe(3);
    expect(melee.attemptBudget).toBe(11);
    expect(workerContinuationDecision({ attemptIndex: 3, checkpoints, repairReasons: [], dryRun: false, budgetExtension: "score" })).toEqual(melee);
    // Under an enforced gate the unselectable exact checkpoint is no bypass.
    expect(workerContinuationDecision({ attemptIndex: 3, checkpoints, repairReasons: [], dryRun: false, gateEnforced: true }).improvementGrants).toBe(2);
    // The certified rule ignores score gains entirely.
    expect(workerContinuationDecision({ attemptIndex: 3, checkpoints, repairReasons: [], dryRun: false, budgetExtension: "certified", certifiedGrants: 0 }).improvementGrants).toBe(0);
  });

  test("the budget rule reads matching.budgetExtension defensively", () => {
    expect(budgetExtensionMode({ matching: { budgetExtension: "certified" } })).toBe("certified");
    expect(budgetExtensionMode({ matching: { steeringGate: "off" } })).toBe("score");
    expect(budgetExtensionMode({ matching: { budgetExtension: "points" } })).toBe("score");
    expect(budgetExtensionMode(null)).toBe("score");
  });
});

describe("certified progress and the lane", () => {
  test("first certificate needs a target with no certificate; an ordinary target's baseline is already trusted", () => {
    expect(certifiedProgress({ stored: null, implicitHighWater: null, score: 50 }).progress).toBe("first_certificate");
    expect(certifiedProgress({ stored: null, implicitHighWater: 80, score: 80 }).progress).toBeNull();
    expect(certifiedProgress({ stored: null, implicitHighWater: 80, score: 81 }).progress).toBe("raised_high_water");
    expect(certifiedProgress({ stored: { certifiedScore: 96 }, implicitHighWater: 80, score: 90 }).progress).toBeNull();
  });

  test("the lane opens only under enforce, for an unverified target or a target whose latest enforced verdict is steering_located", () => {
    withClaim(90, (store) => {
      const prove = async () => "unused";
      const base = { store, gameId: GAME, unit: UNIT, symbol: SYMBOL, sourcePath: SOURCE, claimBaseRev: CLAIM_BASE, prove };
      expect(workerCertificationLane({ ...base, gateEnforced: false, unverified: UNVERIFIED })).toBeNull();
      expect(workerCertificationLane({ ...base, gateEnforced: true, unverified: UNVERIFIED })).toMatchObject({
        reason: "unverified_match", restoration: { trustedBaseRev: TRUSTED, claimBaseRev: CLAIM_BASE, sourcePath: SOURCE },
      });
      expect(workerCertificationLane({ ...base, gateEnforced: true, unverified: null })).toBeNull();
      const observe = (verdict: string, mode: "shadow" | "enforce" = "enforce") =>
        recordSteeringObservation(store, { gameId: GAME, unit: UNIT, symbol: SYMBOL, verdict, mode });
      observe("steering_located", "shadow");
      expect(workerCertificationLane({ ...base, gateEnforced: true, unverified: null })).toBeNull();
      observe("steering_located");
      expect(workerCertificationLane({ ...base, gateEnforced: true, unverified: null })).toEqual({ reason: "steering_located", game: GAME });
      observe("pass");
      expect(workerCertificationLane({ ...base, gateEnforced: true, unverified: null })).toBeNull();
    });
  });
});

describe("gate units without the module prefix (SMS)", () => {
  /** How the gate and every steering row name the unit: the report's without `mario/`. */
  const GATE_UNIT = "M3DUtil/MActor";
  const gateIn = (unit: string, decision: "pass" | "unresolved" = "pass"): WorkerSteeringResult => {
    const result = gate(decision);
    return { ...result, decision: { ...result.decision!, functions: result.decision!.functions.map((fn) => ({ ...fn, unit })), units: [{ unit, built: true, compared: true }] } };
  };
  /** The unverified row as the store returns it (canonical), and the evidence the worker builds from it. */
  const unverified = { ...UNVERIFIED, unit: GATE_UNIT };
  const attempt = (gateUnit: string): WorkerRunnerValidation => ({
    ...unverifiedAttempt(100, 95, gateIn(gateUnit)),
    steering: gateIn(gateUnit),
    unverifiedTarget: { unit: GATE_UNIT, symbol: SYMBOL, trustedBaseRev: TRUSTED, baseline: gateIn(gateUnit) },
  });

  test("short gate rows certify the report-named target; the mark is stored canonical and found by either spelling", () => {
    withClaim(100, (store, claim, runId) => {
      const settled = settleAttempt(store, claim, runId, {
        attemptIndex: 0, validation: attempt(GATE_UNIT), diffText: diff("a = 1;"), unverified, measuredBaselineScore: 100, budget: "certified",
      });
      expect(settled.certification?.metadata).toMatchObject({ kind: "gate_pass", unit: UNIT, progress: "first_certificate", revision: TRUSTED });
      expect(settled.committed).toMatchObject({ progress: "first_certificate", granted: true });
      expect(store.db.query("SELECT unit FROM certified_baselines UNION SELECT unit FROM certification_grants").all()).toEqual([{ unit: GATE_UNIT }]);
      for (const unit of [UNIT, GATE_UNIT]) {
        expect(certifiedBaseline(store, { gameId: GAME, unit, symbol: SYMBOL })).toMatchObject({ unit: GATE_UNIT, certifiedScore: 95 });
      }
    });
  });

  test("a gate row of another unit with the same symbol never certifies the target", () => {
    withClaim(100, (store, claim, runId) => {
      const settled = settleAttempt(store, claim, runId, {
        attemptIndex: 0, validation: attempt("M3DUtil/MActorOther"), diffText: diff("a = 1;"), unverified, measuredBaselineScore: 100, budget: "certified",
      });
      expect(settled.certification).toBeNull();
      expect(certifiedBaseline(store, { gameId: GAME, unit: UNIT, symbol: SYMBOL })).toBeNull();
    });
  });

  test("Melee (no module prefixes): a short gate unit is another unit than the prefixed target", () => {
    withClaim(100, (store) => {
      const certify = (gameId: string) => workerAttemptCertification({
        store, validation: attempt(GATE_UNIT), gateEnforced: true, gameId, unit: UNIT, symbol: SYMBOL, claimBaseRev: CLAIM_BASE,
        unverified, measuredBaselineScore: 100, diffText: diff("a = 1;"), laneOpen: "unverified_match",
      });
      expect(certify("melee")).toBeNull();
      expect(certify(GAME)).not.toBeNull();
    });
  });
});
