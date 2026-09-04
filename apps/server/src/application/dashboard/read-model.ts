import { Database } from "bun:sqlite";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { latestCheckpointSummary } from "@server/core/cycle-runtime/phases/pr/checkpoint";
import { runningEpochCheckpointProgress, runningEpochHistory } from "@server/core/cycle-runtime/phases/running/epochs";
import { knowledgeCuratorEnrichmentPath } from "@server/core/knowledge";
import { queryBackgroundKnowledgeSummary } from "@server/core/knowledge/background/index.js";
import {
  activeSchedulerEpoch,
  activeWorkerCount,
  getRun,
  openState,
  schedulerEpochProgress,
  statusSnapshot,
} from "@server/core/cycle-runtime/run-state";
import { runDispatchLeaseStaleness } from "@server/core/cycle-runtime/phases/running/run-control.js";
import { dashboardArtifactPayloads, latestDashboardArtifactPayload } from "@server/core/orchestrator-state";
import {
  getActiveCycle,
  type CloseCycleInput,
  type CycleBlocker,
  type CycleRecord,
  type CycleTimelineEntry,
} from "@server/core/cycle";
import { activeCycleProjection } from "@server/core/cycle/store";
import { listCycleTimeline, unresolvedSavePointFailures } from "@server/core/cycle/timeline";
import {
  eventsForSubject,
  getHarnessState,
  latestSequence,
  type Blocker,
  type DispatchLease,
  type QueuedDispatchRequest,
} from "@server/core/harness-state";
import { recentGameEvents, type GameEventDto } from "@server/core/harness-state/event-query";
import type { RunRecord, RunSchedulerCondition, RunStatus } from "@server/core/shared/types";
import { listSavePoints, type SavePointRecord } from "@server/core/cycle-runtime/phases/pr/state";
import { gameToSummary as defaultGameToSummary, type GameRuntimeContext, type ResolvedGame } from "@server/core/game-registry";
import { latestChildDirectory, latestPrSplitPlanSummary, latestQaRepairSummary, latestRegressionCheckSummary } from "@server/core/cycle-runtime/phases/pr/artifacts";
import {
  getSyncState,
  type SyncState,
  type SyncStatus,
} from "@server/core/cycle-runtime/phases/sync";
import {
  gameSyncAction,
  type SyncActionId,
} from "@server/core/cycle-runtime/phases/sync/runtime.js";
import { parseBaseRef } from "@server/core/cycle-runtime/phases/preparing/subphases/git-intake.js";
import { quietGit } from "@server/core/cycle-runtime/phases/pr/pr-sync.js";
import { uiLog } from "@server/infrastructure/logging/ui-log";
import { scoreTiersProjection, type DashboardScoreTiers } from "./score-tiers.js";
import { boundaryDashboardForRun, type BoundaryDashboard } from "./boundary-view.js";
import {
  boundaryStepDetailForRun,
  type BoundaryStepDetail,
  type BoundaryStepDetailQuery,
} from "./boundary-step-detail.js";

export type JsonObject = Record<string, unknown>;
type WorkerStateOutcome =
  | "running"
  | "exact"
  | "timeout_selected_checkpoint"
  | "timeout_baseline"
  | "claim_deadline"
  | "attempt_budget_exhausted"
  | "cold_attempt_budget_exhausted"
  | "improvement_followup_budget_exhausted"
  | "improvement_banked"
  | "gate_failed_exact_followup_budget_exhausted"
  | "accepted_or_no_repair_reasons"
  | "dry_run"
  | "recovered_requeued"
  | "recovered_finished"
  | "provider_error"
  | "worker_session_failed"
  | "agent_tool_error"
  | "validation_qa_lint_failed"
  | "validation_build_failed"
  | "validation_snapshot_unavailable"
  | "validation_no_official_score_change"
  | "validation_target_regressed"
  | "validation_same_unit_regression"
  | "validation_failed"
  | "validation_skipped"
  | "cancelled"
  | "finished"
  | "unknown_error";
type WorkerStateResult = "exact" | "improved" | "no_progress";
type StopReason = "target_complete" | "stalled";

export type DashboardGameContext = GameRuntimeContext;

export interface ActionProjection {
  action_id:
    | "run.start"
    | "run.resume"
    | "run.hard_stop"
    | "run.cancel"
    | "run.recover"
    | "cycle.close"
    | "cycle.save_point"
    | "knowledge.process"
    | SyncActionId;
  subject_kind: "run" | "cycle" | "sync" | "game";
  subject_id: string;
  enabled: boolean;
  blocked_by: Blocker[];
  expected_transition: string;
  confirmation_required: boolean;
}

export interface CycleActionState {
  availableActions: ActionProjection[];
  closeInput: Pick<CloseCycleInput, "aheadOfBase" | "namedSavePointId" | "worktreeDirtyBeyondHead">;
}

export interface DashboardRunRecoveryPoint {
  event_id: string;
  sequence: number;
  occurred_at: string;
  recovery_reason: string | null;
  cancelled_claim_ids: string[];
  cancelled_operation_ids: string[];
  resulting_status: string | null;
}

export interface DashboardRunSummary {
  workflow_id: string;
  status: RunStatus;
  scheduler_condition: RunSchedulerCondition | null;
  active_epoch: {
    epoch_id: string;
    ordinal: number;
  } | null;
  admitted: number;
  claimed: number;
  running: number;
  progress: {
    baseline_score: number | null;
    confirmed_score: number | null;
    tentative_changes: number;
    confirmed_changes: number;
    regressed_changes: number;
  };
  recovery_points: DashboardRunRecoveryPoint[];
}

export interface GameRunActionState {
  availableActions: ActionProjection[];
  run: DashboardRunSummary | null;
}

export interface GameRunActionStateOptions {
  hasActiveProcess?: (stateDir: string) => { active: boolean };
  now?: Date | number | string;
  runId?: string;
}

export interface DashboardSyncSummary {
  workflow_id: string;
  status: SyncStatus;
  blockers: Blocker[];
  intake: {
    upstream_from: string;
    upstream_to: string;
    merged_pr_count: number;
    corpus_batches: string[];
    knowledge_only: boolean;
  };
  knowledge_jobs: {
    jobs_total: number;
    jobs_succeeded: number;
    jobs_failed: number;
    jobs_processing: number;
    prs: DashboardKnowledgeJobCounts;
    discord: DashboardKnowledgeJobCounts;
  } | null;
  discord: {
    refresh: {
      status: "running" | "ok" | "failed";
      detail: string | null;
      at: string | null;
      messages_pulled: number | null;
    } | null;
  } | null;
  staging: {
    commits_behind: number;
    minor_auto_resolved_count: number;
    conflicts_awaiting_operator: number;
    conflicts: string[];
  } | null;
  pr_reconciliation: {
    total: number;
    clean: number;
    auto_resolved: number;
    needs_operator: number;
    pushed: number;
    pending_pushes: number;
  };
  publish_preview: {
    prior_head: string;
    new_head: string;
    series_pushes: number;
  };
  publication: DashboardSyncPublication | null;
  staleness: {
    stale: boolean;
    validated_upstream: string | null;
    observed_upstream: string | null;
    blocker: Blocker | null;
    revalidate_action_id: "sync.recover" | "sync.cancel" | null;
  };
}

interface DashboardKnowledgeJobCounts {
  jobs_total: number;
  jobs_succeeded: number;
  jobs_failed: number;
  jobs_processing: number;
}

export interface DashboardKnowledgeIntakeSummary {
  fetched_prs: number;
  skipped_prs: number;
  renames_applied: number;
  tasks_enqueued: number;
  lanes: string[];
}

export interface DashboardSyncPublication {
  remote_application_id?: string;
  prior_head: string;
  new_head: string;
  knowledge_intake: DashboardKnowledgeIntakeSummary | null;
}

/**
 * Standing repo-sync posture for the active cycle.  Unlike
 * DashboardSyncSummary.staleness this exists even when no sync workflow is
 * active, and it only consults local git refs — fresh remote observation stays
 * behind the sync actions (refreshSyncUpstreamObservation).
 */
export interface DashboardRepoSyncState {
  cycle_head: string | null;
  upstream_ref: string;
  upstream_anchor: string | null;
  local_upstream_sha: string | null;
  behind_count: number | null;
  last_synced_at: string | null;
  needs_sync: boolean;
}

export interface GameSyncActionState {
  availableActions: ActionProjection[];
  sync: DashboardSyncSummary | null;
}

const ALL_CYCLE_EVIDENCE_LIMIT = Number.MAX_SAFE_INTEGER;

export interface DashboardHarnessState {
  revision: number;
  active_workflow: DispatchLease | null;
  queued_dispatch_requests: QueuedDispatchRequest[];
  run: DashboardRunSummary | null;
  /** Legacy compatibility key. PR campaign projection has been retired. */
  pr: null;
  sync: DashboardSyncSummary | null;
  cycle: {
    cycle_uuid: string;
    head_revision: string | null;
    status: CycleRecord["status"];
    latest_save_point: Pick<
      SavePointRecord,
      "id" | "triggerKind" | "label" | "commitSha" | "matchedCodePercent" | "createdAt"
    > | null;
    save_point_stale: boolean;
    blockers: Blocker[];
    timeline: CycleTimelineEntry[];
  } | null;
  cycle_blockers: Blocker[];
  save_point_stale: boolean;
  latest_event_sequence: number;
  recent_events: GameEventDto[];
  available_actions: ActionProjection[];
}

/** The server-owned, operator-facing game projection. */
export interface HarnessStateView {
  game_id: string;
  harness_revision: number;
  cycle: (NonNullable<DashboardHarnessState["cycle"]> & { latest_timeline_entry: CycleTimelineEntry | null }) | null;
  active_workflow: (DispatchLease & { headline: string }) | null;
  queued_dispatch_requests: QueuedDispatchRequest[];
  run: DashboardRunSummary | null;
  /** Legacy compatibility key. PR campaign projection has been retired. */
  pr_work: [];
  knowledge: {
    queued: number;
    processing: number;
    waiting: number;
    failed: number;
    oldest_pending_at: string | null;
    active_lease: { id: string; expires_at: string } | null;
    retry: { next_attempt_at: string; attempts: number } | null;
    recent_failures: Array<{
      job_id: string;
      worker_state_id: string;
      error: string;
      attempts: number;
      updated_at: string;
    }>;
  };
  sync: DashboardSyncSummary | null;
  repo_sync: DashboardRepoSyncState;
  active_operations: Array<{ operation_id: string; status: string; [key: string]: unknown }>;
  recent_events: GameEventDto[];
  available_actions: ActionProjection[];
  compatibility_actions: ActionProjection[];
}

export interface HarnessStateViewOptions extends Pick<GameRunActionStateOptions, "hasActiveProcess" | "now"> {
  /** Legacy dashboard evidence used by the cycle close/readiness gates. */
  campaign?: JsonObject;
  /** Game checkout used for the local-only repo_sync git observation. */
  gameContext?: Pick<GameRuntimeContext, "game" | "repoRoot">;
}

export interface DashboardReadModelDependencies {
  buildPrRecordsView: (stateDir: string, runId: string) => JsonObject;
  campaignStatus: (repoRoot: string, stateDir: string, baseRefFallback: string) => JsonObject;
  hasActiveProcess?: (stateDir: string) => { active: boolean };
  processStatus: (stateDir: string, game: ResolvedGame | null) => JsonObject;
  gameToSummary?: (game: ResolvedGame) => unknown;
  refreshSyncUpstreamObservation?: (paths: DashboardGameContext, observedUpstream: string) => Promise<unknown>;
}

let readModelDependencies: DashboardReadModelDependencies | null = null;

const KNOWLEDGE_INTAKE_LANE_ORDER = ["reconcile", "prs", "discord", "attempts"] as const;

function objectValue(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function numericCount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.length;
  return 0;
}

function syncKnowledgeIntakeSummary(value: unknown): DashboardKnowledgeIntakeSummary | null {
  const raw = objectValue(value);
  if (Object.keys(raw).length === 0) return null;

  const ingest = objectValue(raw.ingest);
  const reconcile = objectValue(ingest.reconcile);
  const renames = objectValue(reconcile.renames);
  const lanes = KNOWLEDGE_INTAKE_LANE_ORDER.filter((lane) => Object.keys(objectValue(ingest[lane])).length > 0);
  const tasksEnqueued = ["prs", "discord", "attempts"]
    .map((lane) => numericCount(objectValue(ingest[lane]).tasksEnqueued))
    .reduce((sum, count) => sum + count, 0);

  return {
    fetched_prs: arrayValue(raw.fetched_prs).length,
    skipped_prs: arrayValue(raw.skipped_prs).length,
    renames_applied: numericCount(renames.applied),
    tasks_enqueued: tasksEnqueued,
    lanes,
  };
}

function dashboardDeps(): DashboardReadModelDependencies {
  if (!readModelDependencies) throw new Error("Dashboard read model dependencies have not been configured.");
  return readModelDependencies;
}

function gameSummary(game: ResolvedGame): unknown {
  return readModelDependencies?.gameToSummary ? readModelDependencies.gameToSummary(game) : defaultGameToSummary(game);
}

export function createDashboardReadModel(dependencies: DashboardReadModelDependencies): {
  dashboardStableSignature: (dashboard: JsonObject) => string;
  dashboardTick: (dashboard: JsonObject) => JsonObject;
  runDashboard: (paths: DashboardGameContext) => Promise<JsonObject>;
  runDetails: (stateDir: string, explicitRunId?: string, game?: ResolvedGame | null) => JsonObject;
  workerStateTrace: (stateDir: string, runId: string, workerStateId: string) => JsonObject;
  boundaryStepDetail: (stateDir: string, runId: string, query: BoundaryStepDetailQuery) => BoundaryStepDetail | { error: string };
} {
  readModelDependencies = dependencies;
  return { dashboardStableSignature, dashboardTick, runDashboard, runDetails, workerStateTrace, boundaryStepDetail };
}

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function actionBlocker(
  blocker: CycleBlocker,
  fallback: { sourceKind: string; sourceId: string },
): Blocker {
  return {
    code: blocker.code,
    message: blocker.message,
    source_kind: blocker.source_kind ?? blocker.source ?? fallback.sourceKind,
    source_id: blocker.source_id ?? fallback.sourceId,
    recoverable: blocker.recoverable ?? true,
  };
}

function savePointByEntry(
  savePoints: SavePointRecord[],
  entry: CycleTimelineEntry | undefined,
): SavePointRecord | null {
  if (!entry) return null;
  return savePoints.find((savePoint) => savePoint.id === entry.entry_id) ?? null;
}

