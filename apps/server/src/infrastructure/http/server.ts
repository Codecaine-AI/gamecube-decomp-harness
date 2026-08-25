import { randomUUID } from "node:crypto";
import { existsSync, watch, type FSWatcher } from "node:fs";
import { resolve } from "node:path";
import { Database } from "bun:sqlite";
import { handleCycleApiRoute } from "@server/api/cycle/routes";
import { handleAgentsApiRoute } from "@server/api/routes/agents";
import { createCampaignStatusService } from "@server/application/dashboard/campaign-status";
import { createDashboardKernelRuntimeService } from "@server/infrastructure/kernel/runtime";
import { createOperationStateService } from "@server/application/dashboard/operation-state";
import { createDashboardGameContextService, gameToSummary } from "@server/application/dashboard/game-context";
import {
  createDashboardReadModel,
  getHarnessStateView,
  gameRunActionState,
  type ActionProjection,
} from "@server/application/dashboard/read-model";
import { latestChildDirectory, latestPrSplitPlanSummary } from "@server/core/cycle-runtime/phases/pr/artifacts";
import { createPrRecordsService } from "@server/core/cycle-runtime/phases/pr/pr-records";
import { createSavePointRuntime } from "@server/core/cycle-runtime/phases/pr/save-points-runtime";
import { handleHandoffApiRoute } from "@server/api/routes/handoff";
import { handleKernelApiRoute, handleKernelReadRoute } from "@server/api/routes/kernel";
import { handleKnowledgeApiRoute } from "@server/api/routes/knowledge";
import { handleKnowledgeLearningsApiRoute } from "@server/api/routes/knowledge-learnings";
import { handleEventsApiRoute } from "@server/api/routes/events";
import { createStandardsService } from "@server/core/knowledge/standards";
import { sourceRoot } from "@server/core/knowledge";
import { triggerBackgroundKnowledgeProcess } from "@server/core/knowledge/background/index.js";
import { kgLibrarianCondense } from "@server/core/knowledge/jobs/librarian.js";
import {
  DEFAULT_PI_MODEL,
  DEFAULT_PI_PROVIDER,
  DEFAULT_PI_THINKING_LEVEL,
} from "@server/core/game-registry/runtime-defaults.js";
import {
  queryGameEvents,
  reconstructGameEvents,
  type GameEventQueryInput,
  type GameEventReconstructionPageOptions,
} from "@server/core/harness-state/event-query";
import {
  buildGameKernelTraceQuery,
  enrichGameEventReconstructionFromKernelReader,
  kernelTraceLinkagesFromObservations,
  readKernelTraceLinkagesFromConfiguredReader,
  readGameKernelAppSessionIds,
  type KernelTraceDatabase,
  type KernelTraceEventObservation,
  type KernelTraceLinkage,
} from "@server/core/harness-state/kernel-links";
import { createProcessControlRuntime } from "@server/core/cycle-runtime/phases/running/process-control/runtime";
import { createRunControlRuntime } from "@server/core/cycle-runtime/phases/running/run-control-runtime";
import { handleProcessControlApiRoute } from "@server/api/routes/process-control";
import { createProcessStatusService } from "@server/application/dashboard/process-status";
import { latestRunId } from "@server/core/cycle-runtime/run-state/latest-run";
import { getRun } from "@server/core/cycle-runtime/run-state";
import { handleRunsApiRoute } from "@server/api/routes/runs";
import { createPreparingRuntime } from "@server/core/cycle-runtime/phases/preparing/runtime";
import { handleCyclesApiRoute } from "@server/api/routes/cycles";
import { handleSyncApiRoute } from "@server/api/routes/sync";
import { createSyncRuntime } from "@server/core/cycle-runtime/phases/sync/runtime";
import { activateRun } from "@server/core/cycle-runtime/phases/running/run-control";
import { createValidationRuntime } from "@server/core/validation/runtime";
import { handleValidationApiRoute } from "@server/api/routes/validation";
import { createManagedProcessController, type ManagedProcessController, type ProcessLogLine } from "@server/infrastructure/process-control/managed-process-controller";
import { createCycleProcessMirror } from "@server/core/cycle/process-mirror";
import { getActiveCycle, getCycleByUuid, updateCycle } from "@server/core/cycle/store";
import { canonicalCycleSessionId } from "@server/core/cycle/session.js";
import { openState } from "@server/core/orchestrator-state";
import { createUiCommandRunner } from "@server/infrastructure/shell/ui-command-runner";
import { localFontResponse } from "@server/infrastructure/http/local-fonts";
import type { GameRuntimeContext, GameSummary, ResolvedGame } from "@server/core/game-registry";
import { loadKernelAgentsPayload } from "@server/core/agent-catalog/kernel-preview";

