import type { EventActor, JsonObject, JsonValue } from "./events.js";

/**
 * Canonical event-subject vocabulary. Dispatch blocked facts retain the active
 * workflow subject; request, acquire, and release use `game`.
 */
export const GAME_EVENT_SUBJECT_KINDS = Object.freeze([
  "game",
  "run",
  "sync_workflow",
  "sync_push",
  "cycle",
  "pr_campaign",
  "pr_series",
  "knowledge_job",
  "job",
  "sandbox",
  "game_knowledge",
] as const);

export type GameEventSubjectKind = (typeof GAME_EVENT_SUBJECT_KINDS)[number];
export type GameEventClassification =
  | "status_transition"
  | "progress"
  | "lifecycle"
  | "recovery"
  | "coordination";
export type GameEventPayloadType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "object"
  | "array"
  | "string[]"
  | "number[]"
  | "object[]";

export interface GameEventPayloadField {
  readonly type: GameEventPayloadType;
  readonly required: boolean;
  readonly nullable: boolean;
}

export interface GameEventContract {
  readonly schemaVersion: number;
  readonly subjectKinds: readonly GameEventSubjectKind[];
  readonly classification: GameEventClassification;
  readonly allowedActors: readonly EventActor[];
  readonly payloadFields: Readonly<Record<string, GameEventPayloadField>>;
  readonly extras: "forbid";
  readonly rationale?: string;
}

const operator = ["operator"] as const;
const controllers = ["operator", "runner", "guardian"] as const;
const observation = ["operator", "external_observer"] as const;
const externalObservation = ["external_observer"] as const;
const syncObservation = ["operator", "runner", "external_observer"] as const;

const required = (type: GameEventPayloadType, nullable = false): GameEventPayloadField => ({
  type,
  required: true,
  nullable,
});
const optional = (type: GameEventPayloadType, nullable = false): GameEventPayloadField => ({
  type,
  required: false,
  nullable,
});

const transitionFields = {
  from_status: required("string"),
  to_status: required("string"),
} as const;

const knowledgeJobExecutionFields = {
  sync_id: required("string", true),
  execution_class: required("string"),
  source_class: required("string"),
  provenance: required("object"),
  source_kind: required("string"),
  source_id: required("string"),
} as const;

function v1(
  subjectKinds: readonly GameEventSubjectKind[],
  classification: GameEventClassification,
  allowedActors: readonly EventActor[],
  payloadFields: Readonly<Record<string, GameEventPayloadField>>,
  rationale?: string,
): GameEventContract {
  const frozenPayloadFields = Object.fromEntries(
    Object.entries(payloadFields).map(([name, field]) => [name, Object.freeze({ ...field })]),
  );
  return Object.freeze({
    schemaVersion: 1,
    subjectKinds: Object.freeze([...subjectKinds]),
    classification,
    allowedActors: Object.freeze([...allowedActors]),
    payloadFields: Object.freeze(frozenPayloadFields),
    extras: "forbid" as const,
    rationale,
  });
}

const status = (
  subjectKind: GameEventSubjectKind,
  allowedActors: readonly EventActor[] = controllers,
  payloadFields: Readonly<Record<string, GameEventPayloadField>> = {},
  rationale?: string,
): GameEventContract =>
  v1(subjectKind === "sync_workflow" ? ["sync_workflow"] : [subjectKind], "status_transition", allowedActors, {
    ...transitionFields,
    ...payloadFields,
  }, rationale);

/**
 * The complete accepted-fact catalog. Every payload is closed: optional facts
 * are enumerated, and an unregistered key is a contract error rather than an
 * implicit extension point.
 */
