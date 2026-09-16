import type { StorageMigration } from "./types.js";

export const harnessStateMigration: StorageMigration = {
  version: 6,
  name: "continuing_harness",
  up(db) {
    // Additive only. Legacy ownership is imported explicitly after operator review.
    db.exec(`
      ALTER TABLE harness_state RENAME TO dispatch_state;
      CREATE TABLE harness_state (
        game_id TEXT PRIMARY KEY,
        harness_id TEXT NOT NULL UNIQUE,
        revision INTEGER NOT NULL,
        state_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE harness_commands (
        game_id TEXT NOT NULL,
        command_id TEXT NOT NULL,
        request_json TEXT NOT NULL,
        result_json TEXT NOT NULL,
        PRIMARY KEY(game_id, command_id)
      );
      CREATE TABLE harness_timeline_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id TEXT NOT NULL,
        harness_id TEXT NOT NULL,
        event_id TEXT NOT NULL UNIQUE,
        command_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        legacy_cycle_uuid TEXT,
        legacy_entry_id INTEGER,
        UNIQUE(legacy_cycle_uuid, legacy_entry_id)
      );
      CREATE INDEX harness_timeline_game_order ON harness_timeline_entries(game_id, id);
      CREATE TABLE harness_legacy_imports (
        game_id TEXT PRIMARY KEY,
        command_id TEXT NOT NULL,
        imported_at TEXT NOT NULL,
        checkpoint_json TEXT NOT NULL
      );
    `);
  },
};
