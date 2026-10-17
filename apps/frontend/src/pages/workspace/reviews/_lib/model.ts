import type { EvidenceReview, EvidenceReviewDecision, EvidenceReviewDecisionBody, EvidenceReviewStatusFilter } from "@/lib/format";

export const STATUS_FILTERS: ReadonlyArray<{ label: string; value: EvidenceReviewStatusFilter }> = [
  { label: "Open", value: "open" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
  { label: "All", value: "all" },
];

/** `src/foo.cpp:12-18`, or `src/foo.cpp:12` for a one-line site. */
export function siteLabel(review: Pick<EvidenceReview, "site_file" | "site_lines">): string {
  const [start, end] = review.site_lines;
  return start === end ? `${review.site_file}:${start}` : `${review.site_file}:${start}-${end}`;
}

export function shortRev(rev: string): string {
  return rev.slice(0, 10);
}

/** `getX (getX__4TFooFv)`, whichever half is known, or `-`. */
export function calleeLabel(review: Pick<EvidenceReview, "callee" | "callee_symbol">): string {
  if (review.callee && review.callee_symbol && review.callee !== review.callee_symbol) return `${review.callee} (${review.callee_symbol})`;
  return review.callee || review.callee_symbol || "-";
}

/** A decision needs a non-blank note; `null` means the form is not ready to send. */
export function decisionBody(gameId: string, review: Pick<EvidenceReview, "id" | "revision">, decision: EvidenceReviewDecision, note: string): EvidenceReviewDecisionBody | null {
  const trimmed = note.trim();
  if (!gameId || !trimmed) return null;
  return { gameId, id: review.id, revision: review.revision, decision, note: trimmed };
}

export function statusTone(status: EvidenceReview["status"]): string {
  return status === "approved" ? "text-up" : status === "rejected" ? "text-down" : "text-warn";
}
