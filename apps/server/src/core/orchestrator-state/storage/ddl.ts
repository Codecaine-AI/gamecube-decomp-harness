import type { Database } from "bun:sqlite";
import { runStorageMigrations, verifyStorageSchema } from "./migrations/index.js";

export { FINAL_SCHEMA_DDL, SCHEMA_MIGRATIONS_DDL } from "./migrations/ddl.js";

export function configureConnection(db: Database): void {
  db.run("PRAGMA busy_timeout = 30000");
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA synchronous = NORMAL");
  db.run("PRAGMA foreign_keys = ON");
  db.run("PRAGMA temp_store = MEMORY");
  db.run("PRAGMA wal_autocheckpoint = 1000");
}

export function ensureSchema(db: Database): void {
  runStorageMigrations(db);
}

export function verifySchema(db: Database): void {
  verifyStorageSchema(db);
}
