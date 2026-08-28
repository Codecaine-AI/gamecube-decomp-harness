import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { configureConnection, ensureSchema, verifySchema } from "./ddl.js";
import { orchestratorStateSchema } from "./schema.js";
import { withBusyRetry } from "./transaction.js";
import { replaySavePointFailureSpool } from "@server/core/cycle/save-point-failure-spool.js";

export { immediateTransaction, withBusyRetry } from "./transaction.js";

export type OrchestratorStateOrm = ReturnType<typeof createOrchestratorStateOrm>;

export interface StateStore {
  db: Database;
  orm: OrchestratorStateOrm;
  path: string;
  stateDir: string;
}

export interface OpenStateOptions {
  migrate?: boolean;
}

export const STATE_MIGRATION_MODE_ENV = "ORCHESTRATOR_STATE_MIGRATION_MODE";

export function now(): string {
  return new Date().toISOString();
}

export function writeSetHash(writeSet: string[]): string {
  return createHash("sha256").update(JSON.stringify(writeSet)).digest("hex");
}

export function createOrchestratorStateOrm(db: Database) {
  return drizzle(db, { schema: orchestratorStateSchema });
}

export function openState(stateDir: string, options: OpenStateOptions = {}): StateStore {
  mkdirSync(stateDir, { recursive: true });
  const dbPath = resolve(stateDir, "orchestrator.sqlite");
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  try {
    withBusyRetry(() => configureConnection(db));
    const migrate = options.migrate ?? process.env[STATE_MIGRATION_MODE_ENV] !== "verify";
    withBusyRetry(() => migrate ? ensureSchema(db) : verifySchema(db));
    withBusyRetry(() => replaySavePointFailureSpool(db, stateDir));
    return { db, orm: createOrchestratorStateOrm(db), path: dbPath, stateDir };
  } catch (error) {
    db.close();
    throw error;
  }
}
