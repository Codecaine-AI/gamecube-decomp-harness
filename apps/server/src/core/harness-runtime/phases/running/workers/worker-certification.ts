import type { StateStore } from "@server/core/orchestrator-state";
import {
  attemptCertifiesTarget,
  type BaseIdentityProver,
  type CertificationLaneOptions,
} from "@server/core/agent-catalog/agents/running/worker/certification-lane.js";
import type { WorkerRunnerValidation } from "@server/core/agent-catalog/agents/running/worker/runner-validation.js";
import {
  certificateHash,
  commitCertifiedProgress,
  gatePassCertification,
  latestEnforcedSteeringVerdict,
  recordCertificationRestoration,
  type AttemptCertificate,
  type BaseIdentityProof,
  type CheckpointCertification,
  type CommitCertifiedProgressResult,
} from "@server/core/harness-runtime/run-state/certification.js";
import type { UnverifiedMatchRecord } from "@server/core/harness-runtime/run-state/unverified-matches.js";
import type { WorkerCheckpointInput, WorkerCheckpointRecord } from "@server/core/harness-runtime/run-state/worker-state.js";
import type { UnverifiedMatchCertification } from "@server/core/validation/steering/unverified-certification.js";

/**
 * Worker-cycle side of the certification lane (plan §3.1): which attempts
 * open the lane, what a certified (or restored) attempt writes on its
 * checkpoint, and the high-water mark and budget ledger after it.
 */

/**
 * The lane for the next attempt, enforced gate only: an `unverified_match`
 * target (with the trusted base for a restoration proof), or a target whose
 * newest enforced observation is `steering_located` (an earlier attempt, in
 * this claim or before). Null otherwise (Melee, shadow, ordinary targets).
 *
 * Once open, the lane stays open for the rest of the claim (`openedEarlier`):
 * a certified repair records a `pass` observation, which must not close the
 * lane and send the next repair back to the uncertified claim-base score.
 */
export function workerCertificationLane(params: {
  store: StateStore;
  gateEnforced: boolean;
  gameId: string;
  unit: string;
  symbol: string;
  sourcePath: string;
  claimBaseRev: string | null;
  unverified: UnverifiedMatchRecord | null;
  prove: BaseIdentityProver;
  /** The lane an earlier attempt of this claim opened, if any. */
  openedEarlier?: CertificationLaneOptions | null;
}): CertificationLaneOptions | null {
  if (!params.gateEnforced || !params.gameId || !params.unit || !params.symbol) return null;
  if (params.openedEarlier) return params.openedEarlier;
  if (params.unverified) {
    return {
      reason: "unverified_match",
      game: params.gameId,
      restoration: {
        trustedBaseRev: params.unverified.baseRev,
        claimBaseRev: params.claimBaseRev,
        sourcePath: params.unverified.sourcePath || params.sourcePath,
        prove: params.prove,
      },
    };
  }
  const verdict = latestEnforcedSteeringVerdict(params.store, { gameId: params.gameId, unit: params.unit, symbol: params.symbol });
  return verdict === "steering_located" ? { reason: "steering_located", game: params.gameId } : null;
}

/**
 * The claim base's score as an implicit certified baseline: an ordinary
 * target's integrated code is trusted; with the lane open (an unverified
 * target, or one whose latest attempt located steering) it is not, and only
 * landed certificates count.
 */
function trustedBaseline(params: { unverified: UnverifiedMatchRecord | null; laneOpen?: CertificationLaneOptions["reason"] | null; measuredBaselineScore: number | null }): number | null {
  return params.unverified || params.laneOpen ? null : params.measuredBaselineScore;
}

/** Restoration evidence on the integration's unverified-match proof (`worker_checkpoints.metadata_json`). */
export type RestorationCertification = UnverifiedMatchCertification & { proof: "base_identity"; proof_hash: string };

export interface WorkerAttemptCertification {
  /** `metadata_json.certification`. */
  metadata: CheckpointCertification;
  /** What the gate certified (gate pass only). */
  certificate: AttemptCertificate | null;
  /** The base-identity proof (restoration only). */
  restoration: BaseIdentityProof | null;
  /** `recordWorkerCheckpoint`'s lane improvement: progress or a restoration makes a hard-gate-clean checkpoint selectable. */
  improvement: NonNullable<WorkerCheckpointInput["certifiedImprovement"]> | null;
  /** Restoration only: the proof integration clears the unverified row on (`UNVERIFIED_MATCH_CERTIFICATION_KEY`). */
  unverifiedCertification: RestorationCertification | null;
}

/**
 * The certification of one validated attempt, or null when the enforced gate
 * certified nothing for the target:
 *
 * - a gate pass for the target (`attemptCertifiesTarget`), bound to the
 *   revision it was measured against (the trusted base for an unverified
 *   target, else the claim base) and the hash of the certified edits, with its
 *   progress against the high-water mark (an ordinary target's measured
 *   baseline is already trusted code, an unverified target's is not);
 * - a lane restoration (`certificationLane.outcome === "restored"`): never
 *   progress, never exact.
 */
