import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { formatLocator, parseLocator, type WikiLocator } from "../locator.js";
import { openKnowledgeStore } from "../storage/store.js";
import { importWiki } from "./wiki.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture(entries: object[], pageFiles: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "knowledge-wiki-"));
  roots.push(root);
  const dataRoot = join(root, "mirror");
  mkdirSync(join(dataRoot, "pages"), { recursive: true });
  writeFileSync(join(dataRoot, "index.jsonl"), `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`);
  for (const [name, content] of Object.entries(pageFiles)) writeFileSync(join(dataRoot, "pages", name), content);
  const store = openKnowledgeStore({ knowledgeRoot: join(root, "knowledge") });
  return { dataRoot, store };
}

describe("importWiki", () => {
  test("generates ids that round-trip through wiki locators", () => {
    const { dataRoot, store } = fixture([
      { title: "Locator Page", path: "data/pages/Locator_Page.wiki", revid: 12, sections: ["Details"] },
    ], {
      "Locator_Page.wiki": "Intro\n== Details ==\nBody\n",
    });

    importWiki(store, { dataRoot, now: () => "2026-08-31T12:00:00.000Z" });
    const rows = store.db.query<{ id: string }, []>("SELECT id FROM wiki_section ORDER BY rowid").all();
    expect(rows.length).toBeGreaterThan(0);
    for (const { id } of rows) {
      const locatorString = `wiki://${id}`;
      const parsed = parseLocator(locatorString, "wiki") as WikiLocator;
      expect(parsed.sectionId).toBe(id);
      expect(formatLocator(parsed)).toBe(locatorString);
    }
    store.close();
  });

  test("imports intro and literal headings, skips missing headings and pages, and is idempotent", () => {
    const now = () => "2026-08-31T12:00:00.000Z";
    const { dataRoot, store } = fixture([
      { title: "10-Man Smash", path: "data/pages/10-Man_Smash.wiki", revid: 1698305, sections: ["Rewards", "In {{for3ds}}"] },
      { title: "Missing Heading", path: "data/pages/Missing_Heading.wiki", revid: 7, sections: ["Not present"] },
      { title: "Missing File", path: "data/pages/Missing_File.wiki", revid: 1, sections: [] },
    ], {
      "10-Man_Smash.wiki": "Lead text\n== Rewards ==\nTrophy\n=== In {{for3ds}} ===\nMode text\n",
      "Missing_Heading.wiki": "Only an intro\n",
    });

    const first = importWiki(store, { dataRoot, now });
    expect(first).toEqual({
      inserted: 5,
      skipped: 1,
      tasksEnqueued: 1,
      pagesChanged: 2,
      watermark: JSON.stringify({ synced_at: now(), pages: 3 }),
    });
    const rows = store.db.query("SELECT id, page, section, mirror_revision, content, ingested_at FROM wiki_section ORDER BY id").all();
    expect(rows).toEqual([
      { id: "10-man-smash~__intro__@r1698305", page: "10-Man Smash", section: "__intro__", mirror_revision: "r1698305", content: "Lead text\n", ingested_at: now() },
      { id: "10-man-smash~in-for3ds@r1698305", page: "10-Man Smash", section: "In {{for3ds}}", mirror_revision: "r1698305", content: "Mode text\n", ingested_at: now() },
      { id: "10-man-smash~rewards@r1698305", page: "10-Man Smash", section: "Rewards", mirror_revision: "r1698305", content: "Trophy\n", ingested_at: now() },
      { id: "missing-heading~__intro__@r7", page: "Missing Heading", section: "__intro__", mirror_revision: "r7", content: "Only an intro\n", ingested_at: now() },
      { id: "missing-heading~not-present@r7", page: "Missing Heading", section: "Not present", mirror_revision: "r7", content: "", ingested_at: now() },
    ]);
    const task = store.db.query<{ payload: string }, []>("SELECT payload FROM index_task").get()!;
    expect(JSON.parse(task.payload)).toEqual({ source: "wiki", pages: ["10-man-smash", "missing-heading"], revision_stamp: now() });

    const second = importWiki(store, { dataRoot, now: () => "2026-09-01T00:00:00.000Z" });
    expect(second).toEqual({ inserted: 0, skipped: 6, tasksEnqueued: 0, pagesChanged: 0, watermark: first.watermark });
    expect(store.db.query<{ count: number }, []>("SELECT count(*) AS count FROM index_task").get()!.count).toBe(1);
    store.close();
  });

  test("a revision bump preserves old rows and inserts the complete new revision", () => {
    const entry = { title: "Page", path: "data/pages/Page.wiki", revid: 1, sections: ["Details"] };
    const { dataRoot, store } = fixture([entry], { "Page.wiki": "Intro\n== Details ==\nOld\n" });
    importWiki(store, { dataRoot, now: () => "2026-01-01T00:00:00.000Z" });
    writeFileSync(join(dataRoot, "index.jsonl"), `${JSON.stringify({ ...entry, revid: 2 })}\n`);
    writeFileSync(join(dataRoot, "pages", "Page.wiki"), "New intro\n== Details ==\nNew\n");

    expect(importWiki(store, { dataRoot, now: () => "2026-01-02T00:00:00.000Z" })).toMatchObject({ inserted: 2, skipped: 0, tasksEnqueued: 1, pagesChanged: 1 });
    expect(store.db.query<{ count: number }, []>("SELECT count(*) AS count FROM wiki_section").get()!.count).toBe(4);
    expect(store.db.query<{ content: string }, [string]>("SELECT content FROM wiki_section WHERE id = ?").get("page~details@r1")!.content).toBe("Old\n");
    store.close();
  });

  test("deduplicates repeated index records within a run and remains idempotent", () => {
    const entry = { title: "Duplicate", path: "data/pages/Duplicate.wiki", revid: 11, sections: ["One", "Two"] };
    const { dataRoot, store } = fixture([entry, entry, entry], {
      "Duplicate.wiki": "Intro\n== One ==\nFirst\n== Two ==\nSecond\n",
    });
    const now = () => "2026-04-01T00:00:00.000Z";

    expect(importWiki(store, { dataRoot, now })).toEqual({
      inserted: 3,
      skipped: 6,
      tasksEnqueued: 1,
      pagesChanged: 1,
      watermark: JSON.stringify({ synced_at: now(), pages: 3 }),
    });
    const rows = store.db.query<{ id: string }, []>("SELECT id FROM wiki_section ORDER BY rowid").all();
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((row) => row.id)).size).toBe(3);
    const task = store.db.query<{ payload: string }, []>("SELECT payload FROM index_task").get()!;
    expect(JSON.parse(task.payload).pages).toEqual(["duplicate"]);

    expect(importWiki(store, { dataRoot, now: () => "2026-04-02T00:00:00.000Z" })).toEqual({
      inserted: 0,
      skipped: 9,
      tasksEnqueued: 0,
      pagesChanged: 0,
      watermark: JSON.stringify({ synced_at: now(), pages: 3 }),
    });
    expect(store.db.query<{ count: number }, []>("SELECT count(*) AS count FROM wiki_section").get()!.count).toBe(3);
    store.close();
  });

  test("processes the same title at different revisions", () => {
    const entries = [
      { title: "Revised", path: "data/pages/Revised.wiki", revid: 1, sections: ["Details"] },
      { title: "Revised", path: "data/pages/Revised.wiki", revid: 2, sections: ["Details"] },
    ];
    const { dataRoot, store } = fixture(entries, { "Revised.wiki": "Intro\n== Details ==\nBody\n" });

    expect(importWiki(store, { dataRoot, now: () => "2026-04-03T00:00:00.000Z" })).toMatchObject({
      inserted: 4,
      skipped: 0,
    });
    expect(store.db.query<{ mirror_revision: string; count: number }, []>(
      "SELECT mirror_revision, count(*) AS count FROM wiki_section GROUP BY mirror_revision ORDER BY mirror_revision",
    ).all()).toEqual([
      { mirror_revision: "r1", count: 2 },
      { mirror_revision: "r2", count: 2 },
    ]);
    store.close();
  });

  test("disambiguates repeated headings and assigns their content in document order", () => {
    const entry = {
      title: "Repeated sections",
      path: "data/pages/Repeated_sections.wiki",
      revid: 42,
      sections: ["Trophy", "Trophy", "Notes", "Trophy", "Notes"],
    };
    const { dataRoot, store } = fixture([entry], {
      "Repeated_sections.wiki": [
        "Intro",
        "== Trophy ==",
        "First trophy",
        "== Trophy ==",
        "Second trophy",
        "== Notes ==",
        "First note",
        "== Trophy ==",
        "Third trophy",
        "== Notes ==",
        "Second note",
        "",
      ].join("\n"),
    });

    expect(importWiki(store, { dataRoot, now: () => "2026-03-01T00:00:00.000Z" })).toMatchObject({ inserted: 6, skipped: 0 });
    const rows = store.db.query<{ id: string; section: string; content: string }, []>(
      "SELECT id, section, content FROM wiki_section WHERE section LIKE 'Trophy%' ORDER BY rowid",
    ).all();
    expect(rows).toEqual([
      { id: "repeated-sections~trophy@r42", section: "Trophy", content: "First trophy\n" },
      { id: "repeated-sections~trophy-2@r42", section: "Trophy (2)", content: "Second trophy\n" },
      { id: "repeated-sections~trophy-3@r42", section: "Trophy (3)", content: "Third trophy\n" },
    ]);
    expect(store.db.query<{ section: string; content: string }, []>(
      "SELECT section, content FROM wiki_section WHERE section LIKE 'Notes%' ORDER BY rowid",
    ).all()).toEqual([
      { section: "Notes", content: "First note\n" },
      { section: "Notes (2)", content: "Second note\n" },
    ]);
    store.close();
  });

  test("re-importing repeated headings inserts no rows", () => {
    const entry = { title: "Trophies", path: "data/pages/Trophies.wiki", revid: 9, sections: ["Trophy", "Trophy", "Trophy"] };
    const { dataRoot, store } = fixture([entry], {
      "Trophies.wiki": "Intro\n== Trophy ==\nOne\n== Trophy ==\nTwo\n== Trophy ==\nThree\n",
    });
    importWiki(store, { dataRoot, now: () => "2026-03-01T00:00:00.000Z" });

    expect(importWiki(store, { dataRoot, now: () => "2026-03-02T00:00:00.000Z" })).toMatchObject({
      inserted: 0,
      skipped: 4,
      tasksEnqueued: 0,
      pagesChanged: 0,
    });
    expect(store.db.query<{ count: number }, []>("SELECT count(*) AS count FROM wiki_section").get()!.count).toBe(4);
    store.close();
  });

  test("avoids collisions with raw headings that contain an ordinal suffix", () => {
    const entry = {
      title: "Collision",
      path: "data/pages/Collision.wiki",
      revid: 5,
      sections: ["Trophy", "Trophy (2)", "Trophy"],
    };
    const { dataRoot, store } = fixture([entry], {
      "Collision.wiki": "Intro\n== Trophy ==\nOne\n== Trophy (2) ==\nLiteral\n== Trophy ==\nTwo\n",
    });

    expect(importWiki(store, { dataRoot, now: () => "2026-03-01T00:00:00.000Z" })).toMatchObject({ inserted: 4, skipped: 0 });
    expect(store.db.query<{ id: string; section: string }, []>(
      "SELECT id, section FROM wiki_section WHERE section != '__intro__' ORDER BY rowid",
    ).all()).toEqual([
      { id: "collision~trophy@r5", section: "Trophy" },
      { id: "collision~trophy-2@r5", section: "Trophy (2)" },
      { id: "collision~trophy-3@r5", section: "Trophy (3)" },
    ]);
    store.close();
  });

  test("dry run writes nothing and changed pages are chunked into at most 50 per task", () => {
    const entries = Array.from({ length: 51 }, (_, index) => ({
      title: `Page ${index}`,
      path: `data/pages/Page_${index}.wiki`,
      revid: 1,
      sections: [],
    }));
    const files = Object.fromEntries(entries.map((_, index) => [`Page_${index}.wiki`, `Page ${index} intro\n`]));
    const { dataRoot, store } = fixture(entries, files);
    const now = () => "2026-02-01T00:00:00.000Z";

    expect(importWiki(store, { dataRoot, now, dryRun: true })).toMatchObject({ inserted: 51, skipped: 0, tasksEnqueued: 2, pagesChanged: 51 });
    expect(store.db.query<{ count: number }, []>("SELECT count(*) AS count FROM wiki_section").get()!.count).toBe(0);
    expect(store.db.query<{ count: number }, []>("SELECT count(*) AS count FROM index_task").get()!.count).toBe(0);
    expect(store.db.query("SELECT position FROM source_watermark WHERE source = 'wiki'").get()).toBeNull();

    importWiki(store, { dataRoot, now });
    const payloads = store.db.query<{ payload: string }, []>("SELECT payload FROM index_task ORDER BY rowid").all().map((row) => JSON.parse(row.payload));
    expect(payloads.map((payload) => payload.pages.length)).toEqual([50, 1]);
    expect(payloads[0].pages[0]).toBe("page-0");
    expect(payloads[1].pages).toEqual(["page-50"]);
    store.close();
  });
});
