import type { Database } from "bun:sqlite";
import { SCHEMA_MIGRATIONS_DDL } from "../ddl.js";
import { storageMigrations } from "../index.js";

/** Historical fixture for testing the one-time cutover; never used by runtime. */
export function createPreCutoverFixture(db: Database): void {
  db.exec(SCHEMA_MIGRATIONS_DDL);
  for (const migration of storageMigrations.filter(item => item.version < 7)) {
    migration.up(db);
    db.query("INSERT INTO schema_migrations(version,name,applied_at) VALUES(?,?,?)").run(migration.version, migration.name, "fixture");
  }
}
