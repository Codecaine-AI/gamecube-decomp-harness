import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import { FakeSandboxProvider, type SandboxCreateParams } from "@server/core/job-queue/sandbox.js";
import { resolveSandboxProjectLayout } from "./sandbox-project-layout.js";

const createParams: SandboxCreateParams = {
  snapshot: "project-layout-test",
  labels: { game_id: "fixture", claim_id: "claim-layout" },
  resources: { cpu: 1, memoryGiB: 1, diskGiB: 1 },
  ttlMinutes: 10,
};

async function runProbe(fixtureRoot: string) {
  const provider = new FakeSandboxProvider();
  const handle = await provider.create(createParams);
  provider.scriptExec(async (call) => {
    const child = Bun.spawn(call.command, { cwd: fixtureRoot, stdout: "pipe", stderr: "pipe" });
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    return { exitCode, stdout, stderr };
  });
  return resolveSandboxProjectLayout(handle, "/sandbox/workspace");
}

describe("sandbox project layout probe", () => {
  test("reads SMS paths and the C++ source from objdiff.json", async () => {
    const fixtureRoot = await mkdtemp(resolve(tmpdir(), "sms-project-layout-"));
    await mkdir(resolve(fixtureRoot, "build/GMSJ01/include"), { recursive: true });
    await mkdir(resolve(fixtureRoot, "include/PowerPC_EABI_Support/Msl/MSL_C/MSL_Common"), { recursive: true });
    await mkdir(resolve(fixtureRoot, "include/PowerPC_EABI_Support/Msl/MSL_C++/MSL_Common"), { recursive: true });
    await mkdir(resolve(fixtureRoot, "tools"), { recursive: true });
    await writeFile(resolve(fixtureRoot, "tools/decompctx.py"), "");
    await writeFile(resolve(fixtureRoot, "build/GMSJ01/report.json"), JSON.stringify({ units: [] }));
    await writeFile(resolve(fixtureRoot, "objdiff.json"), JSON.stringify({
      units: [{
        name: "mario/MarioUtil/MtxUtil",
        base_path: "build/GMSJ01/src/MarioUtil/MtxUtil.o",
        target_path: "build/GMSJ01/obj/MarioUtil/MtxUtil.o",
        metadata: { source_path: "src/MarioUtil/MtxUtil.cpp" },
      }],
    }));

    const layout = await runProbe(fixtureRoot);

    expect(layout).toMatchObject({
      version: "GMSJ01",
      reportPath: "build/GMSJ01/report.json",
      objectRoot: "build/GMSJ01/obj",
      asmRoot: "build/GMSJ01/asm",
      contextScript: "tools/decompctx.py",
      includePaths: [
        "include",
        "include/PowerPC_EABI_Support/Msl/MSL_C/MSL_Common",
        "include/PowerPC_EABI_Support/Msl/MSL_C++/MSL_Common",
        "build/GMSJ01/include",
      ],
      units: [{
        name: "mario/MarioUtil/MtxUtil",
        basePath: "build/GMSJ01/src/MarioUtil/MtxUtil.o",
        targetPath: "build/GMSJ01/obj/MarioUtil/MtxUtil.o",
        sourcePath: "src/MarioUtil/MtxUtil.cpp",
      }],
    });
    await rm(fixtureRoot, { recursive: true, force: true });
  });

  test("falls back to a Melee report and preserves the main unit mapping", async () => {
    const fixtureRoot = await mkdtemp(resolve(tmpdir(), "melee-project-layout-"));
    await mkdir(resolve(fixtureRoot, "build/GALE01"), { recursive: true });
    await mkdir(resolve(fixtureRoot, "tools/m2ctx"), { recursive: true });
    await writeFile(resolve(fixtureRoot, "tools/m2ctx/m2ctx.py"), "");
    await writeFile(resolve(fixtureRoot, "build/GALE01/report.json"), JSON.stringify({
      units: [{
        name: "main/melee/lb/lbcommand",
        metadata: { source_path: "src/melee/lb/lbcommand.c" },
      }],
    }));

    const layout = await runProbe(fixtureRoot);

    expect(layout).toMatchObject({
      version: "GALE01",
      reportPath: "build/GALE01/report.json",
      objectRoot: "build/GALE01/obj",
      asmRoot: "build/GALE01/asm",
      contextScript: "tools/m2ctx/m2ctx.py",
      units: [{
        name: "main/melee/lb/lbcommand",
        basePath: "build/GALE01/src/melee/lb/lbcommand.o",
        targetPath: "build/GALE01/obj/melee/lb/lbcommand.o",
        sourcePath: "src/melee/lb/lbcommand.c",
      }],
    });
    await rm(fixtureRoot, { recursive: true, force: true });
  });
});
