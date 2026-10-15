import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CommandResult } from "@server/infrastructure/shell";
import {
  STEERING_LOCATED_INSTRUCTION,
  hostSteeringRunner,
  parseSteeringDecision,
  sandboxAttributePath,
  steeringCertificateProblems,
  uploadThroughExec,
  runWorkerSteeringGate,
  steeringRejectionReason,
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
