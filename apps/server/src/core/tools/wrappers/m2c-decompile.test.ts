import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import { packageRoot } from "@server/core/knowledge/paths.js";
import { FakeSandboxProvider, type SandboxCreateParams, type SandboxHandle } from "@server/core/job-queue/sandbox.js";
import { runRegisteredToolApi, type ToolRuntimeContext } from "../resolver.js";

const WORKSPACE_ROOT = "/sandbox/workspace";
const MATCHED_OBJECT = "build/GALE01/obj/melee/lb/lbmemory.o";
const MATCHED_ASM = "build/GALE01/asm/melee/lb/lbmemory.s";
const CONTEXT = "build/ctx.c";

const createParams: SandboxCreateParams = {
  snapshot: "melee-worker-test",
  labels: { game_id: "melee", claim_id: "claim-1" },
  resources: { cpu: 2, memoryGiB: 4, diskGiB: 5 },
  ttlMinutes: 90,
};

function runtimeContext(sandboxHandle?: SandboxHandle): ToolRuntimeContext {
  return {
    repoRoot: WORKSPACE_ROOT,
    stateDir: resolve(packageRoot(), "games/melee/state"),
    game: {
      gameId: "melee",
      repoRoot: WORKSPACE_ROOT,
      stateDir: resolve(packageRoot(), "games/melee/state"),
      descriptorPath: resolve(packageRoot(), "games/melee/game.json"),
    },
    worktreeId: "claim-1",
    claimId: "claim-1",
    ...(sandboxHandle ? { sandboxHandle } : {}),
  };
}

async function fakeSandbox(): Promise<{ provider: FakeSandboxProvider; handle: SandboxHandle }> {
  const provider = new FakeSandboxProvider();
  return { provider, handle: await provider.create(createParams) };
}

function apiArgs(extraArgs: string[] = []): string[] {
  return [
    "--repo-root",
    WORKSPACE_ROOT,
    "--input",
    "lb_8000F000",
    "--timeout-seconds",
    "120",
    ...extraArgs.flatMap((arg) => ["--extra-arg", arg]),
    "--json",
  ];
}

describe("sandbox m2c_decompile fetch-first shim", () => {
  test("discovers in-sandbox, generates missing context, and fetches only the matched object, asm, and ctx", async () => {
    const { provider, handle } = await fakeSandbox();
    await handle.writeFile(`${WORKSPACE_ROOT}/${MATCHED_OBJECT}`, "matched-object");
    await handle.writeFile(`${WORKSPACE_ROOT}/${MATCHED_ASM}`, "matched-assembly");
    provider.scriptExec(
      { exitCode: 0, stdout: "melee/lb/lbmemory.o\n", stderr: "" },
      { exitCode: 1, stdout: "", stderr: "" },
      async () => {
        await handle.writeFile(`${WORKSPACE_ROOT}/${CONTEXT}`, "sandbox-context");
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    );

    let mirrorRoot = "";
    let hostCommand: string[] = [];
    const result = await runRegisteredToolApi(
      runtimeContext(handle),
      "m2c_decomp",
      "decompile.py",
      apiArgs(["--debug"]),
      {
        runCommand: async (_cwd, command) => {
          hostCommand = [...command];
          const repoRootIndex = command.indexOf("--repo-root");
          mirrorRoot = command[repoRootIndex + 1];
          expect(readFileSync(resolve(mirrorRoot, MATCHED_OBJECT), "utf8")).toBe("matched-object");
          expect(readFileSync(resolve(mirrorRoot, MATCHED_ASM), "utf8")).toBe("matched-assembly");
          expect(readFileSync(resolve(mirrorRoot, CONTEXT), "utf8")).toBe("sandbox-context");
          expect(existsSync(resolve(mirrorRoot, "build/GALE01/obj/melee/lb/other.o"))).toBe(false);
          return { exitCode: 0, stdout: JSON.stringify({ status: "ok", no_context: false }), stderr: "" };
        },
      },
    );

    expect(result.tool_error).toBeUndefined();
    expect(result.parsed).toEqual({ status: "ok", no_context: false });
    expect(provider.execCalls).toHaveLength(3);
    expect(provider.execCalls[0].command[0]).toBe("python3");
    expect(provider.execCalls[0].command[1]).toBe("-c");
    expect(provider.execCalls[0].command[2]).toContain("def has_function");
    expect(provider.execCalls[0].command.at(-1)).toBe("lb_8000F000");
    expect(provider.execCalls[0].opts).toEqual({ cwd: WORKSPACE_ROOT, timeoutMs: 120_000, env: undefined });
    expect(provider.execCalls[1]).toMatchObject({
      command: ["test", "-f", CONTEXT],
      opts: { cwd: WORKSPACE_ROOT, timeoutMs: 10_000 },
    });
    expect(provider.execCalls[2]).toMatchObject({
      command: ["python3", "tools/m2ctx/m2ctx.py", "--quiet", "--preprocessor"],
      opts: { cwd: WORKSPACE_ROOT, timeoutMs: 120_000 },
    });
    expect(provider.downloadCalls.map(({ remotePath }) => remotePath)).toEqual([
      `${WORKSPACE_ROOT}/${MATCHED_OBJECT}`,
      `${WORKSPACE_ROOT}/${MATCHED_ASM}`,
      `${WORKSPACE_ROOT}/${CONTEXT}`,
    ]);
    expect(hostCommand[0]).toBe("python3");
    expect(hostCommand[1]).toEndWith("/toolpacks/gamecube-decomp/research/m2c_decomp/api/decompile.py");
    expect(hostCommand).toContain("--prepared-context");
    expect(hostCommand).not.toContain(WORKSPACE_ROOT);
    expect(existsSync(mirrorRoot)).toBe(false);
  });

  test("rejects write, path-bearing, and unrecognized extras as tool errors before sandbox access", async () => {
    const { provider, handle } = await fakeSandbox();
    let hostCalls = 0;

    for (const extraArgs of [
      ["--write"],
      ["../other-context.c"],
      ["--context", "other-context.c"],
      ["--not-a-real-m2c-flag"],
    ]) {
      const payload = await runRegisteredToolApi(
        runtimeContext(handle),
        "m2c_decomp",
        "decompile.py",
        apiArgs(extraArgs),
        {
          runCommand: async () => {
            hostCalls += 1;
            return { exitCode: 0, stdout: "{}", stderr: "" };
          },
        },
      );
      expect(payload.tool_error).toBe(true);
      expect(payload.error_kind).toBe("sandbox_fetch_contract_rejected");
      expect(String(payload.error_summary)).toContain("m2c_decompile");
    }

    expect(provider.execCalls).toEqual([]);
    expect(provider.downloadCalls).toEqual([]);
    expect(hostCalls).toBe(0);
  });

  test("leaves local-class argv and unrestricted extra_args untouched", async () => {
    const args = apiArgs(["--context", "/host/context.c", "--write"]);
    let hostCommand: string[] = [];
    const result = await runRegisteredToolApi(
      runtimeContext(),
      "m2c_decomp",
      "decompile.py",
      args,
      {
        runCommand: async (_cwd, command) => {
          hostCommand = [...command];
          return { exitCode: 0, stdout: JSON.stringify({ status: "ok" }), stderr: "" };
        },
      },
    );

    expect(result.tool_error).toBeUndefined();
    expect(hostCommand.slice(2)).toEqual(args);
    expect(hostCommand).not.toContain("--prepared-context");
  });
});
