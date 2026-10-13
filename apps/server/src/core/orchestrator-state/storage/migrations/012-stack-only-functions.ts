import type { StorageMigration } from "./types.js";

/**
 * Functions whose only remaining difference from the target is the stack
 * frame, for games whose matching stops at the frame (SMS `stop_at_frame`).
 * One row per game function. `fuzzy` is the score the function had when it
 * was classified: the board skips the function only while its report score
 * still equals it, so any later source change re-queues it.
 */
export const STACK_ONLY_FUNCTIONS_DDL = `
CREATE TABLE IF NOT EXISTS stack_only_functions (
  game_id        TEXT NOT NULL,
  unit           TEXT NOT NULL,
  symbol         TEXT NOT NULL,
  fuzzy          REAL,
  frame_compiled INTEGER,
  frame_target   INTEGER,
  source         TEXT NOT NULL,
  run_id         TEXT,
  evidence_json  TEXT NOT NULL DEFAULT '{}',
  recorded_at    TEXT NOT NULL,
  PRIMARY KEY (game_id, unit, symbol)
);
`;

export const stackOnlyFunctionsMigration: StorageMigration = {
  version: 12,
  name: "stack_only_functions",
  up(db) {
    db.exec(STACK_ONLY_FUNCTIONS_DDL);
  },
};
