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

function layoutFixture(kind: "melee" | "sms"): string {
  if (kind === "sms") {
    return JSON.stringify({
      version: "GMSJ01",
      report_path: "build/GMSJ01/report.json",
      object_root: "build/GMSJ01/obj",
      asm_root: "build/GMSJ01/asm",
      context_script: "tools/decompctx.py",
      include_paths: [
        "include",
        "include/PowerPC_EABI_Support/Msl/MSL_C/MSL_Common",
        "include/PowerPC_EABI_Support/Msl/MSL_C++/MSL_Common",
        "build/GMSJ01/include",
      ],
      units: [{
        name: "mario/MarioUtil/MtxUtil",
        base_path: "build/GMSJ01/src/MarioUtil/MtxUtil.o",
        target_path: "build/GMSJ01/obj/MarioUtil/MtxUtil.o",
        source_path: "src/MarioUtil/MtxUtil.cpp",
      }],
    });
  }
  return JSON.stringify({
    version: "GALE01",
    report_path: "build/GALE01/report.json",
    object_root: "build/GALE01/obj",
    asm_root: "build/GALE01/asm",
    context_script: "tools/m2ctx/m2ctx.py",
    include_paths: [],
    units: [{
      name: "main/melee/lb/lbmemory",
      base_path: "build/GALE01/src/melee/lb/lbmemory.o",
      target_path: "build/GALE01/obj/melee/lb/lbmemory.o",
      source_path: "src/melee/lb/lbmemory.c",
    }],
  });
}

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

