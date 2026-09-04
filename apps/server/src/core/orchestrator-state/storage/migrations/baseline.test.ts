import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { configureConnection, ensureSchema } from "../ddl.js";
import { dropLegacyEpochColumnsMigration } from "./002-drop-legacy-epoch-columns.js";
import { dropLegacySyncKnowledgeTablesMigration } from "./005-drop-legacy-sync-knowledge-tables.js";
import { FINAL_SCHEMA_DDL, SCHEMA_MIGRATIONS_DDL } from "./ddl.js";
import { classifyMigrationBookkeeping, runStorageMigrations } from "./index.js";

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

describe("squashed storage baseline", () => {
  test("classifies applied [1,2,3] as ahead of code list [1,2]", () => {
    const known = [
      { version: 1, name: "baseline" },
      { version: 2, name: "drop_legacy_epoch_columns" },
    ];
    const applied = [...known, { version: 3, name: "add_epoch_boundary_retry" }];

    expect(classifyMigrationBookkeeping(applied, known)).toBe("ahead");
  });

  test("creates the canonical schema and records only the baseline", () => {
    const db = database("storage-baseline-fresh");
    ensureSchema(db);

    expect(db.query("SELECT version, name FROM schema_migrations").all()).toEqual([
      { version: 1, name: "baseline" },
      { version: 2, name: "drop_legacy_epoch_columns" },
      { version: 3, name: "add_epoch_boundary_retry" },
      { version: 4, name: "add_target_infra_failure_count" },
      { version: 5, name: "drop_legacy_sync_knowledge_tables" },
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
    expect(
      names.filter(({ name }) =>
        [
          "sync_invalidations",
          "sync_invalidations_game_subject",
          "sync_invalidations_sync_subject",
          "sync_publication_intents",
          "sync_publication_intents_game",
          "knowledge_revisions",
          "knowledge_revisions_game_revision",
          "sync_knowledge_jobs",
        ].includes(name),
      ),
    ).toEqual([]);
    expect(names.filter(({ name }) => name.startsWith("integration_outcomes"))).toEqual([
      { type: "table", name: "integration_outcomes" },
      { type: "index", name: "integration_outcomes_run_status" },
    ]);
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

  test("creates the durable jobs queue with identity and payload constraints", () => {
    const db = database("storage-baseline-jobs");
    ensureSchema(db);

    expect(
      db
        .query("SELECT type, name FROM sqlite_schema WHERE name IN ('jobs', 'jobs_claim') ORDER BY name")
        .all(),
    ).toEqual([
      { type: "table", name: "jobs" },
      { type: "index", name: "jobs_claim" },
    ]);

    const insertJob = db.query(`
      INSERT INTO jobs (job_id, kind, dedupe_key, game_id, status, payload_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const createdAt = "2026-08-17T00:00:00.000Z";
    insertJob.run("job-1", "worker", "target-1", "game-1", "queued", "{}", createdAt, createdAt);

    expect(() =>
      insertJob.run("job-2", "worker", "target-1", "game-1", "queued", "{}", createdAt, createdAt),
    ).toThrow("UNIQUE constraint failed");
    expect(() =>
      insertJob.run("job-3", "worker", "target-2", "game-1", "invalid", "{}", createdAt, createdAt),
    ).toThrow("CHECK constraint failed");
    expect(() =>
      insertJob.run("job-4", "worker", "target-3", "game-1", "queued", "not-json", createdAt, createdAt),
    ).toThrow("CHECK constraint failed");
  });

  test("accepts newer additive migrations when this build's list is an exact prefix", () => {
    const db = database("storage-baseline-ahead");
    ensureSchema(db);
    db.exec("ALTER TABLE epochs ADD COLUMN future_additive_value TEXT");
    db.query("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)").run(
      6,
      "future_additive_migration",
      "2026-08-27T23:09:00.000Z",
    );
    const warning = spyOn(console, "warn").mockImplementation(() => undefined);

    try {
      runStorageMigrations(db);

      expect(warning).toHaveBeenCalledWith(
        "schema is ahead of this process: applied through v6, this build knows v5",
      );
      expect(
        db
          .query("SELECT name FROM pragma_table_info('epochs') WHERE name = ?")
          .get("future_additive_value"),
      ).toEqual({ name: "future_additive_value" });
      expect(
        db.query("SELECT version, name FROM schema_migrations ORDER BY version").all(),
      ).toEqual([
        { version: 1, name: "baseline" },
        { version: 2, name: "drop_legacy_epoch_columns" },
        { version: 3, name: "add_epoch_boundary_retry" },
        { version: 4, name: "add_target_infra_failure_count" },
        { version: 5, name: "drop_legacy_sync_knowledge_tables" },
        { version: 6, name: "future_additive_migration" },
      ]);
    } finally {
      warning.mockRestore();
    }
  });

  test("rejects a bookkeeping prefix mismatch even when the schema is canonical", () => {
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
    expect(() => runStorageMigrations(db)).toThrow("Storage schema is not the squashed baseline");
    expect(db.query("SELECT version, name FROM schema_migrations ORDER BY version").all()).toEqual([
      { version: 1, name: "baseline" },
      { version: 19, name: "historical_chain_complete" },
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

describe("legacy epoch column migration", () => {
  test("drops legacy columns from an old-shape epochs table", () => {
    const db = database("storage-legacy-epochs");
    db.exec(SCHEMA_MIGRATIONS_DDL);
    db.exec(FINAL_SCHEMA_DDL);
    db.exec("ALTER TABLE epochs ADD COLUMN size_mode TEXT NOT NULL DEFAULT 'fixed'");
    db.exec("ALTER TABLE epochs ADD COLUMN size_value INTEGER");
    db.exec("ALTER TABLE epochs ADD COLUMN candidate_window INTEGER NOT NULL DEFAULT 0");
    db.exec("ALTER TABLE epochs ADD COLUMN fast_refresh_count INTEGER NOT NULL DEFAULT 0");
    db.query("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)").run(
      1,
      "baseline",
      "2026-08-25T00:00:00.000Z",
    );

    runStorageMigrations(db);

    const columns = (db.query("PRAGMA table_info(epochs)").all() as Array<{ name: string }>).map(
      ({ name }) => name,
    );
    expect(columns).not.toContain("size_mode");
    expect(columns).not.toContain("size_value");
    expect(columns).not.toContain("candidate_window");
    expect(columns).not.toContain("fast_refresh_count");
    expect(db.query("SELECT version, name FROM schema_migrations ORDER BY version").all()).toEqual([
      { version: 1, name: "baseline" },
      { version: 2, name: "drop_legacy_epoch_columns" },
      { version: 3, name: "add_epoch_boundary_retry" },
      { version: 4, name: "add_target_infra_failure_count" },
      { version: 5, name: "drop_legacy_sync_knowledge_tables" },
    ]);
  });

  test("no-ops when the epochs table is already clean", () => {
    const db = database("storage-clean-epochs");
    db.exec("CREATE TABLE epochs (id TEXT PRIMARY KEY, run_id TEXT NOT NULL)");
    const before = db.query("SELECT sql FROM sqlite_schema WHERE name = 'epochs'").get();

    dropLegacyEpochColumnsMigration.up(db);

    expect(db.query("SELECT sql FROM sqlite_schema WHERE name = 'epochs'").get()).toEqual(before);
  });
});

describe("legacy sync knowledge table migration", () => {
  test("drops the legacy sync knowledge tables from a v4 database", () => {
    const db = database("storage-legacy-sync-knowledge");
    db.exec(SCHEMA_MIGRATIONS_DDL);
    db.exec(FINAL_SCHEMA_DDL);
    db.exec("CREATE TABLE sync_invalidations (invalidation_id TEXT PRIMARY KEY, sync_id TEXT NOT NULL, game_id TEXT NOT NULL, cycle_uuid TEXT NOT NULL, subject_kind TEXT NOT NULL, subject_id TEXT NOT NULL, reason TEXT NOT NULL, caused_by_event_id TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(sync_id, subject_kind, subject_id))");
    db.exec("CREATE INDEX sync_invalidations_game_subject ON sync_invalidations (game_id, subject_kind, subject_id)");
    db.exec("CREATE TABLE sync_publication_intents (sync_id TEXT PRIMARY KEY, game_id TEXT NOT NULL, cycle_uuid TEXT NOT NULL, cycle_worktree_path TEXT NOT NULL, prior_head TEXT NOT NULL, new_head TEXT NOT NULL, worktree_state_json TEXT NOT NULL, boundary_plan_json TEXT NOT NULL, publishing_event_id TEXT NOT NULL, boundary_event_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)");
    db.exec("CREATE INDEX sync_publication_intents_game ON sync_publication_intents (game_id, created_at)");
    db.exec("CREATE TABLE knowledge_revisions (revision INTEGER PRIMARY KEY AUTOINCREMENT, game_id TEXT NOT NULL, digest TEXT NOT NULL, sync_id TEXT, caused_by_event_id TEXT NOT NULL, created_at TEXT NOT NULL)");
    db.exec("CREATE INDEX knowledge_revisions_game_revision ON knowledge_revisions (game_id, revision)");
    db.exec("CREATE TABLE sync_knowledge_jobs (job_id TEXT PRIMARY KEY, source_kind TEXT NOT NULL CHECK (source_kind IN ('merged_pr', 'corpus')), staged_artifact_path TEXT NOT NULL, staged_digest TEXT NOT NULL)");
    db.query(
      `INSERT INTO jobs (job_id, kind, dedupe_key, game_id, status, payload_json, created_at, updated_at)
       VALUES ('legacy-sync-job', 'sync_publication', 'legacy-sync-job', 'melee', 'queued', '{}', '2026-09-03T00:00:00.000Z', '2026-09-03T00:00:00.000Z')`,
    ).run();
    db.query("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)").run(
      1,
      "baseline",
      "2026-09-03T00:00:00.000Z",
    );
    db.query("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)").run(
      2,
      "drop_legacy_epoch_columns",
      "2026-09-03T00:00:01.000Z",
    );
    db.query("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)").run(
      3,
      "add_epoch_boundary_retry",
      "2026-09-03T00:00:02.000Z",
    );
    db.query("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)").run(
      4,
      "add_target_infra_failure_count",
      "2026-09-03T00:00:03.000Z",
    );

    runStorageMigrations(db);

    expect(
      db
        .query(
          "SELECT name FROM sqlite_schema WHERE name IN ('knowledge_revisions', 'sync_invalidations', 'sync_knowledge_jobs', 'sync_publication_intents') ORDER BY name",
        )
        .all(),
    ).toEqual([]);
    expect(db.query("SELECT job_id FROM jobs WHERE kind = 'sync_publication'").all()).toEqual([]);
    expect(db.query("SELECT version, name FROM schema_migrations ORDER BY version").all()).toEqual([
      { version: 1, name: "baseline" },
      { version: 2, name: "drop_legacy_epoch_columns" },
      { version: 3, name: "add_epoch_boundary_retry" },
      { version: 4, name: "add_target_infra_failure_count" },
      { version: 5, name: "drop_legacy_sync_knowledge_tables" },
    ]);
  });

  test("no-ops when the legacy tables are already gone", () => {
    const db = database("storage-clean-sync-knowledge");
    db.exec(FINAL_SCHEMA_DDL);
    const before = db.query("SELECT name, sql FROM sqlite_schema WHERE name = 'sync_state'").get();

    dropLegacySyncKnowledgeTablesMigration.up(db);

    expect(db.query("SELECT name, sql FROM sqlite_schema WHERE name = 'sync_state'").get()).toEqual(before);
  });
});
