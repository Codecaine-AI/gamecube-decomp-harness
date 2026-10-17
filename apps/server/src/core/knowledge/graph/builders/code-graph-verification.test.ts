import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import type { ResolvedGame } from "@server/core/game-registry/resolver.js";
import { openState } from "@server/core/orchestrator-state";
import { clearUnverifiedMatch, recordUnverifiedMatch } from "@server/core/harness-runtime/run-state/unverified-matches.js";
import { workerPrompt } from "@server/core/agent-catalog/agents/running/worker/prompt.js";
import { runKnowledgeGraphRebuild } from "../../jobs/kg.js";
import { openKnowledgeGraph } from "../db.js";
import { fileGraphCard } from "../queries/file-card.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const SOURCE = "src/MarioUtil/Foo.cpp";
const UNIT = "main/MarioUtil/Foo";

/**
 * An SMS-shaped checkout whose one file scores 100% on every function, a
 * temporary run state dir, and a steering-gated game pointing at both. The
 * report never changes between rebuilds: only the verification state does.
 */
function fixture(steeringGate: "off" | "enforce", units: { report?: string; hold?: string } = {}) {
  // `report`: the objdiff unit the report and graph carry; `hold`: the unit the steering rows carry.
  const reportUnit = units.report ?? UNIT;
  const holdUnit = units.hold ?? reportUnit;
  const root = mkdtempSync(join(tmpdir(), "kg-code-graph-verification-"));
  tempDirs.push(root);
  const repoRoot = join(root, "repo");
  const stateDir = join(root, "state");
  const gameDir = join(root, "game");
  mkdirSync(join(repoRoot, "build/GMSJ01"), { recursive: true });
  mkdirSync(gameDir, { recursive: true });
  writeFileSync(join(repoRoot, "build/GMSJ01/report.json"), JSON.stringify({
    units: [{
      name: reportUnit,
      metadata: { source_path: SOURCE },
      functions: [
        { name: "Real__3FooFv", size: 64, fuzzy_match_percent: 100, metadata: { virtual_address: 0x80001000 } },
        { name: "Steered__3FooFv", size: 96, fuzzy_match_percent: 100, metadata: { virtual_address: 0x80001040 } },
      ],
    }],
  }));
  writeFileSync(join(repoRoot, "objdiff.json"), JSON.stringify({ units: [{ name: reportUnit, metadata: { source_path: SOURCE } }] }));
  // A committed checkout: a clear credits the graph only at its certifying revision or a descendant.
  const git = (...args: string[]) => {
    const result = Bun.spawnSync(["git", "-C", repoRoot, ...args], { stdout: "pipe", stderr: "pipe" });
    if (result.exitCode !== 0) throw new Error(result.stderr.toString());
    return result.stdout.toString().trim();
  };
  git("init", "-q");
  git("-c", "user.email=fixture@example.com", "-c", "user.name=Fixture", "commit", "-q", "--allow-empty", "-m", "report source");
  const head = git("rev-parse", "HEAD");
  openState(stateDir).db.close();
  const game = {
    gameId: "sms",
    gameDir,
    matching: { stackFramePolicy: "stop_at_frame", steeringGate },
    validation: { reportPath: "build/GMSJ01/report.json" },
  } as unknown as ResolvedGame;
  const globals: GlobalArgs = {
    repoRoot,
    stateDir,
    game,
    gameId: "sms",
    dryRunAgents: false,
    provider: "test",
    model: "test",
    thinkingLevel: "low",
  };
  const graphDb = join(root, "graph.sqlite");
  // The epoch boundary's in-process rebuild path, reading the state dir read-only (no caller-held store).
  const rebuild = () => runKnowledgeGraphRebuild(
    globals,
    new Map<string, string | true>([["--graph-db", graphDb], ["--sources", "code_graph"]]),
    { rebuildInProcess: true },
  );
  const card = (options: Parameters<typeof fileGraphCard>[2] = {}) => {
    const store = openKnowledgeGraph(graphDb);
    try { return fileGraphCard(store, SOURCE, options); }
    finally { store.db.close(); }
  };
  const recordSteered = () => {
    const store = openState(stateDir);
    try {
      recordUnverifiedMatch(store, {
        gameId: "sms", unit: holdUnit, symbol: "Steered__3FooFv", analyzedRev: "a".repeat(40), baseRev: "b".repeat(40),
        sourcePath: SOURCE, match: { base: 91, candidate: 100, real_only: 94 }, reasons: ["unexplained edit"],
      });
    } finally { store.db.close(); }
  };
  const clearSteered = () => {
    const store = openState(stateDir);
    try { clearUnverifiedMatch(store, { gameId: "sms", unit: holdUnit, symbol: "Steered__3FooFv", clearedBy: "test:certified", clearedRev: head }); }
    finally { store.db.close(); }
  };
  const workerContext = (target: Record<string, unknown>) => workerPrompt({
    packet: { target: { unit: UNIT, source_path: SOURCE, ...target }, knowledge_context: { graph_db: graphDb } },
    repoRoot,
    stateDir,
    initialBoardPath: join(stateDir, "board.json"),
    workerLogDir: join(stateDir, "workers"),
    steeringGate,
  }).kernelContext?.renderedContext ?? "";
  return { rebuild, card, recordSteered, clearSteered, workerContext, holdUnit };
}

