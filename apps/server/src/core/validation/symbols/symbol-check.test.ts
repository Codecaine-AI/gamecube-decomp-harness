import { describe, expect, test } from "bun:test";
import type { CommandResult } from "@server/infrastructure/shell/run-command.js";
import {
  SYMBOL_BASELINE_WORKTREE,
  changedCppPathsFromDiff,
  parseSymbolCheckOutput,
  runSymbolCheck,
  symbolCheckSourcePaths,
  symbolValidationReasons,
  type SymbolCheckResult,
} from "./symbol-check.js";

const ok = (stdout = "", stderr = ""): CommandResult => ({ exitCode: 0, stdout, stderr });
const RULE = "=".repeat(72);
const CONFIG = { script: "tools/check-changed-symbol-order.py", map: "orig/GMSJ01/files/mario.MAP" };
const OBJDIFF = JSON.stringify({ units: [
  { name: "mario/GC2D/ConsoleStr", base_path: "build/GMSJ01/src/GC2D/ConsoleStr.o", metadata: { source_path: "src/GC2D/ConsoleStr.cpp" } },
  { name: "mario/System/MarNameRefGen", base_path: "build/GMSJ01/src/System/MarNameRefGen.o", metadata: { source_path: "src/System/MarNameRefGen.cpp" } },
] });

function section(source: string, unit: string, body: string): string {
  return `\n${RULE}\n${source}  ->  ${unit}\n${RULE}\nUnit        : ${unit}\nSource      : ${source}\n${"-".repeat(78)}\n${body}\n`;
}

const REGRESSED = section("src/GC2D/ConsoleStr.cpp", "mario/GC2D/ConsoleStr", [
  "[FAIL] 1 map symbol(s) MISSING from the object:",
  "  - SMS_isGetShine__FUlUlb",
  "[ OK ] Symbol order matches the map.",
  "-".repeat(78),
  "Baseline object: /tmp/symbol-baseline/build/GMSJ01/src/GC2D/ConsoleStr.o",
  "Symbol regressions: 1 new, 2 inherited, 0 resolved.",
  "[NEW] missing | SMS_isGetShine__FUlUlb",
  "RESULT: FAIL (new symbol-validation errors)",
].join("\n"));
const PASSED = section("src/System/MarNameRefGen.cpp", "mario/System/MarNameRefGen", [
  "[ OK ] All map symbols are present in the object.",
  "-".repeat(78),
  "Symbol regressions: 0 new, 0 inherited, 1 resolved.",
  "RESULT: PASS (no symbol-validation regressions)",
].join("\n"));
const SUMMARY = `\n${RULE}\nSymbol-order check: 1 passed, 1 failed, 1 skipped.\n\nFailed:\n  - src/GC2D/ConsoleStr.cpp  (mario/GC2D/ConsoleStr)\n`;

