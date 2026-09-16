import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import { FakeSandboxProvider, type SandboxCreateParams } from "@server/core/job-queue/sandbox.js";
import { runSandboxTypeLayoutIndexFallback } from "./type-layout-fetch.js";

const WORKSPACE_ROOT = "/sandbox/workspace";
const CONTEXT = "build/ctx.c";

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
  snapshot: "melee-type-layout-test",
  labels: { game_id: "melee", claim_id: "claim-type-layout" },
  resources: { cpu: 2, memoryGiB: 4, diskGiB: 5 },
  ttlMinutes: 90,
};

describe("sandbox type_layout_lookup fetch-first fallback", () => {
  test("generates and fetches ctx, builds the private cache, then queries it explicitly", async () => {
    const provider = new FakeSandboxProvider();
    const handle = await provider.create(createParams);
    const tempParent = await mkdtemp(resolve(tmpdir(), "type-layout-fetch-test-"));
    const cacheRoot = resolve(tempParent, "cache");
    provider.scriptExec(
      { exitCode: 0, stdout: layoutFixture("melee"), stderr: "" },
      { exitCode: 1, stdout: "", stderr: "" },
      async () => {
        await handle.writeFile(`${WORKSPACE_ROOT}/${CONTEXT}`, "sandbox context");
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    );

    const apiCalls: string[][] = [];
    let mirrorContext = "";
    const result = await runSandboxTypeLayoutIndexFallback({
      sandboxHandle: handle,
      workspaceRoot: WORKSPACE_ROOT,
      gameId: "melee",
      worktreeCacheRoot: cacheRoot,
      args: ["--record", "HSD_GObj", "--mode", "near", "--json"],
      tempParent,
      runHostApi: async (args) => {
        apiCalls.push([...args]);
        return args.includes("--index-root")
          ? { parsed: { status: "ok", record: "HSD_GObj" } }
          : { parsed: { status: "index_not_built" } };
      },
      runHostRunner: async (args) => {
        mirrorContext = args[args.indexOf("--ctx") + 1];
        expect(readFileSync(mirrorContext, "utf8")).toBe("sandbox context");
        expect(args).toEqual([
          "--ctx",
          mirrorContext,
          "--skip-casts",
          "--project",
          "melee",
          "--out",
          cacheRoot,
        ]);
        return { exit_code: 0, parsed: { success: true } };
      },
    });

    expect(result).toEqual({ parsed: { status: "ok", record: "HSD_GObj" } });
    expect(provider.execCalls).toHaveLength(3);
    expect(provider.execCalls[0]).toMatchObject({
      command: ["python3", "-c", expect.stringContaining("objdiff.json")],
      opts: { cwd: WORKSPACE_ROOT, timeoutMs: 10_000 },
    });
    expect(provider.execCalls[1]).toMatchObject({
      command: ["test", "-f", CONTEXT],
      opts: { cwd: WORKSPACE_ROOT, timeoutMs: 10_000 },
    });
    expect(provider.execCalls[2]).toMatchObject({
      command: ["python3", "tools/m2ctx/m2ctx.py", "--quiet", "--preprocessor"],
      opts: { cwd: WORKSPACE_ROOT, timeoutMs: 120_000 },
    });
    expect(provider.downloadCalls.map(({ remotePath }) => remotePath)).toEqual([
      `${WORKSPACE_ROOT}/${CONTEXT}`,
    ]);
    expect(apiCalls).toEqual([
      ["--record", "HSD_GObj", "--mode", "near", "--json"],
      ["--record", "HSD_GObj", "--mode", "near", "--index-root", cacheRoot, "--json"],
    ]);
    expect(existsSync(resolve(mirrorContext, "../.."))).toBe(false);
    await rm(tempParent, { recursive: true, force: true });
  });

  test("does not build an SMS index from an arbitrary translation unit", async () => {
    const provider = new FakeSandboxProvider();
    const handle = await provider.create(createParams);
    const tempParent = await mkdtemp(resolve(tmpdir(), "type-layout-sms-test-"));
    provider.scriptExec(
      { exitCode: 0, stdout: layoutFixture("sms"), stderr: "" },
      { exitCode: 1, stdout: "", stderr: "" },
    );

    const result = await runSandboxTypeLayoutIndexFallback({
      sandboxHandle: handle,
      workspaceRoot: WORKSPACE_ROOT,
      gameId: "sms",
      worktreeCacheRoot: resolve(tempParent, "cache"),
      args: ["--mode", "summary", "--json"],
      tempParent,
      runHostApi: async (args) => args.includes("--index-root")
        ? { parsed: { status: "ok" } }
        : { parsed: { status: "index_not_built" } },
      runHostRunner: async () => ({ exit_code: 0, parsed: { success: true } }),
    });

    expect(result).toMatchObject({
      status: "type_index_build_failed",
      stage: "context_generation",
      error_summary: "tools/decompctx.py requires a source file, but the project layout has none",
    });
    expect(provider.execCalls).toHaveLength(2);
    await rm(tempParent, { recursive: true, force: true });
  });

  test("builds an SMS index from an existing prepared context", async () => {
    const provider = new FakeSandboxProvider();
    const handle = await provider.create(createParams);
    const tempParent = await mkdtemp(resolve(tmpdir(), "type-layout-sms-context-test-"));
    await handle.writeFile(`${WORKSPACE_ROOT}/${CONTEXT}`, "prepared sms context");
    provider.scriptExec(
      { exitCode: 0, stdout: layoutFixture("sms"), stderr: "" },
      { exitCode: 0, stdout: "", stderr: "" },
    );

    const result = await runSandboxTypeLayoutIndexFallback({
      sandboxHandle: handle,
      workspaceRoot: WORKSPACE_ROOT,
      gameId: "sms",
      worktreeCacheRoot: resolve(tempParent, "cache"),
      args: ["--mode", "summary", "--json"],
      tempParent,
      runHostApi: async (args) => args.includes("--index-root")
        ? { parsed: { status: "ok" } }
        : { parsed: { status: "index_not_built" } },
      runHostRunner: async (args) => {
        const contextPath = args[args.indexOf("--ctx") + 1];
        expect(readFileSync(contextPath, "utf8")).toBe("prepared sms context");
        return { exit_code: 0, parsed: { success: true } };
      },
    });

    expect(result).toEqual({ parsed: { status: "ok" } });
    expect(provider.execCalls).toHaveLength(2);
    expect(provider.downloadCalls.map(({ remotePath }) => remotePath)).toEqual([
      `${WORKSPACE_ROOT}/${CONTEXT}`,
    ]);
    await rm(tempParent, { recursive: true, force: true });
  });

  test("reuses an existing private index without touching the sandbox or runner", async () => {
    const provider = new FakeSandboxProvider();
    const handle = await provider.create(createParams);
    const tempParent = await mkdtemp(resolve(tmpdir(), "type-layout-cache-test-"));
    const cacheRoot = resolve(tempParent, "cache");
    await mkdir(resolve(cacheRoot, "indexes"), { recursive: true });
    await writeFile(resolve(cacheRoot, "indexes/type_layout_index.json"), "{}");
    let apiCalls = 0;
    let runnerCalls = 0;

    const result = await runSandboxTypeLayoutIndexFallback({
      sandboxHandle: handle,
      workspaceRoot: WORKSPACE_ROOT,
      gameId: "melee",
      worktreeCacheRoot: cacheRoot,
      args: ["--mode", "summary", "--json"],
      runHostApi: async (args) => {
        apiCalls += 1;
        return args.includes("--index-root")
          ? { parsed: { status: "ok", source: "worktree_cache" } }
          : { parsed: { status: "index_not_built" } };
      },
      runHostRunner: async () => {
        runnerCalls += 1;
        return {};
      },
    });

    expect(result).toEqual({ parsed: { status: "ok", source: "worktree_cache" } });
    expect(apiCalls).toBe(2);
    expect(runnerCalls).toBe(0);
    expect(provider.execCalls).toEqual([]);
    expect(provider.downloadCalls).toEqual([]);
    await rm(tempParent, { recursive: true, force: true });
  });

  test("returns a graceful build status when the host runner fails", async () => {
    const provider = new FakeSandboxProvider();
    const handle = await provider.create(createParams);
    const tempParent = await mkdtemp(resolve(tmpdir(), "type-layout-failure-test-"));
    await handle.writeFile(`${WORKSPACE_ROOT}/${CONTEXT}`, "sandbox context");
    provider.scriptExec(
      { exitCode: 0, stdout: layoutFixture("melee"), stderr: "" },
      { exitCode: 0, stdout: "", stderr: "" },
    );

    const result = await runSandboxTypeLayoutIndexFallback({
      sandboxHandle: handle,
      workspaceRoot: WORKSPACE_ROOT,
      gameId: "melee",
      worktreeCacheRoot: resolve(tempParent, "cache"),
      args: ["--json"],
      tempParent,
      runHostApi: async () => ({ parsed: { status: "index_not_built" } }),
      runHostRunner: async () => ({
        exit_code: 1,
        tool_error: true,
        error_summary: "clang: command not found",
      }),
    });

    expect(result.status).toBe("type_index_build_failed");
    expect(result.stage).toBe("host_runner");
    expect(result.tool_error).toBeUndefined();
    expect(result.error_summary).toBe("clang: command not found");
    await rm(tempParent, { recursive: true, force: true });
  });

  test("rejects caller-supplied paths and index roots before host or sandbox access", async () => {
    const provider = new FakeSandboxProvider();
    const handle = await provider.create(createParams);
    let hostCalls = 0;

    for (const args of [
      ["--record", "../../build/ctx.c", "--json"],
      ["--index-root", "/sandbox/workspace/cache", "--json"],
    ]) {
      const result = await runSandboxTypeLayoutIndexFallback({
        sandboxHandle: handle,
        workspaceRoot: WORKSPACE_ROOT,
        gameId: "melee",
        worktreeCacheRoot: "/host/cache",
        args,
        runHostApi: async () => {
          hostCalls += 1;
          return {};
        },
        runHostRunner: async () => {
          hostCalls += 1;
          return {};
        },
      });
      expect(result.tool_error).toBe(true);
      expect(result.error_kind).toBe("sandbox_fetch_contract_rejected");
    }

    expect(hostCalls).toBe(0);
    expect(provider.execCalls).toEqual([]);
  });
});
