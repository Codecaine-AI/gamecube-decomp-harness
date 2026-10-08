import { recordSyncRequested } from "@server/core/harness-runtime/phases/sync/state";
import { initializeDispatchState, requestDispatch, releaseDispatch } from "@server/core/harness-state/lease";
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRun, openState } from "@server/core/harness-runtime/run-state";
import { recoverRun } from "@server/core/harness-runtime/phases/running/run-control.js";
import { getHarnessState, getHarnessTimeline, initializeHarnessState, transitionHarnessState } from "@server/core/harness-state/state.js";
import { handleHarnessApiRoute, reconcileDesiredHarnessRun, type HarnessControlDeps } from "./harness";

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function fixture(ready = true) {
  const dir = mkdtempSync(join(tmpdir(), "harness-controls-")); dirs.push(dir);
  const store = openState(dir);
  initializeHarnessState(store.db, { gameId: "melee", worktree: "/fixture", configurationRevision: "config", commandId: "init" });
  if (ready) transitionHarnessState(store.db, { gameId: "melee", expectedRevision: 0, commandId: "ready", patch: { source: { head: "head" }, readiness: { build: "ready", sources: "ready", sandbox: "ready", evidence: "ready" } } });
  store.db.close();
  let active = false; let initialized = 0; let started = 0;
  const deps: HarnessControlDeps = {
    openStore: () => openState(dir), processActive: () => active,
    initializeRun: async () => {
      initialized++;
      const db = openState(dir);
      try {
        const run = createRun(db, "matched_code_percent", 100, 1, { gameId: "melee", repoRoot: "/fixture" } as never, { baseRevision: "head" });
        db.db.query("UPDATE runs SET status = 'ready' WHERE id = ?").run(run.id);
        return run.id;
      } finally { db.db.close(); }
    },
    startRun: async () => { started++; active = true; return Response.json({ started: true }); },
    resumeRun: () => {},
  };
  const call = (action: string, body: Record<string, unknown>) => handleHarnessApiRoute(new Request(`http://localhost/api/harness/${action}`, { method: "POST", body: JSON.stringify(body) }), new URL(`http://localhost/api/harness/${action}`), deps);
  const read = () => { const db = openState(dir); try { return { state: getHarnessState(db.db, "melee")!, timeline: getHarnessTimeline(db.db, "melee") }; } finally { db.db.close(); } };
  return { call, read, deps, dir, counts: () => ({ initialized, started }), setActive: () => { active = true; } };
}

