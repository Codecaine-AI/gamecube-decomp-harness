import type { JsonObject } from "@/lib/format";

export interface ChartMark {
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

export interface ChartModel {
  hasRun: boolean;
  hasLine: boolean;
  epochCount: number;
  linePoints: string;
  areaPoints: string;
  marks: ChartMark[];
  timeLabels: string[];
}
