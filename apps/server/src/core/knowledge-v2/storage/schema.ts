import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, real, sqliteTable, text, unique, uniqueIndex } from "drizzle-orm/sqlite-core";

export type TargetKind = "function" | "data";
export type TargetIdentityStatus = "current" | "moved" | "unresolved" | "retired";
export type EntityKind = "translation_unit" | "struct" | "struct_field" | "parameter" | "game_concept" | "pattern";
export type EntityIdentityStatus = "active" | "merged" | "retired";
export type SourceKind = "pr" | "discord" | "attempt" | "wiki" | "code";
export type FactType = "purpose" | "inferred_name" | "inferred_type" | "data_flow" | "state_behavior" | "game_mapping";
export type Outcome = "match" | "improvement" | "no_change" | "error";
export type WorkerErrorType = "build_failure" | "tool_failure" | "timeout" | "worker_crash";
export type Integration = "integrated" | "conflicted";
export type EventKind = "regression" | "note";
export type EventCause = "merge_conflict" | "upstream_change";
export type EventRefKind = "worker_run" | "epoch" | "pr" | "commit";
export type WatermarkSource = "pr" | "discord" | "wiki" | "attempt";
export type IndexPathway = "run_closed" | "pr_imported" | "regression" | "archival_ingest" | "drift_recheck";

export const targets = sqliteTable(
  "target",
  {
    id: text("id").primaryKey(),
    kind: text("kind").$type<TargetKind>().notNull(),
    unit: text("unit").notNull(),
    unitEntityId: text("unit_entity_id").notNull().references(() => entities.id),
    symbol: text("symbol"),
    stableKey: text("stable_key").notNull(),
    address: text("address"),
    identityStatus: text("identity_status").$type<TargetIdentityStatus>().notNull(),
    reportRevision: text("report_revision").notNull(),
  },
  (table) => [
    check("target_kind_check", sql`${table.kind} IN ('function', 'data')`),
    check("target_identity_status_check", sql`${table.identityStatus} IN ('current', 'moved', 'unresolved', 'retired')`),
    check("target_kind_shape_check", sql`${table.symbol} IS NOT NULL AND ${table.address} IS NOT NULL AND ${table.unitEntityId} IS NOT NULL`),
    uniqueIndex("target_current_stable_key").on(table.stableKey).where(sql`${table.identityStatus} = 'current'`),
    index("target_unit_entity_id").on(table.unitEntityId),
  ],
);

