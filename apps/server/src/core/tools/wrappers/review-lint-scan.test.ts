import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import { packageRoot } from "@server/core/knowledge/paths.js";
import { FakeSandboxProvider, type FakeSandboxExecCall, type SandboxExecResult } from "@server/core/job-queue/sandbox.js";
import type { AgentToolRuntimeContext } from "../types.js";
import { reviewLintScanToolRegistration } from "./capabilities.js";
import { REVIEW_LINT_TEXT_ARG_MAX_BYTES } from "./review-lint-scan.js";

const WORKSPACE = "/workspace/sms/checkout";
const SCAN = "/opt/toolpacks/gamecube-decomp/source_editing/review_lint/api/scan.py";

async function worker(options: { qaAssets: boolean }) {
  const provider = new FakeSandboxProvider();
  const sandboxHandle = await provider.create({ snapshot: "s", labels: {}, resources: { cpu: 1, memoryGiB: 1, diskGiB: 1 }, ttlMinutes: 1 });
  const respond = (call: FakeSandboxExecCall): SandboxExecResult => {
    if (call.command[0] === "test" && call.command[2] === "/opt/build-orchestrator/.qa-ready") {
      return { exitCode: options.qaAssets ? 0 : 1, stdout: "", stderr: "" };
    }
    if (call.command[0] === "bash") return { exitCode: 0, stdout: JSON.stringify({ tool: "review_lint", status: "passed", findings: [] }), stderr: "" };
    return { exitCode: 0, stdout: "", stderr: "" };
  };
  for (let index = 0; index < 10; index += 1) provider.scriptExec(respond);
  const stateDir = resolve(packageRoot(), "games/sms/state");
  const context: AgentToolRuntimeContext = {
    role: "worker",
    cwd: WORKSPACE,
    repoRoot: WORKSPACE,
    stateDir,
    game: { gameId: "sms", repoRoot: WORKSPACE, stateDir, descriptorPath: resolve(packageRoot(), "games/sms/game.json") },
    worktreeId: "claim-1",
    claimId: "claim-1",
    sandboxHandle,
  };
  return { provider, sandboxHandle, context };
}

async function scan(context: AgentToolRuntimeContext, params: Record<string, unknown>) {
  const result = await reviewLintScanToolRegistration.create(context).execute("call-1", params);
  return JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>;
}

const scanRuns = (provider: FakeSandboxProvider) => provider.execCalls.filter((call) => call.command[0] === "bash" && call.command[4] === SCAN);

describe("review_lint_scan in the worker sandbox", () => {
  test("a file call scans the sandbox checkout with the QA standards env", async () => {
    const { provider, context } = await worker({ qaAssets: true });
    const result = await scan(context, { file: "src/MarioUtil/MtxUtil.cpp" });

    expect(result).toMatchObject({ parsed: { status: "passed" }, resolved_tool: { execution_surface: "sandbox_workspace" } });
    const [run] = scanRuns(provider);
    expect(run?.command.slice(5)).toEqual(["--file", `${WORKSPACE}/src/MarioUtil/MtxUtil.cpp`, "--json"]);
    expect(run?.opts.cwd).toBe(WORKSPACE);
    expect(run?.opts.env).toMatchObject({
      ORCH_GAME_DIR: "/opt/build-orchestrator/games/sms",
      REVIEW_LINT_GLOBAL_STANDARDS_DIR: "/opt/build-orchestrator/knowledge/global/sources/injectable/decomp_standards/standards",
      ORCH_PACKAGE_ROOT: "/opt/build-orchestrator",
      ORCH_GAME_REPO_ROOT: WORKSPACE,
      ORCH_TOOL_ROOT: "/opt/toolpacks/gamecube-decomp/source_editing/review_lint",
    });
    // No host path leaks into the sandbox env.
    expect(Object.values(run!.opts.env!).some((value) => value.startsWith(packageRoot()))).toBeFalse();
    expect(run?.opts.env).not.toHaveProperty("ORCH_GAME_HOST_REPO_ROOT");
  });

  test("a text call passes the snippet as an argument; a large one travels as a sandbox file", async () => {
    const { provider, sandboxHandle, context } = await worker({ qaAssets: true });
    await scan(context, { text: "void* p = (void*)x;", rule: "type_erasing_casts" });
    expect(scanRuns(provider)[0]?.command.slice(5)).toEqual(["--text", "void* p = (void*)x;", "--rule", "type_erasing_casts", "--json"]);

    const big = `${"int x;\n".repeat(Math.ceil(REVIEW_LINT_TEXT_ARG_MAX_BYTES / 7) + 1)}`;
    await scan(context, { text: big });
    const args = scanRuns(provider)[1]!.command.slice(5);
    expect(args[0]).toBe("--file");
    expect(args[1]).toMatch(/^\/tmp\/tool-cache\/review_lint\/scan-input-.*\.c$/);
    expect(await sandboxHandle.readFile(args[1]!)).toBe(big);
    expect(JSON.stringify(scanRuns(provider)[1]!.command).length).toBeLessThan(REVIEW_LINT_TEXT_ARG_MAX_BYTES);
  });

  test("without the synced QA assets it answers prerequisite-missing and runs nothing", async () => {
    const { provider, context } = await worker({ qaAssets: false });
    const result = await scan(context, { text: "int x;" });
    expect(result).toMatchObject({ status: "sandbox_prerequisite_missing", tool: "review_lint", missing: "QA assets (/opt/build-orchestrator/.qa-ready)" });
    expect(scanRuns(provider)).toHaveLength(0);
  });
});
