import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WorkspaceExec } from "@server/infrastructure/shell";
import {
  configHunkAddresses,
  parseSplitUnitRanges,
  validateWidenedChange,
  type ScopedUnitCheckRunnerOptions,
  type WorkerChangeValidation,
} from "./change-validation.js";

function passedValidation(): WorkerChangeValidation {
  return {
    status: "passed",
    reasons: [],
    qaLint: null,
    target: {
      unit: "melee/ft/target.c",
      symbol: "Target",
      before: 80,
      after: 100,
      improved: true,
      exact: true,
    },
  };
}

const writeSetEntries = [
  { path: "src/melee/ft/target.c", category: "target-source", rung: 1, addedBy: "claim" },
  { path: "src/melee/lb/foreign.c", category: "foreign-source", rung: 4, addedBy: "widening", wideningId: "w-foreign" },
  { path: "include/melee/shared.h", category: "owning-header", rung: 3, addedBy: "widening", wideningId: "w-header" },
  { path: "config/GALE01/symbols.txt", category: "config-metadata", rung: 2, addedBy: "widening", wideningId: "w-config" },
] as const;

describe("validateWidenedChange", () => {
  test("dispatches target, foreign source, header blast, and config hunks to their scoped checks", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "widened-validation-"));
    const calls: ScopedUnitCheckRunnerOptions[] = [];
    const validation = await validateWidenedChange({
      validation: passedValidation(),
      repoRoot: "/repo",
      outputDir,
      attemptIndex: 2,
      targetSourcePath: "src/melee/ft/target.c",
      writeSetEntries: [...writeSetEntries],
      baseRev: "base-sha",
      runStateDir: "/state/runs/run-1",
      headerOwnerByPath: { "include/melee/shared.h": "src/melee/shared_owner.c" },
      runners: {
        resolveHeaderConsumers: async () => ({
          consumers: ["src/melee/direct_a.c", "src/melee/direct_b.c"],
          derivedFrom: "ninja-deps",
          truncated: false,
          cachePath: "/state/runs/run-1/consumer_map.base-sha.json",
        }),
        resolveConfigUnits: async () => ["src/melee/config_a.c", "src/melee/config_b.c"],
        checkUnit: async (options) => {
          calls.push(options);
          return {
            sourcePath: options.sourcePath,
            mode: options.mode,
            triggerPaths: options.triggerPaths,
            status: "passed",
            reasons: [],
          };
        },
      },
    });

    expect(calls.map(({ sourcePath, mode, triggerPaths }) => ({ sourcePath, mode, triggerPaths }))).toEqual([
      { sourcePath: "src/melee/config_a.c", mode: "section-measure", triggerPaths: ["config/GALE01/symbols.txt"] },
      { sourcePath: "src/melee/config_b.c", mode: "section-measure", triggerPaths: ["config/GALE01/symbols.txt"] },
      { sourcePath: "src/melee/direct_a.c", mode: "strict-object", triggerPaths: ["include/melee/shared.h"] },
      { sourcePath: "src/melee/direct_b.c", mode: "strict-object", triggerPaths: ["include/melee/shared.h"] },
      { sourcePath: "src/melee/lb/foreign.c", mode: "strict-object", triggerPaths: ["src/melee/lb/foreign.c"] },
      { sourcePath: "src/melee/shared_owner.c", mode: "strict-object", triggerPaths: ["include/melee/shared.h"] },
    ]);
    expect(calls.some((call) => call.sourcePath === "src/melee/ft/target.c")).toBe(false);
    expect(validation.status).toBe("passed");
    expect(validation.scopedChecks).toMatchObject({ status: "passed", verdict: "tentative" });
    expect(validation.scopedChecks?.consumerMaps).toEqual([
      {
        headerPath: "include/melee/shared.h",
        derivedFrom: "ninja-deps",
        consumers: ["src/melee/direct_a.c", "src/melee/direct_b.c"],
        truncated: false,
      },
    ]);
    const evidence = JSON.parse(await readFile(join(outputDir, "attempt-2.widened_validation.json"), "utf8")) as Record<string, unknown>;
    expect(evidence).toMatchObject({ status: "passed", verdict: "tentative" });
  });

  test("folds a scoped failure into a passed worker validation without discarding target evidence", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "widened-validation-fail-"));
    const validation = await validateWidenedChange({
      validation: passedValidation(),
      repoRoot: "/repo",
      outputDir,
      attemptIndex: 3,
      targetSourcePath: "src/melee/ft/target.c",
      writeSetEntries: [writeSetEntries[1]],
      baseRev: "base-sha",
      runStateDir: "/state/runs/run-1",
      runners: {
        checkUnit: async (options) => ({
          sourcePath: options.sourcePath,
          mode: options.mode,
          triggerPaths: options.triggerPaths,
          status: "failed",
          reasons: ["foreign unit is not byte-neutral"],
        }),
      },
    });

    expect(validation.status).toBe("failed");
    expect(validation.reasons).toContain("foreign unit is not byte-neutral");
    expect(validation.target).toMatchObject({ symbol: "Target", exact: true });
    expect(validation.scopedChecks).toMatchObject({ status: "failed", verdict: "rejected" });
  });

  test("an explicit consumer ceiling rejects a truncated scope and never requests a full build", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "widened-validation-cap-"));
    const calls: ScopedUnitCheckRunnerOptions[] = [];
    const validation = await validateWidenedChange({
      validation: passedValidation(),
      repoRoot: "/repo",
      outputDir,
      attemptIndex: 4,
      targetSourcePath: "src/melee/ft/target.c",
      writeSetEntries: [writeSetEntries[2]],
      baseRev: "base-sha",
      runStateDir: "/state/runs/run-1",
      maxConsumers: 1,
      runners: {
        resolveHeaderConsumers: async () => ({
          consumers: ["src/melee/direct_a.c"],
          derivedFrom: "grep-includes",
          truncated: true,
        }),
        resolveHeaderOwner: () => null,
        checkUnit: async (options) => {
          calls.push(options);
          return { sourcePath: options.sourcePath, mode: options.mode, triggerPaths: options.triggerPaths, status: "passed", reasons: [] };
        },
      },
    });

    expect(calls).toHaveLength(1);
    expect(validation.status).toBe("failed");
    expect(validation.reasons.join(" ")).toContain("explicit maxConsumers ceiling");
    expect(validation.reasons.join(" ")).toContain("no full-build escalation");
  });

  test("infers an owning-header source through sandbox workspace exec", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "widened-validation-sandbox-owner-"));
    const commands: string[][] = [];
    const checked: string[] = [];
    const workspaceExec: WorkspaceExec = {
      executionClass: "sandbox",
      exec: async (command) => {
        commands.push(command);
        return { exitCode: command.join(" ") === "test -f src/melee/shared.c" ? 0 : 1, stdout: "", stderr: "" };
      },
    };
    const validation = await validateWidenedChange({
      validation: passedValidation(),
      repoRoot: "/workspace/melee",
      outputDir,
      attemptIndex: 4,
      targetSourcePath: "src/melee/ft/target.c",
      writeSetEntries: [writeSetEntries[2]],
      baseRev: "base-sha",
      runStateDir: "/state/runs/run-1",
      workspaceExec,
      runners: {
        resolveHeaderConsumers: async () => ({ consumers: [], derivedFrom: "grep-includes", truncated: false }),
        checkUnit: async (options) => {
          checked.push(options.sourcePath);
          return { sourcePath: options.sourcePath, mode: options.mode, triggerPaths: options.triggerPaths, status: "passed", reasons: [] };
        },
      },
    });

    expect(commands).toContainEqual(["test", "-f", "src/melee/shared.c"]);
    expect(checked).toEqual(["src/melee/shared.c"]);
    expect(validation.scopedChecks?.status).toBe("passed");
  });

  test("skips widened dispatch until the existing target-unit validation passes", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "widened-validation-skip-"));
    let calls = 0;
    const validation = await validateWidenedChange({
      validation: { ...passedValidation(), status: "same_unit_regression", reasons: ["target neighbor regressed"] },
      repoRoot: "/repo",
      outputDir,
      attemptIndex: 5,
      targetSourcePath: "src/melee/ft/target.c",
      writeSetEntries: [writeSetEntries[1]],
      baseRev: "base-sha",
      runStateDir: "/state/runs/run-1",
      runners: {
        checkUnit: async (options) => {
          calls += 1;
          return { sourcePath: options.sourcePath, mode: options.mode, triggerPaths: options.triggerPaths, status: "passed", reasons: [] };
        },
      },
    });

    expect(calls).toBe(0);
    expect(validation.status).toBe("same_unit_regression");
    expect(validation.scopedChecks).toMatchObject({ status: "skipped", verdict: "not_run" });
  });
});

describe("config metadata scope helpers", () => {
  test("maps changed hunk addresses through old/new split ranges", () => {
    expect(configHunkAddresses("--- a/x\n+++ b/x\n@@ -1 +1 @@\n-Symbol = .data:0x80400010;\n+Symbol = .data:0x80400020; size:0x10\n")).toEqual([
      0x80400010,
      0x80400020,
    ]);
    expect(parseSplitUnitRanges([
      "Sections:",
      "  .text type:code align:4",
      "melee/ft/a.c:",
      "  .text start:0x80001000 end:0x80001100",
      "  .data start:0x80400000 end:0x80400100",
      "src/melee/ft/b.c:",
      "  .data start:0x80400100 end:0x80400200",
    ].join("\n"))).toEqual([
      { sourcePath: "src/melee/ft/a.c", start: 0x80001000, end: 0x80001100 },
      { sourcePath: "src/melee/ft/a.c", start: 0x80400000, end: 0x80400100 },
      { sourcePath: "src/melee/ft/b.c", start: 0x80400100, end: 0x80400200 },
    ]);
  });
});
