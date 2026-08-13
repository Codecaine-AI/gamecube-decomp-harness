import type { Database } from "bun:sqlite";
import type { StorageMigration } from "./types.js";

const RUN_INDEXES = [
  ["epochs_session_status", "epochs_run_status", "epochs (run_id, status, ordinal)"],
  ["epoch_targets_session_status", "epoch_targets_run_status", "epoch_targets (run_id, status)"],
  ["target_claims_session_status", "target_claims_run_status", "target_claims (run_id, status)"],
  ["worker_state_session_status", "worker_state_run_status", "worker_state (run_id, lifecycle_status)"],
  ["write_set_widenings_session", "write_set_widenings_run", "write_set_widenings (run_id, status, created_at)"],
  ["worker_output_integrations_session_status", "worker_output_integrations_run_status", "worker_output_integrations (run_id, status, created_at)"],
] as const;

export const runScopedIndexNamesMigration: StorageMigration = {
  version: 10,
  name: "run_scoped_index_names",
  up(db: Database) {
    for (const [legacyName, runName, target] of RUN_INDEXES) {
      db.exec(`DROP INDEX IF EXISTS ${legacyName}`);
      db.exec(`CREATE INDEX IF NOT EXISTS ${runName} ON ${target}`);
    }
  },
};
