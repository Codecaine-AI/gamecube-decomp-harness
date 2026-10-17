import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CommandResult, WorkspaceExec } from "@server/infrastructure/shell";
import type { SteeringRunner } from "@server/core/validation/steering/steering-check.js";
import type { BaseIdentityProof } from "@server/core/harness-runtime/run-state/certification.js";
import { compareWorkerUnitSnapshots, validateWorkerChange, type WorkerChangeBaseline, type WorkerUnitScoreSnapshot } from "./change-validation.js";
import {
  CERTIFICATION_LANE_REASON_PREFIX,
  parseNinjaDeps,
  workspaceBaseIdentityProver,
  type BaseIdentityProver,
  type CertificationLaneOptions,
} from "./certification-lane.js";
import { useHostReportPlacement } from "./host-report-placement.test-support.js";

// Fake workspaces here serve whole objdiff reports and symbols.txt: explicit host report placement.
useHostReportPlacement();

const UNIT = "mario/M3DUtil/MActor";
const SYMBOL = "setLightData__6MActorFv";
const NEIGHBOUR = "calcLight__6MActorFv";
const SOURCE = "src/M3DUtil/MActor.cpp";
const COMPILED = "build/GMSJ01/src/M3DUtil/MActor.o";
const TRUSTED = "trusted-81248bda";
const CLAIM_BASE = "base-abc";
const NO_GATES = { sectionParity: false, undefinedSymbols: false, bannedIdioms: false, formatting: false, symbolValidation: false };
const DIFF = `diff --git a/${SOURCE} b/${SOURCE}\n--- a/${SOURCE}\n+++ b/${SOURCE}\n@@ -10,3 +10,3 @@ void MActor::setLightData()\n-    f32 unexplained = mLightData;\n+    J3DLightObj* light = mLightData;\n`;

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function snapshot(scores: Record<string, number>): WorkerUnitScoreSnapshot {
  return {
    schemaVersion: 1,
    capturedAt: "2026-10-17T00:00:00.000Z",
    unit: UNIT,
    symbol: SYMBOL,
    sourcePath: SOURCE,
    objectTarget: COMPILED,
    metrics: [{ name: "fuzzy_match_percent", score: 99 }, { name: "matched_code_percent", score: 50 }, { name: "matched_data_percent", score: 100 }],
    functions: Object.entries(scores).map(([name, score]) => ({ name, score, size: 64 })),
    sections: [{ name: ".text", score: 99, size: 128 }, { name: ".data", score: 100, size: 16 }],
    targetScore: scores[SYMBOL] ?? null,
  };
}

function sandbox(after: Record<string, number>, textScore = 90): WorkspaceExec {
  const report = JSON.stringify({
    left: {
      sections: [{ name: ".text", match_percent: textScore, size: 128 }, { name: ".data", match_percent: 100, size: 16 }],
      symbols: Object.entries(after).map(([name, score]) => ({ name, match_percent: score, size: 64, instructions: [] })),
    },
  });
  return {
    exec: async (command: string[]): Promise<CommandResult> => {
      if (command[0] === "build/tools/objdiff-cli") return { exitCode: 0, stdout: report, stderr: "" };
      if (command[0] === "cat") return { exitCode: 1, stdout: "", stderr: "absent" };
      return { exitCode: 0, stdout: "", stderr: "" };
    },
  } as WorkspaceExec;
}

function decision(attempt: string, functions: Array<{ name: string; decision: string; groups?: string[] }>) {
  return {
    attempt,
    reasons: attempt === "pass" ? [] : ["fixture"],
    functions: functions.map((fn) => ({
      unit: UNIT,
      name: fn.name,
      decision: fn.decision,
      semantic: fn.decision === "pass" ? "clean" : fn.decision === "steering_located" ? "steering" : "unresolved",
      analysis: "complete",
      audit_label: fn.decision === "pass" ? "real" : "steering",
      match: { base: 100, candidate: 95, real_only: 95 },
      ...(fn.groups !== undefined ? { groups: fn.groups } : {}),
    })),
    removable_noncosmetic: attempt === "pass" ? [] : ["g1"],
    units: [{ unit: UNIT, built: true, compared: true }],
    probes: [],
  };
}

