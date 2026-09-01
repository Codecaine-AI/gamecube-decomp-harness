import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseLocator } from "../locator.js";
import {
  insertDiscordMessages,
  insertEntitiesIfMissing,
  insertPullRequestEntries,
  insertTargets,
  insertWikiSections,
  insertWorkerRun,
} from "../records/index.js";
import { openKnowledgeStore, type KnowledgeStore } from "../storage/store.js";
import { openKnowledgeIndexDb, type KnowledgeIndexDb } from "./db.js";
import {
  buildAttemptFts,
  buildDiscordFts,
  buildPrFts,
  buildWikiFts,
  searchFts,
} from "./fts.js";
import type { PrArchive } from "./pr-archive.js";

const tempDirs: string[] = [];
const stores: KnowledgeStore[] = [];
const indexDbs: KnowledgeIndexDb[] = [];

afterEach(() => {
  for (const indexDb of indexDbs.splice(0)) indexDb.close();
  for (const store of stores.splice(0)) store.close();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function openFixture(name: string): { store: KnowledgeStore; indexDb: KnowledgeIndexDb } {
  const dir = mkdtempSync(join(tmpdir(), `knowledge-v2-fts-${name}-`));
  tempDirs.push(dir);
  const store = openKnowledgeStore({ knowledgeRoot: dir });
  const indexDb = openKnowledgeIndexDb({ knowledgeRoot: dir });
  stores.push(store);
  indexDbs.push(indexDb);
  return { store, indexDb };
}

function insertUnit(store: KnowledgeStore, id = "unit-1"): void {
  const unitEntityId = `${id}-entity`;
  insertEntitiesIfMissing(store, [{
    id: unitEntityId,
    kind: "translation_unit",
    locator: `src/${id}.c`,
  }]);
  insertTargets(store, [{
    id,
    kind: "function",
    unit: id,
    unitEntityId,
    symbol: `${id}_symbol`,
    stableKey: `${id}_stable_key`,
    address: "0x80000000",
    identityStatus: "current",
    reportRevision: "rev-1",
  }]);
}

describe("knowledge-v2 FTS", () => {
  test("indexes Discord content and rebuilds without duplicates", () => {
    const { store, indexDb } = openFixture("discord");
    insertDiscordMessages(store, [
      { id: "discord-1", channel: "dev", author: "a", postedAt: "2026-01-01", content: "unique wavedash note" },
      { id: "discord-2", channel: "dev", author: "b", postedAt: "2026-01-02", content: "unrelated shield note" },
    ]);

    expect(buildDiscordFts(store, indexDb)).toBe(2);
    expect(buildDiscordFts(store, indexDb)).toBe(2);
    const hits = searchFts(indexDb, "discord", "wavedash");
    expect(hits).toHaveLength(1);
    expect(parseLocator(hits[0].locator, "discord")).toEqual({ kind: "discord", messageId: "discord-1" });
    expect(hits[0].snippet.length).toBeGreaterThan(0);
    expect(indexDb.db.query<{ count: number }, []>("SELECT count(*) AS count FROM discord_fts").get()).toEqual({ count: 2 });
  });

  test("indexes only the latest wiki revision by default", () => {
    const { store, indexDb } = openFixture("wiki");
    insertWikiSections(store, [
      { id: "wiki-old", page: "Physics", section: "Gravity", mirrorRevision: "r1", content: "obsoletegravity", ingestedAt: "2026-01-01" },
      { id: "wiki-new", page: "Physics", section: "Gravity", mirrorRevision: "r2", content: "currentgravity", ingestedAt: "2026-01-02" },
    ]);

    expect(buildWikiFts(store, indexDb)).toBe(1);
    expect(searchFts(indexDb, "wiki", "obsoletegravity")).toHaveLength(0);
    expect(searchFts(indexDb, "wiki", "currentgravity")).toHaveLength(1);
    expect(buildWikiFts(store, indexDb, { allWikiRevisions: true })).toBe(2);
    expect(searchFts(indexDb, "wiki", "obsoletegravity")).toHaveLength(1);
  });

  test("indexes PR archive fields and canonical fallbacks", () => {
    const { store, indexDb } = openFixture("pr");
    insertUnit(store);
    insertPullRequestEntries(store, [
      { id: "pr-1", targetId: "unit-1", prRef: "42", summary: "unused summary", outcome: "match", mergedAt: "2026-01-01" },
      { id: "pr-2", targetId: "unit-1", prRef: "missing-ref", summary: "fallbacksummary", outcome: "improvement", mergedAt: "2026-01-02" },
      { id: "pr-3", entityId: "unit-1-entity", prRef: "unit-ref", summary: "entitysummary", outcome: "improvement", mergedAt: "2026-01-03" },
    ]);
    const archive: PrArchive = {
      getPr(prRef) {
        return prRef === "42" ? { title: "archivetitle", body: "archivebody" } : undefined;
      },
      getDiscussionBodies(prRef) {
        return prRef === "42" ? ["discussiontoken"] : [];
      },
    };

    expect(buildPrFts(store, indexDb, { prArchive: archive })).toBe(3);
    for (const query of ["archivetitle", "archivebody", "discussiontoken"]) {
      expect(searchFts(indexDb, "pr", query)[0]?.locator).toBe("pr://pr-1");
    }
    expect(searchFts(indexDb, "pr", "missing-ref")[0]?.locator).toBe("pr://pr-2");
    expect(searchFts(indexDb, "pr", "fallbacksummary")[0]?.locator).toBe("pr://pr-2");
    expect(searchFts(indexDb, "pr", "entitysummary")[0]?.locator).toBe("pr://pr-3");
  });

  test("indexes ordered attempt hypotheses and descriptions", () => {
    const { store, indexDb } = openFixture("attempt");
    insertUnit(store);
    insertWorkerRun(store, {
      id: "worker-1", targetId: "unit-1", goal: "match", baseline: "{}", finalOutcome: "improvement",
      startedAt: "2026-01-01", closedAt: "2026-01-02",
    }, [
      { id: "submission-1", seq: 1, hypothesis: "branchswap", description: "firstdescription", score: 1, submittedAt: "2026-01-01" },
      { id: "submission-2", seq: 2, hypothesis: "registermove", description: "seconddescription", score: 2, submittedAt: "2026-01-02" },
    ]);

    expect(buildAttemptFts(store, indexDb)).toBe(1);
    expect(searchFts(indexDb, "attempt", "branchswap")[0]?.locator).toBe("attempt://run/worker-1");
    expect(searchFts(indexDb, "attempt", "seconddescription")[0]?.locator).toBe("attempt://run/worker-1");
  });

  test("quotes path tokens and embedded double quotes safely", () => {
    const { store, indexDb } = openFixture("escaping");
    insertDiscordMessages(store, [{
      id: "discord-path", channel: "dev", author: "a", postedAt: "2026-01-01",
      content: 'main/melee/gm/gm_16A2 alpha"beta',
    }]);
    buildDiscordFts(store, indexDb);

    expect(() => searchFts(indexDb, "discord", "main/melee/gm/gm_16A2")).not.toThrow();
    expect(searchFts(indexDb, "discord", "main/melee/gm/gm_16A2")).toHaveLength(1);
    expect(() => searchFts(indexDb, "discord", 'alpha"beta')).not.toThrow();
    expect(searchFts(indexDb, "discord", 'alpha"beta')).toHaveLength(1);
    expect(() => searchFts(indexDb, "discord", "   ")).toThrow();
  });
});
