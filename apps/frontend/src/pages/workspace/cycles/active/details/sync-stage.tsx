import { useRef } from "react";
import { ChevronLeft } from "@/icons";

import { OperationActivity } from "@/components/details-rail/_components/operation-activity";
import { Button, InfoRows, PanelSection, PanelTitle, StatCard } from "@/components/primitives";
import { num, shortId, type Dashboard } from "@/lib/format";
import type { CycleFocus } from "@/routing";
import {
  RepoSyncIdleCard,
  SYNC_STAGES,
  SyncActionsGrid,
  SyncConflictList,
  SyncIntakeStats,
  SyncPublicationCard,
  SyncStagingProgress,
  SyncStalenessCard,
  syncActionProjections,
  syncStageForStatus,
  syncStageStates,
  type SyncStageId,
} from "@/pages/workspace/_components/sync";
import { prettyStatus } from "@/pages/workspace/_lib/model";
import type {
  CycleView,
  DashboardAction,
  HarnessStateSyncReadModel,
  WorkspaceNav,
} from "@/pages/workspace/_lib/types";

export interface SyncStageDetailPageProps {
  busy: boolean;
  cycleFocus: CycleFocus;
  dashboard: Dashboard | null;
  nav: WorkspaceNav;
  onAction: (action: DashboardAction) => void;
  stage: string;
  view: CycleView;
}

function IntakeDetail({ sync }: { sync: HarnessStateSyncReadModel }) {
  const batches = sync.intake.corpus_batches;
  return (
    <>
      <SyncIntakeStats sync={sync} />
      <div className="mt-3">
        <InfoRows
          rows={[
            ["Upstream from", <span title={sync.intake.upstream_from}>{shortId(sync.intake.upstream_from)}</span>],
            ["Upstream to", <span title={sync.intake.upstream_to}>{shortId(sync.intake.upstream_to)}</span>],
            ["Merged PRs", num(sync.intake.merged_pr_count)],
            ["Corpus batches", batches.length > 0 ? batches.join(", ") : "none"],
            ["Knowledge only", sync.intake.knowledge_only ? "yes" : "no"],
          ]}
        />
      </div>
    </>
  );
}

function ReconciliationDetail({
  busy,
  onAction,
  projections,
  sync,
}: {
  busy: boolean;
  onAction: (action: DashboardAction) => void;
  projections: ReturnType<typeof syncActionProjections>;
  sync: HarnessStateSyncReadModel;
}) {
  const reconciliation = sync.pr_reconciliation;
  return (
    <>
      <SyncStagingProgress staging={sync.staging} />
      <SyncConflictList
        busy={busy}
        onAction={onAction}
        resolveConflictProjection={projections.resolveConflict}
        staging={sync.staging}
      />
      <div className="mt-3 grid grid-cols-2 gap-2 @[760px]:grid-cols-3 @[1040px]:grid-cols-6">
        <StatCard label="Total" value={num(reconciliation.total)} />
        <StatCard label="Clean" value={num(reconciliation.clean)} />
        <StatCard label="Auto-resolved" value={num(reconciliation.auto_resolved)} />
        <StatCard label="Needs operator" tone={reconciliation.needs_operator > 0 ? "text-warn" : "text-soft"} value={num(reconciliation.needs_operator)} />
        <StatCard label="Pushed" value={num(reconciliation.pushed)} />
        <StatCard label="Pending pushes" value={num(reconciliation.pending_pushes)} />
      </div>
    </>
  );
}

function ValidationDetail({
  busy,
  onAction,
  projections,
  sync,
}: {
  busy: boolean;
  onAction: (action: DashboardAction) => void;
  projections: ReturnType<typeof syncActionProjections>;
  sync: HarnessStateSyncReadModel;
}) {
  const staging = sync.staging;
  return (
    <>
      <SyncStalenessCard
        busy={busy}
        cancelProjection={projections.cancel}
        onAction={onAction}
        staleness={sync.staleness}
      />
      <div className="mt-3 grid grid-cols-2 gap-2 @[760px]:grid-cols-3">
        <StatCard label="Upstream commits merged" value={staging ? num(staging.commits_behind) : "-"} />
        <StatCard label="Minor auto-resolved" value={staging ? num(staging.minor_auto_resolved_count) : "-"} />
        <StatCard
          label="Awaiting operator"
          tone={staging?.conflicts_awaiting_operator ? "text-warn" : "text-soft"}
          value={staging ? num(staging.conflicts_awaiting_operator) : "-"}
        />
      </div>
    </>
  );
}

