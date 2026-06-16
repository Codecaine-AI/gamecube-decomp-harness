import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { fetchRunDetails, formBody, loadConfig, postJson } from "../lib/api";
import { asArray, asObject, text, type Dashboard, type FormState, type RunDetails, type UiConfig } from "@decomp-orchestrator/ui-contract";
import { useDashboardStream } from "../hooks/useDashboardStream";
import { DetailsRail } from "./DetailsRail";
import { ProgressPanel } from "./ProgressPanel";
import { Sidebar } from "./Sidebar";
import { type ImprovedMode, type WorkMode, WorkTables } from "./WorkTables";

function schedulingForWorkers(workers: number) {
  const maxWorkers = Number.isFinite(workers) && workers > 0 ? Math.trunc(workers) : 16;
  const queueTargetSize = maxWorkers * 4;
  return {
    maxWorkers,
    candidateLimit: queueTargetSize,
    candidateWindow: queueTargetSize,
    epochSize: String(queueTargetSize),
    epochReadyQueueSize: queueTargetSize,
    fastKgMaintenanceIntervalMs: 180000,
    fastKgMaintenanceReportCount: Math.max(4, maxWorkers),
    queueLowWatermark: maxWorkers,
    queueTargetSize,
  };
}

const RUN_SETTINGS_KEY = "runSettings.v1";

// Run settings the operator tunes per run (pool size, thinking levels, model)
// are remembered across page loads so the next run starts how the last one did.
type SavedRunSettings = Pick<
  FormState,
  | "maxWorkers"
  | "idleSleepMs"
  | "provider"
  | "model"
  | "thinkingLevel"
  | "workerThinkingLevel"
  | "epochSize"
  | "epochReadyQueueSize"
  | "fastKgMaintenanceEnabled"
  | "fastKgMaintenanceIntervalMs"
  | "fastKgMaintenanceReportCount"
  | "fullKgMaintenanceMode"
>;

