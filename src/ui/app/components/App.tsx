import { useCallback, useEffect, useState, type CSSProperties } from "react";
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
  checkpointBeforeFresh: true,
  pauseBeforeHandoff: true,
  qaTarget: "changes_all",
  qaReportMaxRows: 300,
  requirePrPromotion: true,
  prBaseRef: "origin/master",
  prGroupMode: "melee-subsystem",
  prMaxFilesPerPr: 30,
  prBranchPrefix: "pr-split",
  prTitlePrefix: "Melee decomp",
  prCommittedOnly: false,
  prIncludeUntracked: true,
  refreshPrLibrary: true,
  resetReportBaseline: true,
};

type Action = "refresh" | "init" | "fresh" | "report" | "start" | "stop" | "forceStop" | "pausePr" | "resumePr" | "checkpoint" | "qa" | "splitPlan" | "preparePr";

const actionLabels: Record<Action, string> = {
  refresh: "Refreshing dashboard...",
  init: "Initializing run and seeding targets...",
  fresh: "Checkpointing current run, resetting report start, initializing a new run, and refreshing PRs...",
  report: "Generating a fresh report against the run start...",
  start: "Starting babysit process...",
  stop: "Draining managed process...",
  forceStop: "Force stopping managed process and recovering leases...",
  pausePr: "Pausing intake for PR handoff...",
  resumePr: "Resuming intake for this run...",
  checkpoint: "Checkpointing run for PR handoff...",
  qa: "Running PR QA gate...",
  splitPlan: "Building PR split plan...",
  preparePr: "Pausing, checkpointing, running QA, and planning PRs...",
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

function loadSidebarCollapsed(): boolean {
  try {
    const stored = localStorage.getItem("sidebarCollapsed");
    return stored === "1";
  } catch {
    return false;
  }
}

function saveSidebarCollapsed(collapsed: boolean) {
  try {
    localStorage.setItem("sidebarCollapsed", collapsed ? "1" : "0");
  } catch {
    // The rail still works if storage is unavailable.
  }
}

export function App() {
  const [config, setConfig] = useState<UiConfig | null>(null);
  const [form, setFormState] = useState<FormState>(defaultForm);
  const [action, setAction] = useState<Action | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [sidebarCollapsed, setSidebarCollapsedState] = useState(loadSidebarCollapsed);
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

  function setSidebarCollapsed(collapsed: boolean) {
    setSidebarCollapsedState(collapsed);
    saveSidebarCollapsed(collapsed);
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
        } else if (nextAction === "splitPlan") {
          await postJson("/api/pr/split-plan", body);
          await manualRefresh();
        } else if (nextAction === "preparePr") {
          await postJson("/api/pr/prepare", body);
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

  const gridColumns = {
    desktop:
      sidebarCollapsed && detailsCollapsed
        ? "44px minmax(620px, 1fr) 44px"
        : sidebarCollapsed
          ? "44px minmax(620px, 1fr) minmax(440px, 560px)"
          : detailsCollapsed
            ? "minmax(440px, 560px) minmax(520px, 1fr) 44px"
            : "minmax(440px, 560px) minmax(0, 1fr) minmax(440px, 560px)",
    medium:
      sidebarCollapsed
        ? "44px 1fr"
        : "minmax(440px, 560px) 1fr",
  };
  const shellStyle = {
    "--app-grid-columns": gridColumns.desktop,
    "--app-grid-columns-medium": gridColumns.medium,
  } as CSSProperties;

  return (
    <main className="app-shell grid h-screen min-h-[620px] bg-[#171817] text-[#e2e5e2] max-[1180px]:h-auto max-[780px]:block max-[780px]:min-h-0" style={shellStyle}>
      <Sidebar
        busy={busy}
        collapsed={sidebarCollapsed}
        dashboard={currentDashboard}
        form={form}
        onAction={(nextAction) => void runAction(nextAction)}
        onCollapsedChange={setSidebarCollapsed}
        setForm={setForm}
        streamState={streamState}
      />
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
