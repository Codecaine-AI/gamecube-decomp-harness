import { afterEach, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { immediateTransaction } from "../transaction.js";
import { createPreCutoverFixture } from "./tools/fixture.js";
import { retireCycleOwnershipMigration, tableFingerprint } from "./007-retire-cycle-ownership.js";
import { initializeHarnessState } from "@server/core/harness-state/state.js";
const databases: Database[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });
function fixture() {
  const db = new Database(":memory:"); databases.push(db); createPreCutoverFixture(db);
  db.query("INSERT INTO cycles(id,game_id,cycle_uuid,status,phase,created_at,updated_at) VALUES('old','game','old-id','active','running','at','at')").run();
  db.query("INSERT INTO cycle_timeline_entries(cycle_uuid,entry_kind,entry_id,occurred_at,payload_json,caused_by_event_id) VALUES('old-id','epoch_completed','epoch-id','at','{\"immutable\":true}','event-id')").run();
  db.query("INSERT INTO runs(id,game_id,goal_kind,goal_value,desired_workers,status,created_at,cycle_uuid) VALUES('run-id','game','goal',100,1,'paused','at','old-id')").run();
  db.query("INSERT INTO epochs(id,run_id,ordinal,worker_pool_size,status,admitted_count,finished_count,boundary_status,created_at) VALUES('epoch-id','run-id',1,1,'closed',1,1,'complete','at')").run();
  db.query("INSERT INTO sync_state(sync_id,game_id,cycle_uuid,status,trace_id,caused_by_event_id,created_at,updated_at) VALUES('sync-id','game','old-id','published','trace','cause','at','at')").run();
  db.query("INSERT INTO game_upstream_anchors(game_id,cycle_uuid,upstream_revision,sync_id,caused_by_event_id,updated_at) VALUES('game','old-id','upstream','sync-id','cause','at')").run();
  db.query("INSERT INTO game_events(event_id,event_type,game_id,subject_kind,subject_id,correlation_id,causation_id,trace_id,span_id,actor,occurred_at,payload_json) VALUES('event-id','cycle.opened','game','cycle','old-id','old-id','cause','trace','span','operator','at','{\"cycle_uuid\":\"old-id\"}')").run();
  return db;
}
test("refuses schema-only retirement until the active owner has been imported", () => {
  const db = fixture();
  expect(() => immediateTransaction(db, () => retireCycleOwnershipMigration.up(db))).toThrow("must be imported");
  expect(db.query("SELECT count(*) AS n FROM cycles").get()).toEqual({ n: 1 });
  expect(db.query("SELECT name FROM sqlite_schema WHERE name='historical_cycles'").get()).toBeNull();
});
test("archives ownership and lineage while preserving complete trace and epoch values", () => {
  const db = fixture(); initializeHarnessState(db, { gameId: "game", worktree: "/fixture", configurationRevision: "config", commandId: "init" });
  const events = tableFingerprint(db, "game_events"), epochs = tableFingerprint(db, "epochs"), cycles = tableFingerprint(db, "cycles"), runs = tableFingerprint(db, "runs", ["cycle_uuid"]);
  immediateTransaction(db, () => retireCycleOwnershipMigration.up(db));
  expect(tableFingerprint(db, "game_events")).toEqual(events);
  expect(tableFingerprint(db, "epochs")).toEqual(epochs);
  expect(tableFingerprint(db, "historical_cycles")).toEqual(cycles);
  expect(tableFingerprint(db, "runs")).toEqual(runs);
  expect(db.query("SELECT name FROM sqlite_schema WHERE name IN ('cycles','cycle_timeline_entries')").all()).toEqual([]);
  expect(db.query("SELECT cycle_uuid FROM historical_cycle_links WHERE table_name='runs' AND row_id='run-id'").get()).toEqual({ cycle_uuid: "old-id" });
  expect(db.query("SELECT run_id FROM epochs WHERE id='epoch-id'").get()).toEqual({ run_id: "run-id" });
  expect(db.query("SELECT upstream_revision FROM game_upstream_anchors").get()).toEqual({ upstream_revision: "upstream" });
  expect(db.query("PRAGMA foreign_key_check").all()).toEqual([]);
  expect(db.query("SELECT migration_version FROM historical_migration_checkpoints").get()).toEqual({ migration_version: 7 });
});
