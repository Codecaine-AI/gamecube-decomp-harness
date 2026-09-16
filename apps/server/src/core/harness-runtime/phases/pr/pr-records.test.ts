import { describe, expect, test } from "bun:test";
import { createPrRecordsService } from "./pr-records.js";

function service() {
  return createPrRecordsService({
    latestChildDirectory: () => "",
    latestPrSplitPlanSummary: () => null,
    latestRunId: () => "run-1",
    localPrepOperationRunning: () => false,
  });
}

describe("PR record history", () => {
  test("new context is run-scoped without synthesizing cycle ownership", () => {
    expect(service().prRecordContext("/tmp/unused", "run-1")).toEqual({ runId: "run-1", baseSha: "", sourcePlan: undefined });
  });

  test("normalizing historical evidence preserves its original identifiers", () => {
    const record = service().normalizePrRecord({ cycleId: "historical-cycle", runId: "historical-run", branch: "slice" }, { runId: "new-run" });
    expect(record.cycleId).toBe("historical-cycle");
    expect(record.runId).toBe("historical-run");
    expect(service().normalizePrRecord({ branch: "new-slice" }, { runId: "new-run" })).not.toHaveProperty("cycleId");
  });
});
