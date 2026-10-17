import { describe, expect, spyOn, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CommandResult, WorkspaceExec } from "@server/infrastructure/shell";
import type { StackCheckRunner } from "@server/core/validation/stack/stack-check.js";
import {
  captureWorkerChangeBaseline,
  validateWorkerChange,
  type WorkerChangeBaseline,
  type WorkerUnitScoreSnapshot,
} from "./change-validation.js";
import { useHostReportPlacement } from "./host-report-placement.test-support.js";

// Fake workspaces here serve whole objdiff reports and symbols.txt: explicit host report placement.
useHostReportPlacement();

// SMS layout: unit `mario/<object>`, compiled `build/GMSJ01/src/<object>.o`, target `build/GMSJ01/obj/<object>.o`.
const UNIT = "mario/M3DUtil/MActor";
const SYMBOL = "setLightData__6MActorFv";
const SOURCE = "src/M3DUtil/MActor.cpp";
const COMPILED = "build/GMSJ01/src/M3DUtil/MActor.o";
const TARGET_OBJ = "build/GMSJ01/obj/M3DUtil/MActor.o";
const REFERENCE = "build/.stack_ref/build__GMSJ01__src__M3DUtil__MActor.o";
const VALIDATION = { reportPath: "build/GMSJ01/report.json" };
const NO_GATES = { sectionParity: false, undefinedSymbols: false, bannedIdioms: false, formatting: false, symbolValidation: false };

function snapshot(score: number): WorkerUnitScoreSnapshot {
  return {
    schemaVersion: 1,
    capturedAt: "2026-10-13T00:00:00.000Z",
    unit: UNIT,
    symbol: SYMBOL,
    sourcePath: SOURCE,
    objectTarget: COMPILED,
    metrics: [],
    functions: [{ name: SYMBOL, score }],
    sections: [],
    targetScore: score,
  };
}

/** Sandbox that builds the object and reports `afterScore` for the target. */
function sandbox(afterScore: number): WorkspaceExec {
  const report = JSON.stringify({ left: { sections: [], symbols: [{ name: SYMBOL, match_percent: afterScore, size: 64, instructions: [] }] } });
  return {
    exec: async (command: string[]): Promise<CommandResult> => {
      if (command[0] === "build/tools/objdiff-cli") return { exitCode: 0, stdout: report, stderr: "" };
      if (command[0] === "cat") return { exitCode: 1, stdout: "", stderr: "absent" };
      return { exitCode: 0, stdout: "", stderr: "" };
    },
  } as WorkspaceExec;
}

type Fn = { name: string; class: string; frame_a?: number; frame_b?: number };

/** stack_check.py stub: `objects` answers per object pair, `hunks` answers a fixed verdict list. */
function stackChecker(answers: { remaining?: Fn[]; perturbation?: Fn[]; data?: string; hunks?: unknown; fail?: boolean }) {
  const calls: string[][] = [];
  const runner: StackCheckRunner = async (args) => {
    calls.push(args);
    if (answers.fail) return { exitCode: 2, stdout: "", stderr: "stack_check.py: No such file" };
    if (args[0] === "hunks") return { exitCode: 0, stdout: JSON.stringify(answers.hunks ?? { hunks: [] }), stderr: "" };
    const pair = `${args[1]} ${args[2]}`;
    if (pair === `${COMPILED} ${TARGET_OBJ}`) return { exitCode: 0, stdout: JSON.stringify({ functions: answers.remaining ?? [], data: "identical" }), stderr: "" };
    if (pair === `${REFERENCE} ${COMPILED}`) return { exitCode: 0, stdout: JSON.stringify({ functions: answers.perturbation ?? [], data: answers.data ?? "identical" }), stderr: "" };
    return { exitCode: 1, stdout: "", stderr: `unexpected ${args.join(" ")}` };
  };
  return { runner, calls };
}

const ONE_HUNK_DIFF = `diff --git a/${SOURCE} b/${SOURCE}\n--- a/${SOURCE}\n+++ b/${SOURCE}\n@@ -10,3 +10,4 @@ void MActor::setLightData()\n+    int pad;\n`;
const TWO_HUNK_DIFF = `${ONE_HUNK_DIFF}@@ -40,2 +41,2 @@ void MActor::setLightData()\n-    x = y;\n+    x = z;\n`;

async function attempt(params: {
  policy?: "match_frame" | "stop_at_frame";
  before: number;
  after: number;
  checker: ReturnType<typeof stackChecker>;
  diff?: string;
}) {
  const baseline: WorkerChangeBaseline = {
    status: "available",
    reasons: [],
    snapshot: snapshot(params.before),
    firstDiff: null,
    objectTarget: COMPILED,
    stackReferenceObject: params.policy === "stop_at_frame" ? REFERENCE : undefined,
  };
  return validateWorkerChange({
    repoRoot: `/work/sms-${Math.random()}`,
    hostRepoRoot: "/host/sms",
    outputDir: await mkdtemp(join(tmpdir(), "stack-policy-attempt-")),
    attemptIndex: 0,
    baseline,
    target: { unit: UNIT, symbol: SYMBOL, source_path: SOURCE },
    dryRun: false,
    shouldRun: true,
    claimedExact: false,
    validation: VALIDATION,
    microGateFlags: NO_GATES,
    postAttemptDiffText: params.diff ?? ONE_HUNK_DIFF,
    baseRevision: "abc123",
    workspaceExec: sandbox(params.after),
    stackFramePolicy: params.policy,
    stackCheckRunner: params.checker.runner,
  });
}

