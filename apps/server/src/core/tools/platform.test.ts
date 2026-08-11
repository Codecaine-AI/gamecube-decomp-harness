import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import {
  hostToolPlatform,
  requiredStateToolArtifactError,
  resolveStateToolArtifact,
  resolveToolPlatform,
  stateToolArtifactCandidates,
} from "./platform.js";

const tempDirs: string[] = [];

function tempDir(): string {
  const path = mkdtempSync(join(tmpdir(), "tool-platform-"));
  tempDirs.push(path);
  return path;
}

afterEach(() => {
  for (const path of tempDirs) rmSync(path, { recursive: true, force: true });
  tempDirs.length = 0;
});

describe("tool platform resolution", () => {
  test("maps supported hosts to tool artifact platforms", () => {
    expect(hostToolPlatform("darwin", "arm64")).toBe("darwin-x86_64");
    expect(hostToolPlatform("darwin", "x64")).toBe("darwin-x86_64");
    expect(hostToolPlatform("linux", "ia32")).toBe("linux-i686");
    expect(hostToolPlatform("linux", "x64")).toBe("linux-x86_64");
  });

  test("uses the environment override before an explicit execution target", () => {
    expect(
      resolveToolPlatform({
        override: "linux-i686",
        targetPlatform: "linux-x86_64",
        hostPlatform: "darwin",
        hostArch: "arm64",
      }),
    ).toBe("linux-i686");
  });

  test("reads ORCH_TOOL_PLATFORM from the process environment", () => {
    const original = process.env.ORCH_TOOL_PLATFORM;
    process.env.ORCH_TOOL_PLATFORM = "linux-x86_64";
    try {
      expect(resolveToolPlatform()).toBe("linux-x86_64");
    } finally {
      if (original === undefined) delete process.env.ORCH_TOOL_PLATFORM;
      else process.env.ORCH_TOOL_PLATFORM = original;
    }
  });

  test("defaults to the host and rejects invalid overrides", () => {
    expect(resolveToolPlatform({ override: null, hostPlatform: "darwin", hostArch: "arm64" })).toBe("darwin-x86_64");
    expect(() => resolveToolPlatform({ override: "linux-arm64" })).toThrow("Invalid ORCH_TOOL_PLATFORM");
  });
});

describe("state tool artifact layout", () => {
  test("prefers the platform-suffixed artifact", () => {
    const stateDir = tempDir();
    const legacy = resolve(stateDir, "tools", "wibo");
    const specific = resolve(stateDir, "tools", "wibo-darwin-x86_64");
    mkdirSync(resolve(stateDir, "tools"), { recursive: true });
    writeFileSync(legacy, "legacy");
    writeFileSync(specific, "specific");

    expect(
      resolveStateToolArtifact({ stateDir, name: "wibo", platform: "darwin-x86_64", hostPlatform: "darwin", hostArch: "arm64" }),
    ).toBe(specific);
  });

  test("falls back to existing unsuffixed file and directory layouts on the host", () => {
    const stateDir = tempDir();
    const direct = resolve(stateDir, "tools", "wibo");
    const versioned = resolve(stateDir, "tools", "wibo-1.2.0-opt1", "wibo");
    mkdirSync(resolve(stateDir, "tools", "wibo-1.2.0-opt1"), { recursive: true });
    writeFileSync(direct, "direct");
    writeFileSync(versioned, "versioned");

    expect(
      resolveStateToolArtifact({ stateDir, name: "wibo", platform: "darwin-x86_64", hostPlatform: "darwin", hostArch: "arm64" }),
    ).toBe(direct);
    expect(
      resolveStateToolArtifact({
        stateDir,
        name: "wibo-1.2.0-opt1",
        platform: "darwin-x86_64",
        relativePath: "wibo",
        hostPlatform: "darwin",
        hostArch: "arm64",
      }),
    ).toBe(versioned);
  });

  test("does not offer an unsuffixed host artifact to a cross-platform target", () => {
    const stateDir = tempDir();
    const legacy = resolve(stateDir, "tools", "wibo");
    mkdirSync(resolve(stateDir, "tools"), { recursive: true });
    writeFileSync(legacy, "Mach-O fixture");
    const options = {
      stateDir,
      name: "wibo",
      platform: "linux-x86_64" as const,
      hostPlatform: "darwin",
      hostArch: "arm64",
    };

    expect(stateToolArtifactCandidates(options)).toEqual([resolve(stateDir, "tools", "wibo-linux-x86_64")]);
    expect(resolveStateToolArtifact(options)).toBeNull();
    expect(requiredStateToolArtifactError(options).message).toContain(resolve(stateDir, "tools", "wibo-linux-x86_64"));
    expect(requiredStateToolArtifactError(options).message).toContain("only a fallback for the host tool platform darwin-x86_64");
  });
});
