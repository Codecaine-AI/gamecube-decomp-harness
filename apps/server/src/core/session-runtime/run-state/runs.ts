import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { Database } from "bun:sqlite";
import type {
  RunBlocker,
  RunInputs,
  RunProjectMetadata,
  RunRecord,
  RunSchedulerCondition,
  RunStatus,
} from "@server/core/shared/types/index.js";
import { casRunEnvelope, immediateTransaction, now, type StateStore } from "@server/core/orchestrator-state";
import { appendProjectEvent, type EventActor, type JsonObject } from "@server/core/project-state/events.js";
import { getProjectState } from "@server/core/project-state/lease.js";
import { latestPublishedKnowledgeRevision } from "@server/core/session-runtime/phases/sync/knowledge.js";

type SqlValue = bigint | boolean | null | number | string | Uint8Array;

interface RunDbRow extends Record<string, unknown> {
  id: string;
  project_id: string | null;
  goal_kind: string;
  goal_value: number;
  desired_workers: number;
  status: RunStatus;
  revision: number;
  trace_id: string | null;
  caused_by_event_id: string | null;
  blockers_json: string;
  head_revision: string | null;
  session_uuid: string | null;
  inputs_json: string | null;
  stop_request_json: string | null;
  terminal_reason: string | null;
  scheduler_condition: RunSchedulerCondition | null;
  created_at: string;
  project_kind: string | null;
  project_repo_root: string | null;
  project_state_dir: string | null;
  project_graph_db: string | null;
  project_descriptor_path: string | null;
  project_local_override_path: string | null;
}

interface SessionRunContext {
  projectId: string;
  sessionUuid: string;
  baseRevision: string | null;
  headRevision: string | null;
}

export interface CreateRunOptions {
  baseRevision?: string;
  configurationSnapshot?: Record<string, unknown>;
  commandId?: string;
  correlationId?: string;
  actor?: EventActor;
  sessionUuid?: string;
  requireReady?: boolean;
}

export interface RunTransitionPatch {
  blockers?: RunBlocker[];
  desiredWorkers?: number;
  headRevision?: string | null;
  inputs?: RunInputs | null;
  status?: RunStatus;
  stopRequest?: Record<string, unknown> | null;
  terminalReason?: string | null;
}

export interface RunTransitionInput {
  actor: EventActor;
  commandId: string;
  correlationId?: string;
  eventType: string;
  expectedRevision: number;
  legacyProducer?: string;
  occurredAt?: string;
  patch: RunTransitionPatch;
  payload?: JsonObject;
  spanId?: string;
}

export interface RunCommandContext {
  commandId?: string;
  correlationId?: string;
}

export class StaleRunRevisionError extends Error {
  readonly runId: string;
  readonly expectedRevision: number;
  readonly actualRevision: number;

  constructor(runId: string, expectedRevision: number, actualRevision: number) {
    super(`Stale run revision ${expectedRevision} for ${runId}; current revision is ${actualRevision}`);
    this.name = "StaleRunRevisionError";
    this.runId = runId;
    this.expectedRevision = expectedRevision;
    this.actualRevision = actualRevision;
  }
}

function canonicalJson(value: unknown): string {
  const sort = (child: unknown): unknown => {
    if (Array.isArray(child)) return child.map(sort);
    if (!child || typeof child !== "object") return child;
    return Object.fromEntries(
      Object.entries(child as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sort(nested)]),
    );
  };
  return JSON.stringify(sort(value));
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Until a standalone policy artifact exists, a run's policy is its immutable
 * configuration snapshot. Hashing canonical JSON makes that binding stable
 * and mechanically checkable.
 */
export function policyRevisionForConfiguration(configurationSnapshot: Record<string, unknown>): string {
  return `policy-${sha256(canonicalJson(configurationSnapshot))}`;
}

export function startingKnowledgeRevision(graphDbPath: string | undefined): string {
  if (!graphDbPath || !existsSync(graphDbPath)) return "kg-empty";
  const db = new Database(graphDbPath, { readonly: true });
  try {
    const table = db
      .query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'resource_versions'")
      .get();
    if (!table) return "kg-empty";
    const rows = db
      .query("SELECT source_id, content_hash FROM resource_versions ORDER BY source_id ASC, content_hash ASC")
      .all() as Array<{ source_id: string; content_hash: string }>;
    if (rows.length === 0) return "kg-empty";
    return `kg-${sha256(rows.map((row) => `${row.source_id}:${row.content_hash}`).join("\n"))}`;
  } finally {
    db.close();
  }
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function parseJson<T>(value: unknown, fallback: T, label: string): T {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "object") return value as T;
  try {
    return JSON.parse(String(value)) as T;
  } catch (error) {
    throw new Error(`Invalid ${label} JSON in runs`, { cause: error });
  }
}

