import { resolve } from "node:path";
import type { Database } from "bun:sqlite";
import {
  DEFAULT_AGENT_KERNEL_DATABASE_URL,
  meleeKernelDatabaseUrlFromEnv,
  meleeKernelRuntimeRequiredFromEnv,
} from "@server/infrastructure/kernel/bridge/database";
import { createMeleeKernelRuntime, type MeleeKernelRuntime } from "@server/infrastructure/kernel/bridge/runtime";
import { meleeRootContainerId } from "@server/infrastructure/kernel/bridge/session-mapping";
import {
  submitMeleeWorkflowTraceEvent,
  type MeleeWorkflowTraceStatus,
  type SubmitMeleeWorkflowTraceEventInput,
} from "@server/infrastructure/kernel/bridge/workflow-trace";
import type { ProjectRuntimeContext } from "@server/core/project-registry";
import { openState } from "@server/core/orchestrator-state";
import {
  getProjectSessionByUuid,
  mergeProjectSessionKernelTrace,
} from "@server/core/project-session/store.js";
import type { ProjectEventTraceLinkage } from "@server/core/project-state/kernel-links.js";

type JsonObject = Record<string, unknown>;
type JsonResponder = (data: unknown, init?: ResponseInit) => Response;

export interface DashboardKernelWorkflowEventInput {
  kind: SubmitMeleeWorkflowTraceEventInput["kind"];
  operation: string;
  status?: MeleeWorkflowTraceStatus;
  sessionId?: string | null;
  runId?: string | null;
  prId?: string | null;
  detail?: string | null;
  metadata?: Record<string, unknown>;
  correlationId?: string;
  projectEventId?: string;
  causedByEventId?: string | null;
}

export interface DashboardKernelRuntimeService {
  closeForTests: () => Promise<void>;
  databaseUrl: () => string | null;
  enabled: () => Promise<boolean>;
  kernelRuntimeRequired: boolean;
  projectId: (paths: ProjectRuntimeContext) => string;
  readApiResponse: (req: Request) => Promise<Response>;
  runtime: () => Promise<MeleeKernelRuntime | null>;
  sessionId: (paths: ProjectRuntimeContext, input: Pick<DashboardKernelWorkflowEventInput, "sessionId" | "runId">) => string;
  startTraceTailer: () => Promise<void>;
  status: () => Promise<JsonObject>;
  submitWorkflowEvent: (paths: ProjectRuntimeContext, input: DashboardKernelWorkflowEventInput) => Promise<JsonObject | null>;
}

export interface DashboardKernelRuntimeServiceDeps {
  activeProjectSessionUuid?: (stateDir: string, projectId: string) => string | null;
  appendLog: (stream: "stdout" | "stderr" | "ui", text: string) => void;
  defaultStateDir: string;
  env: Record<string, string | undefined>;
  json: JsonResponder;
  latestRunId: (stateDir: string) => string;
  packageRoot: string;
  port: number;
  createKernelRuntime?: typeof createMeleeKernelRuntime;
  persistProjectSessionKernelTraceLinkage?: (
    stateDir: string,
    projectId: string,
    sessionUuid: string,
    trace: ProjectSessionKernelTraceLinkageAttachment,
  ) => Promise<void> | void;
  recordProjectSessionKernelTrace?: (
    stateDir: string,
    projectId: string,
    sessionUuid: string,
    trace: {
      activeContainerId: string;
      appSessionId: string;
      rootContainerId: string;
      traceUrl: string;
    },
  ) => Promise<void> | void;
}

export interface ProjectSessionKernelTraceLinkageAttachment {
  activeContainerId: string;
  appSessionId: string;
  rootContainerId: string;
  traceUrl: string;
  projectEventId: string;
  kernelEventId: string;
  correlationId: string;
  causedByEventId: string | null;
  linkedAt: string;
}

export class KernelTraceCursorPersistenceError extends Error {
  readonly cause: unknown;

  constructor(projectEventId: string, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(
      `Kernel trace event for project event ${projectEventId} was emitted but cursor persistence failed: ${detail}`,
    );
    this.name = "KernelTraceCursorPersistenceError";
    this.cause = cause;
  }
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function requiredText(value: unknown, label: string): string {
  const normalized = stringValue(value).trim();
  if (!normalized) throw new Error(`${label} must be a nonblank string`);
  return normalized;
}

function redactedUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.username) parsed.username = "***";
    if (parsed.password) parsed.password = "***";
    return parsed.toString();
  } catch {
    return value.replace(/\/\/([^/@]+)@/, "//***@");
  }
}

