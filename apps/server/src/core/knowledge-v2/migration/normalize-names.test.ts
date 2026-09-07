import { afterEach, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeKnowledgeNames, type NameCleanupItem } from "./normalize-names.js";

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true }); });
function fixture() {
  const db = new Database(":memory:");
  db.exec(`CREATE TABLE target (id TEXT, kind TEXT, symbol TEXT);
    CREATE TABLE entity (id TEXT, kind TEXT);
    CREATE TABLE fact (id TEXT PRIMARY KEY, target_id TEXT, entity_id TEXT, type TEXT, value TEXT, rationale TEXT, confidence REAL, updated_at TEXT);
    CREATE TABLE evidence (id TEXT PRIMARY KEY, fact_id TEXT, locator TEXT);
    INSERT INTO target VALUES ('t', 'function', 'fn_80001000');
    INSERT INTO fact VALUES ('f', 't', NULL, 'inferred_name', 'Likely DrawFrame.', 'Calls the renderer.', 0.7, 'old');
    INSERT INTO evidence VALUES ('e', 'f', 'code://revision/file.c#L1-L3');`);
  const item: NameCleanupItem = { id: "f", expected: { value: "Likely DrawFrame.", rationale: "Calls the renderer.", confidence: 0.7, updatedAt: "old" }, action: "write", value: "DrawFrame", reason: "Extracted explicit proposed name." };
  const dir = mkdtempSync(join(tmpdir(), "name-cleanup-")); dirs.push(dir);
  return { db, item, archivePath: join(dir, "before.jsonl") };
}

test("cleanup preserves evidence and confidence and archives the exact original claim", () => {
  const { db, item, archivePath } = fixture();
  try {
    expect(normalizeKnowledgeNames(db, [item], {})).toMatchObject({ updated: 1, applied: false });
    expect(db.query("SELECT value FROM fact").get()).toEqual({ value: "Likely DrawFrame." });
    normalizeKnowledgeNames(db, [item], { apply: true, archivePath, now: "new" });
    expect(db.query("SELECT value,confidence,updated_at FROM fact").get()).toEqual({ value: "DrawFrame", confidence: 0.7, updated_at: "new" });
    expect(db.query<{ rationale: string }, []>("SELECT rationale FROM fact").get()!.rationale).toContain("Likely DrawFrame.");
    expect(db.query("SELECT * FROM evidence").all()).toEqual([{ id: "e", fact_id: "f", locator: "code://revision/file.c#L1-L3" }]);
    const archive = JSON.parse(readFileSync(archivePath, "utf8"));
    expect(archive.fact.value).toBe("Likely DrawFrame.");
    expect(archive.evidence).toHaveLength(1);
  } finally { db.close(); }
});

test("stale rows, malformed names, and archive failures leave live claims intact", () => {
  const { db, item, archivePath } = fixture();
  try {
    for (const bad of [
      { ...item, expected: { ...item.expected, updatedAt: "stale" } },
      { ...item, value: "Likely DrawFrame" },
    ]) expect(() => normalizeKnowledgeNames(db, [bad], { apply: true, archivePath })).toThrow();
    expect(() => normalizeKnowledgeNames(db, [item], { apply: true, archivePath: "/nonexistent/name-cleanup-before.jsonl" })).toThrow();
    expect(db.query("SELECT value FROM fact").get()).toEqual({ value: "Likely DrawFrame." });
  } finally { db.close(); }
});

test("cleared names archive their evidence and do not alter other facts", () => {
  const { db, item, archivePath } = fixture();
  try {
    db.exec("INSERT INTO fact VALUES ('purpose', 't', NULL, 'purpose', 'Renders.', 'Source.', 0.8, 'old')");
    normalizeKnowledgeNames(db, [{ ...item, action: "clear", value: "", reason: "No supported name." }], { apply: true, archivePath });
    expect(db.query("SELECT id FROM fact").all()).toEqual([{ id: "purpose" }]);
    expect(db.query("SELECT * FROM evidence").all()).toHaveLength(0);
    expect(JSON.parse(readFileSync(archivePath, "utf8")).evidence).toHaveLength(1);
  } finally { db.close(); }
});
