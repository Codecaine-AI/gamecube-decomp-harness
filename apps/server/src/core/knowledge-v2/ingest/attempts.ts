import { Database } from "bun:sqlite";
import { dirname } from "node:path";
import { createOrchestratorStateOrm, type StateStore } from "@server/core/orchestrator-state";
import { revisionIsAncestor } from "@server/core/harness-runtime/phases/pr/checkpoint/completion-index.js";
import { checkpointOwnRunnerValidation, steeringPrHolds } from "@server/core/harness-runtime/phases/pr/checkpoint/steering-holds.js";
import { CHECKPOINT_CERTIFICATION_KEY, landedCertificates } from "@server/core/harness-runtime/run-state/certification.js";
import { canonicalTargetKey, sqlPlaceholders, unitVariants, type UnitKeyGame } from "@server/core/harness-runtime/run-state/unit-key.js";
import type { KnowledgeStoreHandle } from "../records/index.js";
import { advanceWatermark, getWatermark, insertWorkerRun, updateWorkerRunIntegration } from "../records/index.js";
import type { IntegrationDetail } from "../storage/schema.js";
import type { AttemptsImportResult, LaneOptions } from "./types.js";

export interface AttemptsImportOptions extends LaneOptions {
  orchestratorDbPath: string;
  /**
   * The game the orchestrator store belongs to: its steering rows name units
   * without the module prefix worker targets carry (SMS `mario/`). Omitted =
   * each worker state's `runs.game_id`.
   */
  gameId?: string;
  /**
   * The game repository, for ancestry between a cleared `unverified_match`'s
   * certifying revision and a checkpoint's integrated revision. Omitted:
   * only an equal revision certifies (fail closed).
   */
  repoRoot?: string | null;
}

export interface AttemptSourceWorkerState {
  id: string;
  run_id: string | null;
  epoch_id: string | null;
  target_claim_id: string | null;
  worker_id: string | null;
  target_key: string;
  lifecycle_status: string;
  started_at: string;
  ended_at: string | null;
  baseline_score: number | null;
  timeout_summary: string | null;
  error_summary: string | null;
}

export interface AttemptSourceCheckpoint {
  id: string;
  attempt_index: number;
  validation_time: string;
  new_score: number;
  exact_match: number;
  metadata_json: string | null;
  /**
   * 0 = the attempt was rejected (a hard gate, the enforced steering gate, an
   * uncertified `unverified_match` target, ...). Absent only on source stores
   * from before the column existed, whose checkpoints were all accepted.
   */
  hard_gates_passed?: number | null;
  /** `regressed` = the epoch confirmation pass reverted this checkpoint's code. */
  validation_state?: string | null;
  /** The checkpoint's own runner validation artifact (its steering gate result), when recorded. */
  artifact_path?: string | null;
}

/**
 * The target's active `unverified_match` rows (one per game) at import time:
 * the function is not done while any is active, and only the row's clear (an
 * enforced gate pass against its recorded trusted base, applied by
 * integration) ends that.
 */
export interface AttemptUnverifiedMatchRow {
  game_id: string;
  unit: string;
  symbol: string;
  base_rev: string | null;
}

export interface AttemptSourceCheckpointItem {
  disposition: string | null;
  item_status: string | null;
}

