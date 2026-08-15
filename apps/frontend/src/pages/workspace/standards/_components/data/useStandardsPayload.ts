import { useCallback, useEffect, useRef, useState } from "react";
import { fetchStandards } from "@/lib/api";
import type { FormState, StandardsPayload } from "@/lib/format";

type StandardsForm = Pick<FormState, "gameId" | "usePathOverrides" | "repoRoot" | "stateDir" | "graphDbPath">;

export interface StandardsState {
  loading: boolean;
  payload: StandardsPayload | null;
  error: string;
}

export function useStandardsPayload(form: StandardsForm) {
  const requestId = useRef(0);
  const [state, setState] = useState<StandardsState>({ loading: true, payload: null, error: "" });

  const reload = useCallback(async () => {
    const currentRequestId = requestId.current + 1;
    requestId.current = currentRequestId;
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const payload = await fetchStandards(form);
      if (requestId.current === currentRequestId) setState({ loading: false, payload, error: "" });
      return payload;
    } catch (error) {
      if (requestId.current === currentRequestId) {
        setState({ loading: false, payload: null, error: error instanceof Error ? error.message : String(error) });
      }
      return null;
    }
  }, [form.gameId, form.stateDir, form.repoRoot, form.graphDbPath, form.usePathOverrides]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { state, reload };
}
