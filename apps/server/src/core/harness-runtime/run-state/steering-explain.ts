import { immediateTransaction, now, type StateStore } from "@server/core/orchestrator-state";
import { setSteeringObservationProbe, steeringObservation } from "./steering.js";
import { canonicalUnit, sqlPlaceholders, targetKey, unitVariants, withUnitKeys } from "./unit-key.js";
import { listUnverifiedMatches } from "./unverified-matches.js";

/**
 * Compiler-delta explain jobs (migration 018, worker-compiler-loop plan
 * 3.4.1, D2). A non-pass steering observation queues one job; the
 * `steering-explain` job runs it in a build sandbox, off the worker path, and
 * publishes `compiler_delta` (a measured delta or `{unavailable}`) into the
 * observation's probe. The unverified sweep (plan 3.4.3) queues the same jobs
 * with source `sweep`; `ablation` jobs measure extra S* variants and keep
 * their delta in the job row only.
 *
 * A job is unique on (observation, input hash, tool hash): queueing it again
 * returns the existing row. A claim moves a row to `running` under an owner
 * and an expiring lease, in one immediate transaction, so two runners never
 * hold the same row; a dead runner's rows are reclaimed once their lease
 * expires, and only the holder may finish, retry or fail a row. Retries are
 * bounded by `attempts`; a failed `gate` job publishes `{unavailable}` into
 * the probe.
 *
 * Every reader tolerates a store behind migration 018 (empty/null) and every
 * writer is a no-op there. Jobs store the canonical unit (`canonicalUnit`, like
 * the observations they explain); a lookup by unit matches either spelling.
 */
export type SteeringExplainJobStatus = "queued" | "running" | "done" | "failed";
export type SteeringExplainSource = "observation" | "sweep";
export type SteeringExplainLabel = "gate" | "ablation";

export interface SteeringExplainJobInput {
  observationId: number;
  gameId: string;
  unit: string;
  /** Mangled function symbol. */
  symbol: string;
  /** The decide row's `fidelity.input_hash` (or a stand-in when the row has none). */
  inputHash: string;
  /** `steeringExplainToolHash()`: the toolpack files that compute the delta. */
  toolHash: string;
  source?: SteeringExplainSource;
  label?: SteeringExplainLabel;
  /** The S* variant measured (`global`, `evidence_sstar`, `steering_sstar`). */
  variant?: string | null;
  /** The decide row's fidelity record. */
  fidelity?: Record<string, unknown>;
  /** Host artifact paths: `{edits, mwcc, decision}` or `{check}`, plus `baseRev`. */
  inputs?: Record<string, unknown>;
}

