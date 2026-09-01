import { afterEach, describe, expect, jest, test } from "bun:test";

import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import type { KnowledgeStore } from "../storage/store.js";
import type { LibrarianSummary } from "./consumer.js";
import { startLibrarianConsumerLane } from "./lane.js";

const globals: GlobalArgs = {
  repoRoot: "/tmp/librarian-lane-repo",
  stateDir: "/tmp/librarian-lane-state",
  dryRunAgents: false,
  provider: "test",
  model: "test",
  thinkingLevel: "test",
};

function summary(overrides: Partial<LibrarianSummary> = {}): LibrarianSummary {
  return {
    runId: "run-1",
    dryRun: false,
    pathway: null,
    passesRun: 0,
    passesApplied: 0,
    itemsApplied: 0,
    itemsRejected: 0,
    itemsSkipped: 0,
    passesFailed: 0,
    failedTaskIds: [],
    tasksSplit: 0,
    childrenEnqueued: 0,
    tasksRemaining: 0,
    aborted: false,
    stopped: false,
    paused: false,
    wallMs: 0,
    perPassMs: { min: 0, max: 0, mean: 0, p50: 0 },
    ...overrides,
  };
}

function fixture() {
  const close = jest.fn();
  const store = { close, db: {} } as unknown as KnowledgeStore;
  const openKnowledgeStore = jest.fn(() => store);
  return { close, store, openKnowledgeStore };
}

async function waitFor(predicate: () => boolean, timeoutMs = 250): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("timed out waiting for librarian lane condition");
    await Bun.sleep(1);
  }
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("startLibrarianConsumerLane", () => {
  test("drains repeatedly, idles when empty, and reuses one store", async () => {
    const { close, openKnowledgeStore } = fixture();
    const runConsumer = jest.fn(async () => summary());
    const stop = startLibrarianConsumerLane({
      runId: "run-1",
      globals,
      intervalMs: 2,
      openKnowledgeStore,
      runConsumer,
    });

    await waitFor(() => runConsumer.mock.calls.length >= 2);
    await stop();

    expect(runConsumer.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(openKnowledgeStore).toHaveBeenCalledTimes(1);
    expect(openKnowledgeStore).toHaveBeenCalledWith("melee");
    expect(close).toHaveBeenCalledTimes(1);
  });

  test("does not drain while claims are paused", async () => {
    const { openKnowledgeStore } = fixture();
    let claimsEnabled = false;
    const runConsumer = jest.fn(async () => summary());
    const stop = startLibrarianConsumerLane({
      runId: "run-1",
      globals,
      intervalMs: 2,
      shouldClaim: () => claimsEnabled,
      openKnowledgeStore,
      runConsumer,
    });

    await Bun.sleep(8);
    expect(runConsumer).not.toHaveBeenCalled();
    claimsEnabled = true;
    await waitFor(() => runConsumer.mock.calls.length === 1);
    await stop();
  });

  test("excludes failed task ids from later drains", async () => {
    const { openKnowledgeStore } = fixture();
    const excludedByDrain: string[][] = [];
    const runConsumer = jest.fn(async (_store, options) => {
      excludedByDrain.push([...options.exclude ?? []]);
      return excludedByDrain.length === 1
        ? summary({ passesRun: 1, passesFailed: 1, failedTaskIds: ["task-bad"] })
        : summary();
    });
    const stop = startLibrarianConsumerLane({
      runId: "run-1",
      globals,
      intervalMs: 2,
      openKnowledgeStore,
      runConsumer,
      log: () => undefined,
    });

    await waitFor(() => excludedByDrain.length >= 2);
    await stop();

    expect(excludedByDrain[0]).toEqual([]);
    expect(excludedByDrain[1]).toEqual(["task-bad"]);
  });

  test("aborts an in-flight drain on stop", async () => {
    const { close, openKnowledgeStore } = fixture();
    let receivedSignal: AbortSignal | undefined;
    const runConsumer = jest.fn((_store, options) => new Promise<LibrarianSummary>((resolve) => {
      receivedSignal = options.signal;
      options.signal?.addEventListener("abort", () => resolve(summary({ stopped: true })), { once: true });
    }));
    const stop = startLibrarianConsumerLane({
      runId: "run-1",
      globals,
      openKnowledgeStore,
      runConsumer,
    });

    await waitFor(() => receivedSignal !== undefined);
    await stop();

    expect(receivedSignal?.aborted).toBe(true);
    expect(close).toHaveBeenCalledTimes(1);
  });

  test("retries after a consumer error", async () => {
    const { openKnowledgeStore } = fixture();
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    const runConsumer = jest.fn(async () => {
      if (runConsumer.mock.calls.length === 1) throw new Error("test failure");
      return summary();
    });
    const stop = startLibrarianConsumerLane({
      runId: "run-1",
      globals,
      intervalMs: 1,
      openKnowledgeStore,
      runConsumer,
    });

    await waitFor(() => runConsumer.mock.calls.length >= 2);
    await stop();

    expect(runConsumer.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
