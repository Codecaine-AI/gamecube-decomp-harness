import type { StorageMigration } from "./types.js";
import { databaseFingerprints } from "./007-retire-cycle-ownership.js";

/** Rename stored state without rewriting payloads, events, or historical migration identities. */
export const harnessStateNamesMigration: StorageMigration = {
  version: 10,
  name: "harness_state_names",
  up(db) {
    const old = db.query("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='continuing_harness'").get();
    if (!old) {
      const state = db.query("SELECT name FROM pragma_table_info('harness_state') WHERE name='state_json'").get();
      const dispatch = db.query("SELECT name FROM pragma_table_info('dispatch_state') WHERE name='active_workflow_json'").get();
      if (!state || !dispatch) throw new Error("Harness and dispatch state schema is incomplete");
      return;
    }
    const before = databaseFingerprints(db);
    db.exec("ALTER TABLE harness_state RENAME TO dispatch_state; ALTER TABLE continuing_harness RENAME TO harness_state;");
    const after = databaseFingerprints(db);
    for (const [name, expected] of Object.entries(before)) {
      const target = name === "harness_state" ? "dispatch_state" : name === "continuing_harness" ? "harness_state" : name;
      const actual = after[target];
      if (!actual || JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`State rename changed stored values in ${name}`);
    }
    if (db.query("PRAGMA foreign_key_check").all().length) throw new Error("State rename failed foreign-key verification");
    db.query("INSERT INTO historical_migration_checkpoints VALUES(10,?,?,?)").run(new Date().toISOString(), JSON.stringify(before), JSON.stringify(after));
  },
};
