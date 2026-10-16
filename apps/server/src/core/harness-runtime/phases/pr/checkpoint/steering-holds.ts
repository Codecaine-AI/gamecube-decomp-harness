import { existsSync, readFileSync } from "node:fs";
import type { StateStore } from "@server/core/orchestrator-state";
import {
  trustedBaselineCertifiesTarget,
  unverifiedTargetCertified,
  type UnverifiedTargetEvidence,
} from "@server/core/agent-catalog/agents/running/worker/steering-validation.js";
import {
  latestSteeringBackfill,
  latestSteeringRollback,
  listSteeringRollbacks,
  steeringCoverageFor,
  type SteeringRollbackRecord,
} from "@server/core/harness-runtime/run-state/steering.js";
import { activeUnverifiedMatch, listUnverifiedMatches, unverifiedMatchKey } from "@server/core/harness-runtime/run-state/unverified-matches.js";
import { steeringGateActive } from "@server/core/tools/steering-gate.js";
import type { WorkerSteeringResult } from "@server/core/validation/steering/steering-check.js";

/**
 * Why a function's 100% may not ship in a PR on a steering-gated game,
 * whatever its historical checkpoint flags (selectable, exact, confirmed) say:
 *
 * - `unverified_match`: an active row in `steering_unverified_matches`. Only a
 *   certified pass clears the row, so an active row always holds.
 * - `steering_rollback`: a `steering-gate --apply` rewrote the function after
 *   (or instead of) the code the checkpoint holds. For a checkpoint it stops
 *   holding only when the checkpoint was validated after the rollback last
 *   moved and its own enforced gate result certifies the function as a whole
 *   (`trustedBaselineCertifiesTarget`: no rejection, own rows complete `pass`
 *   touched by an edit, own unit built and compared), or its typed
 *   `unverifiedTarget` evidence certifies it. For a branch it stops holding
 *   only at a certifying rev that is an ancestor of the published head:
 *   either a backfill `pass` recorded after the rollback in a clean certified
 *   unit coverage at the same analysed rev, or the `integrated_rev` of a clean
 *   applied (not reverted, not regressed) integration of a checkpoint of this
 *   function validated after the rollback whose own gate result certifies it
 *   as above and whose `steering_content_freshness` proof binds that landing
 *   (target, source path, claim base, pre-apply and integrated revs). Stored flags (`status = reverified`, a certification key, an
 *   observation, a shadow run, an unintegrated or older checkpoint) never
 *   clear it.
 *
 * Games without an active gate (Melee) have no holds and nothing is read.
 */
export type SteeringPrHoldReason = "unverified_match" | "steering_rollback";

export interface SteeringPrHold {
  reason: SteeringPrHoldReason;
  unit: string;
  symbol: string;
  detail: string;
  /** `steering_rollbacks.id` for a rollback hold. */
  rollbackId?: number;
  rollbackStatus?: string;
}

/** The checkpoint evidence a rollback hold is judged against. */
export interface SteeringHoldCheckpoint {
  validationTime: string;
  /** The checkpoint's runner validation (artifact or metadata copy): `steering` and `unverifiedTarget` are re-derived, never trusted as flags. */
  runnerValidation: Record<string, unknown>;
}

export interface SteeringPrHolds {
  active: boolean;
  /** The hold on one function's checkpoint, or null when it may ship. */
  holdFor(unit: string, symbol: string, checkpoint: SteeringHoldCheckpoint | null): SteeringPrHold | null;
}

const NO_HOLDS: SteeringPrHolds = { active: false, holdFor: () => null };

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function jsonObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "string") return asObject(value);
  try {
    return asObject(JSON.parse(value));
  } catch {
    return {};
  }
}

/**
 * A checkpoint's own runner validation: its artifact (when it carries a
 * status), else the copy in its metadata. Never another attempt's result.
 */
export function checkpointOwnRunnerValidation(artifactPath: string | null | undefined, metadata: Record<string, unknown>): Record<string, unknown> {
  if (artifactPath && existsSync(artifactPath)) {
    const artifact = jsonObject(readFileSync(artifactPath, "utf8"));
    if (typeof artifact.status === "string" && artifact.status) return artifact;
  }
  return asObject(metadata.runner_validation);
}

function timeMs(value: string | null | undefined): number {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : NaN;
}

function after(later: string | null | undefined, earlier: string | null | undefined): boolean {
  const left = timeMs(later);
  const right = timeMs(earlier);
  return Number.isFinite(left) && Number.isFinite(right) && left > right;
}

/** The checkpoint's own enforced gate certifies (unit, symbol), re-derived from its typed gate results. */
export function checkpointGateCertifies(checkpoint: SteeringHoldCheckpoint, unit: string, symbol: string): boolean {
  const steering = checkpoint.runnerValidation.steering as WorkerSteeringResult | undefined;
  const target = { unit, symbol };
  if (trustedBaselineCertifiesTarget(steering, target)) return true;
  const evidence = checkpoint.runnerValidation.unverifiedTarget as UnverifiedTargetEvidence | undefined;
  return Boolean(evidence) && unverifiedTargetCertified(steering, evidence, target);
}

