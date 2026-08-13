import type { StorageMigration } from "./types.js";

export const PR_CAMPAIGN_DDL = `
  CREATE TABLE IF NOT EXISTS pr_campaigns (
    campaign_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    session_uuid TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL CONSTRAINT pr_campaigns_status_check CHECK (
      status IN ('preparing', 'in_review', 'working', 'completed', 'abandoned')
    ),
    trace_id TEXT NOT NULL,
    caused_by_event_id TEXT NOT NULL,
    blockers_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    closed_at TEXT,
    latest_event_sequence INTEGER NOT NULL DEFAULT 0,
    source_anchor_json TEXT NOT NULL,
    publication_policy_json TEXT NOT NULL DEFAULT '{"batch_size":4}'
  );

  CREATE TABLE IF NOT EXISTS pr_series (
    series_id TEXT PRIMARY KEY,
    campaign_id TEXT NOT NULL REFERENCES pr_campaigns(campaign_id),
    revision INTEGER NOT NULL DEFAULT 0,
    batch_index INTEGER NOT NULL,
    status TEXT NOT NULL CONSTRAINT pr_series_status_check CHECK (
      status IN ('prepared', 'published', 'changes_requested', 'revising', 'approved', 'merged', 'closed')
    ),
    branch TEXT NOT NULL,
    upstream_pr_number INTEGER,
    target_units_json TEXT NOT NULL DEFAULT '[]',
    last_validation_json TEXT,
    trace_id TEXT NOT NULL,
    caused_by_event_id TEXT NOT NULL,
    blockers_json TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS pr_work_items (
    item_id TEXT PRIMARY KEY,
    series_id TEXT NOT NULL REFERENCES pr_series(series_id),
    source_kind TEXT NOT NULL,
    source_id TEXT NOT NULL,
    status TEXT NOT NULL CONSTRAINT pr_work_items_status_check CHECK (
      status IN ('pending', 'in_progress', 'resolved', 'declined')
    ),
    summary TEXT NOT NULL,
    created_at TEXT NOT NULL,
    resolved_at TEXT
  );

  CREATE UNIQUE INDEX IF NOT EXISTS pr_campaigns_one_open_project
    ON pr_campaigns (project_id)
    WHERE status NOT IN ('completed', 'abandoned');
`;

const NAMED_UNIQUE_INDEX_BACKFILLS = [
  ["epoch_targets", "CREATE UNIQUE INDEX IF NOT EXISTS epoch_targets_epoch_key ON epoch_targets (epoch_id, target_key)"],
  ["target_claims", "CREATE UNIQUE INDEX IF NOT EXISTS target_claims_epoch_target ON target_claims (epoch_target_id)"],
  ["worker_state", "CREATE UNIQUE INDEX IF NOT EXISTS worker_state_target_claim ON worker_state (target_claim_id)"],
  ["worker_output_integrations", "CREATE UNIQUE INDEX IF NOT EXISTS worker_output_integrations_checkpoint ON worker_output_integrations (worker_checkpoint_id)"],
  ["session_timeline_entries", "CREATE UNIQUE INDEX IF NOT EXISTS session_timeline_entries_session_kind_entry ON session_timeline_entries (session_uuid, entry_kind, entry_id)"],
  ["sync_push_records", "CREATE UNIQUE INDEX IF NOT EXISTS sync_push_records_sync_series ON sync_push_records (sync_id, series_id)"],
  ["sync_invalidations", "CREATE UNIQUE INDEX IF NOT EXISTS sync_invalidations_sync_subject ON sync_invalidations (sync_id, subject_kind, subject_id)"],
  ["sync_knowledge_jobs", "CREATE UNIQUE INDEX IF NOT EXISTS sync_knowledge_jobs_sync_source ON sync_knowledge_jobs (sync_id, source_kind, source_id)"],
] as const;

export const prCampaignMigration: StorageMigration = {
  version: 14,
  name: "pr_campaign",
  up(db) {
    db.exec(PR_CAMPAIGN_DDL);
    const tableExists = db.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?");
    for (const [table, ddl] of NAMED_UNIQUE_INDEX_BACKFILLS) {
      if (tableExists.get(table)) db.exec(ddl);
    }
  },
};
