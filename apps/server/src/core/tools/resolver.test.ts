import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import { packageRoot } from "@server/core/knowledge/paths";
import { FakeSandboxProvider, type SandboxCreateParams, type SandboxHandle } from "@server/core/job-queue/sandbox.js";
import {
  registeredToolIdsForContext,
  resolveRegisteredTool,
  runRegisteredToolApi,
} from "./resolver.js";

const createParams: SandboxCreateParams = {
  snapshot: "workspace-tool-test",
  labels: { game_id: "melee" },
  resources: { cpu: 2, memoryGiB: 4, diskGiB: 5 },
  ttlMinutes: 30,
};
let sandboxSequence = 0;

async function fakeSandbox(): Promise<{ provider: FakeSandboxProvider; handle: SandboxHandle }> {
  const provider = new FakeSandboxProvider();
  const handle = await provider.create(createParams);
  return {
    provider,
    handle: { ...handle, sandboxId: `workspace-routing-${++sandboxSequence}` },
  };
}

function apiContext(sandboxHandle?: SandboxHandle) {
  const root = packageRoot();
  return {
    repoRoot: "/opt/melee",
    stateDir: resolve(root, "games/melee/state"),
    game: {
      gameId: "melee",
      repoRoot: "/opt/melee",
      stateDir: resolve(root, "games/melee/state"),
      descriptorPath: resolve(root, "games/melee/game.json"),
    },
    worktreeId: "claim-workspace",
    ...(sandboxHandle ? { sandboxHandle } : {}),
  };
}

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

  test("routes workspace-coupled APIs through the sandbox", async () => {
    const { provider, handle } = await fakeSandbox();
    provider.scriptExec(
      { exitCode: 0, stdout: "", stderr: "" },
      { exitCode: 0, stdout: JSON.stringify({ status: "ok" }), stderr: "" },
    );

    const result = await runRegisteredToolApi(
      apiContext(handle),
      "checkdiff",
      "run.py",
      ["--timeout-seconds", "45", "--json"],
    );

    expect(provider.execCalls).toHaveLength(2);
    expect(provider.execCalls[0]).toMatchObject({
      command: ["test", "-f", "/opt/toolpacks/gamecube-decomp/.ready"],
      opts: { timeoutMs: 10_000 },
    });
    expect(provider.execCalls[1]).toMatchObject({
      command: [
        "bash",
        "-lc",
        'mkdir -p "$ORCH_TOOL_SHARED_DATA_ROOT" "$ORCH_TOOL_WORKTREE_CACHE_ROOT" && exec python3 "$@"',
        "--",
        "/opt/toolpacks/gamecube-decomp/validation/checkdiff/api/run.py",
        "--timeout-seconds",
        "45",
        "--json",
      ],
      opts: {
        cwd: "/opt/melee",
        timeoutMs: 225_000,
        env: {
          ORCH_GAME_REPO_ROOT: "/opt/melee",
          ORCH_TOOL_IMPL_ROOT: "/opt/toolpacks/gamecube-decomp/_impl/gamecube",
          MWCC_WIBO: "/opt/melee/build/tools/wibo",
        },
      },
    });
    expect(provider.execCalls[1]?.opts.env).not.toHaveProperty("ORCH_GAME_STATE_DIR");
    expect(provider.execCalls[1]?.opts.env).not.toHaveProperty("ORCH_TOOL_BINDING_PATH");
    expect(result).toMatchObject({
      operation: "tool:checkdiff:run.py",
      parsed: { status: "ok" },
      resolved_tool: { execution_surface: "sandbox_workspace" },
    });
  });

  test("keeps the host command path when no sandbox is present", async () => {
    let hostCall: { cwd: string; command: string[]; env?: Record<string, string | undefined> } | undefined;
    const result = await runRegisteredToolApi(
      apiContext(),
      "checkdiff",
      "run.py",
      ["--json"],
      {
        runCommand: async (cwd, command, options) => {
          hostCall = { cwd, command: [...command], env: options?.env };
          return { exitCode: 0, stdout: JSON.stringify({ status: "host" }), stderr: "" };
        },
      },
    );

    expect(hostCall?.cwd).toBe(packageRoot());
    expect(hostCall?.command[0]).toBe("python3");
    expect(hostCall?.command[1]).toEndWith("/toolpacks/gamecube-decomp/validation/checkdiff/api/run.py");
    expect(hostCall?.command.slice(2)).toEqual(["--json"]);
    expect(result.parsed).toEqual({ status: "host" });
  });

  test("keeps non-surfaced mwcc_debug and review_lint scripts on the host", async () => {
    const { provider, handle } = await fakeSandbox();
    const hostCommands: string[][] = [];
    const runCommand = async (_cwd: string, command: string[]) => {
      hostCommands.push([...command]);
      return { exitCode: 0, stdout: "{}", stderr: "" };
    };

    await runRegisteredToolApi(apiContext(handle), "mwcc_debug", "lookup_dump.py", ["--json"], { runCommand });
    await runRegisteredToolApi(apiContext(handle), "review_lint", "scan.py", ["--json"], { runCommand });

    expect(provider.execCalls).toEqual([]);
    expect(hostCommands).toHaveLength(2);
    expect(hostCommands[0]?.[1]).toEndWith("/compiler/mwcc_debug/api/lookup_dump.py");
    expect(hostCommands[1]?.[1]).toEndWith("/source_editing/review_lint/api/scan.py");
  });

  test("returns a structured missing-toolpack result without running the script", async () => {
    const { provider, handle } = await fakeSandbox();
    provider.scriptExec({ exitCode: 1, stdout: "", stderr: "missing" });
    let hostCalls = 0;

    const result = await runRegisteredToolApi(
      apiContext(handle),
      "checkdiff",
      "run.py",
      ["--json"],
      {
        runCommand: async () => {
          hostCalls += 1;
          return { exitCode: 0, stdout: "{}", stderr: "" };
        },
      },
    );

    expect(result).toMatchObject({
      status: "sandbox_toolpack_missing",
      tool_id: "checkdiff",
      script_path: "/opt/toolpacks/gamecube-decomp/validation/checkdiff/api/run.py",
      resolved_tool: { execution_surface: "sandbox_workspace" },
    });
    expect(provider.execCalls).toHaveLength(1);
    expect(hostCalls).toBe(0);
  });
});