describe("symbol-check parsing", () => {
  test("keeps only .cpp sources, normalized and de-duplicated", () => {
    expect(symbolCheckSourcePaths(["./src/a.cpp", "src/a.cpp", "include/b.hpp", "src\\c.cpp", "src/d.c", ""]))
      .toEqual(["src/a.cpp", "src/c.cpp"]);
    const diff = "diff --git a/src/x.cpp b/src/x.cpp\n--- a/src/x.cpp\n+++ b/src/x.cpp\ndiff --git a/include/x.hpp b/include/x.hpp\n";
    expect(changedCppPathsFromDiff(diff)).toEqual(["src/x.cpp"]);
  });

  test("reads per-unit counts, [NEW] lines, RESULT, skips and driver failures", () => {
    const stdout = `skip  src/notes.cpp  (not a tracked decomp unit)\nFAIL  src/broken.cpp  (mario/Enemy/broken: object not built)${REGRESSED}${PASSED}${SUMMARY}`;
    const units = parseSymbolCheckOutput(stdout);
    expect(units.map((unit) => [unit.source, unit.status])).toEqual([
      ["src/notes.cpp", "skipped"], ["src/broken.cpp", "error"], ["src/GC2D/ConsoleStr.cpp", "failed"], ["src/System/MarNameRefGen.cpp", "passed"],
    ]);
    expect(units[1]).toMatchObject({ unit: "mario/Enemy/broken", message: "object not built" });
    expect(units[2]).toMatchObject({
      unit: "mario/GC2D/ConsoleStr", newErrors: 1, inheritedErrors: 2, resolvedErrors: 0,
      newLines: ["missing | SMS_isGetShine__FUlUlb"], result: "FAIL (new symbol-validation errors)",
      failLines: ["[FAIL] 1 map symbol(s) MISSING from the object:", "- SMS_isGetShine__FUlUlb"],
    });
    expect(units[3]).toMatchObject({ newErrors: 0, resolvedErrors: 1, result: "PASS (no symbol-validation regressions)" });
  });

  test("a validator that could not run marks its section as an error", () => {
    const stdout = section("src/GC2D/ConsoleStr.cpp", "mario/GC2D/ConsoleStr", "") + "FAIL  src/GC2D/ConsoleStr.cpp  (mario/GC2D/ConsoleStr: check could not run -- see message above)\n";
    const [unit] = parseSymbolCheckOutput(stdout);
    expect(unit).toMatchObject({ status: "error", message: "check could not run -- see message above", result: null });
    const strict = parseSymbolCheckOutput(section("src/New.cpp", "mario/New", "[FAIL] 2 map symbol(s) MISSING from the object:\n  - a__Fv\n  - b__Fv (UNUSED)\n[ OK ] Symbol order matches the map.\n\nRESULT: FAIL (1 error category/categories)"));
    expect(strict[0]).toMatchObject({ status: "failed", newErrors: null, newLines: [], failLines: ["[FAIL] 2 map symbol(s) MISSING from the object:", "- a__Fv", "- b__Fv (UNUSED)"] });
  });

  test("reasons name the unit, list the [NEW] lines capped at 20, and end with the fix hint", () => {
    const units = parseSymbolCheckOutput(REGRESSED + PASSED);
    const many = Array.from({ length: 25 }, (_, index) => `order | f${index} | g${index}`);
    units[0]!.newLines.push(...many);
    units[0]!.newErrors = 26;
    const result = { status: "regressions", units } as SymbolCheckResult;
    const reasons = symbolValidationReasons(result);
    expect(reasons[0]).toBe("mario/GC2D/ConsoleStr (src/GC2D/ConsoleStr.cpp): 26 new symbol-validation error(s); RESULT: FAIL (new symbol-validation errors)");
    expect(reasons[1]).toBe("src/GC2D/ConsoleStr.cpp: [NEW] missing | SMS_isGetShine__FUlUlb");
    expect(reasons).toHaveLength(1 + 20 + 1 + 1);
    expect(reasons[21]).toBe("6 more symbol-validation line(s) omitted");
    expect(reasons.at(-1)).toContain("validate-symbol-order.py -u mario/GC2D/ConsoleStr");
    expect(reasons.at(-1)).toContain("MISSING means define the map symbol");
    expect(symbolValidationReasons({ status: "clean", units: [units[1]!] } as SymbolCheckResult)).toEqual([]);
  });
});

interface FakeSandbox { files: Set<string>; calls: string[][]; driver?: CommandResult; ninja?: CommandResult; baselineObjdiff?: string }

