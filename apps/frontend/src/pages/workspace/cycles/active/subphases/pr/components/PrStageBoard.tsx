import { num } from "@/lib/format";
import { EmptyState } from "@/components/primitives";
import type { CycleView } from "@/pages/workspace/_lib/types";
import { PR_STAGES, prLockReason, prStage } from "./prStatus";
import { PrStageCard } from "./PrStageCard";

export function PrStageBoard({
  busy,
  onOpenPr,
  onPrepareLocalPr,
  onSetReviewState,
  view,
}: {
  busy: boolean;
  onOpenPr: (branch: string) => void;
  onPrepareLocalPr: (branch: string) => void;
  onSetReviewState: (branch: string, subState: string) => void;
  view: CycleView;
}) {
  const lockReason = prLockReason(view);
  if (view.prRecords.length === 0) {
    return <EmptyState>No PR slices yet. Run Prepare Handoff (or Plan PRs) to build the split plan and seed the board.</EmptyState>;
  }
  return (
    <div className="kanban">
      {PR_STAGES.map((stage) => {
        const records = view.prRecords.filter((record) => prStage(record) === stage.id);
        return (
          <div className="kanban-col" key={stage.id}>
            <header className="kanban-col-head">
              <span className="kanban-col-label">{stage.label}</span>
              <span className="kanban-col-count">{num(records.length)}</span>
            </header>
            <div className="kanban-col-body">
              {records.length === 0 ? (
                <div className="kanban-empty">{stage.hint}</div>
              ) : (
                records.map((record) => (
                  <PrStageCard
                    busy={busy}
                    key={`${record.source}-${record.branch}-${record.displayName}`}
                    lockReason={lockReason}
                    onOpenPr={onOpenPr}
                    onPrepareLocalPr={onPrepareLocalPr}
                    onSetReviewState={onSetReviewState}
                    record={record}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