function projectFromRow(row: RunDbRow): RunProjectMetadata | undefined {
  const project: RunProjectMetadata = {
    projectId: optionalString(row.project_id),
    projectKind: optionalString(row.project_kind),
    repoRoot: optionalString(row.project_repo_root),
    stateDir: optionalString(row.project_state_dir),
    graphDbPath: optionalString(row.project_graph_db),
    descriptorPath: optionalString(row.project_descriptor_path),
    localOverridePath: optionalString(row.project_local_override_path),
  };
  return Object.values(project).some(Boolean) ? project : undefined;
}

function runFromRow(row: RunDbRow): RunRecord {
  return {
    id: String(row.id),
    projectId: nullableString(row.project_id),
    goalKind: String(row.goal_kind),
    goalValue: Number(row.goal_value),
    desiredWorkers: Number(row.desired_workers),
    status: row.status,
    revision: Number(row.revision),
    traceId: nullableString(row.trace_id) ?? `trace-run-${row.id}`,
    causedByEventId: nullableString(row.caused_by_event_id),
    blockers: parseJson<RunBlocker[]>(row.blockers_json, [], "blockers"),
    headRevision: nullableString(row.head_revision),
    sessionUuid: nullableString(row.session_uuid),
    inputs: parseJson<RunInputs | null>(row.inputs_json, null, "inputs"),
    stopRequest: parseJson<Record<string, unknown> | null>(row.stop_request_json, null, "stop_request"),
    terminalReason: nullableString(row.terminal_reason),
    schedulerCondition: nullableString(row.scheduler_condition) as RunSchedulerCondition | null,
    createdAt: String(row.created_at),
    project: projectFromRow(row),
  };
}

function selectRun(store: StateStore, runId: string): RunDbRow | null {
  return (store.db.query("SELECT * FROM runs WHERE id = ?").get(runId) as RunDbRow | null) ?? null;
}

function activeSessionContext(store: StateStore, projectId?: string, sessionUuid?: string): SessionRunContext | null {
  const clauses = ["status IN ('active', 'blocked', 'closing')"];
  const values: SqlValue[] = [];
  if (projectId) {
    clauses.push("project_id = ?");
    values.push(projectId);
  }
  if (sessionUuid) {
    clauses.push("session_uuid = ?");
    values.push(sessionUuid);
  }
  const rows = store.db
    .query(
      `SELECT project_id, session_uuid, base_sha, head_revision
       FROM project_sessions
       WHERE ${clauses.join(" AND ")}
       ORDER BY updated_at DESC
       LIMIT 2`,
    )
    .all(...values) as Array<Record<string, unknown>>;
  if (rows.length > 1 && !projectId && !sessionUuid) {
    throw new Error("Project id or session UUID is required when multiple active project sessions exist");
  }
  const row = rows[0];
  if (!row) return null;
  return {
    projectId: String(row.project_id),
    sessionUuid: String(row.session_uuid),
    baseRevision: nullableString(row.base_sha),
    headRevision: nullableString(row.head_revision) ?? nullableString(row.base_sha),
  };
}

function gitHead(repoRoot: string | undefined): string | null {
  if (!repoRoot || !existsSync(repoRoot)) return null;
  const result = Bun.spawnSync(["git", "-C", repoRoot, "rev-parse", "HEAD"], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) return null;
  return new TextDecoder().decode(result.stdout).trim() || null;
}

function readinessFailures(run: RunRecord): string[] {
  const inputs = run.inputs;
  const failures: string[] = [];
  if (!run.projectId) failures.push("project_id");
  if (!inputs?.base_revision?.trim()) failures.push("inputs.base_revision");
  if (!inputs?.policy_revision?.trim()) failures.push("inputs.policy_revision");
  if (!inputs?.starting_knowledge_revision?.trim()) failures.push("inputs.starting_knowledge_revision");
  if (!inputs?.configuration_snapshot || typeof inputs.configuration_snapshot !== "object") {
    failures.push("inputs.configuration_snapshot");
  }
  if (run.blockers.length > 0) failures.push("blockers");
  return failures;
}

