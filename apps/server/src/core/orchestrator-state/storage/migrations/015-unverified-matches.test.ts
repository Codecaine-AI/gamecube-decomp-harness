import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { runStorageMigrations, verifyStorageSchema } from "./index.js";

const LATER_TABLES = [
  "stack_only_functions", "steering_observations", "steering_backfill", "steering_backfill_coverage", "steering_backfill_runs",
  "steering_rollbacks", "steering_unverified_matches",
];

test("a live v11 store migrates through 015 additively and keeps its rows", () => {
  const db = new Database(":memory:");
  try {
    runStorageMigrations(db);
    db.query("INSERT INTO runs (id, goal_kind, goal_value, desired_workers, status, created_at) VALUES ('run-1', 'matched_percent', 100, 1, 'active', 'then')").run();
    db.exec(`${LATER_TABLES.map((table) => `DROP TABLE ${table};`).join(" ")} DELETE FROM schema_migrations WHERE version >= 12`);
    expect(() => verifyStorageSchema(db)).toThrow("schema is behind this process: applied through v11, this build requires v15");

    runStorageMigrations(db);

    expect(db.query("SELECT version, name FROM schema_migrations WHERE version >= 12 ORDER BY version").all()).toEqual([
      { version: 12, name: "stack_only_functions" },
      { version: 13, name: "steering" },
      { version: 14, name: "steering_rollbacks" },
      { version: 15, name: "unverified_matches" },
    ]);
    expect(() => verifyStorageSchema(db)).not.toThrow();
    expect(db.query("SELECT COUNT(*) AS count FROM runs").get()).toEqual({ count: 1 });
    const columns = db.query("PRAGMA table_info(steering_unverified_matches)").all() as Array<{ name: string; pk: number }>;
    expect(columns.map(({ name }) => name)).toEqual([
      "game_id", "unit", "symbol", "analyzed_rev", "base_rev", "source_path", "function_source_sha", "match_json", "reasons_json",
      "report_json", "recorded_at", "cleared_at", "cleared_by", "cleared_rev",
    ]);
    expect(columns.filter(({ pk }) => pk > 0).sort((a, b) => a.pk - b.pk).map(({ name }) => name)).toEqual(["game_id", "unit", "symbol"]);
    runStorageMigrations(db);
    expect(db.query("SELECT COUNT(*) AS count FROM schema_migrations WHERE version = 15").get()).toEqual({ count: 1 });
  } finally {
    db.close();
  }
});

test("a v14 store (steering rows present) gains only the unverified table", () => {
  const db = new Database(":memory:");
  try {
    runStorageMigrations(db);
    db.query("INSERT INTO steering_backfill (game_id, unit, symbol, analyzed_rev, verdict, recorded_at) VALUES ('sms', 'u', 'f', 'r', 'unresolved', 'then')").run();
    db.exec("DROP TABLE steering_unverified_matches; DELETE FROM schema_migrations WHERE version >= 15");
    expect(() => verifyStorageSchema(db)).toThrow("applied through v14, this build requires v15");
    runStorageMigrations(db);
    expect(() => verifyStorageSchema(db)).not.toThrow();
    expect(db.query("SELECT verdict FROM steering_backfill").all()).toEqual([{ verdict: "unresolved" }]);
    expect(db.query("SELECT COUNT(*) AS count FROM steering_unverified_matches").get()).toEqual({ count: 0 });
  } finally {
    db.close();
  }
});
