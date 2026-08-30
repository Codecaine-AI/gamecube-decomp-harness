import { useEffect, useState } from "react";
import { type KernelTraceSessionDetail, type KernelTraceSessionSummary } from "@agent-kernel/viewer-core";
import {
  fetchKernelStatus,
  fetchKernelTraceSessionDetail,
  fetchKernelTraceSessions,
  fetchCycleState,
} from "@/lib/api";
import { asArray, asObject, shortId, text, type FormState, type JsonObject } from "@/lib/format";
import type { CycleView } from "@/pages/workspace/_lib/types";
import { TraceDetailViewer } from "@/pages/workspace/trace/detail-viewer";
import { traceSelectionUrl } from "./game-event-model";

interface TraceCycle {
  id: string;
  gameId: string;
  cycleUuid: string;
  status: string;
  phase: string;
  activeSubphase: string;
  createdAt: string;
  updatedAt: string;
  kernelTrace: JsonObject;
}

function selectedTraceIdFromLocation(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("traceId") ?? params.get("containerId");
  } catch {
    return null;
  }
}

function selectedSessionIdFromLocation(): string | null {
  try {
    return new URLSearchParams(window.location.search).get("sessionId");
  } catch {
    return null;
  }
}

function replaceTraceSelectionInUrl(
  sessionId: string | null,
  trace: KernelTraceSessionSummary | null,
): void {
  try {
    const nextUrl = traceSelectionUrl(window.location.href, {
      sessionId,
      traceId: trace?.id ?? null,
      containerId: trace?.containerId ?? null,
    });
    window.history.replaceState(null, "", nextUrl);
  } catch {
    // Trace selection still works if URL mutation is unavailable.
  }
}

function isActiveTrace(status: string): boolean {
  return status === "queued" || status === "running";
}

function traceMatchesId(trace: KernelTraceSessionSummary, id: string): boolean {
  const metadata = asObject(trace.metadata);
  return trace.id === id
    || trace.containerId === id
    || text(metadata.appSessionSlug, text(metadata.app_session_slug)) === id;
}

function traceSessionCandidates(trace: KernelTraceSessionSummary): string[] {
  const metadata = asObject(trace.metadata);
  return [
    trace.id,
    trace.containerId,
    text(metadata.appSessionSlug),
    text(metadata.app_session_slug),
    text(metadata.appSessionId),
    text(metadata.app_session_id),
    text(metadata.cycleUuid),
    text(metadata.cycle_uuid),
    text(metadata.sessionId),
    text(metadata.rootContainerId),
    text(metadata.root_container_id),
    text(metadata.activeContainerId),
    text(metadata.active_container_id),
    text(metadata.runId),
  ].filter(Boolean);
}

function cycleTraceCandidates(cycle: TraceCycle): string[] {
  const trace = asObject(cycle.kernelTrace);
  return [
    cycle.cycleUuid,
    cycle.id,
    text(trace.appSessionId),
    text(trace.app_session_id),
    text(trace.rootContainerId),
    text(trace.root_container_id),
    text(trace.activeContainerId),
    text(trace.active_container_id),
  ].filter(Boolean);
}

function traceMatchesCycle(trace: KernelTraceSessionSummary, cycle: TraceCycle): boolean {
  const traceCandidates = new Set(traceSessionCandidates(trace));
  return cycleTraceCandidates(cycle).some((candidate) => traceCandidates.has(candidate));
}

function traceMatchesGameId(trace: KernelTraceSessionSummary, gameId: string): boolean {
  if (!gameId) return true;
  const metadata = asObject(trace.metadata);
  return text(metadata.gameId, text(metadata.game_id)) === gameId;
}

