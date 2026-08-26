import { AlertTriangle, Ban, Check, Database, RotateCcw, X } from "@/icons";
import { Fragment, type ReactNode } from "react";

import { Button, StatCard } from "@/components/primitives";
import { ago, num, shortId } from "@/lib/format";
import { harnessStateAction, prettyStatus } from "@/pages/workspace/_lib/model";
import type {
  DashboardAction,
  HarnessStateActionProjection,
  HarnessStateReadModel,
  HarnessStateRepoSyncReadModel,
  HarnessStateSyncReadModel,
  HarnessStateSyncStatus,
} from "@/pages/workspace/_lib/types";

export const SYNC_STAGES = [
  { id: "requested", label: "Requested" },
  { id: "ingesting", label: "Ingesting" },
  { id: "reconciling", label: "Reconciling" },
  { id: "validating", label: "Validating" },
  { id: "publishing", label: "Publishing" },
  { id: "published", label: "Published" },
] as const;

export type SyncStageId = (typeof SYNC_STAGES)[number]["id"];
export type SyncStageState = "done" | "current" | "todo";

const syncStageByStatus: Partial<Record<HarnessStateSyncStatus, SyncStageId>> = {
  requested: "requested",
  ingesting: "ingesting",
  reconciling: "reconciling",
  validating: "validating",
  validated: "publishing",
  publishing: "publishing",
  published: "published",
};

export function syncStageForStatus(status: HarnessStateSyncStatus | null | undefined): SyncStageId | null {
  return status ? syncStageByStatus[status] ?? null : null;
}

export function syncStageStates(
  status: HarnessStateSyncStatus | null | undefined,
  lastKnownStage: SyncStageId = "requested",
): Record<SyncStageId, SyncStageState> {
  const current = syncStageForStatus(status) ?? lastKnownStage;
  const currentIndex = SYNC_STAGES.findIndex((stage) => stage.id === current);
  const states = Object.fromEntries(
    SYNC_STAGES.map((stage, index) => [stage.id, index < currentIndex ? "done" : index === currentIndex ? "current" : "todo"]),
  ) as Record<SyncStageId, SyncStageState>;
  if (status === "validated") states.validating = "done";
  return states;
}

export function syncStageTone(state: SyncStageState): string {
  if (state === "done") return "text-up";
  if (state === "current") return "text-warn";
  return "text-dim";
}

function projectionTitle(projection: HarnessStateActionProjection | null): string {
  if (!projection) return "Action is missing from the server projection.";
  if (projection.enabled) return projection.expected_transition;
  return projection.blocked_by.map((blocker) => blocker.message || prettyStatus(blocker.code)).join("; ") || "Blocked by the server projection.";
}

function progressPercent(applied: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((applied / total) * 100)));
}

export function SyncProjectedButton({
  action,
  busy,
  children,
  icon,
  onAction,
  projection,
  tone,
}: {
  action: DashboardAction;
  busy: boolean;
  children: string;
  icon: ReactNode;
  onAction: (action: DashboardAction) => void;
  projection: HarnessStateActionProjection | null;
  tone?: "default" | "primary" | "warning" | "danger";
}) {
  return (
    <Button
      disabled={busy || !projection?.enabled}
      icon={icon}
      onClick={() => onAction(action)}
      title={projectionTitle(projection)}
      tone={tone}
      type="button"
    >
      {children}
    </Button>
  );
}

export function SyncStatusTag({
  repoSync,
  sync,
}: {
  repoSync: HarnessStateRepoSyncReadModel | null;
  sync: HarnessStateSyncReadModel | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {sync?.staleness.stale ? (
        <span className="status-tag status-tag-warn" title={sync.staleness.blocker?.message}>
          <AlertTriangle size={11} /> stale
        </span>
      ) : null}
      <span
        className={`status-tag ${sync?.status === "published" || sync?.status === "validated" ? "status-tag-live" : sync && ["blocked", "publishing"].includes(sync.status) ? "status-tag-warn" : !sync && repoSync?.needs_sync ? "status-tag-warn" : ""}`}
        title={!sync && repoSync?.needs_sync ? `Cycle head is behind ${repoSync.upstream_ref}.` : undefined}
      >
        <span className="lamp" />
        {sync ? prettyStatus(sync.status) : repoSync ? (repoSync.needs_sync ? "Sync needed" : "Up to date") : "No sync"}
      </span>
    </div>
  );
}