describe("harness controls", () => {
  test("status reads merge the live upstream drift notice without persisting it", async () => {
    const f = fixture();
    { const db = openState(f.dir); try { transitionHarnessState(db.db, { gameId: "melee", expectedRevision: 1, commandId: "upstream", patch: { source: { upstream_revision: "U" } } }); } finally { db.db.close(); } }
    const drift = { upstream_ref: "origin/master", upstream_head: "H3", accepted_upstream: "U", upstream_ahead_by: 3, oldest: { sha: "H1", subject: "one" }, newest: { sha: "H3", subject: "three" }, observed_at: "t" };
    const deps: HarnessControlDeps = { ...f.deps, observeUpstreamDrift: (harness) => harness.source.upstream_revision === "U" ? drift : null };
    const url = new URL("http://localhost/api/harness?gameId=melee");
    const payload = await (await handleHarnessApiRoute(new Request(url), url, deps))!.json();
    expect(payload.harness.notices).toEqual([expect.objectContaining({ code: "upstream_drift", source_id: "melee", detail: expect.objectContaining({ upstream_ahead_by: 3, newest: { sha: "H3", subject: "three" } }) })]);
    expect(payload.harness.notices[0].message).toContain("is 3 commit(s) ahead of the accepted upstream U (oldest H1 one; newest H3 three)");
    expect(payload.harness.execution.blockers).toEqual([]);
    expect(f.read().state.notices).toEqual([]);
    expect(f.read().state.identity.revision).toBe(payload.harness.identity.revision);
  });

  test("timeline reads respect the cursor and never start or mutate work", async () => {
    const f = fixture();
    await f.call("pause", { gameId: "melee", commandId: "pause", expectedRevision: 1 });
    const before = f.read();
    const url = new URL(`http://localhost/api/harness/timeline?gameId=melee&after=${before.state.history.timeline_cursor}`);
    const response = await handleHarnessApiRoute(new Request(url), url, f.deps);
    expect((await response?.json()).timeline).toEqual([]);
    expect(f.read()).toEqual(before);
    expect(f.counts()).toEqual({ initialized: 0, started: 0 });
  });
  test("requires explicit game, command and revision", async () => {
    const f = fixture();
    expect((await f.call("run", { gameId: "melee" }))?.status).toBe(400);
    expect(f.read().state.execution.desired).toBe("paused");
  });
  test("a blocked Run request records intent without starting a process", async () => {
    const f = fixture(false);
    const result = await f.call("run", { gameId: "melee", commandId: "run", expectedRevision: 0 });
    expect((await result?.json()).outcome).toBe("blocked");
    expect(f.read().state.execution.desired).toBe("run");
    expect(f.counts()).toEqual({ initialized: 0, started: 0 });
  });
  test("command retries reuse the run and do not start duplicate processes or evidence", async () => {
    const f = fixture(); const body = { gameId: "melee", commandId: "run", expectedRevision: 1 };
    expect((await f.call("run", body))?.status).toBe(200);
    expect((await f.call("run", body))?.status).toBe(200);
    expect(f.counts()).toEqual({ initialized: 1, started: 1 });
    expect(f.read().timeline).toHaveLength(1);
    expect(f.read().state.history.run_id).toBeTruthy();
  });
  test("Pause records durable intent and lets a live process drain", async () => {
    const f = fixture(); f.setActive();
    const result = await f.call("pause", { gameId: "melee", commandId: "pause", expectedRevision: 1 });
    expect((await result?.json()).outcome).toBe("draining");
    expect(f.read().state.execution.desired).toBe("paused");
    expect(f.read().timeline[0]?.kind).toBe("pause_requested");
  });
  test("a pause arriving during initialization prevents worker launch", async () => {
    const f = fixture(); const initialize = f.deps.initializeRun;
    f.deps.initializeRun = async (body) => {
      const runId = await initialize(body);
      await f.call("pause", { gameId: "melee", commandId: "pause", expectedRevision: f.read().state.identity.revision });
      return runId;
    };
    const result = await f.call("run", { gameId: "melee", commandId: "run", expectedRevision: 1 });
    expect((await result?.json()).outcome).toBe("paused");
    expect(f.counts()).toEqual({ initialized: 1, started: 0 });
  });
});


