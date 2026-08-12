import type { Database } from "bun:sqlite";

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

/**
 * Rebuild a SQLite table inside the caller's transaction.
 *
 * `newDdl` must create `name`; `copySql` can read from `${name}__migration_old`.
 * The fixed old-table name keeps migration SQL explicit and reviewable.
 */
export function rebuildTable(db: Database, name: string, newDdl: string, copySql: string): void {
  const oldName = `${name}__migration_old`;
  const quotedName = quoteIdentifier(name);
  const quotedOldName = quoteIdentifier(oldName);

  const oldExists = db
    .query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(oldName);
  if (oldExists) throw new Error(`Cannot rebuild ${name}: temporary table ${oldName} already exists`);

  db.exec(`ALTER TABLE ${quotedName} RENAME TO ${quotedOldName}`);
  db.exec(newDdl);
  db.exec(copySql);
  db.exec(`DROP TABLE ${quotedOldName}`);
}
