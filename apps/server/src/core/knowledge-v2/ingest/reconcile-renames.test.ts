import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openKnowledgeStore, type KnowledgeStore } from "../storage/store.js";
import { reconcileReport } from "./reconcile.js";

const UNIT = "main/test/rename";
const SOURCE_PATH = "src/test/rename.c";
const ADDRESS = "2147487744";
const OLD_ID = `target:function:${UNIT}:OldName`;
const NEW_ID = `target:function:${UNIT}:NewName`;
const temporaryDirectories: string[] = [];
const stores: KnowledgeStore[] = [];

afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "knowledge-v2-reconcile-renames-"));
  temporaryDirectories.push(directory);
  const store = openKnowledgeStore({ knowledgeRoot: directory });
  stores.push(store);
  return { store, reportPath: join(directory, "report.json") };
}

function writeFunctions(reportPath: string, names: string[]): void {
  writeFileSync(reportPath, JSON.stringify({
    units: [{
      name: UNIT,
      functions: names.map((name) => ({ name, metadata: { virtual_address: ADDRESS } })),
      metadata: { source_path: SOURCE_PATH },
    }],
  }));
}

function seedOldTarget(store: KnowledgeStore, reportPath: string): void {
  writeFunctions(reportPath, ["OldName"]);
  reconcileReport(store, { reportPath, now: () => "2026-01-01T00:00:00.000Z" });
}

