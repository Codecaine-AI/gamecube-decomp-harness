import { afterAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CommandResult, WorkspaceExec } from "@server/infrastructure/shell";
import {
  EDIT_SCOPE_INSTRUCTION,
  type EditScopeOrderingPolicy,
  type EditScopeRunner,
  type OrderingMode,
} from "@server/core/validation/edit-scope/edit-scope.js";
import { UNUSED_BODY_INSTRUCTION, type SteeringRunner } from "@server/core/validation/steering/steering-check.js";
import type { SteeringGateMode } from "@server/core/game-registry/resolver.js";
import { headerOwnerCandidates, validateWorkerChange, type WorkerChangeBaseline, type WorkerUnitScoreSnapshot } from "./change-validation.js";
import { UNUSED_UNVERIFIED_INSTRUCTION, editScopeUnusedRepairInstruction } from "./edit-scope-validation.js";
import { useHostReportPlacement } from "./host-report-placement.test-support.js";

// Fake workspaces here serve whole objdiff reports and symbols.txt: explicit host report placement.
useHostReportPlacement();

const UNIT = "mario/MarioUtil/Mario";
const SYMBOL = "setLightData__6TMarioFv";
const SOURCE = "src/MarioUtil/Mario.cpp";
const COMPILED = "build/GMSJ01/src/MarioUtil/Mario.o";
const VALIDATION = { reportPath: "build/GMSJ01/report.json" };
const NO_GATES = { sectionParity: false, undefinedSymbols: false, bannedIdioms: false, formatting: false, symbolValidation: false };
const DIFF = `diff --git a/${SOURCE} b/${SOURCE}\n--- a/${SOURCE}\n+++ b/${SOURCE}\n@@ -10,3 +10,4 @@\n+    int x = 0;\n`;
const POLICY = (mode: OrderingMode): EditScopeOrderingPolicy => ({ mode, gatedPaths: ["src/System/MarNameRefGen.cpp"] });

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

/** Files written into the fake sandbox through `uploadThroughExec` (python3 -c chunk writes + sha256 read-back). */
type SandboxFiles = Map<string, Buffer>;

function sandbox(after: Record<string, number>, files: SandboxFiles = new Map()): WorkspaceExec {
  const report = JSON.stringify({
    left: { sections: [], symbols: Object.entries(after).map(([name, score]) => ({ name, match_percent: score, size: 64, instructions: [] })) },
  });
  return {
    exec: async (command: string[]): Promise<CommandResult> => {
      if (command[0] === "python3" && command[1] === "-c" && command.length === 6) {
        const [, , , path, mode, chunk] = command as [string, string, string, string, string, string];
        const bytes = Buffer.from(chunk, "base64");
        files.set(path, mode === "wb" ? bytes : Buffer.concat([files.get(path) ?? Buffer.alloc(0), bytes]));
        return { exitCode: 0, stdout: "", stderr: "" };
      }
      if (command[0] === "python3" && command[1] === "-c" && command.length === 4) {
        const data = files.get(command[3]!);
        return data ? { exitCode: 0, stdout: `${createHash("sha256").update(data).digest("hex")}\n`, stderr: "" } : { exitCode: 1, stdout: "", stderr: "missing" };
      }
      if (command[0] === "build/tools/objdiff-cli") return { exitCode: 0, stdout: report, stderr: "" };
      if (command[0] === "cat") return { exitCode: 1, stdout: "", stderr: "absent" };
      return { exitCode: 0, stdout: "", stderr: "" };
    },
  } as WorkspaceExec;
}

function report(verdict: "pass" | "reject", hunks: Array<Record<string, unknown>> = []) {
  return { identity: { base_rev: "base-abc", patch_sha256: "p1", readiness: { rev: "base-abc" } }, verdict, hunks, warnings: [], limits: { foreign_headers: 0, foreign_header_lines: 0 } };
}

const REJECT = report("reject", [
  { file: "include/Enemy/BossGesso.hpp", line: 12, class: "TBossGesso", verdict: "not_ready", reason: "owner unit not decompiled", owner_unit: "enemy/BossGesso" },
]);

function scopeRunner(answer: { stdout?: string; exitCode?: number; stderr?: string } | unknown, later: unknown[] = []) {
  const calls: Array<{ args: string[]; where: string }> = [];
  const runner: EditScopeRunner = async (args, where) => {
    calls.push({ args, where });
    if (calls.length > 1 && later.length > 0) answer = later[Math.min(calls.length - 2, later.length - 1)];
    if (answer && typeof answer === "object" && "exitCode" in (answer as Record<string, unknown>)) {
      const shaped = answer as { stdout?: string; exitCode: number; stderr?: string };
      return { exitCode: shaped.exitCode, stdout: shaped.stdout ?? "", stderr: shaped.stderr ?? "" };
    }
    return { exitCode: 0, stdout: JSON.stringify(answer), stderr: "" };
  };
  return { runner, calls };
}