function loadRunSettings(): Partial<SavedRunSettings> {
  try {
    const raw = localStorage.getItem(RUN_SETTINGS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const settings: Partial<SavedRunSettings> = {};
    if (typeof parsed.maxWorkers === "number" && parsed.maxWorkers > 0) settings.maxWorkers = Math.trunc(parsed.maxWorkers);
    if (typeof parsed.idleSleepMs === "number" && parsed.idleSleepMs >= 100) settings.idleSleepMs = Math.trunc(parsed.idleSleepMs);
    if (typeof parsed.provider === "string" && parsed.provider) settings.provider = parsed.provider;
    if (typeof parsed.model === "string" && parsed.model) settings.model = parsed.model;
    if (typeof parsed.thinkingLevel === "string" && parsed.thinkingLevel) settings.thinkingLevel = parsed.thinkingLevel;
    if (typeof parsed.workerThinkingLevel === "string" && parsed.workerThinkingLevel) settings.workerThinkingLevel = parsed.workerThinkingLevel;
    if (typeof parsed.epochSize === "string" && parsed.epochSize) settings.epochSize = parsed.epochSize;
    if (typeof parsed.epochReadyQueueSize === "number" && parsed.epochReadyQueueSize > 0) settings.epochReadyQueueSize = Math.trunc(parsed.epochReadyQueueSize);
    if (typeof parsed.fastKgMaintenanceEnabled === "boolean") settings.fastKgMaintenanceEnabled = parsed.fastKgMaintenanceEnabled;
    if (typeof parsed.fastKgMaintenanceIntervalMs === "number" && parsed.fastKgMaintenanceIntervalMs >= 0) settings.fastKgMaintenanceIntervalMs = Math.trunc(parsed.fastKgMaintenanceIntervalMs);
    if (typeof parsed.fastKgMaintenanceReportCount === "number" && parsed.fastKgMaintenanceReportCount >= 0) settings.fastKgMaintenanceReportCount = Math.trunc(parsed.fastKgMaintenanceReportCount);
    if (typeof parsed.fullKgMaintenanceMode === "string" && parsed.fullKgMaintenanceMode) settings.fullKgMaintenanceMode = parsed.fullKgMaintenanceMode;
    return settings;
  } catch {
    return {};
  }
}

function saveRunSettings(form: FormState) {
  try {
    const settings: SavedRunSettings = {
      maxWorkers: form.maxWorkers,
      idleSleepMs: form.idleSleepMs,
      provider: form.provider,
      model: form.model,
      thinkingLevel: form.thinkingLevel,
      workerThinkingLevel: form.workerThinkingLevel,
      epochSize: form.epochSize,
      epochReadyQueueSize: form.epochReadyQueueSize,
      fastKgMaintenanceEnabled: form.fastKgMaintenanceEnabled,
      fastKgMaintenanceIntervalMs: form.fastKgMaintenanceIntervalMs,
      fastKgMaintenanceReportCount: form.fastKgMaintenanceReportCount,
      fullKgMaintenanceMode: form.fullKgMaintenanceMode,
    };
    localStorage.setItem(RUN_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Settings still apply for this session if storage is unavailable.
  }
}

function initialForm(): FormState {
  const saved = loadRunSettings();
  const merged = { ...defaultForm, ...saved };
  const sizing = schedulingForWorkers(merged.maxWorkers);
  return {
    ...merged,
    ...sizing,
    epochSize: saved.epochSize ?? sizing.epochSize,
    epochReadyQueueSize: saved.epochReadyQueueSize ?? sizing.epochReadyQueueSize,
    fastKgMaintenanceEnabled: saved.fastKgMaintenanceEnabled ?? merged.fastKgMaintenanceEnabled,
    fastKgMaintenanceIntervalMs: saved.fastKgMaintenanceIntervalMs ?? sizing.fastKgMaintenanceIntervalMs,
    fastKgMaintenanceReportCount: saved.fastKgMaintenanceReportCount ?? sizing.fastKgMaintenanceReportCount,
    fullKgMaintenanceMode: saved.fullKgMaintenanceMode ?? merged.fullKgMaintenanceMode,
  };
}

const defaultForm: FormState = {
  projectId: "",
  usePathOverrides: false,
  repoRoot: "",
  stateDir: "",
  graphDbPath: "",
  processName: "melee-live",
  ...schedulingForWorkers(16),
  idleSleepMs: 5000,
  goalValue: 100,
  provider: "codex-lb",
  model: "gpt-5.5",
  thinkingLevel: "medium",
  workerThinkingLevel: "medium",
  fastKgMaintenanceEnabled: true,
  fullKgMaintenanceMode: "full",
};

type Action = "refresh" | "sync" | "init" | "fresh" | "start" | "startWork" | "stop" | "forceStop" | "pausePr" | "resumePr" | "checkpoint" | "qa" | "reconcile" | "splitPlan" | "preparePr" | "syncPrs" | "openPr" | "openAllPrs";

// Multi-step server operations tracked by process.operation. Triggering one
// auto-opens the details rail on the Logs tab so the activity card and live
// output are in view the moment the work starts.
const operationActions: ReadonlySet<Action> = new Set(["sync", "fresh", "checkpoint", "qa", "reconcile", "splitPlan", "preparePr", "openPr", "openAllPrs"]);

const actionLabels: Record<Action, string> = {
  refresh: "Refreshing dashboard...",
  sync: "Syncing code, intaking newly merged PRs, and rebuilding knowledge...",
  init: "Initializing run and seeding targets...",
  fresh: "Checkpointing current run, resetting report start, initializing a new run, and refreshing PRs...",
  start: "Starting babysit process...",
  startWork: "Resuming or initializing the run and starting workers...",
  stop: "Draining managed process...",
  forceStop: "Killing workers and recovering leases...",
  pausePr: "Draining workers and pausing the run...",
  resumePr: "Resuming intake for this run...",
  checkpoint: "Checkpointing run for PR handoff...",
  qa: "Running PR QA gate...",
  reconcile: "Running reconcile agent to fix regressions before handoff...",
  splitPlan: "Building PR split plan...",
  preparePr: "Pausing, checkpointing, running QA repair, and planning PRs...",
  syncPrs: "Syncing PR status from GitHub...",
  openPr: "Opening draft PR (verify slice, branch, push, create)...",
  openAllPrs: "Opening all planned draft PRs, one slice at a time...",
};

function useHotReload(config: UiConfig | null) {
  useEffect(() => {
    if (!config?.hotReload || typeof EventSource === "undefined") return;
    const events = new EventSource("/api/dev-events");
    let connected = false;
    events.addEventListener("ready", () => {
      connected = true;
    });
    events.addEventListener("reload", () => {
      window.location.reload();
    });
    events.addEventListener("error", () => {
      if (!connected) return;
      // EventSource reconnects by itself. A reload event from the server is the
      // only thing that should refresh the document.
    });
    return () => events.close();
  }, [config]);
}

function loadDetailsCollapsed(): boolean {
  try {
    // ?details=logs|run|agents deep-links into an open rail tab.
    if (new URLSearchParams(window.location.search).has("details")) return false;
    const stored = localStorage.getItem("detailsCollapsed");
    return stored === null ? true : stored === "1";
  } catch {
    return true;
  }
}

function saveDetailsCollapsed(collapsed: boolean) {
  try {
    localStorage.setItem("detailsCollapsed", collapsed ? "1" : "0");
  } catch {
    // The rail still works if storage is unavailable.
  }
}

function loadSidebarCollapsed(): boolean {
  try {
    const stored = localStorage.getItem("sidebarCollapsed");
    return stored === "1";
  } catch {
    return false;
  }
}

export const DETAILS_RAIL_MIN_WIDTH = 400;
export const DETAILS_RAIL_MAX_WIDTH = 860;
const DETAILS_RAIL_DEFAULT_WIDTH = 600;

function clampDetailsWidth(width: number): number {
  if (!Number.isFinite(width)) return DETAILS_RAIL_DEFAULT_WIDTH;
  return Math.min(DETAILS_RAIL_MAX_WIDTH, Math.max(DETAILS_RAIL_MIN_WIDTH, Math.round(width)));
}

function loadDetailsWidth(): number {
  try {
    const stored = localStorage.getItem("detailsWidth");
    if (stored === null) return DETAILS_RAIL_DEFAULT_WIDTH;
    return clampDetailsWidth(Number(stored));
  } catch {
    return DETAILS_RAIL_DEFAULT_WIDTH;
  }
}

function saveDetailsWidth(width: number) {
  try {
    localStorage.setItem("detailsWidth", String(width));
  } catch {
    // The rail still works if storage is unavailable.
  }
}

function saveSidebarCollapsed(collapsed: boolean) {
  try {
    localStorage.setItem("sidebarCollapsed", collapsed ? "1" : "0");
  } catch {
    // The rail still works if storage is unavailable.
  }
}

/**
 * Error-only banner over the center column: client-triggered actions that
 * fail without a process.operation record (start, stop, init) have no other
 * surface. Live operation progress belongs to the Logs tab's activity card
 * (auto-opened when an operation starts), never to the center column — the
 * center is the run, not a status ticker.
 */
function ErrorStrip({ error, onDismiss }: { error: string; onDismiss: () => void }) {
  if (!error) return null;
  return (
    <div className="flex w-full items-center gap-2.5 border-b border-down/40 bg-down/10 px-3 py-1.5 text-xs text-down">
      <span>✕</span>
      <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap" title={error}>
        {error}
      </span>
      <button className="ml-auto whitespace-nowrap text-down/80 hover:text-down" onClick={onDismiss} type="button">
        dismiss
      </button>
    </div>
  );
}

export function App() {
  const [config, setConfig] = useState<UiConfig | null>(null);
  const [form, setFormState] = useState<FormState>(initialForm);
  const [action, setAction] = useState<Action | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [sidebarCollapsed, setSidebarCollapsedState] = useState(loadSidebarCollapsed);
  const [detailsCollapsed, setDetailsCollapsedState] = useState(loadDetailsCollapsed);
  const [detailsWidth, setDetailsWidthState] = useState(loadDetailsWidth);
  const [detailsResizing, setDetailsResizing] = useState(false);
  const [improvedMode, setImprovedMode] = useState<ImprovedMode>("confirmed");
  const [improvedPage, setImprovedPage] = useState(0);
  const [workMode, setWorkMode] = useState<WorkMode>("active");
  const [runDetails, setRunDetails] = useState<RunDetails | null>(null);
  const [loadingRunDetails, setLoadingRunDetails] = useState(false);
  const [detailsTabRequest, setDetailsTabRequest] = useState<{ nonce: number; tab: "agents" | "logs" | "run" } | null>(null);

  const setForm = useCallback((updates: Partial<FormState>) => {
    setFormState((current) => ({ ...current, ...updates }));
  }, []);

  const showError = useCallback((error: Error) => {
    console.error(error);
    setErrorMessage(error.message);
  }, []);

  const { dashboard, manualRefresh, streamState } = useDashboardStream({
    enabled: Boolean(config && (form.projectId || (form.repoRoot && form.stateDir))),
    form,
    intervalMs: config?.dashboardStreamIntervalMs || 2500,
    onError: showError,
  });

  useHotReload(config);

  useEffect(() => {
    saveRunSettings(form);
  }, [form]);

  useEffect(() => {
    void loadConfig()
      .then((loaded) => {
        const projectDefaults = asObject(loaded.projectDefaults);
        const dashboardDefaults = asObject(projectDefaults.dashboard);
        setConfig(loaded);
        setFormState((current) => ({
          ...current,
          ...schedulingForWorkers(current.maxWorkers),
          projectId: loaded.defaultProjectId,
          usePathOverrides: false,
          repoRoot: loaded.defaultRepoRoot,
          stateDir: loaded.defaultStateDir,
          graphDbPath: loaded.defaultGraphDbPath,
          processName: String(projectDefaults.processName || current.processName),
          goalValue: Number(dashboardDefaults.goalValue || current.goalValue),
          epochSize: String(dashboardDefaults.epochSize || current.epochSize),
          epochReadyQueueSize: Number(dashboardDefaults.epochReadyQueueSize || current.epochReadyQueueSize),
          fastKgMaintenanceEnabled: dashboardDefaults.fastKgMaintenanceEnabled !== false,
          fastKgMaintenanceIntervalMs: Number(dashboardDefaults.fastKgMaintenanceIntervalMs || current.fastKgMaintenanceIntervalMs),
          fastKgMaintenanceReportCount: Number(dashboardDefaults.fastKgMaintenanceReportCount || current.fastKgMaintenanceReportCount),
          fullKgMaintenanceMode: String(dashboardDefaults.fullKgMaintenanceMode || current.fullKgMaintenanceMode),
        }));
      })
      .catch(showError);
  }, [showError]);

  function setDetailsCollapsed(collapsed: boolean) {
    setDetailsCollapsedState(collapsed);
    saveDetailsCollapsed(collapsed);
  }

  function setSidebarCollapsed(collapsed: boolean) {
    setSidebarCollapsedState(collapsed);
    saveSidebarCollapsed(collapsed);
  }

  const setDetailsWidth = useCallback((width: number) => {
    setDetailsWidthState(clampDetailsWidth(width));
  }, []);

  const finishDetailsResize = useCallback(() => {
    setDetailsResizing(false);
    setDetailsWidthState((width) => {
      saveDetailsWidth(width);
      return width;
    });
  }, []);

  const currentDashboard = dashboard as Dashboard | null;
  const busy = action !== null;

  const loadRunDetails = useCallback(async () => {
    const run = asObject(currentDashboard?.status?.run);
    const runId = String(run.id || "");
    if (!runId || loadingRunDetails) return;
    setLoadingRunDetails(true);
    try {
      setRunDetails(await fetchRunDetails(form, runId));
    } catch (error) {
      showError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      setLoadingRunDetails(false);
    }
  }, [currentDashboard, form, loadingRunDetails, showError]);

  const openLogsView = useCallback(() => {
    setDetailsCollapsedState(false);
    saveDetailsCollapsed(false);
    setDetailsTabRequest((current) => ({ nonce: (current?.nonce ?? 0) + 1, tab: "logs" }));
  }, []);

  const runAction = useCallback(
    async (nextAction: Action, payload?: Record<string, unknown>) => {
      if (nextAction === "forceStop" && !window.confirm("Kill all workers immediately?\n\nIn-flight worker output is discarded and their leases are recovered back to the queue. Committed work is not affected.")) return;
      setAction(nextAction);
      setErrorMessage("");
      if (operationActions.has(nextAction)) openLogsView();
      try {
        const body = { ...formBody(form, currentDashboard), ...payload };
        if (nextAction === "refresh") {
          await manualRefresh();
        } else if (nextAction === "sync") {
          await postJson("/api/project/sync", body);
          await manualRefresh();
        } else if (nextAction === "start") {
          await postJson("/api/process/start", body);
          await manualRefresh();
        } else if (nextAction === "startWork") {
          const run = asObject(currentDashboard?.status?.run);
          const runStatus = String(run.status || "");
          if (runStatus === "paused") await postJson("/api/pr/resume", body);
          else if (runStatus !== "active") await postJson("/api/run/init", body);
          await postJson("/api/process/start", body);
          await manualRefresh();
        } else if (nextAction === "stop") {
          await postJson("/api/process/drain", body);
          await manualRefresh();
        } else if (nextAction === "forceStop") {
          await postJson("/api/process/stop", { ...body, recoverLeases: true });
          await manualRefresh();
        } else if (nextAction === "init") {
          await postJson("/api/run/init", body);
          await manualRefresh();
        } else if (nextAction === "fresh") {
          await postJson("/api/run/fresh", body);
          setRunDetails(null);
          await manualRefresh();
        } else if (nextAction === "pausePr") {
          await postJson("/api/pr/pause", body);
          await manualRefresh();
        } else if (nextAction === "resumePr") {
          await postJson("/api/pr/resume", body);
          await manualRefresh();
        } else if (nextAction === "checkpoint") {
          await postJson("/api/run/checkpoint", body);
          await manualRefresh();
        } else if (nextAction === "qa") {
          await postJson("/api/pr/qa", body);
          await manualRefresh();
        } else if (nextAction === "reconcile") {
          await postJson("/api/pr/reconcile", body);
          await manualRefresh();
        } else if (nextAction === "splitPlan") {
          await postJson("/api/pr/split-plan", body);
          await manualRefresh();
        } else if (nextAction === "preparePr") {
          await postJson("/api/pr/prepare", body);
          await manualRefresh();
        } else if (nextAction === "syncPrs") {
          await postJson("/api/prs/sync", body);
          await manualRefresh();
        } else if (nextAction === "openPr") {
          await postJson("/api/prs/open", body);
          await manualRefresh();
        } else if (nextAction === "openAllPrs") {
          await postJson("/api/prs/open-all", body);
          await manualRefresh();
        }
      } catch (error) {
        showError(error instanceof Error ? error : new Error(String(error)));
      } finally {
        setAction(null);
      }
    },
    [currentDashboard, form, manualRefresh, openLogsView, showError],
  );

  // Fixed-length rail tracks (min() resolves to a length) so the
  // grid-template-columns transition can interpolate; minmax() tracks cannot.
  const railWidth = "min(425px, 30vw)";
  const detailsRailWidth = `min(${detailsWidth}px, 56vw)`;
  const gridColumns = {
    desktop: `${sidebarCollapsed ? "44px" : railWidth} minmax(0, 1fr) ${detailsCollapsed ? "44px" : detailsRailWidth}`,
    medium: `${sidebarCollapsed ? "44px" : "min(425px, 42vw)"} minmax(0, 1fr)`,
  };
  const shellStyle = {
    "--app-grid-columns": gridColumns.desktop,
    "--app-grid-columns-medium": gridColumns.medium,
    "--details-rail-width": detailsRailWidth,
  } as CSSProperties;

  return (
    <main
      className={`app-shell ${detailsResizing ? "app-shell-resizing" : ""} grid h-screen min-h-[620px] bg-ink text-fg max-[1180px]:h-auto max-[780px]:block max-[780px]:min-h-0`}
      style={shellStyle}
    >
      <Sidebar
        busy={busy}
        collapsed={sidebarCollapsed}
        config={config}
        dashboard={currentDashboard}
        form={form}
        onAction={(nextAction) => void runAction(nextAction)}
        onCollapsedChange={setSidebarCollapsed}
        onOpenPr={(branch) => void runAction("openPr", { prBranch: branch })}
        setForm={setForm}
      />
      <section className="min-w-0 overflow-auto bg-panel">
        <ErrorStrip error={errorMessage} onDismiss={() => setErrorMessage("")} />
        <ProgressPanel dashboard={currentDashboard} streamState={streamState} />
        <WorkTables
          dashboard={currentDashboard}
          improvedMode={improvedMode}
          improvedPage={improvedPage}
          setImprovedMode={setImprovedMode}
          setImprovedPage={setImprovedPage}
          setWorkMode={setWorkMode}
          workMode={workMode}
        />
      </section>
      <DetailsRail
        collapsed={detailsCollapsed}
        dashboard={currentDashboard}
        loadRunDetails={() => void loadRunDetails()}
        loadingRunDetails={loadingRunDetails}
        onCollapsedChange={setDetailsCollapsed}
        onResizeEnd={finishDetailsResize}
        onResizeStart={() => setDetailsResizing(true)}
        onWidthChange={setDetailsWidth}
        runDetails={runDetails}
        tabRequest={detailsTabRequest}
      />
    </main>
  );
}
