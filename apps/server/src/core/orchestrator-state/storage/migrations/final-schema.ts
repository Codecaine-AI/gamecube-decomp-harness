/** Canonical schema captured after the 019 data-clean migration. */
export const FINAL_SCHEMA_DDL = `
CREATE TABLE attempts (
      id TEXT PRIMARY KEY,
      lease_id TEXT,
      target_id TEXT,
      artifact_path TEXT,
      compiled INTEGER NOT NULL DEFAULT 0,
      old_score REAL,
      new_score REAL,
      delta REAL,
      status TEXT NOT NULL
    , attempt_index INTEGER, created_at TEXT);

CREATE TABLE campaigns (
      id TEXT PRIMARY KEY,
      "game_id" TEXT,
      branch TEXT,
      base_ref TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

CREATE TABLE checkpoint_items (id TEXT PRIMARY KEY, checkpoint_id TEXT NOT NULL, run_id TEXT NOT NULL, worker_checkpoint_id TEXT, target_claim_id TEXT, target_key TEXT NOT NULL, unit TEXT, symbol TEXT, source_path TEXT, lifecycle_status TEXT NOT NULL, disposition TEXT NOT NULL, item_status TEXT NOT NULL, exact_match INTEGER NOT NULL DEFAULT 0, pr_candidate INTEGER NOT NULL DEFAULT 0, patch_path TEXT, summary_path TEXT, state_summary TEXT, evidence_json TEXT NOT NULL, created_at TEXT NOT NULL);

CREATE TABLE cycle_timeline_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cycle_uuid TEXT NOT NULL,
        entry_kind TEXT NOT NULL CONSTRAINT cycle_timeline_entries_kind_check CHECK (
          entry_kind IN ('epoch_completed', 'remote_application', 'pr_phase', 'save_point')
        ),
        entry_id TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        payload_json TEXT NOT NULL DEFAULT '{}',
        caused_by_event_id TEXT,
        UNIQUE(cycle_uuid, entry_kind, entry_id)
      );

CREATE TABLE "cycles" (
      id TEXT PRIMARY KEY,
      "game_id" TEXT NOT NULL,
      "cycle_uuid" TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL,
      phase TEXT NOT NULL,
      active_run_id TEXT,
      base_ref TEXT,
      base_sha TEXT,
      preparing_state_json TEXT NOT NULL DEFAULT '{}',
      running_state_json TEXT NOT NULL DEFAULT '{}',
      pr_state_json TEXT NOT NULL DEFAULT '{}',
      complete_state_json TEXT NOT NULL DEFAULT '{}',
      process_state_json TEXT NOT NULL DEFAULT '{}',
      kernel_trace_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    , revision INTEGER NOT NULL DEFAULT 0, head_revision TEXT, trace_id TEXT, blockers_json TEXT NOT NULL DEFAULT '[]', save_point_stale INTEGER NOT NULL DEFAULT 0, caused_by_event_id TEXT, closed_at TEXT);

CREATE TABLE dashboard_artifacts (
      id TEXT PRIMARY KEY,
      run_id TEXT,
      "game_id" TEXT,
      "cycle_uuid" TEXT,
      artifact_type TEXT NOT NULL,
      artifact_key TEXT NOT NULL,
      source_path TEXT,
      source_label TEXT,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

CREATE TABLE director_cycles (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      trigger_event TEXT NOT NULL,
      active_workers INTEGER NOT NULL DEFAULT 0,
      summary_path TEXT,
      decision_path TEXT,
      created_at TEXT NOT NULL
    );

CREATE TABLE dispatch_handoff_snapshots (
      snapshot_id TEXT PRIMARY KEY,
      game_id TEXT NOT NULL,
      content_json TEXT NOT NULL CONSTRAINT dispatch_handoff_snapshots_content_json_check CHECK (
        json_valid(content_json)
      ),
      content_hash TEXT NOT NULL UNIQUE CONSTRAINT dispatch_handoff_snapshots_content_hash_check CHECK (
        length(content_hash) = 64 AND content_hash NOT GLOB '*[^0-9a-f]*'
      ),
      old_lease_holder_json TEXT NOT NULL,
      requested_handoff_json TEXT,
      terminal_game_revision INTEGER NOT NULL,
      release_event_id TEXT NOT NULL UNIQUE REFERENCES game_events(event_id),
      acquisition_event_id TEXT UNIQUE REFERENCES game_events(event_id),
      created_at TEXT NOT NULL
    );

CREATE TABLE epoch_targets (
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
        finished_at TEXT,
        UNIQUE(epoch_id, target_key)
      );

CREATE TABLE epoch_verdicts (
      id TEXT PRIMARY KEY,
      "run_id" TEXT NOT NULL,
      epoch_id TEXT NOT NULL,
      epoch_target_id TEXT NOT NULL,
      verdict TEXT NOT NULL,
      report_path TEXT,
      evidence_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      UNIQUE(epoch_id, epoch_target_id)
    );

CREATE TABLE epochs (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        ordinal INTEGER NOT NULL,
        worker_pool_size INTEGER NOT NULL,
        status TEXT NOT NULL,
        admitted_count INTEGER NOT NULL DEFAULT 0,
        finished_count INTEGER NOT NULL DEFAULT 0,
        fast_refresh_count INTEGER NOT NULL DEFAULT 0,
        boundary_status TEXT,
        routing_summary_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        closed_at TEXT
      );

CREATE TABLE events (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      producer TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      handled_at TEXT,
      created_at TEXT NOT NULL
    );

CREATE TABLE facts (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      fact_type TEXT NOT NULL,
      subject TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      evidence_path TEXT,
      confidence REAL,
      status TEXT NOT NULL
    );

CREATE TABLE game_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL UNIQUE,
      event_type TEXT NOT NULL,
      schema_version INTEGER NOT NULL DEFAULT 1,
      game_id TEXT NOT NULL,
      subject_kind TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      correlation_id TEXT NOT NULL,
      causation_id TEXT NOT NULL,
      trace_id TEXT NOT NULL,
      span_id TEXT NOT NULL,
      actor TEXT NOT NULL CONSTRAINT game_events_actor_check CHECK (
        actor IN ('operator', 'runner', 'agent', 'guardian', 'external_observer')
      ),
      occurred_at TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      parent_span_id TEXT
    );

CREATE TABLE "game_upstream_anchors" (
    "game_id" TEXT PRIMARY KEY,
    "cycle_uuid" TEXT NOT NULL,
    upstream_revision TEXT NOT NULL,
    sync_id TEXT NOT NULL,
    caused_by_event_id TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

CREATE TABLE "harness_state" (
    "game_id" TEXT PRIMARY KEY,
    revision INTEGER NOT NULL DEFAULT 0,
    active_workflow_json TEXT,
    queued_requests_json TEXT NOT NULL DEFAULT '[]',
    blockers_json TEXT NOT NULL DEFAULT '[]',
    trace_id TEXT NOT NULL,
    caused_by_event_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

CREATE TABLE integrations (
      id TEXT PRIMARY KEY,
      attempt_id TEXT,
      base_rev TEXT,
      patch_path TEXT,
      validation_path TEXT,
      old_matched_code_percent REAL,
      new_matched_code_percent REAL,
      status TEXT NOT NULL,
      integrated_rev TEXT
    );

CREATE TABLE jobs (
  job_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,                        -- 'worker' | 'knowledge_absorption' | 'sync_publication' | 'integration'
  dedupe_key TEXT NOT NULL,                  -- natural key within kind
  game_id TEXT NOT NULL, run_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('queued','claimed','running','waiting','succeeded','failed','cancelled')),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  priority INTEGER NOT NULL DEFAULT 0,       -- worker: board priority; others: 0 (FIFO)
  concurrency_key TEXT,                      -- e.g. 'integration' singleton; NULL = kind-level limit only
  execution_class TEXT NOT NULL DEFAULT 'local' CHECK (execution_class IN ('local','sandbox')),
  lease_id TEXT, lease_expires_at TEXT,      -- visibility timeout; renewed by heartbeat for dispatched kinds
  attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),   -- small: ids + params only
  result_ref TEXT,                           -- id into domain tables (worker_state id, publication digest, ...)
  error_json TEXT, trace_id TEXT,
  caused_by_event_id TEXT REFERENCES game_events(event_id),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT,
  UNIQUE (kind, dedupe_key)
);

CREATE TABLE knowledge_revisions (
    revision INTEGER PRIMARY KEY AUTOINCREMENT,
    "game_id" TEXT NOT NULL,
    digest TEXT NOT NULL,
    sync_id TEXT,
    caused_by_event_id TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

CREATE TABLE pending_integrations (
    epoch_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    branch TEXT NOT NULL,
    parent_sha TEXT NOT NULL,
    message_marker TEXT NOT NULL,
    created_at TEXT NOT NULL
  , attempt INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'prepared', failure_reason TEXT, failed_at TEXT);

CREATE TABLE pi_sessions (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      lease_id TEXT,
      role TEXT NOT NULL,
      session_id TEXT NOT NULL,
      session_file TEXT,
      provider TEXT,
      model TEXT,
      thinking_level TEXT,
      status TEXT NOT NULL,
      output_path TEXT,
      created_at TEXT NOT NULL
    , target_claim_id TEXT);

CREATE TABLE pr_batch_publication_series (
    publication_id TEXT NOT NULL REFERENCES pr_batch_publications(publication_id),
    series_id TEXT NOT NULL REFERENCES pr_series(series_id),
    ordinal INTEGER NOT NULL,
    revision INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending' CONSTRAINT pr_batch_publication_series_status_check CHECK (
      status IN ('pending', 'publishing', 'published')
    ),
    owner_token TEXT,
    reserved_series_revision INTEGER,
    validation_timestamp TEXT,
    invalidation_watermark TEXT,
    upstream_pr_number INTEGER,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (publication_id, series_id)
  );

CREATE TABLE pr_batch_publications (
    publication_id TEXT PRIMARY KEY,
    campaign_id TEXT NOT NULL REFERENCES pr_campaigns(campaign_id),
    batch_index INTEGER NOT NULL,
    series_ids_json TEXT NOT NULL,
    idempotency_key TEXT NOT NULL UNIQUE,
    revision INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'reserved' CONSTRAINT pr_batch_publications_status_check CHECK (
      status IN ('reserved', 'publishing', 'completed')
    ),
    owner_token TEXT,
    batch_event_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT
  );

CREATE TABLE pr_campaigns (
    campaign_id TEXT PRIMARY KEY,
    "game_id" TEXT NOT NULL,
    "cycle_uuid" TEXT NOT NULL,
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

CREATE TABLE pr_series (
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

CREATE TABLE pr_work_items (
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

CREATE TABLE run_checkpoints (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      checkpoint_type TEXT NOT NULL,
      status TEXT NOT NULL,
      artifact_dir TEXT NOT NULL,
      summary_path TEXT NOT NULL,
      pr_candidates_path TEXT NOT NULL,
      carry_forward_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );

CREATE TABLE run_recovery_journal (
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

CREATE TABLE runs (
    id TEXT PRIMARY KEY,
    goal_kind TEXT NOT NULL,
    goal_value REAL NOT NULL,
    baseline_report_sha TEXT,
    current_report_sha TEXT,
    desired_workers INTEGER NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    "game_id" TEXT,
    "game_kind" TEXT,
    "game_repo_root" TEXT,
    "game_state_dir" TEXT,
    "game_graph_db" TEXT,
    "game_descriptor_path" TEXT,
    "game_local_override_path" TEXT,
    revision INTEGER NOT NULL DEFAULT 0,
    trace_id TEXT,
    caused_by_event_id TEXT,
    blockers_json TEXT NOT NULL DEFAULT '[]',
    head_revision TEXT,
    "cycle_uuid" TEXT,
    inputs_json TEXT,
    stop_request_json TEXT,
    terminal_reason TEXT,
    scheduler_condition TEXT
  , remote_application_ids_json TEXT NOT NULL DEFAULT '[]');

CREATE TABLE save_points (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      run_id TEXT,
      trigger_kind TEXT NOT NULL,
      label TEXT,
      commit_sha TEXT,
      branch TEXT,
      base_ref TEXT,
      base_sha TEXT,
      worktree_dirty INTEGER NOT NULL DEFAULT 0,
      committed INTEGER NOT NULL DEFAULT 0,
      matched_code_percent REAL,
      report_path TEXT,
      report_changes_path TEXT,
      board_snapshot_path TEXT,
      artifact_dir TEXT,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  );

CREATE TABLE sync_invalidations (
    invalidation_id TEXT PRIMARY KEY,
    sync_id TEXT NOT NULL,
    "game_id" TEXT NOT NULL,
    "cycle_uuid" TEXT NOT NULL,
    subject_kind TEXT NOT NULL CONSTRAINT sync_invalidations_subject_kind_check CHECK (
      subject_kind IN ('target', 'checkpoint', 'pr_snapshot')
    ),
    subject_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    caused_by_event_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(sync_id, subject_kind, subject_id)
  );

CREATE TABLE sync_publication_intents (
    sync_id TEXT PRIMARY KEY,
    "game_id" TEXT NOT NULL,
    "cycle_uuid" TEXT NOT NULL,
    "cycle_worktree_path" TEXT NOT NULL,
    prior_head TEXT NOT NULL,
    new_head TEXT NOT NULL,
    worktree_state_json TEXT NOT NULL,
    boundary_plan_json TEXT NOT NULL,
    publishing_event_id TEXT NOT NULL,
    boundary_event_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

CREATE TABLE sync_push_records (
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
    pushed_at TEXT,
    UNIQUE(sync_id, series_id)
  );

CREATE TABLE sync_state (
    sync_id TEXT PRIMARY KEY,
    "game_id" TEXT NOT NULL,
    "cycle_uuid" TEXT NOT NULL,
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
  , blocked_origin_status TEXT, validation_evidence_json TEXT, resolved_conflict_paths_json TEXT NOT NULL DEFAULT '[]');

CREATE TABLE target_claims (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        epoch_id TEXT NOT NULL,
        epoch_target_id TEXT NOT NULL UNIQUE,
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

CREATE TABLE targets (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      unit TEXT NOT NULL,
      symbol TEXT NOT NULL,
      source_path TEXT,
      size INTEGER NOT NULL,
      fuzzy REAL NOT NULL,
      matched REAL,
      complete REAL,
      risk TEXT,
      status TEXT NOT NULL,
      priority REAL NOT NULL,
      reason TEXT,
      created_at TEXT NOT NULL
    );

CREATE TABLE worker_checkpoints (
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

CREATE TABLE integration_outcomes (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        epoch_id TEXT NOT NULL,
        epoch_target_id TEXT NOT NULL,
        target_claim_id TEXT NOT NULL,
        worker_state_id TEXT NOT NULL,
        worker_checkpoint_id TEXT UNIQUE NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('applied', 'conflict', 'skipped', 'failed', 'resolved', 'needs_rework', 'blocked', 'rejected', 'resolver_failed')),
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
        conflict_paths_json TEXT NOT NULL DEFAULT '[]',
        failure_reasons_json TEXT NOT NULL DEFAULT '[]',
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        resolved_at TEXT
      );

CREATE TABLE worker_state (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        epoch_id TEXT NOT NULL,
        epoch_target_id TEXT NOT NULL,
        target_claim_id TEXT NOT NULL UNIQUE,
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

CREATE TABLE write_set_widenings (
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

CREATE UNIQUE INDEX cycle_timeline_entries_cycle_kind_entry
      ON cycle_timeline_entries (cycle_uuid, entry_kind, entry_id);

CREATE INDEX cycle_timeline_entries_cycle_order
      ON cycle_timeline_entries (cycle_uuid, id);

CREATE INDEX cycles_game_updated
      ON cycles (game_id, updated_at);

CREATE UNIQUE INDEX cycles_one_active_game
      ON cycles (game_id)
      WHERE status IN ('active', 'blocked', 'closing');

CREATE INDEX dashboard_artifacts_cycle_type
      ON dashboard_artifacts (cycle_uuid, artifact_type, artifact_key, created_at);

CREATE INDEX dashboard_artifacts_game_type
      ON dashboard_artifacts (game_id, artifact_type, artifact_key, created_at);

CREATE INDEX dashboard_artifacts_run_type
      ON dashboard_artifacts (run_id, artifact_type, artifact_key, created_at);

CREATE INDEX dispatch_handoff_snapshots_game_created
      ON dispatch_handoff_snapshots (game_id, created_at);

CREATE UNIQUE INDEX epoch_targets_epoch_key ON epoch_targets (epoch_id, target_key);

CREATE INDEX epoch_targets_epoch_status
        ON epoch_targets (epoch_id, status, admission_index);

CREATE INDEX epoch_targets_run_status
        ON epoch_targets (run_id, status);

CREATE INDEX epoch_verdicts_run_epoch ON epoch_verdicts (run_id, epoch_id, verdict);

CREATE INDEX epochs_run_status
        ON epochs (run_id, status, ordinal);

CREATE INDEX game_events_correlation_sequence
      ON game_events (correlation_id, sequence);

CREATE INDEX game_events_subject_sequence
      ON game_events (subject_kind, subject_id, sequence);

CREATE INDEX game_events_type_sequence
      ON game_events (event_type, sequence);

CREATE INDEX game_upstream_anchors_cycle ON game_upstream_anchors (cycle_uuid);

CREATE INDEX jobs_claim ON jobs (kind, status, next_attempt_at, priority DESC, created_at, job_id);

CREATE INDEX knowledge_revisions_game_revision
      ON knowledge_revisions (game_id, revision);

CREATE INDEX pending_integrations_run_created
    ON pending_integrations (run_id, created_at);

CREATE UNIQUE INDEX pr_batch_publication_series_ordinal
    ON pr_batch_publication_series (publication_id, ordinal);

CREATE UNIQUE INDEX pr_batch_publications_campaign_batch
    ON pr_batch_publications (campaign_id, batch_index);

CREATE UNIQUE INDEX pr_batch_publications_one_incomplete_campaign
    ON pr_batch_publications (campaign_id)
    WHERE status != 'completed';

CREATE UNIQUE INDEX pr_campaigns_one_open_game
      ON pr_campaigns (game_id)
      WHERE status NOT IN ('completed', 'abandoned');

CREATE UNIQUE INDEX run_recovery_journal_one_prepared_run
    ON run_recovery_journal (run_id) WHERE status = 'prepared';

CREATE INDEX run_recovery_journal_run_created
    ON run_recovery_journal (run_id, created_at);

CREATE INDEX save_points_campaign
      ON save_points (campaign_id, created_at);

CREATE INDEX sync_invalidations_game_subject
      ON sync_invalidations (game_id, subject_kind, subject_id);

CREATE UNIQUE INDEX sync_invalidations_sync_subject ON sync_invalidations (sync_id, subject_kind, subject_id);

CREATE INDEX sync_publication_intents_game
      ON sync_publication_intents (game_id, created_at);

CREATE UNIQUE INDEX sync_push_records_sync_series ON sync_push_records (sync_id, series_id);

CREATE INDEX sync_push_records_sync_status
    ON sync_push_records (sync_id, status);

CREATE UNIQUE INDEX sync_state_one_non_terminal_game
      ON sync_state (game_id)
      WHERE status NOT IN ('published', 'cancelled');

CREATE UNIQUE INDEX target_claims_epoch_target ON target_claims (epoch_target_id);

CREATE INDEX target_claims_run_status
        ON target_claims (run_id, status);

CREATE INDEX worker_checkpoints_epoch_target
        ON worker_checkpoints (epoch_id, epoch_target_id);

CREATE INDEX worker_checkpoints_state_selectable
        ON worker_checkpoints (worker_state_id, selectable, exact_match, new_score, validation_time);

CREATE INDEX integration_outcomes_run_status
        ON integration_outcomes (run_id, status);

CREATE INDEX worker_state_run_status
        ON worker_state (run_id, lifecycle_status);

CREATE UNIQUE INDEX worker_state_target_claim ON worker_state (target_claim_id);

CREATE INDEX write_set_widenings_run
        ON write_set_widenings (run_id, status, created_at);

CREATE TRIGGER dispatch_handoff_snapshots_immutable_delete
      BEFORE DELETE ON dispatch_handoff_snapshots
      BEGIN
        SELECT RAISE(ABORT, 'dispatch handoff snapshots are immutable');
      END;

CREATE TRIGGER dispatch_handoff_snapshots_immutable_update
      BEFORE UPDATE ON dispatch_handoff_snapshots
      BEGIN
        SELECT RAISE(ABORT, 'dispatch handoff snapshots are immutable');
      END;
`;
