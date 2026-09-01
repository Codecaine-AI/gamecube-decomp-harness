import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openKnowledgeStore } from "../storage/store.js";
import { extractEntities } from "./entities.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "knowledge-entities-"));
  tempDirs.push(root);
  mkdirSync(join(root, "checkout", "src", "melee", "game"), { recursive: true });
  writeFileSync(join(root, "report.json"), JSON.stringify({
    units: [
      { metadata: { source_path: "src/melee/game/player.c" } },
      { metadata: { source_path: "src/melee/game/player.c" } },
      { metadata: { source_path: "src/melee/game/item.c" } },
    ],
  }));
  writeFileSync(join(root, "checkout", "src", "melee", "game", "types.h"), `
    typedef struct PlayerState {
      int action;
      float position[3];
      void* user_data;
    } Player;

    struct Item {
      unsigned int kind;
      struct Player* owner;
    };

    struct Ambiguous {
      unsigned int flags : 3;
    };
  `);
  return root;
}

describe("extractEntities", () => {
  test("extracts conservative structs with stable parent links without writing translation units", () => {
    const root = fixtureRoot();
    const store = openKnowledgeStore({ knowledgeRoot: join(root, "knowledge") });
    const options = { reportPath: join(root, "report.json"), checkoutRoot: join(root, "checkout") };
    try {
      expect(extractEntities(store, options)).toEqual({
        structs: 2,
        fields: 5,
        skippedConstructs: 1,
        inserted: 7,
      });

      expect(store.db.query(`SELECT id, kind, locator, parent_entity_id AS parentEntityId
        FROM entity ORDER BY id`).all()).toEqual([
        { id: "struct:Item", kind: "struct", locator: "struct:Item", parentEntityId: null },
        { id: "struct:Item#kind", kind: "struct_field", locator: "struct:Item#kind", parentEntityId: "struct:Item" },
        { id: "struct:Item#owner", kind: "struct_field", locator: "struct:Item#owner", parentEntityId: "struct:Item" },
        { id: "struct:Player", kind: "struct", locator: "struct:Player", parentEntityId: null },
        { id: "struct:Player#action", kind: "struct_field", locator: "struct:Player#action", parentEntityId: "struct:Player" },
        { id: "struct:Player#position", kind: "struct_field", locator: "struct:Player#position", parentEntityId: "struct:Player" },
        { id: "struct:Player#user_data", kind: "struct_field", locator: "struct:Player#user_data", parentEntityId: "struct:Player" },
      ]);

      expect(extractEntities(store, options).inserted).toBe(0);
    } finally {
      store.close();
    }
  });

  test("dry run reports counts without writing rows", () => {
    const root = fixtureRoot();
    const store = openKnowledgeStore({ knowledgeRoot: join(root, "knowledge") });
    try {
      expect(extractEntities(store, {
        reportPath: join(root, "report.json"),
        checkoutRoot: join(root, "checkout"),
        dryRun: true,
      })).toEqual({ structs: 2, fields: 5, skippedConstructs: 1, inserted: 0 });
      expect(store.db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM entity").get()?.count).toBe(0);
    } finally {
      store.close();
    }
  });
});
