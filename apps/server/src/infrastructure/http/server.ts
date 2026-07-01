import { existsSync, watch, type FSWatcher } from "node:fs";
import { resolve } from "node:path";
import { handleProjectSessionApiRoute } from "@server/api/project-session/routes";
import { handleAgentsApiRoute } from "@server/api/routes/agents";
import { createCampaignStatusService } from "@server/application/dashboard/campaign-status";
import { createDashboardKernelRuntimeService } from "@server/infrastructure/kernel/runtime";
import { createOperationStateService } from "@server/application/dashboard/operation-state";
import { createDashboardProjectContextService, projectToSummary } from "@server/application/dashboard/project-context";
import { createDashboardReadModel } from "@server/application/dashboard/read-model";
import { latestChildDirectory, latestPrSplitPlanSummary } from "@server/core/session-runtime/phases/pr/artifacts";
import { createPrRecordsService } from "@server/core/session-runtime/phases/pr/pr-records";
import { createPrSyncService } from "@server/core/session-runtime/phases/pr/pr-sync";
import { createHandoffRuntime, localPrPreparationOperationRunning } from "@server/core/session-runtime/phases/pr/runtime";
import { createSavePointRuntime } from "@server/core/session-runtime/phases/pr/save-points-runtime";
import { createPrWorktreeService } from "@server/core/session-runtime/phases/pr/pr-worktrees";
import { handleHandoffApiRoute } from "@server/api/routes/handoff";
import { handleKernelApiRoute, handleKernelReadRoute } from "@server/api/routes/kernel";
import { handleKnowledgeApiRoute } from "@server/api/routes/knowledge";
import { createStandardsService } from "@server/core/knowledge/standards";
import { sourceRoot } from "@server/core/knowledge";
import { createProcessControlRuntime } from "@server/core/session-runtime/phases/running/process-control/runtime";
import { handleProcessControlApiRoute } from "@server/api/routes/process-control";
import { createProcessStatusService } from "@server/application/dashboard/process-status";
import { latestRunId } from "@server/core/session-runtime/run-state/latest-run";
import { handleRunsApiRoute } from "@server/api/routes/runs";
import { createPreparingRuntime } from "@server/core/session-runtime/phases/preparing/runtime";
import { handleSessionsApiRoute } from "@server/api/routes/sessions";
import { createValidationRuntime } from "@server/core/validation/runtime";
import { handleValidationApiRoute } from "@server/api/routes/validation";
import { readRegressionReport } from "@server/core/validation/objdiff/report";
import { createManagedProcessController, type ManagedProcessController, type ProcessLogLine } from "@server/infrastructure/process-control/managed-process-controller";
import { createProjectSessionProcessMirror } from "@server/core/project-session/process-mirror";
import { getActiveProjectSession, getProjectSessionByUuid, updateProjectSession } from "@server/core/project-session/store";
import { openState } from "@server/core/orchestrator-state";
import { createUiCommandRunner } from "@server/infrastructure/shell/ui-command-runner";
import { localFontResponse } from "@server/infrastructure/http/local-fonts";
import type { ProjectRuntimeContext, ProjectSummary, ResolvedProject } from "@server/core/project-registry";
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

function activeProjectSessionUuid(stateDir: string, projectId: string): string | null {
  const store = openState(stateDir);
  try {
    return getActiveProjectSession(store.db, projectId)?.session_uuid ?? null;
  } finally {
    store.db.close();
  }
}

