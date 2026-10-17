import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { openState, type StateStore } from "@server/core/orchestrator-state";
import { claimSteeringExplainJobs, finishSteeringExplainJob, queueSteeringExplainJob, steeringExplainJob } from "@server/core/harness-runtime/run-state/steering-explain.js";
import { recordSteeringObservation, steeringObservation } from "@server/core/harness-runtime/run-state/steering.js";
import type { CommandResult } from "@server/infrastructure/shell";
import {
  runSteeringExplainJobs,
  startSteeringExplainConsumer,
  steeringExplainConcurrency,
  STEERING_EXPLAIN_NO_FIDELITY,
  steeringExplainToolFiles,
  steeringExplainToolHash,
  type SteeringExplainPrepare,
} from "./steering-explain.js";
import type { SteeringBuildTaskExecutor } from "./steering-gate.js";

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

const UNIT = "mario/Enemy/x";
/** Jobs store (and the tool is run with) the gate's unit: the report's without `mario/`. */
const GATE_UNIT = "Enemy/x";
const SYMBOL = "f__1TFv";
const DELTA = { summary_lines: ["+1 node: coalesced neighbour of this"], changes: [{ kind: "node" }], version: "1.2.5", variant: "global", label: "gate" };

interface Harness {
  store: StateStore;
  workDir: string;
  observationId: number;
  calls: { prepare: string[][]; execute: Array<{ kind: string; input: Record<string, unknown> }> };
}

function withHarness(run: (h: Harness) => Promise<void>, probe: Record<string, unknown> | null = { function: "T::f", symbol: SYMBOL, unit: UNIT, hypotheses: [] }): Promise<void> {
  const dir = tempDir("steering-explain-job-");
  const store = openState(dir);
  const observationId = recordSteeringObservation(store, { gameId: "sms", unit: UNIT, symbol: SYMBOL, verdict: "unresolved", mode: "enforce", probe: probe as never })!;
  const harness: Harness = { store, workDir: join(dir, "work"), observationId, calls: { prepare: [], execute: [] } };
  return run(harness).finally(() => store.db.close());
}

function queue(h: Harness, overrides: Partial<Parameters<typeof queueSteeringExplainJob>[1]> = {}): number {
  return queueSteeringExplainJob(h.store, {
    observationId: h.observationId, gameId: "sms", unit: UNIT, symbol: SYMBOL, inputHash: "in-1", toolHash: "tool-1",
    variant: "global", inputs: { edits: "/host/a.edits.json", mwcc: "/host/a.mwcc.json", decision: "/host/a.decision.json", baseRev: "rev" },
    // Bound like the worker hook queues it: the decide row's fidelity record, whose input_hash is the job's.
    fidelity: { input_hash: overrides.inputHash ?? "in-1" },
    ...overrides,
  }).id!;
}

/** `prepare` writes its `--out` and reports ok, like the host step. */
function okPrepare(h: Harness): SteeringExplainPrepare {
  return async (args) => {
    h.calls.prepare.push(args);
    const out = args[args.indexOf("--out") + 1]!;
    writeFileSync(out, "{}\n");
    const expected = args[args.indexOf("--expect-fidelity-hash") + 1];
    return { exitCode: 0, stdout: JSON.stringify({ status: "ok", input_hash: "in-1", fidelity_input_hash: expected, out }), stderr: "" };
  };
}

function execute(h: Harness, stdout: (call: number) => unknown, exitCode = 0): SteeringBuildTaskExecutor {
  return (async (_repo: string, task: { kind: string; input: Record<string, unknown> }) => {
    h.calls.execute.push(task);
    const value = stdout(h.calls.execute.length);
    return { exitCode, stdout: typeof value === "string" ? value : JSON.stringify(value), stderr: "" } satisfies CommandResult;
  }) as unknown as SteeringBuildTaskExecutor;
}

function result(h: Harness, extra: Record<string, unknown>): Record<string, unknown> {
  return { schema: "steering-explain-result-v1", observation_id: h.observationId, input_hash: "in-1", retryable: false, ...extra };
}