export function workerAttemptCertification(params: {
  store: StateStore;
  validation: Pick<WorkerRunnerValidation, "status" | "steering" | "unverifiedTarget" | "certificationLane" | "target">;
  gateEnforced: boolean;
  gameId: string;
  unit: string;
  symbol: string;
  claimBaseRev: string | null;
  unverified: UnverifiedMatchRecord | null;
  measuredBaselineScore: number | null;
  diffText: string;
  /**
   * Why the certification lane was open for this attempt (`workerCertificationLane`),
   * or null. With the lane open the claim base's score is not a baseline (it
   * is unverified, or the target's latest attempt located steering): only the
   * target's last landed certified score is.
   */
  laneOpen?: CertificationLaneOptions["reason"] | null;
}): WorkerAttemptCertification | null {
  const { validation, unit, symbol } = params;
  if (!params.gateEnforced || !params.gameId || !unit || !symbol || validation.status !== "passed") return null;
  const target = { gameId: params.gameId, unit, symbol };
  const score = validation.target?.after ?? null;
  const lane = validation.certificationLane;
  if (lane?.outcome === "restored" && lane.restoration && params.unverified) {
    const proof = lane.restoration;
    return {
      metadata: {
        certified: true,
        kind: "restoration",
        unit,
        symbol,
        score,
        certificate_hash: proof.proofHash,
        revision: proof.trustedBaseRev,
        progress: null,
        high_water_before: null,
        lane: lane.reason,
      },
      certificate: null,
      restoration: proof,
      improvement: { kind: "restoration", unit, symbol },
      unverifiedCertification: {
        kind: "unverified_match",
        game_id: params.gameId,
        unit,
        symbol,
        mode: "enforce",
        decision: "pass",
        base_rev: proof.trustedBaseRev,
        artifact_path: null,
        claim_base_rev: params.claimBaseRev,
        claim_artifact_path: validation.steering?.artifactPath ?? null,
        proof: "base_identity",
        proof_hash: proof.proofHash,
      },
    };
  }
  if (!attemptCertifiesTarget(validation, { unit, symbol, game: params.gameId }, { unverified: params.unverified !== null })) return null;
  const revision = params.unverified ? validation.unverifiedTarget?.trustedBaseRev ?? null : params.claimBaseRev;
  if (!revision) return null;
  const certificate: AttemptCertificate = { score, revision, certificateHash: certificateHash({ unit, symbol, revision, diffText: params.diffText }) };
  const judged = gatePassCertification(params.store, target, certificate, trustedBaseline(params));
  const laneAccepted = lane?.outcome === "certified";
  const metadata: CheckpointCertification = laneAccepted ? { ...judged, lane: lane.reason } : judged;
  // Selection: progress, or a lane acceptance that does not fall below the
  // target's last landed certified score (`high_water_before` here, the claim
  // base not being a baseline). Budget eligibility is decided apart, when committed.
  const holdsLanded = laneAccepted && score !== null
    && (metadata.high_water_before === null || score + 1e-9 >= metadata.high_water_before);
  return {
    metadata,
    certificate,
    restoration: null,
    improvement: metadata.progress || holdsLanded ? { kind: "certified_progress", unit, symbol } : null,
    unverifiedCertification: null,
  };
}

/**
 * After the checkpoint is recorded: a selectable gate pass moves the
 * high-water mark when it is still progress, and in a `certified` game
 * records its budget grant (deduplicated by certificate hash and revision);
 * a selectable restoration is recorded. Nothing for anything else.
 */
export function commitWorkerAttemptCertification(params: {
  store: StateStore;
  certification: WorkerAttemptCertification | null;
  checkpoint: Pick<WorkerCheckpointRecord, "id" | "attemptIndex" | "selectable" | "hardGatesPassed">;
  gameId: string;
  unverified: UnverifiedMatchRecord | null;
  measuredBaselineScore: number | null;
  /** As `workerAttemptCertification`: with the lane open the claim base's score is no budget baseline either. */
  laneOpen?: CertificationLaneOptions["reason"] | null;
  grant: boolean;
  runId: string;
  targetClaimId: string;
}): CommitCertifiedProgressResult | null {
  const { certification, checkpoint } = params;
  if (!certification || !checkpoint.selectable || !checkpoint.hardGatesPassed) return null;
  const target = { gameId: params.gameId, unit: certification.metadata.unit, symbol: certification.metadata.symbol };
  const attempt = { runId: params.runId, targetClaimId: params.targetClaimId, attemptId: checkpoint.id, attemptIndex: checkpoint.attemptIndex };
  if (certification.restoration) {
    recordCertificationRestoration(params.store, { ...target, ...attempt, proof: certification.restoration });
    return null;
  }
  if (!certification.certificate) return null;
  return commitCertifiedProgress(params.store, {
    ...target,
    ...certification.certificate,
    ...attempt,
    implicitHighWater: trustedBaseline(params),
    grant: params.grant,
  });
}
