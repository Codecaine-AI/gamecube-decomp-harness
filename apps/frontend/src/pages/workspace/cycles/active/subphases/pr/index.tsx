import { num, text, type Dashboard } from "@/lib/format";
import {
  EmptyState,
  InfoRows,
  List,
  PanelSection,
  PanelTitle,
} from "@/components/primitives";
import type {
  DashboardAction,
  CycleView,
} from "@/pages/workspace/_lib/types";
import { PrModeActions } from "./components/PrModeActions";
import { PrCampaignCard } from "./components/PrCampaignCard";
import { PrPipelineStepper } from "./components/PrPipelineStepper";
import { PrStageBoard } from "./components/PrStageBoard";

export function PrModePage({
  busy,
  dashboard,
  onAction,
  onOpenPr,
  onPrepareLocalPr,
  onSetReviewState,
  view,
}: {
  busy: boolean;
  dashboard: Dashboard | null;
  onAction: (action: DashboardAction) => void;
  onOpenPr: (branch: string) => void;
  onPrepareLocalPr: (branch: string) => void;
  onSetReviewState: (branch: string, subState: string) => void;
  view: CycleView;
}) {
  const splitPlan = view.prSummary.splitPlan;
  const qa = view.prSummary.qa;
  const qaRepair = view.prSummary.qaRepair;
  const checkpoint = view.prSummary.checkpoint;
  const sliceCount = view.prRecords.length;
  return (
    <div className="grid gap-4">
      {view.prBlockedReasons.length > 0 ? (
        <PanelSection className="border-warn/50 bg-warn/5">
          <PanelTitle>Blockers</PanelTitle>
          <List
            values={view.prBlockedReasons}
            empty="No PR blockers detected."
          />
        </PanelSection>
      ) : null}
      <PrCampaignCard busy={busy} onAction={onAction} harnessState={view.harnessState} />
      <PrModeActions busy={busy} onAction={onAction} view={view} />
      <PanelSection>
        <PrStageBoard
          busy={busy}
          onOpenPr={onOpenPr}
          onPrepareLocalPr={onPrepareLocalPr}
          onSetReviewState={onSetReviewState}
          view={view}
        />
        {view.prSummary.warning ? (
          <p className="mb-0 mt-3 text-xs text-warn">
            {view.prSummary.warning}
          </p>
        ) : null}
      </PanelSection>
      {dashboard ? null : <EmptyState>Waiting for dashboard data.</EmptyState>}
    </div>
  );
}

export { PrModeActions } from "./components/PrModeActions";
export { prStage, prSubStatus } from "./components/prStatus";
