import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildAllFts } from "./index/fts.js";
import { buildEmbeddingIndex } from "./index/embeddings/indexer.js";
import * as embeddingProviderModule from "./index/embeddings/provider.js";
import { createFakeEmbeddingProvider } from "./index/embeddings/provider.js";
import { openKnowledgeIndexDb, type KnowledgeIndexDb } from "./index/db.js";
import { formatLocator, parseLocator } from "./locator.js";
import { openKnowledgeStore, type KnowledgeStore } from "./storage/store.js";
import {
  kv2AttemptSearch,
  kv2DiscordSearch,
  kv2EntityLookup,
  kv2PrSearch,
  kv2ResolveLocator,
  kv2SubjectRecord,
  kv2UnitContext,
  kv2WikiSearch,
} from "./tools.js";
import type { PrArchive } from "./index/pr-archive.js";

const tempDirs: string[] = [];
const stores: KnowledgeStore[] = [];
const indexDbs: KnowledgeIndexDb[] = [];

afterEach(() => {
  for (const indexDb of indexDbs.splice(0)) indexDb.close();
  for (const store of stores.splice(0)) store.close();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

interface Fixture {
  store: KnowledgeStore;
  indexDb: KnowledgeIndexDb;
  embeddingProvider: ReturnType<typeof createFakeEmbeddingProvider>;
  checkoutRoot: string;
  prArchive: PrArchive;
}

async function openFixture(): Promise<Fixture> {
  const root = mkdtempSync(join(tmpdir(), "knowledge-v2-tools-"));
  const knowledgeRoot = join(root, "knowledge");
  const checkoutRoot = join(root, "checkout");
  tempDirs.push(root);
  mkdirSync(join(checkoutRoot, "src"), { recursive: true });
  writeFileSync(join(checkoutRoot, "src", "fighter.c"), [
    "line one",
    "line two",
    "line three",
    "line four",
    "line five",
  ].join("\n"));
  writeFileSync(join(root, "outside.c"), "outside checkout\n");
  symlinkSync(join(root, "outside.c"), join(checkoutRoot, "src", "outside-link.c"));

  const store = openKnowledgeStore({ knowledgeRoot });
  const indexDb = openKnowledgeIndexDb({ knowledgeRoot });
  stores.push(store);
  indexDbs.push(indexDb);

  store.db.query(`INSERT INTO entity
    (id, kind, locator, identity_status)
    VALUES (?, ?, ?, 'active')`).run("unit-1", "translation_unit", "src/fighter.c");
  store.db.query(`INSERT INTO entity
    (id, kind, locator, identity_status)
    VALUES (?, ?, ?, 'active')`).run("concept-1", "game_concept", "game_concept:shield");
  store.db.query(`INSERT INTO entity
    (id, kind, locator, identity_status)
    VALUES (?, ?, ?, 'active')`).run("pattern-1", "pattern", "pattern:branch-shape");
  store.db.query(`INSERT INTO target
    (id, kind, unit, unit_entity_id, symbol, stable_key, address, identity_status, report_revision)
    VALUES (?, 'function', ?, ?, ?, ?, ?, 'current', 'rev-1')`).run(
      "target-1", "unit-1", "unit-1", "fighter_update", "GALE01:fighter_update", "0x80001000",
    );
  store.db.query(`INSERT INTO target_status
    (target_id, match_pct, linked, size, content_hash, report_revision, updated_at)
    VALUES ('target-1', 87.5, 1, 64, 'hash-1', 'rev-1', '2026-08-01T00:00:00.000Z')`).run();
  store.db.query(`INSERT INTO fact
    (id, target_id, entity_id, type, value, rationale, confidence, updated_at)
    VALUES ('fact-1', 'target-1', NULL, 'purpose', 'Updates the shield state', 'Observed writes', 0.9, '2026-08-02T00:00:00.000Z')`).run();
  store.db.query(`INSERT INTO evidence
    (id, fact_id, kind, locator, digest, why, captured_at)
    VALUES ('evidence-1', 'fact-1', 'code', ?, 'sha256:test', 'Contains the writes', '2026-08-02T00:00:00.000Z')`).run(
      formatLocator({ kind: "code", revision: "rev-1", path: "src/fighter.c", startLine: 1, endLine: 3 }),
    );
  store.db.query(`INSERT INTO link
    (id, from_target_id, to_entity_id, role, why, kind, locator, digest)
    VALUES ('link-1', 'target-1', 'concept-1', 'implements', 'Shield behavior', 'wiki', ?, NULL)`).run(
      formatLocator({ kind: "wiki", sectionId: "wiki-new" }),
    );

  const insertDiscord = store.db.query(`INSERT INTO discord_message
    (id, channel, author, posted_at, content, thread_id, ingested_at)
    VALUES (?, ?, ?, ?, ?, ?, '2026-08-10T00:00:00.000Z')`);
  insertDiscord.run("discord-before", "dev", "Ada", "2026-08-10T09:00:00.000Z", "Thread lead-in", "thread-1");
  insertDiscord.run("discord-hit", "dev", "Grace", "2026-08-10T09:01:00.000Z", `shield branch token ${"x".repeat(450)}`, "thread-1");
  insertDiscord.run("discord-after", "dev", "Lin", "2026-08-10T09:02:00.000Z", "Thread follow-up", "thread-1");

  const insertWiki = store.db.query(`INSERT INTO wiki_section
    (id, page, section, mirror_revision, content, ingested_at)
    VALUES (?, ?, ?, ?, ?, ?)`);
  insertWiki.run("wiki-old", "Shield", "Powershield", "r1", "obsolete shield timing", "2026-08-01T00:00:00.000Z");
  insertWiki.run("wiki-new", "Shield", "Powershield", "r2", "current shield timing token", "2026-08-02T00:00:00.000Z");

  store.db.query(`INSERT INTO pull_request
    (id, target_id, entity_id, pr_ref, summary, outcome, merged_at)
    VALUES ('pr-target', 'target-1', NULL, '101', 'shield branch merged', 'improvement', '2026-08-05T00:00:00.000Z')`).run();
  store.db.query(`INSERT INTO pull_request
    (id, target_id, entity_id, pr_ref, summary, outcome, merged_at)
    VALUES ('pr-unit', NULL, 'unit-1', '102', 'translation unit cleanup', 'match', '2026-08-06T00:00:00.000Z')`).run();

  store.db.query(`INSERT INTO worker_run
    (id, target_id, goal, baseline, final_outcome, integration, started_at, ended_at, closed_at)
    VALUES ('run-1', 'target-1', 'Improve shield branch', '{"score":50}', 'improvement', 'integrated',
      '2026-08-03T00:00:00.000Z', '2026-08-03T01:00:00.000Z', '2026-08-03T01:00:00.000Z')`).run();
  store.db.query(`INSERT INTO run_narrative
    (worker_run_id, summary, notable_observations, narrative, produced_by, created_at)
    VALUES (?, ?, ?, ?, 'live', '2026-08-03T01:01:00.000Z')`).run(
      "run-1",
      `Previous diagnosis found the floating-point compare token ${"s".repeat(650)}`,
      JSON.stringify([
        { observation: "The compare ordering controls register allocation", reusable_when: "A nearby float compare misses" },
        { observation: "Keeping the temporary avoids a reload", reusable_when: "The compiler reloads the operand" },
        { observation: "The branch hint changed the emitted opcode", reusable_when: "Branch shape differs" },
        { observation: "This fourth observation must be omitted", reusable_when: "Never returned by search" },
      ]),
      JSON.stringify({ diagnosis: "Preserve the temporary and reverse the compare", details: "full narrative" }),
    );
  const insertSubmission = store.db.query(`INSERT INTO submission
    (id, worker_run_id, seq, description, hypothesis, score, submitted_at, runtime_ref)
    VALUES (?, 'run-1', ?, ?, ?, ?, ?, NULL)`);
  for (let sequence = 1; sequence <= 11; sequence += 1) {
    insertSubmission.run(
      `submission-${sequence}`,
      sequence,
      `Changed shield branch ${sequence}`,
      `shield hypothesis token ${sequence}`,
      50 + sequence,
      `2026-08-03T00:${String(sequence).padStart(2, "0")}:00.000Z`,
    );
  }

  const prArchive: PrArchive = {
    getPr(prRef) {
      return prRef === "101" || prRef === "pr-target"
        ? { title: "Shield branch title", body: "Archived shield branch body token" }
        : undefined;
    },
    getDiscussionBodies(prRef) {
      return prRef === "101" || prRef === "pr-target"
        ? ["Archived review comment zero", "Archived review comment one token"]
        : [];
    },
  };
  const embeddingProvider = createFakeEmbeddingProvider();
  buildAllFts(store, indexDb, { prArchive });
  await buildEmbeddingIndex(store, indexDb, embeddingProvider, { prArchive });

  return { store, indexDb, embeddingProvider, checkoutRoot, prArchive };
}

function dataVersion(store: KnowledgeStore): number {
  return store.db.query<{ data_version: number }, []>("PRAGMA data_version").get()!.data_version;
}

async function readOnlyCall<T>(store: KnowledgeStore, invoke: () => Promise<T> | T): Promise<T> {
  const before = dataVersion(store);
  const result = await invoke();
  expect(dataVersion(store)).toBe(before);
  return result;
}

function assertLocatorRoundTrips(payload: unknown): void {
  if (typeof payload === "string") {
    if (/^(?:discord|wiki|pr|attempt|code):\/\//u.test(payload)) {
      expect(formatLocator(parseLocator(payload))).toBe(payload);
    }
    return;
  }
  if (Array.isArray(payload)) {
    for (const item of payload) assertLocatorRoundTrips(item);
    return;
  }
  if (payload !== null && typeof payload === "object") {
    for (const value of Object.values(payload)) assertLocatorRoundTrips(value);
  }
}

function expectBoundedPayload(payload: { count: number; truncated: boolean }): void {
  expect(payload.count).toBeNumber();
  expect(payload.truncated).toBeBoolean();
  assertLocatorRoundTrips(payload);
}

describe("knowledge-v2 librarian tools", () => {
  test("returns the contracted result shape for all eight tools without mutating the store", async () => {
    const fixture = await openFixture();
    const handles = {
      store: fixture.store,
      indexDb: fixture.indexDb,
      embeddingProvider: fixture.embeddingProvider,
      checkoutRoot: fixture.checkoutRoot,
      prArchive: fixture.prArchive,
    };

    const discord = await readOnlyCall(fixture.store, () => kv2DiscordSearch(handles, {
      query: "shield branch token", channel: "dev", author: "Grace", limit: 12,
    }));
    expect(discord).toMatchObject({ status: "ok", mode_requested: "keyword", mode_used: "keyword" });
    expect(discord.results[0]).toMatchObject({
      locator: "discord://message/discord-hit", author: "Grace", posted_at: "2026-08-10T09:01:00.000Z",
    });
    expect(discord.results[0].snippet.length).toBeLessThanOrEqual(430);
    expect(discord.results[0].thread_context).toBeDefined();
    expectBoundedPayload(discord);

    const wiki = await readOnlyCall(fixture.store, () => kv2WikiSearch(handles, {
      query: "current shield timing token", page: "Shield", limit: 8,
    }));
    expect(wiki).toMatchObject({ status: "ok", mode_requested: "keyword", mode_used: "keyword" });
    expect(wiki.results).toEqual([expect.objectContaining({
      locator: "wiki://wiki-new", page: "Shield", section: "Powershield",
    })]);
    expectBoundedPayload(wiki);

    const prs = await readOnlyCall(fixture.store, () => kv2PrSearch(handles, {
      query: "Archived shield branch body token", limit: 10,
    }));
    expect(prs).toMatchObject({ status: "ok", mode_requested: "keyword", mode_used: "keyword" });
    expect(prs.results[0]).toMatchObject({
      locator: "pr://pr-target",
      pr_ref: "101",
      subject: "GALE01:fighter_update",
    });
    expect(prs.results[0].summary_snippet).toBeString();
    expect(prs.results[0].discussion_snippet).toBeString();
    expectBoundedPayload(prs);

    const attempts = await readOnlyCall(fixture.store, () => kv2AttemptSearch(handles, {
      query: "floating-point compare token", target_stable_key: "GALE01:fighter_update",
      outcome: "improvement", limit: 10,
    }));
    expect(attempts).toMatchObject({ status: "ok" });
    expect(attempts.results[0]).toMatchObject({
      stable_key: "GALE01:fighter_update",
      final_outcome: "improvement",
    });
    expect(attempts.results[0].locator).toStartWith("attempt://run/run-1");
    expect(attempts.results[0].scores).toBeDefined();
    expect(attempts.results[0].description_snippet).toBeString();
    expect(attempts.results[0].hypothesis_snippet).toBeString();
    expect(attempts.results).toHaveLength(1);
    expect(attempts.results[0].narrative?.summary).toBeString();
    expect(attempts.results[0].narrative!.summary.length).toBeLessThanOrEqual(600);
    expect(attempts.results[0].narrative).toMatchObject({
      summary: expect.stringContaining("Previous diagnosis"),
      observations: [
        { observation: "The compare ordering controls register allocation", reusable_when: "A nearby float compare misses" },
        { observation: "Keeping the temporary avoids a reload", reusable_when: "The compiler reloads the operand" },
        { observation: "The branch hint changed the emitted opcode", reusable_when: "Branch shape differs" },
      ],
    });
    expectBoundedPayload(attempts);

    const subject = await readOnlyCall(fixture.store, () => kv2SubjectRecord(handles, {
      target_stable_key: "GALE01:fighter_update",
    }));
    expect(subject).toMatchObject({
      status: "ok",
      record: { subject: { stableKey: "GALE01:fighter_update" } },
      ledger: { total_count: 13, truncated: true },
      target_status: { match_pct: 87.5 },
    });
    expect(subject.ledger.entries).toHaveLength(10);
    expect(subject.prior_runs).toEqual([expect.objectContaining({
      worker_run_id: "run-1",
      summary: expect.stringContaining("Previous diagnosis"),
      notable_observations: expect.arrayContaining([
        expect.objectContaining({ observation: "The compare ordering controls register allocation" }),
      ]),
    })]);
    assertLocatorRoundTrips(subject);

    const entities = await readOnlyCall(fixture.store, () => kv2EntityLookup(handles, {
      kind: "game_concept", locator_prefix: "game_concept:", limit: 20,
    }));
    expect(entities).toMatchObject({ status: "ok" });
    expect(entities.entities).toEqual([{
      locator: "game_concept:shield", kind: "game_concept", identity_status: "active",
    }]);
    expect(entities.entities[0]).not.toHaveProperty("id");
    expectBoundedPayload(entities);

    const resolved = await readOnlyCall(fixture.store, () => kv2ResolveLocator(handles, {
      locator: "discord://message/discord-hit",
    }));
    expect(resolved).toMatchObject({ status: "ok", kind: "discord" });
    expect(resolved.message).toMatchObject({ id: "discord-hit", author: "Grace" });
    expect(resolved.thread_context).toBeDefined();
    assertLocatorRoundTrips(resolved);

    const resolvedAttempt = await readOnlyCall(fixture.store, () => kv2ResolveLocator(handles, {
      locator: "attempt://run/run-1/submission/11",
    }));
    expect(JSON.stringify(resolvedAttempt.narrative).length).toBeLessThanOrEqual(6_000);
    expect(resolvedAttempt).toMatchObject({
      status: "ok",
      kind: "attempt",
      narrative: {
        summary: expect.stringContaining("Previous diagnosis"),
        notable_observations: expect.arrayContaining([
          expect.objectContaining({ reusable_when: "A nearby float compare misses" }),
        ]),
        narrative: { diagnosis: "Preserve the temporary and reverse the compare" },
      },
    });

    const unit = await readOnlyCall(fixture.store, () => kv2UnitContext(handles, {
      target_stable_key: "GALE01:fighter_update", pr_limit: 15,
    }));
    expect(unit).toMatchObject({
      status: "ok",
      unit: { locator: "src/fighter.c", match_pct: 87.5 },
      total_pr_count: 1,
      truncated: false,
    });
    expect(unit.members).toEqual([expect.objectContaining({
      stable_key: "GALE01:fighter_update", kind: "function", match_pct: 87.5, named: true,
    })]);
    expect(unit.pull_requests).toEqual([expect.objectContaining({ id: "pr-unit", pr_ref: "102" })]);
    assertLocatorRoundTrips(unit);
  });

  test("uses the fake embedding index for vector search and deduplicates hybrid results", async () => {
    const fixture = await openFixture();
    const vector = await readOnlyCall(fixture.store, () => kv2DiscordSearch(fixture, {
      query: "shield branch token",
      mode: "vector",
      limit: 12,
    }));

    expect(vector).toMatchObject({ status: "ok", mode_requested: "vector", mode_used: "vector" });
    expect(vector.results.some((row) => row.locator === "discord://message/discord-hit")).toBeTrue();
    expectBoundedPayload(vector);

    const hybrid = await readOnlyCall(fixture.store, () => kv2DiscordSearch(fixture, {
      query: "shield branch token",
      mode: "hybrid",
      limit: 12,
    }));
    const locators = hybrid.results.map((row) => row.locator);
    expect(hybrid).toMatchObject({ status: "ok", mode_requested: "hybrid", mode_used: "hybrid" });
    expect(new Set(locators).size).toBe(locators.length);
    expect(hybrid.results.find((row) => row.locator === "discord://message/discord-hit")).toMatchObject({
      keyword_rank: expect.any(Number),
      vector_score: expect.any(Number),
    });
    expectBoundedPayload(hybrid);
  });

  test("returns a structured result for an empty FTS query", async () => {
    const fixture = await openFixture();
    const result = await readOnlyCall(fixture.store, () => kv2PrSearch(fixture, {
      query: "   ",
      mode: "keyword",
    }));

    expect(result).toEqual({
      status: "missing_query",
      mode_requested: "keyword",
      mode_used: "keyword",
      degraded: undefined,
      results: [],
      count: 0,
      truncated: false,
    });
  });

  test("silently degrades vector search to keyword when no API key can be resolved", async () => {
    const fixture = await openFixture();
    const resolveKey = spyOn(embeddingProviderModule, "resolveOpenAiApiKey").mockReturnValue(undefined);
    try {
      const result = await readOnlyCall(fixture.store, () => kv2WikiSearch({
        store: fixture.store,
        indexDb: fixture.indexDb,
      }, {
        query: "current shield timing token",
        mode: "vector",
        limit: 8,
      }));

      expect(result).toMatchObject({
        status: "ok",
        mode_requested: "vector",
        mode_used: "keyword",
      });
      expect(result.degraded).toBeString();
      expect(result.results[0]?.locator).toBe("wiki://wiki-new");
      expectBoundedPayload(result);
    } finally {
      resolveKey.mockRestore();
    }
  });

  test("returns structured locator and checkout-range failures", async () => {
    const fixture = await openFixture();
    const handles = {
      store: fixture.store,
      indexDb: fixture.indexDb,
      checkoutRoot: fixture.checkoutRoot,
      prArchive: fixture.prArchive,
    };

    const malformed = await readOnlyCall(fixture.store, () => kv2ResolveLocator(handles, {
      locator: "not-a-locator",
    }));
    expect(malformed).toMatchObject({ status: "invalid_locator" });

    const escaped = await readOnlyCall(fixture.store, () => kv2ResolveLocator(handles, {
      locator: formatLocator({
        kind: "code", revision: "rev-1", path: "../outside.c", startLine: 1, endLine: 1,
      }),
    }));
    expect(escaped).toMatchObject({ status: "path_outside_checkout" });
    assertLocatorRoundTrips(escaped);

    const symlinkEscape = await readOnlyCall(fixture.store, () => kv2ResolveLocator(handles, {
      locator: formatLocator({
        kind: "code", revision: "rev-1", path: "src/outside-link.c", startLine: 1, endLine: 1,
      }),
    }));
    expect(symlinkEscape).toMatchObject({ status: "path_outside_checkout" });
    assertLocatorRoundTrips(symlinkEscape);

    const pastEof = await readOnlyCall(fixture.store, () => kv2ResolveLocator(handles, {
      locator: formatLocator({
        kind: "code", revision: "rev-1", path: "src/fighter.c", startLine: 3, endLine: 8,
      }),
    }));
    expect(pastEof).toMatchObject({ status: "range_past_eof" });
    assertLocatorRoundTrips(pastEof);
  });

  test("resolves every stored locator kind", async () => {
    const fixture = await openFixture();
    const handles = {
      store: fixture.store,
      indexDb: fixture.indexDb,
      checkoutRoot: fixture.checkoutRoot,
      prArchive: fixture.prArchive,
    };
    const locators = [
      "discord://message/discord-hit",
      "wiki://wiki-new",
      "pr://pr-target/comment/1",
      "attempt://run/run-1/submission/2",
      "code://rev-1/src/fighter.c#L2-L4",
    ];

    for (const locator of locators) {
      const result = await readOnlyCall(fixture.store, () => kv2ResolveLocator(handles, { locator }));
      expect(result).toMatchObject({ status: "ok", kind: parseLocator(locator).kind });
      assertLocatorRoundTrips(result);
    }
  });
});