export function SyncIntakeStats({ sync }: { sync: HarnessStateSyncReadModel }) {
  const discord = sync.discord;
  return (
    <>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-soft">
        <span>
          Found {num(sync.intake.merged_pr_count)} merged PRs
          {discord?.staged ? ` · ${num(discord.staged.days)} days of Discord (${num(discord.staged.messages)} messages)` : ""}
        </span>
        {discord?.refresh?.status === "failed" ? (
          <span className="status-tag status-tag-warn" title={discord.refresh.detail ?? undefined}>
            <AlertTriangle size={11} /> Discord refresh: {(discord.refresh.detail || "failed").slice(0, 80)}
          </span>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-2 @[760px]:grid-cols-4">
        <StatCard label="Upstream from" value={shortId(sync.intake.upstream_from)} />
        <StatCard label="Upstream to" value={shortId(sync.intake.upstream_to)} />
        <StatCard label="Merged PRs" value={num(sync.intake.merged_pr_count)} />
        <StatCard label="Corpus batches" value={num(sync.intake.corpus_batches.length)} />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 @[760px]:grid-cols-4">
        <StatCard label="Intake" value={sync.intake.knowledge_only ? "knowledge only" : "source + knowledge"} />
        <StatCard label="PR series" value={num(sync.pr_reconciliation.total)} />
        <StatCard label="Auto-resolved" value={num(sync.pr_reconciliation.auto_resolved)} />
        <StatCard label="Pending pushes" value={num(sync.pr_reconciliation.pending_pushes)} />
      </div>
    </>
  );
}

export function RepoSyncIdleCard({
  busy,
  onAction,
  repoSync,
  startProjection,
}: {
  busy: boolean;
  onAction: (action: DashboardAction) => void;
  repoSync: HarnessStateRepoSyncReadModel | null;
  startProjection: HarnessStateActionProjection | null;
}) {
  return (
    <div className={repoSync?.needs_sync ? "border border-warn/40 bg-warn/10 p-3" : ""}>
      <RepoSyncStats repoSync={repoSync} />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] text-dim">
          {repoSync?.needs_sync
            ? `Cycle head is behind ${repoSync.upstream_ref}; start a sync to catch up.`
            : "No sync workflow is active."}
        </span>
        <SyncProjectedButton
          action="syncStart"
          busy={busy}
          icon={<Database size={12} />}
          onAction={onAction}
          projection={startProjection}
          tone={repoSync?.needs_sync ? "primary" : undefined}
        >
          {busy ? "Pulling things down…" : "Sync"}
        </SyncProjectedButton>
      </div>
    </div>
  );
}

export function RepoSyncStats({ repoSync }: { repoSync: HarnessStateRepoSyncReadModel | null }) {
  return (
    <div className="grid grid-cols-2 gap-2 @[760px]:grid-cols-4">
      <StatCard
        label="Cycle head"
        value={
          <span title={repoSync?.cycle_head ?? undefined}>
            {repoSync?.cycle_head ? shortId(repoSync.cycle_head) : "-"}
          </span>
        }
      />
      <StatCard
        label="Upstream"
        value={
          <span title={repoSync?.upstream_anchor ?? undefined}>
            {repoSync?.upstream_ref
              ? `${repoSync.upstream_ref} @ ${repoSync.local_upstream_sha ? shortId(repoSync.local_upstream_sha) : "-"}`
              : "-"}
          </span>
        }
      />
      <StatCard
        label="Behind"
        tone={
          repoSync?.behind_count === null || !repoSync
            ? "text-dim"
            : repoSync.behind_count > 0
              ? "text-warn"
              : "text-up"
        }
        value={
          !repoSync || repoSync.behind_count === null
            ? "unknown"
            : repoSync.behind_count === 0
              ? "up to date"
              : `${num(repoSync.behind_count)} commits behind`
        }
      />
      <StatCard
        label="Last synced"
        value={repoSync?.last_synced_at ? `${ago(repoSync.last_synced_at)} ago` : "-"}
      />
    </div>
  );
}

export function SyncKnowledgeProgress({
  discordDays,
  knowledgeJobs,
  upstreamOpen,
}: {
  discordDays: number;
  knowledgeJobs: HarnessStateSyncReadModel["knowledge_jobs"];
  upstreamOpen: number | null;
}) {
  if (!knowledgeJobs || knowledgeJobs.jobs_total <= 0) return null;
  if (knowledgeJobs.discord.jobs_total > 0) {
    return (
      <div className="mt-3 grid gap-3 border border-line bg-card p-3">
        <SyncKnowledgeProgressRow
          jobs={knowledgeJobs.prs}
          label={`INGESTING PRS: ${knowledgeJobs.prs.jobs_succeeded}/${knowledgeJobs.prs.jobs_total}`}
          progressLabel="PR ingestion"
          trailing={upstreamOpen !== null ? `${upstreamOpen} open upstream` : null}
        />
        <SyncKnowledgeProgressRow
          jobs={knowledgeJobs.discord}
          label={`DISCORD: ${knowledgeJobs.discord.jobs_succeeded}/${knowledgeJobs.discord.jobs_total} batches · ${discordDays} days`}
          progressLabel="Discord ingestion"
          trailing={null}
        />
      </div>
    );
  }
  const percent = progressPercent(knowledgeJobs.jobs_succeeded, knowledgeJobs.jobs_total);
  return (
    <div className="mt-3 border border-line bg-card p-3">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-[0.08em] text-dim">
        <span>Ingesting PRs: {knowledgeJobs.jobs_succeeded}/{knowledgeJobs.jobs_total}</span>
        {upstreamOpen !== null ? <span className="text-soft">{upstreamOpen} open upstream</span> : null}
      </div>
      <div
        aria-label={`PR ingestion ${percent}%`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={percent}
        className="h-1.5 overflow-hidden bg-raised"
        role="progressbar"
      >
        <div className="h-full bg-up" style={{ width: `${percent}%` }} />
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-dim">
        <span>{knowledgeJobs.jobs_processing} processing</span>
        {knowledgeJobs.jobs_failed > 0 ? <span className="text-down">{knowledgeJobs.jobs_failed} failed</span> : null}
      </div>
    </div>
  );
}

function SyncKnowledgeProgressRow({
  jobs,
  label,
  progressLabel,
  trailing,
}: {
  jobs: { jobs_total: number; jobs_succeeded: number; jobs_processing: number; jobs_failed: number };
  label: string;
  progressLabel: string;
  trailing: string | null;
}) {
  const percent = progressPercent(jobs.jobs_succeeded, jobs.jobs_total);
  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-[0.08em] text-dim">
        <span>{label}</span>
        {trailing ? <span className="text-soft">{trailing}</span> : null}
      </div>
      <div aria-label={`${progressLabel} ${percent}%`} aria-valuemax={100} aria-valuemin={0} aria-valuenow={percent} className="h-1.5 overflow-hidden bg-raised" role="progressbar">
        <div className="h-full bg-up" style={{ width: `${percent}%` }} />
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-dim">
        <span>{jobs.jobs_processing} processing</span>
        {jobs.jobs_failed > 0 ? <span className="text-down">{jobs.jobs_failed} failed</span> : null}
      </div>
    </div>
  );
}

type SyncIngestStepState = "active" | "done" | "pending";

function SyncIngestStepMarker({ state, step }: { state: SyncIngestStepState; step: number }) {
  if (state === "done") {
    return (
      <span className="flex size-5 items-center justify-center text-up" aria-label="Done">
        <Check size={14} />
      </span>
    );
  }
  if (state === "active") {
    return (
      <span className="status-tag status-tag-warn flex size-5 items-center justify-center p-0" aria-label="Active">
        <span className="lamp" />
      </span>
    );
  }
  return (
    <span className="flex size-5 items-center justify-center rounded-full border border-line text-[10px] text-dim" aria-label="Pending">
      {step}
    </span>
  );
}

function SyncIngestStepCard({
  children,
  label,
  state,
  step,
}: {
  children: ReactNode;
  label: string;
  state: SyncIngestStepState;
  step: number;
}) {
  const tone = state === "done" ? "border-up/40 bg-up/10" : state === "active" ? "border-warn/40 bg-warn/10" : "border-line bg-card";
  return (
    <div className={`border p-3 ${tone}`}>
      <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.08em] text-dim">
        <SyncIngestStepMarker state={state} step={step} />
        <span>{label}</span>
      </div>
      {children}
    </div>
  );
}

