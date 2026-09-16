import type { StorageMigration } from "./types.js";

/** Convert mutable control state once; keep every original row and immutable event payload. */
export const canonicalSyncStagingMigration: StorageMigration = {
  version: 9,
  name: "canonical_sync_staging",
  up(db) {
    db.exec("CREATE TABLE historical_sync_staging(sync_id TEXT PRIMARY KEY, original_row_json TEXT NOT NULL, canonical_staging_json TEXT NOT NULL)");
    const rows = db.query("SELECT * FROM sync_state WHERE staging_json IS NOT NULL").all() as Array<Record<string, unknown>>;
    for (const row of rows) {
      const staging = JSON.parse(String(row.staging_json));
      let changed = false;
      if (Object.hasOwn(staging, "cycle_head_sha")) {
        if (Object.hasOwn(staging, "harness_head_sha") && staging.harness_head_sha !== staging.cycle_head_sha) throw new Error(`Conflicting staging heads for ${row.sync_id}`);
        staging.harness_head_sha = staging.cycle_head_sha; delete staging.cycle_head_sha; changed = true;
      }
      if (staging.last_durable_stage === "cycle_merged") { staging.last_durable_stage = "harness_merged"; changed = true; }
      if (!changed) continue;
      const canonical = JSON.stringify(staging);
      db.query("INSERT INTO historical_sync_staging VALUES(?,?,?)").run(String(row.sync_id), JSON.stringify(row), canonical);
      db.query("UPDATE sync_state SET staging_json=? WHERE sync_id=?").run(canonical, String(row.sync_id));
    }
  },
};
