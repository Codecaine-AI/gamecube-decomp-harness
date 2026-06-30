import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { dashboardParams, fetchJson, fetchRunDetails, formBody, loadConfig, postJson } from "@/lib/api";
import { asObject, numberValue, type Dashboard, type FormState, type JsonObject, type RunDetails, type UiConfig } from "@/lib/format";
import { useDashboardStream } from "@/hooks/useDashboardStream";
import { DetailsRail, type DetailsTab } from "@/components/details-rail";
import { ProjectWorkspace, type DashboardAction } from "@/pages/workspace";
import { type ImprovedMode, type WorkMode } from "@/pages/workspace/sessions/active/subphases/run/components/work-tables";
import { type AppRoute, routeFromUrl, saveRoute } from "@/routing";
import { loadGrainSettings, normalizeGrainSettings, saveGrainSettings, type GrainSettings, type GrainSettingsPatch } from "@/lib/styleSettings";
import { normalizeToolConcurrency } from "@/lib/workerConfig";
import { DashboardPage } from "@/pages/dashboard";
import { GrainOverlay } from "@/components/app/_components/GrainOverlay";
import { clampDetailsWidth, loadDetailsCollapsed, loadDetailsWidth, loadSidebarCollapsed, saveDetailsCollapsed, saveDetailsWidth, saveSidebarCollapsed } from "@/components/app/_lib/railState";
import { initialForm, saveRunSettings, schedulingForWorkers } from "@/components/app/_lib/runSettings";
import { useHotReload } from "@/components/app/_lib/useHotReload";

type Action = DashboardAction;

// Multi-step server operations tracked by process.operation. Triggering one
// auto-opens the details rail on the Logs tab so the activity card and live
// output are in view the moment the work starts.
const operationActions: ReadonlySet<Action> = new Set(["sync", "syncGit", "indexPrs", "calculateBaseline", "completeRun", "checkpoint", "qa", "qaRepair", "reconcile", "splitPlan", "preparePr", "prepareLocalPr", "prepareLocalBatch", "openPr", "openDraftBatch", "openAllPrs"]);

function newSessionBody(body: JsonObject): JsonObject {
  const next = { ...body };
  delete next.runId;
  delete next.activeRunId;
  return next;
}

function sessionRouteSub(session: JsonObject): "prepare" | "run" | "pr" | "done" {
  const phase = String(session.phase || "");
  if (phase === "preparing") return "prepare";
  if (phase === "running") return "run";
  if (phase === "pr") return "pr";
  return "done";
}

function sessionPhaseSummary(session: JsonObject): string {
  const phase = String(session.phase || "active");
  const subphase = String(session.activeSubphase || "");
  return [phase, subphase].filter(Boolean).join(" / ");
}

function sessionScopedBody(body: JsonObject, projectSession: JsonObject): JsonObject {
  const sessionUuid = String(projectSession.sessionUuid || projectSession.id || "");
  return sessionUuid ? { ...body, sessionUuid, sessionId: sessionUuid } : body;
}

function positiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
}

function stringConfigValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const stringValue = String(value);
  return stringValue ? stringValue : null;
}

function projectSessionRunConfigPatch(projectSession: JsonObject): Partial<FormState> | null {
  const phases = asObject(projectSession.phases);
  const preparing = asObject(phases.preparing);
  const completion = asObject(preparing.completion);
  const workerConfig = asObject(completion.workerConfig);
  if (Object.keys(workerConfig).length === 0) return null;

  const patch: Partial<FormState> = {};
  const maxWorkers = positiveInteger(workerConfig.maxWorkers) ?? positiveInteger(workerConfig.workerCount);
  if (maxWorkers !== null) Object.assign(patch, schedulingForWorkers(maxWorkers));

  const epochSize = stringConfigValue(workerConfig.epochSize);
  if (epochSize !== null) patch.epochSize = epochSize;

  const agentTimeoutSeconds = positiveInteger(workerConfig.agentTimeoutSeconds);
  if (agentTimeoutSeconds !== null) patch.agentTimeoutSeconds = agentTimeoutSeconds;

  if (Object.keys(asObject(workerConfig.toolConcurrency)).length > 0) {
    patch.toolConcurrency = normalizeToolConcurrency(workerConfig.toolConcurrency);
  }

  return patch;
}

