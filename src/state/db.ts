import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Database } from "bun:sqlite";
import { configureConnection, ensureSchema } from "./schema.js";

export interface StateStore {
  db: Database;
  stateDir: string;
}

const SQLITE_BUSY_RETRY_ATTEMPTS = 8;
const SQLITE_BUSY_RETRY_BASE_MS = 25;

export function now(): string {
  return new Date().toISOString();
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function isBusyError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("database is locked") || message.includes("SQLITE_BUSY") || message.includes("SQLITE_LOCKED");
}

export function withBusyRetry<T>(operation: () => T): T {
  let attempt = 0;
  for (;;) {
    try {
      return operation();
    } catch (error) {
      if (!isBusyError(error) || attempt >= SQLITE_BUSY_RETRY_ATTEMPTS) throw error;
      const backoff = SQLITE_BUSY_RETRY_BASE_MS * 2 ** attempt;
      const jitter = Math.floor(Math.random() * SQLITE_BUSY_RETRY_BASE_MS);
      sleepSync(backoff + jitter);
      attempt += 1;
    }
  }
}

export function immediateTransaction<T>(db: Database, operation: () => T): T {
  return withBusyRetry(() => {
    let began = false;
    try {
      db.exec("BEGIN IMMEDIATE");
      began = true;
      const result = operation();
      db.exec("COMMIT");
      began = false;
      return result;
    } catch (error) {
      if (began) {
        try {
          db.exec("ROLLBACK");
        } catch {
          // Preserve the original SQLite error; rollback failures are secondary.
        }
      }
      throw error;
    }
  });
}

export function writeSetHash(writeSet: string[]): string {
  return createHash("sha256").update(JSON.stringify(writeSet)).digest("hex");
}

export function openState(stateDir: string): StateStore {
  mkdirSync(stateDir, { recursive: true });
  const dbPath = resolve(stateDir, "orchestrator.sqlite");
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  withBusyRetry(() => configureConnection(db));
  withBusyRetry(() => ensureSchema(db));
  return { db, stateDir };
}
