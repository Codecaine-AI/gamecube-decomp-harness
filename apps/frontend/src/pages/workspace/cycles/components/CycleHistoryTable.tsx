import { text, type JsonObject } from "@/lib/format";
import { EmptyState } from "@/components/primitives";
import type { CycleView } from "@/pages/workspace/_lib/types";

export function CycleHistoryTable({ savePoint, view }: { savePoint: JsonObject; view: CycleView }) {
  const rows: Array<{ id: string; state: string; branch: string; outcome: string }> = [];
  if (view.activeCycleId && view.mode !== "none") {
    rows.push({ id: view.activeCycleLabel, state: view.modeLabel, branch: view.branchLabel, outcome: view.newCycleBlocked ? "in progress" : "active" });
  }
  if (text(savePoint.commit_sha)) {
    rows.push({ id: `Savepoint ${text(savePoint.commit_sha).slice(0, 10)}`, state: text(savePoint.trigger_kind, "complete"), branch: text(savePoint.branch, view.branchLabel), outcome: text(savePoint.trigger_kind, "carried forward") });
  }
  if (rows.length === 0) return <EmptyState>No past cycles recorded yet. Run evidence appears here as cycles close.</EmptyState>;
  return (
    <div className="overflow-hidden border border-line bg-card">
      <div className="grid grid-cols-[minmax(120px,1fr)_120px_minmax(120px,1fr)_minmax(120px,1fr)] gap-2 border-b border-line2 bg-raised px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-dim">
        <span>Run</span>
        <span>State</span>
        <span>Branch</span>
        <span>Outcome</span>
      </div>
      {rows.map((row) => (
        <div className="grid grid-cols-[minmax(120px,1fr)_120px_minmax(120px,1fr)_minmax(120px,1fr)] gap-2 border-t border-line px-2.5 py-1.5 text-xs first:border-t-0" key={`${row.id}-${row.branch}`}>
          <span className="overflow-hidden text-ellipsis whitespace-nowrap text-soft" title={row.id}>{row.id}</span>
          <span className="overflow-hidden text-ellipsis whitespace-nowrap text-soft">{row.state}</span>
          <span className="overflow-hidden text-ellipsis whitespace-nowrap text-dim" title={row.branch}>{row.branch}</span>
          <span className="overflow-hidden text-ellipsis whitespace-nowrap text-dim">{row.outcome}</span>
        </div>
      ))}
    </div>
  );
}