describe("steering-explain job", () => {
  test("an ok result publishes the delta into the job and the observation's probe, once", () => withHarness(async (h) => {
    const id = queue(h);
    const run = () => runSteeringExplainJobs({
      store: h.store, gameId: "sms", repoRoot: "/repo", workDir: h.workDir,
      prepare: okPrepare(h), execute: execute(h, () => result(h, { status: "ok", compiler_delta: DELTA, probe: null })),
    });
    expect(await run()).toEqual({ claimed: 1, done: 1, unavailable: 0, retried: 0, failed: 0, lost: 0 });
    expect(steeringExplainJob(h.store, id)).toMatchObject({ status: "done", attempts: 1, compilerDelta: DELTA });
    const probe = steeringObservation(h.store, h.observationId)!.probe;
    expect(probe).toEqual({ function: "T::f", symbol: SYMBOL, unit: UNIT, hypotheses: [], compiler_delta: DELTA });

    // prepare saw the job's artifacts, target, observation, probe copy and variant.
    const args = h.calls.prepare[0]!;
    expect(args.slice(0, 13)).toEqual([
      "prepare", "--edits", "/host/a.edits.json", "--mwcc", "/host/a.mwcc.json", "--decision", "/host/a.decision.json",
      "--unit", GATE_UNIT, "--function", SYMBOL, "--observation-id", String(h.observationId),
    ]);
    expect(args).toContain("--probe");
    expect(args.slice(args.indexOf("--variant"), args.indexOf("--variant") + 4)).toEqual(["--variant", "global", "--label", "gate"]);
    // run is a steering build task with the prepared input uploaded.
    const task = h.calls.execute[0]!;
    expect(task.kind).toBe("steering");
    expect(task.input.command).toEqual(["python3", expect.stringContaining("steering_explain.py"), "run", "--input", `/tmp/steering-inputs/call/explain-${id}.json`, "--json", "--timeout-seconds", expect.any(String)]);
    expect(task.input.uploads).toEqual({ [`/tmp/steering-inputs/call/explain-${id}.json`]: join(h.workDir, `explain-${id}.json`) });

    // A done job is never run again.
    expect(await run()).toEqual({ claimed: 0, done: 0, unavailable: 0, retried: 0, failed: 0, lost: 0 });
    expect(h.calls.execute).toHaveLength(1);
  }));

  test("the result's own probe is published when it has one; a check report is passed as --check", () => withHarness(async (h) => {
    queue(h, { inputs: { check: "/host/check.json" } });
    const probe = { function: "T::f", symbol: SYMBOL, unit: UNIT, hypotheses: [{ cause: "measured" }], compiler_delta: DELTA };
    await runSteeringExplainJobs({
      store: h.store, gameId: "sms", repoRoot: "/repo", workDir: h.workDir,
      prepare: okPrepare(h), execute: execute(h, () => result(h, { status: "ok", compiler_delta: DELTA, probe })),
    });
    expect(h.calls.prepare[0]!.slice(0, 3)).toEqual(["prepare", "--check", "/host/check.json"]);
    expect(steeringObservation(h.store, h.observationId)!.probe).toEqual(probe);
  }));

  test("unavailable publishes {unavailable}, from prepare or from run, never an empty delta", () => withHarness(async (h) => {
    const fromPrepare = queue(h);
    const prepare: SteeringExplainPrepare = async (args) => {
      h.calls.prepare.push(args);
      return { exitCode: 0, stdout: JSON.stringify({ status: "unavailable", compiler_delta: { unavailable: "reconstruction: depfile missing" } }), stderr: "" };
    };
    expect(await runSteeringExplainJobs({ store: h.store, gameId: "sms", repoRoot: "/repo", workDir: h.workDir, prepare, execute: execute(h, () => "") }))
      .toMatchObject({ claimed: 1, unavailable: 1, done: 0 });
    expect(h.calls.execute).toHaveLength(0);
    expect(steeringExplainJob(h.store, fromPrepare)!.compilerDelta).toEqual({ unavailable: "reconstruction: depfile missing" });
    expect(steeringObservation(h.store, h.observationId)!.probe).toMatchObject({ compiler_delta: { unavailable: "reconstruction: depfile missing" } });

    const fromRun = queue(h, { inputHash: "in-2" });
    await runSteeringExplainJobs({
      store: h.store, gameId: "sms", repoRoot: "/repo", workDir: h.workDir,
      prepare: okPrepare(h), execute: execute(h, () => result(h, { status: "unavailable", compiler_delta: { unavailable: "traced-object-mismatch" }, probe: null })),
    });
    expect(steeringExplainJob(h.store, fromRun)).toMatchObject({ status: "done", compilerDelta: { unavailable: "traced-object-mismatch" } });
  }));

  test("a malformed result retries, then fails after maxAttempts; a non-retryable error fails at once", () => withHarness(async (h) => {
    const id = queue(h);
    const malformed = execute(h, () => result(h, { status: "ok", compiler_delta: {} }));
    const run = (exec: SteeringBuildTaskExecutor) => runSteeringExplainJobs({
      store: h.store, gameId: "sms", repoRoot: "/repo", workDir: h.workDir, maxAttempts: 2, prepare: okPrepare(h), execute: exec,
    });
    expect(await run(malformed)).toMatchObject({ claimed: 1, retried: 1, failed: 0 });
    expect(steeringExplainJob(h.store, id)).toMatchObject({ status: "queued", attempts: 1, compilerDelta: null });
    expect(await run(malformed)).toMatchObject({ claimed: 1, retried: 0, failed: 1 });
    expect(steeringExplainJob(h.store, id)).toMatchObject({ status: "failed", attempts: 2, compilerDelta: null });
    // A failed gate job is never an absent delta: the probe says the job failed.
    expect(steeringObservation(h.store, h.observationId)!.probe).toMatchObject({
      hypotheses: [], compiler_delta: { unavailable: expect.stringMatching(/^explain job failed: run: malformed compiler_delta/) },
    });

    const fatal = queue(h, { inputHash: "in-2" });
    expect(await run(execute(h, () => result(h, { status: "error", error: "edits.json unreadable", retryable: false }), 1))).toMatchObject({ failed: 1 });
    expect(steeringExplainJob(h.store, fatal)).toMatchObject({ status: "failed", attempts: 1, error: "run: edits.json unreadable" });
  }));

  test("a thrown task, a non-zero exit and a prepare error all retry", () => withHarness(async (h) => {
    const id = queue(h);
    const thrown = (async () => { throw new Error("sandbox gone"); }) as unknown as SteeringBuildTaskExecutor;
    const run = (prepare: SteeringExplainPrepare, exec: SteeringBuildTaskExecutor) => runSteeringExplainJobs({
      store: h.store, gameId: "sms", repoRoot: "/repo", workDir: h.workDir, maxAttempts: 5, prepare, execute: exec,
    });
    expect(await run(okPrepare(h), thrown)).toMatchObject({ retried: 1 });
    expect(steeringExplainJob(h.store, id)!.error).toBe("run: sandbox gone");
    expect(await run(okPrepare(h), execute(h, () => result(h, { status: "ok", compiler_delta: DELTA }), 2))).toMatchObject({ retried: 1 });
    const badPrepare: SteeringExplainPrepare = async () => ({ exitCode: 1, stdout: JSON.stringify({ status: "error", error: "no decision row" }), stderr: "" });
    expect(await run(badPrepare, thrown)).toMatchObject({ retried: 1 });
    expect(steeringExplainJob(h.store, id)).toMatchObject({ status: "queued", attempts: 3, error: expect.stringContaining("no decision row") });
  }));

  test("an ablation keeps its delta in the job row and never touches the probe", () => withHarness(async (h) => {
    const before = steeringObservation(h.store, h.observationId)!.probe;
    const id = queue(h, { label: "ablation", variant: "steering_sstar", inputHash: "in-ablation" });
    await runSteeringExplainJobs({
      store: h.store, gameId: "sms", repoRoot: "/repo", workDir: h.workDir,
      prepare: okPrepare(h), execute: execute(h, () => result(h, { status: "ok", compiler_delta: { ...DELTA, label: "ablation" }, probe: { function: "x", unit: UNIT } })),
    });
    expect(h.calls.prepare[0]).toContain("ablation");
    expect(steeringExplainJob(h.store, id)).toMatchObject({ status: "done", compilerDelta: { label: "ablation" } });
    expect(steeringObservation(h.store, h.observationId)!.probe).toEqual(before);
  }));

  test("an observation without a probe gets a minimal one", () => withHarness(async (h) => {
    queue(h);
    await runSteeringExplainJobs({
      store: h.store, gameId: "sms", repoRoot: "/repo", workDir: h.workDir,
      prepare: okPrepare(h), execute: execute(h, () => result(h, { status: "ok", compiler_delta: DELTA })),
    });
    expect(h.calls.prepare[0]).not.toContain("--probe");
    expect(steeringObservation(h.store, h.observationId)!.probe).toEqual({ function: SYMBOL, symbol: SYMBOL, unit: GATE_UNIT, compiler_delta: DELTA });
  }, null));
});

