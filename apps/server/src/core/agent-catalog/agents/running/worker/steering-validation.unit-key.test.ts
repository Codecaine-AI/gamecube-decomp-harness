import { describe, expect, test } from "bun:test";
import type { SteeringEvidenceReview, SteeringFunctionDecision, WorkerSteeringResult } from "@server/core/validation/steering/steering-check.js";
import { attemptCertifiesTarget, resolveCertificationLane } from "./certification-lane.js";
import type { WorkerRunnerValidation } from "./runner-validation.js";
import {
  evidenceReviewRequestInputs,
  steeringObservationRows,
  trustedBaselineCertifiesTarget,
  unverifiedMatchCertification,
  unverifiedTargetCertified,
  unverifiedTargetRejected,
  UNVERIFIED_MATCH_REASON_PREFIX,
} from "./steering-validation.js";

/** The worker's target names the unit as the report does; the gate (and every steering row) without `mario/`. */
const REPORT_UNIT = "mario/Animal/AnimalBase";
const GATE_UNIT = "Animal/AnimalBase";
const SYMBOL = "moveRequest__11TAnimalBaseFv";

function fn(unit: string, decision: SteeringFunctionDecision["decision"] = "pass"): SteeringFunctionDecision {
  return {
    unit, name: SYMBOL, decision, semantic: decision === "pass" ? "clean" : "steering", analysis: "complete",
    audit_label: decision === "pass" ? "real" : "steering", match: { base: 90, candidate: 100, real_only: 100 }, groups: ["g1"],
  };
}

function gate(unit: string, decision: SteeringFunctionDecision["decision"] = "pass", reviews: SteeringEvidenceReview[] = []): WorkerSteeringResult {
  return {
    mode: "enforce", error: null, artifactPath: "/tmp/attempt-0.steering.json", durationMs: 5,
    decision: {
      attempt: decision, reasons: [], functions: [fn(unit, decision)], removable_noncosmetic: [], probes: [],
      units: [{ unit, built: true, compared: true }], evidence_reviews: reviews,
    },
  };
}

function validation(gateUnit: string): Pick<WorkerRunnerValidation, "status" | "steering" | "unverifiedTarget"> {
  return {
    status: "passed",
    steering: gate(gateUnit),
    // The evidence carries the unit of the store's (canonical) unverified row.
    unverifiedTarget: { unit: GATE_UNIT, symbol: SYMBOL, trustedBaseRev: "trusted", baseline: gate(gateUnit) },
  };
}

