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

function writeUnits(reportPath: string, units: Array<{
  name: string;
  sourcePath: string;
  functions?: Array<{ name: string; address: string }>;
  sections?: Array<{ name: string; address: string }>;
}>): void {
  writeFileSync(reportPath, JSON.stringify({
    units: units.map((unit) => ({
      name: unit.name,
      functions: unit.functions?.map(({ name, address }) => ({ name, metadata: { virtual_address: address } })),
      sections: unit.sections?.map(({ name, address }) => ({ name, metadata: { virtual_address: address } })),
      metadata: { source_path: unit.sourcePath },
    })),
  }));
}

const OLD_UNIT = "main/melee/ft/chara/test";
const NEW_UNIT = "main/melee/ft/kinds/test";
const OLD_SOURCE = "src/melee/ft/chara/test.c";
const NEW_SOURCE = "src/melee/ft/kinds/test.c";
const MOVED_TARGETS = [
  { name: "FnA", address: "2147491840" },
  { name: "FnB", address: "2147491856" },
  { name: "FnC", address: "2147491872" },
];
const MOVED_SECTION = { name: ".data", address: "2150629376" };

function seedUnitMove(store: KnowledgeStore, reportPath: string, withReferences = false): void {
  writeUnits(reportPath, [{
    name: OLD_UNIT, sourcePath: OLD_SOURCE, functions: MOVED_TARGETS, sections: [MOVED_SECTION],
  }]);
  reconcileReport(store, { reportPath, headRevision: "fixture-head", now: () => "2026-01-01T00:00:00.000Z" });
  if (!withReferences) return;
  const oldEntity = `translation_unit:${OLD_SOURCE}`;
  store.db.query(`INSERT INTO fact
    (id, target_id, entity_id, type, value, rationale, confidence, updated_at)
    VALUES ('unit-fact', NULL, ?, 'purpose', 'unit purpose', 'observed', 0.8, '2026-01-02')`).run(oldEntity);
  store.db.query(`INSERT INTO evidence
    (id, fact_id, kind, locator, digest, why, captured_at)
    VALUES ('unit-evidence', 'unit-fact', 'pr', 'pr://unit', NULL, 'supports unit', '2026-01-02')`).run();
  store.db.query(`INSERT INTO link
    (id, from_target_id, from_entity_id, to_target_id, to_entity_id, role, why, kind, locator, digest)
    VALUES ('unit-link-from', NULL, ?, ?, NULL, 'owns', 'from unit', 'pr', 'pr://from', NULL)`)
    .run(oldEntity, `target:function:${OLD_UNIT}:FnA`);
  store.db.query(`INSERT INTO link
    (id, from_target_id, from_entity_id, to_target_id, to_entity_id, role, why, kind, locator, digest)
    VALUES ('unit-link-to', ?, NULL, NULL, ?, 'owned-by', 'to unit', 'pr', 'pr://to', NULL)`)
    .run(`target:function:${OLD_UNIT}:FnB`, oldEntity);
  store.db.query(`INSERT INTO pull_request
    (id, target_id, entity_id, pr_ref, summary, outcome, merged_at)
    VALUES ('unit-pr', NULL, ?, 'pr://unit-move', 'unit work', 'improvement', '2026-01-03')`).run(oldEntity);
  store.db.query("INSERT INTO subject_index_state (entity_id, indexed_at) VALUES (?, '2026-01-04')").run(oldEntity);
}

function writeMovedUnit(reportPath: string): void {
  writeUnits(reportPath, [{
    name: NEW_UNIT, sourcePath: NEW_SOURCE, functions: MOVED_TARGETS, sections: [MOVED_SECTION],
  }]);
}