describe("steering-explain job provenance and leases", () => {
  const FIDELITY = { schema: "steering-function-fidelity-v1", input_hash: "fid-1", complete: true };

  test("a gate job whose input hash is not its fidelity record's fails before prepare", () => withHarness(async (h) => {
    const id = queue(h, { fidelity: FIDELITY, inputHash: "other" });
    expect(await runSteeringExplainJobs({ store: h.store, gameId: "sms", repoRoot: "/repo", workDir: h.workDir, prepare: okPrepare(h), execute: execute(h, () => "") }))
      .toMatchObject({ claimed: 1, failed: 1 });
    expect(h.calls.prepare).toHaveLength(0);
    expect(steeringExplainJob(h.store, id)).toMatchObject({ status: "failed", error: "queued input hash does not match its fidelity record" });
  }));

  test("prepare is told the expected fidelity hash, and an input prepared for another fidelity record publishes nothing", () => withHarness(async (h) => {
    const id = queue(h, { fidelity: FIDELITY, inputHash: "fid-1" });
    const replaced: SteeringExplainPrepare = async (args) => {
      h.calls.prepare.push(args);
      const out = args[args.indexOf("--out") + 1]!;
      writeFileSync(out, "{}\n");
      return { exitCode: 0, stdout: JSON.stringify({ status: "ok", input_hash: "x", out, fidelity_input_hash: "fid-2" }), stderr: "" };
    };
    expect(await runSteeringExplainJobs({ store: h.store, gameId: "sms", repoRoot: "/repo", workDir: h.workDir, prepare: replaced, execute: execute(h, () => result(h, { status: "ok", compiler_delta: DELTA })) }))
      .toMatchObject({ claimed: 1, failed: 1, done: 0 });
    const args = h.calls.prepare[0]!;
    expect(args.slice(args.indexOf("--expect-fidelity-hash"), args.indexOf("--expect-fidelity-hash") + 2)).toEqual(["--expect-fidelity-hash", "fid-1"]);
    expect(h.calls.execute).toHaveLength(0);
    expect(steeringExplainJob(h.store, id)).toMatchObject({ status: "failed", compilerDelta: null, error: expect.stringContaining("provenance") });
    expect(steeringObservation(h.store, h.observationId)!.probe!.compiler_delta).toEqual({ unavailable: expect.stringMatching(/^explain job failed: provenance/) });
  }));

  test("a job whose runner died is reclaimed after its lease and completed; the dead runner's late finish is refused", () => withHarness(async (h) => {
    const id = queue(h);
    const t0 = new Date("2026-10-17T00:00:00.000Z");
    expect(claimSteeringExplainJobs(h.store, { limit: 1, maxAttempts: 3, owner: "dead", leaseMs: 60_000, now: t0 })).toHaveLength(1);
    const run = (at: Date) => runSteeringExplainJobs({
      store: h.store, gameId: "sms", repoRoot: "/repo", workDir: h.workDir, timeoutMs: 60_000, owner: "second", now: () => at,
      prepare: okPrepare(h), execute: execute(h, () => result(h, { status: "ok", compiler_delta: DELTA })),
    });
    expect(await run(new Date(t0.getTime() + 30_000))).toMatchObject({ claimed: 0 });
    expect(await run(new Date(t0.getTime() + 60_000))).toMatchObject({ claimed: 1, done: 1 });
    expect(steeringExplainJob(h.store, id)).toMatchObject({ status: "done", attempts: 2, claimOwner: "second", compilerDelta: DELTA });
    const published = steeringObservation(h.store, h.observationId)!.probe;
    expect(finishSteeringExplainJob(h.store, id, { compilerDelta: { summary_lines: ["late"], changes: [] }, owner: "dead", probe: () => ({ late: true }) })).toBe(false);
    expect(steeringObservation(h.store, h.observationId)!.probe).toEqual(published);
    expect(steeringExplainJob(h.store, id)!.compilerDelta).toEqual(DELTA);
  }));

  test("a runner claims one job at a time and never retries a job twice in one pass", () => withHarness(async (h) => {
    queue(h);
    queue(h, { inputHash: "in-2" });
    const seen: unknown[] = [];
    const summary = await runSteeringExplainJobs({
      store: h.store, gameId: "sms", repoRoot: "/repo", workDir: h.workDir, maxAttempts: 5,
      prepare: okPrepare(h),
      execute: (async () => {
        // Each job is claimed (running) on its own when its task starts.
        seen.push(h.store.db.query("SELECT COUNT(*) AS n FROM steering_explain_jobs WHERE status = 'running'").get());
        throw new Error("down");
      }) as unknown as SteeringBuildTaskExecutor,
    });
    expect(summary).toMatchObject({ claimed: 2, retried: 2 });
    expect(seen).toEqual([{ n: 1 }, { n: 1 }]);
  }));
});

