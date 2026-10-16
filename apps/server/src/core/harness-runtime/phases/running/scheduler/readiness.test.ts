import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import type { ResolvedGame } from "@server/core/game-registry/resolver.js";
import type { CommandResult } from "@server/infrastructure/shell";
import {
  boardReadinessOptions,
  clearReadinessCache,
  expectedReadinessIdentity,
  loadReadinessForEpoch,
  parseReadinessIndex,
  prepareEpochReadiness,
  readinessPolicyHash,
  readinessVersion,
  readinessWaitingLabel,
  type ReadinessRunner,
} from "./readiness.js";
import { writeReadinessRepo } from "./readiness.test-fixture.js";

const repoDir = mkdtempSync(join(tmpdir(), "readiness-loader-"));
const { rev: REV, mapPath } = writeReadinessRepo(repoDir);
function commit(): string {
  const run = (...args: string[]) => Bun.spawnSync(["git", "-C", repoDir, ...args], { stdout: "pipe" }).stdout.toString().trim();
  run("commit", "-q", "--allow-empty", "-m", "next");
  return run("rev-parse", "HEAD");
}
const NEXT = commit();
const THIRD = commit();
afterAll(() => rmSync(repoDir, { recursive: true, force: true }));

function smsGame(mode: "off" | "shadow" | "enforce" = "enforce"): ResolvedGame {
  return {
    gameId: "sms",
    matching: { stackFramePolicy: "stop_at_frame", steeringGate: "shadow" },
    ordering: { mode, gatedPaths: ["src/System/MarNameRefGen*.cpp"], scope: { maxForeignHeaders: 3, maxForeignHeaderLines: 25 } },
    validation: { reportPath: "build/GMSJ01/report.json" },
  } as unknown as ResolvedGame;
}

function globals(game?: ResolvedGame): Pick<GlobalArgs, "repoRoot" | "stateDir" | "game"> {
  return { repoRoot: repoDir, stateDir: join(repoDir, ".state"), ...(game ? { game } : {}) };
}

function argOf(args: string[], flag: string): string {
  return args[args.indexOf(flag) + 1]!;
}

function revArg(args: string[]): string {
  return argOf(args, "--rev");
}

/** The identity readiness.py would report for these args (recomputed from the fixture's inputs). */
function identityFor(args: string[]): Record<string, string> {
  const probe = expectedReadinessIdentity({ repoRoot: argOf(args, "--repo"), rev: revArg(args), version: argOf(args, "--version"), policy: JSON.parse(argOf(args, "--policy-json")) });
  if (!probe.ok) throw new Error(probe.error);
  return { ...probe.identity };
}

function indexJson(identity: Record<string, unknown>): string {
  return JSON.stringify({
    identity,
    functions: {
      "main/System/MarNameRefGen_Enemy::getNameRef": {
        state: "blocked", unmet: [{ class: "TKoopa", owner_unit: "main/Enemy/Koopa", kind: "construct" }], unresolved: [],
      },
      "main/Map/MapObj::update": { state: "ready", unmet: [], unresolved: [] },
    },
    classes: { TKoopa: { owner: "main/Enemy/Koopa", provenance: "vtable", state: "not_ready" } },
    summary: { blocked: 1, deferred: 0, ready: 1, unresolved_classes: 0 },
  });
}

/** A runner that answers like readiness.py, optionally tampering with the identity. */
function toolRunner(tamper: (identity: Record<string, string>) => Record<string, unknown> = (identity) => identity) {
  return fakeRunner((args) => ok(indexJson(tamper(identityFor(args)))));
}

function fakeRunner(responder: (args: string[]) => CommandResult | Promise<CommandResult>): ReadinessRunner & { calls: string[][] } {
  const calls: string[][] = [];
  const runner = (async (args: string[]) => {
    calls.push(args);
    return responder(args);
  }) as unknown as ReadinessRunner & { calls: string[][] };
  runner.calls = calls;
  return runner;
}

function ok(stdout: string): CommandResult {
  return { exitCode: 0, stdout, stderr: "" };
}

beforeEach(() => clearReadinessCache());

