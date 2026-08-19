import { describe, expect, test } from "bun:test";
import { FakeSandboxProvider, type SandboxCreateParams } from "@server/core/job-queue/sandbox.js";
import { packageRoot } from "@server/core/knowledge/paths.js";
import { resolve } from "node:path";
import { runRegisteredToolApi, type ToolRuntimeContext } from "../resolver.js";
import { runSandboxMwccAllocCompare, runSandboxMwccAllocSnapshot } from "./mwcc-alloc.js";

const WORKSPACE_ROOT = "/sandbox/workspace";
const createParams: SandboxCreateParams = {
  snapshot: "melee-worker-test",
  labels: { game_id: "melee", claim_id: "claim-1" },
  resources: { cpu: 2, memoryGiB: 4, diskGiB: 5 },
  ttlMinutes: 90,
};

async function fakeSandbox() {
  const provider = new FakeSandboxProvider();
  return { provider, handle: await provider.create(createParams) };
}

function runtimeContext(sandboxHandle?: Awaited<ReturnType<typeof fakeSandbox>>["handle"]): ToolRuntimeContext {
  const stateDir = resolve(packageRoot(), "games/melee/state");
  return {
    repoRoot: WORKSPACE_ROOT,
    stateDir,
    game: {
      gameId: "melee",
      repoRoot: WORKSPACE_ROOT,
      stateDir,
      descriptorPath: resolve(packageRoot(), "games/melee/game.json"),
    },
    worktreeId: "claim-1",
    claimId: "claim-1",
    ...(sandboxHandle ? { sandboxHandle } : {}),
  };
}

function snapshotArgs(overrides: string[] = []): string[] {
  return ["--repo-root", WORKSPACE_ROOT, "--unit", "src/melee/lb/lbmemory.c", "--function", "lb_8000F000", ...overrides, "--json"];
}