export function SyncIngestFlow({
  busy,
  sync,
  upstreamOpen,
}: {
  busy: boolean;
  sync: HarnessStateSyncReadModel;
  upstreamOpen: number | null;
}) {
  const refresh = sync.discord?.refresh;
  const staged = sync.discord?.staged;
  const corpus = sync.discord?.corpus;
  const knowledgeJobs = sync.knowledge_jobs;
  const pullState: SyncIngestStepState = busy || refresh?.status === "running" ? "active" : "done";
  const ingestState: SyncIngestStepState =
    !knowledgeJobs || knowledgeJobs.jobs_total === 0
      ? "pending"
      : knowledgeJobs.jobs_succeeded === knowledgeJobs.jobs_total
        ? "done"
        : "active";

  return (
    <div className="grid gap-3">
      <SyncIngestStepCard label="Pull / Discovery" state={pullState} step={1}>
        <div className="text-[11px] text-soft">Discovered {num(sync.intake.merged_pr_count)} merged PRs</div>
        {refresh?.status === "ok" ? (
          <div className="mt-1.5 text-[11px] text-dim">
            {(staged?.batches ?? 0) > 0
              ? `Discord: ${num(refresh.messages_pulled ?? 0)} new messages · ${num(staged?.batches ?? 0)} batches staged (${num(staged?.days ?? 0)} days)`
              : "No new Discord messages"}
          </div>
        ) : null}
        {corpus ? (
          <div className="mt-1.5 text-[11px] text-dim">
            Indexed corpus: {num(corpus.messages_indexed)} messages · {num(corpus.batches_done)} batches · through {corpus.through_month ?? "—"}
          </div>
        ) : null}
        {refresh?.status === "failed" ? (
          <div className="mt-1.5">
            <span className="status-tag status-tag-warn" title={refresh.detail ?? undefined}>
              <AlertTriangle size={11} /> Discord refresh: {(refresh.detail || "failed").slice(0, 80)}
            </span>
          </div>
        ) : null}
        {pullState === "active" ? <div className="mt-1.5 text-[11px] text-warn">Pulling things down…</div> : null}
      </SyncIngestStepCard>

      <SyncIngestStepCard label="Ingestion" state={ingestState} step={2}>
        {knowledgeJobs ? (
          <div className="grid gap-3">
            <SyncKnowledgeProgressRow
              jobs={knowledgeJobs.prs}
              label={`PRS: ${knowledgeJobs.prs.jobs_succeeded}/${knowledgeJobs.prs.jobs_total}`}
              progressLabel="PR ingestion"
              trailing={upstreamOpen !== null ? `${upstreamOpen} open upstream` : null}
            />
            {knowledgeJobs.discord.jobs_total > 0 ? (
              <SyncKnowledgeProgressRow
                jobs={knowledgeJobs.discord}
                label={`DISCORD: ${knowledgeJobs.discord.jobs_succeeded}/${knowledgeJobs.discord.jobs_total} batches · ${num(staged?.days ?? 0)} days`}
                progressLabel="Discord ingestion"
                trailing={null}
              />
            ) : (
              <div className="text-[11px] text-dim">Discord: nothing new to ingest</div>
            )}
          </div>
        ) : (
          <div className="text-[11px] text-dim">Waiting for ingestion jobs</div>
        )}
      </SyncIngestStepCard>
    </div>
  );
}