describe("loadReadinessForEpoch", () => {
  test("runs readiness.py index with the game's policy and version, and parses the contract JSON", async () => {
    const runner = toolRunner();
    const load = await loadReadinessForEpoch({ globals: globals(smsGame()), rev: REV, runner });
    expect(load.ok).toBe(true);
    if (!load.ok) return;
    expect(load.index.identity.rev).toBe(REV);
    expect(load.index.functions.get("main/System/MarNameRefGen_Enemy::getNameRef")?.state).toBe("blocked");
    expect(load.index.summary.blocked).toBe(1);
    const args = runner.calls[0]!;
    expect(args.slice(0, 5)).toEqual(["index", "--repo", identityFor(args).repo, "--rev", REV]);
    expect(args).toContain("--json");
    expect(args[args.indexOf("--version") + 1]).toBe("GMSJ01");
    expect(JSON.parse(args[args.indexOf("--policy-json") + 1]!)).toEqual({
      gatedPaths: ["src/System/MarNameRefGen*.cpp"], scope: { maxForeignHeaders: 3, maxForeignHeaderLines: 25 },
    });
  });

  test("caches per identity and shares one run between concurrent loads", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolveGate) => { release = resolveGate; });
    const runner = fakeRunner(async (args) => {
      await gate;
      return ok(indexJson(identityFor(args)));
    });
    const first = loadReadinessForEpoch({ globals: globals(smsGame()), rev: REV, runner });
    const second = loadReadinessForEpoch({ globals: globals(smsGame()), rev: REV, runner });
    release();
    const [a, b] = await Promise.all([first, second]);
    expect(a.ok && b.ok).toBe(true);
    expect(runner.calls).toHaveLength(1);
    const cached = await loadReadinessForEpoch({ globals: globals(smsGame()), rev: REV, runner });
    expect(cached).toMatchObject({ ok: true, cached: true });
    expect(runner.calls).toHaveLength(1);
    // Another revision is another identity.
    await loadReadinessForEpoch({ globals: globals(smsGame()), rev: NEXT, runner });
    expect(runner.calls).toHaveLength(2);
  });

  test("rejects a response for another revision (stale) and does not cache it", async () => {
    const runner = toolRunner((identity) => ({ ...identity, rev: NEXT }));
    const load = await loadReadinessForEpoch({ globals: globals(smsGame()), rev: REV, runner });
    expect(load).toMatchObject({ ok: false, kind: "identity_mismatch" });
    await loadReadinessForEpoch({ globals: globals(smsGame()), rev: REV, runner });
    expect(runner.calls).toHaveLength(2);
  });

  test("a runner that never answers times out without throwing", async () => {
    const runner = fakeRunner(() => new Promise<CommandResult>(() => {}));
    const load = await loadReadinessForEpoch({ globals: globals(smsGame()), rev: REV, runner, timeoutMs: 20 });
    expect(load).toMatchObject({ ok: false, kind: "timeout" });
  });

  test("maps the tool's exit-2 error kinds (missing objects, missing map, bad rev)", async () => {
    for (const kind of ["missing_objects", "missing_map", "bad_rev"] as const) {
      clearReadinessCache();
      const runner = fakeRunner(() => ({ exitCode: 2, stdout: "", stderr: JSON.stringify({ error: kind, detail: "build/GMSJ01/obj missing" }) }));
      const load = await loadReadinessForEpoch({ globals: globals(smsGame()), rev: REV, runner });
      expect(load).toMatchObject({ ok: false, kind });
      if (!load.ok) expect(load.error).toContain("build/GMSJ01/obj missing");
    }
    const crashed = await loadReadinessForEpoch({ globals: globals(smsGame()), rev: NEXT, runner: fakeRunner(() => ({ exitCode: 1, stdout: "", stderr: "Traceback" })) });
    expect(crashed).toMatchObject({ ok: false, kind: "tool_failed" });
  });

  test("a failed load is remembered briefly instead of rerunning the tool every iteration", async () => {
    const runner = fakeRunner(() => ({ exitCode: 2, stdout: "", stderr: JSON.stringify({ error: "missing_objects", detail: "x" }) }));
    await loadReadinessForEpoch({ globals: globals(smsGame()), rev: REV, runner });
    const again = await loadReadinessForEpoch({ globals: globals(smsGame()), rev: REV, runner });
    expect(again).toMatchObject({ ok: false, kind: "missing_objects" });
    expect(runner.calls).toHaveLength(1);
  });

  test("an index with the right revision but any other wrong identity field is rejected", async () => {
    const tampering: Record<string, (identity: Record<string, string>) => Record<string, unknown>> = {
      repo: (identity) => ({ ...identity, repo: "/elsewhere/sms" }),
      version: (identity) => ({ ...identity, version: "GMSE01" }),
      target_stamp: (identity) => ({ ...identity, target_stamp: "0".repeat(16) }),
      map_sha: (identity) => ({ ...identity, map_sha: "f".repeat(64) }),
      policy_hash: (identity) => ({ ...identity, policy_hash: readinessPolicyHash({ gatedPaths: [] }) }),
    };
    for (const [field, tamper] of Object.entries(tampering)) {
      clearReadinessCache();
      const load = await loadReadinessForEpoch({ globals: globals(smsGame()), rev: REV, runner: toolRunner(tamper) });
      expect(load).toMatchObject({ ok: false, kind: "identity_mismatch" });
      if (!load.ok) expect(load.error).toContain(`${field} expected`);
    }
    for (const field of ["repo", "version", "target_stamp", "map_sha", "policy_hash"]) {
      clearReadinessCache();
      const load = await loadReadinessForEpoch({ globals: globals(smsGame()), rev: REV, runner: toolRunner(({ [field]: _dropped, ...rest }) => rest) });
      expect(load).toMatchObject({ ok: false, kind: "malformed" });
    }
  });

  test("the cache is keyed on the full identity: new target objects or a new map reload", async () => {
    const runner = toolRunner();
    await loadReadinessForEpoch({ globals: globals(smsGame()), rev: REV, runner });
    await loadReadinessForEpoch({ globals: globals(smsGame()), rev: REV, runner });
    expect(runner.calls).toHaveLength(1);
    const later = new Date(Date.now() + 5_000);
    utimesSync(join(repoDir, "build/GMSJ01/obj/Map/MapObj.o"), later, later);
    await loadReadinessForEpoch({ globals: globals(smsGame()), rev: REV, runner });
    expect(runner.calls).toHaveLength(2);
    writeFileSync(mapPath, "map v2\n");
    await loadReadinessForEpoch({ globals: globals(smsGame()), rev: REV, runner });
    expect(runner.calls).toHaveLength(3);
  });

  test("missing inputs fail before the tool runs", async () => {
    const runner = toolRunner();
    const empty = mkdtempSync(join(tmpdir(), "readiness-empty-"));
    try {
      expect(await loadReadinessForEpoch({ globals: { ...globals(smsGame()), repoRoot: empty }, rev: REV, runner })).toMatchObject({ ok: false, kind: "bad_rev" });
      expect(await loadReadinessForEpoch({ globals: globals(smsGame()), rev: "not-a-commit", runner })).toMatchObject({ ok: false, kind: "bad_rev" });
      const other = mkdtempSync(join(tmpdir(), "readiness-nomap-"));
      try {
        const { rev, mapPath: otherMap } = writeReadinessRepo(other);
        rmSync(otherMap);
        expect(await loadReadinessForEpoch({ globals: { ...globals(smsGame()), repoRoot: other }, rev, runner })).toMatchObject({ ok: false, kind: "missing_map" });
        rmSync(join(other, "build"), { recursive: true });
        writeFileSync(otherMap, "map\n");
        expect(await loadReadinessForEpoch({ globals: { ...globals(smsGame()), repoRoot: other }, rev, runner })).toMatchObject({ ok: false, kind: "missing_objects" });
      } finally {
        rmSync(other, { recursive: true, force: true });
      }
      expect(runner.calls).toHaveLength(0);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  test("policy_hash matches readiness.py (sha256 of sorted compact JSON, first 16 hex)", () => {
    // python3 -c 'import hashlib,json;print(hashlib.sha256(json.dumps({"gatedPaths":["src/System/MarNameRefGen*.cpp"],"scope":{"maxForeignHeaders":3,"maxForeignHeaderLines":25}},sort_keys=True,separators=(",",":")).encode()).hexdigest()[:16])'
    expect(readinessPolicyHash({ scope: { maxForeignHeaders: 3, maxForeignHeaderLines: 25 }, gatedPaths: ["src/System/MarNameRefGen*.cpp"] })).toBe("6082f4fa78eafcae");
  });

  test("malformed output is a failure, not a throw", async () => {
    const good = indexJson(identityFor(["--repo", repoDir, "--rev", REV, "--version", "GMSJ01", "--policy-json", "{}"]));
    for (const stdout of ["not json", JSON.stringify({ identity: { rev: REV } }), good.replace('"blocked"', '"maybe"')]) {
      clearReadinessCache();
      const load = await loadReadinessForEpoch({ globals: globals(smsGame()), rev: REV, runner: fakeRunner(() => ok(stdout)) });
      expect(load).toMatchObject({ ok: false, kind: "malformed" });
    }
  });
});

describe("prepareEpochReadiness", () => {
  test("games without active ordering get no readiness (Melee, off)", async () => {
    const runner = toolRunner();
    expect(await prepareEpochReadiness({ globals: globals(), rev: REV, runner })).toBeUndefined();
    expect(await prepareEpochReadiness({ globals: globals(smsGame("off")), rev: REV, runner })).toBeUndefined();
    expect(runner.calls).toHaveLength(0);
  });

  test("rechecks the epoch-start revision after the await and reloads once at the new revision", async () => {
    let current = REV;
    const runner = fakeRunner((args) => {
      current = NEXT; // an integration lands while the first load runs
      return ok(indexJson(identityFor(args)));
    });
    const readiness = await prepareEpochReadiness({ globals: globals(smsGame()), rev: REV, currentRev: () => current, runner });
    expect(readiness?.rev).toBe(NEXT);
    expect(readiness?.load.ok).toBe(true);
    expect(runner.calls.map(revArg)).toEqual([REV, NEXT]);
  });

  test("a revision that keeps moving makes readiness unavailable", async () => {
    let n = 0;
    const revs = [REV, NEXT, THIRD];
    const runner = fakeRunner((args) => {
      n += 1;
      return ok(indexJson(identityFor(args)));
    });
    const readiness = await prepareEpochReadiness({ globals: globals(smsGame()), rev: REV, currentRev: () => revs[n]!, runner });
    expect(readiness?.load).toMatchObject({ ok: false, kind: "identity_mismatch" });
  });

  test("no revision makes readiness unavailable; board options carry the failure for enforce", async () => {
    const readiness = await prepareEpochReadiness({ globals: globals(smsGame()), rev: null });
    expect(readiness?.load).toMatchObject({ ok: false, kind: "no_revision" });
    expect(boardReadinessOptions(readiness)).toMatchObject({
      readinessMode: "enforce",
      readinessGatedPaths: ["src/System/MarNameRefGen*.cpp"],
      readinessUnavailable: expect.stringContaining("no_revision"),
    });
    expect(boardReadinessOptions(undefined)).toBeUndefined();
  });
});

describe("readiness helpers", () => {
  test("parseReadinessIndex accepts the contract shape", () => {
    const identity = identityFor(["--repo", repoDir, "--rev", REV, "--version", "GMSJ01", "--policy-json", "{}"]);
    expect(parseReadinessIndex(JSON.parse(indexJson(identity)))?.functions.size).toBe(2);
    // Every identity field is required.
    for (const field of Object.keys(identity)) {
      const { [field]: _dropped, ...partial } = identity;
      expect(parseReadinessIndex(JSON.parse(indexJson(partial)))).toBeNull();
    }
    expect(parseReadinessIndex({ identity: {}, functions: {} })).toBeNull();
  });

  test("readinessVersion reads the report's build version", () => {
    expect(readinessVersion({ game: smsGame() })).toBe("GMSJ01");
    expect(readinessVersion({})).toBeNull();
  });

  test("waiting-on labels name each class and its undecompiled unit", () => {
    expect(readinessWaitingLabel({
      reason: "not_ready",
      unmet: [{ class: "TKoopa", owner_unit: "main/Enemy/Koopa", kind: "construct" }],
      unresolved: [{ class: "TShared", owner_unit: null, kind: "vtable" }],
    })).toBe("waiting on: TKoopa (Enemy/Koopa, not decompiled), TShared (owner unknown, unresolved)");
    expect(readinessWaitingLabel({ reason: "readiness_unavailable", unmet: [], unresolved: [] })).toBe("waiting on: class readiness (index unavailable)");
  });
});
