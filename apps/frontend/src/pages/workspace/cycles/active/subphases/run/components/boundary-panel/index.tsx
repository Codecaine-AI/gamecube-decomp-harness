import { useState } from "react";
import { PanelSection, PanelTitle, Pill } from "@/components/primitives";
import type { FormState } from "@/lib/api-types";
import type { Dashboard } from "@/lib/format";
import type { CycleView } from "@/pages/workspace/_lib/types";
import { PriorAttempts } from "./_components/attempts";
import { StepDetailDrawer } from "./_components/step-detail";
import { StepRow } from "./_components/step-row";
import { boundaryPanelModel, boundaryViewSummary, priorAttemptModels, recentBoundaries } from "./_lib/boundary-model";
import { BoundaryDetailContext, type BoundaryDetailTarget } from "./_lib/detail-context";

function errorFirstLine(error: string): string {
  const line = error.split(/\r?\n/, 1)[0];
  return line.length > 160 ? `${line.slice(0, 160)}…` : line;
}

export function BoundaryPanel({ dashboard, form, runId, view }: { dashboard: Dashboard | null; form: FormState; runId: string; view: CycleView }) {
  const [detailTarget, setDetailTarget] = useState<BoundaryDetailTarget | null>(null);
  const recent = recentBoundaries(dashboard);
  const model = boundaryPanelModel(dashboard, view.harnessState?.run?.scheduler_condition === "boundary");
  if (!model && recent.length === 0) return null;
  const context = { form, runId, epochId: model?.view.epochId ?? "", attempt: model?.attempt.attempt ?? 0, openDetail: setDetailTarget };
  return <BoundaryDetailContext.Provider value={context}><PanelSection className="@container grid gap-3">
    {model ? <>
      <div className="flex flex-wrap items-center gap-2"><PanelTitle className="mb-0 mr-auto">Epoch {model.view.ordinal} boundary</PanelTitle><Pill state={model.status} />{model.attemptBadge ? <span className="status-tag">{model.attemptBadge}</span> : null}<span className="text-xs text-dim">{model.view.admittedCount} admitted · {model.view.finishedCount} finished</span></div>
      {model.reconciledBanner ? <div className="border border-warn/50 bg-warn/10 px-3 py-2 text-xs text-warn">{model.reconciledBanner}</div> : null}
      {model.errorBanner ? <div className="border border-down/50 bg-down/10 px-3 py-2 text-xs text-down"><div className="max-h-48 overflow-auto whitespace-pre-wrap break-words">{model.errorBanner.error}</div>{model.errorBanner.failedStepLabel ? <div className="mt-1 text-soft">Failed step: {model.errorBanner.failedStepLabel}</div> : null}{model.errorBanner.failingTu ? <div className="mt-1 text-soft">Failing TU: {model.errorBanner.failingTu}</div> : null}<div className="mt-1 font-semibold">{model.errorBanner.retry}</div></div> : null}
      <PriorAttempts attempts={model.priorAttempts} epochId={model.view.epochId} />
      <div className="overflow-hidden border border-line bg-card @[760px]:grid @[760px]:grid-cols-2">{model.rows.map((row) => <StepRow key={row.key} row={row} />)}</div>
    </> : null}
    {recent.length ? <details className="group border border-line bg-card"><summary className="cursor-pointer select-none list-none px-2.5 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-dim hover:text-soft">Recent boundaries ({recent.length})</summary><div className="border-t border-line">{recent.map((item) => { const summary = boundaryViewSummary(item); return <details className="border-t border-line first:border-t-0" key={item.epochId}><summary className="grid cursor-pointer grid-cols-[1fr_auto] gap-2 px-2.5 py-2 text-xs text-soft"><span>Epoch {item.ordinal}</span><span className="text-dim">{item.boundaryStatus ?? item.epochStatus}</span></summary><div className="grid gap-2 border-t border-line px-2.5 py-2 text-xs text-dim"><div>{summary.attempts} attempt{summary.attempts === 1 ? "" : "s"} · last: {summary.lastOutcome}{summary.failedStepLabel ? <span className="text-down"> · failed at {summary.failedStepLabel}</span> : null}{summary.error ? <span className="text-down"> · {errorFirstLine(summary.error)}</span> : null}</div><PriorAttempts attempts={priorAttemptModels(item.attempts)} epochId={item.epochId} title="Attempts" /></div></details>; })}</div></details> : null}
    <StepDetailDrawer onClose={() => setDetailTarget(null)} open={detailTarget !== null} target={detailTarget} />
  </PanelSection></BoundaryDetailContext.Provider>;
}