describe("persisted desired Run reconciliation", () => {
  test("starts after readiness clears without another Run request and does not add intent events", async () => {
    const f = fixture(false);
    let initializationBody: Record<string, unknown> = {};
    const initialize = f.deps.initializeRun;
    f.deps.initializeRun = async (body) => { initializationBody = body; return initialize(body); };
    await f.call("run", { gameId: "melee", commandId: "run", expectedRevision: 0, maxWorkers: 7, model: "requested-model" });
    const store = f.deps.openStore({});
    transitionHarnessState(store.db, { gameId: "melee", commandId: "ready", expectedRevision: f.read().state.identity.revision, patch: { source: { head: "head" }, readiness: { build: "ready", sources: "ready", sandbox: "ready", evidence: "ready" } } });
    store.db.close();
    const events = f.read().timeline.length;
    const result = await reconcileDesiredHarnessRun({ gameId: "melee" }, f.deps);
    expect((await result.json()).outcome).toBe("running");
    await reconcileDesiredHarnessRun({ gameId: "melee" }, f.deps);
    expect(f.counts()).toEqual({ initialized: 1, started: 1 });
    expect(f.read().timeline).toHaveLength(events);
    expect(initializationBody).toMatchObject({ maxWorkers: 7, model: "requested-model", commandId: "run:initialize" });
  });
  test("waits for Sync release, then reconciles persisted Run intent", async () => {
    const f = fixture();
    const store = f.deps.openStore({});
    initializeDispatchState(store, { gameId: "melee", traceId: "test" });
    recordSyncRequested(store, { gameId: "melee", syncId: "sync", commandId: "sync-record", correlationId: "sync", actor: "operator", intake: { upstream_from: "head", upstream_to: "next", merged_pr_ids: [], corpus_batch_ids: [], knowledge_only: false } });
    const sync = requestDispatch(store, { gameId: "melee", actor: "operator", commandId: "sync", correlationId: "sync", kind: "sync", workflowId: "sync", reason: "test" });
    if (sync.queued) throw new Error("Sync should acquire its lease");
    const response = await f.call("run", { gameId: "melee", commandId: "run", expectedRevision: 1 });
    expect((await response?.json()).outcome).toBe("waiting_for_sync");
    expect(f.counts()).toEqual({ initialized: 0, started: 0 });
    releaseDispatch(store, { gameId: "melee", actor: "runner", commandId: "release", correlationId: "sync", leaseId: sync.leaseId });
    store.db.close();
    expect((await (await reconcileDesiredHarnessRun({ gameId: "melee" }, f.deps)).json()).outcome).toBe("running");
    expect(f.counts()).toEqual({ initialized: 1, started: 1 });
  });
  test("a readiness change during initialization prevents launch", async () => {
    const f = fixture(); const initialize = f.deps.initializeRun;
    f.deps.initializeRun = async (body) => {
      const runId = await initialize(body);
      const store = f.deps.openStore({});
      transitionHarnessState(store.db, { gameId: "melee", commandId: "invalidate", expectedRevision: f.read().state.identity.revision, patch: { readiness: { sandbox: "pending" } } });
      store.db.close();
      return runId;
    };
    expect((await (await f.call("run", { gameId: "melee", commandId: "run", expectedRevision: 1 }))?.json()).outcome).toBe("blocked");
    expect(f.counts()).toEqual({ initialized: 1, started: 0 });
  });
  test("concurrent reconciliation launches once and paused intent stays paused", async () => {
    const f = fixture(false);
    await reconcileDesiredHarnessRun({ gameId: "melee" }, f.deps);
    expect(f.counts()).toEqual({ initialized: 0, started: 0 });
    const store = f.deps.openStore({});
    transitionHarnessState(store.db, { gameId: "melee", commandId: "desired", expectedRevision: 0, patch: { execution: { desired: "run" }, source: { head: "head" }, readiness: { build: "ready", sources: "ready", sandbox: "ready", evidence: "ready" } } });
    store.db.close();
    await Promise.all([reconcileDesiredHarnessRun({ gameId: "melee" }, f.deps), reconcileDesiredHarnessRun({ gameId: "melee" }, f.deps)]);
    expect(f.counts()).toEqual({ initialized: 1, started: 1 });
  });
});


test("automatic reconciliation preserves recovery blockers", async () => {
  const f = fixture();
  const store = f.deps.openStore({});
  transitionHarnessState(store.db, { gameId: "melee", expectedRevision: 1, commandId: "blocked", patch: { execution: { desired: "run", status: "blocked", blockers: [{ code: "epoch_boundary_retry_exhausted", message: "recover first", recoverable: true, source_kind: "run", source_id: "run" }] } } });
  store.db.close();
  expect((await (await reconcileDesiredHarnessRun({ gameId: "melee" }, f.deps)).json()).outcome).toBe("blocked");
  expect(f.counts()).toEqual({ initialized: 0, started: 0 });
});

