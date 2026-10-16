/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test";
import {
  reportBorderClass,
  reportCountsForReports,
  reportFilters,
  reportFinishLabel,
  reportMatchesFilter,
  reportOutcome,
  reportOutcomeDescription,
  reportResult,
  reportStopReason,
  visibleReportFilters,
} from "./worker-reports";

describe("attempt budget exhausted worker reports", () => {
  const report = { repairAttempts: { stop_reason: "attempt_budget_exhausted" } };

  test("maps the stop reason through outcome displays and counts", () => {
    expect(reportOutcome(report)).toBe("attempt_budget_exhausted");
    expect(reportMatchesFilter(report, "attempt_budget_exhausted")).toBe(true);
    expect(reportBorderClass(report)).toBe("border-l-purple");
    expect(reportFinishLabel(report)).toBe("budget exhausted");
    expect(reportOutcomeDescription(report)).toContain("best banked checkpoint (or baseline) was selected");

    const counts = reportCountsForReports([report]);
    expect(counts.all).toBe(1);
    expect(counts.attempt_budget_exhausted).toBe(1);
    expect(visibleReportFilters(counts, "all").some((filter) => filter.id === "attempt_budget_exhausted")).toBe(true);
  });

  test("defines the new filter without replacing legacy outcomes", () => {
    const filter = reportFilters.find((option) => option.id === "attempt_budget_exhausted");
    expect(filter).toEqual({
      id: "attempt_budget_exhausted",
      label: "Budget Exhausted",
      description: "The worker spent its attempt budget (5 base, +2 per new-best improvement); the best banked checkpoint (or baseline) was selected.",
    });
    expect(reportFilters.some((option) => option.id === "improvement_followup_budget_exhausted")).toBe(true);
  });
});

describe("worker reports withheld by steering completion holds", () => {
  // An exact runner-validated close, as the read model serves it before labeling.
  const exactClose = (before: number) => ({
    lifecycleStatus: "exact",
    stopReason: "target_complete",
    repairAttempts: { stop_reason: "accepted_exact" },
    runnerValidation: { status: "passed", target: { before, after: 100, exact: true } },
  });

  const cases = [
    { name: "steering rollback hold keeps the delta as improved", report: { ...exactClose(80), completionHold: "steering_rollback" }, result: "improved", outcome: "finished", stop: "stalled" },
    { name: "unknown hold with no delta is no progress", report: { ...exactClose(100), completionHold: "unknown" }, result: "no_progress", outcome: "finished", stop: "stalled" },
    { name: "active unverified_match row is no progress", report: { ...exactClose(100), verification: "unverified_match" }, result: "no_progress", outcome: "finished", stop: "stalled" },
    { name: "no hold stays exact", report: exactClose(80), result: "exact", outcome: "exact", stop: "target_complete" },
  ] as const;

  for (const { name, report, result, outcome, stop } of cases) {
    test(name, () => {
      expect(reportResult(report)).toBe(result);
      expect(reportStopReason(report)).toBe(stop);
      expect(reportOutcome(report)).toBe(outcome);
      expect(reportFinishLabel(report)).toBe(outcome);
      expect(reportMatchesFilter(report, "exact")).toBe(outcome === "exact");
      const counts = reportCountsForReports([report]);
      expect(counts.exact).toBe(outcome === "exact" ? 1 : 0);
      expect(counts.finished).toBe(outcome === "finished" ? 1 : 0);
    });
  }

  test("a held report closed by lifecycle alone is finished, not exact", () => {
    const report = { lifecycleStatus: "exact", completionHold: "steering_rollback" };
    expect(reportOutcome(report)).toBe("finished");
  });
});