describe("reconcileReport symbol renames", () => {
  test("moves every target reference without enqueueing a per-rename task", () => {
    const { store, reportPath } = fixture();
    seedOldTarget(store, reportPath);
    const unitEntityId = `translation_unit:${SOURCE_PATH}`;

    store.db.query(`INSERT INTO fact
      (id, target_id, entity_id, type, value, rationale, confidence, updated_at)
      VALUES ('fact-old', ?, NULL, 'purpose', 'old purpose', 'observed', 0.8, '2026-01-02T00:00:00.000Z')`).run(OLD_ID);
    store.db.query(`INSERT INTO evidence
      (id, fact_id, kind, locator, digest, why, captured_at)
      VALUES ('evidence-old', 'fact-old', 'pr', 'pr://1', NULL, 'supports it', '2026-01-02T00:00:00.000Z')`).run();
    store.db.query(`INSERT INTO link
      (id, from_target_id, from_entity_id, to_target_id, to_entity_id, role, why, kind, locator, digest)
      VALUES ('link-from', ?, NULL, NULL, ?, 'calls', 'from old', 'pr', 'pr://2', NULL)`).run(OLD_ID, unitEntityId);
    store.db.query(`INSERT INTO link
      (id, from_target_id, from_entity_id, to_target_id, to_entity_id, role, why, kind, locator, digest)
      VALUES ('link-to', NULL, ?, ?, NULL, 'called-by', 'to old', 'pr', 'pr://3', NULL)`).run(unitEntityId, OLD_ID);
    store.db.query(`INSERT INTO worker_run
      (id, target_id, goal, baseline, final_outcome, started_at, closed_at)
      VALUES ('run-old', ?, 'match', '0%', 'improvement', '2026-01-02', '2026-01-03')`).run(OLD_ID);
    store.db.query(`INSERT INTO pull_request
      (id, target_id, entity_id, pr_ref, summary, outcome, merged_at)
      VALUES ('pr-old', ?, NULL, 'pr://4', 'rename work', 'improvement', '2026-01-04')`).run(OLD_ID);
    store.db.query(`INSERT INTO event
      (id, target_id, kind, cause, summary, created_at)
      VALUES ('event-old', ?, 'note', NULL, 'rename noted', '2026-01-05')`).run(OLD_ID);
    store.db.query("INSERT INTO subject_index_state (target_id, indexed_at) VALUES (?, '2026-01-06')").run(OLD_ID);

    writeFunctions(reportPath, ["NewName"]);
    const result = reconcileReport(store, { reportPath, now: () => "2026-02-01T00:00:00.000Z" });

    expect(result.renames).toEqual({
      applied: 1,
      ambiguous: [],
      pairs: [{
        from_stable_key: `${UNIT}:OldName`,
        to_stable_key: `${UNIT}:NewName`,
        address: "0x80001000",
        moved_rows: { fact: 1, link: 2, worker_run: 1, pull_request: 1, event: 1, subject_index_state: 1 },
        fact_collisions: 0,
      }],
    });
    expect(store.db.query("SELECT identity_status, moved_to_id FROM target WHERE id = ?").get(OLD_ID)).toEqual({
      identity_status: "moved", moved_to_id: NEW_ID,
    });
    for (const table of ["fact", "worker_run", "pull_request", "event", "subject_index_state"]) {
      expect(store.db.query(`SELECT target_id FROM ${table}`).get()).toEqual({ target_id: NEW_ID });
    }
    expect(store.db.query("SELECT from_target_id, to_target_id FROM link ORDER BY id").all()).toEqual([
      { from_target_id: NEW_ID, to_target_id: null },
      { from_target_id: null, to_target_id: NEW_ID },
    ]);
    expect(store.db.query("SELECT fact_id FROM evidence").get()).toEqual({ fact_id: "fact-old" });
    expect(store.db.query("SELECT COUNT(*) AS count FROM index_task").get()).toEqual({ count: 0 });
  });

  test("reports an ambiguous address and moves nothing", () => {
    const { store, reportPath } = fixture();
    seedOldTarget(store, reportPath);
    writeFunctions(reportPath, ["NewName", "OtherName"]);

    const result = reconcileReport(store, { reportPath });

    expect(result.renames).toEqual({
      applied: 0,
      pairs: [],
      ambiguous: [{
        unit: UNIT,
        address: "0x80001000",
        unresolved: [`${UNIT}:OldName`],
        inserted: [`${UNIT}:NewName`, `${UNIT}:OtherName`],
      }],
    });
    expect(store.db.query("SELECT identity_status, moved_to_id FROM target WHERE id = ?").get(OLD_ID)).toEqual({
      identity_status: "unresolved", moved_to_id: null,
    });
    expect(store.db.query("SELECT COUNT(*) AS count FROM index_task").get()).toEqual({ count: 0 });
  });

  test("keeps the newer fact and deletes the losing fact's evidence on a collision", () => {
    const { store, reportPath } = fixture();
    seedOldTarget(store, reportPath);
    store.db.query(`INSERT INTO fact
      (id, target_id, entity_id, type, value, rationale, confidence, updated_at)
      VALUES ('fact-old', ?, NULL, 'purpose', 'newer value', 'old target', 0.9, '2026-03-01')`).run(OLD_ID);
    store.db.query(`INSERT INTO evidence
      (id, fact_id, kind, locator, digest, why, captured_at)
      VALUES ('evidence-winner', 'fact-old', 'pr', 'pr://winner', NULL, 'keep', '2026-03-01')`).run();
    // Populate the newly inserted target before the rename pass, modeling another writer
    // that attached knowledge as soon as the target appeared.
    store.db.exec(`CREATE TRIGGER seed_renamed_target_fact AFTER INSERT ON target
      WHEN NEW.id = '${NEW_ID}'
      BEGIN
        INSERT INTO fact (id, target_id, entity_id, type, value, rationale, confidence, updated_at)
          VALUES ('fact-new', NEW.id, NULL, 'purpose', 'older value', 'new target', 0.5, '2026-02-01');
        INSERT INTO evidence (id, fact_id, kind, locator, digest, why, captured_at)
          VALUES ('evidence-loser', 'fact-new', 'pr', 'pr://loser', NULL, 'delete', '2026-02-01');
      END`);
    writeFunctions(reportPath, ["NewName"]);
    const result = reconcileReport(store, { reportPath });

    expect(result.renames.pairs[0]?.fact_collisions).toBe(1);
    expect(store.db.query("SELECT id, target_id, value FROM fact").all()).toEqual([
      { id: "fact-old", target_id: NEW_ID, value: "newer value" },
    ]);
    expect(store.db.query("SELECT id, fact_id FROM evidence").all()).toEqual([
      { id: "evidence-winner", fact_id: "fact-old" },
    ]);
  });

  test("computes rename pairs in dry run without writing", () => {
    const { store, reportPath } = fixture();
    seedOldTarget(store, reportPath);
    writeFunctions(reportPath, ["NewName"]);

    const result = reconcileReport(store, { reportPath, dryRun: true });

    expect(result.renames.applied).toBe(1);
    expect(result.renames.pairs).toEqual([expect.objectContaining({
      from_stable_key: `${UNIT}:OldName`,
      to_stable_key: `${UNIT}:NewName`,
      address: "0x80001000",
    })]);
    expect(store.db.query("SELECT id, identity_status FROM target").all()).toEqual([
      { id: OLD_ID, identity_status: "current" },
    ]);
    expect(store.db.query("SELECT COUNT(*) AS count FROM index_task").get()).toEqual({ count: 0 });
  });
});