function eventTypeForStatus(status: RunStatus): string {
  if (status === "ready") return "run.readied";
  if (status === "active") return "run.activated";
  return `run.${status}`;
}

function actorForProducer(producer: string): EventActor {
  return producer === "ui" || producer === "dashboard" || producer === "operator" ? "operator" : "runner";
}

function isAfterActivation(status: RunStatus): boolean {
  return status !== "draft" && status !== "ready";
}

function assertStatusTransition(current: RunStatus, next: RunStatus): void {
  const allowed: Readonly<Record<RunStatus, readonly RunStatus[]>> = {
    draft: ["ready"],
    ready: ["active"],
    active: ["draining", "paused", "completed", "failed"],
    draining: ["paused", "completed", "failed"],
    paused: ["active", "completed", "cancelled"],
    completed: [],
    failed: ["paused", "cancelled"],
    cancelled: [],
  };
  if (!allowed[current].includes(next)) throw new Error(`Invalid run status transition ${current} -> ${next}`);
}

function assertActiveRunLease(store: StateStore, run: RunRecord): void {
  const state = getProjectState(store, run.projectId ?? undefined);
  const lease = state?.active_workflow;
  if (!lease || lease.kind !== "run" || lease.workflow_id !== run.id || lease.status !== "active") {
    throw new Error(`Run ${run.id} cannot activate without its active project dispatch lease`);
  }
}

export function transitionRun(store: StateStore, runId: string, input: RunTransitionInput): RunRecord {
  return immediateTransaction(store.db, () => {
    const currentRow = selectRun(store, runId);
    if (!currentRow) throw new Error(`Run not found: ${runId}`);
    const current = runFromRow(currentRow);
    if (current.revision !== input.expectedRevision) {
      throw new StaleRunRevisionError(runId, input.expectedRevision, current.revision);
    }
    if (!current.projectId) throw new Error(`Run ${runId} has no project id; canonical transitions require project ownership`);
    const nextStatus = input.patch.status ?? current.status;
    if (input.patch.status && input.patch.status !== current.status) assertStatusTransition(current.status, input.patch.status);
    if (nextStatus === "active" && current.status !== "active") assertActiveRunLease(store, current);
    const nextInputs = input.patch.inputs === undefined ? current.inputs : input.patch.inputs;
    const nextBlockers = input.patch.blockers ?? current.blockers;
    if ((current.status === "draft" && nextStatus === "ready") || (current.status === "ready" && nextStatus === "active")) {
      const failures = readinessFailures({ ...current, status: nextStatus, inputs: nextInputs, blockers: nextBlockers });
      if (failures.length > 0) throw new Error(`Run ${runId} readiness failed: ${failures.join(", ")}`);
    }
    if (
      ((current.status === "ready" && nextStatus === "active") || isAfterActivation(current.status)) &&
      canonicalJson(nextInputs) !== canonicalJson(current.inputs)
    ) {
      throw new Error(`Run ${runId} inputs are immutable after activation`);
    }

    const at = input.occurredAt ?? now();
    const event = appendProjectEvent(store.db, {
      eventType: input.eventType,
      projectId: current.projectId,
      subjectKind: "run",
      subjectId: runId,
      correlationId: input.correlationId ?? runId,
      causationId: input.commandId,
      traceId: current.traceId,
      spanId: input.spanId ?? `span-${randomUUID()}`,
      actor: input.actor,
      occurredAt: at,
      payload: input.payload ?? {},
    });
    const accepted = casRunEnvelope(store.db, {
      blockersJson: JSON.stringify(nextBlockers),
      desiredWorkers: input.patch.desiredWorkers ?? current.desiredWorkers,
      eventId: event.eventId,
      expectedRevision: current.revision,
      headRevision: input.patch.headRevision === undefined ? current.headRevision : input.patch.headRevision,
      inputsJson: nextInputs === null ? null : JSON.stringify(nextInputs),
      runId,
      status: nextStatus,
      stopRequestJson:
        input.patch.stopRequest === undefined
          ? (current.stopRequest === null ? null : JSON.stringify(current.stopRequest))
          : (input.patch.stopRequest === null ? null : JSON.stringify(input.patch.stopRequest)),
      terminalReason: input.patch.terminalReason === undefined ? current.terminalReason : input.patch.terminalReason,
    });
    if (!accepted) throw new StaleRunRevisionError(runId, current.revision, getRun(store, runId)?.revision ?? -1);
    if (current.status !== "active" && nextStatus === "active") {
      store.db
        .query(
          `INSERT INTO events (id, run_id, event_type, producer, payload_json, created_at)
           VALUES (?, ?, 'run_started', ?, ?, ?)`,
        )
        .run(
          randomUUID(),
          runId,
          input.legacyProducer ?? input.actor,
          JSON.stringify({ desired_workers: input.patch.desiredWorkers ?? current.desiredWorkers, goal_kind: current.goalKind, goal_value: current.goalValue }),
          at,
        );
    }
    const saved = selectRun(store, runId);
    if (!saved) throw new Error(`Run disappeared after transition: ${runId}`);
    return runFromRow(saved);
  });
}