export const GAME_EVENT_REGISTRY = Object.freeze({
  "game.dispatch_requested": v1(["game"], "coordination", ["operator", "runner"], {
    requested_kind: required("string"),
    workflow_id: required("string"),
    current_lease_holder: required("object", true),
    reason: required("string"),
  }),
  "game.dispatch_acquired": v1(["game"], "coordination", controllers, {
    kind: required("string"),
    workflow_id: required("string"),
    lease_id: required("string"),
    handoff_snapshot_id: optional("string", true),
    handoff_snapshot_content_hash: optional("string", true),
    state_revision: required("integer"),
    handoff_from_lease_id: optional("string"),
    handoff_release_event_id: optional("string"),
  }),
  "game.dispatch_blocked": v1(
    ["run", "sync_workflow", "pr_campaign"],
    "coordination",
    controllers,
    {
      lease_id: optional("string"),
      blocker_codes: required("string[]"),
      source_identities: required("object[]"),
      recovery_choices: required("string[]"),
    },
  ),
  "game.dispatch_released": v1(["game"], "coordination", controllers, {
    old_lease_holder: required("object"),
    handoff_snapshot_id: required("string", true),
    handoff_snapshot_content_hash: required("string", true),
    terminal_revision: required("integer"),
    requested_handoff: optional("object", true),
    handoff_result: optional("string"),
    recovery: optional("boolean"),
    recovery_reason: optional("string"),
    cancelled_subject_ids: optional("string[]"),
  }),
  "game.dispatch_request_cancelled": v1(
    ["run", "sync_workflow", "pr_campaign"],
    "coordination",
    operator,
    {
      kind: required("string"),
      workflow_id: required("string"),
      reason: required("string"),
      cleared_handoff: required("boolean"),
    },
    "A queued dispatch request is durable game state; cancellation is its accepted inverse transition.",
  ),

  "run.drafted": v1(["run"], "lifecycle", ["operator", "runner"], {
    desired_workers: required("integer"),
    goal_kind: required("string"),
    goal_value: required("number"),
  }),
  "run.readied": status("run", ["operator", "runner"], {
    base_revision: required("string"),
    policy_revision: required("string"),
    starting_knowledge_revision: required("string"),
  }),
  "run.activated": status("run", ["operator", "runner"], { lease_id: required("string") }),
  "run.paused": status("run", controllers, {
    recovery_id: optional("string"),
    recovery_reason: optional("string"),
    cancelled_claim_ids: optional("string[]"),
    cancelled_operation_ids: optional("string[]"),
    queued_work: optional("array"),
  }),
  "run.completed": status("run", ["operator", "runner"]),
  "run.failed": status("run", ["operator", "runner", "guardian"], {
    terminal_reason: optional("string"),
  }),
  "run.cancelled": status("run", operator, { cancellation_reason: required("string") }),
  "run.recovered": v1(["run"], "recovery", operator, {
    recovery_id: optional("string"),
    recovery_reason: required("string"),
    cancelled_claim_ids: required("string[]"),
    cancelled_operation_ids: required("string[]"),
    queued_work: optional("array"),
    resulting_status: required("string"),
  }),
  "run.epoch_integrated": v1(["run"], "progress", ["runner", "agent"], {
    epoch_id: required("string"),
    integration_commit: required("string"),
    score_delta: required("number", true),
    new_head: required("string"),
    ordinal: optional("integer"),
    boundary_status: optional("string"),
    save_point_id: optional("string", true),
  }),
  "run.remote_applied": v1(["run"], "progress", ["operator", "runner"], {
    remote_application_id: required("string"),
    prior_head: required("string"),
    new_head: required("string"),
    resolved_conflicts: required("string[]"),
    score_delta: required("number", true),
  }),
  "run.desired_workers_changed": v1(
    ["run"],
    "progress",
    ["operator", "runner"],
    {
      previous_desired_workers: required("integer"),
      desired_workers: required("integer"),
    },
    "Worker-count control is a non-status accepted run revision and is recorded only in game_events.",
  ),

  "sync.requested": v1(["sync_workflow"], "lifecycle", syncObservation, {
    upstream_from: required("string"),
    upstream_to: required("string"),
    merged_pr_ids: required("string[]"),
    corpus_batch_ids: required("string[]"),
    knowledge_only: required("boolean"),
  }),
  "sync.observation_refreshed": v1(["sync_workflow"], "progress", syncObservation, {
    prior_upstream_revision: required("string"),
    observed_upstream_revision: required("string"),
    merged_pr_ids: required("string[]"),
    corpus_batch_ids: required("string[]"),
    knowledge_only: required("boolean"),
    observation_source_identity: required("string"),
    state_revision: required("integer"),
  }),
  "sync.discord_refresh_requested": v1(["sync_workflow"], "progress", ["operator", "runner"], {}),
  "sync.discord_refresh_completed": v1(["sync_workflow"], "progress", ["operator", "runner"], {
    ok: required("boolean"),
    detail: required("string"),
    duration_ms: required("number"),
    messages_pulled: required("number", true),
  }),
  "sync.discord_staged": v1(["sync_workflow"], "progress", ["operator", "runner"], {
    batches: required("number"),
    messages: required("number"),
    days: required("number"),
    channels: required("number"),
    first_message_at: required("string", true),
    last_message_at: required("string", true),
  }),
  "sync.ingesting": status("sync_workflow", ["operator", "runner"]),
  "sync.reconciling": status("sync_workflow", ["operator", "runner"]),
  "sync.validating": status("sync_workflow", ["operator", "runner"]),
  "sync.validated": status("sync_workflow", ["operator", "runner"], {
    validation_evidence: required("object"),
  }),
  "sync.publishing": status("sync_workflow", ["operator", "runner"]),
  "sync.published": status("sync_workflow", ["operator", "runner"]),
  "sync.blocked": status("sync_workflow", controllers, {
    blocker_codes: required("string[]"),
    source_identities: required("object[]"),
    recovery_choices: required("string[]"),
  }),
  "sync.staging_progressed": v1(["sync_workflow"], "progress", ["operator", "runner"], {
    staging_workspace_id: required("string"),
    durable_stage: required("string"),
    epochs_total: required("integer"),
    epochs_applied: required("integer"),
    minor_conflicts_resolved: required("integer"),
    conflicts_awaiting_operator: required("integer"),
    pr_series_reconciliation_summary: required("object"),
    state_revision: required("integer"),
    progress_kind: required("string"),
  }),
  "sync.reconciliation_blocked": v1(["sync_workflow"], "status_transition", controllers, {
    ...transitionFields,
    conflict_identities: required("string[]"),
    conflicts_awaiting_operator: required("integer"),
  }),
  "sync.recovered": v1(["sync_workflow"], "recovery", operator, {
    ...transitionFields,
    staging_preserved: required("boolean"),
    staging_discarded: required("boolean"),
    resume_stage: required("string", true),
    recovery_reason: required("string"),
  }),
  "sync.cancelled": v1(["sync_workflow"], "status_transition", operator, {
    ...transitionFields,
    discarded_staging_workspace_id: required("string", true),
    untouched_cycle_head: required("string"),
    untouched_submodule_heads: required("object[]"),
  }),
  "sync.boundary_published": v1(["sync_workflow"], "coordination", ["operator", "runner"], {
    upstream_revision: required("string"),
    knowledge_revision: required("string"),
    invalidations: required("string[]"),
    validation_evidence: required("object"),
  }),
  "sync.pr_push_started": status("sync_push", ["operator", "runner"], {
    series_id: required("string"),
    branch: required("string"),
    remote_name: required("string"),
    new_head: required("string"),
    attempt: required("integer"),
  }, "Each remote PR-branch push is a fenced durable child transition needed for safe publication recovery."),
  "sync.pr_push_succeeded": status("sync_push", ["operator", "runner"], {
    series_id: required("string"),
    branch: required("string"),
    remote_name: required("string"),
    new_head: required("string"),
    attempt: required("integer"),
  }, "Each remote PR-branch push is a fenced durable child transition needed for safe publication recovery."),
  "sync.pr_push_failed": status("sync_push", ["operator", "runner"], {
    series_id: required("string"),
    branch: required("string"),
    remote_name: required("string"),
    new_head: required("string"),
    attempt: required("integer"),
    error: required("string"),
  }, "Push failure is durable recovery evidence for the sync publication child state machine."),

  "knowledge.job_enqueued": v1(["knowledge_job"], "lifecycle", ["operator", "runner"], {
    source_class: required("string"),
    provenance: required("object"),
    execution_class: required("string"),
  }),
  "knowledge.job_processing": status("knowledge_job", ["operator", "runner"], {
    ...knowledgeJobExecutionFields,
  }),
  "knowledge.job_waiting": status("knowledge_job", ["operator", "runner"], {
    ...knowledgeJobExecutionFields,
    reason: required("string"),
  }),
  "knowledge.job_succeeded": status("knowledge_job", ["operator", "runner"], {
    ...knowledgeJobExecutionFields,
    staged_digest: required("string"),
  }),
  "knowledge.job_failed": status("knowledge_job", ["operator", "runner"], {
    ...knowledgeJobExecutionFields,
    error: required("string"),
  }),
  "knowledge.job_cancelled": status("knowledge_job", ["operator", "runner"], {
    ...knowledgeJobExecutionFields,
    reason: required("string"),
  }),
  "job.enqueued": v1(["job"], "lifecycle", ["operator", "runner"], {
    kind: required("string"),
    dedupe_key: required("string"),
    execution_class: required("string"),
    priority: required("number"),
    requeue: optional("boolean"),
  }),
  "job.claimed": status("job", ["operator", "runner"], { kind: required("string") }),
  "job.started": status("job", ["operator", "runner"], { kind: required("string") }),
  "job.waiting": status("job", ["operator", "runner"], {
    kind: required("string"),
    reason: required("string"),
  }),
  "job.succeeded": status("job", ["operator", "runner"], {
    kind: required("string"),
    detail: optional("object"),
  }),
  "job.failed": status("job", ["operator", "runner"], {
    kind: required("string"),
    error: required("string"),
  }),
  "job.cancelled": status("job", ["operator", "runner"], {
    kind: required("string"),
    reason: required("string"),
  }),
  "sandbox.created": v1(["sandbox"], "lifecycle", ["operator", "runner"], {
    sandbox_id: required("string"),
    snapshot: required("string"),
    cpu: required("number"),
    memory_gib: required("number"),
    disk_gib: required("number"),
    job_id: required("string"),
    claim_id: required("string"),
    worker_state_id: required("string"),
  }),
  "sandbox.deleted": v1(["sandbox"], "lifecycle", ["operator", "runner"], {
    sandbox_id: required("string"),
    reason: required("string"),
    job_id: optional("string"),
    claim_id: optional("string"),
  }),
  "knowledge.revision_advanced": v1(["game_knowledge"], "coordination", ["operator", "runner"], {
    old_revision: required("string"),
    new_revision: required("string"),
    accepted_job_ids: required("string[]"),
  }),

  "pr.campaign_opened": v1(["pr_campaign"], "lifecycle", operator, {
    source_anchor: required("object"),
    series_count: required("integer"),
    publication_batch_size: required("integer"),
    from_status: required("string", true),
    to_status: required("string"),
  }),
  "pr.campaign_in_review": status("pr_campaign", operator),
  "pr.campaign_working": status("pr_campaign", operator),
  "pr.batch_published": v1(["pr_campaign"], "progress", operator, {
    batch_index: required("integer"),
    series_ids: required("string[]"),
    operator: required("string"),
    ...transitionFields,
  }),
  "pr.campaign_recovered": v1(["pr_campaign"], "recovery", operator, {
    recovery_reason: required("string"),
    cancelled_subject_ids: required("string[]"),
    resulting_status: required("string"),
    ...transitionFields,
  }),
  "pr.campaign_closed": v1(["pr_campaign"], "lifecycle", operator, {
    outcome: required("string"),
    per_series_terminal_summary: required("object"),
    ...transitionFields,
  }),
  "pr.series_prepared": v1(["pr_series"], "lifecycle", operator, {
    from_status: required("string", true),
    to_status: required("string"),
    branch: required("string"),
    batch_index: required("integer"),
    adoption: optional("string"),
  }),
  "pr.series_published": v1(["pr_series"], "status_transition", operator, {
    upstream_pr_number: required("integer"),
    branch: required("string"),
    batch_index: required("integer"),
    adoption: optional("string"),
    ...transitionFields,
  }),
  "pr.series_changes_requested": status("pr_series", ["operator", "external_observer"], {
    approval_source_identity: optional("string"),
    review_decision: optional("string"),
    upstream_pr_number: optional("integer"),
    adoption: optional("string"),
    branch: optional("string"),
    batch_index: optional("integer"),
  }),
  "pr.series_revising": status("pr_series", ["operator", "runner", "agent"]),
  "pr.series_approved": status("pr_series", observation, {
    approval_source_identity: required("string"),
    approved_revision: required("string"),
    approving_actor: required("string"),
    adoption: optional("string"),
    branch: optional("string"),
    batch_index: optional("integer"),
    upstream_pr_number: optional("integer"),
  }),
  "pr.series_merged": v1(["pr_series"], "lifecycle", observation, {
    upstream_pr_number: required("integer"),
    merged_upstream_revision: required("string"),
    adoption: optional("string"),
    branch: optional("string"),
    batch_index: optional("integer"),
    ...transitionFields,
  }),
  "pr.series_closed": v1(["pr_series"], "lifecycle", observation, {
    close_reason: required("string"),
    closing_actor: required("string"),
    adoption: optional("string"),
    branch: optional("string"),
    batch_index: optional("integer"),
    ...transitionFields,
  }),
  "pr.feedback_ingested": v1(["pr_series"], "progress", externalObservation, {
    work_item_ids: required("string[]"),
    review_source_identities: required("string[]"),
    ingesting_actor: required("string"),
    ...transitionFields,
  }),
  "pr.series_revised": v1(["pr_series"], "status_transition", ["operator", "runner", "agent"], {
    resolved_work_item_ids: required("string[]"),
    pushed_revision: required("string"),
    ...transitionFields,
  }),
  "pr.work_items_claimed": v1(
    ["pr_series"],
    "progress",
    ["operator", "runner", "agent"],
    {
      claimed_work_item_ids: required("string[]"),
      lease_id: required("string"),
      ...transitionFields,
    },
    "Claiming work items is an accepted non-status revision of the per-series work queue.",
  ),
  "pr.work_items_resolved": v1(
    ["pr_series"],
    "progress",
    ["operator", "runner", "agent"],
    {
      resolved_work_item_ids: required("string[]"),
      lease_id: required("string"),
      resolution: required("string"),
      ...transitionFields,
    },
    "Resolving work items is an accepted non-status revision distinct from series status entry.",
  ),
  "pr.work_items_declined": v1(
    ["pr_series"],
    "progress",
    ["operator", "runner", "agent"],
    {
      declined_work_item_ids: required("string[]"),
      decline_reason: required("string"),
      lease_id: required("string"),
      ...transitionFields,
    },
    "Declining work items is an accepted non-status revision distinct from series status entry.",
  ),

  "cycle.opened": v1(["cycle"], "lifecycle", ["operator", "runner"], {
    baseline_revision: required("string", true),
    initial_head_revision: required("string", true),
    worktree_identity: required("string"),
    opening_sync_id: required("string", true),
    state_revision: required("integer"),
  }),
  "cycle.updated": v1(["cycle"], "progress", controllers, {
    prior_head: required("string", true),
    new_head: required("string", true),
    timeline_entry_kind: required("string"),
    timeline_entry_id: required("string"),
    workflow_ids_added: required("string[]"),
    workflow_ids_removed: required("string[]"),
    current_status: required("string"),
    state_revision: required("integer"),
  }),
  "cycle.closing": status("cycle", operator),
  "cycle.blocked": v1(["cycle"], "status_transition", controllers, {
    ...transitionFields,
    prior_status: required("string"),
    blocker_codes: required("string[]"),
    source_identities: required("object[]"),
    recovery_choices: required("string[]"),
    state_revision: required("integer"),
  }),
  "cycle.blockers_updated": v1(
    ["cycle"],
    "progress",
    controllers,
    {
      added_blocker_codes: required("string[]"),
      removed_blocker_codes: required("string[]"),
      blocker_codes: required("string[]"),
      source_identities: required("object[]"),
      recovery_choices: required("string[]"),
      state_revision: required("integer"),
    },
    "Blocker membership can change while a cycle remains blocked without re-entering blocked status.",
  ),
  "cycle.complete": status("cycle", controllers),
  "cycle.closed": v1(["cycle"], "lifecycle", operator, {
    final_head: required("string", true),
    shipped_and_unshipped_work_summary: required("object"),
    final_save_point_id: required("string", true),
    closing_operator: required("string"),
    state_revision: required("integer"),
  }),
  "cycle.save_point_recorded": v1(["cycle"], "progress", controllers, {
    anchored_commit: required("string"),
    trigger_kind: required("string"),
    headline_score: required("number", true),
    artifact_paths: required("string[]"),
    replay_key: required("string"),
    replayed_failure_event_id: required("string", true),
  }),
  "cycle.save_point_failed": v1(["cycle"], "progress", controllers, {
    anchored_commit: required("string"),
    trigger_kind: required("string"),
    failed_or_missing_artifact_classes: required("string[]"),
    blocker_code: required("string"),
    staleness_flag_raised: required("boolean"),
    replay_key: required("string"),
    replayed_from_spool: optional("boolean"),
  }),

  "cycle.preparing_subphase_updated": v1(["cycle"], "progress", controllers, {
    previous_phase: required("string"), previous_status: required("string"), phase: required("string"), status: required("string"), subphase: required("string"),
  }),
  "cycle.preparing_completed": v1(["cycle"], "progress", controllers, {
    previous_phase: required("string"), previous_status: required("string"), phase: required("string"), status: required("string"),
  }),
  "cycle.running_started": v1(["cycle"], "progress", controllers, {
    previous_phase: required("string"), previous_status: required("string"), phase: required("string"), status: required("string"),
  }),
  "cycle.running_subphase_updated": v1(["cycle"], "progress", controllers, {
    previous_phase: required("string"), previous_status: required("string"), phase: required("string"), status: required("string"), subphase: required("string"),
  }),
  "cycle.running_stopped": v1(["cycle"], "progress", controllers, {
    previous_phase: required("string"), previous_status: required("string"), phase: required("string"), status: required("string"), stop_reason: required("string"),
  }),
  "cycle.running_unblocked": status("cycle", controllers),
  "cycle.pr_entered": v1(["cycle"], "progress", controllers, {
    previous_phase: required("string"), previous_status: required("string"), phase: required("string"), status: required("string"), forced: required("boolean"),
  }),
  "cycle.pr_final_build_completed": v1(["cycle"], "progress", controllers, {
    previous_phase: required("string"), previous_status: required("string"), phase: required("string"), status: required("string"),
  }),
  "cycle.pr_subphase_updated": v1(["cycle"], "progress", controllers, {
    previous_phase: required("string"), previous_status: required("string"), phase: required("string"), status: required("string"), subphase: required("string"),
  }),
  "cycle.pr_completed": v1(["cycle"], "progress", controllers, {
    previous_phase: required("string"), previous_status: required("string"), phase: required("string"), status: required("string"),
  }),
} satisfies Record<string, GameEventContract>);

