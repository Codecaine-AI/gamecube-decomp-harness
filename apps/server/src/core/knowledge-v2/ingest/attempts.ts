import { Database } from "bun:sqlite";
import type { KnowledgeStoreHandle } from "../records/index.js";
import { advanceWatermark, getWatermark, insertWorkerRun, updateWorkerRunIntegration } from "../records/index.js";
import type { IntegrationDetail } from "../storage/schema.js";
import type { AttemptsImportResult, LaneOptions } from "./types.js";

export interface AttemptsImportOptions extends LaneOptions {
  orchestratorDbPath: string;
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

/**
 * Collapses checkpoint-level integration outcomes into one worker-run outcome.
 * Input order is ignored so callers cannot change the result accidentally.
 */
export function deriveWorkerRunIntegration(
  rows: readonly AttemptSourceIntegration[],
): WorkerRunIntegrationDerivation {
  const ordered = rows.map((row) => ({
    row,
    detail: {
      status: row.status,
      disposition: row.disposition,
      conflict_paths: parseStringArray(row.conflict_paths_json),
      failure_reasons: parseStringArray(row.failure_reasons_json),
      resolved_at: row.resolved_at,
    } satisfies WorkerRunIntegrationDetail,
  })).sort((left, right) =>
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
  },
) {
  const last = checkpoints.at(-1);
  const finalOutcome = last === undefined ? "error" as const
    : last.exact_match === 1 || last.new_score === 100 ? "match" as const
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
      const existing = store.db.query<{ id: string }, [string]>(
        "SELECT id FROM worker_run WHERE worker_state_id = ?",
      ).get(state.id);
      if (existing !== null) {
        if (!options.dryRun && integrationTable !== null) {
          updateWorkerRunIntegration(store, existing.id, integration.integration, integration.detail);
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

      const checkpoints = checkpointsByWorker
        ? source.query<AttemptSourceCheckpoint, [string]>(`SELECT id, attempt_index, validation_time, new_score,
            exact_match, metadata_json
          FROM worker_checkpoints
          WHERE worker_state_id = ? AND new_score IS NOT NULL
          ORDER BY attempt_index, validation_time, id`).all(state.id)
        : [];
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