function PublicationDetail({ sync }: { sync: HarnessStateSyncReadModel }) {
  return (
    <>
      <div className="grid grid-cols-1 gap-2 @[640px]:grid-cols-3">
        <StatCard
          label="Prior head"
          value={<span title={sync.publish_preview.prior_head}>{shortId(sync.publish_preview.prior_head)}</span>}
        />
        <StatCard
          label="New head"
          value={<span title={sync.publish_preview.new_head}>{shortId(sync.publish_preview.new_head)}</span>}
        />
        <StatCard label="Series pushes" value={num(sync.publish_preview.series_pushes)} />
      </div>
      <SyncPublicationCard sync={sync} />
    </>
  );
}

function StageContent({
  busy,
  onAction,
  projections,
  stage,
  sync,
}: {
  busy: boolean;
  onAction: (action: DashboardAction) => void;
  projections: ReturnType<typeof syncActionProjections>;
  stage: string;
  sync: HarnessStateSyncReadModel;
}) {
  if (stage === "requested" || stage === "ingesting") return <IntakeDetail sync={sync} />;
  if (stage === "reconciling") {
    return <ReconciliationDetail busy={busy} onAction={onAction} projections={projections} sync={sync} />;
  }
  if (stage === "validating") {
    return <ValidationDetail busy={busy} onAction={onAction} projections={projections} sync={sync} />;
  }
  if (stage === "publishing" || stage === "published") return <PublicationDetail sync={sync} />;
  return <div className="border border-dashed border-line2 bg-card p-4 text-sm text-dim">Unknown sync stage: {stage}</div>;
}

export function SyncStageDetailPage(props: SyncStageDetailPageProps) {
  const harnessState = props.view.harnessState;
  const sync = harnessState?.sync ?? null;
  const repoSync = harnessState?.repo_sync ?? null;
  const projections = syncActionProjections(harnessState);
  const knownStage = SYNC_STAGES.some((candidate) => candidate.id === props.stage)
    ? props.stage as SyncStageId
    : null;
  const lastStage = useRef<{ stage: SyncStageId; workflowId: string }>({
    stage: syncStageForStatus(sync?.status) ?? knownStage ?? "requested",
    workflowId: sync?.workflow_id ?? "",
  });
  if (sync && lastStage.current.workflowId !== sync.workflow_id) {
    lastStage.current = {
      stage: syncStageForStatus(sync.status) ?? knownStage ?? "requested",
      workflowId: sync.workflow_id,
    };
  } else if (sync) {
    const currentStage = syncStageForStatus(sync.status);
    if (currentStage) lastStage.current.stage = currentStage;
  }
  const stageState = knownStage && sync ? syncStageStates(sync.status, lastStage.current.stage)[knownStage] : "todo";
  const stageStateLabel = stageState === "todo" ? "upcoming" : stageState;
  const stageStateTone = stageState === "done" ? "status-tag-live" : stageState === "current" ? "status-tag-warn" : "";

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <Button icon={<ChevronLeft size={13} />} onClick={() => props.nav.goToCycle(props.cycleFocus, "sync")} type="button">
            Back to Sync
          </Button>
          <h3 className="m-0 text-lg font-bold text-fg">Sync · {prettyStatus(props.stage)}</h3>
        </div>
        <span className={`status-tag ${stageStateTone}`}><span className="lamp" />{stageStateLabel}</span>
      </div>

      <PanelSection>
        <PanelTitle>{prettyStatus(props.stage)} Stage</PanelTitle>
        {sync ? (
          <StageContent
            busy={props.busy}
            onAction={props.onAction}
            projections={projections}
            stage={props.stage}
            sync={sync}
          />
        ) : (
          <div className="grid gap-3">
            <div className="border border-line bg-inset px-3 py-2 text-xs text-dim">No sync workflow is active. This stage has no live workflow data.</div>
            <RepoSyncIdleCard
              busy={props.busy}
              onAction={props.onAction}
              repoSync={repoSync}
              startProjection={projections.start}
            />
          </div>
        )}
      </PanelSection>

      <PanelSection>
        <PanelTitle>Operation Activity</PanelTitle>
        <OperationActivity dashboard={props.dashboard} />
      </PanelSection>

      <PanelSection>
        <PanelTitle>Sync Actions</PanelTitle>
        <SyncActionsGrid busy={props.busy} onAction={props.onAction} projections={projections} />
      </PanelSection>
    </div>
  );
}
