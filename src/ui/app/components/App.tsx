import { useCallback, useEffect, useState } from "react";
import { fetchRunDetails, formBody, loadConfig, postJson } from "../lib/api";
import { asObject } from "../lib/format";
import { useDashboardStream } from "../hooks/useDashboardStream";
import type { Dashboard, FormState, RunDetails, UiConfig } from "../types";
import { DetailsRail } from "./DetailsRail";
import { ProgressPanel } from "./ProgressPanel";
import { Sidebar } from "./Sidebar";
import { type ImprovedMode, type WorkMode, WorkTables } from "./WorkTables";

const defaultForm: FormState = {
  repoRoot: "",
  stateDir: "",
  processName: "melee-live",
  maxWorkers: 16,
  idleSleepMs: 5000,
  candidateLimit: 64,
  queueTargetSize: 64,
  queueLowWatermark: 16,
  candidateWindow: 512,
  goalValue: 100,
  provider: "codex-lb",
  model: "gpt-5.5",
  thinkingLevel: "medium",
  workerThinkingLevel: "medium",
  dryRunAgents: false,
  refreshPrLibrary: true,
  resetReportBaseline: true,
};

type Action = "refresh" | "init" | "fresh" | "report" | "start" | "stop" | "forceStop";

const actionLabels: Record<Action, string> = {
  refresh: "Refreshing dashboard...",
  init: "Initializing run and seeding targets...",
  fresh: "Resetting report start, initializing a new run, and refreshing PRs...",
  report: "Generating a fresh report against the run start...",
  start: "Starting babysit process...",
  stop: "Draining managed process...",
  forceStop: "Force stopping managed process and recovering leases...",
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

export function App() {
  const [config, setConfig] = useState<UiConfig | null>(null);
  const [form, setFormState] = useState<FormState>(defaultForm);
  const [action, setAction] = useState<Action | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [detailsCollapsed, setDetailsCollapsedState] = useState(loadDetailsCollapsed);
  const [improvedMode, setImprovedMode] = useState<ImprovedMode>("matches");
  const [improvedPage, setImprovedPage] = useState(0);
  const [workMode, setWorkMode] = useState<WorkMode>("active");
  const [runDetails, setRunDetails] = useState<RunDetails | null>(null);
  const [loadingRunDetails, setLoadingRunDetails] = useState(false);

  const setForm = useCallback((updates: Partial<FormState>) => {
    setFormState((current) => ({ ...current, ...updates }));
  }, []);

  const showError = useCallback((error: Error) => {
    console.error(error);
    setStatusMessage(error.message);
  }, []);

  const { dashboard, manualRefresh, streamState } = useDashboardStream({
    enabled: Boolean(config && form.repoRoot && form.stateDir),
    form,
    intervalMs: config?.dashboardStreamIntervalMs || 2500,
    onError: showError,
  });

  useHotReload(config);

  useEffect(() => {
    void loadConfig()
      .then((loaded) => {
        setConfig(loaded);
        setFormState((current) => ({
          ...current,
          repoRoot: loaded.defaultRepoRoot,
          stateDir: loaded.defaultStateDir,
        }));
      })
      .catch(showError);
  }, [showError]);

  function setDetailsCollapsed(collapsed: boolean) {
    setDetailsCollapsedState(collapsed);
    saveDetailsCollapsed(collapsed);
  }

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

  const runAction = useCallback(
    async (nextAction: Action) => {
      setAction(nextAction);
      setStatusMessage(actionLabels[nextAction]);
      try {
        const body = formBody(form, currentDashboard);
        if (nextAction === "refresh") {
          await manualRefresh();
        } else if (nextAction === "start") {
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
        } else if (nextAction === "report") {
          await postJson("/api/report/run", body);
          await manualRefresh();
        }
        setStatusMessage("");
      } catch (error) {
        showError(error instanceof Error ? error : new Error(String(error)));
      } finally {
        setAction(null);
      }
    },
    [currentDashboard, form, manualRefresh, showError],
  );

  const gridColumns = detailsCollapsed
    ? "grid-cols-[minmax(300px,360px)_minmax(660px,1fr)_44px]"
    : "grid-cols-[minmax(300px,360px)_minmax(660px,1fr)_minmax(300px,380px)]";

  return (
    <main className={`grid h-screen min-h-[620px] ${gridColumns} bg-[#171817] text-[#e2e5e2] max-[1180px]:grid-cols-[320px_1fr] max-[1180px]:h-auto max-[780px]:block max-[780px]:min-h-0`}>
      <Sidebar busy={busy} dashboard={currentDashboard} form={form} onAction={(nextAction) => void runAction(nextAction)} setForm={setForm} streamState={streamState} />
      <section className="min-w-0 overflow-auto bg-[#191b1a]">
        <ProgressPanel dashboard={currentDashboard} statusMessage={action ? actionLabels[action] : statusMessage} />
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
        runDetails={runDetails}
      />
    </main>
  );
}