function fakeExec(sandbox: FakeSandbox) {
  return async (command: string[], options?: { env?: Record<string, string | undefined> }): Promise<CommandResult> => {
    sandbox.calls.push(options?.env?.NM ? [...command, `NM=${options.env.NM}`] : command);
    const [head] = command;
    if (head === "sh" && command[1] === "-c" && command[2]!.startsWith("for f in")) {
      return ok(command.slice(4).filter((path) => !sandbox.files.has(path)).join("\n"));
    }
    if (head === "git" && command[1] === "rev-parse") return ok("abc123blob\n");
    if (head === "cat" && command[1] === "objdiff.json") return ok(OBJDIFF);
    if (head === "cat") return ok(sandbox.baselineObjdiff ?? OBJDIFF);
    if (head === "ninja") return sandbox.ninja ?? ok("ninja: no work to do.\n");
    if (head === "git" && command[1] === "worktree") return ok();
    if (head === "rm" || head === "ln" || (head === "sh" && command[2]!.startsWith("mkdir -p"))) return ok();
    if (head === "sh" && command[2]!.startsWith("cd ")) { sandbox.files.add(`${SYMBOL_BASELINE_WORKTREE}/objdiff.json`); return ok(); }
    if (head === "git" && command[1] === "ls-tree") return ok(command.slice(4).filter((file) => file !== "src/System/MarNameRefGen.cpp").join("\n"));
    if (head === "python3") return sandbox.driver ?? { exitCode: 1, stdout: REGRESSED + PASSED + SUMMARY, stderr: "" };
    return { exitCode: 127, stdout: "", stderr: `unexpected ${command.join(" ")}` };
  };
}

const IMAGE_FILES = ["orig/GMSJ01/files/mario.MAP", "tools/check-changed-symbol-order.py", "tools/validate-symbol-order.py", "build/binutils/powerpc-eabi-nm", "objdiff.json"];

