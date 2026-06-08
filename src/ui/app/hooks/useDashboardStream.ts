import { useCallback, useEffect, useRef, useState } from "react";
import { dashboardParams, fetchDashboard } from "../lib/api";
import type { Dashboard, FormState } from "../types";

interface UseDashboardStreamOptions {
  enabled: boolean;
  form: Pick<FormState, "repoRoot" | "stateDir">;
  intervalMs: number;
  onError: (error: Error) => void;
}

interface DashboardTick {
  elapsedMs?: number;
  lastReportAgeMs?: number | null;
}

function applyTick(dashboard: Dashboard | null, tick: DashboardTick): Dashboard | null {
  if (!dashboard) return dashboard;
  return {
    ...dashboard,
    runSummary: {
      ...dashboard.runSummary,
      elapsedMs: Number.isFinite(Number(tick.elapsedMs)) ? Number(tick.elapsedMs) : dashboard.runSummary.elapsedMs,
      lastReportAgeMs: tick.lastReportAgeMs ?? dashboard.runSummary.lastReportAgeMs,
    },
  };
}

export function useDashboardStream({ enabled, form, intervalMs, onError }: UseDashboardStreamOptions) {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [streamState, setStreamState] = useState<"idle" | "connecting" | "live" | "fallback">("idle");
  const streamRef = useRef<EventSource | null>(null);
  const fallbackRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.close();
    streamRef.current = null;
    if (fallbackRef.current) clearInterval(fallbackRef.current);
    fallbackRef.current = null;
  }, []);

  const refresh = useCallback(async () => {
    const snapshot = await fetchDashboard(form);
    setDashboard(snapshot);
  }, [form]);

  useEffect(() => {
    if (!enabled || !form.repoRoot || !form.stateDir) return;
    stop();
    setStreamState("connecting");

    if (typeof EventSource === "undefined") {
      setStreamState("fallback");
      void refresh().catch(onError);
      fallbackRef.current = setInterval(() => {
        void refresh().catch(onError);
      }, intervalMs);
      return stop;
    }

    const stream = new EventSource(`/api/dashboard/events?${dashboardParams(form)}`);
    streamRef.current = stream;
    stream.addEventListener("ready", () => setStreamState("live"));
    stream.addEventListener("dashboard", (event) => {
      try {
        setDashboard(JSON.parse(event.data) as Dashboard);
      } catch (error) {
        onError(error instanceof Error ? error : new Error(String(error)));
      }
    });
    stream.addEventListener("dashboard-tick", (event) => {
      try {
        const tick = JSON.parse(event.data) as DashboardTick;
        setDashboard((current) => applyTick(current, tick));
      } catch (error) {
        onError(error instanceof Error ? error : new Error(String(error)));
      }
    });
    stream.addEventListener("dashboard-error", (event) => {
      try {
        const data = JSON.parse(event.data) as { error?: string };
        onError(new Error(data.error || "Dashboard stream failed"));
      } catch (error) {
        onError(error instanceof Error ? error : new Error(String(error)));
      }
    });
    stream.addEventListener("error", () => {
      setStreamState("connecting");
    });

    return stop;
  }, [enabled, form, intervalMs, onError, refresh, stop]);

  const manualRefresh = useCallback(async () => {
    await refresh();
  }, [refresh]);

  return { dashboard, manualRefresh, setDashboard, streamState };
}
