import { asObject, clock, text, type Dashboard } from "@/lib/format";
import type { ChartMark, ChartModel } from "./types";

// Chart geometry in viewBox units (0-100). Headroom above TOP keeps the
// marker labels inside the box when the line touches the top of the scale.
const CHART_TOP = 24;
const CHART_BASE = 86;
export function chartModel(dashboard: Dashboard | null): ChartModel {
  const timeline = [...(dashboard?.scoreTiers?.timeline ?? [])]
    .filter((point) => point.score !== null && Number.isFinite(Number(point.score)))
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const hasData = timeline.length > 0;
  const X_START = 6;
  const X_END = 94;
  const x = (index: number) => timeline.length <= 1
    ? X_START
    : X_START + (index / (timeline.length - 1)) * (X_END - X_START);

  // Zoomed y scale: pad the observed range so a flat line sits mid-chart and
  // small gains still get visible slope.
  const values = timeline.map((point) => Number(point.score));
  const rawLow = values.length ? Math.min(...values) : 0;
  const rawHigh = values.length ? Math.max(...values) : 1;
  const pad = Math.max((rawHigh - rawLow) * 0.3, 0.01);
  const low = rawLow - pad;
  const high = rawHigh + pad;
  const y = (value: number) => CHART_BASE - ((value - low) / (high - low)) * (CHART_BASE - CHART_TOP);

  const marks: ChartMark[] = [];
  let previousMatched = NaN;
  timeline.forEach((point, index) => {
    const matched = Number(point.score);
    marks.push({
      x: x(index),
      y: y(matched),
      kind: point.kind,
      heading: text(point.label, point.kind.replace("_", " ")),
      when: clock(point.createdAt),
      matched,
      diff: Number.isFinite(previousMatched) ? matched - previousMatched : NaN,
      measures: asObject(point.measures),
      regressed: 0,
      requeued: 0,
    });
    previousMatched = matched;
  });

  const hasLine = marks.length >= 2;
  const stepPoints = marks.flatMap((mark, index) => index === 0
    ? [`0,${mark.y}`, `${mark.x},${mark.y}`]
    : [`${mark.x},${marks[index - 1].y}`, `${mark.x},${mark.y}`]);
  const linePoints = hasLine ? [...stepPoints, `100,${marks[marks.length - 1].y}`].join(" ") : "";
  const areaPoints = hasLine ? `${linePoints} 100,100 0,100` : "";
  const timeLabels = timeline.length > 0
    ? [timeline[0], timeline[Math.floor((timeline.length - 1) / 2)], timeline[timeline.length - 1]].map((point) => clock(point.createdAt))
    : [];

  return { hasData, hasLine, epochCount: Math.max(0, timeline.length - 1), linePoints, areaPoints, marks, timeLabels };
}
