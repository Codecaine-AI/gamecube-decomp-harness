import { useContext, useEffect, useState, type ReactNode } from "react";
import { fetchBoundaryStepDetail } from "@/lib/api";
import type { BoundaryStepDetail } from "@/lib/boundary-step-detail-types";
import { clock } from "@/lib/format";
import { stepLabel } from "../_lib/boundary-model";
import { BoundaryDetailContext, type BoundaryDetailTarget } from "../_lib/detail-context";
import { artifactPreview, detailSections, eventSummary } from "../_lib/step-detail-model";

export function StepDetailDrawer({ open, onClose, target }: { open: boolean; onClose: () => void; target: BoundaryDetailTarget | null }) {
  const context = useContext(BoundaryDetailContext);
  const [detail, setDetail] = useState<BoundaryStepDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !target || !context?.runId) return;
    let active = true;
    setDetail(null);
    setError(null);
    setLoading(true);
    fetchBoundaryStepDetail(context.form, context.runId, target.epochId, target.attempt, target.step)
      .then((value) => { if (active) setDetail(value); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [context?.form, context?.runId, open, target]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, open]);

  if (!open || !target) return null;
  const sections = detail ? detailSections(detail) : null;
  const events = detail ? [...detail.events].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)) : [];
  return <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose} role="presentation">
    <aside aria-label="Boundary step detail" className="ml-auto flex h-full w-[min(720px,100vw)] flex-col border-l border-line bg-panel text-fg" onClick={(event) => event.stopPropagation()}>
      <div className="flex items-start gap-3 border-b border-line p-4">
        <div className="min-w-0 flex-1"><div className="text-sm font-semibold">{stepLabel(target.step)}</div>{detail ? <><div className="mt-1 text-xs text-soft">Epoch {detail.ordinal ?? "—"} · attempt {detail.attempt}</div><div className="mt-1 break-all text-[11px] text-dim">Window {time(detail.window.from)} → {time(detail.window.to)} · step {time(detail.stepWindow.from)} → {time(detail.stepWindow.to)}</div></> : <div className="mt-1 text-xs text-dim">Epoch {target.epochId} · attempt {target.attempt}</div>}</div>
        <button className="text-xs uppercase tracking-[0.1em] text-dim hover:text-soft" onClick={onClose} type="button">close</button>
      </div>
      <div className="grid flex-1 content-start gap-4 overflow-y-auto p-4 text-xs">
        {loading ? <div className="text-dim">Loading full detail…</div> : null}
        {error ? <div className="text-down">{error}</div> : null}
        {detail && sections ? <>
          {sections.hasError ? <section className="grid gap-2"><SectionTitle>Error</SectionTitle><pre className="m-0 max-h-72 overflow-auto whitespace-pre-wrap break-words border border-down/40 bg-down/5 p-2 text-[11px] text-down">{detail.error}</pre></section> : null}
          <section className="grid gap-2"><SectionTitle>Events ({sections.eventCount})</SectionTitle>{events.length ? events.map((event) => <details className="border border-line bg-card" key={event.id}><summary className="cursor-pointer px-2 py-1.5 text-soft">{eventSummary(event)}</summary><pre className="m-0 max-h-96 overflow-auto whitespace-pre-wrap break-words border-t border-line p-2 text-[11px] text-dim">{JSON.stringify(event.payload, null, 2)}</pre></details>) : <div className="text-dim">No events.</div>}</section>
          {detail.artifactDir !== null ? <section className="grid gap-2"><SectionTitle>Artifacts</SectionTitle><div className="break-all text-dim">{detail.artifactDir}</div>{detail.artifacts.map((artifact) => { const preview = artifactPreview(artifact); return <details className="border border-line bg-card" key={artifact.name}><summary className="cursor-pointer px-2 py-1.5 text-soft">{preview.label}</summary><pre className="m-0 max-h-96 overflow-auto whitespace-pre-wrap break-words border-t border-line p-2 text-[11px] text-dim">{preview.text ?? "binary / not previewed"}</pre></details>; })}</section> : null}
          {detail.stderrLog ? <section className="grid gap-2"><SectionTitle>Run-loop stderr ({sections.logLineCount} lines)</SectionTitle><div className="break-all text-dim">{detail.stderrLog.path} · {time(detail.stderrLog.from)} → {time(detail.stderrLog.to)}</div>{sections.truncatedLog ? <div className="text-warn">(truncated — showing last {sections.logLineCount})</div> : null}<pre className="m-0 max-h-96 overflow-auto whitespace-pre-wrap break-words border border-line bg-card p-2 text-[11px] text-soft">{detail.stderrLog.lines.join("\n")}</pre></section> : null}
          <button className="w-fit border border-line bg-card px-2 py-1 text-[10px] uppercase tracking-[0.1em] text-dim hover:bg-raised hover:text-soft" onClick={() => { void navigator.clipboard?.writeText(JSON.stringify(detail, null, 2)); }} type="button">Copy JSON</button>
        </> : null}
      </div>
    </aside>
  </div>;
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="m-0 text-[10px] font-bold uppercase tracking-[0.1em] text-dim">{children}</h3>;
}

function time(value: string | null): string {
  return value ? clock(value) : "—";
}
