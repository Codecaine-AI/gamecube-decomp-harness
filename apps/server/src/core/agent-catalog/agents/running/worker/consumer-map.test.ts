import { describe, expect, test } from "bun:test";
import {
  consumerMapCachePath,
  isHeaderDependency,
  parseNinjaDeps,
  parseObjdiffObjectSources,
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

// Super Mario Sunshine shape: C++ TUs, `.hpp` headers, and configure.py's libs remap
// (object `build/GMSJ01/src/JSystem/x.o` is built from `libs/JSystem/src/x.cpp`, but
// the compiler depfile names `src/JSystem/x.cpp`, which does not exist).
const SMS_NINJA_DEPS = `build/GMSJ01/config.json: #deps 2, deps mtime 1 (VALID)
    orig/GMSJ01/sys/main.dol
    config/GMSJ01/splits.txt

build/GMSJ01/src/System/MenuDir.o: #deps 5, deps mtime 2 (VALID)
    src/System/MenuDir.cpp
    build/GMSJ01/include/SMS.mch
    include/System/MenuDir.hpp
    include/types.h
    libs/PowerPC_EABI_Support/include/PowerPC_EABI_Support/Msl/MSL_C++/MSL_Common/new

build/GMSJ01/src/JSystem/JKernel/JKRArchivePri.o: #deps 4, deps mtime 3 (VALID)
    src/JSystem/JKernel/JKRArchivePri.cpp
    include/JSystem/JKernel/JKRArchive.hpp
    include/System/MenuDir.hpp
    include/types.h

build/GMSJ01/src/PowerPC_EABI_Support/Runtime/__mem.o: #deps 2, deps mtime 4 (VALID)
    src/PowerPC_EABI_Support/Runtime/__mem.c
    include/types.h

build/GMSJ01/src/Unlisted/Thing.o: #deps 1, deps mtime 5 (VALID)
    include/types.h
`;

const SMS_OBJDIFF = JSON.stringify({
  units: [
    { name: "main/System/MenuDir", base_path: "build/GMSJ01/src/System/MenuDir.o", metadata: { source_path: "src/System/MenuDir.cpp" } },
    {
      name: "mario/JSystem/JKernel/JKRArchivePri",
      base_path: "build/GMSJ01/src/JSystem/JKernel/JKRArchivePri.o",
      metadata: { source_path: "libs/JSystem/src/JKernel/JKRArchivePri.cpp" },
    },
    {
      name: "runtime/__mem",
      base_path: "build/GMSJ01/src/PowerPC_EABI_Support/Runtime/__mem.o",
      metadata: { source_path: "libs/PowerPC_EABI_Support/src/Runtime/__mem.c" },
    },
    { name: "no-source", base_path: "build/GMSJ01/src/NoSource.o", metadata: {} },
  ],
});

describe("C++ and libs/ translation units", () => {
  test("maps .hpp and .h headers to real repo-relative sources via objdiff.json", () => {
    const objectSources = parseObjdiffObjectSources(SMS_OBJDIFF, "/work/sms");
    expect(parseNinjaDeps(SMS_NINJA_DEPS, "/work/sms", objectSources)).toEqual({
      "include/JSystem/JKernel/JKRArchive.hpp": ["libs/JSystem/src/JKernel/JKRArchivePri.cpp"],
      "include/System/MenuDir.hpp": ["libs/JSystem/src/JKernel/JKRArchivePri.cpp", "src/System/MenuDir.cpp"],
      "include/types.h": [
        "libs/JSystem/src/JKernel/JKRArchivePri.cpp",
        "libs/PowerPC_EABI_Support/src/Runtime/__mem.c",
        "src/System/MenuDir.cpp",
      ],
      "libs/PowerPC_EABI_Support/include/PowerPC_EABI_Support/Msl/MSL_C++/MSL_Common/new": ["src/System/MenuDir.cpp"],
    });
  });

  test("never invents a .c source for a C++ game when the deps omit the source", () => {
    const consumers = parseNinjaDeps(SMS_NINJA_DEPS, "/work/sms");
    expect(consumers["include/types.h"]).not.toContain("src/Unlisted/Thing.c");
    expect(consumers["include/System/MenuDir.hpp"]).toEqual(["src/JSystem/JKernel/JKRArchivePri.cpp", "src/System/MenuDir.cpp"]);
  });

  test("classifies header dependencies", () => {
    for (const path of ["include/a.h", "include/a.hpp", "include/a.hh", "include/a.hxx", "include/a.inc", "include/a.tpp", "libs/x/include/new"]) {
      expect(isHeaderDependency(path)).toBe(true);
    }
    for (const path of ["src/a.cpp", "src/a.c", "build/GMSJ01/include/SMS.mch", "config/GMSJ01/splits.txt", "orig/GMSJ01/sys/main.dol"]) {
      expect(isHeaderDependency(path)).toBe(false);
    }
  });

  test("resolves a .hpp header through Ninja deps plus objdiff.json", async () => {
    const commands: string[][] = [];
    const runCommand: ConsumerMapCommandRunner = async (_cwd, command) => {
      commands.push(command);
      if (command[0] === "ninja") return { exitCode: 0, stdout: SMS_NINJA_DEPS, stderr: "" };
      if (command[0] === "cat") return { exitCode: 0, stdout: SMS_OBJDIFF, stderr: "" };
      throw new Error(`unexpected ${command.join(" ")}`);
    };
    const resolved = await resolveHeaderConsumers({
      repoRoot: "/work/sms",
      runStateDir: "/state/runs/run-sms",
      baseRev: "sms1",
      headerPath: "include/System/MenuDir.hpp",
      runCommand,
      fileOps: memoryFileOps(),
    });
    expect(resolved.consumers).toEqual(["libs/JSystem/src/JKernel/JKRArchivePri.cpp", "src/System/MenuDir.cpp"]);
    expect(resolved.derivedFrom).toBe("ninja-deps");
    expect(commands).toEqual([["ninja", "-t", "deps"], ["cat", "objdiff.json"]]);
  });

  test("grep fallback accepts C++ and libs/ sources", async () => {
    const runCommand: ConsumerMapCommandRunner = async (_cwd, command) => {
      if (command[0] === "ninja") return { exitCode: 1, stdout: "", stderr: "" };
      return {
        exitCode: 0,
        stdout: ["src/System/MenuDir.cpp", "libs/JSystem/src/JKernel/JKRArchivePri.cpp", "include/System/Other.hpp", ""].join("\n"),
        stderr: "",
      };
    };
    const resolved = await resolveHeaderConsumers({
      repoRoot: "/work/sms",
      runStateDir: "/state/runs/run-sms-grep",
      baseRev: "sms2",
      headerPath: "include/System/MenuDir.hpp",
      runCommand,
      fileOps: memoryFileOps(),
    });
    expect(resolved.consumers).toEqual(["libs/JSystem/src/JKernel/JKRArchivePri.cpp", "src/System/MenuDir.cpp"]);
    expect(resolved.derivedFrom).toBe("grep-includes");
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
      ["grep", "-rl", "--include=*.c", "--include=*.cp", "--include=*.cpp", "--include=*.cc", "--include=*.cxx", "-F", "shared.h", "src", "libs"],
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
    const runCommand: ConsumerMapCommandRunner = async (_cwd, command) => {
      if (command[0] !== "ninja") return { exitCode: 1, stdout: "", stderr: "no objdiff.json" };
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
