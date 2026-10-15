import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { runStorageMigrations, verifyStorageSchema } from "./index.js";

const LATER_TABLES = [
  "stack_only_functions", "steering_observations", "steering_backfill", "steering_backfill_coverage", "steering_backfill_runs", "steering_rollbacks",
];

test("a live v11 store migrates through 014 additively and keeps its rows", () => {
  const db = new Database(":memory:");
  try {
    runStorageMigrations(db);
    db.query("INSERT INTO runs (id, goal_kind, goal_value, desired_workers, status, created_at) VALUES ('run-1', 'matched_percent', 100, 1, 'active', 'then')").run();
    db.exec(`${LATER_TABLES.map((table) => `DROP TABLE ${table};`).join(" ")} DELETE FROM schema_migrations WHERE version >= 12`);
    expect(() => verifyStorageSchema(db)).toThrow("schema is behind this process: applied through v11, this build requires v14");

    runStorageMigrations(db);

    expect(db.query("SELECT version, name FROM schema_migrations WHERE version >= 12 ORDER BY version").all()).toEqual([
      { version: 12, name: "stack_only_functions" },
      { version: 13, name: "steering" },
      { version: 14, name: "steering_rollbacks" },
    ]);
    expect(() => verifyStorageSchema(db)).not.toThrow();
    expect(db.query("SELECT COUNT(*) AS count FROM runs").get()).toEqual({ count: 1 });
    expect((db.query("PRAGMA table_info(steering_rollbacks)").all() as Array<{ name: string }>).map(({ name }) => name)).toEqual([
      "id", "game_id", "unit", "symbol", "analyzed_rev", "base_rev", "initial_verdict", "final_verdict", "rules_json", "report_json", "status", "recorded_at", "updated_at",
    ]);
    runStorageMigrations(db);
    expect(db.query("SELECT COUNT(*) AS count FROM schema_migrations WHERE version = 14").get()).toEqual({ count: 1 });
  } finally {
    db.close();
  }
});
