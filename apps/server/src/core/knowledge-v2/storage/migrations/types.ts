import type { Database } from "bun:sqlite";

export interface KnowledgeStorageMigration {
  readonly version: number;
  readonly name: string;
  up(db: Database): void;
}
