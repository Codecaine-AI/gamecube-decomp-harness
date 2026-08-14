import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type {
  EventType,
  PiSessionStatus,
  RunBlocker,
  RunInputs,
  RunSchedulerCondition,
  RunStatus,
  RuntimeAgentRole,
} from "@server/core/shared/types";
import type { WriteSetEntry } from "@server/core/session-runtime/run-state/write-set-categories.js";
import type {
  CompletePhaseState,
  PreparingPhaseState,
  ProjectSessionBlocker,
  ProjectSessionKernelTraceState,
  ProjectSessionPhase,
  ProjectSessionProcessState,
  ProjectSessionStatus,
  PrPhaseState,
  RunningPhaseState,
  SessionTimelineEntryKind,
} from "@server/core/project-session/types.js";

export type JsonObject = Record<string, unknown>;
export type ProjectEventActor = "operator" | "runner" | "agent" | "guardian" | "external_observer";

export const schemaMigrations = sqliteTable("schema_migrations", {
  version: integer("version").primaryKey(),
  name: text("name").notNull(),
  appliedAt: text("applied_at").notNull(),
});

export const projectEvents = sqliteTable(
  "project_events",
  {
    sequence: integer("sequence").primaryKey({ autoIncrement: true }),
    eventId: text("event_id").notNull().unique(),
    eventType: text("event_type").notNull(),
    schemaVersion: integer("schema_version").notNull().default(1),
    projectId: text("project_id").notNull(),
    subjectKind: text("subject_kind").notNull(),
    subjectId: text("subject_id").notNull(),
    correlationId: text("correlation_id").notNull(),
    causationId: text("causation_id").notNull(),
    traceId: text("trace_id").notNull(),
    spanId: text("span_id").notNull(),
    actor: text("actor").$type<ProjectEventActor>().notNull(),
    occurredAt: text("occurred_at").notNull(),
    payloadJson: text("payload_json", { mode: "json" }).$type<JsonObject>().notNull().default(sql`'{}'`),
    parentSpanId: text("parent_span_id"),
  },
  (table) => [
    index("project_events_subject_sequence").on(table.subjectKind, table.subjectId, table.sequence),
    index("project_events_type_sequence").on(table.eventType, table.sequence),
    index("project_events_correlation_sequence").on(table.correlationId, table.sequence),
    check(
      "project_events_actor_check",
      sql`${table.actor} IN ('operator', 'runner', 'agent', 'guardian', 'external_observer')`,
    ),
  ],
);

