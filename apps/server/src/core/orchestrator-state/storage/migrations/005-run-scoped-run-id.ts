import type { Database } from "bun:sqlite";
import { RUN_SCOPED_TABLE_DDLS } from "./ddl.js";
import { rebuildTable } from "./rebuild-table.js";
import type { StorageMigration } from "./types.js";

const COPY_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  epochs: [
    "id", "run_id", "ordinal", "size_mode", "size_value", "worker_pool_size", "candidate_window", "status",
    "admitted_count", "finished_count", "fast_refresh_count", "boundary_status", "routing_summary_json",
    "created_at", "closed_at",
  ],
  epoch_targets: [
    "id", "epoch_id", "run_id", "target_key", "unit", "symbol", "source_path", "size", "baseline_score",
    "priority", "reason", "admission_index", "status", "admitted_at", "claimed_at", "finished_at",
  ],
  target_claims: [
    "id", "run_id", "epoch_id", "epoch_target_id", "worker_id", "base_rev", "write_set_json",
    "write_set_entries_json", "write_set_hash", "worktree_path", "ttl", "heartbeat_at", "status", "claimed_at",
    "closed_at", "close_reason",
  ],
  worker_state: [
    "id", "run_id", "epoch_id", "epoch_target_id", "target_claim_id", "worker_id", "target_key",
    "lifecycle_status", "write_set_json", "write_set_entries_json", "worker_session_ids_json", "artifact_dir",
    "worktree_path", "started_at", "ended_at", "baseline_score", "best_checkpoint_id", "best_score", "exact",
    "timeout_summary", "error_summary", "summary_json",
  ],
  worker_checkpoints: [
    "id", "worker_state_id", "run_id", "epoch_id", "epoch_target_id", "target_claim_id", "attempt_index",
    "validation_time", "old_score", "new_score", "delta", "exact_match", "hard_gates_passed",
    "improved_over_baseline", "selectable", "selected", "build_status", "qa_status", "objdiff_status",
    "validation_status", "validation_state", "artifact_path", "patch_path", "diff_path", "write_set_json",
    "failure_reasons_json", "metadata_json",
  ],
  write_set_widenings: [
    "id", "run_id", "epoch_id", "target_claim_id", "worker_state_id", "attempt_index", "category", "rung",
    "requested_paths_json", "approved_paths_json", "evidence_json", "status", "decided_by", "decision_reason",
    "validation_tier", "validation_evidence_json", "created_at", "decided_at", "validated_at",
  ],
  worker_output_integrations: [
    "id", "run_id", "epoch_id", "epoch_target_id", "target_claim_id", "worker_state_id",
    "worker_checkpoint_id", "status", "disposition", "target_key", "patch_path", "diff_path", "item_path",
    "summary_path", "check_stdout_path", "check_stderr_path", "apply_stdout_path", "apply_stderr_path",
    "write_set_json", "validation_state", "conflict_paths_json", "failure_reasons_json", "metadata_json",
    "created_at", "updated_at", "resolved_at",
  ],
};

function columnNames(db: Database, table: string): Set<string> {
  const rows = db.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return new Set(rows.map((row) => row.name));
}

function copySql(table: string): string {
  const columns = COPY_COLUMNS[table];
  if (!columns) throw new Error(`Migration 005 has no copy-column inventory for ${table}`);
  const targetColumns = columns.join(", ");
  const sourceColumns = columns.map((column) => column === "run_id" ? "session_id" : column).join(", ");
  return `INSERT INTO ${table} (${targetColumns}) SELECT ${sourceColumns} FROM ${table}__migration_old`;
}

export const runScopedRunIdMigration: StorageMigration = {
  version: 5,
  name: "run_scoped_run_id",
  up(db) {
    for (const definition of RUN_SCOPED_TABLE_DDLS) {
      const columns = columnNames(db, definition.name);
      const hasRunId = columns.has("run_id");
      const hasSessionId = columns.has("session_id");

      if (hasRunId && hasSessionId) {
        throw new Error(`Cannot migrate ${definition.name}: both run_id and session_id exist`);
      }
      if (!hasRunId && !hasSessionId) {
        throw new Error(`Cannot migrate ${definition.name}: neither run_id nor session_id exists`);
      }

      if (hasSessionId) {
        rebuildTable(db, definition.name, definition.tableDdl, copySql(definition.name));
      }

      // Renamed old-table indexes retain their names until rebuildTable drops
      // the old table. Recreate them only after that drop so IF NOT EXISTS
      // cannot silently skip an index that would otherwise disappear.
      db.exec(definition.indexesDdl);
    }
  },
};
