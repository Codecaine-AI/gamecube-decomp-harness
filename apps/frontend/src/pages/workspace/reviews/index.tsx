import { useState } from "react";
import { Button, EmptyState, PageHeader } from "@/components/primitives";
import { RefreshCw } from "@/icons";
import type { EvidenceReviewDecisionResult, EvidenceReviewStatusFilter, FormState } from "@/lib/format";
import { ReviewCard } from "./_components/ReviewCard";
import { STATUS_FILTERS } from "./_lib/model";
import { useEvidenceReviews } from "./_lib/useEvidenceReviews";

type DecisionNotice = { tone: string; text: string };

function noticeFor(result: EvidenceReviewDecisionResult): DecisionNotice {
  const verb = result.review.status === "approved" ? "Approved" : "Rejected";
  const tone = result.requeue.status === "deferred" ? "border-warn/40 bg-warn/5 text-warn" : "border-up/40 bg-up/5 text-up";
  return { tone, text: `${verb} ${result.review.symbol}. ${result.requeue.message}` };
}

export function ReviewsPage({ form, gameName }: { form: FormState; gameName: string }) {
  const [status, setStatus] = useState<EvidenceReviewStatusFilter>("open");
  const [notice, setNotice] = useState<DecisionNotice | null>(null);
  const { state, reload } = useEvidenceReviews(form, status);

  function handleDecided(result: EvidenceReviewDecisionResult) {
    setNotice(noticeFor(result));
    void reload();
  }

  return (
    <>
      <PageHeader
        kicker={gameName}
        right={
          <Button disabled={state.loading} icon={<RefreshCw size={14} />} onClick={() => void reload()} title="Reload evidence-review requests" type="button">
            Refresh
          </Button>
        }
        title="Reviews"
      />
      <div className="@container grid min-h-0 flex-1 content-start gap-4 overflow-auto p-4">
        <nav aria-label="Review status" className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((item) => (
            <Button key={item.value} onClick={() => setStatus(item.value)} tone={status === item.value ? "primary" : undefined} type="button">
              {item.label}
            </Button>
          ))}
        </nav>
        <p className="m-0 text-xs text-dim">
          The steering gate sends behaviour-identical constructs it cannot verify here. Approving writes a site-bound approval and puts the target back on the board; it accepts nothing by itself. Every decision needs a note.
        </p>
        {notice ? (
          <div className={`flex items-start gap-3 border px-2.5 py-1.5 text-xs ${notice.tone}`} role="status">
            <span className="min-w-0 flex-1">{notice.text}</span>
            <button className="shrink-0 text-dim hover:text-fg" onClick={() => setNotice(null)} type="button">Dismiss</button>
          </div>
        ) : null}
        {state.error ? <div className="border border-down/40 bg-down/5 px-2.5 py-1.5 text-xs text-down" role="alert">{state.error}</div> : null}
        {state.loading && !state.reviews.length ? <EmptyState>Loading evidence-review requests.</EmptyState> : null}
        {!state.loading && !state.error && !state.reviews.length ? (
          <EmptyState>{status === "all" ? "No evidence-review requests for this game." : `No ${status} evidence-review requests.`}</EmptyState>
        ) : null}
        {state.reviews.map((review) => (
          <ReviewCard form={form} key={review.id} onDecided={handleDecided} review={review} />
        ))}
      </div>
    </>
  );
}
