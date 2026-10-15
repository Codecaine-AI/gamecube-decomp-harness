import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { runStorageMigrations, verifyStorageSchema } from "./index.js";

const STEERING_TABLES = ["steering_observations", "steering_backfill", "steering_backfill_coverage", "steering_backfill_runs"];

function primaryKey(db: Database, table: string): string[] {
  return (db.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string; pk: number }>)
    .filter(({ pk }) => pk > 0)
    .sort((a, b) => a.pk - b.pk)
    .map(({ name }) => name);
}

test("migration 013 applies on a v12 store, is recorded, and keeps existing rows", () => {
  const db = new Database(":memory:");
  try {
    runStorageMigrations(db);
    db.query("INSERT INTO stack_only_functions (game_id, unit, symbol, source, recorded_at) VALUES ('sms', 'u', 'f', 'backfill', 'then')").run();
    db.exec(`${STEERING_TABLES.map((table) => `DROP TABLE ${table};`).join(" ")} DELETE FROM schema_migrations WHERE version = 13`);
    expect(() => verifyStorageSchema(db)).toThrow("schema is behind this process: applied through v12, this build requires v13");

    runStorageMigrations(db);

    expect(db.query("SELECT version, name FROM schema_migrations WHERE version = 13").all()).toEqual([{ version: 13, name: "steering" }]);
    expect(() => verifyStorageSchema(db)).not.toThrow();
    expect(db.query("SELECT COUNT(*) AS count FROM stack_only_functions").get()).toEqual({ count: 1 });
    expect(primaryKey(db, "steering_observations")).toEqual(["id"]);
    expect(primaryKey(db, "steering_backfill")).toEqual(["game_id", "unit", "symbol"]);
    expect(primaryKey(db, "steering_backfill_coverage")).toEqual(["game_id", "unit"]);
    expect(primaryKey(db, "steering_backfill_runs")).toEqual(["id"]);
    expect((db.query("PRAGMA table_info(steering_backfill_coverage)").all() as Array<{ name: string }>).map(({ name }) => name))
      .toEqual(["game_id", "unit", "analyzed_rev", "baseline_rev", "clean", "applied", "report_json", "recorded_at"]);

    // A second run is a no-op.
    runStorageMigrations(db);
    expect(db.query("SELECT COUNT(*) AS count FROM schema_migrations WHERE version = 13").get()).toEqual({ count: 1 });
  } finally {
    db.close();
  }
});