export const projectState = sqliteTable("project_state", {
  projectId: text("project_id").primaryKey(),
  revision: integer("revision").notNull().default(0),
  activeWorkflowJson: text("active_workflow_json", { mode: "json" }).$type<JsonObject>(),
  queuedRequestsJson: text("queued_requests_json", { mode: "json" })
    .$type<JsonObject[]>()
    .notNull()
    .default(sql`'[]'`),
  blockersJson: text("blockers_json", { mode: "json" }).$type<RunBlocker[]>().notNull().default(sql`'[]'`),
  traceId: text("trace_id").notNull(),
  causedByEventId: text("caused_by_event_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const dispatchHandoffSnapshots = sqliteTable(
  "dispatch_handoff_snapshots",
  {
    snapshotId: text("snapshot_id").primaryKey(),
    projectId: text("project_id").notNull(),
    contentJson: text("content_json", { mode: "json" }).$type<JsonObject>().notNull(),
    contentHash: text("content_hash").notNull().unique(),
    oldLeaseHolderJson: text("old_lease_holder_json", { mode: "json" }).$type<JsonObject>().notNull(),
    requestedHandoffJson: text("requested_handoff_json", { mode: "json" }).$type<JsonObject>(),
    terminalProjectRevision: integer("terminal_project_revision").notNull(),
    releaseEventId: text("release_event_id").notNull().unique().references(() => projectEvents.eventId),
    acquisitionEventId: text("acquisition_event_id").unique().references(() => projectEvents.eventId),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("dispatch_handoff_snapshots_project_created").on(table.projectId, table.createdAt),
    check("dispatch_handoff_snapshots_content_json_check", sql`json_valid(${table.contentJson})`),
    check(
      "dispatch_handoff_snapshots_content_hash_check",
      sql`length(${table.contentHash}) = 64 AND ${table.contentHash} NOT GLOB '*[^0-9a-f]*'`,
    ),
  ],
);

export const syncState = sqliteTable(
  "sync_state",
  {
    syncId: text("sync_id").primaryKey(),
    projectId: text("project_id").notNull(),
    sessionUuid: text("session_uuid").notNull(),
    revision: integer("revision").notNull().default(0),
    status: text("status")
      .$type<
        | "requested"
        | "ingesting"
        | "reconciling"
        | "validating"
        | "validated"
        | "publishing"
        | "published"
        | "blocked"
        | "cancelled"
      >()
      .notNull(),
    traceId: text("trace_id").notNull(),
    causedByEventId: text("caused_by_event_id").notNull(),
    blockersJson: text("blockers_json", { mode: "json" }).$type<JsonObject[]>().notNull().default(sql`'[]'`),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    latestEventSequence: integer("latest_event_sequence").notNull().default(0),
    intakeJson: text("intake_json", { mode: "json" }).$type<JsonObject>().notNull().default(sql`'{}'`),
    stagingJson: text("staging_json", { mode: "json" }).$type<JsonObject>(),
    prReconciliationJson: text("pr_reconciliation_json", { mode: "json" })
      .$type<JsonObject[]>()
      .notNull()
      .default(sql`'[]'`),
    publicationJson: text("publication_json", { mode: "json" }).$type<JsonObject>(),
    blockedOriginStatus: text("blocked_origin_status").$type<
      "requested" | "ingesting" | "reconciling" | "validating" | "validated" | "publishing"
    >(),
    validationEvidenceJson: text("validation_evidence_json", { mode: "json" }).$type<JsonObject>(),
    resolvedConflictPathsJson: text("resolved_conflict_paths_json", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
  },
  (table) => [
    uniqueIndex("sync_state_one_non_terminal_project")
      .on(table.projectId)
      .where(sql`${table.status} NOT IN ('published', 'cancelled')`),
    check(
      "sync_state_status_check",
      sql`${table.status} IN ('requested', 'ingesting', 'reconciling', 'validating', 'validated', 'publishing', 'published', 'blocked', 'cancelled')`,
    ),
  ],
);

export const runs = sqliteTable("runs", {
  id: text("id").primaryKey(),
  goalKind: text("goal_kind").notNull(),
  goalValue: real("goal_value").notNull(),
  baselineReportSha: text("baseline_report_sha"),
  currentReportSha: text("current_report_sha"),
  desiredWorkers: integer("desired_workers").notNull(),
  status: text("status").$type<RunStatus>().notNull(),
  createdAt: text("created_at").notNull(),
  projectId: text("project_id"),
  projectKind: text("project_kind"),
  projectRepoRoot: text("project_repo_root"),
  projectStateDir: text("project_state_dir"),
  projectGraphDb: text("project_graph_db"),
  projectDescriptorPath: text("project_descriptor_path"),
  projectLocalOverridePath: text("project_local_override_path"),
  revision: integer("revision").notNull().default(0),
  traceId: text("trace_id"),
  causedByEventId: text("caused_by_event_id"),
  blockersJson: text("blockers_json", { mode: "json" }).$type<JsonObject[]>().notNull().default(sql`'[]'`),
  headRevision: text("head_revision"),
  sessionUuid: text("session_uuid"),
  inputsJson: text("inputs_json", { mode: "json" }).$type<RunInputs>(),
  stopRequestJson: text("stop_request_json", { mode: "json" }).$type<JsonObject>(),
  terminalReason: text("terminal_reason"),
  schedulerCondition: text("scheduler_condition").$type<RunSchedulerCondition>(),
  remoteApplicationIdsJson: text("remote_application_ids_json", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'`),
});

export const projectUpstreamAnchors = sqliteTable(
  "project_upstream_anchors",
  {
    projectId: text("project_id").primaryKey(),
    sessionUuid: text("session_uuid").notNull(),
    upstreamRevision: text("upstream_revision").notNull(),
    syncId: text("sync_id").notNull(),
    causedByEventId: text("caused_by_event_id").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("project_upstream_anchors_session").on(table.sessionUuid)],
);

export const syncPushRecords = sqliteTable(
  "sync_push_records",
  {
    pushId: text("push_id").primaryKey(),
    syncId: text("sync_id").notNull(),
    seriesId: text("series_id").notNull(),
    branch: text("branch").notNull(),
    remoteName: text("remote_name").notNull(),
    expectedRemoteHead: text("expected_remote_head"),
    newHead: text("new_head").notNull(),
    revision: integer("revision").notNull().default(0),
    status: text("status").$type<"pending" | "pushing" | "pushed" | "failed">().notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastError: text("last_error"),
    causedByEventId: text("caused_by_event_id").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    pushedAt: text("pushed_at"),
  },
  (table) => [
    uniqueIndex("sync_push_records_sync_series").on(table.syncId, table.seriesId),
    index("sync_push_records_sync_status").on(table.syncId, table.status),
    check(
      "sync_push_records_status_check",
      sql`${table.status} IN ('pending', 'pushing', 'pushed', 'failed')`,
    ),
  ],
);

export const syncPublicationIntents = sqliteTable(
  "sync_publication_intents",
  {
    syncId: text("sync_id").primaryKey(),
    projectId: text("project_id").notNull(),
    sessionUuid: text("session_uuid").notNull(),
    sessionWorktreePath: text("session_worktree_path").notNull(),
    priorHead: text("prior_head").notNull(),
    newHead: text("new_head").notNull(),
    worktreeStateJson: text("worktree_state_json", { mode: "json" }).$type<JsonObject>().notNull(),
    boundaryPlanJson: text("boundary_plan_json", { mode: "json" }).$type<JsonObject>().notNull(),
    publishingEventId: text("publishing_event_id").notNull(),
    boundaryEventId: text("boundary_event_id"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("sync_publication_intents_project").on(table.projectId, table.createdAt)],
);

export const prBatchPublications = sqliteTable(
  "pr_batch_publications",
  {
    publicationId: text("publication_id").primaryKey(),
    campaignId: text("campaign_id").notNull(),
    batchIndex: integer("batch_index").notNull(),
    seriesIdsJson: text("series_ids_json", { mode: "json" }).$type<string[]>().notNull(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    revision: integer("revision").notNull().default(0),
    status: text("status").$type<"reserved" | "publishing" | "completed">().notNull().default("reserved"),
    ownerToken: text("owner_token"),
    batchEventId: text("batch_event_id"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    completedAt: text("completed_at"),
  },
  (table) => [
    uniqueIndex("pr_batch_publications_campaign_batch").on(table.campaignId, table.batchIndex),
    uniqueIndex("pr_batch_publications_one_incomplete_campaign")
      .on(table.campaignId)
      .where(sql`${table.status} != 'completed'`),
    check(
      "pr_batch_publications_status_check",
      sql`${table.status} IN ('reserved', 'publishing', 'completed')`,
    ),
  ],
);

export const prBatchPublicationSeries = sqliteTable(
  "pr_batch_publication_series",
  {
    publicationId: text("publication_id").notNull(),
    seriesId: text("series_id").notNull(),
    ordinal: integer("ordinal").notNull(),
    revision: integer("revision").notNull().default(0),
    status: text("status").$type<"pending" | "publishing" | "published">().notNull().default("pending"),
    ownerToken: text("owner_token"),
    reservedSeriesRevision: integer("reserved_series_revision"),
    validationTimestamp: text("validation_timestamp"),
    invalidationWatermark: text("invalidation_watermark"),
    upstreamPrNumber: integer("upstream_pr_number"),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.publicationId, table.seriesId] }),
    uniqueIndex("pr_batch_publication_series_ordinal").on(table.publicationId, table.ordinal),
    check(
      "pr_batch_publication_series_status_check",
      sql`${table.status} IN ('pending', 'publishing', 'published')`,
    ),
  ],
);

export const syncInvalidations = sqliteTable(
  "sync_invalidations",
  {
    invalidationId: text("invalidation_id").primaryKey(),
    syncId: text("sync_id").notNull(),
    projectId: text("project_id").notNull(),
    sessionUuid: text("session_uuid").notNull(),
    subjectKind: text("subject_kind").$type<"target" | "checkpoint" | "pr_snapshot">().notNull(),
    subjectId: text("subject_id").notNull(),
    reason: text("reason").notNull(),
    causedByEventId: text("caused_by_event_id").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("sync_invalidations_sync_subject").on(table.syncId, table.subjectKind, table.subjectId),
    index("sync_invalidations_project_subject").on(table.projectId, table.subjectKind, table.subjectId),
    check(
      "sync_invalidations_subject_kind_check",
      sql`${table.subjectKind} IN ('target', 'checkpoint', 'pr_snapshot')`,
    ),
  ],
);

export const knowledgeRevisions = sqliteTable(
  "knowledge_revisions",
  {
    revision: integer("revision").primaryKey({ autoIncrement: true }),
    projectId: text("project_id").notNull(),
    digest: text("digest").notNull(),
    syncId: text("sync_id"),
    causedByEventId: text("caused_by_event_id").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("knowledge_revisions_project_revision").on(table.projectId, table.revision)],
);

export const syncKnowledgeJobs = sqliteTable(
  "sync_knowledge_jobs",
  {
    jobId: text("job_id").primaryKey(),
    syncId: text("sync_id").notNull(),
    projectId: text("project_id").notNull(),
    sourceKind: text("source_kind").$type<"merged_pr" | "corpus">().notNull(),
    sourceId: text("source_id").notNull(),
    revision: integer("revision").notNull().default(0),
    status: text("status")
      .$type<"queued" | "processing" | "waiting" | "succeeded" | "failed" | "cancelled">()
      .notNull()
      .default("queued"),
    provenanceJson: text("provenance_json", { mode: "json" }).$type<JsonObject>().notNull().default(sql`'{}'`),
    stagedArtifactPath: text("staged_artifact_path"),
    stagedDigest: text("staged_digest"),
    causedByEventId: text("caused_by_event_id").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("sync_knowledge_jobs_sync_source").on(table.syncId, table.sourceKind, table.sourceId),
    index("sync_knowledge_jobs_sync_status").on(table.syncId, table.status),
    check("sync_knowledge_jobs_source_kind_check", sql`${table.sourceKind} IN ('merged_pr', 'corpus')`),
    check(
      "sync_knowledge_jobs_status_check",
      sql`${table.status} IN ('queued', 'processing', 'waiting', 'succeeded', 'failed', 'cancelled')`,
    ),
  ],
);

export const directorCycles = sqliteTable("director_cycles", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  triggerEvent: text("trigger_event").notNull(),
  activeWorkers: integer("active_workers").notNull().default(0),
  summaryPath: text("summary_path"),
  decisionPath: text("decision_path"),
  createdAt: text("created_at").notNull(),
});

export const piSessions = sqliteTable("pi_sessions", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  targetClaimId: text("target_claim_id"),
  role: text("role").$type<RuntimeAgentRole>().notNull(),
  sessionId: text("session_id").notNull(),
  sessionFile: text("session_file"),
  provider: text("provider"),
  model: text("model"),
  thinkingLevel: text("thinking_level"),
  status: text("status").$type<PiSessionStatus>().notNull(),
  outputPath: text("output_path"),
  createdAt: text("created_at").notNull(),
});

export const dashboardArtifacts = sqliteTable(
  "dashboard_artifacts",
  {
    id: text("id").primaryKey(),
    runId: text("run_id"),
    projectId: text("project_id"),
    sessionUuid: text("session_uuid"),
    artifactType: text("artifact_type").notNull(),
    artifactKey: text("artifact_key").notNull(),
    sourcePath: text("source_path"),
    sourceLabel: text("source_label"),
    payloadJson: text("payload_json", { mode: "json" }).$type<JsonObject>().notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("dashboard_artifacts_run_type").on(table.runId, table.artifactType, table.artifactKey, table.createdAt),
    index("dashboard_artifacts_project_type").on(table.projectId, table.artifactType, table.artifactKey, table.createdAt),
    index("dashboard_artifacts_session_type").on(table.sessionUuid, table.artifactType, table.artifactKey, table.createdAt),
  ],
);

export const targets = sqliteTable("targets", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  unit: text("unit").notNull(),
  symbol: text("symbol").notNull(),
  sourcePath: text("source_path"),
  size: integer("size").notNull(),
  fuzzy: real("fuzzy").notNull(),
  matched: real("matched"),
  complete: real("complete"),
  risk: text("risk"),
  status: text("status").notNull(),
  priority: real("priority").notNull(),
  reason: text("reason"),
  createdAt: text("created_at").notNull(),
});

export const epochs = sqliteTable(
  "epochs",
  {
    id: text("id").primaryKey(),
    runId: text("run_id").notNull(),
    ordinal: integer("ordinal").notNull(),
    sizeMode: text("size_mode").notNull(),
    sizeValue: integer("size_value"),
    workerPoolSize: integer("worker_pool_size").notNull(),
    candidateWindow: integer("candidate_window").notNull(),
    status: text("status").notNull(),
    admittedCount: integer("admitted_count").notNull().default(0),
    finishedCount: integer("finished_count").notNull().default(0),
    fastRefreshCount: integer("fast_refresh_count").notNull().default(0),
    boundaryStatus: text("boundary_status"),
    routingSummaryJson: text("routing_summary_json", { mode: "json" }).$type<JsonObject>().notNull(),
    createdAt: text("created_at").notNull(),
    closedAt: text("closed_at"),
  },
  (table) => [index("epochs_run_status").on(table.runId, table.status, table.ordinal)],
);

export const epochTargets = sqliteTable(
  "epoch_targets",
  {
    id: text("id").primaryKey(),
    epochId: text("epoch_id").notNull(),
    runId: text("run_id").notNull(),
    targetKey: text("target_key").notNull(),
    unit: text("unit").notNull(),
    symbol: text("symbol").notNull(),
    sourcePath: text("source_path").notNull(),
    size: integer("size").notNull(),
    baselineScore: real("baseline_score").notNull(),
    priority: real("priority").notNull(),
    reason: text("reason"),
    admissionIndex: integer("admission_index").notNull(),
    status: text("status").notNull(),
    admittedAt: text("admitted_at").notNull(),
    claimedAt: text("claimed_at"),
    finishedAt: text("finished_at"),
  },
  (table) => [
    uniqueIndex("epoch_targets_epoch_key").on(table.epochId, table.targetKey),
    index("epoch_targets_epoch_status").on(table.epochId, table.status, table.admissionIndex),
    index("epoch_targets_run_status").on(table.runId, table.status),
  ],
);

export const targetClaims = sqliteTable(
  "target_claims",
  {
    id: text("id").primaryKey(),
    runId: text("run_id").notNull(),
    epochId: text("epoch_id").notNull(),
    epochTargetId: text("epoch_target_id").notNull(),
    workerId: text("worker_id").notNull(),
    baseRev: text("base_rev"),
    writeSetJson: text("write_set_json", { mode: "json" }).$type<string[]>().notNull(),
    writeSetEntriesJson: text("write_set_entries_json", { mode: "json" }).$type<WriteSetEntry[]>().notNull(),
    writeSetHash: text("write_set_hash"),
    worktreePath: text("worktree_path"),
    ttl: text("ttl"),
    heartbeatAt: text("heartbeat_at"),
    status: text("status").notNull(),
    claimedAt: text("claimed_at").notNull(),
    closedAt: text("closed_at"),
    closeReason: text("close_reason"),
  },
  (table) => [
    uniqueIndex("target_claims_epoch_target").on(table.epochTargetId),
    index("target_claims_run_status").on(table.runId, table.status),
  ],
);

export const workerState = sqliteTable(
  "worker_state",
  {
    id: text("id").primaryKey(),
    runId: text("run_id").notNull(),
    epochId: text("epoch_id").notNull(),
    epochTargetId: text("epoch_target_id").notNull(),
    targetClaimId: text("target_claim_id").notNull(),
    workerId: text("worker_id").notNull(),
    targetKey: text("target_key").notNull(),
    lifecycleStatus: text("lifecycle_status").notNull(),
    writeSetJson: text("write_set_json", { mode: "json" }).$type<string[]>().notNull(),
    writeSetEntriesJson: text("write_set_entries_json", { mode: "json" }).$type<WriteSetEntry[]>().notNull(),
    workerSessionIdsJson: text("worker_session_ids_json", { mode: "json" }).$type<string[]>().notNull(),
    artifactDir: text("artifact_dir"),
    worktreePath: text("worktree_path"),
    startedAt: text("started_at").notNull(),
    endedAt: text("ended_at"),
    baselineScore: real("baseline_score"),
    bestCheckpointId: text("best_checkpoint_id"),
    bestScore: real("best_score"),
    exact: integer("exact", { mode: "boolean" }).notNull().default(false),
    timeoutSummary: text("timeout_summary"),
    errorSummary: text("error_summary"),
    summaryJson: text("summary_json", { mode: "json" }).$type<JsonObject>().notNull(),
  },
  (table) => [
    uniqueIndex("worker_state_target_claim").on(table.targetClaimId),
    index("worker_state_run_status").on(table.runId, table.lifecycleStatus),
  ],
);

export const workerCheckpoints = sqliteTable(
  "worker_checkpoints",
  {
    id: text("id").primaryKey(),
    workerStateId: text("worker_state_id").notNull(),
    runId: text("run_id").notNull(),
    epochId: text("epoch_id").notNull(),
    epochTargetId: text("epoch_target_id").notNull(),
    targetClaimId: text("target_claim_id").notNull(),
    attemptIndex: integer("attempt_index").notNull(),
    validationTime: text("validation_time").notNull(),
    oldScore: real("old_score"),
    newScore: real("new_score"),
    delta: real("delta"),
    exactMatch: integer("exact_match", { mode: "boolean" }).notNull().default(false),
    hardGatesPassed: integer("hard_gates_passed", { mode: "boolean" }).notNull().default(false),
    improvedOverBaseline: integer("improved_over_baseline", { mode: "boolean" }).notNull().default(false),
    selectable: integer("selectable", { mode: "boolean" }).notNull().default(false),
    selected: integer("selected", { mode: "boolean" }).notNull().default(false),
    buildStatus: text("build_status"),
    qaStatus: text("qa_status"),
    objdiffStatus: text("objdiff_status"),
    validationStatus: text("validation_status").notNull(),
    validationState: text("validation_state").$type<"tentative" | "confirmed" | "regressed">().notNull().default("tentative"),
    artifactPath: text("artifact_path"),
    patchPath: text("patch_path"),
    diffPath: text("diff_path"),
    writeSetJson: text("write_set_json", { mode: "json" }).$type<string[]>().notNull(),
    failureReasonsJson: text("failure_reasons_json", { mode: "json" }).$type<string[]>().notNull(),
    metadataJson: text("metadata_json", { mode: "json" }).$type<JsonObject>().notNull(),
  },
  (table) => [
    index("worker_checkpoints_state_selectable").on(table.workerStateId, table.selectable, table.exactMatch, table.newScore, table.validationTime),
    index("worker_checkpoints_epoch_target").on(table.epochId, table.epochTargetId),
  ],
);

export const writeSetWidenings = sqliteTable(
  "write_set_widenings",
  {
    id: text("id").primaryKey(),
    runId: text("run_id").notNull(),
    epochId: text("epoch_id").notNull(),
    targetClaimId: text("target_claim_id").notNull(),
    workerStateId: text("worker_state_id").notNull(),
    attemptIndex: integer("attempt_index").notNull(),
    category: text("category").notNull(),
    rung: integer("rung").notNull(),
    requestedPathsJson: text("requested_paths_json", { mode: "json" }).$type<string[]>().notNull(),
    approvedPathsJson: text("approved_paths_json", { mode: "json" }).$type<string[]>().notNull(),
    evidenceJson: text("evidence_json", { mode: "json" }).$type<JsonObject>().notNull(),
    status: text("status").notNull(),
    decidedBy: text("decided_by"),
    decisionReason: text("decision_reason"),
    validationTier: integer("validation_tier"),
    validationEvidenceJson: text("validation_evidence_json", { mode: "json" }).$type<JsonObject>().notNull(),
    createdAt: text("created_at").notNull(),
    decidedAt: text("decided_at"),
    validatedAt: text("validated_at"),
  },
  (table) => [index("write_set_widenings_run").on(table.runId, table.status, table.createdAt)],
);

export const facts = sqliteTable("facts", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  factType: text("fact_type").notNull(),
  subject: text("subject").notNull(),
  payloadJson: text("payload_json", { mode: "json" }).$type<JsonObject>().notNull(),
  evidencePath: text("evidence_path"),
  confidence: real("confidence"),
  status: text("status").notNull(),
});

