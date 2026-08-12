import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { configureConnection, ensureLegacySchema } from "../ddl.js";
import { openState, type StateStore } from "../store.js";
import { immediateTransaction } from "../transaction.js";
import { PROJECT_EVENTS_DDL } from "./ddl.js";
import { rebuildTable } from "./rebuild-table.js";

const tempDirs: string[] = [];
const openStores: StateStore[] = [];
const openDatabases: Database[] = [];

function createTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function trackStore(store: StateStore): StateStore {
  openStores.push(store);
  return store;
}

function trackDatabase(db: Database): Database {
  openDatabases.push(db);
  return db;
}

function closeStore(store: StateStore): void {
  store.db.close();
  openStores.splice(openStores.indexOf(store), 1);
}

function closeDatabase(db: Database): void {
  db.close();
  openDatabases.splice(openDatabases.indexOf(db), 1);
}

interface SchemaObjectRow {
  type: string;
  name: string;
  sql: string | null;
}

function schemaSnapshot(db: Database): SchemaObjectRow[] {
  return db
    .query(
      `SELECT type, name, sql
       FROM sqlite_master
       WHERE name NOT LIKE 'sqlite_%'
       ORDER BY type, name`,
    )
    .all() as SchemaObjectRow[];
}

afterEach(() => {
  for (const store of openStores.splice(0)) store.db.close();
  for (const db of openDatabases.splice(0)) db.close();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("orchestrator storage migrations", () => {
  test("a fresh state database applies numbered migrations exactly once", () => {
    const stateDir = createTempDir("orchestrator-migrations-fresh-");
    const store = trackStore(openState(stateDir));

    expect(store.db.query("SELECT version, name FROM schema_migrations ORDER BY version").all()).toEqual([
      { version: 1, name: "baseline" },
      { version: 2, name: "project_events" },
      { version: 3, name: "project_state" },
      { version: 4, name: "project_session_container" },
    ]);

    const projectStateColumns = store.db.query("PRAGMA table_info(project_state)").all() as Array<{
      name: string;
      dflt_value: string | null;
    }>;
    expect(projectStateColumns.map((column) => column.name)).toEqual([
      "project_id",
      "revision",
      "active_workflow_json",
      "queued_requests_json",
      "blockers_json",
      "trace_id",
      "caused_by_event_id",
      "created_at",
      "updated_at",
    ]);
    expect(projectStateColumns.find((column) => column.name === "queued_requests_json")?.dflt_value).toBe("'[]'");

    const projectSessionColumns = store.db.query("PRAGMA table_info(project_sessions)").all() as Array<{
      name: string;
    }>;
    expect(projectSessionColumns.map((column) => column.name)).toEqual([
      "id",
      "project_id",
      "session_uuid",
      "status",
      "phase",
      "active_run_id",
      "base_ref",
      "base_sha",
      "preparing_state_json",
      "running_state_json",
      "pr_state_json",
      "complete_state_json",
      "process_state_json",
      "kernel_trace_json",
      "created_at",
      "updated_at",
      "completed_at",
      "revision",
      "head_revision",
      "trace_id",
      "blockers_json",
      "save_point_stale",
      "caused_by_event_id",
      "closed_at",
    ]);
    expect(
      store.db.query("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'session_timeline_entries'").get(),
    ).not.toBeNull();

    expect(
      store.db
        .query("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'project_events_%' ORDER BY name")
        .all(),
    ).toEqual([
      { name: "project_events_correlation_sequence" },
      { name: "project_events_subject_sequence" },
      { name: "project_events_type_sequence" },
    ]);

    const firstSnapshot = schemaSnapshot(store.db);
    closeStore(store);

    const reopened = trackStore(openState(stateDir));
    expect(reopened.db.query("SELECT count(*) AS count FROM schema_migrations").get()).toEqual({ count: 4 });
    expect(schemaSnapshot(reopened.db)).toEqual(firstSnapshot);
  });

  test("a legacy-only database preserves data and converges through migrations", () => {
    const stateDir = createTempDir("orchestrator-migrations-legacy-");
    const dbPath = join(stateDir, "orchestrator.sqlite");
    const legacyDb = trackDatabase(new Database(dbPath));
    configureConnection(legacyDb);
    ensureLegacySchema(legacyDb);
    legacyDb.query(
      `INSERT INTO runs (
         id, goal_kind, goal_value, desired_workers, status, created_at, project_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run("run-legacy", "matched_code_percent", 100, 4, "paused", "2026-08-12T00:00:00.000Z", "melee");
    legacyDb
      .query(
        `INSERT INTO project_sessions (
           id, project_id, session_uuid, status, phase, base_sha,
           preparing_state_json, running_state_json, pr_state_json,
           complete_state_json, process_state_json, kernel_trace_json,
           created_at, updated_at
         ) VALUES (?, ?, ?, 'active', 'preparing', ?, '{}', '{}', '{}', '{}', '{}', '{}', ?, ?)`,
      )
      .run(
        "project-session:legacy",
        "melee",
        "legacy",
        "base-legacy",
        "2026-08-12T00:00:00.000Z",
        "2026-08-12T00:00:00.000Z",
      );
    expect(
      legacyDb.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'").get(),
    ).toBeNull();
    closeDatabase(legacyDb);

    const migrated = trackStore(openState(stateDir));
    expect(migrated.db.query("SELECT id, project_id FROM runs WHERE id = ?").get("run-legacy")).toEqual({
      id: "run-legacy",
      project_id: "melee",
    });
    expect(migrated.db.query("SELECT version, name FROM schema_migrations ORDER BY version").all()).toEqual([
      { version: 1, name: "baseline" },
      { version: 2, name: "project_events" },
      { version: 3, name: "project_state" },
      { version: 4, name: "project_session_container" },
    ]);
    expect(
      migrated.db
        .query(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('project_events', 'project_state', 'session_timeline_entries') ORDER BY name",
        )
        .all(),
    ).toEqual([{ name: "project_events" }, { name: "project_state" }, { name: "session_timeline_entries" }]);
    expect(
      migrated.db
        .query("SELECT head_revision, trace_id FROM project_sessions WHERE session_uuid = 'legacy'")
        .get(),
    ).toEqual({ head_revision: "base-legacy", trace_id: "trace-session-legacy" });

    const freshStateDir = createTempDir("orchestrator-migrations-convergence-");
    const fresh = trackStore(openState(freshStateDir));
    expect(schemaSnapshot(migrated.db)).toEqual(schemaSnapshot(fresh.db));
  });

  test("converges when migration 002 tables exist without a migration record", () => {
    const stateDir = createTempDir("orchestrator-migrations-partial-002-");
    const dbPath = join(stateDir, "orchestrator.sqlite");
    const partialDb = trackDatabase(new Database(dbPath));
    configureConnection(partialDb);
    ensureLegacySchema(partialDb);
    partialDb.exec(PROJECT_EVENTS_DDL);
    closeDatabase(partialDb);

    const migrated = trackStore(openState(stateDir));
    expect(migrated.db.query("SELECT version, name FROM schema_migrations ORDER BY version").all()).toEqual([
      { version: 1, name: "baseline" },
      { version: 2, name: "project_events" },
      { version: 3, name: "project_state" },
      { version: 4, name: "project_session_container" },
    ]);
    expect(
      migrated.db.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'project_events'").get(),
    ).not.toBeNull();
  });

  test("rebuildTable replaces a table and copies its rows inside a transaction", () => {
    const stateDir = createTempDir("orchestrator-migrations-rebuild-");
    const db = trackDatabase(new Database(join(stateDir, "rebuild.sqlite")));
    db.exec("CREATE TABLE widgets (id INTEGER PRIMARY KEY, label TEXT NOT NULL)");
    db.query("INSERT INTO widgets (id, label) VALUES (?, ?)").run(7, "kept");

    immediateTransaction(db, () => {
      rebuildTable(
        db,
        "widgets",
        "CREATE TABLE widgets (id INTEGER PRIMARY KEY, label TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0)",
        "INSERT INTO widgets (id, label) SELECT id, label FROM widgets__migration_old",
      );
    });

    expect(db.query("SELECT id, label, revision FROM widgets").all()).toEqual([
      { id: 7, label: "kept", revision: 0 },
    ]);
    expect(
      db.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'widgets__migration_old'").get(),
    ).toBeNull();
  });
});