export function createRun(
  store: StateStore,
  goalKind: string,
  goalValue: number,
  desiredWorkers: number,
  project?: RunProjectMetadata,
  options: CreateRunOptions = {},
): RunRecord {
  const id = randomUUID();
  const session = activeSessionContext(store, project?.projectId, options.sessionUuid);
  const projectId = project?.projectId ?? session?.projectId ?? null;
  if (!projectId) throw new Error("Run creation requires a project id or an active project session");
  const configurationSnapshot = options.configurationSnapshot ?? {
    agent_timeout_seconds: 1800,
    candidate_rerank: "priority",
    candidate_window: 64,
    desired_workers: Math.max(1, Math.trunc(desiredWorkers)),
    dry_run_agents: false,
    epoch_configure_command: "",
    epoch_size: { mode: "fixed", value: 64 },
    goal_kind: goalKind,
    goal_value: goalValue,
    integration_resolver_concurrency: 4,
    model: "gpt-5.6-sol",
    provider: "codex-lb",
    thinking_level: "xhigh",
    worker_configure_command: "",
  };
  const baseRevision = options.baseRevision?.trim() || session?.baseRevision || gitHead(project?.repoRoot) || "";
  const createdAt = now();
  const traceId = `trace-run-${id}`;
  const actor = options.actor ?? "runner";
  const commandId = options.commandId ?? `command-run-create-${id}`;
  const run = immediateTransaction(store.db, () => {
    const publishedKnowledge = latestPublishedKnowledgeRevision(store.db, projectId);
    const inputs: RunInputs = {
      base_revision: baseRevision,
      policy_revision: policyRevisionForConfiguration(configurationSnapshot),
      starting_knowledge_revision: publishedKnowledge?.revisionId ?? startingKnowledgeRevision(project?.graphDbPath),
      configuration_snapshot: configurationSnapshot,
    };
    const event = appendProjectEvent(store.db, {
      eventType: "run.drafted",
      projectId,
      subjectKind: "run",
      subjectId: id,
      correlationId: options.correlationId ?? id,
      causationId: commandId,
      traceId,
      spanId: `span-${randomUUID()}`,
      actor,
      occurredAt: createdAt,
      payload: {
        desired_workers: Math.max(1, Math.trunc(desiredWorkers)),
        goal_kind: goalKind,
        goal_value: goalValue,
      },
    });
    store.db
      .query(
        `INSERT INTO runs (
           id, goal_kind, goal_value, desired_workers, status, created_at,
           project_id, project_kind, project_repo_root, project_state_dir,
           project_graph_db, project_descriptor_path, project_local_override_path,
           revision, trace_id, caused_by_event_id, blockers_json, head_revision,
           session_uuid, inputs_json, scheduler_condition
         ) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, '[]', ?, ?, ?, 'idle')`,
      )
      .run(
        id,
        goalKind,
        goalValue,
        Math.max(1, Math.trunc(desiredWorkers)),
        createdAt,
        projectId,
        project?.projectKind ?? null,
        project?.repoRoot ?? null,
        project?.stateDir ?? null,
        project?.graphDbPath ?? null,
        project?.descriptorPath ?? null,
        project?.localOverridePath ?? null,
        traceId,
        event.eventId,
        session?.headRevision ?? (baseRevision || null),
        options.sessionUuid ?? session?.sessionUuid ?? null,
        JSON.stringify(inputs),
      );
    const row = selectRun(store, id);
    if (!row) throw new Error(`Run was not created: ${id}`);
    return runFromRow(row);
  });

  const failures = readinessFailures(run);
  if (failures.length > 0) {
    if (options.requireReady) throw new Error(`Run ${id} readiness failed: ${failures.join(", ")}`);
    return run;
  }
  return transitionRun(store, id, {
    actor,
    commandId,
    correlationId: options.correlationId ?? id,
    eventType: "run.readied",
    expectedRevision: run.revision,
    patch: { status: "ready" },
    payload: {
      base_revision: run.inputs!.base_revision,
      policy_revision: run.inputs!.policy_revision,
      starting_knowledge_revision: run.inputs!.starting_knowledge_revision,
    },
  });
}

