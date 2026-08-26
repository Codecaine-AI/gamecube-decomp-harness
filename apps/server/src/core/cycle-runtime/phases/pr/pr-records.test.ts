import { describe, expect, test } from "bun:test";
import { createPrRecordsService } from "./pr-records.js";

function service(cycleUuidForRun: () => string) {
  return createPrRecordsService({
    latestChildDirectory: () => "",
    latestPrSplitPlanSummary: () => null,
    latestRunId: () => "run-1",
    localPrepOperationRunning: () => false,
    cycleUuidForRun,
  });
}

describe("PR record cycle identity", () => {
  test("uses the game cycle UUID while keeping runId run-scoped", () => {
    const context = service(() => "cycle-uuid-1").prRecordContext("/tmp/unused", "run-1");
    expect(context).toMatchObject({ runId: "run-1", cycleId: "cycle-uuid-1" });
  });

  test("does not synthesize a cycle identity when the run has no cycle UUID", () => {
    const context = service(() => "").prRecordContext("/tmp/unused", "run-without-cycle");
    expect(context).toEqual({ runId: "run-without-cycle", baseSha: "", sourcePlan: undefined });
  });
});
