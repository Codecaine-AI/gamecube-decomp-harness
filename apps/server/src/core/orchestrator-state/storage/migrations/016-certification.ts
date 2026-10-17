import type { StorageMigration } from "./types.js";

/**
 * Certification lane state (plan §3.1, decision D1): what the enforced
 * steering gate certified, not what the score said.
 *
 * - `certified_baselines`: per target, the certified high-water mark: the best
 *   gate-certified score, the revision it was measured against and the
 *   certificate hash. Raised only by a selectable certified attempt; a lower
 *   or equal certified result never replaces it.
 * - `certification_grants`: the budget ledger for `budgetExtension:
 *   "certified"` games. One row per (target, certificate hash, revision): the
 *   same certified code earns its +2 once, whichever claim resubmits it.
 *   Counted per claim (`target_claim_id`) for the attempt budget.
 * - `certification_restorations`: base-identity proofs. An `unverified_match`
 *   attempt whose target file and every compile input equal the trusted base
 *   gives the gate no edit group to certify; the runner accepts the proof
 *   instead (clears the unverified state at integration, no exact completion,
 *   no budget grant) and records it here.
 *
 * Additive (three new tables and their indexes), so it applies on any store
 * from v15 on, and an older binary only sees an "ahead" schema and continues.
 */
export const CERTIFICATION_DDL = `
CREATE TABLE IF NOT EXISTS certified_baselines (
  game_id              TEXT NOT NULL,
  unit                 TEXT NOT NULL,
  symbol               TEXT NOT NULL,
  certified_score      REAL,
  revision             TEXT NOT NULL,
  certificate_hash     TEXT NOT NULL,
  attempt_id           TEXT,
  run_id               TEXT,
  target_claim_id      TEXT,
  recorded_at          TEXT NOT NULL,
  updated_at           TEXT NOT NULL,
  PRIMARY KEY (game_id, unit, symbol)
);

CREATE TABLE IF NOT EXISTS certification_grants (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id              TEXT NOT NULL,
  unit                 TEXT NOT NULL,
  symbol               TEXT NOT NULL,
  certificate_hash     TEXT NOT NULL,
  revision             TEXT NOT NULL,
  kind                 TEXT NOT NULL CHECK (kind IN ('raised_high_water', 'first_certificate')),
  certified_score      REAL,
  previous_high_water  REAL,
  run_id               TEXT,
  target_claim_id      TEXT,
  attempt_id           TEXT,
  attempt_index        INTEGER,
  granted_at           TEXT NOT NULL,
  UNIQUE (game_id, unit, symbol, certificate_hash, revision)
);
CREATE INDEX IF NOT EXISTS certification_grants_claim
  ON certification_grants (target_claim_id);

CREATE TABLE IF NOT EXISTS certification_restorations (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id              TEXT NOT NULL,
  unit                 TEXT NOT NULL,
  symbol               TEXT NOT NULL,
  trusted_base_rev     TEXT NOT NULL,
  proof_hash           TEXT NOT NULL,
  source_path          TEXT,
  proof_json           TEXT NOT NULL DEFAULT '{}',
  run_id               TEXT,
  target_claim_id      TEXT,
  attempt_id           TEXT,
  attempt_index        INTEGER,
  recorded_at          TEXT NOT NULL,
  UNIQUE (game_id, unit, symbol, trusted_base_rev, proof_hash)
);
CREATE INDEX IF NOT EXISTS certification_restorations_target
  ON certification_restorations (game_id, unit, symbol);
`;

export const certificationMigration: StorageMigration = {
  version: 16,
  name: "certification",
  up(db) {
    db.exec(CERTIFICATION_DDL);
  },
};
