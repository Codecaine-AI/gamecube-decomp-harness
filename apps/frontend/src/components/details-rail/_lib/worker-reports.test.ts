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
