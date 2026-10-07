import type { StorageMigration } from "./types.js";

/**
 * Enforce-mode advisory acceptances (one row per accepted af2 fingerprint and
 * checkpoint) and the first-enabled time of each model-node lane kind, which
 * bounds lane catch-up so enabling a kind never backfills history.
 */
export const ACCEPTED_ADVISORY_DDL = `
CREATE TABLE IF NOT EXISTS accepted_advisory (
  fingerprint     TEXT NOT NULL,
  checkpoint_id   TEXT NOT NULL,
  run_id          TEXT NOT NULL,
  rule_id         TEXT NOT NULL,
  file            TEXT NOT NULL,
  full_line       TEXT NOT NULL,
  occurrences     INTEGER NOT NULL,
  decision_run_id TEXT,
  probability     REAL,
  served_model    TEXT,
  thresholds_json TEXT NOT NULL,
  accepted_at     TEXT NOT NULL,
  PRIMARY KEY (fingerprint, checkpoint_id)
);

CREATE TABLE IF NOT EXISTS model_node_lane_state (
  kind          TEXT PRIMARY KEY,
  enabled_since TEXT NOT NULL
);
`;

export const acceptedAdvisoryMigration: StorageMigration = {
  version: 11,
  name: "accepted_advisory",
  up(db) {
    db.exec(ACCEPTED_ADVISORY_DDL);
  },
};
