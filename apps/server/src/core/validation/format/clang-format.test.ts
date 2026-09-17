import { describe, expect, test } from "bun:test";
import type { CommandResult } from "@server/infrastructure/shell/run-command.js";
import {
  changedSourcePathsFromDiff,
  clangFormatVersionMismatch,
  formatViolationReasons,
  formattableSourcePaths,
  parseClangFormatViolations,
  parseClangFormatVersion,
  runClangFormatApply,
  runClangFormatCheck,
} from "./clang-format.js";

const ok = (stdout = "", stderr = ""): CommandResult => ({ exitCode: 0, stdout, stderr });
const VIOLATION = "src/Enemy/foo.cpp:12:5: error: code should be clang-formatted [-Wclang-format-violations]";

function fakeExec(handlers: { version?: string; check?: CommandResult; apply?: CommandResult; names?: string; diff?: string }, calls: string[][] = []) {
  return async (command: string[]): Promise<CommandResult> => {
    calls.push(command);
    if (command[0] === "clang-format" && command[1] === "--version") return ok(handlers.version ?? "clang-format version 21.1.8\n");
    if (command[0] === "clang-format" && command[1] === "--dry-run") return handlers.check ?? ok();
    if (command[0] === "clang-format" && command[1] === "-i") return handlers.apply ?? ok();
    if (command[0] === "git" && command[2] === "--name-only") return ok(handlers.names ?? "");
    if (command[0] === "git" && command[1] === "diff") return ok(handlers.diff ?? "");
    return { exitCode: 127, stdout: "", stderr: `unexpected ${command.join(" ")}` };
  };
}

describe("clang-format parsing", () => {
  test("keeps only C/C++ sources, normalized and de-duplicated", () => {
    expect(formattableSourcePaths(["./src/a.cpp", "src/a.cpp", "include\\b.hpp", "config/symbols.txt", "src/c.c", "README.md", "", "src/d.h"]))
      .toEqual(["include/b.hpp", "src/a.cpp", "src/c.c", "src/d.h"]);
  });
  test("reads post-image paths out of a git diff", () => {
    const diff = "diff --git a/src/x.cpp b/src/x.cpp\n--- a/src/x.cpp\n+++ b/src/x.cpp\n@@ -1 +1 @@\n-a\n+b\ndiff --git a/config/splits.txt b/config/splits.txt\n";
    expect(changedSourcePathsFromDiff(diff)).toEqual(["src/x.cpp"]);
  });
  test("parses the version and violation lines", () => {
    expect(parseClangFormatVersion("clang-format version 21.1.8 (https://github.com/llvm/llvm-project)")).toBe("21.1.8");
    expect(parseClangFormatVersion("nope")).toBeNull();
    expect(parseClangFormatViolations(`${VIOLATION}\nsrc/Enemy/foo.cpp:40:1: error: code should be clang-formatted [-Wclang-format-violations]\nsome noise\n`))
      .toEqual([
        { file: "src/Enemy/foo.cpp", line: 12, message: "code should be clang-formatted" },
        { file: "src/Enemy/foo.cpp", line: 40, message: "code should be clang-formatted" },
      ]);
  });
  test("reasons are one per file, sorted, capped", () => {
    const violations = Array.from({ length: 25 }, (_, index) => ({ file: `src/f${String(index).padStart(2, "0")}.cpp`, line: 3, message: "x" }));
    violations.push({ file: "src/f00.cpp", line: 1, message: "x" });
    const reasons = formatViolationReasons(violations);
    expect(reasons).toHaveLength(21);
    expect(reasons[0]).toBe("src/f00.cpp:1: code should be clang-formatted");
    expect(reasons.at(-1)).toBe("5 more unformatted file(s) omitted");
  });
  test("version mismatch messages", () => {
    expect(clangFormatVersionMismatch("21.1.8", "21.1.8")).toBeNull();
    expect(clangFormatVersionMismatch("22.1.5", "21.1.8")).toContain("does not match");
    expect(clangFormatVersionMismatch(null, "21.1.8")).toContain("did not report");
  });
});

describe("runClangFormatCheck", () => {
  test("reports violations with the sandbox tool version and runs from the checkout root", async () => {
    const calls: string[][] = [];
    const result = await runClangFormatCheck({ files: ["src/Enemy/foo.cpp", "docs/x.md"], exec: fakeExec({ check: { exitCode: 1, stdout: "", stderr: VIOLATION } }, calls) });
    expect(result).toMatchObject({ status: "violations", version: "21.1.8", files: ["src/Enemy/foo.cpp"], toolError: null });
    expect(result.violations).toEqual([{ file: "src/Enemy/foo.cpp", line: 12, message: "code should be clang-formatted" }]);
    expect(calls[1]).toEqual(["clang-format", "--dry-run", "--Werror", "--style=file", "--fallback-style=none", "--", "src/Enemy/foo.cpp"]);
  });
  test("is clean when the dry run exits 0", async () => {
    const result = await runClangFormatCheck({ files: ["src/a.cpp"], exec: fakeExec({}) });
    expect(result).toMatchObject({ status: "clean", version: "21.1.8", violations: [] });
  });
  test("a missing tool or unparseable failure is tool_unavailable", async () => {
    const missing = await runClangFormatCheck({ files: ["src/a.cpp"], exec: async () => ({ exitCode: 127, stdout: "", stderr: "clang-format: not found" }) });
    expect(missing.status).toBe("tool_unavailable");
    expect(missing.toolError).toContain("not found");
    const styleError = await runClangFormatCheck({ files: ["src/a.cpp"], exec: fakeExec({ check: { exitCode: 1, stdout: "", stderr: "Configuration file(s) do(es) not support C++" } }) });
    expect(styleError.status).toBe("tool_unavailable");
    expect(styleError.toolError).toContain("Configuration file");
  });
  test("skips the dry run when nothing is formattable", async () => {
    const calls: string[][] = [];
    const result = await runClangFormatCheck({ files: ["config/symbols.txt"], exec: fakeExec({}, calls) });
    expect(result.status).toBe("clean");
    expect(calls).toHaveLength(1);
  });
});

describe("runClangFormatApply", () => {
  test("formats in place and returns the resulting diff", async () => {
    const calls: string[][] = [];
    const diff = "diff --git a/src/a.cpp b/src/a.cpp\n--- a/src/a.cpp\n+++ b/src/a.cpp\n@@ -1 +1 @@\n-int  x;\n+int x;\n";
    const result = await runClangFormatApply({ files: ["src/a.cpp", "src/b.hpp"], exec: fakeExec({ names: "src/a.cpp\n", diff }, calls) });
    expect(result).toMatchObject({ status: "changed", version: "21.1.8", changedFiles: ["src/a.cpp"], diff, toolError: null });
    expect(calls[1]).toEqual(["clang-format", "-i", "--style=file", "--fallback-style=none", "--", "src/a.cpp", "src/b.hpp"]);
  });
  test("reports unchanged trees and tool failures", async () => {
    expect((await runClangFormatApply({ files: ["src/a.cpp"], exec: fakeExec({}) })).status).toBe("unchanged");
    const failed = await runClangFormatApply({ files: ["src/a.cpp"], exec: fakeExec({ apply: { exitCode: 1, stdout: "", stderr: "boom" } }) });
    expect(failed).toMatchObject({ status: "tool_unavailable", diff: "" });
    expect(failed.toolError).toContain("boom");
  });
});