describe("sandbox mwcc allocator wrappers", () => {
  test("returns a non-error status when allocator tools are not provisioned", async () => {
    const { provider, handle } = await fakeSandbox();
    provider.scriptExec({ exitCode: 1, stdout: "", stderr: "" });
    const result = await runSandboxMwccAllocSnapshot({ sandboxHandle: handle, workspaceRoot: WORKSPACE_ROOT, args: snapshotArgs() });
    expect(result).toEqual({
      status: "debug_tools_not_provisioned",
      guidance: "This sandbox image snapshot predates the MWCC allocator tooling; do not retry or treat as a tool error. Continue with checkdiff/mwcc_debug_lookup evidence.",
    });
    expect(provider.execCalls).toHaveLength(1);
  });

  test("composes the capture command and passes JSON through", async () => {
    const { provider, handle } = await fakeSandbox();
    provider.scriptExec(
      { exitCode: 0, stdout: "", stderr: "" },
      { exitCode: 0, stdout: JSON.stringify({ status: "ok", snapshots: ["before.json", "after.json"] }), stderr: "" },
    );
    const result = await runSandboxMwccAllocSnapshot({
      sandboxHandle: handle,
      workspaceRoot: WORKSPACE_ROOT,
      args: snapshotArgs(["--capture", "pair", "--timeout-seconds", "120"]),
    });
    expect(provider.execCalls[0]).toMatchObject({
      command: ["test", "-f", "build/tools/mwcc-alloc/mwcc_alloc_capture.py"],
      opts: { cwd: WORKSPACE_ROOT, timeoutMs: 10_000 },
    });
    expect(provider.execCalls[1]).toMatchObject({
      command: ["python3", "build/tools/mwcc-alloc/mwcc_alloc_capture.py", "--unit", "src/melee/lb/lbmemory.c", "--function", "lb_8000F000", "--capture", "pair", "--timeout-seconds", "120", "--json"],
      opts: { cwd: WORKSPACE_ROOT, timeoutMs: 180_000 },
    });
    expect(result.parsed).toEqual({ status: "ok", snapshots: ["before.json", "after.json"] });
    expect(result).toMatchObject({ operation: "tool:mwcc_alloc:snapshot.py", exit_code: 0 });
  });

  test("rejects unsafe units, captures, and symbols before sandbox access", async () => {
    const { provider, handle } = await fakeSandbox();
    for (const args of [
      snapshotArgs(["--unit", "../escape.c"]),
      snapshotArgs(["--capture", "everything"]),
      snapshotArgs(["--function", "bad symbol"]),
    ]) {
      const result = await runSandboxMwccAllocSnapshot({ sandboxHandle: handle, workspaceRoot: WORKSPACE_ROOT, args });
      expect(result).toMatchObject({ status: "rejected_arguments", tool_error: true, error_kind: "sandbox_exec_contract_rejected" });
    }
    expect(provider.execCalls).toEqual([]);
  });

  test("compares snapshots and rejects escaping paths", async () => {
    const { provider, handle } = await fakeSandbox();
    provider.scriptExec(
      { exitCode: 0, stdout: "", stderr: "" },
      { exitCode: 0, stdout: JSON.stringify({ status: "ok", change_count: 2 }), stderr: "" },
    );
    const result = await runSandboxMwccAllocCompare({
      sandboxHandle: handle,
      workspaceRoot: WORKSPACE_ROOT,
      args: ["--repo-root", WORKSPACE_ROOT, "--before", "build/mwcc-alloc/before.json", "--after", "build/mwcc-alloc/after.json", "--json"],
    });
    expect(provider.execCalls[1]).toMatchObject({
      command: ["python3", "build/tools/mwcc-alloc/compare_coloring_snapshots.py", "--json", "build/mwcc-alloc/before.json", "build/mwcc-alloc/after.json"],
      opts: { cwd: WORKSPACE_ROOT, timeoutMs: 60_000 },
    });
    expect(result.parsed).toEqual({ status: "ok", change_count: 2 });

    const rejected = await runSandboxMwccAllocCompare({
      sandboxHandle: handle,
      workspaceRoot: WORKSPACE_ROOT,
      args: ["--repo-root", WORKSPACE_ROOT, "--before", "/tmp/before.json", "--after", "build/mwcc-alloc/after.json"],
    });
    expect(rejected).toMatchObject({ status: "rejected_arguments", tool_error: true, error_kind: "sandbox_exec_contract_rejected" });
    expect(provider.execCalls).toHaveLength(2);
  });

  test("returns bounded output tails when JSON parsing fails", async () => {
    const { provider, handle } = await fakeSandbox();
    provider.scriptExec(
      { exitCode: 0, stdout: "", stderr: "" },
      { exitCode: 0, stdout: `prefix-${"x".repeat(5_000)}`, stderr: `prefix-${"y".repeat(5_000)}` },
    );
    const result = await runSandboxMwccAllocSnapshot({ sandboxHandle: handle, workspaceRoot: WORKSPACE_ROOT, args: snapshotArgs() });
    expect(result).toMatchObject({ tool_error: true, error_kind: "tool_output_parse_error", operation: "tool:mwcc_alloc:snapshot.py" });
    expect(String(result.stdout)).toHaveLength(4_000);
    expect(String(result.stderr)).toHaveLength(4_000);
  });

  test("resolver dispatches snapshots to the sandbox wrapper", async () => {
    const { provider, handle } = await fakeSandbox();
    provider.scriptExec(
      { exitCode: 0, stdout: "", stderr: "" },
      { exitCode: 0, stdout: JSON.stringify({ status: "ok", capture: "pair" }), stderr: "" },
    );
    let hostCalls = 0;
    const result = await runRegisteredToolApi(
      runtimeContext(handle),
      "mwcc_alloc",
      "snapshot.py",
      snapshotArgs(["--capture", "pair"]),
      {
        runCommand: async () => {
          hostCalls += 1;
          return { exitCode: 0, stdout: "{}", stderr: "" };
        },
      },
    );
    expect(result.parsed).toEqual({ status: "ok", capture: "pair" });
    expect(result.resolved_tool).toBeDefined();
    expect(provider.execCalls).toHaveLength(2);
    expect(hostCalls).toBe(0);
  });

  test("resolver without a sandbox preserves the host API argument vector", async () => {
    const args = snapshotArgs(["--capture", "coloring"]);
    let hostCommand: string[] = [];
    const result = await runRegisteredToolApi(
      runtimeContext(),
      "mwcc_alloc",
      "snapshot.py",
      args,
      {
        runCommand: async (_cwd, command) => {
          hostCommand = [...command];
          return { exitCode: 0, stdout: JSON.stringify({ status: "sandbox_required" }), stderr: "" };
        },
      },
    );
    expect(result.parsed).toEqual({ status: "sandbox_required" });
    expect(hostCommand[0]).toBe("python3");
    expect(hostCommand[1]).toEndWith("/toolpacks/gamecube-decomp/compiler/mwcc_alloc/api/snapshot.py");
    expect(hostCommand.slice(2)).toEqual(args);
  });
});