export interface SteeringExplainJob {
  id: number;
  observationId: number;
  gameId: string;
  unit: string;
  symbol: string;
  inputHash: string;
  toolHash: string;
  source: SteeringExplainSource | string;
  label: SteeringExplainLabel | string;
  variant: string | null;
  fidelity: Record<string, unknown>;
  inputs: Record<string, unknown>;
  status: SteeringExplainJobStatus | string;
  attempts: number;
  /** The runner holding the claim (kept after it ends, for diagnosis). */
  claimOwner: string | null;
  /** ISO end of the claim lease while running. */
  claimExpiresAt: string | null;
  compilerDelta: Record<string, unknown> | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

const TABLE = "steering_explain_jobs";

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

function record(row: Record<string, unknown>): SteeringExplainJob {
  return {
    id: Number(row.id),
    observationId: Number(row.observation_id),
    gameId: String(row.game_id),
    unit: canonicalUnit(String(row.game_id), String(row.unit)),
    symbol: String(row.symbol),
    inputHash: String(row.input_hash),
    toolHash: String(row.tool_hash),
    source: String(row.source),
    label: String(row.label),
    variant: row.variant == null ? null : String(row.variant),
    fidelity: parseObject(row.fidelity_json),
    inputs: parseObject(row.inputs_json),
    status: String(row.status),
    attempts: Number(row.attempts ?? 0),
    claimOwner: row.claim_owner == null ? null : String(row.claim_owner),
    claimExpiresAt: row.claim_expires_at == null ? null : String(row.claim_expires_at),
    compilerDelta: row.compiler_delta_json == null ? null : parseObject(row.compiler_delta_json),
    error: row.error == null ? null : String(row.error),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/** Queues one job; a repeat of the same (observation, input, tool) returns the existing row's id with `queued` false. */
export function queueSteeringExplainJob(store: StateStore, input: SteeringExplainJobInput): { id: number | null; queued: boolean } {
  if (!tableExists(store)) return { id: null, queued: false };
  const at = now();
  const result = store.db
    .query(
      `INSERT OR IGNORE INTO steering_explain_jobs (
         observation_id, game_id, unit, symbol, input_hash, tool_hash, source, label, variant,
         fidelity_json, inputs_json, status, attempts, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', 0, ?, ?)`,
    )
    .run(
      input.observationId, input.gameId, canonicalUnit(input.gameId, input.unit), input.symbol, input.inputHash, input.toolHash,
      input.source ?? "observation", input.label ?? "gate", input.variant ?? null,
      JSON.stringify(input.fidelity ?? {}), JSON.stringify(input.inputs ?? {}), at, at,
    );
  if (Number(result.changes) > 0) return { id: Number(result.lastInsertRowid), queued: true };
  const existing = store.db
    .query("SELECT id FROM steering_explain_jobs WHERE observation_id = ? AND input_hash = ? AND tool_hash = ?")
    .get(input.observationId, input.inputHash, input.toolHash) as { id: number } | null;
  return { id: existing ? Number(existing.id) : null, queued: false };
}

/** `{unavailable}` a failed gate job leaves on its observation: a stuck job is never an absent delta. */
export function explainJobFailedDelta(error: string): Record<string, unknown> {
  return { unavailable: `explain job failed: ${error.slice(0, 300)}` };
}

/**
 * A failed `gate` job's observation gets `explainJobFailedDelta` unless it
 * already carries a measured delta. Ablations never touch the probe.
 */
function publishFailure(store: StateStore, job: SteeringExplainJob, error: string): void {
  if (job.label !== "gate") return;
  const existing = steeringObservation(store, job.observationId);
  if (!existing) return;
  const current = existing.probe?.compiler_delta;
  if (current && typeof current === "object" && Array.isArray((current as Record<string, unknown>).summary_lines)) return;
  const compilerDelta = explainJobFailedDelta(error);
  setSteeringObservationProbe(store, job.observationId, existing.probe
    ? { ...existing.probe, compiler_delta: compilerDelta }
    : { function: job.symbol, symbol: job.symbol, unit: job.unit, compiler_delta: compilerDelta });
}

/** A `running` row whose lease ran out (or that never had one): its claimant died or overran. */
const LEASE_EXPIRED = "(status = 'running' AND (claim_expires_at IS NULL OR claim_expires_at <= ?))";

/**
 * Claims up to `limit` jobs (oldest first) with fewer than `maxAttempts`
 * attempts: queued rows and running rows whose lease expired. Each moves to
 * `running` under `owner` until `now + leaseMs`, with one more attempt. An
 * expired claim that already used its last attempt fails ("lease expired").
 * One immediate transaction, so two runners never hold the same row.
 */
export function claimSteeringExplainJobs(
  store: StateStore,
  params: {
    gameId?: string;
    limit: number;
    maxAttempts: number;
    observationId?: number;
    owner: string;
    leaseMs: number;
    now?: Date;
    /** Jobs this runner already handled in its current pass (a requeued job waits for the next pass). */
    excludeIds?: readonly number[];
  },
): SteeringExplainJob[] {
  if (!tableExists(store) || params.limit <= 0) return [];
  const at = params.now ?? new Date();
  const nowIso = at.toISOString();
  const expiresIso = new Date(at.getTime() + params.leaseMs).toISOString();
  return immediateTransaction(store.db, () => {
    const scope: string[] = [];
    const scoped: Array<string | number> = [];
    if (params.gameId) { scope.push("game_id = ?"); scoped.push(params.gameId); }
    if (params.observationId != null) { scope.push("observation_id = ?"); scoped.push(params.observationId); }
    const scopeSql = scope.map((filter) => ` AND ${filter}`).join("");
    const dead = (store.db
      .query(`SELECT * FROM steering_explain_jobs WHERE ${LEASE_EXPIRED} AND attempts >= ?${scopeSql}`)
      .all(nowIso, params.maxAttempts, ...scoped) as Record<string, unknown>[]).map(record);
    for (const job of dead) {
      store.db
        .query("UPDATE steering_explain_jobs SET status = 'failed', error = 'lease expired', claim_expires_at = NULL, updated_at = ? WHERE id = ?")
        .run(now(), job.id);
      publishFailure(store, job, "lease expired");
    }
    const exclude = params.excludeIds ?? [];
    const excludeSql = exclude.length > 0 ? ` AND id NOT IN (${exclude.map(() => "?").join(", ")})` : "";
    const ids = (store.db
      .query(`SELECT id FROM steering_explain_jobs WHERE (status = 'queued' OR ${LEASE_EXPIRED}) AND attempts < ?${scopeSql}${excludeSql} ORDER BY id LIMIT ?`)
      .all(nowIso, params.maxAttempts, ...scoped, ...exclude, params.limit) as Array<{ id: number }>).map(({ id }) => Number(id));
    const claim = store.db.query(
      `UPDATE steering_explain_jobs SET status = 'running', attempts = attempts + 1, claim_owner = ?, claim_expires_at = ?, updated_at = ?
       WHERE id = ? AND (status = 'queued' OR ${LEASE_EXPIRED})`,
    );
    const claimed: SteeringExplainJob[] = [];
    for (const id of ids) {
      if (Number(claim.run(params.owner, expiresIso, now(), id, nowIso).changes) === 0) continue;
      const job = steeringExplainJob(store, id);
      if (job) claimed.push(job);
    }
    return claimed;
  });
}

/** The job is `running` under `owner`: only the claim's holder may move it on. */
function heldBy(store: StateStore, id: number, owner: string): SteeringExplainJob | null {
  const job = steeringExplainJob(store, id);
  return job && job.status === "running" && job.claimOwner === owner ? job : null;
}

/**
 * Publishes the job's delta (a measured delta or `{unavailable}`) and, for a
 * `gate` job, the observation probe `probe` builds from the current one, in
 * one transaction. Returns false (publishing nothing) when `owner` no longer
 * holds the claim.
 */
export function finishSteeringExplainJob(
  store: StateStore,
  id: number,
  params: { compilerDelta: Record<string, unknown>; owner: string; probe?: (existing: Record<string, unknown> | null) => Record<string, unknown> },
): boolean {
  if (!tableExists(store)) return false;
  return immediateTransaction(store.db, () => {
    const job = heldBy(store, id, params.owner);
    if (!job) return false;
    store.db
      .query("UPDATE steering_explain_jobs SET status = 'done', compiler_delta_json = ?, error = NULL, claim_expires_at = NULL, updated_at = ? WHERE id = ? AND status = 'running' AND claim_owner = ?")
      .run(JSON.stringify(params.compilerDelta), now(), id, params.owner);
    if (job.label === "gate" && params.probe) {
      const observation = steeringObservation(store, job.observationId);
      if (observation) setSteeringObservationProbe(store, job.observationId, params.probe(observation.probe));
    }
    return true;
  });
}

/**
 * Requeues a failed attempt, or fails the job once it has used `maxAttempts`
 * (a failed gate job publishes `explainJobFailedDelta`). Returns the new
 * status, or null when `owner` no longer holds the claim.
 */
export function retrySteeringExplainJob(
  store: StateStore,
  id: number,
  params: { error: string; maxAttempts: number; owner: string },
): "queued" | "failed" | null {
  if (!tableExists(store)) return null;
  return immediateTransaction(store.db, () => {
    const job = heldBy(store, id, params.owner);
    if (!job) return null;
    const status = job.attempts >= params.maxAttempts ? "failed" : "queued";
    store.db
      .query("UPDATE steering_explain_jobs SET status = ?, error = ?, claim_expires_at = NULL, updated_at = ? WHERE id = ? AND status = 'running' AND claim_owner = ?")
      .run(status, params.error, now(), id, params.owner);
    if (status === "failed") publishFailure(store, job, params.error);
    return status;
  });
}

/**
 * Hands a held job back at shutdown (its runner was cancelled): like
 * `retrySteeringExplainJob`, it is queued again, or failed once it used
 * `maxAttempts` (a failed gate job publishes `explainJobFailedDelta`). The
 * claim's attempt still counts; owner and lease are cleared. Returns the new
 * status, or null when `owner` no longer holds the claim.
 */
export function releaseSteeringExplainJob(
  store: StateStore,
  id: number,
  params: { owner: string; error: string; maxAttempts: number },
): "queued" | "failed" | null {
  if (!tableExists(store)) return null;
  return immediateTransaction(store.db, () => {
    const job = heldBy(store, id, params.owner);
    if (!job) return null;
    const status = job.attempts >= params.maxAttempts ? "failed" : "queued";
    store.db
      .query("UPDATE steering_explain_jobs SET status = ?, error = ?, claim_owner = NULL, claim_expires_at = NULL, updated_at = ? WHERE id = ? AND status = 'running' AND claim_owner = ?")
      .run(status, params.error, now(), id, params.owner);
    if (status === "failed") publishFailure(store, job, params.error);
    return status;
  });
}

/** Fails a held job at once (a failed gate job publishes `explainJobFailedDelta`); false when `owner` lost the claim. */
export function failSteeringExplainJob(store: StateStore, id: number, params: { error: string; owner: string }): boolean {
  if (!tableExists(store)) return false;
  return immediateTransaction(store.db, () => {
    const job = heldBy(store, id, params.owner);
    if (!job) return false;
    store.db
      .query("UPDATE steering_explain_jobs SET status = 'failed', error = ?, claim_expires_at = NULL, updated_at = ? WHERE id = ? AND status = 'running' AND claim_owner = ?")
      .run(params.error, now(), id, params.owner);
    publishFailure(store, job, params.error);
    return true;
  });
}

export function steeringExplainJob(store: StateStore, id: number): SteeringExplainJob | null {
  if (!tableExists(store)) return null;
  const row = store.db.query("SELECT * FROM steering_explain_jobs WHERE id = ?").get(id) as Record<string, unknown> | null;
  return row ? record(row) : null;
}

export function listSteeringExplainJobs(
  store: StateStore,
  params: { gameId: string; status?: SteeringExplainJobStatus; unit?: string; symbol?: string; observationId?: number },
): SteeringExplainJob[] {
  if (!tableExists(store)) return [];
  const filters = ["game_id = ?"];
  const values: Array<string | number> = [params.gameId];
  if (params.status) { filters.push("status = ?"); values.push(params.status); }
  if (params.unit) {
    const units = unitVariants(params.gameId, params.unit);
    filters.push(`unit IN (${sqlPlaceholders(units)})`);
    values.push(...units);
  }
  if (params.symbol) { filters.push("symbol = ?"); values.push(params.symbol); }
  if (params.observationId != null) { filters.push("observation_id = ?"); values.push(params.observationId); }
  return (store.db.query(`SELECT * FROM steering_explain_jobs WHERE ${filters.join(" AND ")} ORDER BY id`).all(...values) as Record<string, unknown>[])
    .map(record);
}

/**
 * A live (queued, done, or running within its lease) `sweep` job for the
 * same target, inputs and tool: the sweep records a fresh observation each
 * run, so the unique key alone would not stop it queueing the same
 * measurement again. A claim whose lease expired is not live.
 */
export function liveSweepExplainJob(
  store: StateStore,
  params: { gameId: string; unit: string; symbol: string; inputHash: string; toolHash: string; label?: SteeringExplainLabel; now?: Date },
): SteeringExplainJob | null {
  if (!tableExists(store)) return null;
  const units = unitVariants(params.gameId, params.unit);
  const row = store.db
    .query(
      `SELECT * FROM steering_explain_jobs
       WHERE game_id = ? AND unit IN (${sqlPlaceholders(units)}) AND symbol = ? AND input_hash = ? AND tool_hash = ? AND source = 'sweep' AND label = ?
         AND (status IN ('queued', 'done') OR (status = 'running' AND claim_expires_at > ?))
       ORDER BY id LIMIT 1`,
    )
    .get(params.gameId, ...units, params.symbol, params.inputHash, params.toolHash, params.label ?? "gate", (params.now ?? new Date()).toISOString()) as Record<string, unknown> | null;
  return row ? record(row) : null;
}

/** The delta is one measured change: `changes` has exactly one entry and nothing is unavailable. */
export function isSingleChangeDelta(delta: Record<string, unknown> | null): boolean {
  if (!delta || delta.unavailable !== undefined || !Array.isArray(delta.changes) || delta.changes.length !== 1) return false;
  if (delta.changes_truncated === true) return false;
  // `change_counts` (compare_sources) counts every change, also those the listed `changes` dropped.
  const counts = delta.change_counts;
  if (counts && typeof counts === "object" && !Array.isArray(counts)) {
    return Object.values(counts as Record<string, unknown>).reduce<number>((sum, n) => sum + (typeof n === "number" ? n : 0), 0) === 1;
  }
  return true;
}

/**
 * `unit::symbol` keys of active `unverified_match` rows whose latest finished
 * gate explain job measured a single change: the board ranks them first.
 * Only a delta measured for the row as it stands now counts (a refreshed
 * target never inherits an old one): a `sweep` job over the row's current
 * check report (`report.check`) at its base (`report.base_rev`, else the
 * row's trusted base), for the row's current gate inputs (the job's input
 * hash is both its fidelity record's and the row's
 * `report.fidelity_input_hash`, which a backfill re-run into the same report
 * path replaces), whose observation saw the row's current source
 * (`function_source_sha`, both set). A worker attempt's delta measures that
 * attempt, not the row, and never ranks it. Keys are canonical `targetKey`s,
 * tagged `withUnitKeys` so `unitKeyedHas` also finds a report (prefixed) key.
 */
export function singleChangeUnverifiedKeys(store: StateStore, gameId: string): Set<string> {
  const keys = withUnitKeys(new Set<string>(), gameId);
  if (!tableExists(store)) return keys;
  const active = new Map(listUnverifiedMatches(store, gameId)
    .filter((row) => row.functionSourceSha && typeof row.report.check === "string" && row.report.check
      && typeof row.report.fidelity_input_hash === "string" && row.report.fidelity_input_hash)
    .map((row) => [targetKey(gameId, row.unit, row.symbol), {
      sha: row.functionSourceSha!,
      check: String(row.report.check),
      inputHash: String(row.report.fidelity_input_hash),
      baseRev: typeof row.report.base_rev === "string" && row.report.base_rev ? row.report.base_rev : row.baseRev,
    }]));
  if (active.size === 0) return keys;
  const rows = store.db
    .query(`SELECT job.unit, job.symbol, job.input_hash, job.fidelity_json, job.inputs_json, job.compiler_delta_json,
                   observation.function_source_sha
             FROM steering_explain_jobs AS job
             JOIN steering_observations AS observation ON observation.id = job.observation_id
             WHERE job.game_id = ? AND job.status = 'done' AND job.label = 'gate' AND job.source = 'sweep'
               AND observation.function_source_sha IS NOT NULL
             ORDER BY job.updated_at DESC, job.id DESC`)
    .all(gameId) as Array<{ unit: string; symbol: string; input_hash: string; fidelity_json: string; inputs_json: string;
      compiler_delta_json: string | null; function_source_sha: string }>;
  const seen = new Set<string>();
  for (const row of rows) {
    const key = targetKey(gameId, String(row.unit), String(row.symbol));
    const current = active.get(key);
    if (seen.has(key) || !current) continue;
    const fidelity = parseObject(row.fidelity_json);
    const inputs = parseObject(row.inputs_json);
    const measuredNow = String(row.function_source_sha) === current.sha && inputs.check === current.check
      && typeof fidelity.input_hash === "string" && fidelity.input_hash === row.input_hash
      && row.input_hash === current.inputHash
      && Boolean(current.baseRev) && fidelity.base_rev === current.baseRev;
    if (!measuredNow) continue;
    seen.add(key);
    const delta = row.compiler_delta_json == null ? null : parseObject(row.compiler_delta_json);
    if (isSingleChangeDelta(delta)) keys.add(key);
  }
  return keys;
}
