export const SCHEMA_MIGRATIONS_DDL = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  );
`;

export const PROJECT_EVENTS_DDL = `
  CREATE TABLE IF NOT EXISTS project_events (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL UNIQUE,
    event_type TEXT NOT NULL,
    schema_version INTEGER NOT NULL DEFAULT 1,
    project_id TEXT NOT NULL,
    subject_kind TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    correlation_id TEXT NOT NULL,
    causation_id TEXT NOT NULL,
    trace_id TEXT NOT NULL,
    span_id TEXT NOT NULL,
    actor TEXT NOT NULL CONSTRAINT project_events_actor_check CHECK (
      actor IN ('operator', 'runner', 'agent', 'guardian', 'external_observer')
    ),
    occurred_at TEXT NOT NULL,
    payload_json TEXT NOT NULL DEFAULT '{}'
  );

  CREATE INDEX IF NOT EXISTS project_events_subject_sequence
    ON project_events (subject_kind, subject_id, sequence);

  CREATE INDEX IF NOT EXISTS project_events_type_sequence
    ON project_events (event_type, sequence);

  CREATE INDEX IF NOT EXISTS project_events_correlation_sequence
    ON project_events (correlation_id, sequence);
`;

export const PROJECT_STATE_DDL = `
  CREATE TABLE IF NOT EXISTS project_state (
    project_id TEXT PRIMARY KEY,
    revision INTEGER NOT NULL DEFAULT 0,
    active_workflow_json TEXT,
    queued_requests_json TEXT NOT NULL DEFAULT '[]',
    blockers_json TEXT NOT NULL DEFAULT '[]',
    trace_id TEXT NOT NULL,
    caused_by_event_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`;

export const SYNC_STATE_DDL = `
  CREATE TABLE IF NOT EXISTS sync_state (
    sync_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    session_uuid TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL CONSTRAINT sync_state_status_check CHECK (
      status IN (
        'requested', 'ingesting', 'reconciling', 'validating', 'validated',
        'publishing', 'published', 'blocked', 'cancelled'
      )
    ),
    trace_id TEXT NOT NULL,
    caused_by_event_id TEXT NOT NULL,
    blockers_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    latest_event_sequence INTEGER NOT NULL DEFAULT 0,
    intake_json TEXT NOT NULL DEFAULT '{}',
    staging_json TEXT,
    pr_reconciliation_json TEXT NOT NULL DEFAULT '[]',
    publication_json TEXT
  );

  CREATE UNIQUE INDEX IF NOT EXISTS sync_state_one_non_terminal_project
    ON sync_state (project_id)
    WHERE status NOT IN ('published', 'cancelled');
`;

export const SYNC_PUBLICATION_DDL = `
  CREATE TABLE IF NOT EXISTS project_upstream_anchors (
    project_id TEXT PRIMARY KEY,
    session_uuid TEXT NOT NULL,
    upstream_revision TEXT NOT NULL,
    sync_id TEXT NOT NULL,
    caused_by_event_id TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS project_upstream_anchors_session
    ON project_upstream_anchors (session_uuid);

  CREATE TABLE IF NOT EXISTS sync_push_records (
    push_id TEXT PRIMARY KEY,
    sync_id TEXT NOT NULL,
    series_id TEXT NOT NULL,
    branch TEXT NOT NULL,
    remote_name TEXT NOT NULL,
    expected_remote_head TEXT,
    new_head TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending' CONSTRAINT sync_push_records_status_check CHECK (
      status IN ('pending', 'pushing', 'pushed', 'failed')
    ),
    attempt_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    caused_by_event_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    pushed_at TEXT
  );

  CREATE UNIQUE INDEX IF NOT EXISTS sync_push_records_sync_series
    ON sync_push_records (sync_id, series_id);

  CREATE INDEX IF NOT EXISTS sync_push_records_sync_status
    ON sync_push_records (sync_id, status);

  CREATE TABLE IF NOT EXISTS sync_invalidations (
    invalidation_id TEXT PRIMARY KEY,
    sync_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    session_uuid TEXT NOT NULL,
    subject_kind TEXT NOT NULL CONSTRAINT sync_invalidations_subject_kind_check CHECK (
      subject_kind IN ('target', 'checkpoint', 'pr_snapshot')
    ),
    subject_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    caused_by_event_id TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS sync_invalidations_sync_subject
    ON sync_invalidations (sync_id, subject_kind, subject_id);

  CREATE INDEX IF NOT EXISTS sync_invalidations_project_subject
    ON sync_invalidations (project_id, subject_kind, subject_id);

  CREATE TABLE IF NOT EXISTS knowledge_revisions (
    revision INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL,
    digest TEXT NOT NULL,
    sync_id TEXT,
    caused_by_event_id TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS knowledge_revisions_project_revision
    ON knowledge_revisions (project_id, revision);

  CREATE TABLE IF NOT EXISTS sync_knowledge_jobs (
    job_id TEXT PRIMARY KEY,
    sync_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    source_kind TEXT NOT NULL CONSTRAINT sync_knowledge_jobs_source_kind_check CHECK (
      source_kind IN ('merged_pr', 'corpus')
    ),
    source_id TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'queued' CONSTRAINT sync_knowledge_jobs_status_check CHECK (
      status IN ('queued', 'processing', 'waiting', 'succeeded', 'failed', 'cancelled')
    ),
    provenance_json TEXT NOT NULL DEFAULT '{}',
    staged_artifact_path TEXT,
    staged_digest TEXT,
    caused_by_event_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS sync_knowledge_jobs_sync_source
    ON sync_knowledge_jobs (sync_id, source_kind, source_id);

  CREATE INDEX IF NOT EXISTS sync_knowledge_jobs_sync_status
    ON sync_knowledge_jobs (sync_id, status);
`;

export const SYNC_PUBLICATION_INTENTS_DDL = `
  CREATE TABLE IF NOT EXISTS sync_publication_intents (
    sync_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    session_uuid TEXT NOT NULL,
    session_worktree_path TEXT NOT NULL,
    prior_head TEXT NOT NULL,
    new_head TEXT NOT NULL,
    worktree_state_json TEXT NOT NULL,
    boundary_plan_json TEXT NOT NULL,
    publishing_event_id TEXT NOT NULL,
    boundary_event_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS sync_publication_intents_project
    ON sync_publication_intents (project_id, created_at);
`;

export const RUNS_DDL = `
  CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    goal_kind TEXT NOT NULL,
    goal_value REAL NOT NULL,
    baseline_report_sha TEXT,
    current_report_sha TEXT,
    desired_workers INTEGER NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    project_id TEXT,
    project_kind TEXT,
    project_repo_root TEXT,
    project_state_dir TEXT,
    project_graph_db TEXT,
    project_descriptor_path TEXT,
    project_local_override_path TEXT,
    revision INTEGER NOT NULL DEFAULT 0,
    trace_id TEXT,
    caused_by_event_id TEXT,
    blockers_json TEXT NOT NULL DEFAULT '[]',
    head_revision TEXT,
    session_uuid TEXT,
    inputs_json TEXT,
    stop_request_json TEXT,
    terminal_reason TEXT,
    scheduler_condition TEXT,
    remote_application_ids_json TEXT NOT NULL DEFAULT '[]'
  );
`;

export const SESSION_TIMELINE_ENTRIES_DDL = `
  CREATE TABLE IF NOT EXISTS session_timeline_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_uuid TEXT NOT NULL,
    entry_kind TEXT NOT NULL CONSTRAINT session_timeline_entries_kind_check CHECK (
      entry_kind IN ('epoch_completed', 'remote_application', 'pr_phase', 'save_point')
    ),
    entry_id TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    payload_json TEXT NOT NULL DEFAULT '{}',
    caused_by_event_id TEXT
  );

  CREATE UNIQUE INDEX IF NOT EXISTS session_timeline_entries_session_kind_entry
    ON session_timeline_entries (session_uuid, entry_kind, entry_id);

  CREATE INDEX IF NOT EXISTS session_timeline_entries_session_order
    ON session_timeline_entries (session_uuid, id);
`;

export const PENDING_INTEGRATIONS_DDL = `
  CREATE TABLE IF NOT EXISTS pending_integrations (
    epoch_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    branch TEXT NOT NULL,
    parent_sha TEXT NOT NULL,
    message_marker TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS pending_integrations_run_created
    ON pending_integrations (run_id, created_at);
`;

export const RUN_RECOVERY_JOURNAL_DDL = `
  CREATE TABLE IF NOT EXISTS run_recovery_journal (
    recovery_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    action TEXT NOT NULL,
    command_id TEXT NOT NULL,
    correlation_id TEXT NOT NULL,
    recovery_reason TEXT NOT NULL,
    expected_run_revision INTEGER NOT NULL,
    cancelled_claim_ids_json TEXT NOT NULL DEFAULT '[]',
    cancelled_operation_ids_json TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'prepared' CONSTRAINT run_recovery_journal_status_check CHECK (
      status IN ('prepared', 'completed')
    ),
    caused_by_event_id TEXT,
    created_at TEXT NOT NULL,
    completed_at TEXT
  );

  CREATE UNIQUE INDEX IF NOT EXISTS run_recovery_journal_one_prepared_run
    ON run_recovery_journal (run_id) WHERE status = 'prepared';

  CREATE INDEX IF NOT EXISTS run_recovery_journal_run_created
    ON run_recovery_journal (run_id, created_at);
`;

export interface RunScopedTableDdl {
  readonly name: string;
  readonly tableDdl: string;
  readonly indexesDdl: string;
}

export const RUN_SCOPED_TABLE_DDLS: readonly RunScopedTableDdl[] = [
  {
    name: "epochs",
    tableDdl: `
      CREATE TABLE IF NOT EXISTS epochs (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        ordinal INTEGER NOT NULL,
        size_mode TEXT NOT NULL,
        size_value INTEGER,
        worker_pool_size INTEGER NOT NULL,
        candidate_window INTEGER NOT NULL,
        status TEXT NOT NULL,
        admitted_count INTEGER NOT NULL DEFAULT 0,
        finished_count INTEGER NOT NULL DEFAULT 0,
        fast_refresh_count INTEGER NOT NULL DEFAULT 0,
        boundary_status TEXT,
        routing_summary_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        closed_at TEXT
      );
    `,
    indexesDdl: `
      CREATE INDEX IF NOT EXISTS epochs_run_status
        ON epochs (run_id, status, ordinal);
    `,
  },
  {
    name: "epoch_targets",
    tableDdl: `
      CREATE TABLE IF NOT EXISTS epoch_targets (
        id TEXT PRIMARY KEY,
        epoch_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        target_key TEXT NOT NULL,
        unit TEXT NOT NULL,
        symbol TEXT NOT NULL,
        source_path TEXT NOT NULL,
        size INTEGER NOT NULL,
        baseline_score REAL NOT NULL,
        priority REAL NOT NULL,
        reason TEXT,
        admission_index INTEGER NOT NULL,
        status TEXT NOT NULL,
        admitted_at TEXT NOT NULL,
        claimed_at TEXT,
        finished_at TEXT
      );
    `,
    indexesDdl: `
      CREATE INDEX IF NOT EXISTS epoch_targets_epoch_status
        ON epoch_targets (epoch_id, status, admission_index);

      CREATE UNIQUE INDEX IF NOT EXISTS epoch_targets_epoch_key
        ON epoch_targets (epoch_id, target_key);

      CREATE INDEX IF NOT EXISTS epoch_targets_run_status
        ON epoch_targets (run_id, status);
    `,
  },
  {
    name: "target_claims",
    tableDdl: `
      CREATE TABLE IF NOT EXISTS target_claims (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        epoch_id TEXT NOT NULL,
        epoch_target_id TEXT NOT NULL,
        worker_id TEXT NOT NULL,
        base_rev TEXT,
        write_set_json TEXT NOT NULL DEFAULT '[]',
        write_set_entries_json TEXT NOT NULL DEFAULT '[]',
        write_set_hash TEXT,
        worktree_path TEXT,
        ttl TEXT,
        heartbeat_at TEXT,
        status TEXT NOT NULL,
        claimed_at TEXT NOT NULL,
        closed_at TEXT,
        close_reason TEXT
      );
    `,
    indexesDdl: `
      CREATE INDEX IF NOT EXISTS target_claims_run_status
        ON target_claims (run_id, status);

      CREATE UNIQUE INDEX IF NOT EXISTS target_claims_epoch_target
        ON target_claims (epoch_target_id);
    `,
  },
  {
    name: "worker_state",
    tableDdl: `
      CREATE TABLE IF NOT EXISTS worker_state (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        epoch_id TEXT NOT NULL,
        epoch_target_id TEXT NOT NULL,
        target_claim_id TEXT NOT NULL,
        worker_id TEXT NOT NULL,
        target_key TEXT NOT NULL,
        lifecycle_status TEXT NOT NULL,
        write_set_json TEXT NOT NULL DEFAULT '[]',
        write_set_entries_json TEXT NOT NULL DEFAULT '[]',
        worker_session_ids_json TEXT NOT NULL DEFAULT '[]',
        artifact_dir TEXT,
        worktree_path TEXT,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        baseline_score REAL,
        best_checkpoint_id TEXT,
        best_score REAL,
        exact INTEGER NOT NULL DEFAULT 0,
        timeout_summary TEXT,
        error_summary TEXT,
        summary_json TEXT NOT NULL DEFAULT '{}'
      );
    `,
    indexesDdl: `
      CREATE INDEX IF NOT EXISTS worker_state_run_status
        ON worker_state (run_id, lifecycle_status);

      CREATE UNIQUE INDEX IF NOT EXISTS worker_state_target_claim
        ON worker_state (target_claim_id);
    `,
  },
  {
    name: "worker_checkpoints",
    tableDdl: `
      CREATE TABLE IF NOT EXISTS worker_checkpoints (
        id TEXT PRIMARY KEY,
        worker_state_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        epoch_id TEXT NOT NULL,
        epoch_target_id TEXT NOT NULL,
        target_claim_id TEXT NOT NULL,
        attempt_index INTEGER NOT NULL,
        validation_time TEXT NOT NULL,
        old_score REAL,
        new_score REAL,
        delta REAL,
        exact_match INTEGER NOT NULL DEFAULT 0,
        hard_gates_passed INTEGER NOT NULL DEFAULT 0,
        improved_over_baseline INTEGER NOT NULL DEFAULT 0,
        selectable INTEGER NOT NULL DEFAULT 0,
        selected INTEGER NOT NULL DEFAULT 0,
        build_status TEXT,
        qa_status TEXT,
        objdiff_status TEXT,
        validation_status TEXT NOT NULL,
        validation_state TEXT NOT NULL DEFAULT 'tentative',
        artifact_path TEXT,
        patch_path TEXT,
        diff_path TEXT,
        write_set_json TEXT NOT NULL DEFAULT '[]',
        failure_reasons_json TEXT NOT NULL DEFAULT '[]',
        metadata_json TEXT NOT NULL DEFAULT '{}'
      );
    `,
    indexesDdl: `
      CREATE INDEX IF NOT EXISTS worker_checkpoints_state_selectable
        ON worker_checkpoints (worker_state_id, selectable, exact_match, new_score, validation_time);

      CREATE INDEX IF NOT EXISTS worker_checkpoints_epoch_target
        ON worker_checkpoints (epoch_id, epoch_target_id);
    `,
  },
  {
    name: "write_set_widenings",
    tableDdl: `
      CREATE TABLE IF NOT EXISTS write_set_widenings (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        epoch_id TEXT NOT NULL,
        target_claim_id TEXT NOT NULL,
        worker_state_id TEXT NOT NULL,
        attempt_index INTEGER NOT NULL,
        category TEXT NOT NULL,
        rung INTEGER NOT NULL,
        requested_paths_json TEXT NOT NULL DEFAULT '[]',
        approved_paths_json TEXT NOT NULL DEFAULT '[]',
        evidence_json TEXT NOT NULL DEFAULT '{}',
        status TEXT NOT NULL,
        decided_by TEXT,
        decision_reason TEXT,
        validation_tier INTEGER,
        validation_evidence_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        decided_at TEXT,
        validated_at TEXT
      );
    `,
    indexesDdl: `
      CREATE INDEX IF NOT EXISTS write_set_widenings_run
        ON write_set_widenings (run_id, status, created_at);
    `,
  },
  {
    name: "worker_output_integrations",
    tableDdl: `
      CREATE TABLE IF NOT EXISTS worker_output_integrations (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        epoch_id TEXT NOT NULL,
        epoch_target_id TEXT NOT NULL,
        target_claim_id TEXT NOT NULL,
        worker_state_id TEXT NOT NULL,
        worker_checkpoint_id TEXT,
        status TEXT NOT NULL,
        disposition TEXT,
        target_key TEXT,
        patch_path TEXT,
        diff_path TEXT,
        item_path TEXT,
        summary_path TEXT,
        check_stdout_path TEXT,
        check_stderr_path TEXT,
        apply_stdout_path TEXT,
        apply_stderr_path TEXT,
        write_set_json TEXT NOT NULL DEFAULT '[]',
        validation_state TEXT NOT NULL DEFAULT 'tentative',
        conflict_paths_json TEXT NOT NULL DEFAULT '[]',
        failure_reasons_json TEXT NOT NULL DEFAULT '[]',
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        resolved_at TEXT
      );
    `,
    indexesDdl: `
      CREATE INDEX IF NOT EXISTS worker_output_integrations_run_status
        ON worker_output_integrations (run_id, status, created_at);

      CREATE UNIQUE INDEX IF NOT EXISTS worker_output_integrations_checkpoint
        ON worker_output_integrations (worker_checkpoint_id);
    `,
  },
] as const;

export const RUN_SCOPED_TABLES_DDL = RUN_SCOPED_TABLE_DDLS
  .map(({ tableDdl }) => tableDdl)
  .join("\n");

export const RUN_SCOPED_INDEXES_DDL = RUN_SCOPED_TABLE_DDLS
  .map(({ indexesDdl }) => indexesDdl)
  .join("\n");