export interface AttemptSourceIntegration {
  id: string;
  status: string;
  disposition: string | null;
  conflict_paths_json: string | null;
  failure_reasons_json: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export type WorkerRunIntegrationDetail = IntegrationDetail;

export interface WorkerRunIntegrationDerivation {
  integration: "integrated" | "conflicted" | null;
  detail: WorkerRunIntegrationDetail | null;
}

function hasTable(db: Database, name: string): boolean {
  return db.query<{ present: number }, [string]>(
    "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?",
  ).get(name) !== null;
}

function hasColumn(db: Database, table: string, column: string): boolean {
  return db.query<{ name: string }, []>(`PRAGMA table_info(${table})`).all().some((row) => row.name === column);
}

function parseNote(metadata: string | null): string | null {
  if (metadata === null) return null;
  try {
    const parsed: unknown = JSON.parse(metadata);
    if (typeof parsed === "object" && parsed !== null && "note" in parsed) {
      const note = (parsed as { note?: unknown }).note;
      return typeof note === "string" ? note : null;
    }
  } catch {
    // Invalid historical metadata is ignored; the scored checkpoint is still usable.
  }
  return null;
}

/** `unit::symbol` split at the first separator (a C++ symbol may itself be namespaced); null without one. */
function splitTargetKey(targetKey: string): { unit: string; symbol: string } | null {
  const separator = targetKey.indexOf("::");
  return separator < 0 ? null : { unit: targetKey.slice(0, separator), symbol: targetKey.slice(separator + 2) };
}

/** The game of a worker state's run (`runs.game_id`), or undefined when the store does not record it. */
export function attemptRunGameId(db: Database, runId: string | null | undefined): string | undefined {
  if (!runId || !hasTable(db, "runs") || !hasColumn(db, "runs", "game_id")) return undefined;
  const row = db.query<{ game_id: string | null }, [string]>("SELECT game_id FROM runs WHERE id = ?").get(runId);
  return row?.game_id ?? undefined;
}

/**
 * The target's active `unverified_match` rows in the orchestrator store
 * (`steering_unverified_matches`, migration 015). A store behind that
 * migration, or a game that never ran the steering backfill (Melee, gate
 * off), has none. `game`: the target's unit is matched under each of its
 * spellings (`unitVariants`: steering rows omit the SMS `mario/` prefix).
 */
export function loadActiveUnverifiedMatches(db: Database, targetKey: string, game?: UnitKeyGame): AttemptUnverifiedMatchRow[] {
  const target = splitTargetKey(targetKey);
  if (!target || !hasTable(db, "steering_unverified_matches")) return [];
  const units = unitVariants(game, target.unit);
  return db.query<AttemptUnverifiedMatchRow, string[]>(`SELECT game_id, unit, symbol, base_rev
    FROM steering_unverified_matches
    WHERE unit IN (${sqlPlaceholders(units)}) AND symbol = ? AND cleared_at IS NULL
    ORDER BY game_id`).all(...units, target.symbol);
}

/**
 * Whether one checkpoint's 100 is withheld from the target's completion:
 * `steeringPrHolds` judged on the checkpoint's own evidence (validation time
 * and own runner validation). An active `unverified_match` row holds every
 * checkpoint; a function's latest steering rollback holds every checkpoint
 * not validated after it whose own enforced gate result does not certify the
 * function, so a historical 100% from before the rollback is never the match.
 */
export type AttemptMatchHold = (checkpoint: AttemptSourceCheckpoint) => boolean;

/**
 * Distinct games with steering state recorded for (unit, symbol):
 * `unverified_match` rows, active or cleared (migration 015), or rollbacks
 * (014). A cleared row keeps the target on the gated rule, so a run withheld
 * while it was active is re-judged (credited) once it clears.
 */
function steeringGamesFor(db: Database, units: readonly string[], symbol: string): string[] {
  const games = new Set<string>();
  const where = `unit IN (${sqlPlaceholders(units)}) AND symbol = ?`;
  if (hasTable(db, "steering_unverified_matches")) {
    for (const row of db.query<{ game_id: string }, string[]>(`SELECT DISTINCT game_id FROM steering_unverified_matches
      WHERE ${where}`).all(...units, symbol)) games.add(row.game_id);
  }
  if (hasTable(db, "steering_rollbacks")) {
    for (const row of db.query<{ game_id: string }, string[]>(`SELECT DISTINCT game_id FROM steering_rollbacks
      WHERE ${where}`).all(...units, symbol)) games.add(row.game_id);
  }
  return [...games].sort();
}

/**
 * The target's match hold in the orchestrator store `db`, or undefined when
 * no game recorded steering state for it (Melee, gate off, a store behind
 * migration 014): then nothing else is read and a checkpoint's own acceptance
 * decides. Recorded state means that game ran an active gate, whose mode does
 * not change a hold. `game`: the store's game, whose steering rows may spell
 * the target's (report) unit without its module prefix (`unitVariants`); the
 * holds then match it the same way (`steeringPrHolds` reads by game).
 */
export function loadAttemptMatchHold(
  db: Database,
  targetKey: string,
  game?: UnitKeyGame,
  options: { repoRoot?: string | null } = {},
): AttemptMatchHold | undefined {
  const target = splitTargetKey(targetKey);
  if (!target) return undefined;
  const { unit, symbol } = target;
  const units = unitVariants(game, unit);
  const games = steeringGamesFor(db, units, symbol);
  if (games.length === 0) return undefined;
  const store: StateStore = { db, orm: createOrchestratorStateOrm(db), path: db.filename, stateDir: dirname(db.filename) };
  const holds = games.map((gameId) => steeringPrHolds(store, { gameId, steeringGate: "enforce" }));
  const clearances = clearedUnverifiedRevs(db, units, symbol);
  return (checkpoint) => {
    const evidence = {
      validationTime: checkpoint.validation_time,
      runnerValidation: checkpointOwnRunnerValidation(checkpoint.artifact_path ?? null, parseObject(checkpoint.metadata_json)),
    };
    if (holds.some((hold) => hold.holdFor(unit, symbol, evidence) !== null)) return true;
    if (clearances.length === 0) return false;
    // A cleared row still holds a checkpoint whose code is not the certified version: its
    // integrated revision must be the certifying revision or a descendant of it
    // (`steeringCompletionHolds().at(rev)`). No revision (never landed) certifies nothing.
    const rev = checkpointIntegratedRev(db, checkpoint.id);
    return clearances.some((clearedRev) => !(rev && clearedRev
      && (clearedRev === rev || revisionIsAncestor(options.repoRoot ?? "", clearedRev, rev))));
  };
}

/**
 * A restoration checkpoint of `targetKey` counts once a landed gate-pass
 * certificate of the same target (`landedCertificates`: an unreverted
 * applied or resolved integration with a positive landed-content proof bound
 * to that landing; any spelling of the unit) sits at the restoration's own
 * integrated revision or a descendant of it. Without the game, a restoration
 * that never landed, an unreadable store, or revisions git cannot relate, it
 * never counts.
 */
export function loadRestorationCertification(
  db: Database,
  targetKey: string,
  gameId: string | null | undefined,
  options: { repoRoot?: string | null } = {},
): AttemptRestorationCertified {
  const target = splitTargetKey(targetKey);
  if (!target || !gameId) return () => false;
  let gatePassRevs: string[] | null = null;
  const certifiedRevs = (): string[] => {
    if (gatePassRevs) return gatePassRevs;
    const key = canonicalTargetKey(gameId, targetKey);
    const store: StateStore = { db, orm: createOrchestratorStateOrm(db), path: db.filename, stateDir: dirname(db.filename) };
    try {
      gatePassRevs = landedCertificates(store, gameId)
        .filter((certificate) => certificate.kind === "gate_pass" && certificate.key === key)
        .map((certificate) => certificate.integratedRev);
    } catch {
      // A store without the landing tables proves no landing.
      gatePassRevs = [];
    }
    return gatePassRevs;
  };
  return (checkpoint) => {
    const rev = checkpointIntegratedRev(db, checkpoint.id);
    if (!rev) return false;
    return certifiedRevs().some((gatePass) => gatePass === rev || revisionIsAncestor(options.repoRoot ?? "", rev, gatePass));
  };
}

/** Certifying revisions (`cleared_rev`, null when unrecorded) of the target's cleared `unverified_match` rows. */
function clearedUnverifiedRevs(db: Database, units: readonly string[], symbol: string): Array<string | null> {
  if (!hasTable(db, "steering_unverified_matches")) return [];
  const column = hasColumn(db, "steering_unverified_matches", "cleared_rev") ? "cleared_rev" : "NULL";
  return db.query<{ cleared_rev: string | null }, string[]>(`SELECT ${column} AS cleared_rev FROM steering_unverified_matches
    WHERE unit IN (${sqlPlaceholders(units)}) AND symbol = ? AND cleared_at IS NOT NULL`).all(...units, symbol)
    .map((row) => row.cleared_rev === "" ? null : row.cleared_rev);
}

/** The revision a checkpoint landed at: its applied (or resolved) integration's `integrated_rev`, or null. */
function checkpointIntegratedRev(db: Database, checkpointId: string): string | null {
  if (!hasTable(db, "integration_outcomes") || !hasColumn(db, "integration_outcomes", "worker_checkpoint_id")) return null;
  const row = db.query<{ rev: string | null }, [string]>(`SELECT json_extract(metadata_json, '$.integrated_rev') AS rev
    FROM integration_outcomes
    WHERE worker_checkpoint_id = ? AND status IN ('applied', 'resolved') AND json_valid(metadata_json)
    ORDER BY updated_at DESC LIMIT 1`).get(checkpointId);
  return typeof row?.rev === "string" && row.rev.trim() ? row.rev.trim() : null;
}

function parseObject(value: string | null): Record<string, unknown> {
  if (value === null) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

/**
 * One checkpoint counts as the match only when it was accepted (hard gates,
 * including an enforced steering gate, passed) and the confirmation pass did
 * not revert it. A raw 100 alone is never the match.
 */
function isAcceptedMatchEvidence(checkpoint: AttemptSourceCheckpoint): boolean {
  if (checkpoint.exact_match !== 1 && checkpoint.new_score !== 100) return false;
  if (checkpoint.hard_gates_passed === 0) return false;
  return checkpoint.validation_state !== "regressed";
}

/**
 * The checkpoint was accepted as a restoration (`certification.kind:
 * "restoration"`): a base-identity proof that put back trusted source, never
 * certified progress, so its score is not a match of its own.
 */
export function isRestorationCheckpoint(checkpoint: Pick<AttemptSourceCheckpoint, "metadata_json">): boolean {
  const certification = parseObject(checkpoint.metadata_json)[CHECKPOINT_CERTIFICATION_KEY];
  return typeof certification === "object" && certification !== null
    && (certification as Record<string, unknown>).kind === "restoration";
}

/**
 * Whether a restoration checkpoint's score may count: a gate-pass certificate
 * for the same target landed at the restoration's revision or a descendant of
 * it. `loadRestorationCertification` for the target; omitted = never.
 */
export type AttemptRestorationCertified = (checkpoint: AttemptSourceCheckpoint) => boolean;

function parseStringArray(value: string | null): string[] {
  if (value === null || value.trim() === "") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function deriveConflictPaths(conflictPaths: readonly string[], failureReasons: readonly string[]): string[] {
  const paths = conflictPaths
    .map((path) => path.trim())
    .filter((path) => path !== "" && path !== "patch failed");
  const gitApplyError = /error:\s+(?:patch failed:\s+(.+?):\d+|(.+?):\s+patch does not apply)(?=\r?$)/gm;
  for (const failureReason of failureReasons) {
    for (const match of failureReason.matchAll(gitApplyError)) {
      const path = (match[1] ?? match[2])?.trim();
      if (path) paths.push(path);
    }
  }
  return [...new Set(paths)];
}

/**
 * Collapses checkpoint-level integration outcomes into one worker-run outcome.
 * Input order is ignored so callers cannot change the result accidentally.
 */
export function deriveWorkerRunIntegration(
  rows: readonly AttemptSourceIntegration[],
): WorkerRunIntegrationDerivation {
  const ordered = rows.map((row) => {
    const failureReasons = parseStringArray(row.failure_reasons_json);
    return {
      row,
      detail: {
        status: row.status,
        disposition: row.disposition,
        conflict_paths: deriveConflictPaths(parseStringArray(row.conflict_paths_json), failureReasons),
        failure_reasons: failureReasons,
        resolved_at: row.resolved_at,
      } satisfies WorkerRunIntegrationDetail,
    };
  }).sort((left, right) =>
    right.row.updated_at.localeCompare(left.row.updated_at)
      || right.row.created_at.localeCompare(left.row.created_at)
      || right.row.id.localeCompare(left.row.id)
  );
  if (ordered.length === 0) return { integration: null, detail: null };

  const conflicted = ordered.find(({ detail }) =>
    detail.conflict_paths.length > 0
      || detail.status === "resolved"
      || detail.status === "dropped"
      || detail.failure_reasons.length > 0
  );
  if (conflicted !== undefined) return { integration: "conflicted", detail: conflicted.detail };

  const integrated = ordered.find(({ detail }) =>
    detail.status === "applied" && detail.conflict_paths.length === 0
  );
  if (integrated !== undefined) return { integration: "integrated", detail: integrated.detail };
  return { integration: null, detail: ordered[0]!.detail };
}

export function hasAttemptErrorSignal(state: AttemptSourceWorkerState): boolean {
  return state.timeout_summary !== null
    || state.error_summary !== null
    || /error|timeout|crash|fail/i.test(state.lifecycle_status);
}

export function buildAttemptMechanicalRows(
  state: AttemptSourceWorkerState,
  checkpoints: readonly AttemptSourceCheckpoint[],
  items: readonly AttemptSourceCheckpointItem[],
  options: {
    targetId: string;
    closedAt: string;
    integration?: WorkerRunIntegrationDerivation;
    useLegacyIntegrationHeuristic?: boolean;
    /**
     * `loadActiveUnverifiedMatches` for the target; omitted = none active.
     * Any active row withholds the match whatever the checkpoints carry
     * (a certified attempt still pending integration included): only the
     * row's actual clear makes the function done.
     */
    unverifiedMatches?: readonly AttemptUnverifiedMatchRow[];
    /** `loadAttemptMatchHold` for the target; omitted = no steering hold. A held checkpoint is never the match. */
    matchHold?: AttemptMatchHold;
    /**
     * `loadRestorationCertification` for the target. A restoration's 100 (gated
     * or by the raw-score rule) is the match only once a later gate-pass
     * certificate covers it; omitted = never.
     */
    restorationCertified?: AttemptRestorationCertified;
  },
) {
  const last = checkpoints.at(-1);
  const unverified = (options.unverifiedMatches ?? []).length > 0;
  // Steering state recorded for the target: any accepted, unheld checkpoint is the match.
  // None (Melee, gate off): the final checkpoint's raw 100 decides, as before the gate.
  const gated = unverified || options.matchHold !== undefined;
  const restorationCounts = (checkpoint: AttemptSourceCheckpoint) =>
    !isRestorationCheckpoint(checkpoint) || options.restorationCertified?.(checkpoint) === true;
  const matched = last !== undefined && (gated
    ? !unverified && checkpoints.some((checkpoint) => isAcceptedMatchEvidence(checkpoint) && restorationCounts(checkpoint) && !options.matchHold?.(checkpoint))
    : (last.exact_match === 1 || last.new_score === 100) && restorationCounts(last));
  const finalOutcome = last === undefined ? "error" as const
    : matched ? "match" as const
    : state.baseline_score !== null && last.new_score > state.baseline_score ? "improvement" as const
    : "no_change" as const;
  const errorType = finalOutcome !== "error" ? null
    : state.timeout_summary !== null || /timeout/i.test(state.lifecycle_status) ? "timeout" as const
    : /build|compile/i.test(state.error_summary ?? "") ? "build_failure" as const
    : /tool/i.test(state.error_summary ?? "") ? "tool_failure" as const
    : "worker_crash" as const;
  const itemSignals = items.map((item) => `${item.disposition ?? ""} ${item.item_status ?? ""}`);
  const legacyIntegration = options.useLegacyIntegrationHeuristic === true
    ? itemSignals.some((value) => /conflict/i.test(value)) ? "conflicted" as const
      : itemSignals.some((value) => /integrat|merged/i.test(value)) ? "integrated" as const
      : null
    : null;
  const integration = options.integration?.integration ?? legacyIntegration;
  const id = `run:${state.id}`;
  return {
    run: {
      id,
      targetId: options.targetId,
      goal: `Match ${state.target_key} (worker ${state.worker_id}, epoch ${state.epoch_id})`,
      baseline: JSON.stringify({ score: state.baseline_score }),
      runId: state.run_id,
      workerStateId: state.id,
      finalOutcome,
      errorType,
      integration,
      integrationDetail: options.integration?.detail ?? null,
      startedAt: state.started_at,
      endedAt: state.ended_at,
      closedAt: state.ended_at ?? options.closedAt,
    },
    submissions: checkpoints.map((checkpoint, index) => {
      const note = parseNote(checkpoint.metadata_json);
      return {
        id: `${id}:sub:${index + 1}`,
        seq: index + 1,
        description: `checkpoint ${checkpoint.attempt_index} scored ${checkpoint.new_score}${note === null ? "" : `: ${note}`}`,
        hypothesis: null,
        score: checkpoint.new_score,
        submittedAt: checkpoint.validation_time,
        runtimeRef: checkpoint.id,
      };
    }),
  };
}

export function importAttempts(store: KnowledgeStoreHandle, options: AttemptsImportOptions): AttemptsImportResult {
  const source = new Database(options.orchestratorDbPath, { readonly: true });
  const currentWatermark = getWatermark(store, "attempt");
  let watermark = currentWatermark;
  let runs = 0;
  let submissions = 0;
  let skippedNoTarget = 0;
  let skippedNoSignal = 0;
  let skippedExisting = 0;

  try {
    // The watermark is deliberately opaque outside this importer. Row existence remains the
    // authoritative idempotency check in case source ordering changes between imports.
    if (currentWatermark !== null) {
      try {
        JSON.parse(currentWatermark) as { last_worker_state_id?: string };
      } catch {
        // A malformed legacy watermark cannot safely exclude any source rows.
      }
    }

    const states = hasTable(source, "worker_state")
      ? source.query<AttemptSourceWorkerState, []>(`SELECT id, run_id, epoch_id, target_claim_id, worker_id,
          target_key, lifecycle_status, started_at, ended_at, baseline_score, timeout_summary, error_summary
        FROM worker_state
        WHERE ended_at IS NOT NULL
          OR lifecycle_status NOT IN ('running', 'pending', 'starting', 'active')
        ORDER BY started_at, id`).all()
      : [];
    const checkpointsByWorker = hasTable(source, "worker_checkpoints");
    // Stores from before the gate columns carry only accepted checkpoints (see AttemptSourceCheckpoint).
    const gateColumns = checkpointsByWorker
      ? [
          hasColumn(source, "worker_checkpoints", "hard_gates_passed") ? "hard_gates_passed" : null,
          hasColumn(source, "worker_checkpoints", "validation_state") ? "validation_state" : null,
          hasColumn(source, "worker_checkpoints", "artifact_path") ? "artifact_path" : null,
        ].filter((column): column is string => column !== null)
      : [];
    const checkpointColumns = ["id", "attempt_index", "validation_time", "new_score", "exact_match", "metadata_json", ...gateColumns].join(", ");
    const itemsExist = hasTable(source, "checkpoint_items");
    const integrationTable = hasTable(source, "worker_output_integrations")
      ? "worker_output_integrations" as const
      : hasTable(source, "integration_outcomes") ? "integration_outcomes" as const : null;
    const clock = options.now ?? (() => new Date().toISOString());

    for (const state of states) {
      const integrationRows = integrationTable === null
        ? []
        : source.query<AttemptSourceIntegration, [string]>(`SELECT id, status, disposition,
            conflict_paths_json, failure_reasons_json, created_at, updated_at, resolved_at
          FROM ${integrationTable}
          WHERE worker_state_id = ?
          ORDER BY updated_at DESC, created_at DESC, id DESC`).all(state.id);
      const integration = deriveWorkerRunIntegration(integrationRows);
      const loadCheckpoints = () => checkpointsByWorker
        ? source.query<AttemptSourceCheckpoint, [string]>(`SELECT ${checkpointColumns}
          FROM worker_checkpoints
          WHERE worker_state_id = ? AND new_score IS NOT NULL
          ORDER BY attempt_index, validation_time, id`).all(state.id)
        : [];
      // Undefined without recorded steering state (Melee, gate off): an existing run is skipped untouched, as before.
      const gameId = options.gameId ?? attemptRunGameId(source, state.run_id);
      const matchHold = loadAttemptMatchHold(source, state.target_key, gameId, { repoRoot: options.repoRoot });
      const restorationCertified = loadRestorationCertification(source, state.target_key, gameId, { repoRoot: options.repoRoot });
      const existing = store.db.query<{ id: string; target_id: string; final_outcome: string; error_type: string | null }, [string]>(
        "SELECT id, target_id, final_outcome, error_type FROM worker_run WHERE worker_state_id = ?",
      ).get(state.id);
      if (existing !== null) {
        if (!options.dryRun && integrationTable !== null) {
          updateWorkerRunIntegration(store, existing.id, integration.integration, integration.detail);
        }
        // The outcome follows the current gate evidence: a run imported as a match whose
        // target the backfill has since marked `unverified_match`, or a steering rollback
        // has since rewritten, loses its completion credit, and regains it only once the
        // row is actually cleared or a checkpoint's own gate result certifies the rollback.
        // A run whose match rests on a restoration is re-judged the same way, gated or not.
        const existingCheckpoints = matchHold || existing.final_outcome === "match" ? loadCheckpoints() : [];
        if (matchHold || existingCheckpoints.some(isRestorationCheckpoint)) {
          const { run } = buildAttemptMechanicalRows(state, existingCheckpoints, [], {
            targetId: existing.target_id,
            closedAt: clock(),
            matchHold,
            restorationCertified,
          });
          if (!options.dryRun && (run.finalOutcome !== existing.final_outcome || run.errorType !== existing.error_type)) {
            store.db.query("UPDATE worker_run SET final_outcome = ?, error_type = ? WHERE id = ?")
              .run(run.finalOutcome, run.errorType, existing.id);
          }
        }
        skippedExisting++;
        continue;
      }

      const stableKey = state.target_key.replace("::", ":");
      const target = store.db.query<{ id: string }, [string]>(
        "SELECT id FROM target WHERE stable_key = ? AND identity_status = 'current'",
      ).get(stableKey);
      if (target === null) {
        skippedNoTarget++;
        continue;
      }

      const checkpoints = loadCheckpoints();
      if (checkpoints.length === 0 && !hasAttemptErrorSignal(state)) {
        skippedNoSignal++;
        continue;
      }

      let items: AttemptSourceCheckpointItem[] = [];
      if (itemsExist && checkpointsByWorker) {
        items = source.query<AttemptSourceCheckpointItem, [string, string | null, string | null]>(`SELECT disposition, item_status
          FROM checkpoint_items
          WHERE worker_checkpoint_id IN (SELECT id FROM worker_checkpoints WHERE worker_state_id = ?)
             OR (? IS NOT NULL AND target_claim_id = ?)`).all(state.id, state.target_claim_id, state.target_claim_id);
      } else if (itemsExist && state.target_claim_id !== null) {
        items = source.query<AttemptSourceCheckpointItem, [string]>(`SELECT disposition, item_status
          FROM checkpoint_items WHERE target_claim_id = ?`).all(state.target_claim_id);
      }
      const mechanical = buildAttemptMechanicalRows(state, checkpoints, items, {
        targetId: target.id,
        closedAt: clock(),
        integration,
        useLegacyIntegrationHeuristic: integrationTable === null,
        matchHold,
        restorationCertified,
      });

      if (!options.dryRun) {
        insertWorkerRun(store, mechanical.run, mechanical.submissions);
      }
      runs++;
      submissions += mechanical.submissions.length;
      watermark = JSON.stringify({ last_worker_state_id: state.id });
    }

    if (!options.dryRun && runs > 0 && watermark !== null) advanceWatermark(store, "attempt", watermark);
  } finally {
    source.close();
  }

  return {
    inserted: runs + submissions,
    skipped: skippedExisting + skippedNoTarget + skippedNoSignal,
    tasksEnqueued: 0,
    runs,
    submissions,
    skippedNoTarget,
    skippedNoSignal,
    watermark,
  };
}
