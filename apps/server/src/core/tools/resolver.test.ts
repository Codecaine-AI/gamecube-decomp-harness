import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import { packageRoot } from "@server/core/knowledge/paths";
import {
  registeredToolIdsForContext,
  resolveRegisteredTool,
} from "./resolver.js";

describe("toolpack runtime resolver", () => {
  test("resolves Melee game bindings into shared data and worktree cache roots", () => {
    const root = packageRoot();
    const context = {
      game: {
        gameId: "melee",
        repoRoot: resolve(root, "games/melee/checkout"),
        stateDir: resolve(root, "games/melee/state"),
        descriptorPath: resolve(root, "games/melee/game.json"),
      },
      worktreeId: "lease-a",
    };

    const tool = resolveRegisteredTool(context, "ghidra");

    expect(tool.toolpackId).toBe("gamecube-decomp");
    expect(tool.toolRoot).toBe(resolve(root, "toolpacks/gamecube-decomp/research/ghidra"));
    expect(tool.apiRoot).toBe(resolve(root, "toolpacks/gamecube-decomp/research/ghidra/api"));
    expect(tool.bindingPath).toBe(resolve(root, "games/melee/tool-bindings/ghidra.json"));
    expect(tool.sharedDataRoot).toBe(resolve(root, "games/melee/shared/tool-data/ghidra"));
    expect(tool.worktreeCacheRoot).toBe(resolve(root, "games/melee/worktrees/lease-a/tool-cache/ghidra"));
    expect(tool.env.ORCH_TOOL_SHARED_DATA_ROOT).toBe(tool.sharedDataRoot);
    expect(tool.env.ORCH_TOOL_WORKTREE_CACHE_ROOT).toBe(tool.worktreeCacheRoot);
    expect(tool.env.ORCH_TOOL_IMPL_ROOT).toBe(resolve(root, "toolpacks/gamecube-decomp/_impl/gamecube"));
  });

  test("reads registered ids from the game-enabled toolpack", () => {
    const ids = registeredToolIdsForContext({
      game: {
        gameId: "melee",
        descriptorPath: resolve(packageRoot(), "games/melee/game.json"),
      },
    });

    expect(ids.has("checkdiff")).toBe(true);
    expect(ids.has("mwcc_debug")).toBe(true);
    expect(ids.has("asm_window_search")).toBe(true);
    expect(ids.has("type_layout_lookup")).toBe(true);
    expect(ids.has("not_a_tool")).toBe(false);
  });

  test("resolves the new research tool bindings", () => {
    const root = packageRoot();
    const context = {
      game: {
        gameId: "melee",
        repoRoot: resolve(root, "games/melee/checkout"),
        stateDir: resolve(root, "games/melee/state"),
        descriptorPath: resolve(root, "games/melee/game.json"),
      },
      worktreeId: "lease-layout",
    };

    const asmSearch = resolveRegisteredTool(context, "asm_window_search");
    const typeLayout = resolveRegisteredTool(context, "type_layout_lookup");

    expect(asmSearch.toolRoot).toBe(resolve(root, "toolpacks/gamecube-decomp/research/asm_window_search"));
    expect(asmSearch.sharedDataRoot).toBe(resolve(root, "games/melee/shared/tool-data/asm_window_search"));
    expect(typeLayout.toolRoot).toBe(resolve(root, "toolpacks/gamecube-decomp/research/type_layout_lookup"));
    expect(typeLayout.worktreeCacheRoot).toBe(resolve(root, "games/melee/worktrees/lease-layout/tool-cache/type_layout_lookup"));
  });

  test("resolves a non-Melee fixture without reading Melee bindings or data", () => {
    const gameDir = mkdtempSync(join(tmpdir(), "gamecube-tool-fixture-"));
    mkdirSync(join(gameDir, "tool-bindings"), { recursive: true });
    writeFileSync(
      join(gameDir, "game.json"),
      `${JSON.stringify(
        {
          id: "sunshine",
          repoRoot: "./checkout",
          stateDir: "./state",
          tools: {
            toolpacks: ["gamecube-decomp"],
            bindingsRoot: "./tool-bindings",
            sharedDataRoot: "./shared/tool-data",
            worktreeCacheRoot: "./worktrees/{worktree_id}/tool-cache",
          },
        },
        null,
        2,
      )}\n`,
    );
    writeFileSync(
      join(gameDir, "tool-bindings/checkdiff.json"),
      `${JSON.stringify({ tool: "checkdiff", enabled: false }, null, 2)}\n`,
    );
    writeFileSync(
      join(gameDir, "tool-bindings/type_oracle.json"),
      `${JSON.stringify({ tool: "type_oracle", overrideApiRoot: "overrides/type_oracle/api" }, null, 2)}\n`,
    );

    const context = {
      game: {
        gameId: "sunshine",
        repoRoot: join(gameDir, "checkout"),
        stateDir: join(gameDir, "state"),
        descriptorPath: join(gameDir, "game.json"),
      },
      worktreeId: "parallel-1",
    };

    const ghidra = resolveRegisteredTool(context, "ghidra");
    expect(ghidra.gameId).toBe("sunshine");
    expect(ghidra.sharedDataRoot).toBe(join(gameDir, "shared/tool-data/ghidra"));
    expect(ghidra.worktreeCacheRoot).toBe(join(gameDir, "worktrees/parallel-1/tool-cache/ghidra"));
    expect(ghidra.bindingPath).toBe(join(gameDir, "tool-bindings/ghidra.json"));
    expect(ghidra.binding.enabled).toBe(true);

    const disabled = resolveRegisteredTool(context, "checkdiff");
    expect(disabled.enabled).toBe(false);

    const override = resolveRegisteredTool(context, "type_oracle");
    expect(override.apiRoot).toBe(join(gameDir, "overrides/type_oracle/api"));
  });

  test("exports the platform-specific state wibo for an explicit execution target", () => {
    const gameDir = mkdtempSync(join(tmpdir(), "gamecube-tool-platform-fixture-"));
    const stateDir = join(gameDir, "state");
    mkdirSync(join(stateDir, "tools"), { recursive: true });
    writeFileSync(
      join(gameDir, "game.json"),
      `${JSON.stringify({ id: "sunshine", repoRoot: "./checkout", stateDir: "./state", tools: { toolpacks: ["gamecube-decomp"] } }, null, 2)}\n`,
    );
    writeFileSync(join(stateDir, "tools/wibo"), "legacy host artifact");
    writeFileSync(join(stateDir, "tools/wibo-linux-x86_64"), "linux artifact");
    const original = process.env.ORCH_TOOL_PLATFORM;
    delete process.env.ORCH_TOOL_PLATFORM;
    try {
      const tool = resolveRegisteredTool(
        {
          game: {
            gameId: "sunshine",
            repoRoot: join(gameDir, "checkout"),
            stateDir,
            descriptorPath: join(gameDir, "game.json"),
          },
          toolPlatform: "linux-x86_64",
        },
        "ghidra",
      );

      expect(tool.env.MWCC_WIBO).toBe(join(stateDir, "tools/wibo-linux-x86_64"));
    } finally {
      if (original === undefined) delete process.env.ORCH_TOOL_PLATFORM;
      else process.env.ORCH_TOOL_PLATFORM = original;
    }
  });

  test("rejects unknown tools", () => {
    expect(() => resolveRegisteredTool({}, "missing_tool")).toThrow("Unknown tool id missing_tool");
  });
});
