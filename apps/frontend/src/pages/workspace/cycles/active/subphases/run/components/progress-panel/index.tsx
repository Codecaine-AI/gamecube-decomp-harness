import type { Dashboard } from "@/lib/format";
import { delta, pct } from "@/lib/format";
import { TimelineChart } from "./_components/timeline-chart";

function TierCard({ detail, label, title, value }: { detail: string; label: string; title?: string; value: string }) {
  return (
    <div className="min-w-0 border-r border-line px-3 py-2.5 last:border-r-0" title={title}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-dim">{label}</div>
      <div className="mt-0.5 truncate text-lg font-semibold tabular-nums text-fg">{value}</div>
      <div className="truncate text-[10px] text-soft">{detail}</div>
    </div>
  );
}

export function ProgressPanel({
  dashboard,
}: {
  dashboard: Dashboard | null;
}) {
  const tiers = dashboard?.scoreTiers;
  const tentativeCount = (tiers?.tentative.matches.length ?? 0) + (tiers?.tentative.improvements.length ?? 0);
  return (
    <div className="overflow-hidden rounded-none border border-line bg-panel">
      <div className="grid grid-cols-3 border-b border-line bg-inset">
        <TierCard
          detail="upstream anchor"
          label="Baseline"
          title={tiers?.baseline.anchorRevision ?? undefined}
          value={pct(tiers?.baseline.score)}
        />
        <TierCard
          detail={tiers?.confirmed.delta == null ? "boundary validated" : `${delta(tiers.confirmed.delta)} vs baseline`}
          label="Confirmed"
          value={pct(tiers?.confirmed.score)}
        />
        <TierCard
          detail="open epoch, not reported"
          label="Tentative"
          value={`${tentativeCount} win${tentativeCount === 1 ? "" : "s"}`}
        />
      </div>
      <TimelineChart dashboard={dashboard} />
    </div>
  );
}
