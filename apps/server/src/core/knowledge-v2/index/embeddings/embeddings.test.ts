import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openKnowledgeStore, type KnowledgeStore } from "../../storage/store.js";
import { openKnowledgeIndexDb, type KnowledgeIndexDb } from "../db.js";
import { chunkDiscord, chunkPr, chunkWiki, WIKI_CHUNK_MAX_CHARS } from "./chunker.js";
import { buildEmbeddingIndex, embedQuery, searchVector } from "./indexer.js";
import {
  createFakeEmbeddingProvider,
  createOpenAiEmbeddingProvider,
  type EmbeddingProvider,
} from "./provider.js";

const tempDirs: string[] = [];
const stores: KnowledgeStore[] = [];
const indexes: KnowledgeIndexDb[] = [];

afterEach(() => {
  for (const index of indexes.splice(0)) index.close();
  for (const store of stores.splice(0)) store.close();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function openFixture(name: string): { store: KnowledgeStore; indexDb: KnowledgeIndexDb } {
  const root = mkdtempSync(join(tmpdir(), `knowledge-embeddings-${name}-`));
  tempDirs.push(root);
  const store = openKnowledgeStore({ knowledgeRoot: root });
  const indexDb = openKnowledgeIndexDb({ knowledgeRoot: root });
  stores.push(store);
  indexes.push(indexDb);
  return { store, indexDb };
}

function insertTranslationUnit(store: KnowledgeStore, id = "unit-1"): void {
  store.db.query(`INSERT INTO entity
    (id, kind, locator, identity_status)
    VALUES (?, 'translation_unit', ?, 'active')`).run(id, `src/${id}.c`);
}

function insertDiscord(
  store: KnowledgeStore,
  id: string,
  content: string,
  postedAt: string,
  threadId: string | null = null,
  channel = "decomp",
): void {
  store.db.query(`INSERT INTO discord_message
    (id, channel, author, posted_at, content, thread_id, ingested_at)
    VALUES (?, ?, 'author', ?, ?, ?, '2026-01-02T00:00:00.000Z')`)
    .run(id, channel, postedAt, content, threadId);
}

function insertWiki(store: KnowledgeStore, id: string, content: string): void {
  store.db.query(`INSERT INTO wiki_section
    (id, page, section, mirror_revision, content, ingested_at)
    VALUES (?, ?, 'Section', 'r1', ?, '2026-01-01T00:00:00.000Z')`)
    .run(id, id, content);
}

describe("embedding providers", () => {
  test("fake embeddings are deterministic and accept empty input", async () => {
    const provider = createFakeEmbeddingProvider();
    const [first, second, unrelated] = await provider.embed(["same text", "same text", "different text"]);

    expect(Array.from(first)).toEqual(Array.from(second));
    expect(Array.from(first)).not.toEqual(Array.from(unrelated));
    expect(await provider.embed([])).toEqual([]);
  });

  test("OpenAI provider batches, preserves order, and retries a 429", async () => {
    const batchSizes: number[] = [];
    const authHeaders: boolean[] = [];
    let attempts = 0;
    const fetchImpl = (async (_input: string | URL | Request, init?: RequestInit) => {
      attempts += 1;
      const body = JSON.parse(String(init?.body)) as { input: string[] };
      batchSizes.push(body.input.length);
      authHeaders.push(new Headers(init?.headers).has("Authorization"));
      if (attempts === 1) return new Response("busy", { status: 429 });
      return Response.json({
        data: body.input.map((text) => ({ embedding: [Number(text.slice(1)), body.input.length] })),
      });
    }) as typeof fetch;
    const provider = createOpenAiEmbeddingProvider({
      apiKey: "unit-test-placeholder",
      fetchImpl,
      maxConcurrentRequests: 1,
      maxRetries: 1,
    });

    const vectors = await provider.embed(Array.from({ length: 130 }, (_, index) => `t${index}`));

    expect(batchSizes).toEqual([64, 64, 64, 2]);
    expect(authHeaders.every(Boolean)).toBe(true);
    expect(vectors.map((vector) => vector[0])).toEqual(Array.from({ length: 130 }, (_, index) => index));
  });

  test("OpenAI provider rejects missing credentials on embed", async () => {
    const provider = createOpenAiEmbeddingProvider({ apiKey: "" });
    expect(provider.embed(["text"])).rejects.toThrow("OPENAI_API_KEY not configured");
  });
});

describe("embedding chunkers", () => {
  test("Discord context stays in its window and caps neighbors at five", () => {
    const { store } = openFixture("discord");
    for (let index = 0; index < 8; index += 1) {
      insertDiscord(store, `main-${index}`, `main ${index}`, `2026-01-01T00:00:0${index}.000Z`);
    }
    insertDiscord(store, "thread-0", "thread only", "2026-01-01T00:00:03.500Z", "thread-a");
    insertDiscord(store, "other-channel", "other channel", "2026-01-01T00:00:03.600Z", null, "random");

    const chunks = chunkDiscord(store);
    const first = chunks.find((chunk) => chunk.locator === "discord://message/main-0")!;
    const middle = chunks.find((chunk) => chunk.locator === "discord://message/main-6")!;

    expect(first.text).toContain("main 5");
    expect(first.text).not.toContain("main 6");
    expect(middle.text).toContain("main 1");
    expect(middle.text).not.toContain("main 0");
    expect(middle.text).not.toContain("thread only");
    expect(middle.text).not.toContain("other channel");
  });

  test("Wiki uses the latest revision and splits oversized sections", () => {
    const { store } = openFixture("wiki");
    const longContent = `${"a".repeat(3500)}\n${"b".repeat(3500)}`;
    const insert = store.db.query(`INSERT INTO wiki_section
      (id, page, section, mirror_revision, content, ingested_at) VALUES (?, ?, ?, ?, ?, ?)`);
    insert.run("old", "Melee", "Physics", "r1", "old content", "2026-01-01T00:00:00.000Z");
    insert.run("latest", "Melee", "Physics", "r2", longContent, "2026-01-02T00:00:00.000Z");
    insert.run("short", "Melee", "Items", "r1", "short content", "2026-01-01T00:00:00.000Z");

    const chunks = chunkWiki(store);
    const latest = chunks.filter((chunk) => chunk.locator === "wiki://latest");

    expect(chunks.some((chunk) => chunk.locator === "wiki://old")).toBe(false);
    expect(latest.length).toBeGreaterThan(1);
    expect(latest.map((chunk) => chunk.chunkSeq)).toEqual(latest.map((_, index) => index));
    expect(latest.every((chunk) => chunk.text.length <= WIKI_CHUNK_MAX_CHARS)).toBe(true);
    expect(chunks.filter((chunk) => chunk.locator === "wiki://short")).toHaveLength(1);
    expect(chunkWiki(store, { allRevisions: true }).some((chunk) => chunk.locator === "wiki://old")).toBe(true);
  });

  test("PR chunks merge tiny comments and retain the first locator", () => {
    const { store } = openFixture("pr");
    insertTranslationUnit(store);
    store.db.query(`INSERT INTO pull_request
      (id, entity_id, pr_ref, summary, outcome, merged_at)
      VALUES ('pr-1', 'unit-1', '42', 'fallback summary', 'improvement', '2026-01-01')`).run();
    const chunks = chunkPr(store, {
      getPr: () => ({ title: "A title", body: "A body" }),
      getDiscussionBodies: () => ["tiny one", "tiny two", "L".repeat(220)],
    });

    expect(chunks[0]).toMatchObject({ locator: "pr://pr-1", chunkSeq: 0, text: "A title\n\nA body" });
    expect(chunks[1]).toMatchObject({ locator: "pr://pr-1/comment/0", text: "tiny one\n\ntiny two" });
    expect(chunks[2]).toMatchObject({ locator: "pr://pr-1/comment/2", text: "L".repeat(220) });
  });
});

describe("embedding index", () => {
  test("blank Discord and wiki chunks are counted without embedding rows", async () => {
    const { store, indexDb } = openFixture("blank");
    insertDiscord(store, "blank-discord", "\n\t", "2026-01-01T00:00:00.000Z");
    insertWiki(store, "blank-wiki", "   ");
    const base = createFakeEmbeddingProvider();
    const received: string[] = [];
    const provider: EmbeddingProvider = {
      model: base.model,
      async embed(texts) {
        received.push(...texts);
        return base.embed(texts);
      },
    };

    const result = await buildEmbeddingIndex(store, indexDb, provider, { kinds: ["discord", "wiki"] });
    const row = indexDb.db.query("SELECT count(*) AS count FROM embedding_chunk").get() as { count: number };

    expect(result).toMatchObject({ embedded: 0, skipped: 0, skippedEmpty: 2 });
    expect(result.byKind.discord.skippedEmpty).toBe(1);
    expect(result.byKind.wiki.skippedEmpty).toBe(1);
    expect(received).toEqual([]);
    expect(row.count).toBe(0);
  });

  test("mixed blank chunks stay filtered across incremental builds", async () => {
    const { store, indexDb } = openFixture("mixed-blank");
    insertDiscord(store, "good-discord", "discord text", "2026-01-01T00:00:00.000Z", null, "good");
    insertDiscord(store, "blank-discord", "   ", "2026-01-01T00:00:01.000Z", null, "blank");
    insertWiki(store, "good-wiki", "wiki text");
    insertWiki(store, "blank-wiki", "");
    const base = createFakeEmbeddingProvider();
    const received: string[] = [];
    const provider: EmbeddingProvider = {
      model: base.model,
      async embed(texts) {
        expect(texts.every((text) => text.trim().length > 0)).toBe(true);
        received.push(...texts);
        return base.embed(texts);
      },
    };

    const first = await buildEmbeddingIndex(store, indexDb, provider, { kinds: ["discord", "wiki"] });
    expect(first).toMatchObject({ embedded: 2, skipped: 0, skippedEmpty: 2 });
    expect(first.byKind.discord).toMatchObject({ embedded: 1, skippedEmpty: 1 });
    expect(first.byKind.wiki).toMatchObject({ embedded: 1, skippedEmpty: 1 });
    expect(received).toHaveLength(2);

    received.length = 0;
    const second = await buildEmbeddingIndex(store, indexDb, provider, { kinds: ["discord", "wiki"] });
    const row = indexDb.db.query("SELECT count(*) AS count FROM embedding_chunk").get() as { count: number };

    expect(second).toMatchObject({ embedded: 0, skipped: 2, skippedEmpty: 2 });
    expect(second.byKind.discord).toMatchObject({ skipped: 1, skippedEmpty: 1 });
    expect(second.byKind.wiki).toMatchObject({ skipped: 1, skippedEmpty: 1 });
    expect(received).toEqual([]);
    expect(row.count).toBe(2);
  });

  test("blank embedding queries reject before calling the provider", async () => {
    const base = createFakeEmbeddingProvider();
    let calls = 0;
    const provider: EmbeddingProvider = {
      model: base.model,
      async embed(texts) {
        calls += 1;
        return base.embed(texts);
      },
    };

    await expect(embedQuery(provider, "")).rejects.toThrow("Embedding query text must not be empty");
    await expect(embedQuery(provider, "   ")).rejects.toThrow("Embedding query text must not be empty");
    expect(calls).toBe(0);
  });

  test("incremental builds skip unchanged chunks and re-embed one changed row", async () => {
    const { store, indexDb } = openFixture("incremental");
    insertDiscord(store, "one", "alpha", "2026-01-01T00:00:00.000Z");
    insertDiscord(store, "two", "beta", "2026-01-01T00:00:01.000Z", null, "other");
    const base = createFakeEmbeddingProvider();
    let embeddedTexts = 0;
    const provider: EmbeddingProvider = {
      model: base.model,
      async embed(texts) {
        embeddedTexts += texts.length;
        return base.embed(texts);
      },
    };

    const first = await buildEmbeddingIndex(store, indexDb, provider, { kinds: ["discord"] });
    const second = await buildEmbeddingIndex(store, indexDb, provider, { kinds: ["discord"] });
    store.db.query("UPDATE discord_message SET content = 'changed' WHERE id = 'two'").run();
    const third = await buildEmbeddingIndex(store, indexDb, provider, { kinds: ["discord"] });

    expect(first).toMatchObject({ embedded: 2, skipped: 0 });
    expect(second).toMatchObject({ embedded: 0, skipped: 2 });
    expect(third).toMatchObject({ embedded: 1, skipped: 1 });
    expect(embeddedTexts).toBe(3);
  });

  test("vector search ranks identical text first and respects topK", async () => {
    const { store, indexDb } = openFixture("search");
    insertDiscord(store, "alpha", "red apple", "2026-01-01T00:00:00.000Z", "a");
    insertDiscord(store, "beta", "blue ocean", "2026-01-01T00:00:01.000Z", "b");
    insertDiscord(store, "gamma", "green forest", "2026-01-01T00:00:02.000Z", "c");
    const provider = createFakeEmbeddingProvider();
    await buildEmbeddingIndex(store, indexDb, provider, { kinds: ["discord"] });

    const hits = await searchVector(indexDb, "discord", "blue ocean", 2, provider);

    expect(hits).toHaveLength(2);
    expect(hits[0].locator).toBe("discord://message/beta");
  });

  test("rebuild clears and re-derives rows without duplicates", async () => {
    const { store, indexDb } = openFixture("rebuild");
    insertDiscord(store, "one", "alpha", "2026-01-01T00:00:00.000Z");
    insertDiscord(store, "two", "beta", "2026-01-01T00:00:01.000Z", "thread");
    const provider = createFakeEmbeddingProvider();
    await buildEmbeddingIndex(store, indexDb, provider, { kinds: ["discord"] });
    const rebuilt = await buildEmbeddingIndex(store, indexDb, provider, { kinds: ["discord"], rebuild: true });
    const row = indexDb.db.query("SELECT count(*) AS count FROM embedding_chunk").get() as { count: number };

    expect(rebuilt).toMatchObject({ embedded: 2, skipped: 0 });
    expect(row.count).toBe(2);
  });
});
