import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import { packageRoot } from "@server/core/knowledge/paths.js";
import { FakeSandboxProvider, type FakeSandboxExecCall, type SandboxCreateParams, type SandboxExecResult, type SandboxHandle } from "@server/core/job-queue/sandbox.js";
import { runRegisteredToolApi, type ToolRuntimeContext } from "../resolver.js";
import { scopedTypeLayoutCacheRoot } from "./type-layout-fetch.js";

const WORKSPACE_ROOT = "/sandbox/workspace";
const CACHE_ROOT = "/tmp/tool-cache/type_layout_lookup";
const TOOL_ROOT = "/opt/toolpacks/gamecube-decomp/research/type_layout_lookup";

function layoutFixture(kind: "melee" | "sms"): string {
  const sms = kind === "sms";
  const version = sms ? "GMSJ01" : "GALE01";
  return JSON.stringify({
    version,
    report_path: `build/${version}/report.json`,
    object_root: `build/${version}/obj`,
    asm_root: `build/${version}/asm`,
    context_script: sms ? "tools/decompctx.py" : "tools/m2ctx/m2ctx.py",
    include_paths: sms ? ["include", `build/${version}/include`] : [],
    units: [{
      name: sms ? "mario/main" : "main/melee/lb/lbcommand",
      base_path: sms ? `build/${version}/src/main.o` : `build/${version}/src/melee/lb/lbcommand.o`,
      target_path: sms ? `build/${version}/obj/main.o` : `build/${version}/obj/melee/lb/lbcommand.o`,
      source_path: sms ? "src/main.cpp" : "src/melee/lb/lbcommand.c",
    }],
  });
}

const createParams: SandboxCreateParams = {
  snapshot: "type-layout-test",
  labels: { game_id: "melee", claim_id: "claim-type-layout" },
  resources: { cpu: 2, memoryGiB: 4, diskGiB: 5 },
  ttlMinutes: 90,
};

function context(handle: SandboxHandle, gameId = "melee", targetSource?: string): ToolRuntimeContext {
  const stateDir = resolve(packageRoot(), `games/${gameId}/state`);
  return {
    repoRoot: WORKSPACE_ROOT,
    stateDir,
    game: { gameId, repoRoot: WORKSPACE_ROOT, stateDir, descriptorPath: resolve(packageRoot(), `games/${gameId}/game.json`) },
    worktreeId: "claim-type-layout",
    claimId: "claim-type-layout",
    sandboxHandle: handle,
    ...(targetSource !== undefined ? { packet: { target: { source_path: targetSource } } } : {}),
  };
}

type Lookup = "shared" | "cache";
interface SandboxScript {
  kind?: "melee" | "sms";
  /** lookup results by index (shared root, then the --index-root cache); `not_built` reports index_not_built. */
  lookups: Record<Lookup, "ok" | "not_built">;
  clang?: string | null;
  contextExists?: boolean;
  runnerExit?: number;
  /** Sandbox checkout HEAD (`git rev-parse HEAD`). */
  head?: string;
}

/** A command-dispatching sandbox: tool runs go through `bash -lc ... python3 <script>`. */
async function sandbox(script: SandboxScript) {
  const provider = new FakeSandboxProvider();
  const handle = await provider.create(createParams);
  const builtRoots = new Set<string>();
  const respond = (call: FakeSandboxExecCall): SandboxExecResult => {
    const ok = (stdout = "") => ({ exitCode: 0, stdout, stderr: "" });
    const [head] = call.command;
    if (head === "test" && call.command[1] === "-f" && call.command[2]?.endsWith("/.ready")) return ok();
    if (head === "test" && call.command[2] === "build/ctx.c") return { exitCode: script.contextExists ? 0 : 1, stdout: "", stderr: "" };
    if (head === "bash" && call.command[2]?.includes("ORCH_IR_ORACLE_CLANG")) {
      return script.clang ? ok(script.clang) : { exitCode: 1, stdout: "", stderr: "" };
    }
    if (head === "git" && call.command[1] === "rev-parse") return ok(`${script.head ?? "head-1"}\n`);
    if (head === "bash" && call.command[4]?.endsWith("/runners/build_type_index.py")) {
      const built = script.runnerExit === undefined || script.runnerExit === 0;
      if (built) builtRoots.add(call.command[call.command.indexOf("--out") + 1]!);
      return { exitCode: script.runnerExit ?? 0, stdout: JSON.stringify({ success: built }), stderr: "" };
    }
    if (head === "bash" && call.command[4]?.endsWith("/api/layout_lookup.py")) {
      const rootIndex = call.command.indexOf("--index-root");
      const root = rootIndex >= 0 ? call.command[rootIndex + 1]! : null;
      // The project cache answers per script.lookups.cache; any root a runner built answers ok.
      const state = root === null ? script.lookups.shared : builtRoots.has(root) ? "ok" : root === CACHE_ROOT ? script.lookups.cache : "not_built";
      return ok(JSON.stringify(state === "ok" ? { status: "ok", from: root ?? "shared" } : { status: "index_not_built" }));
    }
    if (head === "python3" && call.command[1] === "-c") return ok(layoutFixture(script.kind ?? "melee"));
    return ok();
  };
  for (let index = 0; index < 20; index += 1) provider.scriptExec(respond);
  return { provider, handle };
}

