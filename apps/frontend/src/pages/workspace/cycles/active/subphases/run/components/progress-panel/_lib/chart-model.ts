import { asArray, asObject, clock, numberValue, text, type Dashboard } from "@/lib/format";
import { strictNumber, timeMs } from "./numbers";
import type { ChartMark, ChartModel } from "./types";

// Chart geometry in viewBox units (0-100). Headroom above TOP keeps the
// marker labels inside the box when the line touches the top of the scale.
const CHART_TOP = 24;
const CHART_BASE = 86;
const OVERLAP_X = 2;

/**
 * The run's measured progress on a clock that runs left (run start) to right
 * (now). Every point on the line is a full rebuild measurement: the baseline
 * report at run start, epoch checkpoints (queue drained -> commit -> rebuild
 * -> measure), and the current board at the right edge. Checkpoints landing
 * within OVERLAP_X of each other (such as an epoch's post-repair rebuild)
 * collapse into one marker showing the latest measurement. The y scale zooms
 * to the data so small matched-code gains keep slope.
 */
export function chartModel(dashboard: Dashboard | null): ChartModel {
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
  const epochClusters = epochs.reduce<(typeof epochs)[]>((clusters, entry) => {
    const cluster = clusters[clusters.length - 1];
    const previous = cluster?.[cluster.length - 1];
    if (previous && x(entry.atMs) - x(previous.atMs) < OVERLAP_X) cluster.push(entry);
    else clusters.push([entry]);
    return clusters;
  }, []);

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
  for (const cluster of epochClusters) {
    const { epoch, atMs, matched } = cluster[cluster.length - 1];
    const diff = Number.isFinite(previousMatched) ? matched - previousMatched : NaN;
    previousMatched = matched;
    marks.push({
      x: x(atMs),
      y: y(matched),
      kind: "epoch",
      heading: `${text(epoch.label, "epoch checkpoint")}${cluster.length > 1 ? ` · ${cluster.length} builds` : ""}`,
      when: clock(epoch.createdAt),
      matched,
      diff,
      measures: asObject(epoch.measures),
      regressed: Math.max(...cluster.map(({ epoch: member }) => numberValue(asObject(member.regressions).regressedFunctions, 0))),
      requeued: cluster.reduce((sum, { epoch: member }) => sum + numberValue(asObject(member.repair).requeued, 0), 0),
    });
  }
  // Skip the "now" mark when the newest checkpoint sits at the right edge -
  // a just-finished checkpoint IS the current measurement, and stacking both
  // marks doubles the label. Diff is vs the previous mark, matching the
  // checkpoint marks (the run total lives in the summary, not here).
  const lastEpochX = epochs.length > 0 ? x(epochs[epochs.length - 1].atMs) : NaN;
  const nowOverlapsLastEpoch = Number.isFinite(lastEpochX) && X_END - lastEpochX < OVERLAP_X;
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
  // The line runs border to border; the marks sit inset on it. The area fill
  // closes at the bottom border (not CHART_BASE) so its gradient tapers over
  // the chart's full height.
  const linePoints = hasLine ? [`0,${marks[0].y}`, ...marks.map((mark) => `${mark.x},${mark.y}`), `100,${marks[marks.length - 1].y}`].join(" ") : "";
  const areaPoints = hasLine ? `${linePoints} 100,100 0,100` : "";
  const timeLabels = [0, 0.5, 1].map((fraction) => clock(new Date(startMs + span * fraction).toISOString()));

  return { hasRun, hasLine, epochCount: epochs.length, linePoints, areaPoints, marks, timeLabels };
}
