import { seedRunHarness } from "@server/core/harness-runtime/run-state/test-harness.js";
import { test, expect } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openState, createRun } from "@server/core/harness-runtime/run-state";
import { addSavePoint, ensureCampaign } from "@server/core/harness-runtime/phases/pr/state";
import { initializeHarnessState, transitionHarnessState, getHarnessState, getHarnessTimeline } from "@server/core/harness-state/state.js";
import { publishHarnessEpochSync } from "./harness-sync-publication.js";

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "harness-sync-publish-"));
  const store = openState(dir);
  seedRunHarness(store, "test", "epoch-head", dir);
  const run = createRun(store, "matched_code_percent", 100, 1, { gameId: "test" }, { baseRevision: "epoch-head" });
  store.db.query("UPDATE runs SET head_revision = 'epoch-head' WHERE id = ?").run(run.id);
  const initial = getHarnessState(store.db, "test")!;
  transitionHarnessState(store.db, { gameId: "test", expectedRevision: initial.identity.revision, commandId: "ready", patch: {
    source: { head: "epoch-head", upstream_revision: "base" }, history: { run_id: run.id },
    readiness: { build: "ready", evidence: "ready", sources: "ready", sandbox: "ready" }, execution: { desired: "run", workflow: "sync", status: "active" },
  } });
  const campaign = ensureCampaign(store, { gameId: "test" });
  addSavePoint(store, { id: "save-sync", campaignId: campaign.id, runId: run.id, triggerKind: "pr_sync", commitSha: "sync-head", reportPath: join(dir, "report.json"), payload: { measures: { matched_code_percent: 50 }, source_manifests: [{ manifest: "capture-1" }] } });
  const input = { gameId: "test", runId: run.id, epochId: "epoch-1", priorHead: "epoch-head", head: "sync-head", upstream: "upstream-1", savePointId: "save-sync" };
  return { store, input, close() { store.db.close(); rmSync(dir, { recursive: true, force: true }); } };
}
test("Sync publication rolls back timeline and harness when run update fails, then retries once", () => {
  const f = fixture();
  try {
    f.store.db.exec("CREATE TRIGGER reject_sync_head BEFORE UPDATE OF head_revision ON runs BEGIN SELECT RAISE(ABORT, 'injected run publication failure'); END;");
    expect(() => publishHarnessEpochSync(f.store, f.input)).toThrow("injected run publication failure");
    expect(getHarnessState(f.store.db, "test")!.source.head).toBe("epoch-head");
    expect(getHarnessTimeline(f.store.db, "test")).toHaveLength(0);
    f.store.db.exec("DROP TRIGGER reject_sync_head");
    publishHarnessEpochSync(f.store, f.input);
    publishHarnessEpochSync(f.store, f.input);
    expect(getHarnessTimeline(f.store.db, "test")).toHaveLength(1);
    expect(getHarnessTimeline(f.store.db, "test")[0]).toMatchObject({ outcome: "source_changed", evidence: { measures: { matched_code_percent: 50 }, source_manifests: [{ manifest: "capture-1" }] } });
  } finally { f.close(); }
});
test("completed Sync replay preserves a later epoch head and rejects conflicting source", () => {
  const f = fixture();
  try {
    publishHarnessEpochSync(f.store, f.input);
    const h = getHarnessState(f.store.db, "test")!;
    transitionHarnessState(f.store.db, { gameId: "test", expectedRevision: h.identity.revision, commandId: "later", patch: { source: { head: "later-epoch" } } });
    f.store.db.query("UPDATE runs SET head_revision = 'later-epoch' WHERE id = ?").run(f.input.runId);
    publishHarnessEpochSync(f.store, f.input);
    expect(getHarnessState(f.store.db, "test")!.source.head).toBe("later-epoch");
    expect(f.store.db.query("SELECT head_revision FROM runs WHERE id = ?").get(f.input.runId)).toEqual({ head_revision: "later-epoch" });
    expect(() => publishHarnessEpochSync(f.store, { ...f.input, head: "conflict" })).toThrow("Conflicting Sync replay");
    expect(() => publishHarnessEpochSync(f.store, { ...f.input, upstream: "conflict" })).toThrow("Conflicting Sync replay");
    expect(getHarnessTimeline(f.store.db, "test")).toHaveLength(1);
  } finally { f.close(); }
});