describe("runSymbolCheck", () => {
  const params = (sandbox: FakeSandbox, baseline: { dir?: string; revision?: string }) => ({
    files: ["src/GC2D/ConsoleStr.cpp", "src/System/MarNameRefGen.cpp", "include/x.hpp"],
    config: CONFIG, baseline, repoRoot: "/work/sms", version: "GMSJ01", exec: fakeExec(sandbox),
  });

  test("uses provided baseline objects, builds HEAD objects, and runs the checkout's driver with NM set", async () => {
    const sandbox: FakeSandbox = { files: new Set([...IMAGE_FILES, "/tmp/symbol-baseline/objdiff.json", "/tmp/symbol-baseline/build/GMSJ01/src/GC2D/ConsoleStr.o", "/tmp/symbol-baseline/build/GMSJ01/src/System/MarNameRefGen.o"]), calls: [] };
    const result = await runSymbolCheck(params(sandbox, { dir: "/tmp/symbol-baseline", revision: "base1" }));
    expect(result).toMatchObject({
      status: "regressions", files: ["src/GC2D/ConsoleStr.cpp", "src/System/MarNameRefGen.cpp"], mapPath: "orig/GMSJ01/files/mario.MAP",
      validator: { script: "tools/check-changed-symbol-order.py", revision: "abc123blob" },
      baseline: { revision: "base1", dir: "/tmp/symbol-baseline", source: "provided" }, driverExitCode: 1, toolError: null,
    });
    expect(result.units.map((unit) => unit.status)).toEqual(["failed", "passed"]);
    expect(sandbox.calls).toContainEqual(["ninja", "build/GMSJ01/src/GC2D/ConsoleStr.o", "build/GMSJ01/src/System/MarNameRefGen.o"]);
    expect(sandbox.calls.at(-1)).toEqual(["python3", "tools/check-changed-symbol-order.py", "--baseline-dir", "/tmp/symbol-baseline", "src/GC2D/ConsoleStr.cpp", "src/System/MarNameRefGen.cpp", "NM=/work/sms/build/binutils/powerpc-eabi-nm"]);
    expect(sandbox.calls.some((call) => call[1] === "worktree")).toBe(false);
  });

  test("builds the baseline in a detached worktree like upstream CI when no objects are provided", async () => {
    const sandbox: FakeSandbox = { files: new Set(IMAGE_FILES), calls: [], driver: ok(PASSED + section("src/GC2D/ConsoleStr.cpp", "mario/GC2D/ConsoleStr", "RESULT: PASS")) };
    const result = await runSymbolCheck(params(sandbox, { revision: "base1" }));
    expect(result.status).toBe("clean");
    expect(result.baseline).toEqual({ revision: "base1", dir: SYMBOL_BASELINE_WORKTREE, source: "worktree_build" });
    expect(sandbox.calls).toContainEqual(["git", "worktree", "add", "--force", "--detach", SYMBOL_BASELINE_WORKTREE, "base1"]);
    const link = sandbox.calls.find((call) => call[0] === "sh" && call[2]!.startsWith("mkdir -p"))!;
    expect(link.slice(3)).toEqual(["sh", "/work/sms", SYMBOL_BASELINE_WORKTREE, "GMSJ01"]);
    const configure = sandbox.calls.find((call) => call[0] === "sh" && call[2]!.startsWith("cd "))!;
    expect(configure.slice(5)).toEqual(["--map", "--version", "GMSJ01", "--wrapper", "/work/sms/build/tools/wibo", "--dtk", "/work/sms/build/tools/dtk", "--objdiff", "/work/sms/build/tools/objdiff-cli", "--compilers", "/work/sms/build/compilers", "--binutils", "/work/sms/build/binutils", "--sjiswrap", "/work/sms/build/tools/sjiswrap.exe"]);
    expect(sandbox.calls).toContainEqual(["ninja", "-C", SYMBOL_BASELINE_WORKTREE, "build.ninja"]);
    // MarNameRefGen.cpp does not exist at the baseline, so only ConsoleStr's baseline object is built.
    expect(sandbox.calls).toContainEqual(["ninja", "-C", SYMBOL_BASELINE_WORKTREE, "build/GMSJ01/src/GC2D/ConsoleStr.o"]);
    expect(sandbox.calls.at(-1)?.slice(0, 4)).toEqual(["python3", "tools/check-changed-symbol-order.py", "--baseline-dir", SYMBOL_BASELINE_WORKTREE]);
  });

  test("is tool_unavailable when the map, objdiff.json, the build, or the driver is unusable", async () => {
    const noMap: FakeSandbox = { files: new Set(IMAGE_FILES.filter((file) => !file.endsWith(".MAP"))), calls: [] };
    expect((await runSymbolCheck(params(noMap, { revision: "b" }))).toolError).toContain("linker map orig/GMSJ01/files/mario.MAP is missing");
    const noBuild: FakeSandbox = { files: new Set(IMAGE_FILES), calls: [], ninja: { exitCode: 1, stdout: "", stderr: "FAILED: compile" } };
    expect((await runSymbolCheck(params(noBuild, { revision: "b" }))).toolError).toContain("object build for the changed units failed");
    const noBaseline: FakeSandbox = { files: new Set(IMAGE_FILES), calls: [] };
    expect((await runSymbolCheck(params(noBaseline, {}))).toolError).toContain("no baseline objects or revision");
    const couldNotRun: FakeSandbox = { files: new Set(IMAGE_FILES), calls: [], driver: { exitCode: 1, stdout: section("src/GC2D/ConsoleStr.cpp", "mario/GC2D/ConsoleStr", "") + "FAIL  src/GC2D/ConsoleStr.cpp  (mario/GC2D/ConsoleStr: check could not run -- see message above)\n" + PASSED, stderr: "could not find map TU" } };
    const failed = await runSymbolCheck(params(couldNotRun, { revision: "b" }));
    expect(failed.status).toBe("tool_unavailable");
    expect(failed.toolError).toContain("src/GC2D/ConsoleStr.cpp (check could not run");
    expect(failed.toolError).toContain("could not find map TU");
  });

  test("is clean without .cpp changes or tracked units and never touches the sandbox for nothing", async () => {
    const sandbox: FakeSandbox = { files: new Set(IMAGE_FILES), calls: [] };
    expect((await runSymbolCheck({ ...params(sandbox, { revision: "b" }), files: ["include/x.hpp"] })).status).toBe("clean");
    expect(sandbox.calls).toEqual([]);
    const untracked = await runSymbolCheck({ ...params(sandbox, { revision: "b" }), files: ["src/Unknown.cpp"] });
    expect(untracked.status).toBe("clean");
    expect(untracked.units).toEqual([expect.objectContaining({ source: "src/Unknown.cpp", status: "skipped" })]);
    expect(sandbox.calls.some((call) => call[0] === "ninja")).toBe(false);
  });
});
