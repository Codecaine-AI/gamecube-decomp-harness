import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { runStorageMigrations, verifyStorageSchema } from "./index.js";

test("a v17 store gains only the explain-job table, unique per observation, inputs and tool", () => {
  const db = new Database(":memory:");
  try {
    runStorageMigrations(db);
    db.query(`INSERT INTO steering_evidence_reviews
      (id, game_id, unit, symbol, group_digest, base_rev, site_file, site_start, site_end, created_at, updated_at)
      VALUES ('a', 'sms', 'u', 'f__Fv', 'd1', 'rev', 'src/a.c', 4, 4, 'now', 'now')`).run();
    db.exec("DROP TABLE steering_explain_jobs; DELETE FROM schema_migrations WHERE version >= 18");
    expect(() => verifyStorageSchema(db)).toThrow("applied through v17, this build requires v18");
    runStorageMigrations(db);
    expect(() => verifyStorageSchema(db)).not.toThrow();
    expect(db.query("SELECT version, name FROM schema_migrations WHERE version = 18").all()).toEqual([{ version: 18, name: "compiler_delta" }]);
    expect(db.query("SELECT COUNT(*) AS count FROM steering_evidence_reviews").get()).toEqual({ count: 1 });

    const insert = db.query(`INSERT OR IGNORE INTO steering_explain_jobs
      (observation_id, game_id, unit, symbol, input_hash, tool_hash, created_at, updated_at)
      VALUES (?, 'sms', 'u', 'f__Fv', ?, 't1', 'now', 'now')`);
    expect(Number(insert.run(1, "h1").changes)).toBe(1);
    expect(Number(insert.run(1, "h1").changes)).toBe(0);
    expect(Number(insert.run(1, "h2").changes)).toBe(1);
    expect(db.query("SELECT status, attempts, source, label, fidelity_json, inputs_json FROM steering_explain_jobs WHERE input_hash = 'h1'").get()).toEqual({
      status: "queued", attempts: 0, source: "observation", label: "gate", fidelity_json: "{}", inputs_json: "{}",
    });
  } finally {
    db.close();
  }
});