describe("sandbox m2c_decompile fetch-first shim", () => {
  test("discovers in-sandbox, generates missing context, and fetches only the matched object, asm, and ctx", async () => {
    const { provider, handle } = await fakeSandbox();
    await handle.writeFile(`${WORKSPACE_ROOT}/${MATCHED_OBJECT}`, "matched-object");
    await handle.writeFile(`${WORKSPACE_ROOT}/${MATCHED_ASM}`, "matched-assembly");
    provider.scriptExec(
      { exitCode: 0, stdout: layoutFixture("melee"), stderr: "" },
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
    expect(provider.execCalls).toHaveLength(4);
    expect(provider.execCalls[0].command[0]).toBe("python3");
    expect(provider.execCalls[0].command[1]).toBe("-c");
    expect(provider.execCalls[0].command[2]).toContain("objdiff.json");
    expect(provider.execCalls[0].opts).toEqual({ cwd: WORKSPACE_ROOT, timeoutMs: 10_000, env: undefined });
    expect(provider.execCalls[1].opts).toEqual({ cwd: WORKSPACE_ROOT, timeoutMs: 120_000, env: undefined });
    expect(provider.execCalls[1].command[0]).toBe("python3");
    expect(provider.execCalls[1].command[1]).toBe("-c");
    expect(provider.execCalls[1].command[2]).toContain("def has_function");
    expect(provider.execCalls[1].command.at(-2)).toBe("build/GALE01/obj");
    expect(provider.execCalls[1].command.at(-1)).toBe("lb_8000F000");
    expect(provider.execCalls[2]).toMatchObject({
      command: ["test", "-f", CONTEXT],
      opts: { cwd: WORKSPACE_ROOT, timeoutMs: 10_000 },
    });
    expect(provider.execCalls[3]).toMatchObject({
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

  test("uses SMS object and asm roots and generates context from the owning C++ source", async () => {
    const { provider, handle } = await fakeSandbox();
    const objectPath = "build/GMSJ01/obj/MarioUtil/MtxUtil.o";
    const assemblyPath = "build/GMSJ01/asm/MarioUtil/MtxUtil.s";
    await handle.writeFile(`${WORKSPACE_ROOT}/${objectPath}`, "sms-object");
    await handle.writeFile(`${WORKSPACE_ROOT}/${assemblyPath}`, "sms-assembly");
    provider.scriptExec(
      { exitCode: 0, stdout: layoutFixture("sms"), stderr: "" },
      { exitCode: 0, stdout: "MarioUtil/MtxUtil.o\n", stderr: "" },
      { exitCode: 1, stdout: "", stderr: "" },
      async () => {
        await handle.writeFile(`${WORKSPACE_ROOT}/${CONTEXT}`, "sms-context");
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    );

    let mirrorRoot = "";
    const result = await runRegisteredToolApi(
      runtimeContext(handle, "sms"),
      "m2c_decomp",
      "decompile.py",
      [
        "--repo-root",
        WORKSPACE_ROOT,
        "--input",
        "MtxToQuat__FPA4_fP10Quaternion",
        "--timeout-seconds",
        "120",
        "--json",
      ],
      {
        runCommand: async (_cwd, command) => {
          mirrorRoot = command[command.indexOf("--repo-root") + 1];
          expect(readFileSync(resolve(mirrorRoot, objectPath), "utf8")).toBe("sms-object");
          expect(readFileSync(resolve(mirrorRoot, assemblyPath), "utf8")).toBe("sms-assembly");
          expect(readFileSync(resolve(mirrorRoot, CONTEXT), "utf8")).toBe("sms-context");
          return { exitCode: 0, stdout: JSON.stringify({ status: "ok" }), stderr: "" };
        },
      },
    );

    expect(result.tool_error).toBeUndefined();
    expect(provider.execCalls[1].command.at(-2)).toBe("build/GMSJ01/obj");
    expect(provider.execCalls[3].command).toEqual([
      "python3",
      "tools/decompctx.py",
      "src/MarioUtil/MtxUtil.cpp",
      "-o",
      "build/ctx.c",
      "-I",
      "include",
      "-I",
      "include/PowerPC_EABI_Support/Msl/MSL_C/MSL_Common",
      "-I",
      "include/PowerPC_EABI_Support/Msl/MSL_C++/MSL_Common",
      "-I",
      "build/GMSJ01/include",
    ]);
    expect(provider.downloadCalls.map(({ remotePath }) => remotePath)).toEqual([
      `${WORKSPACE_ROOT}/${objectPath}`,
      `${WORKSPACE_ROOT}/${assemblyPath}`,
      `${WORKSPACE_ROOT}/${CONTEXT}`,
    ]);
    expect(existsSync(mirrorRoot)).toBe(false);
  });

  test("normalizes an SMS metadata unit before the host reads the mirrored assembly", async () => {
    const { provider, handle } = await fakeSandbox();
    const assemblyPath = "build/GMSJ01/asm/MarioUtil/MtxUtil.s";
    await handle.writeFile(`${WORKSPACE_ROOT}/${assemblyPath}`, "sms-assembly");
    await handle.writeFile(`${WORKSPACE_ROOT}/${CONTEXT}`, "sms-context");
    provider.scriptExec(
      { exitCode: 0, stdout: layoutFixture("sms"), stderr: "" },
      { exitCode: 0, stdout: "", stderr: "" },
      { exitCode: 0, stdout: "", stderr: "" },
    );

    let hostCommand: string[] = [];
    const result = await runRegisteredToolApi(
      runtimeContext(handle, "sms"),
      "m2c_decomp",
      "decompile.py",
      [
        "--repo-root",
        WORKSPACE_ROOT,
        "--input",
        "mario/MarioUtil/MtxUtil",
        "--timeout-seconds",
        "120",
        "--json",
      ],
      {
        runCommand: async (_cwd, command) => {
          hostCommand = [...command];
          return { exitCode: 0, stdout: JSON.stringify({ status: "ok" }), stderr: "" };
        },
      },
    );

    expect(result.tool_error).toBeUndefined();
    expect(hostCommand[hostCommand.indexOf("--input") + 1]).toBe("MarioUtil/MtxUtil");
    expect(provider.downloadCalls.map(({ remotePath }) => remotePath)).toEqual([
      `${WORKSPACE_ROOT}/${assemblyPath}`,
      `${WORKSPACE_ROOT}/${CONTEXT}`,
    ]);
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