function styleSofteningVars(settings: GrainSettings): CSSProperties {
  const { background, borders, font, icons } = settings.softening;
  const bevelStrength = settings.cssBevel.enabled ? settings.cssBevel.strength : 0;
  return {
    "--style-soften-background-mix": `${background * 6}%`,
    "--style-soften-border-mix": `${borders * 12}%`,
    "--style-soften-font-glow": `${font * 0.22}px`,
    "--style-soften-font-mix": `${font * 7}%`,
    "--style-bevel-depth": `${settings.cssBevel.depth * bevelStrength}px`,
    "--style-bevel-highlight-alpha": String(settings.cssBevel.highlight * bevelStrength * 0.26),
    "--style-bevel-shadow-alpha": String(settings.cssBevel.shadow * bevelStrength * 0.34),
    "--style-bevel-text-highlight-alpha": String(settings.cssBevel.text * bevelStrength * 0.12),
    "--style-bevel-text-shadow-alpha": String(settings.cssBevel.text * bevelStrength * 0.18),
    "--style-soften-icon-blur": `${icons * 0.08}px`,
    "--style-soften-icon-glow": `${icons * 0.28}px`,
    "--style-soften-icon-opacity": String(1 - icons * 0.04),
  } as CSSProperties;
}

function styleEffectClass(settings: GrainSettings): string {
  return settings.cssBevel.enabled && settings.cssBevel.strength > 0 ? "style-bevel-enabled" : "";
}

function projectSessionUrl(path: string, form: FormState): string {
  const params = dashboardParams(form).toString();
  return params ? `${path}?${params}` : path;
}

class ActiveProjectSessionError extends Error {
  readonly projectSession: JsonObject;

  constructor(projectSession: JsonObject) {
    const sessionUuid = String(projectSession.sessionUuid || projectSession.id || "active");
    super(
      `New session blocked: active project session ${sessionUuid} is ${sessionPhaseSummary(projectSession)}. Open or complete the active session before starting another one.`,
    );
    this.name = "ActiveProjectSessionError";
    this.projectSession = projectSession;
  }
}

