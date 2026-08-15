import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { configureConnection, ensureSchema } from "../ddl.js";
import { FINAL_SCHEMA_DDL, SCHEMA_MIGRATIONS_DDL } from "./ddl.js";
import { runStorageMigrations } from "./index.js";

const tempDirs: string[] = [];
const databases: Database[] = [];

afterEach(() => {
  for (const db of databases.splice(0)) db.close();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function database(name: string): Database {
  const dir = mkdtempSync(join(tmpdir(), `${name}-`));
  tempDirs.push(dir);
  const db = new Database(join(dir, "orchestrator.sqlite"), { create: true });
  databases.push(db);
  configureConnection(db);
  return db;
}

function schemaInventory(db: Database): unknown[] {
  return db
    .query(`
      SELECT type, name, tbl_name, sql
      FROM sqlite_schema
      WHERE name NOT LIKE 'sqlite_%'
      ORDER BY type, name
    `)
    .all();
}

describe("squashed storage baseline", () => {
  test("creates the canonical schema and records only the baseline", () => {
    const db = database("storage-baseline-fresh");
    ensureSchema(db);

    expect(db.query("SELECT version, name FROM schema_migrations").all()).toEqual([
      { version: 1, name: "baseline" },
    ]);
    expect(db.query("PRAGMA integrity_check").get()).toEqual({ integrity_check: "ok" });
    expect(db.query("PRAGMA foreign_key_check").all()).toEqual([]);

    const names = db
      .query(`
        SELECT type, name
        FROM sqlite_schema
        WHERE name NOT LIKE 'sqlite_%' AND type IN ('table', 'index', 'trigger')
      `)
      .all() as Array<{ type: string; name: string }>;
    expect(names.filter(({ name }) => /project/i.test(name))).toEqual([]);
    expect(names.filter(({ name }) => /session/i.test(name) && name !== "pi_sessions")).toEqual([]);

    const columns = db
      .query(`
        SELECT m.name AS table_name, p.name AS column_name
        FROM sqlite_schema AS m
        JOIN pragma_table_info(m.name) AS p
        WHERE m.type = 'table'
      `)
      .all() as Array<{ table_name: string; column_name: string }>;
    expect(columns.filter(({ column_name }) => /project/i.test(column_name))).toEqual([]);
    expect(
      columns.filter(
        ({ table_name, column_name }) =>
          /session/i.test(column_name) &&
          !(
            table_name === "pi_sessions" ||
            (table_name === "worker_state" && column_name === "worker_session_ids_json")
          ),
      ),
    ).toEqual([]);
  });

  test("resets historical bookkeeping when the schema is already canonical", () => {
    const db = database("storage-baseline-reset");
    db.exec(SCHEMA_MIGRATIONS_DDL);
    db.exec(FINAL_SCHEMA_DDL);
    db.query("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)").run(
      1,
      "baseline",
      "2026-08-15T00:00:00.000Z",
    );
    db.query("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)").run(
      19,
      "historical_chain_complete",
      "2026-08-15T00:01:00.000Z",
    );
    const before = schemaInventory(db);

    runStorageMigrations(db);

    expect(schemaInventory(db)).toEqual(before);
    expect(db.query("SELECT version, name FROM schema_migrations").all()).toEqual([
      { version: 1, name: "baseline" },
    ]);
  });

  test("refuses to stamp a noncanonical database as the baseline", () => {
    const db = database("storage-baseline-refuse");
    db.exec(SCHEMA_MIGRATIONS_DDL);
    db.exec("CREATE TABLE incompatible_shape (id TEXT PRIMARY KEY)");
    db.query("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)").run(
      1,
      "baseline",
      "2026-08-15T00:00:00.000Z",
    );

    expect(() => runStorageMigrations(db)).toThrow("Storage schema is not the squashed baseline");
  });
});