type JsonObject = Record<string, unknown>;

const packageRoot = resolve(import.meta.dir, "../../../../..");
const defaultRepoRoot = packageRoot;
const defaultStateDir = resolve(packageRoot, ".decomp-orchestrator-state");
const serverJobPath = resolve(packageRoot, "apps/server/src/job-runner.ts");
const builtStaticRoot = resolve(packageRoot, "apps/frontend/dist");
const staticRoot = builtStaticRoot;
const port = Number(Bun.env.ORCH_UI_PORT ?? 8787);
const hotReloadEnabled = /^(1|true|yes)$/i.test(Bun.env.ORCH_UI_HOT_RELOAD ?? "");
const dashboardStreamIntervalMs = Math.max(500, Math.trunc(Number(Bun.env.ORCH_UI_DASHBOARD_INTERVAL_MS ?? 2500)) || 2500);

const hotReloadClients = new Map<ReadableStreamDefaultController<Uint8Array>, ReturnType<typeof setInterval>>();
const hotReloadEncoder = new TextEncoder();
const hotReloadFilePattern = /\.(css|html|js|json|svg|png|jpe?g|webp)$/i;
let hotReloadVersion = 0;
let hotReloadTimer: ReturnType<typeof setTimeout> | null = null;
let hotReloadWatcher: FSWatcher | null = null;

let processController: ManagedProcessController;

function activeCycleUuid(stateDir: string, gameId: string): string | null {
  const store = openState(stateDir);
  try {
    return getActiveCycle(store.db, gameId)?.cycle_uuid ?? null;
  } finally {
    store.db.close();
  }
}

function recordCycleKernelTrace(
  stateDir: string,
  gameId: string,
  cycleUuid: string,
  trace: {
    activeContainerId: string;
    appSessionId: string;
    rootContainerId: string;
    traceUrl: string;
  },
): void {
  const store = openState(stateDir);
  try {
    const record = getCycleByUuid(store.db, cycleUuid);
    if (!record || record.game_id !== gameId) return;
    updateCycle(store.db, record.id, {
      kernel_trace_json: {
        ...(record.kernel_trace_json ?? {}),
        cycle_uuid: record.cycle_uuid,
        app_session_id: trace.appSessionId,
        root_container_id: trace.rootContainerId,
        active_container_id: trace.activeContainerId,
        trace_url: trace.traceUrl,
      },
    });
  } finally {
    store.db.close();
  }
}

function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init.headers ?? {}),
    },
  });
}

function text(data: string, init: ResponseInit = {}): Response {
  return new Response(data, {
    ...init,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      ...(init.headers ?? {}),
    },
  });
}

function staticFile(path: string): Response {
  return new Response(Bun.file(path), {
    headers: {
      "cache-control": "no-store, max-age=0",
      expires: "0",
      pragma: "no-cache",
    },
  });
}

function appendLog(stream: ProcessLogLine["stream"], textValue: string): void {
  processController.appendLog(stream, textValue);
}