function rollbackHold(rollback: SteeringRollbackRecord, detail: string): SteeringPrHold {
  return {
    reason: "steering_rollback",
    unit: rollback.unit,
    symbol: rollback.symbol,
    rollbackId: rollback.id,
    rollbackStatus: String(rollback.status),
    detail: `steering rollback #${rollback.id} (${rollback.rules.join(", ") || "steering"}, ${rollback.status}) at ${rollback.recordedAt}; ${detail}`,
  };
}

function unverifiedHold(unit: string, symbol: string, recordedAt: string, reasons: string[]): SteeringPrHold {
  return {
    reason: "unverified_match",
    unit,
    symbol,
    detail: `unverified_match recorded at ${recordedAt} (${reasons.join("; ") || "unresolved"}); only an enforced pass against the trusted base clears it`,
  };
}

/** The steering holds for checkpoint items of one game; inert unless its gate is shadow or enforce. */
export function steeringPrHolds(store: StateStore, game: { gameId?: string | null; steeringGate?: string | null }): SteeringPrHolds {
  const gameId = game.gameId ?? "";
  if (!gameId || !steeringGateActive(game.steeringGate)) return NO_HOLDS;
  return {
    active: true,
    holdFor(unit, symbol, checkpoint) {
      if (!unit || !symbol) return null;
      const unverified = activeUnverifiedMatch(store, { gameId, unit, symbol });
      if (unverified) return unverifiedHold(unit, symbol, unverified.recordedAt, unverified.reasons);
      const rollback = latestSteeringRollback(store, { gameId, unit, symbol });
      if (!rollback) return null;
      if (checkpoint && after(checkpoint.validationTime, rollback.updatedAt) && checkpointGateCertifies(checkpoint, unit, symbol)) return null;
      return rollbackHold(rollback, "no enforced gate certificate of this checkpoint, validated after it, covers the function");
    },
  };
}

/**
 * The backfill rev that certifies a rolled-back function for a branch, or
 * null: its latest backfill row is `pass`, recorded after the rollback last
 * moved, and its unit's coverage at the same rev is clean (the whole unit
 * certified, nothing applied or provisional).
 */
function rollbackClearanceRev(store: StateStore, gameId: string, rollback: SteeringRollbackRecord): string | null {
  const backfill = latestSteeringBackfill(store, { gameId, unit: rollback.unit, symbol: rollback.symbol });
  if (!backfill || backfill.verdict !== "pass" || backfill.applied || !after(backfill.recordedAt, rollback.updatedAt)) return null;
  const coverage = steeringCoverageFor(store, gameId, rollback.unit);
  if (!coverage?.clean || coverage.analyzedRev !== backfill.analyzedRev) return null;
  return backfill.analyzedRev;
}

/**
 * Integration metadata key for the landed-content proof: the target's whole
 * own source at `integrated_rev` is the version the immutable claim base was
 * gated against (written by the worker integration around the clean apply).
 */
export const STEERING_CONTENT_FRESHNESS_KEY = "steering_content_freshness";

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}

/**
 * The integration's landed-content proof binds this exact landing: `fresh`
 * is literally true, and its target, source path, claim base, pre-apply rev
 * and integrated rev equal the integration's own records. Legacy rows
 * without the proof, `fresh: false`, or any mismatch fail closed.
 */
function landedContentBound(
  integration: Record<string, unknown>,
  expected: { targetKey: string; sourcePath: string; claimBaseRev: string; integratedRev: string },
): boolean {
  const proof = asObject(integration[STEERING_CONTENT_FRESHNESS_KEY]);
  if (proof.fresh !== true) return false;
  const preApplyRev = integration.pre_apply_rev;
  return nonEmpty(expected.sourcePath) && nonEmpty(expected.claimBaseRev) && nonEmpty(preApplyRev)
    && proof.target_key === expected.targetKey
    && proof.source_path === expected.sourcePath
    && proof.claim_base_rev === expected.claimBaseRev
    && proof.pre_apply_rev === preApplyRev
    && proof.integrated_rev === expected.integratedRev;
}

/**
 * `integrated_rev` of every durable clean integration of a checkpoint of the
 * rolled-back function validated after the rollback last moved, whose own
 * gate result certifies the function and whose landed-content proof binds
 * that landing (`landedContentBound`). A rejected (reverted by the
 * confirmation pass) or regressed integration, one without a recorded
 * integrated rev, or one without a bound proof never counts.
 */
