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
import type { GameRuntimeContext } from "@server/core/game-registry";
import { openState } from "@server/core/orchestrator-state";
import { uiLog } from "@server/infrastructure/logging/ui-log";
import {
  getCycleByUuid,
  mergeCycleKernelTrace,
} from "@server/core/cycle/store.js";
import type { GameEventTraceLinkage } from "@server/core/harness-state/kernel-links.js";

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
  gameEventId?: string;
  causedByEventId?: string | null;
}

export interface DashboardKernelRuntimeService {
  closeForTests: () => Promise<void>;
  databaseUrl: () => string | null;
  enabled: () => Promise<boolean>;
  kernelRuntimeRequired: boolean;
  gameId: (paths: GameRuntimeContext) => string;
  readApiResponse: (req: Request) => Promise<Response>;
  runtime: () => Promise<MeleeKernelRuntime | null>;
  sessionId: (paths: GameRuntimeContext, input: Pick<DashboardKernelWorkflowEventInput, "sessionId" | "runId">) => string;
  status: () => Promise<JsonObject>;
  submitWorkflowEvent: (paths: GameRuntimeContext, input: DashboardKernelWorkflowEventInput) => Promise<JsonObject | null>;
}

export interface DashboardKernelRuntimeServiceDeps {
  activeCycleUuid?: (stateDir: string, gameId: string) => string | null;
  env: Record<string, string | undefined>;
  json: JsonResponder;
  latestRunId: (stateDir: string) => string;
  packageRoot: string;
  port: number;
  createKernelRuntime?: typeof createMeleeKernelRuntime;
  persistCycleKernelTraceLinkage?: (
    stateDir: string,
    gameId: string,
    cycleUuid: string,
    trace: CycleKernelTraceLinkageAttachment,
  ) => Promise<void> | void;
  recordCycleKernelTrace?: (
    stateDir: string,
    gameId: string,
    cycleUuid: string,
    trace: {
      activeContainerId: string;
      appSessionId: string;
      rootContainerId: string;
      traceUrl: string;
    },
  ) => Promise<void> | void;
}

export interface CycleKernelTraceLinkageAttachment {
  activeContainerId: string;
  appSessionId: string;
  rootContainerId: string;
  traceUrl: string;
  gameEventId: string;
  kernelEventId: string;
  correlationId: string;
  causedByEventId: string | null;
  linkedAt: string;
}

export class KernelTraceCursorPersistenceError extends Error {
  readonly cause: unknown;

