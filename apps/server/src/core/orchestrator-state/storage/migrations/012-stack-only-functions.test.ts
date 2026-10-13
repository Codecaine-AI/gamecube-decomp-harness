import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { runStorageMigrations, verifyStorageSchema } from "./index.js";

test("migration 012 applies on a v11 store and is recorded", () => {
  const db = new Database(":memory:");
  try {
    runStorageMigrations(db);
    db.exec("DROP TABLE stack_only_functions; DELETE FROM schema_migrations WHERE version = 12");
    expect(() => verifyStorageSchema(db)).toThrow("schema is behind this process: applied through v11, this build requires v12");

    runStorageMigrations(db);

    expect(db.query("SELECT version, name FROM schema_migrations WHERE version = 12").all()).toEqual([
      { version: 12, name: "stack_only_functions" },
    ]);
    expect(() => verifyStorageSchema(db)).not.toThrow();
    expect((db.query("PRAGMA table_info(stack_only_functions)").all() as Array<{ name: string; pk: number }>)
      .filter(({ pk }) => pk > 0)
      .map(({ name }) => name)).toEqual(["game_id", "unit", "symbol"]);
  } finally {
    db.close();
  }
});
