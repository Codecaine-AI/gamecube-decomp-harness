import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TargetCandidate, TargetReadiness } from "@server/core/shared/types/index.js";
import { applyReadinessFrontier, type ReadinessIndex } from "./readiness.js";
import { loadBoardSnapshot } from "./snapshot.js";

const KOOPA = { class: "TKoopa", owner_unit: "main/Enemy/Koopa", kind: "construct" };
const AMBIG = { class: "TShared", owner_unit: null, kind: "vtable" };

function candidate(unit: string, symbol: string, sourcePath: string): TargetCandidate {
  return { unit, symbol, sourcePath, size: 32, fuzzy: 50, kind: "function" };
}

const registry = candidate("main/System/MarNameRefGen_Enemy", "getNameRef", "src/System/MarNameRefGen_Enemy.cpp");
const caller = candidate("main/Map/MapObj", "spawnKoopa", "src/Map/MapObj.cpp");
const unresolvedCaller = candidate("main/Map/MapObj", "makeShared", "src/Map/MapObj.cpp");
const plain = candidate("main/Map/MapObj", "update", "src/Map/MapObj.cpp");
const section: TargetCandidate = { unit: "main/Map/MapObj", symbol: ".data", sourcePath: "src/Map/MapObj.cpp", size: 8, fuzzy: 0, kind: "section" };

function index(entries: Record<string, TargetReadiness>): ReadinessIndex {
  return {
    identity: { repo: "/repo/sms", rev: "abc123", version: "GMSJ01", target_stamp: "t", map_sha: "m", policy_hash: "p" },
    functions: new Map(Object.entries(entries)),
    summary: { blocked: 1, deferred: 2, ready: 1, unresolved_classes: 1 },
  };
}

const readiness = index({
  "main/System/MarNameRefGen_Enemy::getNameRef": { state: "blocked", unmet: [KOOPA], unresolved: [] },
  "main/Map/MapObj::spawnKoopa": { state: "deferred", unmet: [KOOPA], unresolved: [] },
  "main/Map/MapObj::makeShared": { state: "deferred", unmet: [], unresolved: [AMBIG] },
  "main/Map/MapObj::update": { state: "ready", unmet: [], unresolved: [] },
});

const board = [registry, caller, section, unresolvedCaller, plain];
const keys = (rows: TargetCandidate[]) => rows.map((row) => `${row.unit}::${row.symbol}`);