export function SyncStagingProgress({ staging }: { staging: HarnessStateSyncReadModel["staging"] }) {
  if (!staging) return null;
  const percent = progressPercent(staging.epochs_applied, staging.epochs_total);
  return (
    <div className="mt-3 border border-line bg-card p-3">
      <div className="mb-1.5 flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-[0.08em] text-dim">
        <span>Staging progress</span>
        <span className="text-soft">{num(staging.epochs_applied)} / {num(staging.epochs_total)} epochs</span>
      </div>
      <div
        aria-label={`Staging ${percent}%`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={percent}
        className="h-1.5 overflow-hidden bg-raised"
        role="progressbar"
      >
        <div className="h-full bg-up" style={{ width: `${percent}%` }} />
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-dim">
        <span>{num(staging.minor_auto_resolved_count)} minor auto-resolved</span>
        <span className={staging.conflicts_awaiting_operator > 0 ? "text-warn" : ""}>
          {num(staging.conflicts_awaiting_operator)} awaiting operator
        </span>
      </div>
    </div>
  );
}

export function SyncConflictList({
  busy,
  onAction,
  resolveConflictProjection,
  readOnly = false,
  staging,
}: {
  busy: boolean;
  onAction: (action: DashboardAction) => void;
  resolveConflictProjection: HarnessStateActionProjection | null;
  readOnly?: boolean;
  staging: HarnessStateSyncReadModel["staging"];
}) {
  if (!staging?.conflicts.length) return null;
  return (
    <div className="mt-3">
      <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-dim">Conflicts awaiting operator</div>
      <ul className="m-0 grid gap-1.5 p-0">
        {staging.conflicts.map((path) => (
          <li className="flex min-w-0 items-center justify-between gap-2 border border-warn/40 bg-warn/10 px-2.5 py-2" key={path}>
            <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-xs text-warn" title={path}>{path}</span>
            {!readOnly ? (
              <SyncProjectedButton
                action="syncResolveConflict"
                busy={busy}
                icon={<Check size={12} />}
                onAction={onAction}
                projection={resolveConflictProjection}
              >
                Resolve
              </SyncProjectedButton>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SyncStalenessCard({
  busy,
  cancelProjection,
  onAction,
  readOnly = false,
  staleness,
}: {
  busy: boolean;
  cancelProjection: HarnessStateActionProjection | null;
  onAction: (action: DashboardAction) => void;
  readOnly?: boolean;
  staleness: HarnessStateSyncReadModel["staleness"];
}) {
  if (!staleness.stale) return null;
  return (
    <div className="mt-3 border border-warn/40 bg-warn/10 p-3 text-xs text-warn">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>{staleness.blocker?.message || "Validated staging is stale."}</span>
        {staleness.revalidate_action_id && !readOnly ? (
          <SyncProjectedButton
            action="syncRevalidate"
            busy={busy}
            icon={<X size={12} />}
            onAction={onAction}
            projection={cancelProjection}
          >
            Cancel stale sync
          </SyncProjectedButton>
        ) : null}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <StatCard label="Validated upstream" value={shortId(staleness.validated_upstream || "unknown")} />
        <StatCard label="Observed upstream" value={shortId(staleness.observed_upstream || "unknown")} />
      </div>
    </div>
  );
}

export function SyncPublicationCard({ sync }: { sync: HarnessStateSyncReadModel }) {
  if (!sync.publication) return null;
  return (
    <div className="mt-3 border border-up/40 bg-up/10 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-up">
        <Check size={12} /> Publication record
      </div>
      <div className="grid grid-cols-2 gap-2 @[760px]:grid-cols-4">
        <StatCard label="Prior head" value={shortId(sync.publication.prior_head)} />
        <StatCard label="New head" value={shortId(sync.publication.new_head)} />
        <StatCard label="Knowledge" value={sync.publication.knowledge_revision} wrap />
        <StatCard label="Series pushed" value={num(sync.pr_reconciliation.pushed)} />
      </div>
      <div className="mt-1.5 text-[11px] text-dim">
        {sync.publication.remote_application_id ? `Remote application ${sync.publication.remote_application_id} · ` : ""}
        {num(sync.publication.invalidated_ids.length)} invalidated records
      </div>
    </div>
  );
}

export interface SyncActionProjections {
  start: HarnessStateActionProjection | null;
  resolveConflict: HarnessStateActionProjection | null;
  publish: HarnessStateActionProjection | null;
  cancel: HarnessStateActionProjection | null;
  recover: HarnessStateActionProjection | null;
}

export function syncActionProjections(harnessState: HarnessStateReadModel | null): SyncActionProjections {
  return {
    start: harnessStateAction(harnessState, "sync.start"),
    resolveConflict: harnessStateAction(harnessState, "sync.resolve_conflict"),
    publish: harnessStateAction(harnessState, "sync.publish"),
    cancel: harnessStateAction(harnessState, "sync.cancel"),
    recover: harnessStateAction(harnessState, "sync.recover"),
  };
}

export function SyncActionsGrid({
  busy,
  compact = false,
  onAction,
  projections,
}: {
  busy: boolean;
  compact?: boolean;
  onAction: (action: DashboardAction) => void;
  projections: SyncActionProjections;
}) {
  // Recovery needs an explicit operator choice, so the single sync.recover
  // projection renders as two buttons: resume (safe default, keeps staging)
  // and discard (destructive, cancels the sync and throws away staged work).
  const controls = [
    { action: "syncStart" as const, label: "Start sync", icon: <Database size={13} />, projection: projections.start, tone: "primary" as const },
    { action: "syncResolveConflict" as const, label: "Resolve conflict", icon: <Check size={13} />, projection: projections.resolveConflict },
    { action: "syncPublish" as const, label: "Publish", icon: <Check size={13} />, projection: projections.publish, tone: "primary" as const },
    { action: "syncCancel" as const, label: "Cancel", icon: <X size={13} />, projection: projections.cancel, tone: "danger" as const },
    { action: "syncRecover" as const, label: "Recover · Resume", icon: <RotateCcw size={13} />, projection: projections.recover, note: "Resumes from the last durable stage and preserves staging (safe default)." },
    { action: "syncRecoverDiscard" as const, label: "Recover · Discard", icon: <Ban size={13} />, projection: projections.recover, tone: "danger" as const, note: "Cancels the sync and discards staged work." },
  ];
  return (
    <div className={`mt-4 grid gap-2 ${compact ? "grid-cols-1" : "@[760px]:grid-cols-3"}`} aria-label="Canonical sync actions">
      {controls.map((control) => (
        <div className="border border-line bg-card p-2" key={control.action}>
          <SyncProjectedButton action={control.action} busy={busy} icon={control.icon} onAction={onAction} projection={control.projection} tone={"tone" in control ? control.tone : undefined}>{control.label}</SyncProjectedButton>
          <div className="mt-1.5 text-[10px] text-dim">{("note" in control ? control.note : null) ?? control.projection?.expected_transition ?? "Missing server projection"}</div>
          {!control.projection?.enabled && control.projection?.blocked_by.length ? (
            <div className="mt-1 text-[10px] text-warn">{control.projection.blocked_by.map((blocker) => blocker.message || prettyStatus(blocker.code)).join("; ")}</div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function SyncStagePipeline({
  lastKnownStage,
  onSelectStage,
  orientation = "horizontal",
  status,
}: {
  lastKnownStage?: SyncStageId;
  onSelectStage: (stage: string) => void;
  orientation?: "horizontal" | "vertical";
  status: HarnessStateSyncStatus;
}) {
  const states = syncStageStates(status, lastKnownStage);
  return (
    <div className={`pipeline${orientation === "vertical" ? " pipeline-vertical" : ""}`}>
      {SYNC_STAGES.map((stage, index) => {
        const state = states[stage.id];
        return (
          <Fragment key={stage.id}>
            <button
              className="pipeline-node cursor-pointer text-left hover:border-line2 hover:bg-raised"
              onClick={() => onSelectStage(stage.id)}
              title={`Open ${stage.label.toLowerCase()} stage detail`}
              type="button"
            >
              <span className="pipeline-node-label">{stage.label}</span>
              <span className={`pipeline-node-value ${syncStageTone(state)}`}>
                {state === "done" ? "✓" : index + 1}
              </span>
            </button>
            {index < SYNC_STAGES.length - 1 ? <div aria-hidden="true" className="pipeline-connector" /> : null}
          </Fragment>
        );
      })}
    </div>
  );
}