/** Fake steering_check.py; `decide` answers per the run's `--base-ref` (claim base, or the trusted base of an unverified target). */
function steeringRunner(decideByBase: Record<string, unknown>) {
  const calls: string[] = [];
  let base = "";
  const runner: SteeringRunner = async (args) => {
    const step = args[0]!;
    calls.push(step);
    if (step === "edits") base = args[args.indexOf("--base-ref") + 1] ?? "";
    const outputs: Record<string, unknown> = {
      edits: { tool: "steering_check", version: 1, base_rev: base, edits_hash: "h1", files: [{ path: SOURCE, base_exists: true, cand_exists: true, base_text: "a\n", cand_text: "b\n" }] },
      reduce: { edits_hash: "h1", analysis: "complete", groups: [{ id: "g1", status: "kept", edit_ids: ["e1"] }] },
      mwcc: { edits_hash: "h1", functions: [{ unit: UNIT, name: SYMBOL, sstar_vs_candidate: "code" }], errors: [] },
      decide: decideByBase[base],
    };
    const out = args.indexOf("--out");
    if (out >= 0) {
      writeFileSync(args[out + 1]!, JSON.stringify(outputs[step]));
      return { exitCode: 0, stdout: "", stderr: "" };
    }
    return { exitCode: 0, stdout: JSON.stringify(outputs[step]), stderr: "" };
  };
  runner.uploadToSandbox = async () => undefined;
  return { runner, calls };
}

const ownPass = decision("pass", [{ name: SYMBOL, decision: "pass", groups: ["g1"] }]);
const proof: BaseIdentityProof = {
  trustedBaseRev: TRUSTED,
  claimBaseRev: CLAIM_BASE,
  sourcePath: SOURCE,
  inputs: [{ path: SOURCE, blob: "b10b" }],
  dependenciesKnown: true,
  proofHash: "f".repeat(64),
};

async function attempt(params: {
  before: Record<string, number>;
  after: Record<string, number>;
  decideByBase: Record<string, unknown>;
  lane: CertificationLaneOptions["reason"] | null;
  unverified?: boolean;
  prove?: BaseIdentityProver;
  /** The unit's `.text` score after the attempt (default 90). */
  textScore?: number;
}) {
  const outputDir = mkdtempSync(join(tmpdir(), "certification-lane-"));
  dirs.push(outputDir);
  const baseline: WorkerChangeBaseline = { status: "available", reasons: [], snapshot: snapshot(params.before), firstDiff: null, objectTarget: COMPILED };
  const steering = steeringRunner(params.decideByBase);
  const lane: CertificationLaneOptions | null = params.lane
    ? {
        reason: params.lane,
        ...(params.prove ? { restoration: { trustedBaseRev: TRUSTED, claimBaseRev: CLAIM_BASE, sourcePath: SOURCE, prove: params.prove } } : {}),
      }
    : null;
  const validation = await validateWorkerChange({
    repoRoot: "/work/sms",
    hostRepoRoot: "/host/sms",
    outputDir,
    attemptIndex: 1,
    baseline,
    target: { unit: UNIT, symbol: SYMBOL, source_path: SOURCE },
    dryRun: false,
    shouldRun: true,
    claimedExact: true,
    validation: { reportPath: "build/GMSJ01/report.json" },
    microGateFlags: NO_GATES,
    postAttemptDiffText: DIFF,
    baseRevision: CLAIM_BASE,
    workspaceExec: sandbox(params.after, params.textScore),
    stackFramePolicy: "match_frame",
    steeringGate: {
      mode: "enforce",
      baseRev: CLAIM_BASE,
      hostRepoRoot: "/host/sms",
      cacheDir: join(outputDir, "cache"),
      runner: steering.runner,
      ...(params.unverified ? { unverifiedTarget: { unit: UNIT, symbol: SYMBOL, baseRev: TRUSTED } } : {}),
    },
    certificationLane: lane,
  });
  return { validation, gateCalls: steering.calls };
}