describe("worker steering certification across unit spellings", () => {
  test("SMS: short gate rows certify the report-named target; another unit never does", () => {
    const target = { unit: REPORT_UNIT, symbol: SYMBOL, game: "sms" };
    expect(trustedBaselineCertifiesTarget(gate(GATE_UNIT), target)).toBe(true);
    expect(unverifiedTargetCertified(gate(GATE_UNIT), validation(GATE_UNIT).unverifiedTarget, target)).toBe(true);
    expect(attemptCertifiesTarget(validation(GATE_UNIT), target, { unverified: true })).toBe(true);
    expect(attemptCertifiesTarget(validation(GATE_UNIT), target, { unverified: false })).toBe(true);
    expect(unverifiedMatchCertification({ validation: validation(GATE_UNIT), gameId: "sms", unit: REPORT_UNIT, symbol: SYMBOL, baseRev: "claim" }))
      .toMatchObject({ unit: REPORT_UNIT, base_rev: "trusted", claim_base_rev: "claim" });

    const other = "Animal/AnimalOther";
    expect(trustedBaselineCertifiesTarget(gate(other), target)).toBe(false);
    expect(attemptCertifiesTarget(validation(other), target, { unverified: true })).toBe(false);
    expect(unverifiedMatchCertification({ validation: validation(other), gameId: "sms", unit: REPORT_UNIT, symbol: SYMBOL, baseRev: "claim" })).toBeNull();
  });

  test("Melee (or no game): units compare as written", () => {
    expect(trustedBaselineCertifiesTarget(gate(GATE_UNIT), { unit: REPORT_UNIT, symbol: SYMBOL })).toBe(false);
    expect(trustedBaselineCertifiesTarget(gate(GATE_UNIT), { unit: REPORT_UNIT, symbol: SYMBOL, game: "melee" })).toBe(false);
    expect(trustedBaselineCertifiesTarget(gate(REPORT_UNIT), { unit: REPORT_UNIT, symbol: SYMBOL, game: "melee" })).toBe(true);
    expect(unverifiedMatchCertification({ validation: validation(GATE_UNIT), gameId: "melee", unit: REPORT_UNIT, symbol: SYMBOL, baseRev: "claim" })).toBeNull();
  });

  test("the certification lane certifies with the lane's game when the target carries none", async () => {
    const pending = { ...validation(GATE_UNIT), reasons: [], certificationLane: { reason: "steering_located" as const, scoreStatus: "no_official_score_change" as const, scoreReasons: [], outcome: "pending" as const } } as WorkerRunnerValidation;
    const target = { unit: REPORT_UNIT, symbol: SYMBOL };
    const withGame = await resolveCertificationLane(pending, { lane: { reason: "steering_located", game: "sms" }, target, changedPaths: [] });
    expect(withGame.certificationLane?.outcome).toBe("certified");
    const without = await resolveCertificationLane(pending, { lane: { reason: "steering_located" }, target, changedPaths: [] });
    expect(without.certificationLane?.outcome).toBe("rejected");
  });

  test("an unverified rejection is judged with the game", () => {
    const rejected = {
      status: "steering_located" as const,
      reasons: [`${UNVERIFIED_MATCH_REASON_PREFIX} not certified`],
      steering: gate(GATE_UNIT, "steering_located"),
      unverifiedTarget: { unit: REPORT_UNIT, symbol: SYMBOL, trustedBaseRev: "trusted", baseline: gate(GATE_UNIT, "steering_located") },
    };
    expect(unverifiedTargetRejected(rejected, "sms")).toBe(true);
  });

  test("observation rows and evidence reviews recognise the target's own short-unit rows", () => {
    const own = steeringObservationRows({ result: gate(GATE_UNIT, "steering_located"), gameId: "sms", unit: REPORT_UNIT, symbol: SYMBOL, sourceSha: "sha" });
    expect(own.map((row) => [row.unit, row.functionSourceSha])).toEqual([[GATE_UNIT, "sha"]]);
    const melee = steeringObservationRows({ result: gate(GATE_UNIT, "steering_located"), gameId: "melee", unit: REPORT_UNIT, symbol: SYMBOL, sourceSha: "sha" });
    expect(melee.map((row) => row.functionSourceSha)).toEqual([null]);

    const review: SteeringEvidenceReview = {
      group: "g1", game: "sms", base_rev: "claim", units: [GATE_UNIT], targets: [], functions: [], site_file: "src/Animal/AnimalBase.cpp",
      site_lines: [10, 12], group_digest: "d1", callee: "inline", symbol: "inline__Fv", provenance: null, patch: null, edit_ids: [], shapes: [], real_shapes: [], reason: null,
    };
    const inputs = evidenceReviewRequestInputs({
      result: gate(GATE_UNIT, "steering_located", [review]), gameId: "sms", unit: REPORT_UNIT, symbol: SYMBOL, baseRev: "claim",
      unverifiedBases: { claimBaseRev: "claim", trustedBaseRev: "trusted" },
    });
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toMatchObject({ symbol: SYMBOL, claimBaseRev: "claim", trustedBaseRev: "trusted" });
    expect(evidenceReviewRequestInputs({ result: gate(GATE_UNIT, "steering_located", [review]), gameId: "melee", unit: REPORT_UNIT, symbol: SYMBOL, baseRev: "claim" }))
      .toEqual([]);
  });
});
