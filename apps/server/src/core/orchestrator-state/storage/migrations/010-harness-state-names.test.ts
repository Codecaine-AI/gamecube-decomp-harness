import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { runStorageMigrations } from "./index.js";
import { initializeHarnessState, getHarnessState } from "@server/core/harness-state/state.js";
import { databaseFingerprints } from "./007-retire-cycle-ownership.js";

test("renames v9 harness and dispatch ownership without changing any original rows", () => {
  const db = new Database(":memory:");
  try {
    runStorageMigrations(db);
    initializeHarnessState(db, { gameId: "game", worktree: "/checkout", configurationRevision: "config", commandId: "init" });
    db.query("INSERT INTO dispatch_state(game_id,trace_id,created_at,updated_at) VALUES(?,?,?,?)").run("game", "original-trace", "then", "then");
    db.exec("ALTER TABLE harness_state RENAME TO continuing_harness; ALTER TABLE dispatch_state RENAME TO harness_state; DELETE FROM schema_migrations WHERE version>=10");
    const before = databaseFingerprints(db);
    runStorageMigrations(db);
    const after = databaseFingerprints(db);
    expect(after.harness_state).toEqual(before.continuing_harness);
    expect(after.dispatch_state).toEqual(before.harness_state);
    for (const [name, original] of Object.entries(before)) {
      if (["harness_state", "continuing_harness", "historical_migration_checkpoints"].includes(name)) continue;
      expect(after[name]).toEqual(original);
    }
    expect(getHarnessState(db, "game")?.source.worktree).toBe("/checkout");
    expect(db.query("SELECT name FROM sqlite_schema WHERE name='continuing_harness'").get()).toBeNull();
    expect(db.query("SELECT COUNT(*) AS count FROM historical_migration_checkpoints WHERE migration_version=10").get()).toEqual({ count: 1 });
    const canonical = databaseFingerprints(db); runStorageMigrations(db);
    expect(databaseFingerprints(db)).toEqual(canonical);
  } finally { db.close(); }
});
