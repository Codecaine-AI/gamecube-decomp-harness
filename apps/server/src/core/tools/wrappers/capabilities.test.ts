import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { mwccDebugCompilerProvisioned } from "./mwcc-debug-capability.js";

describe("MWCC-debug compiler capability", () => {
  test("cached sandbox probe results override the host filesystem both ways", async () => {
    const hostRepoRoot = await mkdtemp(resolve(tmpdir(), "mwcc-debug-capability-"));
    const compilerPath = resolve(
      hostRepoRoot,
      "build/compilers/GC/2.7/mwcceppc_debug.exe",
    );
    await mkdir(resolve(compilerPath, ".."), { recursive: true });
    await writeFile(compilerPath, "instrumented");

    try {
      expect(mwccDebugCompilerProvisioned({
        repoRoot: hostRepoRoot,
        mwccDebugProvisioned: false,
      })).toBeFalse();
      expect(mwccDebugCompilerProvisioned({
        repoRoot: resolve(hostRepoRoot, "missing-sandbox-path"),
        mwccDebugProvisioned: true,
      })).toBeTrue();
    } finally {
      await rm(hostRepoRoot, { recursive: true, force: true });
    }
  });

  test("falls back to the host filesystem when no sandbox result is present", async () => {
    const hostRepoRoot = await mkdtemp(resolve(tmpdir(), "mwcc-debug-host-fallback-"));
    const compilerPath = resolve(
      hostRepoRoot,
      "build/compilers/GC/2.7/mwcceppc_debug.exe",
    );
    await mkdir(resolve(compilerPath, ".."), { recursive: true });
    await writeFile(compilerPath, "instrumented");

    try {
      expect(mwccDebugCompilerProvisioned({ repoRoot: hostRepoRoot })).toBeTrue();
      expect(mwccDebugCompilerProvisioned({ repoRoot: resolve(hostRepoRoot, "missing") })).toBeFalse();
    } finally {
      await rm(hostRepoRoot, { recursive: true, force: true });
    }
  });
});
