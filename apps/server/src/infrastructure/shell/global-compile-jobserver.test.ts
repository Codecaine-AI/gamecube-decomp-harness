import { describe, expect, test } from "bun:test";
import {
  configureGlobalCompileJobserver,
  fifoTokenCount,
  GLOBAL_COMPILE_SLOTS_ENV,
  globalCompileEnvironment,
  globalCompileJobserverPaths,
  ninjaSupportsFifoJobserver,
  normalizeNinjaArgsForJobserver,
  parseGlobalCompileSlots,
  withGlobalCompileJobserverSlot,
} from "./global-compile-jobserver.js";

describe("global compile jobserver configuration", () => {
  test("is inert when ORCH_GLOBAL_COMPILE_SLOTS is absent", async () => {
    const env: NodeJS.ProcessEnv = { PATH: "/usr/bin:/bin" };
    const before = { ...env };

    expect(await configureGlobalCompileJobserver({ env })).toEqual({ enabled: false });
    expect(env).toEqual(before);
  });

  test("parses a bounded explicit slot budget", () => {
    expect(parseGlobalCompileSlots(undefined)).toBeNull();
    expect(parseGlobalCompileSlots("10")).toBe(10);
    expect(parseGlobalCompileSlots(" 2 ")).toBe(2);
    expect(() => parseGlobalCompileSlots("0")).toThrow("must be an integer");
    expect(() => parseGlobalCompileSlots("2.5")).toThrow("must be an integer");
  });

  test("recognizes the Ninja FIFO jobserver minimum version", () => {
    expect(ninjaSupportsFifoJobserver("1.12.1")).toBe(false);
    expect(ninjaSupportsFifoJobserver("1.13.0")).toBe(true);
    expect(ninjaSupportsFifoJobserver("1.13.2\n")).toBe(true);
    expect(ninjaSupportsFifoJobserver("2.0.0")).toBe(true);
  });

  test("injects one stable FIFO and an idempotent PATH wrapper", () => {
    const paths = globalCompileJobserverPaths("/tmp/jobserver-test", 501);
    const first = globalCompileEnvironment({
      currentPath: "/usr/local/bin:/usr/bin",
      paths,
      realNinjaPath: "/usr/local/bin/ninja",
      slots: 10,
    });
    const second = globalCompileEnvironment({
      currentPath: first.PATH,
      paths,
      realNinjaPath: "/usr/local/bin/ninja",
      slots: 10,
    });

    expect(first.MAKEFLAGS).toBe(`--jobserver-auth=fifo:${paths.fifoPath}`);
    expect(first.ORCH_GLOBAL_COMPILE_SLOTS).toBe("10");
    expect(first.ORCH_GLOBAL_NINJA_REAL).toBe("/usr/local/bin/ninja");
    expect(first.PATH).toBe(`${paths.binDir}:/usr/local/bin:/usr/bin`);
    expect(second.PATH).toBe(first.PATH);
  });

  test("accounts for every Ninja implicit slot and removes unsafe explicit parallelism", () => {
    expect(fifoTokenCount(10)).toBe(10);
    expect(normalizeNinjaArgsForJobserver(["-j12", "changes_all"])).toEqual(["changes_all"]);
    expect(normalizeNinjaArgsForJobserver(["--jobs", "8", "all"])).toEqual(["all"]);
    expect(normalizeNinjaArgsForJobserver(["-j", "1", "one.o"])).toEqual(["-j", "1", "one.o"]);
    expect(normalizeNinjaArgsForJobserver(["-j", "not-a-count"])).toEqual(["-j", "not-a-count"]);
  });

  test("holds and releases a host slot around remote compile work", async () => {
    const order: string[] = [];
    const compile = withGlobalCompileJobserverSlot(
      async () => {
        order.push("compile");
        throw new Error("remote build failed");
      },
      {
        env: { [GLOBAL_COMPILE_SLOTS_ENV]: "2" },
        acquire: async () => {
          order.push("acquire");
          return () => {
            order.push("release");
          };
        },
      },
    );

    await expect(compile).rejects.toThrow("remote build failed");
    expect(order).toEqual(["acquire", "compile", "release"]);
  });

  test("does not reserve a slot when global compile admission is disabled", async () => {
    const order: string[] = [];
    const result = await withGlobalCompileJobserverSlot(
      async () => {
        order.push("compile");
        return "done";
      },
      {
        env: {},
        acquire: async () => {
          order.push("acquire");
          return () => {
            order.push("release");
          };
        },
      },
    );

    expect(result).toBe("done");
    expect(order).toEqual(["compile"]);
  });
});