function recordProjectSessionKernelTrace(
  stateDir: string,
  projectId: string,
  sessionUuid: string,
  trace: {
    activeContainerId: string;
    appSessionId: string;
    rootContainerId: string;
    traceUrl: string;
  },
): void {
  const store = openState(stateDir);
  try {
    const record = getProjectSessionByUuid(store.db, sessionUuid);
    if (!record || record.project_id !== projectId) return;
    updateProjectSession(store.db, record.id, {
      kernel_trace_json: {
        ...(record.kernel_trace_json ?? {}),
        session_uuid: record.session_uuid,
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

const projectContext = createDashboardProjectContextService({
  appendLog,
  defaultRepoRoot,
  defaultStateDir,
  packageRoot,
});

const projectSessionProcessMirror = createProjectSessionProcessMirror({ appendLog });

processController = createManagedProcessController({
  packageRoot,
  projectToSummary: (project) => projectToSummary(project as ResolvedProject) as unknown as JsonObject,
  mirrorProcessState: (params) =>
    projectSessionProcessMirror.mirrorProcessStateToProjectSession({
      ...params,
      project: params.project as ResolvedProject | ProjectSummary | null | undefined,
    }),
});

const commandRunner = createUiCommandRunner({ appendLog, packageRoot });
const operationState = createOperationStateService();

const kernelRuntime = createDashboardKernelRuntimeService({
  activeProjectSessionUuid,
  appendLog,
  defaultStateDir,
  env: Bun.env as Record<string, string | undefined>,
  json,
  latestRunId,
  packageRoot,
  port,
  recordProjectSessionKernelTrace,
});

export async function closeKernelRuntimeForTests(): Promise<void> {
  await kernelRuntime.closeForTests();
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
  resolveDashboardProject: projectContext.resolveDashboardProject,
  runCli: commandRunner.runCli,
  serverJobPath,
});

const prRecords = createPrRecordsService({
  appendLog,
  latestChildDirectory,
  latestPrSplitPlanSummary,
  latestRunId,
  localPrepOperationRunning: () => localPrPreparationOperationRunning(operationState.getOperation()),
});

const prSync = createPrSyncService({
  appendLog,
  latestPrSplitPlanSummary,
  latestRunId,
  outputTail: commandRunner.outputTail,
  records: prRecords,
  resolveDashboardProject: projectContext.resolveDashboardProject,
  runCli: commandRunner.runCli,
});

const prWorktrees = createPrWorktreeService<ProjectRuntimeContext>({
  appendLog,
  branchExists: prSync.branchExists,
  isLocalBranchPrRecord: prSync.isLocalBranchPrRecord,
  localBranchDiffBase: prSync.localBranchDiffBase,
  outputTail: commandRunner.outputTail,
  prBranchPathSlug: prRecords.prBranchPathSlug,
  prWorkspacePath: prRecords.prWorkspacePath,
  readRegressionReport,
  runCli: commandRunner.runCli,
  runGit: commandRunner.runGit,
  submitWorkflowEvent: kernelRuntime.submitWorkflowEvent,
  updatePrRecord: prRecords.updatePrRecord,
});

const preparingRuntime = createPreparingRuntime({
  activeSessionPrBlockers: prRecords.activeSessionPrBlockers,
  appendLog,
  beginOperation: operationState.beginOperation,
  boundarySavePoint: (paths, trigger, label) => savePoints.boundarySavePoint(paths as ProjectRuntimeContext, trigger, label),
  endOperation: operationState.endOperation,
  hasActiveProcess: (stateDir) => processController.hasActiveProcess(stateDir),
  kernelDatabaseUrl: kernelRuntime.databaseUrl,
  kernelEnabled: kernelRuntime.enabled,
  operationStep: operationState.operationStep,
  operationStepDetail: operationState.operationStepDetail,
  packageRoot,
  projectToSummary,
  resolveDashboardProject: projectContext.resolveDashboardProject,
  runCli: commandRunner.runCli,
  runGit: commandRunner.runGit,
  runReport: undefined,
  serverJobPath,
  sourceRoot,
  submitWorkflowEvent: (paths, input) => kernelRuntime.submitWorkflowEvent(paths as ProjectRuntimeContext, input),
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
  projectToSummary,
  resolveDashboardProject: projectContext.resolveDashboardProject,
  runCli: commandRunner.runCli,
  serverJobPath,
});

const handoffRuntime = createHandoffRuntime({
  appendLog,
  hasActiveProcess: (stateDir) => processController.hasActiveProcess(stateDir),
  operationState,
  outputTail: commandRunner.outputTail,
  prRecords,
  prSync,
  prWorktrees,
  processControl: processControlRuntime,
  projectToSummary,
  resolveDashboardProject: projectContext.resolveDashboardProject,
  runCli: commandRunner.runCli,
  runGit: commandRunner.runGit,
  savePoints,
  serverJobPath,
  submitWorkflowEvent: kernelRuntime.submitWorkflowEvent,
  syncMergedPrIntakeForPrepare: preparingRuntime.syncMergedPrIntakeForPrepare,
});

const standards = createStandardsService({
  appendLog,
  projectDefaults: projectContext.projectDefaults,
  projectToSummary,
});

const validationRuntime = createValidationRuntime({
  appendLog,
  projectToSummary,
  resolveDashboardProject: projectContext.resolveDashboardProject,
});

const dashboardReadModel = createDashboardReadModel({
  appendLog,
  buildPrRecordsView: prRecords.buildPrRecordsView,
  campaignStatus: campaignStatus.campaignStatus,
  processStatus: processStatusService.processStatus,
  projectToSummary,
});

function dashboardEvents(url: URL): Response {
  const paths = projectContext.requestPaths(url, { useDefaultProject: true });
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

async function handleApi(req: Request, url: URL): Promise<Response> {
  const localFont = localFontResponse(req, url);
  if (localFont) return localFont;

  const sessions = await handleSessionsApiRoute(req, url, {
    availableProjects: projectContext.availableProjects,
    dashboardEvents,
    dashboardStreamIntervalMs,
    defaultGraphDbPath: (project) => (project as ResolvedProject | null)?.graphDbPath ?? resolve(defaultStateDir, "knowledge-graph.sqlite"),
    defaultProject: projectContext.defaultProject,
    defaultProjectId: (project) => (project as ResolvedProject | null)?.projectId ?? "",
    defaultRepoRoot,
    defaultStateDir,
    hotReloadEnabled,
    hotReloadEvents,
    json,
    packageRoot,
    port,
    calculateBaselineForPrepare: preparingRuntime.calculateBaselineForPrepare,
    indexPrsForPrepare: preparingRuntime.indexPrsForPrepare,
    projectDefaults: (project) => projectContext.projectDefaults(project as ResolvedProject | null),
    projectToSummary: (project) => projectToSummary(project as ResolvedProject),
    requestPaths: projectContext.requestPaths,
    runDashboard: (paths) => dashboardReadModel.runDashboard(paths as ProjectRuntimeContext),
    runDetails: (stateDir, runId, project) => dashboardReadModel.runDetails(stateDir, runId, project as ResolvedProject | null),
    workerStateTrace: (stateDir, runId, workerStateId) => dashboardReadModel.workerStateTrace(stateDir, runId, workerStateId),
    syncGitForPrepare: preparingRuntime.syncGitForPrepare,
    syncProjectIntake: preparingRuntime.syncProjectIntake,
  });
  if (sessions) return sessions;

  const projectSession = await handleProjectSessionApiRoute(req, url, {
    baseRefForProject: (project) => (project as ResolvedProject | null)?.baseRef ?? "origin/master",
    json,
    projectIdForProject: (project) => (project as ResolvedProject | null)?.projectId ?? "",
    requestPaths: projectContext.requestPaths,
    submitSessionStartedTrace: (paths, session) =>
      kernelRuntime.submitWorkflowEvent(paths as ProjectRuntimeContext, {
        kind: "session",
        operation: "New session started",
        status: "started",
        sessionId: session.sessionUuid,
        detail: "New session started.",
        metadata: {
          baseRef: session.baseRef,
          baseSha: session.baseSha,
          sessionUuid: session.sessionUuid,
        },
      }),
  });
  if (projectSession) return projectSession;

  const kernel = await handleKernelApiRoute(url, {
    json,
    kernelReadApiResponse: kernelRuntime.readApiResponse,
    kernelRuntimeRequired: kernelRuntime.kernelRuntimeRequired,
    kernelStatus: kernelRuntime.status,
  });
  if (kernel) return kernel;

  const agents = await handleAgentsApiRoute(url, {
    json,
    loadKernelAgentsPayload: (paths) => loadKernelAgentsPayload(paths as ProjectRuntimeContext),
    requestPaths: projectContext.requestPaths,
  });
  if (agents) return agents;

  const knowledge = await handleKnowledgeApiRoute(req, url, {
    applyStandardEdit: (edit, project) => standards.applyStandardEdit(edit, project as ResolvedProject | null),
    json,
    loadStandardsPayload: (project) => standards.loadStandardsPayload(project as ResolvedProject | null),
    requestPaths: projectContext.requestPaths,
  });
  if (knowledge) return knowledge;

  const processControl = await handleProcessControlApiRoute(req, url, {
    drainManaged: processControlRuntime.drainManaged,
    finishEpochNow: processControlRuntime.finishEpochNow,
    json,
    processStatus: (stateDir, project) => processStatusService.processStatus(stateDir, project as ResolvedProject | null),
    requestPaths: projectContext.requestPaths,
    startManagedProcess: processControlRuntime.startManagedProcess,
    stopManaged: processControlRuntime.stopManaged,
  });
  if (processControl) return processControl;

  const handoff = await handleHandoffApiRoute(req, url, { json, ...handoffRuntime });
  if (handoff) return handoff;

  const runs = await handleRunsApiRoute(req, url, {
    completeRun: preparingRuntime.completeRun,
    freshRun: preparingRuntime.freshRun,
    initRun: preparingRuntime.initRun,
    json,
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

if (import.meta.main) serveServer();
