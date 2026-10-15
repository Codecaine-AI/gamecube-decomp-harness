import type { StorageMigration } from "./types.js";

/**
 * SMS steering gate state (games with `matching.steeringGate` other than off).
 *
 * - `steering_observations`: append-only, one row per gated attempt function
 *   (shadow and enforce). Read only for probes/hints and the dashboard, never
 *   for eligibility.
 * - `steering_backfill`: authoritative per-function history verdict, written
 *   only by the `steering-gate` backfill job.
 * - `steering_backfill_coverage`: per-unit coverage bound to the analysed
 *   baseline. `clean` is 1 only when every function in the unit ended `pass`
 *   or was applied and re-verified. `report_json` keeps the unit's build
 *   coverage as decide reported it.
 * - `steering_backfill_runs`: one row per backfill run; an enforce run
 *   preflight needs a clean row whose baseline is an ancestor of the
 *   integration head.
 *
 * Rollback: the tables are additive. An older binary that knows only v12
 * sees an "ahead" schema, warns and continues (see `runStorageMigrations`
 * and `verifyStorageSchema`), and never reads these tables.
 */
export const STEERING_DDL = `
CREATE TABLE IF NOT EXISTS steering_observations (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id              TEXT NOT NULL,
  unit                 TEXT NOT NULL,
  symbol               TEXT NOT NULL,
  run_id               TEXT,
  attempt_ref          TEXT,
  base_rev             TEXT,
  function_source_sha  TEXT,
  verdict              TEXT NOT NULL,
  analysis             TEXT,
  scores_json          TEXT NOT NULL DEFAULT '{}',
  probe_json           TEXT,
  mode                 TEXT NOT NULL,
  recorded_at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS steering_observations_target
  ON steering_observations (game_id, unit, symbol, id);

CREATE TABLE IF NOT EXISTS steering_backfill (
  game_id              TEXT NOT NULL,
  unit                 TEXT NOT NULL,
  symbol               TEXT NOT NULL,
  analyzed_rev         TEXT NOT NULL,
  function_source_sha  TEXT,
  verdict              TEXT NOT NULL,
  applied              INTEGER NOT NULL DEFAULT 0,
  applied_rev          TEXT,
  report_json          TEXT NOT NULL DEFAULT '{}',
  recorded_at          TEXT NOT NULL,
  PRIMARY KEY (game_id, unit, symbol)
);

CREATE TABLE IF NOT EXISTS steering_backfill_coverage (
  game_id              TEXT NOT NULL,
  unit                 TEXT NOT NULL,
  analyzed_rev         TEXT NOT NULL,
  baseline_rev         TEXT NOT NULL,
  clean                INTEGER NOT NULL DEFAULT 0,
  applied              INTEGER NOT NULL DEFAULT 0,
  report_json          TEXT NOT NULL DEFAULT '{}',
  recorded_at          TEXT NOT NULL,
  PRIMARY KEY (game_id, unit)
);

CREATE TABLE IF NOT EXISTS steering_backfill_runs (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id              TEXT NOT NULL,
  baseline_rev         TEXT NOT NULL,
  clean                INTEGER NOT NULL DEFAULT 0,
  recorded_at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS steering_backfill_runs_game
  ON steering_backfill_runs (game_id, id);
`;

export const steeringMigration: StorageMigration = {
  version: 13,
  name: "steering",
  up(db) {
    db.exec(STEERING_DDL);
  },
};
