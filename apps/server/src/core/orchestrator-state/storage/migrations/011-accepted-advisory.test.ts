import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { runStorageMigrations, verifyStorageSchema } from "./index.js";
import { databaseFingerprints } from "./007-retire-cycle-ownership.js";

test("migration 011 applies on a v10 store and is recorded", () => {
  const db = new Database(":memory:");
  try {
    runStorageMigrations(db);
    db.query("INSERT INTO runs (id, goal_kind, goal_value, desired_workers, status, created_at) VALUES ('run-1', 'matched_percent', 100, 1, 'active', 'then')").run();
    db.exec("DROP TABLE accepted_advisory; DROP TABLE model_node_lane_state; DELETE FROM schema_migrations WHERE version = 11");
    expect(() => verifyStorageSchema(db)).toThrow("schema is behind this process: applied through v10, this build requires v11");
    const before = databaseFingerprints(db);

    runStorageMigrations(db);

    expect(db.query("SELECT version, name FROM schema_migrations WHERE version >= 10 ORDER BY version").all()).toEqual([
      { version: 10, name: "harness_state_names" },
      { version: 11, name: "accepted_advisory" },
    ]);
    expect(() => verifyStorageSchema(db)).not.toThrow();
    const after = databaseFingerprints(db);
    for (const [name, original] of Object.entries(before)) {
      if (name === "schema_migrations") continue;
      expect(after[name]).toEqual(original);
    }
    expect((db.query("PRAGMA table_info(accepted_advisory)").all() as Array<{ name: string; notnull: number; pk: number }>)
      .map(({ name, notnull, pk }) => [name, notnull, pk])).toEqual([
      ["fingerprint", 1, 1],
      ["checkpoint_id", 1, 2],
      ["run_id", 1, 0],
      ["rule_id", 1, 0],
      ["file", 1, 0],
      ["full_line", 1, 0],
      ["occurrences", 1, 0],
      ["decision_run_id", 0, 0],
      ["probability", 0, 0],
      ["served_model", 0, 0],
      ["thresholds_json", 1, 0],
      ["accepted_at", 1, 0],
    ]);
    const accept = db.query(`INSERT INTO accepted_advisory
      (fingerprint, checkpoint_id, run_id, rule_id, file, full_line, occurrences, thresholds_json, accepted_at)
      VALUES ('af2:abc', ?, 'run-1', 'type_erasing_cast', 'src/a.c', 'f((void*)p);', 1, '{}', 'now')`);
    accept.run("cp-1");
    accept.run("cp-2");
    expect(() => accept.run("cp-1")).toThrow("UNIQUE constraint failed");
    db.query("INSERT INTO model_node_lane_state (kind, enabled_since) VALUES ('checkpoint_knowledge', 'then')").run();
    expect(() => db.query("INSERT INTO model_node_lane_state (kind, enabled_since) VALUES ('checkpoint_knowledge', 'later')").run())
      .toThrow("UNIQUE constraint failed");

    // A second run is a no-op and keeps the rows.
    runStorageMigrations(db);
    expect(db.query("SELECT COUNT(*) AS count FROM accepted_advisory").get()).toEqual({ count: 2 });
    expect(db.query("SELECT COUNT(*) AS count FROM schema_migrations WHERE version = 11").get()).toEqual({ count: 1 });
  } finally {
    db.close();
  }
});
