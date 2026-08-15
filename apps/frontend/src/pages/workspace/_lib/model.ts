import { asArray, asObject, numberValue, shortId, text, type Dashboard, type FormState, type JsonObject, type UiConfig } from "@/lib/format";
import { processView } from "@/lib/processView";
import type {
  PrFlowRecord,
  HarnessStateActionProjection,
  HarnessStateBlocker,
  HarnessStatePrSeriesStatus,
  HarnessStatePrSeriesSummary,
  HarnessStatePrWorkItem,
  HarnessStatePrReadModel,
  HarnessStateReadModel,
  HarnessStateRunRecoveryPoint,
  HarnessStateRunSchedulerCondition,
  HarnessStateRunStatus,
  HarnessStateSyncStatus,
  CycleView,
} from "./types";

function isLocalBranchPrRecord(record: PrFlowRecord): boolean {
  return record.sourceDetail === "local_branch_discovery" || /^codex\/split-\d{2}-/.test(record.branch);
}

export function isDraftBatchCandidate(record: PrFlowRecord): boolean {
  return record.status === "planned" && Boolean(record.branch) && (record.localStatus === "ready" || (record.localStatus === "local_only" && isLocalBranchPrRecord(record)));
}

export function processName(value: unknown): string {
  const raw = text(value, "melee-live").trim() || "melee-live";
  return raw.replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "melee-live";
}

export function schedulingForWorkers(
  workers: number,
): Pick<
  FormState,
  | "maxWorkers"
> {
  const maxWorkers = Math.max(1, Math.trunc(workers));
  return {
    maxWorkers,
  };
}

export const workerCountOptions = [1, 2, 4, 8, 12, 16, 20, 32, 64] as const;

export const epochSizeOptions = [4, 8, 16, 32, 64, 128, 256, 512, 1024, { label: "Full board", value: "full" }] as const;

export const candidateWindowOptions = [32, 64, 128, 256, 512, 1024] as const;

export const candidateRerankOptions = [
  { label: "Priority", value: "priority" },
  { label: "OPSEC hot lane", value: "opseq_hot_lane" },
  { label: "Model: win 95% capture", value: "model_win_95" },
  { label: "Model: win 90% capture", value: "model_win_90" },
  { label: "Model: match focus (top 30%)", value: "model_match_focus" },
] as const;

export const resolverConcurrencyOptions = [1, 2, 4, 8] as const;

export const candidateWindowTooltip =
  "How many top-ranked board candidates the scheduler rechecks when building an epoch. Keep it at or above the epoch size; larger windows let the OPSEC/opseq rerank pull likely matches into smaller batches after each rebuild.";

export const candidateRerankTooltip = "Priority uses the normal board score. OPSEC hot lane adds a matched-opseq analog bonus so likely exact matches can rise from deeper in the candidate window. Model modes rank candidates with the trained admission predictor (p_win or p_match) and, on full-board epochs, cap admission to the top slice of the candidate window.";

export const resolverConcurrencyTooltip =
  "How many integration resolver agents may run at once. Same-file conflicts stay serialized; different-file conflicts can resolve in parallel.";

export function statusClass(value: unknown): string {
  const status = text(value);
  if (status === "passed" || status === "pr_ready" || status === "passing" || status === "merged" || status === "ready") return "text-up";
  if (status === "failed" || status === "blocked" || status === "qa_repair_blocked" || status === "failing" || status === "changes_requested" || status === "dirty") return "text-down";
  if (status === "local_only" || status === "remote_only" || status === "published" || status === "open" || status === "draft" || status === "pending" || status === "planned_mock" || status === "warning" || status === "not_prepared" || status === "preparing" || status === "repairing" || status === "branch_pushed") return "text-warn";
  return "text-dim";
}

export function prettyStatus(value: unknown, fallback = "-"): string {
  const raw = text(value, fallback);
  return raw.replace(/_/g, " ");
}

export function compactFilePath(path: string): string {
  return path.replace(/^src\/melee\//, "").replace(/^src\//, "");
}

export function fileCountLabel(count: number): string {
  return count === 1 ? "1 file" : `${count.toLocaleString()} files`;
}

export function hasKeys(value: JsonObject): boolean {
  return Object.keys(value).length > 0;
}

function booleanValue(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (/^(1|true|yes)$/i.test(value)) return true;
    if (/^(0|false|no)$/i.test(value)) return false;
  }
  return fallback;
}