describe("applyReadinessFrontier", () => {
  test("without readiness options the candidates are returned as-is (Melee)", () => {
    expect(applyReadinessFrontier(board, {})).toEqual({ candidates: board });
  });

  test("enforce: blocks gated functions with unmet classes and admits deferred ones after every ready candidate", () => {
    const result = applyReadinessFrontier(board, { readiness, readinessMode: "enforce", readinessGatedPaths: ["src/System/MarNameRefGen*.cpp"] });
    expect(keys(result.candidates)).toEqual([
      "main/Map/MapObj::.data",
      "main/Map/MapObj::update",
      "main/Map/MapObj::spawnKoopa",
      "main/Map/MapObj::makeShared",
    ]);
    expect(result.blocked).toEqual([{
      key: "main/System/MarNameRefGen_Enemy::getNameRef", unit: registry.unit, symbol: registry.symbol, sourcePath: registry.sourcePath,
      size: 32, fuzzy: 50, reason: "not_ready", unmet: [KOOPA],
    }]);
    expect(result.deferred).toEqual(["main/Map/MapObj::spawnKoopa", "main/Map/MapObj::makeShared"]);
    // Deferred candidates carry their classes for the worker packet; ready ones carry nothing.
    expect(result.candidates[2]?.readiness).toEqual({ state: "deferred", unmet: [KOOPA], unresolved: [] });
    expect(result.candidates[1]?.readiness).toBeUndefined();
    expect(result.readiness).toMatchObject({ mode: "enforce", rev: "abc123", unavailable: null });
    expect(result.wouldBlock).toBeUndefined();
  });

  test("shadow: nothing is held back or reordered; would-block and would-defer are recorded", () => {
    const result = applyReadinessFrontier(board, { readiness, readinessMode: "shadow", readinessGatedPaths: ["src/System/MarNameRefGen*.cpp"] });
    expect(keys(result.candidates)).toEqual(keys(board));
    expect(result.wouldBlock?.map((row) => row.key)).toEqual(["main/System/MarNameRefGen_Enemy::getNameRef"]);
    expect(result.wouldDefer).toEqual(["main/Map/MapObj::spawnKoopa", "main/Map/MapObj::makeShared"]);
    expect(result.blocked).toBeUndefined();
    expect(result.deferred).toBeUndefined();
    expect(result.candidates[0]?.readiness).toEqual({ state: "blocked", unmet: [KOOPA], unresolved: [] });
  });

  test("enforce with readiness unavailable blocks only gated-path functions and admits the rest in order", () => {
    const result = applyReadinessFrontier(board, {
      readinessMode: "enforce",
      readinessGatedPaths: ["src/System/MarNameRefGen*.cpp"],
      readinessUnavailable: "timeout: readiness index timed out",
      readinessRev: "abc123",
    });
    expect(keys(result.candidates)).toEqual(keys(board).filter((key) => !key.includes("MarNameRefGen")));
    expect(result.blocked).toMatchObject([{ key: "main/System/MarNameRefGen_Enemy::getNameRef", reason: "readiness_unavailable", unmet: [] }]);
    expect(result.deferred).toEqual([]);
    expect(result.readiness).toEqual({ mode: "enforce", identity: null, rev: "abc123", unavailable: "timeout: readiness index timed out" });
  });

  test("shadow with readiness unavailable records the failure and admits everything", () => {
    const result = applyReadinessFrontier(board, { readinessMode: "shadow", readinessGatedPaths: ["src/System/MarNameRefGen*.cpp"], readinessUnavailable: "malformed: x" });
    expect(keys(result.candidates)).toEqual(keys(board));
    expect(result.wouldBlock?.map((row) => row.reason)).toEqual(["readiness_unavailable"]);
    expect(result.readiness?.unavailable).toBe("malformed: x");
  });

  test("functions absent from a loaded index are unknown, never silently ready: gated ones are blocked, others deferred", () => {
    const options = { readiness: index({}), readinessGatedPaths: ["src/System/MarNameRefGen*.cpp"] };
    const enforce = applyReadinessFrontier([registry, plain, section], { ...options, readinessMode: "enforce" });
    expect(keys(enforce.candidates)).toEqual(["main/Map/MapObj::.data", "main/Map/MapObj::update"]);
    expect(enforce.deferred).toEqual(["main/Map/MapObj::update"]);
    expect(enforce.blocked).toMatchObject([{ key: "main/System/MarNameRefGen_Enemy::getNameRef", reason: "not_in_index", unmet: [] }]);
    const shadow = applyReadinessFrontier([registry, plain], { ...options, readinessMode: "shadow" });
    expect(keys(shadow.candidates)).toEqual(keys([registry, plain]));
    expect(shadow.wouldBlock?.map((row) => row.reason)).toEqual(["not_in_index"]);
    expect(shadow.wouldDefer).toEqual(["main/Map/MapObj::update"]);
  });
});

describe("loadBoardSnapshot readiness options", () => {
  const dirs: string[] = [];
  afterAll(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  });

  function reportRepo(): string {
    const dir = mkdtempSync(join(tmpdir(), "board-readiness-"));
    dirs.push(dir);
    mkdirSync(join(dir, "build", "GMSJ01"), { recursive: true });
    writeFileSync(join(dir, "build", "GMSJ01", "report.json"), JSON.stringify({
      measures: { matched_code_percent: 10 },
      units: [
        { name: "main/System/MarNameRefGen_Enemy", metadata: { source_path: "src/System/MarNameRefGen_Enemy.cpp" }, functions: [{ name: "getNameRef", size: 32, fuzzy_match_percent: 50 }] },
        { name: "main/Map/MapObj", metadata: { source_path: "src/Map/MapObj.cpp" }, functions: [
          { name: "spawnKoopa", size: 32, fuzzy_match_percent: 50 },
          { name: "update", size: 32, fuzzy_match_percent: 50 },
        ] },
      ],
    }));
    return dir;
  }

  test("a board loaded without readiness has no readiness keys", () => {
    const snapshot = loadBoardSnapshot(reportRepo(), { reportPath: "build/GMSJ01/report.json" });
    expect(Object.keys(snapshot).sort()).toEqual(["candidates", "generatedAt", "measures", "objdiffPath", "reportPath"]);
  });

  test("the report-backed board applies the enforce frontier", () => {
    const snapshot = loadBoardSnapshot(reportRepo(), {
      reportPath: "build/GMSJ01/report.json",
      readiness,
      readinessMode: "enforce",
      readinessGatedPaths: ["src/System/MarNameRefGen*.cpp"],
    });
    expect(snapshot.candidates.map((row) => row.symbol)).toEqual(["update", "spawnKoopa"]);
    expect(snapshot.blocked?.map((row) => row.symbol)).toEqual(["getNameRef"]);
    expect(snapshot.deferred).toEqual(["main/Map/MapObj::spawnKoopa"]);
  });
});
