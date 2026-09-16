import { afterEach, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { createPreCutoverFixture } from "./fixture.js";
import { importLegacyHarness } from "./import-legacy-ownership.js";
const databases: Database[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });
function fixture(anchorCycle = "selected-owner") {
  const db = new Database(":memory:"); databases.push(db); createPreCutoverFixture(db);
  db.query("INSERT INTO cycles(id,game_id,cycle_uuid,status,phase,base_sha,head_revision,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)")
    .run("selected", "melee", "selected-owner", "active", "running", "opening-base", "accepted-head", "2026-01-01", "2026-01-01");
  db.query("INSERT INTO game_upstream_anchors(game_id,cycle_uuid,upstream_revision,sync_id,caused_by_event_id,updated_at) VALUES(?,?,?,?,?,?)")
    .run("melee", anchorCycle, "accepted-upstream", "sync-last", "causal-event", "2026-01-02");
  return db;
}
test("imports selected owner's accepted upstream anchor and retains its complete checkpoint", () => {
  const db = fixture();
  const before = db.query("SELECT * FROM game_upstream_anchors").all();
  const input = { gameId: "melee", commandId: "import", worktree: "/fixture/checkout", configurationRevision: "config" };
  const state = importLegacyHarness(db, input);
  expect(state.source.upstream_revision).toBe("accepted-upstream");
  expect(state.source.head).toBe("accepted-head");
  expect(state.history.sync_id).toBe("sync-last");
  const row = db.query("SELECT checkpoint_json FROM harness_legacy_imports WHERE game_id = 'melee'").get() as { checkpoint_json: string };
  expect(JSON.parse(row.checkpoint_json).upstreamAnchors).toEqual(before);
  expect(db.query("SELECT * FROM game_upstream_anchors").all()).toEqual(before);
  expect(importLegacyHarness(db, input)).toEqual(state);
});
test("never borrows an upstream anchor belonging to a different historical owner", () => {
  const db = fixture("different-owner");
  const state = importLegacyHarness(db, { gameId: "melee", commandId: "import", worktree: "/fixture/checkout", configurationRevision: "config" });
  expect(state.source.upstream_revision).toBe("opening-base");
  const row = db.query("SELECT checkpoint_json FROM harness_legacy_imports WHERE game_id = 'melee'").get() as { checkpoint_json: string };
  expect(JSON.parse(row.checkpoint_json).upstreamAnchors[0].cycle_uuid).toBe("different-owner");
});

test("keeps selected owner save point and latest epoch while preserving all imported timeline entries", () => {
  const db = fixture();
  db.query("UPDATE cycles SET active_run_id = 'run-selected' WHERE cycle_uuid = 'selected-owner'").run();
  db.query("INSERT INTO epochs(id,run_id,ordinal,worker_pool_size,status,routing_summary_json,created_at) VALUES(?,?,?,?,?,?,?)").run("epoch-selected", "run-selected", 2, 1, "closed", "{}", "now");
  db.query("INSERT INTO cycles(id,game_id,cycle_uuid,status,phase,created_at,updated_at) VALUES(?,?,?,?,?,?,?)").run("historical", "melee", "historical-owner", "complete", "complete", "later", "later");
  const insert = db.query("INSERT INTO cycle_timeline_entries(cycle_uuid,entry_kind,entry_id,occurred_at,payload_json) VALUES(?,?,?,?,?)");
  insert.run("selected-owner", "save_point", "save-selected", "first", "{}");
  insert.run("historical-owner", "save_point", "save-other", "last", "{}");
  const state = importLegacyHarness(db, { gameId: "melee", commandId: "import", worktree: "/fixture/checkout", configurationRevision: "config" });
  expect(state.history.save_point_id).toBe("save-selected");
  expect(state.history.epoch_id).toBe("epoch-selected");
  expect(db.query("SELECT COUNT(*) AS count FROM harness_timeline_entries WHERE kind = 'legacy'").get()).toEqual({ count: 2 });
});
