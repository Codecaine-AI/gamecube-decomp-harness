import { createHash } from "node:crypto";
import { immediateTransaction, now, type StateStore } from "@server/core/orchestrator-state";
import {
  publishSiteBoundApprovals,
  SITE_BOUND_APPROVAL_SCHEMA,
  type SiteBoundApproval,
} from "@server/core/validation/steering/approvals.js";
import { requeueEpochTarget } from "./epochs.js";
import { canonicalUnit, sqlPlaceholders, unitVariants } from "./unit-key.js";

/**
 * Evidence-review requests (migration 017, worker-compiler-loop plan 3.1).
 *
 * The enforced steering gate certifies a behaviour-identical construct the
 * original really had (a map-backed weak inline) only through a site-bound
 * approval. When it rejects an attempt with such a group (`evidence_review`),
 * the runner records one request per construct, keyed by game, unit, target
 * symbol and normalized group digest: a resubmission of the same construct
 * updates the row instead of adding one. An operator approves or rejects it
 * with a note. Approval appends the site-bound approval row the gate reads
 * and puts the target back on the board; it accepts nothing by itself, so a
 * fresh attempt must still pass the gate.
 *
 * An `unverified_match` target is certified by two gate runs, one against the
 * claim base and one against the trusted base. Its requests keep both bases
 * and the site each base's run observed, and one approval writes a row per
 * base (`approvalsForRequest`), so the operator decides the construct once.
 * Each row still binds its own base: nothing certifies a third base.
 *
 * Every reader tolerates a store behind migration 017 (empty) and every
 * writer is a no-op there. Requests store the gate's canonical unit (no
 * module prefix, `canonicalUnit`), which the approval rows carry; lookups by
 * unit match either spelling, and epoch targets (named with the prefix) too.
 */
/** `approving`: an approval claimed the request and is publishing its rows (no other decision can win). */
export type EvidenceReviewStatus = "open" | "approving" | "approved" | "rejected";
export const EVIDENCE_REVIEW_STATUSES: readonly EvidenceReviewStatus[] = ["open", "approving", "approved", "rejected"];
/**
 * An `approving` claim older than this is a crashed publication (its rows may already be live). Only an
 * approval at its revision may take it over, to finish publishing and finalize; a rejection never can.
 */
export const APPROVING_CLAIM_STALE_MS = 10 * 60_000;

/** The site and digest the gate run against `base_rev` observed for the construct. */
export interface EvidenceReviewBaseSite {
  base_rev: string;
  site_file: string;
  site_lines: [number, number];
  group_digest: string;
}

export interface EvidenceReviewRequestInput {
  gameId: string;
  unit: string;
  /** Mangled target function the edit group edits. */
  symbol: string;
  /** The base of the gate run that rejected the construct. */
  baseRev: string;
  /** `unverified_match` target: both bases that certify it (the claim base and the trusted base). */
  claimBaseRev?: string | null;
  trustedBaseRev?: string | null;
  siteFile: string;
  siteLines: [number, number];
  groupDigest: string;
  callee: string | null;
  calleeSymbol: string | null;
  patch: string;
  /** `{ gate: {...}, worker: {...} | null }`: the gate's evidence and what the worker cited. */
  evidence: Record<string, unknown>;
  runId?: string | null;
  attemptRef?: string | null;
}

/** The dashboard/API shape (snake_case, like the gate's own records). */
export interface EvidenceReviewRequest {
  id: string;
  game: string;
  unit: string;
  symbol: string;
  base_rev: string;
  /** Set for an `unverified_match` target: an approval covers both bases. */
  claim_base_rev: string | null;
  trusted_base_rev: string | null;
  /** The site each base's gate run observed (`base_rev`'s first). */
  base_sites: EvidenceReviewBaseSite[];
  site_file: string;
  site_lines: [number, number];
  group_digest: string;
  callee: string | null;
  callee_symbol: string | null;
  patch: string;
  evidence: Record<string, unknown>;
  status: EvidenceReviewStatus;
  decided_by: string | null;
  note: string | null;
  occurrences: number;
  /** Grows with every change of the facts or status; a decision must name the revision the operator saw. */
  revision: number;
  run_id: string | null;
  attempt_ref: string | null;
  /** The row for `base_rev` (null until approved). */
  approval: SiteBoundApproval | null;
  /** Every row the approval wrote: one per base. */
  approvals: SiteBoundApproval[];
  created_at: string;
  updated_at: string;
  decided_at: string | null;
}

