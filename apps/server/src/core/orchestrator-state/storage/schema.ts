import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { EventType, PiSessionStatus, RunStatus, RuntimeAgentRole } from "@server/core/shared/types";
import type { WriteSetEntry } from "@server/core/session-runtime/run-state/write-set-categories.js";
import type {
  CompletePhaseState,
  PreparingPhaseState,
  ProjectSessionKernelTraceState,
  ProjectSessionPhase,
  ProjectSessionProcessState,
  ProjectSessionStatus,
  PrPhaseState,
  RunningPhaseState,
} from "@server/core/project-session/types.js";

export type JsonObject = Record<string, unknown>;

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
});

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
    sessionId: text("session_id").notNull(),
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
  (table) => [index("epochs_session_status").on(table.sessionId, table.status, table.ordinal)],
);

export const epochTargets = sqliteTable(
  "epoch_targets",
  {
    id: text("id").primaryKey(),
    epochId: text("epoch_id").notNull(),
    sessionId: text("session_id").notNull(),
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
    index("epoch_targets_session_status").on(table.sessionId, table.status),
  ],
);

export const targetClaims = sqliteTable(
  "target_claims",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull(),
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
    index("target_claims_session_status").on(table.sessionId, table.status),
  ],
);

export const workerState = sqliteTable(
  "worker_state",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull(),
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
    index("worker_state_session_status").on(table.sessionId, table.lifecycleStatus),
  ],
);

export const workerCheckpoints = sqliteTable(
  "worker_checkpoints",
  {
    id: text("id").primaryKey(),
    workerStateId: text("worker_state_id").notNull(),
    sessionId: text("session_id").notNull(),
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
    sessionId: text("session_id").notNull(),
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
  (table) => [index("write_set_widenings_session").on(table.sessionId, table.status, table.createdAt)],
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
    sessionId: text("session_id").notNull(),
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
    index("worker_output_integrations_session_status").on(table.sessionId, table.status, table.createdAt),
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
    preparingStateJson: text("preparing_state_json", { mode: "json" }).$type<PreparingPhaseState>().notNull(),
    runningStateJson: text("running_state_json", { mode: "json" }).$type<RunningPhaseState>().notNull(),
    prStateJson: text("pr_state_json", { mode: "json" }).$type<PrPhaseState>().notNull(),
    completeStateJson: text("complete_state_json", { mode: "json" }).$type<CompletePhaseState>().notNull(),
    processStateJson: text("process_state_json", { mode: "json" }).$type<ProjectSessionProcessState | JsonObject | null>().notNull(),
    kernelTraceJson: text("kernel_trace_json", { mode: "json" }).$type<ProjectSessionKernelTraceState | null>().notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    completedAt: text("completed_at"),
  },
  (table) => [
    index("project_sessions_project_updated").on(table.projectId, table.updatedAt),
    uniqueIndex("project_sessions_one_active_project")
      .on(table.projectId)
      .where(sql`${table.status} IN ('active', 'blocked')`),
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
  piSessions,
  projectSessions,
  runCheckpoints,
  runs,
  savePoints,
  targetClaims,
  targets,
  workerCheckpoints,
  workerOutputIntegrations,
  workerState,
  writeSetWidenings,
};

export type RunRow = typeof runs.$inferSelect;
export type NewRunRow = typeof runs.$inferInsert;
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
export type DashboardArtifactRow = typeof dashboardArtifacts.$inferSelect;
