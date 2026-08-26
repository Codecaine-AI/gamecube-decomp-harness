import { useRef } from "react";

import { OperationActivity } from "@/components/details-rail/_components/operation-activity";
import { PanelSection, PanelTitle } from "@/components/primitives";
import { shortId, type Dashboard } from "@/lib/format";
import {
  SyncIngestFlow,
  SyncStagePipeline,
  SyncStatusTag,
  syncStageForStatus,
  type SyncStageId,
} from "@/pages/workspace/_components/sync";
import { prettyStatus } from "@/pages/workspace/_lib/model";
import type { CycleView } from "@/pages/workspace/_lib/types";

export function SyncModePage({
  busy,
  dashboard,
  onSelectStage,
  view,
}: {
  busy: boolean;
  dashboard: Dashboard | null;
  onSelectStage: (stage: string) => void;
  view: CycleView;
}) {
  const sync = view.harnessState?.sync ?? null;
  const repoSync = view.harnessState?.repo_sync ?? null;
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
      <div className="flex flex-wrap items-center gap-2 border-b border-line pb-2 text-[11px]">
        <SyncStatusTag repoSync={repoSync} sync={null} />
        <span className="font-mono text-dim">
          {busy
            ? "Pulling things down…"
            : repoSync?.needs_sync
            ? `Cycle head is behind ${repoSync.upstream_ref}; start a sync from the details rail.`
            : "No sync workflow is active."}
        </span>
      </div>
    );
  }

  const interrupted = sync.status === "blocked" || sync.status === "cancelled";
  const upstreamOpen = Number.isFinite(view.prSummary.upstreamOpen) ? view.prSummary.upstreamOpen : null;
  return (
    <div className="grid gap-4 @[820px]:grid-cols-[210px_1fr]">
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
          orientation="vertical"
          status={sync.status}
        />
      </PanelSection>

      <div className="grid content-start gap-4">
        <SyncIngestFlow busy={busy} sync={sync} upstreamOpen={upstreamOpen} />

        {sync.publication ? (
          <div className="font-mono text-[11px] text-dim">
            published · <span title={sync.publication.prior_head}>{shortId(sync.publication.prior_head)}</span>
            {" -> "}
            <span title={sync.publication.new_head}>{shortId(sync.publication.new_head)}</span>
          </div>
        ) : null}

        <OperationActivity dashboard={dashboard} />
      </div>
    </div>
  );
}
