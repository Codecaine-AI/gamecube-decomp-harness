import { ago, num } from "@/lib/format";
import { prettyStatus } from "@/pages/workspace/_lib/model";

import type { DetailsRailProps } from "../_lib/types";

export function PrSection({ view }: Pick<DetailsRailProps, "view">) {
  const counts = new Map<string, number>();
  for (const record of view.prRecords) {
    const status = record.status || "unknown";
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  const recentRecords = [...view.prRecords]
    .sort((left, right) => {
      const rightTime = Date.parse(right.prepStartedAt || "");
      const leftTime = Date.parse(left.prepStartedAt || "");
      return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
    })
    .slice(0, 4);

  return (
    <div className="grid gap-3 p-3 text-[11px]">
      <div className="grid grid-cols-2 gap-2">
        {[...counts.entries()].map(([status, count]) => (
          <div className="border border-line bg-card p-2" key={status}>
            <div className="font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-dim">{prettyStatus(status)}</div>
            <div className="mt-1 text-sm font-semibold text-fg">{num(count)}</div>
          </div>
        ))}
        {Number.isFinite(view.prSummary.upstreamOpen) ? (
          <div className="border border-line bg-card p-2">
            <div className="font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-dim">Upstream open</div>
            <div className="mt-1 text-sm font-semibold text-fg">{num(view.prSummary.upstreamOpen)}</div>
          </div>
        ) : null}
      </div>
      {recentRecords.length ? (
        <div className="grid gap-1.5">
          {recentRecords.map((record, index) => (
            <div className="border border-line bg-card p-2" key={`${record.branch}-${record.prNumber}-${index}`}>
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-medium text-soft" title={record.title || record.displayName}>
                  {record.title || record.displayName || record.branch}
                </span>
                <span className="shrink-0 uppercase text-dim">{prettyStatus(record.status || "unknown")}</span>
              </div>
              <div className="mt-1 text-[10px] text-dim">
                {record.prNumber ? `PR #${record.prNumber}` : record.branch || "Local record"}
                {record.prepStartedAt ? ` · ${ago(record.prepStartedAt)} ago` : ""}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="border border-line bg-card p-3 text-dim">No PR records yet.</div>
      )}
    </div>
  );
}