function sendHotReloadEvent(controller: ReadableStreamDefaultController<Uint8Array>, event: string, data: JsonObject = {}): void {
  controller.enqueue(hotReloadEncoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
}

function closeHotReloadClient(controller: ReadableStreamDefaultController<Uint8Array>): void {
  const ping = hotReloadClients.get(controller);
  if (ping) clearInterval(ping);
  hotReloadClients.delete(controller);
}

function broadcastHotReload(path: string): void {
  hotReloadVersion += 1;
  const data = { version: hotReloadVersion, path, at: new Date().toISOString() };
  for (const controller of hotReloadClients.keys()) {
    try {
      sendHotReloadEvent(controller, "reload", data);
    } catch {
      closeHotReloadClient(controller);
    }
  }
}

function scheduleHotReload(filename: string | Buffer | null): void {
  const path = typeof filename === "string" ? filename : filename?.toString() ?? "static";
  if (path !== "static" && !hotReloadFilePattern.test(path)) return;
  if (hotReloadTimer) clearTimeout(hotReloadTimer);
  hotReloadTimer = setTimeout(() => {
    hotReloadTimer = null;
    broadcastHotReload(path || "static");
  }, 900);
}

function ensureHotReloadWatcher(): void {
  if (!hotReloadEnabled || hotReloadWatcher) return;
  try {
    const watchRoot = existsSync(builtStaticRoot) ? builtStaticRoot : staticRoot;
    hotReloadWatcher = watch(watchRoot, { persistent: false }, (_eventType, filename) => scheduleHotReload(filename));
  } catch (error) {
    appendLog("stderr", `hot reload watcher failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function hotReloadEvents(): Response {
  if (!hotReloadEnabled) return json({ error: "hot reload disabled" }, { status: 404 });
  ensureHotReloadWatcher();
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;
      const ping = setInterval(() => {
        try {
          controller.enqueue(hotReloadEncoder.encode(`: ping ${Date.now()}\n\n`));
        } catch {
          closeHotReloadClient(controller);
        }
      }, 15_000);
      hotReloadClients.set(controller, ping);
      controller.enqueue(hotReloadEncoder.encode("retry: 1000\n"));
      sendHotReloadEvent(controller, "ready", { version: hotReloadVersion });
    },
    cancel() {
      if (controllerRef) closeHotReloadClient(controllerRef);
    },
  });
  return new Response(stream, {
    headers: {
      "cache-control": "no-cache",
      connection: "keep-alive",
      "content-type": "text/event-stream; charset=utf-8",
      "x-accel-buffering": "no",
    },
  });
}

const gameContext = createDashboardGameContextService({
  appendLog,
  defaultRepoRoot,
  defaultStateDir,
  packageRoot,
});

const cycleProcessMirror = createCycleProcessMirror({ appendLog });

processController = createManagedProcessController({
  packageRoot,
  gameToSummary: (game) => gameToSummary(game as ResolvedGame) as unknown as JsonObject,
  mirrorProcessState: (params) =>
    cycleProcessMirror.mirrorProcessStateToCycle({
      ...params,
      game: params.game as ResolvedGame | GameSummary | null | undefined,
    }),
});

const commandRunner = createUiCommandRunner({ appendLog, packageRoot });
const operationState = createOperationStateService();

const kernelRuntime = createDashboardKernelRuntimeService({
  activeCycleUuid,
  appendLog,
  defaultStateDir,
  env: Bun.env as Record<string, string | undefined>,
  json,
  latestRunId,
  packageRoot,
  port,
  recordCycleKernelTrace,
});

function gameKernelTraceHref(
  gameId: string,
  appSessionId: string,
  containerId: string,
): string {
  const params = new URLSearchParams({
    gameId,
    traceId: appSessionId,
    containerId,
  });
  return `/workspace/trace?${params.toString()}`;
}

function kernelTraceRowText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Kernel trace row has invalid ${field}`);
  }
  return value.trim();
}

async function readKernelTraceLinkages(
  gameId: string,
  gameEventIds: readonly string[],
  appSessionIds: readonly string[],
): Promise<readonly KernelTraceLinkage[]> {
  return readKernelTraceLinkagesFromConfiguredReader(
    kernelRuntime.databaseUrl(),
    appSessionIds,
    gameEventIds,
    () => kernelRuntime.runtime(),
    async (current) => {
      const db = current.db as KernelTraceDatabase;
      const rows = await buildGameKernelTraceQuery(
        db,
        gameId,
        gameEventIds,
        appSessionIds,
      );
      const observations = rows.flatMap((row): KernelTraceEventObservation[] => {
        const appSessionId = kernelTraceRowText(row.appSessionId, "app_session_id");
        const containerId = kernelTraceRowText(row.containerId, "container_id");
        const kernelEventId = kernelTraceRowText(row.kernelEventId, "id");
        return [{
          app_session_id: appSessionId,
          container_id: containerId,
          event_data: row.eventData,
          kernel_event_id: kernelEventId,
          trace_url: gameKernelTraceHref(gameId, appSessionId, containerId),
        }];
      });
      return kernelTraceLinkagesFromObservations(observations, gameId, gameEventIds);
    },
  );
}

function readGameEventDatabase<T>(stateDir: string, read: (db: Database) => T): T {
  const databasePath = resolve(stateDir, "orchestrator.sqlite");
  if (!existsSync(databasePath)) throw new Error("Game event database is unavailable");
  const db = new Database(databasePath, { readonly: true });
  try {
    return read(db);
  } finally {
    db.close();
  }
}

const eventReadApi = {
  queryEvents(stateDir: string, input: GameEventQueryInput) {
    return readGameEventDatabase(stateDir, (db) => queryGameEvents(db, input));
  },
  async reconstructEvents(
    stateDir: string,
    gameId: string,
    correlationId: string,
    options: GameEventReconstructionPageOptions,
  ) {
    const kernelConfigured = Boolean(kernelRuntime.databaseUrl()?.trim());
    const { reconstruction, appSessionIds } = readGameEventDatabase(stateDir, (db) => ({
      reconstruction: reconstructGameEvents(db, gameId, correlationId, options),
      appSessionIds: kernelConfigured
        ? readGameKernelAppSessionIds(db, gameId)
        : [],
    }));
    return enrichGameEventReconstructionFromKernelReader(
      reconstruction,
      (gameEventIds) =>
        readKernelTraceLinkages(gameId, gameEventIds, appSessionIds),
    );
  },
};

export async function closeKernelRuntimeForTests(): Promise<void> {
  await kernelRuntime.closeForTests();
}

export async function reconcileSyncStartup(): Promise<void> {
  await syncRuntime.reconcileStartup({});
}

const campaignStatus = createCampaignStatusService({
  appendLog,
  outputTail: commandRunner.outputTail,
  runGit: commandRunner.runGit,
});

const savePoints = createSavePointRuntime({
  appendLog,
  invalidateCampaignCache: campaignStatus.invalidateCampaignCache,
  outputTail: commandRunner.outputTail,
  resolveDashboardGame: gameContext.resolveDashboardGame,
  runCli: commandRunner.runCli,
  serverJobPath,
});

const syncRuntime = createSyncRuntime({
  appendLog,
  kernelEnabled: kernelRuntime.enabled,
  hasActiveProcess: (stateDir) => processController.hasActiveProcess(stateDir),
  packageRoot,
  resolveDashboardGame: gameContext.resolveDashboardGame,
  runCli: commandRunner.runCli,
  runGit: commandRunner.runGit,
  serverJobPath,
  sourceRoot,
  stopManaged: (body) => processControlRuntime.stopManaged(body),
  submitWorkflowEvent: (paths, input) =>
    kernelRuntime.submitWorkflowEvent(paths as GameRuntimeContext, input),
});

const prRecords = createPrRecordsService({
  appendLog,
  latestChildDirectory,
  latestPrSplitPlanSummary,
  latestRunId,
  cycleUuidForRun: (stateDir, runId) => {
    const store = openState(stateDir);
    try {
      const run = runId ? getRun(store, runId) : null;
      return canonicalCycleSessionId({
        db: store.db,
        gameId: run?.gameId,
        cycleUuid: run?.cycleUuid,
        fallback: "",
      });
    } finally {
      store.db.close();
    }
  },
  localPrepOperationRunning: () => {
    const operation = operationState.getOperation();
    return Boolean(
      operation?.status === "running"
      && (operation.name === "prepare-local-pr" || operation.name === "prepare-local-batch"),
    );
  },
});

const preparingRuntime = createPreparingRuntime({
  activeCyclePrBlockers: prRecords.activeCyclePrBlockers,
  appendLog,
  beginOperation: operationState.beginOperation,
  boundarySavePoint: (paths, trigger, cycleUuid, label) =>
    savePoints.boundarySavePoint(paths as GameRuntimeContext, trigger, cycleUuid, label),
  endOperation: operationState.endOperation,
  hasActiveProcess: (stateDir) => processController.hasActiveProcess(stateDir),
  kernelDatabaseUrl: kernelRuntime.databaseUrl,
  kernelEnabled: kernelRuntime.enabled,
  operationStep: operationState.operationStep,
  operationStepDetail: operationState.operationStepDetail,
  packageRoot,
  gameToSummary,
  resolveDashboardGame: gameContext.resolveDashboardGame,
  runCli: commandRunner.runCli,
  runGit: commandRunner.runGit,
  runReport: undefined,
  serverJobPath,
  sourceRoot,
  submitWorkflowEvent: (paths, input) => kernelRuntime.submitWorkflowEvent(paths as GameRuntimeContext, input),
});

const processStatusService = createProcessStatusService({
  defaultStateDir,
  getOperationSnapshot: operationState.getOperationSnapshot,
  preparingState: preparingRuntime.state,
  processController,
});

const processControlRuntime = createProcessControlRuntime({
  appendLog,
  json,
  processController,
  processStatus: processStatusService.processStatus,
  gameToSummary,
  resolveDashboardGame: gameContext.resolveDashboardGame,
  runCli: commandRunner.runCli,
  serverJobPath,
});

const runControlRuntime = createRunControlRuntime({
  hasActiveProcess: (stateDir) => processController.hasActiveProcess(stateDir),
  resolveDashboardGame: gameContext.resolveDashboardGame,
  stopManaged: processControlRuntime.stopManaged,
});

function runActionProjection(
  body: JsonObject,
  actionId: Extract<ActionProjection["action_id"], `run.${string}`>,
): ActionProjection {
  const paths = gameContext.resolveDashboardGame(body, { useDefaultGame: true });
  const bodyGameId = typeof body.gameId === "string" ? body.gameId.trim() : "";
  const gameId = paths.game?.gameId ?? bodyGameId;
  if (!gameId) throw new Error(`Cannot game ${actionId} without a game id`);
  const runId = typeof body.runId === "string" && body.runId.trim() ? body.runId.trim() : undefined;
  const store = openState(paths.stateDir);
  try {
    const action = gameRunActionState(store, gameId, {
      hasActiveProcess: (stateDir) => processController.hasActiveProcess(stateDir),
      runId,
    }).availableActions.find((candidate) => candidate.action_id === actionId);
    if (!action) throw new Error(`Missing ${actionId} action projection`);
    return action;
  } finally {
    store.db.close();
  }
}

const standards = createStandardsService({
  appendLog,
  gameDefaults: gameContext.gameDefaults,
  gameToSummary,
});

const validationRuntime = createValidationRuntime({
  appendLog,
  gameToSummary,
  resolveDashboardGame: gameContext.resolveDashboardGame,
});

const dashboardReadModel = createDashboardReadModel({
  appendLog,
  buildPrRecordsView: prRecords.buildPrRecordsView,
  campaignStatus: campaignStatus.campaignStatus,
  hasActiveProcess: (stateDir) => processController.hasActiveProcess(stateDir),
  processStatus: processStatusService.processStatus,
  gameToSummary,
  refreshSyncUpstreamObservation: (paths, observedUpstream) => syncRuntime.refreshObservation({
    observedUpstream,
    gameId: paths.game?.gameId,
    repoRoot: paths.repoRoot,
    stateDir: paths.stateDir,
    usePathOverrides: true,
  }),
});

function dashboardEvents(url: URL): Response {
  const paths = gameContext.requestPaths(url, { useDefaultGame: true });
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;
  let interval: ReturnType<typeof setInterval> | null = null;
  let lastSignature = "";
  let closed = false;
  let inFlight = false;

  const send = (event: string, data: JsonObject): void => {
    if (!controllerRef || closed) return;
    controllerRef.enqueue(hotReloadEncoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
  };

  const pushDashboard = async (force = false): Promise<void> => {
    if (!controllerRef || closed || inFlight) return;
    inFlight = true;
    try {
      const dashboard = await dashboardReadModel.runDashboard(paths);
      const signature = dashboardReadModel.dashboardStableSignature(dashboard);
      const payload = JSON.stringify(dashboard);
      if (force || signature !== lastSignature) {
        lastSignature = signature;
        controllerRef.enqueue(hotReloadEncoder.encode(`event: dashboard\ndata: ${payload}\n\n`));
      } else {
        send("dashboard-tick", dashboardReadModel.dashboardTick(dashboard));
      }
    } catch (error) {
      send("dashboard-error", { error: error instanceof Error ? error.message : String(error) });
    } finally {
      inFlight = false;
    }
  };

  const close = (): void => {
    closed = true;
    if (interval) clearInterval(interval);
    interval = null;
    controllerRef = null;
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;
      controller.enqueue(hotReloadEncoder.encode("retry: 1000\n"));
      send("ready", { intervalMs: dashboardStreamIntervalMs });
      void pushDashboard(true);
      interval = setInterval(() => {
        void pushDashboard(false);
      }, dashboardStreamIntervalMs);
    },
    cancel() {
      close();
    },
  });

  return new Response(stream, {
    headers: {
      "cache-control": "no-cache",
      connection: "keep-alive",
      "content-type": "text/event-stream; charset=utf-8",
      "x-accel-buffering": "no",
    },
  });
}