function steeringRunner(attempt: "pass" | "steering_located", extra: Record<string, unknown> = {}, fail?: "decide") {
  const steps: string[] = [];
  const decide = {
    attempt,
    reasons: attempt === "pass" ? [] : ["fixture"],
    functions: [{ unit: UNIT, name: SYMBOL, decision: attempt, semantic: attempt === "pass" ? "clean" : "steering", analysis: "complete", audit_label: "real", match: { base: 90, candidate: 100, real_only: 96.5 } }],
    removable_noncosmetic: attempt === "pass" ? [] : ["g1"],
    units: [{ unit: UNIT, built: true, compared: true }],
    probes: attempt === "pass" ? [] : [{ function: SYMBOL, unit: UNIT, steering_edits: [{ file: SOURCE, line: 11, shapes: ["temp_alias"] }] }],
    ...extra,
  };
  const outputs: Record<string, unknown> = {
    edits: { tool: "steering_check", version: 1, base_rev: "base-abc", edits_hash: "h1", files: [{ path: SOURCE, base_exists: true, cand_exists: true, base_text: "a\n", cand_text: "b\n" }] },
    reduce: { edits_hash: "h1", analysis: "complete", groups: [{ id: "g1", status: "removable", edit_ids: ["e1"] }] },
    mwcc: { edits_hash: "h1", functions: [{ unit: UNIT, name: SYMBOL, sstar_vs_candidate: "code" }], errors: [] },
    decide,
  };
  const runner: SteeringRunner = async (args) => {
    const step = args[0]!;
    steps.push(step);
    if (fail === step) return { exitCode: 2, stdout: "", stderr: `${step} exploded` };
    const out = args.indexOf("--out");
    if (out >= 0) {
      await Bun.write(args[out + 1]!, JSON.stringify(outputs[step]));
      return { exitCode: 0, stdout: "", stderr: "" };
    }
    return { exitCode: 0, stdout: JSON.stringify(outputs[step]), stderr: "" };
  };
  runner.uploadToSandbox = async () => undefined;
  return { runner, steps };
}

async function attempt(params: {
  mode?: OrderingMode | null;
  scope?: ReturnType<typeof scopeRunner>;
  steering?: { mode: SteeringGateMode; runner: ReturnType<typeof steeringRunner> };
  after?: Record<string, number>;
  diff?: string;
  baseRev?: string | null;
  unusedChecksPath?: string;
  files?: SandboxFiles;
}) {
  const outputDir = tempDir("edit-scope-attempt-");
  const baseline: WorkerChangeBaseline = {
    status: "available",
    reasons: [],
    snapshot: snapshot({ [SYMBOL]: 90 }),
    firstDiff: null,
    objectTarget: COMPILED,
  };
  const validation = await validateWorkerChange({
    repoRoot: `/work/sms-${Math.random()}`,
    hostRepoRoot: "/host/sms",
    outputDir,
    attemptIndex: 2,
    baseline,
    target: { unit: UNIT, symbol: SYMBOL, source_path: SOURCE },
    dryRun: false,
    shouldRun: true,
    claimedExact: true,
    validation: VALIDATION,
    microGateFlags: NO_GATES,
    postAttemptDiffText: params.diff ?? DIFF,
    baseRevision: "base-abc",
    workspaceExec: sandbox(params.after ?? { [SYMBOL]: 100 }, params.files),
    stackFramePolicy: "match_frame",
    steeringGate: params.steering
      ? { mode: params.steering.mode, baseRev: "base-abc", hostRepoRoot: "/host/sms", cacheDir: join(outputDir, "cache"), runner: params.steering.runner.runner }
      : null,
    editScope: params.mode && params.scope
      ? {
          policy: POLICY(params.mode),
          baseRev: params.baseRev === undefined ? "base-abc" : params.baseRev,
          runner: params.scope.runner,
          ...(params.unusedChecksPath ? { unusedChecksPath: params.unusedChecksPath } : {}),
        }
      : null,
  });
  return { validation, outputDir };
}

