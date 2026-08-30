import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  initializeHarnessState,
  listGameEvents,
  releaseDispatch,
  requestDispatch,
} from "@server/core/harness-state";
import {
  admitEpochTargets,
  claimNextEpochTarget,
  createRun,
  startSchedulerEpoch,
} from "@server/core/cycle-runtime/run-state";
import { openState, type StateStore } from "@server/core/orchestrator-state";
import { deleteSandboxForJob, reconcileSandboxes } from "./sandbox-lifecycle.js";
import {
  FakeSandboxProvider,
  type SandboxCreateParams,
  type SandboxProvider,
} from "./sandbox.js";
import {
  attachJobPayload,
  claimNextJob,
  getJob,
  getJobByDedupeKey,
} from "./kernel.js";

const roots: string[] = [];
const stores: StateStore[] = [];
const ACTIVE_AT = "2030-01-01T00:00:01.000Z";
const EXPIRED_AT = "2030-01-01T00:02:00.000Z";

afterEach(() => {
  for (const store of stores.splice(0)) store.db.close();
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

interface Fixture {
  store: StateStore;
  provider: FakeSandboxProvider;
  sandboxId: string;
  gameId: string;
  runId: string;
  jobId: string;
  claimId: string;
  dispatchLeaseId: string;
}

async function fixture(labelOverrides: Record<string, string> = {}): Promise<Fixture> {
  const stateDir = mkdtempSync(join(tmpdir(), "sandbox-lifecycle-"));
  roots.push(stateDir);
  const store = openState(stateDir);
  stores.push(store);
  const gameId = "melee";
  const run = createRun(
    store,
    "matched_code_percent",
    100,
    1,
    { gameId, stateDir },
    { baseRevision: "base-test" },
  );
  const epoch = startSchedulerEpoch(store, run.id, {
    workerPoolSize: 1,
  });
  admitEpochTargets(store, {
    epochId: epoch.id,
    runId: run.id,
    candidates: [{
      kind: "function",
      unit: "unit",
      symbol: "fn",
      sourcePath: "src/a.c",
      size: 64,
      fuzzy: 90,
    }],
    workerPoolSize: 1,
  });
  const target = claimNextEpochTarget({
    store,
    runId: run.id,
    workerId: "sandbox-worker",
    baseRev: "base-test",
    ttlSeconds: 1_800,
  });
  if (!target) throw new Error("Expected target claim");

  initializeHarnessState(store, { gameId, traceId: `trace-game-${gameId}` });
  const dispatch = requestDispatch(store, {
    kind: "run",
    workflowId: run.id,
    reason: "sandbox lifecycle test",
    commandId: `command-${run.id}`,
    correlationId: run.id,
    actor: "operator",
    gameId,
  });
  if (dispatch.queued) throw new Error("Expected dispatch lease");

  const queued = getJobByDedupeKey(store, "worker", target.epochTargetId);
  if (!queued) throw new Error("Expected queued worker job");
  store.db.query("UPDATE jobs SET execution_class = 'sandbox' WHERE job_id = ?").run(queued.jobId);
  const claimed = claimNextJob(store, {
    kind: "worker",
    concurrencyLimit: 1,
    leaseMs: 60_000,
    at: "2030-01-01T00:00:00.000Z",
  });
  if (!claimed) throw new Error("Expected claimed worker job");

  const labels = {
    game_id: gameId,
    run_id: run.id,
    claim_id: target.claimId,
    job_id: claimed.job.jobId,
    job_lease_id: claimed.token.leaseId,
    dispatch_lease_id: dispatch.leaseId,
    worker_state_id: target.workerStateId,
    trace_id: claimed.job.traceId ?? `trace-job-${claimed.job.jobId}`,
    ...labelOverrides,
  };
  const createParams: SandboxCreateParams = {
    snapshot: "melee-worker-v1",
    labels,
    resources: { cpu: 2, memoryGiB: 4, diskGiB: 5 },
    ttlMinutes: 90,
  };
  const provider = new FakeSandboxProvider();
  const sandbox = await provider.create(createParams);
  attachJobPayload(store, claimed.token, {
    sandbox_id: sandbox.sandboxId,
    target_claim_id: target.claimId,
    worker_state_id: target.workerStateId,
  }, { at: ACTIVE_AT });

  return {
    store,
    provider,
    sandboxId: sandbox.sandboxId,
    gameId,
    runId: run.id,
    jobId: claimed.job.jobId,
    claimId: target.claimId,
    dispatchLeaseId: dispatch.leaseId,
  };
}

function deletedEvents(store: StateStore) {
  return listGameEvents(store.db).filter((event) => event.eventType === "sandbox.deleted");
}

describe("sandbox reconciliation", () => {
  test("settlement deletion times out and leaves the sandbox to reconciliation", async () => {
    const f = await fixture();
    const warnings: string[] = [];
    const currentJob = getJob(f.store, f.jobId);
    if (!currentJob) throw new Error("Expected worker job");
    const provider: SandboxProvider = {
      create: (params) => f.provider.create(params),
      get: (sandboxId) => f.provider.get(sandboxId),
      listByLabels: (labels) => f.provider.listByLabels(labels),
      delete: () => new Promise<void>(() => {}),
    };

    expect(await deleteSandboxForJob(f.store, currentJob, "settlement", {
      sandboxProvider: provider,
      settlementDeleteTimeoutMs: 10,
      warn: (message) => warnings.push(message),
    })).toBe(false);
    expect(warnings).toEqual([
      `[sandbox] settlement delete timed out for ${f.sandboxId}; leaving to reconciliation`,
    ]);
    expect(deletedEvents(f.store)).toEqual([]);
    expect(await f.provider.get(f.sandboxId)).not.toBeNull();
  });

  test("keeps a sandbox with the current matching unexpired job lease", async () => {
    const f = await fixture();

    expect(await reconcileSandboxes(f.store, { gameId: f.gameId, at: ACTIVE_AT }, {
      sandboxProvider: f.provider,
    })).toEqual({ scanned: 1, kept: 1, deleted: 0, failed: 0 });
    expect(await f.provider.get(f.sandboxId)).not.toBeNull();
    expect(f.provider.deletedSandboxes).toEqual([]);
    expect(deletedEvents(f.store)).toEqual([]);
  });

  test("deletes a sandbox after its job records a different sandbox id", async () => {
    const f = await fixture();
    f.store.db.query("UPDATE jobs SET payload_json = json_set(payload_json, '$.sandbox_id', 'sandbox-new') WHERE job_id = ?").run(f.jobId);

    expect(await reconcileSandboxes(f.store, { gameId: f.gameId, at: ACTIVE_AT }, {
      sandboxProvider: f.provider,
    })).toEqual({ scanned: 1, kept: 0, deleted: 1, failed: 0 });
    expect(await f.provider.get(f.sandboxId)).toBeNull();
    expect(deletedEvents(f.store)[0]?.payload).toMatchObject({
      sandbox_id: f.sandboxId,
      reason: "reconciliation",
      job_id: f.jobId,
    });
  });

  test("keeps a stopped sandbox with a live claim and unexpired job lease", async () => {
    const f = await fixture();
    const handle = await f.provider.get(f.sandboxId);
    if (!handle) throw new Error("Expected sandbox handle");
    await handle.stop();
    expect(f.provider.sandboxState(f.sandboxId)).toBe("stopped");

    expect(await reconcileSandboxes(f.store, { gameId: f.gameId, at: ACTIVE_AT }, {
      sandboxProvider: f.provider,
    })).toEqual({ scanned: 1, kept: 1, deleted: 0, failed: 0 });
    expect(f.provider.sandboxState(f.sandboxId)).toBe("stopped");
    expect(await f.provider.get(f.sandboxId)).not.toBeNull();
    expect(f.provider.deletedSandboxes).toEqual([]);
    expect(deletedEvents(f.store)).toEqual([]);
  });

  test("keeps a sandbox while its expired job lease is awaiting re-claim", async () => {
    const f = await fixture();

    expect(await reconcileSandboxes(f.store, { gameId: f.gameId, at: EXPIRED_AT }, {
      sandboxProvider: f.provider,
    })).toEqual({ scanned: 1, kept: 1, deleted: 0, failed: 0 });
    expect(await f.provider.get(f.sandboxId)).not.toBeNull();
    expect(deletedEvents(f.store)).toEqual([]);
  });

  test("treats a provider not-found response as a successful deletion", async () => {
    const f = await fixture({ job_id: "job-missing" });
    const warnings: unknown[] = [];
    const provider: SandboxProvider = {
      create: (params) => f.provider.create(params),
      get: (sandboxId) => f.provider.get(sandboxId),
      listByLabels: (labels) => f.provider.listByLabels(labels),
      delete: async () => {
        const error = new Error("sandbox is gone");
        error.name = "DaytonaNotFoundError";
        throw error;
      },
    };

    expect(await reconcileSandboxes(f.store, { gameId: f.gameId, at: ACTIVE_AT }, {
      sandboxProvider: provider,
      warn: (...warning) => warnings.push(warning),
    })).toEqual({ scanned: 1, kept: 0, deleted: 1, failed: 0 });
    expect(warnings).toEqual([]);
    expect(deletedEvents(f.store)).toHaveLength(1);
  });

  test("retries transient provider deletion failures with the configured waits", async () => {
    const f = await fixture({ job_id: "job-missing" });
    const waits: number[] = [];
    let attempts = 0;
    const provider: SandboxProvider = {
      create: (params) => f.provider.create(params),
      get: (sandboxId) => f.provider.get(sandboxId),
      listByLabels: (labels) => f.provider.listByLabels(labels),
      delete: async (sandboxId, reason) => {
        attempts += 1;
        if (attempts === 1) {
          const error = new Error("state change in progress");
          error.name = "DaytonaConflictError";
          throw error;
        }
        if (attempts === 2) throw Object.assign(new Error("bad gateway"), { status: 502 });
        await f.provider.delete(sandboxId, reason);
      },
    };

    expect(await reconcileSandboxes(f.store, { gameId: f.gameId, at: ACTIVE_AT }, {
      sandboxProvider: provider,
      retryDelay: async (milliseconds) => { waits.push(milliseconds); },
    })).toEqual({ scanned: 1, kept: 0, deleted: 1, failed: 0 });
    expect(attempts).toBe(3);
    expect(waits).toEqual([5_000, 15_000]);
    expect(deletedEvents(f.store)).toHaveLength(1);
  });

  test("keeps a stopped sandbox with an expired job lease awaiting re-claim", async () => {
    const f = await fixture();
    const handle = await f.provider.get(f.sandboxId);
    if (!handle) throw new Error("Expected sandbox handle");
    await handle.stop();
    expect(f.provider.sandboxState(f.sandboxId)).toBe("stopped");

    expect(await reconcileSandboxes(f.store, { gameId: f.gameId, at: EXPIRED_AT }, {
      sandboxProvider: f.provider,
    })).toEqual({ scanned: 1, kept: 1, deleted: 0, failed: 0 });
    expect(await f.provider.get(f.sandboxId)).not.toBeNull();
    expect(f.provider.deletedSandboxes).toEqual([]);
    expect(deletedEvents(f.store)).toEqual([]);
  });

  test("does not delete a sandbox whose job re-claimed with a new lease id", async () => {
    const f = await fixture();
    const reclaimed = claimNextJob(f.store, {
      kind: "worker",
      concurrencyLimit: 1,
      leaseMs: 60_000,
      at: EXPIRED_AT,
    });
    if (!reclaimed) throw new Error("Expected worker job to be re-claimed");
    expect(reclaimed.job.jobId).toBe(f.jobId);
    expect(reclaimed.token.leaseId).not.toBe(f.provider.createdSandboxes[0]!.labels.job_lease_id);

    expect(await reconcileSandboxes(f.store, { gameId: f.gameId, at: ACTIVE_AT }, {
      sandboxProvider: f.provider,
    })).toEqual({ scanned: 1, kept: 1, deleted: 0, failed: 0 });
    expect(await f.provider.get(f.sandboxId)).not.toBeNull();
    expect(f.provider.deletedSandboxes).toEqual([]);
  });

  test("deletes a sandbox whose labeled job row is missing", async () => {
    const f = await fixture({ job_id: "job-missing" });

    expect(await reconcileSandboxes(f.store, { gameId: f.gameId, at: ACTIVE_AT }, {
      sandboxProvider: f.provider,
    })).toEqual({ scanned: 1, kept: 0, deleted: 1, failed: 0 });
    expect(deletedEvents(f.store)[0]?.payload).toMatchObject({
      sandbox_id: f.sandboxId,
      reason: "reconciliation",
      job_id: "job-missing",
      claim_id: f.claimId,
    });
  });

  test("deletes a sandbox after its dispatch lease becomes invalid", async () => {
    const f = await fixture();
    releaseDispatch(f.store, {
      leaseId: f.dispatchLeaseId,
      commandId: `command-release-${f.runId}`,
      correlationId: f.runId,
      actor: "operator",
      gameId: f.gameId,
    });

    expect(await reconcileSandboxes(f.store, { gameId: f.gameId, at: ACTIVE_AT }, {
      sandboxProvider: f.provider,
    })).toEqual({ scanned: 1, kept: 0, deleted: 1, failed: 0 });
  });

  test("run restarted with new dispatch lease keeps live claim sandboxes", async () => {
    const f = await fixture();
    releaseDispatch(f.store, {
      leaseId: f.dispatchLeaseId,
      commandId: `command-release-${f.runId}`,
      correlationId: f.runId,
      actor: "operator",
      gameId: f.gameId,
    });
    const restarted = requestDispatch(f.store, {
      kind: "run",
      workflowId: f.runId,
      reason: "restart sandbox lifecycle test run",
      commandId: `command-restart-${f.runId}`,
      correlationId: f.runId,
      actor: "operator",
      gameId: f.gameId,
    });
    if (restarted.queued) throw new Error("Expected restarted dispatch lease");
    expect(restarted.leaseId).not.toBe(f.dispatchLeaseId);

    expect(await reconcileSandboxes(f.store, { gameId: f.gameId, at: ACTIVE_AT }, {
      sandboxProvider: f.provider,
    })).toEqual({ scanned: 1, kept: 1, deleted: 0, failed: 0 });
    expect(await f.provider.get(f.sandboxId)).not.toBeNull();
    expect(f.provider.deletedSandboxes).toEqual([]);
  });

  test("deletes a sandbox after its target claim closes", async () => {
    const f = await fixture();
    f.store.db.query("UPDATE target_claims SET status = 'closed' WHERE id = ?").run(f.claimId);

    expect(await reconcileSandboxes(f.store, { gameId: f.gameId, at: ACTIVE_AT }, {
      sandboxProvider: f.provider,
    })).toEqual({ scanned: 1, kept: 0, deleted: 1, failed: 0 });
  });

  test("is a cheap no-op without a provider or when the provider lists nothing", async () => {
    const f = await fixture();

    expect(await reconcileSandboxes(f.store, { gameId: f.gameId, at: ACTIVE_AT })).toEqual({
      scanned: 0,
      kept: 0,
      deleted: 0,
      failed: 0,
    });
    expect(await f.provider.get(f.sandboxId)).not.toBeNull();

    const emptyProvider = new FakeSandboxProvider();
    expect(await reconcileSandboxes(f.store, { gameId: f.gameId, at: ACTIVE_AT }, {
      sandboxProvider: emptyProvider,
    })).toEqual({ scanned: 0, kept: 0, deleted: 0, failed: 0 });
  });

  test("continues deleting other orphans when one provider deletion fails", async () => {
    const f = await fixture({ job_id: "job-missing" });
    const second = await f.provider.create({
      ...f.provider.createdSandboxes[0]!.params,
      labels: {
        ...f.provider.createdSandboxes[0]!.labels,
        job_id: "job-second-orphan",
      },
    });
    const warnings: Array<{ message: string; error?: unknown }> = [];
    const provider: SandboxProvider = {
      create: (params) => f.provider.create(params),
      get: (sandboxId) => f.provider.get(sandboxId),
      listByLabels: (labels) => f.provider.listByLabels(labels),
      delete: async (sandboxId, reason) => {
        if (sandboxId === f.sandboxId) throw new Error("provider unavailable");
        await f.provider.delete(sandboxId, reason);
      },
    };

    expect(await reconcileSandboxes(f.store, { gameId: f.gameId, at: ACTIVE_AT }, {
      sandboxProvider: provider,
      warn: (message, error) => warnings.push({ message, error }),
    })).toEqual({ scanned: 2, kept: 0, deleted: 1, failed: 1 });
    expect(await f.provider.get(f.sandboxId)).not.toBeNull();
    expect(await f.provider.get(second.sandboxId)).toBeNull();
    expect(f.provider.deletedSandboxes).toEqual([
      expect.objectContaining({ sandboxId: second.sandboxId, reason: "reconciliation" }),
    ]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toContain(`failed to delete ${f.sandboxId}`);
    expect(deletedEvents(f.store)).toHaveLength(1);
  });
});
