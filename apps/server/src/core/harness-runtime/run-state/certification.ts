import { createHash } from "node:crypto";
import { immediateTransaction, now, type StateStore } from "@server/core/orchestrator-state";
import { canonicalTargetKey, canonicalUnit, sqlPlaceholders, targetKey as canonicalKey, unitVariants } from "./unit-key.js";

/**
 * Certification lane state (migration 016, plan §3.1, decision D1): the
 * certified high-water mark per target, the budget grant ledger, and
 * restoration proofs. Like the other steering state, every reader tolerates
 * a store behind the migration (null/zero) and every writer is a no-op there.
 * Like every steering row, the tables store the canonical unit (no module
 * prefix, `canonicalUnit`) and match a target named either way, so a worker's
 * report-named target (`mario/...`) and the gate's unit share one mark. The
 * checkpoint metadata keeps the target's unit as the worker named it; its
 * readers compare with `sameUnit`.
 *
 * Budget rule for `matching.budgetExtension: "certified"` (SMS): an attempt
 * earns +2 only when the gate certifies it and it either raises the target's
 * certified high-water mark or is the first certificate of a target that had
 * none (an `unverified_match`). A grant is unique per (target, certificate
 * hash, revision), so resubmitting the same certified code earns nothing, in
 * any claim. A restoration never grants and never moves the high-water mark.
 */
export type BudgetExtensionMode = "score" | "certified";

/**
 * The game's budget rule, read defensively (`matching.budgetExtension`,
 * default `score`): anything but the literal `certified` keeps the score rule.
 */
export function budgetExtensionMode(game: { matching?: unknown } | null | undefined): BudgetExtensionMode {
  const matching = game?.matching;
  if (!matching || typeof matching !== "object") return "score";
  return (matching as { budgetExtension?: unknown }).budgetExtension === "certified" ? "certified" : "score";
}

export type CertifiedProgressKind = "raised_high_water" | "first_certificate";

export interface CertifiedBaselineRecord {
  gameId: string;
  unit: string;
  symbol: string;
  certifiedScore: number | null;
  revision: string;
  certificateHash: string;
  attemptId: string | null;
  runId: string | null;
  targetClaimId: string | null;
  recordedAt: string;
  updatedAt: string;
}

export interface CertificationTarget {
  gameId: string;
  unit: string;
  symbol: string;
}

/** What the gate certified for one attempt (the checkpoint's `certification` metadata). */
export interface AttemptCertificate {
  /** The certified score of the target (the attempt's measured `after`). */
  score: number | null;
  /** sha256 of the certified content (`certificateHash`). */
  certificateHash: string;
  /** The revision the certificate was measured against: the trusted base for an unverified target, else the claim base. */
  revision: string;
}

/** Checkpoint metadata key for the attempt's certification (`CheckpointCertification`). */
export const CHECKPOINT_CERTIFICATION_KEY = "certification";

/**
 * `worker_checkpoints.metadata_json.certification`: written for every attempt
 * the enforced gate certified for its own target (`kind: "gate_pass"`), and
 * for an accepted base-identity proof (`kind: "restoration"`, never counted as
 * certified progress). Checkpoint selection ranks a gate pass first, then a
 * restoration, then everything else.
 */
export interface CheckpointCertification {
  certified: true;
  kind: "gate_pass" | "restoration";
  unit: string;
  symbol: string;
  score: number | null;
  certificate_hash: string;
  revision: string;
  /**
   * Selection progress when recorded: against the best landed certificate of
   * the target and the claim base's trusted score (null: none, or a
   * restoration). The budget grant is judged against the stored mark instead.
   */
  progress: CertifiedProgressKind | null;
  high_water_before: number | null;
  /**
   * The attempt was accepted on the certification lane (without a score gain:
   * `certificationLane.outcome` certified or restored), and why the lane was
   * open. Settlement judges the score move of such an integration against its
   * certified score, not against the score it replaced. Absent: an ordinary
   * certified attempt.
   */
  lane?: "unverified_match" | "steering_located";
}

