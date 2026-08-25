import { createHash, randomUUID } from "node:crypto";
import { immediateTransaction, now as currentTime, openState, type StateStore } from "@server/core/orchestrator-state";
import {
  cancelDispatchRequest,
  getHarnessState,
  initializeHarnessState,
  recoverDispatch,
  requestDispatch,
  requireActiveLease,
  STALE_DISPATCH_LEASE_MS,
  type Blocker,
} from "@server/core/harness-state";
import { getActiveCycle } from "@server/core/cycle/store.js";
import { unresolvedSavePointFailures } from "@server/core/cycle/timeline.js";
import { newSpanId, type JsonObject as EventJsonObject } from "@server/core/harness-state/events.js";
import type { GameRuntimeContext } from "@server/core/game-registry";
import type { DispatchLeaseRevalidator } from "@server/core/cycle-runtime/dispatch-guard.js";
import type { CliResult } from "@server/infrastructure/shell/ui-command-runner.js";
import { latestPrSplitPlanSummary } from "../artifacts.js";
import { readPrRecordsArtifact } from "../pr-records.js";
import { latestRunId } from "../../../run-state/latest-run.js";
import { activateAcquiredPrCampaign, releasePrCampaign } from "./activation.js";
import { adoptLegacyPrSeries } from "./adoption.js";
import { prPublishBatchBlockers, publishPrBatch } from "./publication.js";
import { recordPrPhaseBoundaryInTransaction } from "./timeline-writer.js";
import {
  getOpenPrCampaignForGame,
  getPrCampaign,
  getPrSeries,
  listPrSeriesForCampaign,
  openPrCampaign,
  transitionPrCampaign,
  transitionPrSeries,
} from "./state.js";
import {
  claimPrCampaignWorkItems,
  declinePrCampaignWorkItems,
  resolvePrCampaignWorkItems,
  revisePrCampaignSeries,
  transitionPrWorkItems,
} from "./work-items.js";
import type { PreparedPrSeriesInput, PrCampaignState, PrCampaignStatus } from "./types.js";

type JsonObject = Record<string, unknown>;

export type PrCampaignActionId =
  | "pr.open_campaign"
  | "pr.activate"
  | "pr.release"
  | "pr.publish_batch"
  | "pr.close_campaign"
  | "pr.abandon_campaign"
  | "pr.campaign_recover"
  | "pr.adopt_legacy";

export interface PrCampaignActionContext {
  activationStale?: boolean;
  adoptionCampaignId?: string | null;
  hasLegacyRecords?: boolean;
  namedSavePointId?: string | null;
  cycleUuid?: string | null;
}

export interface PrCampaignActionProjection {
  action_id: PrCampaignActionId;
  blocked_by: Blocker[];
  confirmation_required: boolean;
  enabled: boolean;
  expected_transition: string;
  subject_id: string;
  subject_kind: "pr_campaign";
}

export interface PrCampaignRuntimeDeps {
  handoff: {
    openPrForSliceUnderLease: (
      body: JsonObject,
      revalidateLease: DispatchLeaseRevalidator,
    ) => Promise<JsonObject>;
    runQaRepairForPr: (body: JsonObject) => Promise<JsonObject>;
  };
  prSync: { syncPrRecords: (body: JsonObject) => Promise<JsonObject> };
  resolveDashboardGame: (
    input: JsonObject,
    options?: { useDefaultGame?: boolean },
  ) => GameRuntimeContext;
  stopManaged: (body: JsonObject) => Promise<JsonObject>;
  runGit: (
    repoRoot: string,
    args: string[],
    options?: { check?: boolean; failureHint?: string },
  ) => Promise<CliResult>;
}

export interface PrActivateDecision {
  campaign: PrCampaignState;
  lease_id: string | null;
  queued: boolean;
  run_stopping: boolean;
}

export class PrCampaignActionBlockedError extends Error {
  readonly action: PrCampaignActionProjection;