function projectScopedWorkflowTraceLinkage(
  db: Database,
  projectId: string,
  input: DashboardKernelWorkflowEventInput,
): ProjectEventTraceLinkage {
  const normalizedProjectId = requiredText(projectId, "projectId");
  const projectEventId = requiredText(input.projectEventId, "projectEventId");
  const correlationId = requiredText(input.correlationId, "correlationId");
  if (input.causedByEventId === undefined) {
    throw new Error("causedByEventId must be explicit (use null for command causation)");
  }
  const projectEvent = db
    .query(
      `SELECT event_id, correlation_id, causation_id
       FROM project_events
       WHERE project_id = ? AND event_id = ?`,
    )
    .get(normalizedProjectId, projectEventId) as {
      event_id: string;
      correlation_id: string;
      causation_id: string;
    } | null;
  if (!projectEvent) {
    throw new Error(
      `Project event ${projectEventId} was not found in project ${normalizedProjectId}`,
    );
  }
  const persistedCause = db
    .query("SELECT event_id, project_id FROM project_events WHERE event_id = ?")
    .get(projectEvent.causation_id) as {
      event_id: string;
      project_id: string;
    } | null;
  if (persistedCause && persistedCause.project_id !== normalizedProjectId) {
    throw new Error(
      `Project event ${projectEventId} has cross-project causation ${persistedCause.event_id}`,
    );
  }
  const resolved: ProjectEventTraceLinkage = {
    correlationId: requiredText(projectEvent.correlation_id, "persisted correlation_id"),
    projectEventId: projectEvent.event_id,
    causedByEventId: persistedCause?.event_id ?? null,
  };
  if (correlationId !== resolved.correlationId) {
    throw new Error(
      `Workflow trace correlation ${correlationId} does not match project event ${projectEventId}`,
    );
  }
  if (input.causedByEventId !== resolved.causedByEventId) {
    throw new Error(
      `Workflow trace causedByEventId does not match persisted causation for ${projectEventId}`,
    );
  }
  return resolved;
}

export function resolveWorkflowTraceLinkage(
  stateDir: string,
  projectId: string,
  input: DashboardKernelWorkflowEventInput,
): ProjectEventTraceLinkage {
  const store = openState(stateDir);
  try {
    return projectScopedWorkflowTraceLinkage(store.db, projectId, input);
  } finally {
    store.db.close();
  }
}

export function persistProjectSessionKernelTraceLinkage(
  stateDir: string,
  projectId: string,
  sessionUuid: string,
  trace: ProjectSessionKernelTraceLinkageAttachment,
): void {
  const store = openState(stateDir);
  try {
    const session = getProjectSessionByUuid(store.db, sessionUuid);
    if (!session) {
      throw new Error(`Project session ${sessionUuid} was not found`);
    }
    if (session.project_id !== projectId) {
      throw new Error(`Project session ${sessionUuid} does not belong to ${projectId}`);
    }
    const linkage = projectScopedWorkflowTraceLinkage(store.db, projectId, {
      kind: "session",
      operation: "persist-kernel-trace-linkage",
      projectEventId: trace.projectEventId,
      correlationId: trace.correlationId,
      causedByEventId: trace.causedByEventId,
    });
    mergeProjectSessionKernelTrace(store.db, session.id, {
      app_session_id: requiredText(trace.appSessionId, "appSessionId"),
      root_container_id: requiredText(trace.rootContainerId, "rootContainerId"),
      active_container_id: requiredText(trace.activeContainerId, "activeContainerId"),
      trace_url: requiredText(trace.traceUrl, "traceUrl"),
      last_linkage_cursor: {
        project_event_id: linkage.projectEventId,
        kernel_event_id: requiredText(trace.kernelEventId, "kernelEventId"),
        correlation_id: linkage.correlationId,
        caused_by_event_id: linkage.causedByEventId,
        linked_at: requiredText(trace.linkedAt, "linkedAt"),
      },
    });
  } finally {
    store.db.close();
  }
}