export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  eventType: text("event_type").$type<EventType>().notNull(),
  producer: text("producer").notNull(),
  payloadJson: text("payload_json", { mode: "json" }).$type<JsonObject>().notNull(),
  handledAt: text("handled_at"),
  createdAt: text("created_at").notNull(),
});

export const integrations = sqliteTable("integrations", {
  id: text("id").primaryKey(),
  attemptId: text("attempt_id"),
  baseRev: text("base_rev"),
  patchPath: text("patch_path"),
  validationPath: text("validation_path"),
  oldMatchedCodePercent: real("old_matched_code_percent"),
  newMatchedCodePercent: real("new_matched_code_percent"),
  status: text("status").notNull(),
  integratedRev: text("integrated_rev"),
});

export const workerOutputIntegrations = sqliteTable(
  "worker_output_integrations",
  {
    id: text("id").primaryKey(),
    runId: text("run_id").notNull(),
    epochId: text("epoch_id").notNull(),
    epochTargetId: text("epoch_target_id").notNull(),
    targetClaimId: text("target_claim_id").notNull(),
    workerStateId: text("worker_state_id").notNull(),
    workerCheckpointId: text("worker_checkpoint_id"),
    status: text("status").notNull(),
    disposition: text("disposition"),
    targetKey: text("target_key"),
    patchPath: text("patch_path"),
    diffPath: text("diff_path"),
    itemPath: text("item_path"),
    summaryPath: text("summary_path"),
    checkStdoutPath: text("check_stdout_path"),
    checkStderrPath: text("check_stderr_path"),
    applyStdoutPath: text("apply_stdout_path"),
    applyStderrPath: text("apply_stderr_path"),
    writeSetJson: text("write_set_json", { mode: "json" }).$type<string[]>().notNull(),
    validationState: text("validation_state").$type<"tentative" | "confirmed" | "regressed">().notNull().default("tentative"),
    conflictPathsJson: text("conflict_paths_json", { mode: "json" }).$type<string[]>().notNull(),
    failureReasonsJson: text("failure_reasons_json", { mode: "json" }).$type<string[]>().notNull(),
    metadataJson: text("metadata_json", { mode: "json" }).$type<JsonObject>().notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    resolvedAt: text("resolved_at"),
  },
  (table) => [
    uniqueIndex("worker_output_integrations_checkpoint").on(table.workerCheckpointId),
    index("worker_output_integrations_run_status").on(table.runId, table.status, table.createdAt),
  ],
);

