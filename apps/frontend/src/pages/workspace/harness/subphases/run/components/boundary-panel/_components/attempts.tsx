import { useContext } from "react";
import type { PriorAttemptModel } from "../_lib/boundary-model";
import { BoundaryDetailContext } from "../_lib/detail-context";
import { StepRow } from "./step-row";

export function PriorAttempts({ attempts, epochId, title = "Prior attempts" }: { attempts: PriorAttemptModel[]; epochId: string; title?: string }) {
  const detailContext = useContext(BoundaryDetailContext);
  if (!attempts.length) return null;
  return <details className="group border border-line bg-card"><summary className="cursor-pointer select-none list-none px-2.5 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-dim hover:text-soft">{title} ({attempts.length})</summary><div className="border-t border-line">{attempts.map((attempt) => <BoundaryDetailContext.Provider key={attempt.attempt} value={detailContext ? { ...detailContext, epochId, attempt: attempt.attempt } : null}><details className="border-t border-line first:border-t-0"><summary className="grid cursor-pointer grid-cols-[1fr_auto_auto_auto] gap-3 px-2.5 py-2 text-xs"><span className="text-soft">Attempt {attempt.attempt}</span><span className={attempt.outcome === "error" ? "text-down" : attempt.outcome === "reconciled" || attempt.outcome === "warning" ? "text-warn" : "text-dim"}>{attempt.outcome}</span>{attempt.failedStepLabel ? <span className="text-down">{attempt.failedStepLabel}</span> : <span />}<span className="text-dim">{attempt.duration}</span></summary><div className="border-t border-line">{attempt.error ? <div className="max-h-48 overflow-auto whitespace-pre-wrap break-words border-b border-line px-2.5 py-2 text-xs text-down">{attempt.error}</div> : null}<div className="overflow-hidden border border-line bg-card @[760px]:grid @[760px]:grid-cols-2">{attempt.rows.map((row) => <StepRow key={row.key} row={row} />)}</div></div></details></BoundaryDetailContext.Provider>)}</div></details>;
}
