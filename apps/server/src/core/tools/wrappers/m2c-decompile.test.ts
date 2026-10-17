import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import { packageRoot } from "@server/core/knowledge/paths.js";
import { FakeSandboxProvider, type SandboxCreateParams, type SandboxHandle } from "@server/core/job-queue/sandbox.js";
import { runRegisteredToolApi, type ToolRuntimeContext } from "../resolver.js";

const WORKSPACE_ROOT = "/sandbox/workspace";

const createParams: SandboxCreateParams = {
  snapshot: "melee-worker-test",
  labels: { game_id: "melee", claim_id: "claim-1" },
  resources: { cpu: 2, memoryGiB: 4, diskGiB: 5 },
  ttlMinutes: 90,
};

function runtimeContext(sandboxHandle?: SandboxHandle, gameId = "melee"): ToolRuntimeContext {
  return {
    repoRoot: WORKSPACE_ROOT,
    stateDir: resolve(packageRoot(), `games/${gameId}/state`),
    game: {
      gameId,
      repoRoot: WORKSPACE_ROOT,
      stateDir: resolve(packageRoot(), `games/${gameId}/state`),
      descriptorPath: resolve(packageRoot(), `games/${gameId}/game.json`),
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

describe("m2c_decompile argument contract", () => {
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

describe("in-sandbox m2c_decompile", () => {
  test("runs decompile.py in the sandbox workspace when the image has m2c's dependencies", async () => {
    const { provider, handle } = await fakeSandbox();
    provider.scriptExec((call) => ({
      exitCode: 0,
      stdout: call.command[0] === "bash" ? JSON.stringify({ status: "ok", c_code: "void f(void) {}" }) : "",
      stderr: "",
    }));
    provider.scriptExec((call) => ({ exitCode: 0, stdout: call.command[0] === "bash" ? JSON.stringify({ status: "ok" }) : "", stderr: "" }));
    provider.scriptExec((call) => ({ exitCode: 0, stdout: call.command[0] === "bash" ? JSON.stringify({ status: "ok" }) : "", stderr: "" }));
    let hostCalls = 0;
    const result = await runRegisteredToolApi(
      runtimeContext(handle),
      "m2c_decomp",
      "decompile.py",
      ["--repo-root", "/elsewhere", ...apiArgs(["--debug"]).slice(2)],
      { runCommand: async () => { hostCalls += 1; return { exitCode: 0, stdout: "{}", stderr: "" }; } },
    );

    expect(hostCalls).toBe(0);
    expect(provider.downloadCalls).toEqual([]);
    // Toolpack readiness (`test -f .ready`) is cached per sandbox id across tests; leave it out.
    const commands = provider.execCalls.filter((call) => call.command[0] !== "test");
    expect(commands.map((call) => call.command[0] === "bash" ? call.command.slice(4) : call.command)).toEqual([
      ["python3", "-c", "import elftools"],
      [
        "/opt/toolpacks/gamecube-decomp/research/m2c_decomp/api/decompile.py",
        "--repo-root", WORKSPACE_ROOT, "--input", "lb_8000F000", "--timeout-seconds", "120", "--extra-arg", "--debug", "--json",
      ],
    ]);
    expect(commands[1]?.opts).toMatchObject({ cwd: WORKSPACE_ROOT, timeoutMs: 300_000, env: { ORCH_GAME_REPO_ROOT: WORKSPACE_ROOT } });
    expect(result).toMatchObject({ parsed: { status: "ok" }, resolved_tool: { execution_surface: "sandbox_workspace" } });

    // The dependency probe (like toolpack readiness) is cached per sandbox; a second call goes straight to the script.
    provider.execCalls.splice(0);
    await runRegisteredToolApi(runtimeContext(handle), "m2c_decomp", "decompile.py", apiArgs());
    expect(provider.execCalls.map((call) => call.command[0])).toEqual(["bash"]);
  });

  test("an image without m2c's dependencies answers prerequisite-missing and never runs on the host", async () => {
    const { provider, handle } = await fakeSandbox();
    provider.scriptExec({ exitCode: 1, stdout: "", stderr: "ModuleNotFoundError: No module named 'elftools'" });
    let hostCalls = 0;
    const result = await runRegisteredToolApi(
      runtimeContext(handle),
      "m2c_decomp",
      "decompile.py",
      apiArgs(),
      { runCommand: async () => { hostCalls += 1; return { exitCode: 0, stdout: "{}", stderr: "" }; } },
    );
    expect(result).toMatchObject({ status: "sandbox_prerequisite_missing", tool: "m2c_decomp", missing: "pyelftools", guidance: expect.stringContaining("Rebuild the worker snapshot") });
    expect(hostCalls).toBe(0);
    expect(provider.execCalls.map((call) => call.command)).toEqual([["python3", "-c", "import elftools"]]);
    expect(provider.downloadCalls).toEqual([]);
  });

  test("applies the same argument contract before probing the sandbox", async () => {
    const { provider, handle } = await fakeSandbox();
    const payload = await runRegisteredToolApi(runtimeContext(handle), "m2c_decomp", "decompile.py", apiArgs(["--write"]));
    expect(payload).toMatchObject({ tool_error: true, error_kind: "sandbox_fetch_contract_rejected" });
    expect(provider.execCalls).toEqual([]);
  });
});
