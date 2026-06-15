import { Fragment, useState } from "react";
import { asArray, asObject, clock, delta, numberValue, pct, shortId, text, whole, type Dashboard, type JsonObject } from "@decomp-orchestrator/ui-contract";
import { Pill } from "./primitives";
import { processPillState } from "../lib/processView";

/** Strict numeric parse: null/undefined are missing data, never zero. */
function strictNumber(value: unknown): number {
  if (value === null || value === undefined || value === "") return NaN;
  return Number(value);
}

function tapeClass(value: number, epsilon = 0.0005): string {
  if (!Number.isFinite(value) || Math.abs(value) < epsilon) return "text-dim";
  return value > 0 ? "text-up" : "text-down";
}

function timeMs(value: unknown): number {
  const ms = Date.parse(text(value));
  return Number.isFinite(ms) ? ms : 0;
}

/* --------------------------- Chart data model --------------------------- */

// Chart geometry in viewBox units (0-100). Headroom above TOP keeps the
// marker labels inside the box when the line touches the top of the scale.
const CHART_TOP = 24;
const CHART_BASE = 86;

interface ChartMark {
  x: number;
  y: number;
  kind: "start" | "epoch" | "now";
  heading: string;
  when: string;
  matched: number;
  diff: number;
  measures: JsonObject;
  regressed: number;
  requeued: number;
}

interface ChartModel {
  hasRun: boolean;
  hasLine: boolean;
  epochCount: number;
  linePoints: string;
  areaPoints: string;
  marks: ChartMark[];
  timeLabels: string[];
}

/**
 * The run's measured progress on a clock that runs left (run start) to right
 * (now). Every point on the line is a full rebuild measurement: the baseline
 * report at run start, one marker per epoch checkpoint (queue drained ->
 * commit -> rebuild -> measure), and the current board at the right edge.
 * The y scale zooms to the data so small matched-code gains keep slope.
 */
