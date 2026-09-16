import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { dashboardParams, fetchJson, fetchRunDetails, formBody, loadConfig, postJson } from "@/lib/api";
import { asObject, numberValue, type Dashboard, type FormState, type JsonObject, type RunDetails, type UiConfig } from "@/lib/format";
import { useDashboardStream } from "@/hooks/useDashboardStream";
import { DetailsRail, type DetailsTab } from "@/components/details-rail";
import { GameWorkspace, type DashboardAction } from "@/pages/workspace";
import { deriveHarnessView, harnessStateAction, harnessStateReadModel } from "@/pages/workspace/_lib/model";
import { type ImprovedMode, type WorkMode } from "@/pages/workspace/harness/subphases/run/components/work-tables";
import { type AppRoute, routeFromUrl, saveRoute } from "@/routing";
import { loadGrainSettings, normalizeGrainSettings, saveGrainSettings, type GrainSettings, type GrainSettingsPatch } from "@/lib/styleSettings";
import { DashboardPage } from "@/pages/dashboard";
import { GrainOverlay } from "@/components/app/_components/GrainOverlay";
import { ConfirmActionOverlay, type ConfirmTone } from "@/components/app/_components/ConfirmActionOverlay";
import { clampDetailsWidth, loadDetailsCollapsed, loadDetailsWidth, loadSidebarCollapsed, saveDetailsCollapsed, saveDetailsWidth, saveSidebarCollapsed } from "@/components/app/_lib/railState";
import { initialForm, runConfigurationFormPatch, saveRunSettings, schedulingForWorkers } from "@/components/app/_lib/runSettings";
import { useHotReload } from "@/components/app/_lib/useHotReload";
import { RUN_CONTROL_ACTION_IDS, RUN_CONTROL_ENDPOINTS } from "@/components/app/_lib/projectedRunControls";
import {
  SYNC_CONTROL_ACTION_IDS,
  SYNC_CONTROL_ENDPOINTS,
  syncControlRequestPatch,
  syncConfirmationMessage,
} from "@/components/app/_lib/projectedSyncControls";
import { KNOWLEDGE_CONTROL_ACTION_IDS, KNOWLEDGE_CONTROL_ENDPOINTS } from "@/components/app/_lib/projectedKnowledgeControls";

type Action = DashboardAction;
const PROCESS_CONFIG_VERSION = 3;
const DEFAULT_THINKING_LEVEL = "medium";

