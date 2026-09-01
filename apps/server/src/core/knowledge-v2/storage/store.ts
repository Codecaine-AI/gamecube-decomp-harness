import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { gameKnowledgeRoot } from "../../knowledge/paths.js";
import { configureConnection } from "./ddl.js";
import { runKnowledgeStorageMigrations } from "./migrations/index.js";
import { knowledgeV2Schema } from "./schema.js";
import { withBusyRetry } from "./transaction.js";

export type KnowledgeStoreOrm = ReturnType<typeof createKnowledgeStoreOrm>;

export interface KnowledgeStore {
  db: Database;
  orm: KnowledgeStoreOrm;
  path: string;
  close(): void;
}

export type OpenKnowledgeStoreOptions =
  | { knowledgeRoot: string; gameId?: never }
  | { gameId: string; knowledgeRoot?: never };

export function createKnowledgeStoreOrm(db: Database) {
  return drizzle(db, { schema: knowledgeV2Schema });
}

export function openKnowledgeStore(options: OpenKnowledgeStoreOptions): KnowledgeStore {
  const root = "knowledgeRoot" in options && options.knowledgeRoot !== undefined
    ? options.knowledgeRoot
    : gameKnowledgeRoot(options.gameId);
  mkdirSync(root, { recursive: true });
  const dbPath = resolve(root, "knowledge.sqlite");
  const db = new Database(dbPath);
  try {
    withBusyRetry(() => configureConnection(db));
    withBusyRetry(() => runKnowledgeStorageMigrations(db));
    return {
      db,
      orm: createKnowledgeStoreOrm(db),
      path: dbPath,
      close() {
        db.close();
      },
    };
  } catch (error) {
    db.close();
    throw error;
  }
}

export { immediateTransaction, withBusyRetry } from "./transaction.js";