export const runCheckpoints = sqliteTable("run_checkpoints", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  checkpointType: text("checkpoint_type").notNull(),
  status: text("status").notNull(),
  artifactDir: text("artifact_dir").notNull(),
  summaryPath: text("summary_path").notNull(),
  prCandidatesPath: text("pr_candidates_path").notNull(),
  carryForwardPath: text("carry_forward_path").notNull(),
  createdAt: text("created_at").notNull(),
  payloadJson: text("payload_json", { mode: "json" }).$type<JsonObject>().notNull(),
});

export const checkpointItems = sqliteTable(
  "checkpoint_items",
  {
    id: text("id").primaryKey(),
    checkpointId: text("checkpoint_id").notNull(),
    runId: text("run_id").notNull(),
    workerCheckpointId: text("worker_checkpoint_id"),
    targetClaimId: text("target_claim_id"),
    targetKey: text("target_key").notNull(),
    unit: text("unit"),
    symbol: text("symbol"),
    sourcePath: text("source_path"),
    lifecycleStatus: text("lifecycle_status").notNull(),
    disposition: text("disposition").notNull(),
    itemStatus: text("item_status").notNull(),
    exactMatch: integer("exact_match", { mode: "boolean" }).notNull().default(false),
    prCandidate: integer("pr_candidate", { mode: "boolean" }).notNull().default(false),
    patchPath: text("patch_path"),
    summaryPath: text("summary_path"),
    stateSummary: text("state_summary"),
    evidenceJson: text("evidence_json", { mode: "json" }).$type<JsonObject>().notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("checkpoint_items_run_disposition").on(table.runId, table.disposition, table.itemStatus),
    index("checkpoint_items_checkpoint").on(table.checkpointId),
  ],
);