function dedupeBlockers(blockers: Blocker[]): Blocker[] {
  const seen = new Set<string>();
  return blockers.filter((blocker) => {
    const key = `${blocker.code}\0${blocker.source_kind}\0${blocker.source_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function cycleEvidenceState(
  store: ReturnType<typeof openState>,
  gameId: string,
  campaign: JsonObject,
  cycle: CycleRecord | null,
  timeline: CycleTimelineEntry[],
  savePoints: SavePointRecord[],
): {
  blockers: Blocker[];
  freshNamedSavePoint: SavePointRecord | null;
  latestSavePoint: SavePointRecord | null;
  stale: boolean;
  worktreeDirty: boolean;
} {
  const latestEntry = timeline.find((entry) => entry.entry_kind === "save_point");
  const latestSavePoint = savePointByEntry(savePoints, latestEntry);
  const worktreeDirty = asObject(campaign.head).dirty === true;
  const spooled = unresolvedSavePointFailures(store, {
    gameId,
    cycleUuid: cycle?.cycle_uuid,
  });
  const blockers = dedupeBlockers([
    ...(cycle?.blockers_json ?? []).map((blocker) =>
      actionBlocker(blocker, { sourceKind: "cycle", sourceId: cycle?.cycle_uuid ?? gameId }),
    ),
    ...spooled.map((failure): Blocker => ({
      code: "save_point_failed",
      message: failure.message,
      source_kind: failure.source_kind,
      source_id: failure.source_id,
      recoverable: true,
    })),
  ]);
  const headRevision = cycle?.head_revision?.trim() ?? "";
  const latestAnchorDrifted = Boolean(
    latestEntry && (
      !latestSavePoint?.commitSha?.trim() ||
      latestSavePoint.commitSha !== headRevision ||
      latestSavePoint.worktreeDirty
    ),
  );
  const freshNamedSavePoint = cycle && headRevision && !latestAnchorDrifted
    ? timeline
        .filter((entry) => entry.entry_kind === "save_point")
        .map((entry) => savePointByEntry(savePoints, entry))
        .find(
          (savePoint) =>
            Boolean(savePoint?.label?.trim()) &&
            savePoint?.commitSha === headRevision &&
            !savePoint.worktreeDirty,
        ) ?? null
    : null;
  return {
    blockers,
    freshNamedSavePoint,
    latestSavePoint,
    stale: Boolean(cycle?.save_point_stale) || spooled.length > 0 || latestAnchorDrifted || worktreeDirty,
    worktreeDirty,
  };
}

function cycleActionStateInternal(
  store: ReturnType<typeof openState>,
  gameId: string,
  campaign: JsonObject,
  cycle: CycleRecord | null,
  timeline: CycleTimelineEntry[],
  savePoints: SavePointRecord[],
): CycleActionState {
  const harnessState = getHarnessState(store, gameId);
  const subjectId = cycle?.cycle_uuid ?? gameId;
  const inactiveBlockers: Blocker[] = cycle
    ? cycle.status === "active" || cycle.status === "blocked"
      ? []
      : cycle.blockers_json.length > 0
        ? cycle.blockers_json.map((blocker) =>
            actionBlocker(blocker, { sourceKind: "cycle", sourceId: cycle.cycle_uuid }),
          )
        : [
            {
              code: "cycle_not_active",
              message: `The game cycle is ${cycle.status}.`,
              source_kind: "cycle",
              source_id: cycle.cycle_uuid,
              recoverable: false,
            },
          ]
    : [
        {
          code: "cycle_not_active",
          message: "No active game cycle exists.",
          source_kind: "game",
          source_id: gameId,
          recoverable: true,
        },
      ];

  const evidence = cycleEvidenceState(store, gameId, campaign, cycle, timeline, savePoints);
  const head = asObject(campaign.head);
  const aheadOfBaseKnown = typeof campaign.aheadOfBase === "number" && Number.isFinite(campaign.aheadOfBase);
  const worktreeStateKnown = typeof head.dirty === "boolean";
  const aheadOfBase = aheadOfBaseKnown ? Math.max(0, numberValue(campaign.aheadOfBase)) : 0;
  const worktreeDirtyBeyondHead = evidence.worktreeDirty;
  const closeBlockers: Blocker[] = [...inactiveBlockers, ...evidence.blockers];
  if (cycle && harnessState?.active_workflow) {
    closeBlockers.push({
      code: "dispatch_lease_held",
      message: "A workflow still holds the dispatch lease.",
      source_kind: "game",
      source_id: gameId,
      recoverable: true,
    });
  }
  if (cycle && (evidence.stale || !evidence.freshNamedSavePoint)) {
    closeBlockers.push({
      code: "unshipped_work",
      message: worktreeDirtyBeyondHead
        ? "The worktree contains changes beyond the cycle head."
        : evidence.stale
          ? "Save-point evidence is stale or not anchored at the current cycle head."
          : "A named save point at the current cycle head is required.",
      source_kind: "cycle",
      source_id: cycle.cycle_uuid,
      recoverable: true,
    });
  }
  if (cycle && (!aheadOfBaseKnown || !worktreeStateKnown)) {
    closeBlockers.push({
      code: "close_evidence_unavailable",
      message: "Current worktree or upstream-distance evidence is unavailable.",
      source_kind: "cycle",
      source_id: cycle.cycle_uuid,
      recoverable: true,
    });
  }

  return {
    availableActions: [
      {
        action_id: "cycle.save_point",
        subject_kind: "cycle",
        subject_id: subjectId,
        enabled: inactiveBlockers.length === 0,
        blocked_by: inactiveBlockers,
        expected_transition: "evidence anchor recorded at the current commit",
        confirmation_required: false,
      },
      {
        action_id: "cycle.close",
        subject_kind: "cycle",
        subject_id: subjectId,
        enabled: closeBlockers.length === 0,
        blocked_by: closeBlockers,
        expected_transition: "active → closed",
        confirmation_required: true,
      },
    ],
    closeInput: {
      aheadOfBase,
      namedSavePointId: evidence.freshNamedSavePoint?.id ?? null,
      worktreeDirtyBeyondHead,
    },
  };
}

export function cycleActionState(
  store: ReturnType<typeof openState>,
  gameId: string,
  campaign: JsonObject,
): CycleActionState {
  const cycle = getActiveCycle(store.db, gameId);
  const timeline = cycle
    ? listCycleTimeline(store.db, cycle.cycle_uuid, ALL_CYCLE_EVIDENCE_LIMIT)
    : [];
  const savePoints = listSavePoints(store, ALL_CYCLE_EVIDENCE_LIMIT);
  return cycleActionStateInternal(store, gameId, campaign, cycle, timeline, savePoints);
}

function latestRunForGame(
  store: ReturnType<typeof openState>,
  gameId: string,
  cycle: CycleRecord | null,
  explicitRunId?: string,
): RunRecord | null {
  if (explicitRunId) return getRun(store, explicitRunId);
  if (cycle?.active_run_id) {
    const active = getRun(store, cycle.active_run_id);
    if (active) return active;
  }
  const row = (cycle
    ? store.db
        .query(
          `SELECT id
           FROM runs
           WHERE game_id = ? AND cycle_uuid = ?
           ORDER BY created_at DESC
           LIMIT 1`,
        )
        .get(gameId, cycle.cycle_uuid)
    : store.db
        .query(
          `SELECT id
           FROM runs
           WHERE game_id = ?
           ORDER BY created_at DESC
           LIMIT 1`,
        )
        .get(gameId)) as { id: string } | null;
  return row?.id ? getRun(store, row.id) : null;
}

function runStatusProjection(store: ReturnType<typeof openState>, run: RunRecord): JsonObject {
  const latest = statusSnapshot(store);
  if (stringValue(asObject(latest.run).id) === run.id) return latest;

  // A state database may contain more than one game. Reuse the same
  // canonical status queries for an explicitly selected non-latest run.
  const activeEpoch = activeSchedulerEpoch(store, run.id);
  return {
    run,
    schedulerEpoch: activeEpoch ? schedulerEpochProgress(store, activeEpoch.id) : null,
    activeClaims: activeWorkerCount(store, run.id),
  };
}

function nullableFiniteNumber(value: unknown): number | null {
  const number = numberValue(value, NaN);
  return Number.isFinite(number) ? number : null;
}

function scoreFromBoardArtifact(payload: JsonObject, goalKind: string): number | null {
  const measures = asObject(payload.measures);
  return nullableFiniteNumber(measures[goalKind] ?? measures.matched_code_percent);
}

function runProgress(store: ReturnType<typeof openState>, run: RunRecord): DashboardRunSummary["progress"] {
  const initial = latestDashboardArtifactPayload(store, {
    runId: run.id,
    artifactType: "board_snapshot",
    artifactKey: "initial",
  });
  const current = latestDashboardArtifactPayload(store, {
    runId: run.id,
    artifactType: "board_snapshot",
    artifactKey: "current",
  });
  const baselineScore = scoreFromBoardArtifact(initial, run.goalKind);
  const confirmedScore = scoreFromBoardArtifact(current, run.goalKind) ?? baselineScore;
  const validationRows = store.db
    .query(
      `SELECT COALESCE(
                json_extract(metadata_json, '$.confirmation.validation_state'),
                'tentative'
              ) AS validation_state,
              COUNT(*) AS count
       FROM integration_outcomes
       WHERE run_id = ?
         AND status IN ('applied', 'resolved', 'needs_rework')
       GROUP BY COALESCE(
         json_extract(metadata_json, '$.confirmation.validation_state'),
         'tentative'
       )`,
    )
    .all(run.id) as Array<{ validation_state: string; count: number }>;
  const counts = new Map(validationRows.map((row) => [String(row.validation_state), Number(row.count)]));
  return {
    baseline_score: baselineScore,
    confirmed_score: confirmedScore,
    tentative_changes: counts.get("tentative") ?? 0,
    confirmed_changes: counts.get("confirmed") ?? 0,
    regressed_changes: counts.get("regressed") ?? 0,
  };
}

function runRecoveryPoints(
  store: ReturnType<typeof openState>,
  gameId: string,
  runId: string,
): DashboardRunRecoveryPoint[] {
  return eventsForSubject(store.db, "run", runId, { gameId })
    .filter((event) => event.eventType === "run.recovered")
    .map((event) => ({
      event_id: event.eventId,
      sequence: event.sequence,
      occurred_at: event.occurredAt,
      recovery_reason: typeof event.payload.recovery_reason === "string" ? event.payload.recovery_reason : null,
      cancelled_claim_ids: stringArrayValue(event.payload.cancelled_claim_ids),
      cancelled_operation_ids: stringArrayValue(event.payload.cancelled_operation_ids),
      resulting_status: typeof event.payload.resulting_status === "string" ? event.payload.resulting_status : null,
    }));
}

function runSummaryProjection(
  store: ReturnType<typeof openState>,
  gameId: string,
  run: RunRecord,
): DashboardRunSummary {
  const status = runStatusProjection(store, run);
  const schedulerEpoch = asObject(status.schedulerEpoch);
  const epochId = stringValue(schedulerEpoch.epochId);
  const admitted = numberValue(schedulerEpoch.admitted);
  return {
    workflow_id: run.id,
    status: run.status,
    scheduler_condition: run.schedulerCondition,
    active_epoch: epochId
      ? {
          epoch_id: epochId,
          ordinal: numberValue(schedulerEpoch.ordinal),
        }
      : null,
    admitted,
    claimed: numberValue(schedulerEpoch.claimed),
    running: numberValue(status.activeClaims),
    progress: runProgress(store, run),
    recovery_points: runRecoveryPoints(store, gameId, run.id),
  };
}

function stateBlocker(
  code: string,
  message: string,
  sourceKind: string,
  sourceId: string,
  recoverable = true,
): Blocker {
  return {
    code,
    message,
    source_kind: sourceKind,
    source_id: sourceId,
    recoverable,
  };
}

function runActionProjection(
  run: RunRecord,
  actionId: Extract<ActionProjection["action_id"], `run.${string}`>,
  blockedBy: Blocker[],
  expectedTransition: string,
  confirmationRequired: boolean,
): ActionProjection {
  const blockers = dedupeBlockers(blockedBy);
  return {
    action_id: actionId,
    subject_kind: "run",
    subject_id: run.id,
    enabled: blockers.length === 0,
    blocked_by: blockers,
    expected_transition: expectedTransition,
    confirmation_required: confirmationRequired,
  };
}

export function gameRunActionState(
  store: ReturnType<typeof openState>,
  gameId: string,
  options: GameRunActionStateOptions = {},
): GameRunActionState {
  const harnessState = getHarnessState(store, gameId);
  const cycle = getActiveCycle(store.db, gameId);
  const run = latestRunForGame(store, gameId, cycle, options.runId);
  if (!run || run.gameId !== gameId) {
    const subjectId = options.runId ?? `run:new:${gameId}`;
    const missing = stateBlocker("run_not_found", "No run exists for this game.", "game", gameId);
    const absent = (actionId: Extract<ActionProjection["action_id"], `run.${string}`>, transition: string, confirmationRequired: boolean): ActionProjection => ({
      action_id: actionId,
      subject_kind: "run",
      subject_id: subjectId,
      enabled: false,
      blocked_by: [missing],
      expected_transition: transition,
      confirmation_required: confirmationRequired,
    });
    return {
      availableActions: [
        absent("run.start", "ready → active", false),
        absent("run.resume", "paused → active", false),
        absent("run.hard_stop", "active/paused → paused", true),
        absent("run.cancel", "paused/failed → cancelled", true),
        absent("run.recover", "failed/stale → paused via run.recovered", true),
      ],
      run: null,
    };
  }

  const lease = harnessState?.active_workflow ?? null;
  const ownLease = lease?.kind === "run" && lease.workflow_id === run.id ? lease : null;
  const leaseStaleness = runDispatchLeaseStaleness({
    hasActiveProcess: options.hasActiveProcess,
    lease: ownLease,
    now: options.now,
    stateDir: store.stateDir,
  });
  const leaseHeld = lease
    ? stateBlocker(
        "dispatch_lease_held",
        `${lease.kind} workflow ${lease.workflow_id} holds the dispatch lease.`,
        lease.kind,
        lease.workflow_id,
      )
    : null;
  const syncRequest =
    lease?.kind === "sync" || harnessState?.queued_dispatch_requests.some((request) => request.kind === "sync")
      ? stateBlocker(
          "unresolved_sync_request",
          "An unresolved sync request must settle before the run can acquire dispatch authority.",
          "game",
          gameId,
        )
      : null;
  const inactiveCycle =
    cycle?.status === "active"
      ? null
      : stateBlocker(
          "cycle_not_active",
          cycle ? `The game cycle is ${cycle.status}.` : "No active game cycle exists.",
          cycle ? "cycle" : "game",
          cycle?.cycle_uuid ?? gameId,
        );
  const staleBaseline =
    run.inputs?.base_revision && cycle?.head_revision && run.inputs.base_revision !== cycle.head_revision
      ? stateBlocker(
          "stale_baseline",
          "The ready run baseline no longer matches the active cycle head.",
          "run",
          run.id,
        )
      : null;
  const readinessMissing = [
    !run.gameId && "game_id",
    !run.inputs?.base_revision?.trim() && "inputs.base_revision",
    !run.inputs?.policy_revision?.trim() && "inputs.policy_revision",
    !run.inputs?.starting_knowledge_revision?.trim() && "inputs.starting_knowledge_revision",
    (!run.inputs?.configuration_snapshot || typeof run.inputs.configuration_snapshot !== "object") &&
      "inputs.configuration_snapshot",
  ].filter((value): value is string => typeof value === "string");
  const runReadinessBlockers: Blocker[] = [
    ...run.blockers.map((blocker) => ({ ...blocker })),
    ...(readinessMissing.length > 0
      ? [
          stateBlocker(
            "run_readiness_failed",
            `Run readiness is incomplete: ${readinessMissing.join(", ")}.`,
            "run",
            run.id,
          ),
        ]
      : []),
  ];
  const unsettledClaims = activeWorkerCount(store, run.id);

  const startBlockers: Blocker[] = [
    ...(run.status === "ready"
      ? []
      : [stateBlocker("run_not_ready", `Run ${run.id} is ${run.status}; start requires ready.`, "run", run.id)]),
    ...runReadinessBlockers,
    ...(inactiveCycle ? [inactiveCycle] : []),
    ...(leaseHeld ? [leaseHeld] : []),
    ...(staleBaseline ? [staleBaseline] : []),
    ...(syncRequest ? [syncRequest] : []),
  ];
  const resumeBlockers: Blocker[] = [
    ...(run.status === "paused"
      ? []
      : [stateBlocker("run_not_paused", `Run ${run.id} is ${run.status}; resume requires paused.`, "run", run.id)]),
    ...(leaseHeld ? [leaseHeld] : []),
    ...(syncRequest
      ? [
          stateBlocker(
            "baseline_invalidated_by_sync",
            "An unpublished sync must settle before the run can resume.",
            "run",
            run.id,
          ),
        ]
      : []),
  ];
  const hardStopBlockers =
    run.status === "active" || run.status === "paused"
      ? []
      : [
          stateBlocker(
            "run_not_active_or_paused",
            `Run ${run.id} is ${run.status}; hard stop requires active or an already-settled paused run.`,
            "run",
            run.id,
          ),
        ];
  const cancelBlockers: Blocker[] = [
    ...(run.status === "paused" || run.status === "failed"
      ? []
      : [
          stateBlocker(
            "run_not_paused_or_failed",
            `Run ${run.id} is ${run.status}; cancellation requires paused or failed.`,
            "run",
            run.id,
          ),
        ]),
    ...(unsettledClaims > 0
      ? [
          stateBlocker(
            "unsettled_claims",
            `${unsettledClaims} worker claim(s) must settle before cancellation.`,
            "run",
            run.id,
          ),
        ]
      : []),
  ];
  const recoverableStatus = run.status === "failed" || run.status === "active" || run.status === "paused";
  const recoverBlockers: Blocker[] =
    run.status === "completed" || run.status === "cancelled"
      ? [
          stateBlocker(
            "run_terminal",
            `Run ${run.id} is terminal (${run.status}).`,
            "run",
            run.id,
            false,
          ),
        ]
      : !recoverableStatus
      ? [
          stateBlocker(
            "run_status_not_recoverable",
            `Run ${run.id} is ${run.status}; recovery requires failed, active, or paused.`,
            "run",
            run.id,
          ),
        ]
      : run.status === "failed" || leaseStaleness === "stale"
      ? []
      : leaseStaleness === "process_liveness_unknown"
      ? [
          stateBlocker(
            "process_liveness_unknown",
            "The managed process liveness could not be determined.",
            "run",
            run.id,
          ),
        ]
      : [
          stateBlocker("run_not_failed", `Run ${run.id} is not failed.`, "run", run.id),
          stateBlocker("dispatch_lease_not_stale", "The run dispatch lease is not stale.", "run", run.id),
        ];

  return {
    run: runSummaryProjection(store, gameId, run),
    availableActions: [
      runActionProjection(run, "run.start", startBlockers, "ready → active", false),
      runActionProjection(run, "run.resume", resumeBlockers, "paused → active", false),
      runActionProjection(run, "run.hard_stop", hardStopBlockers, `${run.status} → paused`, true),
      runActionProjection(run, "run.cancel", cancelBlockers, `${run.status} → cancelled`, true),
      runActionProjection(run, "run.recover", recoverBlockers, `${run.status} → paused via run.recovered`, true),
    ],
  };
}

const SYNC_ACTION_IDS: readonly SyncActionId[] = [
  "sync.start",
  "sync.resolve_conflict",
  "sync.publish",
  "sync.cancel",
  "sync.recover",
];

function latestSyncForGame(
  store: ReturnType<typeof openState>,
  gameId: string,
): SyncState | null {
  const row = store.db
    .query(
      `SELECT sync_id
       FROM sync_state
       WHERE game_id = ?
       ORDER BY latest_event_sequence DESC, created_at DESC, sync_id DESC
       LIMIT 1`,
    )
    .get(gameId) as { sync_id: string } | null;
  return row ? getSyncState(store, row.sync_id) : null;
}

function syncSummaryProjection(
  store: ReturnType<typeof openState>,
  sync: SyncState,
  cycle: CycleRecord | null,
  availableActions: ActionProjection[],
): DashboardSyncSummary {
  const knowledgeJobCounts = store.db
    .query(
      `SELECT
         COUNT(*) AS jobs_total,
         SUM(CASE WHEN events.event_type = 'knowledge.job_succeeded' THEN 1 ELSE 0 END) AS jobs_succeeded,
         SUM(CASE WHEN events.event_type IN ('knowledge.job_failed', 'knowledge.job_cancelled') THEN 1 ELSE 0 END) AS jobs_failed,
         SUM(CASE WHEN events.event_type IN ('knowledge.job_processing', 'knowledge.job_waiting') THEN 1 ELSE 0 END) AS jobs_processing,
         SUM(CASE WHEN COALESCE(
           json_extract(events.payload_json, '$.source_kind'),
           json_extract(events.payload_json, '$.provenance.source_kind')
         ) = 'merged_pr' THEN 1 ELSE 0 END) AS prs_total,
         SUM(CASE WHEN COALESCE(
           json_extract(events.payload_json, '$.source_kind'),
           json_extract(events.payload_json, '$.provenance.source_kind')
         ) = 'merged_pr' AND events.event_type = 'knowledge.job_succeeded' THEN 1 ELSE 0 END) AS prs_succeeded,
         SUM(CASE WHEN COALESCE(
           json_extract(events.payload_json, '$.source_kind'),
           json_extract(events.payload_json, '$.provenance.source_kind')
         ) = 'merged_pr' AND events.event_type IN ('knowledge.job_failed', 'knowledge.job_cancelled') THEN 1 ELSE 0 END) AS prs_failed,
         SUM(CASE WHEN COALESCE(
           json_extract(events.payload_json, '$.source_kind'),
           json_extract(events.payload_json, '$.provenance.source_kind')
         ) = 'merged_pr' AND events.event_type IN ('knowledge.job_processing', 'knowledge.job_waiting') THEN 1 ELSE 0 END) AS prs_processing,
         SUM(CASE WHEN COALESCE(
           json_extract(events.payload_json, '$.source_id'),
           json_extract(events.payload_json, '$.provenance.source_id')
         ) LIKE 'discord-%' THEN 1 ELSE 0 END) AS discord_total,
         SUM(CASE WHEN COALESCE(
           json_extract(events.payload_json, '$.source_id'),
           json_extract(events.payload_json, '$.provenance.source_id')
         ) LIKE 'discord-%' AND events.event_type = 'knowledge.job_succeeded' THEN 1 ELSE 0 END) AS discord_succeeded,
         SUM(CASE WHEN COALESCE(
           json_extract(events.payload_json, '$.source_id'),
           json_extract(events.payload_json, '$.provenance.source_id')
         ) LIKE 'discord-%' AND events.event_type IN ('knowledge.job_failed', 'knowledge.job_cancelled') THEN 1 ELSE 0 END) AS discord_failed,
         SUM(CASE WHEN COALESCE(
           json_extract(events.payload_json, '$.source_id'),
           json_extract(events.payload_json, '$.provenance.source_id')
         ) LIKE 'discord-%' AND events.event_type IN ('knowledge.job_processing', 'knowledge.job_waiting') THEN 1 ELSE 0 END) AS discord_processing
       FROM game_events AS events
       INNER JOIN (
         SELECT subject_id, MAX(sequence) AS latest_sequence
         FROM game_events
         WHERE game_id = ?
           AND correlation_id = ?
           AND event_type LIKE 'knowledge.job\\_%' ESCAPE '\\'
         GROUP BY subject_id
       ) AS latest
         ON latest.subject_id = events.subject_id
        AND latest.latest_sequence = events.sequence
       WHERE events.game_id = ?
         AND events.correlation_id = ?`,
    )
    .get(sync.game_id, sync.sync_id, sync.game_id, sync.sync_id) as {
      jobs_total: number;
      jobs_succeeded: number | null;
      jobs_failed: number | null;
      jobs_processing: number | null;
      prs_total: number | null;
      prs_succeeded: number | null;
      prs_failed: number | null;
      prs_processing: number | null;
      discord_total: number | null;
      discord_succeeded: number | null;
      discord_failed: number | null;
      discord_processing: number | null;
    };
  const discordEvents = store.db
    .query(
      `SELECT event_type, occurred_at, payload_json, sequence
       FROM game_events
       WHERE game_id = ?
         AND correlation_id = ?
         AND event_type IN (
           'sync.discord_refresh_requested',
           'sync.discord_refresh_completed'
         )
       ORDER BY sequence ASC`,
    )
    .all(sync.game_id, sync.sync_id) as Array<{
      event_type: string;
      occurred_at: string;
      payload_json: string;
      sequence: number;
    }>;
  const latestDiscordEvent = (eventType: string) => discordEvents.reduce<(typeof discordEvents)[number] | null>(
    (latest, event) => event.event_type === eventType ? event : latest,
    null,
  );
  const latestDiscordRequested = latestDiscordEvent("sync.discord_refresh_requested");
  const latestDiscordCompleted = latestDiscordEvent("sync.discord_refresh_completed");
  const completedPayload = latestDiscordCompleted ? asObject(JSON.parse(latestDiscordCompleted.payload_json)) : null;
  const refreshIsRunning = latestDiscordRequested !== null && (
    latestDiscordCompleted === null || latestDiscordRequested.sequence > latestDiscordCompleted.sequence
  );
  const discord = {
    refresh: refreshIsRunning
      ? {
          status: "running" as const,
          detail: null,
          at: latestDiscordRequested?.occurred_at ?? null,
          messages_pulled: null,
        }
      : latestDiscordCompleted && completedPayload
        ? {
            status: completedPayload.ok === true ? "ok" as const : "failed" as const,
            detail: typeof completedPayload.detail === "string" ? completedPayload.detail : null,
            at: latestDiscordCompleted.occurred_at,
            messages_pulled: typeof completedPayload.messages_pulled === "number"
              ? completedPayload.messages_pulled
              : null,
          }
        : null,
  };
  const reconciliationCounts = {
    clean: 0,
    auto_resolved: 0,
    needs_operator: 0,
  };
  for (const entry of sync.pr_reconciliation) reconciliationCounts[entry.result] += 1;
  const pushed = sync.pr_reconciliation.filter((entry) => entry.pushed).length;
  const staleBlocker = sync.blockers.find((entry) => entry.code === "upstream_moved_after_validation") ?? null;
  const cancelAction = availableActions.find((entry) => entry.action_id === "sync.cancel");
  const recoverAction = availableActions.find((entry) => entry.action_id === "sync.recover");
  const validatedUpstream = sync.staging?.validated_upstream ?? null;
  const observedUpstream = sync.staging?.observed_upstream ?? sync.intake.upstream_to;
  const stale = staleBlocker !== null || Boolean(
    validatedUpstream && observedUpstream && validatedUpstream !== observedUpstream,
  );
  const priorHead = sync.staging?.cycle_head_sha ?? cycle?.head_revision ?? sync.intake.upstream_from;
  const newHead = sync.intake.knowledge_only
    ? priorHead
    : sync.staging?.staging_head_sha ?? sync.intake.upstream_to;

  return {
    workflow_id: sync.sync_id,
    status: sync.status,
    blockers: sync.blockers,
    intake: {
      upstream_from: sync.intake.upstream_from,
      upstream_to: sync.intake.upstream_to,
      merged_pr_count: sync.intake.merged_pr_ids.length,
      corpus_batches: [...sync.intake.corpus_batch_ids],
      knowledge_only: sync.intake.knowledge_only,
    },
    knowledge_jobs: knowledgeJobCounts.jobs_total > 0
      ? {
          jobs_total: knowledgeJobCounts.jobs_total,
          jobs_succeeded: knowledgeJobCounts.jobs_succeeded ?? 0,
          jobs_failed: knowledgeJobCounts.jobs_failed ?? 0,
          jobs_processing: knowledgeJobCounts.jobs_processing ?? 0,
          prs: {
            jobs_total: knowledgeJobCounts.prs_total ?? 0,
            jobs_succeeded: knowledgeJobCounts.prs_succeeded ?? 0,
            jobs_failed: knowledgeJobCounts.prs_failed ?? 0,
            jobs_processing: knowledgeJobCounts.prs_processing ?? 0,
          },
          discord: {
            jobs_total: knowledgeJobCounts.discord_total ?? 0,
            jobs_succeeded: knowledgeJobCounts.discord_succeeded ?? 0,
            jobs_failed: knowledgeJobCounts.discord_failed ?? 0,
            jobs_processing: knowledgeJobCounts.discord_processing ?? 0,
          },
        }
      : null,
    discord,
    staging: sync.staging
      ? {
          commits_behind: sync.staging.commits_behind,
          minor_auto_resolved_count: sync.staging.minor_conflicts_resolved,
          conflicts_awaiting_operator: sync.staging.conflicts_awaiting_operator,
          conflicts: [...(sync.staging.conflicting_paths ?? [])],
        }
      : null,
    pr_reconciliation: {
      total: sync.pr_reconciliation.length,
      clean: reconciliationCounts.clean,
      auto_resolved: reconciliationCounts.auto_resolved,
      needs_operator: reconciliationCounts.needs_operator,
      pushed,
      pending_pushes: sync.pr_reconciliation.length - pushed,
    },
    publish_preview: {
      prior_head: priorHead,
      new_head: newHead,
      series_pushes: sync.pr_reconciliation.length,
    },
    publication: sync.publication
      ? {
          ...(sync.publication.remote_application_id
            ? { remote_application_id: sync.publication.remote_application_id }
            : {}),
          prior_head: sync.publication.prior_head,
          new_head: sync.publication.new_head,
          knowledge_intake: syncKnowledgeIntakeSummary(sync.publication.knowledge_intake),
        }
      : null,
    staleness: {
      stale,
      validated_upstream: validatedUpstream,
      observed_upstream: observedUpstream,
      blocker: staleBlocker,
      revalidate_action_id: stale && recoverAction?.enabled
        ? "sync.recover"
        : stale && cancelAction?.enabled ? "sync.cancel" : null,
    },
  };
}

export function gameSyncActionState(
  store: ReturnType<typeof openState>,
  gameId: string,
  cycle: CycleRecord | null = getActiveCycle(store.db, gameId),
  options: Pick<GameRunActionStateOptions, "hasActiveProcess" | "now"> = {},
): GameSyncActionState {
  const availableActions = SYNC_ACTION_IDS.map((actionId) =>
    gameSyncAction(store, gameId, actionId, undefined, {
      hasActiveProcess: options.hasActiveProcess,
      now: options.now,
      stateDir: store.stateDir,
    }) as ActionProjection,
  );
  const sync = latestSyncForGame(store, gameId);
  return {
    availableActions,
    sync: sync ? syncSummaryProjection(store, sync, cycle, availableActions) : null,
  };
}

const REPO_SYNC_GIT_MEMO_TTL_MS = 10_000;
const REPO_SYNC_GIT_MEMO_MAX_ENTRIES = 64;
const repoSyncGitMemo = new Map<
  string,
  { at: number; head: string | null; local_upstream_sha: string | null; behind_count: number | null }
>();

/**
 * Local-ref-only git observation for repo_sync.  Never fetches; any git
 * failure degrades to nulls.  Memoized so dashboard polling does not spawn a
 * git subprocess on every tick.
 */
function repoSyncGitObservation(
  repoRoot: string,
  upstreamRef: string,
  fallbackHead: string | null,
): { head: string | null; local_upstream_sha: string | null; behind_count: number | null } {
  const key = [repoRoot, upstreamRef, fallbackHead ?? ""].join("\u0000");
  const now = Date.now();
  const memo = repoSyncGitMemo.get(key);
  if (memo && now - memo.at < REPO_SYNC_GIT_MEMO_TTL_MS) return memo;
  let head: string | null = fallbackHead;
  let localUpstreamSha: string | null = null;
  let behindCount: number | null = null;
  try {
    // The checkout's HEAD is the tree operators actually run on;
    // cycles.head_revision can lag it by weeks between save points.
    const headParse = quietGit(repoRoot, ["rev-parse", "--verify", "HEAD^{commit}"]);
    head = headParse.exitCode === 0 ? headParse.stdout.trim() || fallbackHead : fallbackHead;
    const revParse = quietGit(repoRoot, ["rev-parse", "--verify", `${upstreamRef}^{commit}`]);
    localUpstreamSha = revParse.exitCode === 0 ? revParse.stdout.trim() || null : null;
    if (localUpstreamSha && head) {
      const revList = quietGit(repoRoot, ["rev-list", "--count", `${head}..${localUpstreamSha}`]);
      const parsed = Number.parseInt(revList.stdout.trim(), 10);
      behindCount = revList.exitCode === 0 && Number.isFinite(parsed) ? parsed : null;
    }
  } catch {
    head = fallbackHead;
    localUpstreamSha = null;
    behindCount = null;
  }
  if (repoSyncGitMemo.size >= REPO_SYNC_GIT_MEMO_MAX_ENTRIES) repoSyncGitMemo.clear();
  const observation = { at: now, head, local_upstream_sha: localUpstreamSha, behind_count: behindCount };
  repoSyncGitMemo.set(key, observation);
  return observation;
}

export function repoSyncProjection(
  store: ReturnType<typeof openState>,
  gameId: string,
  cycle: CycleRecord | null,
  gameContext: Pick<GameRuntimeContext, "game" | "repoRoot"> | undefined,
): DashboardRepoSyncState {
  const { branch, remote } = parseBaseRef(gameContext?.game?.baseRef ?? "origin/master");
  const upstreamRef = `${remote}/${branch}`;
  const cycleHead = cycle?.head_revision ?? null;
  let anchor: { upstream_revision: string; updated_at: string } | null = null;
  try {
    anchor = store.db
      .query("SELECT upstream_revision, updated_at FROM game_upstream_anchors WHERE game_id = ?")
      .get(gameId) as { upstream_revision: string; updated_at: string } | null;
  } catch {
    anchor = null;
  }
  const observation = gameContext?.repoRoot
    ? repoSyncGitObservation(gameContext.repoRoot, upstreamRef, cycleHead)
    : { head: cycleHead, local_upstream_sha: null, behind_count: null };
  return {
    cycle_head: observation.head,
    upstream_ref: upstreamRef,
    upstream_anchor: anchor?.upstream_revision ?? null,
    local_upstream_sha: observation.local_upstream_sha,
    behind_count: observation.behind_count,
    last_synced_at: anchor?.updated_at ?? null,
    needs_sync:
      (observation.behind_count ?? 0) > 0 ||
      (observation.head === null && observation.local_upstream_sha !== null),
  };
}

export function buildHarnessStateReadModel(
  store: ReturnType<typeof openState>,
  gameId: string,
  campaign: JsonObject,
  options: Pick<GameRunActionStateOptions, "hasActiveProcess" | "now"> = {},
): DashboardHarnessState {
  const canonical = getHarnessState(store, gameId);
  const cycle = getActiveCycle(store.db, gameId);
  const allTimeline = cycle
    ? listCycleTimeline(store.db, cycle.cycle_uuid, ALL_CYCLE_EVIDENCE_LIMIT)
    : [];
  const timeline = allTimeline.slice(0, 20);
  const savePoints = listSavePoints(store, ALL_CYCLE_EVIDENCE_LIMIT);
  const latestSavePointEntry = allTimeline.find((entry) => entry.entry_kind === "save_point");
  const latestSavePoint = savePointByEntry(savePoints, latestSavePointEntry);
  const actions = cycleActionStateInternal(store, gameId, campaign, cycle, allTimeline, savePoints);
  const runState = gameRunActionState(store, gameId, options);
  const syncState = gameSyncActionState(store, gameId, cycle, options);
  const evidence = cycleEvidenceState(store, gameId, campaign, cycle, allTimeline, savePoints);

  return {
    revision: canonical?.revision ?? 0,
    active_workflow: canonical?.active_workflow ?? null,
    queued_dispatch_requests: canonical?.queued_dispatch_requests ?? [],
    run: runState.run,
    pr: null,
    sync: syncState.sync,
    cycle: cycle
      ? {
          cycle_uuid: cycle.cycle_uuid,
          head_revision: cycle.head_revision,
          status: cycle.status,
          latest_save_point: latestSavePoint
            ? {
                id: latestSavePoint.id,
                triggerKind: latestSavePoint.triggerKind,
                label: latestSavePoint.label,
                commitSha: latestSavePoint.commitSha,
                matchedCodePercent: latestSavePoint.matchedCodePercent,
                createdAt: latestSavePoint.createdAt,
              }
            : null,
          save_point_stale: evidence.stale,
          blockers: evidence.blockers,
          timeline,
        }
      : null,
    cycle_blockers: evidence.blockers,
    save_point_stale: evidence.stale,
    latest_event_sequence: latestSequence(store.db, gameId),
    recent_events: recentGameEvents(store.db, gameId, 20),
    available_actions: [
      ...runState.availableActions,
      ...syncState.availableActions,
      ...actions.availableActions,
    ],
  };
}

const CANONICAL_ACTION_IDS = [
  "run.start", "run.resume", "run.hard_stop", "run.cancel", "run.recover",
  "sync.start", "sync.resolve_conflict", "sync.publish", "sync.cancel", "sync.recover",
  "cycle.save_point", "cycle.close", "knowledge.process",
] as const;

function workflowHeadline(lease: DispatchLease): string {
  const label = lease.kind[0]!.toUpperCase() + lease.kind.slice(1);
  return `${label} ${lease.workflow_id} is ${lease.status}.`;
}

function canonicalActiveWorkflow(lease: DispatchLease | null): HarnessStateView["active_workflow"] {
  if (!lease) return null;
  return { ...lease, headline: workflowHeadline(lease) };
}

function gameKnowledgeSummary(store: ReturnType<typeof openState>, gameId: string): HarnessStateView["knowledge"] {
  const summary = queryBackgroundKnowledgeSummary(store, gameId);
  return {
    queued: summary.queued,
    processing: summary.processing,
    waiting: summary.waiting,
    failed: summary.failed,
    oldest_pending_at: summary.oldestPendingAt,
    active_lease: summary.activeLease
      ? { id: summary.activeLease.id, expires_at: summary.activeLease.expiresAt }
      : null,
    retry: summary.retry
      ? { next_attempt_at: summary.retry.nextAttemptAt, attempts: summary.retry.attempts }
      : null,
    recent_failures: summary.recentFailures.map((failure) => ({
      job_id: failure.jobId,
      worker_state_id: failure.workerStateId,
      error: failure.error,
      attempts: failure.attempts,
      updated_at: failure.updatedAt,
    })),
  };
}

function knowledgeActionProjection(
  gameId: string,
  knowledge: HarnessStateView["knowledge"],
): ActionProjection {
  const blockers: Blocker[] = [];
  const now = Date.now();
  if (knowledge.active_lease) {
    blockers.push(stateBlocker(
      "knowledge_materializer_lease_held",
      "The knowledge materializer lease is held by another processor.",
      "knowledge",
      knowledge.active_lease.id,
    ));
  }
  if (knowledge.retry && Date.parse(knowledge.retry.next_attempt_at) > now) {
    blockers.push(stateBlocker(
      "knowledge_retry_backoff",
      `Knowledge processing is in retry backoff until ${knowledge.retry.next_attempt_at}.`,
      "game",
      gameId,
    ));
  }
  if (knowledge.queued === 0) {
    blockers.push(stateBlocker(
      "knowledge_queue_empty",
      "The background knowledge queue has no processable work.",
      "game",
      gameId,
    ));
  }
  return {
    action_id: "knowledge.process",
    subject_kind: "game",
    subject_id: gameId,
    enabled: blockers.length === 0,
    blocked_by: dedupeBlockers(blockers),
    expected_transition: "queued → processing → succeeded",
    confirmation_required: false,
  };
}

/**
 * Build the canonical operator authority view.  The older
 * buildHarnessStateReadModel remains available for legacy dashboard payloads;
 * callers of this function receive the Slice 6 DTO and never need to derive
 * action availability themselves.
 */
export function getHarnessStateView(
  store: ReturnType<typeof openState>,
  gameId: string,
  options: HarnessStateViewOptions = {},
): HarnessStateView {
  const campaign = options.campaign ?? {};
  const cycle = getActiveCycle(store.db, gameId);
  const allTimeline = cycle
    ? listCycleTimeline(store.db, cycle.cycle_uuid, ALL_CYCLE_EVIDENCE_LIMIT)
    : [];
  const savePoints = listSavePoints(store, ALL_CYCLE_EVIDENCE_LIMIT);
  const evidence = cycleEvidenceState(store, gameId, campaign, cycle, allTimeline, savePoints);
  const runState = gameRunActionState(store, gameId, options);
  const syncState = gameSyncActionState(store, gameId, cycle, options);
  const cycleState = cycleActionStateInternal(store, gameId, campaign, cycle, allTimeline, savePoints);
  const knowledge = gameKnowledgeSummary(store, gameId);
  const knowledgeAction = knowledgeActionProjection(gameId, knowledge);
  const canonical = getHarnessState(store, gameId);
  const canonicalActions = [
    ...runState.availableActions,
    ...syncState.availableActions,
    ...cycleState.availableActions,
    knowledgeAction,
  ];
  const actionsById = new Map(canonicalActions.map((action) => [action.action_id, action]));
  const availableActions = CANONICAL_ACTION_IDS.map((actionId) => actionsById.get(actionId)).filter(
    (action): action is ActionProjection => Boolean(action),
  );
  // The fixed inventory above is an invariant.  Keep a defensive projection
  // for malformed legacy state rather than silently omitting an authority.
  for (const actionId of CANONICAL_ACTION_IDS) {
    if (availableActions.some((action) => action.action_id === actionId)) continue;
    const missingKind = actionId.startsWith("run.")
      ? "run"
      : actionId.startsWith("sync.")
        ? "sync"
        : actionId.startsWith("cycle.")
          ? "cycle"
          : "game";
    const missingCode = missingKind === "game" ? "action_projection_unavailable" : `${missingKind}_not_found`;
    const missingMessage = missingKind === "game"
      ? `Action ${actionId} could not be projected.`
      : `No ${missingKind.replace("_", " ")} exists for game ${gameId}.`;
    availableActions.push({
      action_id: actionId,
      subject_kind: missingKind,
      subject_id: gameId,
      enabled: false,
      blocked_by: [stateBlocker(missingCode, missingMessage, missingKind, gameId)],
      expected_transition: "state transition unavailable",
      confirmation_required: ["run.hard_stop", "run.cancel", "run.recover", "sync.publish", "sync.cancel", "sync.recover", "cycle.close"].includes(actionId),
    });
  }
  const latestSavePoint = savePointByEntry(savePoints, allTimeline.find((entry) => entry.entry_kind === "save_point"));
  return {
    game_id: gameId,
    harness_revision: canonical?.revision ?? 0,
    cycle: cycle
      ? {
          cycle_uuid: cycle.cycle_uuid,
          head_revision: cycle.head_revision,
          status: cycle.status,
          latest_save_point: latestSavePoint
            ? {
                id: latestSavePoint.id,
                triggerKind: latestSavePoint.triggerKind,
                label: latestSavePoint.label,
                commitSha: latestSavePoint.commitSha,
                matchedCodePercent: latestSavePoint.matchedCodePercent,
                createdAt: latestSavePoint.createdAt,
              }
            : null,
          save_point_stale: evidence.stale,
          blockers: evidence.blockers,
          timeline: allTimeline.slice(0, 20),
          latest_timeline_entry: allTimeline[0] ?? null,
        }
      : null,
    active_workflow: canonicalActiveWorkflow(canonical?.active_workflow ?? null),
    queued_dispatch_requests: canonical?.queued_dispatch_requests ?? [],
    run: runState.run,
    pr_work: [],
    knowledge,
    sync: syncState.sync,
    repo_sync: repoSyncProjection(store, gameId, cycle, options.gameContext),
    active_operations: [],
    recent_events: recentGameEvents(store.db, gameId, 20),
    available_actions: availableActions,
    compatibility_actions: [],
  };
}

function percentLike(value: unknown): boolean {
  const parsed = numberValue(value, NaN);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100;
}

function attemptHasPercentScores(attempt: JsonObject): boolean {
  const oldScore = "oldScore" in attempt ? attempt.oldScore : attempt.old_score;
  const newScore = "newScore" in attempt ? attempt.newScore : attempt.new_score;
  if (!percentLike(oldScore) || !percentLike(newScore)) return false;
  const oldValue = numberValue(oldScore, NaN);
  const newValue = numberValue(newScore, NaN);
  const delta = numberValue("delta" in attempt ? attempt.delta : null, NaN);
  if (!Number.isFinite(delta) || Math.abs(delta) < 0.0005) return true;
  const scoreMovement = newValue - oldValue;
  return Math.abs(scoreMovement) < 0.0005 || Math.sign(delta) === Math.sign(scoreMovement);
}

function timeMs(value: unknown): number {
  const text = stringValue(value);
  if (!text) return 0;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function dashboardStableSignature(dashboard: JsonObject): string {
  return JSON.stringify(dashboard, (key, value) => (key === "elapsedMs" || key === "lastWorkerStateAgeMs" ? 0 : value));
}

export function dashboardTick(dashboard: JsonObject): JsonObject {
  const summary = asObject(dashboard.runSummary);
  return {
    elapsedMs: numberValue(summary.elapsedMs),
    lastWorkerStateAgeMs: summary.lastWorkerStateAgeMs ?? null,
    at: new Date().toISOString(),
  };
}

function readJsonObject(path: string): JsonObject {
  try {
    if (!path || !existsSync(path)) return {};
    return asObject(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return {};
  }
}

function jsonObjectValue(value: unknown): JsonObject {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as JsonObject;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    return asObject(JSON.parse(value));
  } catch {
    return {};
  }
}

function stringArrayValue(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map((item) => String(item)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function dashboardArtifactPayload(stateDir: string, selector: Parameters<typeof latestDashboardArtifactPayload>[1]): JsonObject {
  const store = openState(stateDir);
  try {
    return latestDashboardArtifactPayload(store, selector);
  } finally {
    store.db.close();
  }
}

function latestInitialSnapshot(stateDir: string, runId: string): JsonObject {
  return dashboardArtifactPayload(stateDir, {
    runId,
    artifactType: "board_snapshot",
    artifactKey: "initial",
  });
}

function measuresFromSnapshot(snapshot: JsonObject): JsonObject {
  return asObject(snapshot.measures);
}

function unmatchedTargetsValue(measures: JsonObject): number {
  const explicit = numberValue(measures.unmatched_targets, numberValue(measures.unmatchedTargets, NaN));
  if (Number.isFinite(explicit)) return Math.max(0, explicit);
  const totalFunctions = numberValue(measures.total_functions, numberValue(measures.totalFunctions, NaN));
  const matchedFunctions = numberValue(measures.matched_functions, numberValue(measures.matchedFunctions, NaN));
  return Number.isFinite(totalFunctions) && Number.isFinite(matchedFunctions) ? Math.max(0, totalFunctions - matchedFunctions) : NaN;
}

function compactMeasures(measures: JsonObject): JsonObject {
  return {
    fuzzy_match_percent: numberValue(measures.fuzzy_match_percent, NaN),
    matched_code_percent: numberValue(measures.matched_code_percent, NaN),
    complete_code_percent: numberValue(measures.complete_code_percent, NaN),
    matched_functions_percent: numberValue(measures.matched_functions_percent, NaN),
    complete_units: numberValue(measures.complete_units, NaN),
    total_units: numberValue(measures.total_units, NaN),
    unmatched_targets: unmatchedTargetsValue(measures),
  };
}

function summaryHasValue(summary: JsonObject): boolean {
  return Object.values(summary).some((value) => value !== null && value !== undefined && Number.isFinite(Number(value)));
}

function enrichCycleBaseline(cycle: JsonObject | null): JsonObject | null {
  if (!cycle) return cycle;
  const phases = asObject(cycle.phases);
  const preparing = asObject(phases.preparing);
  const baseline = asObject(preparing.baseline);
  if (Object.keys(baseline).length === 0 || summaryHasValue(asObject(baseline.summary))) return cycle;
  const reportRun = asObject(baseline.reportRun);
  const resetReport = asObject(baseline.resetReport);
  const summary =
    (summaryHasValue(asObject(reportRun.summary)) ? asObject(reportRun.summary) : null) ??
    (summaryHasValue(asObject(resetReport.summary)) ? asObject(resetReport.summary) : null);
  if (!summary) return cycle;
  return {
    ...cycle,
    phases: {
      ...phases,
      preparing: {
        ...preparing,
        baseline: {
          ...baseline,
          summary,
        },
      },
    },
  };
}

function activeCycleRunId(cycle: JsonObject | null): string {
  if (!cycle) return "";
  return stringValue(cycle.activeRunId, stringValue(cycle.active_run_id));
}

function activeCycleRepoRoot(cycle: JsonObject | null): string {
  if (!cycle) return "";
  const sync = asObject(asObject(asObject(cycle.phases).preparing).sync);
  const recorded = stringValue(
    sync.cycleCurrentWorktreePath,
    stringValue(sync.cycleWorktreePath),
  );
  // Recorded prepare-era worktree paths can outlive the worktree itself
  // (repo moves, retired cycles); a missing directory must not become the
  // dashboard's git cwd or every poll crashes the server on spawn ENOENT.
  return recorded && existsSync(recorded) ? recorded : "";
}

export function dashboardAuthorityRepoRoot(
  paths: Pick<DashboardGameContext, "repoRoot" | "usePathOverrides">,
  cycle: JsonObject | null,
  status: JsonObject,
): string {
  if (paths.usePathOverrides) return paths.repoRoot;
  const run = asObject(status.run);
  const recordedRunRoot = stringValue(asObject(run.game).repoRoot);
  return (
    activeCycleRepoRoot(cycle) ||
    (recordedRunRoot && existsSync(recordedRunRoot) ? recordedRunRoot : paths.repoRoot)
  );
}

function activeCycleBaseline(cycle: JsonObject | null, runId: string): JsonObject | null {
  if (!cycle || !runId || activeCycleRunId(cycle) !== runId) return null;
  const baseline = asObject(asObject(asObject(cycle.phases).preparing).baseline);
  return Object.keys(baseline).length > 0 ? baseline : null;
}

function measuresFromCycleSummary(summary: JsonObject): JsonObject {
  return {
    fuzzy_match_percent: numberValue(summary.fuzzyMatchPercent, NaN),
    matched_code_percent: numberValue(summary.matchedCodePercent, NaN),
    complete_code_percent: numberValue(summary.completeCodePercent, NaN),
    matched_functions_percent: numberValue(summary.matchedFunctionsPercent, NaN),
    complete_units: numberValue(summary.completeUnits, NaN),
    total_units: numberValue(summary.totalUnits, NaN),
    unmatched_targets: unmatchedTargetsValue(summary),
  };
}

function cycleBaselineBoard(cycle: JsonObject | null, runId: string): JsonObject | null {
  const baseline = activeCycleBaseline(cycle, runId);
  if (!baseline) return null;
  const summary = asObject(baseline.summary);
  const measures = measuresFromCycleSummary(summary);
  if (!summaryHasValue(measures)) return null;
  const reportRun = asObject(baseline.reportRun);
  const timestamps = asObject(reportRun.timestamps);
  return {
    generatedAt: stringValue(timestamps.report, stringValue(baseline.completedAt)),
    measures,
    candidates: [],
    reportPath: stringValue(reportRun.reportPath),
    source: "cycle_baseline",
  };
}

function measureDelta(initial: JsonObject, current: JsonObject, key: string): number {
  const start = numberValue(initial[key], NaN);
  const now = numberValue(current[key], NaN);
  return Number.isFinite(start) && Number.isFinite(now) ? now - start : 0;
}

function loadCurrentBoard(
  stateDir: string,
  runId: string,
  campaign?: JsonObject,
): { error?: string; generatedAt?: string; measures: JsonObject; candidates: unknown[]; reportPath?: string; source?: string; savePointSha?: string | null } {
  const current = runId
    ? dashboardArtifactPayload(stateDir, {
        runId,
        artifactType: "board_snapshot",
        artifactKey: "current",
      })
    : {};
  const currentMeasures = asObject(current.measures);
  if (summaryHasValue(currentMeasures)) {
    return {
      generatedAt: stringValue(current.generatedAt) || undefined,
      measures: compactMeasures(currentMeasures),
      candidates: asArray(current.candidates),
      reportPath: stringValue(current.reportPath),
      source: stringValue(current.source, "database"),
      savePointSha: stringValue(current.savePointSha) || null,
    };
  }

  const initial = runId
    ? dashboardArtifactPayload(stateDir, {
        runId,
        artifactType: "board_snapshot",
        artifactKey: "initial",
      })
    : {};
  const initialMeasures = asObject(initial.measures);
  if (summaryHasValue(initialMeasures)) {
    return {
      generatedAt: stringValue(initial.generatedAt) || undefined,
      measures: compactMeasures(initialMeasures),
      candidates: asArray(initial.candidates),
      reportPath: stringValue(initial.reportPath),
      source: "initial_board",
    };
  }

  const savePoint = asObject(campaign?.savePoint);
  const savePointMeasures = asObject(asObject(savePoint.payload).measures);
  if (summaryHasValue(savePointMeasures)) {
    return {
      generatedAt: stringValue(savePoint.createdAt) || undefined,
      measures: compactMeasures(savePointMeasures),
      candidates: [],
      reportPath: stringValue(savePoint.reportPath),
      source: "save_point",
      savePointSha: stringValue(savePoint.commitSha) || null,
    };
  }

  return {
    error: "No report snapshot has been recorded in the local database yet.",
    measures: {},
    candidates: [],
    source: "database",
  };
}

function sqlLimit(limit: number): string {
  const safeLimit = Math.max(0, Math.floor(limit));
  return safeLimit > 0 ? `LIMIT ${safeLimit}` : "";
}

// Runner-owned score outcome: when runner validation passed, its target block is
// the canonical evidence for result/delta/exact, regardless of what the compact
// checkpoint-note attempts[] narrative contains.
function runnerValidationTarget(runnerValidation: JsonObject): JsonObject | null {
  if (stringValue(runnerValidation.status) !== "passed") return null;
  const target = asObject(runnerValidation.target);
  return Object.keys(target).length > 0 ? target : null;
}

function runnerValidationDelta(runnerValidation: JsonObject): number | null {
  const target = runnerValidationTarget(runnerValidation);
  if (!target) return null;
  const before = numberValue(target.before, NaN);
  const after = numberValue(target.after, NaN);
  if (!Number.isFinite(before) || !Number.isFinite(after)) return null;
  return after - before;
}

function runnerAttemptsByWorkerState(stateDir: string, runId: string): Map<string, JsonObject[]> {
  const store = openState(stateDir);
  try {
    const rows = store.db
      .query(
        `
          SELECT *
          FROM worker_checkpoints
          WHERE run_id = ?
          ORDER BY worker_state_id ASC, attempt_index ASC, validation_time ASC
        `,
      )
      .all(runId) as JsonObject[];
    const byWorkerState = new Map<string, JsonObject[]>();
    for (const row of rows) {
      const workerStateId = stringValue(row.worker_state_id);
      const list = byWorkerState.get(workerStateId) ?? [];
      list.push({
        kind: "runner_validation_attempt",
        attemptIndex: numberValue(row.attempt_index, NaN),
        compiled: stringValue(row.build_status) === "compiled",
        oldScore: numberValue(row.old_score, NaN),
        newScore: numberValue(row.new_score, NaN),
        delta: numberValue(row.delta, NaN),
        status: stringValue(row.validation_status),
        artifactPath: stringValue(row.artifact_path),
        patchPath: stringValue(row.patch_path),
        exact: numberValue(row.exact_match) === 1,
        hardGatesPassed: numberValue(row.hard_gates_passed) === 1,
        selectable: numberValue(row.selectable) === 1,
        selected: numberValue(row.selected) === 1,
        source: "worker_checkpoint",
      });
      byWorkerState.set(workerStateId, list);
    }
    return byWorkerState;
  } finally {
    store.db.close();
  }
}

// Older worker-state summaries can lack checkpoint rows; synthesize the final
// runner checkpoint from the embedded runner_validation block.
function syntheticRunnerAttempts(runnerValidation: JsonObject): JsonObject[] {
  const status = stringValue(runnerValidation.status);
  if (!status || status === "skipped") return [];
  const target = asObject(runnerValidation.target);
  const before = numberValue(target.before, NaN);
  const after = numberValue(target.after, NaN);
  return [
    {
      attemptIndex: NaN,
      kind: "runner_validation_attempt",
      compiled: status !== "build_failed" && (Object.keys(target).length > 0 || numberValue(runnerValidation.exitCode, NaN) === 0),
      oldScore: before,
      newScore: after,
      delta: Number.isFinite(before) && Number.isFinite(after) ? after - before : NaN,
      status,
      artifactPath: stringValue(runnerValidation.summaryPath),
      source: "runner_validation_summary",
    },
  ];
}

function workerStateSummaryPath(row: JsonObject, summary: JsonObject): string {
  const explicit = stringValue(summary.summary_path);
  if (explicit) return explicit;
  const artifactDir = stringValue(row.artifact_dir);
  return artifactDir ? resolve(artifactDir, "state", "worker_state.json") : "";
}

function checkpointRef(row: JsonObject, prefix: "best" | "latest"): JsonObject | null {
  const id = stringValue(row[`${prefix}_checkpoint_id`]);
  if (!id) return null;
  return {
    id,
    attemptIndex: numberValue(row[`${prefix}_attempt_index`], NaN),
    validationTime: stringValue(row[`${prefix}_validation_time`]),
    oldScore: numberValue(row[`${prefix}_old_score`], NaN),
    newScore: numberValue(row[`${prefix}_new_score`], NaN),
    delta: numberValue(row[`${prefix}_delta`], NaN),
    exact: numberValue(row[`${prefix}_exact_match`]) === 1,
    hardGatesPassed: numberValue(row[`${prefix}_hard_gates_passed`]) === 1,
    selectable: numberValue(row[`${prefix}_selectable`]) === 1,
    selected: numberValue(row[`${prefix}_selected`]) === 1,
    validationStatus: stringValue(row[`${prefix}_validation_status`]),
    artifactPath: stringValue(row[`${prefix}_artifact_path`]),
    patchPath: stringValue(row[`${prefix}_patch_path`]),
    failureReasons: stringArrayValue(row[`${prefix}_failure_reasons_json`]),
    metadata: jsonObjectValue(row[`${prefix}_metadata_json`]),
  };
}

function runnerValidationFromWorkerStateRow(row: JsonObject, summary: JsonObject): JsonObject {
  for (const prefix of ["best", "latest"] as const) {
    const artifact = readJsonObject(stringValue(row[`${prefix}_artifact_path`]));
    if (stringValue(artifact.status)) return artifact;
    const metadata = jsonObjectValue(row[`${prefix}_metadata_json`]);
    const metadataValidation = asObject(metadata.runner_validation);
    if (stringValue(metadataValidation.status)) return metadataValidation;
  }
  return asObject(summary.latest_runner_validation);
}

function workerResultForState(row: JsonObject, runnerValidation: JsonObject): WorkerStateResult {
  if (numberValue(row.exact) === 1) return "exact";
  const delta = runnerValidationDelta(runnerValidation);
  if (delta !== null && delta > 0 && stringValue(row.best_checkpoint_id)) return "improved";
  return "no_progress";
}

function workerStatesForRun(stateDir: string, runId: string, limit = 100): JsonObject[] {
  const runnerAttempts = runnerAttemptsByWorkerState(stateDir, runId);
  const store = openState(stateDir);
  try {
    const rows = store.db
      .query(
        `
          SELECT
            worker_state.id AS worker_state_id,
            worker_state.run_id,
            worker_state.epoch_id,
            worker_state.epoch_target_id,
            worker_state.target_claim_id,
            worker_state.worker_id,
            worker_state.lifecycle_status,
            worker_state.write_set_json,
            worker_state.worker_session_ids_json,
            worker_state.artifact_dir,
            worker_state.worktree_path,
            worker_state.started_at,
            worker_state.ended_at,
            worker_state.baseline_score,
            worker_state.best_checkpoint_id,
            worker_state.best_score,
            worker_state.exact,
            worker_state.timeout_summary,
            worker_state.error_summary,
            worker_state.summary_json,
            epochs.ordinal AS epoch_ordinal,
            epoch_targets.unit,
            epoch_targets.symbol,
            epoch_targets.source_path,
            epoch_targets.size,
            epoch_targets.baseline_score AS fuzzy,
            epoch_targets.status AS epoch_target_status,
            best.id AS best_checkpoint_id,
            best.attempt_index AS best_attempt_index,
            best.validation_time AS best_validation_time,
            best.old_score AS best_old_score,
            best.new_score AS best_new_score,
            best.delta AS best_delta,
            best.exact_match AS best_exact_match,
            best.hard_gates_passed AS best_hard_gates_passed,
            best.selectable AS best_selectable,
            best.selected AS best_selected,
            best.validation_status AS best_validation_status,
            best.artifact_path AS best_artifact_path,
            best.patch_path AS best_patch_path,
            best.failure_reasons_json AS best_failure_reasons_json,
            best.metadata_json AS best_metadata_json,
            latest.id AS latest_checkpoint_id,
            latest.attempt_index AS latest_attempt_index,
            latest.validation_time AS latest_validation_time,
            latest.old_score AS latest_old_score,
            latest.new_score AS latest_new_score,
            latest.delta AS latest_delta,
            latest.exact_match AS latest_exact_match,
            latest.hard_gates_passed AS latest_hard_gates_passed,
            latest.selectable AS latest_selectable,
            latest.selected AS latest_selected,
            latest.validation_status AS latest_validation_status,
            latest.artifact_path AS latest_artifact_path,
            latest.patch_path AS latest_patch_path,
            latest.failure_reasons_json AS latest_failure_reasons_json,
            latest.metadata_json AS latest_metadata_json
          FROM worker_state
          LEFT JOIN epochs ON epochs.id = worker_state.epoch_id
          LEFT JOIN epoch_targets ON epoch_targets.id = worker_state.epoch_target_id
          LEFT JOIN worker_checkpoints AS best ON best.id = worker_state.best_checkpoint_id
          LEFT JOIN worker_checkpoints AS latest ON latest.id = (
            SELECT id
            FROM worker_checkpoints
            WHERE worker_checkpoints.worker_state_id = worker_state.id
            ORDER BY validation_time DESC, attempt_index DESC
            LIMIT 1
          )
          WHERE worker_state.run_id = ?
          ORDER BY COALESCE(worker_state.ended_at, latest.validation_time, worker_state.started_at) DESC
          ${sqlLimit(limit)}
        `,
      )
      .all(runId) as JsonObject[];

    return rows.map((row) => {
      const summary = jsonObjectValue(row.summary_json);
      const agentNote = asObject(summary.agent_note);
      const target = { ...row, ...asObject(summary.target), ...asObject(agentNote.target) };
      const attempts = asArray(agentNote.attempts).map(asObject);
      const writeSet = [
        ...asArray(summary.write_set).map((item) => stringValue(item)).filter(Boolean),
        ...stringArrayValue(row.write_set_json),
      ];
      if (writeSet.length === 0 && stringValue(target.source_path)) writeSet.push(stringValue(target.source_path));
      const runnerValidation = runnerValidationFromWorkerStateRow(row, summary);
      const runnerDelta = runnerValidationDelta(runnerValidation);
      const attemptScoreDelta = attempts
        .filter(attemptHasPercentScores)
        .reduce((sum, attempt) => sum + Math.max(0, numberValue(attempt.delta)), 0);
      const scoreDelta = runnerDelta !== null ? Math.max(0, runnerDelta) : attemptScoreDelta;
      const workerStateId = stringValue(row.worker_state_id);
      const workerRunnerAttempts = runnerAttempts.get(workerStateId) ?? syntheticRunnerAttempts(runnerValidation);
      const baselineScore = numberValue(row.baseline_score, numberValue(row.fuzzy, NaN));
      // Per-worker-state trace files are only read on the explicit full-details load,
      // not on the 2.5s dashboard poll.
      const activity = limit === 0 ? activeClaimActivity(stateDir, runId, workerStateId, row.started_at) : null;
      const result = workerResultForState(row, runnerValidation);
      const bestCheckpoint = checkpointRef(row, "best");
      const latestCheckpoint = checkpointRef(row, "latest");
      const validationStatus = stringValue(bestCheckpoint?.validationStatus, stringValue(latestCheckpoint?.validationStatus, stringValue(runnerValidation.status)));
      return {
        id: workerStateId,
        workerStateId,
        epochId: row.epoch_id,
        epochOrdinal: numberValue(row.epoch_ordinal, NaN),
        epochTargetId: row.epoch_target_id,
        workerCheckpointId: stringValue(row.best_checkpoint_id, stringValue(row.latest_checkpoint_id)),
        claimId: row.target_claim_id,
        targetClaimId: row.target_claim_id,
        workerId: row.worker_id,
        lifecycleStatus: row.lifecycle_status,
        timeoutSummary: stringValue(row.timeout_summary),
        errorSummary: stringValue(row.error_summary),
        validationStatus,
        result,
        stopReason: result === "exact" ? "target_complete" : "stalled",
        neededFact: null,
        createdAt: stringValue(row.ended_at, stringValue(row.started_at)),
        summary: stringValue(summary.summary, stringValue(row.timeout_summary, stringValue(row.error_summary, "No summary recorded."))),
        target: {
          unit: stringValue(target.unit),
          symbol: stringValue(target.symbol),
          sourcePath: stringValue(target.source_path),
          size: numberValue(target.size),
          fuzzy: baselineScore,
        },
        baseline: {
          kind: "worker_baseline",
          score: baselineScore,
          source: Number.isFinite(numberValue(row.baseline_score, NaN)) ? "worker_state" : "epoch_target",
        },
        writeSet: [...new Set(writeSet)],
        attempts: attempts.map((attempt) => ({
          description: stringValue(attempt.description),
          compiled: attempt.compiled === true,
          oldScore: numberValue(attempt.old_score, NaN),
          newScore: numberValue(attempt.new_score, NaN),
          delta: numberValue(attempt.delta, 0),
          artifactPath: stringValue(attempt.artifact_path),
          source: "model",
        })),
        runnerAttempts: workerRunnerAttempts,
        activity,
        scoreDelta,
        patchPath: stringValue(bestCheckpoint?.patchPath, stringValue(latestCheckpoint?.patchPath)),
        acceptanceGate: {},
        runnerValidation,
        repairAttempts: asObject(summary.continuation_attempts),
        error: asObject(summary.error),
        recovery: {
          by: stringValue(summary.recovered_by),
          reason: stringValue(summary.recovery_reason),
          requeued: summary.requeued === true,
          executionEvidence: summary.execution_evidence === true,
          epochTargetStatus: stringValue(summary.epoch_target_status),
        },
        nextRecommendation: stringValue(agentNote.next_recommendation),
        epochTargetStatus: row.epoch_target_status,
        selectedCheckpoint: bestCheckpoint,
        latestCheckpoint,
        summaryPath: workerStateSummaryPath(row, summary),
      };
    });
  } finally {
    store.db.close();
  }
}

function touchedFilesFromWorkerStates(workerStates: JsonObject[]): JsonObject[] {
  const touched = new Map<string, JsonObject>();
  for (const workerState of workerStates) {
    const outcome = workerStateOutcome(workerState);
    const result = workerStateResult(workerState);
    const timeoutEndstate =
      outcome.startsWith("timeout_") ||
      outcome === "claim_deadline" ||
      outcome === "attempt_budget_exhausted" ||
      outcome === "cold_attempt_budget_exhausted" ||
      outcome === "improvement_followup_budget_exhausted" ||
      outcome === "gate_failed_exact_followup_budget_exhausted" ||
      outcome === "accepted_or_no_repair_reasons" ||
      outcome === "dry_run";
    const files = asArray(workerState.writeSet).map((item) => stringValue(item)).filter(Boolean);
    for (const path of files) {
      const current = touched.get(path) ?? {
        path,
        workerStates: 0,
        improvedStates: 0,
        noProgressStates: 0,
        timeoutStates: 0,
        recoveredStates: 0,
        validationFailedStates: 0,
        sessionFailedStates: 0,
        toolErrorStates: 0,
        providerErrorStates: 0,
        cancelledStates: 0,
        scoreDelta: 0,
        lastAt: "",
      };
      current.workerStates = numberValue(current.workerStates) + 1;
      current.improvedStates = numberValue(current.improvedStates) + (result === "exact" || result === "improved" ? 1 : 0);
      current.noProgressStates = numberValue(current.noProgressStates) + (result === "no_progress" ? 1 : 0);
      current.timeoutStates = numberValue(current.timeoutStates) + (timeoutEndstate ? 1 : 0);
      current.recoveredStates = numberValue(current.recoveredStates) + (outcome.startsWith("recovered_") ? 1 : 0);
      current.validationFailedStates = numberValue(current.validationFailedStates) + (outcome.startsWith("validation_") ? 1 : 0);
      current.sessionFailedStates = numberValue(current.sessionFailedStates) + (outcome === "worker_session_failed" ? 1 : 0);
      current.toolErrorStates = numberValue(current.toolErrorStates) + (outcome === "agent_tool_error" || outcome === "unknown_error" ? 1 : 0);
      current.providerErrorStates = numberValue(current.providerErrorStates) + (outcome === "provider_error" ? 1 : 0);
      current.cancelledStates = numberValue(current.cancelledStates) + (outcome === "cancelled" ? 1 : 0);
      current.scoreDelta = numberValue(current.scoreDelta) + numberValue(workerState.scoreDelta);
      current.lastAt = stringValue(workerState.createdAt, stringValue(current.lastAt));
      touched.set(path, current);
    }
  }
  return [...touched.values()].sort((left, right) => stringValue(right.lastAt).localeCompare(stringValue(left.lastAt)));
}

function readJsonLines(path: string, maxLines: number): JsonObject[] {
  try {
    if (!path || !existsSync(path)) return [];
    return readFileSync(path, "utf8")
      .split("\n")
      .filter((line) => line.trim())
      .slice(-maxLines)
      .map((line) => readInlineJson(line))
      .filter((record) => Object.keys(record).length > 0);
  } catch {
    return [];
  }
}

function boundedJsonText(value: unknown, maxChars = 4000): string {
  let output = "";
  try {
    output = JSON.stringify(value);
  } catch {
    output = String(value);
  }
  if (output.length <= maxChars) return output;
  return `${output.slice(0, maxChars)}...<truncated ${output.length - maxChars} chars>`;
}

function boundedJsonValue(value: unknown, maxChars = 2000): unknown {
  if (value === undefined) return null;
  const output = boundedJsonText(value, maxChars);
  try {
    return JSON.parse(output);
  } catch {
    return output;
  }
}

function activityEventsSince(events: JsonObject[], since: unknown): JsonObject[] {
  const sinceMs = timeMs(since);
  if (!sinceMs) return events;
  return events.filter((event) => {
    const eventMs = timeMs(event.created_at);
    return eventMs > 0 && eventMs >= sinceMs;
  });
}

function compactActivityEvent(event: JsonObject): JsonObject {
  const score = asObject(event.score);
  const baseline = asObject(event.baseline);
  return {
    createdAt: stringValue(event.created_at),
    attemptIndex: numberValue(event.attempt_index, NaN),
    phase: stringValue(event.phase),
    eventType: stringValue(event.event_type),
    summary: stringValue(event.summary),
    score: Object.keys(score).length > 0 ? { before: score.before ?? null, after: score.after ?? null, exact: score.exact === true } : null,
    baseline: Object.keys(baseline).length > 0 ? { kind: "worker_baseline", status: stringValue(baseline.status), score: numberValue(baseline.score, NaN) } : null,
    artifactPath: stringValue(event.artifact_path),
    sessionId: stringValue(event.session_id),
  };
}

function compactToolEvent(event: JsonObject): JsonObject {
  const exitCode = numberValue(event.exit_code, NaN);
  return {
    createdAt: stringValue(event.created_at),
    attemptIndex: numberValue(event.attempt_index, NaN),
    tool: stringValue(event.tool),
    status: stringValue(event.status),
    exitCode: Number.isFinite(exitCode) ? exitCode : null,
    errorKind: stringValue(event.error_kind),
    errorSummary: stringValue(event.error_summary),
    durationMs: numberValue(event.duration_ms, NaN),
    params: boundedJsonValue(event.params),
    raw: boundedJsonText(event),
  };
}

// Worker states started before activity.jsonl existed still have return-gate and
// repair-request artifacts; synthesize a coarse timeline from those.
function activityFromReturnGates(workerLogDir: string): JsonObject[] {
  const validationDir = resolve(workerLogDir, "runner_validation");
  if (!existsSync(validationDir)) return [];
  let gateFiles: Array<{ index: number; path: string }> = [];
  try {
    gateFiles = readdirSync(validationDir)
      .map((file) => {
        const match = /^attempt-(\d+)\.return_gate\.json$/.exec(file);
        return match ? { index: Number(match[1]), path: resolve(validationDir, file) } : null;
      })
      .filter((entry): entry is { index: number; path: string } => entry !== null)
      .sort((left, right) => left.index - right.index);
  } catch {
    return [];
  }
  return gateFiles.slice(-4).map((entry) => {
    const gate = readJsonObject(entry.path);
    const validation = asObject(gate.runner_validation);
    const target = asObject(validation.target);
    const repairReasons = asArray(gate.repair_reasons).map((item) => stringValue(item)).filter(Boolean);
    let createdAt = "";
    try {
      createdAt = statSync(entry.path).mtime.toISOString();
    } catch {
      createdAt = "";
    }
    return {
      created_at: createdAt,
      attempt_index: numberValue(gate.attempt_index, entry.index),
      phase: repairReasons.length > 0 ? "repair_request" : "validation",
      event_type: repairReasons.length > 0 ? "runner_validation_rejected" : "runner_validation_passed",
      summary: repairReasons.length > 0 ? repairReasons.join("; ").slice(0, 400) : `runner validation ${stringValue(validation.status, "unknown")}`,
      score:
        Object.keys(target).length > 0
          ? { before: target.before ?? null, after: target.after ?? null, exact: target.exact === true }
          : undefined,
      artifact_path: entry.path,
    };
  });
}

function pathIsInside(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel === "" || (!!rel && !rel.startsWith("..") && !rel.startsWith("/") && !rel.startsWith("\\"));
}

function workerLogDirForRun(stateDir: string, runId: string, workerStateId: string): string {
  if (!runId || !workerStateId) return "";
  const runsRoot = resolve(stateDir, "runs");
  const workerStateRoot = resolve(runsRoot, runId, "worker_state");
  const workerLogDir = resolve(workerStateRoot, workerStateId);
  if (!pathIsInside(runsRoot, workerStateRoot) || !pathIsInside(workerStateRoot, workerLogDir)) return "";
  return workerLogDir;
}

function activeClaimActivity(
  stateDir: string,
  runId: string,
  workerStateId: string,
  since: unknown = "",
  options: { includeToolEvents?: boolean } = {},
): JsonObject {
  const workerLogDir = workerLogDirForRun(stateDir, runId, workerStateId);
  if (!workerLogDir) {
    return {
      source: "none",
      workerLogDir: "",
      attemptIndex: null,
      phase: "",
      lastEvent: null,
      lastTool: null,
      lastScore: null,
      lastRepairSummary: "",
      recentEvents: [],
      recentToolEvents: [],
      toolEventCount: 0,
    };
  }
  let source = "activity_log";
  let events = activityEventsSince(readJsonLines(resolve(workerLogDir, "activity.jsonl"), 60), since);
  if (events.length === 0) {
    events = activityEventsSince(activityFromReturnGates(workerLogDir), since);
    source = events.length > 0 ? "return_gates" : "none";
  }
  const includeToolEvents = options.includeToolEvents ?? true;
  const toolEvents = includeToolEvents ? activityEventsSince(readJsonLines(resolve(workerLogDir, "tool_events.jsonl"), 30), since) : [];
  const lastEvent = events.length > 0 ? events[events.length - 1] : null;
  const lastTool = toolEvents.length > 0 ? toolEvents[toolEvents.length - 1] : null;
  const lastScoreEvent = [...events].reverse().find((event) => {
    const score = asObject(event.score);
    return Number.isFinite(numberValue(score.after, NaN));
  });
  const lastRepair = [...events].reverse().find((event) => stringValue(event.event_type) === "repair_requested" || stringValue(event.event_type) === "runner_validation_rejected");
  const attemptIndex = events.reduce((max, event) => Math.max(max, numberValue(event.attempt_index, -1)), -1);
  return {
    source,
    workerLogDir,
    attemptIndex: attemptIndex >= 0 ? attemptIndex : null,
    phase: lastEvent ? stringValue(lastEvent.phase) : "",
    lastEvent: lastEvent ? compactActivityEvent(lastEvent) : null,
    lastTool: lastTool
      ? {
          createdAt: stringValue(lastTool.created_at),
          tool: stringValue(lastTool.tool),
          status: stringValue(lastTool.status),
          exitCode: lastTool.exit_code ?? null,
          errorKind: stringValue(lastTool.error_kind),
          durationMs: numberValue(lastTool.duration_ms, NaN),
        }
      : null,
    lastScore: lastScoreEvent ? asObject(lastScoreEvent.score) : null,
    lastRepairSummary: lastRepair ? stringValue(lastRepair.summary) : "",
    recentEvents: events.slice(-12).map(compactActivityEvent),
    recentToolEvents: includeToolEvents ? toolEvents.slice(-10).map(compactToolEvent) : [],
    toolEventCount: toolEvents.length,
  };
}

function workerStateTrace(stateDir: string, runId: string, workerStateId: string): JsonObject {
  if (!runId || !workerStateId) {
    return {
      runId,
      workerStateId,
      error: "Missing runId or workerStateId.",
      ...activeClaimActivity(stateDir, runId, workerStateId),
    };
  }
  const store = openState(stateDir);
  try {
    const row = store.db
      .query(
        `
          SELECT worker_state.started_at, target_claims.claimed_at
          FROM worker_state
          LEFT JOIN target_claims ON target_claims.id = worker_state.target_claim_id
          WHERE worker_state.run_id = ?
            AND worker_state.id = ?
          LIMIT 1
        `,
      )
      .get(runId, workerStateId) as JsonObject | undefined;
    if (!row) {
      return {
        runId,
        workerStateId,
        error: "Worker state was not found for this run.",
        ...activeClaimActivity(stateDir, runId, ""),
      };
    }
    return {
      runId,
      workerStateId,
      ...activeClaimActivity(stateDir, runId, workerStateId, row.claimed_at || row.started_at),
    };
  } finally {
    store.db.close();
  }
}

function boundaryStepDetail(
  stateDir: string,
  runId: string,
  query: BoundaryStepDetailQuery,
): BoundaryStepDetail | { error: string } {
  const store = openState(stateDir);
  try {
    return boundaryStepDetailForRun(store.db, stateDir, runId, query);
  } finally {
    store.db.close();
  }
}

function activeFilesForRun(stateDir: string, runId: string): JsonObject[] {
  const store = openState(stateDir);
  try {
    const rows = store.db
      .query(
        `
          SELECT
            target_claims.id AS claim_id,
            target_claims.epoch_id,
            target_claims.epoch_target_id,
            target_claims.worker_id,
            target_claims.base_rev,
            target_claims.worktree_path,
            target_claims.ttl,
            target_claims.heartbeat_at,
            target_claims.claimed_at,
            worker_state.id AS worker_state_id,
            worker_state.baseline_score AS worker_baseline_score,
            epochs.ordinal AS epoch_ordinal,
            epoch_targets.id AS target_id,
            epoch_targets.unit,
            epoch_targets.symbol,
            epoch_targets.source_path,
            epoch_targets.size,
            epoch_targets.baseline_score
          FROM target_claims
          JOIN worker_state ON worker_state.target_claim_id = target_claims.id
          LEFT JOIN epochs ON epochs.id = target_claims.epoch_id
          JOIN epoch_targets ON epoch_targets.id = target_claims.epoch_target_id
          WHERE target_claims.run_id = ?
            AND target_claims.status = 'active'
          ORDER BY target_claims.claimed_at ASC
        `,
      )
      .all(runId) as JsonObject[];
    return rows.map((row) => {
      const baselineScore = numberValue(row.worker_baseline_score, numberValue(row.baseline_score, NaN));
      return {
        claimId: row.claim_id,
        workerStateId: row.worker_state_id,
        epochId: row.epoch_id,
        epochOrdinal: numberValue(row.epoch_ordinal, NaN),
        epochTargetId: row.epoch_target_id,
        workerId: row.worker_id,
        baseRev: row.base_rev,
        worktreePath: row.worktree_path,
        ttl: row.ttl,
        heartbeatAt: row.heartbeat_at,
        claimedAt: row.claimed_at,
        activity: activeClaimActivity(stateDir, runId, stringValue(row.worker_state_id), row.claimed_at, { includeToolEvents: false }),
        targetId: row.target_id,
        unit: stringValue(row.unit),
        symbol: stringValue(row.symbol),
        sourcePath: stringValue(row.source_path),
        size: numberValue(row.size),
        fuzzy: baselineScore,
        baseline: {
          kind: "worker_baseline",
          score: baselineScore,
          source: Number.isFinite(numberValue(row.worker_baseline_score, NaN)) ? "worker_state" : "epoch_target",
        },
        matched: NaN,
        complete: NaN,
      };
    });
  } finally {
    store.db.close();
  }
}

function workerStatePositiveAttempts(workerState: JsonObject): JsonObject[] {
  return asArray(workerState.attempts)
    .map(asObject)
    .filter((attempt) => attemptHasPercentScores(attempt) && numberValue(attempt.delta) > 0);
}

function workerStateScoreDelta(workerState: JsonObject): number {
  const recorded = numberValue(workerState.scoreDelta, NaN);
  if (Number.isFinite(recorded)) return recorded;
  return workerStatePositiveAttempts(workerState).reduce((sum, attempt) => sum + Math.max(0, numberValue(attempt.delta)), 0);
}

function workerStateRunnerTarget(workerState: JsonObject): JsonObject | null {
  return runnerValidationTarget(asObject(workerState.runnerValidation));
}

function workerStateHasExactCheckpoint(workerState: JsonObject): boolean {
  const runnerTarget = workerStateRunnerTarget(workerState);
  if (runnerTarget) return runnerTarget.exact === true;
  return workerStatePositiveAttempts(workerState).some(
    (attempt) => numberValue(attempt.oldScore, NaN) < 99.99999 && numberValue(attempt.newScore, NaN) >= 99.99999,
  );
}

function workerStateValidationFailed(workerState: JsonObject): boolean {
  const validation = asObject(workerState.runnerValidation);
  const repairAttempts = asObject(workerState.repairAttempts);
  const validationStatus = stringValue(validation.status);
  const exhaustedFiniteRepairBudget = repairAttempts.exhausted === true && stringValue(repairAttempts.policy) !== "unbounded_until_claim_timeout";
  return (
    (validationStatus !== "" && validationStatus !== "passed" && validationStatus !== "skipped") ||
    exhaustedFiniteRepairBudget
  );
}

function runnerValidationRejected(workerState: JsonObject): boolean {
  const status = stringValue(asObject(workerState.runnerValidation).status);
  return status !== "" && status !== "passed" && status !== "skipped";
}

function joinedDiagnosticText(values: unknown[]): string {
  return values
    .flatMap((value) => {
      if (typeof value === "string") return [value];
      if (Array.isArray(value)) return value.map((item) => stringValue(item)).filter(Boolean);
      if (value && typeof value === "object") {
        return Object.values(value as JsonObject)
          .map((item) => (typeof item === "string" ? item : ""))
          .filter(Boolean);
      }
      return [];
    })
    .join("\n");
}

function workerStateErrorText(workerState: JsonObject): string {
  const error = asObject(workerState.error);
  const recovery = asObject(workerState.recovery);
  return joinedDiagnosticText([
    workerState.summary,
    workerState.timeoutSummary,
    workerState.errorSummary,
    error.kind,
    error.summary,
    error.reasons,
    recovery.by,
    recovery.reason,
  ]);
}

function workerStateRecovered(workerState: JsonObject): boolean {
  const recovery = asObject(workerState.recovery);
  return (
    stringValue(recovery.by) === "recover-claims" ||
    stringValue(recovery.reason) !== "" ||
    /\bRecovered interrupted active worker\b/i.test(workerStateErrorText(workerState))
  );
}

function workerStateSessionFailed(workerState: JsonObject): boolean {
  const errorKind = stringValue(asObject(workerState.error).kind);
  return errorKind === "worker_session_failed" || /\bWorker Pi session failed before producing\b/i.test(workerStateErrorText(workerState));
}

function workerStateAgentToolError(workerState: JsonObject): boolean {
  const errorKind = stringValue(asObject(workerState.error).kind);
  return errorKind === "agent_noted_tool_error" || errorKind === "agent_noted_tool_error_advisory";
}

function workerStateStopReasonCode(workerState: JsonObject): string {
  const repairAttempts = asObject(workerState.repairAttempts);
  const decision = asObject(repairAttempts.decision);
  return stringValue(repairAttempts.stop_reason) || stringValue(decision.stopReason) || stringValue(workerState.stopReason);
}

function workerStateHasSelectedCheckpoint(workerState: JsonObject): boolean {
  return Boolean(stringValue(asObject(workerState.selectedCheckpoint).id));
}

function workerStateValidationEndstate(workerState: JsonObject): WorkerStateOutcome | null {
  const validation = asObject(workerState.runnerValidation);
  const qaLintStatus = stringValue(asObject(validation.qaLint).status);
  const status = stringValue(workerState.validationStatus, stringValue(validation.status));
  const errorKind = stringValue(asObject(workerState.error).kind);
  if (errorKind === "runner_validation_qa_lint_failed" || qaLintStatus === "violations" || qaLintStatus === "warnings") return "validation_qa_lint_failed";
  if (status === "build_failed") return "validation_build_failed";
  if (status === "snapshot_unavailable") return "validation_snapshot_unavailable";
  if (status === "no_official_score_change") return "validation_no_official_score_change";
  if (status === "target_regressed") return "validation_target_regressed";
  if (status === "same_unit_regression") return "validation_same_unit_regression";
  if (status === "failed") return "validation_failed";
  if (status === "skipped") return "validation_skipped";
  if (/^runner_validation_/.test(errorKind)) return "validation_failed";
  return null;
}

function workerStateStopReasonEndstate(workerState: JsonObject): WorkerStateOutcome | null {
  const stopReason = workerStateStopReasonCode(workerState);
  if (stopReason === "accepted_exact") return "exact";
  if (stopReason === "claim_deadline") return "claim_deadline";
  if (stopReason === "attempt_budget_exhausted") return "attempt_budget_exhausted";
  if (stopReason === "cold_attempt_budget_exhausted") return "cold_attempt_budget_exhausted";
  if (stopReason === "improvement_followup_budget_exhausted") return "improvement_followup_budget_exhausted";
  if (stopReason === "improvement_banked") return "improvement_banked";
  if (stopReason === "gate_failed_exact_followup_budget_exhausted") return "gate_failed_exact_followup_budget_exhausted";
  if (stopReason === "accepted_or_no_repair_reasons") return "accepted_or_no_repair_reasons";
  if (stopReason === "dry_run") return "dry_run";
  if (stopReason === "provider_error") return "provider_error";
  if (stopReason === "worker_session_failed") return "worker_session_failed";
  return null;
}

function workerStateResult(workerState: JsonObject): WorkerStateResult {
  const runnerTarget = workerStateRunnerTarget(workerState);
  if (runnerTarget) {
    if (runnerTarget.exact === true) return "exact";
    if (runnerTarget.improved === true || numberValue(runnerValidationDelta(asObject(workerState.runnerValidation)), 0) > 0) return "improved";
    return "no_progress";
  }
  if (runnerValidationRejected(workerState)) return "no_progress";
  const explicit = stringValue(workerState.result);
  if (workerStateHasExactCheckpoint(workerState)) return "exact";
  if (explicit === "no_progress") return explicit;
  if (explicit === "exact" || explicit === "improved") return workerStateScoreDelta(workerState) > 0 ? "improved" : "no_progress";
  return workerStateScoreDelta(workerState) > 0 ? "improved" : "no_progress";
}

function workerStateStopReason(workerState: JsonObject, result = workerStateResult(workerState)): StopReason {
  const explicit = stringValue(workerState.stopReason);
  if (explicit === "target_complete" || explicit === "stalled") return explicit;
  if (explicit === "no_useful_hypothesis") return "stalled";
  if (result === "exact") return "target_complete";
  return "stalled";
}

function workerStateOutcome(workerState: JsonObject): WorkerStateOutcome {
  const lifecycle = stringValue(workerState.lifecycleStatus);
  const errorKind = stringValue(asObject(workerState.error).kind);
  if (lifecycle === "running") return "running";
  if (workerStateRecovered(workerState)) return asObject(workerState.recovery).requeued === true ? "recovered_requeued" : "recovered_finished";
  if (errorKind === "provider_error") return "provider_error";
  if (workerStateSessionFailed(workerState)) return "worker_session_failed";
  if (workerStateAgentToolError(workerState)) return "agent_tool_error";
  const stopReasonEndstate = workerStateStopReasonEndstate(workerState);
  if (stopReasonEndstate) return stopReasonEndstate;
  if (lifecycle === "exact") return "exact";
  if (lifecycle === "cancelled") return "cancelled";
  if (lifecycle === "timeout") return workerStateHasSelectedCheckpoint(workerState) ? "timeout_selected_checkpoint" : "timeout_baseline";
  const validationEndstate = workerStateValidationEndstate(workerState);
  if (validationEndstate && workerStateValidationFailed(workerState)) return validationEndstate;
  if (lifecycle === "finished") return "finished";
  if (lifecycle === "error" || Object.keys(asObject(workerState.error)).length > 0) return "unknown_error";
  return "finished";
}

function workerStateOutcomeCounts(workerStates: JsonObject[]): JsonObject {
  const counts: Record<WorkerStateOutcome | "all", number> = {
    all: workerStates.length,
    running: 0,
    exact: 0,
    timeout_selected_checkpoint: 0,
    timeout_baseline: 0,
    claim_deadline: 0,
    attempt_budget_exhausted: 0,
    cold_attempt_budget_exhausted: 0,
    improvement_followup_budget_exhausted: 0,
    improvement_banked: 0,
    gate_failed_exact_followup_budget_exhausted: 0,
    accepted_or_no_repair_reasons: 0,
    dry_run: 0,
    recovered_requeued: 0,
    recovered_finished: 0,
    provider_error: 0,
    worker_session_failed: 0,
    agent_tool_error: 0,
    validation_qa_lint_failed: 0,
    validation_build_failed: 0,
    validation_snapshot_unavailable: 0,
    validation_no_official_score_change: 0,
    validation_target_regressed: 0,
    validation_same_unit_regression: 0,
    validation_failed: 0,
    validation_skipped: 0,
    cancelled: 0,
    finished: 0,
    unknown_error: 0,
  };
  for (const workerState of workerStates) counts[workerStateOutcome(workerState)] += 1;
  return counts;
}

function improvementRowsFromWorkerStates(workerStates: JsonObject[]): JsonObject[] {
  const rows: JsonObject[] = [];
  for (const workerState of workerStates) {
    const target = asObject(workerState.target);
    const admissionBaselineScore = numberValue(target.fuzzy, NaN);
    const base = {
      workerStateId: workerState.id,
      workerCheckpointId: workerState.workerCheckpointId,
      lifecycleStatus: workerState.lifecycleStatus,
      validationStatus: workerState.validationStatus,
      createdAt: workerState.createdAt,
      workerId: workerState.workerId,
      symbol: stringValue(target.symbol),
      unit: stringValue(target.unit),
      sourcePath: stringValue(target.sourcePath, asArray(workerState.writeSet).map((item) => stringValue(item)).find(Boolean) ?? ""),
      summary: stringValue(workerState.summary),
      patchPath: stringValue(workerState.patchPath),
      baselineScore: admissionBaselineScore,
    };

    // Runner-validated progress is canonical even when the compact checkpoint
    // note attempts[] narrative has no numeric score fields.
    const runnerTarget = workerStateRunnerTarget(workerState);
    if (!runnerTarget && runnerValidationRejected(workerState)) continue;
    const runnerDelta = runnerValidationDelta(asObject(workerState.runnerValidation));
    if (runnerTarget && runnerDelta !== null && (runnerDelta > 0 || runnerTarget.exact === true)) {
      const before = numberValue(runnerTarget.before, NaN);
      const after = numberValue(runnerTarget.after, NaN);
      const staleExactBaseline =
        runnerTarget.exact === true &&
        Number.isFinite(before) &&
        Number.isFinite(after) &&
        Number.isFinite(admissionBaselineScore) &&
        before >= 99.99999 &&
        after >= 99.99999 &&
        admissionBaselineScore < 99.99999;
      const displayedBefore = staleExactBaseline ? admissionBaselineScore : before;
      const displayedDelta = staleExactBaseline ? after - admissionBaselineScore : runnerDelta;
      rows.push({
        ...base,
        totalDelta: Math.max(0, displayedDelta),
        bestDelta: Math.max(0, displayedDelta),
        oldScore: displayedBefore,
        newScore: after,
        attempts: Math.max(1, workerStatePositiveAttempts(workerState).length),
        exactMatches: runnerTarget.exact === true && displayedBefore < 99.99999 ? 1 : 0,
        source: "runner",
      });
      continue;
    }

    const attempts = workerStatePositiveAttempts(workerState);
    if (attempts.length === 0) continue;
    const bestAttempt = attempts.reduce((best, attempt) => (numberValue(attempt.delta) > numberValue(best.delta) ? attempt : best), attempts[0] ?? {});
    const oldScores = attempts.map((attempt) => numberValue(attempt.oldScore, NaN)).filter(Number.isFinite);
    const newScores = attempts.map((attempt) => numberValue(attempt.newScore, NaN)).filter(Number.isFinite);
    const totalDelta = attempts.reduce((sum, attempt) => sum + numberValue(attempt.delta), 0);
    const exactMatches = attempts.filter((attempt) => numberValue(attempt.oldScore, NaN) < 99.99999 && numberValue(attempt.newScore, NaN) >= 99.99999).length;
    rows.push({
      ...base,
      totalDelta,
      bestDelta: numberValue(bestAttempt.delta),
      oldScore: oldScores.length ? Math.min(...oldScores) : NaN,
      newScore: newScores.length ? Math.max(...newScores) : NaN,
      attempts: attempts.length,
      exactMatches,
      source: "model",
    });
  }
  return rows.sort((left, right) => stringValue(right.createdAt).localeCompare(stringValue(left.createdAt)));
}

function fileImprovementRows(improvements: JsonObject[]): JsonObject[] {
  const files = new Map<string, JsonObject>();
  for (const improvement of improvements) {
    const path = stringValue(improvement.sourcePath, "unknown");
      const current = files.get(path) ?? {
        path,
        workerStates: 0,
        symbols: new Set<string>(),
        totalDelta: 0,
      bestDelta: 0,
      bestScore: NaN,
      exactMatches: 0,
      firstAt: "",
      lastAt: "",
    };
    current.workerStates = numberValue(current.workerStates) + 1;
    current.totalDelta = numberValue(current.totalDelta) + numberValue(improvement.totalDelta);
    current.bestDelta = Math.max(numberValue(current.bestDelta), numberValue(improvement.bestDelta));
    const score = numberValue(improvement.newScore, NaN);
    current.bestScore = Number.isFinite(score) ? Math.max(numberValue(current.bestScore, -Infinity), score) : current.bestScore;
    current.exactMatches = numberValue(current.exactMatches) + numberValue(improvement.exactMatches);
    current.lastAt = stringValue(current.lastAt).localeCompare(stringValue(improvement.createdAt)) > 0 ? current.lastAt : improvement.createdAt;
    current.firstAt = stringValue(current.firstAt) && stringValue(current.firstAt).localeCompare(stringValue(improvement.createdAt)) < 0 ? current.firstAt : improvement.createdAt;
    const symbols = current.symbols instanceof Set ? current.symbols : new Set<string>();
    const symbol = stringValue(improvement.symbol);
    if (symbol) symbols.add(symbol);
    current.symbols = symbols;
    files.set(path, current);
  }
  const rows: JsonObject[] = [];
  for (const file of files.values()) {
    rows.push({
      ...file,
      symbols: [...(file.symbols instanceof Set ? file.symbols : new Set<string>())],
      bestScore: numberValue(file.bestScore, NaN),
    });
  }
  return rows.sort((left, right) => numberValue(right.totalDelta) - numberValue(left.totalDelta));
}

function runSummary(
  status: JsonObject,
  workerStates: JsonObject[],
  initialMeasures: JsonObject,
  currentMeasures: JsonObject,
  improvements: JsonObject[],
  trustedReport: JsonObject = {},
): JsonObject {
  const run = asObject(status.run);
  const createdAtMs = timeMs(run.createdAt);
  const lastWorkerStateAtMs = workerStates.reduce((latest, workerState) => Math.max(latest, timeMs(workerState.createdAt)), 0);
  const outcomeCounts = workerStateOutcomeCounts(workerStates);
  const workerResultCounts: Record<WorkerStateResult, number> = { exact: 0, improved: 0, no_progress: 0 };
  for (const workerState of workerStates) workerResultCounts[workerStateResult(workerState)] += 1;
  const positiveAttempts = improvements.reduce((sum, improvement) => sum + numberValue(improvement.attempts), 0);
  const targetExactMatches = improvements.reduce((sum, improvement) => sum + numberValue(improvement.exactMatches), 0);
  const trustedCounts = asObject(trustedReport.counts);
  const reportReady = stringValue(trustedReport.status) === "ready";
  const timeoutWorkerStates =
    numberValue(outcomeCounts.timeout_selected_checkpoint) +
    numberValue(outcomeCounts.timeout_baseline) +
    numberValue(outcomeCounts.claim_deadline) +
    numberValue(outcomeCounts.attempt_budget_exhausted) +
    numberValue(outcomeCounts.cold_attempt_budget_exhausted) +
    numberValue(outcomeCounts.improvement_followup_budget_exhausted) +
    numberValue(outcomeCounts.gate_failed_exact_followup_budget_exhausted) +
    numberValue(outcomeCounts.accepted_or_no_repair_reasons) +
    numberValue(outcomeCounts.dry_run);
  const validationFailedWorkerStates =
    numberValue(outcomeCounts.validation_qa_lint_failed) +
    numberValue(outcomeCounts.validation_build_failed) +
    numberValue(outcomeCounts.validation_snapshot_unavailable) +
    numberValue(outcomeCounts.validation_no_official_score_change) +
    numberValue(outcomeCounts.validation_target_regressed) +
    numberValue(outcomeCounts.validation_same_unit_regression) +
    numberValue(outcomeCounts.validation_failed) +
    numberValue(outcomeCounts.validation_skipped);
  return {
    createdAt: stringValue(run.createdAt),
    elapsedMs: createdAtMs ? Math.max(0, Date.now() - createdAtMs) : 0,
    lastWorkerStateAt: lastWorkerStateAtMs ? new Date(lastWorkerStateAtMs).toISOString() : null,
    lastWorkerStateAgeMs: lastWorkerStateAtMs ? Math.max(0, Date.now() - lastWorkerStateAtMs) : null,
    totalWorkerStates: workerStates.length,
    workerStateOutcomeCounts: outcomeCounts,
    improvedWorkerStates: workerResultCounts.exact + workerResultCounts.improved,
    noProgressWorkerStates: workerResultCounts.no_progress,
    timeoutWorkerStates,
    recoveredWorkerStates: numberValue(outcomeCounts.recovered_requeued) + numberValue(outcomeCounts.recovered_finished),
    validationFailedWorkerStates,
    sessionFailedWorkerStates: numberValue(outcomeCounts.worker_session_failed),
    toolErrorWorkerStates: numberValue(outcomeCounts.agent_tool_error) + numberValue(outcomeCounts.unknown_error),
    providerErrorWorkerStates: numberValue(outcomeCounts.provider_error),
    cancelledWorkerStates: numberValue(outcomeCounts.cancelled),
    positiveAttempts,
    improvedSymbols: improvements.length,
    improvedFiles: new Set(improvements.map((improvement) => stringValue(improvement.sourcePath)).filter(Boolean)).size,
    exactMatches: targetExactMatches,
    targetExactMatches,
    reportNewMatches: reportReady ? numberValue(trustedCounts.newMatches) : null,
    reportImprovements: reportReady ? numberValue(trustedCounts.improvements) : null,
    reportStatus: stringValue(trustedReport.status, "missing"),
    totalPositiveDelta: improvements.reduce((sum, improvement) => sum + numberValue(improvement.totalDelta), 0),
    matchedCodeDelta: measureDelta(initialMeasures, currentMeasures, "matched_code_percent"),
    completeCodeDelta: measureDelta(initialMeasures, currentMeasures, "complete_code_percent"),
    matchedFunctionDelta: measureDelta(initialMeasures, currentMeasures, "matched_functions_percent"),
    completeUnitDelta: measureDelta(initialMeasures, currentMeasures, "complete_units"),
  };
}

function eventsForRun(stateDir: string, runId: string, limit = 40): JsonObject[] {
  const store = openState(stateDir);
  try {
    return (
      store.db
        .query(
          `
            SELECT id, event_type, producer, handled_at, created_at, payload_json
            FROM events
            WHERE run_id = ?
            ORDER BY created_at DESC
            ${sqlLimit(limit)}
          `,
        )
        .all(runId) as JsonObject[]
    ).map((row) => {
      const payload = readInlineJson(stringValue(row.payload_json));
      const target = asObject(payload.target);
      return {
        id: row.id,
        eventType: row.event_type,
        producer: row.producer,
        handledAt: row.handled_at,
        createdAt: row.created_at,
        claimId: payload.claim_id,
        epoch: payload.epoch,
        itemId: payload.item_id,
        label: payload.label,
        message: payload.message,
        ordinal: payload.ordinal,
        phase: payload.phase,
        reason: payload.reason,
        status: payload.status,
        symbol: target.symbol,
        sourcePath: target.source_path,
        targetKey: payload.target_key,
      };
    });
  } finally {
    store.db.close();
  }
}

function countBy(rows: JsonObject[], key: string): JsonObject {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = stringValue(row[key], "unknown") || "unknown";
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort((left, right) => right[1] - left[1]));
}

function piSessionsForRun(stateDir: string, runId: string): JsonObject[] {
  const store = openState(stateDir);
  try {
    return (
      store.db
        .query(
          `
            SELECT id, target_claim_id, role, session_id, session_file, provider, model, thinking_level, status, output_path, created_at
            FROM pi_sessions
            WHERE run_id = ?
            ORDER BY created_at DESC
          `,
        )
        .all(runId) as JsonObject[]
    ).map((row) => ({
      id: row.id,
      claimId: row.target_claim_id,
      role: row.role,
      sessionId: row.session_id,
      sessionFile: row.session_file,
      provider: row.provider,
      model: row.model,
      thinkingLevel: row.thinking_level,
      status: row.status,
      outputPath: row.output_path,
      createdAt: row.created_at,
    }));
  } finally {
    store.db.close();
  }
}

function directorCyclesForRun(stateDir: string, runId: string): JsonObject[] {
  const store = openState(stateDir);
  try {
    return (
      store.db
        .query(
          `
            SELECT id, trigger_event, active_workers, summary_path, decision_path, created_at
            FROM director_cycles
            WHERE run_id = ?
            ORDER BY created_at DESC
          `,
        )
        .all(runId) as JsonObject[]
    ).map((row) => ({
      id: row.id,
      triggerEvent: row.trigger_event,
      activeWorkers: numberValue(row.active_workers),
      summaryPath: row.summary_path,
      decisionPath: row.decision_path,
      createdAt: row.created_at,
    }));
  } finally {
    store.db.close();
  }
}

function targetClaimsForRun(stateDir: string, runId: string): JsonObject[] {
  const store = openState(stateDir);
  try {
    return (
      store.db
        .query(
          `
            SELECT
              target_claims.id,
              target_claims.epoch_id,
              target_claims.epoch_target_id,
              target_claims.worker_id,
              target_claims.base_rev,
              target_claims.write_set_hash,
              target_claims.worktree_path,
              target_claims.ttl,
              target_claims.heartbeat_at,
              target_claims.status,
              target_claims.claimed_at,
              target_claims.closed_at,
              target_claims.close_reason,
              worker_state.id AS worker_state_id,
              worker_state.lifecycle_status,
              epochs.ordinal AS epoch_ordinal,
              epoch_targets.unit,
              epoch_targets.symbol,
              epoch_targets.source_path
            FROM target_claims
            JOIN worker_state ON worker_state.target_claim_id = target_claims.id
            LEFT JOIN epochs ON epochs.id = target_claims.epoch_id
            JOIN epoch_targets ON epoch_targets.id = target_claims.epoch_target_id
            WHERE target_claims.run_id = ?
            ORDER BY COALESCE(target_claims.closed_at, target_claims.heartbeat_at, target_claims.ttl) DESC
          `,
        )
        .all(runId) as JsonObject[]
    ).map((row) => ({
      id: row.id,
      claimId: row.id,
      epochId: row.epoch_id,
      epochOrdinal: numberValue(row.epoch_ordinal, NaN),
      epochTargetId: row.epoch_target_id,
      workerStateId: row.worker_state_id,
      workerId: row.worker_id,
      baseRev: row.base_rev,
      writeSetHash: row.write_set_hash,
      worktreePath: row.worktree_path,
      ttl: row.ttl,
      heartbeatAt: row.heartbeat_at,
      status: row.status,
      lifecycleStatus: row.lifecycle_status,
      claimedAt: row.claimed_at,
      closedAt: row.closed_at,
      closeReason: row.close_reason,
      unit: row.unit,
      symbol: row.symbol,
      sourcePath: row.source_path,
    }));
  } finally {
    store.db.close();
  }
}

function epochTargetsForRun(stateDir: string, runId: string): JsonObject[] {
  const store = openState(stateDir);
  try {
    return (
      store.db
        .query(
          `
            SELECT
              epoch_targets.id AS epoch_target_id,
              epoch_targets.epoch_id,
              epoch_targets.status AS epoch_target_status,
              epoch_targets.admitted_at AS admitted_at,
              epoch_targets.claimed_at AS claimed_at,
              epoch_targets.id AS target_id,
              epoch_targets.unit,
              epoch_targets.symbol,
              epoch_targets.source_path,
              epoch_targets.size,
              epoch_targets.baseline_score AS fuzzy,
              epoch_targets.status AS target_status,
              epoch_targets.admitted_at AS target_created_at,
              epochs.ordinal AS epoch_ordinal,
              epochs.status AS epoch_status
            FROM epoch_targets
            LEFT JOIN epochs ON epochs.id = epoch_targets.epoch_id
            WHERE epoch_targets.run_id = ?
            ORDER BY epoch_targets.admitted_at DESC
          `,
        )
        .all(runId) as JsonObject[]
    ).map((row) => ({
      epochTargetId: row.epoch_target_id,
      epochId: row.epoch_id,
      epochOrdinal: numberValue(row.epoch_ordinal, NaN),
      epochStatus: row.epoch_status,
      targetId: row.target_id,
      epochTargetStatus: row.epoch_target_status,
      targetStatus: row.target_status,
      admittedAt: row.admitted_at,
      claimedAt: row.claimed_at,
      unit: row.unit,
      symbol: row.symbol,
      sourcePath: row.source_path,
      size: numberValue(row.size),
      fuzzy: numberValue(row.fuzzy, NaN),
      matched: NaN,
      complete: NaN,
      risk: null,
    }));
  } finally {
    store.db.close();
  }
}

function checkpointForRun(stateDir: string, runId: string): JsonObject | null {
  const store = openState(stateDir);
  try {
    return latestCheckpointSummary(store, runId) as JsonObject | null;
  } finally {
    store.db.close();
  }
}

function handoffForRun(stateDir: string, runId: string, checkpoint: JsonObject | null): JsonObject {
  return {
    checkpoint,
    qa: latestRegressionCheckSummary(stateDir, runId),
    qaRepair: latestQaRepairSummary(stateDir, runId),
    splitPlan: latestPrSplitPlanSummary(stateDir, runId),
    baseline: dashboardArtifactPayload(stateDir, {
      runId,
      artifactType: "handoff_status",
      artifactKey: "baseline",
    }),
    ship: dashboardArtifactPayload(stateDir, {
      runId,
      artifactType: "handoff_status",
      artifactKey: "ship",
    }),
  };
}

function pushTimeline(timeline: JsonObject[], item: JsonObject): void {
  const at = stringValue(item.at);
  if (!at) return;
  timeline.push(item);
}

function runTimeline(params: {
  workerStates: JsonObject[];
  events: JsonObject[];
  sessions: JsonObject[];
  directorCycles: JsonObject[];
  targetClaims: JsonObject[];
}): JsonObject[] {
  const timeline: JsonObject[] = [];
  for (const workerState of params.workerStates) {
    const target = asObject(workerState.target);
    pushTimeline(timeline, {
      kind: "worker_state",
      at: workerState.createdAt,
      title: stringValue(target.symbol, stringValue(target.sourcePath, "worker state")),
      path: target.sourcePath,
      detail: `${stringValue(workerState.lifecycleStatus)} / ${stringValue(workerState.workerId)}`,
      delta: numberValue(workerState.scoreDelta),
      exactMatches: workerStateHasExactCheckpoint(workerState)
        ? 1
        : workerStatePositiveAttempts(workerState).filter(
            (attempt) => numberValue(attempt.oldScore, NaN) < 99.99999 && numberValue(attempt.newScore, NaN) >= 99.99999,
          ).length,
      id: workerState.id,
    });
  }
  for (const event of params.events) {
    pushTimeline(timeline, {
      kind: "event",
      at: event.createdAt,
      title: stringValue(event.eventType),
      path: event.sourcePath,
      detail: `${stringValue(event.producer)} / ${event.handledAt ? "handled" : "open"}`,
      id: event.id,
    });
  }
  for (const session of params.sessions) {
    pushTimeline(timeline, {
      kind: "pi_session",
      at: session.createdAt,
      title: `${stringValue(session.role)} session`,
      detail: `${stringValue(session.status)} / ${stringValue(session.model)}`,
      id: session.id,
    });
  }
  for (const cycle of params.directorCycles) {
    pushTimeline(timeline, {
      kind: "legacy_scheduler_cycle",
      at: cycle.createdAt,
      title: "legacy scheduler cycle",
      detail: `${stringValue(cycle.triggerEvent)} / ${numberValue(cycle.activeWorkers)} active workers`,
      id: cycle.id,
    });
  }
  for (const claim of params.targetClaims) {
    pushTimeline(timeline, {
      kind: "target_claim",
      at: claim.claimedAt || claim.heartbeatAt,
      title: stringValue(claim.symbol, stringValue(claim.sourcePath, "target claim")),
      path: claim.sourcePath,
      detail: `${stringValue(claim.status)} / ${stringValue(claim.workerId)}`,
      id: claim.id,
    });
  }
  return timeline.sort((left, right) => timeMs(right.at) - timeMs(left.at));
}

// "2026-06-10T17-00-28-350Z" (filesystem-safe artifact stamp) -> ISO string.
function artifactDirTimestamp(name: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/.exec(name);
  if (!match) return "";
  return `${match[1]}T${match[2]}:${match[3]}:${match[4]}.${match[5]}Z`;
}

function curatorAgentRuns(stateDir: string): JsonObject[] {
  const curatorRoot = resolve(stateDir, "knowledge_curator");
  if (!existsSync(curatorRoot)) return [];
  try {
    return readdirSync(curatorRoot)
      .filter((name) => {
        try {
          return statSync(resolve(curatorRoot, name)).isDirectory();
        } catch {
          return false;
        }
      })
      .sort((left, right) => right.localeCompare(left))
      .slice(0, 12)
      .map((name) => {
        const dirPath = resolve(curatorRoot, name);
        let outputPath = "";
        try {
          outputPath = readdirSync(dirPath).find((file) => file.endsWith(".txt")) ?? "";
        } catch {
          outputPath = "";
        }
        return {
          id: name,
          startedAt: artifactDirTimestamp(name),
          dir: dirPath,
          outputPath: outputPath ? resolve(dirPath, outputPath) : "",
        };
      });
  } catch {
    return [];
  }
}

function recentCuratedLessons(): JsonObject[] {
  const enrichmentPath = knowledgeCuratorEnrichmentPath();
  return readJsonLines(enrichmentPath, 500)
    .map((record) => ({
      id: stringValue(record.id),
      kind: stringValue(record.kind),
      status: stringValue(record.status),
      title: stringValue(record.title),
      sourcePath: stringValue(record.source_path),
      trustTier: stringValue(record.trust_tier),
      confidence: numberValue(record.confidence, NaN),
      createdAt: stringValue(record.created_at),
    }))
    .sort((left, right) => stringValue(right.createdAt).localeCompare(stringValue(left.createdAt)))
    .slice(0, 24);
}

function mergedPrIntakeRows(graphDbPath: string): JsonObject[] {
  if (!graphDbPath || !existsSync(graphDbPath)) return [];
  try {
    const db = new Database(graphDbPath, { readonly: true });
    try {
      return (
        db
          .query("SELECT pr, merged_at, indexed_at, touched_files_json, graph_delta_json FROM merged_pr_updates ORDER BY indexed_at DESC LIMIT 12")
          .all() as JsonObject[]
      ).map((row) => {
        let touched: unknown[] = [];
        try {
          touched = asArray(JSON.parse(stringValue(row.touched_files_json, "[]")));
        } catch {
          touched = [];
        }
        const delta = readInlineJson(stringValue(row.graph_delta_json, "{}"));
        return {
          pr: numberValue(row.pr, NaN),
          mergedAt: stringValue(row.merged_at),
          indexedAt: stringValue(row.indexed_at),
          touchedFiles: touched.length,
          graphDelta: delta,
        };
      });
    } finally {
      db.close();
    }
  } catch (error) {
    uiLog("stderr", `merged PR intake read failed: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

function knowledgeIntakeSummary(stateDir: string, graphDbPath: string): JsonObject {
  return {
    curatorRuns: curatorAgentRuns(stateDir),
    recentLessons: recentCuratedLessons(),
    mergedPrUpdates: mergedPrIntakeRows(graphDbPath),
    enrichmentPath: knowledgeCuratorEnrichmentPath(),
  };
}

function runDetails(stateDir: string, explicitRunId = "", game: ResolvedGame | null = null): JsonObject {
  const store = openState(stateDir);
  let status: JsonObject;
  let runId = explicitRunId;
  let boundary: BoundaryDashboard = { current: null, recent: [] };
  try {
    status = statusSnapshot(store);
    const run = asObject(status.run);
    if (!runId) runId = stringValue(run.id);
    if (runId) boundary = boundaryDashboardForRun(store.db, runId);
  } finally {
    store.db.close();
  }
  if (!runId) return { game: game ? gameSummary(game) : null, stateDir, status, runId: "", summary: {}, timeline: [], boundary };

  const workerStates = workerStatesForRun(stateDir, runId, 0);
  const events = eventsForRun(stateDir, runId, 0);
  const sessions = piSessionsForRun(stateDir, runId);
  const directorCycles = directorCyclesForRun(stateDir, runId);
  const targetClaims = targetClaimsForRun(stateDir, runId);
  const epochTargets = epochTargetsForRun(stateDir, runId);
  const improvements = improvementRowsFromWorkerStates(workerStates);
  const improvedFiles = fileImprovementRows(improvements);
  const timeline = runTimeline({ workerStates, events, sessions, directorCycles, targetClaims });
  const exactMatches = improvements.reduce((sum, improvement) => sum + numberValue(improvement.exactMatches), 0);

  return {
    game: game ? gameSummary(game) : null,
    stateDir,
    runId,
    generatedAt: new Date().toISOString(),
    status,
    boundary,
    summary: {
      workerStates: workerStates.length,
      workerStateOutcomeCounts: workerStateOutcomeCounts(workerStates),
      positiveAttempts: improvements.reduce((sum, improvement) => sum + numberValue(improvement.attempts), 0),
      exactMatches,
      improvedFiles: improvedFiles.length,
      improvedSymbols: improvements.length,
      totalPositiveDelta: improvements.reduce((sum, improvement) => sum + numberValue(improvement.totalDelta), 0),
      events: events.length,
      piSessions: sessions.length,
      directorCycles: directorCycles.length,
      targetClaims: targetClaims.length,
      epochTargets: epochTargets.length,
      targets: new Set(epochTargets.map((row) => stringValue(row.targetId)).filter(Boolean)).size,
    },
    workerStateOutcomes: workerStateOutcomeCounts(workerStates),
    lifecycleStatuses: countBy(workerStates, "lifecycleStatus"),
    eventTypes: countBy(events, "eventType"),
    sessionRoles: countBy(sessions, "role"),
    sessionStatuses: countBy(sessions, "status"),
    targetClaimStatuses: countBy(targetClaims, "status"),
    epochTargetStatuses: countBy(epochTargets, "epochTargetStatus"),
    timeline,
    workerStates,
    events,
    sessions,
    directorCycles,
    targetClaims,
    epochTargets,
    improvements,
    improvedFiles,
    knowledgeIntake: knowledgeIntakeSummary(stateDir, game?.graphDbPath ?? ""),
  };
}

function readInlineJson(textValue: string): JsonObject {
  try {
    return asObject(JSON.parse(textValue));
  } catch {
    return {};
  }
}

function zeroTrustedCounts(): JsonObject {
  return {
    newMatches: 0,
    brokenMatches: 0,
    improvements: 0,
    fuzzyRegressions: 0,
    metricRegressions: 0,
    metricProgressions: 0,
  };
}

function staleTrustedReport(report: JsonObject, reason: string): JsonObject {
  return {
    ...report,
    status: "stale",
    staleReason: reason,
    counts: zeroTrustedCounts(),
    newMatches: [],
    brokenMatches: [],
    improvements: [],
    fuzzyRegressions: [],
    metricRegressions: [],
    metricProgressions: [],
  };
}

function emptyTrustedReport(source = "database"): JsonObject {
  return {
    status: "missing",
    path: "",
    source,
    generatedAt: null,
    counts: zeroTrustedCounts(),
    measures: null,
    promotion: null,
    newMatches: [],
    brokenMatches: [],
    improvements: [],
    fuzzyRegressions: [],
    metricRegressions: [],
    metricProgressions: [],
  };
}

function reportEntryKey(entry: JsonObject): string {
  return [
    stringValue(entry.sourcePath),
    stringValue(entry.unitName),
    stringValue(entry.itemName),
  ].join("\u0000");
}

function mergeProgressEntry(previous: JsonObject | undefined, next: JsonObject): JsonObject {
  if (!previous) return next;
  const previousFrom = numberValue(previous.fromPercent, NaN);
  return {
    ...next,
    fromPercent: Number.isFinite(previousFrom) ? previousFrom : next.fromPercent,
    bytesDelta: numberValue(previous.bytesDelta) + numberValue(next.bytesDelta),
    size: Math.max(numberValue(previous.size), numberValue(next.size)),
  };
}

function sortedReportEntries(entries: Iterable<JsonObject>): JsonObject[] {
  return [...entries].sort((left, right) => numberValue(right.bytesDelta) - numberValue(left.bytesDelta));
}

function cumulativeTrustedReport(reports: JsonObject[]): JsonObject {
  const latest = reports[reports.length - 1] ?? emptyTrustedReport("database");
  const newMatches = new Map<string, JsonObject>();
  const improvements = new Map<string, JsonObject>();
  const brokenMatches: JsonObject[] = [];
  const fuzzyRegressions: JsonObject[] = [];

  for (const report of reports) {
    for (const rawEntry of asArray(report.brokenMatches).map(asObject)) {
      newMatches.delete(reportEntryKey(rawEntry));
      brokenMatches.push(rawEntry);
    }
    for (const rawEntry of asArray(report.fuzzyRegressions).map(asObject)) {
      const key = reportEntryKey(rawEntry);
      const previous = improvements.get(key);
      if (previous) {
        const fromPercent = numberValue(previous.fromPercent, NaN);
        const toPercent = numberValue(rawEntry.toPercent, NaN);
        if (Number.isFinite(fromPercent) && Number.isFinite(toPercent) && toPercent <= fromPercent) improvements.delete(key);
        else improvements.set(key, mergeProgressEntry(previous, rawEntry));
      }
      fuzzyRegressions.push(rawEntry);
    }
    for (const rawEntry of asArray(report.improvements).map(asObject)) {
      const key = reportEntryKey(rawEntry);
      if (!newMatches.has(key)) improvements.set(key, mergeProgressEntry(improvements.get(key), rawEntry));
    }
    for (const rawEntry of asArray(report.newMatches).map(asObject)) {
      const key = reportEntryKey(rawEntry);
      const entry = mergeProgressEntry(improvements.get(key) ?? newMatches.get(key), rawEntry);
      improvements.delete(key);
      newMatches.set(key, entry);
    }
  }

  const cumulativeNewMatches = sortedReportEntries(newMatches.values());
  const cumulativeImprovements = sortedReportEntries(improvements.values());
  const cumulativeBrokenMatches = sortedReportEntries(brokenMatches);
  const cumulativeFuzzyRegressions = sortedReportEntries(fuzzyRegressions);
  const metricRegressions = asArray(latest.metricRegressions).map(asObject);
  const metricProgressions = asArray(latest.metricProgressions).map(asObject);
  return {
    ...latest,
    source: "cumulative_trusted_reports",
    latestReport: latest,
    counts: {
      newMatches: cumulativeNewMatches.length,
      brokenMatches: cumulativeBrokenMatches.length,
      improvements: cumulativeImprovements.length,
      fuzzyRegressions: cumulativeFuzzyRegressions.length,
      metricRegressions: metricRegressions.length,
      metricProgressions: metricProgressions.length,
    },
    newMatches: cumulativeNewMatches,
    brokenMatches: cumulativeBrokenMatches,
    improvements: cumulativeImprovements,
    fuzzyRegressions: cumulativeFuzzyRegressions,
    metricRegressions,
    metricProgressions,
  };
}

function trustedReportsFromDatabase(stateDir: string, runId: string): JsonObject[] {
  const store = openState(stateDir);
  try {
    return dashboardArtifactPayloads(store, {
      runId,
      artifactType: "trusted_report",
      artifactKey: "current",
    });
  } finally {
    store.db.close();
  }
}

function trustedReportFromDatabase(stateDir: string, runId: string, runCreatedAt = ""): JsonObject {
  if (!runId) return emptyTrustedReport("database");
  const runMs = timeMs(runCreatedAt);
  const reports = trustedReportsFromDatabase(stateDir, runId).filter((report) => {
    if (stringValue(report.status) !== "ready") return false;
    const reportMs = timeMs(report.generatedAt);
    return !(reportMs > 0 && runMs > 0 && reportMs < runMs);
  });
  if (reports.length > 0) return cumulativeTrustedReport(reports);
  const latest = dashboardArtifactPayload(stateDir, {
    runId,
    artifactType: "trusted_report",
    artifactKey: "current",
  });
  return Object.keys(latest).length > 0 ? runScopedTrustedReport(latest, runCreatedAt) : emptyTrustedReport("database");
}

function runScopedTrustedReport(report: JsonObject, runCreatedAt: string, reportName = "saved report"): JsonObject {
  if (stringValue(report.status) !== "ready") return report;
  const reportMs = timeMs(report.generatedAt);
  const runMs = timeMs(runCreatedAt);
  if (reportMs > 0 && runMs > 0 && reportMs < runMs) {
    return staleTrustedReport(report, `${reportName} was generated before the current run`);
  }
  return report;
}

async function runDashboard(paths: DashboardGameContext): Promise<JsonObject> {
  const { stateDir } = paths;
  let repoRoot = paths.repoRoot;
  const store = openState(stateDir);
  let status: JsonObject;
  let runId = "";
  let runCreatedAt = "";
  let runDesiredWorkers = 0;
  let cycle: JsonObject | null = null;
  let cycleRecord: CycleRecord | null = null;
  let boundary: BoundaryDashboard = { current: null, recent: [] };
  try {
    status = statusSnapshot(store);
    const run = asObject(status.run);
    runId = stringValue(run.id);
    runCreatedAt = stringValue(run.createdAt);
    runDesiredWorkers = numberValue(run.desiredWorkers, 0);
    if (runId) boundary = boundaryDashboardForRun(store.db, runId);
    if (paths.game) {
      cycleRecord = getActiveCycle(store.db, paths.game.gameId);
      cycle = activeCycleProjection(store.db, paths.game.gameId) as unknown as JsonObject | null;
    }
    cycle = enrichCycleBaseline(cycle);
    repoRoot = dashboardAuthorityRepoRoot(paths, cycle, status);
  } finally {
    store.db.close();
  }

  const initialSnapshot = runId ? latestInitialSnapshot(stateDir, runId) : {};
  let initialMeasures = compactMeasures(measuresFromSnapshot(initialSnapshot));
  const campaign = dashboardDeps().campaignStatus(repoRoot, stateDir, paths.game?.baseRef ?? "origin/master");
  const observedUpstream = stringValue(campaign.baseSha);
  if (observedUpstream) {
    await dashboardDeps().refreshSyncUpstreamObservation?.(paths, observedUpstream);
  }
  const cycleBaseline = cycleBaselineBoard(cycle, runId);
  let currentBoard = loadCurrentBoard(stateDir, runId, campaign);
  if (!summaryHasValue(asObject(currentBoard.measures)) && cycleBaseline) {
    currentBoard = {
      ...currentBoard,
      ...cycleBaseline,
      error: currentBoard.error,
      source: "cycle_baseline",
    } as typeof currentBoard;
  }
  // With no run baseline, "start" is the campaign anchor: the last save point.
  // A future run measures forward from here, and until then the metric table
  // shows drift since the anchor instead of n/a.
  let initialSource: string | null = runId ? "run" : null;
  let initialGeneratedAt: unknown = initialSnapshot.generatedAt ?? null;
  if (cycleBaseline) {
    initialMeasures = asObject(cycleBaseline.measures);
    initialSource = "cycle_baseline";
    initialGeneratedAt = cycleBaseline.generatedAt ?? null;
  }
  if (!Object.values(initialMeasures).some((value) => Number.isFinite(Number(value)))) {
    const savePoint = asObject(campaign.savePoint);
    const savePointMeasures = asObject(asObject(savePoint.payload).measures);
    if (Object.keys(savePointMeasures).length > 0) {
      initialMeasures = compactMeasures(savePointMeasures);
      initialSource = "save_point";
      initialGeneratedAt = savePoint.createdAt ?? null;
    }
  }
  const workerStates = runId ? workerStatesForRun(stateDir, runId, 100) : [];
  const allWorkerStates = runId ? workerStatesForRun(stateDir, runId, 0) : [];
  const progressWorkerStates = workerStates.filter((workerState) => {
    const result = workerStateResult(workerState);
    return result === "exact" || result === "improved";
  });
  const improvements = improvementRowsFromWorkerStates(allWorkerStates);
  const improvedFiles = fileImprovementRows(improvements);
  const epochTargets = runId ? epochTargetsForRun(stateDir, runId) : [];
  const trustedReport = trustedReportFromDatabase(stateDir, runId, runCreatedAt);
  const checkpoint = runId ? checkpointForRun(stateDir, runId) : null;
  const handoff = runId ? handoffForRun(stateDir, runId, checkpoint) : { checkpoint: null, qa: null, splitPlan: null };
  const epochs = runningEpochHistory(stateDir);
  const gameId = paths.game?.gameId ?? stringValue(cycle?.gameId);
  let harnessState: HarnessStateView | null = null;
  let scoreTiers: DashboardScoreTiers = {
    baseline: { score: null, measures: {}, anchorRevision: null, savePointId: null },
    confirmed: {
      score: null, measures: {}, delta: null, savePointId: null, anchorRevision: null,
      comparisonStatus: "baseline_unavailable", matches: [], improvements: [], breakages: [],
    },
    tentative: { matches: [], improvements: [] },
    timeline: [],
  };
  if (gameId) {
    const harnessStateStore = openState(stateDir);
    try {
      scoreTiers = await scoreTiersProjection(harnessStateStore, gameId, cycleRecord, repoRoot);
      harnessState = getHarnessStateView(harnessStateStore, gameId, {
        campaign,
        // The authority root (cycle worktree when present) is the tree whose
        // head answers "are we behind upstream"; the raw checkout can lag it.
        gameContext: { game: paths.game, repoRoot: repoRoot || paths.repoRoot },
        hasActiveProcess: dashboardDeps().hasActiveProcess,
      });
    } finally {
      harnessStateStore.db.close();
    }
  }
  if (cycle && harnessState?.cycle) {
    cycle = {
      ...cycle,
      blockers: harnessState.cycle.blockers,
      savePointStale: harnessState.cycle.save_point_stale,
    };
  }
  return {
    game: paths.game ? gameSummary(paths.game) : null,
    cycle,
    harnessState,
    gameWarnings: paths.game?.warnings ?? [],
    repoRoot,
    configuredRepoRoot: paths.repoRoot,
    stateDir,
    graphDbPath: paths.graphDbPath,
    usePathOverrides: paths.usePathOverrides,
    status,
    boundary,
    initial: {
      generatedAt: initialGeneratedAt,
      measures: initialMeasures,
      source: initialSource,
    },
    current: currentBoard,
    scoreTiers,
    trustedReport,
    checkpoint,
    handoff,
    runSummary: runSummary(status, allWorkerStates, initialMeasures, currentBoard.measures, improvements, trustedReport as unknown as JsonObject),
    improvements,
    improvedFiles,
    activeFiles: runId ? activeFilesForRun(stateDir, runId) : [],
    epochTargets,
    workerStates,
    progressWorkerStates,
    touchedFiles: touchedFilesFromWorkerStates(allWorkerStates),
    events: runId ? eventsForRun(stateDir, runId, 40) : [],
    process: dashboardDeps().processStatus(stateDir, paths.game),
    campaign,
    epochs,
    checkpointProgress: runId
      ? runningEpochCheckpointProgress({
          stateDir,
          runId,
          epochs,
          workerStates: allWorkerStates,
          runCreatedAt,
          desiredWorkers: runDesiredWorkers,
        })
      : null,
    prs: dashboardDeps().buildPrRecordsView(stateDir, runId),
  };
}