describe("certification lane: compareWorkerUnitSnapshots", () => {
  test("without the lane a lower target score is rejected exactly as before", () => {
    const validation = compareWorkerUnitSnapshots({ before: snapshot({ [SYMBOL]: 100 }), after: snapshot({ [SYMBOL]: 95 }), claimedExact: true });
    expect(validation.status).toBe("target_regressed");
    expect(validation.certificationLane).toBeUndefined();
  });

  test("on the lane a lower or equal target score is pending, not rejected; the target's own totals are not regressions", () => {
    const lower = compareWorkerUnitSnapshots({
      before: snapshot({ [SYMBOL]: 100, [NEIGHBOUR]: 80 }),
      after: { ...snapshot({ [SYMBOL]: 95, [NEIGHBOUR]: 80 }), metrics: [{ name: "fuzzy_match_percent", score: 97 }, { name: "matched_code_percent", score: 0 }, { name: "matched_data_percent", score: 100 }], sections: [{ name: ".text", score: 97, size: 128 }, { name: ".data", score: 100, size: 16 }] },
      claimedExact: true,
      certificationLane: "unverified_match",
    });
    expect(lower.status).toBe("passed");
    expect(lower.regressions).toEqual([]);
    expect(lower.certificationLane).toEqual({
      reason: "unverified_match",
      scoreStatus: "target_regressed",
      scoreReasons: [`target ${SYMBOL} regressed from 100 to 95`],
      outcome: "pending",
    });
    const equal = compareWorkerUnitSnapshots({ before: snapshot({ [SYMBOL]: 80 }), after: snapshot({ [SYMBOL]: 80 }), claimedExact: true, certificationLane: "steering_located" });
    expect(equal.status).toBe("passed");
    expect(equal.certificationLane?.scoreStatus).toBe("no_official_score_change");
  });

  test("any other function, or the data, regressing still rejects on the lane", () => {
    const neighbour = compareWorkerUnitSnapshots({
      before: snapshot({ [SYMBOL]: 100, [NEIGHBOUR]: 80 }),
      after: snapshot({ [SYMBOL]: 95, [NEIGHBOUR]: 70 }),
      claimedExact: true,
      certificationLane: "unverified_match",
    });
    expect(neighbour.status).toBe("target_regressed");
    expect(neighbour.regressions).toEqual([{ kind: "function", unit: UNIT, item: NEIGHBOUR, before: 80, after: 70 }]);
    expect(neighbour.certificationLane).toBeUndefined();
    const data = compareWorkerUnitSnapshots({
      before: snapshot({ [SYMBOL]: 100 }),
      after: { ...snapshot({ [SYMBOL]: 95 }), sections: [{ name: ".text", score: 97, size: 128 }, { name: ".data", score: 50, size: 16 }] },
      claimedExact: true,
      certificationLane: "unverified_match",
    });
    expect(data.status).toBe("target_regressed");
    expect(data.regressions?.map((row) => row.item)).toEqual([".data"]);
  });
});

describe("certification lane: validateWorkerChange (enforce)", () => {
  test("unverified 100 -> 95: the trusted-base gate certifies it, so it is accepted without a score gain", async () => {
    const { validation } = await attempt({
      before: { [SYMBOL]: 100 }, after: { [SYMBOL]: 95 }, lane: "unverified_match", unverified: true,
      decideByBase: { [CLAIM_BASE]: ownPass, [TRUSTED]: ownPass },
    });
    expect(validation.status).toBe("passed");
    expect(validation.certificationLane?.outcome).toBe("certified");
    expect(validation.target).toMatchObject({ before: 100, after: 95, improved: false, exact: false });
  });

  test("unverified 100 -> 95 that the trusted-base gate does not certify gets its score verdict back", async () => {
    const { validation } = await attempt({
      before: { [SYMBOL]: 100 }, after: { [SYMBOL]: 95 }, lane: "unverified_match", unverified: true,
      decideByBase: { [CLAIM_BASE]: ownPass, [TRUSTED]: decision("unresolved", [{ name: SYMBOL, decision: "unresolved", groups: ["g1"] }]) },
    });
    expect(validation.status).toBe("target_regressed");
    expect(validation.certificationLane?.outcome).toBe("rejected");
    expect(validation.reasons).toContain(`target ${SYMBOL} regressed from 100 to 95`);
    expect(validation.reasons.some((reason) => reason.startsWith(CERTIFICATION_LANE_REASON_PREFIX) && reason.includes("did not certify"))).toBe(true);
  });

  test("steering_located lane: a certified rewrite that does not raise the score passes; without the lane it never reaches the gate", async () => {
    const lane = await attempt({ before: { [SYMBOL]: 90 }, after: { [SYMBOL]: 88 }, lane: "steering_located", decideByBase: { [CLAIM_BASE]: ownPass } });
    expect(lane.validation.status).toBe("passed");
    expect(lane.validation.certificationLane?.outcome).toBe("certified");
    const steered = await attempt({
      before: { [SYMBOL]: 90 }, after: { [SYMBOL]: 88 }, lane: "steering_located",
      decideByBase: { [CLAIM_BASE]: decision("steering_located", [{ name: SYMBOL, decision: "steering_located", groups: ["g1"] }]) },
    });
    expect(steered.validation.status).toBe("steering_located");
    expect(steered.validation.certificationLane?.outcome).toBe("rejected");
    const noLane = await attempt({ before: { [SYMBOL]: 90 }, after: { [SYMBOL]: 88 }, lane: null, decideByBase: { [CLAIM_BASE]: ownPass } });
    expect(noLane.validation.status).toBe("target_regressed");
    expect(noLane.gateCalls).toEqual([]);
  });

  test("restoration: no edit group to certify, but a base-identity proof clears the target without credit", async () => {
    const untouched = decision("pass", [{ name: SYMBOL, decision: "pass", groups: [] }]);
    const restored = await attempt({
      before: { [SYMBOL]: 100 }, after: { [SYMBOL]: 92 }, lane: "unverified_match", unverified: true,
      decideByBase: { [CLAIM_BASE]: ownPass, [TRUSTED]: untouched },
      prove: async (params) => {
        expect(params).toMatchObject({ trustedBaseRev: TRUSTED, claimBaseRev: CLAIM_BASE, sourcePath: SOURCE, objectTarget: COMPILED, changedPaths: [SOURCE] });
        return proof;
      },
    });
    expect(restored.validation.status).toBe("passed");
    expect(restored.validation.certificationLane).toMatchObject({ outcome: "restored", restoration: proof });
    expect(restored.validation.target?.exact).toBe(false);

    const refused = await attempt({
      before: { [SYMBOL]: 100 }, after: { [SYMBOL]: 92 }, lane: "unverified_match", unverified: true,
      decideByBase: { [CLAIM_BASE]: ownPass, [TRUSTED]: untouched },
      prove: async () => `${SOURCE} differs from the trusted base ${TRUSTED}`,
    });
    expect(refused.validation.status).toBe("target_regressed");
    expect(refused.validation.certificationLane).toMatchObject({ outcome: "rejected", restorationRefused: `${SOURCE} differs from the trusted base ${TRUSTED}` });
  });
});