function seedOldTarget(store: KnowledgeStore, reportPath: string): void {
  writeFunctions(reportPath, ["OldName"]);
  reconcileReport(store, { reportPath, headRevision: "fixture-head", now: () => "2026-01-01T00:00:00.000Z" });
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
    const result = reconcileReport(store, { reportPath, headRevision: "fixture-head", now: () => "2026-02-01T00:00:00.000Z" });

    expect(result.renames).toEqual({
      applied: 1,
      ambiguous: [],
      moved_units: [],
      pairs: [{
        from_stable_key: `${UNIT}:OldName`,
        to_stable_key: `${UNIT}:NewName`,
        from_unit: UNIT,
        to_unit: UNIT,
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

    const result = reconcileReport(store, { reportPath, headRevision: "fixture-head" });

    expect(result.renames).toEqual({
      applied: 0,
      pairs: [],
      moved_units: [],
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
    const result = reconcileReport(store, { reportPath, headRevision: "fixture-head" });

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

    const result = reconcileReport(store, { reportPath, headRevision: "fixture-head", dryRun: true });

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

  test("pairs a moved unit and merges all translation-unit references", () => {
    const { store, reportPath } = fixture();
    seedUnitMove(store, reportPath, true);
    writeMovedUnit(reportPath);

    const result = reconcileReport(store, { reportPath, headRevision: "fixture-head", now: () => "2026-02-01T00:00:00.000Z" });
    const oldEntity = `translation_unit:${OLD_SOURCE}`;
    const newEntity = `translation_unit:${NEW_SOURCE}`;

    expect(result.renames.applied).toBe(4);
    expect(result.renames.pairs).toHaveLength(4);
    expect(result.renames.pairs.every((pair) => pair.from_unit === OLD_UNIT && pair.to_unit === NEW_UNIT)).toBe(true);
    expect(result.renames.moved_units).toEqual([{
      from_unit: OLD_UNIT, to_unit: NEW_UNIT, targets: 4, entity_merged: true,
      moved_rows: { target: 4, entity: 0, fact: 1, link: 2, pull_request: 1, subject_index_state: 1 },
      fact_collisions: 0,
    }]);
    expect(store.db.query("SELECT identity_status, merged_into_id FROM entity WHERE id = ?").get(oldEntity))
      .toEqual({ identity_status: "merged", merged_into_id: newEntity });
    expect(store.db.query("SELECT identity_status, merged_into_id FROM entity WHERE id = ?").get(newEntity))
      .toEqual({ identity_status: "active", merged_into_id: null });
    expect(store.db.query("SELECT DISTINCT unit_entity_id FROM target").all()).toEqual([{ unit_entity_id: newEntity }]);
    expect(store.db.query("SELECT entity_id FROM fact").get()).toEqual({ entity_id: newEntity });
    expect(store.db.query("SELECT fact_id FROM evidence").get()).toEqual({ fact_id: "unit-fact" });
    expect(store.db.query("SELECT from_entity_id, to_entity_id FROM link ORDER BY id").all()).toEqual([
      { from_entity_id: newEntity, to_entity_id: null },
      { from_entity_id: null, to_entity_id: newEntity },
    ]);
    expect(store.db.query("SELECT entity_id FROM pull_request").get()).toEqual({ entity_id: newEntity });
    expect(store.db.query("SELECT entity_id FROM subject_index_state").get()).toEqual({ entity_id: newEntity });
  });

  test("keeps within-unit rename priority while pairing a cross-unit move", () => {
    const { store, reportPath } = fixture();
    writeUnits(reportPath, [{ name: OLD_UNIT, sourcePath: OLD_SOURCE, functions: [
      { name: "OldName", address: "2147491840" }, { name: "MoveMe", address: "2147491856" },
    ] }]);
    reconcileReport(store, { reportPath, headRevision: "fixture-head" });
    writeUnits(reportPath, [
      { name: OLD_UNIT, sourcePath: OLD_SOURCE, functions: [{ name: "NewName", address: "2147491840" }] },
      { name: NEW_UNIT, sourcePath: NEW_SOURCE, functions: [{ name: "MoveMe", address: "2147491856" }] },
    ]);

    const result = reconcileReport(store, { reportPath, headRevision: "fixture-head" });

    expect(result.renames.pairs.map(({ from_stable_key, to_stable_key }) => [from_stable_key, to_stable_key]))
      .toEqual([
        [`${OLD_UNIT}:OldName`, `${OLD_UNIT}:NewName`],
        [`${OLD_UNIT}:MoveMe`, `${NEW_UNIT}:MoveMe`],
      ]);
    expect(result.renames.moved_units).toEqual([]);
  });

  test("marks non-unique cross-unit candidates ambiguous and moves nothing", () => {
    const { store, reportPath } = fixture();
    writeUnits(reportPath, [{ name: OLD_UNIT, sourcePath: OLD_SOURCE, functions: [MOVED_TARGETS[0]!] }]);
    reconcileReport(store, { reportPath, headRevision: "fixture-head" });
    writeUnits(reportPath, [
      { name: `${NEW_UNIT}A`, sourcePath: `${NEW_SOURCE}a`, functions: [{ name: "FnA", address: MOVED_TARGETS[0]!.address }] },
      { name: `${NEW_UNIT}B`, sourcePath: `${NEW_SOURCE}b`, functions: [{ name: "FnB", address: MOVED_TARGETS[0]!.address }] },
    ]);

    const result = reconcileReport(store, { reportPath, headRevision: "fixture-head" });

    expect(result.renames).toEqual(expect.objectContaining({
      applied: 0, pairs: [], moved_units: [],
      ambiguous: [{
        unit: OLD_UNIT, address: "0x80002000", unresolved: [`${OLD_UNIT}:FnA`],
        inserted: [`${NEW_UNIT}A:FnA`, `${NEW_UNIT}B:FnB`], cross_unit: true,
      }],
    }));
    expect(store.db.query("SELECT identity_status FROM target WHERE id = ?").get(`target:function:${OLD_UNIT}:FnA`))
      .toEqual({ identity_status: "unresolved" });
  });

  test("pairs targets split across new units without merging the old entity", () => {
    const { store, reportPath } = fixture();
    writeUnits(reportPath, [{ name: OLD_UNIT, sourcePath: OLD_SOURCE, functions: MOVED_TARGETS.slice(0, 2) }]);
    reconcileReport(store, { reportPath, headRevision: "fixture-head" });
    writeUnits(reportPath, [
      { name: `${NEW_UNIT}A`, sourcePath: `${NEW_SOURCE}a`, functions: [MOVED_TARGETS[0]!] },
      { name: `${NEW_UNIT}B`, sourcePath: `${NEW_SOURCE}b`, functions: [MOVED_TARGETS[1]!] },
    ]);

    const result = reconcileReport(store, { reportPath, headRevision: "fixture-head" });

    expect(result.renames.applied).toBe(2);
    expect(result.renames.moved_units).toEqual([]);
    expect(store.db.query("SELECT identity_status, merged_into_id FROM entity WHERE id = ?")
      .get(`translation_unit:${OLD_SOURCE}`)).toEqual({ identity_status: "active", merged_into_id: null });
  });

  test("dry run reports the same unit move and writes nothing", () => {
    const dry = fixture();
    seedUnitMove(dry.store, dry.reportPath, true);
    writeMovedUnit(dry.reportPath);
    const dryResult = reconcileReport(dry.store, { reportPath: dry.reportPath, headRevision: "fixture-head", dryRun: true });

    const live = fixture();
    seedUnitMove(live.store, live.reportPath, true);
    writeMovedUnit(live.reportPath);
    const liveResult = reconcileReport(live.store, { reportPath: live.reportPath, headRevision: "fixture-head" });

    expect(dryResult.renames).toEqual(liveResult.renames);
    expect(dry.store.db.query("SELECT id, identity_status, merged_into_id FROM entity ORDER BY id").all()).toEqual([{
      id: `translation_unit:${OLD_SOURCE}`, identity_status: "active", merged_into_id: null,
    }]);
    expect(dry.store.db.query("SELECT COUNT(*) AS count FROM target WHERE identity_status != 'current'").get())
      .toEqual({ count: 0 });
    expect(dry.store.db.query("SELECT entity_id FROM fact").get()).toEqual({ entity_id: `translation_unit:${OLD_SOURCE}` });
  });
});
