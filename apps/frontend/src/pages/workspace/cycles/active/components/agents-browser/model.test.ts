import { describe, expect, test } from "bun:test";
import type { KernelTraceSessionDetail, KernelTraceSessionSummary } from "@agent-kernel/viewer-core";

import { currentEpochId, epochOptionsFor } from "@/components/details-rail/_components/worker-reports/epoch-selector";

import { buildAgentListModel, findEpochTraceContainer, findWorkerTraceContainer, traceSessionMatchesContext, workerTraceContainerId } from "./model";

test("workerTraceContainerId matches the kernel worker identity", async () => {
  expect(await workerTraceContainerId({
    claimId: "f4905559-47b6-4048-8ae7-09073c8db3b3",
    epochId: "8595207d-a676-41a9-877d-0874ad855b03",
    gameId: "melee",
    runId: "4a45af8a-9f8c-499b-b375-c0d8e93fc8fd",
    sessionId: "02a80f9b-1045-481b-88cf-d32b7a673afe",
  })).toBe("melee:1c5c0ad9-8355-5c70-8496-0d9b62f174a3:session:run:4a45af8a-9f8c-499b-b375-c0d8e93fc8fd-250de5809f:epoch:8595207d-a676-41a9-877d-0874ad855b03-bcfe8325f9:worker:f4905559-47b6-4048-8ae7-09073c8db3b3-82c82f0181");
});

describe("buildAgentListModel", () => {
  test("scopes outcome counts and rows to the selected epoch", () => {
    const reports = [
      { workerStateId: "state-a", epochId: "epoch-a", lifecycleStatus: "running" },
      { workerStateId: "state-b", epochId: "epoch-b", lifecycleStatus: "finished" },
    ];

    const model = buildAgentListModel(reports, "epoch-a", "all", new Set());

    expect(model.counts.all).toBe(1);
    expect(model.counts.running).toBe(1);
    expect(model.counts.finished).toBe(0);
    expect(model.reports.map((report) => report.workerStateId)).toEqual(["state-a"]);
  });
});

describe("epochOptionsFor", () => {
  test("keeps the newest numbered epoch ahead of legacy records without an ordinal", () => {
    const options = epochOptionsFor([
      { workerStateId: "legacy", epochId: "zzzz-legacy" },
      { workerStateId: "current", epochId: "epoch-7", epochOrdinal: 7 },
    ]);

    expect(currentEpochId(options)).toBe("epoch-7");
    expect(options.find((option) => option.id === "epoch-7")?.label).toBe("Epoch 7");
  });
});

describe("traceSessionMatchesContext", () => {
  const session = {
    metadata: { gameId: "melee", sessionId: "cycle-1" },
  } as unknown as KernelTraceSessionSummary;

  test("keeps trace sessions inside the current game cycle", () => {
    expect(traceSessionMatchesContext(session, "melee", "cycle-1")).toBe(true);
    expect(traceSessionMatchesContext(session, "melee", "cycle-2")).toBe(false);
    expect(traceSessionMatchesContext(session, "test", "cycle-1")).toBe(false);
  });
});

describe("findWorkerTraceContainer", () => {
  const detail = {
    containers: [
      {
        id: "worker-by-path",
        kind: "worker",
        workingDir: "/state/runs/run-1/worker_state/state-1/host-cwd",
        metadata: { runId: "run-1", claimId: "claim-old" },
      },
      {
        id: "worker-by-claim",
        kind: "worker",
        workingDir: "/tmp/worker",
        metadata: { runId: "run-1", claimId: "claim-2" },
      },
    ],
  } as unknown as KernelTraceSessionDetail;

  test("prefers the worker-state path and falls back to claim metadata", () => {
    expect(findWorkerTraceContainer(detail, { claimId: "claim-2" }, "state-1", "run-1")?.id).toBe("worker-by-path");
    expect(findWorkerTraceContainer(detail, { claimId: "claim-2" }, "state-2", "run-1")?.id).toBe("worker-by-claim");
  });

  test("does not use a claim from another run", () => {
    expect(findWorkerTraceContainer(detail, { claimId: "claim-2" }, "state-2", "run-2")).toBeNull();
  });
});

describe("findEpochTraceContainer", () => {
  const detail = {
    containers: [
      { id: "epoch-old", kind: "epoch", metadata: { runId: "run-1", epochId: "epoch-1" } },
      { id: "epoch-current", kind: "epoch", metadata: { runId: "run-2", epochId: "epoch-7" } },
    ],
  } as unknown as KernelTraceSessionDetail;

  test("finds the current run epoch before loading its worker subtree", () => {
    expect(findEpochTraceContainer(detail, "epoch-7", "run-2")?.id).toBe("epoch-current");
    expect(findEpochTraceContainer(detail, "epoch-7", "run-1")).toBeNull();
  });
});
