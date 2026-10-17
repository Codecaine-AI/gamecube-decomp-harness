import { useCallback, useEffect, useRef, useState } from "react";
import { fetchEvidenceReviews } from "@/lib/api";
import type { EvidenceReview, EvidenceReviewStatusFilter, FormState } from "@/lib/format";

type ReviewsForm = Pick<FormState, "gameId" | "usePathOverrides" | "repoRoot" | "stateDir" | "graphDbPath">;

export interface EvidenceReviewsState {
  loading: boolean;
  reviews: EvidenceReview[];
  error: string;
}

export function useEvidenceReviews(form: ReviewsForm, status: EvidenceReviewStatusFilter) {
  const requestId = useRef(0);
  const [state, setState] = useState<EvidenceReviewsState>({ loading: true, reviews: [], error: "" });

  const reload = useCallback(async () => {
    const currentRequestId = requestId.current + 1;
    requestId.current = currentRequestId;
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const payload = await fetchEvidenceReviews(form, status);
      if (requestId.current === currentRequestId) setState({ loading: false, reviews: payload.reviews, error: "" });
    } catch (error) {
      if (requestId.current === currentRequestId) {
        setState({ loading: false, reviews: [], error: error instanceof Error ? error.message : String(error) });
      }
    }
  }, [form.gameId, form.stateDir, form.repoRoot, form.graphDbPath, form.usePathOverrides, status]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { state, reload };
}
