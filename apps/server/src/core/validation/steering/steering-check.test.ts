import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CommandResult } from "@server/infrastructure/shell";
import {
  OUT_OF_ORDER_INSTRUCTION,
  STEERING_LOCATED_INSTRUCTION,
  UNUSED_BODY_INSTRUCTION,
  hostSteeringRunner,
  parseSteeringDecision,
  sandboxAttributePath,
  steeringCertificateProblems,
  uploadThroughExec,
  runWorkerSteeringGate,
  steeringRejectionReason,
  steeringRepairInstruction,
  type SteeringRunner,
  type WorkerSteeringResult,
} from "./steering-check.js";

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "steering-check-"));
  dirs.push(dir);
  return dir;
}

const ok = (value: unknown): CommandResult => ({ exitCode: 0, stdout: JSON.stringify(value), stderr: "" });

const EDITS = {
  tool: "steering_check", version: 1, base_rev: "base", edits_hash: "h1",
  files: [{ path: "src/Enemy/x.cpp", base_exists: true, cand_exists: true, base_text: "a", cand_text: "b" }],
};
const REDUCE = {
  edits_hash: "h1",
  analysis: "complete",
  groups: [
    { id: "g1", status: "removable", edit_ids: ["e1", "e2"] },
    { id: "g2", status: "real", edit_ids: ["e3"] },
    { id: "g3", status: "removable", edit_ids: ["e4"] },
  ],
};
const MWCC = { edits_hash: "h1", functions: [{ unit: "u", name: "f" }], errors: [] };

function decision(attempt: string, fnDecision = attempt) {
  return {
    attempt,
    reasons: attempt === "pass" ? [] : ["f: steering"],
    functions: [{
      unit: "mario/Enemy/x", name: "T::f", decision: fnDecision, semantic: fnDecision === "pass" ? "clean" : "steering",
      analysis: "complete", audit_label: "real", match: { base: 90, candidate: 100, real_only: 95.5 },
    }],
    removable_noncosmetic: attempt === "pass" ? [] : ["g1"],
    probes: [{ function: "T::f", unit: "mario/Enemy/x", hypotheses: [] }, { bogus: true }],
    units: [{ unit: "mario/Enemy/x", built: true, compared: true }],
  };
}

/** Fake runner: sandbox steps answer on stdout, host steps write their `--out` file. */
function fakeRunner(overrides: Partial<Record<string, (args: string[]) => Promise<CommandResult> | CommandResult>> = {}) {
  const calls: Array<{ step: string; where: "sandbox" | "host"; args: string[] }> = [];
  const uploads = new Map<string, string>();
  const outputs: Record<string, unknown> = { edits: EDITS, reduce: REDUCE, mwcc: MWCC, decide: decision("pass") };
  const runner: SteeringRunner = async (args, where) => {
    const name = args[0]!;
    calls.push({ step: name, where, args });
    const override = overrides[name];
    if (override) return override(args);
    const out = args.indexOf("--out");
    if (out >= 0) {
      writeFileSync(args[out + 1]!, JSON.stringify(outputs[name]));
      return { exitCode: 0, stdout: "", stderr: "" };
    }
    return ok(outputs[name]);
  };
  runner.uploadToSandbox = async (path, content) => {
    calls.push({ step: "upload", where: "sandbox", args: [path] });
    uploads.set(path, content);
  };
  return { runner, calls, uploads };
}

function gate(runner: SteeringRunner, extra: Partial<Parameters<typeof runWorkerSteeringGate>[0]> = {}) {
  const outputDir = tempDir();
  return runWorkerSteeringGate({
    baseRev: "base",
    functions: ["T::f"],
    hostRepoRoot: "/host/repo",
    cacheDir: join(outputDir, "cache"),
    outputDir,
    attemptIndex: 2,
    mode: "enforce",
    runner,
    ...extra,
  });
}

