import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openKnowledgeStore, type KnowledgeStore } from "../storage/store.js";
import { shortHash } from "./common.js";
import { reconcileReport, translationUnitEntity } from "./reconcile.js";

interface TargetRow {
  id: string;
  kind: string;
  stable_key: string;
  address: string;
  unit_entity_id: string;
  identity_status: string;
  report_revision: string;
}

const temporaryDirectories: string[] = [];
const stores: KnowledgeStore[] = [];

afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "knowledge-v2-reconcile-"));
  temporaryDirectories.push(directory);
  const store = openKnowledgeStore({ knowledgeRoot: directory });
  stores.push(store);
  return { store, reportPath: join(directory, "report.json") };
}

function targets(store: KnowledgeStore): TargetRow[] {
  return store.db.query<TargetRow, []>(`SELECT id, kind, stable_key, address, unit_entity_id,
    identity_status, report_revision FROM target ORDER BY id`).all();
}

function writeReport(path: string, report: unknown): string {
  const raw = JSON.stringify(report);
  writeFileSync(path, raw);
  return shortHash(raw);
}

describe("reconcileReport", () => {
  test("creates translation-unit entities before function targets and remains idempotent", () => {
    const { store, reportPath } = fixture();
    const revision = writeReport(reportPath, {
      units: [{
        name: "main/melee/lb/lblanguage",
        functions: [
          { name: "lbLangInit", size: "12", fuzzy_match_percent: 75, metadata: { virtual_address: "2147507212" } },
          { name: "lbLangGet", size: "20", fuzzy_match_percent: 50, metadata: { virtual_address: "2147507224" } },
        ],
        metadata: { complete: true, source_path: "src/melee/lb/lblanguage.c" },
      }],
    });

    expect(reconcileReport(store, { reportPath, now: () => "2026-01-01T00:00:00.000Z" })).toEqual({
      reportRevision: revision,
      unitsInserted: 1,
      functionsInserted: 2,
      dataInserted: 0,
      refreshed: 0,
      unresolved: 0,
      statusesUpserted: 2,
      skippedMalformed: 0,
      skippedMalformedSample: [],
    });
    expect(store.db.query("SELECT id, kind, locator FROM entity").all()).toEqual([{
      id: "translation_unit:src/melee/lb/lblanguage.c",
      kind: "translation_unit",
      locator: "src/melee/lb/lblanguage.c",
    }]);
    expect(targets(store)).toEqual([
      { id: "target:function:main/melee/lb/lblanguage:lbLangGet", kind: "function", stable_key: "main/melee/lb/lblanguage:lbLangGet", address: "0x80005C18", unit_entity_id: "translation_unit:src/melee/lb/lblanguage.c", identity_status: "current", report_revision: revision },
      { id: "target:function:main/melee/lb/lblanguage:lbLangInit", kind: "function", stable_key: "main/melee/lb/lblanguage:lbLangInit", address: "0x80005C0C", unit_entity_id: "translation_unit:src/melee/lb/lblanguage.c", identity_status: "current", report_revision: revision },
    ]);
    expect(store.db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM target WHERE kind = 'unit'").get()?.count).toBe(0);
    expect(store.db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM target_status").get()?.count).toBe(2);
    expect(reconcileReport(store, { reportPath })).toMatchObject({ unitsInserted: 0, functionsInserted: 0, refreshed: 2, statusesUpserted: 2 });
    expect(store.db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM entity").get()?.count).toBe(1);
  });

  test("reconciles data sections and refuses the two known addressless identities", () => {
    const { store, reportPath } = fixture();
    writeReport(reportPath, {
      units: [{
        name: "main/MetroTRK/__exception",
        functions: [
          { name: "pad_00_80003298_init", size: "8", fuzzy_match_percent: 0, metadata: {} },
          { name: "validExceptionInit", size: "24", fuzzy_match_percent: 75, metadata: { virtual_address: "2147496608" } },
        ],
        sections: [
          { name: ".text", size: "24", fuzzy_match_percent: 75, metadata: { virtual_address: "2147496608" } },
          { name: ".data", size: "16", fuzzy_match_percent: 50, metadata: { virtual_address: "2147496704" } },
          { name: ".bss", size: "32", metadata: { virtual_address: "2147496800" } },
          { name: ".init", size: "8", fuzzy_match_percent: 10, metadata: {} },
        ],
        metadata: { source_path: "src/MetroTRK/__exception.c" },
      }],
    });

    const result = reconcileReport(store, { reportPath, now: () => "2026-03-01T00:00:00.000Z" });
    expect(result).toMatchObject({ unitsInserted: 1, functionsInserted: 1, dataInserted: 2, statusesUpserted: 2, skippedMalformed: 2 });
    expect(result.skippedMalformedSample.map(({ symbol }) => symbol)).toEqual(["pad_00_80003298_init", ".init"]);
    expect(result.skippedMalformedSample.every(({ reason }) => reason.includes("address"))).toBe(true);
    expect(targets(store).map(({ stable_key }) => stable_key)).toEqual([
      "main/MetroTRK/__exception:.bss",
      "main/MetroTRK/__exception:.data",
      "main/MetroTRK/__exception:validExceptionInit",
    ]);
    expect(store.db.query<{ target_id: string }, []>("SELECT target_id FROM target_status ORDER BY target_id").all()).toEqual([
      { target_id: "target:data:main/MetroTRK/__exception:.data" },
      { target_id: "target:function:main/MetroTRK/__exception:validExceptionInit" },
    ]);
  });

  test("marks vanished function and data targets unresolved", () => {
    const { store, reportPath } = fixture();
    writeReport(reportPath, { units: [{ name: "main/test/drift", functions: [{ name: "Gone", fuzzy_match_percent: 10, metadata: { virtual_address: "2147491840" } }], sections: [{ name: ".data", fuzzy_match_percent: 20, metadata: { virtual_address: "2147491844" } }], metadata: { source_path: "src/test/drift.c" } }] });
    reconcileReport(store, { reportPath });
    const revision = writeReport(reportPath, { units: [{ name: "main/test/drift", functions: [], sections: [], metadata: { source_path: "src/test/drift.c" } }] });
    expect(reconcileReport(store, { reportPath }).unresolved).toBe(2);
    expect(targets(store).map(({ identity_status, report_revision }) => ({ identity_status, report_revision }))).toEqual([
      { identity_status: "unresolved", report_revision: revision },
      { identity_status: "unresolved", report_revision: revision },
    ]);
  });

  test("dry run reports entity and target inserts while rolling every mutation back", () => {
    const { store, reportPath } = fixture();
    writeReport(reportPath, { units: [{ name: "main/test/dry", functions: [{ name: "Dry", fuzzy_match_percent: 25, metadata: { virtual_address: "2147483648" } }], metadata: { source_path: "src/test/dry.c" } }] });
    expect(reconcileReport(store, { reportPath, dryRun: true })).toMatchObject({ unitsInserted: 1, functionsInserted: 1, statusesUpserted: 1 });
    expect(store.db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM entity").get()?.count).toBe(0);
    expect(targets(store)).toEqual([]);
  });

  test("does not rewrite a translation-unit entity that already exists", () => {
    const { store, reportPath } = fixture();
    store.db.query(`INSERT INTO entity (id, kind, locator, parent_entity_id, identity_status, merged_into_id)
      VALUES (?, 'translation_unit', ?, NULL, 'retired', NULL)`).run("translation_unit:src/test/existing.c", "src/test/existing.c");
    writeReport(reportPath, { units: [{ name: "main/test/existing", functions: [{ name: "Existing", metadata: { virtual_address: "2147483652" } }], metadata: { source_path: "src/test/existing.c" } }] });
    expect(reconcileReport(store, { reportPath }).unitsInserted).toBe(0);
    expect(store.db.query("SELECT identity_status FROM entity").get()).toEqual({ identity_status: "retired" });
  });

  test("builds deterministic translation-unit entity identities", () => {
    expect(translationUnitEntity("src/melee/ft/ftcommon.c")).toEqual({
      id: "translation_unit:src/melee/ft/ftcommon.c",
      kind: "translation_unit",
      locator: "src/melee/ft/ftcommon.c",
    });
  });
});