describe("restoration at an unchanged score (enforce)", () => {
  const untouched = decision("pass", [{ name: SYMBOL, decision: "pass", groups: [] }]);

  test("unverified 100 -> 100 restoring the trusted base: no lane was pending, the proof still runs and clears it", async () => {
    let proved = 0;
    const { validation } = await attempt({
      before: { [SYMBOL]: 100 }, after: { [SYMBOL]: 100 }, textScore: 99, lane: "unverified_match", unverified: true,
      decideByBase: { [CLAIM_BASE]: ownPass, [TRUSTED]: untouched },
      prove: async () => {
        proved += 1;
        return proof;
      },
    });
    expect(proved).toBe(1);
    expect(validation.status).toBe("passed");
    expect(validation.certificationLane).toMatchObject({ reason: "unverified_match", outcome: "restored", restoration: proof });
  });

  test("without a proof the unverified rejection stands, with the reason; a certified 100 -> 100 never runs the prover", async () => {
    const refused = await attempt({
      before: { [SYMBOL]: 100 }, after: { [SYMBOL]: 100 }, textScore: 99, lane: "unverified_match", unverified: true,
      decideByBase: { [CLAIM_BASE]: ownPass, [TRUSTED]: untouched },
      prove: async () => `${SOURCE} differs from the trusted base ${TRUSTED}`,
    });
    expect(refused.validation.status).toBe("steering_located");
    expect(refused.validation.certificationLane).toBeUndefined();
    expect(refused.validation.reasons).toContain(`${CERTIFICATION_LANE_REASON_PREFIX} restoration of the trusted base not proven: ${SOURCE} differs from the trusted base ${TRUSTED}`);
    let proved = 0;
    const certified = await attempt({
      before: { [SYMBOL]: 100 }, after: { [SYMBOL]: 100 }, textScore: 99, lane: "unverified_match", unverified: true,
      decideByBase: { [CLAIM_BASE]: ownPass, [TRUSTED]: ownPass },
      prove: async () => {
        proved += 1;
        return proof;
      },
    });
    expect(certified.validation.status).toBe("passed");
    expect(proved).toBe(0);
  });
});

