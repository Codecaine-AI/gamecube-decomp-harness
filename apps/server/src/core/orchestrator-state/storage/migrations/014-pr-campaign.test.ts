import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { prCampaignMigration } from "./014-pr-campaign.js";

const tempDirs: string[] = [];
const databases: Database[] = [];

function createDatabase(): Database {
  const directory = mkdtempSync(join(tmpdir(), "orchestrator-pr-campaign-migration-"));
  tempDirs.push(directory);
  const db = new Database(join(directory, "state.sqlite"));
  databases.push(db);
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}

afterEach(() => {
  for (const db of databases.splice(0)) db.close();
  for (const directory of tempDirs.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function tableColumns(db: Database, table: string): Array<{
  name: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}> {
  return db.query(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
    notnull: number;
    dflt_value: string | null;
    pk: number;
  }>;
}

function createCampaign(db: Database, campaignId: string, projectId: string, status = "preparing"): void {
  db.query(
    `INSERT INTO pr_campaigns (
       campaign_id, project_id, session_uuid, status, trace_id,
       caused_by_event_id, created_at, source_anchor_json
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    campaignId,
    projectId,
    `session-${campaignId}`,
    status,
    `trace-${campaignId}`,
    `event-${campaignId}`,
    "2026-08-13T00:00:00.000Z",
    '{"save_point_id":"save-1","source_revision":"head-1"}',
  );
}

function createSeries(db: Database, seriesId: string, campaignId: string, status = "prepared"): void {
  db.query(
    `INSERT INTO pr_series (
       series_id, campaign_id, batch_index, status, branch, trace_id,
       caused_by_event_id, updated_at
     ) VALUES (?, ?, 0, ?, ?, ?, ?, ?)`,
  ).run(
    seriesId,
    campaignId,
    status,
    `pr/${seriesId}`,
    `trace-${seriesId}`,
    `event-${seriesId}`,
    "2026-08-13T00:00:00.000Z",
  );
}

describe("PR campaign migration 014", () => {
  test("up creates the three tables with the contract columns and defaults", () => {
    const db = createDatabase();

    prCampaignMigration.up(db);
    prCampaignMigration.up(db);

    expect(
      db.query(
        `SELECT name FROM sqlite_master
         WHERE type = 'table'
           AND name IN ('pr_campaigns', 'pr_series', 'pr_work_items')
         ORDER BY name`,
      ).all(),
    ).toEqual([
      { name: "pr_campaigns" },
      { name: "pr_series" },
      { name: "pr_work_items" },
    ]);

    expect(tableColumns(db, "pr_campaigns")).toMatchObject([
      { name: "campaign_id", pk: 1 },
      { name: "project_id", notnull: 1 },
      { name: "session_uuid", notnull: 1 },
      { name: "revision", notnull: 1, dflt_value: "0" },
      { name: "status", notnull: 1 },
      { name: "trace_id", notnull: 1 },
      { name: "caused_by_event_id", notnull: 1 },
      { name: "blockers_json", notnull: 1, dflt_value: "'[]'" },
      { name: "created_at", notnull: 1 },
      { name: "closed_at", notnull: 0 },
      { name: "latest_event_sequence", notnull: 1, dflt_value: "0" },
      { name: "source_anchor_json", notnull: 1 },
      { name: "publication_policy_json", notnull: 1, dflt_value: "'{\"batch_size\":4}'" },
    ]);
    expect(tableColumns(db, "pr_series")).toMatchObject([
      { name: "series_id", pk: 1 },
      { name: "campaign_id", notnull: 1 },
      { name: "revision", notnull: 1, dflt_value: "0" },
      { name: "batch_index", notnull: 1 },
      { name: "status", notnull: 1 },
      { name: "branch", notnull: 1 },
      { name: "upstream_pr_number", notnull: 0 },
      { name: "target_units_json", notnull: 1, dflt_value: "'[]'" },
      { name: "last_validation_json", notnull: 0 },
      { name: "trace_id", notnull: 1 },
      { name: "caused_by_event_id", notnull: 1 },
      { name: "blockers_json", notnull: 1, dflt_value: "'[]'" },
      { name: "updated_at", notnull: 1 },
    ]);
    expect(tableColumns(db, "pr_work_items")).toMatchObject([
      { name: "item_id", pk: 1 },
      { name: "series_id", notnull: 1 },
      { name: "source_kind", notnull: 1 },
      { name: "source_id", notnull: 1 },
      { name: "status", notnull: 1 },
      { name: "summary", notnull: 1 },
      { name: "created_at", notnull: 1 },
      { name: "resolved_at", notnull: 0 },
    ]);
    expect(
      db.query("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'pr_campaigns_one_open_project'").get(),
    ).toEqual({ name: "pr_campaigns_one_open_project" });
  });

  test("enforces exact status vocabularies and parent relationships", () => {
    const db = createDatabase();
    prCampaignMigration.up(db);

    createCampaign(db, "campaign-1", "melee");
    createSeries(db, "series-1", "campaign-1");
    db.query(
      `INSERT INTO pr_work_items (
         item_id, series_id, source_kind, source_id, status, summary, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "item-1",
      "series-1",
      "review_comment",
      "comment-1",
      "pending",
      "Address reviewer feedback",
      "2026-08-13T00:00:00.000Z",
    );

    expect(() => createCampaign(db, "campaign-invalid", "invalid-campaign", "open")).toThrow();
    expect(() => createSeries(db, "series-invalid", "campaign-1", "waiting")).toThrow();
    expect(() => {
      db.query(
        `INSERT INTO pr_work_items (
           item_id, series_id, source_kind, source_id, status, summary, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run("item-invalid", "series-1", "review", "source-2", "done", "Invalid", "2026-08-13T00:00:00Z");
    }).toThrow();
    expect(() => createSeries(db, "orphan-series", "missing-campaign")).toThrow();
    expect(() => {
      db.query(
        `INSERT INTO pr_work_items (
           item_id, series_id, source_kind, source_id, status, summary, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run("orphan-item", "missing-series", "review", "source-3", "pending", "Orphan", "2026-08-13T00:00:00Z");
    }).toThrow();
  });

  test("allows only one open campaign per project", () => {
    const db = createDatabase();
    prCampaignMigration.up(db);

    createCampaign(db, "campaign-open", "melee", "in_review");
    createCampaign(db, "campaign-completed", "melee", "completed");
    createCampaign(db, "campaign-abandoned", "melee", "abandoned");
    expect(() => createCampaign(db, "campaign-second-open", "melee", "preparing")).toThrow();

    db.query("UPDATE pr_campaigns SET status = 'completed', closed_at = ? WHERE campaign_id = ?").run(
      "2026-08-13T01:00:00.000Z",
      "campaign-open",
    );
    expect(() => createCampaign(db, "campaign-next-open", "melee", "working")).not.toThrow();

    expect(
      db.query(
        "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'pr_campaigns_one_open_project'",
      ).get(),
    ).toEqual(expect.objectContaining({
      sql: expect.stringContaining("WHERE status NOT IN ('completed', 'abandoned')"),
    }));
  });
});