describe("validateWorkerChange edit-scope gate", () => {
  test("off, absent policy or Melee never runs the checker and adds no editScope block", async () => {
    const scope = scopeRunner(REJECT);
    for (const mode of [null, "off" as const]) {
      const { validation } = await attempt({ mode, scope });
      expect(validation.status).toBe("passed");
      expect(validation.editScope).toBeUndefined();
    }
    const melee = await attempt({});
    expect(melee.validation.editScope).toBeUndefined();
    expect(scope.calls).toEqual([]);
  });

  test("an attempt that changed no source is not checked", async () => {
    const scope = scopeRunner(REJECT);
    const { validation } = await attempt({ mode: "enforce", scope, diff: "diff --git a/config/GMSJ01/symbols.txt b/config/GMSJ01/symbols.txt\n@@ -1 +1 @@\n-a\n+b\n" });
    expect(validation.status).toBe("passed");
    expect(scope.calls).toEqual([]);
  });

  test("runs cumulatively from the claim base in the sandbox with the target unit and policy", async () => {
    const scope = scopeRunner(report("pass"));
    const { validation, outputDir } = await attempt({ mode: "enforce", scope, unusedChecksPath: "build/edit_scope/attempt-2.unused_checks.json" });
    expect(validation.status).toBe("passed");
    expect(scope.calls).toHaveLength(1);
    expect(scope.calls[0]!.where).toBe("sandbox");
    expect(scope.calls[0]!.args).toEqual([
      "check", "--repo", ".", "--base-rev", "base-abc", "--worktree", "--target-unit", UNIT,
      "--unused-checks", "build/edit_scope/attempt-2.unused_checks.json",
      "--policy-json", JSON.stringify({ gatedPaths: ["src/System/MarNameRefGen.cpp"] }), "--json",
    ]);
    expect(validation.editScope).toMatchObject({ mode: "enforce", error: null, report: { verdict: "pass" } });
    expect(validation.editScope?.artifactPath).toBe(join(outputDir, "attempt-2.edit_scope.json"));
  });

  test("without prior evidence --unused-checks is omitted", async () => {
    const scope = scopeRunner(report("pass"));
    await attempt({ mode: "shadow", scope });
    expect(scope.calls[0]!.args).not.toContain("--unused-checks");
  });

  test("shadow records a reject and a tool failure without changing the status", async () => {
    const rejected = await attempt({ mode: "shadow", scope: scopeRunner(REJECT) });
    expect(rejected.validation.status).toBe("passed");
    expect(rejected.validation.editScope?.report?.verdict).toBe("reject");
    expect(rejected.validation.reasons.join("\n")).not.toContain("edit_scope");

    const failed = await attempt({ mode: "shadow", scope: scopeRunner({ exitCode: 2, stderr: "readiness missing_map" }) });
    expect(failed.validation.status).toBe("passed");
    expect(failed.validation.editScope?.error).toContain("exited 2");
  });

  test("enforce: a reject names the class and owner unit and carries the fence instruction", async () => {
    const { validation } = await attempt({ mode: "enforce", scope: scopeRunner(REJECT) });
    expect(validation.status).toBe("edit_scope_rejected");
    const reason = validation.reasons.find((entry) => entry.startsWith("edit_scope:"));
    expect(reason).toContain("TBossGesso (not_ready, owner enemy/BossGesso)");
    expect(reason).toContain("include/Enemy/BossGesso.hpp:12");
    expect(reason).toContain(EDIT_SCOPE_INSTRUCTION);
  });

  test("enforce: an unavailable, malformed or baseless check rejects the attempt", async () => {
    const unavailable = await attempt({ mode: "enforce", scope: scopeRunner({ exitCode: 127, stderr: "python3: not found" }) });
    expect(unavailable.validation.status).toBe("edit_scope_rejected");
    expect(unavailable.validation.reasons.join("\n")).toContain("could not run");

    const malformed = await attempt({ mode: "enforce", scope: scopeRunner({ exitCode: 0, stdout: "not json" }) });
    expect(malformed.validation.status).toBe("edit_scope_rejected");
    expect(malformed.validation.editScope?.error).toContain("did not return JSON");

    const scope = scopeRunner(report("pass"));
    const baseless = await attempt({ mode: "enforce", scope, baseRev: null });
    expect(baseless.validation.status).toBe("edit_scope_rejected");
    expect(baseless.validation.editScope?.error).toBe("no claim base revision");
    expect(scope.calls).toEqual([]);
  });

  test("an attempt that already failed keeps its status and still records the result", async () => {
    const { validation } = await attempt({ mode: "enforce", scope: scopeRunner(REJECT), after: { [SYMBOL]: 80 } });
    expect(validation.status).toBe("target_regressed");
    expect(validation.editScope?.report?.verdict).toBe("reject");
    expect(validation.reasons.join("\n")).not.toContain("edit_scope:");
  });

  test("the steering gate never runs after an enforced scope rejection", async () => {
    for (const steeringMode of ["shadow", "enforce"] as const) {
      const steering = steeringRunner("steering_located");
      const { validation } = await attempt({ mode: "enforce", scope: scopeRunner(REJECT), steering: { mode: steeringMode, runner: steering } });
      expect(validation.status).toBe("edit_scope_rejected");
      expect(validation.steering).toBeUndefined();
      expect(steering.steps).toEqual([]);
    }
  });

  test("a passing scope check hands over to the steering gate (shadow and enforce)", async () => {
    const shadowSteering = steeringRunner("steering_located");
    const shadow = await attempt({ mode: "enforce", scope: scopeRunner(report("pass")), steering: { mode: "shadow", runner: shadowSteering } });
    expect(shadow.validation.status).toBe("passed");
    expect(shadow.validation.steering?.decision?.attempt).toBe("steering_located");

    const enforceSteering = steeringRunner("steering_located");
    const enforced = await attempt({ mode: "enforce", scope: scopeRunner(report("pass")), steering: { mode: "enforce", runner: enforceSteering } });
    expect(enforced.validation.status).toBe("steering_located");
    expect(enforced.validation.editScope?.report?.verdict).toBe("pass");
  });

  test("shadow scope with enforced steering: steering still decides", async () => {
    const steering = steeringRunner("steering_located");
    const { validation } = await attempt({ mode: "shadow", scope: scopeRunner(REJECT), steering: { mode: "enforce", runner: steering } });
    expect(validation.status).toBe("steering_located");
    expect(validation.editScope?.report?.verdict).toBe("reject");
  });
});

