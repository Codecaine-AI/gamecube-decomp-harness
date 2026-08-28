import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import { packageRoot } from "@server/core/knowledge/paths";
import { runKnowledgeGraphRebuild, runKnowledgeMaintenance, type KnowledgeMaintenanceOptions } from "./kg.js";
import { STATE_MIGRATION_MODE_ENV } from "@server/core/orchestrator-state/storage/store.js";
import { borrowState, openState } from "@server/core/orchestrator-state";

const globals: GlobalArgs = {
  repoRoot: "/tmp/kg-rebuild-repo",
  stateDir: "/tmp/kg-rebuild-state",
  graphDbPath: "/tmp/kg-rebuild-default.sqlite",
  dryRunAgents: false,
  provider: "test",
  model: "test",
  thinkingLevel: "low",
};

function fakeProcess(exitCode: number, stdout = "{}", stderr = "") {
  return {
    stdout: new Blob([stdout]).stream(),
    stderr: new Blob([stderr]).stream(),
    exited: Promise.resolve(exitCode),
    kill: () => {},
  };
}

describe("runKnowledgeGraphRebuild", () => {
  test("spawns the rebuild CLI with the in-process recursion guard and rebuild inputs", async () => {
    let spawnedCommand: string[] | undefined;
    let spawnedOptions: Record<string, unknown> | undefined;
    const spawn = ((command: string[], options: Record<string, unknown>) => {
      spawnedCommand = command;
      spawnedOptions = options;
      return fakeProcess(0, JSON.stringify({ graph_db: "/tmp/custom-graph.sqlite", stamped: true }));
    }) as unknown as typeof Bun.spawn;
    const args = new Map<string, string | true>([
      ["--graph-db", "/tmp/custom-graph.sqlite"],
      ["--sources", "ledger,past_prs"],
      ["--agent-state-enrichment", "/tmp/agent.jsonl"],
      ["--knowledge-curator-enrichment", "/tmp/curator.jsonl"],
    ]);

    const result = await runKnowledgeGraphRebuild(globals, args, { rebuildSpawn: spawn });

    expect(spawnedCommand).toEqual([
      "bun",
      "apps/server/src/job-runner.ts",
      "kg-rebuild-graph",
      "--repo-root",
      globals.repoRoot,
      "--graph-db",
      "/tmp/custom-graph.sqlite",
      "--sources",
      "ledger,past_prs",
      "--agent-state-enrichment",
      "/tmp/agent.jsonl",
      "--knowledge-curator-enrichment",
      "/tmp/curator.jsonl",
      "--rebuild-in-process",
    ]);
    expect(spawnedOptions).toMatchObject({ cwd: packageRoot(), stdout: "pipe", stderr: "pipe" });
    expect((spawnedOptions?.env as Record<string, string>)[STATE_MIGRATION_MODE_ENV]).toBe("verify");
    expect(result).toEqual({ graph_db: "/tmp/custom-graph.sqlite", stamped: true });
  });

  test("fails when the rebuild CLI exits nonzero", async () => {
    const spawn = (() => fakeProcess(9, "", "sqlite failed")) as unknown as typeof Bun.spawn;

    await expect(runKnowledgeGraphRebuild(globals, new Map(), { rebuildSpawn: spawn })).rejects.toThrow(
      "Knowledge graph rebuild failed (9)",
    );
  });

  test("keeps an injected in-process rebuild path for tests and the standalone CLI", async () => {
    let rebuildInput: Record<string, unknown> | undefined;
    const rebuildGraph = ((input: Record<string, unknown>) => {
      rebuildInput = input;
      return { graph_db: input.dbPath, knowledge_graph_metadata: { report_provenance: "stamped" } };
    }) as unknown as NonNullable<KnowledgeMaintenanceOptions["rebuildGraph"]>;

    const result = await runKnowledgeGraphRebuild(
      globals,
      new Map([["--sources", "ledger"]]),
      { rebuildInProcess: true, rebuildGraph },
    );

    expect(rebuildInput).toMatchObject({
      repoRoot: globals.repoRoot,
      dbPath: globals.graphDbPath,
      sources: ["ledger"],
    });
    expect(result).toMatchObject({
      knowledge_graph_metadata: { report_provenance: "stamped" },
    });
  });
});

describe("runKnowledgeMaintenance StateStore ownership", () => {
  test("a maintenance pass cannot close the run-loop owner", async () => {
    const root = mkdtempSync(join(tmpdir(), "kg-maintenance-store-"));
    const stateDir = join(root, "state");
    const owner = openState(stateDir);
    try {
      await runKnowledgeMaintenance(
        { ...globals, repoRoot: root, stateDir },
        new Map<string, string | true>([
          ["--knowledge-curator-enrichment", join(root, "curator.jsonl")],
          ["--no-pr-index", true],
          ["--no-rebuild", true],
          ["--no-tool-index", true],
          ["--no-tool-runners", true],
          ["--pr-limit", "0"],
          ["--worker-limit", "0"],
        ]),
        { stateStore: borrowState(owner) },
      );

      expect(owner.db.query("SELECT 1 AS value").get()).toEqual({ value: 1 });
    } finally {
      owner.db.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
