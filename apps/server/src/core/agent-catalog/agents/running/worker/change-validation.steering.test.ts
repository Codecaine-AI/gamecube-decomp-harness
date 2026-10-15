import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openState } from "@server/core/orchestrator-state";
import { latestSteeringProbe } from "@server/core/harness-runtime/run-state/steering.js";
import type { CommandResult, WorkspaceExec } from "@server/infrastructure/shell";
import type { StackCheckRunner } from "@server/core/validation/stack/stack-check.js";
import { STEERING_LOCATED_INSTRUCTION, UNUSED_BODY_INSTRUCTION, type SteeringRunner } from "@server/core/validation/steering/steering-check.js";
import type { SteeringGateMode } from "@server/core/game-registry/resolver.js";
import { validateWorkerChange, type WorkerChangeBaseline, type WorkerUnitScoreSnapshot } from "./change-validation.js";
import { recordWorkerSteeringObservations, steeringRepairProbe } from "./steering-validation.js";

const UNIT = "mario/M3DUtil/MActor";
const SYMBOL = "setLightData__6MActorFv";
const NEIGHBOUR = "calcLight__6MActorFv";
const SOURCE = "src/M3DUtil/MActor.cpp";
const COMPILED = "build/GMSJ01/src/M3DUtil/MActor.o";
const TARGET_OBJ = "build/GMSJ01/obj/M3DUtil/MActor.o";
const REFERENCE = "build/.stack_ref/build__GMSJ01__src__M3DUtil__MActor.o";
const VALIDATION = { reportPath: "build/GMSJ01/report.json" };
const NO_GATES = { sectionParity: false, undefinedSymbols: false, bannedIdioms: false, formatting: false, symbolValidation: false };
const DIFF = `diff --git a/${SOURCE} b/${SOURCE}\n--- a/${SOURCE}\n+++ b/${SOURCE}\n@@ -10,3 +10,4 @@ void MActor::setLightData()\n+    J3DLightObj* light = mLightData;\n`;

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

function snapshot(scores: Record<string, number>): WorkerUnitScoreSnapshot {
  return {
    schemaVersion: 1,
    capturedAt: "2026-10-15T00:00:00.000Z",
    unit: UNIT,
    symbol: SYMBOL,
    sourcePath: SOURCE,
    objectTarget: COMPILED,
    metrics: [],
    functions: Object.entries(scores).map(([name, score]) => ({ name, score })),
    sections: [],
    targetScore: scores[SYMBOL] ?? null,
  };
}

function sandbox(after: Record<string, number>): WorkspaceExec {
  const report = JSON.stringify({
    left: { sections: [], symbols: Object.entries(after).map(([name, score]) => ({ name, match_percent: score, size: 64, instructions: [] })) },
  });
  return {
    exec: async (command: string[]): Promise<CommandResult> => {
      if (command[0] === "build/tools/objdiff-cli") return { exitCode: 0, stdout: report, stderr: "" };
      if (command[0] === "cat") return { exitCode: 1, stdout: "", stderr: "absent" };
      return { exitCode: 0, stdout: "", stderr: "" };
    },
  } as WorkspaceExec;
}

type FnRow = { name: string; decision: string; semantic?: string; analysis?: string; unit?: string };

function decision(attempt: string, functions: FnRow[], extra: Record<string, unknown> = {}) {
  return {
    attempt,
    reasons: attempt === "pass" ? [] : ["fixture"],
    functions: functions.map((fn) => ({
      unit: fn.unit ?? UNIT,
      name: fn.name,
      decision: fn.decision,
      semantic: fn.semantic ?? (fn.decision === "pass" ? "clean" : fn.decision === "steering_located" ? "steering" : "unresolved"),
      analysis: fn.analysis ?? "complete",
      audit_label: fn.decision === "pass" ? "real" : "steering",
      match: { base: 90, candidate: 100, real_only: 96.5 },
    })),
    removable_noncosmetic: attempt === "pass" ? [] : ["g1"],
    units: [{ unit: UNIT, built: true, compared: true }],
    probes: attempt === "pass" ? [] : functions.filter((fn) => fn.decision !== "pass").map((fn) => ({
      function: fn.name, unit: fn.unit ?? UNIT, steering_edits: [{ file: SOURCE, line: 11, shapes: ["temp_alias"] }],
    })),
    ...extra,
  };
}

