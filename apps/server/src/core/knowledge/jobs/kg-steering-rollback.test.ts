import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import type { ResolvedGame } from "@server/core/game-registry/resolver.js";
import { openState } from "@server/core/orchestrator-state";
import { recordSteeringBackfill, recordSteeringCoverage, recordSteeringRollback } from "@server/core/harness-runtime/run-state/steering.js";
import { openKnowledgeGraph } from "../graph/db.js";
import { fileGraphCard } from "../graph/queries/file-card.js";
import { graphFileCard } from "@server/core/tools/runtime/execution.js";
import type { AgentToolRuntimeContext } from "@server/core/tools/types.js";
import { runKnowledgeGraphRebuild } from "./kg.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const SOURCE = "src/MarioUtil/Foo.cpp";
const UNIT = "main/MarioUtil/Foo";
const ROLLED = "Steered__3FooFv";

function git(root: string, args: string[]): string {
  const result = Bun.spawnSync(["git", "-C", root, ...args], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString().trim();
}

/**
 * An SMS-shaped checkout whose one file reports 100% on every function,
 * committed as HEAD, with a sibling commit HEAD does not contain, and a
 * steering-gated game whose `Steered__3FooFv` was rolled back with no
 * `unverified_match` row. Only the certification state changes between rebuilds.
 */
function fixture(options: { rollBack?: boolean } = {}) {
  const root = mkdtempSync(join(tmpdir(), "kg-steering-rollback-"));
  tempDirs.push(root);
  const repoRoot = join(root, "repo");
  const stateDir = join(root, "state");
  const gameDir = join(root, "game");
  mkdirSync(join(repoRoot, "build/GMSJ01"), { recursive: true });
  mkdirSync(gameDir, { recursive: true });
  writeFileSync(join(repoRoot, "build/GMSJ01/report.json"), JSON.stringify({
    units: [{
      name: UNIT,
      metadata: { source_path: SOURCE },
      functions: [
        { name: "Real__3FooFv", size: 64, fuzzy_match_percent: 100, metadata: { virtual_address: 0x80001000 } },
        { name: ROLLED, size: 96, fuzzy_match_percent: 100, metadata: { virtual_address: 0x80001040 } },
      ],
    }],
  }));
  writeFileSync(join(repoRoot, "objdiff.json"), JSON.stringify({ units: [{ name: UNIT, metadata: { source_path: SOURCE } }] }));
  git(repoRoot, ["init", "-q", "-b", "main"]);
  git(repoRoot, ["config", "user.email", "fixture@example.com"]);
  git(repoRoot, ["config", "user.name", "Fixture"]);
  git(repoRoot, ["add", "."]);
  git(repoRoot, ["commit", "-qm", "reported"]);
  const head = git(repoRoot, ["rev-parse", "HEAD"]);
  git(repoRoot, ["checkout", "-qb", "side"]);
  git(repoRoot, ["commit", "-q", "--allow-empty", "-m", "elsewhere"]);
  const elsewhere = git(repoRoot, ["rev-parse", "HEAD"]);
  git(repoRoot, ["checkout", "-q", "main"]);

  const rollBack = () => {
    const store = openState(stateDir);
    try {
      const id = recordSteeringRollback(store, {
        gameId: "sms", unit: UNIT, symbol: ROLLED, analyzedRev: head, baseRev: head,
        initialVerdict: "steering_located", finalVerdict: "pass", rules: ["steering"], report: {}, status: "reverified",
      });
      store.db.query("UPDATE steering_rollbacks SET recorded_at = ?, updated_at = ? WHERE id = ?")
        .run("2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z", id);
    } finally {
      store.db.close();
    }
  };
  if (options.rollBack ?? true) rollBack();
  else openState(stateDir).db.close();
  // The descriptor resolves the gate for the agent tool runtime (not under a games/ registry).
  const descriptorPath = join(gameDir, "game.json");
  writeFileSync(descriptorPath, JSON.stringify({ matching: { steeringGate: "enforce" } }));

  const globals: GlobalArgs = {
    repoRoot,
    stateDir,
    game: {
      gameId: "sms",
      gameDir,
      matching: { stackFramePolicy: "stop_at_frame", steeringGate: "enforce" },
      validation: { reportPath: "build/GMSJ01/report.json" },
    } as unknown as ResolvedGame,
    gameId: "sms",
    dryRunAgents: false,
    provider: "test",
    model: "test",
    thinkingLevel: "low",
  };
  const graphDb = join(root, "graph.sqlite");
  const rebuild = () => runKnowledgeGraphRebuild(
    globals,
    new Map<string, string | true>([["--graph-db", graphDb], ["--sources", "code_graph"]]),
    { rebuildInProcess: true },
  );
  const card = () => {
    const graph = openKnowledgeGraph(graphDb);
    try { return fileGraphCard(graph, SOURCE); }
    finally { graph.db.close(); }
  };
  /** A clean certified backfill pass of the rolled-back function at `rev`, recorded after the rollback. */
  const certifyAt = (rev: string) => {
    const state = openState(stateDir);
    try {
      recordSteeringBackfill(state, { gameId: "sms", unit: UNIT, symbol: ROLLED, analyzedRev: rev, verdict: "pass" });
      recordSteeringCoverage(state, { gameId: "sms", unit: UNIT, analyzedRev: rev, baselineRev: rev, clean: true });
    } finally {
      state.db.close();
    }
  };
  /** The agent's `code_graph_file_card` tool on this checkout and state dir. */
  const toolCard = () => graphFileCard({
    repoRoot, stateDir, game: { gameId: "sms", descriptorPath, graphDbPath: graphDb },
  } as unknown as AgentToolRuntimeContext, SOURCE).file_card as ReturnType<typeof fileGraphCard>;
  return { head, elsewhere, rebuild, card, certifyAt, rollBack, toolCard };
}

describe("knowledge graph steering rollback holds", () => {
  test("an unresolved rollback keeps its file out of complete reference evidence until a certificate is an ancestor of the source revision", async () => {
    const sms = fixture();

    await sms.rebuild();
    let card = sms.card();
    expect(card.editability.mode).toBe("editable");
    expect(card.match_status).toMatchObject({ matched_function_count: 1, unmatched_function_count: 1, unverified_function_count: 1 });
    expect(card.functions.find((fn) => fn.symbol === ROLLED)).toMatchObject({ fuzzy: 100, verification: "unverified_match" });

    // A certificate on a revision the reported checkout does not contain clears nothing.
    sms.certifyAt(sms.elsewhere);
    await sms.rebuild();
    expect(sms.card().editability.mode).toBe("editable");

    sms.certifyAt(sms.head);
    await sms.rebuild();
    card = sms.card();
    expect(card.editability.mode).toBe("read_only_complete");
    expect(card.functions.some((fn) => "verification" in fn)).toBe(false);
  });

  test("the agent's file card overlays a rollback recorded after the graph was built", async () => {
    const sms = fixture({ rollBack: false });
    await sms.rebuild();
    expect(sms.toolCard().editability.mode).toBe("read_only_complete");

    // No rebuild: the stored graph still calls the file complete, the tool must not.
    sms.rollBack();
    expect(sms.card().editability.mode).toBe("read_only_complete");
    const card = sms.toolCard();
    expect(card.editability.mode).toBe("editable");
    expect(card.functions.find((fn) => fn.symbol === ROLLED)).toMatchObject({ verification: "unverified_match" });

    sms.certifyAt(sms.head);
    expect(sms.toolCard().editability.mode).toBe("read_only_complete");
  });
});
