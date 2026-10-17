import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { openState } from "@server/core/orchestrator-state";
import { loadBoardSnapshot, loadStackOnlyTargetKeys } from "@server/core/harness-runtime/phases/running/board/snapshot.js";
import { clearStackOnlyFunction, isRecordedStackOnly, listStackOnlyFunctions, recordStackOnlyFunction, stackOnlyIndexForGame } from "./stack-only-functions.js";

function withBoard(run: (root: string, store: ReturnType<typeof openState>) => void): void {
  const root = mkdtempSync(join(tmpdir(), "stack-only-board-"));
  const store = openState(resolve(root, "state"));
  try {
    const report = resolve(root, "build/GMSJ01/report.json");
    mkdirSync(resolve(report, ".."), { recursive: true });
    writeFileSync(report, JSON.stringify({
      units: [{
        name: "mario/M3DUtil/MActor",
        metadata: { source_path: "src/M3DUtil/MActor.cpp" },
        functions: [
          { name: "frameOnly", size: 64, fuzzy_match_percent: 97.5 },
          { name: "edited", size: 64, fuzzy_match_percent: 91 },
          { name: "open", size: 64, fuzzy_match_percent: 60 },
        ],
      }],
    }));
    run(root, store);
  } finally {
    store.db.close();
    rmSync(root, { recursive: true, force: true });
  }
}

const OPTIONS = { reportPath: "build/GMSJ01/report.json" };
const record = (store: ReturnType<typeof openState>, symbol: string, fuzzy: number) =>
  recordStackOnlyFunction(store, { gameId: "sms", unit: "mario/M3DUtil/MActor", symbol, fuzzy, source: "backfill" });

describe("stack-only functions on the board", () => {
  test("stop_at_frame drops a recorded function while its score is unchanged and re-queues it once the score moves", () => {
    withBoard((root, store) => {
      record(store, "frameOnly", 97.5);
      record(store, "edited", 88); // recorded before a later source change moved it to 91
      const stackOnly = stackOnlyIndexForGame(store, { gameId: "sms", stackFramePolicy: "stop_at_frame" });

      const symbols = loadBoardSnapshot(root, { ...OPTIONS, stackOnly }).candidates.map((c) => c.symbol);
      expect(symbols).toEqual(["edited", "open"]);
      expect([...loadStackOnlyTargetKeys(root, { ...OPTIONS, stackOnly })]).toEqual(["mario/M3DUtil/MActor::frameOnly"]);
    });
  });

  test("match_frame games never read the records", () => {
    withBoard((root, store) => {
      record(store, "frameOnly", 97.5);
      const stackOnly = stackOnlyIndexForGame(store, { gameId: "sms", stackFramePolicy: "match_frame" });
      expect(stackOnly).toBeUndefined();
      expect(loadBoardSnapshot(root, { ...OPTIONS, stackOnly }).candidates.map((c) => c.symbol)).toEqual(["frameOnly", "edited", "open"]);
    });
  });

  test("SMS: a record under either unit spelling excludes the module-prefixed report function", () => {
    withBoard((root, store) => {
      // A legacy row written under the short (steering) unit, and a prefixed write stored canonical.
      store.db.query(`INSERT INTO stack_only_functions (game_id, unit, symbol, fuzzy, frame_compiled, frame_target, source, run_id, evidence_json, recorded_at)
        VALUES ('sms', 'M3DUtil/MActor', 'frameOnly', 97.5, NULL, NULL, 'backfill', NULL, '{}', '2026-10-17T00:00:00Z')`).run();
      record(store, "edited", 91);
      expect(listStackOnlyFunctions(store, "sms").map((row) => row.unit)).toEqual(["M3DUtil/MActor", "M3DUtil/MActor"]);

      const stackOnly = stackOnlyIndexForGame(store, { gameId: "sms", stackFramePolicy: "stop_at_frame" });
      expect(isRecordedStackOnly(stackOnly, "mario/M3DUtil/MActor::frameOnly", 97.5)).toBe(true);
      expect(isRecordedStackOnly(stackOnly, "M3DUtil/MActor::frameOnly", 97.5)).toBe(true);
      expect(isRecordedStackOnly(stackOnly, "mario/M3DUtil/MActor::frameOnly", 98)).toBe(false);
      expect(loadBoardSnapshot(root, { ...OPTIONS, stackOnly }).candidates.map((c) => c.symbol)).toEqual(["open"]);
      // Settlement keys keep the report's spelling.
      expect([...loadStackOnlyTargetKeys(root, { ...OPTIONS, stackOnly })].sort()).toEqual(["mario/M3DUtil/MActor::edited", "mario/M3DUtil/MActor::frameOnly"]);

      // A clear under the report unit removes the short-unit row.
      clearStackOnlyFunction(store, { gameId: "sms", unit: "mario/M3DUtil/MActor", symbol: "frameOnly" });
      expect(listStackOnlyFunctions(store, "sms").map((row) => row.symbol)).toEqual(["edited"]);
    });
  });

  test("Melee: units are stored and matched as written", () => {
    withBoard((_root, store) => {
      recordStackOnlyFunction(store, { gameId: "melee", unit: "main/melee/lb/lbcommand", symbol: "fn", fuzzy: 99, source: "backfill" });
      expect(listStackOnlyFunctions(store, "melee").map((row) => row.unit)).toEqual(["main/melee/lb/lbcommand"]);
      const stackOnly = stackOnlyIndexForGame(store, { gameId: "melee", stackFramePolicy: "stop_at_frame" });
      expect(isRecordedStackOnly(stackOnly, "main/melee/lb/lbcommand::fn", 99)).toBe(true);
      expect(isRecordedStackOnly(stackOnly, "melee/lb/lbcommand::fn", 99)).toBe(false);
    });
  });
});