function chartModel(dashboard: Dashboard | null): ChartModel {
  const run = asObject(dashboard?.status?.run);
  const runId = text(run.id);
  const hasRun = Boolean(runId);
  const nowMs = Date.now();
  const startMs = timeMs(run.createdAt) || nowMs;
  const endMs = Math.max(nowMs, startMs + 60_000);
  const span = endMs - startMs;
  // The baseline dot sits inset from the left border; the time axis maps
  // [run start, now] onto [X_START, X_END].
  const X_START = 6;
  const X_END = 99.4;
  const x = (ms: number) => Math.min(X_END, Math.max(X_START, X_START + ((ms - startMs) / span) * (X_END - X_START)));

  const initialMeasures = asObject(asObject(dashboard?.initial).measures);
  const currentMeasures = asObject(asObject(dashboard?.current).measures);
  const initialMatched = strictNumber(initialMeasures.matched_code_percent);
  const currentMatched = strictNumber(currentMeasures.matched_code_percent);
  const epochs = asArray(dashboard?.epochs)
    .map(asObject)
    .filter((epoch) => text(epoch.runId) === runId)
    .map((epoch) => ({ epoch, atMs: timeMs(epoch.createdAt), matched: strictNumber(epoch.matchedCodePercent) }))
    .filter((entry) => entry.atMs > 0 && Number.isFinite(entry.matched))
    .sort((a, b) => a.atMs - b.atMs);

  // Zoomed y scale: pad the observed range so a flat line sits mid-chart and
  // small gains still get visible slope.
  const values = [initialMatched, ...epochs.map((entry) => entry.matched), currentMatched].filter(Number.isFinite);
  const rawLow = values.length ? Math.min(...values) : 0;
  const rawHigh = values.length ? Math.max(...values) : 1;
  const pad = Math.max((rawHigh - rawLow) * 0.3, 0.01);
  const low = rawLow - pad;
  const high = rawHigh + pad;
  const y = (value: number) => CHART_BASE - ((value - low) / (high - low)) * (CHART_BASE - CHART_TOP);

  const marks: ChartMark[] = [];
  if (Number.isFinite(initialMatched)) {
    marks.push({
      x: X_START,
      y: y(initialMatched),
      kind: "start",
      heading: "baseline",
      when: run.createdAt ? clock(run.createdAt) : "",
      matched: initialMatched,
      diff: NaN,
      measures: initialMeasures,
      regressed: 0,
      requeued: 0,
    });
  }
  let previousMatched = initialMatched;
  for (const { epoch, atMs, matched } of epochs) {
    const diff = Number.isFinite(previousMatched) ? matched - previousMatched : NaN;
    previousMatched = matched;
    marks.push({
      x: x(atMs),
      y: y(matched),
      kind: "epoch",
      heading: text(epoch.label, "epoch checkpoint"),
      when: clock(epoch.createdAt),
      matched,
      diff,
      measures: asObject(epoch.measures),
      regressed: numberValue(asObject(epoch.regressions).regressedFunctions, 0),
      requeued: numberValue(asObject(epoch.repair).requeued, 0),
    });
  }
  // Skip the "now" mark when the newest checkpoint sits at the right edge —
  // a just-finished checkpoint IS the current measurement, and stacking both
  // marks doubles the label. Diff is vs the previous mark, matching the
  // checkpoint marks (the run total lives in the summary, not here).
  const lastEpochX = epochs.length > 0 ? x(epochs[epochs.length - 1].atMs) : NaN;
  const nowOverlapsLastEpoch = Number.isFinite(lastEpochX) && X_END - lastEpochX < 2;
  if (Number.isFinite(currentMatched) && !nowOverlapsLastEpoch) {
    marks.push({
      x: X_END,
      y: y(currentMatched),
      kind: "now",
      heading: "now",
      when: clock(new Date(nowMs).toISOString()),
      matched: currentMatched,
      diff: Number.isFinite(previousMatched) ? currentMatched - previousMatched : NaN,
      measures: currentMeasures,
      regressed: 0,
      requeued: 0,
    });
  }

  const hasLine = marks.length >= 2;
  // The line runs border to border; the marks sit inset on it.
  const linePoints = hasLine ? [`0,${marks[0].y}`, ...marks.map((mark) => `${mark.x},${mark.y}`), `100,${marks[marks.length - 1].y}`].join(" ") : "";
  const areaPoints = hasLine ? `${linePoints} 100,${CHART_BASE} 0,${CHART_BASE}` : "";
  const timeLabels = [0, 0.5, 1].map((fraction) => clock(new Date(startMs + span * fraction).toISOString()));

  return { hasRun, hasLine, epochCount: epochs.length, linePoints, areaPoints, marks, timeLabels };
}

/* ------------------------------- Tooltip -------------------------------- */

const measureRowSpecs = [
  { key: "complete_code_percent", label: "Complete code" },
  { key: "matched_functions_percent", label: "Matched funcs" },
  { key: "fuzzy_match_percent", label: "Fuzzy match" },
];

