import { useRef } from "react";

import { OperationActivity } from "@/components/details-rail/_components/operation-activity";
import { PanelSection, PanelTitle } from "@/components/primitives";
import type { Dashboard } from "@/lib/format";
import {
  RepoSyncIdleCard,
  SyncActionsGrid,
  SyncConflictList,
  SyncIntakeStats,
  SyncPublicationCard,
  SyncStagePipeline,
  SyncStagingProgress,
  SyncStalenessCard,
  SyncStatusTag,
  syncActionProjections,
  syncStageForStatus,
  type SyncStageId,
} from "@/pages/workspace/_components/sync";
import { prettyStatus } from "@/pages/workspace/_lib/model";
import type { CycleView, DashboardAction } from "@/pages/workspace/_lib/types";

export function SyncModePage({
  busy,
  dashboard,
  onAction,
  onSelectStage,
  view,
}: {
  busy: boolean;
  dashboard: Dashboard | null;
  onAction: (action: DashboardAction) => void;
  onSelectStage: (stage: string) => void;
  view: CycleView;
}) {
  const sync = view.harnessState?.sync ?? null;
  const repoSync = view.harnessState?.repo_sync ?? null;
  const projections = syncActionProjections(view.harnessState);
  const lastStage = useRef<{ stage: SyncStageId; workflowId: string }>({
    stage: syncStageForStatus(sync?.status) ?? "requested",
    workflowId: sync?.workflow_id ?? "",
  });
  if (sync && lastStage.current.workflowId !== sync.workflow_id) {
    lastStage.current = {
      stage: syncStageForStatus(sync.status) ?? "requested",
      workflowId: sync.workflow_id,
    };
  } else if (sync) {
    const currentStage = syncStageForStatus(sync.status);
    if (currentStage) lastStage.current.stage = currentStage;
  }

  if (!sync) {
    return (
      <PanelSection>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <PanelTitle className="mb-0">Game Sync</PanelTitle>
          <SyncStatusTag repoSync={repoSync} sync={null} />
        </div>
        <RepoSyncIdleCard
          busy={busy}
          onAction={onAction}
          repoSync={repoSync}
          startProjection={projections.start}
        />
        <SyncActionsGrid busy={busy} onAction={onAction} projections={projections} />
      </PanelSection>
    );
  }

  const interrupted = sync.status === "blocked" || sync.status === "cancelled";
  return (
    <div className="grid gap-4">
      <PanelSection>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <PanelTitle className="mb-0">Sync Pipeline</PanelTitle>
          {interrupted ? (
            <span className={`status-tag ${sync.status === "blocked" ? "status-tag-warn" : "border-down/50 bg-down/10 text-down"}`}>
              <span className="lamp" />
              {prettyStatus(sync.status)}
            </span>
          ) : null}
        </div>
        <SyncStagePipeline
          lastKnownStage={lastStage.current.stage}
          onSelectStage={onSelectStage}
          status={sync.status}
        />
      </PanelSection>

      <PanelSection>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <PanelTitle className="mb-0">Game Sync</PanelTitle>
          <SyncStatusTag repoSync={repoSync} sync={sync} />
        </div>
        <SyncIntakeStats sync={sync} />
        <SyncStagingProgress staging={sync.staging} />
        <SyncConflictList
          busy={busy}
          onAction={onAction}
          resolveConflictProjection={projections.resolveConflict}
          staging={sync.staging}
        />
        <SyncStalenessCard
          busy={busy}
          cancelProjection={projections.cancel}
          onAction={onAction}
          staleness={sync.staleness}
        />
        <SyncPublicationCard sync={sync} />
        <div className="mt-3">
          <OperationActivity dashboard={dashboard} />
        </div>
        <SyncActionsGrid busy={busy} onAction={onAction} projections={projections} />
      </PanelSection>
    </div>
  );
}