describe("runWorkerSteeringGate", () => {
  test("pass: runs edits(sandbox) -> reduce(host) -> mwcc(sandbox) -> decide(host) and writes the artifact", async () => {
    const { runner, calls } = fakeRunner();
    const result = await gate(runner);
    expect(result.error).toBeNull();
    expect(result.decision?.attempt).toBe("pass");
    expect(result.decision?.probes).toHaveLength(1);
    expect(calls.map(({ step, where }) => `${step}:${where}`)).toEqual(["edits:sandbox", "reduce:host", "upload:sandbox", "mwcc:sandbox", "decide:host"]);
    const reduce = calls[1]!.args;
    expect(reduce.slice(0, 3)).toEqual(["reduce", "--oracle-repo", "/host/repo"]);
    expect(readFileSync(reduce[reduce.indexOf("--input") + 1]!, "utf8")).toContain("\"edits_hash\":\"h1\"");
    const mwcc = calls[3]!.args;
    expect(mwcc[mwcc.indexOf("--edits-hash") + 1]).toBe("h1");
    expect(mwcc[mwcc.indexOf("--revert-edits") + 1]).toBe("e1,e2,e4");
    expect(mwcc[mwcc.indexOf("--functions") + 1]).toBe("T::f");
    expect(mwcc[mwcc.indexOf("--attribute") + 1]).toBe(sandboxAttributePath(2));
    expect(result.certificate).toEqual({ sourceChanged: true, reduceAnalysis: "complete", unresolvedGroups: [] });
    expect(result.artifactPath?.endsWith("attempt-2.steering.json")).toBe(true);
    const artifact = JSON.parse(readFileSync(result.artifactPath!, "utf8"));
    expect(artifact).toMatchObject({ mode: "enforce", error: null, decision: { attempt: "pass" } });
    expect(steeringRejectionReason(result)).toBeNull();
  });

  test("steering_located: enforce rejects with the functions, the real-only score and the instruction", async () => {
    const { runner } = fakeRunner({
      decide: (args) => {
        writeFileSync(args[args.indexOf("--out") + 1]!, JSON.stringify(decision("steering_located")));
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    });
    const result = await gate(runner);
    expect(result.decision?.attempt).toBe("steering_located");
    const reason = steeringRejectionReason(result);
    expect(reason).toStartWith("steering_located: steering located in T::f (without steering: 95.5%)");
    expect(reason).toContain("g1");
    expect(reason).toEndWith(STEERING_LOCATED_INSTRUCTION);
    expect(steeringRejectionReason({ ...result, mode: "shadow" })).toBeNull();
  });

  test("unresolved: enforce rejects; host steps fall back to stdout when no --out file is written", async () => {
    const { runner } = fakeRunner({ decide: () => ok({ decision: decision("unresolved") }) });
    const result = await gate(runner);
    expect(result.decision?.attempt).toBe("unresolved");
    expect(steeringRejectionReason(result)).toContain("unresolved: T::f");
  });

  test("tool failure: a non-zero step becomes an error, later steps never run, enforce rejects", async () => {
    const { runner, calls } = fakeRunner({ reduce: () => ({ exitCode: 2, stdout: "", stderr: "clang missing" }) });
    const result = await gate(runner);
    expect(result.decision).toBeNull();
    expect(result.error).toBe("steering_check.py reduce exited 2: clang missing");
    expect(calls.map(({ step }) => step)).toEqual(["edits", "reduce"]);
    expect(steeringRejectionReason(result)).toContain("could not certify this attempt (steering_check.py reduce exited 2: clang missing)");
    expect(existsSync(result.artifactPath!)).toBe(true);
  });

  test("timeout: the whole-gate budget ends a hanging step with an error instead of throwing", async () => {
    const { runner } = fakeRunner({ mwcc: () => new Promise<CommandResult>(() => {}) });
    const started = Date.now();
    const result = await gate(runner, { budgetMs: 150 });
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(result.decision).toBeNull();
    expect(result.error).toContain("budget");
    expect(result.error).toContain("mwcc");
    expect(steeringRejectionReason(result)).toStartWith("steering_located: the steering gate could not certify");
  });

  test("malformed JSON from a sandbox step or decide is an error", async () => {
    const edits = await gate(fakeRunner({ edits: () => ({ exitCode: 0, stdout: "not json", stderr: "" }) }).runner);
    expect(edits.error).toBe("steering_check.py edits did not return the expected JSON");
    const decide = await gate(fakeRunner({ decide: () => ok({ attempt: "maybe", functions: [] }) }).runner);
    expect(decide.error).toBe("steering_check.py decide did not return a valid decision");
    expect(decide.decision).toBeNull();
  });

  test("a runner that throws never escapes", async () => {
    const result = await gate(async () => {
      throw new Error("sandbox gone");
    });
    expect(result.error).toBe("sandbox gone");
  });
});

describe("parseSteeringDecision", () => {
  test("accepts decide output and check output, rejects malformed rows", () => {
    expect(parseSteeringDecision(decision("pass"))?.functions[0]?.match).toEqual({ base: 90, candidate: 100, real_only: 95.5 });
    expect(parseSteeringDecision({ edits: {}, decision: decision("unresolved") })?.attempt).toBe("unresolved");
    expect(parseSteeringDecision(null)).toBeNull();
    expect(parseSteeringDecision({ attempt: "pass" })).toBeNull();
    expect(parseSteeringDecision({ attempt: "pass", functions: [{ unit: "u", name: "f", decision: "odd" }] })).toBeNull();
  });

  test("unused_checks keep the compile-flags binding edit_scope re-checks (string, null, or rejected when malformed)", () => {
    const row = { unit: "u1", file: "src/a.c", function: "u(void)", status: "inlined", changed: [] };
    const parse = (extra: Record<string, unknown>) => parseSteeringDecision({ ...decision("pass"), unused_checks: [{ ...row, ...extra }] });
    expect(parse({ unit_flags_sha256: "ab12" })?.unused_checks?.[0]?.unit_flags_sha256).toBe("ab12");
    expect(parse({ unit_flags_sha256: null })?.unused_checks?.[0]).toHaveProperty("unit_flags_sha256", null);
    expect(parse({})?.unused_checks?.[0]).not.toHaveProperty("unit_flags_sha256");
    expect(parse({ unit_flags_sha256: 7 })).toBeNull();
  });

  test("shadow and pass never produce a rejection reason", () => {
    const base: WorkerSteeringResult = { mode: "shadow", decision: null, error: "boom", artifactPath: null, durationMs: 1 };
    expect(steeringRejectionReason(base)).toBeNull();
    expect(steeringRejectionReason({ ...base, mode: "off" })).toBeNull();
  });
});

describe("mwcc --attribute input", () => {
  test("uploads the host reduce report into the sandbox and hands mwcc its path", async () => {
    const { runner, calls, uploads } = fakeRunner();
    const result = await gate(runner);
    expect(result.error).toBeNull();
    const mwcc = calls.find((call) => call.step === "mwcc")!.args;
    const attribute = mwcc[mwcc.indexOf("--attribute") + 1]!;
    expect(attribute).toBe("build/steering/attempt-2.reduce.json");
    expect(JSON.parse(uploads.get(attribute)!)).toEqual(REDUCE);
    // The upload lands before mwcc runs.
    expect(calls.findIndex((call) => call.step === "upload")).toBeLessThan(calls.findIndex((call) => call.step === "mwcc"));
  });

  test("a runner without an uploader, or a failing upload, is a gate error before mwcc", async () => {
    const plain: SteeringRunner = async (args) => {
      const out = args.indexOf("--out");
      if (out >= 0) writeFileSync(args[out + 1]!, JSON.stringify(REDUCE));
      return ok(EDITS);
    };
    expect((await gate(plain)).error).toBe("steering runner cannot upload the reduce report for mwcc --attribute");
    const { runner, calls } = fakeRunner();
    runner.uploadToSandbox = async () => {
      throw new Error("disk full");
    };
    const failed = await gate(runner);
    expect(failed.error).toBe("disk full");
    expect(calls.some((call) => call.step === "mwcc")).toBe(false);
  });

  test("uploadThroughExec writes chunked base64 through exec and verifies the sha256", async () => {
    const dir = tempDir();
    const content = `${"x".repeat(150_000)}é`;
    const commands: string[][] = [];
    const exec = {
      exec: async (command: string[]) => {
        commands.push(command);
        const proc = Bun.spawnSync(command, { cwd: dir, stdout: "pipe", stderr: "pipe" });
        return { exitCode: proc.exitCode, stdout: proc.stdout.toString(), stderr: proc.stderr.toString() };
      },
      captureGitDiff: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
    };
    await uploadThroughExec(exec, "build/steering/a.json", content);
    expect(readFileSync(join(dir, "build/steering/a.json"), "utf8")).toBe(content);
    expect(commands.filter((command) => command.includes("wb") || command.includes("ab"))).toHaveLength(3);
    expect(Math.max(...commands.map((command) => command.at(-1)!.length))).toBeLessThan(128 * 1024);
  });

  test("the host runner's upload is a local write under its cwd", async () => {
    const dir = tempDir();
    const runner = hostSteeringRunner("/nonexistent/steering_check.py", dir);
    await runner.uploadToSandbox!("build/steering/attempt-1.reduce.json", "{\"groups\":[]}");
    expect(readFileSync(join(dir, "build/steering/attempt-1.reduce.json"), "utf8")).toBe("{\"groups\":[]}");
  });
});

describe("enforce never trusts the top-level attempt alone", () => {
  const passing = () => parseSteeringDecision(decision("pass"))!;
  const enforce = (decisionValue: ReturnType<typeof passing> | null, certificate?: WorkerSteeringResult["certificate"]): string | null =>
    steeringRejectionReason({ mode: "enforce", decision: decisionValue, error: null, artifactPath: null, durationMs: 1, ...(certificate ? { certificate } : {}) });
  const complete = { sourceChanged: true, reduceAnalysis: "complete", unresolvedGroups: [] };

  test("a fully certified pass is accepted", () => {
    expect(steeringCertificateProblems(passing(), complete)).toEqual([]);
    expect(enforce(passing(), complete)).toBeNull();
  });

  test("attempt pass with a function row that is not pass is rejected", () => {
    const value = passing();
    value.functions.push({ ...value.functions[0]!, name: "T::g", decision: "steering_located" });
    expect(enforce(value, complete)).toContain("steering located in T::g");
  });

  test("a pass row without clean, complete analysis is rejected", () => {
    const value = passing();
    value.functions[0] = { ...value.functions[0]!, analysis: "incomplete" };
    expect(enforce(value, complete)).toContain("pass without clean, complete analysis: T::f");
  });

  test("a unit that was not built or not compared is rejected", () => {
    const parsed = parseSteeringDecision({ ...decision("pass"), units: [{ unit: "mario/Enemy/x", built: true, compared: false }, { unit: "mario/Enemy/y", built: "yes", compared: true }] })!;
    expect(parsed.units).toEqual([{ unit: "mario/Enemy/x", built: true, compared: false }, { unit: "mario/Enemy/y", built: false, compared: true }]);
    const reason = enforce(parsed, complete)!;
    expect(reason).toContain("mario/Enemy/x (not compared)");
    expect(reason).toContain("mario/Enemy/y (not built)");
  });

  test("missing or empty coverage for a source change is rejected; an explicit no-change report is not", () => {
    const { units: _units, ...noUnits } = decision("pass");
    expect(enforce(parseSteeringDecision(noUnits), complete)).toContain("no unit coverage reported");
    const empty = parseSteeringDecision({ ...decision("pass"), functions: [], units: [] })!;
    const reason = enforce(empty, complete)!;
    expect(reason).toContain("no function was considered for a source change");
    expect(reason).toContain("empty unit coverage");
    const noChange = parseSteeringDecision({ ...decision("pass"), functions: [], units: [], no_changes: true })!;
    expect(enforce(noChange, { ...complete, sourceChanged: false })).toBeNull();
    // A no-change claim cannot cover an attempt whose edits changed source.
    expect(enforce(noChange, complete)).toContain("no function was considered");
  });

  test("removable non-cosmetic groups under a pass attempt are rejected", () => {
    const value = { ...passing(), removable_noncosmetic: ["g7"] };
    expect(enforce(value, complete)).toContain("behaviour-identical edit groups left in the patch: g7");
  });

  test("incomplete reduction or unresolved groups are rejected", () => {
    expect(enforce(passing(), { ...complete, reduceAnalysis: "incomplete" })).toContain("reduction analysis incomplete");
    expect(enforce(passing(), { ...complete, unresolvedGroups: ["g3"] })).toContain("unresolved edit groups: g3");
  });

  test("a malformed certificate is rejected", () => {
    expect(parseSteeringDecision({ ...decision("pass"), units: "all" })).toBeNull();
    expect(parseSteeringDecision({ ...decision("pass"), units: [{ built: true }] })).toBeNull();
    expect(parseSteeringDecision({ ...decision("pass"), removable_noncosmetic: "g1" })).toBeNull();
    expect(enforce(null)).toContain("could not certify");
  });

  test("the runner carries the certificate context into enforcement", async () => {
    const { runner } = fakeRunner();
    runner.uploadToSandbox = async () => undefined;
    const unresolvedReduce = { ...REDUCE, groups: [...REDUCE.groups, { id: "g9", status: "unresolved", edit_ids: ["e9"] }] };
    const wrapped: SteeringRunner = Object.assign(async (args: string[], where: "sandbox" | "host") => {
      if (args[0] === "reduce") {
        writeFileSync(args[args.indexOf("--out") + 1]!, JSON.stringify(unresolvedReduce));
        return ok({});
      }
      return runner(args, where);
    }, { uploadToSandbox: runner.uploadToSandbox });
    const result = await gate(wrapped);
    expect(result.decision?.attempt).toBe("pass");
    expect(steeringRejectionReason(result)).toContain("unresolved edit groups: g9");
  });
});

test("a non-pass attempt with clean rows is still rejected", () => {
  const value = parseSteeringDecision({ ...decision("pass"), attempt: "unresolved", reasons: ["order check disagreed"] })!;
  expect(steeringCertificateProblems(value, { sourceChanged: true, reduceAnalysis: "complete", unresolvedGroups: [] }))
    .toEqual(["attempt decision is unresolved (order check disagreed)"]);
});

describe("certificate uses decide's final group statuses", () => {
  const promotedReduce = { ...REDUCE, groups: [...REDUCE.groups, { id: "g9", status: "unresolved", edit_ids: ["e9"] }] };
  function runnerWith(reduce: unknown, decide: unknown): SteeringRunner {
    const { runner } = fakeRunner();
    return Object.assign(async (args: string[], where: "sandbox" | "host") => {
      const out = args.indexOf("--out");
      if (args[0] === "reduce") writeFileSync(args[out + 1]!, JSON.stringify(reduce));
      else if (args[0] === "decide") writeFileSync(args[out + 1]!, JSON.stringify(decide));
      else return runner(args, where);
      return ok({});
    }, { uploadToSandbox: async () => undefined });
  }

  test("a group decide promoted (map-call / data-order evidence) no longer rejects", async () => {
    const result = await gate(runnerWith(promotedReduce, { ...decision("pass"), unresolved_groups: [], group_updates: [{ id: "g9", status: "real", was: "unresolved" }] }));
    expect(result.certificate?.unresolvedGroups).toEqual([]);
    expect(steeringRejectionReason(result)).toBeNull();
  });

  test("a group decide still lists as unresolved rejects", async () => {
    const result = await gate(runnerWith(REDUCE, { ...decision("pass"), unresolved_groups: ["g2"] }));
    expect(steeringRejectionReason(result)).toContain("unresolved edit groups: g2");
  });

  test("without decide's unresolved_groups the reduce list is used (fail closed); incomplete reduce always rejects", async () => {
    const fallback = await gate(runnerWith(promotedReduce, decision("pass")));
    expect(steeringRejectionReason(fallback)).toContain("unresolved edit groups: g9");
    const incomplete = await gate(runnerWith({ ...REDUCE, analysis: "incomplete" }, { ...decision("pass"), unresolved_groups: [] }));
    expect(steeringRejectionReason(incomplete)).toContain("reduction analysis incomplete");
    expect(parseSteeringDecision({ ...decision("pass"), unresolved_groups: "g1" })).toBeNull();
  });
});

describe("unit coverage counts only built and compared units", () => {
  const complete = { sourceChanged: true, reduceAnalysis: "complete", unresolvedGroups: [] };
  test("a skipped (exempt) row is never covered, whatever its flags; built without compared is not covered", () => {
    const parsed = parseSteeringDecision({
      ...decision("pass"),
      units: [
        { unit: "mario/Enemy/x", built: true, compared: true },
        { unit: "mario/Enemy/h1", built: false, compared: false, exempt: "ir_unchanged", reason: "unchanged IR" },
        { unit: "mario/Enemy/h2", built: true, compared: true, exempt: "ir_unchanged" },
        { unit: "mario/Enemy/h3", built: true, compared: false },
      ],
    })!;
    const problems = steeringCertificateProblems(parsed, complete).join("; ");
    expect(problems).toContain("mario/Enemy/h1 (not built) (not compared) (skipped: ir_unchanged)");
    expect(problems).toContain("mario/Enemy/h2 (skipped: ir_unchanged)");
    expect(problems).toContain("mario/Enemy/h3 (not compared)");
    expect(problems).not.toContain("mario/Enemy/x,");
  });

  test("an all-skipped report with no functions is rejected", () => {
    const parsed = parseSteeringDecision({ ...decision("pass"), functions: [], units: [{ unit: "u", built: false, compared: false, exempt: "ir_unchanged" }] })!;
    const problems = steeringCertificateProblems(parsed, complete).join("; ");
    expect(problems).toContain("no function was considered");
    expect(problems).toContain("units not built and compared: u");
  });
});

describe("UNUSED-body rule (violations and stub tests)", () => {
  const complete = { sourceChanged: true, reduceAnalysis: "complete", unresolvedGroups: [] };
  const DEAD = { kind: "dead_unused_body", unit: "mario/Map/MapEventMare", file: "src/Map/MapEventMare.cpp", function: "TMareEventDepressWall::emitEffect", line: 412 };
  const CHECK_DEAD = {
    unit: DEAD.unit, file: DEAD.file, function: DEAD.function, mangled: "emitEffect__21TMareEventDepressWallFi",
    status: "dead", stub: "{ }", changed: [], reason: null,
  };
  const CHECK_INLINED = {
    unit: "mario/Enemy/chuuhana", file: "src/Enemy/chuuhana.cpp", function: "TChuuHana::rolling", status: "inlined" as const, stub: "{ }",
    changed: [{ function: "TNerveChuuHanaRoll::execute", before: { status: "match", match_percent: 86 }, after: { status: "nonmatch", match_percent: 45 } }],
  };
  const withRule = (extra: Record<string, unknown>) => parseSteeringDecision({ ...decision("pass"), ...extra });
  const enforce = (value: ReturnType<typeof withRule>, certificate = complete): string | null =>
    steeringRejectionReason({ mode: "enforce", decision: value, error: null, artifactPath: null, durationMs: 1, certificate });

  test("parses violations and unused_checks; absent fields are empty lists", () => {
    expect(parseSteeringDecision(decision("pass"))).toMatchObject({ violations: [], unused_checks: [] });
    const parsed = withRule({ attempt: "rule_violation", violations: [DEAD], unused_checks: [CHECK_DEAD, CHECK_INLINED] })!;
    expect(parsed.attempt).toBe("rule_violation");
    expect(parsed.violations).toEqual([DEAD]);
    expect(parsed.unused_checks).toEqual([
      { unit: DEAD.unit, file: DEAD.file, function: DEAD.function, mangled: "emitEffect__21TMareEventDepressWallFi", status: "dead", stub: "{ }", changed: [] },
      CHECK_INLINED,
    ]);
    // `line` is optional; null reads as absent.
    expect(withRule({ violations: [{ ...DEAD, line: null }] })?.violations).toEqual([{ kind: DEAD.kind, unit: DEAD.unit, file: DEAD.file, function: DEAD.function }]);
  });

  test("wrong types in violations or unused_checks are malformed (fail closed)", () => {
    expect(withRule({ violations: "dead" })).toBeNull();
    expect(withRule({ violations: [{ ...DEAD, function: 7 }] })).toBeNull();
    expect(withRule({ violations: [{ ...DEAD, line: "412" }] })).toBeNull();
    expect(withRule({ unused_checks: {} })).toBeNull();
    expect(withRule({ unused_checks: [{ ...CHECK_DEAD, status: "maybe" }] })).toBeNull();
    expect(withRule({ unused_checks: [{ ...CHECK_DEAD, changed: "none" }] })).toBeNull();
    expect(withRule({ unused_checks: [{ ...CHECK_INLINED, changed: [{ before: {} }] }] })).toBeNull();
    expect(withRule({ unused_checks: [{ ...CHECK_DEAD, mangled: 1 }] })).toBeNull();
    expect(enforce(withRule({ violations: "dead" }))).toContain("could not certify");
  });

  test("a dead UNUSED body is a problem that names the rule; enforce rejects with the UNUSED-body instruction", () => {
    const value = withRule({ attempt: "rule_violation", violations: [DEAD], unused_checks: [CHECK_DEAD, CHECK_INLINED] })!;
    expect(steeringCertificateProblems(value, complete)).toEqual([
      "dead UNUSED body: TMareEventDepressWall::emitEffect (src/Map/MapEventMare.cpp:412) — UNUSED functions may only be reconstructed when inlined",
    ]);
    const reason = enforce(value)!;
    expect(reason).toStartWith("steering_located: dead UNUSED body: TMareEventDepressWall::emitEffect");
    expect(reason).toEndWith(UNUSED_BODY_INSTRUCTION);
    expect(reason).not.toContain(STEERING_LOCATED_INSTRUCTION);
  });

  test("an inlined UNUSED body certifies; an inconclusive stub test rejects as incomplete analysis", () => {
    expect(steeringCertificateProblems(withRule({ unused_checks: [CHECK_INLINED] }), complete)).toEqual([]);
    const inconclusive = withRule({ attempt: "unresolved", unused_checks: [{ ...CHECK_INLINED, status: "inconclusive", changed: [], reason: "stub build failed" }] })!;
    expect(steeringCertificateProblems(inconclusive, complete)).toEqual(["UNUSED stub test inconclusive: TChuuHana::rolling (src/Enemy/chuuhana.cpp): stub build failed"]);
    expect(enforce(inconclusive)).toEndWith(STEERING_LOCATED_INSTRUCTION);
  });

  test("a violation next to steering carries both instructions; a rule_violation without a listed violation still rejects", () => {
    const mixed = parseSteeringDecision({ ...decision("steering_located"), violations: [DEAD] })!;
    expect(steeringRepairInstruction({ decision: mixed, error: null, certificate: complete })).toBe(`${UNUSED_BODY_INSTRUCTION} ${STEERING_LOCATED_INSTRUCTION}`);
    expect(enforce(mixed)).toContain("steering located in T::f");
    const bare = parseSteeringDecision({ ...decision("pass"), attempt: "rule_violation" })!;
    expect(steeringCertificateProblems(bare, complete)).toEqual(["attempt decision is rule_violation"]);
    const row = parseSteeringDecision(decision("rule_violation"))!;
    expect(steeringCertificateProblems(row, complete)).toContain("rule violation in T::f");
    expect(steeringRepairInstruction({ decision: null, error: "boom" })).toBe(STEERING_LOCATED_INSTRUCTION);
  });
});

describe("decompile-in-order rule (out_of_order violations and order checks)", () => {
  const complete = { sourceChanged: true, reduceAnalysis: "complete", unresolvedGroups: [] };
  const FILE = "src/System/MarNameRefGen_Enemy.cpp";
  const OUT = {
    kind: "out_of_order", file: FILE, line: 5, class: "TKoopa", owner_unit: "mario/Enemy/Koopa", owner_progress: 0,
    reason: "TKoopa belongs to mario/Enemy/Koopa (0.0%, blank stub), below the 50% decompiled bar",
  };
  const DEAD = { kind: "dead_unused_body", unit: "mario/Map/MapEventMare", file: "src/Map/MapEventMare.cpp", function: "TMareEventDepressWall::emitEffect", line: 412 };
  const CHECK = { file: FILE, line: 5, class: "TKoopa", via: "new", edit_id: `${FILE}#0.0`, owner_unit: "mario/Enemy/Koopa", owner_progress: 0, status: "out_of_order", reason: OUT.reason };
  const PROBLEM = `out of order: ${FILE}:5 uses TKoopa (owner mario/Enemy/Koopa, not decompiled) — don't fill in code that needs classes whose units are not decompiled`;
  // The function row's groups touch FILE, so the violation's unit resolves to it.
  const withOrder = (extra: Record<string, unknown>) => {
    const base = decision("pass");
    return parseSteeringDecision({ ...base, functions: [{ ...base.functions[0], groups: [`${FILE}@0.0`] }], ...extra });
  };
  const instruction = (value: ReturnType<typeof withOrder>) => steeringRepairInstruction({ decision: value, error: null, certificate: complete });

  test("parses out_of_order violations (unit from the touching function rows) and order checks", () => {
    const parsed = withOrder({ attempt: "rule_violation", violations: [OUT], order_checks: [CHECK, { ...CHECK, class: "TTinKoopa", status: "ok", owner_progress: 98.5, reason: "" }] })!;
    expect(parsed.violations).toEqual([{ ...OUT, kind: "out_of_order", unit: "mario/Enemy/x" }]);
    expect(parsed.order_checks?.map((check) => check.status)).toEqual(["out_of_order", "ok"]);
    expect(parseSteeringDecision(decision("pass"))?.order_checks).toEqual([]);
    // No function row touches the file: the unit stays unknown.
    expect(parseSteeringDecision({ ...decision("pass"), violations: [OUT] })?.violations?.[0]).not.toHaveProperty("unit");
    // Unknown owner reads as null.
    expect(withOrder({ order_checks: [{ ...CHECK, owner_unit: null, owner_progress: null, status: "unknown" }] })?.order_checks?.[0]).toMatchObject({ owner_unit: null, owner_progress: null });
  });

  test("wrong types in out_of_order violations or order checks are malformed (fail closed)", () => {
    expect(withOrder({ violations: [{ ...OUT, class: 7 }] })).toBeNull();
    expect(withOrder({ violations: [{ ...OUT, owner_unit: undefined }] })).toBeNull();
    expect(withOrder({ violations: [{ ...OUT, owner_progress: "0" }] })).toBeNull();
    expect(withOrder({ violations: [{ ...OUT, reason: 1 }] })).toBeNull();
    expect(withOrder({ violations: [{ ...OUT, unit: 3 }] })).toBeNull();
    expect(withOrder({ violations: [{ ...DEAD, unit: undefined }] })).toBeNull();
    expect(withOrder({ order_checks: {} })).toBeNull();
    expect(withOrder({ order_checks: [{ ...CHECK, status: "maybe" }] })).toBeNull();
    expect(withOrder({ order_checks: [{ ...CHECK, owner_progress: "0" }] })).toBeNull();
    expect(withOrder({ order_checks: [{ ...CHECK, class: null }] })).toBeNull();
  });

  test("an out_of_order violation is its own problem; enforce rejects with the out-of-order instruction", () => {
    const value = withOrder({ attempt: "rule_violation", violations: [OUT], order_checks: [CHECK] })!;
    // The out_of_order check is covered by its violation: one problem, not two.
    expect(steeringCertificateProblems(value, complete)).toEqual([PROBLEM]);
    expect(instruction(value)).toBe(OUT_OF_ORDER_INSTRUCTION);
    const reason = steeringRejectionReason({ mode: "enforce", decision: value, error: null, artifactPath: null, durationMs: 1, certificate: complete })!;
    expect(reason).toBe(`steering_located: ${PROBLEM}. ${OUT_OF_ORDER_INSTRUCTION}`);
  });

  test("an unknown order check is incomplete analysis; ok checks add nothing", () => {
    const unknown = { ...CHECK, owner_unit: null, owner_progress: null, status: "unknown", reason: "TKoopa: owner unit unknown" };
    expect(steeringCertificateProblems(withOrder({ order_checks: [{ ...CHECK, status: "ok", reason: "" }] }), complete)).toEqual([]);
    const value = withOrder({ attempt: "unresolved", order_checks: [unknown] })!;
    expect(steeringCertificateProblems(value, complete)).toEqual([`order check unknown: TKoopa at ${FILE}:5: TKoopa: owner unit unknown`]);
    expect(instruction(value)).toBe(STEERING_LOCATED_INSTRUCTION);
  });

  test("the instruction follows the violation kinds present", () => {
    expect(instruction(withOrder({ violations: [DEAD, OUT] }))).toBe(`${UNUSED_BODY_INSTRUCTION} ${OUT_OF_ORDER_INSTRUCTION}`);
    expect(instruction(withOrder({ violations: [DEAD] }))).toBe(UNUSED_BODY_INSTRUCTION);
    const steering = parseSteeringDecision({ ...decision("steering_located"), violations: [OUT] })!;
    expect(instruction(steering)).toBe(`${OUT_OF_ORDER_INSTRUCTION} ${STEERING_LOCATED_INSTRUCTION}`);
    // An unknown kind still rejects, with a generic problem and the steering instruction.
    const other = withOrder({ violations: [{ kind: "new_rule", file: FILE, line: 2 }] })!;
    expect(steeringCertificateProblems(other, complete)).toEqual([`rule violation new_rule: ${FILE}:2`]);
    expect(instruction(other)).toBe(STEERING_LOCATED_INSTRUCTION);
  });
});