export const campaigns = sqliteTable("campaigns", {
  id: text("id").primaryKey(),
  projectId: text("project_id"),
  branch: text("branch"),
  baseRef: text("base_ref").notNull(),
  createdAt: text("created_at").notNull(),
});

export const savePoints = sqliteTable(
  "save_points",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id").notNull(),
    runId: text("run_id"),
    triggerKind: text("trigger_kind").notNull(),
    label: text("label"),
    commitSha: text("commit_sha"),
    branch: text("branch"),
    baseRef: text("base_ref"),
    baseSha: text("base_sha"),
    worktreeDirty: integer("worktree_dirty", { mode: "boolean" }).notNull().default(false),
    committed: integer("committed", { mode: "boolean" }).notNull().default(false),
    matchedCodePercent: real("matched_code_percent"),
    reportPath: text("report_path"),
    reportChangesPath: text("report_changes_path"),
    boardSnapshotPath: text("board_snapshot_path"),
    artifactDir: text("artifact_dir"),
    payloadJson: text("payload_json", { mode: "json" }).$type<JsonObject>().notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("save_points_campaign").on(table.campaignId, table.createdAt)],
);

export const projectSessions = sqliteTable(
  "project_sessions",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    sessionUuid: text("session_uuid").notNull().unique(),
    status: text("status").$type<ProjectSessionStatus>().notNull(),
    phase: text("phase").$type<ProjectSessionPhase>().notNull(),
    activeRunId: text("active_run_id"),
    baseRef: text("base_ref"),
    baseSha: text("base_sha"),
    revision: integer("revision").notNull().default(0),
    headRevision: text("head_revision"),
    traceId: text("trace_id"),
    blockersJson: text("blockers_json", { mode: "json" }).$type<ProjectSessionBlocker[]>().notNull().default(sql`'[]'`),
    savePointStale: integer("save_point_stale", { mode: "boolean" }).notNull().default(false),
    causedByEventId: text("caused_by_event_id"),
    preparingStateJson: text("preparing_state_json", { mode: "json" }).$type<PreparingPhaseState>().notNull(),
    runningStateJson: text("running_state_json", { mode: "json" }).$type<RunningPhaseState>().notNull(),
    prStateJson: text("pr_state_json", { mode: "json" }).$type<PrPhaseState>().notNull(),
    completeStateJson: text("complete_state_json", { mode: "json" }).$type<CompletePhaseState>().notNull(),
    processStateJson: text("process_state_json", { mode: "json" }).$type<ProjectSessionProcessState | JsonObject | null>().notNull(),
    kernelTraceJson: text("kernel_trace_json", { mode: "json" }).$type<ProjectSessionKernelTraceState | null>().notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    completedAt: text("completed_at"),
    closedAt: text("closed_at"),
  },
  (table) => [
    index("project_sessions_project_updated").on(table.projectId, table.updatedAt),
    uniqueIndex("project_sessions_one_active_project")
      .on(table.projectId)
      .where(sql`${table.status} IN ('active', 'blocked', 'closing')`),
  ],
);

