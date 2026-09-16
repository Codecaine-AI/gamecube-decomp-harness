import { afterEach, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { ensureSchema } from "../orchestrator-state/storage/ddl.js";
import { getHarnessState, getHarnessTimeline, initializeHarnessState, transitionHarnessState } from "./state.js";
const databases: Database[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });
function fixture() { const db = new Database(":memory:"); databases.push(db); ensureSchema(db); return db; }
function initialize(db: Database, gameId = "melee") { return initializeHarnessState(db, { gameId, worktree: `/games/${gameId}/workspace/checkout`, configurationRevision: "config-1", commandId: "initialize" }); }
test("no-cycle bootstrap, stable command replay, and game isolation", () => {
  const db = fixture();
  const first = initialize(db);
  expect(initialize(db)).toEqual(first);
  expect(db.query("SELECT name FROM sqlite_schema WHERE name = 'cycles'").get()).toBeNull();
  expect(initialize(db, "other").identity.harness_id).not.toBe(first.identity.harness_id);
  expect(() => transitionHarnessState(db, { gameId: "melee", expectedRevision: 0, commandId: "early-run", patch: { execution: { desired: "run", workflow: "run", status: "active" } } })).toThrow("Run admission");
  expect(getHarnessState(db, "melee")).toEqual(first);
});
test("two epochs preserve run and desired pause across no-change Sync with ordered idempotent evidence", () => {
  const db = fixture(); initialize(db);
  let state = transitionHarnessState(db, { gameId: "melee", expectedRevision: 0, commandId: "ready", patch: { source: { head: "A", upstream_revision: "U" }, readiness: { build: "ready", sources: "ready", sandbox: "ready", evidence: "ready" }, execution: { desired: "run", workflow: "run", status: "active" }, history: { run_id: "run-1" } }, boundary: { eventId: "initial", kind: "initial_sync_accepted", outcome: "accepted" } });
  for (let epoch = 1; epoch <= 2; epoch++) {
    state = transitionHarnessState(db, { gameId: "melee", expectedRevision: state.identity.revision, commandId: `epoch-${epoch}`, patch: { execution: { workflow: "sync" }, history: { epoch_id: `epoch-${epoch}` } }, boundary: { eventId: `epoch-${epoch}`, kind: "epoch_completed", outcome: "accepted" } });
    if (epoch === 2) state = transitionHarnessState(db, { gameId: "melee", expectedRevision: state.identity.revision, commandId: "pause", patch: { execution: { desired: "paused" } } });
    const input = { gameId: "melee", expectedRevision: state.identity.revision, commandId: `sync-${epoch}`, patch: { execution: { workflow: "none" as const, status: "idle" as const }, history: { sync_id: `sync-${epoch}` } }, boundary: { eventId: `sync-${epoch}`, kind: "sync_completed" as const, outcome: "no_source_change" } };
    state = transitionHarnessState(db, input);
    expect(transitionHarnessState(db, input)).toEqual(state);
    expect(() => transitionHarnessState(db, { ...input, patch: {} })).toThrow("different input");
  }
  expect(state.execution.desired).toBe("paused"); expect(state.history.run_id).toBe("run-1");
  expect(getHarnessTimeline(db, "melee")).toHaveLength(5);
  expect(getHarnessTimeline(db, "other")).toEqual([]);
  expect(getHarnessTimeline(db, "melee", { after: 3 }).map(e => e.eventId)).toEqual(["epoch-2", "sync-2"]);
  expect(() => transitionHarnessState(db, { gameId: "melee", expectedRevision: 0, commandId: "stale", patch: {} })).toThrow("revision conflict");
});
test("failed boundary insert rolls back head, revision, and command; head changes invalidate evidence", () => {
  const db = fixture(); initialize(db);
  const accepted = transitionHarnessState(db, { gameId: "melee", commandId: "accept", expectedRevision: 0, patch: { source: { head: "A" }, readiness: { build: "ready", evidence: "ready" } }, boundary: { eventId: "same-event", kind: "sync_completed", outcome: "accepted" } });
  expect(() => transitionHarnessState(db, { gameId: "melee", commandId: "collision", expectedRevision: 1, patch: { source: { head: "B" } }, boundary: { eventId: "same-event", kind: "sync_completed", outcome: "accepted" } })).toThrow();
  expect(getHarnessState(db, "melee")).toEqual(accepted);
  const state = transitionHarnessState(db, { gameId: "melee", commandId: "collision", expectedRevision: 1, patch: { source: { head: "B" } }, boundary: { eventId: "new-event", kind: "sync_completed", outcome: "accepted" } });
  expect(state.readiness.build).toBe("pending"); expect(state.readiness.evidence).toBe("pending");
  expect(getHarnessTimeline(db, "melee")).toHaveLength(2);
});
test("pause persists while active Run drains its current work", () => {
  const db = fixture(); initialize(db);
  const active = transitionHarnessState(db, { gameId: "melee", commandId: "run", expectedRevision: 0, patch: { source: { head: "A" }, readiness: { build: "ready", evidence: "ready", sandbox: "ready", sources: "ready" }, execution: { desired: "run", workflow: "run", status: "active" } } });
  const paused = transitionHarnessState(db, { gameId: "melee", commandId: "pause", expectedRevision: active.identity.revision, patch: { execution: { desired: "paused", workflow: "run", status: "active" } } });
  expect(paused.execution).toMatchObject({ desired: "paused", workflow: "run", status: "active" });
  expect(() => transitionHarnessState(db, { gameId: "melee", commandId: "next-epoch", expectedRevision: paused.identity.revision, patch: {}, boundary: { eventId: "next-epoch", kind: "epoch_admitted", outcome: "admitted" } })).toThrow("desired run");
});
