import { InfoRows, PanelSection } from "@/components/primitives";
import type { EvidenceReview, EvidenceReviewDecisionResult, FormState } from "@/lib/format";
import { calleeLabel, shortRev, siteLabel, statusTone } from "@/pages/workspace/reviews/_lib/model";
import { DecisionForm } from "./_components/DecisionForm";

export type ReviewCardProps = {
  form: FormState;
  review: EvidenceReview;
  onDecided: (result: EvidenceReviewDecisionResult) => void;
};

const PRE_CLASS = "m-0 max-h-72 overflow-auto whitespace-pre border-t border-line p-2 font-mono text-[11px] leading-4 text-soft";

export function ReviewCard({ form, review, onDecided }: ReviewCardProps) {
  const rows: Array<[string, string, string?]> = [
    ["Site", siteLabel(review)],
    ["Base rev", shortRev(review.base_rev)],
    ...(review.trusted_base_rev && review.claim_base_rev
      ? [["Covers bases", `claim ${shortRev(review.claim_base_rev)}, trusted ${shortRev(review.trusted_base_rev)}`] as [string, string]]
      : []),
    ["Callee", calleeLabel(review)],
    ["Occurrences", String(review.occurrences)],
    ["Updated", review.updated_at],
  ];
  if (review.status !== "open") {
    rows.push(["Decided", `${review.decided_by || "unknown"} at ${review.decided_at || "-"}`]);
    rows.push(["Note", review.note || "-", "text-fg"]);
  }

  return (
    <PanelSection className="grid gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-dim" title={review.unit}>{review.unit}</div>
          <div className="mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[13px] text-fg" title={review.symbol}>{review.symbol}</div>
        </div>
        <span className={`status-tag shrink-0 ${statusTone(review.status)}`}>
          <span className="lamp" />
          {review.status}
        </span>
      </div>
      <InfoRows rows={rows} />
      <details className="border border-line bg-card" open>
        <summary className="cursor-pointer px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-dim">Patch</summary>
        <pre className={PRE_CLASS}>{review.patch || "(empty patch)"}</pre>
      </details>
      <details className="border border-line bg-card">
        <summary className="cursor-pointer px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-dim">Cited evidence</summary>
        <pre className={PRE_CLASS}>{JSON.stringify(review.evidence, null, 2)}</pre>
      </details>
      {review.status === "open" || review.status === "approving" ? <DecisionForm form={form} onDecided={onDecided} review={review} /> : null}
    </PanelSection>
  );
}
