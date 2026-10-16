import type { StorageMigration } from "./types.js";

/**
 * Append-only steering rollback history. `steering_backfill` holds the current
 * certification of a function and is overwritten by every `--record`; after
 * the apply -> commit -> re-check -> record workflow it says `pass`, so it can
 * no longer tell the next worker that the function's 100% came from steering
 * (or a dead UNUSED body / out-of-order fill) and was rolled back. Each
 * `steering-gate --apply` that rewrites a function's source appends one row
 * here; the worker's `previous_attempt` block reads the latest one per
 * (game, unit, symbol).
 *
 * A row is written as soon as `apply` has rewritten the source (`status`
 * `rewritten`), before the rebuild or re-check that can fail, and updated
 * afterwards (`rebuild_failed`, `recheck_failed`, `recheck_not_pass`,
 * `reverified`). A failed later step never loses the history.
 *
 * Additive (one new table and index), so it applies on any store from v11 on
 * and an older binary only sees an "ahead" schema and continues.
 */
export const STEERING_ROLLBACKS_DDL = `
CREATE TABLE IF NOT EXISTS steering_rollbacks (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id              TEXT NOT NULL,
  unit                 TEXT NOT NULL,
  symbol               TEXT NOT NULL,
  analyzed_rev         TEXT NOT NULL,
  base_rev             TEXT,
  initial_verdict      TEXT NOT NULL,
  final_verdict        TEXT NOT NULL,
  rules_json           TEXT NOT NULL DEFAULT '[]',
  report_json          TEXT NOT NULL DEFAULT '{}',
  status               TEXT NOT NULL DEFAULT 'rewritten',
  recorded_at          TEXT NOT NULL,
  updated_at           TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS steering_rollbacks_target
  ON steering_rollbacks (game_id, unit, symbol, id);
`;

export const steeringRollbacksMigration: StorageMigration = {
  version: 14,
  name: "steering_rollbacks",
  up(db) {
    db.exec(STEERING_ROLLBACKS_DDL);
  },
};
