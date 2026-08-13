import { describe, expect, test } from "bun:test";
import { createPrRecordsService } from "./pr-records.js";

function service(sessionUuidForRun: () => string) {
  return createPrRecordsService({
    appendLog: () => {},
    latestChildDirectory: () => "",
    latestPrSplitPlanSummary: () => null,
    latestRunId: () => "run-1",
    localPrepOperationRunning: () => false,
    sessionUuidForRun,
  });
}

describe("PR record session identity", () => {
  test("uses the project session UUID while keeping runId run-scoped", () => {
    const context = service(() => "session-uuid-1").prRecordContext("/tmp/unused", "run-1");
    expect(context).toMatchObject({ runId: "run-1", sessionId: "session-uuid-1" });
  });

  test("keeps the documented synthetic fallback for legacy runs without a session UUID", () => {
    const context = service(() => "").prRecordContext("/tmp/unused", "run-legacy");
    expect(context).toMatchObject({ runId: "run-legacy", sessionId: "run:run-legacy" });
  });
});