async function checkpointRun(body: JsonObject): Promise<JsonObject> {
  const paths = gameContext.resolveDashboardGame(body, { useDefaultGame: true });
  const runId = typeof body.runId === "string" && body.runId.trim()
    ? body.runId.trim()
    : latestRunId(paths.stateDir);
  if (!runId) throw new Error("No run found. Initialize a run before creating a checkpoint.");
  if (processController.hasActiveProcess(paths.stateDir).active) {
    throw new Error("Checkpoint cannot start while the managed run process is active.");
  }

  const store = openState(paths.stateDir);
  const run = (() => {
    try {
      return getRun(store, runId);
    } finally {
      store.db.close();
    }
  })();
  if (!run) throw new Error(`Run not found: ${runId}`);
  const cycleUuid = run.cycleUuid?.trim();
  if (!cycleUuid) throw new Error(`Run ${runId} has no cycle UUID for its checkpoint save-point.`);

  const command = ["bun", serverJobPath];
  if (paths.game) command.push("--game", paths.game.gameId);
  command.push(
    "--repo-root",
    paths.repoRoot,
    "--state-dir",
    paths.stateDir,
    "checkpoint-run",
    "--run-id",
    runId,
  );
  const result = await commandRunner.runCli(command);
  if (result.exitCode !== 0) {
    throw new Error(
      `Run checkpoint failed (${result.exitCode}): ${commandRunner.outputTail(result.stderr || result.stdout, 800)}`,
    );
  }
  const checkpoint = savePoints.parseCliJsonOutput(result.stdout);
  const savePoint = await savePoints.boundarySavePoint(
    paths,
    "checkpoint",
    cycleUuid,
    `run ${runId} checkpoint`,
  );
  return {
    game: paths.game ? gameToSummary(paths.game) : null,
    ...checkpoint,
    savePoint,
  };
}

