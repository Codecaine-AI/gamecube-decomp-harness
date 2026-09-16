import { EmptyState, InfoRows, PanelSection, PanelTitle } from "@/components/primitives";
import { clock, text } from "@/lib/format";
import { prettyStatus } from "@/pages/workspace/_lib/model";
import type { HarnessBoundaryReadModel } from "@/pages/workspace/_lib/types";

export function HarnessTimeline({ entries }: { entries: HarnessBoundaryReadModel[] }) {
  return (
    <PanelSection>
      <PanelTitle>Epoch and Sync Boundaries</PanelTitle>
      {entries.length === 0 ? <EmptyState>No harness boundaries recorded.</EmptyState> : (
        <ol className="m-0 grid list-none gap-3 p-0">
          {[...entries].sort((a, b) => b.identity.order - a.identity.order).map((entry) => (
            <li className="border border-line bg-card p-3" key={entry.identity.event_id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="text-sm text-fg">{prettyStatus(entry.kind)} · {prettyStatus(entry.outcome)}</strong>
                <time className="text-xs text-dim" dateTime={entry.identity.occurred_at}>{clock(entry.identity.occurred_at)}</time>
              </div>
              <div className="mt-2">
                <InfoRows rows={[
                  ["Boundary", entry.identity.event_id],
                  ["Epoch / Sync", [entry.epochId, entry.syncId].filter(Boolean).join(" / ") || "None"],
                  ["Accepted heads", `${text(entry.source.prior_head, "unknown")} → ${text(entry.source.resulting_head, "unknown")}`],
                  ["Evidence freshness", text(entry.evidence.freshness, "Not recorded")],
                  ["Save point", text(entry.evidence.save_point_id, "Not recorded")],
                ]} />
              </div>
              {Object.keys(entry.evidence).length ? <details className="mt-2 text-xs text-soft"><summary className="cursor-pointer">Evidence references</summary><pre className="overflow-auto whitespace-pre-wrap break-words">{JSON.stringify(entry.evidence, null, 2)}</pre></details> : null}
              {entry.recovery ? <details className="mt-2 text-xs text-warn" open><summary>Recovery</summary><pre className="overflow-auto whitespace-pre-wrap break-words">{JSON.stringify(entry.recovery, null, 2)}</pre></details> : null}
            </li>
          ))}
        </ol>
      )}
    </PanelSection>
  );
}
