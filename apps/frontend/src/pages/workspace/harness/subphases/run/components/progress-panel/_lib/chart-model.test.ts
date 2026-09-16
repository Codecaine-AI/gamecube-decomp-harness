import { describe, expect, test } from "bun:test";
import type { Dashboard } from "@/lib/format";
import { chartModel } from "./chart-model";

function dashboardWithTimeline(statusRunId: string): Dashboard {
  return {
    status: { run: { id: statusRunId, createdAt: "2026-08-26T12:00:00Z" } },
    initial: { measures: { matched_code_percent: 1 } },
    current: { measures: { matched_code_percent: 2 } },
    epochs: [{ runId: statusRunId, matchedCodePercent: 3, createdAt: "2026-08-26T12:30:00Z" }],
    scoreTiers: {
      baseline: { score: 90.81, anchorRevision: "anchor", savePointId: "sp-1" },
      confirmed: { score: 91.08, delta: 0.27, savePointId: "sp-3", matches: [], improvements: [] },
      tentative: { matches: [], improvements: [] },
      timeline: [
        { savePointId: "sp-3", commitSha: "c", score: 91.08, kind: "pr_sync", label: "PR sync", createdAt: "2026-08-26T14:00:00Z" },
        { savePointId: "sp-1", commitSha: "a", score: 90.81, kind: "baseline", label: "Cycle start", createdAt: "2026-08-26T12:00:00Z" },
        { savePointId: "sp-2", commitSha: "b", score: 91.02, kind: "epoch_finish", label: "Epoch 1", createdAt: "2026-08-26T13:00:00Z" },
      ],
    },
  } as unknown as Dashboard;
}

describe("chartModel", () => {
  test("renders the cycle save-point timeline as typed steps", () => {
    const model = chartModel(dashboardWithTimeline("run-a"));

    expect(model.marks.map((mark) => mark.kind)).toEqual(["baseline", "epoch_finish", "pr_sync"]);
    expect(model.marks.map((mark) => mark.matched)).toEqual([90.81, 91.02, 91.08]);
    expect(model.linePoints).toContain(`${model.marks[1].x},${model.marks[0].y} ${model.marks[1].x},${model.marks[1].y}`);
  });

  test("does not change when the active run is restaged", () => {
    const before = chartModel(dashboardWithTimeline("run-a"));
    const after = chartModel(dashboardWithTimeline("run-b"));

    expect(after).toEqual(before);
  });

  test("does not fall back to run board measures", () => {
    const dashboard = dashboardWithTimeline("run-a");
    dashboard.scoreTiers!.timeline = [];

    expect(chartModel(dashboard)).toMatchObject({ hasData: false, hasLine: false, marks: [] });
  });
});
