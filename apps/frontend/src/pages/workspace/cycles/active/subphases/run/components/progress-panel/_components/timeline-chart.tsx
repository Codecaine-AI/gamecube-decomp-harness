import { Fragment, useId, useState } from "react";
import type { Dashboard } from "@/lib/format";
import { MarkTooltip } from "./mark-tooltip";
import { chartModel } from "../_lib/chart-model";
import type { ChartMark } from "../_lib/types";

function markerClass(mark: ChartMark): string {
  if (mark.kind === "baseline") return "rounded-full border border-ink bg-fg";
  if (mark.kind === "epoch_finish") return "rounded-full border border-ink bg-up";
  if (mark.kind === "pr_sync") return "border border-up bg-card";
  return "rotate-45 border border-soft bg-card";
}

function markLabelTransform(mark: ChartMark): string {
  if (mark.x < 8) return "translateX(0)";
  if (mark.x > 92) return "translateX(-100%)";
  return "translateX(-50%)";
}

export function TimelineChart({ dashboard }: { dashboard: Dashboard | null }) {
  const model = chartModel(dashboard);
  const [hovered, setHovered] = useState<number | null>(null);
  const areaGradientId = useId();
  const markLabels = model.marks.map((mark) => mark.matched.toFixed(3));
  const showLabel = model.marks.map(() => false);
  let lastVisibleLabel: { x: number; text: string } | null = null;
  model.marks.forEach((mark, index) => {
    const text = markLabels[index];
    const visible = lastVisibleLabel === null || mark.x - lastVisibleLabel.x >= 8 || text !== lastVisibleLabel.text;
    showLabel[index] = visible;
    if (visible) lastVisibleLabel = { x: mark.x, text };
  });

  return (
      <div className="relative h-[230px] border border-line bg-card">
        {model.hasLine ? (
          <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
            {/* The fill tapers from the line down to transparent so the area
                reads as a glow under the line instead of a solid band. */}
            <defs>
              <linearGradient id={areaGradientId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--color-up)" stopOpacity="0.3" />
                <stop offset="70%" stopColor="var(--color-up)" stopOpacity="0.14" />
                <stop offset="100%" stopColor="var(--color-up)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <polygon fill={`url(#${areaGradientId})`} points={model.areaPoints} />
            <polyline fill="none" points={model.linePoints} stroke="var(--color-up)" strokeOpacity="0.9" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          </svg>
        ) : null}
        {model.marks.map((mark, index) => (
          <Fragment key={`${mark.kind}-${index}`}>
            <span
              aria-hidden
              className="pointer-events-none absolute z-[1] w-px -translate-x-1/2"
              style={{
                left: `${mark.x}%`,
                top: `calc(${mark.y}% + 7px)`,
                bottom: 0,
                backgroundImage: "linear-gradient(to bottom, var(--color-up) 55%, transparent 55%)",
                backgroundSize: "1px 5px",
                maskImage: "linear-gradient(to bottom, rgb(0 0 0 / 0.55), rgb(0 0 0 / 0.22) 60%, transparent 100%)",
                WebkitMaskImage: "linear-gradient(to bottom, rgb(0 0 0 / 0.55), rgb(0 0 0 / 0.22) 60%, transparent 100%)",
              }}
            />
            <span
              className="group absolute z-[2] -translate-x-1/2 -translate-y-1/2 cursor-default p-2"
              onMouseEnter={() => setHovered(index)}
              onMouseLeave={() => setHovered(null)}
              style={{ left: `${mark.x}%`, top: `${mark.y}%` }}
            >
              <span
                className={`block h-2.5 w-2.5 transition-transform group-hover:scale-150 ${markerClass(mark)}`}
              />
            </span>
            {showLabel[index] ? (
              <span
                className={`pointer-events-none absolute whitespace-nowrap text-[10px] ${hovered === index ? "text-fg" : "text-soft"}`}
                style={{ left: `${mark.x}%`, top: `calc(${mark.y}% - 22px)`, transform: markLabelTransform(mark) }}
              >
                {markLabels[index]}
              </span>
            ) : null}
          </Fragment>
        ))}
        {hovered !== null && model.marks[hovered] ? <MarkTooltip mark={model.marks[hovered]} /> : null}
        {!model.hasData ? <span className="absolute inset-0 flex items-center justify-center text-xs text-dim">No cycle score history yet.</span> : null}
      </div>
  );
}
