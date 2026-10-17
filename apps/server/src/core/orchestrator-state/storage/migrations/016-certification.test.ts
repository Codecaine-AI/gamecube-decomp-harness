import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { runStorageMigrations, verifyStorageSchema } from "./index.js";

const CERTIFICATION_TABLES = ["certified_baselines", "certification_grants", "certification_restorations"];

test("a v15 store (unverified rows present) gains only the certification tables and keeps its rows", () => {
  const db = new Database(":memory:");
  try {
    runStorageMigrations(db);
    db.query("INSERT INTO steering_unverified_matches (game_id, unit, symbol, analyzed_rev, recorded_at) VALUES ('sms', 'u', 'f', 'r', 'then')").run();
    db.exec(`${CERTIFICATION_TABLES.map((table) => `DROP TABLE ${table};`).join(" ")} DELETE FROM schema_migrations WHERE version >= 16`);
    expect(() => verifyStorageSchema(db)).toThrow("applied through v15, this build requires v18");

    runStorageMigrations(db);

    expect(() => verifyStorageSchema(db)).not.toThrow();
    expect(db.query("SELECT version, name FROM schema_migrations WHERE version >= 15 ORDER BY version").all()).toEqual([
      { version: 15, name: "unverified_matches" },
      { version: 16, name: "certification" },
      { version: 17, name: "evidence_review" },
      { version: 18, name: "compiler_delta" },
    ]);
    expect(db.query("SELECT symbol FROM steering_unverified_matches").all()).toEqual([{ symbol: "f" }]);
    for (const table of CERTIFICATION_TABLES) {
      expect(db.query(`SELECT COUNT(*) AS count FROM ${table}`).get()).toEqual({ count: 0 });
    }
    runStorageMigrations(db);
    expect(db.query("SELECT COUNT(*) AS count FROM schema_migrations WHERE version = 16").get()).toEqual({ count: 1 });
  } finally {
    db.close();
  }
});

test("the grant ledger is unique per target, certificate hash and revision; baselines are one row per target", () => {
  const db = new Database(":memory:");
  try {
    runStorageMigrations(db);
    const grant = db.query(`INSERT OR IGNORE INTO certification_grants
      (game_id, unit, symbol, certificate_hash, revision, kind, granted_at) VALUES ('sms', 'u', 'f', ?, ?, 'first_certificate', 'now')`);
    expect(Number(grant.run("h1", "rev-a").changes)).toBe(1);
    expect(Number(grant.run("h1", "rev-a").changes)).toBe(0);
    expect(Number(grant.run("h1", "rev-b").changes)).toBe(1);
    expect(Number(grant.run("h2", "rev-a").changes)).toBe(1);
    expect(() => db.query(`INSERT INTO certification_grants
      (game_id, unit, symbol, certificate_hash, revision, kind, granted_at) VALUES ('sms', 'u', 'f', 'h3', 'r', 'score', 'now')`).run()).toThrow("CHECK constraint failed");

    const columns = db.query("PRAGMA table_info(certified_baselines)").all() as Array<{ name: string; pk: number }>;
    expect(columns.filter(({ pk }) => pk > 0).sort((a, b) => a.pk - b.pk).map(({ name }) => name)).toEqual(["game_id", "unit", "symbol"]);
    expect(columns.map(({ name }) => name)).toContain("certificate_hash");

    const restoration = db.query(`INSERT OR IGNORE INTO certification_restorations
      (game_id, unit, symbol, trusted_base_rev, proof_hash, recorded_at) VALUES ('sms', 'u', 'f', 'base', ?, 'now')`);
    expect(Number(restoration.run("p1").changes)).toBe(1);
    expect(Number(restoration.run("p1").changes)).toBe(0);
  } finally {
    db.close();
  }
});