function resumeRun(body: JsonObject): JsonObject {
  const paths = gameContext.resolveDashboardGame(body, { useDefaultGame: true });
  const runId = typeof body.runId === "string" && body.runId.trim()
    ? body.runId.trim()
    : latestRunId(paths.stateDir);
  if (!runId) throw new Error("No run found. Initialize a run before resuming.");
  const store = openState(paths.stateDir);
  try {
    const currentRun = getRun(store, runId);
    if (!currentRun) throw new Error(`Run not found: ${runId}`);
    const gameId = paths.game?.gameId ?? currentRun.gameId;
    if (!gameId) throw new Error(`Run ${runId} cannot resume without a game id`);
    const commandId = typeof body.commandId === "string" && body.commandId.trim()
      ? body.commandId.trim()
      : `command-run-resume-${randomUUID()}`;
    const { run } = activateRun({
      actor: "operator",
      commandId,
      gameId,
      reason: "operator resumed run",
      runId,
      store,
    });
    appendLog("ui", `run ${runId} resumed`);
    return {
      resumed: true,
      game: paths.game ? gameToSummary(paths.game) : null,
      repoRoot: paths.repoRoot,
      stateDir: paths.stateDir,
      run,
    };
  } finally {
    store.db.close();
  }
}

async function handleApi(req: Request, url: URL): Promise<Response> {
  const localFont = localFontResponse(req, url);
  if (localFont) return localFont;

  const events = await handleEventsApiRoute(req, url, {
    json,
    gameContext,
    queryEvents: eventReadApi.queryEvents,
    reconstructEvents: eventReadApi.reconstructEvents,
  });
  if (events) return events;

  const sync = await handleSyncApiRoute(req, url, {
    action: syncRuntime.action,
    cancel: syncRuntime.cancel,
    json,
    publish: syncRuntime.publish,
    recover: syncRuntime.recover,
    resolveConflict: syncRuntime.resolveConflict,
    start: syncRuntime.start,
  });
  if (sync) return sync;

  const cycles = await handleCyclesApiRoute(req, url, {
    availableGames: gameContext.availableGames,
    dashboardEvents,
    dashboardStreamIntervalMs,
    defaultGraphDbPath: (game) => (game as ResolvedGame | null)?.graphDbPath ?? resolve(defaultStateDir, "knowledge-graph.sqlite"),
    defaultGame: gameContext.defaultGame,
    defaultGameId: (game) => (game as ResolvedGame | null)?.gameId ?? "",
    defaultRepoRoot,
    defaultStateDir,
    hotReloadEnabled,
    hotReloadEvents,
    json,
    packageRoot,
    port,
    calculateBaselineForPrepare: preparingRuntime.calculateBaselineForPrepare,
    indexPrsForPrepare: preparingRuntime.indexPrsForPrepare,
    gameDefaults: (game) => gameContext.gameDefaults(game as ResolvedGame | null),
    gameToSummary: (game) => gameToSummary(game as ResolvedGame),
    requestPaths: gameContext.requestPaths,
    runDashboard: (paths) => dashboardReadModel.runDashboard(paths as GameRuntimeContext),
    runDetails: (stateDir, runId, game) => dashboardReadModel.runDetails(stateDir, runId, game as ResolvedGame | null),
    workerStateTrace: (stateDir, runId, workerStateId) => dashboardReadModel.workerStateTrace(stateDir, runId, workerStateId),
    syncGitForPrepare: preparingRuntime.syncGitForPrepare,
  });
  if (cycles) return cycles;

  const cycleResponse = await handleCycleApiRoute(req, url, {
    baseRefForGame: (game) => (game as ResolvedGame | null)?.baseRef ?? "origin/master",
    campaignStatus: campaignStatus.campaignStatus,
    createSavePoint: savePoints.createSavePoint,
    invalidateCampaignCache: campaignStatus.invalidateCampaignCache,
    json,
    gameIdForGame: (game) => (game as ResolvedGame | null)?.gameId ?? "",
    requestPaths: gameContext.requestPaths,
    submitCycleStartedTrace: async (paths, cycle) => {
      const runtimePaths = paths as GameRuntimeContext;
      const gameId = kernelRuntime.gameId(runtimePaths);
      if (cycle.gameId !== gameId) {
        throw new Error(
          `Cycle trace game ${cycle.gameId} does not match request game ${gameId}`,
        );
      }
      const { resolveGameEventTraceLinkage } = await import(
        "@server/core/harness-state/kernel-links"
      );
      const traceLinkage = (() => {
        const store = openState(runtimePaths.stateDir);
        try {
          const durableCycle = getCycleByUuid(
            store.db,
            cycle.cycleUuid,
          );
          if (!durableCycle || durableCycle.game_id !== gameId) {
            throw new Error(
              `Cycle ${cycle.cycleUuid} has no durable state in game ${gameId}`,
            );
          }
          if (!durableCycle.caused_by_event_id) {
            throw new Error(
              `Cycle ${cycle.cycleUuid} has no durable opening event`,
            );
          }
          const linkage = resolveGameEventTraceLinkage(
            store.db,
            gameId,
            durableCycle.caused_by_event_id,
          );
          if (linkage.correlationId !== cycle.cycleUuid) {
            throw new Error(
              `Cycle trace correlation ${linkage.correlationId} does not match ${cycle.cycleUuid}`,
            );
          }
          return linkage;
        } finally {
          store.db.close();
        }
      })();
      return kernelRuntime.submitWorkflowEvent(runtimePaths, {
        kind: "session",
        operation: "New cycle started",
        status: "started",
        sessionId: cycle.cycleUuid,
        detail: "New cycle started.",
        metadata: {
          baseRef: cycle.baseRef,
          baseSha: cycle.baseSha,
          cycleUuid: cycle.cycleUuid,
        },
        correlationId: traceLinkage.correlationId,
        gameEventId: traceLinkage.gameEventId,
        causedByEventId: traceLinkage.causedByEventId,
      });
    },
  });
  if (cycleResponse) return cycleResponse;

  const kernel = await handleKernelApiRoute(url, {
    json,
    kernelReadApiResponse: kernelRuntime.readApiResponse,
    kernelRuntimeRequired: kernelRuntime.kernelRuntimeRequired,
    kernelStatus: kernelRuntime.status,
  });
  if (kernel) return kernel;

  const agents = await handleAgentsApiRoute(url, {
    json,
    loadKernelAgentsPayload: (paths) => loadKernelAgentsPayload(paths as GameRuntimeContext),
    requestPaths: gameContext.requestPaths,
  });
  if (agents) return agents;

  const knowledge = await handleKnowledgeApiRoute(req, url, {
    action: (body) => {
      const paths = gameContext.resolveDashboardGame(body, { useDefaultGame: true });
      const gameId = paths.game?.gameId ?? (typeof body.gameId === "string" ? body.gameId.trim() : "");
      if (!gameId) throw new Error("Cannot resolve knowledge.process without a game id");
      const store = openState(paths.stateDir);
      try {
        const action = getHarnessStateView(store, gameId).available_actions.find(
          (candidate) => candidate.action_id === "knowledge.process",
        );
        if (!action || action.action_id !== "knowledge.process") throw new Error("Missing knowledge.process action projection");
        return {
          ...action,
          action_id: "knowledge.process" as const,
          subject_kind: "game" as const,
          confirmation_required: false as const,
        };
      } finally {
        store.db.close();
      }
    },
    applyStandardEdit: (edit, game) => standards.applyStandardEdit(edit, game as ResolvedGame | null),
    json,
    loadStandardsPayload: (game) => standards.loadStandardsPayload(game as ResolvedGame | null),
    requestPaths: gameContext.requestPaths,
    triggerBackgroundKnowledgeProcess: async (paths) => {
      const game = paths.game as ResolvedGame | undefined;
      if (!game) throw new Error("knowledge.process requires a resolved game");
      const store = openState(paths.stateDir);
      try {
        return await triggerBackgroundKnowledgeProcess(store, (job) =>
          kgLibrarianCondense({
            repoRoot: game.repoRoot,
            stateDir: paths.stateDir,
            gameId: game.gameId,
            game,
            graphDbPath: game.graphDbPath,
            dryRunAgents: false,
            provider: DEFAULT_PI_PROVIDER,
            model: DEFAULT_PI_MODEL,
            thinkingLevel: DEFAULT_PI_THINKING_LEVEL,
            agentTimeoutSeconds: game.dashboard.agentTimeoutSeconds,
          }, new Map<string, string | true>([
            ["--worker-state-id", job.workerStateId],
            ["--run-id", typeof job.provenance.run_id === "string" ? job.provenance.run_id : ""],
          ])),
        );
      } finally {
        store.db.close();
      }
    },
  });
  if (knowledge) return knowledge;

  const knowledgeLearnings = await handleKnowledgeLearningsApiRoute(req, url, { json });
  if (knowledgeLearnings) return knowledgeLearnings;

  const processControl = await handleProcessControlApiRoute(req, url, {
    json,
    processStatus: (stateDir, game) => processStatusService.processStatus(stateDir, game as ResolvedGame | null),
    requestPaths: gameContext.requestPaths,
    runActionProjection,
    startManagedProcess: processControlRuntime.startManagedProcess,
    stopManaged: processControlRuntime.stopManaged,
  });
  if (processControl) return processControl;

  const handoff = await handleHandoffApiRoute(req, url, {
    checkpointRun,
    createSavePoint: savePoints.createSavePoint,
    json,
  });
  if (handoff) return handoff;

  const runs = await handleRunsApiRoute(req, url, {
    cancelRun: runControlRuntime.cancel,
    completeRun: preparingRuntime.completeRun,
    freshRun: preparingRuntime.freshRun,
    hardStopRun: runControlRuntime.hardStop,
    initRun: preparingRuntime.initRun,
    json,
    recoverRun: runControlRuntime.recover,
    resumeRun: async (body) => {
      const resumed = resumeRun(body);
      const response = await processControlRuntime.startManagedProcess(body);
      const process = (await response.json().catch(() => null)) as JsonObject | null;
      if (!response.ok) {
        throw new Error(
          typeof process?.error === "string"
            ? process.error
            : `Run process restart failed with HTTP ${response.status}`,
        );
      }
      return { ...resumed, process };
    },
    runActionProjection,
  });
  if (runs) return runs;

  const validation = await handleValidationApiRoute(req, url, {
    json,
    runReportNow: validationRuntime.runReportNow,
  });
  if (validation) return validation;

  return json({ error: "not found" }, { status: 404 });
}

