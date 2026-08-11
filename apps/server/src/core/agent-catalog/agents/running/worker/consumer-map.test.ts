import { describe, expect, test } from "bun:test";
import {
  consumerMapCachePath,
  parseNinjaDeps,
  resolveHeaderConsumers,
  type ConsumerMapCommandRunner,
  type ConsumerMapFileOps,
} from "./consumer-map.js";

function memoryFileOps(): ConsumerMapFileOps & { files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    files,
    async mkdir() {},
    async readFile(path) {
      const value = files.get(path);
      if (value === undefined) throw new Error(`ENOENT: ${path}`);
      return value;
    },
    async writeFile(path, data) {
      files.set(path, data);
    },
  };
}

const NINJA_DEPS = `build/GALE01/src/melee/ft/ft_a.o: #deps 4, deps mtime 123 (VALID)
    src/melee/ft/ft_a.c
    include/melee/common.h
    include/melee/shared.h
    include/melee/shared.h

build/GALE01/src/melee/gr/gr_b.o: #deps 3, deps mtime 456 (VALID)
    src/melee/gr/gr_b.c
    include/melee/shared.h
    include/melee/ground.h
`;

describe("parseNinjaDeps", () => {
  test("inverts dependency blocks into sorted repo-relative source consumers", () => {
    expect(parseNinjaDeps(NINJA_DEPS, "/work/melee")).toEqual({
      "include/melee/common.h": ["src/melee/ft/ft_a.c"],
      "include/melee/ground.h": ["src/melee/gr/gr_b.c"],
      "include/melee/shared.h": ["src/melee/ft/ft_a.c", "src/melee/gr/gr_b.c"],
    });
  });

  test("derives the source path from the object target when deps omit the source", () => {
    const output = `build/GALE01/src/melee/it/item.o: #deps 1, deps mtime 1 (VALID)
    include/melee/item.h
`;
    expect(parseNinjaDeps(output, "/work/melee")).toEqual({
      "include/melee/item.h": ["src/melee/it/item.c"],
    });
  });
});

describe("resolveHeaderConsumers", () => {
  test("falls back to grep when Ninja deps are unavailable and applies only an explicit ceiling", async () => {
    const fileOps = memoryFileOps();
    const commands: string[][] = [];
    const runCommand: ConsumerMapCommandRunner = async (_cwd, command) => {
      commands.push(command);
      if (command[0] === "ninja") return { exitCode: 1, stdout: "", stderr: "loading deps failed" };
      return {
        exitCode: 0,
        stdout: ["src/melee/ft/ft_c.c", "src/melee/ft/ft_a.c", "src/melee/ft/ft_b.c", "src/melee/ft/ft_a.c", ""].join("\n"),
        stderr: "",
      };
    };

    const uncapped = await resolveHeaderConsumers({
      repoRoot: "/work/melee",
      runStateDir: "/state/runs/run-1",
      baseRev: "abc123",
      headerPath: "include/melee/shared.h",
      runCommand,
      fileOps,
    });
    expect(uncapped).toEqual({
      consumers: ["src/melee/ft/ft_a.c", "src/melee/ft/ft_b.c", "src/melee/ft/ft_c.c"],
      derivedFrom: "grep-includes",
      truncated: false,
      cachePath: "/state/runs/run-1/consumer_map.abc123.json",
    });
    expect(commands).toEqual([
      ["ninja", "-t", "deps"],
      ["grep", "-rl", "--include=*.c", "-F", "shared.h", "src"],
    ]);

    const capped = await resolveHeaderConsumers({
      repoRoot: "/work/melee",
      runStateDir: "/state/runs/run-1",
      baseRev: "abc123",
      headerPath: "include/melee/shared.h",
      maxConsumers: 2,
      runCommand,
      fileOps,
    });
    expect(capped.consumers).toEqual(["src/melee/ft/ft_a.c", "src/melee/ft/ft_b.c"]);
    expect(capped.truncated).toBe(true);
    expect(commands).toHaveLength(2);
  });

  test("caches the complete Ninja reverse map per base revision", async () => {
    const fileOps = memoryFileOps();
    let calls = 0;
    const runCommand: ConsumerMapCommandRunner = async () => {
      calls += 1;
      return { exitCode: 0, stdout: NINJA_DEPS, stderr: "" };
    };
    const options = {
      repoRoot: "/work/melee",
      runStateDir: "/state/runs/run-2",
      baseRev: "def456",
      runCommand,
      fileOps,
    };

    const first = await resolveHeaderConsumers({ ...options, headerPath: "include/melee/shared.h" });
    const second = await resolveHeaderConsumers({ ...options, headerPath: "include/melee/ground.h" });
    const absent = await resolveHeaderConsumers({ ...options, headerPath: "include/melee/absent.h" });

    expect(first.consumers).toEqual(["src/melee/ft/ft_a.c", "src/melee/gr/gr_b.c"]);
    expect(second.consumers).toEqual(["src/melee/gr/gr_b.c"]);
    expect(absent.consumers).toEqual([]);
    expect(first.derivedFrom).toBe("ninja-deps");
    expect(calls).toBe(1);
    expect(fileOps.files.has(consumerMapCachePath(options.runStateDir, options.baseRev))).toBe(true);

    await resolveHeaderConsumers({ ...options, baseRev: "next-rev", headerPath: "include/melee/shared.h" });
    expect(calls).toBe(2);
  });
});