describe("steering-explain job with the real prepare", () => {
  test("the host prepare step reads a gate check report and the sandbox input carries the job's observation", () => withHarness(async (h) => {
    // `explain-check.json`: a fake-toolchain gate (test_steering_explain.py writes it), fidelity record included.
    const check = join(import.meta.dir, "../steering/__fixtures__/explain-check.json");
    // Queued like the worker hook: bound to the decide row's fidelity record, which prepare verifies.
    const report = JSON.parse(readFileSync(check, "utf8")) as { decision: { functions: Array<{ unit: string; name: string; fidelity: Record<string, unknown> }> } };
    const fidelity = report.decision.functions.find((fn) => fn.unit === "u1" && fn.name === "g")!.fidelity;
    const id = queue(h, { unit: "u1", symbol: "g", inputs: { check }, fidelity, inputHash: String(fidelity.input_hash) });
    let input: Record<string, unknown> = {};
    const summary = await runSteeringExplainJobs({
      store: h.store, gameId: "sms", repoRoot: "/repo", workDir: h.workDir,
      execute: (async (_repo: string, task: { input: { uploads: Record<string, string> } }) => {
        input = JSON.parse(readFileSync(Object.values(task.input.uploads)[0]!, "utf8")) as Record<string, unknown>;
        return { exitCode: 0, stderr: "", stdout: JSON.stringify(result(h, { status: "ok", input_hash: input.input_hash, compiler_delta: DELTA, probe: null })) };
      }) as unknown as SteeringBuildTaskExecutor,
    });
    expect(summary).toMatchObject({ claimed: 1, done: 1, failed: 0 });
    expect(input).toMatchObject({ schema: "steering-explain-input-v1", observation_id: h.observationId, unit: "u1", function: "g", variant: "global", label: "gate" });
    expect(input.probe).toEqual({ function: "T::f", symbol: SYMBOL, unit: UNIT, hypotheses: [] });
    expect(steeringExplainJob(h.store, id)).toMatchObject({ status: "done", compilerDelta: DELTA });
  }));

  test("a check report replaced after queueing (another fidelity record) publishes nothing from the replacement", () => withHarness(async (h) => {
    const fixture = JSON.parse(readFileSync(join(import.meta.dir, "../steering/__fixtures__/explain-check.json"), "utf8")) as {
      decision: { functions: Array<{ unit: string; name: string; fidelity: Record<string, unknown> }> };
    };
    const row = fixture.decision.functions.find((fn) => fn.unit === "u1" && fn.name === "g")!;
    const fidelity = { ...row.fidelity };
    const check = join(h.workDir, "..", "check.json");
    writeFileSync(check, JSON.stringify(fixture));
    const id = queue(h, { unit: "u1", symbol: "g", inputs: { check }, fidelity, inputHash: String(fidelity.input_hash) });
    // The gate re-ran into the same path: another candidate, another fidelity record.
    row.fidelity = { ...row.fidelity, input_hash: "0".repeat(64) };
    writeFileSync(check, JSON.stringify(fixture));
    const summary = await runSteeringExplainJobs({
      store: h.store, gameId: "sms", repoRoot: "/repo", workDir: h.workDir, maxAttempts: 1,
      execute: execute(h, () => result(h, { status: "ok", compiler_delta: DELTA })),
    });
    expect(summary).toMatchObject({ claimed: 1, done: 0 });
    expect(h.calls.execute).toHaveLength(0);
    const job = steeringExplainJob(h.store, id)!;
    expect(job.compilerDelta?.summary_lines).toBeUndefined();
    const delta = steeringObservation(h.store, h.observationId)!.probe!.compiler_delta as Record<string, unknown>;
    expect(delta.summary_lines).toBeUndefined();
    expect(String(delta.unavailable)).toMatch(/changed since the observation|explain job failed/);
  }));

  test("a job queued without a fidelity record publishes 'no fidelity record' and never reads its (replaced) report", () => withHarness(async (h) => {
    // The worker hook queues `{}` for a gate from before the record: nothing binds it to what the path holds later.
    const check = join(h.workDir, "..", "check.json");
    const id = queue(h, { unit: "u1", symbol: "g", inputs: { check }, fidelity: {}, inputHash: "no-fidelity-hash" });
    // A newer, valid gate report (with a fidelity record) lands at the same path before the job runs.
    cpSync(join(import.meta.dir, "../steering/__fixtures__/explain-check.json"), check);
    const summary = await runSteeringExplainJobs({
      store: h.store, gameId: "sms", repoRoot: "/repo", workDir: h.workDir,
      prepare: okPrepare(h), execute: execute(h, () => result(h, { status: "ok", compiler_delta: DELTA })),
    });
    expect(summary).toMatchObject({ claimed: 1, unavailable: 1, done: 0, failed: 0 });
    expect(h.calls.prepare).toHaveLength(0);
    expect(h.calls.execute).toHaveLength(0);
    expect(steeringExplainJob(h.store, id)).toMatchObject({ status: "done", compilerDelta: { unavailable: STEERING_EXPLAIN_NO_FIDELITY } });
    expect(steeringObservation(h.store, h.observationId)!.probe!.compiler_delta).toEqual({ unavailable: "reconstruction: no fidelity record" });
  }));
});

