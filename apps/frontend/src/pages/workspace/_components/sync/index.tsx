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
  return (
    <>
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
          Sync
        </SyncProjectedButton>
      </div>
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
  staging,
}: {
  busy: boolean;
  onAction: (action: DashboardAction) => void;
  resolveConflictProjection: HarnessStateActionProjection | null;
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
            <SyncProjectedButton
              action="syncResolveConflict"
              busy={busy}
              icon={<Check size={12} />}
              onAction={onAction}
              projection={resolveConflictProjection}
            >
              Resolve
            </SyncProjectedButton>
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
  staleness,
}: {
  busy: boolean;
  cancelProjection: HarnessStateActionProjection | null;
  onAction: (action: DashboardAction) => void;
  staleness: HarnessStateSyncReadModel["staleness"];
}) {
  if (!staleness.stale) return null;
  return (
    <div className="mt-3 border border-warn/40 bg-warn/10 p-3 text-xs text-warn">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>{staleness.blocker?.message || "Validated staging is stale."}</span>
        {staleness.revalidate_action_id ? (
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
        <StatCard label="Knowledge" value={shortId(sync.publication.knowledge_revision)} />
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
  onAction,
  projections,
}: {
  busy: boolean;
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
    <div className="mt-4 grid gap-2 @[760px]:grid-cols-3" aria-label="Canonical sync actions">
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
  status,
}: {
  lastKnownStage?: SyncStageId;
  onSelectStage: (stage: string) => void;
  status: HarnessStateSyncStatus;
}) {
  const states = syncStageStates(status, lastKnownStage);
  return (
    <div className="pipeline">
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