export function getLatestRun(store: StateStore): RunRecord | null {
  const row = store.db.query("SELECT * FROM runs ORDER BY created_at DESC LIMIT 1").get() as RunDbRow | null;
  return row ? runFromRow(row) : null;
}

export function getRun(store: StateStore, runId: string): RunRecord | null {
  const row = selectRun(store, runId);
  return row ? runFromRow(row) : null;
}

export function setRunDesiredWorkers(
  store: StateStore,
  runId: string,
  desiredWorkers: number,
  producer = "operator",
  context: RunCommandContext = {},
): RunRecord {
  const current = getRun(store, runId);
  if (!current) throw new Error(`Run not found: ${runId}`);
  const next = Math.max(1, Math.trunc(desiredWorkers));
  if (current.desiredWorkers === next) return current;
  const nextInputs =
    (current.status === "draft" || current.status === "ready") && current.inputs
      ? (() => {
          const configurationSnapshot = {
            ...current.inputs.configuration_snapshot,
            desired_workers: next,
          };
          return {
            ...current.inputs,
            configuration_snapshot: configurationSnapshot,
            policy_revision: policyRevisionForConfiguration(configurationSnapshot),
          };
        })()
      : undefined;
  const changed = transitionRun(store, runId, {
    actor: actorForProducer(producer),
    commandId: context.commandId ?? `command-run-desired-workers-${randomUUID()}`,
    correlationId: context.correlationId,
    eventType: "run.desired_workers_changed",
    expectedRevision: current.revision,
    patch: { desiredWorkers: next, inputs: nextInputs },
    payload: { previous_desired_workers: current.desiredWorkers, desired_workers: next },
  });
  store.db
    .query(
      `INSERT INTO events (id, run_id, event_type, producer, payload_json, handled_at, created_at)
       VALUES (?, ?, 'run_desired_workers_changed', ?, ?, ?, ?)`,
    )
    .run(randomUUID(), runId, producer, JSON.stringify({ previous_desired_workers: current.desiredWorkers, desired_workers: next }), now(), now());
  return changed;
}

export function updateRunStatus(
  store: StateStore,
  runId: string,
  status: RunStatus,
  producer = "operator",
  context: RunCommandContext = {},
): RunRecord {
  const current = getRun(store, runId);
  if (!current) throw new Error(`Run not found: ${runId}`);
  if (current.status === status) return current;
  const changed = transitionRun(store, runId, {
    actor: actorForProducer(producer),
    commandId: context.commandId ?? `command-run-status-${randomUUID()}`,
    correlationId: context.correlationId,
    eventType: eventTypeForStatus(status),
    expectedRevision: current.revision,
    legacyProducer: producer,
    patch: { status },
    payload: { previous_status: current.status, status },
  });
  return changed;
}

/** Scheduler condition is an observability mirror, not an accepted transition. */
export function setRunSchedulerCondition(
  store: StateStore,
  runId: string,
  schedulerCondition: RunSchedulerCondition,
): RunRecord {
  const result = store.db
    .query("UPDATE runs SET scheduler_condition = ? WHERE id = ? AND scheduler_condition IS NOT ?")
    .run(schedulerCondition, runId, schedulerCondition);
  if (result.changes === 0 && !selectRun(store, runId)) throw new Error(`Run not found: ${runId}`);
  const row = selectRun(store, runId);
  if (!row) throw new Error(`Run not found: ${runId}`);
  return runFromRow(row);
}