export function createDashboardKernelRuntimeService(deps: DashboardKernelRuntimeServiceDeps): DashboardKernelRuntimeService {
  const explicitKernelDatabaseUrl = meleeKernelDatabaseUrlFromEnv(deps.env);
  const kernelRuntimeDisabled = /^(1|true|yes)$/i.test(deps.env.ORCH_AGENT_KERNEL_DISABLED ?? deps.env.ORCH_AGENT_KERNEL_DISABLE ?? "");
  const kernelDatabaseUrl = kernelRuntimeDisabled ? null : (explicitKernelDatabaseUrl || DEFAULT_AGENT_KERNEL_DATABASE_URL);
  const kernelDatabaseSource = kernelRuntimeDisabled ? "disabled" : (explicitKernelDatabaseUrl ? "env" : "default-local");
  const kernelRuntimeRequired = meleeKernelRuntimeRequiredFromEnv(deps.env);
  const kernelAppBaseUrl = deps.env.ORCH_AGENT_KERNEL_APP_BASE_URL ?? `http://localhost:${deps.port}`;
  const kernelObserverUrl = deps.env.AGENT_KERNEL_OBSERVER_URL ?? null;
  const createKernelRuntime = deps.createKernelRuntime ?? createMeleeKernelRuntime;
  const persistKernelTraceLinkage =
    deps.persistProjectSessionKernelTraceLinkage ?? persistProjectSessionKernelTraceLinkage;
  let kernelRuntimePromise: Promise<MeleeKernelRuntime | null> | null = null;

  function runtime(): Promise<MeleeKernelRuntime | null> {
    if (!kernelDatabaseUrl) return Promise.resolve(null);
    if (!kernelRuntimePromise) {
      kernelRuntimePromise = createKernelRuntime({
        config: {
          workingDir: deps.packageRoot,
          piSessionsDir: resolve(deps.packageRoot, ".pi-sessions"),
          cursorSnapshotPath: resolve(deps.defaultStateDir, "agent-kernel-tailer-cursors.json"),
          appBaseUrl: kernelAppBaseUrl,
          appTraceUrlTemplate: `${kernelAppBaseUrl}/trace?containerId={containerId}`,
          genericTraceUrlTemplate: kernelObserverUrl ? `${kernelObserverUrl}/containers/{containerId}` : null,
          metadata: {
            processName: "melee-live",
            server: "server",
          },
        },
        database: {
          databaseUrl: kernelDatabaseUrl,
        },
      }).catch((error) => {
        kernelRuntimePromise = null;
        deps.appendLog("stderr", `agent-kernel init failed: ${error instanceof Error ? error.message : String(error)}`);
        if (kernelRuntimeRequired) throw error;
        return null;
      });
    }
    return kernelRuntimePromise;
  }

  async function closeForTests(): Promise<void> {
    const runtimePromise = kernelRuntimePromise;
    kernelRuntimePromise = null;
    const current = await runtimePromise?.catch(() => null);
    await current?.close();
  }

  async function status(): Promise<JsonObject> {
    if (!kernelDatabaseUrl) {
      return {
        configured: false,
        enabled: false,
        required: kernelRuntimeRequired,
        disabled: kernelRuntimeDisabled,
        databaseUrl: null,
        databaseSource: kernelDatabaseSource,
        env: ["ORCH_AGENT_KERNEL_DATABASE_URL", "AGENT_KERNEL_DATABASE_URL"],
      };
    }

    try {
      const current = await runtime();
      return {
        configured: true,
        enabled: current !== null,
        required: kernelRuntimeRequired,
        databaseUrl: redactedUrl(kernelDatabaseUrl),
        databaseSource: kernelDatabaseSource,
        kernelId: current?.config.kernelId ?? null,
        piSessionsDir: current?.config.piSessionsDir ?? null,
        readApiPrefix: "/kernel",
        tailer: current?.traceTailerStatus() ?? null,
        registration: current?.registration
          ? {
              kernelId: current.registration.kernelId,
              lastSeenAt: current.registration.lastSeenAt,
              updatedAt: current.registration.updatedAt,
            }
          : null,
      };
    } catch (error) {
      return {
        configured: true,
        enabled: false,
        required: kernelRuntimeRequired,
        databaseUrl: redactedUrl(kernelDatabaseUrl),
        databaseSource: kernelDatabaseSource,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async function enabled(): Promise<boolean> {
    return (await runtime()) !== null;
  }

  async function readApiResponse(req: Request): Promise<Response> {
    const current = await runtime();
    if (!current) {
      return deps.json(
        {
          error: kernelDatabaseUrl
            ? "Agent Kernel runtime is not available"
            : "Agent Kernel database URL is not configured",
          status: await status(),
        },
        { status: 503 },
      );
    }
    return current.readApi.handle(req);
  }

  function projectId(paths: ProjectRuntimeContext): string {
    return paths.project?.projectId ?? "melee";
  }

  function sessionId(
    paths: ProjectRuntimeContext,
    input: Pick<DashboardKernelWorkflowEventInput, "sessionId" | "runId">,
  ): string {
    const explicit = stringValue(input.sessionId).trim();
    if (explicit) return explicit;
    try {
      const activeProjectSession = deps.activeProjectSessionUuid?.(paths.stateDir, projectId(paths));
      if (activeProjectSession) return activeProjectSession;
    } catch {
      // Fall back to run identity when canonical project-session state is unavailable.
    }
    const runId = stringValue(input.runId).trim();
    if (runId) return runId;
    try {
      const latest = deps.latestRunId(paths.stateDir);
      if (latest) return latest;
    } catch {
      // Some session-boundary operations can run before the orchestrator state DB exists.
    }
    return paths.project?.projectId ? `project:${paths.project.projectId}` : "dashboard-session";
  }

  async function submitWorkflowEvent(
    paths: ProjectRuntimeContext,
    input: DashboardKernelWorkflowEventInput,
  ): Promise<JsonObject | null> {
    try {
      const current = await runtime();
      if (!current) {
        const message = kernelDatabaseUrl
          ? "Agent Kernel runtime is not available"
          : "Agent Kernel database URL is not configured";
        if (kernelRuntimeRequired) throw new Error(message);
        return null;
      }
      const resolvedProjectId = projectId(paths);
      const resolvedSessionId = sessionId(paths, input);
      const linkage = resolveWorkflowTraceLinkage(
        paths.stateDir,
        resolvedProjectId,
        input,
      );
      const result = await submitMeleeWorkflowTraceEvent({
        runtime: current,
        kind: input.kind,
        projectId: resolvedProjectId,
        sessionId: resolvedSessionId,
        correlationId: linkage.correlationId,
        projectEventId: linkage.projectEventId,
        causedByEventId: linkage.causedByEventId,
        operation: input.operation,
        status: input.status,
        prId: input.prId,
        workingDir: paths.repoRoot,
        detail: input.detail,
        metadata: {
          ...(input.metadata ?? {}),
          stateDir: paths.stateDir,
          graphDbPath: paths.graphDbPath,
          ...(input.runId ? { runId: input.runId } : {}),
        },
      });
      const rootContainerId = meleeRootContainerId({
        projectId: resolvedProjectId,
        sessionId: resolvedSessionId,
      });
      try {
        await persistKernelTraceLinkage(
          paths.stateDir,
          resolvedProjectId,
          resolvedSessionId,
          {
            activeContainerId: result.containerId,
            appSessionId: result.appSessionId,
            rootContainerId,
            traceUrl: `${kernelAppBaseUrl}/trace?projectId=${encodeURIComponent(resolvedProjectId)}&traceId=${encodeURIComponent(rootContainerId)}`,
            projectEventId: linkage.projectEventId,
            kernelEventId: result.event.eventId,
            correlationId: linkage.correlationId,
            causedByEventId: linkage.causedByEventId,
            linkedAt: result.event.timestamp,
          },
        );
      } catch (error) {
        throw new KernelTraceCursorPersistenceError(linkage.projectEventId, error);
      }
      return {
        appSessionId: result.appSessionId,
        containerId: result.containerId,
        eventId: result.event.eventId,
        projectEventId: linkage.projectEventId,
      };
    } catch (error) {
      deps.appendLog(
        "stderr",
        `agent-kernel workflow trace failed (${input.kind}/${input.operation}): ${error instanceof Error ? error.message : String(error)}`,
      );
      if (error instanceof KernelTraceCursorPersistenceError || kernelRuntimeRequired) {
        throw error;
      }
      return null;
    }
  }

  async function startTraceTailer(): Promise<void> {
    const current = await runtime();
    if (!current) return;
    deps.appendLog("ui", `agent-kernel registered: ${current.config.kernelId}`);
    await current.startTraceTailer();
    const traceStatus = current.traceTailerStatus();
    deps.appendLog("ui", `agent-kernel tailer watching: ${traceStatus?.watchDir ?? current.config.piSessionsDir}`);
  }

  return {
    closeForTests,
    databaseUrl: () => kernelDatabaseUrl,
    enabled,
    kernelRuntimeRequired,
    projectId,
    readApiResponse,
    runtime,
    sessionId,
    startTraceTailer,
    status,
    submitWorkflowEvent,
  };
}
