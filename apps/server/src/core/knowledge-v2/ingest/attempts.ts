import { Database } from "bun:sqlite";
import type { KnowledgeStoreHandle } from "../records/index.js";
import { advanceWatermark, getWatermark, insertWorkerRun } from "../records/index.js";
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

export function hasAttemptErrorSignal(state: AttemptSourceWorkerState): boolean {
  return state.timeout_summary !== null
    || state.error_summary !== null
    || /error|timeout|crash|fail/i.test(state.lifecycle_status);
}

export function buildAttemptMechanicalRows(
  state: AttemptSourceWorkerState,
  checkpoints: readonly AttemptSourceCheckpoint[],
  items: readonly AttemptSourceCheckpointItem[],
  options: { targetId: string; closedAt: string },
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
  const integration = itemSignals.some((value) => /conflict/i.test(value)) ? "conflicted" as const
    : itemSignals.some((value) => /integrat|merged/i.test(value)) ? "integrated" as const
    : null;
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
    const clock = options.now ?? (() => new Date().toISOString());

    for (const state of states) {
      if (store.db.query<{ present: number }, [string]>(
        "SELECT 1 AS present FROM worker_run WHERE worker_state_id = ?",
      ).get(state.id) !== null) {
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