/** What recording one request did: a new row, a reopened approved row (the approval no longer covers it), or a repeat. */
export type EvidenceReviewRecordOutcome = "created" | "reopened" | "repeated";

const TABLE = "steering_evidence_reviews";

function tableExists(store: StateStore): boolean {
  return Boolean(store.db.query("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?").get(TABLE));
}

function parseObject(text: unknown): Record<string, unknown> {
  try {
    const parsed = JSON.parse(String(text ?? "{}")) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

/** Stable request id: the dedupe key (canonical unit) hashed, so a lost reply can be retried with the same id. */
export function evidenceReviewId(gameId: string, unit: string, symbol: string, groupDigest: string): string {
  return `er-${createHash("sha256").update(JSON.stringify([gameId, canonicalUnit(gameId, unit), symbol, groupDigest])).digest("hex").slice(0, 20)}`;
}

/** `unit IN (...)` over every spelling of the unit (`column` names the unit column), with its bound values. */
function unitClause(gameId: string, unit: string, column = "unit"): { sql: string; units: string[] } {
  const units = unitVariants(gameId, unit);
  return { sql: `${column} IN (${sqlPlaceholders(units)})`, units };
}

function parseArray(text: unknown): unknown[] {
  try {
    const parsed = JSON.parse(String(text ?? "[]")) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseBaseSites(text: unknown): EvidenceReviewBaseSite[] {
  return parseArray(text).filter((site): site is EvidenceReviewBaseSite => {
    const row = site as Record<string, unknown>;
    return Boolean(row) && typeof row.base_rev === "string" && typeof row.site_file === "string" && typeof row.group_digest === "string"
      && Array.isArray(row.site_lines) && row.site_lines.length === 2;
  });
}

/** `sites` with `site` replacing any entry for its base. */
function withBaseSite(sites: EvidenceReviewBaseSite[], site: EvidenceReviewBaseSite): EvidenceReviewBaseSite[] {
  return [site, ...sites.filter((entry) => entry.base_rev !== site.base_rev)];
}

function inputSite(input: EvidenceReviewRequestInput): EvidenceReviewBaseSite {
  return { base_rev: input.baseRev, site_file: input.siteFile, site_lines: input.siteLines, group_digest: input.groupDigest };
}

function toRequest(row: Record<string, unknown>): EvidenceReviewRequest {
  const approvals = parseArray(row.approval_json ?? "[]") as SiteBoundApproval[];
  return {
    id: String(row.id),
    game: String(row.game_id),
    unit: canonicalUnit(String(row.game_id), String(row.unit)),
    symbol: String(row.symbol),
    base_rev: String(row.base_rev),
    claim_base_rev: row.claim_base_rev == null ? null : String(row.claim_base_rev),
    trusted_base_rev: row.trusted_base_rev == null ? null : String(row.trusted_base_rev),
    base_sites: parseBaseSites(row.base_sites_json),
    site_file: String(row.site_file),
    site_lines: [Number(row.site_start), Number(row.site_end)],
    group_digest: String(row.group_digest),
    callee: row.callee == null ? null : String(row.callee),
    callee_symbol: row.callee_symbol == null ? null : String(row.callee_symbol),
    patch: String(row.patch ?? ""),
    evidence: parseObject(row.evidence_json),
    status: String(row.status) as EvidenceReviewStatus,
    decided_by: row.decided_by == null ? null : String(row.decided_by),
    note: row.note == null ? null : String(row.note),
    occurrences: Number(row.occurrences ?? 1),
    revision: Number(row.revision ?? 1),
    run_id: row.run_id == null ? null : String(row.run_id),
    attempt_ref: row.attempt_ref == null ? null : String(row.attempt_ref),
    approval: approvals.find((entry) => entry.base_rev === String(row.base_rev)) ?? approvals[0] ?? null,
    approvals,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    decided_at: row.decided_at == null ? null : String(row.decided_at),
  };
}

/**
 * Records one request for a construct the enforced gate rejected as
 * `evidence_review`. Deduplicated on (game, unit, symbol, group digest):
 * - no row: a new `open` request;
 * - `open`: the same request again (`occurrences` + 1; base, site, patch and
 *   evidence follow the latest attempt);
 * - `approved`: the approval did not certify this attempt (another base or
 *   site), so the request reopens with the latest facts and the previous
 *   decision kept under `evidence.previous_decisions`;
 * - `rejected`: stays rejected (`occurrences` + 1), the worker is not asked again.
 * Null on a store behind migration 017.
 */
export function recordEvidenceReviewRequest(store: StateStore, input: EvidenceReviewRequestInput): { id: string; outcome: EvidenceReviewRecordOutcome } | null {
  if (!tableExists(store)) return null;
  const unit = canonicalUnit(input.gameId, input.unit);
  const id = evidenceReviewId(input.gameId, unit, input.symbol, input.groupDigest);
  const units = unitClause(input.gameId, unit);
  const at = now();
  return immediateTransaction(store.db, () => {
    const existing = store.db
      .query(`SELECT * FROM ${TABLE} WHERE game_id = ? AND ${units.sql} AND symbol = ? AND group_digest = ? ORDER BY updated_at DESC LIMIT 1`)
      .get(input.gameId, ...units.units, input.symbol, input.groupDigest) as Record<string, unknown> | undefined;
    if (!existing) {
      store.db
        .query(`INSERT INTO ${TABLE} (
            id, game_id, unit, symbol, group_digest, base_rev, claim_base_rev, trusted_base_rev, base_sites_json,
            site_file, site_start, site_end, callee, callee_symbol,
            patch, evidence_json, status, run_id, attempt_ref, occurrences, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, 1, ?, ?)`)
        .run(
          id, input.gameId, unit, input.symbol, input.groupDigest, input.baseRev,
          input.claimBaseRev ?? null, input.trustedBaseRev ?? null, JSON.stringify([inputSite(input)]), input.siteFile,
          input.siteLines[0], input.siteLines[1], input.callee, input.calleeSymbol, input.patch,
          JSON.stringify(input.evidence), input.runId ?? null, input.attemptRef ?? null, at, at,
        );
      return { id, outcome: "created" as const };
    }
    const status = String(existing.status) as EvidenceReviewStatus;
    // Rejected stays rejected; an approval being published keeps the facts it claimed (its revision too).
    if (status === "rejected" || status === "approving") {
      store.db.query(`UPDATE ${TABLE} SET occurrences = occurrences + 1, updated_at = ? WHERE id = ?`).run(at, existing.id as string);
      return { id: String(existing.id), outcome: "repeated" as const };
    }
    const evidence: Record<string, unknown> = { ...input.evidence };
    const previous = parseObject(existing.evidence_json).previous_decisions;
    const decisions = Array.isArray(previous) ? [...previous] : [];
    if (status === "approved") {
      decisions.push({
        status, decided_by: existing.decided_by ?? null, note: existing.note ?? null, decided_at: existing.decided_at ?? null,
        base_rev: existing.base_rev, site_file: existing.site_file, site_lines: [existing.site_start, existing.site_end],
      });
    }
    if (decisions.length > 0) evidence.previous_decisions = decisions;
    // Open: the observed sites accumulate per base. Reopened: the approval covered other sites, start over.
    const sites = status === "approved" ? [inputSite(input)] : withBaseSite(parseBaseSites(existing.base_sites_json), inputSite(input));
    store.db
      .query(`UPDATE ${TABLE} SET
          claim_base_rev = COALESCE(?, claim_base_rev), trusted_base_rev = COALESCE(?, trusted_base_rev), base_sites_json = ?,
          base_rev = ?, site_file = ?, site_start = ?, site_end = ?, callee = ?, callee_symbol = ?, patch = ?,
          evidence_json = ?, run_id = ?, attempt_ref = ?, occurrences = occurrences + 1, revision = revision + 1, updated_at = ?,
          status = 'open', decided_by = CASE WHEN ? THEN NULL ELSE decided_by END,
          note = CASE WHEN ? THEN NULL ELSE note END, decided_at = CASE WHEN ? THEN NULL ELSE decided_at END,
          approval_json = CASE WHEN ? THEN NULL ELSE approval_json END
        WHERE id = ?`)
      .run(
        input.claimBaseRev ?? null, input.trustedBaseRev ?? null, JSON.stringify(sites),
        input.baseRev, input.siteFile, input.siteLines[0], input.siteLines[1], input.callee, input.calleeSymbol, input.patch,
        JSON.stringify(evidence), input.runId ?? null, input.attemptRef ?? null, at,
        status === "approved" ? 1 : 0, status === "approved" ? 1 : 0, status === "approved" ? 1 : 0, status === "approved" ? 1 : 0,
        existing.id as string,
      );
    return { id: String(existing.id), outcome: status === "approved" ? "reopened" as const : "repeated" as const };
  });
}

/** Requests of a game by status (all statuses when omitted), newest first. */
export function listEvidenceReviews(store: StateStore, params: { gameId: string; status?: EvidenceReviewStatus | null; limit?: number }): EvidenceReviewRequest[] {
  if (!tableExists(store)) return [];
  const limit = Math.max(1, Math.min(params.limit ?? 200, 1000));
  const rows = params.status
    ? store.db.query(`SELECT * FROM ${TABLE} WHERE game_id = ? AND status = ? ORDER BY updated_at DESC, id ASC LIMIT ?`).all(params.gameId, params.status, limit)
    : store.db.query(`SELECT * FROM ${TABLE} WHERE game_id = ? ORDER BY updated_at DESC, id ASC LIMIT ?`).all(params.gameId, limit);
  return (rows as Record<string, unknown>[]).map(toRequest);
}

export function getEvidenceReview(store: StateStore, id: string): EvidenceReviewRequest | null {
  if (!tableExists(store)) return null;
  const row = store.db.query(`SELECT * FROM ${TABLE} WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  return row ? toRequest(row) : null;
}

/**
 * Packet input (`open_reviews` in the worker's previous_attempt /
 * steering_probe context): the open evidence-review requests for one target
 * (exact game and mangled symbol, the unit with or without its module prefix; `approving` counts as open), oldest first. The worker treats each
 * as a pending lead and does not resubmit it unchanged. Empty on a store
 * behind migration 017.
 */
export function openEvidenceReviewsForTarget(store: StateStore, params: { gameId: string; unit: string; symbol: string }): EvidenceReviewRequest[] {
  if (!tableExists(store)) return [];
  const units = unitClause(params.gameId, params.unit);
  return (store.db
    .query(`SELECT * FROM ${TABLE} WHERE game_id = ? AND ${units.sql} AND symbol = ? AND status IN ('open', 'approving') ORDER BY created_at ASC, id ASC`)
    .all(params.gameId, ...units.units, params.symbol) as Record<string, unknown>[]).map(toRequest);
}

/**
 * The site-bound approvals an operator's approval of `request` writes: one per
 * base that certifies the target (`base_rev`, plus the claim and trusted bases
 * of an `unverified_match` target), each with the site and digest that base's
 * gate run observed, or the request's own site for a base whose run has not
 * seen the construct yet (the candidate file, and so the site, is the same
 * for both runs of one attempt). Every row binds exactly one base.
 */
export function approvalsForRequest(request: EvidenceReviewRequest, params: { approvedBy: string; note: string; at: string }): SiteBoundApproval[] {
  const { callee, callee_symbol: calleeSymbol } = request;
  if (!callee || !calleeSymbol) throw new Error(`evidence review ${request.id} has no callee to approve`);
  const bases = [...new Set([request.base_rev, request.claim_base_rev, request.trusted_base_rev].filter((rev): rev is string => Boolean(rev)))];
  return bases.map((baseRev) => {
    const site = request.base_sites.find((entry) => entry.base_rev === baseRev)
      ?? { site_file: request.site_file, site_lines: request.site_lines, group_digest: request.group_digest };
    return {
      schema: SITE_BOUND_APPROVAL_SCHEMA,
      game: request.game,
      unit: request.unit,
      target: request.symbol,
      base_rev: baseRev,
      site_file: site.site_file,
      site_lines: [site.site_lines[0], site.site_lines[1]],
      group_digest: site.group_digest,
      callee,
      symbol: calleeSymbol,
      approved_by: params.approvedBy,
      provenance: `evidence review ${request.id}: ${params.note}`,
      review_id: request.id,
      note: params.note,
      approved_at: params.at,
    };
  });
}

export interface EvidenceReviewRequeue {
  status: "requeued" | "deferred" | "none";
  message: string;
  epochTargetIds: string[];
}

/**
 * Puts an approved target back on the board: its finished epoch targets in
 * the game's active epochs are reopened (`requeueEpochTarget`) when no live
 * scheduler process owns the run (`requeueAllowed`); otherwise the target
 * re-admits at the next board admission (it stays an ordinary open target).
 */
export function requeueReviewedTarget(
  store: StateStore,
  params: { gameId: string; unit: string; symbol: string; requeueAllowed: boolean },
): EvidenceReviewRequeue {
  // Epoch targets carry the report's (module-prefixed) unit; the request the gate's.
  const units = unitClause(params.gameId, params.unit, "et.unit");
  const rows = store.db
    .query(`SELECT et.id AS id FROM epoch_targets et
        JOIN epochs e ON e.id = et.epoch_id
        JOIN runs r ON r.id = et.run_id
      WHERE r.game_id = ? AND ${units.sql} AND et.symbol = ? AND et.status = 'finished' AND e.status = 'active'
      ORDER BY et.admitted_at ASC`)
    .all(params.gameId, ...units.units, params.symbol) as Array<{ id: string }>;
  if (rows.length === 0) {
    return { status: "none", message: `${params.symbol} has no finished target in an active epoch; it re-admits at the next board admission.`, epochTargetIds: [] };
  }
  if (!params.requeueAllowed) {
    return { status: "deferred", message: `A live run process owns the board; ${params.symbol} re-admits at the next board admission.`, epochTargetIds: [] };
  }
  const ids = rows.map((row) => requeueEpochTarget(store, { epochTargetId: row.id, actor: "operator" }).epochTargetId);
  return { status: "requeued", message: `${params.symbol} is back on the board (${ids.length} epoch target${ids.length === 1 ? "" : "s"} requeued); a fresh attempt must pass the gate.`, epochTargetIds: ids };
}

export class EvidenceReviewDecisionError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409) {
    super(message);
  }
}

/**
 * An operator's decision on an open request, at the `revision` the operator
 * saw (a request a resubmission changed since then is refused: the operator
 * has not seen its site or bases). Both decisions need a note.
 *
 * The decision is claimed in the database first, by a compare-and-set from
 * `open` at that revision, so exactly one concurrent decision wins:
 * - `rejected`: the claim is the decision;
 * - `approved`: the claim moves the row to `approving`; only then are the
 *   site-bound rows published to `approvalsPath` (serialized, all or none,
 *   idempotent), the row becomes `approved` and the target goes back on the
 *   board. A failed publication (nothing was written: publication is all or
 *   none) puts the row back to `open`. A crash leaves `approving`, possibly
 *   with its rows already live: only an approval at its revision may take it
 *   over after APPROVING_CLAIM_STALE_MS, republishing idempotently and
 *   finalizing; a rejection of an `approving` row is always refused.
 * Nothing is accepted here: a fresh attempt must pass the gate.
 */
export async function decideEvidenceReview(
  store: StateStore,
  params: {
    gameId: string;
    id: string;
    decision: "approved" | "rejected";
    note: string;
    /** The request revision the operator decided on. */
    revision: number;
    decidedBy?: string | null;
    approvalsPath: string | null;
    requeueAllowed: boolean;
  },
): Promise<{ review: EvidenceReviewRequest; approval: SiteBoundApproval | null; approvals: SiteBoundApproval[]; requeue: EvidenceReviewRequeue }> {
  const note = params.note.trim();
  if (!note) throw new EvidenceReviewDecisionError("a decision needs a note", 400);
  if (params.decision !== "approved" && params.decision !== "rejected") throw new EvidenceReviewDecisionError("decision must be approved or rejected", 400);
  if (!Number.isInteger(params.revision)) throw new EvidenceReviewDecisionError("a decision needs the request revision it was made on", 400);
  const request = getEvidenceReview(store, params.id);
  if (!request || request.game !== params.gameId) throw new EvidenceReviewDecisionError(`evidence review not found: ${params.id}`, 404);
  const decidedBy = params.decidedBy?.trim() || "operator";
  const at = now();
  let approvals: SiteBoundApproval[] = [];
  if (params.decision === "approved") {
    if (!params.approvalsPath) throw new EvidenceReviewDecisionError(`game ${params.gameId} has no steering approvals file`, 409);
    try {
      approvals = approvalsForRequest(request, { approvedBy: decidedBy, note, at });
    } catch (error) {
      throw new EvidenceReviewDecisionError(error instanceof Error ? error.message : String(error), 409);
    }
  }
  // The claim runs synchronously before any await, so no other decision interleaves with it. A stale
  // `approving` claim may hold published rows, so only an approval (which republishes idempotently) resumes it.
  const claimRevision = params.revision + 1;
  const staleBefore = new Date(Date.parse(at) - APPROVING_CLAIM_STALE_MS).toISOString();
  const resumable = params.decision === "approved" ? 1 : 0;
  const claimed = store.db
    .query(`UPDATE ${TABLE} SET status = ?, decided_by = ?, note = ?, decided_at = ?, revision = ?, updated_at = ?
      WHERE id = ? AND revision = ? AND (status = 'open' OR (? = 1 AND status = 'approving' AND decided_at < ?))`)
    .run(params.decision === "approved" ? "approving" : "rejected", decidedBy, note, at, claimRevision, at, request.id, params.revision, resumable, staleBefore);
  if (claimed.changes === 0) {
    const latest = getEvidenceReview(store, request.id) ?? request;
    if (latest.revision !== params.revision) {
      throw new EvidenceReviewDecisionError(
        `evidence review ${params.id} changed since revision ${params.revision} (now ${latest.revision}, ${latest.status}): reload it before deciding`, 409);
    }
    throw new EvidenceReviewDecisionError(`evidence review ${params.id} is already ${latest.status}`, 409);
  }
  if (params.decision === "rejected") {
    const review = getEvidenceReview(store, request.id)!;
    return { review, approval: null, approvals: [], requeue: { status: "none", message: "Rejected; the target stays as it is.", epochTargetIds: [] } };
  }
  try {
    await publishSiteBoundApprovals(params.approvalsPath!, approvals);
  } catch (error) {
    store.db
      .query(`UPDATE ${TABLE} SET status = 'open', decided_by = NULL, note = NULL, decided_at = NULL, revision = revision + 1, updated_at = ?
        WHERE id = ? AND status = 'approving' AND revision = ?`)
      .run(now(), request.id, claimRevision);
    throw new Error(`publishing the approval of ${params.id} failed, so it is open again: ${error instanceof Error ? error.message : String(error)}`);
  }
  const done = store.db
    .query(`UPDATE ${TABLE} SET status = 'approved', approval_json = ?, revision = revision + 1, updated_at = ?
      WHERE id = ? AND status = 'approving' AND revision = ?`)
    .run(JSON.stringify(approvals), now(), request.id, claimRevision);
  if (done.changes === 0) throw new EvidenceReviewDecisionError(`evidence review ${params.id} was taken over while its approval was published`, 409);
  const requeue = requeueReviewedTarget(store, { gameId: request.game, unit: request.unit, symbol: request.symbol, requeueAllowed: params.requeueAllowed });
  const review = getEvidenceReview(store, request.id)!;
  return { review, approval: review.approval, approvals, requeue };
}