async function createProjectSession(body: JsonObject, form: FormState): Promise<JsonObject> {
  try {
    return asObject(await postJson<JsonObject>(projectSessionUrl("/api/project-session/new", form), body));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/active project session already exists/i.test(message)) throw error;
    const activeState = asObject(await fetchJson<JsonObject>(`/api/project-session?${dashboardParams(form)}`));
    throw new ActiveProjectSessionError(asObject(activeState.projectSession));
  }
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
  const [detailsTabRequest, setDetailsTabRequest] = useState<{ nonce: number; tab: DetailsTab } | null>(null);
  const [route, setRouteState] = useState<AppRoute>(routeFromUrl);
  const [grainSettings, setGrainSettingsState] = useState<GrainSettings>(loadGrainSettings);

  const setForm = useCallback((updates: Partial<FormState>) => {
    setFormState((current) => ({ ...current, ...updates }));
  }, []);

  const setGrainSettings = useCallback((updates: GrainSettingsPatch) => {
    setGrainSettingsState((current) =>
      normalizeGrainSettings({
        ...current,
        ...updates,
        softening: { ...current.softening, ...(updates.softening ?? {}) },
        svgNormal: { ...current.svgNormal, ...(updates.svgNormal ?? {}) },
        cssBevel: { ...current.cssBevel, ...(updates.cssBevel ?? {}) },
      }),
    );
  }, []);

  const showError = useCallback((error: Error) => {
    console.error(error);
    setErrorMessage(error.message);
  }, []);

  const { dashboard, manualRefresh } = useDashboardStream({
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
    saveGrainSettings(grainSettings);
  }, [grainSettings]);

  useEffect(() => {
    void loadConfig()
      .then((loaded) => {
        const projectDefaults = asObject(loaded.projectDefaults);
        const dashboardDefaults = asObject(projectDefaults.dashboard);
        const toolConcurrencyDefaults = asObject(projectDefaults.toolConcurrency);
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
          agentTimeoutSeconds: numberValue(dashboardDefaults.agentTimeoutSeconds, current.agentTimeoutSeconds),
          toolConcurrency: normalizeToolConcurrency(toolConcurrencyDefaults.configured, current.toolConcurrency),
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

  // Keep the URL in sync with the route and pick up browser back/forward. The
  // project dashboard auto-opens the default project the first time the
  // operator arrives with no route, mirroring the pre-redesign default.
  const navigate = useCallback((next: AppRoute) => {
    setRouteState(next);
    saveRoute(next);
  }, []);

  useEffect(() => {
    const onPop = () => setRouteState(routeFromUrl());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

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

  useEffect(() => {
    const projectSession = asObject(currentDashboard?.projectSession);
    const patch = projectSessionRunConfigPatch(projectSession);
    if (!patch) return;
    setFormState((current) => {
      let changed = false;
      const next = { ...current };
      for (const [key, value] of Object.entries(patch)) {
        const typedKey = key as keyof FormState;
        if (next[typedKey] === value) continue;
        (next as Record<string, unknown>)[key] = value;
        changed = true;
      }
      return changed ? next : current;
    });
  }, [currentDashboard?.projectSession]);

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
      if (nextAction === "forceStop" && !window.confirm("Kill all workers immediately?\n\nIn-flight worker output is discarded and active claims are recovered. Committed work is not affected.")) return;
      if (
        nextAction === "completeRun" &&
        !window.confirm("Close this legacy session?\n\nThis records a save point and marks the run complete. Use this when PR work is already shipped, closed, or intentionally carried forward. Stale ship/QA blockers will be overridden.")
      ) {
        return;
      }
      setAction(nextAction);
      setErrorMessage("");
      if (operationActions.has(nextAction)) openLogsView();
      try {
        const body = { ...formBody(form, currentDashboard), ...payload };
        const projectSession = asObject(currentDashboard?.projectSession);
        const projectSessionPhase = String(projectSession.phase || "");
        if (nextAction === "refresh") {
          await manualRefresh();
        } else if (nextAction === "sync") {
          await postJson("/api/project/sync", body);
          await manualRefresh();
        } else if (nextAction === "syncGit") {
          await postJson(projectSessionUrl("/api/project-session/preparing/sync-git", form), sessionScopedBody(body, projectSession));
          await manualRefresh();
        } else if (nextAction === "indexPrs") {
          await postJson(projectSessionUrl("/api/project-session/preparing/pr-index", form), sessionScopedBody(body, projectSession));
          await manualRefresh();
        } else if (nextAction === "calculateBaseline") {
          await postJson(projectSessionUrl("/api/project-session/preparing/baseline", form), sessionScopedBody(body, projectSession));
          await manualRefresh();
        } else if (nextAction === "start") {
          await postJson("/api/process/start", body);
          await manualRefresh();
        } else if (nextAction === "startWork") {
          const sessionBody = sessionScopedBody(body, projectSession);
          const run = asObject(currentDashboard?.status?.run);
          const runStatus = String(run.status || "");
          if (runStatus === "paused") await postJson("/api/pr/resume", body);
          else if (runStatus !== "active") {
            const initialized = asObject(await postJson<JsonObject>("/api/run/init", sessionBody));
            const activeRunId = String(initialized.activeRunId || initialized.runId || asObject(initialized.parsed).runId || "");
            if (projectSessionPhase === "preparing") {
              await postJson(projectSessionUrl("/api/project-session/preparing/complete", form), {
                ...sessionBody,
                activeRunId,
                completion: {
                  initRun: initialized,
                  workerConfig: {
                    maxWorkers: body.maxWorkers,
                    epochSize: body.epochSize,
                    agentTimeoutSeconds: body.agentTimeoutSeconds,
                    toolConcurrency: body.toolConcurrency,
                  },
                },
              });
              await postJson(projectSessionUrl("/api/project-session/start-running", form), {
                ...sessionBody,
                activeRunId,
              });
            }
            if (activeRunId) body.runId = activeRunId;
          }
          await postJson("/api/process/start", body);
          if (projectSessionPhase === "preparing") {
            const sessionUuid = String(projectSession.sessionUuid || projectSession.id || "");
            navigate({ kind: "workspace", section: "sessions", session: sessionUuid || "active", sessionSub: "run", projectId: form.projectId || String(projectSession.projectId || "") || undefined });
          }
          await manualRefresh();
        } else if (nextAction === "stop") {
          await postJson("/api/process/drain", body);
          if (projectSessionPhase === "running") await postJson(projectSessionUrl("/api/project-session/running/stop", form), { ...body, stopReason: "manual_stop", manualStopMode: "finish_epoch" });
          await manualRefresh();
        } else if (nextAction === "forceStop") {
          await postJson("/api/process/stop", { ...body, recoverClaims: true });
          if (projectSessionPhase === "running") await postJson(projectSessionUrl("/api/project-session/running/stop", form), { ...body, stopReason: "manual_stop", manualStopMode: "hard_stop" });
          await manualRefresh();
        } else if (nextAction === "init") {
          await postJson("/api/run/init", body);
          await manualRefresh();
        } else if (nextAction === "fresh") {
          const sessionBody = newSessionBody(body);
          let created: JsonObject;
          try {
            created = await createProjectSession(sessionBody, form);
          } catch (error) {
            if (error instanceof ActiveProjectSessionError) {
              const activeSession = error.projectSession;
              const sessionUuid = String(activeSession.sessionUuid || activeSession.id || "");
              navigate({
                kind: "workspace",
                section: "sessions",
                session: sessionUuid || "active",
                sessionSub: sessionRouteSub(activeSession),
                projectId: form.projectId || String(activeSession.projectId || "") || undefined,
              });
              await manualRefresh();
              return;
            }
            throw error;
          }
          const createdSession = asObject(created.projectSession);
          const sessionUuid = String(createdSession.sessionUuid || createdSession.id || "");
          navigate({ kind: "workspace", section: "sessions", session: sessionUuid || "active", sessionSub: "prepare", projectId: form.projectId || String(createdSession.projectId || "") || undefined });
          await manualRefresh();
          setRunDetails(null);
        } else if (nextAction === "completeRun") {
          await postJson("/api/run/complete", { ...body, force: true });
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
        } else if (nextAction === "qaRepair") {
          await postJson("/api/pr/qa-repair", body);
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
        } else if (nextAction === "prepareLocalPr") {
          await postJson("/api/prs/prepare-local", body);
          await manualRefresh();
        } else if (nextAction === "prepareLocalBatch") {
          await postJson("/api/prs/prepare-local-batch", { ...body, batchLimit: 3 });
          await manualRefresh();
        } else if (nextAction === "openPr") {
          await postJson("/api/prs/open", body);
          await manualRefresh();
        } else if (nextAction === "openDraftBatch") {
          await postJson("/api/prs/open-batch", { ...body, batchLimit: 3 });
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
    [currentDashboard, form, manualRefresh, navigate, openLogsView, showError],
  );

  // Lightweight, non-operation review-substate update for the In Review
  // column (ack new comments / mark fixing). It POSTs the field, refreshes
  // the dashboard, and surfaces failures through the same error strip.
  const setReviewState = useCallback(
    async (branch: string, subState: string) => {
      try {
        await postJson("/api/prs/review-state", { ...formBody(form, currentDashboard), prBranch: branch, subState });
        await manualRefresh();
      } catch (error) {
        showError(error instanceof Error ? error : new Error(String(error)));
      }
    },
    [currentDashboard, form, manualRefresh, showError],
  );

  // The dashboard route is full-bleed project selection (no workspace nav, no
  // details rail). The workspace route restores the 3-column shell.
  if (route.kind === "dashboard") {
    return (
      <main
        className={`app-shell ${styleEffectClass(grainSettings)} grid h-screen min-h-[620px] bg-ink text-fg max-[780px]:block max-[780px]:min-h-0`}
        style={{ ...styleSofteningVars(grainSettings), ["--app-grid-columns"]: "minmax(0,1fr)", ["--app-grid-columns-medium"]: "minmax(0,1fr)" } as CSSProperties}
      >
        <DashboardPage
          busy={busy}
          config={config}
          dashboard={currentDashboard}
          errorMessage={errorMessage}
          form={form}
          onAction={(nextAction) => void runAction(nextAction)}
          onDismissError={() => setErrorMessage("")}
          onNavigate={navigate}
        />
        <GrainOverlay settings={grainSettings} />
      </main>
    );
  }

  // Fixed-length rail tracks (min() resolves to a length) so the
  // grid-template-columns transition can interpolate; minmax() tracks cannot.
  const railWidth = "min(300px, 26vw)";
  const detailsRailWidth = `min(${detailsWidth}px, 56vw)`;
  const gridColumns = {
    desktop: `${sidebarCollapsed ? "52px" : railWidth} minmax(0, 1fr) ${detailsCollapsed ? "52px" : detailsRailWidth}`,
    medium: `${sidebarCollapsed ? "52px" : "min(300px, 38vw)"} minmax(0, 1fr)`,
  };
  const shellStyle = {
    ...styleSofteningVars(grainSettings),
    "--app-grid-columns": gridColumns.desktop,
    "--app-grid-columns-medium": gridColumns.medium,
    "--details-rail-width": detailsRailWidth,
  } as CSSProperties;

  return (
    <main
      className={`app-shell ${styleEffectClass(grainSettings)} ${detailsResizing ? "app-shell-resizing" : ""} grid h-screen min-h-[620px] bg-ink text-fg max-[1180px]:h-auto max-[780px]:block max-[780px]:min-h-0`}
      style={shellStyle}
    >
      <ProjectWorkspace
        busy={busy}
        collapsed={sidebarCollapsed}
        config={config}
        dashboard={currentDashboard}
        errorMessage={errorMessage}
        form={form}
        grainSettings={grainSettings}
        onGrainSettingsChange={setGrainSettings}
        onAction={(nextAction) => void runAction(nextAction)}
        onCollapsedChange={setSidebarCollapsed}
        onDismissError={() => setErrorMessage("")}
        onNavigate={navigate}
        onOpenPr={(branch) => void runAction("openPr", { prBranch: branch })}
        onPrepareLocalPr={(branch) => void runAction("prepareLocalPr", { prBranch: branch })}
        onSetReviewState={(branch, subState) => void setReviewState(branch, subState)}
        route={route}
        setForm={setForm}
        setImprovedMode={setImprovedMode}
        setImprovedPage={setImprovedPage}
        setWorkMode={setWorkMode}
        improvedMode={improvedMode}
        improvedPage={improvedPage}
        workMode={workMode}
      />
      <DetailsRail
        busy={busy}
        collapsed={detailsCollapsed}
        dashboard={currentDashboard}
        loadRunDetails={() => void loadRunDetails()}
        loadingRunDetails={loadingRunDetails}
        onAction={(nextAction) => void runAction(nextAction)}
        onCollapsedChange={setDetailsCollapsed}
        onResizeEnd={finishDetailsResize}
        onResizeStart={() => setDetailsResizing(true)}
        onWidthChange={setDetailsWidth}
        runDetails={runDetails}
        tabRequest={detailsTabRequest}
      />
      <GrainOverlay settings={grainSettings} />
    </main>
  );
}
