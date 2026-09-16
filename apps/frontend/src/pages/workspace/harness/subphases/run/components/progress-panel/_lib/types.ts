import type { JsonObject } from "@/lib/format";

export interface ChartMark {
  x: number;
  y: number;
  kind: "baseline" | "epoch_finish" | "pr_sync" | "legacy";
  heading: string;
  when: string;
  matched: number;
  diff: number;
  measures: JsonObject;
  regressed: number;
  requeued: number;
}

export interface ChartModel {
  hasData: boolean;
  hasLine: boolean;
  epochCount: number;
  linePoints: string;
  areaPoints: string;
  marks: ChartMark[];
  timeLabels: string[];
}
