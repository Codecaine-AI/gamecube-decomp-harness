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

export interface StateStoreCloseInfo {
  closedAt: string;
  stack: string;
}

export interface OpenStateOptions {
  migrate?: boolean;
}

export const STATE_MIGRATION_MODE_ENV = "ORCHESTRATOR_STATE_MIGRATION_MODE";

interface StateStoreHandle {
  closeInfo: StateStoreCloseInfo | null;
  ownerDb: Database;
}

const stateStoreHandles = new WeakMap<StateStore, StateStoreHandle>();

function trackOwnerClose(db: Database, handle: StateStoreHandle): void {
  const close = db.close.bind(db);
  db.close = ((...args: Parameters<Database["close"]>) => {
    handle.closeInfo ??= {
      closedAt: new Date().toISOString(),
      stack: new Error("StateStore owner database closed here").stack ?? "StateStore close stack unavailable",
    };
    return close(...args);
  }) as Database["close"];
}

/**
 * Return a view that can query the owner's connection but cannot close it.
 * Native bun:sqlite methods are bound back to the owner because they reject a
 * Proxy receiver even when the proxy otherwise forwards the method unchanged.
 */
export function borrowState(owner: StateStore): StateStore {
  const handle = stateStoreHandles.get(owner) ?? { closeInfo: null, ownerDb: owner.db };
  const db = new Proxy(handle.ownerDb, {
    get(target, property) {
      if (property === "close") return () => undefined;
      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as Database;
  const borrowed = { ...owner, db };
  stateStoreHandles.set(borrowed, handle);
  return borrowed;
}

export function stateStoreCloseInfo(store: StateStore): StateStoreCloseInfo | null {
  return stateStoreHandles.get(store)?.closeInfo ?? null;
}

export function isStateStoreClosedError(cause: unknown): boolean {
  const message = cause instanceof Error ? cause.message : String(cause);
  return /Database has closed|Cannot use a closed database/i.test(message);
}

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
  const handle: StateStoreHandle = { closeInfo: null, ownerDb: db };
  trackOwnerClose(db, handle);
  try {
    withBusyRetry(() => configureConnection(db));
    const migrate = options.migrate ?? process.env[STATE_MIGRATION_MODE_ENV] !== "verify";
    withBusyRetry(() => migrate ? ensureSchema(db) : verifySchema(db));
    withBusyRetry(() => replaySavePointFailureSpool(db, stateDir));
    const store = { db, orm: createOrchestratorStateOrm(db), path: dbPath, stateDir };
    stateStoreHandles.set(store, handle);
    return store;
  } catch (error) {
    db.close();
    throw error;
  }
}
