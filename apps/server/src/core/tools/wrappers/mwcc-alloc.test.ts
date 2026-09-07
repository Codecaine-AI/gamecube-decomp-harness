import { describe, expect, test } from "bun:test";
import { FakeSandboxProvider, type SandboxCreateParams } from "@server/core/job-queue/sandbox.js";
import { packageRoot } from "@server/core/knowledge/paths.js";
import { resolve } from "node:path";
import { runRegisteredToolApi, type ToolRuntimeContext } from "../resolver.js";
import { mwccAllocAnalyzeToolRegistration, mwccAllocSnapshotToolRegistration } from "./capabilities.js";
import { runSandboxMwccAllocAnalyze, runSandboxMwccAllocCompare, runSandboxMwccAllocSnapshot } from "./mwcc-alloc.js";

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

  test("all snapshot modes require a sandbox without invoking any host command", async () => {
    for (const capture of ["pcode", "coloring", "pair", "trace"]) {
      let hostCalls = 0;
      const result = await runRegisteredToolApi(runtimeContext(), "mwcc_alloc", "snapshot.py", snapshotArgs(["--capture", capture]), {
        runCommand: async () => { hostCalls += 1; throw new Error("host compiler execution forbidden"); },
      });
      expect(result.status).toBe("sandbox_required");
      expect(hostCalls).toBe(0);
    }
  });

  test("structured trace arguments reach sandbox capture", async () => {
    const { provider, handle } = await fakeSandbox();
    provider.scriptExec({ exitCode: 0, stdout: "", stderr: "" }, { exitCode: 0, stdout: '{"status":"ok","capture":"trace"}', stderr: "" });
    const tool = mwccAllocSnapshotToolRegistration.create({ ...runtimeContext(handle), role: "worker", cwd: WORKSPACE_ROOT, repoRoot: WORKSPACE_ROOT });
    await tool.execute("trace", { unit: "src/melee/lb/lbmemory.c", function: "lb_8000F000", capture: "trace", timeout_seconds: 120 });
    expect(provider.execCalls[1].command).toEqual(["python3", "/opt/toolpacks/gamecube-decomp/compiler/mwcc_alloc/api/snapshot.py", "--repo-root", WORKSPACE_ROOT, "--trace-detail", "stages", "--unit", "src/melee/lb/lbmemory.c", "--function", "lb_8000F000", "--capture", "trace", "--timeout-seconds", "120", "--json"]);
  });

  test("trace detail is validated and full uses the synced toolpack", async () => {
    const { provider, handle } = await fakeSandbox();
    for (const options of [["--capture", "pair", "--trace-detail", "full"], ["--capture", "trace", "--trace-detail", "unknown"]]) {
      const result = await runSandboxMwccAllocSnapshot({ sandboxHandle: handle, workspaceRoot: WORKSPACE_ROOT, args: snapshotArgs(options) });
      expect(result.status).toBe("rejected_arguments");
    }
    expect(provider.execCalls).toHaveLength(0);
    provider.scriptExec({ exitCode: 0, stdout: "", stderr: "" }, { exitCode: 0, stdout: '{"status":"ok"}', stderr: "" });
    const tool = mwccAllocSnapshotToolRegistration.create({ ...runtimeContext(handle), role: "worker", cwd: WORKSPACE_ROOT, repoRoot: WORKSPACE_ROOT });
    await tool.execute("full", { unit: "src/test.c", function: "test", capture: "trace", trace_detail: "full" });
    expect(provider.execCalls[0].command).toEqual(["test", "-f", "/opt/toolpacks/gamecube-decomp/compiler/mwcc_alloc/api/snapshot.py"]);
    expect(provider.execCalls[1].command).toContain("full");
    expect(provider.execCalls[1].command).not.toContain("build/tools/mwcc-alloc/mwcc_alloc_capture.py");
  });

  test("structured analysis arguments map to fixed sandbox CLI for all six modes", async () => {
    const modes = [
      { mode: "provenance", coloring: ["a.json", "b.json"], creations: "created.json" },
      { mode: "explain", register: "gpr:7" },
      { mode: "inverse", after: "after.json", targets: ["7=3", "8=4"], provenance: "prov.json", degree_search: 0 },
      { mode: "source-rank", function_index: 2, targets: ["7=3"], fixed_objects: ["v0", "v32", "v65535"] },
      { mode: "stack", provenance: "prov.json", after: "after.json" },
      { mode: "origins", after: "after.json" },
    ];
    for (const params of modes) {
      const { provider, handle } = await fakeSandbox();
      provider.scriptExec({ exitCode: 0, stdout: "", stderr: "" }, { exitCode: 0, stdout: JSON.stringify({ status: "ok", mode: params.mode }), stderr: "" });
      const tool = mwccAllocAnalyzeToolRegistration.create({ ...runtimeContext(handle), role: "worker", cwd: WORKSPACE_ROOT, repoRoot: WORKSPACE_ROOT });
      const output = await tool.execute("analysis", { ...params, input: "capture.json", output: "result.json" });
      expect(JSON.stringify(output)).toContain(params.mode);
      const expected = ["python3", "/opt/toolpacks/gamecube-decomp/compiler/mwcc_alloc/api/analyze.py", "--repo-root", WORKSPACE_ROOT, "--mode", params.mode, "--input", "capture.json"];
      for (const key of ["after", "provenance", "creations", "function_index", "register", "degree_search"] as const) {
        if (key in params) expected.push(`--${key.replaceAll("_", "-")}`, String(params[key as keyof typeof params]));
      }
      expected.push("--output", "result.json");
      if ("coloring" in params) for (const path of params.coloring!) expected.push("--coloring", path);
      if ("targets" in params) for (const target of params.targets!) expected.push("--target", target);
      if ("fixed_objects" in params) for (const object of params.fixed_objects!) expected.push("--fixed-object", object);
      expected.push("--json");
      expect(provider.execCalls[1]).toMatchObject({ command: expected, opts: { cwd: WORKSPACE_ROOT, timeoutMs: 60000 } });
    }
  });

  test("analysis rejects invalid mode-specific and escaping arguments before execution", async () => {
    const { provider, handle } = await fakeSandbox();
    for (const extra of [
      ["--mode", "unknown"], ["--mode", "__proto__"], ["--mode", "explain"], ["--mode", "inverse", "--after", "a.json"],
      ["--mode", "stack", "--degree-search", "1"], ["--mode", "origins", "--after", "../escape"],
      ["--mode", "provenance", "--coloring", "/outside"], ["--mode", "stack", "--output", "../escape"],
      ["--mode", "explain", "--register", "gpr:65536"],
      ["--mode", "source-rank", "--function-index", "0", "--target", "7=3"],
      ["--mode", "inverse", "--after", "a.json", "--target", "7=32"],
      ["--mode", "inverse", "--after", "a.json", "--target", "7=3", "--degree-search", "9"],
      ["--mode", "stack", "--command", "compiler"],
      ["--mode", "stack", "--fixed-object", "v32"],
      ["--mode", "source-rank", "--function-index", "2", "--target", "7=3", "--fixed-object", "v32", "--fixed-object", "v32"],
      ...["32", "v-1", "v65536", "v32;command"].map(object => ["--mode", "source-rank", "--function-index", "2", "--target", "7=3", "--fixed-object", object]),
      ["--mode", "source-rank", "--function-index", "2", "--target", "7=3", ...Array.from({ length: 65 }, (_, index) => ["--fixed-object", `v${index}`]).flat()],
    ]) {
      const result = await runSandboxMwccAllocAnalyze({ sandboxHandle: handle, workspaceRoot: WORKSPACE_ROOT, args: ["--repo-root", WORKSPACE_ROOT, "--input", "capture.json", ...extra] });
      expect(result).toMatchObject({ status: "rejected_arguments", tool_error: true, error_kind: "sandbox_exec_contract_rejected" });
    }
    expect(provider.execCalls).toEqual([]);
  });

  test("analysis preserves expected structured errors from the offline runtime", async () => {
    const { provider, handle } = await fakeSandbox();
    const error = { status: "baseline_replay_mismatch", mode: "inverse", limitations: ["model only"] };
    provider.scriptExec({ exitCode: 0, stdout: "", stderr: "" }, { exitCode: 0, stdout: JSON.stringify(error), stderr: "" });
    let hostCalls = 0;
    const result = await runRegisteredToolApi(runtimeContext(handle), "mwcc_alloc", "analyze.py", ["--repo-root", WORKSPACE_ROOT, "--input", "before.json", "--mode", "inverse", "--after", "after.json", "--target", "7=3"], {
      runCommand: async () => { hostCalls += 1; throw new Error("host call forbidden"); },
    });
    expect(result.parsed).toEqual(error);
    expect(hostCalls).toBe(0);
  });
});
