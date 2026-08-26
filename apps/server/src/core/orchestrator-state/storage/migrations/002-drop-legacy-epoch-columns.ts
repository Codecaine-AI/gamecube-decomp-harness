import type { Database } from "bun:sqlite";
import type { StorageMigration } from "./types.js";

const LEGACY_EPOCH_COLUMNS = [
  "size_mode",
  "size_value",
  "candidate_window",
  "fast_refresh_count",
] as const;

function columnExists(db: Database, table: string, column: string): boolean {
  const quoted = `"${table.replaceAll('"', '""')}"`;
  return (db.query(`PRAGMA table_info(${quoted})`).all() as Array<{ name: string }>).some(
    (row) => row.name === column,
  );
}

export const dropLegacyEpochColumnsMigration: StorageMigration = {
  version: 2,
  name: "drop_legacy_epoch_columns",
  up(db) {
    for (const column of LEGACY_EPOCH_COLUMNS) {
      if (columnExists(db, "epochs", column)) {
        db.exec(`ALTER TABLE epochs DROP COLUMN "${column}"`);
      }
    }
  },
};
