import { describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  DEFAULT_MWCC_CACHE_DIR,
  installMwccCacheShim,
  mwccCacheWrapperScript,
  resolveMwccCacheSettings,
  selectMwccCacheMode,
} from "./mwcc-cache.js";

describe("MWCC cache mode selection", () => {
  test("defaults to off and accepts the three documented modes", () => {
    expect(selectMwccCacheMode(undefined)).toBe("off");
    expect(selectMwccCacheMode("")).toBe("off");
    expect(selectMwccCacheMode("off")).toBe("off");
    expect(selectMwccCacheMode("verify")).toBe("verify");
    expect(selectMwccCacheMode("on")).toBe("on");
  });

  test("rejects unsupported values and selects the shared default directory", () => {
    expect(() => selectMwccCacheMode("true")).toThrow("expected one of off, verify, on");
    expect(resolveMwccCacheSettings({ ORCH_MWCC_CACHE: "verify" })).toEqual({
      cacheDir: DEFAULT_MWCC_CACHE_DIR,
      mode: "verify",
    });
    expect(resolveMwccCacheSettings({ ORCH_MWCC_CACHE: "on", MWCC_CACHE_DIR: "/var/cache/mwcc" })).toEqual({
      cacheDir: "/var/cache/mwcc",
      mode: "on",
    });
  });
});

describe("mwccCacheWrapperScript", () => {
  test("bakes cache and verification settings into the Ninja-visible wrapper", () => {
    const script = mwccCacheWrapperScript({
      cacheDir: "/tmp/cache with spaces",
      mode: "verify",
      realWiboPath: "/worktree/build/tools/wibo-real",
      shimPath: "/orchestrator/toolpacks/gamecube-decomp/_impl/gamecube/tools/mwcc_objcache.py",
    });

    expect(script).toContain("export MWCC_CACHE_DIR='/tmp/cache with spaces'");
    expect(script).toContain("export MWCC_CACHE_REAL_WIBO='/worktree/build/tools/wibo-real'");
    expect(script).toContain("export MWCC_CACHE_VERIFY='1'");
    expect(script).toContain("exec 'python3' '/orchestrator/toolpacks/gamecube-decomp/_impl/gamecube/tools/mwcc_objcache.py' \"$@\"");
  });

  test("clears inherited verification in on mode", () => {
    const script = mwccCacheWrapperScript({
      cacheDir: DEFAULT_MWCC_CACHE_DIR,
      mode: "on",
      realWiboPath: "/worktree/build/tools/wibo-real",
      shimPath: "/orchestrator/mwcc_objcache.py",
    });

    expect(script).toContain("unset MWCC_CACHE_VERIFY");
    expect(script).not.toContain("export MWCC_CACHE_VERIFY='1'");
  });

  test("does not generate a wrapper for off mode", () => {
    expect(() =>
      mwccCacheWrapperScript({
        cacheDir: DEFAULT_MWCC_CACHE_DIR,
        mode: "off",
        realWiboPath: "/worktree/build/tools/wibo-real",
        shimPath: "/orchestrator/mwcc_objcache.py",
      }),
    ).toThrow("ORCH_MWCC_CACHE is off");
  });
});

describe("installMwccCacheShim", () => {
  test("does no work in off mode", () => {
    expect(
      installMwccCacheShim("/path/that/does/not/exist", {
        settings: { cacheDir: DEFAULT_MWCC_CACHE_DIR, mode: "off" },
      }),
    ).toBe(false);
  });

  test("uses the canonical installer to preserve wibo-real before writing the wrapper", () => {
    const worktreeDir = mkdtempSync(join(tmpdir(), "mwcc-cache-install-"));
    try {
      const toolsDir = resolve(worktreeDir, "build/tools");
      mkdirSync(toolsDir, { recursive: true });
      writeFileSync(resolve(toolsDir, "wibo"), "real-wibo-fixture\n");
      chmodSync(resolve(toolsDir, "wibo"), 0o755);

      expect(
        installMwccCacheShim(worktreeDir, {
          settings: { cacheDir: "/tmp/test-mwcc-cache", mode: "verify" },
        }),
      ).toBe(true);

      expect(readFileSync(resolve(toolsDir, "wibo-real"), "utf8")).toBe("real-wibo-fixture\n");
      expect(readFileSync(resolve(toolsDir, "wibo"), "utf8")).toContain("export MWCC_CACHE_VERIFY='1'");
      expect(existsSync(resolve(toolsDir, "wibo"))).toBe(true);
    } finally {
      rmSync(worktreeDir, { recursive: true, force: true });
    }
  });
});