const toolScripts = (provider: FakeSandboxProvider) => provider.execCalls
  .filter((call) => call.command[0] === "bash" && call.command[4]?.startsWith(TOOL_ROOT))
  .map((call) => call.command.slice(4));

async function lookup(handle: SandboxHandle, args: string[], gameId = "melee", targetSource?: string) {
  let hostCalls = 0;
  const result = await runRegisteredToolApi(context(handle, gameId, targetSource), "type_layout_lookup", "layout_lookup.py", args, {
    runCommand: async () => { hostCalls += 1; return { exitCode: 0, stdout: "{}", stderr: "" }; },
  });
  return { result, hostCalls };
}

describe("sandbox type_layout_lookup", () => {
  test("answers from the image's shared index without building", async () => {
    const { provider, handle } = await sandbox({ lookups: { shared: "ok", cache: "not_built" } });
    const { result, hostCalls } = await lookup(handle, ["--record", "HSD_GObj", "--json"]);
    expect(result).toMatchObject({ parsed: { status: "ok", from: "shared" }, resolved_tool: { execution_surface: "sandbox_workspace" } });
    expect(toolScripts(provider)).toEqual([[`${TOOL_ROOT}/api/layout_lookup.py`, "--record", "HSD_GObj", "--json"]]);
    // The first query reads the baked project-wide index under the tool's shared data root.
    expect(provider.execCalls.find((call) => call.command[0] === "bash")?.opts.env).toMatchObject({ ORCH_TOOL_SHARED_DATA_ROOT: "/opt/tool-data/type_layout_lookup" });
    expect(hostCalls).toBe(0);
  });

  test("reuses the sandbox-local cache before building", async () => {
    const { provider, handle } = await sandbox({ lookups: { shared: "not_built", cache: "ok" } });
    const { result } = await lookup(handle, ["--record", "HSD_GObj", "--json"]);
    expect(result).toMatchObject({ parsed: { status: "ok", from: CACHE_ROOT } });
    expect(toolScripts(provider).at(-1)).toEqual([`${TOOL_ROOT}/api/layout_lookup.py`, "--record", "HSD_GObj", "--index-root", CACHE_ROOT, "--json"]);
    expect(provider.execCalls.some((call) => call.command[4]?.includes("build_type_index.py"))).toBeFalse();
  });

  test("generates ctx and builds the cache in the sandbox with the image's clang, then queries it", async () => {
    const { provider, handle } = await sandbox({ lookups: { shared: "not_built", cache: "not_built" }, clang: "/usr/bin/clang-21" });
    const { result, hostCalls } = await lookup(handle, ["--record", "HSD_GObj", "--mode", "near", "--json"]);

    expect(result).toMatchObject({ parsed: { status: "ok", from: CACHE_ROOT } });
    expect(hostCalls).toBe(0);
    expect(provider.downloadCalls).toEqual([]);
    expect(provider.execCalls.find((call) => call.command[0] === "python3" && call.command[1] === "tools/m2ctx/m2ctx.py")?.opts.cwd).toBe(WORKSPACE_ROOT);
    expect(toolScripts(provider).slice(2)).toEqual([
      [
        `${TOOL_ROOT}/runners/build_type_index.py`,
        "--ctx", `${WORKSPACE_ROOT}/build/ctx.c`, "--clang", "/usr/bin/clang-21", "--skip-casts", "--project", "melee", "--out", CACHE_ROOT,
      ],
      [`${TOOL_ROOT}/api/layout_lookup.py`, "--record", "HSD_GObj", "--mode", "near", "--index-root", CACHE_ROOT, "--json"],
    ]);
    const runner = provider.execCalls.find((call) => call.command[4]?.endsWith("build_type_index.py"));
    expect(runner?.opts.env).toMatchObject({ ORCH_TOOL_WORKTREE_CACHE_ROOT: CACHE_ROOT, ORCH_GAME_REPO_ROOT: WORKSPACE_ROOT });
  });

  test("an image without clang answers prerequisite-missing and never builds on the host", async () => {
    const { provider, handle } = await sandbox({ lookups: { shared: "not_built", cache: "not_built" }, clang: null });
    const { result, hostCalls } = await lookup(handle, ["--json"]);
    expect(result).toMatchObject({ status: "sandbox_prerequisite_missing", tool: "type_layout_lookup", missing: "clang" });
    expect(hostCalls).toBe(0);
    expect(toolScripts(provider)).toHaveLength(2);
  });

  test("reports a runner failure as a build status", async () => {
    const { handle } = await sandbox({ lookups: { shared: "not_built", cache: "not_built" }, clang: "/usr/bin/clang-21", contextExists: true, runnerExit: 2 });
    const { result } = await lookup(handle, ["--json"]);
    expect(result).toMatchObject({ status: "type_index_build_failed", stage: "sandbox_runner" });
  });

  test("SMS without an index or ctx.c builds a scoped index from the claim target's source", async () => {
    const { provider, handle } = await sandbox({ kind: "sms", lookups: { shared: "not_built", cache: "not_built" }, clang: "/usr/bin/clang-21", head: "abc123" });
    const { result, hostCalls } = await lookup(handle, ["--record", "TMario", "--json"], "sms", "src/Player/MarioMain.cpp");

    const scoped = scopedTypeLayoutCacheRoot(CACHE_ROOT, "src/Player/MarioMain.cpp", "abc123");
    expect(scoped).toMatch(/^\/tmp\/tool-cache\/type_layout_lookup\/scoped\/[0-9a-f]{16}$/);
    expect(result).toMatchObject({ parsed: { status: "ok", from: scoped } });
    expect(hostCalls).toBe(0);
    // The scoped context comes from SMS's generator with the target's source; build/ctx.c is never read or written.
    const generator = provider.execCalls.find((call) => call.command[1] === "tools/decompctx.py");
    expect(generator?.command).toEqual([
      "python3", "tools/decompctx.py", "src/Player/MarioMain.cpp", "-o", `${scoped}/ctx.c`,
      "-I", "include", "-I", "build/GMSJ01/include",
    ]);
    expect(provider.execCalls.some((call) => call.command.includes("build/ctx.c"))).toBeFalse();
    expect(toolScripts(provider).slice(2)).toEqual([
      [`${TOOL_ROOT}/api/layout_lookup.py`, "--record", "TMario", "--index-root", scoped, "--json"],
      [`${TOOL_ROOT}/runners/build_type_index.py`, "--ctx", `${scoped}/ctx.c`, "--clang", "/usr/bin/clang-21", "--lang", "c++", "--skip-casts", "--project", "sms", "--out", scoped],
      [`${TOOL_ROOT}/api/layout_lookup.py`, "--record", "TMario", "--index-root", scoped, "--json"],
    ]);
  });

  test("the scoped cache key isolates sources and HEADs, and a built scope is reused", async () => {
    const roots = new Set([
      scopedTypeLayoutCacheRoot(CACHE_ROOT, "src/a.cpp", "head-1"),
      scopedTypeLayoutCacheRoot(CACHE_ROOT, "src/b.cpp", "head-1"),
      scopedTypeLayoutCacheRoot(CACHE_ROOT, "src/a.cpp", "head-2"),
    ]);
    expect(roots.size).toBe(3);

    const { provider, handle } = await sandbox({ kind: "sms", lookups: { shared: "not_built", cache: "not_built" }, clang: "/usr/bin/clang-21" });
    await lookup(handle, ["--json"], "sms", "src/a.cpp");
    await lookup(handle, ["--json"], "sms", "src/b.cpp");
    await lookup(handle, ["--json"], "sms", "src/a.cpp");
    const builds = provider.execCalls.filter((call) => call.command[4]?.endsWith("build_type_index.py")).map((call) => call.command.at(-1));
    expect(builds).toEqual([
      scopedTypeLayoutCacheRoot(CACHE_ROOT, "src/a.cpp", "head-1"),
      scopedTypeLayoutCacheRoot(CACHE_ROOT, "src/b.cpp", "head-1"),
    ]);
  });

  test("SMS with no known target source answers a clear unavailable result without running the generator", async () => {
    for (const targetSource of [undefined, "undefined", "../escape.cpp"]) {
      const { provider, handle } = await sandbox({ kind: "sms", lookups: { shared: "not_built", cache: "not_built" }, clang: "/usr/bin/clang-21" });
      const { result } = await lookup(handle, ["--mode", "summary", "--json"], "sms", targetSource);
      expect(result).toMatchObject({ status: "type_index_unavailable", stage: "scoped_source" });
      expect(provider.execCalls.some((call) => call.command[1] === "tools/decompctx.py")).toBeFalse();
    }
  });

  test("rejects caller-supplied paths and index roots before sandbox access", async () => {
    const { provider, handle } = await sandbox({ lookups: { shared: "ok", cache: "ok" } });
    for (const args of [["--record", "../../build/ctx.c", "--json"], ["--index-root", "/sandbox/workspace/cache", "--json"]]) {
      const { result, hostCalls } = await lookup(handle, args);
      expect(result).toMatchObject({ tool_error: true, error_kind: "sandbox_fetch_contract_rejected" });
      expect(hostCalls).toBe(0);
    }
    expect(provider.execCalls).toEqual([]);
  });
});