/** Fake steering_check.py: sandbox steps answer on stdout, host steps write `--out`. */
function steeringRunner(answers: {
  decide?: unknown;
  mwccFunctions?: Array<Record<string, unknown>>;
  fail?: "edits" | "reduce" | "mwcc" | "decide";
  hang?: boolean;
} = {}) {
  const calls: Array<{ step: string; where: string; args: string[] }> = [];
  const uploads: string[] = [];
  const outputs: Record<string, unknown> = {
    edits: {
      tool: "steering_check", version: 1, base_rev: "base-abc", edits_hash: "h1",
      files: [{ path: SOURCE, base_exists: true, cand_exists: true, base_text: "a\n", cand_text: "b\n" }],
    },
    reduce: { edits_hash: "h1", analysis: "complete", groups: [{ id: "g1", status: "removable", edit_ids: ["e1"] }] },
    mwcc: { edits_hash: "h1", functions: answers.mwccFunctions ?? [{ unit: UNIT, name: SYMBOL, sstar_vs_candidate: "code" }], errors: [] },
    decide: answers.decide ?? decision("pass", [{ name: SYMBOL, decision: "pass" }]),
  };
  const runner: SteeringRunner = async (args, where) => {
    const step = args[0]!;
    calls.push({ step, where, args });
    if (answers.hang && step === "reduce") return new Promise<CommandResult>(() => undefined);
    if (answers.fail === step) return { exitCode: 2, stdout: "", stderr: `${step} exploded` };
    const out = args.indexOf("--out");
    if (out >= 0) {
      writeFileSync(args[out + 1]!, JSON.stringify(outputs[step]));
      return { exitCode: 0, stdout: "", stderr: "" };
    }
    return { exitCode: 0, stdout: JSON.stringify(outputs[step]), stderr: "" };
  };
  runner.uploadToSandbox = async (path) => {
    uploads.push(path);
  };
  return { runner, calls, uploads };
}

function stackChecker(perturbation: Array<{ name: string; class: string }>): StackCheckRunner {
  return async (args) => {
    if (args[0] === "hunks") return { exitCode: 0, stdout: JSON.stringify({ hunks: [] }), stderr: "" };
    const pair = `${args[1]} ${args[2]}`;
    if (pair === `${COMPILED} ${TARGET_OBJ}`) return { exitCode: 0, stdout: JSON.stringify({ functions: [], data: "identical" }), stderr: "" };
    if (pair === `${REFERENCE} ${COMPILED}`) return { exitCode: 0, stdout: JSON.stringify({ functions: perturbation, data: "identical" }), stderr: "" };
    return { exitCode: 1, stdout: "", stderr: "unexpected" };
  };
}

async function attempt(params: {
  mode?: SteeringGateMode | null;
  runner?: ReturnType<typeof steeringRunner>;
  before?: Record<string, number>;
  after?: Record<string, number>;
  diff?: string;
  policy?: "match_frame" | "stop_at_frame";
  perturbation?: Array<{ name: string; class: string }>;
  baseRev?: string | null;
  budgetMs?: number;
}) {
  const outputDir = tempDir("steering-attempt-");
  const baseline: WorkerChangeBaseline = {
    status: "available",
    reasons: [],
    snapshot: snapshot(params.before ?? { [SYMBOL]: 90 }),
    firstDiff: null,
    objectTarget: COMPILED,
    stackReferenceObject: (params.policy ?? "stop_at_frame") === "stop_at_frame" ? REFERENCE : undefined,
  };
  const validation = await validateWorkerChange({
    repoRoot: `/work/sms-${Math.random()}`,
    hostRepoRoot: "/host/sms",
    outputDir,
    attemptIndex: 3,
    baseline,
    target: { unit: UNIT, symbol: SYMBOL, source_path: SOURCE },
    dryRun: false,
    shouldRun: true,
    claimedExact: true,
    validation: VALIDATION,
    microGateFlags: NO_GATES,
    postAttemptDiffText: params.diff ?? DIFF,
    baseRevision: "base-abc",
    workspaceExec: sandbox(params.after ?? { [SYMBOL]: 100 }),
    stackFramePolicy: params.policy ?? "stop_at_frame",
    stackCheckRunner: stackChecker(params.perturbation ?? [{ name: SYMBOL, class: "code" }]),
    steeringGate: params.mode && params.runner
      ? {
          mode: params.mode,
          baseRev: params.baseRev === undefined ? "base-abc" : params.baseRev,
          hostRepoRoot: "/host/sms",
          cacheDir: join(outputDir, "cache"),
          runner: params.runner.runner,
          ...(params.budgetMs ? { budgetMs: params.budgetMs } : {}),
        }
      : null,
  });
  return { validation, outputDir };
}