  constructor(gameEventId: string, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(
      `Kernel trace event for game event ${gameEventId} was emitted but cursor persistence failed: ${detail}`,
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

function gameScopedWorkflowTraceLinkage(
  db: Database,
  gameId: string,
  input: DashboardKernelWorkflowEventInput,
): GameEventTraceLinkage {
  const normalizedGameId = requiredText(gameId, "gameId");
  const gameEventId = requiredText(input.gameEventId, "gameEventId");
  const correlationId = requiredText(input.correlationId, "correlationId");
  if (input.causedByEventId === undefined) {
    throw new Error("causedByEventId must be explicit (use null for command causation)");
  }
  const gameEvent = db
    .query(
      `SELECT event_id, correlation_id, causation_id
       FROM game_events
       WHERE game_id = ? AND event_id = ?`,
    )
    .get(normalizedGameId, gameEventId) as {
      event_id: string;
      correlation_id: string;
      causation_id: string;
    } | null;
  if (!gameEvent) {
    throw new Error(
      `Game event ${gameEventId} was not found in game ${normalizedGameId}`,
    );
  }
  const persistedCause = db
    .query("SELECT event_id, game_id FROM game_events WHERE event_id = ?")
    .get(gameEvent.causation_id) as {
      event_id: string;
      game_id: string;
    } | null;
  if (persistedCause && persistedCause.game_id !== normalizedGameId) {
    throw new Error(
      `Game event ${gameEventId} has cross-game causation ${persistedCause.event_id}`,
    );
  }
  const resolved: GameEventTraceLinkage = {
    correlationId: requiredText(gameEvent.correlation_id, "persisted correlation_id"),
    gameEventId: gameEvent.event_id,
    causedByEventId: persistedCause?.event_id ?? null,
  };
  if (correlationId !== resolved.correlationId) {
    throw new Error(
      `Workflow trace correlation ${correlationId} does not match game event ${gameEventId}`,
    );
  }
  if (input.causedByEventId !== resolved.causedByEventId) {
    throw new Error(
      `Workflow trace causedByEventId does not match persisted causation for ${gameEventId}`,
    );
  }
  return resolved;
}

export function resolveWorkflowTraceLinkage(
  stateDir: string,
  gameId: string,
  input: DashboardKernelWorkflowEventInput,
): GameEventTraceLinkage {
  const store = openState(stateDir);
  try {
    return gameScopedWorkflowTraceLinkage(store.db, gameId, input);
  } finally {
    store.db.close();
  }
}

export function persistCycleKernelTraceLinkage(
  stateDir: string,
  gameId: string,
  cycleUuid: string,
  trace: CycleKernelTraceLinkageAttachment,
): void {
  const store = openState(stateDir);
  try {
    const cycle = getCycleByUuid(store.db, cycleUuid);
    if (!cycle) {
      throw new Error(`Game cycle ${cycleUuid} was not found`);
    }
    if (cycle.game_id !== gameId) {
      throw new Error(`Game cycle ${cycleUuid} does not belong to ${gameId}`);
    }
    const linkage = gameScopedWorkflowTraceLinkage(store.db, gameId, {
      kind: "session",
      operation: "persist-kernel-trace-linkage",
      gameEventId: trace.gameEventId,
      correlationId: trace.correlationId,
      causedByEventId: trace.causedByEventId,
    });
    mergeCycleKernelTrace(store.db, cycle.id, {
      app_session_id: requiredText(trace.appSessionId, "appSessionId"),
      root_container_id: requiredText(trace.rootContainerId, "rootContainerId"),
      active_container_id: requiredText(trace.activeContainerId, "activeContainerId"),
      trace_url: requiredText(trace.traceUrl, "traceUrl"),
      last_linkage_cursor: {
        game_event_id: linkage.gameEventId,
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
    deps.persistCycleKernelTraceLinkage ?? persistCycleKernelTraceLinkage;
  let kernelRuntimePromise: Promise<MeleeKernelRuntime | null> | null = null;

  function runtime(): Promise<MeleeKernelRuntime | null> {
    if (!kernelDatabaseUrl) return Promise.resolve(null);
    if (!kernelRuntimePromise) {
      kernelRuntimePromise = createKernelRuntime({
        config: {
          workingDir: deps.packageRoot,
          piSessionsDir: resolve(deps.packageRoot, ".pi-sessions"),
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
        uiLog("stderr", `agent-kernel init failed: ${error instanceof Error ? error.message : String(error)}`);
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

  function gameId(paths: GameRuntimeContext): string {
    return paths.game?.gameId ?? "melee";
  }

  function sessionId(
    paths: GameRuntimeContext,
    input: Pick<DashboardKernelWorkflowEventInput, "sessionId" | "runId">,
  ): string {
    const explicit = stringValue(input.sessionId).trim();
    if (explicit) return explicit;
    try {
      const activeCycle = deps.activeCycleUuid?.(paths.stateDir, gameId(paths));
      if (activeCycle) return activeCycle;
    } catch {
      // Fall back to run identity when canonical cycle state is unavailable.
    }
    const runId = stringValue(input.runId).trim();
    if (runId) return runId;
    try {
      const latest = deps.latestRunId(paths.stateDir);
      if (latest) return latest;
    } catch {
      // Some cycle-boundary operations can run before the orchestrator state DB exists.
    }
    return paths.game?.gameId ? `game:${paths.game.gameId}` : "dashboard-session";
  }

  async function submitWorkflowEvent(
    paths: GameRuntimeContext,
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
      const resolvedGameId = gameId(paths);
      const resolvedSessionId = sessionId(paths, input);
      const linkage = resolveWorkflowTraceLinkage(
        paths.stateDir,
        resolvedGameId,
        input,
      );
      const result = await submitMeleeWorkflowTraceEvent({
        runtime: current,
        kind: input.kind,
        gameId: resolvedGameId,
        sessionId: resolvedSessionId,
        correlationId: linkage.correlationId,
        gameEventId: linkage.gameEventId,
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
        gameId: resolvedGameId,
        sessionId: resolvedSessionId,
      });
      try {
        await persistKernelTraceLinkage(
          paths.stateDir,
          resolvedGameId,
          resolvedSessionId,
          {
            activeContainerId: result.containerId,
            appSessionId: result.appSessionId,
            rootContainerId,
            traceUrl: `${kernelAppBaseUrl}/trace?gameId=${encodeURIComponent(resolvedGameId)}&traceId=${encodeURIComponent(rootContainerId)}`,
            gameEventId: linkage.gameEventId,
            kernelEventId: result.event.eventId,
            correlationId: linkage.correlationId,
            causedByEventId: linkage.causedByEventId,
            linkedAt: result.event.timestamp,
          },
        );
      } catch (error) {
        throw new KernelTraceCursorPersistenceError(linkage.gameEventId, error);
      }
      return {
        appSessionId: result.appSessionId,
        containerId: result.containerId,
        eventId: result.event.eventId,
        gameEventId: linkage.gameEventId,
      };
    } catch (error) {
      uiLog(
        "stderr",
        `agent-kernel workflow trace failed (${input.kind}/${input.operation}): ${error instanceof Error ? error.message : String(error)}`,
      );
      if (error instanceof KernelTraceCursorPersistenceError || kernelRuntimeRequired) {
        throw error;
      }
      return null;
    }
  }

  return {
    closeForTests,
    databaseUrl: () => kernelDatabaseUrl,
    enabled,
    kernelRuntimeRequired,
    gameId,
    readApiResponse,
    runtime,
    sessionId,
    status,
    submitWorkflowEvent,
  };
}