describe("steering-explain tool hash", () => {
  test("stamps the computation trees: tools, mwcc_alloc api and vendor sources, and CAPABILITIES", () => {
    const root = tempDir("steering-explain-tools-");
    const write = (dir: string, path: string, text: string) => {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), text);
    };
    const files = {
      "_impl/gamecube/tools/steering_explain.py": "explain",
      "_impl/gamecube/tools/test_steering_explain.py": "a test",
      "_impl/gamecube/tools/sub/nested.py": "not a tool module",
      "compiler/mwcc_alloc/api/compare_sources.py": "compare",
      "compiler/mwcc_alloc/api/tests/test_compare.py": "a test",
      "compiler/mwcc_alloc/vendor/mwcc-decomp/tools/coloring_model.py": "colouring",
      "compiler/mwcc_alloc/vendor/mwcc-decomp/__pycache__/coloring_model.py": "cache",
      "compiler/mwcc_alloc/native/CAPABILITIES.json": "{}",
    };
    for (const [path, text] of Object.entries(files)) write(root, path, text);
    expect(steeringExplainToolFiles(root)).toEqual([
      "_impl/gamecube/tools/steering_explain.py",
      "compiler/mwcc_alloc/api/compare_sources.py",
      "compiler/mwcc_alloc/native/CAPABILITIES.json",
      "compiler/mwcc_alloc/vendor/mwcc-decomp/tools/coloring_model.py",
    ]);
    const base = steeringExplainToolHash(root);
    expect(base).toMatch(/^[0-9a-f]{64}$/);
    expect(steeringExplainToolHash(root)).toBe(base);
    const variant = (path: string, text: string) => {
      const dir = tempDir("steering-explain-tools-variant-");
      cpSync(root, dir, { recursive: true });
      write(dir, path, text);
      return steeringExplainToolHash(dir);
    };
    expect(variant("_impl/gamecube/tools/steering_explain.py", "explain")).toBe(base);
    expect(variant("compiler/mwcc_alloc/vendor/mwcc-decomp/tools/coloring_model.py", "colouring v2")).not.toBe(base);
    expect(variant("compiler/mwcc_alloc/api/decisions.py", "new dependency")).not.toBe(base);
    expect(variant("compiler/mwcc_alloc/native/CAPABILITIES.json", "{\"pin\": 2}")).not.toBe(base);
    expect(variant("_impl/gamecube/tools/test_steering_explain.py", "another test")).toBe(base);
    expect(variant("compiler/mwcc_alloc/api/tests/test_compare.py", "another test")).toBe(base);
  });

  test("the real toolpack stamp covers the explainer and the vendored colouring model", () => {
    const covered = steeringExplainToolFiles();
    expect(covered).toContain("_impl/gamecube/tools/steering_explain.py");
    expect(covered).toContain("compiler/mwcc_alloc/native/CAPABILITIES.json");
    expect(covered.some((path) => path.startsWith("compiler/mwcc_alloc/vendor/"))).toBe(true);
    expect(covered.some((path) => /(^|\/)test_[^/]*\.py$/.test(path) || path.includes("/tests/"))).toBe(false);
  });
});

