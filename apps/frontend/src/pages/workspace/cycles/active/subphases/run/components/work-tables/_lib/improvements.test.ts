import { describe, expect, test } from "bun:test";
import type { Dashboard } from "@/lib/format";
import {
  confirmedImprovementRows,
  confirmedMatchRows,
  improvedEmptyText,
  rowScore,
  rowUpstreamState,
  tentativeRows,
} from "./improvements";

const dashboard = {
  trustedReport: { status: "stale", staleReason: "saved report was generated before the current run" },
  improvements: [{ symbol: "old-run-row" }],
  scoreTiers: {
    baseline: { score: 90.81, anchorRevision: "anchor", savePointId: "sp-1" },
    confirmed: {
      score: 91.08,
      delta: 0.27,
      savePointId: "sp-2",
      matches: [{ symbol: "matched", unit: "unit.c", score: 100, state: "in_branch" }],
      improvements: [{ symbol: "better", unit: "unit.c", delta: 2.5, state: "in_upstream" }],
    },
    tentative: {
      matches: [{ symbol: "open-match", unit: "open.c", score: 100 }],
      improvements: [{ symbol: "open-improvement", unit: "open.c", delta: 1.25 }],
    },
    timeline: [],
  },
} as unknown as Dashboard;

describe("score tier pane rows", () => {
  test("reads confirmed and tentative rows only from scoreTiers", () => {
    expect(confirmedMatchRows(dashboard).map((row) => row.symbol)).toEqual(["matched"]);
    expect(confirmedImprovementRows(dashboard).map((row) => row.symbol)).toEqual(["better"]);
    expect(tentativeRows(dashboard).map((row) => row.symbol)).toEqual(["open-match", "open-improvement"]);
  });

  test("shows row score and upstream state from the projection", () => {
    expect(rowScore(confirmedMatchRows(dashboard)[0])).toBe("100.000%");
    expect(rowScore(confirmedImprovementRows(dashboard)[0])).toBe("+2.500 pp");
    expect(rowUpstreamState(confirmedMatchRows(dashboard)[0])).toBe("In branch");
    expect(rowUpstreamState(confirmedImprovementRows(dashboard)[0])).toBe("In upstream");
  });

  test("uses plain cycle-based empty messages", () => {
    expect(improvedEmptyText(dashboard, "tentative", "matches")).toBe("No tentative wins yet this epoch");
    expect(improvedEmptyText(dashboard, "confirmed", "matches")).toBe("No confirmed matches against upstream yet");
  });
});
