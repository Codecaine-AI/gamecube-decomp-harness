import type { AttemptSummary } from "../_lib/boundary-model";

export function PriorAttempts({ attempts }: { attempts: AttemptSummary[] }) {
  if (!attempts.length) return null;
  return <details className="group border border-line bg-card"><summary className="cursor-pointer select-none list-none px-2.5 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-dim hover:text-soft">Prior attempts ({attempts.length})</summary><div className="border-t border-line">{attempts.map((attempt) => <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-t border-line px-2.5 py-2 text-xs first:border-t-0" key={attempt.attempt}><span className="text-soft">Attempt {attempt.attempt}</span><span className={attempt.outcome === "error" ? "text-down" : attempt.outcome === "reconciled" || attempt.outcome === "warning" ? "text-warn" : "text-dim"}>{attempt.outcome}</span><span className="text-dim">{attempt.duration}</span></div>)}</div></details>;
}
