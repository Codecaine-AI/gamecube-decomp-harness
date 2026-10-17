import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openState } from "@server/core/orchestrator-state";
import { unitKeyedGet, unitKeyedHas } from "./unit-key.js";
import {
  activeUnverifiedMatch,
  clearUnverifiedMatch,
  clearUnverifiedMatchIfCertified,
  listUnverifiedMatches,
  recordUnverifiedMatch,
  unverifiedIndexForGame,
  unverifiedMatchIndex,
  type UnverifiedMatchInput,
} from "./unverified-matches.js";

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function withStore(run: (store: ReturnType<typeof openState>) => void | Promise<void>): Promise<void> | void {
  const dir = mkdtempSync(join(tmpdir(), "unverified-matches-"));
  dirs.push(dir);
  const store = openState(dir);
  const close = () => store.db.close();
  try {
    const result = run(store);
    if (result instanceof Promise) return result.finally(close);
  } catch (error) {
    close();
    throw error;
  }
  close();
}

const SHORT = "Animal/AnimalBase";
const REPORT = "mario/Animal/AnimalBase";
const SYMBOL = "moveRequest__11TAnimalBaseFv";

function input(overrides: Partial<UnverifiedMatchInput> = {}): UnverifiedMatchInput {
  return {
    gameId: "sms", unit: SHORT, symbol: SYMBOL, analyzedRev: "head-1", baseRev: "base-1", sourcePath: "src/Animal/AnimalBase.cpp",
    match: { base: 100, candidate: 100, real_only: null }, reasons: ["unresolved"], ...overrides,
  };
}

const same = () => true;

describe("unverified_match unit names (gate units vs report units)", () => {
  test("SMS: a gate-named (short) row is found, indexed and cleared through the report's mario/ unit", async () => {
    await withStore(async (store) => {
      recordUnverifiedMatch(store, input());
      expect(activeUnverifiedMatch(store, { gameId: "sms", unit: REPORT, symbol: SYMBOL })).toMatchObject({ unit: SHORT, baseRev: "base-1" });
      expect(activeUnverifiedMatch(store, { gameId: "sms", unit: "mario/Animal/Other", symbol: SYMBOL })).toBeNull();

      const index = unverifiedMatchIndex(store, "sms");
      expect([...index.keys()]).toEqual([`${SHORT}::${SYMBOL}`]);
      expect(unitKeyedHas(index, `${REPORT}::${SYMBOL}`)).toBe(true);
      expect(unitKeyedGet(index, `${REPORT}::${SYMBOL}`)?.unit).toBe(SHORT);
      expect(unitKeyedHas(index, `mario/Animal/Other::${SYMBOL}`)).toBe(false);
      expect(unitKeyedHas(unverifiedIndexForGame(store, { gameId: "sms", steeringGate: "enforce" }), `${REPORT}::${SYMBOL}`)).toBe(true);

      const cleared = await clearUnverifiedMatchIfCertified(store, {
        gameId: "sms", unit: REPORT, symbol: SYMBOL, clearedBy: "integration:i1", clearedRev: "int-1", certifiedBaseRev: "base-1", isAncestor: same,
      });
      expect(cleared).toMatchObject({ cleared: true, active: true, rowBaseRev: "base-1" });
      expect(activeUnverifiedMatch(store, { gameId: "sms", unit: SHORT, symbol: SYMBOL })).toBeNull();
    });
  });

  test("SMS: a report-named write is stored canonical; a legacy prefixed row is read, cleared and re-recorded in place", () => {
    withStore((store) => {
      recordUnverifiedMatch(store, input({ unit: REPORT }));
      expect(store.db.query("SELECT unit FROM steering_unverified_matches").all()).toEqual([{ unit: SHORT }]);
      expect(clearUnverifiedMatch(store, { gameId: "sms", unit: REPORT, symbol: SYMBOL, clearedBy: "test" })).toBe(true);

      store.db.query(`INSERT INTO steering_unverified_matches (game_id, unit, symbol, analyzed_rev, base_rev, match_json, reasons_json, report_json, recorded_at)
                      VALUES ('sms', ?, 'legacy__Fv', 'head-0', 'base-0', '{}', '[]', '{}', '2026-01-01T00:00:00.000Z')`).run(REPORT);
      expect(activeUnverifiedMatch(store, { gameId: "sms", unit: SHORT, symbol: "legacy__Fv" })).toMatchObject({ unit: SHORT, baseRev: "base-0" });
      expect(listUnverifiedMatches(store, "sms").map((row) => row.unit)).toEqual([SHORT]);
      // The re-record lands on the legacy row: it keeps its trusted base (active) and becomes canonical.
      recordUnverifiedMatch(store, input({ symbol: "legacy__Fv", baseRev: "base-2" }));
      expect(store.db.query("SELECT unit, base_rev FROM steering_unverified_matches WHERE symbol = 'legacy__Fv'").all())
        .toEqual([{ unit: SHORT, base_rev: "base-0" }]);
      expect(clearUnverifiedMatch(store, { gameId: "sms", unit: REPORT, symbol: "legacy__Fv", clearedBy: "test" })).toBe(true);
    });
  });

  test("Melee (no module prefixes): units are kept as written and only an exact unit matches", () => {
    withStore((store) => {
      recordUnverifiedMatch(store, input({ gameId: "melee", unit: REPORT }));
      expect(activeUnverifiedMatch(store, { gameId: "melee", unit: REPORT, symbol: SYMBOL })).toMatchObject({ unit: REPORT });
      expect(activeUnverifiedMatch(store, { gameId: "melee", unit: SHORT, symbol: SYMBOL })).toBeNull();
      const index = unverifiedMatchIndex(store, "melee");
      expect([...index.keys()]).toEqual([`${REPORT}::${SYMBOL}`]);
      expect(unitKeyedHas(index, `${SHORT}::${SYMBOL}`)).toBe(false);
      expect(clearUnverifiedMatch(store, { gameId: "melee", unit: SHORT, symbol: SYMBOL, clearedBy: "test" })).toBe(false);
    });
  });
});
