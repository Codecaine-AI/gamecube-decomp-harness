import { useState } from "react";
import { Button } from "@/components/primitives";
import { Check, X } from "@/icons";
import { postEvidenceReviewDecision } from "@/lib/api";
import type { EvidenceReview, EvidenceReviewDecision, EvidenceReviewDecisionResult, FormState } from "@/lib/format";
import { decisionBody } from "@/pages/workspace/reviews/_lib/model";

export type DecisionFormProps = {
  form: FormState;
  review: EvidenceReview;
  onDecided: (result: EvidenceReviewDecisionResult) => void;
};

export function DecisionForm({ form, review, onDecided }: DecisionFormProps) {
  const gameId = form.gameId || review.game;
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<EvidenceReviewDecision | null>(null);
  const [error, setError] = useState("");
  const ready = decisionBody(gameId, review, "approved", note) !== null;

  async function decide(decision: EvidenceReviewDecision) {
    const body = decisionBody(gameId, review, decision, note);
    if (!body || pending) return;
    setPending(decision);
    setError("");
    try {
      const result = await postEvidenceReviewDecision(form, body);
      setNote("");
      onDecided(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="grid gap-2">
      <label className="block text-[10px] uppercase tracking-[0.08em] text-dim">
        <span>Decision note (required)</span>
        <textarea
          className="mt-1.5 block min-h-16 w-full resize-y border border-line bg-inset px-2 py-1.5 text-[13px] normal-case tracking-normal text-fg"
          disabled={pending !== null}
          onChange={(event) => setNote(event.currentTarget.value)}
          placeholder="Why this construct is or is not behaviour-identical"
          spellCheck={false}
          value={note}
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={!ready || pending !== null} icon={<Check size={14} />} onClick={() => void decide("approved")} title="Write a site-bound approval and put the target back on the board" tone="primary" type="button">
          {pending === "approved" ? "Approving" : "Approve"}
        </Button>
        <Button disabled={!ready || pending !== null} icon={<X size={14} />} onClick={() => void decide("rejected")} title="Reject this construct; the gate keeps refusing it" tone="danger" type="button">
          {pending === "rejected" ? "Rejecting" : "Reject"}
        </Button>
        {!ready && pending === null ? <span className="text-xs text-dim">A note is required to decide.</span> : null}
      </div>
      {error ? <div className="border border-down/40 bg-down/5 px-2.5 py-1.5 text-xs text-down" role="alert">{error}</div> : null}
    </div>
  );
}