function MarkTooltip({ mark }: { mark: ChartMark }) {
  const horizontal = mark.x < 15 ? "0" : mark.x > 85 ? "-100%" : "-50%";
  const above = mark.y >= 48;
  const units = strictNumber(mark.measures.complete_units);
  return (
    <div
      className="pointer-events-none absolute z-10 w-[210px] border border-line2 bg-raised px-2.5 py-2 shadow-[0_4px_16px_rgba(0,0,0,0.45)]"
      style={{
        left: `${mark.x}%`,
        top: `${mark.y}%`,
        transform: `translate(${horizontal}, ${above ? "calc(-100% - 14px)" : "14px"})`,
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
        {mark.regressed > 0 ? (
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-dim">Regressions</span>
            <span className="text-down">
              {mark.regressed} fn · {mark.requeued} requeued
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* -------------------------------- Chart --------------------------------- */

function markLabelTransform(mark: ChartMark): string {
  if (mark.x < 8) return "translateX(0)";
  if (mark.x > 92) return "translateX(-100%)";
  return "translateX(-50%)";
}

function TimelineChart({ dashboard }: { dashboard: Dashboard | null }) {
  const model = chartModel(dashboard);
  const [hovered, setHovered] = useState<number | null>(null);
  return (
    <div className="px-2.5 py-2.5">
      <div className="relative h-[230px] border border-line bg-card">
        {[25, 50, 75].map((grid) => (
          <span className="absolute top-0 bottom-0 w-px bg-line" key={grid} style={{ left: `${grid}%` }} />
        ))}
        {model.hasLine ? (
          <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
            <polygon fill="var(--color-up)" fillOpacity="0.08" points={model.areaPoints} />
            <polyline fill="none" points={model.linePoints} stroke="var(--color-up)" strokeOpacity="0.9" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          </svg>
        ) : null}
        {model.marks.map((mark, index) => (
          <Fragment key={`${mark.kind}-${index}`}>
            {mark.kind === "epoch" ? (
              <span className="pointer-events-none absolute top-0 bottom-0 border-l border-dashed border-faint" style={{ left: `${mark.x}%` }} />
            ) : null}
            <span
              className="group absolute z-[2] -translate-x-1/2 -translate-y-1/2 cursor-default p-2"
              onMouseEnter={() => setHovered(index)}
              onMouseLeave={() => setHovered(null)}
              style={{ left: `${mark.x}%`, top: `${mark.y}%` }}
            >
              <span
                className={`block h-2.5 w-2.5 rounded-full transition-transform group-hover:scale-150 ${
                  mark.kind === "now" ? "border-2 border-up bg-card" : "border border-ink bg-up"
                }`}
              />
            </span>
            <span
              className={`pointer-events-none absolute whitespace-nowrap text-[10px] ${hovered === index ? "text-fg" : "text-soft"}`}
              style={{ left: `${mark.x}%`, top: `calc(${mark.y}% - 22px)`, transform: markLabelTransform(mark) }}
            >
              {pct(mark.matched)}
            </span>
          </Fragment>
        ))}
        {hovered !== null && model.marks[hovered] ? <MarkTooltip mark={model.marks[hovered]} /> : null}
        {!model.hasRun ? <span className="absolute inset-0 flex items-center justify-center text-xs text-dim">No run yet.</span> : null}
      </div>
      <div className="mt-1 grid grid-cols-3 text-[10px] text-dim">
        <span>{model.timeLabels[0]} (start)</span>
        <span className="text-center">{model.timeLabels[1]}</span>
        <span className="text-right">{model.timeLabels[2]} (now)</span>
      </div>
    </div>
  );
}

/* ------------------------------- The panel ------------------------------ */

function checkpointCountdown(dashboard: Dashboard | null): string {
  const progress = asObject(dashboard?.checkpointProgress);
  if (progress.building === true) {
    const sinceMs = Date.parse(text(progress.buildingSince));
    const minutes = Number.isFinite(sinceMs) ? Math.max(0, Math.round((Date.now() - sinceMs) / 60_000)) : NaN;
    return Number.isFinite(minutes) ? `checkpoint building… ${minutes}m` : "checkpoint building…";
  }
  const remaining = strictNumber(progress.remaining);
  const interval = strictNumber(progress.interval);
  if (!Number.isFinite(remaining) || !Number.isFinite(interval)) return "";
  if (remaining <= 0) return "checkpoint due";
  return `checkpoint in ~${whole(remaining)} ${remaining === 1 ? "lease" : "leases"}`;
}

export function ProgressPanel({ dashboard }: { dashboard: Dashboard | null; streamState: string }) {
  const countdown = checkpointCountdown(dashboard);
  return (
    <div className="border-b border-line p-3">
      <div className="overflow-hidden rounded-none border border-line bg-panel">
        <header className="flex min-h-9 items-center justify-between gap-x-3 bg-raised px-2.5 py-1.5">
          <Pill state={processPillState(dashboard)} />
          {countdown ? <span className="whitespace-nowrap text-xs text-dim">{countdown}</span> : null}
        </header>
        <TimelineChart dashboard={dashboard} />
      </div>
    </div>
  );
}