// Multi-step server operations tracked by process.operation. Triggering one
// auto-opens the details rail on the Logs tab so the activity card and live
// output are in view the moment the work starts.
const operationActions: ReadonlySet<Action> = new Set(["syncStart", "syncResolveConflict", "syncPublish", "syncCancel", "syncRecover", "syncRecoverDiscard", "syncRevalidate", "knowledgeProcess", "syncGit", "indexPrs", "checkpoint", "qa", "qaRepair", "reconcile", "splitPlan", "preparePr", "prepareLocalPr", "prepareLocalBatch", "openPr", "openDraftBatch", "openAllPrs"]);

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
  const appliedSessionConfigSignatureRef = useRef("");
  // In-UI confirmation for operator actions. window.confirm is banned here:
  // native dialogs wedge the tab under automation and cannot carry API
  // parameters. requestConfirm resolves true only when the operator clicks
  // the confirm button; Escape, backdrop click, or Cancel resolve false.
  const [confirmRequest, setConfirmRequest] = useState<{
    confirmLabel: string;
    message: string;
    resolve: (confirmed: boolean) => void;
    tone: ConfirmTone;
  } | null>(null);

  const requestConfirm = useCallback(
    (message: string, options?: { confirmLabel?: string; tone?: ConfirmTone }) =>
      new Promise<boolean>((resolve) => {
        setConfirmRequest((current) => {
          current?.resolve(false);
          return { confirmLabel: options?.confirmLabel ?? "Confirm", message, resolve, tone: options?.tone ?? "danger" };
        });
      }),
    [],
  );

  const resolveConfirm = useCallback((confirmed: boolean) => {
    setConfirmRequest((current) => {
      current?.resolve(confirmed);
      return null;
    });
  }, []);

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
    enabled: Boolean(config && (form.gameId || (form.repoRoot && form.stateDir))),
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

  const routeGameId = route.kind === "workspace" ? route.gameId : undefined;
  useEffect(() => {
    let currentRequest = true;
    setConfig(null);
    setRunDetails(null);
    setErrorMessage("");
    void loadConfig(routeGameId)
      .then((loaded) => {
        if (!currentRequest) return;
        const gameDefaults = asObject(loaded.gameDefaults);
        const dashboardDefaults = asObject(gameDefaults.dashboard);
        const sandboxDefaults = asObject(gameDefaults.sandbox);
        setConfig(loaded);
        setFormState((current) => ({
          ...current,
          ...schedulingForWorkers(current.maxWorkers),
          gameId: loaded.defaultGameId,
          usePathOverrides: false,
          repoRoot: loaded.defaultRepoRoot,
          stateDir: loaded.defaultStateDir,
          graphDbPath: loaded.defaultGraphDbPath,
          processName: String(gameDefaults.processName || current.processName),
          goalValue: Number(dashboardDefaults.goalValue || current.goalValue),
          agentTimeoutSeconds: numberValue(dashboardDefaults.agentTimeoutSeconds, current.agentTimeoutSeconds),
          sandboxProfile: String(sandboxDefaults.default_profile || current.sandboxProfile),
        }));
      })
      .catch((error) => { if (currentRequest) showError(error); });
    return () => { currentRequest = false; };
  }, [routeGameId, showError]);

  function setDetailsCollapsed(collapsed: boolean) {
    setDetailsCollapsedState(collapsed);
    saveDetailsCollapsed(collapsed);
  }

  function setSidebarCollapsed(collapsed: boolean) {
    setSidebarCollapsedState(collapsed);
    saveSidebarCollapsed(collapsed);
  }

  // Keep the URL in sync with the route and pick up browser back/forward. The
  // game dashboard auto-opens the default game the first time the
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

  const currentDashboard = config && dashboard?.game?.id === form.gameId
    && (!routeGameId || routeGameId === form.gameId) ? dashboard as Dashboard : null;
  const busy = action !== null;
  const view = deriveHarnessView(currentDashboard, config, form);
  const currentRun = currentDashboard?.status.run;
  const runConfigPatch = runConfigurationFormPatch(currentRun);
  const runConfigSignature = runConfigPatch
    ? `${String(currentRun?.id || "")}:${JSON.stringify(currentRun?.inputs?.configuration_snapshot)}`
    : null;

  useEffect(() => {
    if (!runConfigPatch || !runConfigSignature) return;
    if (appliedSessionConfigSignatureRef.current === runConfigSignature) return;
    setFormState((current) => ({ ...current, ...runConfigPatch }));
    appliedSessionConfigSignatureRef.current = runConfigSignature;
  }, [runConfigPatch, runConfigSignature]);

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
    async (requestedAction: Action, payload?: Record<string, unknown>) => {
      const harnessState = harnessStateReadModel(currentDashboard);
      const nextAction = requestedAction;
      const projectedRunActionId = RUN_CONTROL_ACTION_IDS[nextAction];
      const projectedRunAction = projectedRunActionId
        ? harnessStateAction(harnessState, projectedRunActionId)
        : null;
      const knowledgeActionId = KNOWLEDGE_CONTROL_ACTION_IDS[nextAction];
      const knowledgeAction = knowledgeActionId ? harnessStateAction(harnessState, knowledgeActionId) : null;
      const syncControlAction = nextAction === "syncGit" || nextAction === "indexPrs"
        ? "syncStart"
        : nextAction;
      const projectedSyncActionId = SYNC_CONTROL_ACTION_IDS[syncControlAction];
      const projectedSyncAction = projectedSyncActionId
        ? harnessStateAction(harnessState, projectedSyncActionId)
        : null;
      if (
        projectedRunAction?.confirmation_required &&
        !(await requestConfirm(`${projectedRunActionId}?\n\n${projectedRunAction.expected_transition}`))
      ) return;
      if (projectedSyncAction?.confirmation_required) {
        const confirmation = syncConfirmationMessage(syncControlAction, harnessState?.sync ?? null) ??
          `${projectedSyncActionId}?\n\n${projectedSyncAction.expected_transition}`;
        const confirmed = await requestConfirm(confirmation, syncControlAction === "syncRecover"
          ? { confirmLabel: "Resume sync", tone: "primary" }
          : syncControlAction === "syncRecoverDiscard"
            ? { confirmLabel: "Discard staged work", tone: "danger" }
            : syncControlAction === "syncPublish"
              ? { confirmLabel: "Publish", tone: "primary" }
              : undefined);
        if (!confirmed) return;
      }
      if (knowledgeAction?.confirmation_required && !(await requestConfirm(`${knowledgeActionId}?\n\n${knowledgeAction.expected_transition}`))) return;
      if (nextAction === "openPr") {
        const seriesName = String(payload?.prBranch || "this series");
        if (!(await requestConfirm(`Publish a draft PR upstream for series "${seriesName}"?\n\nThis will create the draft PR on GitHub.`, { confirmLabel: "Open draft PR", tone: "primary" }))) return;
      }
      setAction(nextAction);
      setErrorMessage("");
      if (operationActions.has(nextAction)) openLogsView();
      try {
        const body = { ...formBody(form, currentDashboard), ...payload };
        if (projectedRunAction?.subject_id) body.runId = projectedRunAction.subject_id;
        if (projectedRunAction?.confirmation_required) body.confirmed = true;
        if (
          projectedSyncAction?.subject_id &&
          harnessState?.sync?.workflow_id === projectedSyncAction.subject_id
        ) body.syncId = projectedSyncAction.subject_id;
        if (projectedSyncAction?.confirmation_required) body.confirmed = true;
        Object.assign(body, syncControlRequestPatch(syncControlAction));
        if (nextAction === "refresh") {
          await manualRefresh();
        } else if (["start", "runStart", "runResume", "startWork", "harnessPause"].includes(nextAction)) {
          const canonicalState = harnessState?.state;
          if (!canonicalState) throw new Error("Run Initial Sync before requesting work.");
          await postJson(nextAction === "harnessPause" ? "/api/harness/pause" : "/api/harness/run", {
            ...body, gameId: canonicalState.identity.game_id, expectedRevision: canonicalState.identity.revision, commandId: crypto.randomUUID(),
          });
          await manualRefresh();
        } else if (knowledgeActionId) {
          const endpoint = KNOWLEDGE_CONTROL_ENDPOINTS[nextAction];
          if (!endpoint) throw new Error(`No endpoint is configured for ${nextAction}`);
          await postJson(endpoint, body);
          await manualRefresh();
        } else if (projectedSyncActionId) {
          const endpoint = SYNC_CONTROL_ENDPOINTS[syncControlAction];
          if (!endpoint) throw new Error(`No endpoint is configured for ${nextAction}`);
          await postJson(endpoint, body);
          await manualRefresh();
        } else if (nextAction === "runHardStop") {
          await postJson(RUN_CONTROL_ENDPOINTS.runHardStop, body);
          await manualRefresh();
        } else if (nextAction === "runCancel") {
          await postJson("/api/run/cancel", body);
          setRunDetails(null);
          await manualRefresh();
        } else if (nextAction === "runRecover") {
          await postJson("/api/run/recover", body);
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
    [currentDashboard, form, manualRefresh, navigate, openLogsView, requestConfirm, showError],
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

  if (route.kind === "workspace" && (!config || form.gameId !== routeGameId || !currentDashboard)) {
    return <main className="p-4"><p role="status">{errorMessage || "Loading selected game…"}</p></main>;
  }

  // The dashboard route is full-bleed game selection (no workspace nav, no
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
        {confirmRequest ? (
          <ConfirmActionOverlay onCancel={() => resolveConfirm(false)} onConfirm={() => resolveConfirm(true)} request={confirmRequest} />
        ) : null}
        <GrainOverlay settings={grainSettings} />
      </main>
    );
  }

  // Fixed-length rail tracks (min() resolves to a length) so the
  // grid-template-columns transition can interpolate; minmax() tracks cannot.
  const railWidth = "min(300px, 26vw)";
  const sidebarTrack = sidebarCollapsed ? "52px" : railWidth;
  // Keep the workspace usable while the details rail is open. The details
  // track yields before the center track drops below 480px on desktop; the
  // <=1180px layout already moves details out of the grid entirely.
  const detailsRailWidth = `min(${detailsWidth}px, 56vw, calc(100vw - ${sidebarTrack} - 480px))`;
  const gridColumns = {
    desktop: `${sidebarTrack} minmax(0, 1fr) ${detailsCollapsed ? "52px" : detailsRailWidth}`,
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
      <GameWorkspace
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
          loadRunDetails={() => void loadRunDetails()}
          loadingRunDetails={loadingRunDetails}
          runDetails={runDetails}
          view={view}
          workMode={workMode}
      />
      <DetailsRail
        busy={busy}
        collapsed={detailsCollapsed}
        dashboard={currentDashboard}
        form={form}
        loadRunDetails={() => void loadRunDetails()}
        loadingRunDetails={loadingRunDetails}
        onAction={(nextAction) => void runAction(nextAction)}
        onCollapsedChange={setDetailsCollapsed}
        onNavigate={navigate}
        onResizeEnd={finishDetailsResize}
        onResizeStart={() => setDetailsResizing(true)}
        onWidthChange={setDetailsWidth}
        runDetails={runDetails}
        route={route}
        setForm={setForm}
        tabRequest={detailsTabRequest}
        view={view}
      />
      {confirmRequest ? (
        <ConfirmActionOverlay onCancel={() => resolveConfirm(false)} onConfirm={() => resolveConfirm(true)} request={confirmRequest} />
      ) : null}
      <GrainOverlay settings={grainSettings} />
    </main>
  );
}
