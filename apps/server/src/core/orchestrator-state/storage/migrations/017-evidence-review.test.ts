import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { runStorageMigrations, verifyStorageSchema } from "./index.js";

test("a v16 store gains only the evidence-review table, unique per construct", () => {
  const db = new Database(":memory:");
  try {
    runStorageMigrations(db);
    db.query("INSERT INTO steering_unverified_matches (game_id, unit, symbol, analyzed_rev, recorded_at) VALUES ('sms', 'u', 'f', 'r', 'then')").run();
    db.exec("DROP TABLE steering_evidence_reviews; DROP TABLE steering_explain_jobs; DELETE FROM schema_migrations WHERE version >= 17");
    expect(() => verifyStorageSchema(db)).toThrow("applied through v16, this build requires v18");
    runStorageMigrations(db);
    expect(() => verifyStorageSchema(db)).not.toThrow();
    expect(db.query("SELECT version, name FROM schema_migrations WHERE version = 17").all()).toEqual([{ version: 17, name: "evidence_review" }]);
    expect(db.query("SELECT COUNT(*) AS count FROM steering_unverified_matches").get()).toEqual({ count: 1 });

    const insert = db.query(`INSERT OR IGNORE INTO steering_evidence_reviews
      (id, game_id, unit, symbol, group_digest, base_rev, site_file, site_start, site_end, created_at, updated_at)
      VALUES (?, 'sms', 'u', 'f__Fv', ?, 'rev', 'src/a.c', 4, 4, 'now', 'now')`);
    expect(Number(insert.run("a", "d1").changes)).toBe(1);
    expect(Number(insert.run("b", "d1").changes)).toBe(0);
    expect(Number(insert.run("c", "d2").changes)).toBe(1);
    expect(db.query("SELECT status, occurrences FROM steering_evidence_reviews WHERE id = 'a'").get()).toEqual({ status: "open", occurrences: 1 });
  } finally {
    db.close();
  }
});