function timestampMs(value: unknown): number {
  const raw = text(value);
  if (!raw) return 0;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function traceTimestamp(trace: KernelTraceSessionSummary): number {
  return timestampMs(trace.latestEventAt ?? trace.updatedAt ?? trace.createdAt);
}

function sortedTraceSessions(cycles: KernelTraceSessionSummary[]): KernelTraceSessionSummary[] {
  return [...cycles].sort((left, right) => traceTimestamp(right) - traceTimestamp(left));
}

function prettyLabel(value: string): string {
  return value.replace(/_/g, " ");
}

function activeSubphaseFromRow(row: JsonObject): string {
  const direct = text(row.activeSubphase, text(row.active_subphase));
  if (direct) return direct;
  const phase = text(row.phase);
  const phaseState = asObject(row[`${phase}_state_json`]);
  return text(phaseState.subphase);
}

function cycleFromRow(row: JsonObject): TraceCycle | null {
  const cycleUuid = text(row.cycleUuid, text(row.cycle_uuid));
  if (!cycleUuid) return null;
  return {
    id: text(row.id, `cycle:${cycleUuid}`),
    gameId: text(row.gameId, text(row.game_id)),
    cycleUuid,
    status: text(row.status, "active"),
    phase: text(row.phase, "preparing"),
    activeSubphase: activeSubphaseFromRow(row),
    createdAt: text(row.createdAt, text(row.created_at)),
    updatedAt: text(row.updatedAt, text(row.updated_at)),
    kernelTrace: asObject(row.kernelTrace ?? row.kernel_trace_json),
  };
}

function cyclesFromPayload(payload: { cycle: JsonObject | null; history: JsonObject[] } | null, view: CycleView): TraceCycle[] {
  const rows = payload ? [...asArray(payload.history).map(asObject)] : [];
  const active = asObject(payload?.cycle);
  if (Object.keys(active).length > 0) rows.unshift(active);
  const byUuid = new Map<string, TraceCycle>();
  for (const row of rows) {
    const cycle = cycleFromRow(row);
    if (cycle && !byUuid.has(cycle.cycleUuid)) byUuid.set(cycle.cycleUuid, cycle);
  }
  if (byUuid.size === 0 && view.activeCycleId) {
    byUuid.set(view.activeCycleId, {
      id: `cycle:${view.activeCycleId}`,
      gameId: text(view.game?.id),
      cycleUuid: view.activeCycleId,
      status: "active",
      phase: text(view.canonicalPhase, view.mode === "none" ? "cycle" : view.mode),
      activeSubphase: text(view.canonicalSubphase),
      createdAt: "",
      updatedAt: "",
      kernelTrace: {},
    });
  }
  return [...byUuid.values()].sort((left, right) => timestampMs(right.createdAt) - timestampMs(left.createdAt));
}

function cyclePhaseLabel(cycle: TraceCycle): string {
  return [cycle.phase, cycle.activeSubphase].filter(Boolean).map(prettyLabel).join(" / ");
}

function cycleTitle(cycle: TraceCycle): string {
  return `Cycle ${shortId(cycle.cycleUuid)}`;
}

function cycleStatusClass(status: string): string {
  if (status === "active") return "border-status-info-border bg-status-info-fill text-status-info";
  if (status === "complete" || status === "completed") return "border-status-success-border bg-status-success-fill text-status-success";
  if (status === "blocked" || status === "error" || status === "failed") return "border-destructive/40 bg-destructive/10 text-destructive";
  return "border-status-neutral-border bg-status-neutral-fill text-status-neutral";
}

function chooseCycleId(
  cycles: TraceCycle[],
  gameTraces: KernelTraceSessionSummary[],
  view: CycleView,
  preferredSessionId: string | null,
  preferredTraceId: string | null,
): string | null {
  if (preferredSessionId && cycles.some((cycle) => cycle.cycleUuid === preferredSessionId)) return preferredSessionId;
  if (preferredTraceId) {
    const trace = gameTraces.find((candidate) => traceMatchesId(candidate, preferredTraceId));
    const matchingSession = trace ? cycles.find((cycle) => traceMatchesCycle(trace, cycle)) : null;
    if (matchingSession) return matchingSession.cycleUuid;
  }
  if (view.activeCycleId && cycles.some((cycle) => cycle.cycleUuid === view.activeCycleId)) return view.activeCycleId;
  return cycles[0]?.cycleUuid ?? null;
}

function chooseTraceSessionId(cycles: KernelTraceSessionSummary[], preferredId: string | null): string | null {
  if (preferredId && cycles.some((trace) => traceMatchesId(trace, preferredId))) return preferredId;
  const runningTrace = cycles.find((trace) => isActiveTrace(trace.status));
  return runningTrace?.id ?? cycles[0]?.id ?? cycles[0]?.containerId ?? null;
}

function tracesForSession(gameTraces: KernelTraceSessionSummary[], cycle: TraceCycle | null): KernelTraceSessionSummary[] {
  if (!cycle) return [];
  return sortedTraceSessions(gameTraces.filter((trace) => traceMatchesCycle(trace, cycle)));
}

export function TracePage({ form, view }: { form: FormState; view: CycleView }) {
  const [cycles, setCycles] = useState<TraceCycle[]>([]);
  const [gameTraceSessions, setGameTraceSessions] = useState<KernelTraceSessionSummary[]>([]);
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);
  const [selectedTraceSessionId, setSelectedTraceSessionId] = useState<string | null>(null);
  const [detail, setDetail] = useState<KernelTraceSessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const selectedSession = cycles.find((cycle) => cycle.cycleUuid === selectedCycleId) ?? null;
  const selectedSessionTraces = tracesForSession(gameTraceSessions, selectedSession);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const [nextStatus, cycleState] = await Promise.all([
          fetchKernelStatus(),
          fetchCycleState(form).catch(() => null),
        ]);
        if (cancelled) return;

        const cycles = cyclesFromPayload(cycleState, view);
        const gameId = text(view.game?.id, form.gameId);
        const kernelList = nextStatus.enabled ? await fetchKernelTraceSessions() : { trace_sessions: [] };
        if (cancelled) return;

        const gameTraces = sortedTraceSessions(kernelList.trace_sessions.filter((trace) => traceMatchesGameId(trace, gameId)));
        const sessionId = chooseCycleId(
          cycles,
          gameTraces,
          view,
          selectedSessionIdFromLocation(),
          selectedTraceIdFromLocation(),
        );
        const sessionTraces = tracesForSession(gameTraces, cycles.find((cycle) => cycle.cycleUuid === sessionId) ?? null);
        const traceId = chooseTraceSessionId(sessionTraces, selectedTraceIdFromLocation());

        setCycles(cycles);
        setGameTraceSessions(gameTraces);
        setSelectedCycleId(sessionId);
        setSelectedTraceSessionId(traceId);
        setDetail(traceId ? await fetchKernelTraceSessionDetail(traceId) : null);
        replaceTraceSelectionInUrl(
          sessionId,
          traceId ? sessionTraces.find((trace) => traceMatchesId(trace, traceId)) ?? null : null,
        );
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [form, view.activeCycleId, view.game?.id]);

  async function selectCycle(sessionId: string) {
    const sessionTraces = tracesForSession(gameTraceSessions, cycles.find((cycle) => cycle.cycleUuid === sessionId) ?? null);
    const traceId = chooseTraceSessionId(sessionTraces, null);
    setSelectedCycleId(sessionId);
    setSelectedTraceSessionId(traceId);
    replaceTraceSelectionInUrl(
      sessionId,
      traceId ? sessionTraces.find((trace) => traceMatchesId(trace, traceId)) ?? null : null,
    );
    setLoading(true);
    setError("");
    try {
      setDetail(traceId ? await fetchKernelTraceSessionDetail(traceId) : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="kernel-reference-workspace min-h-0 flex-1 overflow-auto bg-background p-4 font-sans text-foreground">
      {error ? (
        <div role="alert" className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3.5 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      <section className="grid min-h-[680px] min-w-0 grid-cols-[minmax(0,1fr)] overflow-hidden rounded-lg border border-border bg-card xl:h-[calc(100vh-2rem)] xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="flex min-h-[320px] min-w-0 flex-col border-b border-border xl:min-h-0 xl:border-b-0 xl:border-r">
          <div className="border-b border-border px-4 py-3">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate font-display text-lg font-bold leading-tight">Cycles</h2>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {cycles.length} game {cycles.length === 1 ? "cycle" : "cycles"}
                </p>
              </div>
              {loading ? (
                <span role="status" className="shrink-0 rounded-[2px] border border-border px-2 py-1 text-xs text-muted-foreground">
                  Loading
                </span>
              ) : null}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {cycles.length === 0 && !loading ? (
              <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                No cycles yet.
              </div>
            ) : (
              <div className="min-w-0">
                <div className="sticky top-0 z-10 grid grid-cols-[minmax(0,1fr)_76px_58px] gap-2 border-b border-border bg-card/95 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  <span>Cycle</span>
                  <span className="text-right">State</span>
                  <span className="text-right">Trace</span>
                </div>
                {cycles.map((cycle) => {
                  const selected = cycle.cycleUuid === selectedCycleId;
                  const traceCount = tracesForSession(gameTraceSessions, cycle).length;
                  const phaseLabel = cyclePhaseLabel(cycle);
                  return (
                    <button
                      key={cycle.cycleUuid}
                      type="button"
                      onClick={() => void selectCycle(cycle.cycleUuid)}
                      className={`relative grid w-full min-w-0 grid-cols-[minmax(0,1fr)_76px_58px] items-center gap-2 border-b border-border/70 px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-status-info-border ${
                        selected
                          ? "bg-status-info-fill/30 text-foreground before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-status-info-border"
                          : "text-muted-foreground hover:bg-muted/35 hover:text-foreground"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-bold leading-5">{cycleTitle(cycle)}</span>
                        <span className="block truncate font-mono text-[11px] leading-4 text-muted-foreground">
                          {cycle.cycleUuid}
                        </span>
                        {phaseLabel ? (
                          <span className="mt-1 block truncate text-[11px] uppercase leading-4 text-muted-foreground">
                            {phaseLabel}
                          </span>
                        ) : null}
                      </span>
                      <span className={`justify-self-end rounded-[2px] border px-1.5 py-0.5 text-[10px] font-bold uppercase ${cycleStatusClass(cycle.status)}`}>
                        {cycle.status}
                      </span>
                      <span className="justify-self-end text-[11px] font-bold text-muted-foreground">
                        {traceCount}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>
        <div className="min-h-[520px] overflow-hidden xl:min-h-0">
          {loading && !detail ? (
            <div role="status" className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Loading kernel trace...
            </div>
          ) : !selectedSession ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Select a cycle.
            </div>
          ) : selectedSessionTraces.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No kernel traces for this cycle yet.
            </div>
          ) : !detail ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Select a trace.
            </div>
          ) : (
            <TraceDetailViewer detail={detail} />
          )}
        </div>
      </section>
    </div>
  );
}
