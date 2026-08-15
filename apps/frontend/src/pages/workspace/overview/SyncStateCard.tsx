import {
  AlertTriangle,
  Check,
  Database,
  RotateCcw,
  X,
} from "@/icons";
import type { ReactNode } from "react";
import { num, shortId } from "@/lib/format";
import { Button, PanelSection, PanelTitle, StatCard } from "@/components/primitives";
import { prettyStatus, harnessStateAction } from "@/pages/workspace/_lib/model";
import type {
  DashboardAction,
  HarnessStateActionProjection,
  HarnessStateReadModel,
} from "@/pages/workspace/_lib/types";

function projectionTitle(projection: HarnessStateActionProjection | null): string {
  if (!projection) return "Action is missing from the server projection.";
  if (projection.enabled) return projection.expected_transition;
  return projection.blocked_by.map((blocker) => blocker.message || prettyStatus(blocker.code)).join("; ") || "Blocked by the server projection.";
}

function progressPercent(applied: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((applied / total) * 100)));
}

function ProjectedButton({
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

export function SyncStateCard({
  busy,
  onAction,
  harnessState,
}: {
  busy: boolean;
  onAction: (action: DashboardAction) => void;
  harnessState: HarnessStateReadModel | null;
}) {
  const sync = harnessState?.sync ?? null;
  const start = harnessStateAction(harnessState, "sync.start");
  const resolveConflict = harnessStateAction(harnessState, "sync.resolve_conflict");
  const publish = harnessStateAction(harnessState, "sync.publish");
  const cancel = harnessStateAction(harnessState, "sync.cancel");
  const recover = harnessStateAction(harnessState, "sync.recover");
  const percent = sync?.staging
    ? progressPercent(sync.staging.epochs_applied, sync.staging.epochs_total)
    : 0;
  const canonicalControls = [
    { action: "syncStart" as const, label: "Start sync", icon: <Database size={13} />, projection: start, tone: "primary" as const },
    { action: "syncResolveConflict" as const, label: "Resolve conflict", icon: <Check size={13} />, projection: resolveConflict },
    { action: "syncPublish" as const, label: "Publish", icon: <Check size={13} />, projection: publish, tone: "primary" as const },
    { action: "syncCancel" as const, label: "Cancel", icon: <X size={13} />, projection: cancel, tone: "danger" as const },
    { action: "syncRecover" as const, label: "Recover", icon: <RotateCcw size={13} />, projection: recover, tone: "warning" as const },
  ];

  return (
    <PanelSection>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <PanelTitle className="mb-0">Game Sync</PanelTitle>
        <div className="flex flex-wrap items-center gap-2">
          {sync?.staleness.stale ? (
            <span className="status-tag status-tag-warn" title={sync.staleness.blocker?.message}>
              <AlertTriangle size={11} /> stale
            </span>
          ) : null}
          <span className={`status-tag ${sync?.status === "published" || sync?.status === "validated" ? "status-tag-live" : sync && ["blocked", "publishing"].includes(sync.status) ? "status-tag-warn" : ""}`}>
            <span className="lamp" />
            {sync ? prettyStatus(sync.status) : "No sync"}
          </span>
        </div>
      </div>

      {sync ? (
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
      ) : (
        <p className="m-0 text-xs text-dim">No sync request is present in the server read model.</p>
      )}

      {sync?.staging ? (
        <div className="mt-3 border border-line bg-card p-3">
          <div className="mb-1.5 flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-[0.08em] text-dim">
            <span>Staging progress</span>
            <span className="text-soft">{num(sync.staging.epochs_applied)} / {num(sync.staging.epochs_total)} epochs</span>
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
            <span>{num(sync.staging.minor_auto_resolved_count)} minor auto-resolved</span>
            <span className={sync.staging.conflicts_awaiting_operator > 0 ? "text-warn" : ""}>
              {num(sync.staging.conflicts_awaiting_operator)} awaiting operator
            </span>
          </div>
        </div>
      ) : null}

      {sync?.staging?.conflicts.length ? (
        <div className="mt-3">
          <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-dim">Conflicts awaiting operator</div>
          <ul className="m-0 grid gap-1.5 p-0">
            {sync.staging.conflicts.map((path) => (
              <li className="flex min-w-0 items-center justify-between gap-2 border border-warn/40 bg-warn/10 px-2.5 py-2" key={path}>
                <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-xs text-warn" title={path}>{path}</span>
                <ProjectedButton
                  action="syncResolveConflict"
                  busy={busy}
                  icon={<Check size={12} />}
                  onAction={onAction}
                  projection={resolveConflict}
                >
                  Resolve
                </ProjectedButton>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {sync?.staleness.stale ? (
        <div className="mt-3 border border-warn/40 bg-warn/10 p-3 text-xs text-warn">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>{sync.staleness.blocker?.message || "Validated staging is stale."}</span>
            {sync.staleness.revalidate_action_id ? (
              <ProjectedButton
                action="syncRevalidate"
                busy={busy}
                icon={<X size={12} />}
                onAction={onAction}
                projection={cancel}
              >
                Cancel stale sync
              </ProjectedButton>
            ) : null}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <StatCard label="Validated upstream" value={shortId(sync.staleness.validated_upstream || "unknown")} />
            <StatCard label="Observed upstream" value={shortId(sync.staleness.observed_upstream || "unknown")} />
          </div>
        </div>
      ) : null}

      {sync?.publication ? (
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
      ) : null}

      <div className="mt-4 grid gap-2 @[760px]:grid-cols-5" aria-label="Canonical sync actions">
        {canonicalControls.map((control) => (
          <div className="border border-line bg-card p-2" key={control.action}>
            <ProjectedButton {...control} busy={busy} onAction={onAction}>{control.label}</ProjectedButton>
            <div className="mt-1.5 text-[10px] text-dim">{control.projection?.expected_transition ?? "Missing server projection"}</div>
            {!control.projection?.enabled && control.projection?.blocked_by.length ? (
              <div className="mt-1 text-[10px] text-warn">{control.projection.blocked_by.map((blocker) => blocker.message || prettyStatus(blocker.code)).join("; ")}</div>
            ) : null}
          </div>
        ))}
      </div>
    </PanelSection>
  );
}
