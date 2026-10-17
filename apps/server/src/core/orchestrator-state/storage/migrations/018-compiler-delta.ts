import type { StorageMigration } from "./types.js";

/**
 * Compiler-delta explain jobs (worker-compiler-loop plan 3.4.1, D2: off the
 * worker path). When the steering gate records a non-pass observation, the
 * runner queues one `steering-explain` job for that exact observation: the
 * job rebuilds candidate and S* in a build sandbox from the persisted
 * fidelity record (`fidelity_json`, the decide row's record) and the host
 * artifacts it names (`inputs_json`), and publishes `compiler_delta` into the
 * observation's probe. The unverified sweep (plan 3.4.3) queues the same jobs
 * with `source` `sweep`; extra S* variants beyond the gate's own are labelled
 * `ablation` and never touch the probe.
 *
 * Unique on (observation_id, input_hash, tool_hash): the same inputs measured
 * by the same tool versions are explained once. `status`: `queued` until a
 * runner claims it, `running` while one does (`attempts` counts claims),
 * `done` with `compiler_delta_json` (a delta, or `{unavailable}`; never an
 * empty delta), `failed` once retries are exhausted. A claim holds a row for
 * `claim_owner` until `claim_expires_at` (ISO); a running row whose lease
 * expired is reclaimed (or failed at its last attempt), and only the holder
 * may finish it.
 *
 * Additive (one new table and two indexes): an older binary sees an "ahead"
 * schema and continues.
 */
export const COMPILER_DELTA_DDL = `
CREATE TABLE IF NOT EXISTS steering_explain_jobs (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  observation_id      INTEGER NOT NULL,
  game_id             TEXT NOT NULL,
  unit                TEXT NOT NULL,
  symbol              TEXT NOT NULL,
  input_hash          TEXT NOT NULL,
  tool_hash           TEXT NOT NULL,
  source              TEXT NOT NULL DEFAULT 'observation',
  label               TEXT NOT NULL DEFAULT 'gate',
  variant             TEXT,
  fidelity_json       TEXT NOT NULL DEFAULT '{}',
  inputs_json         TEXT NOT NULL DEFAULT '{}',
  status              TEXT NOT NULL DEFAULT 'queued',
  attempts            INTEGER NOT NULL DEFAULT 0,
  claim_owner         TEXT,
  claim_expires_at    TEXT,
  compiler_delta_json TEXT,
  error               TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  UNIQUE (observation_id, input_hash, tool_hash)
);
CREATE INDEX IF NOT EXISTS steering_explain_jobs_status
  ON steering_explain_jobs (status, game_id);
CREATE INDEX IF NOT EXISTS steering_explain_jobs_target
  ON steering_explain_jobs (game_id, unit, symbol);
`;

export const compilerDeltaMigration: StorageMigration = {
  version: 18,
  name: "compiler_delta",
  up(db) {
    db.exec(COMPILER_DELTA_DDL);
  },
};