export const sessionTimelineEntries = sqliteTable(
  "session_timeline_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionUuid: text("session_uuid").notNull(),
    entryKind: text("entry_kind").$type<SessionTimelineEntryKind>().notNull(),
    entryId: text("entry_id").notNull(),
    occurredAt: text("occurred_at").notNull(),
    payloadJson: text("payload_json", { mode: "json" }).$type<JsonObject>().notNull().default(sql`'{}'`),
    causedByEventId: text("caused_by_event_id"),
  },
  (table) => [
    uniqueIndex("session_timeline_entries_session_kind_entry").on(
      table.sessionUuid,
      table.entryKind,
      table.entryId,
    ),
    index("session_timeline_entries_session_order").on(table.sessionUuid, table.id),
    check(
      "session_timeline_entries_kind_check",
      sql`${table.entryKind} IN ('epoch_completed', 'remote_application', 'pr_phase', 'save_point')`,
    ),
  ],
);

export const pendingIntegrations = sqliteTable(
  "pending_integrations",
  {
    epochId: text("epoch_id").primaryKey(),
    runId: text("run_id").notNull(),
    branch: text("branch").notNull(),
    parentSha: text("parent_sha").notNull(),
    messageMarker: text("message_marker").notNull(),
    createdAt: text("created_at").notNull(),
    attempt: integer("attempt").notNull().default(1),
    status: text("status").$type<"prepared" | "failed">().notNull().default("prepared"),
    failureReason: text("failure_reason"),
    failedAt: text("failed_at"),
  },
  (table) => [index("pending_integrations_run_created").on(table.runId, table.createdAt)],
);