export const targetStatuses = sqliteTable("target_status", {
  targetId: text("target_id").primaryKey().references(() => targets.id),
  matchPct: real("match_pct").notNull(),
  linked: integer("linked", { mode: "boolean" }).notNull(),
  size: integer("size"),
  contentHash: text("content_hash"),
  reportRevision: text("report_revision").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [check("target_status_match_pct_check", sql`${table.matchPct} >= 0 AND ${table.matchPct} <= 100`)]);

export const entities = sqliteTable("entity", {
  id: text("id").primaryKey(),
  kind: text("kind").$type<EntityKind>().notNull(),
  locator: text("locator").notNull(),
  parentEntityId: text("parent_entity_id").references((): any => entities.id),
  identityStatus: text("identity_status").$type<EntityIdentityStatus>().notNull(),
  mergedIntoId: text("merged_into_id").references((): any => entities.id),
}, (table) => [
  check("entity_kind_check", sql`${table.kind} IN ('translation_unit', 'struct', 'struct_field', 'parameter', 'game_concept', 'pattern')`),
  check("entity_identity_status_check", sql`${table.identityStatus} IN ('active', 'merged', 'retired')`),
  check("entity_merged_shape_check", sql`(${table.identityStatus} = 'merged') = (${table.mergedIntoId} IS NOT NULL)`),
  unique("entity_kind_locator").on(table.kind, table.locator),
]);

export const links = sqliteTable("link", {
  id: text("id").primaryKey(),
  fromTargetId: text("from_target_id").references(() => targets.id),
  fromEntityId: text("from_entity_id").references(() => entities.id),
  toTargetId: text("to_target_id").references(() => targets.id),
  toEntityId: text("to_entity_id").references(() => entities.id),
  role: text("role").notNull(),
  why: text("why").notNull(),
  kind: text("kind").$type<SourceKind>().notNull(),
  locator: text("locator").notNull(),
  digest: text("digest"),
}, (table) => [
  check("link_kind_check", sql`${table.kind} IN ('pr', 'discord', 'attempt', 'wiki', 'code')`),
  check("link_from_subject_check", sql`(${table.fromTargetId} IS NULL) <> (${table.fromEntityId} IS NULL)`),
  check("link_to_subject_check", sql`(${table.toTargetId} IS NULL) <> (${table.toEntityId} IS NULL)`),
  check("link_code_digest_check", sql`(${table.kind} = 'code') = (${table.digest} IS NOT NULL)`),
  index("link_from_target_id").on(table.fromTargetId), index("link_from_entity_id").on(table.fromEntityId),
  index("link_to_target_id").on(table.toTargetId), index("link_to_entity_id").on(table.toEntityId),
]);

export const facts = sqliteTable("fact", {
  id: text("id").primaryKey(), targetId: text("target_id").references(() => targets.id), entityId: text("entity_id").references(() => entities.id),
  type: text("type").$type<FactType>().notNull(), value: text("value").notNull(), rationale: text("rationale").notNull(), confidence: real("confidence").notNull(), updatedAt: text("updated_at").notNull(),
}, (table) => [
  check("fact_type_check", sql`${table.type} IN ('purpose', 'inferred_name', 'inferred_type', 'data_flow', 'state_behavior', 'game_mapping')`),
  check("fact_confidence_check", sql`${table.confidence} >= 0 AND ${table.confidence} <= 1`),
  check("fact_subject_check", sql`(${table.targetId} IS NULL) <> (${table.entityId} IS NULL)`),
  uniqueIndex("fact_target_type").on(table.targetId, table.type).where(sql`${table.targetId} IS NOT NULL`),
  uniqueIndex("fact_entity_type").on(table.entityId, table.type).where(sql`${table.entityId} IS NOT NULL`),
]);

export const evidence = sqliteTable("evidence", {
  id: text("id").primaryKey(), factId: text("fact_id").notNull().references(() => facts.id, { onDelete: "cascade" }), kind: text("kind").$type<SourceKind>().notNull(), locator: text("locator").notNull(), digest: text("digest"), why: text("why").notNull(), capturedAt: text("captured_at").notNull(),
}, (table) => [check("evidence_kind_check", sql`${table.kind} IN ('pr', 'discord', 'attempt', 'wiki', 'code')`), check("evidence_code_digest_check", sql`(${table.kind} = 'code') = (${table.digest} IS NOT NULL)`), index("evidence_kind_locator").on(table.kind, table.locator)]);

export const workerRuns = sqliteTable("worker_run", {
  id: text("id").primaryKey(), targetId: text("target_id").notNull().references(() => targets.id), goal: text("goal").notNull(), baseline: text("baseline", { mode: "json" }).$type<Record<string, unknown>>().notNull(), runId: text("run_id"), workerStateId: text("worker_state_id"), finalOutcome: text("final_outcome").$type<Outcome>().notNull(), errorType: text("error_type").$type<WorkerErrorType>(), integration: text("integration").$type<Integration>(), startedAt: text("started_at").notNull(), endedAt: text("ended_at"), closedAt: text("closed_at").notNull(),
}, (table) => [check("worker_run_outcome_check", sql`${table.finalOutcome} IN ('match', 'improvement', 'no_change', 'error')`), check("worker_run_error_type_check", sql`${table.errorType} IN ('build_failure', 'tool_failure', 'timeout', 'worker_crash')`), check("worker_run_error_shape_check", sql`(${table.finalOutcome} = 'error') = (${table.errorType} IS NOT NULL)`), check("worker_run_integration_check", sql`${table.integration} IN ('integrated', 'conflicted')`), index("worker_run_target_id").on(table.targetId)]);

export const submissions = sqliteTable("submission", { id: text("id").primaryKey(), workerRunId: text("worker_run_id").notNull().references(() => workerRuns.id), seq: integer("seq").notNull(), description: text("description").notNull(), hypothesis: text("hypothesis"), score: real("score").notNull(), submittedAt: text("submitted_at").notNull(), runtimeRef: text("runtime_ref") }, (table) => [unique("submission_worker_run_seq").on(table.workerRunId, table.seq)]);

export const pullRequests = sqliteTable("pull_request", { id: text("id").primaryKey(), targetId: text("target_id").references(() => targets.id), entityId: text("entity_id").references(() => entities.id), prRef: text("pr_ref").notNull(), summary: text("summary").notNull(), outcome: text("outcome").$type<Outcome>().notNull(), mergedAt: text("merged_at").notNull() }, (table) => [check("pull_request_outcome_check", sql`${table.outcome} IN ('match', 'improvement', 'no_change', 'error')`), check("pull_request_subject_check", sql`(${table.targetId} IS NULL) <> (${table.entityId} IS NULL)`), index("pull_request_target_id").on(table.targetId), index("pull_request_entity_id").on(table.entityId)]);

export const events = sqliteTable("event", { id: text("id").primaryKey(), targetId: text("target_id").notNull().references(() => targets.id), kind: text("kind").$type<EventKind>().notNull(), cause: text("cause").$type<EventCause>(), summary: text("summary").notNull(), createdAt: text("created_at").notNull() }, (table) => [check("event_kind_check", sql`${table.kind} IN ('regression', 'note')`), check("event_cause_check", sql`${table.cause} IN ('merge_conflict', 'upstream_change')`), check("event_cause_shape_check", sql`(${table.kind} = 'regression') = (${table.cause} IS NOT NULL)`), index("event_target_id").on(table.targetId)]);

export const eventRefs = sqliteTable("event_ref", { eventId: text("event_id").notNull().references(() => events.id), refKind: text("ref_kind").$type<EventRefKind>().notNull(), refId: text("ref_id").notNull() }, (table) => [primaryKey({ columns: [table.eventId, table.refKind, table.refId] }), check("event_ref_kind_check", sql`${table.refKind} IN ('worker_run', 'epoch', 'pr', 'commit')`)]);

export const discordMessages = sqliteTable("discord_message", { id: text("id").primaryKey(), channel: text("channel").notNull(), author: text("author").notNull(), postedAt: text("posted_at").notNull(), content: text("content").notNull(), threadId: text("thread_id"), ingestedAt: text("ingested_at").notNull() });
export const wikiSections = sqliteTable("wiki_section", { id: text("id").primaryKey(), page: text("page").notNull(), section: text("section").notNull(), mirrorRevision: text("mirror_revision").notNull(), content: text("content").notNull(), ingestedAt: text("ingested_at").notNull() }, (table) => [unique("wiki_section_revision").on(table.page, table.section, table.mirrorRevision)]);
export const sourceWatermarks = sqliteTable("source_watermark", { source: text("source").$type<WatermarkSource>().primaryKey(), position: text("position").notNull(), updatedAt: text("updated_at").notNull() }, (table) => [check("source_watermark_source_check", sql`${table.source} IN ('pr', 'discord', 'wiki', 'attempt')`)]);
export const indexTasks = sqliteTable("index_task", { id: text("id").primaryKey(), pathway: text("pathway").$type<IndexPathway>().notNull(), payload: text("payload").notNull(), enqueuedAt: text("enqueued_at").notNull(), startedAt: text("started_at"), doneAt: text("done_at") }, (table) => [check("index_task_pathway_check", sql`${table.pathway} IN ('run_closed', 'pr_imported', 'regression', 'archival_ingest', 'drift_recheck')`)]);
export const subjectIndexStates = sqliteTable("subject_index_state", { targetId: text("target_id").references(() => targets.id), entityId: text("entity_id").references(() => entities.id), indexedAt: text("indexed_at").notNull() }, (table) => [check("subject_index_state_subject_check", sql`(${table.targetId} IS NULL) <> (${table.entityId} IS NULL)`), uniqueIndex("subject_index_state_target_id").on(table.targetId).where(sql`${table.targetId} IS NOT NULL`), uniqueIndex("subject_index_state_entity_id").on(table.entityId).where(sql`${table.entityId} IS NOT NULL`)]);

export const knowledgeSchema = { discordMessages, entities, eventRefs, events, evidence, facts, indexTasks, links, pullRequests, sourceWatermarks, subjectIndexStates, submissions, targetStatuses, targets, wikiSections, workerRuns };
export const knowledgeV2Schema = knowledgeSchema;

export type KnowledgeStoreSchema = typeof knowledgeSchema;
