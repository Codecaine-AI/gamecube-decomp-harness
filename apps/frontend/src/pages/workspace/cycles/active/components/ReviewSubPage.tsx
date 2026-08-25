import { ExternalLink } from "@/icons";
import { num } from "@/lib/format";
import { Button, EmptyState, PanelSection } from "@/components/primitives";
import { prettyStatus } from "@/pages/workspace/_lib/model";
import type { CycleView, PrFlowRecord } from "@/pages/workspace/_lib/types";

function isInReview(record: PrFlowRecord): boolean {
  return record.status === "open" || record.status === "changes_requested" || Boolean(record.reviewSubState);
}

function reviewStatus(record: PrFlowRecord): { label: string; tone: string } {
  if (record.reviewSubState === "changes_requested") return { label: "changes requested", tone: "text-down" };
  if (record.reviewSubState === "new_comments") return { label: "new comments", tone: "text-warn" };
  if (record.reviewSubState === "fixing") return { label: "fixing", tone: "text-warn" };
  return { label: "awaiting", tone: "text-dim" };
}

export function ReviewSubPage({ busy, onSetReviewState, view }: { busy: boolean; onSetReviewState: (branch: string, subState: string) => void; view: CycleView }) {
  const inReview = view.prRecords.filter(isInReview);
  if (inReview.length === 0) return <EmptyState>No PR slices are in review. Drafts awaiting upstream feedback appear here.</EmptyState>;
  return (
    <div className="grid gap-3">
      {inReview.map((record) => {
        const sub = reviewStatus(record);
        return (
          <PanelSection key={`${record.source}-${record.branch}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="overflow-hidden text-ellipsis whitespace-nowrap text-sm text-fg" title={record.title || record.displayName}>{record.displayName}</div>
                <div className="mt-1 text-xs text-dim">
                  <span className={sub.tone}>{sub.label || prettyStatus(record.status)}</span>
                  {Number.isFinite(record.prNumber) ? ` / #${record.prNumber}` : ""}
                  {record.comments > 0 ? ` / ${num(record.comments)} comment${record.comments === 1 ? "" : "s"}` : ""}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {(record.reviewSubState === "new_comments" || record.reviewSubState === "changes_requested") ? (
                  <Button disabled={busy} onClick={() => onSetReviewState(record.branch, "awaiting")} title="Mark these comments as seen." type="button">Ack</Button>
                ) : null}
                {record.reviewSubState !== "fixing" ? (
                  <Button disabled={busy} onClick={() => onSetReviewState(record.branch, "fixing")} title="Mark that you are addressing the review feedback." type="button">Fixing</Button>
                ) : (
                  <Button disabled={busy} onClick={() => onSetReviewState(record.branch, "awaiting")} title="Clear the fixing flag." type="button">Clear Fixing</Button>
                )}
                {record.url ? (
                  <a className="pr-card-link" href={record.url} rel="noreferrer" target="_blank" title="Open on GitHub">View PR <ExternalLink size={11} /></a>
                ) : null}
              </div>
            </div>
          </PanelSection>
        );
      })}
    </div>
  );
}