export const runRecoveryJournal = sqliteTable(
  "run_recovery_journal",
  {
    recoveryId: text("recovery_id").primaryKey(),
    runId: text("run_id").notNull(),
    action: text("action").notNull(),
    commandId: text("command_id").notNull(),
    correlationId: text("correlation_id").notNull(),
    recoveryReason: text("recovery_reason").notNull(),
    expectedRunRevision: integer("expected_run_revision").notNull(),
    cancelledClaimIdsJson: text("cancelled_claim_ids_json", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
    cancelledOperationIdsJson: text("cancelled_operation_ids_json", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
    status: text("status").$type<"prepared" | "completed">().notNull().default("prepared"),
    causedByEventId: text("caused_by_event_id"),
    createdAt: text("created_at").notNull(),
    completedAt: text("completed_at"),
  },
  (table) => [
    uniqueIndex("run_recovery_journal_one_prepared_run")
      .on(table.runId)
      .where(sql`${table.status} = 'prepared'`),
    index("run_recovery_journal_run_created").on(table.runId, table.createdAt),
    check("run_recovery_journal_status_check", sql`${table.status} IN ('prepared', 'completed')`),
  ],
);

export const orchestratorStateSchema = {
  campaigns,
  checkpointItems,
  dashboardArtifacts,
  directorCycles,
  epochs,
  epochTargets,
  events,
  facts,
  integrations,
  knowledgeRevisions,
  piSessions,
  pendingIntegrations,
  prBatchPublicationSeries,
  prBatchPublications,
  runRecoveryJournal,
  dispatchHandoffSnapshots,
  projectEvents,
  projectSessions,
  projectState,
  projectUpstreamAnchors,
  syncState,
  syncInvalidations,
  syncKnowledgeJobs,
  syncPushRecords,
  runCheckpoints,
  runs,
  savePoints,
  schemaMigrations,
  sessionTimelineEntries,
  targetClaims,
  targets,
  workerCheckpoints,
  workerOutputIntegrations,
  workerState,
  writeSetWidenings,
};

export type RunRow = typeof runs.$inferSelect;
export type NewRunRow = typeof runs.$inferInsert;
export type KnowledgeRevisionRow = typeof knowledgeRevisions.$inferSelect;
export type NewKnowledgeRevisionRow = typeof knowledgeRevisions.$inferInsert;
export type ProjectUpstreamAnchorRow = typeof projectUpstreamAnchors.$inferSelect;
export type SyncInvalidationRow = typeof syncInvalidations.$inferSelect;
export type SyncKnowledgeJobRow = typeof syncKnowledgeJobs.$inferSelect;
export type SyncPushRecordRow = typeof syncPushRecords.$inferSelect;
export type SyncStateRow = typeof syncState.$inferSelect;
export type NewSyncStateRow = typeof syncState.$inferInsert;
export type DirectorCycleRow = typeof directorCycles.$inferSelect;
export type PiSessionRow = typeof piSessions.$inferSelect;
export type NewPiSessionRow = typeof piSessions.$inferInsert;
export type TargetRow = typeof targets.$inferSelect;
export type EpochRow = typeof epochs.$inferSelect;
export type EpochTargetRow = typeof epochTargets.$inferSelect;
export type TargetClaimRow = typeof targetClaims.$inferSelect;
export type WorkerStateRow = typeof workerState.$inferSelect;
export type WorkerCheckpointRow = typeof workerCheckpoints.$inferSelect;
export type WriteSetWideningRow = typeof writeSetWidenings.$inferSelect;
export type FactRow = typeof facts.$inferSelect;
export type EventRow = typeof events.$inferSelect;
export type NewEventRow = typeof events.$inferInsert;
export type IntegrationRow = typeof integrations.$inferSelect;
export type WorkerOutputIntegrationRow = typeof workerOutputIntegrations.$inferSelect;
export type RunCheckpointRow = typeof runCheckpoints.$inferSelect;
export type CheckpointItemRow = typeof checkpointItems.$inferSelect;
export type CampaignRow = typeof campaigns.$inferSelect;
export type SavePointRow = typeof savePoints.$inferSelect;
export type ProjectSessionRow = typeof projectSessions.$inferSelect;
export type NewProjectSessionRow = typeof projectSessions.$inferInsert;
export type SessionTimelineEntryRow = typeof sessionTimelineEntries.$inferSelect;
export type NewSessionTimelineEntryRow = typeof sessionTimelineEntries.$inferInsert;
export type DashboardArtifactRow = typeof dashboardArtifacts.$inferSelect;
export type SchemaMigrationRow = typeof schemaMigrations.$inferSelect;
export type ProjectEventRow = typeof projectEvents.$inferSelect;
export type NewProjectEventRow = typeof projectEvents.$inferInsert;
export type DispatchHandoffSnapshotRow = typeof dispatchHandoffSnapshots.$inferSelect;
export type NewDispatchHandoffSnapshotRow = typeof dispatchHandoffSnapshots.$inferInsert;
export type ProjectStateRow = typeof projectState.$inferSelect;
export type NewProjectStateRow = typeof projectState.$inferInsert;
export type PrBatchPublicationRow = typeof prBatchPublications.$inferSelect;
export type PrBatchPublicationSeriesRow = typeof prBatchPublicationSeries.$inferSelect;
export type PendingIntegrationRow = typeof pendingIntegrations.$inferSelect;
export type NewPendingIntegrationRow = typeof pendingIntegrations.$inferInsert;
export type RunRecoveryJournalRow = typeof runRecoveryJournal.$inferSelect;
export type NewRunRecoveryJournalRow = typeof runRecoveryJournal.$inferInsert;