describe("code graph verification state", () => {
  test("a rebuild of the same report follows the active unverified_match state into the file card and worker context", async () => {
    const sms = fixture("enforce");

    await sms.rebuild();
    expect(sms.card().editability.mode).toBe("read_only_complete");

    sms.recordSteered();
    await sms.rebuild();
    const card = sms.card();
    expect(card.editability.mode).toBe("editable");
    expect(card.editability.reason).toContain("100% but unverified");
    expect(card.match_status).toMatchObject({ function_count: 2, matched_function_count: 1, unmatched_function_count: 1, unverified_function_count: 1 });
    // Labels and counts only: the raw score stays the report's honest 100.
    expect(card.functions.find((fn) => fn.symbol === "Steered__3FooFv")).toMatchObject({ fuzzy: 100, verification: "unverified_match" });
    expect(card.functions.find((fn) => fn.symbol === "Real__3FooFv")).not.toHaveProperty("verification");
    expect(card.match_status.unmatched_functions).toEqual([expect.objectContaining({ symbol: "Steered__3FooFv" })]);

    const context = sms.workerContext({ symbol: "Steered__3FooFv" });
    expect(context).toContain('<editability mode="editable"');
    expect(context).not.toContain("use as reference evidence only");

    // Only a certified clear makes the file complete again.
    sms.clearSteered();
    await sms.rebuild();
    expect(sms.card().editability.mode).toBe("read_only_complete");
  });

  test("SMS: a short-unit hold labels the module-prefixed report function and keeps its file editable", async () => {
    // The report names the unit `mario/MarioUtil/Foo`; the steering row names it `MarioUtil/Foo`.
    const sms = fixture("enforce", { report: "mario/MarioUtil/Foo", hold: "MarioUtil/Foo" });
    sms.recordSteered();
    await sms.rebuild();
    const card = sms.card();
    expect(card.editability.mode).toBe("editable");
    expect(card.match_status).toMatchObject({ matched_function_count: 1, unmatched_function_count: 1, unverified_function_count: 1 });
    expect(card.functions.find((fn) => fn.symbol === "Steered__3FooFv")).toMatchObject({ unit: "mario/MarioUtil/Foo", fuzzy: 100, verification: "unverified_match" });
    expect(card.functions.find((fn) => fn.symbol === "Real__3FooFv")).not.toHaveProperty("verification");
  });

  test("SMS: the live overlay matches a short-unit ref to a stored module-prefixed card; Melee compares as written", async () => {
    const sms = fixture("enforce", { report: "mario/MarioUtil/Foo", hold: "MarioUtil/Foo" });
    // Built before the row was recorded: the stored card calls the file complete.
    await sms.rebuild();
    expect(sms.card().editability.mode).toBe("read_only_complete");
    const refs = [{ unit: "MarioUtil/Foo", symbol: "Steered__3FooFv" }];

    const overlaid = sms.card({ unverifiedMatches: refs, game: "sms" });
    expect(overlaid.editability.mode).toBe("editable");
    expect(overlaid.match_status).toMatchObject({ function_count: 2, matched_function_count: 1, unmatched_function_count: 1, unverified_function_count: 1 });
    expect(overlaid.functions.find((fn) => fn.symbol === "Steered__3FooFv")).toMatchObject({ unit: "mario/MarioUtil/Foo", verification: "unverified_match" });

    // A game without module prefixes: the short ref names no unit of this card.
    expect(sms.card({ unverifiedMatches: refs, game: "melee" }).editability.mode).toBe("read_only_complete");
  });

  test("gate off (Melee): the state is never read and the scores alone decide", async () => {
    const melee = fixture("off");
    melee.recordSteered();

    await melee.rebuild();

    const card = melee.card();
    expect(card.editability.mode).toBe("read_only_complete");
    expect(card.match_status).toMatchObject({ matched_function_count: 2, unmatched_function_count: 0 });
    expect(card.match_status).not.toHaveProperty("unverified_function_count");
    expect(card.functions.some((fn) => "verification" in fn)).toBe(false);
  });
});
