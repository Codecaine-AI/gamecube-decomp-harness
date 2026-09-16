import { useEffect, useState } from "react";
import { type KernelTraceSessionDetail, type KernelTraceSessionSummary } from "@agent-kernel/viewer-core";
import { fetchKernelStatus, fetchKernelTraceSessionDetail, fetchKernelTraceSessions } from "@/lib/api";
import { asObject, text, type FormState } from "@/lib/format";
import type { HarnessView } from "@/pages/workspace/_lib/types";
import { TraceDetailViewer } from "@/pages/workspace/trace/detail-viewer";
import { traceSelectionUrl } from "./game-event-model";

export function TracePage({ form, view }: { form: FormState; view: HarnessView }) {
  const [sessions, setSessions] = useState<KernelTraceSessionSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<KernelTraceSessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const gameId = text(view.game?.id, form.gameId);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    void (async () => {
      const status = await fetchKernelStatus();
      const result = status.enabled ? await fetchKernelTraceSessions() : { trace_sessions: [] };
      if (cancelled) return;
      const rows = result.trace_sessions.filter((trace) => text(asObject(trace.metadata).gameId, text(asObject(trace.metadata).game_id)) === gameId);
      setSessions(rows);
      const requestedId = new URLSearchParams(window.location.search).get("traceId");
      const selected = rows.find((trace) => trace.id === requestedId || trace.containerId === requestedId) ?? rows.find((trace) => trace.status === "running") ?? rows[0];
      setSelectedId(selected?.id ?? null);
      const next = selected ? await fetchKernelTraceSessionDetail(selected.id) : null;
      if (!cancelled) setDetail(next);
    })().catch((cause) => { if (!cancelled) setError(String(cause)); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [gameId]);
  async function select(trace: KernelTraceSessionSummary) {
    setSelectedId(trace.id); setLoading(true); setError("");
    window.history.replaceState(null, "", traceSelectionUrl(window.location.href, { sessionId: text(asObject(trace.metadata).sessionId) || null, traceId: trace.id, containerId: trace.containerId ?? null }));
    try { setDetail(await fetchKernelTraceSessionDetail(trace.id)); } catch (cause) { setError(String(cause)); } finally { setLoading(false); }
  }
  return (
    <div className="kernel-reference-workspace min-h-0 flex-1 overflow-auto bg-background p-4 font-sans text-foreground">
      {error ? <p role="alert" className="text-down">{error}</p> : null}
      <section className="grid min-h-full grid-cols-1 gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="grid content-start gap-2 overflow-auto rounded border border-border bg-card p-3">
          <h2 className="text-sm font-bold">Game Traces</h2>
          {sessions.map((trace) => <button className={`border p-3 text-left ${selectedId === trace.id ? "border-primary" : "border-border"}`} key={trace.id} onClick={() => void select(trace)} type="button"><span className="block truncate">{trace.id}</span><span className="text-xs text-muted-foreground">{trace.status}</span></button>)}
          {!loading && !sessions.length ? <p>No kernel traces recorded for this game.</p> : null}
        </aside>
        <div className="min-h-[520px] overflow-hidden">{loading && !detail ? <p role="status">Loading kernel trace...</p> : detail ? <TraceDetailViewer detail={detail} /> : <p>Select a trace.</p>}</div>
      </section>
    </div>
  );
}
