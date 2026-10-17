import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import { packageRoot } from "@server/core/knowledge/paths.js";
import { FakeSandboxProvider, type FakeSandboxExecCall, type SandboxExecResult } from "@server/core/job-queue/sandbox.js";
import { runRegisteredToolApi, type ToolRuntimeContext } from "../resolver.js";

const WORKSPACE = "/opt/melee";
const SCRIPT = "/opt/toolpacks/gamecube-decomp/research/asm_window_search/api/window_search.py";

async function worker(indexPresent: boolean) {
  const provider = new FakeSandboxProvider();
  const sandboxHandle = await provider.create({ snapshot: "s", labels: {}, resources: { cpu: 1, memoryGiB: 1, diskGiB: 1 }, ttlMinutes: 1 });
  const respond = (call: FakeSandboxExecCall): SandboxExecResult => {
    if (call.command[0] === "test" && call.command.includes("/opt/tool-data/asm_window_search/indexes/windows.vec.bin")) {
      return { exitCode: indexPresent ? 0 : 1, stdout: "", stderr: "" };
    }
    if (call.command[0] === "bash") return { exitCode: 0, stdout: JSON.stringify({ status: "ok", donors: [] }), stderr: "" };
    return { exitCode: 0, stdout: "", stderr: "" };
  };
  for (let index = 0; index < 6; index += 1) provider.scriptExec(respond);
  const stateDir = resolve(packageRoot(), "games/melee/state");
  const context: ToolRuntimeContext = {
    repoRoot: WORKSPACE,
    stateDir,
    game: { gameId: "melee", repoRoot: WORKSPACE, stateDir, descriptorPath: resolve(packageRoot(), "games/melee/game.json") },
    worktreeId: "claim-1",
    sandboxHandle,
  };
  let hostCalls = 0;
  const run = () => runRegisteredToolApi(context, "asm_window_search", "window_search.py", ["--symbol", "lb_8000F000", "--json"], {
    runCommand: async () => { hostCalls += 1; return { exitCode: 0, stdout: "{}", stderr: "" }; },
  });
  return { provider, run, hostCalls: () => hostCalls };
}

describe("asm_window_search in the worker sandbox", () => {
  test("searches the synced index in the sandbox", async () => {
    const { provider, run, hostCalls } = await worker(true);
    const result = await run();
    expect(result).toMatchObject({ parsed: { status: "ok" }, resolved_tool: { execution_surface: "sandbox_workspace" } });
    const search = provider.execCalls.find((call) => call.command[4] === SCRIPT);
    expect(search?.command.slice(5)).toEqual(["--symbol", "lb_8000F000", "--json"]);
    expect(search?.opts.env).toMatchObject({ ORCH_TOOL_SHARED_DATA_ROOT: "/opt/tool-data/asm_window_search" });
    expect(hostCalls()).toBe(0);
  });

  test("without the index it answers prerequisite-missing and never scores on the host", async () => {
    const { provider, run, hostCalls } = await worker(false);
    expect(await run()).toMatchObject({
      status: "sandbox_prerequisite_missing",
      tool: "asm_window_search",
      missing: "the asm-window index (/opt/tool-data/asm_window_search/indexes)",
    });
    expect(provider.execCalls.some((call) => call.command[4] === SCRIPT)).toBeFalse();
    expect(hostCalls()).toBe(0);
  });
});
