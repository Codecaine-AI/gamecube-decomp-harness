import type { Database } from "bun:sqlite";

export interface StorageMigration {
  readonly version: number;
  readonly name: string;
  up(db: Database): void;
}
