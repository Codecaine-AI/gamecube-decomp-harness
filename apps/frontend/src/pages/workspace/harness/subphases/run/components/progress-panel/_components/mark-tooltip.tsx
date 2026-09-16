import { delta, pct, whole } from "@/lib/format";
import { strictNumber, tapeClass } from "../_lib/numbers";
import type { ChartMark } from "../_lib/types";

const measureRowSpecs = [
  { key: "complete_code_percent", label: "Complete code" },
  { key: "matched_functions_percent", label: "Matched funcs" },
  { key: "fuzzy_match_percent", label: "Fuzzy match" },
];

const TOOLTIP_SIDE_BREAKPOINT = 75;
const TOOLTIP_DOT_GAP_PX = 14;

function countLabel(count: number, noun: string): string {
  return `${count.toLocaleString()} ${noun}${count === 1 ? "" : "s"}`;
}

export function MarkTooltip({ mark }: { mark: ChartMark }) {
  const showRight = mark.x < TOOLTIP_SIDE_BREAKPOINT;
  const units = strictNumber(mark.measures.complete_units);
  const unmatchedTargets = strictNumber(mark.measures.unmatched_targets ?? mark.measures.unmatchedTargets);
  return (
    <div
      className="pointer-events-none absolute z-10 w-[210px] border border-line2 bg-raised px-2.5 py-2 shadow-[0_4px_16px_rgba(0,0,0,0.45)]"
      style={{
        left: `${mark.x}%`,
        top: "50%",
        transform: showRight ? `translate(${TOOLTIP_DOT_GAP_PX}px, -50%)` : `translate(calc(-100% - ${TOOLTIP_DOT_GAP_PX}px), -50%)`,
      }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] uppercase tracking-[0.1em] text-dim">{mark.heading}</span>
        <span className="text-[10px] text-dim">{mark.when}</span>
      </div>
      <div className="mt-0.5 text-sm">
        <strong className="text-fg">{pct(mark.matched)}</strong>
        {Number.isFinite(mark.diff) ? <span className={`ml-1.5 text-xs ${tapeClass(mark.diff, 0.00001)}`}>{delta(mark.diff)}</span> : null}
        <span className="ml-1.5 text-[10px] text-dim">matched code</span>
      </div>
      <div className="mt-1.5 grid gap-0.5 border-t border-line pt-1.5 text-[11px]">
        {measureRowSpecs.map((spec) => {
          const value = strictNumber(mark.measures[spec.key]);
          if (!Number.isFinite(value)) return null;
          return (
            <div className="flex items-baseline justify-between gap-2" key={spec.key}>
              <span className="text-dim">{spec.label}</span>
              <span className="text-soft">{pct(value)}</span>
            </div>
          );
        })}
        {Number.isFinite(units) ? (
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-dim">Complete units</span>
            <span className="text-soft">
              {whole(mark.measures.complete_units)} / {whole(mark.measures.total_units)}
            </span>
          </div>
        ) : null}
        {Number.isFinite(unmatchedTargets) ? (
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-dim">Unmatched</span>
            <span className={unmatchedTargets > 0 ? "text-warn" : "text-up"}>{countLabel(unmatchedTargets, "target")}</span>
          </div>
        ) : null}
        {mark.regressed > 0 ? (
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-dim">Regressions</span>
            <span className="text-down">
              {mark.regressed} fn · {mark.requeued} readmitted
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
