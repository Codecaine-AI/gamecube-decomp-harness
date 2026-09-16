import { createHash } from "node:crypto";
import type { Database } from "bun:sqlite";
import type { StorageMigration } from "./types.js";

export const archivedCycleColumns = [
  { table: "runs", key: "id" },
  { table: "sync_state", key: "sync_id" },
  { table: "pr_campaigns", key: "campaign_id" },
  { table: "game_upstream_anchors", key: "game_id" },
  { table: "dashboard_artifacts", key: "id" },
] as const;
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
export interface TableFingerprint { rows: number; sha256: string; columns: string[] }
/** Hash original values in primary-key order, including opaque JSON and trace IDs. */
export function tableFingerprint(db: Database, table: string, exclude: readonly string[] = []): TableFingerprint {
  const info = db.query(`PRAGMA table_info(${quote(table)})`).all() as Array<{ name: string; pk: number }>;
  const columns = info.map(item => item.name).filter(name => !exclude.includes(name));
  const keys = info.filter(item => item.pk).sort((a, b) => a.pk - b.pk).map(item => quote(item.name));
  const hash = createHash("sha256");
  let rows = 0;
  const statement = db.query(`SELECT ${columns.map(quote).join(",")} FROM ${quote(table)} ORDER BY ${keys.length ? keys.join(",") : "rowid"}`);
  for (const row of statement.iterate() as Iterable<Record<string, unknown>>) {
    hash.update(JSON.stringify(columns.map(column => row[column]), (_key, value) => value instanceof Uint8Array ? { blob: Buffer.from(value).toString("hex") } : typeof value === "bigint" ? { bigint: value.toString() } : value));
    hash.update("\n"); rows++;
  }
  return { rows, sha256: hash.digest("hex"), columns };
}
export function databaseFingerprints(db: Database): Record<string, TableFingerprint> {
  const tables = db.query("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'schema_migrations' ORDER BY name").all() as Array<{ name: string }>;
  return Object.fromEntries(tables.map(({ name }) => [name, tableFingerprint(db, name)]));
}
export const retireCycleOwnershipMigration: StorageMigration = {
  version: 7,
  name: "retire_cycle_ownership",
  up(db) {
    const missing = db.query(`SELECT DISTINCT c.game_id FROM cycles c LEFT JOIN harness_state h ON h.game_id = c.game_id
      WHERE c.status IN ('active','blocked','closing') AND h.game_id IS NULL`).all() as Array<{ game_id: string }>;
    if (missing.length) throw new Error(`Harness ownership must be imported before retiring cycles: ${missing.map(row => row.game_id).join(", ")}. Run the one-time harness cutover utility.`);
    const before = databaseFingerprints(db);
    const preserved = Object.fromEntries(archivedCycleColumns.map(({ table }) => [table, tableFingerprint(db, table, ["cycle_uuid"])]));
    db.exec(`CREATE TABLE historical_cycle_links (
      table_name TEXT NOT NULL, row_id TEXT NOT NULL, game_id TEXT, cycle_uuid TEXT NOT NULL,
      PRIMARY KEY(table_name,row_id)
    );
    CREATE INDEX historical_cycle_links_identity ON historical_cycle_links(game_id,cycle_uuid);
    CREATE TABLE historical_migration_checkpoints (
      migration_version INTEGER PRIMARY KEY, created_at TEXT NOT NULL, before_json TEXT NOT NULL, after_json TEXT NOT NULL
    );`);
    for (const { table, key } of archivedCycleColumns) {
      db.query(`INSERT INTO historical_cycle_links(table_name,row_id,game_id,cycle_uuid)
        SELECT ?, ${quote(key)}, game_id, cycle_uuid FROM ${quote(table)} WHERE cycle_uuid IS NOT NULL`).run(table);
      const original = `SELECT CAST(${quote(key)} AS TEXT) AS row_id, game_id, cycle_uuid FROM ${quote(table)} WHERE cycle_uuid IS NOT NULL`;
      const archived = `SELECT row_id, game_id, cycle_uuid FROM historical_cycle_links WHERE table_name = ?`;
      if (db.query(`${original} EXCEPT ${archived}`).get(table) || db.query(`${archived} EXCEPT ${original}`).get(table)) {
        throw new Error(`Cycle retirement failed ownership-link verification for ${table}`);
      }
    }
    db.exec("DROP INDEX IF EXISTS dashboard_artifacts_cycle_type; DROP INDEX IF EXISTS game_upstream_anchors_cycle;");
    for (const { table } of archivedCycleColumns) db.exec(`ALTER TABLE ${quote(table)} DROP COLUMN cycle_uuid`);
    db.exec(`ALTER TABLE cycles RENAME TO historical_cycles;
      ALTER TABLE cycle_timeline_entries RENAME TO historical_cycle_timeline_entries;
      ALTER TABLE harness_legacy_imports RENAME TO historical_harness_imports;
      DROP INDEX IF EXISTS cycles_one_active_game;
      CREATE INDEX IF NOT EXISTS dashboard_artifacts_game_type ON dashboard_artifacts(game_id, artifact_type, artifact_key, created_at);`);
    const after = databaseFingerprints(db);
    const renamed: Record<string, string> = { cycles: "historical_cycles", cycle_timeline_entries: "historical_cycle_timeline_entries", harness_legacy_imports: "historical_harness_imports" };
    for (const [table, fingerprint] of Object.entries(before)) {
      const expected = preserved[table] ?? fingerprint;
      const actual = after[renamed[table] ?? table];
      if (!actual || expected.rows !== actual.rows || expected.sha256 !== actual.sha256) throw new Error(`Cycle retirement changed preserved records in ${table}`);
    }
    if (db.query("PRAGMA foreign_key_check").all().length) throw new Error("Cycle retirement failed foreign-key verification");
    db.query("INSERT INTO historical_migration_checkpoints VALUES (7, ?, ?, ?)").run(new Date().toISOString(), JSON.stringify(before), JSON.stringify(after));
  },
};