export type RegisteredGameEventType = keyof typeof GAME_EVENT_REGISTRY;

const GAME_EVENT_CLASSIFICATIONS = new Set<GameEventClassification>([
  "status_transition",
  "progress",
  "lifecycle",
  "recovery",
  "coordination",
]);

function assertRegistryDefinition(): void {
  for (const [eventType, contract] of Object.entries(GAME_EVENT_REGISTRY)) {
    if (eventType.trim() === "") throw new Error("Game event registry contains a blank event type");
    if (!Number.isInteger(contract.schemaVersion) || contract.schemaVersion < 1) {
      throw new Error(`Game event ${eventType} has invalid schema version ${contract.schemaVersion}`);
    }
    if (contract.subjectKinds.length === 0) {
      throw new Error(`Game event ${eventType} has no subject kinds`);
    }
    if (contract.subjectKinds.some((kind) => kind.trim() === "")) {
      throw new Error(`Game event ${eventType} has a blank subject kind`);
    }
    if (!GAME_EVENT_CLASSIFICATIONS.has(contract.classification)) {
      throw new Error(`Game event ${eventType} has invalid classification ${String(contract.classification)}`);
    }
    if (contract.allowedActors.length === 0) {
      throw new Error(`Game event ${eventType} has no allowed actors`);
    }
    if (contract.extras !== "forbid") {
      throw new Error(`Game event ${eventType} must define a closed payload`);
    }
    for (const [fieldName, field] of Object.entries(contract.payloadFields)) {
      if (fieldName.trim() === "") throw new Error(`Game event ${eventType} has a blank payload field`);
      if (typeof field.required !== "boolean" || typeof field.nullable !== "boolean") {
        throw new Error(`Game event ${eventType} payload fact ${fieldName} must declare required and nullable`);
      }
    }
    if (contract.classification === "status_transition") {
      for (const fieldName of ["from_status", "to_status"] as const) {
        const field = contract.payloadFields[fieldName];
        if (field?.type !== "string" || field.required !== true || field.nullable !== false) {
          throw new Error(
            `Game event ${eventType} status transition must require nonnullable ${fieldName}`,
          );
        }
      }
      if ("previous_status" in contract.payloadFields || "status" in contract.payloadFields) {
        throw new Error(`Game event ${eventType} status transition uses stale status payload names`);
      }
    }
  }
}