  constructor(action: PrCampaignActionProjection) {
    super(`${action.action_id} is blocked: ${action.blocked_by.map((entry) => entry.message).join("; ")}`);
    this.name = "PrCampaignActionBlockedError";
    this.action = action;
  }
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function number(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function requireConfirmation(body: JsonObject, actionId: PrCampaignActionId): void {
  if (body.confirmed !== true) throw new Error(`${actionId} requires operator confirmation`);
}

function blocker(code: string, message: string, sourceKind: string, sourceId: string): Blocker {
  return { code, message, source_kind: sourceKind, source_id: sourceId, recoverable: true };
}

function dedupeBlockers(values: Blocker[]): Blocker[] {
  const seen = new Set<string>();
  return values.filter((entry) => {
    const key = `${entry.code}\0${entry.source_kind}\0${entry.source_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function actionProjection(
  actionId: PrCampaignActionId,
  campaignId: string,
  blockers: Blocker[],
  expectedTransition: string,
  confirmationRequired: boolean,
): PrCampaignActionProjection {
  const blockedBy = dedupeBlockers(blockers);
  return {
    action_id: actionId,
    blocked_by: blockedBy,
    confirmation_required: confirmationRequired,
    enabled: blockedBy.length === 0,
    expected_transition: expectedTransition,
    subject_id: campaignId,
    subject_kind: "pr_campaign",
  };
}

function selectedCampaign(store: StateStore, gameId: string, campaignId?: string): PrCampaignState | null {
  if (!campaignId) return getOpenPrCampaignForGame(store, gameId);
  const candidate = getPrCampaign(store, campaignId);
  return candidate?.game_id === gameId ? candidate : null;
}

function hasLegacyPrRecords(stateDir: string): boolean {
  return asArray(readPrRecordsArtifact(stateDir).records)
    .map(asObject)
    .some((record) => /^codex\/split-\d+(?:-|$)/.test(text(record.branch)));
}

function freshCampaignAnchor(
  store: StateStore,
  gameId: string,
): Pick<PrCampaignActionContext, "namedSavePointId" | "cycleUuid"> {
  const cycle = getActiveCycle(store.db, gameId);
  if (
    !cycle?.head_revision?.trim() ||
    cycle.save_point_stale ||
    unresolvedSavePointFailures(store, { gameId, cycleUuid: cycle.cycle_uuid }).length > 0
  ) {
    return { namedSavePointId: null, cycleUuid: cycle?.cycle_uuid ?? null };
  }
  const latest = store.db
    .query(
      `SELECT save_points.commit_sha, save_points.worktree_dirty
       FROM cycle_timeline_entries
       LEFT JOIN save_points ON save_points.id = cycle_timeline_entries.entry_id
       WHERE cycle_timeline_entries.cycle_uuid = ?
         AND cycle_timeline_entries.entry_kind = 'save_point'
       ORDER BY cycle_timeline_entries.id DESC LIMIT 1`,
    )
    .get(cycle.cycle_uuid) as {
      commit_sha: string | null;
      worktree_dirty: number | null;
    } | null;
  if (latest?.commit_sha !== cycle.head_revision || Boolean(latest.worktree_dirty)) {
    return { namedSavePointId: null, cycleUuid: cycle.cycle_uuid };
  }
  const named = store.db
    .query(
      `SELECT save_points.id
       FROM cycle_timeline_entries
       JOIN save_points ON save_points.id = cycle_timeline_entries.entry_id
       WHERE cycle_timeline_entries.cycle_uuid = ?
         AND cycle_timeline_entries.entry_kind = 'save_point'
         AND save_points.commit_sha = ?
         AND save_points.worktree_dirty = 0
         AND LENGTH(TRIM(COALESCE(save_points.label, ''))) > 0
       ORDER BY cycle_timeline_entries.id DESC LIMIT 1`,
    )
    .get(cycle.cycle_uuid, cycle.head_revision) as { id: string } | null;
  return {
    namedSavePointId: named?.id ?? null,
    cycleUuid: cycle.cycle_uuid,
  };
}

function preparedSeries(body: JsonObject): PreparedPrSeriesInput[] {
  return asArray(body.series).map(asObject).map((entry, index) => {
    const branch = text(entry.branch);
    if (!branch) throw new Error(`PR campaign series ${index + 1} requires a branch`);
    const rawUnits = Array.isArray(entry.target_units) ? entry.target_units : entry.targetUnits;
    const targetUnits = asArray(rawUnits).map((unit) => text(unit)).filter(Boolean);
    const batchIndexValue = number(entry.batch_index) ?? number(entry.batchIndex) ?? 0;
    if (!Number.isInteger(batchIndexValue) || batchIndexValue < 0) {
      throw new Error(`PR campaign series ${index + 1} requires a nonnegative batch index`);
    }
    const lastValidation = entry.last_validation === null
      ? null
      : Object.keys(asObject(entry.last_validation ?? entry.lastValidation)).length > 0
        ? asObject(entry.last_validation ?? entry.lastValidation)
        : undefined;
    return {
      batchIndex: batchIndexValue,
      branch,
      lastValidation: lastValidation as EventJsonObject | null | undefined,
      seriesId: text(entry.series_id, text(entry.seriesId)) || undefined,
      targetUnits,
    };
  });
}

function artifactSeries(
  stateDir: string,
  body: JsonObject,
  batchSize: number,
): PreparedPrSeriesInput[] {
  const records = asArray(readPrRecordsArtifact(stateDir).records).map(asObject);
  const runId = text(body.runId, text(body.run_id)) || latestRunId(stateDir);
  const plan = runId ? latestPrSplitPlanSummary(stateDir, runId) : null;
  const planSlices = text(plan?.status) === "passed" ? asArray(plan?.slices)
    .map(asObject)
    .filter((slice) => text(slice.lane, "match") === "match" && text(slice.branchName, text(slice.branch))) : [];
  const source = planSlices.length > 0
    ? planSlices.map((slice, index) => ({
        batch_index: number(slice.batch_index) ?? Math.floor(index / batchSize),
        branch: text(slice.branchName, text(slice.branch)),
        last_validation: Object.keys(asObject(slice.last_validation ?? slice.validation)).length > 0
          ? asObject(slice.last_validation ?? slice.validation)
          : undefined,
        target_units: [
          ...asArray(slice.pathspecs),
          ...asArray(slice.supportPathspecs),
        ],
      }))
    : records
      .filter((record) => text(record.branch))
      .map((record, index) => ({
        batch_index: number(asObject(record.batch).ordinal) === null
          ? Math.floor(index / batchSize)
          : Math.floor(Math.max(0, Math.trunc(number(asObject(record.batch).ordinal)! - 1)) / batchSize),
        branch: text(record.branch),
        last_validation: Object.keys(asObject(record.last_validation ?? record.validation)).length > 0
          ? asObject(record.last_validation ?? record.validation)
          : undefined,
        target_units: [...asArray(record.files), ...asArray(record.supportFiles)],
      }));
  const derived = preparedSeries({ series: source });
  const branches = new Set(derived.map((series) => series.branch));
  if (branches.size !== derived.length) throw new Error("Derived PR campaign series branches must be unique");
  return derived;
}

function stableAdoptionCampaignId(
  gameId: string,
  cycleUuid: string | null | undefined,
  namedSavePointId: string | null | undefined,
): string | null {
  if (!cycleUuid || !namedSavePointId) return null;
  const digest = createHash("sha256")
    .update(`${gameId}\0${cycleUuid}\0${namedSavePointId}\0legacy-adoption`)
    .digest("hex")
    .slice(0, 24);
  return `pr-campaign-adoption-${digest}`;
}

function terminalSeriesSummary(store: StateStore, campaignId: string): EventJsonObject {
  return Object.fromEntries(
    listPrSeriesForCampaign(store, campaignId).map((series) => [series.series_id, series.status]),
  );
}

function activationIsStale(store: StateStore, gameId: string): boolean {
  const lease = getHarnessState(store, gameId)?.active_workflow;
  if (lease?.kind !== "pr") return false;
  const heartbeat = Date.parse(lease.heartbeat_at);
  const nowValue = Date.now();
  return Number.isFinite(heartbeat) && Number.isFinite(nowValue) && nowValue - heartbeat > STALE_DISPATCH_LEASE_MS;
}

export function gamePrCampaignAction(
  store: StateStore,
  gameId: string,
  actionId: PrCampaignActionId,
  campaignId?: string,
  context: PrCampaignActionContext = {},
): PrCampaignActionProjection {
  const campaign = selectedCampaign(store, gameId, campaignId);
  const subjectId = campaign?.campaign_id ?? campaignId ?? `pr-campaign:${gameId}`;
  const missing = campaign
    ? []
    : [blocker("pr_campaign_not_found", "No open PR campaign exists.", "game", gameId)];
  const lease = getHarnessState(store, gameId)?.active_workflow ?? null;

  if (actionId === "pr.open_campaign") {
    const blockers: Blocker[] = [];
    if (campaign) {
      blockers.push(blocker(
        "pr_campaign_open",
        `Game ${gameId} already has open PR campaign ${campaign.campaign_id}.`,
        "pr_campaign",
        campaign.campaign_id,
      ));
    }
    if (!context.cycleUuid) {
      blockers.push(blocker("cycle_not_active", "No active game cycle exists.", "game", gameId));
    }
    if (!context.namedSavePointId) {
      blockers.push(blocker(
        "pr_source_anchor_missing",
        "A named, non-stale save point at the current cycle head is required.",
        "game",
        gameId,
      ));
    }
    return actionProjection(actionId, subjectId, blockers, "no campaign → preparing", false);
  }

  if (actionId === "pr.adopt_legacy") {
    const blockers: Blocker[] = [];
    const openCampaign = getOpenPrCampaignForGame(store, gameId);
    const matchingRetry = Boolean(
      openCampaign &&
      context.adoptionCampaignId === openCampaign.campaign_id &&
      context.cycleUuid === openCampaign.cycle_uuid &&
      context.namedSavePointId === openCampaign.source_anchor.save_point_id,
    );
    if (matchingRetry) {
      return actionProjection(
        actionId,
        openCampaign!.campaign_id,
        [],
        "anchored legacy adoption → existing deterministic result",
        false,
      );
    }
    if (openCampaign) {
      blockers.push(blocker(
        "pr_campaign_open",
        `Legacy records conflict with open PR campaign ${openCampaign.campaign_id}.`,
        "pr_campaign",
        openCampaign.campaign_id,
      ));
    }
    if (!context.hasLegacyRecords) {
      blockers.push(blocker("pr_legacy_records_missing", "No legacy PR records exist to adopt.", "game", gameId));
    }
    if (!context.cycleUuid || !context.namedSavePointId) {
      blockers.push(blocker(
        "pr_source_anchor_missing",
        "A named, non-stale save point at the current cycle head is required.",
        "game",
        gameId,
      ));
    }
    if (lease) {
      blockers.push(blocker(
        "dispatch_lease_held",
        `${lease.kind} workflow ${lease.workflow_id} holds the dispatch lease.`,
        lease.kind,
        lease.workflow_id,
      ));
    }
    return actionProjection(actionId, subjectId, blockers, "legacy PR records → working campaign series", false);
  }

  if (actionId === "pr.activate") {
    const blockers = [...missing];
    if (campaign && !["preparing", "in_review", "working"].includes(campaign.status)) {
      blockers.push(blocker(
        "pr_campaign_not_activatable",
        `PR campaign ${campaign.campaign_id} is ${campaign.status}.`,
        "pr_campaign",
        campaign.campaign_id,
      ));
    }
    if (lease && campaign) {
      const sameCampaign = lease.kind === "pr" && lease.workflow_id === campaign.campaign_id && lease.status === "active";
      if (sameCampaign) {
        blockers.push(blocker(
          "pr_already_active",
          `PR campaign ${campaign.campaign_id} already owns the active dispatch lease.`,
          "pr_campaign",
          campaign.campaign_id,
        ));
      }
      const activeRun = lease.kind === "run" && lease.status === "active";
      if (!sameCampaign && !activeRun) {
        blockers.push(blocker(
          "dispatch_lease_held",
          `${lease.kind} workflow ${lease.workflow_id} holds the dispatch lease and cannot hand off to this PR campaign.`,
          lease.kind,
          lease.workflow_id,
        ));
      }
    }
    return actionProjection(
      actionId,
      subjectId,
      blockers,
      lease?.kind === "run" ? "preparing/in_review → working after run stops" : "preparing/in_review → working",
      false,
    );
  }

  const ownership = campaign && lease?.kind === "pr" && lease.workflow_id === campaign.campaign_id && lease.status === "active"
    ? []
    : [blocker(
        "pr_does_not_own_dispatch_lease",
        `PR campaign ${subjectId} does not own the active dispatch lease.`,
        "pr_campaign",
        subjectId,
      )];
  if (actionId === "pr.release") {
    const blockers = [...missing, ...ownership];
    if (lease?.kind === "pr" && lease.workflow_id === campaign?.campaign_id) {
      blockers.push(...lease.blockers);
    }
    if (campaign && campaign.status !== "working") {
      blockers.push(blocker("pr_campaign_not_working", `PR campaign ${campaign.campaign_id} is ${campaign.status}.`, "pr_campaign", campaign.campaign_id));
    }
    if (campaign) {
      const unsettled = store.db
        .query(
          `SELECT
             (SELECT COUNT(*) FROM pr_series WHERE campaign_id = ? AND status = 'revising') AS revising,
             (SELECT COUNT(*) FROM pr_work_items JOIN pr_series ON pr_series.series_id = pr_work_items.series_id
               WHERE pr_series.campaign_id = ? AND pr_work_items.status = 'in_progress') AS in_progress`,
        )
        .get(campaign.campaign_id, campaign.campaign_id) as { in_progress: number; revising: number };
      if (Number(unsettled.revising) > 0 || Number(unsettled.in_progress) > 0) {
        blockers.push(blocker("pr_fixers_unsettled", "PR fixers must settle before release.", "pr_campaign", campaign.campaign_id));
      }
    }
    return actionProjection(actionId, subjectId, blockers, "working → in_review", false);
  }
  if (actionId === "pr.publish_batch") {
    const blockers = [...missing, ...ownership];
    if (campaign) blockers.push(...prPublishBatchBlockers(store, campaign, lease));
    return actionProjection(actionId, subjectId, blockers, "next prepared batch → published", true);
  }

  if (actionId === "pr.close_campaign") {
    const blockers = [...missing];
    if (campaign) {
      if (campaign.status === "completed" || campaign.status === "abandoned") {
        blockers.push(blocker(
          "pr_campaign_terminal",
          `PR campaign ${campaign.campaign_id} is already ${campaign.status}.`,
          "pr_campaign",
          campaign.campaign_id,
        ));
      }
      const series = listPrSeriesForCampaign(store, campaign.campaign_id);
      if (series.length === 0) {
        blockers.push(blocker(
          "pr_campaign_empty",
          `PR campaign ${campaign.campaign_id} has no series and cannot be completed.`,
          "pr_campaign",
          campaign.campaign_id,
        ));
      }
      const nonTerminal = series
        .filter((series) => series.status !== "merged" && series.status !== "closed");
      for (const series of nonTerminal) {
        blockers.push(blocker(
          "pr_series_not_terminal",
          `PR series ${series.series_id} is ${series.status}.`,
          "pr_series",
          series.series_id,
        ));
      }
    }
    return actionProjection(actionId, subjectId, blockers, "campaign → completed", true);
  }

  if (actionId === "pr.abandon_campaign") {
    const blockers = [...missing];
    if (campaign?.status === "completed" || campaign?.status === "abandoned") {
      blockers.push(blocker(
        "pr_campaign_terminal",
        `PR campaign ${campaign.campaign_id} is already ${campaign.status}.`,
        "pr_campaign",
        campaign.campaign_id,
      ));
    }
    return actionProjection(actionId, subjectId, blockers, "campaign → abandoned", true);
  }

  const blockers = [...missing];
  if (campaign && campaign.status !== "working") {
    blockers.push(blocker(
      "pr_campaign_not_working",
      `PR campaign ${campaign.campaign_id} is ${campaign.status}.`,
      "pr_campaign",
      campaign.campaign_id,
    ));
  }
  if (!campaign || lease?.kind !== "pr" || lease.workflow_id !== campaign.campaign_id) {
    blockers.push(blocker(
      "pr_activation_not_held",
      `PR campaign ${subjectId} has no recoverable activation lease.`,
      "pr_campaign",
      subjectId,
    ));
  } else if (lease.status !== "blocked" && context.activationStale !== true) {
    blockers.push(blocker(
      "pr_activation_not_failed_or_stale",
      `PR campaign ${campaign.campaign_id} activation is neither failed nor stale.`,
      "pr_campaign",
      campaign.campaign_id,
    ));
  }
  return actionProjection(actionId, subjectId, blockers, "working → in_review; stale activation released", true);
}

export function createPrCampaignRuntime(deps: PrCampaignRuntimeDeps) {
  function context(body: JsonObject) {
    const paths = deps.resolveDashboardGame(body, { useDefaultGame: true });
    const gameId = paths.game?.gameId ?? text(body.gameId, text(body.game_id));
    if (!gameId) throw new Error("PR campaign action requires a game id");
    return { paths, gameId };
  }

  function commandId(body: JsonObject, action: string): string {
    return text(body.commandId, text(body.command_id)) || `command-${action}-${randomUUID()}`;
  }

  function campaignId(body: JsonObject): string | undefined {
    return text(body.campaignId, text(body.campaign_id)) || undefined;
  }

  function actionContext(
    store: StateStore,
    paths: GameRuntimeContext,
    gameId: string,
    body: JsonObject,
  ): PrCampaignActionContext {
    const anchor = freshCampaignAnchor(store, gameId);
    return {
      ...anchor,
      activationStale: activationIsStale(store, gameId),
      adoptionCampaignId: campaignId(body) ?? stableAdoptionCampaignId(
        gameId,
        anchor.cycleUuid,
        anchor.namedSavePointId,
      ),
      hasLegacyRecords: hasLegacyPrRecords(paths.stateDir),
    };
  }

  function action(body: JsonObject, actionId: PrCampaignActionId): PrCampaignActionProjection {
    const { paths, gameId } = context(body);
    const store = openState(paths.stateDir);
    try {
      return gamePrCampaignAction(
        store,
        gameId,
        actionId,
        campaignId(body),
        actionContext(store, paths, gameId, body),
      );
    } finally {
      store.db.close();
    }
  }

  async function openCampaign(body: JsonObject): Promise<PrCampaignState> {
    const { paths, gameId } = context(body);
    const store = openState(paths.stateDir);
    try {
      const projectedContext = actionContext(store, paths, gameId, body);
      const projected = gamePrCampaignAction(
        store,
        gameId,
        "pr.open_campaign",
        campaignId(body),
        projectedContext,
      );
      if (!projected.enabled) throw new PrCampaignActionBlockedError(projected);
      const batchSize = number(asObject(body.publication_policy).batch_size) ?? number(body.batchSize) ?? 4;
      if (!Number.isInteger(batchSize) || batchSize < 1) {
        throw new Error("PR campaign batch size must be a positive integer");
      }
      const explicitSeries = preparedSeries(body);
      const series = explicitSeries.length > 0
        ? explicitSeries
        : artifactSeries(paths.stateDir, body, batchSize);
      if (series.length === 0) {
        throw new Error("PR campaign requires at least one series from the request, final split plan, or PR records");
      }
      const operationCommandId = commandId(body, "pr-open-campaign");
      const operationCampaignId = campaignId(body) ?? `pr-campaign-${randomUUID()}`;
      return openPrCampaign(store, {
        actor: "operator",
        campaignId: operationCampaignId,
        commandId: operationCommandId,
        correlationId: operationCampaignId,
        namedSavePointId: projectedContext.namedSavePointId!,
        gameId,
        publicationPolicy: { batch_size: batchSize },
        series,
        cycleUuid: projectedContext.cycleUuid!,
        spanId: newSpanId(),
      });
    } finally {
      store.db.close();
    }
  }

  async function activate(body: JsonObject): Promise<PrActivateDecision> {
    const { paths, gameId } = context(body);
    const store = openState(paths.stateDir);
    try {
      const projected = gamePrCampaignAction(store, gameId, "pr.activate", campaignId(body));
      if (!projected.enabled) throw new PrCampaignActionBlockedError(projected);
      const campaign = selectedCampaign(store, gameId, campaignId(body));
      if (!campaign) throw new Error(`PR campaign not found for ${gameId}`);
      const operationCommandId = commandId(body, "pr-activate");
      const operationSpanId = newSpanId();
      let stoppedRunId: string | null = null;
      const decision = immediateTransaction(store.db, () => {
        initializeHarnessState(store, { gameId, traceId: `trace-game-${gameId}` });
        const existing = getHarnessState(store, gameId)?.active_workflow;
        if (existing?.kind === "pr" && existing.workflow_id === campaign.campaign_id) {
          const activated = activateAcquiredPrCampaign({
            campaignId: campaign.campaign_id,
            commandId: operationCommandId,
            correlationId: campaign.campaign_id,
            leaseId: existing.lease_id,
            gameId,
            causationId: getHarnessState(store, gameId)?.caused_by_event_id ?? operationCommandId,
            spanId: operationSpanId,
            store,
          });
          return { campaign: activated, lease_id: existing.lease_id, queued: false, run_stopping: false };
        }
        const dispatch = requestDispatch(store, {
          actor: "operator",
          commandId: operationCommandId,
          correlationId: campaign.campaign_id,
          kind: "pr",
          gameId,
          reason: text(body.reason, "operator activated PR campaign"),
          workflowId: campaign.campaign_id,
          spanId: operationSpanId,
          handoffOnQueue: true,
        });
        if (!dispatch.queued) {
          const activated = activateAcquiredPrCampaign({
            campaignId: campaign.campaign_id,
            commandId: operationCommandId,
            correlationId: campaign.campaign_id,
            leaseId: dispatch.leaseId,
            gameId,
            causationId: dispatch.acquiredEventId,
            store,
            spanId: operationSpanId,
          });
          return { campaign: activated, lease_id: dispatch.leaseId, queued: false, run_stopping: false };
        }
        const holder = dispatch.blockedBy;
        if (holder.kind !== "run") {
          throw new Error(`Only an active run can hand off dispatch authority to PR; found ${holder.kind}:${holder.workflow_id}`);
        }
        stoppedRunId = holder.workflow_id;
        return { campaign, lease_id: null, queued: true, run_stopping: true };
      });
      if (stoppedRunId) {
        await deps.stopManaged({
          ...body,
          reason: text(body.reason, "operator activated PR campaign"),
          recoverClaims: false,
          runId: stoppedRunId,
        });
      }
      return decision;
    } finally {
      store.db.close();
    }
  }

  async function release(body: JsonObject) {
    const { paths, gameId } = context(body);
    const store = openState(paths.stateDir);
    try {
      const projected = gamePrCampaignAction(store, gameId, "pr.release", campaignId(body));
      if (!projected.enabled) throw new PrCampaignActionBlockedError(projected);
      const campaign = selectedCampaign(store, gameId, campaignId(body));
      if (!campaign) throw new Error(`PR campaign not found for ${gameId}`);
      const lease = getHarnessState(store, gameId)?.active_workflow;
      if (!lease) throw new Error(`PR campaign ${campaign.campaign_id} has no dispatch lease`);
      const operationCommandId = commandId(body, "pr-release");
      return releasePrCampaign({
        campaignId: campaign.campaign_id,
        commandId: operationCommandId,
        correlationId: campaign.campaign_id,
        leaseId: lease.lease_id,
        gameId,
        store,
        spanId: newSpanId(),
      });
    } finally {
      store.db.close();
    }
  }

  async function publishBatch(body: JsonObject) {
    const { paths, gameId } = context(body);
    const store = openState(paths.stateDir);
    try {
      const projected = gamePrCampaignAction(store, gameId, "pr.publish_batch", campaignId(body));
      if (!projected.enabled) throw new PrCampaignActionBlockedError(projected);
      const campaign = selectedCampaign(store, gameId, campaignId(body));
      if (!campaign) throw new Error(`PR campaign not found for ${gameId}`);
      const lease = getHarnessState(store, gameId)?.active_workflow;
      if (!lease) throw new Error(`PR campaign ${campaign.campaign_id} has no dispatch lease`);
      const operationCommandId = commandId(body, "pr-publish-batch");
      return await publishPrBatch({
        campaignId: campaign.campaign_id,
        commandId: operationCommandId,
        confirmed: body.confirmed === true,
        correlationId: campaign.campaign_id,
        leaseId: lease.lease_id,
        gameId,
        store,
        spanId: newSpanId(),
        publishSeries: async (series, revalidateLease) => {
          const records = readPrRecordsArtifact(paths.stateDir);
          const existing = Array.isArray(records.records)
            ? records.records.map(asObject).find((entry) => text(entry.branch) === series.branch)
            : undefined;
          const existingNumber = number(existing?.prNumber) ?? number(asObject(existing?.github).prNumber);
          if (existingNumber && Number.isInteger(existingNumber) && existingNumber > 0) {
            return { upstreamPrNumber: existingNumber };
          }
          const result = await deps.handoff.openPrForSliceUnderLease(
            { ...body, prBranch: series.branch },
            revalidateLease,
          );
          const opened = asObject(result.record);
          const upstreamPrNumber = number(opened.prNumber) ?? number(asObject(opened.github).prNumber);
          if (!upstreamPrNumber) throw new Error(`Published ${series.branch}, but PR sync returned no upstream PR number`);
          return { upstreamPrNumber };
        },
      });
    } finally {
      store.db.close();
    }
  }

  function workItemCommandContext(body: JsonObject) {
    const { paths, gameId } = context(body);
    const requestedGameId = text(body.gameId, text(body.game_id));
    if (!requestedGameId) throw new Error("PR work-item command requires a gameId");
    if (requestedGameId !== gameId) {
      throw new Error(`PR work-item command requested ${requestedGameId}, but the resolved game is ${gameId}`);
    }
    const leaseId = text(body.leaseId, text(body.lease_id));
    const seriesId = text(body.seriesId, text(body.series_id));
    const itemIds = asArray(body.itemIds ?? body.item_ids)
      .map((itemId) => text(itemId))
      .filter(Boolean);
    const singleItemId = text(body.itemId, text(body.item_id, text(body.qaRepairItemId)));
    if (singleItemId && !itemIds.includes(singleItemId)) itemIds.push(singleItemId);
    if (!leaseId) throw new Error("PR work-item command requires the current leaseId");
    if (!seriesId) throw new Error("PR work-item command requires a seriesId");
    return { itemIds, leaseId, paths, gameId, seriesId };
  }

  async function claimWorkItems(body: JsonObject) {
    const { itemIds, leaseId, paths, gameId, seriesId } = workItemCommandContext(body);
    const store = openState(paths.stateDir);
    try {
      const series = getPrSeries(store, seriesId);
      if (!series) throw new Error(`PR series not found: ${seriesId}`);
      return claimPrCampaignWorkItems({
        commandId: commandId(body, "pr-work-items-claim"),
        correlationId: series.campaign_id,
        itemIds,
        leaseId,
        gameId,
        seriesId,
        store,
        spanId: newSpanId(),
      });
    } finally {
      store.db.close();
    }
  }

  async function resolveWorkItems(body: JsonObject) {
    const { itemIds, leaseId, paths, gameId, seriesId } = workItemCommandContext(body);
    const store = openState(paths.stateDir);
    try {
      const series = getPrSeries(store, seriesId);
      if (!series) throw new Error(`PR series not found: ${seriesId}`);
      return resolvePrCampaignWorkItems({
        commandId: commandId(body, "pr-work-items-resolve"),
        correlationId: series.campaign_id,
        itemIds,
        leaseId,
        gameId,
        resolution: text(body.resolution) || undefined,
        seriesId,
        store,
        spanId: newSpanId(),
      });
    } finally {
      store.db.close();
    }
  }

  async function declineWorkItems(body: JsonObject) {
    const { itemIds, leaseId, paths, gameId, seriesId } = workItemCommandContext(body);
    const store = openState(paths.stateDir);
    try {
      const series = getPrSeries(store, seriesId);
      if (!series) throw new Error(`PR series not found: ${seriesId}`);
      return declinePrCampaignWorkItems({
        commandId: commandId(body, "pr-work-items-decline"),
        correlationId: series.campaign_id,
        itemIds,
        leaseId,
        gameId,
        reason: text(body.reason),
        seriesId,
        store,
        spanId: newSpanId(),
      });
    } finally {
      store.db.close();
    }
  }

  async function reviseWorkItems(body: JsonObject) {
    const { leaseId, paths, gameId, seriesId } = workItemCommandContext(body);
    const store = openState(paths.stateDir);
    try {
      const series = getPrSeries(store, seriesId);
      if (!series) throw new Error(`PR series not found: ${seriesId}`);
      return revisePrCampaignSeries({
        commandId: commandId(body, "pr-work-items-revise"),
        correlationId: series.campaign_id,
        leaseId,
        gameId,
        pushedRevision: text(body.pushedRevision, text(body.pushed_revision)),
        seriesId,
        store,
        spanId: newSpanId(),
      });
    } finally {
      store.db.close();
    }
  }

  async function runQaRepair(body: JsonObject): Promise<JsonObject> {
    const { paths, gameId } = context(body);
    const requestedGameId = text(body.gameId, text(body.game_id));
    if (!requestedGameId) throw new Error("PR QA repair requires a gameId");
    if (requestedGameId !== gameId) {
      throw new Error(`PR QA repair requested ${requestedGameId}, but the resolved game is ${gameId}`);
    }
    const store = openState(paths.stateDir);
    try {
      const campaign = selectedCampaign(store, gameId, campaignId(body));
      if (!campaign) throw new Error(`PR campaign not found for ${gameId}`);
      const leaseId = text(body.leaseId, text(body.lease_id));
      if (!leaseId) throw new Error("PR QA repair requires the current leaseId");
      immediateTransaction(store.db, () => {
        const lease = requireActiveLease(store, leaseId, gameId);
        if (lease.kind !== "pr" || lease.workflow_id !== campaign.campaign_id) {
          throw new Error(
            `Dispatch lease ${lease.lease_id} belongs to ${lease.kind}:${lease.workflow_id}, not pr:${campaign.campaign_id}`,
          );
        }
        if (campaign.status !== "working") {
          throw new Error(`PR campaign ${campaign.campaign_id} cannot run QA repair while ${campaign.status}`);
        }
      });
      const result = await deps.handoff.runQaRepairForPr({
        ...body,
        campaignId: campaign.campaign_id,
        leaseId,
        lease_id: leaseId,
        gameId,
      });
      const lease = requireActiveLease(store, leaseId, gameId);
      if (lease.kind !== "pr" || lease.workflow_id !== campaign.campaign_id) {
        throw new Error(`PR campaign ${campaign.campaign_id} lost dispatch ownership during QA repair`);
      }
      return result;
    } finally {
      store.db.close();
    }
  }

  function transitionTerminalCampaign(
    store: StateStore,
    campaign: PrCampaignState,
    operation: { causationId?: string; commandId: string; spanId: string },
    outcome: Extract<PrCampaignStatus, "completed" | "abandoned">,
  ): PrCampaignState {
    return transitionPrCampaign(store, campaign.campaign_id, {
      actor: "operator",
      causationId: operation.causationId,
      commandId: operation.commandId,
      correlationId: campaign.campaign_id,
      eventType: "pr.campaign_closed",
      expectedRevision: campaign.revision,
      patch: { status: outcome },
      payload: {
        outcome,
        per_series_terminal_summary: terminalSeriesSummary(store, campaign.campaign_id),
      },
      spanId: operation.spanId,
    });
  }

  function cancelQueuedCampaignActivation(
    store: StateStore,
    gameId: string,
    campaign: PrCampaignState,
    body: JsonObject,
    operation: { commandId: string; spanId: string },
  ): string | undefined {
    const before = getHarnessState(store, gameId);
    if (!before) return undefined;
    const cancelled = cancelDispatchRequest(store, {
      actor: "operator",
      commandId: operation.commandId,
      correlationId: campaign.campaign_id,
      kind: "pr",
      gameId,
      reason: text(body.reason, `PR campaign ${campaign.campaign_id} became terminal`),
      workflowId: campaign.campaign_id,
      spanId: operation.spanId,
    });
    return cancelled.caused_by_event_id !== before.caused_by_event_id
      ? cancelled.caused_by_event_id ?? undefined
      : undefined;
  }

  async function closeCampaign(body: JsonObject): Promise<PrCampaignState> {
    const { paths, gameId } = context(body);
    const store = openState(paths.stateDir);
    try {
      const projected = gamePrCampaignAction(store, gameId, "pr.close_campaign", campaignId(body));
      if (!projected.enabled) throw new PrCampaignActionBlockedError(projected);
      requireConfirmation(body, "pr.close_campaign");
      const operation = { commandId: commandId(body, "pr-close-campaign"), spanId: newSpanId() };
      return immediateTransaction(store.db, () => {
        let campaign = selectedCampaign(store, gameId, campaignId(body));
        if (!campaign) throw new Error(`PR campaign not found for ${gameId}`);
        let terminalCausationId = cancelQueuedCampaignActivation(store, gameId, campaign, body, operation);
        if (campaign.status === "working") {
          const lease = getHarnessState(store, gameId)?.active_workflow;
          if (!lease || lease.kind !== "pr" || lease.workflow_id !== campaign.campaign_id) {
            throw new Error(`Working PR campaign ${campaign.campaign_id} has no matching dispatch lease`);
          }
          const released = releasePrCampaign({
            campaignId: campaign.campaign_id,
            commandId: operation.commandId,
            correlationId: campaign.campaign_id,
            leaseId: lease.lease_id,
            gameId,
            store,
            spanId: operation.spanId,
          });
          campaign = released.campaign;
          terminalCausationId = released.harnessState.caused_by_event_id ?? terminalCausationId;
        }
        return transitionTerminalCampaign(
          store,
          campaign,
          { ...operation, causationId: terminalCausationId },
          "completed",
        );
      });
    } finally {
      store.db.close();
    }
  }

  function recoverActivation(
    store: StateStore,
    gameId: string,
    campaign: PrCampaignState,
    body: JsonObject,
    recoveryReason: string,
  ): PrCampaignState {
    return immediateTransaction(store.db, () => {
      const operationCommandId = commandId(body, "pr-campaign-recover");
      const operationSpanId = newSpanId();
      const lease = getHarnessState(store, gameId)?.active_workflow;
      if (!lease || lease.kind !== "pr" || lease.workflow_id !== campaign.campaign_id) {
        throw new Error(`PR campaign ${campaign.campaign_id} has no recoverable activation lease`);
      }
      const occurredAt = currentTime();
      const interruptedRows = store.db
        .query(
          `SELECT DISTINCT pr_series.series_id
           FROM pr_series
           LEFT JOIN pr_work_items ON pr_work_items.series_id = pr_series.series_id
           WHERE pr_series.campaign_id = ?
             AND (pr_series.status = 'revising' OR pr_work_items.status = 'in_progress')
           ORDER BY pr_series.series_id`,
        )
        .all(campaign.campaign_id) as Array<{ series_id: string }>;
      const cancelledSubjectIds = new Set<string>();
      const reconciliationBlockers: Blocker[] = [];
      let recoveryCauseEventId = operationCommandId;
      for (const row of interruptedRows) {
        const series = getPrSeries(store, row.series_id);
        if (!series) throw new Error(`PR series disappeared during recovery: ${row.series_id}`);
        const inProgressItems = series.work_items.filter((item) => item.status === "in_progress");
        if (series.status === "revising") cancelledSubjectIds.add(series.series_id);
        for (const item of inProgressItems) cancelledSubjectIds.add(item.item_id);
        const canReturnToReview = ["published", "changes_requested", "revising", "approved"].includes(series.status);
        const willHavePending = inProgressItems.length > 0 || series.work_items.some((item) => item.status === "pending");
        if (!canReturnToReview || !willHavePending) {
          reconciliationBlockers.push(blocker(
            "pr_recovery_reconciliation_required",
            `PR series ${series.series_id} is ${series.status} without recoverable pending work.`,
            "pr_series",
            series.series_id,
          ));
          continue;
        }
        const recoveredSeries = inProgressItems.length > 0
          ? transitionPrWorkItems(store, {
            actor: "operator",
            causationId: recoveryCauseEventId,
            commandId: operationCommandId,
            correlationId: campaign.campaign_id,
            eventType: "pr.series_changes_requested",
            expectedRevision: series.revision,
            occurredAt,
            patch: { status: "changes_requested" },
            seriesId: series.series_id,
            workItems: inProgressItems.map((item) => ({
              expectedStatus: "in_progress",
              itemId: item.item_id,
              status: "pending",
            })),
            spanId: operationSpanId,
          })
          : transitionPrSeries(store, series.series_id, {
            actor: "operator",
            causationId: recoveryCauseEventId,
            commandId: operationCommandId,
            correlationId: campaign.campaign_id,
            expectedRevision: series.revision,
            occurredAt,
            patch: { status: "changes_requested" },
            spanId: operationSpanId,
          });
        recoveryCauseEventId = recoveredSeries.caused_by_event_id;
      }
      const cancelledIds = [...cancelledSubjectIds];
      const recovered = transitionPrCampaign(store, campaign.campaign_id, {
        actor: "operator",
        causationId: recoveryCauseEventId,
        commandId: operationCommandId,
        correlationId: campaign.campaign_id,
        eventType: "pr.campaign_recovered",
        expectedRevision: campaign.revision,
        occurredAt,
        patch: { status: "in_review", blockers: reconciliationBlockers },
        payload: {
          cancelled_subject_ids: cancelledIds,
          recovery_reason: recoveryReason,
          resulting_status: "in_review",
        },
        spanId: operationSpanId,
      });
      recordPrPhaseBoundaryInTransaction(store.db, {
        boundary: "released",
        campaign: recovered,
        leaseId: lease.lease_id,
        occurredAt,
      });
      recoverDispatch(store, {
        actor: "operator",
        cancelledSubjectIds: cancelledIds,
        causationId: recovered.caused_by_event_id,
        commandId: operationCommandId,
        correlationId: campaign.campaign_id,
        leaseId: lease.lease_id,
        now: occurredAt,
        gameId,
        recoveryReason,
        spanId: operationSpanId,
      });
      return recovered;
    });
  }

  function abandonWorkingCampaign(
    store: StateStore,
    gameId: string,
    campaign: PrCampaignState,
    body: JsonObject,
    operation: { commandId: string; spanId: string },
  ): PrCampaignState {
    const lease = getHarnessState(store, gameId)?.active_workflow;
    if (!lease || lease.kind !== "pr" || lease.workflow_id !== campaign.campaign_id) {
      throw new Error(`Working PR campaign ${campaign.campaign_id} has no matching dispatch lease`);
    }
    const cancelledSubjectIds = [
      ...(store.db
        .query("SELECT series_id AS id FROM pr_series WHERE campaign_id = ? AND status = 'revising'")
        .all(campaign.campaign_id) as Array<{ id: string }>),
      ...(store.db
        .query(
          `SELECT pr_work_items.item_id AS id
           FROM pr_work_items
           JOIN pr_series ON pr_series.series_id = pr_work_items.series_id
           WHERE pr_series.campaign_id = ? AND pr_work_items.status = 'in_progress'`,
        )
        .all(campaign.campaign_id) as Array<{ id: string }>),
    ].map((entry) => entry.id);
    const occurredAt = currentTime();
    const abandoned = transitionTerminalCampaign(store, campaign, operation, "abandoned");
    recordPrPhaseBoundaryInTransaction(store.db, {
      boundary: "released",
      campaign: abandoned,
      leaseId: lease.lease_id,
      occurredAt: abandoned.closed_at ?? occurredAt,
    });
    recoverDispatch(store, {
      actor: "operator",
      cancelledSubjectIds,
      causationId: abandoned.caused_by_event_id,
      commandId: operation.commandId,
      correlationId: campaign.campaign_id,
      leaseId: lease.lease_id,
      now: abandoned.closed_at ?? occurredAt,
      gameId,
      recoveryReason: text(body.reason, "operator abandoned PR campaign"),
      spanId: operation.spanId,
    });
    return abandoned;
  }

  async function abandonCampaign(body: JsonObject): Promise<PrCampaignState> {
    const { paths, gameId } = context(body);
    const store = openState(paths.stateDir);
    try {
      const projected = gamePrCampaignAction(store, gameId, "pr.abandon_campaign", campaignId(body));
      if (!projected.enabled) throw new PrCampaignActionBlockedError(projected);
      requireConfirmation(body, "pr.abandon_campaign");
      const operation = { commandId: commandId(body, "pr-abandon-campaign"), spanId: newSpanId() };
      return immediateTransaction(store.db, () => {
        let campaign = selectedCampaign(store, gameId, campaignId(body));
        if (!campaign) throw new Error(`PR campaign not found for ${gameId}`);
        const terminalCausationId = cancelQueuedCampaignActivation(store, gameId, campaign, body, operation);
        if (campaign.status === "working") {
          return abandonWorkingCampaign(store, gameId, campaign, body, operation);
        }
        return transitionTerminalCampaign(
          store,
          campaign,
          { ...operation, causationId: terminalCausationId },
          "abandoned",
        );
      });
    } finally {
      store.db.close();
    }
  }

  async function recoverCampaign(body: JsonObject): Promise<PrCampaignState> {
    const { paths, gameId } = context(body);
    const store = openState(paths.stateDir);
    try {
      const projected = gamePrCampaignAction(
        store,
        gameId,
        "pr.campaign_recover",
        campaignId(body),
        actionContext(store, paths, gameId, body),
      );
      if (!projected.enabled) throw new PrCampaignActionBlockedError(projected);
      requireConfirmation(body, "pr.campaign_recover");
      const campaign = selectedCampaign(store, gameId, campaignId(body));
      if (!campaign) throw new Error(`PR campaign not found for ${gameId}`);
      return recoverActivation(
        store,
        gameId,
        campaign,
        body,
        text(body.reason, "operator recovered stale or failed PR activation"),
      );
    } finally {
      store.db.close();
    }
  }

  async function adoptLegacy(body: JsonObject) {
    const { paths, gameId } = context(body);
    const store = openState(paths.stateDir);
    try {
      const projectedContext = actionContext(store, paths, gameId, body);
      const projected = gamePrCampaignAction(
        store,
        gameId,
        "pr.adopt_legacy",
        campaignId(body),
        projectedContext,
      );
      if (!projected.enabled) throw new PrCampaignActionBlockedError(projected);
      const existing = getOpenPrCampaignForGame(store, gameId);
      if (existing) {
        return {
          adopted: [],
          skippedSeriesIds: listPrSeriesForCampaign(store, existing.campaign_id)
            .map((series) => series.series_id),
        };
      }
      const recordsPayload = await deps.prSync.syncPrRecords(body);
      const refs = await deps.runGit(
        paths.repoRoot,
        ["for-each-ref", "refs/heads/codex/split-*", "--format=%(refname:short)"],
        { check: false },
      );
      if (refs.exitCode !== 0) {
        throw new Error(`Unable to inspect legacy split branches: ${refs.stderr || refs.stdout}`);
      }
      const operationCommandId = commandId(body, "pr-adopt-legacy");
      const operationSpanId = newSpanId();
      const adoptionCampaignId = projectedContext.adoptionCampaignId ?? campaignId(body) ?? `pr-campaign-${randomUUID()}`;
      const adopted = immediateTransaction(store.db, () => {
        const opened = openPrCampaign(store, {
          actor: "operator",
          campaignId: adoptionCampaignId,
          commandId: operationCommandId,
          correlationId: adoptionCampaignId,
          namedSavePointId: projectedContext.namedSavePointId!,
          gameId,
          cycleUuid: projectedContext.cycleUuid!,
          spanId: operationSpanId,
        }, { allowEmptyForLegacyAdoption: true });
        initializeHarnessState(store, { gameId, traceId: `trace-game-${gameId}` });
        const dispatch = requestDispatch(store, {
          actor: "operator",
          causationId: opened.caused_by_event_id,
          commandId: operationCommandId,
          correlationId: opened.campaign_id,
          kind: "pr",
          gameId,
          reason: text(body.reason, "operator adopted legacy PR records"),
          workflowId: opened.campaign_id,
          spanId: operationSpanId,
        });
        if (dispatch.queued) throw new Error("Legacy adoption requires a free dispatch lease");
        const activated = activateAcquiredPrCampaign({
          campaignId: opened.campaign_id,
          causationId: dispatch.acquiredEventId,
          commandId: operationCommandId,
          correlationId: opened.campaign_id,
          leaseId: dispatch.leaseId,
          gameId,
          store,
          spanId: operationSpanId,
        });
        return adoptLegacyPrSeries({
          campaignId: activated.campaign_id,
          causationId: activated.caused_by_event_id,
          commandId: operationCommandId,
          correlationId: activated.campaign_id,
          discoveredBranches: refs.stdout.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean),
          leaseId: dispatch.leaseId,
          gameId,
          recordsPayload,
          store,
          spanId: operationSpanId,
        });
      });
      await deps.prSync.syncPrRecords(body);
      return adopted;
    } finally {
      store.db.close();
    }
  }

  return {
    abandonCampaign,
    action,
    activate,
    adoptLegacy,
    claimWorkItems,
    closeCampaign,
    declineWorkItems,
    openCampaign,
    publishBatch,
    recoverCampaign,
    release,
    resolveWorkItems,
    reviseWorkItems,
    runQaRepair,
  };
}
