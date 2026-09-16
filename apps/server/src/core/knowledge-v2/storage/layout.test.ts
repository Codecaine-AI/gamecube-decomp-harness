import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { knowledgeStorePath, knowledgeIndexPath } from "../../knowledge/paths.js";
import { openKnowledgeStore } from "./store.js";
import { openKnowledgeIndexDb } from "../index/db.js";
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function root() { const value = mkdtempSync(resolve(tmpdir(), "knowledge-layout-")); roots.push(value); return value; }
test("fresh knowledge stores and indexes use grouped folders", () => {
  const knowledgeRoot = root();
  const store = openKnowledgeStore({ knowledgeRoot });
  const index = openKnowledgeIndexDb({ knowledgeRoot });
  try {
    expect(store.path).toBe(resolve(knowledgeRoot, "store/knowledge.sqlite"));
    expect(index.path).toBe(resolve(knowledgeRoot, "indexes/knowledge-index.sqlite"));
  } finally { store.close(); index.close(); }
});
test("existing legacy databases remain authoritative without moving or replacing data", () => {
  const knowledgeRoot = root();
  const initial = openKnowledgeStore({ knowledgeRoot });
  initial.db.exec("CREATE TABLE layout_sentinel(value TEXT); INSERT INTO layout_sentinel VALUES ('preserved')");
  initial.close();
  renameSync(resolve(knowledgeRoot, "store/knowledge.sqlite"), resolve(knowledgeRoot, "knowledge.sqlite"));
  const store = openKnowledgeStore({ knowledgeRoot });
  try {
    expect(store.path).toBe(resolve(knowledgeRoot, "knowledge.sqlite"));
    expect(store.db.query("SELECT value FROM layout_sentinel").get()).toEqual({ value: "preserved" });
  } finally { store.close(); }
});
test("ambiguous canonical and legacy databases require reconciliation", () => {
  const knowledgeRoot = root();
  for (const [folder, name, getter] of [["store", "knowledge.sqlite", knowledgeStorePath], ["indexes", "knowledge-index.sqlite", knowledgeIndexPath]] as const) {
    mkdirSync(resolve(knowledgeRoot, folder), { recursive: true });
    writeFileSync(resolve(knowledgeRoot, folder, name), "fixture");
    writeFileSync(resolve(knowledgeRoot, name), "fixture");
    expect(() => getter(knowledgeRoot)).toThrow("Both game layout paths exist");
  }
});