function nullableNumber(value: unknown): number | null {
  const parsed = numberValue(value, NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

function harnessStateBlocker(value: unknown): HarnessStateBlocker {
  const blocker = asObject(value);
  return {
    code: text(blocker.code),
    message: text(blocker.message),
    source_kind: text(blocker.source_kind),
    source_id: text(blocker.source_id),
    recoverable: booleanValue(blocker.recoverable),
  };
}

function harnessStateActionProjection(value: unknown): HarnessStateActionProjection {
  const action = asObject(value);
  return {
    action_id: text(action.action_id),
    subject_kind: text(action.subject_kind),
    subject_id: text(action.subject_id),
    enabled: booleanValue(action.enabled),
    blocked_by: asArray(action.blocked_by).map(harnessStateBlocker),
    expected_transition: text(action.expected_transition),
    confirmation_required: booleanValue(action.confirmation_required),
  };
}

const HARNESS_STATE_PR_SERIES_STATUSES = [
  "prepared",
  "published",
  "changes_requested",
  "revising",
  "approved",
  "merged",
  "closed",
] as const satisfies readonly HarnessStatePrSeriesStatus[];

function harnessStatePrWorkItem(value: unknown, seriesBranch = ""): HarnessStatePrWorkItem {
  const item = asObject(value);
  return {
    item_id: text(item.item_id),
    series_id: text(item.series_id),
    series_branch: text(item.series_branch, seriesBranch),
    source_kind: text(item.source_kind),
    source_id: text(item.source_id),
    status: text(item.status) as HarnessStatePrWorkItem["status"],
    summary: text(item.summary),
    created_at: text(item.created_at),
    resolved_at: text(item.resolved_at) || null,
  };
}

function harnessStatePrSeries(value: unknown): HarnessStatePrSeriesSummary {
  const series = asObject(value);
  const branch = text(series.branch);
  const lastValidation = asObject(series.last_validation);
  return {
    series_id: text(series.series_id),
    batch_index: numberValue(series.batch_index),
    status: text(series.status) as HarnessStatePrSeriesStatus,
    branch,
    upstream_pr_number: nullableNumber(series.upstream_pr_number),
    target_units: asArray(series.target_units).map((unit) => text(unit)).filter(Boolean),
    last_validation: Object.keys(lastValidation).length > 0 ? lastValidation : null,
    blockers: asArray(series.blockers).map(harnessStateBlocker),
    work_items: asArray(series.work_items).map((item) => harnessStatePrWorkItem(item, branch)),
  };
}

export function harnessStateReadModel(dashboard: Dashboard | null): HarnessStateReadModel | null {
  const raw = asObject(dashboard?.harnessState);
  if (Object.keys(raw).length === 0) return null;

  const activeWorkflowRaw = asObject(raw.active_workflow);
  const requestedHandoffRaw = asObject(activeWorkflowRaw.requested_handoff);
  const cycleRaw = asObject(raw.cycle);
  const runRaw = asObject(raw.run);
  const syncRaw = asObject(raw.sync);
  const knowledgeRaw = asObject(raw.knowledge);
  const activeEpochRaw = asObject(runRaw.active_epoch);
  const progressRaw = asObject(runRaw.progress);
  const syncIntakeRaw = asObject(syncRaw.intake);
  const syncStagingRaw = asObject(syncRaw.staging);
  const syncPrRaw = asObject(syncRaw.pr_reconciliation);
  const syncPublishPreviewRaw = asObject(syncRaw.publish_preview);
  const syncPublicationRaw = asObject(syncRaw.publication);
  const syncStalenessRaw = asObject(syncRaw.staleness);
  const syncStalenessBlockerRaw = asObject(syncStalenessRaw.blocker);
  const latestSavePointRaw = asObject(cycleRaw.latest_save_point);
  const activeWorkflow = Object.keys(activeWorkflowRaw).length > 0
    ? {
        kind: text(activeWorkflowRaw.kind) as "run" | "pr" | "sync",
        workflow_id: text(activeWorkflowRaw.workflow_id),
        lease_id: text(activeWorkflowRaw.lease_id),
        status: text(activeWorkflowRaw.status) as "acquiring" | "active" | "draining" | "blocked" | "releasing",
        headline: text(activeWorkflowRaw.headline),
        acquired_at: text(activeWorkflowRaw.acquired_at),
        heartbeat_at: text(activeWorkflowRaw.heartbeat_at),
        ...(Object.keys(requestedHandoffRaw).length > 0
          ? {
              requested_handoff: {
                target_kind: text(requestedHandoffRaw.target_kind) as "run" | "pr" | "sync",
                target_workflow_id: text(requestedHandoffRaw.target_workflow_id),
                reason: text(requestedHandoffRaw.reason),
                requested_at: text(requestedHandoffRaw.requested_at),
              },
            }
          : {}),
        blockers: asArray(activeWorkflowRaw.blockers).map(harnessStateBlocker),
      }
    : null;

  const cycle = Object.keys(cycleRaw).length > 0
    ? {
        cycle_uuid: text(cycleRaw.cycle_uuid),
        head_revision: text(cycleRaw.head_revision) || null,
        status: text(cycleRaw.status),
        latest_save_point: Object.keys(latestSavePointRaw).length > 0
          ? {
              id: text(latestSavePointRaw.id),
              triggerKind: text(latestSavePointRaw.triggerKind),
              label: text(latestSavePointRaw.label) || null,
              commitSha: text(latestSavePointRaw.commitSha) || null,
              matchedCodePercent: Number.isFinite(numberValue(latestSavePointRaw.matchedCodePercent, NaN))
                ? numberValue(latestSavePointRaw.matchedCodePercent)
                : null,
              createdAt: text(latestSavePointRaw.createdAt),
            }
          : null,
        save_point_stale: booleanValue(cycleRaw.save_point_stale),
        timeline: asArray(cycleRaw.timeline).map((value) => {
          const entry = asObject(value);
          return {
            id: numberValue(entry.id),
            cycle_uuid: text(entry.cycle_uuid),
            entry_kind: text(entry.entry_kind) as "epoch_completed" | "remote_application" | "pr_phase" | "save_point",
            entry_id: text(entry.entry_id),
            occurred_at: text(entry.occurred_at),
            payload: asObject(entry.payload),
            caused_by_event_id: text(entry.caused_by_event_id) || null,
          };
        }),
      }
    : null;

  const run = Object.keys(runRaw).length > 0
    ? {
        workflow_id: text(runRaw.workflow_id),
        status: text(runRaw.status) as HarnessStateRunStatus,
        scheduler_condition: (text(runRaw.scheduler_condition) || null) as HarnessStateRunSchedulerCondition | null,
        active_epoch: Object.keys(activeEpochRaw).length > 0
          ? {
              epoch_id: text(activeEpochRaw.epoch_id),
              ordinal: numberValue(activeEpochRaw.ordinal),
            }
          : null,
        admitted: numberValue(runRaw.admitted),
        claimed: numberValue(runRaw.claimed),
        running: numberValue(runRaw.running),
        progress: {
          baseline_score: nullableNumber(progressRaw.baseline_score),
          confirmed_score: nullableNumber(progressRaw.confirmed_score),
          tentative_changes: numberValue(progressRaw.tentative_changes),
          confirmed_changes: numberValue(progressRaw.confirmed_changes),
          regressed_changes: numberValue(progressRaw.regressed_changes),
        },
        recovery_points: asArray(runRaw.recovery_points).map((value): HarnessStateRunRecoveryPoint => {
          const point = asObject(value);
          return {
            event_id: text(point.event_id),
            sequence: numberValue(point.sequence),
            occurred_at: text(point.occurred_at),
            recovery_reason: text(point.recovery_reason) || null,
            cancelled_claim_ids: asArray(point.cancelled_claim_ids).map((id) => text(id)).filter(Boolean),
            cancelled_operation_ids: asArray(point.cancelled_operation_ids).map((id) => text(id)).filter(Boolean),
            resulting_status: (text(point.resulting_status) || null) as HarnessStateRunStatus | null,
          };
        }),
      }
    : null;

  const parsePr = (prRaw: JsonObject): HarnessStatePrReadModel => {
    const prSourceAnchorRaw = asObject(prRaw.source_anchor);
    const prPublicationPolicyRaw = asObject(prRaw.publication_policy);
    const prSeriesByStatusRaw = asObject(prRaw.series_by_status);
    const prNextBatchRaw = asObject(prRaw.next_batch);
    const prPendingWorkItemsRaw = asObject(prRaw.pending_work_items);
    const prActivationRaw = asObject(prRaw.activation);
    return {
        workflow_id: text(prRaw.workflow_id),
        status: text(prRaw.status) as HarnessStatePrReadModel["status"],
        source_anchor: {
          save_point_id: text(prSourceAnchorRaw.save_point_id),
          source_revision: text(prSourceAnchorRaw.source_revision),
        },
        publication_policy: {
          batch_size: numberValue(prPublicationPolicyRaw.batch_size),
        },
        blockers: asArray(prRaw.blockers).map(harnessStateBlocker),
        series: asArray(prRaw.series).map(harnessStatePrSeries),
        series_by_status: Object.fromEntries(
          HARNESS_STATE_PR_SERIES_STATUSES.map((status) => [
            status,
            asArray(prSeriesByStatusRaw[status]).map(harnessStatePrSeries),
          ]),
        ) as HarnessStatePrReadModel["series_by_status"],
        next_batch: Object.keys(prNextBatchRaw).length > 0
          ? {
              batch_index: numberValue(prNextBatchRaw.batch_index),
              series_ids: asArray(prNextBatchRaw.series_ids).map((id) => text(id)).filter(Boolean),
              validation_state: text(prNextBatchRaw.validation_state),
              blockers: asArray(prNextBatchRaw.blockers).map(harnessStateBlocker),
              series: asArray(prNextBatchRaw.series).map(harnessStatePrSeries),
            }
          : null,
        pending_work_items: {
          count: numberValue(prPendingWorkItemsRaw.count),
          items: asArray(prPendingWorkItemsRaw.items).map((item) => harnessStatePrWorkItem(item)),
        },
        activation: {
          active: booleanValue(prActivationRaw.active),
          queued: booleanValue(prActivationRaw.queued),
          lease_id: text(prActivationRaw.lease_id) || null,
          status: text(prActivationRaw.status) || null,
          blockers: asArray(prActivationRaw.blockers).map(harnessStateBlocker),
        },
      };
  };

  const sync = Object.keys(syncRaw).length > 0
    ? {
        workflow_id: text(syncRaw.workflow_id),
        status: text(syncRaw.status) as HarnessStateSyncStatus,
        blockers: asArray(syncRaw.blockers).map(harnessStateBlocker),
        intake: {
          upstream_from: text(syncIntakeRaw.upstream_from),
          upstream_to: text(syncIntakeRaw.upstream_to),
          merged_pr_count: numberValue(syncIntakeRaw.merged_pr_count),
          corpus_batches: asArray(syncIntakeRaw.corpus_batches).map((id) => text(id)).filter(Boolean),
          knowledge_only: booleanValue(syncIntakeRaw.knowledge_only),
        },
        staging: Object.keys(syncStagingRaw).length > 0
          ? {
              epochs_applied: numberValue(syncStagingRaw.epochs_applied),
              epochs_total: numberValue(syncStagingRaw.epochs_total),
              minor_auto_resolved_count: numberValue(syncStagingRaw.minor_auto_resolved_count),
              conflicts_awaiting_operator: numberValue(syncStagingRaw.conflicts_awaiting_operator),
              conflicts: asArray(syncStagingRaw.conflicts).map((path) => text(path)).filter(Boolean),
            }
          : null,
        pr_reconciliation: {
          total: numberValue(syncPrRaw.total),
          clean: numberValue(syncPrRaw.clean),
          auto_resolved: numberValue(syncPrRaw.auto_resolved),
          needs_operator: numberValue(syncPrRaw.needs_operator),
          pushed: numberValue(syncPrRaw.pushed),
          pending_pushes: numberValue(syncPrRaw.pending_pushes),
        },
        publish_preview: {
          prior_head: text(syncPublishPreviewRaw.prior_head),
          new_head: text(syncPublishPreviewRaw.new_head),
          series_pushes: numberValue(syncPublishPreviewRaw.series_pushes),
        },
        publication: Object.keys(syncPublicationRaw).length > 0
          ? {
              ...(text(syncPublicationRaw.remote_application_id)
                ? { remote_application_id: text(syncPublicationRaw.remote_application_id) }
                : {}),
              prior_head: text(syncPublicationRaw.prior_head),
              new_head: text(syncPublicationRaw.new_head),
              knowledge_revision: text(syncPublicationRaw.knowledge_revision),
              invalidated_ids: asArray(syncPublicationRaw.invalidated_ids).map((id) => text(id)).filter(Boolean),
            }
          : null,
        staleness: {
          stale: booleanValue(syncStalenessRaw.stale),
          validated_upstream: text(syncStalenessRaw.validated_upstream) || null,
          observed_upstream: text(syncStalenessRaw.observed_upstream) || null,
          blocker: Object.keys(syncStalenessBlockerRaw).length > 0
            ? harnessStateBlocker(syncStalenessBlockerRaw)
            : null,
          revalidate_action_id: text(syncStalenessRaw.revalidate_action_id) === "sync.cancel"
            ? "sync.cancel" as const
            : null,
        },
      }
    : null;

  const parsePreservedSummary = (value: unknown): JsonObject => ({ ...asObject(value) });
  const knowledgeLeaseRaw = asObject(knowledgeRaw.active_lease);

  return {
    game_id: text(raw.game_id),
    harness_revision: numberValue(raw.harness_revision),
    active_workflow: activeWorkflow,
    queued_dispatch_requests: asArray(raw.queued_dispatch_requests).map((value) => {
      const request = asObject(value);
      return {
        kind: text(request.kind) as "run" | "pr" | "sync",
        workflow_id: text(request.workflow_id),
        reason: text(request.reason),
        requested_at: text(request.requested_at),
        requested_by: text(request.requested_by),
      };
    }),
    cycle,
    run,
    pr_work: asArray(raw.pr_work).map((value) => parsePr(asObject(value))),
    knowledge: {
      ...knowledgeRaw,
      published_revision: text(knowledgeRaw.published_revision) || null,
      queued: numberValue(knowledgeRaw.queued),
      processing: numberValue(knowledgeRaw.processing),
      waiting: numberValue(knowledgeRaw.waiting),
      failed: numberValue(knowledgeRaw.failed),
      oldest_pending_at: text(knowledgeRaw.oldest_pending_at) || null,
      active_lease: Object.keys(knowledgeLeaseRaw).length > 0
        ? {
            ...knowledgeLeaseRaw,
            id: text(knowledgeLeaseRaw.id),
            expires_at: text(knowledgeLeaseRaw.expires_at),
          }
        : null,
      retry: Object.keys(asObject(knowledgeRaw.retry)).length > 0
        ? parsePreservedSummary(knowledgeRaw.retry)
        : null,
      recent_failures: asArray(knowledgeRaw.recent_failures).map((value) => {
        const failure = asObject(value);
        return {
          ...failure,
          job_id: text(failure.job_id),
          worker_state_id: text(failure.worker_state_id),
          error: text(failure.error),
          attempts: numberValue(failure.attempts),
          updated_at: text(failure.updated_at),
        };
      }),
    },
    sync,
    active_operations: asArray(raw.active_operations).map((value) => {
      const operation = asObject(value);
      return { ...operation, operation_id: text(operation.operation_id), status: text(operation.status) };
    }),
    recent_events: asArray(raw.recent_events).map((value) => {
      const event = asObject(value);
      return { ...event, event_type: text(event.event_type), sequence: numberValue(event.sequence) };
    }),
    available_actions: asArray(raw.available_actions).map(harnessStateActionProjection),
    compatibility_actions: asArray(raw.compatibility_actions).map(harnessStateActionProjection),
  };
}

export function harnessStateAction(
  harnessState: HarnessStateReadModel | null,
  actionId: string,
): HarnessStateActionProjection | null {
  return harnessState?.available_actions.find((action) => action.action_id === actionId) ?? null;
}

export function harnessStateCompatibilityAction(
  harnessState: HarnessStateReadModel | null,
  actionId: string,
): HarnessStateActionProjection | null {
  return harnessState?.compatibility_actions.find((action) => action.action_id === actionId) ?? null;
}

function artifactStatus(value: JsonObject, keys: string[]): boolean {
  return keys.some((key) => Boolean(value[key]));
}

function operationLooksPrMode(name: string): boolean {
  return /pr|qa|handoff|reconcile|split|draft|open/i.test(name);
}

function prRecordMatchesCycle(record: JsonObject, runId: string, activeBranches: Set<string>): boolean {
  if (!runId) return true;
  const recordRunId = text(record.runId);
  if (recordRunId) return recordRunId === runId;
  const branch = text(record.branch);
  if (branch && activeBranches.has(branch)) return true;
  const status = text(record.status, "planned");
  return !Number.isFinite(numberValue(record.prNumber, NaN)) && ["planned", "planned_mock", "blocked"].includes(status);
}

function derivedPrRecords(dashboard: Dashboard | null, hasMeleePrFixture: boolean): PrFlowRecord[] {
  const prs = asObject(dashboard?.prs);
  const records = asArray(prs.records).map(asObject);
  const runId = text(asObject(asObject(dashboard?.status).run).id);
  const splitPlan = asObject(asObject(dashboard?.handoff).splitPlan);
  const activeBranches = new Set(asArray(splitPlan.slices).map((slice) => text(asObject(slice).branchName)).filter(Boolean));
  if (records.length > 0) {
    return records.filter((record) => prRecordMatchesCycle(record, runId, activeBranches)).map((record): PrFlowRecord => {
      const local = asObject(record.local);
      const validation = asObject(record.validation);
      const sourcePlan = asObject(record.sourcePlan);
      return {
        branch: text(record.branch),
        ci: text(record.ci),
        comments: numberValue(record.comments, 0),
        displayName: text(record.displayName, text(record.sliceId, text(record.branch, "-"))),
        files: asArray(record.files).map((file) => text(file)).filter(Boolean),
        localBranch: text(local.branch),
        localStatus: text(local.status, "not_prepared"),
        localWorktreePath: text(local.worktreePath),
        prepStartedAt: text(local.prepStartedAt),
        prNumber: numberValue(record.prNumber, NaN),
        repairNote: text(validation.repairNote),
        reviewSubState: text(asObject(record.review).subState),
        source: "pr_records",
        sourceDetail: text(sourcePlan.source),
        status: text(record.status, "planned"),
        title: text(record.title),
        url: text(record.url),
        validationStatus: text(validation.status, "not_run"),
      };
    });
  }

  const slices = asArray(splitPlan.slices).map(asObject).filter((slice) => text(slice.lane) === "match");
  if (slices.length > 0) {
    return slices.map((slice): PrFlowRecord => ({
      branch: text(slice.branchName),
      ci: "",
      comments: 0,
      displayName: text(slice.displayName, text(slice.id, "planned slice")),
      files: asArray(slice.pathspecs).map((file) => text(file)).filter(Boolean),
      localBranch: "",
      localStatus: "not_prepared",
      localWorktreePath: "",
      prepStartedAt: "",
      prNumber: NaN,
      repairNote: "",
      reviewSubState: "",
      source: "split_plan",
      sourceDetail: "split_plan",
      status: "planned",
      title: text(slice.title),
      url: "",
      validationStatus: "not_run",
    }));
  }

  if (!hasMeleePrFixture) return [];
  return [
    {
      branch: "planned/mock/melee-match-slice-a",
      ci: "",
      comments: 0,
      displayName: "Planned match slice A",
      files: ["18 routed warning-only candidate files"],
      localBranch: "",
      localStatus: "not_prepared",
      localWorktreePath: "",
      prepStartedAt: "",
      prNumber: NaN,
      repairNote: "",
      reviewSubState: "",
      source: "current_objective_fixture",
      sourceDetail: "current_objective_fixture",
      status: "planned_mock",
      title: "Mock PR slice from routed QA handoff state",
      url: "",
      validationStatus: "not_run",
    },
    {
      branch: "planned/mock/melee-match-slice-b",
      ci: "",
      comments: 0,
      displayName: "Planned match slice B",
      files: ["ship set isolation required before draft opening"],
      localBranch: "",
      localStatus: "blocked",
      localWorktreePath: "",
      prepStartedAt: "",
      prNumber: NaN,
      repairNote: "",
      reviewSubState: "",
      source: "current_objective_fixture",
      sourceDetail: "current_objective_fixture",
      status: "blocked",
      title: "Blocked until PR promotion gate is clean",
      url: "",
      validationStatus: "failed",
    },
  ];
}

export function deriveCycleView(dashboard: Dashboard | null, config: UiConfig | null, form: FormState): CycleView {
  const harnessState = harnessStateReadModel(dashboard);
  const game =
    dashboard?.game ??
    config?.availableGames.find((item) => item.id === form.gameId) ??
    config?.selectedGame ??
    null;
  const selectedProcessName = processName(form.processName || game?.processName);
  const process = processView(dashboard, selectedProcessName);
  const canonicalCycle = asObject(dashboard?.cycle);
  const canonicalGates = asObject(canonicalCycle.gates);
  const canonicalPhases = asObject(canonicalCycle.phases);
  const preparingPhase = asObject(canonicalPhases.preparing);
  const prepareSync = asObject(preparingPhase.sync);
  const prepareIntake = asObject(preparingPhase.intake);
  const prepareIntakeItems = asArray(prepareIntake.items).map(asObject);
  const prepareIntakeItemCounts = asObject(prepareIntake.itemCounts);
  const prepareKnowledge = asObject(preparingPhase.knowledge);
  const prepareBaseline = asObject(preparingPhase.baseline);
  const prepareMergedPrs = asArray(prepareSync.mergedPrs).map((value) => numberValue(value, NaN)).filter(Number.isFinite);
  const syncDone = text(prepareSync.status) === "complete" || Boolean(prepareSync.completedAt);
  const intakeDone = text(prepareIntake.status) === "complete" || Boolean(prepareIntake.completedAt);
  const knowledgeDone = text(prepareKnowledge.status) === "complete" || Boolean(prepareKnowledge.completedAt);
  const baselineDone = text(prepareBaseline.status) === "complete" || Boolean(prepareBaseline.completedAt);
  const prepareHeadSha = text(prepareSync.afterRef);
  const prepareBeforeSha = text(prepareSync.beforeRef);
  const prepareUpstreamChanged = prepareBeforeSha && prepareHeadSha ? prepareBeforeSha !== prepareHeadSha : null;
  const prepareUpstreamWorktreePath = text(prepareSync.upstreamWorktreePath);
  const prepareCycleCurrentWorktreePath = text(
    prepareSync.cycleCurrentWorktreePath,
    text(prepareSync.cycleWorktreePath),
  );
  const preparePrIndexDebt = asObject(
    intakeDone
      ? prepareIntake.prIndexDebtAfter
      : prepareIntake.prIndexDebtBefore || prepareSync.prIndexDebt,
  );
  const prIndexDebtKnown = text(preparePrIndexDebt.status) === "available";
  const pendingMergedPrIndexCount = prIndexDebtKnown
    ? numberValue(preparePrIndexDebt.pendingMergedAgentPrs, 0)
    : syncDone && !intakeDone
      ? prepareMergedPrs.length
      : 0;
  const pendingPrIndexCount = prIndexDebtKnown
    ? numberValue(preparePrIndexDebt.pendingAgentPrs, pendingMergedPrIndexCount)
    : pendingMergedPrIndexCount;
  const hasIntakeItemCounts = prepareIntakeItems.length > 0 || hasKeys(prepareIntakeItemCounts);
  const pendingIntakePrCount = hasIntakeItemCounts
    ? numberValue(prepareIntakeItemCounts.pending, prepareIntakeItems.filter((item) => text(item.status) === "pending").length)
    : pendingPrIndexCount;
  const runningIntakeItemCount = numberValue(prepareIntakeItemCounts.running, prepareIntakeItems.filter((item) => text(item.status) === "running").length);
  const completedIntakeItemCount = numberValue(prepareIntakeItemCounts.complete, prepareIntakeItems.filter((item) => text(item.status) === "complete").length);
  const failedIntakeItemCount = numberValue(prepareIntakeItemCounts.failed, prepareIntakeItems.filter((item) => text(item.status) === "failed").length);
  const retryableIntakeItemCount = numberValue(prepareIntakeItemCounts.retryable, prepareIntakeItems.filter((item) => text(item.status) === "failed" && item.retryable === true).length);
  const totalIntakeItemCount = numberValue(prepareIntakeItemCounts.total, prepareIntakeItems.length);
  const canonicalPhase = text(canonicalCycle.phase);
  const canonicalSubphase = text(canonicalCycle.activeSubphase);
  const canonicalStatus = text(canonicalCycle.status);
  const canonicalCycleId = harnessState?.cycle?.cycle_uuid || text(canonicalCycle.cycleUuid, text(canonicalCycle.id));
  const canonicalBlockers = asArray(canonicalCycle.blockers)
    .map(asObject)
    .map((blocker) => text(blocker.message, text(blocker.code)))
    .filter(Boolean);
  const hasCanonicalCycle = Boolean(canonicalCycleId && canonicalPhase);
  const status = asObject(dashboard?.status);
  const run = asObject(status.run);
  const runStatus = text(run.status);
  const runId = text(run.id);
  const completedLegacyRun = Boolean(runId) && runStatus === "completed" && !hasCanonicalCycle;
  const activeClaims = numberValue(status.activeClaims, 0);
  const campaign = asObject(dashboard?.campaign);
  const head = asObject(campaign.head);
  const handoff = asObject(dashboard?.handoff);
  const checkpoint = asObject(handoff.checkpoint || dashboard?.checkpoint);
  const qa = asObject(handoff.qa);
  const qaRepair = asObject(handoff.qaRepair);
  const splitPlan = asObject(handoff.splitPlan);
  const ship = asObject(handoff.ship);
  const prs = asObject(dashboard?.prs);
  const rawPrRecords = asArray(prs.records).map(asObject);
  const operation = asObject(asObject(dashboard?.process).operation);
  const operationStatus = text(operation.status);
  const operationName = text(operation.name);
  const operationActive = operationStatus === "running" || asObject(dashboard?.process).freshRunActive === true;
  const syncing = asObject(dashboard?.process).gameSyncActive === true;
  const syncLocked = runStatus === "active";
  const handoffCanDerivePrMode = !hasCanonicalCycle || canonicalPhase === "pr";
  const hasHandoffEvidence =
    !completedLegacyRun &&
    handoffCanDerivePrMode &&
    (artifactStatus(checkpoint, ["id", "checkpointPath", "prCandidatesPath"]) ||
      artifactStatus(qa, ["status", "summaryPath", "prReportPath"]) ||
      artifactStatus(qaRepair, ["status", "recommendation", "schema_version", "summaryPath", "shipStatusPath"]) ||
      artifactStatus(splitPlan, ["status", "summaryPath", "outputPath", "matchSlices"]) ||
      artifactStatus(ship, ["status", "patchPath"]) ||
      rawPrRecords.length > 0 ||
      operationLooksPrMode(operationName));
  const hasMeleePrFixture = game?.id === "melee" && !process.running && runStatus !== "active" && !completedLegacyRun && rawPrRecords.length === 0;
  const modeEvidence: string[] = [];
  if (hasCanonicalCycle) modeEvidence.push(`canonical phase ${prettyStatus(canonicalPhase)}${canonicalSubphase ? ` / ${prettyStatus(canonicalSubphase)}` : ""}`);
  if (canonicalBlockers.length > 0) modeEvidence.push(`${canonicalBlockers.length.toLocaleString()} canonical blocker(s)`);
  if (process.running) modeEvidence.push(process.draining ? "process draining" : "worker process running");
  if (activeClaims > 0) modeEvidence.push(`${activeClaims.toLocaleString()} active claim(s)`);
  if (runStatus === "active") modeEvidence.push("run status active");
  if (hasHandoffEvidence) modeEvidence.push("handoff, QA, split, ship, or PR evidence exists");
  if (hasMeleePrFixture && !hasHandoffEvidence) modeEvidence.push("current Melee PR-flow planned/mock fixture");

  let mode: CycleView["mode"] = "none";
  if (canonicalPhase === "running") mode = "run";
  else if (canonicalPhase === "pr") mode = "pr";
  else if (canonicalPhase === "preparing" || canonicalPhase === "complete") mode = "none";
  else if (process.running || activeClaims > 0) mode = "run";
  else if (hasHandoffEvidence || hasMeleePrFixture) mode = "pr";
  else if (runStatus === "active" || (runId && !completedLegacyRun)) mode = "run";

  const hasActivePrCycle = !completedLegacyRun && (canonicalPhase === "pr" || mode === "pr" || hasHandoffEvidence || hasMeleePrFixture);
  const prRecords = hasActivePrCycle ? derivedPrRecords(dashboard, hasMeleePrFixture) : [];
  const prBlockedReasons: string[] = [];
  const shipStatus = text(ship.status);
  const qaStatus = text(asObject(qa.prPromotion).status, text(qa.status));
  const qaRepairStatus = text(qaRepair.recommendation, text(qaRepair.status));
  if (hasActivePrCycle) {
    if (shipStatus && shipStatus !== "pr_ready") prBlockedReasons.push(`ship set ${prettyStatus(shipStatus)}`);
    if (qaStatus === "blocked" || qaStatus === "failed") prBlockedReasons.push(`QA ${prettyStatus(qaStatus)}`);
    if (qaRepairStatus && !["passed", "clean", "pr_ready"].includes(qaRepairStatus)) prBlockedReasons.push(`QA repair ${prettyStatus(qaRepairStatus)}`);
    if (canonicalPhase === "pr") prBlockedReasons.push(...canonicalBlockers);
    if (hasMeleePrFixture) prBlockedReasons.push("current PR repair campaign is routed-blocked; isolate ship set before draft opening");
  }

  const activePrStatuses = new Set(["planned", "planned_mock", "branch_pushed", "draft", "open", "changes_requested", "blocked"]);
  const unresolvedPrRecords = prRecords.filter((record) => activePrStatuses.has(record.status));
  const localPrRecords = prRecords.filter((record) => !["merged", "closed"].includes(record.status) && ["ready", "blocked", "dirty"].includes(record.localStatus));
  const newCycleReasons: string[] = [];
  if (hasCanonicalCycle && canonicalStatus !== "complete") newCycleReasons.push(`canonical cycle is ${prettyStatus(canonicalPhase)}${canonicalSubphase ? ` / ${prettyStatus(canonicalSubphase)}` : ""}`);
  if (canonicalBlockers.length > 0) newCycleReasons.push(...canonicalBlockers);
  if (process.running) newCycleReasons.push("worker process is running or detached");
  if (activeClaims > 0) newCycleReasons.push(`${activeClaims.toLocaleString()} active claim(s) remain`);
  if (runStatus === "active") newCycleReasons.push("run status is active");
  if (hasActivePrCycle && unresolvedPrRecords.length > 0) newCycleReasons.push(`${unresolvedPrRecords.length.toLocaleString()} PR slice(s) unresolved`);
  if (hasActivePrCycle && localPrRecords.length > 0) newCycleReasons.push(`${localPrRecords.length.toLocaleString()} local PR workspace(s) unresolved`);
  if (hasActivePrCycle && prBlockedReasons.length > 0) newCycleReasons.push(...prBlockedReasons);
  if (head.dirty === true) newCycleReasons.push("campaign head is dirty");

  const handoffIdle = Boolean(runId) && !completedLegacyRun && !process.running && activeClaims === 0 && !syncing && !operationActive;
  const handoffReason = !runId
    ? "No run yet."
    : completedLegacyRun
      ? "This legacy run is complete."
    : process.draining
      ? "Workers are draining."
    : process.running
        ? "Drain workers first."
        : syncing
          ? "Sync is in progress."
          : operationActive
            ? `${text(operation.label, "An operation")} is in progress.`
            : activeClaims > 0
              ? `Waiting on ${activeClaims.toLocaleString()} draining claim(s).`
              : "";

  const baseline = asObject(handoff.baseline);
  const baselineSha = text(canonicalCycle.baseSha, text(baseline.baseSha, text(campaign.baseSha)));
  const branch = canonicalPhase === "preparing"
    ? text(prepareSync.cycleBranch, text(canonicalCycle.baseRef, text(head.branch, text(campaign.branch, "-"))))
    : text(head.branch, text(campaign.branch, "-"));
  const fallbackCycleId = text(asObject(campaign.savePoint).commit_sha, `${game?.id ?? "game"}:no-run`);
  const activeRunId = completedLegacyRun && mode === "none" ? "" : runId;
  const activeCycleId = canonicalCycleId || activeRunId || (mode === "none" ? "" : fallbackCycleId);
  const activeCycleLabel = canonicalCycleId ? `Cycle ${shortId(canonicalCycleId)}` : activeRunId ? `Run ${shortId(activeRunId)}` : "No active cycle";
  const recommendedSub = canonicalPhase === "preparing" ? "prepare" : canonicalPhase === "pr" ? "pr" : canonicalPhase === "running" ? "run" : mode === "pr" ? "pr" : mode === "run" ? "run" : "done";
  const cycleStageStates: CycleView["cycleStageStates"] = {
    prepare: text(asObject(canonicalPhases.preparing).completed_at) ? "done" : "todo",
    run: text(asObject(canonicalPhases.running).completed_at) ? "done" : "todo",
    pr: text(asObject(canonicalPhases.pr).completed_at) ? "done" : "todo",
    done: text(canonicalCycle.completedAt) || canonicalStatus === "complete" || canonicalPhase === "complete" || (completedLegacyRun && !hasCanonicalCycle) ? "done" : "todo",
  };
  const canStartWorkers = hasCanonicalCycle
    ? booleanValue(canonicalGates.can_start_workers)
    : mode === "run" && !process.running && !syncing && !operationActive;
  const canOpenPrs = hasCanonicalCycle
    ? booleanValue(canonicalGates.can_publish_prs) || booleanValue(canonicalGates.can_prepare_prs)
    : mode !== "none" && !process.running && activeClaims === 0 && !syncing && !operationActive;
  const canCompleteRun =
    !hasCanonicalCycle &&
    Boolean(runId) &&
    (runStatus === "active" || runStatus === "paused") &&
    !process.running &&
    activeClaims === 0 &&
    !syncing &&
    !operationActive;
  const modeLabel =
    canonicalPhase === "preparing"
      ? "Preparing"
      : canonicalPhase === "complete"
        ? "Complete"
        : mode === "pr"
          ? "PR Mode"
          : mode === "run"
            ? "Run Mode"
            : "No Active Cycle";

  return {
    activeCycleId,
    activeCycleLabel,
    activeClaims,
    baselineLabel: baselineSha ? baselineSha.slice(0, 10) : "not built",
    branchLabel: `${branch}${head.dirty === true ? " dirty" : ""}`,
    canCompleteRun,
    canOpenPrs,
    canStartWorkers,
    canonicalBlockers,
    canonicalGates,
    canonicalPhase,
    canonicalSubphase,
    handoffIdle,
    handoffReason,
    hasMeleePrFixture,
    mode,
    modeEvidence,
    modeLabel,
    newCycleBlocked: newCycleReasons.length > 0,
    newCycleReasons,
    operationActive,
    operationLabel: text(operation.label, "An operation"),
    prBlockedReasons,
    prRecords,
    prepareState: {
      baseline: prepareBaseline,
      baselineDone,
      headSha: prepareHeadSha,
      headShortSha: prepareHeadSha ? prepareHeadSha.slice(0, 10) : "",
      intake: prepareIntake,
      intakeDone,
      knowledge: prepareKnowledge,
      knowledgeDone,
      mergedPrs: prepareMergedPrs,
      prIndexDebt: preparePrIndexDebt,
      prIndexDebtKnown,
      pendingMergedPrIndexCount,
      pendingIntakePrCount,
      pendingPrIndexCount,
      runningIntakeItemCount,
      completedIntakeItemCount,
      failedIntakeItemCount,
      retryableIntakeItemCount,
      totalIntakeItemCount,
      readyToStartRun: hasCanonicalCycle && canonicalPhase === "preparing" && baselineDone && !process.running && activeClaims === 0 && !syncing && !operationActive,
      cycleCurrentWorktreePath: prepareCycleCurrentWorktreePath,
      sync: prepareSync,
      syncDone,
      upstreamChanged: prepareUpstreamChanged,
      upstreamWorktreePath: prepareUpstreamWorktreePath,
    },
    prSummary: {
      checkpoint,
      qa,
      qaRepair,
      ship,
      splitPlan,
      upstreamOpen: numberValue(prs.upstreamOpen, NaN),
      warning: text(prs.warning),
    },
    process,
    game,
    harnessState,
    recommendedSub,
    runStatus,
    cycleStageStates,
    syncLocked,
    syncing,
  };
}