describe("steering-explain background consumer", () => {
  const FIDELITY = { schema: "steering-function-fidelity-v1", input_hash: "fid-bg", complete: true, edits_hash: "e1" };

  function deferred(): { promise: Promise<void>; resolve: () => void } {
    let resolve = () => {};
    const promise = new Promise<void>((done) => { resolve = done; });
    return { promise, resolve };
  }

  test("a job queued by the worker hook is picked up by a consumer tick and published", () => withHarness(async (h) => {
    const { recordWorkerSteeringObservations } = await import("@server/core/agent-catalog/agents/running/worker/steering-validation.js");
    recordWorkerSteeringObservations(h.store, {
      gameId: "sms", unit: UNIT, symbol: SYMBOL, baseRev: "rev-1", sourceSha: "sha-1",
      result: {
        mode: "enforce", error: null, artifactPath: "/out/attempt-1.steering.json", durationMs: 5,
        decision: {
          attempt: "unresolved", reasons: [], removable_noncosmetic: [], probes: [{ function: "T::f", symbol: SYMBOL, unit: UNIT }],
          functions: [{ unit: UNIT, name: SYMBOL, decision: "unresolved", semantic: "unresolved", analysis: "complete", audit_label: "unresolved", match: { base: 99, candidate: 100, real_only: 99 }, sstar_variant: "global", fidelity: FIDELITY }],
        },
      },
    });
    const observationId = Number((h.store.db.query("SELECT MAX(id) AS id FROM steering_observations").get() as { id: number }).id);
    const prepare: SteeringExplainPrepare = async (args) => {
      h.calls.prepare.push(args);
      const out = args[args.indexOf("--out") + 1]!;
      writeFileSync(out, "{}\n");
      return { exitCode: 0, stdout: JSON.stringify({ status: "ok", input_hash: "x", out, fidelity_input_hash: "fid-bg" }), stderr: "" };
    };
    const consumer = startSteeringExplainConsumer({
      store: h.store, gameId: "sms", steeringGate: "enforce", repoRoot: "/repo", workDir: h.workDir, concurrency: 2, intervalMs: 60_000,
      prepare,
      execute: execute(h, () => ({ schema: "steering-explain-result-v1", observation_id: observationId, status: "ok", compiler_delta: DELTA, probe: null })),
    });
    expect(consumer.enabled).toBe(true);
    consumer.tick();
    consumer.stop();
    expect(await consumer.drain()).toBe(true);
    expect(h.calls.prepare[0]).toContain("--expect-fidelity-hash");
    expect(steeringObservation(h.store, observationId)!.probe).toMatchObject({ function: "T::f", compiler_delta: DELTA });
  }));

  test("never more than `concurrency` jobs in flight; stop claims nothing more and drain waits for the running job", async () => {
    const gates: Array<{ promise: Promise<void>; resolve: () => void }> = [];
    let started = 0;
    const runOnce = async () => {
      started += 1;
      const gate = deferred();
      gates.push(gate);
      await gate.promise;
      return { claimed: 1, done: 1, unavailable: 0, retried: 0, failed: 0, lost: 0 };
    };
    const consumer = startSteeringExplainConsumer({
      store: {} as StateStore, gameId: "sms", steeringGate: "shadow", repoRoot: "/repo", workDir: "/tmp/unused", concurrency: 1, intervalMs: 60_000, runOnce,
    });
    consumer.tick();
    consumer.tick();
    expect([started, consumer.inFlight()]).toEqual([1, 1]);
    consumer.stop();
    consumer.tick();
    expect(started).toBe(1);
    let drained = false;
    const draining = consumer.drain().then((ok) => { drained = ok; });
    await Promise.resolve();
    expect(drained).toBe(false);
    gates[0]!.resolve();
    await draining;
    expect([drained, consumer.inFlight(), started]).toEqual([true, 0, 1]);
  });

  test("a drain that runs out of time aborts the run it waited on", async () => {
    let signal: AbortSignal | null = null;
    const consumer = startSteeringExplainConsumer({
      store: {} as StateStore, gameId: "sms", steeringGate: "enforce", repoRoot: "/repo", workDir: "/tmp/unused", concurrency: 1, intervalMs: 60_000,
      runOnce: (context) => { signal = context.signal; return new Promise(() => {}); },
    });
    consumer.tick();
    consumer.stop();
    expect(await consumer.drain(10)).toBe(false);
    expect(signal!.aborted).toBe(true);
    consumer.close();
  });

  test("shutdown past the deadline: the build task sees the abort, the claim is requeued before drain returns, and a late completion writes nothing", () => withHarness(async (h) => {
    const id = queue(h, { fidelity: { input_hash: "in-1" } });
    const prepare: SteeringExplainPrepare = async (args) => {
      const out = args[args.indexOf("--out") + 1]!;
      writeFileSync(out, "{}\n");
      return { exitCode: 0, stdout: JSON.stringify({ status: "ok", input_hash: "x", out, fidelity_input_hash: "in-1" }), stderr: "" };
    };
    let seen: AbortSignal | undefined;
    let finishTask: (value: unknown) => void = () => {};
    let taskStarted: () => void = () => {};
    const started = new Promise<void>((resolveStarted) => { taskStarted = resolveStarted; });
    // Ignores the abort, like a sandbox exec that cannot be interrupted: only the runner's own race ends the wait.
    const execute = ((_repo: string, _task: unknown, options?: { signal?: AbortSignal }) => {
      seen = options?.signal;
      taskStarted();
      return new Promise((resolveTask) => { finishTask = resolveTask; });
    }) as unknown as SteeringBuildTaskExecutor;
    const logs: string[] = [];
    const consumer = startSteeringExplainConsumer({
      store: h.store, gameId: "sms", steeringGate: "enforce", repoRoot: "/repo", workDir: h.workDir, concurrency: 1, intervalMs: 60_000,
      prepare, execute, log: (message) => logs.push(message),
    });
    consumer.tick();
    await started;
    consumer.stop();
    expect(await consumer.drain(20)).toBe(false);
    expect(seen?.aborted).toBe(true);
    expect(steeringExplainJob(h.store, id)).toMatchObject({ status: "queued", attempts: 1, claimOwner: null, claimExpiresAt: null, error: "cancelled at shutdown" });
    consumer.close();
    const updates = () => Number((h.store.db.query("SELECT COUNT(*) AS n FROM steering_explain_jobs WHERE updated_at != created_at").get() as { n: number }).n);
    const row = JSON.stringify(steeringExplainJob(h.store, id));
    const probe = JSON.stringify(steeringObservation(h.store, h.observationId)!.probe);
    const before = updates();
    // The sandbox reply arrives after shutdown: nothing is written, nothing throws.
    finishTask({ exitCode: 0, stderr: "", stdout: JSON.stringify(result(h, { status: "ok", compiler_delta: DELTA })) });
    await new Promise((settle) => setTimeout(settle, 20));
    expect(JSON.stringify(steeringExplainJob(h.store, id))).toBe(row);
    expect(JSON.stringify(steeringObservation(h.store, h.observationId)!.probe)).toBe(probe);
    expect(updates()).toBe(before);
    expect(consumer.inFlight()).toBe(0);
    expect(logs).toEqual([expect.stringContaining("nothing written")]);
  }));

  test("off without an active gate, in dry runs, and at concurrency 0", () => {
    let calls = 0;
    const base = { store: {} as StateStore, gameId: "sms", repoRoot: "/repo", workDir: "/tmp/unused", intervalMs: 60_000, runOnce: async () => { calls += 1; return { claimed: 0, done: 0, unavailable: 0, retried: 0, failed: 0, lost: 0 }; } };
    for (const consumer of [
      startSteeringExplainConsumer({ ...base, steeringGate: "off", concurrency: 2 }),
      startSteeringExplainConsumer({ ...base, steeringGate: "enforce", concurrency: 2, dryRun: true }),
      startSteeringExplainConsumer({ ...base, steeringGate: "enforce", concurrency: 0 }),
      startSteeringExplainConsumer({ ...base, gameId: null, steeringGate: "enforce", concurrency: 2 }),
    ]) {
      expect(consumer.enabled).toBe(false);
      consumer.tick();
    }
    expect(calls).toBe(0);
    expect(steeringExplainConcurrency({})).toBe(2);
    expect(steeringExplainConcurrency({ ORCH_STEERING_EXPLAIN_CONCURRENCY: "0" })).toBe(0);
    expect(() => steeringExplainConcurrency({ ORCH_STEERING_EXPLAIN_CONCURRENCY: "-1" })).toThrow();
  });
});