test("automatic reconciliation proceeds after run recovery clears epoch blockers", async () => {
  const f = fixture();
  const store = f.deps.openStore({});
  const run = createRun(
    store,
    "matched_code_percent",
    100,
    1,
    { gameId: "melee", repoRoot: f.dir, stateDir: f.dir } as never,
    { baseRevision: "head" },
  );
  store.db.query("UPDATE runs SET status = 'failed' WHERE id = ?").run(run.id);
  const harness = getHarnessState(store.db, "melee");
  if (!harness) throw new Error("test harness was not initialized");
  transitionHarnessState(store.db, {
    gameId: "melee",
    expectedRevision: harness.identity.revision,
    commandId: "blocked-before-recovery",
    patch: {
      execution: {
        desired: "run",
        workflow: "sync",
        status: "blocked",
        blockers: [{
          code: "epoch_boundary_failed",
          message: "recover first",
          recoverable: true,
          source_kind: "epoch",
          source_id: "epoch-test",
        }],
      },
      history: { run_id: run.id },
    },
  });
  await recoverRun({
    confirmed: true,
    globals: {
      dryRunAgents: true,
      model: "test",
      provider: "test",
      repoRoot: f.dir,
      stateDir: f.dir,
      thinkingLevel: "low",
    },
    processIntegrations: false,
    reason: "recover the failed epoch boundary",
    runId: run.id,
    store,
  });
  store.db.close();

  const response = await reconcileDesiredHarnessRun({ gameId: "melee" }, f.deps);

  expect((await response.json()).outcome).toBe("running");
  expect(f.counts()).toEqual({ initialized: 0, started: 1 });
  expect(f.read().state.execution.blockers).toEqual([]);
});


test("reconciliation resumes the existing paused Run after Sync", async () => {
  const f = fixture();
  await f.call("run", { gameId: "melee", commandId: "run", expectedRevision: 1 });
  const runId = f.read().state.history.run_id!;
  const store = f.deps.openStore({});
  store.db.query("UPDATE runs SET status = 'paused' WHERE id = ?").run(runId);
  store.db.close();
  let resumed: unknown;
  f.deps.processActive = () => false;
  f.deps.resumeRun = (body) => { resumed = body.runId; };
  const response = await reconcileDesiredHarnessRun({ gameId: "melee" }, f.deps);
  expect((await response.json()).outcome).toBe("running");
  expect(resumed).toBe(runId);
  expect(f.counts()).toEqual({ initialized: 1, started: 2 });
});

