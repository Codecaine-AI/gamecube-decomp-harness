import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openState, type StateStore } from "@server/core/orchestrator-state";
import { clearUnverifiedMatch, recordUnverifiedMatch } from "@server/core/harness-runtime/run-state/unverified-matches.js";
import { cachedUnverifiedMatchesEvidenceJson, type AsyncGitRunner } from "./unverified-evidence-cache.js";

const roots: string[] = [];
const stores: StateStore[] = [];
afterEach(() => {
  for (const store of stores.splice(0)) store.db.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const GAME = { gameId: "sms", matching: { steeringGate: "enforce" } };

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "unverified-evidence-cache-"));
  roots.push(root);
  const store = openState(join(root, "state"));
  stores.push(store);
  const calls: string[][] = [];
  const git: AsyncGitRunner = async (_repoRoot, command) => {
    calls.push(command.slice(-2));
    return { exitCode: 0 };
  };
  const record = (symbol: string, clearedRev?: string) => {
    recordUnverifiedMatch(store, {
      gameId: "sms", unit: "unit", symbol, analyzedRev: `analyzed-${symbol}`, baseRev: "trusted",
      match: { base: 90, candidate: 100, real_only: null }, reasons: ["unresolved"],
    });
    if (clearedRev) clearUnverifiedMatch(store, { gameId: "sms", unit: "unit", symbol, clearedBy: "backfill", clearedRev });
  };
  // repoRoot is part of the cache key; a fresh one keeps tests independent.
  const inventory = (revision: string) => cachedUnverifiedMatchesEvidenceJson(store, GAME, { revision, repoRoot: root, git });
  return { store, calls, record, inventory };
}

const listed = (json: string) => (JSON.parse(json).unverified as Array<{ symbol: string }>).map((row) => row.symbol);

describe("cached unverified-matches inventory", () => {
  test("checks a revision shared by several holds once, and a second worker on the same base reuses the inventory", async () => {
    const { calls, record, inventory } = fixture();
    record("a", "clear-rev");
    record("b", "clear-rev");
    record("c");

    const first = await inventory("base-1");
    expect(calls).toEqual([["clear-rev", "base-1"]]);
    expect(listed(first)).toEqual(["c"]);

    const second = await inventory("base-1");
    expect(second).toBe(first);
    expect(calls).toHaveLength(1);

    // Concurrent workers on a new base share one generation.
    const [x, y] = await Promise.all([inventory("base-2"), inventory("base-2")]);
    expect(x).toBe(y);
    expect(calls).toEqual([["clear-rev", "base-1"], ["clear-rev", "base-2"]]);
  });

  test("a hold change invalidates the cached inventory", async () => {
    const { store, calls, record, inventory } = fixture();
    record("a");
    expect(listed(await inventory("base-1"))).toEqual(["a"]);
    expect(calls).toHaveLength(0);

    clearUnverifiedMatch(store, { gameId: "sms", unit: "unit", symbol: "a", clearedBy: "integration", clearedRev: "clear-rev" });
    expect(listed(await inventory("base-1"))).toEqual([]);
    expect(calls).toEqual([["clear-rev", "base-1"]]);

    record("b");
    expect(listed(await inventory("base-1"))).toEqual(["b"]);
    expect(calls).toHaveLength(2);
  });

  test("an ungated game needs no git and still writes its (empty) list", async () => {
    const root = mkdtempSync(join(tmpdir(), "unverified-evidence-cache-off-"));
    roots.push(root);
    const store = openState(join(root, "state"));
    stores.push(store);
    let gitCalls = 0;
    const json = await cachedUnverifiedMatchesEvidenceJson(store, { gameId: "melee" }, {
      revision: "base", repoRoot: root, git: async () => { gitCalls += 1; return { exitCode: 0 }; },
    });
    expect(JSON.parse(json)).toMatchObject({ gate_active: false, unverified: [] });
    expect(gitCalls).toBe(0);
  });
});
