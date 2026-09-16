import { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { configureConnection } from "../../ddl.js";
import { immediateTransaction } from "../../transaction.js";
import { runStorageMigrations } from "../index.js";
import { databaseFingerprints } from "../007-retire-cycle-ownership.js";

function requirePaused(db: Database) {
  const version = (db.query("SELECT MAX(version) AS version FROM schema_migrations").get() as { version: number }).version;
  if (version !== 9 && version !== 10) throw new Error(`Expected schema v9 or v10, found v${version}`);
  const ownerTable = version === 9 ? "continuing_harness" : "harness_state";
  const dispatchTable = version === 9 ? "harness_state" : "dispatch_state";
  for (const row of db.query(`SELECT state_json FROM ${ownerTable}`).all() as Array<{ state_json: string }>) {
    const state = JSON.parse(row.state_json);
    if (state.execution.desired !== "paused" || state.execution.workflow !== "none") throw new Error("Pause harness execution before renaming state");
  }
  if (db.query(`SELECT 1 FROM ${dispatchTable} WHERE active_workflow_json IS NOT NULL LIMIT 1`).get()) throw new Error("Settle dispatch leases before renaming state");
  return version;
}
export function renameHarnessState(stateDir: string, apply = false) {
  const dbPath = resolve(stateDir, "orchestrator.sqlite");
  const snapshot = new Database(dbPath, { readonly: true });
  let backupPath: string | undefined;
  try {
    const version = requirePaused(snapshot);
    if (!apply || version === 10) return { mode: apply ? "apply" : "preview", version, alreadyMigrated: version === 10, verification: databaseFingerprints(snapshot) };
    backupPath = `${dbPath}.before-state-rename-${randomUUID()}.sqlite`;
    snapshot.query("VACUUM INTO ?").run(backupPath);
  } finally { snapshot.close(); }
  const db = new Database(dbPath, { readwrite: true });
  try {
    configureConnection(db);
    immediateTransaction(db, () => { requirePaused(db); runStorageMigrations(db); });
    const integrity = db.query("PRAGMA integrity_check").all();
    const foreignKeys = db.query("PRAGMA foreign_key_check").all();
    if (JSON.stringify(integrity) !== JSON.stringify([{ integrity_check: "ok" }]) || foreignKeys.length) throw new Error("Post-rename SQLite integrity verification failed");
    return { mode: "apply", version: 10, backupPath, integrity, foreignKeys, verification: databaseFingerprints(db) };
  } catch (cause) {
    throw new Error(`State rename failed; original database backup: ${backupPath}`, { cause });
  } finally { db.close(); }
}
if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.length !== 3 || !["--preview", "--apply"].includes(args[0]!) || args[1] !== "--state-dir") throw new Error("Usage: rename-harness-state.ts --preview|--apply --state-dir PATH");
  console.log(JSON.stringify(renameHarnessState(args[2]!, args[0] === "--apply"), null, 2));
}