describe("headerOwnerCandidates", () => {
  test("maps .hpp to .cpp case-insensitively and include/ to src/", () => {
    expect(headerOwnerCandidates("include/MarioUtil/Mario.HPP")).toEqual(["src/MarioUtil/Mario.cpp"]);
    expect(headerOwnerCandidates("src/Enemy/Gesso.hpp")).toEqual(["src/Enemy/Gesso.cpp"]);
  });

  test("keeps .h → .c first, then .cpp", () => {
    expect(headerOwnerCandidates("include/melee/gr/ground.H")).toEqual(["src/melee/gr/ground.c", "src/melee/gr/ground.cpp"]);
  });
});

describe("validateWorkerChange edit-scope UNUSED re-check", () => {
  const UNUSED_FN = "TMario::unusedHelper";
  const unverifiedHunk = { file: SOURCE, line: 40, class: null, verdict: "unused_unverified", reason: `${UNUSED_FN} has no inlined certificate` };
  const deadHunk = { file: SOURCE, line: 40, class: null, verdict: "dead_unused", reason: `${UNUSED_FN} is dead` };
  const inlinedCheck = {
    unit: UNIT, file: SOURCE, function: UNUSED_FN, status: "inlined", line: 40,
    changed: [{ function: SYMBOL }],
    base_rev: "base-abc", edits_hash: "h1", body_sha256: "body-1",
    unit_inputs: [SOURCE], unit_inputs_sha256: "inputs-1",
    callers: [{ function: SYMBOL, delta: -2.5 }],
  };

  test("deferred unused_unverified lets steering run, and the inlined certificate passes the re-check", async () => {
    const files: SandboxFiles = new Map();
    const scope = scopeRunner(report("reject", [unverifiedHunk]), [report("pass")]);
    const steering = steeringRunner("pass", { unused_checks: [inlinedCheck] });
    const { validation, outputDir } = await attempt({ mode: "enforce", scope, steering: { mode: "enforce", runner: steering }, files });
    expect(validation.status).toBe("passed");
    expect(validation.editScopeDeferredUnused).toHaveLength(1);
    expect(steering.steps).toContain("decide");
    expect(scope.calls).toHaveLength(2);
    const path = "build/edit_scope/attempt-2.unused_checks.json";
    expect(scope.calls[1]!.args.slice(0, 10)).toEqual(["check", "--repo", ".", "--base-rev", "base-abc", "--worktree", "--target-unit", UNIT, "--unused-checks", path]);
    const uploaded = JSON.parse(files.get(path)!.toString("utf8"));
    expect(uploaded[0]).toMatchObject({
      function: UNUSED_FN, status: "inlined", line: 40, base_rev: "base-abc", edits_hash: "h1", body_sha256: "body-1",
      unit_inputs: [SOURCE], unit_inputs_sha256: "inputs-1", callers: [{ function: SYMBOL, delta: -2.5 }],
    });
    expect(validation.editScopeUnused).toMatchObject({ mode: "enforce", error: null, report: { verdict: "pass" } });
    expect(validation.editScopeUnused?.artifactPath).toBe(join(outputDir, "attempt-2.edit_scope.unused.json"));
  });

  test("enforce: a dead body found by the re-check rejects with the UNUSED-body instruction", async () => {
    const scope = scopeRunner(report("reject", [unverifiedHunk]), [report("reject", [deadHunk])]);
    const steering = steeringRunner("pass", { unused_checks: [{ ...inlinedCheck, status: "dead" }] });
    const { validation } = await attempt({ mode: "enforce", scope, steering: { mode: "shadow", runner: steering } });
    expect(validation.status).toBe("edit_scope_rejected");
    const reason = validation.reasons.find((entry) => entry.startsWith("edit_scope (UNUSED):"));
    expect(reason).toContain("dead_unused");
    expect(reason).toContain(UNUSED_BODY_INSTRUCTION);
    expect(editScopeUnusedRepairInstruction(validation)).toBe(UNUSED_BODY_INSTRUCTION);
  });

  test("enforce: a body still unverified after steering rejects with the certificate instruction", async () => {
    const scope = scopeRunner(report("reject", [unverifiedHunk]), [report("reject", [unverifiedHunk])]);
    const steering = steeringRunner("pass", { unused_checks: [{ ...inlinedCheck, status: "inconclusive" }] });
    const { validation } = await attempt({ mode: "enforce", scope, steering: { mode: "shadow", runner: steering } });
    expect(validation.status).toBe("edit_scope_rejected");
    expect(validation.reasons.join("\n")).toContain(UNUSED_UNVERIFIED_INSTRUCTION);
    expect(editScopeUnusedRepairInstruction(validation)).toBe(UNUSED_UNVERIFIED_INSTRUCTION);
  });

  test("enforce: dead_unused from prior evidence still rejects before steering", async () => {
    const scope = scopeRunner(report("reject", [deadHunk]));
    const steering = steeringRunner("pass");
    const { validation } = await attempt({ mode: "enforce", scope, steering: { mode: "enforce", runner: steering } });
    expect(validation.status).toBe("edit_scope_rejected");
    expect(validation.reasons.join("\n")).toContain(UNUSED_BODY_INSTRUCTION);
    expect(steering.steps).toEqual([]);
    expect(scope.calls).toHaveLength(1);
  });

  test("enforce: deferred UNUSED hunks without a steering decision fail closed", async () => {
    const noGate = await attempt({ mode: "enforce", scope: scopeRunner(report("reject", [unverifiedHunk])) });
    expect(noGate.validation.status).toBe("edit_scope_rejected");
    expect(noGate.validation.editScopeUnused?.error).toContain("steering did not run");

    const scope = scopeRunner(report("reject", [unverifiedHunk]));
    const failed = await attempt({ mode: "enforce", scope, steering: { mode: "shadow", runner: steeringRunner("pass", {}, "decide") } });
    expect(failed.validation.status).toBe("edit_scope_rejected");
    expect(failed.validation.editScopeUnused?.error).toContain("no steering decision certifies");
    expect(scope.calls).toHaveLength(1);
  });

  test("shadow records the deferral and the re-check without changing the status", async () => {
    const scope = scopeRunner(report("reject", [unverifiedHunk]), [report("reject", [deadHunk])]);
    const steering = steeringRunner("pass", { unused_checks: [{ ...inlinedCheck, status: "dead" }] });
    const { validation } = await attempt({ mode: "shadow", scope, steering: { mode: "shadow", runner: steering } });
    expect(validation.status).toBe("passed");
    expect(validation.editScopeDeferredUnused).toHaveLength(1);
    expect(validation.editScopeUnused?.report?.verdict).toBe("reject");
    expect(validation.reasons.join("\n")).not.toContain("edit_scope");
  });

  test("off and Melee never run either check", async () => {
    const scope = scopeRunner(report("reject", [unverifiedHunk]));
    const off = await attempt({ mode: "off", scope, steering: { mode: "shadow", runner: steeringRunner("pass", { unused_checks: [inlinedCheck] }) } });
    expect(off.validation.status).toBe("passed");
    expect(off.validation.editScope).toBeUndefined();
    expect(off.validation.editScopeUnused).toBeUndefined();
    expect(scope.calls).toEqual([]);
  });
});