describe("Run settings and retirement", () => {
  function pausedRun(f: ReturnType<typeof fixture>, epochStatuses: string[] = []) {
    const store = f.deps.openStore({});
    try {
      const run = createRun(store, "matched_code_percent", 100, 1, { gameId: "melee", repoRoot: "/fixture" } as never, { baseRevision: "head" });
      store.db.query("UPDATE runs SET status = 'paused' WHERE id = ?").run(run.id);
      epochStatuses.forEach((status, index) => store.db.query(
        "INSERT INTO epochs (id, run_id, ordinal, worker_pool_size, status, created_at) VALUES (?, ?, ?, 1, ?, '2026-10-07T00:00:00Z')",
      ).run(`epoch-${index + 1}`, run.id, index + 1, status));
      return run.id;
    } finally { store.db.close(); }
  }
  const retire = (f: ReturnType<typeof fixture>, body: Record<string, unknown>) => f.call("retire-run", { gameId: "melee", commandId: "retire", reason: "new model", confirmed: true, ...body });

  test("a Run request whose settings conflict with the attached Run is refused before intent, lease, or resume", async () => {
    const f = fixture();
    pausedRun(f);
    let resumed = 0;
    f.deps.resumeRun = () => { resumed++; };
    const before = f.read();
    const response = await f.call("run", { gameId: "melee", commandId: "run-new-model", expectedRevision: before.state.identity.revision, model: "gpt-6.1-sol", thinkingLevel: "xhigh" });
    expect(response?.status).toBe(409);
    expect((await response!.json()).conflicts.map((conflict: { field: string }) => conflict.field)).toEqual(["model", "thinkingLevel"]);
    expect(f.read()).toEqual(before);
    expect(resumed).toBe(0);
    expect(f.counts()).toEqual({ initialized: 0, started: 0 });
  });

  test("reconciling a persisted conflicting intent does not resume the Run", async () => {
    const f = fixture();
    const runId = pausedRun(f);
    let resumed = 0;
    f.deps.resumeRun = () => { resumed++; };
    const store = f.deps.openStore({});
    const harness = getHarnessState(store.db, "melee")!;
    transitionHarnessState(store.db, { gameId: "melee", expectedRevision: harness.identity.revision, commandId: "legacy-intent", patch: { execution: { desired: "run" } },
      boundary: { eventId: "legacy-intent", kind: "resumed", outcome: "requested", evidence: { requested_run_settings: { model: "gpt-6.1-sol" } } } });
    store.db.close();
    const response = await reconcileDesiredHarnessRun({ gameId: "melee" }, f.deps);
    expect(response.status).toBe(409);
    expect(resumed).toBe(0);
    const check = f.deps.openStore({});
    try { expect(check.db.query("SELECT status FROM runs WHERE id = ?").get(runId)).toEqual({ status: "paused" }); } finally { check.db.close(); }
  });

  test("retiring a paused Run with completed epochs completes it, clears the harness run, and replays by command id", async () => {
    const f = fixture();
    const runId = pausedRun(f, ["completed", "completed"]);
    const revision = f.read().state.identity.revision;
    const response = await retire(f, { runId, expectedRevision: revision });
    expect(response?.status).toBe(200);
    const payload = await response!.json();
    expect(payload.run.status).toBe("completed");
    const { state, timeline } = f.read();
    expect(state.identity.revision).toBe(revision + 1);
    expect(state.history).toMatchObject({ run_id: null, epoch_id: null });
    expect(state.readiness).toEqual({ build: "ready", sources: "ready", sandbox: "ready", evidence: "ready" });
    expect(timeline.at(-1)).toMatchObject({ kind: "operator", outcome: "run_retired", runId, epochId: "epoch-2",
      evidence: { run_id: runId, reason: "new model", last_epoch_id: "epoch-2", epoch_count: 2, epochs_completed: true } });
    expect((await retire(f, { runId, expectedRevision: revision }))?.status).toBe(200);
    expect(f.read().state.identity.revision).toBe(revision + 1);
    expect((await retire(f, { runId, expectedRevision: revision, reason: "other" }))?.status).toBe(409);
  });

  test("retiring a paused Run with an unfinished epoch cancels it with the reason", async () => {
    const f = fixture();
    const runId = pausedRun(f, ["completed", "active"]);
    const response = await retire(f, { runId, expectedRevision: f.read().state.identity.revision });
    expect((await response!.json()).run).toMatchObject({ status: "cancelled" });
  });

  test("retirement is refused for stale revisions, live work, unpaused intent, or missing confirmation", async () => {
    const f = fixture();
    const runId = pausedRun(f, ["completed"]);
    const revision = f.read().state.identity.revision;
    expect((await retire(f, { runId, expectedRevision: revision, confirmed: false }))?.status).toBe(409);
    expect((await retire(f, { runId, expectedRevision: revision - 1 }))?.status).toBe(409);
    f.setActive();
    const live = await retire(f, { runId, expectedRevision: revision });
    expect((await live!.json()).error).toContain("managed scheduler process is live");
    expect(f.read().state.history.run_id).toBe(runId);
    const store = f.deps.openStore({});
    try { expect(store.db.query("SELECT status FROM runs WHERE id = ?").get(runId)).toEqual({ status: "paused" }); } finally { store.db.close(); }
  });

  test("after retirement a Run request initializes a fresh Run with the requested settings", async () => {
    const f = fixture();
    const runId = pausedRun(f, ["completed"]);
    await retire(f, { runId, expectedRevision: f.read().state.identity.revision });
    const response = await f.call("run", { gameId: "melee", commandId: "run-fresh", expectedRevision: f.read().state.identity.revision, model: "gpt-6-astra" });
    expect(response?.status).toBe(200);
    expect(f.counts()).toEqual({ initialized: 1, started: 1 });
    expect(f.read().state.history.run_id).not.toBe(runId);
  });
});