const SCORE_EPSILON = 1e-9;

function tableExists(store: StateStore, table: "certified_baselines" | "certification_grants" | "certification_restorations"): boolean {
  return Boolean(store.db.query("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?").get(table));
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nullableString(value: unknown): string | null {
  return value == null || value === "" ? null : String(value);
}

/** Every spelling of the target's unit, and `?, ?` for an `IN (...)` over them. */
function targetUnits(target: CertificationTarget): { in: string; units: string[] } {
  const units = unitVariants(target.gameId, target.unit);
  return { in: sqlPlaceholders(units), units };
}

/**
 * sha256 of what the gate certified: the target, the revision it was measured
 * against, and the attempt's changed lines (file headers and `+`/`-` lines of
 * the post-attempt diff; hunk offsets, index lines and context are ignored, so
 * the same edits re-captured elsewhere in a claim hash the same).
 */
export function certificateHash(params: { unit: string; symbol: string; revision: string; diffText: string }): string {
  const lines = params.diffText.split(/\r?\n/).filter((line) =>
    line.startsWith("diff --git ") || ((line.startsWith("+") || line.startsWith("-")) && !line.startsWith("+++") && !line.startsWith("---")));
  return createHash("sha256")
    .update(JSON.stringify({ unit: params.unit, symbol: params.symbol, revision: params.revision, edits: lines }))
    .digest("hex");
}

export function certifiedBaseline(store: StateStore, target: CertificationTarget): CertifiedBaselineRecord | null {
  if (!tableExists(store, "certified_baselines") || !target.unit || !target.symbol) return null;
  const units = targetUnits(target);
  const row = store.db
    .query(`SELECT * FROM certified_baselines WHERE game_id = ? AND unit IN (${units.in}) AND symbol = ? ORDER BY updated_at DESC LIMIT 1`)
    .get(target.gameId, ...units.units, target.symbol) as Record<string, unknown> | null;
  if (!row) return null;
  return {
    gameId: String(row.game_id),
    unit: canonicalUnit(String(row.game_id), String(row.unit)),
    symbol: String(row.symbol),
    certifiedScore: finiteOrNull(row.certified_score),
    revision: String(row.revision),
    certificateHash: String(row.certificate_hash),
    attemptId: nullableString(row.attempt_id),
    runId: nullableString(row.run_id),
    targetClaimId: nullableString(row.target_claim_id),
    recordedAt: String(row.recorded_at),
    updatedAt: String(row.updated_at),
  };
}

export interface CertifiedProgressInput {
  /** The stored high-water mark (`certifiedBaseline`), if any. */
  stored: Pick<CertifiedBaselineRecord, "certifiedScore"> | null;
  /**
   * The score the claim base already holds as trusted code: the measured
   * baseline of an ordinary target. Null for an `unverified_match` target (its
   * current code is not certified) or when unmeasured.
   */
  implicitHighWater: number | null;
  /** The certified score of this attempt. */
  score: number | null;
}

/**
 * Pure: does a certified attempt make progress? `first_certificate` when the
 * target had no certificate at all (no stored mark, no trusted baseline);
 * `raised_high_water` when its certified score beats the higher of both;
 * null otherwise (equal or lower, or no measured score).
 */
export function certifiedProgress(input: CertifiedProgressInput): { progress: CertifiedProgressKind | null; highWaterBefore: number | null } {
  const marks = [input.stored?.certifiedScore ?? null, input.implicitHighWater].filter((mark): mark is number => mark !== null && Number.isFinite(mark));
  const hadCertificate = input.stored !== null || input.implicitHighWater !== null;
  const highWaterBefore = marks.length > 0 ? Math.max(...marks) : null;
  if (!hadCertificate) return { progress: "first_certificate", highWaterBefore };
  if (input.score === null || !Number.isFinite(input.score)) return { progress: null, highWaterBefore };
  if (highWaterBefore === null || input.score > highWaterBefore + SCORE_EPSILON) return { progress: "raised_high_water", highWaterBefore };
  return { progress: null, highWaterBefore };
}

function boundValue(value: unknown): string | null {
  return typeof value === "string" && value !== "" && !value.startsWith("-") ? value : null;
}

/** A certificate that landed with a positive freshness proof and was not reverted. */
export interface LandedCertificate {
  integrationId: string;
  checkpointId: string;
  unit: string;
  symbol: string;
  kind: "gate_pass" | "restoration";
  score: number | null;
  /** The canonical `unit::symbol` key (`unit-key.ts`). */
  key: string;
  /** Why the certification lane was open, for a lane acceptance (null: an ordinary certified attempt). */
  lane: string | null;
  integratedRev: string;
  createdAt: string;
}

function parseRecord(text: unknown): Record<string, unknown> {
  try {
    const parsed = JSON.parse(String(text ?? "{}")) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

/**
 * Every landed certificate of the game (or of one target), oldest first: an
 * applied or resolved integration of a checkpoint carrying a certification
 * for the integration's own target, not reverted by the confirmation pass,
 * with an integrated revision and a positive landed-content proof bound to
 * it (`landedContentProofBound`). Anything else never counts as landed.
 */
export function landedCertificates(store: StateStore, gameId: string, target?: { unit: string; symbol: string }): LandedCertificate[] {
  const exists = (table: string) => Boolean(store.db.query("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?").get(table));
  if (!gameId || !exists("integration_outcomes") || !exists("worker_checkpoints")) return [];
  const rows = store.db
    .query(
      `SELECT integration_outcomes.id AS integration_id, integration_outcomes.worker_checkpoint_id, integration_outcomes.target_key,
              integration_outcomes.created_at, integration_outcomes.metadata_json AS integration_metadata,
              worker_checkpoints.metadata_json AS checkpoint_metadata, worker_checkpoints.validation_state,
              target_claims.base_rev AS claim_base_rev, epoch_targets.source_path AS target_source_path
         FROM integration_outcomes
         JOIN worker_checkpoints ON worker_checkpoints.id = integration_outcomes.worker_checkpoint_id
         JOIN runs ON runs.id = integration_outcomes.run_id
         LEFT JOIN target_claims ON target_claims.id = integration_outcomes.target_claim_id
         LEFT JOIN epoch_targets ON epoch_targets.id = integration_outcomes.epoch_target_id
        WHERE runs.game_id = ? AND integration_outcomes.status IN ('applied', 'resolved')
          AND json_valid(worker_checkpoints.metadata_json)
          AND json_extract(worker_checkpoints.metadata_json, '$.${CHECKPOINT_CERTIFICATION_KEY}.certified') = 1
          ${target ? `AND json_extract(worker_checkpoints.metadata_json, '$.${CHECKPOINT_CERTIFICATION_KEY}.unit') = ?
          AND json_extract(worker_checkpoints.metadata_json, '$.${CHECKPOINT_CERTIFICATION_KEY}.symbol') = ?` : ""}
        ORDER BY integration_outcomes.created_at, integration_outcomes.id`,
    )
    .all(...(target ? [gameId, target.unit, target.symbol] : [gameId])) as Array<Record<string, unknown>>;
  const landed: LandedCertificate[] = [];
  for (const row of rows) {
    if (row.validation_state === "regressed") continue;
    const rawCertification = parseRecord(row.checkpoint_metadata)[CHECKPOINT_CERTIFICATION_KEY];
    const certification = rawCertification && typeof rawCertification === "object" && !Array.isArray(rawCertification)
      ? rawCertification as Record<string, unknown>
      : {};
    const kind = certification.kind;
    if (kind !== "gate_pass" && kind !== "restoration") continue;
    const unit = String(certification.unit ?? "");
    const symbol = String(certification.symbol ?? "");
    // The certification may spell the unit without the module prefix the integration's target key carries.
    const targetKey = String(row.target_key ?? "");
    if (!unit || !symbol || !targetKey || canonicalTargetKey(gameId, targetKey) !== canonicalKey(gameId, unit, symbol)) continue;
    const integration = parseRecord(row.integration_metadata);
    const confirmation = integration.confirmation;
    if (confirmation && typeof confirmation === "object" && (confirmation as Record<string, unknown>).validation_state === "regressed") continue;
    const integratedRev = boundValue(integration.integrated_rev);
    if (!integratedRev) continue;
    // Only a positive landed-content proof bound to this landing's own records counts (`landedContentProofBound`).
    if (!landedContentProofBound(integration, {
      gameId,
      targetKey: canonicalKey(gameId, unit, symbol),
      sourcePath: String(row.target_source_path ?? ""),
      claimBaseRev: String(row.claim_base_rev ?? ""),
      integratedRev,
    })) continue;
    landed.push({
      integrationId: String(row.integration_id),
      checkpointId: String(row.worker_checkpoint_id),
      unit,
      symbol,
      key: canonicalKey(gameId, unit, symbol),
      kind,
      score: finiteOrNull(certification.score),
      lane: typeof certification.lane === "string" && certification.lane ? certification.lane : null,
      integratedRev,
      createdAt: String(row.created_at),
    });
  }
  return landed;
}

/**
 * The best certified score of this target that actually landed
 * (`landedCertificates`, gate passes only). Null when none landed: a
 * certificate banked but never integrated, integrated over changed source, or
 * reverted, does not count. Selection judges against this; only the budget
 * ledger uses the stored high-water mark (`certifiedBaseline`).
 */
export function landedCertifiedScore(store: StateStore, target: CertificationTarget): number | null {
  if (!target.unit || !target.symbol) return null;
  let best: number | null = null;
  for (const landed of landedCertificates(store, target.gameId, target)) {
    if (landed.kind !== "gate_pass" || landed.score === null) continue;
    if (best === null || landed.score > best) best = landed.score;
  }
  return best;
}

/**
 * The checkpoint metadata for a certified attempt. `progress` decides
 * selection: it is judged against what landed (`landedCertifiedScore`) and the
 * claim base's trusted score, never against a stale, un-landed mark, so a
 * repair below an un-integrated earlier certificate is still accepted. The
 * budget grant is judged separately, against the stored mark, when it is
 * committed (`commitCertifiedProgress`).
 */
export function gatePassCertification(
  store: StateStore,
  target: CertificationTarget,
  certificate: AttemptCertificate,
  implicitHighWater: number | null,
): CheckpointCertification {
  const landed = landedCertifiedScore(store, target);
  const judged = certifiedProgress({ stored: landed === null ? null : { certifiedScore: landed }, implicitHighWater, score: certificate.score });
  return {
    certified: true,
    kind: "gate_pass",
    unit: target.unit,
    symbol: target.symbol,
    score: certificate.score,
    certificate_hash: certificate.certificateHash,
    revision: certificate.revision,
    progress: judged.progress,
    high_water_before: judged.highWaterBefore,
  };
}

export interface CommitCertifiedProgressInput extends CertificationTarget, AttemptCertificate {
  implicitHighWater: number | null;
  /** `certified` games record a budget grant for the progress; `score` games only move the mark. */
  grant: boolean;
  runId?: string | null;
  targetClaimId?: string | null;
  attemptId?: string | null;
  attemptIndex?: number | null;
}

export interface CommitCertifiedProgressResult {
  progress: CertifiedProgressKind | null;
  highWaterBefore: number | null;
  /** The high-water mark moved to this attempt. */
  raised: boolean;
  /** A new ledger row: false for no progress, a `score` game, or a certificate already granted. */
  granted: boolean;
}

/**
 * After a selectable certified checkpoint: re-judges the progress against the
 * mark as it is now (another claim may have moved it), moves the mark when the
 * attempt made progress, and, for `grant`, records one ledger row per
 * (target, certificate hash, revision). Atomic; a no-op behind migration 016.
 */
export function commitCertifiedProgress(store: StateStore, input: CommitCertifiedProgressInput): CommitCertifiedProgressResult {
  const none = { progress: null, highWaterBefore: null, raised: false, granted: false };
  if (!tableExists(store, "certified_baselines") || !input.unit || !input.symbol || !input.certificateHash || !input.revision) return none;
  return immediateTransaction(store.db, () => {
    const judged = certifiedProgress({ stored: certifiedBaseline(store, input), implicitHighWater: input.implicitHighWater, score: input.score });
    if (!judged.progress) return { ...none, highWaterBefore: judged.highWaterBefore };
    const at = now();
    const unit = canonicalUnit(input.gameId, input.unit);
    store.db
      .query(
        `INSERT INTO certified_baselines (
           game_id, unit, symbol, certified_score, revision, certificate_hash, attempt_id, run_id, target_claim_id, recorded_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (game_id, unit, symbol) DO UPDATE SET
           certified_score = excluded.certified_score,
           revision = excluded.revision,
           certificate_hash = excluded.certificate_hash,
           attempt_id = excluded.attempt_id,
           run_id = excluded.run_id,
           target_claim_id = excluded.target_claim_id,
           updated_at = excluded.updated_at`,
      )
      .run(
        input.gameId, unit, input.symbol, input.score, input.revision, input.certificateHash,
        input.attemptId ?? null, input.runId ?? null, input.targetClaimId ?? null, at, at,
      );
    let granted = false;
    if (input.grant && tableExists(store, "certification_grants")) {
      const result = store.db
        .query(
          `INSERT OR IGNORE INTO certification_grants (
             game_id, unit, symbol, certificate_hash, revision, kind, certified_score, previous_high_water,
             run_id, target_claim_id, attempt_id, attempt_index, granted_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.gameId, unit, input.symbol, input.certificateHash, input.revision, judged.progress, input.score,
          judged.highWaterBefore, input.runId ?? null, input.targetClaimId ?? null, input.attemptId ?? null, input.attemptIndex ?? null, at,
        );
      granted = Number(result.changes) > 0;
    }
    return { progress: judged.progress, highWaterBefore: judged.highWaterBefore, raised: true, granted };
  });
}

/** Budget grants recorded for one claim: the `certified` rule's improvement count. */
export function certificationGrantCount(store: StateStore, targetClaimId: string): number {
  if (!tableExists(store, "certification_grants") || !targetClaimId) return 0;
  const row = store.db.query("SELECT COUNT(*) AS count FROM certification_grants WHERE target_claim_id = ?").get(targetClaimId) as { count: number };
  return Number(row.count);
}

/** One input of a base-identity proof: its path and its blob at the trusted base (null: absent there and in the candidate). */
export interface BaseIdentityInput {
  path: string;
  blob: string | null;
  /** A build output (generated header, precompiled header): its blob is the workspace's, verified through its own inputs. */
  generated?: boolean;
}

/**
 * The revision-bound proof that an `unverified_match` attempt restored the
 * trusted base for its target: the target file and every compile input that
 * could differ (changed since the trusted base, or by the attempt) equal their
 * content at `trustedBaseRev`.
 */
export interface BaseIdentityProof {
  trustedBaseRev: string;
  claimBaseRev: string;
  sourcePath: string;
  /** The checked inputs, sorted by path. */
  inputs: BaseIdentityInput[];
  /** The compile inputs came from the build's recorded dependencies (always true for a proof the default prover accepts). */
  dependenciesKnown: boolean;
  proofHash: string;
}

/** sha256 over the trusted base, the target source and the checked inputs: what the proof binds. */
export function baseIdentityProofHash(proof: Pick<BaseIdentityProof, "trustedBaseRev" | "sourcePath" | "inputs">): string {
  const inputs = [...proof.inputs].sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  return createHash("sha256")
    .update(JSON.stringify({ trusted_base_rev: proof.trustedBaseRev, source_path: proof.sourcePath, inputs }))
    .digest("hex");
}

/** Records an accepted restoration (idempotent per target, trusted base and proof hash); returns whether a row was added. */
export function recordCertificationRestoration(store: StateStore, input: CertificationTarget & {
  proof: BaseIdentityProof;
  runId?: string | null;
  targetClaimId?: string | null;
  attemptId?: string | null;
  attemptIndex?: number | null;
}): boolean {
  if (!tableExists(store, "certification_restorations")) return false;
  const result = store.db
    .query(
      `INSERT OR IGNORE INTO certification_restorations (
         game_id, unit, symbol, trusted_base_rev, proof_hash, source_path, proof_json, run_id, target_claim_id, attempt_id, attempt_index, recorded_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.gameId, canonicalUnit(input.gameId, input.unit), input.symbol, input.proof.trustedBaseRev, input.proof.proofHash, input.proof.sourcePath,
      JSON.stringify(input.proof), input.runId ?? null, input.targetClaimId ?? null, input.attemptId ?? null, input.attemptIndex ?? null, now(),
    );
  return Number(result.changes) > 0;
}

export function listCertificationRestorations(store: StateStore, target: CertificationTarget): Array<{ trustedBaseRev: string; proofHash: string; recordedAt: string }> {
  if (!tableExists(store, "certification_restorations")) return [];
  const units = targetUnits(target);
  return (store.db
    .query(`SELECT trusted_base_rev, proof_hash, recorded_at FROM certification_restorations WHERE game_id = ? AND unit IN (${units.in}) AND symbol = ? ORDER BY id`)
    .all(target.gameId, ...units.units, target.symbol) as Array<Record<string, unknown>>)
    .map((row) => ({ trustedBaseRev: String(row.trusted_base_rev), proofHash: String(row.proof_hash), recordedAt: String(row.recorded_at) }));
}

/**
 * The verdict of the newest enforced gate observation of the target's own
 * row (`steering_observations`, migration 013), or null. `steering_located`
 * there opens the certification lane for the next attempt.
 */
export function latestEnforcedSteeringVerdict(store: StateStore, target: CertificationTarget): string | null {
  const exists = Boolean(store.db.query("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'steering_observations'").get());
  if (!exists || !target.unit || !target.symbol) return null;
  const units = targetUnits(target);
  const row = store.db
    .query(`SELECT verdict FROM steering_observations WHERE game_id = ? AND unit IN (${units.in}) AND symbol = ? AND mode = 'enforce' ORDER BY id DESC LIMIT 1`)
    .get(target.gameId, ...units.units, target.symbol) as { verdict?: unknown } | null;
  return typeof row?.verdict === "string" ? row.verdict : null;
}

/**
 * Integration metadata key for the landed-content proof: the target's whole
 * own source at `integrated_rev` is the version the immutable claim base was
 * gated against (written by the worker integration around the clean apply).
 */
export const STEERING_CONTENT_FRESHNESS_KEY = "steering_content_freshness";

/** What a landed-content proof must bind: the landing's own records. */
export interface LandedContentExpectation {
  gameId: string;
  /** Canonical `unit::symbol`; the proof may spell it with the module prefix. */
  targetKey: string;
  sourcePath: string;
  claimBaseRev: string;
  integratedRev: string;
}

function presentString(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}

/**
 * The single rule for crediting a landed gate certificate to its landing
 * (sync certification, certified regression, steering holds): the
 * integration's `steering_content_freshness` proof has `fresh` literally
 * true, and its target, source path, claim base, pre-apply rev and
 * integrated rev equal the integration's own records. A missing proof,
 * `fresh: false` (the gated source was applied onto changed source) or any
 * mismatch fails closed.
 */
export function landedContentProofBound(integration: Record<string, unknown>, expected: LandedContentExpectation): boolean {
  const raw = integration[STEERING_CONTENT_FRESHNESS_KEY];
  const proof = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  if (proof.fresh !== true) return false;
  const preApplyRev = integration.pre_apply_rev;
  return presentString(expected.sourcePath) && presentString(expected.claimBaseRev) && presentString(preApplyRev)
    && presentString(proof.target_key) && canonicalTargetKey(expected.gameId, proof.target_key) === expected.targetKey
    && proof.source_path === expected.sourcePath
    && proof.claim_base_rev === expected.claimBaseRev
    && proof.pre_apply_rev === preApplyRev
    && proof.integrated_rev === expected.integratedRev;
}
