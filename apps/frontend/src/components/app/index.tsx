import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { dashboardParams, fetchJson, fetchRunDetails, formBody, loadConfig, postJson } from "@/lib/api";
import { asObject, numberValue, type Dashboard, type FormState, type JsonObject, type RunDetails, type UiConfig } from "@/lib/format";
import { useDashboardStream } from "@/hooks/useDashboardStream";
import { DetailsRail, type DetailsTab } from "@/components/details-rail";
import { GameWorkspace, type DashboardAction } from "@/pages/workspace";
import { deriveCycleView, harnessStateAction, harnessStateCompatibilityAction, harnessStateReadModel } from "@/pages/workspace/_lib/model";
import { type ImprovedMode, type WorkMode } from "@/pages/workspace/cycles/active/subphases/run/components/work-tables";
import { type AppRoute, routeFromUrl, saveRoute } from "@/routing";
import { loadGrainSettings, normalizeGrainSettings, saveGrainSettings, type GrainSettings, type GrainSettingsPatch } from "@/lib/styleSettings";
import { DashboardPage } from "@/pages/dashboard";
import { GrainOverlay } from "@/components/app/_components/GrainOverlay";
import { ConfirmActionOverlay, type ConfirmTone } from "@/components/app/_components/ConfirmActionOverlay";
import { clampDetailsWidth, loadDetailsCollapsed, loadDetailsWidth, loadSidebarCollapsed, saveDetailsCollapsed, saveDetailsWidth, saveSidebarCollapsed } from "@/components/app/_lib/railState";
import { initialForm, saveRunSettings, schedulingForWorkers } from "@/components/app/_lib/runSettings";
import { useHotReload } from "@/components/app/_lib/useHotReload";
import { RUN_CONTROL_ACTION_IDS, RUN_CONTROL_ENDPOINTS } from "@/components/app/_lib/projectedRunControls";
import {
  PR_CAMPAIGN_ACTION_IDS,
  PR_CAMPAIGN_ENDPOINTS,
  prCampaignConfirmationMessage,
} from "@/components/app/_lib/projectedPrCampaignControls";
import {
  SYNC_CONTROL_ACTION_IDS,
  SYNC_CONTROL_ENDPOINTS,
  syncControlRequestPatch,
  syncConfirmationMessage,
} from "@/components/app/_lib/projectedSyncControls";
import { PR_COMPATIBILITY_ACTION_IDS, PR_COMPATIBILITY_ENDPOINTS } from "@/components/app/_lib/projectedCompatibilityControls";
import { KNOWLEDGE_CONTROL_ACTION_IDS, KNOWLEDGE_CONTROL_ENDPOINTS } from "@/components/app/_lib/projectedKnowledgeControls";
import { CYCLE_CONTROL_ACTION_IDS, cycleConfirmationMessage } from "@/components/app/_lib/projectedCycleControls";
import { PrCampaignAuthorityProvider } from "@/pages/workspace/cycles/active/subphases/pr/components/PrStageCard";

type Action = DashboardAction;
const PROCESS_CONFIG_VERSION = 2;
const DEFAULT_THINKING_LEVEL = "xhigh";

// Multi-step server operations tracked by process.operation. Triggering one
// auto-opens the details rail on the Logs tab so the activity card and live
// output are in view the moment the work starts.
const operationActions: ReadonlySet<Action> = new Set(["syncStart", "syncResolveConflict", "syncPublish", "syncCancel", "syncRecover", "syncRecoverDiscard", "syncRevalidate", "prOpenCampaign", "prActivate", "prPublishBatch", "prRelease", "prCloseCampaign", "prAbandonCampaign", "prCampaignRecover", "prAdoptLegacy", "knowledgeProcess", "syncGit", "indexPrs", "calculateBaseline", "completeRun", "checkpoint", "qa", "qaRepair", "reconcile", "splitPlan", "preparePr", "prepareLocalPr", "prepareLocalBatch", "openPr", "openDraftBatch", "openAllPrs"]);
const legacyPublicationActions: ReadonlySet<Action> = new Set(["openPr", "openDraftBatch", "openAllPrs"]);

function newCycleBody(body: JsonObject): JsonObject {
  const next = { ...body };
  delete next.runId;
  delete next.activeRunId;
  return next;
}

function cycleRouteSub(cycle: JsonObject): "run" | "pr" | "done" {
  const phase = String(cycle.phase || "");
  // The Prepare stage is retired: a preparing cycle opens on the Run page,
  // which hosts the remaining setup inputs (baseline, worker config).
  if (phase === "preparing") return "run";
  if (phase === "running") return "run";
  if (phase === "pr") return "pr";
  return "done";
}