describe("workspaceBaseIdentityProver", () => {
  const HEADER = "include/M3DUtil/MActor.hpp";
  const PCH_SOURCE = "include/SMS.pch";
  const PCH_HEADER = "include/types.h";
  const MCH = "/work/sms/build/GMSJ01/include/SMS.mch";
  const COMPILER = "build/compilers/GC/1.2.5/mwcceppc.exe";
  const CONFIG_JSON = "build/GMSJ01/config.json";
  const DTK = "build/tools/dtk";
  const TRACKED = {
    [SOURCE]: "aaa1", [HEADER]: "bbb2", [PCH_SOURCE]: "ccc3", [PCH_HEADER]: "ddd4",
    "tools/transform_dep.py": "eee5", "tools/download_tool.py": "fff6", "configure.py": "aab7", "config/GMSJ01/config.yml": "aac8",
  };

  /**
   * A ninja graph: the object, a precompiled header it includes, the
   * compiler, and the build definition's config. `regenerates` is what a
   * rebuild from the inputs writes; `files` what the workspace holds now.
   */
  function fakes(options: {
    sandbox?: Record<string, string | null>;
    trusted?: Record<string, string>;
    deps?: string | null;
    regenerates?: Record<string, string>;
    staleTool?: boolean;
  } = {}) {
    const files: Record<string, string | null> = { ...TRACKED, [MCH]: "0ac0", [COMPILER]: "0bc0", [CONFIG_JSON]: "0cc0", [DTK]: "0dc0", ...options.sandbox };
    const regenerates: Record<string, string> = { [MCH]: "0ac0", [CONFIG_JSON]: "0cc0", ...options.regenerates };
    const trusted: Record<string, string> = { ...TRACKED, ...options.trusted };
    const depsOf: Record<string, string> = {
      [COMPILED]: options.deps === null ? `${COMPILED}: #deps 0, deps mtime 0 (VALID)\n` : options.deps ?? `${COMPILED}: #deps 3, deps mtime 1 (VALID)\n    ${SOURCE}\n    /work/sms/${HEADER}\n    ${MCH}\n\n`,
      [MCH]: `${MCH}: #deps 1, deps mtime 1 (VALID)\n    /work/sms/${PCH_HEADER}\n\n`,
    };
    const inputsOf: Record<string, string[]> = {
      [COMPILED]: [SOURCE, COMPILER, "tools/transform_dep.py", MCH],
      "build.ninja": ["configure.py", "config/GMSJ01/config.yml", CONFIG_JSON],
      [MCH]: [PCH_SOURCE, COMPILER],
      [COMPILER]: ["tools/download_tool.py"],
      [CONFIG_JSON]: [DTK, "config/GMSJ01/config.yml"],
      [DTK]: ["tools/download_tool.py"],
    };
    const commands: string[][] = [];
    const exec: WorkspaceExec = {
      exec: async (command) => {
        commands.push(command);
        const ok = (stdout = ""): CommandResult => ({ exitCode: 0, stdout, stderr: "" });
        const [tool, ...args] = command;
        if (tool === "ninja" && args[0] === "-t" && args[1] === "deps") return ok(depsOf[args[2]!] ?? "");
        if (tool === "ninja" && args[0] === "-t" && args[1] === "inputs") {
          const inputs = inputsOf[args[2]!];
          return inputs ? ok(`${inputs.join("\n")}\n`) : { exitCode: 1, stdout: "", stderr: "unknown target" };
        }
        // A tampered output with a fresh timestamp is "up to date" for ninja.
        if (tool === "ninja" && args[0] === "-n") return ok(options.staleTool && args[1] === COMPILER ? "[1/1] download\n" : "ninja: no work to do.\n");
        if (tool === "ninja") {
          for (const target of args) files[target] = regenerates[target] ?? null;
          return ok();
        }
        if (tool === "git" && args[0] === "hash-object") {
          const blobs = args.slice(2).map((path) => files[path]);
          return blobs.every(Boolean) ? ok(`${blobs.join("\n")}\n`) : { exitCode: 128, stdout: "", stderr: "missing" };
        }
        if (tool === "mktemp") return ok("/tmp/restore.1\n");
        if (tool === "cp") {
          files[args[2]!] = files[args[1]!] ?? null;
          return ok();
        }
        if (tool === "mv") {
          files[args[2]!] = files[args[1]!] ?? null;
          delete files[args[1]!];
          return ok();
        }
        if (tool === "rm") {
          delete files[args[1]!];
          return ok();
        }
        return { exitCode: 1, stdout: "", stderr: "unexpected" };
      },
    } as WorkspaceExec;
    const hostGit = async (args: string[]): Promise<CommandResult> => {
      if (args[0] === "ls-tree") {
        const paths = args.slice(args.indexOf("--") + 1);
        return { exitCode: 0, stdout: paths.filter((path) => trusted[path]).map((path) => `100644 blob ${trusted[path]}\t${path}`).join("\n"), stderr: "" };
      }
      return { exitCode: 1, stdout: "", stderr: "unexpected" };
    };
    return { prove: workspaceBaseIdentityProver({ workspaceExec: exec, workspaceRoot: "/work/sms", hostRepoRoot: "/host/sms", hostGit }), commands, files };
  }

  const request = { trustedBaseRev: TRUSTED, claimBaseRev: CLAIM_BASE, sourcePath: SOURCE, objectTarget: COMPILED, changedPaths: [SOURCE] };

  test("parses ninja deps as ninja names them; none recorded is unknown", () => {
    expect(parseNinjaDeps(`${COMPILED}: #deps 2, deps mtime 1 (VALID)\n    ${SOURCE}\n    ${MCH}\n`)).toEqual([SOURCE, MCH]);
    expect(parseNinjaDeps(`${COMPILED}: #deps 0, deps mtime 0 (VALID)\n`)).toBeNull();
    expect(parseNinjaDeps("")).toBeNull();
  });

  test("proves identity over every compile input; generated ones are regenerated from them and match", async () => {
    const { prove, commands, files } = fakes();
    const result = await prove(request);
    expect(typeof result).toBe("object");
    const proved = result as BaseIdentityProof;
    expect(proved.inputs.filter((input) => !input.generated).map((input) => input.path)).toEqual(Object.keys(TRACKED).sort());
    expect(proved.inputs.filter((input) => input.generated).map((input) => input.path)).toEqual([COMPILER, CONFIG_JSON, "build/GMSJ01/include/SMS.mch", DTK].sort());
    expect(proved.proofHash).toMatch(/^[0-9a-f]{64}$/);
    // Source-derived outputs were rebuilt in one ninja run; build tools were only checked for staleness.
    expect(commands.filter((command) => command[0] === "ninja" && command[1] !== "-t" && command[1] !== "-n")).toEqual([["ninja", CONFIG_JSON, MCH]]);
    expect(commands.filter((command) => command[1] === "-n").map((command) => command[2]).sort()).toEqual([COMPILER, DTK].sort());
    // The workspace is left as found: the candidates are back, the scratch copies gone.
    expect(files[MCH]).toBe("0ac0");
    expect(Object.keys(files).some((path) => path.startsWith("/tmp/restore.1/"))).toBe(false);
  });

  test("a tampered generated header with a fresh timestamp does not match its regeneration and is refused", async () => {
    const { prove, files } = fakes({ sandbox: { [MCH]: "7a3e" } });
    expect(await prove(request)).toBe("generated input build/GMSJ01/include/SMS.mch does not match its regeneration from the trusted-base inputs");
    // The workspace keeps what it had (the tampered candidate), untouched by the check.
    expect(files[MCH]).toBe("7a3e");
  });

  test("an input git never listed as changed is still compared (config, a precompiled header's source)", async () => {
    expect(await fakes({ sandbox: { "config/GMSJ01/config.yml": "9999" } }).prove(request)).toBe(`config/GMSJ01/config.yml differs from the trusted base ${TRUSTED}`);
    expect(await fakes({ sandbox: { [PCH_HEADER]: "9999" } }).prove(request)).toBe(`${PCH_HEADER} differs from the trusted base ${TRUSTED}`);
  });

  test("refuses a stale generated input, missing dependencies, an outside edit, or an input the trusted base lacks", async () => {
    expect(await fakes({ staleTool: true }).prove(request)).toBe(`build tool ${COMPILER} is not up to date`);
    expect(await fakes({ regenerates: { [MCH]: "" } }).prove(request)).toMatch(/^could not hash|does not match/);
    expect(await fakes({ deps: null }).prove(request)).toBe(`no recorded compile dependencies for ${COMPILED}`);
    expect(await fakes().prove({ ...request, objectTarget: null })).toBe("the unit's object is unknown, so its compile inputs are unknown");
    expect(await fakes().prove({ ...request, changedPaths: [SOURCE, "src/Other.cpp"] })).toBe("the attempt changes files outside the target's compile inputs: src/Other.cpp");
    const withNew = `${COMPILED}: #deps 3, deps mtime 1 (VALID)\n    ${SOURCE}\n    /work/sms/${HEADER}\n    /work/sms/include/New.hpp\n\n`;
    expect(await fakes({ deps: withNew, sandbox: { "include/New.hpp": "dddd" } }).prove(request)).toBe(`compile input include/New.hpp is not in the trusted base ${TRUSTED}`);
  });
});