describe("validateWorkerChange stack-frame policy", () => {
  test("match_frame (Melee) never runs the stack checker and keeps a frame-only gain", async () => {
    const checker = stackChecker({ perturbation: [{ name: SYMBOL, class: "stack_only" }] });
    const validation = await attempt({ policy: "match_frame", before: 90, after: 95, checker });
    expect(checker.calls).toEqual([]);
    expect(validation.status).toBe("passed");
    expect(validation.stackPolicy).toBeUndefined();
  });

  test("stop_at_frame marks an accepted attempt whose remaining diff is only the frame as stack-only", async () => {
    const checker = stackChecker({
      remaining: [{ name: SYMBOL, class: "stack_only", frame_a: 0x38, frame_b: 0x40 }],
      perturbation: [{ name: SYMBOL, class: "code" }],
    });
    const validation = await attempt({ policy: "stop_at_frame", before: 80, after: 97, checker });
    expect(validation.status).toBe("passed");
    expect(validation.stackPolicy?.targetStackOnly).toBe(true);
    expect(validation.stackPolicy?.remaining).toEqual({ class: "stack_only", frameCompiled: 0x38, frameTarget: 0x40 });
  });

  test("stop_at_frame rejects an attempt whose every change is a stack-frame move, with repair feedback", async () => {
    const checker = stackChecker({
      remaining: [{ name: SYMBOL, class: "stack_only" }],
      perturbation: [{ name: SYMBOL, class: "stack_only" }, { name: "other__6MActorFv", class: "identical" }],
    });
    const validation = await attempt({ policy: "stop_at_frame", before: 90, after: 95, checker });
    expect(validation.status).toBe("stack_only_perturbation");
    const reason = validation.reasons.find((entry) => entry.startsWith("stack_only_perturbation"));
    expect(reason).toContain(`only moved the stack frame of ${SYMBOL}`);
    expect(reason).toContain("SMS bans");
    expect(reason).toContain("Revert this edit");
    expect(reason).toContain("or stop");
  });

  test("a data change makes the edit normal matching, not a perturbation", async () => {
    const checker = stackChecker({ perturbation: [{ name: SYMBOL, class: "stack_only" }], data: "differs" });
    const validation = await attempt({ policy: "stop_at_frame", before: 90, after: 95, checker });
    expect(validation.status).toBe("passed");
  });

  test("stop_at_frame names a stack-only hunk found by the leave-one-out check", async () => {
    const checker = stackChecker({
      perturbation: [{ name: SYMBOL, class: "code" }],
      hunks: { hunks: [
        { id: "h0", file: SOURCE, index: 0, base: { start: 10, count: 3 }, head: { start: 10, count: 4 }, effect: "stack_only", decision: "drop_stack_only" },
        { id: "h1", file: SOURCE, index: 1, base: { start: 40, count: 2 }, head: { start: 41, count: 2 }, effect: "code", decision: "keep" },
      ] },
    });
    const validation = await attempt({ policy: "stop_at_frame", before: 90, after: 95, checker, diff: TWO_HUNK_DIFF });
    expect(validation.status).toBe("stack_only_perturbation");
    expect(validation.reasons.join("\n")).toContain(`hunk ${SOURCE} @@ -10,3 +10,4 @@ only moved the stack frame`);
    expect(checker.calls.find((args) => args[0] === "hunks")).toEqual(["hunks", "--repo", ".", "--base", "abc123", "--header-scope", "changed", "--json", "--files", SOURCE]);
  });

  test("skips the per-hunk check above the hunk budget", async () => {
    const manyHunks = ONE_HUNK_DIFF + Array.from({ length: 9 }, (_, i) => `@@ -${100 + i},1 +${100 + i},1 @@\n-a\n+b\n`).join("");
    const checker = stackChecker({ perturbation: [{ name: SYMBOL, class: "code" }], hunks: { hunks: [{ file: SOURCE, index: 0, effect: "stack_only" }] } });
    const validation = await attempt({ policy: "stop_at_frame", before: 90, after: 95, checker, diff: manyHunks });
    expect(validation.status).toBe("passed");
    expect(validation.stackPolicy?.hunks).toMatchObject({ status: "skipped", count: 10 });
    expect(checker.calls.some((args) => args[0] === "hunks")).toBe(false);
  });

  test("fails open when the checker is unavailable", async () => {
    const warn = spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const validation = await attempt({ policy: "stop_at_frame", before: 90, after: 95, checker: stackChecker({ fail: true }) });
      expect(validation.status).toBe("passed");
      expect(validation.stackPolicy).toMatchObject({ status: "unavailable", rejected: false, targetStackOnly: false });
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});

describe("captureWorkerChangeBaseline stack-frame policy", () => {
  test("stop_at_frame keeps the pre-worker object as reference and classifies the target", async () => {
    const commands: string[][] = [];
    const exec = sandbox(90);
    const workspaceExec = { exec: async (command: string[]) => { commands.push(command); return exec.exec(command); } } as WorkspaceExec;
    const checker = stackChecker({ remaining: [{ name: SYMBOL, class: "stack_only", frame_a: 0x30, frame_b: 0x28 }] });
    const baseline = await captureWorkerChangeBaseline({
      repoRoot: `/work/sms-${Math.random()}`,
      outputDir: await mkdtemp(join(tmpdir(), "stack-policy-baseline-")),
      target: { unit: UNIT, symbol: SYMBOL, source_path: SOURCE },
      validation: VALIDATION,
      workspaceExec,
      stackFramePolicy: "stop_at_frame",
      stackCheckRunner: checker.runner,
    });
    expect(commands).toContainEqual(["cp", COMPILED, REFERENCE]);
    expect(baseline.stackReferenceObject).toBe(REFERENCE);
    expect(baseline.stackRemaining).toEqual({ class: "stack_only", frameCompiled: 0x30, frameTarget: 0x28 });
  });
});