function cyclePhaseSummary(cycle: JsonObject): string {
  const phase = String(cycle.phase || "active");
  const subphase = String(cycle.activeSubphase || "");
  return [phase, subphase].filter(Boolean).join(" / ");
}

function cycleScopedBody(body: JsonObject, cycle: JsonObject): JsonObject {
  const cycleUuid = String(cycle.cycleUuid || cycle.cycle_uuid || cycle.id || "");
  return cycleUuid ? { ...body, cycleUuid,  } : body;
}

function workerConfigBody(body: JsonObject): JsonObject {
  return {
    configVersion: PROCESS_CONFIG_VERSION,
    maxWorkers: body.maxWorkers,
    workerCount: body.maxWorkers,
    integrationResolverConcurrency: body.integrationResolverConcurrency,
    agentTimeoutSeconds: body.agentTimeoutSeconds,
    provider: body.provider,
    model: body.model,
    thinkingLevel: body.thinkingLevel,
  };
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

function cycleRunConfigPatch(cycle: JsonObject): Partial<FormState> | null {
  const phases = asObject(cycle.phases);
  const preparing = asObject(phases.preparing);
  const running = asObject(phases.running);
  const runningWorkers = asObject(running.workers);
  const completion = asObject(preparing.completion);
  const workerConfig = Object.keys(asObject(runningWorkers.workerConfig)).length > 0 ? asObject(runningWorkers.workerConfig) : asObject(completion.workerConfig);
  if (Object.keys(workerConfig).length === 0) return null;

  const patch: Partial<FormState> = {};
  const maxWorkers = positiveInteger(workerConfig.maxWorkers) ?? positiveInteger(workerConfig.workerCount);
  if (maxWorkers !== null) Object.assign(patch, schedulingForWorkers(maxWorkers));

  const integrationResolverConcurrency = positiveInteger(workerConfig.integrationResolverConcurrency);
  if (integrationResolverConcurrency !== null) patch.integrationResolverConcurrency = integrationResolverConcurrency;

  const agentTimeoutSeconds = positiveInteger(workerConfig.agentTimeoutSeconds);
  if (agentTimeoutSeconds !== null) patch.agentTimeoutSeconds = agentTimeoutSeconds;

  const provider = stringConfigValue(workerConfig.provider);
  if (provider !== null) patch.provider = provider;

  const model = stringConfigValue(workerConfig.model);
  if (model !== null) patch.model = model;

  const thinkingLevel = stringConfigValue(workerConfig.thinkingLevel);
  if (thinkingLevel !== null) {
    patch.thinkingLevel = thinkingLevel === "medium" && Number(workerConfig.configVersion) !== PROCESS_CONFIG_VERSION ? DEFAULT_THINKING_LEVEL : thinkingLevel;
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

function cycleUrl(path: string, form: FormState): string {
  const params = dashboardParams(form).toString();
  return params ? `${path}?${params}` : path;
}

class ActiveCycleError extends Error {
  readonly cycle: JsonObject;

  constructor(cycle: JsonObject) {
    const cycleUuid = String(cycle.cycleUuid || cycle.id || "active");
    super(
      `New cycle blocked: active cycle ${cycleUuid} is ${cyclePhaseSummary(cycle)}. Open or complete the active cycle before starting another one.`,
    );
    this.name = "ActiveCycleError";
    this.cycle = cycle;
  }
}

async function createCycle(body: JsonObject, form: FormState): Promise<JsonObject> {
  try {
    return asObject(await postJson<JsonObject>(cycleUrl("/api/cycle/new", form), body));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/active cycle already exists/i.test(message)) throw error;
    const activeState = asObject(await fetchJson<JsonObject>(`/api/cycle?${dashboardParams(form)}`));
    throw new ActiveCycleError(asObject(activeState.cycle));
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

  useEffect(() => {
    void loadConfig()
      .then((loaded) => {
        const gameDefaults = asObject(loaded.gameDefaults);
        const dashboardDefaults = asObject(gameDefaults.dashboard);
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
          integrationResolverConcurrency: numberValue(dashboardDefaults.integrationResolverConcurrency, current.integrationResolverConcurrency),
          agentTimeoutSeconds: numberValue(dashboardDefaults.agentTimeoutSeconds, current.agentTimeoutSeconds),
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

  const currentDashboard = dashboard as Dashboard | null;
  const busy = action !== null;
  const view = deriveCycleView(currentDashboard, config, form);

  useEffect(() => {
    const cycle = asObject(currentDashboard?.cycle);
    const patch = cycleRunConfigPatch(cycle);
    if (!patch) return;
    const cycleUuid = String(cycle.cycleUuid || cycle.id || "");
    const signature = `${cycleUuid}:${JSON.stringify(patch)}`;
    if (appliedSessionConfigSignatureRef.current === signature) return;
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
    appliedSessionConfigSignatureRef.current = signature;
  }, [currentDashboard?.cycle]);

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
      const nextAction: Action = (harnessState?.pr_work.length ?? 0) > 0 && legacyPublicationActions.has(requestedAction)
        ? "prPublishBatch"
        : requestedAction;
      const projectedRunActionId = RUN_CONTROL_ACTION_IDS[nextAction];
      const projectedRunAction = projectedRunActionId
        ? harnessStateAction(harnessState, projectedRunActionId)
        : null;
      const projectedPrActionId = PR_CAMPAIGN_ACTION_IDS[nextAction];
      const projectedPrAction = projectedPrActionId
        ? harnessStateAction(harnessState, projectedPrActionId)
        : null;
      const projectedCampaign = projectedPrAction?.subject_id
        ? harnessState?.pr_work.find((candidate) => candidate.workflow_id === projectedPrAction.subject_id) ?? null
        : harnessState?.pr_work[0] ?? null;
      const compatibilityActionId = PR_COMPATIBILITY_ACTION_IDS[nextAction];
      const compatibilityAction = compatibilityActionId
        ? harnessStateCompatibilityAction(harnessState, compatibilityActionId)
        : null;
      const cycleActionId = CYCLE_CONTROL_ACTION_IDS[nextAction];
      const cycleAction = cycleActionId ? harnessStateAction(harnessState, cycleActionId) : null;
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
      if (projectedPrAction?.confirmation_required) {
        const confirmation = prCampaignConfirmationMessage(nextAction, projectedCampaign) ??
          `${projectedPrActionId}?\n\n${projectedPrAction.expected_transition}`;
        if (!(await requestConfirm(confirmation))) return;
      }
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
      if (compatibilityAction?.confirmation_required && !(await requestConfirm(`${compatibilityActionId}?\n\n${compatibilityAction.expected_transition}`))) return;
      if (cycleAction?.confirmation_required) {
        if (!(await requestConfirm(cycleConfirmationMessage(nextAction) ?? `${cycleActionId}?\n\n${cycleAction.expected_transition}`))) return;
      }
      if (knowledgeAction?.confirmation_required && !(await requestConfirm(`${knowledgeActionId}?\n\n${knowledgeAction.expected_transition}`))) return;
      if (
        nextAction === "completeRun" &&
        !(await requestConfirm("Close this legacy cycle?\n\nThis records a save point and marks the run complete. Use this when PR work is already shipped, closed, or intentionally carried forward. Stale ship/QA blockers will be overridden."))
      ) {
        return;
      }
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
          projectedPrAction?.subject_id &&
          projectedCampaign?.workflow_id === projectedPrAction.subject_id
        ) body.campaignId = projectedPrAction.subject_id;
        if (compatibilityAction?.subject_id) body.campaignId = compatibilityAction.subject_id;
        if (projectedPrAction?.confirmation_required) body.confirmed = true;
        if (
          projectedSyncAction?.subject_id &&
          harnessState?.sync?.workflow_id === projectedSyncAction.subject_id
        ) body.syncId = projectedSyncAction.subject_id;
        if (projectedSyncAction?.confirmation_required) body.confirmed = true;
        if (compatibilityAction?.confirmation_required || cycleAction?.confirmation_required || knowledgeAction?.confirmation_required) body.confirmed = true;
        Object.assign(body, syncControlRequestPatch(syncControlAction));
        const cycle = asObject(currentDashboard?.cycle);
        const harnessStateCycle = asObject(asObject(currentDashboard?.harnessState).cycle);
        const cyclePhase = String(cycle.phase || "");
        const markWorkersActive = async () => {
          if (cyclePhase !== "running") return;
          await postJson(cycleUrl("/api/cycle/running/subphase", form), {
            ...cycleScopedBody(body, cycle),
            subphase: "workers",
            data: {
              workers: {
                workerConfig: workerConfigBody(body),
              },
            },
          });
        };
        if (nextAction === "refresh") {
          await manualRefresh();
        } else if (projectedPrActionId) {
          const endpoint = PR_CAMPAIGN_ENDPOINTS[nextAction];
          if (!endpoint) throw new Error(`No endpoint is configured for ${nextAction}`);
          await postJson(endpoint, body);
          await manualRefresh();
        } else if (compatibilityActionId) {
          const endpoint = PR_COMPATIBILITY_ENDPOINTS[nextAction];
          if (!endpoint) throw new Error(`No endpoint is configured for ${nextAction}`);
          await postJson(endpoint, body);
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
        } else if (nextAction === "calculateBaseline") {
          await postJson(cycleUrl("/api/cycle/preparing/baseline", form), cycleScopedBody(body, cycle));
          await manualRefresh();
        } else if (nextAction === "start") {
          await postJson("/api/process/start", body);
          await markWorkersActive();
          await manualRefresh();
        } else if (nextAction === "runStart") {
          await postJson("/api/process/start", body);
          await markWorkersActive();
          await manualRefresh();
        } else if (nextAction === "runResume") {
          await postJson("/api/run/resume", body);
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
        } else if (nextAction === "startWork") {
          const cycleBody = cycleScopedBody(body, cycle);
          const run = asObject(currentDashboard?.status?.run);
          const runStatus = String(run.status || "");
          let processStarted = false;
          if (runStatus === "paused") {
            await postJson("/api/run/resume", body);
            processStarted = true;
          } else if (runStatus !== "active") {
            const initialized = asObject(await postJson<JsonObject>("/api/run/init", cycleBody));
            const activeRunId = String(initialized.activeRunId || initialized.runId || asObject(initialized.parsed).runId || "");
            if (cyclePhase === "preparing") {
              await postJson(cycleUrl("/api/cycle/preparing/complete", form), {
                ...cycleBody,
                activeRunId,
                completion: {
                  initRun: initialized,
                  workerConfig: workerConfigBody(body),
                },
              });
              await postJson(cycleUrl("/api/cycle/start-running", form), {
                ...cycleBody,
                activeRunId,
              });
            }
            if (activeRunId) body.runId = activeRunId;
          }
          if (!processStarted) await postJson("/api/process/start", body);
          await markWorkersActive();
          if (cyclePhase === "preparing") {
            const cycleUuid = String(cycle.cycleUuid || cycle.id || "");
            navigate({ kind: "workspace", section: "cycles", cycle: cycleUuid || "active", cycleSub: "run", gameId: form.gameId || String(cycle.gameId || "") || undefined });
          }
          await manualRefresh();
        } else if (nextAction === "init") {
          await postJson("/api/run/init", body);
          await manualRefresh();
        } else if (nextAction === "fresh") {
          const cycleBody = newCycleBody(body);
          let created: JsonObject;
          try {
            created = await createCycle(cycleBody, form);
          } catch (error) {
            if (error instanceof ActiveCycleError) {
              const activeCycle = error.cycle;
              const cycleUuid = String(activeCycle.cycleUuid || activeCycle.id || "");
              navigate({
                kind: "workspace",
                section: "cycles",
                cycle: cycleUuid || "active",
                cycleSub: cycleRouteSub(activeCycle),
                gameId: form.gameId || String(activeCycle.gameId || "") || undefined,
              });
              await manualRefresh();
              return;
            }
            throw error;
          }
          const createdCycle = asObject(created.cycle);
          const cycleUuid = String(createdCycle.cycleUuid || createdCycle.id || "");
          navigate({ kind: "workspace", section: "cycles", cycle: cycleUuid || "active", cycleSub: "run", gameId: form.gameId || String(createdCycle.gameId || "") || undefined });
          await manualRefresh();
          setRunDetails(null);
        } else if (nextAction === "completeRun") {
          await postJson("/api/run/complete", { ...body, force: true });
          setRunDetails(null);
          await manualRefresh();
        } else if (nextAction === "cycleSavePoint") {
          await postJson(cycleUrl("/api/cycle/save-point", form), cycleScopedBody(body, harnessStateCycle));
          await manualRefresh();
        } else if (nextAction === "cycleClose") {
          await postJson(cycleUrl("/api/cycle/close", form), cycleScopedBody(body, harnessStateCycle));
          setRunDetails(null);
          await manualRefresh();
        } else if (nextAction === "checkpoint") {
          await postJson("/api/run/checkpoint", body);
          await manualRefresh();
        } else if (nextAction === "qa") {
          await postJson("/api/pr/qa", body);
          await manualRefresh();
        } else if (nextAction === "qaRepair") {
          const campaign = harnessState?.pr_work[0];
          const leaseId = campaign?.activation.lease_id;
          if (leaseId) Object.assign(body, { campaignId: campaign.workflow_id, leaseId, lease_id: leaseId });
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
      <PrCampaignAuthorityProvider authoritative={(harnessStateReadModel(currentDashboard)?.pr_work.length ?? 0) > 0}>
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
      </PrCampaignAuthorityProvider>
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
