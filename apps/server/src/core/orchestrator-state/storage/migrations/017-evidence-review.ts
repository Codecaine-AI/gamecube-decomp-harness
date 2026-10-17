import type { StorageMigration } from "./types.js";

/**
 * Evidence-review requests (worker-compiler-loop plan 3.1). When the enforced
 * steering gate rejects an attempt because a group is `evidence_review` (a
 * behaviour-identical construct, such as a map-backed weak inline, that only
 * a curated approval certifies), the runner keeps one human-review request
 * per construct: game, unit, target symbol (mangled) and the normalized
 * digest of the edit group (`steering_approvals.py`). A resubmission of the
 * same construct updates that row (`occurrences`, latest site and patch)
 * instead of adding one.
 *
 * `status`: `open` until an operator decides; `approving` while an approval
 * is being published (claimed first, so a concurrent decision cannot also
 * win); `approved` writes the
 * site-bound approval the gate reads (and reopens if the construct comes back
 * at another base or site, which the approval does not cover); `rejected`
 * stays rejected. A decision never accepts anything by itself.
 *
 * `base_rev` and the site are those of the gate run that recorded the row.
 * For an `unverified_match` target both gate runs certify it, so the row also
 * keeps `claim_base_rev` and `trusted_base_rev`, and `base_sites_json` keeps
 * the site and digest each base's run observed. One approval writes a
 * site-bound row per base, so the operator decides the construct once.
 *
 * `revision` grows with every change of the request's facts or status; a
 * decision names the revision the operator saw and fails if it moved.
 *
 * Additive (one new table and index): an older binary sees an "ahead" schema
 * and continues.
 */
export const EVIDENCE_REVIEW_DDL = `
CREATE TABLE IF NOT EXISTS steering_evidence_reviews (
  id                TEXT PRIMARY KEY,
  game_id           TEXT NOT NULL,
  unit              TEXT NOT NULL,
  symbol            TEXT NOT NULL,
  group_digest      TEXT NOT NULL,
  base_rev          TEXT NOT NULL,
  claim_base_rev    TEXT,
  trusted_base_rev  TEXT,
  base_sites_json   TEXT NOT NULL DEFAULT '[]',
  site_file         TEXT NOT NULL,
  site_start        INTEGER NOT NULL,
  site_end          INTEGER NOT NULL,
  callee            TEXT,
  callee_symbol     TEXT,
  patch             TEXT NOT NULL DEFAULT '',
  evidence_json     TEXT NOT NULL DEFAULT '{}',
  status            TEXT NOT NULL DEFAULT 'open',
  decided_by        TEXT,
  note              TEXT,
  decided_at        TEXT,
  approval_json     TEXT,
  run_id            TEXT,
  attempt_ref       TEXT,
  occurrences       INTEGER NOT NULL DEFAULT 1,
  revision          INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  UNIQUE (game_id, unit, symbol, group_digest)
);
CREATE INDEX IF NOT EXISTS steering_evidence_reviews_status
  ON steering_evidence_reviews (game_id, status, unit, symbol);
`;

export const evidenceReviewMigration: StorageMigration = {
  version: 17,
  name: "evidence_review",
  up(db) {
    db.exec(EVIDENCE_REVIEW_DDL);
  },
};