function rollbackIntegrationRevs(store: StateStore, gameId: string, rollback: SteeringRollbackRecord): string[] {
  const exists = store.db.query("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'integration_outcomes'").get();
  if (!exists) return [];
  const rows = store.db
    .query(
      `SELECT integration_outcomes.metadata_json AS integration_metadata,
              worker_checkpoints.validation_time, worker_checkpoints.artifact_path,
              worker_checkpoints.metadata_json AS checkpoint_metadata,
              target_claims.base_rev AS claim_base_rev, epoch_targets.source_path
         FROM integration_outcomes
         JOIN worker_checkpoints ON worker_checkpoints.id = integration_outcomes.worker_checkpoint_id
         JOIN target_claims ON target_claims.id = worker_checkpoints.target_claim_id
         JOIN epoch_targets ON epoch_targets.id = worker_checkpoints.epoch_target_id
         JOIN runs ON runs.id = integration_outcomes.run_id
        WHERE runs.game_id = ?
          AND integration_outcomes.target_key = ?
          AND integration_outcomes.status = 'applied'
          AND worker_checkpoints.validation_state != 'regressed'`,
    )
    .all(gameId, unverifiedMatchKey(rollback.unit, rollback.symbol)) as Record<string, unknown>[];
  const targetKey = unverifiedMatchKey(rollback.unit, rollback.symbol);
  const revs: string[] = [];
  for (const row of rows) {
    const integration = jsonObject(row.integration_metadata);
    const rev = typeof integration.integrated_rev === "string" ? integration.integrated_rev : "";
    if (!rev || asObject(integration.confirmation).validation_state === "regressed") continue;
    if (!landedContentBound(integration, {
      targetKey,
      sourcePath: row.source_path == null ? "" : String(row.source_path),
      claimBaseRev: row.claim_base_rev == null ? "" : String(row.claim_base_rev),
      integratedRev: rev,
    })) continue;
    const checkpoint: SteeringHoldCheckpoint = {
      validationTime: String(row.validation_time ?? ""),
      runnerValidation: checkpointOwnRunnerValidation(row.artifact_path == null ? null : String(row.artifact_path), jsonObject(row.checkpoint_metadata)),
    };
    if (after(checkpoint.validationTime, rollback.updatedAt) && checkpointGateCertifies(checkpoint, rollback.unit, rollback.symbol)) revs.push(rev);
  }
  return revs;
}

/** A function's latest rollback with every rev that would certify it (empty: none recorded). */
export interface SteeringRollbackCertification {
  key: string;
  rollback: SteeringRollbackRecord;
  /** Certifying revs: a clean certified backfill pass, or durable certified worker integrations. */
  revs: string[];
}

/**
 * The branch hold ledger, read once: every active `unverified_match` hold,
 * and for each function without one its latest rollback with the revs that
 * would certify it. A rollback holds a revision unless one of its revs is an
 * ancestor of that revision. Undefined without an active gate.
 */
export function steeringHoldLedger(
  store: StateStore,
  game: { gameId?: string | null; steeringGate?: string | null },
): { unverified: SteeringPrHold[]; rollbacks: SteeringRollbackCertification[] } | undefined {
  const gameId = game.gameId ?? "";
  if (!gameId || !steeringGateActive(game.steeringGate)) return undefined;
  const unverified = listUnverifiedMatches(store, gameId).map((row) => unverifiedHold(row.unit, row.symbol, row.recordedAt, row.reasons));
  const held = new Set(unverified.map((hold) => unverifiedMatchKey(hold.unit, hold.symbol)));
  const latest = new Map<string, SteeringRollbackRecord>();
  for (const rollback of listSteeringRollbacks(store, gameId)) latest.set(unverifiedMatchKey(rollback.unit, rollback.symbol), rollback);
  const rollbacks: SteeringRollbackCertification[] = [];
  for (const [key, rollback] of latest) {
    if (held.has(key)) continue;
    const backfillRev = rollbackClearanceRev(store, gameId, rollback);
    rollbacks.push({ key, rollback, revs: [...new Set([...(backfillRev ? [backfillRev] : []), ...rollbackIntegrationRevs(store, gameId, rollback)])] });
  }
  return { unverified, rollbacks };
}

/**
 * The functions a branch publication may not present as matches: every
 * active `unverified_match`, and every function whose latest rollback has no
 * certifying rev after it (a certified backfill pass, or a durable certified
 * worker integration) that `isAncestor` accepts (an ancestor of the
 * published head). Without `isAncestor` no rollback clears. Empty without an
 * active gate.
 */
export async function branchSteeringHolds(
  store: StateStore,
  game: { gameId?: string | null; steeringGate?: string | null },
  isAncestor?: (rev: string) => Promise<boolean>,
): Promise<SteeringPrHold[]> {
  const ledger = steeringHoldLedger(store, game);
  if (!ledger) return [];
  const holds = new Map<string, SteeringPrHold>();
  for (const hold of ledger.unverified) holds.set(unverifiedMatchKey(hold.unit, hold.symbol), hold);
  for (const { key, rollback, revs } of ledger.rollbacks) {
    let cleared = false;
    for (const rev of revs) {
      if (isAncestor && await isAncestor(rev).catch(() => false)) {
        cleared = true;
        break;
      }
    }
    if (cleared) continue;
    holds.set(key, rollbackHold(rollback, revs.length > 0
      ? `no certifying rev (${revs.join(", ")}) is an ancestor of the published head`
      : "no certified backfill pass or certified worker integration was recorded after it"));
  }
  return [...holds.values()].sort((left, right) => unverifiedMatchKey(left.unit, left.symbol).localeCompare(unverifiedMatchKey(right.unit, right.symbol)));
}