describe("validateWorkerChange steering gate", () => {
  test("off: the gate is never called and the validation carries no steering block", async () => {
    const runner = steeringRunner({ decide: decision("steering_located", [{ name: SYMBOL, decision: "steering_located" }]) });
    for (const mode of [null, "off" as const]) {
      const { validation } = await attempt({ mode, runner });
      expect(validation.status).toBe("passed");
      expect(validation.steering).toBeUndefined();
    }
    expect(runner.calls).toEqual([]);
  });

  test("Melee (match_frame, no gate options) never runs it", async () => {
    const { validation } = await attempt({ policy: "match_frame" });
    expect(validation.status).toBe("passed");
    expect(validation.steering).toBeUndefined();
  });

  test("only an otherwise-passing attempt that changed source is gated", async () => {
    const runner = steeringRunner();
    const regressed = await attempt({ mode: "enforce", runner, after: { [SYMBOL]: 80 } });
    expect(regressed.validation.status).toBe("target_regressed");
    const noSource = await attempt({ mode: "enforce", runner, diff: "diff --git a/config/GMSJ01/symbols.txt b/config/GMSJ01/symbols.txt\n@@ -1 +1 @@\n-a\n+b\n" });
    expect(noSource.validation.status).toBe("passed");
    expect(runner.calls).toEqual([]);
  });

  test("shadow: a steering verdict is recorded but never changes the status, and leaves an observation", async () => {
    const runner = steeringRunner({ decide: decision("steering_located", [{ name: SYMBOL, decision: "steering_located" }]) });
    const { validation } = await attempt({ mode: "shadow", runner });
    expect(validation.status).toBe("passed");
    expect(validation.reasons.join("\n")).not.toContain("steering_located");
    expect(validation.steering).toMatchObject({ mode: "shadow", error: null, decision: { attempt: "steering_located" } });
    expect(validation.steering?.artifactPath?.endsWith("attempt-3.steering.json")).toBe(true);
    expect(runner.calls.map((call) => `${call.step}:${call.where}`)).toEqual(["edits:sandbox", "reduce:host", "mwcc:sandbox", "decide:host"]);
    // Shadow never hands the probe to the worker.
    expect(steeringRepairProbe(validation)).toBeNull();

    const store = openState(tempDir("steering-observe-"));
    try {
      const rows = recordWorkerSteeringObservations(store, {
        result: validation.steering!, gameId: "sms", unit: UNIT, symbol: SYMBOL, runId: "run-1", attemptRef: "cp-1", baseRev: "base-abc", sourceSha: "sha-1",
      });
      expect(rows).toBe(1);
      const row = store.db.query("SELECT verdict, mode, function_source_sha, base_rev, attempt_ref FROM steering_observations").get() as Record<string, unknown>;
      expect(row).toEqual({ verdict: "steering_located", mode: "shadow", function_source_sha: "sha-1", base_rev: "base-abc", attempt_ref: "cp-1" });
      expect(latestSteeringProbe(store, { gameId: "sms", unit: UNIT, symbol: SYMBOL, functionSourceSha: "sha-1" })?.function).toBe(SYMBOL);
      expect(latestSteeringProbe(store, { gameId: "sms", unit: UNIT, symbol: SYMBOL, functionSourceSha: "sha-other" })).toBeNull();
    } finally {
      store.db.close();
    }
  });

  test("enforce: a certified pass keeps the attempt", async () => {
    const runner = steeringRunner();
    const { validation } = await attempt({ mode: "enforce", runner });
    expect(validation.status).toBe("passed");
    expect(validation.steering?.decision?.attempt).toBe("pass");
    expect(runner.calls.find((call) => call.step === "mwcc")?.args).toContain(SYMBOL);
  });

  test("enforce: steering_located rejects an exact attempt with the probe and instruction", async () => {
    const runner = steeringRunner({ decide: decision("steering_located", [{ name: SYMBOL, decision: "steering_located" }]) });
    const { validation } = await attempt({ mode: "enforce", runner });
    expect(validation.status).toBe("steering_located");
    expect(validation.target?.exact).toBe(true);
    const reason = validation.reasons.find((entry) => entry.startsWith("steering_located"));
    expect(reason).toContain(`steering located in ${SYMBOL} (without steering: 96.5%)`);
    expect(reason).toContain(STEERING_LOCATED_INSTRUCTION);
    expect(steeringRepairProbe(validation)).toMatchObject({ function: SYMBOL, unit: UNIT });
  });

  test("enforce: a dead UNUSED body stays steering_located with a reason naming the rule and the UNUSED-body instruction", async () => {
    const dead = { kind: "dead_unused_body", unit: UNIT, file: SOURCE, function: "MActor::unusedHelper", line: 40 };
    const decide = decision("rule_violation", [{ name: SYMBOL, decision: "pass" }], {
      removable_noncosmetic: [],
      probes: [],
      violations: [dead],
      unused_checks: [{ unit: UNIT, file: SOURCE, function: dead.function, status: "dead", stub: "{ }", changed: [] }],
    });
    const { validation } = await attempt({ mode: "enforce", runner: steeringRunner({ decide }) });
    expect(validation.status).toBe("steering_located");
    expect(validation.steering?.decision?.attempt).toBe("rule_violation");
    const reason = validation.reasons.find((entry) => entry.startsWith("steering_located"))!;
    expect(reason).toContain(`dead UNUSED body: MActor::unusedHelper (${SOURCE}:40) — UNUSED functions may only be reconstructed when inlined`);
    expect(reason).toEndWith(UNUSED_BODY_INSTRUCTION);
    expect(reason).not.toContain(STEERING_LOCATED_INSTRUCTION);

    // Never excused as frame-only, even when decide also located steering whose S* differs only in the frame.
    const framed = await attempt({
      mode: "enforce",
      runner: steeringRunner({
        decide: decision("steering_located", [{ name: SYMBOL, decision: "steering_located" }], { violations: [dead] }),
        mwccFunctions: [{ unit: UNIT, name: SYMBOL, sstar_vs_candidate: "stack_only" }],
      }),
    });
    expect(framed.validation.status).toBe("steering_located");

    // Shadow records the violation and never changes the status.
    const shadow = await attempt({ mode: "shadow", runner: steeringRunner({ decide }) });
    expect(shadow.validation.status).toBe("passed");
    expect(shadow.validation.steering?.decision?.violations).toEqual([dead]);
  });

  test("enforce: unresolved, tool failure and timeout all reject; nothing uncertified is banked", async () => {
    const unresolved = await attempt({
      mode: "enforce",
      runner: steeringRunner({ decide: decision("unresolved", [{ name: SYMBOL, decision: "unresolved", analysis: "incomplete" }]) }),
    });
    expect(unresolved.validation.status).toBe("steering_located");
    expect(unresolved.validation.reasons.join("\n")).toContain(`unresolved: ${SYMBOL}`);

    const failure = await attempt({ mode: "enforce", runner: steeringRunner({ fail: "mwcc" }) });
    expect(failure.validation.status).toBe("steering_located");
    expect(failure.validation.steering?.error).toContain("mwcc exited 2");
    expect(failure.validation.reasons.join("\n")).toContain("could not certify this attempt");

    const timeout = await attempt({ mode: "enforce", runner: steeringRunner({ hang: true }), budgetMs: 50 });
    expect(timeout.validation.status).toBe("steering_located");
    expect(timeout.validation.steering?.error).toContain("budget");

    const noBase = await attempt({ mode: "enforce", runner: steeringRunner(), baseRev: null });
    expect(noBase.validation.status).toBe("steering_located");
    expect(noBase.validation.steering?.error).toBe("no claim base revision");

    // Shadow keeps the same failures as data only.
    const shadowFailure = await attempt({ mode: "shadow", runner: steeringRunner({ fail: "reduce" }) });
    expect(shadowFailure.validation.status).toBe("passed");
    expect(shadowFailure.validation.steering?.error).toContain("reduce exited 2");
  });

  test("enforce: S* differing from the candidate only in the frame under stop_at_frame is a stack-only perturbation", async () => {
    const located = decision("steering_located", [{ name: SYMBOL, decision: "steering_located" }]);
    const frameOnly = await attempt({
      mode: "enforce",
      runner: steeringRunner({ decide: located, mwccFunctions: [{ unit: UNIT, name: SYMBOL, sstar_vs_candidate: "stack_only" }] }),
    });
    expect(frameOnly.validation.status).toBe("stack_only_perturbation");
    expect(frameOnly.validation.reasons.join("\n")).toContain(`only moved the stack frame of ${SYMBOL}`);
    expect(frameOnly.validation.steering?.decision?.attempt).toBe("steering_located");

    // match_frame never takes the stack-only path.
    const meleePolicy = await attempt({
      mode: "enforce",
      policy: "match_frame",
      runner: steeringRunner({ decide: located, mwccFunctions: [{ unit: UNIT, name: SYMBOL, sstar_vs_candidate: "stack_only" }] }),
    });
    expect(meleePolicy.validation.status).toBe("steering_located");

    // An unresolved function is never reduced to a frame question.
    const mixed = await attempt({
      mode: "enforce",
      runner: steeringRunner({
        decide: decision("steering_located", [{ name: SYMBOL, decision: "steering_located" }, { name: NEIGHBOUR, decision: "unresolved" }]),
        mwccFunctions: [{ unit: UNIT, name: SYMBOL, sstar_vs_candidate: "stack_only" }, { unit: UNIT, name: NEIGHBOUR, sstar_vs_candidate: "stack_only" }],
      }),
    });
    expect(mixed.validation.status).toBe("steering_located");
  });

  test("a neighbour that changed is passed as a function hint and its steering rejects the attempt", async () => {
    const runner = steeringRunner({
      decide: decision("steering_located", [{ name: SYMBOL, decision: "pass" }, { name: NEIGHBOUR, decision: "steering_located" }]),
    });
    const { validation } = await attempt({
      mode: "enforce",
      runner,
      before: { [SYMBOL]: 90, [NEIGHBOUR]: 95 },
      after: { [SYMBOL]: 92, [NEIGHBOUR]: 100 },
      perturbation: [{ name: SYMBOL, class: "code" }, { name: NEIGHBOUR, class: "code" }],
    });
    const mwcc = runner.calls.find((call) => call.step === "mwcc")!.args;
    expect(mwcc[mwcc.indexOf("--functions") + 1]).toBe(`${SYMBOL},${NEIGHBOUR}`);
    expect(validation.status).toBe("steering_located");
    expect(validation.target).toMatchObject({ improved: true, exact: false });
    expect(validation.reasons.join("\n")).toContain(`steering located in ${NEIGHBOUR}`);

    const store = openState(tempDir("steering-observe-"));
    try {
      expect(recordWorkerSteeringObservations(store, { result: validation.steering!, gameId: "sms", unit: UNIT, symbol: SYMBOL, sourceSha: "sha-1" })).toBe(2);
      const rows = store.db.query("SELECT symbol, verdict, mode FROM steering_observations ORDER BY id").all();
      expect(rows).toEqual([
        { symbol: SYMBOL, verdict: "pass", mode: "enforce" },
        { symbol: NEIGHBOUR, verdict: "steering_located", mode: "enforce" },
      ]);
    } finally {
      store.db.close();
    }
  });
});
