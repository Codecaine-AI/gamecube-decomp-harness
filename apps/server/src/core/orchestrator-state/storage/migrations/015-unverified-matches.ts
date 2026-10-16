import type { StorageMigration } from "./types.js";

/**
 * `unverified_match` ("100% but unverified"): a function the steering backfill
 * could neither prove real nor attribute to steering (the gate's verdict
 * `unresolved`: the IR oracle failed for its unit, a group carrying real
 * shapes was reverted, the forward/reverse reductions disagreed, ...). Its
 * code usually reaches 100%, which says the direction is right, but it is not
 * a confirmed match: the board keeps it claimable (ranked ahead of untouched
 * functions) and never counts it as done.
 *
 * A table of its own, not a `steering_backfill` verdict: `steering_backfill`
 * is the backfill job's per-function certification and is overwritten by
 * every `--record`, while this state has a second writer (an attempt the
 * enforced gate passes clears it) and its own lifecycle (`cleared_at`,
 * `cleared_by`), and the board reads it on every admission through one
 * indexed lookup per game.
 *
 * Rows: written by `steering-gate --record` (unsharded and sharded) for every
 * unresolved function; only a certified pass of the function clears its row
 * (a row a run does not list stays active). `cleared_at` set = no longer
 * unverified (kept as history); `cleared_rev` is the revision that certified
 * the clear (the backfill's analysed rev, or the integration's
 * `integrated_rev`), so saved revisions before it stay held.
 *
 * Additive (one new table and index), so it applies on any store from v11 on
 * and an older binary only sees an "ahead" schema and continues.
 */
export const UNVERIFIED_MATCHES_DDL = `
CREATE TABLE IF NOT EXISTS steering_unverified_matches (
  game_id              TEXT NOT NULL,
  unit                 TEXT NOT NULL,
  symbol               TEXT NOT NULL,
  analyzed_rev         TEXT NOT NULL,
  base_rev             TEXT,
  source_path          TEXT,
  function_source_sha  TEXT,
  match_json           TEXT NOT NULL DEFAULT '{}',
  reasons_json         TEXT NOT NULL DEFAULT '[]',
  report_json          TEXT NOT NULL DEFAULT '{}',
  recorded_at          TEXT NOT NULL,
  cleared_at           TEXT,
  cleared_by           TEXT,
  cleared_rev          TEXT,
  PRIMARY KEY (game_id, unit, symbol)
);
CREATE INDEX IF NOT EXISTS steering_unverified_matches_active
  ON steering_unverified_matches (game_id, cleared_at);
`;

export const unverifiedMatchesMigration: StorageMigration = {
  version: 15,
  name: "unverified_matches",
  up(db) {
    db.exec(UNVERIFIED_MATCHES_DDL);
  },
};