assertRegistryDefinition();

const KNOWLEDGE_JOB_EXECUTION_EVENT_TYPES = new Set<RegisteredGameEventType>([
  "knowledge.job_processing",
  "knowledge.job_waiting",
  "knowledge.job_succeeded",
  "knowledge.job_failed",
  "knowledge.job_cancelled",
]);

export function gameEventContract(eventType: string, schemaVersion?: number): GameEventContract {
  const contract = (GAME_EVENT_REGISTRY as Record<string, GameEventContract>)[eventType];
  if (!contract) throw new Error(`Unknown game event type: ${eventType}`);
  if (schemaVersion !== undefined && schemaVersion !== contract.schemaVersion) {
    throw new Error(
      `Game event ${eventType} schema version ${schemaVersion} does not match registry version ${contract.schemaVersion}`,
    );
  }
  return contract;
}

function valueMatchesType(value: JsonValue, type: GameEventPayloadType): boolean {
  switch (type) {
    case "string": return typeof value === "string";
    case "number": return typeof value === "number" && Number.isFinite(value);
    case "integer": return typeof value === "number" && Number.isInteger(value);
    case "boolean": return typeof value === "boolean";
    case "object": return typeof value === "object" && value !== null && !Array.isArray(value);
    case "array": return Array.isArray(value);
    case "string[]": return Array.isArray(value) && value.every((item) => typeof item === "string");
    case "number[]": return Array.isArray(value) && value.every((item) => typeof item === "number" && Number.isFinite(item));
    case "object[]": return Array.isArray(value) && value.every((item) => typeof item === "object" && item !== null && !Array.isArray(item));
  }
}