function staticResponse(pathname: string): Response {
  const appRoot = existsSync(resolve(builtStaticRoot, "index.html")) ? builtStaticRoot : staticRoot;
  const file = pathname === "/" ? "index.html" : pathname.slice(1);
  const path = resolve(appRoot, file);
  if (!path.startsWith(appRoot)) return text("Not found", { status: 404 });
  if (!existsSync(path)) {
    const fallback = resolve(appRoot, "index.html");
    if (existsSync(fallback)) return staticFile(fallback);
    return text("Not found", { status: 404 });
  }
  return staticFile(path);
}

export async function fetchServer(req: Request): Promise<Response> {
  const url = new URL(req.url);
  try {
    const kernel = await handleKernelReadRoute(req, url, { kernelReadApiResponse: kernelRuntime.readApiResponse });
    if (kernel) return kernel;
    if (url.pathname.startsWith("/api/")) return await handleApi(req, url);
    return staticResponse(url.pathname);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export function serveServer(): ReturnType<typeof Bun.serve> {
  const server = Bun.serve({
    port,
    fetch: fetchServer,
  });
  void kernelRuntime.startTraceTailer().catch((error) => {
    appendLog("stderr", `agent-kernel tailer start failed: ${error instanceof Error ? error.message : String(error)}`);
  });
  console.log(`decomp-orchestrator UI listening on http://localhost:${port}${hotReloadEnabled ? " (hot reload enabled)" : ""}`);
  return server;
}

if (import.meta.main) {
  await reconcileSyncStartup();
  serveServer();
}
