import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { JobRecord } from "@server/core/job-queue/types.js";
import { openState, type StateStore } from "@server/core/orchestrator-state";

import { createBackgroundKnowledgeTraceHooks } from "./trace.js";

const fixtures: Array<{ dir: string; store: StateStore }> = [];

function fixture(): StateStore {
  const dir = mkdtempSync(join(tmpdir(), "knowledge-trace-"));
  const store = openState(dir);
  fixtures.push({ dir, store });
  return store;
}

afterEach(() => {
  while (fixtures.length > 0) {
    const entry = fixtures.pop();
    if (!entry) continue;
    entry.store.db.close();
    rmSync(entry.dir, { recursive: true, force: true });
  }
});

function job(overrides: Partial<JobRecord> = {}): JobRecord {
  return {
    jobId: "job-1",
    kind: "knowledge_absorption",
    dedupeKey: "job-1",
    gameId: "melee",
    runId: "run-1",
    status: "claimed",
    revision: 1,
    priority: 0,
    concurrencyKey: null,
    executionClass: "local",
    leaseId: "lease-1",
    leaseExpiresAt: null,
    attempts: 1,
    nextAttemptAt: null,
    payload: {},
    resultRef: null,
    error: null,
    traceId: "trace-1",
    causedByEventId: "event-1",
    createdAt: "2026-08-14T00:00:00.000Z",
    updatedAt: "2026-08-14T00:00:00.000Z",
    completedAt: null,
    ...overrides,
  };
}

const DISABLED = { ORCH_AGENT_KERNEL_DISABLED: "1" };

describe("background knowledge trace hooks", () => {
  test("a disabled kernel makes both hooks a no-op", async () => {
    const store = fixture();
    const warning = spyOn(console, "warn").mockImplementation(() => undefined);
    const hooks = createBackgroundKnowledgeTraceHooks(store, { env: DISABLED });
    await hooks.onJobClaimed(job());
    hooks.onJobSettled(job(), { status: "succeeded" });
    await Bun.sleep(1);
    expect(warning).not.toHaveBeenCalled();
    warning.mockRestore();
  });

  // A fallback session id would file containers under a cycle no reader can
  // open, so emission is skipped rather than guessed — and said once.
  test("skips emission once when the game has no active cycle", async () => {
    const store = fixture();
    const warning = spyOn(console, "warn").mockImplementation(() => undefined);
    const hooks = createBackgroundKnowledgeTraceHooks(store, { env: {} });
    await hooks.onJobClaimed(job());
    await hooks.onJobClaimed(job({ jobId: "job-2" }));
    expect(warning).toHaveBeenCalledTimes(1);
    expect(String(warning.mock.calls[0]?.[0])).toContain("no active cycle");
    warning.mockRestore();
  });

  test("a job with no game never reaches the kernel", async () => {
    const store = fixture();
    const warning = spyOn(console, "warn").mockImplementation(() => undefined);
    const hooks = createBackgroundKnowledgeTraceHooks(store, { env: {} });
    await hooks.onJobClaimed(job({ gameId: "" }));
    expect(warning).not.toHaveBeenCalled();
    warning.mockRestore();
  });

  test("claim emission never rejects, whatever the kernel does", async () => {
    const store = fixture();
    const warning = spyOn(console, "warn").mockImplementation(() => undefined);
    const hooks = createBackgroundKnowledgeTraceHooks(store, { env: {} });
    store.db.close();
    await expect(hooks.onJobClaimed(job())).resolves.toBeUndefined();
    warning.mockRestore();
  });
});