export function validateRegisteredGameEvent(
  eventType: string,
  subjectKind: string,
  actor: EventActor,
  payload: JsonObject,
  schemaVersion?: number,
): GameEventContract {
  const contract = gameEventContract(eventType, schemaVersion);
  if (!contract.subjectKinds.includes(subjectKind as GameEventSubjectKind)) {
    throw new Error(`Game event ${eventType} does not accept subject kind ${subjectKind}`);
  }
  if (!contract.allowedActors.includes(actor)) {
    throw new Error(`Game event ${eventType} does not allow actor ${actor}`);
  }

  const missing: string[] = [];
  for (const [name, field] of Object.entries(contract.payloadFields)) {
    const present = Object.prototype.hasOwnProperty.call(payload, name);
    if (!present) {
      if (field.required) missing.push(name);
      continue;
    }
    const value = payload[name];
    if (value === undefined) {
      throw new Error(`Game event ${eventType} payload fact ${name} must not be undefined`);
    }
    if (value === null) {
      if (!field.nullable) {
        throw new Error(`Game event ${eventType} payload fact ${name} must not be null`);
      }
      continue;
    }
    if (!valueMatchesType(value, field.type)) {
      throw new Error(`Game event ${eventType} payload fact ${name} must be ${field.type}`);
    }
  }
  if (missing.length > 0) {
    throw new Error(`Game event ${eventType} is missing required payload facts: ${missing.join(", ")}`);
  }

  const extras = Object.keys(payload).filter((name) => !Object.prototype.hasOwnProperty.call(contract.payloadFields, name));
  if (extras.length > 0) {
    throw new Error(`Game event ${eventType} payload contains unregistered facts: ${extras.join(", ")}`);
  }
  if (KNOWLEDGE_JOB_EXECUTION_EVENT_TYPES.has(eventType as RegisteredGameEventType)) {
    const executionClass = payload.execution_class;
    const syncId = payload.sync_id;
    if (executionClass !== "sync_stage" && executionClass !== "background_safe") {
      throw new Error(
        `Game event ${eventType} payload fact execution_class must be sync_stage or background_safe`,
      );
    }
    if (executionClass === "sync_stage" && (typeof syncId !== "string" || syncId.trim() === "")) {
      throw new Error(
        `Game event ${eventType} requires a nonblank sync_id when execution_class is sync_stage`,
      );
    }
    if (executionClass === "background_safe" && syncId !== null) {
      throw new Error(
        `Game event ${eventType} requires sync_id null when execution_class is background_safe`,
      );
    }
  }
  if (contract.classification === "status_transition" && payload.from_status === payload.to_status) {
    throw new Error(`Game event ${eventType} status transition must change status`);
  }
  if (
    contract.classification === "progress" &&
    "from_status" in contract.payloadFields &&
    "to_status" in contract.payloadFields &&
    payload.from_status !== payload.to_status
  ) {
    throw new Error(`Game event ${eventType} progress must preserve status`);
  }
  if (eventType === "cycle.blocked" && payload.prior_status !== payload.from_status) {
    throw new Error("Game event cycle.blocked prior_status must equal from_status");
  }
  return contract;
}
