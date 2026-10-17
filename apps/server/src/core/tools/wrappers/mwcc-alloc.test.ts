import { describe, expect, test } from "bun:test";
import { FakeSandboxProvider, type SandboxCreateParams } from "@server/core/job-queue/sandbox.js";
import { packageRoot } from "@server/core/knowledge/paths.js";
import { resolve } from "node:path";
import { runRegisteredToolApi, type ToolRuntimeContext } from "../resolver.js";
import { mwccAllocAnalyzeToolRegistration, mwccAllocCompareSourcesToolRegistration, mwccAllocSnapshotToolRegistration } from "./capabilities.js";
import { boundMwccAllocResult, runSandboxMwccAllocAnalyze, runSandboxMwccAllocCompare, runSandboxMwccAllocCompareSources, runSandboxMwccAllocSnapshot } from "./mwcc-alloc.js";
import { maxToolOutputCharacters } from "../runtime/results.js";

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
      backend: "qemu",
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

  test("scales default capture and compare timeouts by the sandbox profile within the 30-minute cap", async () => {
    const { provider, handle } = await fakeSandbox();
    const probe = { exitCode: 0, stdout: "", stderr: "" };
    const ok = { exitCode: 0, stdout: JSON.stringify({ status: "ok" }), stderr: "" };
    provider.scriptExec(probe, ok, probe, ok, probe, ok);
    await runSandboxMwccAllocSnapshot({ sandboxHandle: handle, workspaceRoot: WORKSPACE_ROOT, args: snapshotArgs(), timeoutScale: 1.5 });
    expect(provider.execCalls[1].command).toContain("1350");
    expect(provider.execCalls[1].opts.timeoutMs).toBe(1_410_000);
    await runSandboxMwccAllocSnapshot({ sandboxHandle: handle, workspaceRoot: WORKSPACE_ROOT, args: snapshotArgs(), timeoutScale: 4 });
    expect(provider.execCalls[3].command).toContain("1800");
    await runSandboxMwccAllocCompare({ sandboxHandle: handle, workspaceRoot: WORKSPACE_ROOT, args: ["--repo-root", WORKSPACE_ROOT, "--before", "build/mwcc-alloc/before.json", "--after", "build/mwcc-alloc/after.json", "--json"], timeoutScale: 2 });
    expect(provider.execCalls[5].opts.timeoutMs).toBe(120_000);
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

const SYNCED = "/opt/toolpacks/gamecube-decomp/compiler/mwcc_alloc/api";
const probeOk = { exitCode: 0, stdout: "", stderr: "" };
const jsonOk = (payload: unknown) => ({ exitCode: 0, stdout: JSON.stringify(payload), stderr: "" });

describe("native mwcc_alloc backend", () => {
  test("the default pair capture keeps the baked qemu command and says so", async () => {
    const { provider, handle } = await fakeSandbox();
    provider.scriptExec(probeOk, jsonOk({ status: "ok" }));
    const result = await runSandboxMwccAllocSnapshot({ sandboxHandle: handle, workspaceRoot: WORKSPACE_ROOT, args: snapshotArgs() });
    expect(provider.execCalls[1].command).toEqual(["python3", "build/tools/mwcc-alloc/mwcc_alloc_capture.py", "--unit", "src/melee/lb/lbmemory.c", "--function", "lb_8000F000", "--capture", "pair", "--timeout-seconds", "900", "--json"]);
    expect(result.backend).toBe("qemu");
  });

  test("native captures run the synced snapshot API with a shorter, profile-scaled default", async () => {
    const { provider, handle } = await fakeSandbox();
    provider.scriptExec(probeOk, jsonOk({ status: "ok", backend: "native" }));
    const tool = mwccAllocSnapshotToolRegistration.create({ ...runtimeContext(handle), role: "worker", cwd: WORKSPACE_ROOT, repoRoot: WORKSPACE_ROOT });
    await tool.execute("native", { unit: "src/melee/lb/lbmemory.c", function: "lb_8000F000", capture: "decisions" });
    expect(provider.execCalls[0].command).toEqual(["test", "-f", `${SYNCED}/snapshot.py`]);
    expect(provider.execCalls[1].command).toEqual(["python3", `${SYNCED}/snapshot.py`, "--repo-root", WORKSPACE_ROOT, "--backend", "native", "--unit", "src/melee/lb/lbmemory.c", "--function", "lb_8000F000", "--capture", "decisions", "--timeout-seconds", "300", "--json"]);
    const scaled = await runSandboxMwccAllocSnapshot({ sandboxHandle: handle, workspaceRoot: WORKSPACE_ROOT, args: snapshotArgs(["--capture", "coloring-native"]), timeoutScale: 2 });
    expect(provider.execCalls[3].command).toContain("600");
    expect(scaled.backend).toBe("native");
  });

  test("backend/capture combinations milestone 1 cannot serve are refused before the sandbox", async () => {
    const { provider, handle } = await fakeSandbox();
    for (const extra of [["--capture", "pair", "--backend", "native"], ["--capture", "trace", "--backend", "native"], ["--capture", "decisions", "--backend", "qemu"]]) {
      const result = await runSandboxMwccAllocSnapshot({ sandboxHandle: handle, workspaceRoot: WORKSPACE_ROOT, args: snapshotArgs(extra) });
      expect(result).toMatchObject({ status: "backend_unsupported", tool_error: true });
    }
    const bad = await runSandboxMwccAllocSnapshot({ sandboxHandle: handle, workspaceRoot: WORKSPACE_ROOT, args: snapshotArgs(["--backend", "gdb"]) });
    expect(bad.status).toBe("rejected_arguments");
    expect(provider.execCalls).toEqual([]);
  });

  test("compare_sources passes variant specs to the synced API", async () => {
    const { provider, handle } = await fakeSandbox();
    provider.scriptExec(probeOk, jsonOk({ status: "ok", schema: "mwcc-decision-diff-v1", summary_lines: ["gpr pass 1: +1 node"] }));
    const tool = mwccAllocCompareSourcesToolRegistration.create({ ...runtimeContext(handle), role: "worker", cwd: WORKSPACE_ROOT, repoRoot: WORKSPACE_ROOT });
    const result = await tool.execute("cmp", { unit: "src/melee/lb/lbmemory.c", function: "lb_8000F000", a: "@revert:src/melee/lb/lbmemory.c:10-12", b: "@worktree", base_rev: "abc123" });
    expect(provider.execCalls[1].command).toEqual(["python3", `${SYNCED}/compare_sources.py`, "--repo-root", WORKSPACE_ROOT, "--unit", "src/melee/lb/lbmemory.c", "--function", "lb_8000F000", "--a", "@revert:src/melee/lb/lbmemory.c:10-12", "--b", "@worktree", "--base-rev", "abc123", "--timeout-seconds", "600", "--json"]);
    expect(provider.execCalls[1].opts.timeoutMs).toBe(660_000);
    expect(JSON.stringify(result)).toContain("+1 node");
  });

  test("inline manifests are written into the sandbox workspace and passed by path", async () => {
    const { provider, handle } = await fakeSandbox();
    provider.scriptExec(probeOk, probeOk, jsonOk({ status: "ok" }));
    const tool = mwccAllocCompareSourcesToolRegistration.create({ ...runtimeContext(handle), role: "worker", cwd: WORKSPACE_ROOT, repoRoot: WORKSPACE_ROOT });
    await tool.execute("cmp", { unit: "src/a.c", function: "f", a: "@base", b_files: { "include/a.h": "int x;\n" }, b_deleted: ["src/old.c"] });
    expect(provider.execCalls[0].command).toEqual(["mkdir", "-p", "build/mwcc-alloc/manifests"]);
    const command = provider.execCalls[2].command;
    const path = command[command.indexOf("--b") + 1];
    expect(path).toMatch(/^build\/mwcc-alloc\/manifests\/b-[0-9a-f]{16}\.json$/);
    expect(JSON.parse(await handle.readFile(`${WORKSPACE_ROOT}/${path}`))).toEqual({ files: { "include/a.h": "int x;\n", "src/old.c": null } });
  });

  test("compare_sources rejects unsafe variants without touching the sandbox", async () => {
    const { provider, handle } = await fakeSandbox();
    const tool = mwccAllocCompareSourcesToolRegistration.create({ ...runtimeContext(handle), role: "worker", cwd: WORKSPACE_ROOT, repoRoot: WORKSPACE_ROOT });
    for (const params of [
      { a: "@base", b: "../etc/passwd.json" },
      { a: "@base", b: "@revert:tools/x.py:3" },
      { a: "@base:$(rm)", b: "@worktree" },
      { a: "@base", b_files: { "tools/run.sh": "echo" } },
      { a: "@base" },
      { a: "@base", b: "@worktree", b_files: { "src/a.c": "" } },
    ]) {
      const result = await tool.execute("cmp", { unit: "src/a.c", function: "f", ...params });
      expect(JSON.stringify(result)).toContain("rejected_arguments");
    }
    expect(provider.execCalls).toEqual([]);
  });

  test("compare_sources needs a sandbox and is routed to it", async () => {
    let hostCalls = 0;
    const args = ["--repo-root", WORKSPACE_ROOT, "--unit", "src/a.c", "--function", "f", "--a", "@base", "--b", "@worktree", "--json"];
    const host = await runRegisteredToolApi(runtimeContext(), "mwcc_alloc", "compare_sources.py", args, {
      runCommand: async () => { hostCalls += 1; throw new Error("host compiler execution forbidden"); },
    });
    expect(host.status).toBe("sandbox_required");
    const { provider, handle } = await fakeSandbox();
    provider.scriptExec(probeOk, jsonOk({ status: "ok" }));
    const routed = await runRegisteredToolApi(runtimeContext(handle), "mwcc_alloc", "compare_sources.py", args, {
      runCommand: async () => { hostCalls += 1; throw new Error("host compiler execution forbidden"); },
    });
    expect(routed.parsed).toEqual({ status: "ok" });
    expect(routed.backend).toBe("native");
    expect(hostCalls).toBe(0);
  });

  test("native captures accept mangled template names; qemu captures keep identifiers", async () => {
    const { provider, handle } = await fakeSandbox();
    provider.scriptExec(probeOk, jsonOk({ status: "ok" }));
    const mangled = "execute__26TNerveBossEelSleepOnBottomCFP24TSpineBase<10TLiveActor>";
    const args = (fn: string, capture: string) => ["--repo-root", WORKSPACE_ROOT, "--unit", "src/Enemy/bosseel.cpp", "--function", fn, "--capture", capture, "--json"];
    const ok = await runSandboxMwccAllocSnapshot({ sandboxHandle: handle, workspaceRoot: WORKSPACE_ROOT, args: args(mangled, "decisions") });
    expect(ok.status).not.toBe("rejected_arguments");
    expect(provider.execCalls[1].command).toContain(mangled);
    const qemu = await runSandboxMwccAllocSnapshot({ sandboxHandle: handle, workspaceRoot: WORKSPACE_ROOT, args: args(mangled, "pair") });
    expect(qemu.status).toBe("rejected_arguments");
    const shell = await runSandboxMwccAllocSnapshot({ sandboxHandle: handle, workspaceRoot: WORKSPACE_ROOT, args: args("f;rm -rf /", "decisions") });
    expect(shell.status).toBe("rejected_arguments");
    expect(provider.execCalls).toHaveLength(2);
  });

  test("direct wrapper calls validate their own arguments", async () => {
    const { provider, handle } = await fakeSandbox();
    const result = await runSandboxMwccAllocCompareSources({ sandboxHandle: handle, workspaceRoot: WORKSPACE_ROOT, args: ["--unit", "src/a.c", "--function", "f", "--a", "@base"] });
    expect(result).toMatchObject({ status: "rejected_arguments" });
    expect(provider.execCalls).toEqual([]);
  });
});

function bigChange(index: number) {
  const identity = { cls: "gpr", vreg: 40 + index, kind: "local", object: `local_${index}`, decl_file: "src/Enemy/bosseel.cpp", decl_line: 2400 + index, origin: "x".repeat(400) };
  return {
    kind: "register",
    summary: `gpr pass 0: \`local_${index}\` (local src/Enemy/bosseel.cpp:${2400 + index}) r30 -> r31 (v${40 + index} -> v${41 + index})`,
    a: { vreg: 40 + index, degree: 12, reg: "r30", order: index, spilled: false, identity },
    b: { vreg: 41 + index, degree: 12, reg: "r31", order: index, spilled: false, identity },
    match: "by_site",
  };
}

function toolText(result: { content: Array<{ type: string; text?: string }> }): string {
  return String(result.content[0].text);
}

describe("mwcc_alloc output stays valid JSON when large", () => {
  test("a 30-row diff keeps its locator and counts, cutting rows first", async () => {
    const { provider, handle } = await fakeSandbox();
    const parsed = {
      schema: "mwcc-decision-diff-v1", status: "ok", backend: "native", function: "updateTearsCnt__8TBossEelFv",
      change_counts: { register: 300 }, changes: Array.from({ length: 30 }, (_, i) => bigChange(i)),
      changes_omitted: 270, changes_truncated: true,
      summary_lines: Array.from({ length: 41 }, (_, i) => `line ${i} ${"y".repeat(200)}`),
      full_report: "build/mwcc-alloc/compare-sources/f-1/decision-diff.json",
      stock: { a_obj_sha: "a".repeat(64), b_obj_sha: "b".repeat(64), code_class: "code" },
    };
    expect(JSON.stringify(parsed).length).toBeGreaterThan(maxToolOutputCharacters);
    provider.scriptExec(probeOk, jsonOk(parsed));
    const tool = mwccAllocCompareSourcesToolRegistration.create({ ...runtimeContext(handle), role: "worker", cwd: WORKSPACE_ROOT, repoRoot: WORKSPACE_ROOT });
    const text = toolText(await tool.execute("cmp", { unit: "src/Enemy/bosseel.cpp", function: "updateTearsCnt__8TBossEelFv", a: "@base", b: "@worktree" }));
    expect(text.length).toBeLessThanOrEqual(maxToolOutputCharacters);
    const out = JSON.parse(text).parsed;
    expect(out).toMatchObject({ schema: "mwcc-decision-diff-v1", status: "ok", function: "updateTearsCnt__8TBossEelFv",
      change_counts: { register: 300 }, changes_truncated: true, full_report: parsed.full_report });
    expect(out.changes.length).toBeGreaterThan(0);
    expect(out.changes.length).toBeLessThan(30);
    expect(out.changes_omitted).toBe(300 - out.changes.length);
    expect(out.note).toContain(parsed.full_report);
    expect(out.summary_lines).toHaveLength(41);
  });

  test("when even the kept rows are too big the locator survives", () => {
    const parsed = {
      schema: "mwcc-decision-diff-v1", status: "ok", function: "f", change_counts: { register: 2 },
      changes: [bigChange(0), bigChange(1)], full_report: "build/x/decision-diff.json",
      provenance: { blob: "z".repeat(200_000) }, error: "e".repeat(50_000),
    };
    const bounded = boundMwccAllocResult("mwcc_alloc_compare_sources", { operation: "tool:mwcc_alloc:compare_sources.py", exit_code: 0, parsed });
    const text = JSON.stringify({ tool: "mwcc_alloc_compare_sources", ...bounded }, null, 2);
    expect(text.length).toBeLessThanOrEqual(maxToolOutputCharacters);
    const out = JSON.parse(text).parsed;
    expect(out).toMatchObject({ schema: "mwcc-decision-diff-v1", status: "ok", function: "f", full_report: "build/x/decision-diff.json", changes_omitted: 2 });
    expect(out.error.length).toBeLessThan(1_300);
  });

  test("snapshot output keeps its status and out_dir when the file list is huge", async () => {
    const { provider, handle } = await fakeSandbox();
    const parsed = {
      status: "ok", backend: "native", capture: "coloring-native", function: "mnSnap_80257F24",
      out_dir: "build/mwcc-alloc/native/mnSnap_80257F24-1",
      files: Array.from({ length: 400 }, (_, i) => ({ path: `build/mwcc-alloc/native/mnSnap_80257F24-1/coloring-0001-gpr-${i}-before.json`, kind: "coloring_before", nodes: 300 })),
      replay: Array.from({ length: 200 }, (_, i) => ({ cls: "gpr", pass: i, ok: false, color_mismatches: Array.from({ length: 8 }, (_, j) => ({ register: j, replayed: 3, captured: 4 })) })),
      available_points: ["coloring"], unavailable_points: ["scheduling"],
    };
    provider.scriptExec(probeOk, jsonOk(parsed));
    const tool = mwccAllocSnapshotToolRegistration.create({ ...runtimeContext(handle), role: "worker", cwd: WORKSPACE_ROOT, repoRoot: WORKSPACE_ROOT });
    const text = toolText(await tool.execute("snap", { unit: "src/melee/mn/mnsnap.c", function: "mnSnap_80257F24", capture: "coloring-native" }));
    expect(text.length).toBeLessThanOrEqual(maxToolOutputCharacters);
    const out = JSON.parse(text).parsed;
    expect(out).toMatchObject({ status: "ok", backend: "native", out_dir: parsed.out_dir, capture: "coloring-native" });
    expect(out.replay_omitted).toBeGreaterThan(0);
  });

  test("small results pass through unchanged", () => {
    const result = { operation: "x", parsed: { status: "ok", changes: [bigChange(0)] } };
    expect(boundMwccAllocResult("mwcc_alloc_compare_sources", result)).toBe(result);
  });
});
