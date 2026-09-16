import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { canonicalSyncStagingMigration } from "./009-canonical-sync-staging.js";
import { createPreCutoverFixture } from "./tools/fixture.js";
import { immediateTransaction } from "../transaction.js";
test("converts staged control names once and archives exact original rows", () => {
  const db = new Database(":memory:");
  try {
    createPreCutoverFixture(db);
    const raw = '{ "cycle_head_sha": "accepted", "last_durable_stage": "cycle_merged", "evidence": {"trace_id":"original"} }';
    db.query("INSERT INTO sync_state(sync_id,game_id,cycle_uuid,status,trace_id,caused_by_event_id,created_at,updated_at,staging_json) VALUES(?,?,?,?,?,?,?,?,?)").run("sync", "game", "old-owner", "published", "trace", "cause", "at", "at", raw);
    const original = db.query("SELECT * FROM sync_state").get();
    immediateTransaction(db, () => canonicalSyncStagingMigration.up(db));
    const archive = db.query("SELECT original_row_json FROM historical_sync_staging").get() as {original_row_json:string};
    expect(JSON.parse(archive.original_row_json)).toEqual(original);
    const row = db.query("SELECT staging_json FROM sync_state").get() as {staging_json:string};
    expect(JSON.parse(row.staging_json)).toEqual({ harness_head_sha: "accepted", last_durable_stage: "harness_merged", evidence: {trace_id:"original"} });
  } finally { db.close(); }
});
