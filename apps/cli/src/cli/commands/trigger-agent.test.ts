import { describe, expect, test } from "bun:test";
import { evaluateFastKnowledgeMaintenanceDecision } from "./trigger-agent.js";

describe("evaluateFastKnowledgeMaintenanceDecision", () => {
  test("does nothing before interval or report count triggers are due", () => {
    expect(
      evaluateFastKnowledgeMaintenanceDecision({
        intervalMs: 180_000,
        lastMaintenanceMs: 1_000,
        nowMs: 120_000,
        reportCountTrigger: 16,
        reportsSinceRefresh: 4,
        running: false,
      }),
    ).toMatchObject({ action: "none", reportDue: false, timeDue: false });
  });

  test("skips due fast refreshes when no worker reports changed", () => {
    expect(
      evaluateFastKnowledgeMaintenanceDecision({
        intervalMs: 180_000,
        lastMaintenanceMs: 0,
        nowMs: 180_000,
        reportCountTrigger: 16,
        reportsSinceRefresh: 0,
        running: false,
      }),
    ).toMatchObject({ action: "skip_no_new_reports", reason: "no_new_reports", reportDue: false, timeDue: true });
  });

  test("starts on coalesced report count even before the interval", () => {
    expect(
      evaluateFastKnowledgeMaintenanceDecision({
        intervalMs: 180_000,
        lastMaintenanceMs: 0,
        nowMs: 60_000,
        reportCountTrigger: 16,
        reportsSinceRefresh: 16,
        running: false,
      }),
    ).toMatchObject({ action: "start", reason: "report_count", reportDue: true, timeDue: false });
  });

  test("defers due fast refreshes while one is already running", () => {
    expect(
      evaluateFastKnowledgeMaintenanceDecision({
        intervalMs: 180_000,
        lastMaintenanceMs: 0,
        nowMs: 180_000,
        reportCountTrigger: 16,
        reportsSinceRefresh: 20,
        running: true,
      }),
    ).toMatchObject({ action: "defer", reason: "report_count", reportDue: true, timeDue: true });
  });
});
