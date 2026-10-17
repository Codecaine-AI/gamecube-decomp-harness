/**
 * Load-test runner checks against the fake Daytona (no network, no live state).
 * Run: bun test ./objectives/worker-compiler-loop/scale/scale.test.ts
 */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DaytonaSandboxProvider } from "@server/core/job-queue/sandbox.js";
import { SandboxCreateAdmission, sandboxCreateAdmissionOptionsFromEnv } from "@server/core/job-queue/sandbox-create-admission.js";
import { classifyCommand, parseSandboxCommand } from "./lib/commands.js";
import { httpFakeClient, instrumentClient, SCALE_RUN_LABEL, type ClientSandbox, type ClientShape, type CreateAdmission } from "./lib/daytona.js";
import type { EventSink, ScaleEvent } from "./lib/events.js";
import { CostGuard, CostGuardError } from "./lib/guard.js";
import { unifiedDiff } from "./lib/udiff.js";
import { FakeWorld, serveFakeDaytona } from "./fake-daytona-server.js";
import { killSwitch, liveAdmissionEvidence, liveRefusal, parseOptions, runExitCode, stepFailures, syntheticAdmissionEvidence } from "./load-test.js";
import { nativeMeasurementSummary, percentile } from "./report.js";
import { classifyNativeResult } from "./lib/native-measurement.js";
import { commandToolPayload } from "@server/core/tools/runtime/results.js";
import { readTaskFileIdentity, sampleWorkers, summarizeWorkerRss } from "./worker-rss.js";

const dirs: string[] = [];
afterAll(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }); });
const tempDir = () => { const dir = mkdtempSync(join(tmpdir(), "scale-test-")); dirs.push(dir); return dir; };

function memorySink(): EventSink & { events: ScaleEvent[] } {
  const events: ScaleEvent[] = [];
  return { events, path: null, emit: (event) => { events.push(event); } };
}

/** The harness provider over an in-process fake server, with the load test's instrumentation. */
function fakeStack(options: { quota?: number; admission?: CreateAdmission; seedRoot?: string } = {}) {
  const world = new FakeWorld({ seedRoot: options.seedRoot ?? tempDir(), workspaceRoot: "/work/sms", targets: [], timeScale: 0, quota: options.quota ?? 100, rateLimitRps: 0, inject429: 0, inject502: 0 });
  const served = serveFakeDaytona(world);
  const sink = memorySink();
  const admission: CreateAdmission = options.admission ?? { admitCreate: async () => {}, created: async () => {}, deleted: async () => {} };
  const client = instrumentClient(httpFakeClient(`http://127.0.0.1:${served.port}`), { sink, scaleRunId: "scale-test-run", admission, defaultPurpose: "worker" });
  // A private create admission per stack (fast backoff), so tests never share quota state.
  const createAdmission = new SandboxCreateAdmission(() => ({ ...sandboxCreateAdmissionOptionsFromEnv({}), retryBaseMs: 1, retryMaxMs: 5, quotaProbeMs: 60_000, maxWaitMs: 10_000 }));
  const provider = new DaytonaSandboxProvider({ readApiKey: () => "fake", clientFactory: () => client as never, transientRetryDelaysMs: [0, 0], createAdmission });
  return { world, served, sink, provider };
}

const createParams = { snapshot: "sms-test", labels: { game_id: "sms" }, resources: { cpu: 1, memoryGiB: 2, diskGiB: 5 }, ttlMinutes: 30 };

describe("sandbox command parsing", () => {
  test("round-trips what DaytonaSandboxHandle.exec sends, quotes and env included", async () => {
    const stack = fakeStack();
    try {
      const handle = await stack.provider.create(createParams);
      const argv = ["python3", "-c", "print('it''s')\nx = \"y\"", "--", "a b"];
      await handle.exec(argv, { cwd: "/work/sms", env: { ORCH_GAME_ID: "sms", Q: "it's" }, timeoutMs: 5_000 });
      const exec = stack.sink.events.find((event) => event.kind === "exec");
      expect(exec).toMatchObject({ kind: "exec", step: "python_inline", argv0: "python3" });
    } finally {
      stack.served.stop();
    }
  });

  test("parses cd and env prefixes", () => {
    const parsed = parseSandboxCommand(`cd '/work/sms' && env 'A=1' 'B=it'\\''s' 'ninja' 'build/x.o'`);
    expect(parsed).toEqual({ cwd: "/work/sms", env: { A: "1", B: "it's" }, argv: ["ninja", "build/x.o"] });
    // A reused session wraps the same string in a subshell with stdin from /dev/null.
    expect(parseSandboxCommand(`(cd '/work/sms' && env 'A=1' 'ninja' 'build/x.o') </dev/null`)).toEqual({ cwd: "/work/sms", env: { A: "1" }, argv: ["ninja", "build/x.o"] });
    // With the command-id claim a reused-session command makes first (sandbox.ts isolatedShellCommand).
    expect(parseSandboxCommand(`(mkdir '/tmp/orch-exec-1234' 2>/dev/null || { echo 'orch-exec-claimed 1234' >&2; exit 75; }; cd '/work/sms' && 'ninja' 'build/x.o') </dev/null`)).toEqual({ cwd: "/work/sms", env: {}, argv: ["ninja", "build/x.o"] });
  });

  test("classifies the attempt steps the report requires", () => {
    expect(classifyCommand(["python3", "/opt/toolpacks/gamecube-decomp/_impl/gamecube/tools/steering/steering_check.py", "reduce", "--oracle-repo", "."])).toBe("steering_reduce");
    expect(classifyCommand(["python3", "/opt/toolpacks/x/api/snapshot.py", "--capture", "decisions"])).toBe("native_decisions");
    expect(classifyCommand(["python3", "/opt/toolpacks/x/api/compare_sources.py", "--unit", "u"])).toBe("compare_sources");
    expect(classifyCommand(["python3", "/opt/toolpacks/x/review_lint/api/scan_diff.py", "--repo", "."])).toBe("qa_lint");
    expect(classifyCommand(["ninja", "build/GMSJ01/src/a.o"])).toBe("build");
    expect(classifyCommand(["python3", "-c", "import json, math, os, subprocess, sys\nrun = subprocess.run(command + ['-o', report_path], capture_output=True)"])).toBe("objdiff");
    expect(classifyCommand(["git", "bundle", "create", "x"])).toBe("provision_git");
  });
});

describe("unified diff", () => {
  test("produces a patch git apply accepts", () => {
    const repo = tempDir();
    const before = Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n") + "\n";
    const after = before.replace("line 9\n", "line 9 changed\nline 9b\n");
    writeFileSync(join(repo, "a.c"), before);
    Bun.spawnSync(["git", "init", "-q"], { cwd: repo });
    const patch = unifiedDiff("a.c", before, after);
    writeFileSync(join(repo, "p.diff"), patch);
    const check = Bun.spawnSync(["git", "apply", "--check", "p.diff"], { cwd: repo, stderr: "pipe" });
    expect(check.stderr.toString()).toBe("");
    expect(check.exitCode).toBe(0);
    expect(unifiedDiff("a.c", before, before)).toBe("");
  });
});

describe("live gate", () => {
  const live = { live: true, confirmLive: "scale-x1", runId: "scale-x1", maxAlive: 220, maxSandboxMinutes: 3000, sandboxValidationEvidence: "/tmp/e.json", kill: null, ramp: [10, 200] };
  test("dry-run never needs confirmation", () => {
    expect(liveRefusal({ ...live, live: false, confirmLive: null })).toBeNull();
    expect(parseOptions([]).live).toBe(false);
  });
  test("refuses --live without a matching --confirm-live, key, budget or validation evidence", () => {
    const env = { DAYTONA_API_KEY: "k" };
    expect(liveRefusal({ ...live, confirmLive: null }, env)).toContain("--confirm-live");
    expect(liveRefusal({ ...live, confirmLive: "other" }, env)).toContain("does not match");
    expect(liveRefusal(live, {})).toContain("DAYTONA_API_KEY");
    expect(liveRefusal({ ...live, maxAlive: null }, env)).toContain("--max-alive");
    expect(liveRefusal({ ...live, maxSandboxMinutes: null }, env)).toContain("--max-sandbox-minutes");
    expect(liveRefusal({ ...live, maxAlive: 100 }, env)).toContain("below the ramp peak");
    expect(liveRefusal({ ...live, sandboxValidationEvidence: null }, env)).toContain("--sandbox-validation-evidence");
    expect(liveRefusal(live, env)).toBeNull();
  });
  /** Evidence as validateHarnessSandbox writes it for a passed validation (harness-state/sandbox-validation.ts). */
  const OPERATION = "sandbox-validation-0f8fad5b-d9cb-469f-a165-70867728950e";
  const EXPECTED = { snapshot_name: "sms-1core-v9", snapshot_baked_rev: "a".repeat(40) };
  const PATH = `/state/sandbox-validation/${OPERATION}/evidence.json`;
  const real = () => ({
    operation: OPERATION, game_id: "sms", head: "b".repeat(40), configuration_revision: "cfg-1",
    sandbox: { ...EXPECTED, profile: "1-core", workspace_root: "/work/sms" }, report_path: "build/GMSJ01/report.json",
    started_at: "2026-10-17T10:00:00.000Z", completed_at: "2026-10-17T10:20:00.000Z", status: "passed",
    sandbox_id: "sb-1", build: { exitCode: 0, stdout: "", stderr: "" },
    host_report_sha256: "c".repeat(64), sandbox_report_sha256: "d".repeat(64),
    report_comparison: "projection_equal", report_projection_sha256: "e".repeat(64),
  });

  test("live evidence must be a passed validateHarnessSandbox result of this snapshot and baked rev", () => {
    expect(liveAdmissionEvidence(real(), EXPECTED, PATH)).toEqual(real());
    const refused = (parsed: unknown, path = PATH) => expect(() => liveAdmissionEvidence(parsed, EXPECTED, path)).toThrow("is not a passed validation");
    for (const parsed of [null, false, 0, "", [], {}, [real()]]) refused(parsed);
    refused({ ...real(), status: "failed" });
    refused({ ...real(), sandbox: null });
    refused({ ...real(), sandbox: { ...EXPECTED, snapshot_name: "other" } });
    refused({ ...real(), sandbox: { ...EXPECTED, snapshot_baked_rev: "f".repeat(40) } });
    refused({ ...real(), report_comparison: undefined });
    refused({ ...real(), build: { exitCode: 1 } });
    refused({ ...real(), completed_at: undefined });
    refused({ ...real(), operation: "made-up" });
    refused(real(), "/tmp/elsewhere/evidence.json");
    refused({ ...real(), synthetic: "dry-run load test" });
    expect(() => liveAdmissionEvidence(real(), { snapshot_name: "", snapshot_baked_rev: "" }, PATH)).toThrow("is not a passed validation");
  });

  test("the dry run's generated evidence is refused by the live gate", () => {
    const generated = JSON.parse(JSON.stringify(syntheticAdmissionEvidence("cfg-1", { ...EXPECTED, profile: "1-core" } as typeof EXPECTED)));
    expect(generated).toMatchObject({ status: "passed", sandbox: EXPECTED });
    expect(() => liveAdmissionEvidence(generated, EXPECTED, PATH)).toThrow("synthetic (dry-run) evidence");
  });

  test("the kill switch needs only the confirmation and the key", () => {
    expect(liveRefusal({ ...live, kill: "scale-x1", maxAlive: null, maxSandboxMinutes: null, sandboxValidationEvidence: null }, { DAYTONA_API_KEY: "k" })).toBeNull();
  });

  test("the kill switch refuses a confirmation or run id that does not name its target", () => {
    const env = { DAYTONA_API_KEY: "k" };
    const kill = { ...live, kill: "scale-current", maxAlive: null, maxSandboxMinutes: null, sandboxValidationEvidence: null };
    // The reviewed bypass: --kill scale-current --run-id scale-old --confirm-live scale-old.
    expect(liveRefusal({ ...kill, runId: "scale-old", confirmLive: "scale-old" }, env)).toContain("differs from the kill target scale-current");
    expect(liveRefusal({ ...kill, runId: "scale-current", confirmLive: "scale-old" }, env)).toContain("does not match");
    expect(liveRefusal({ ...kill, runId: "scale-current", confirmLive: "scale-current" }, env)).toBeNull();
    const parsed = parseOptions(["--live", "--kill", "scale-current", "--run-id", "scale-old", "--confirm-live", "scale-old"]);
    expect(liveRefusal(parsed, env)).toContain("differs from the kill target");
    expect(liveRefusal(parseOptions(["--live", "--kill", "scale-current", "--confirm-live", "scale-current"]), env)).toBeNull();
  });
  test("rejects unknown options and bad ramps", () => {
    expect(() => parseOptions(["--liv"])).toThrow("unknown option");
    expect(() => parseOptions(["--ramp", "10,0"])).toThrow("--ramp");
  });
});

describe("run outcome", () => {
  const step = (patch: Partial<Parameters<typeof stepFailures>[0]>) => ({ concurrency: 10, targets: 10, timed_out: false, guard_tripped: null, jobs: { succeeded: 10 }, ...patch });

  test("a step passes only when every target's worker job succeeded in time with the guard untripped", () => {
    expect(stepFailures(step({}))).toEqual([]);
    expect(stepFailures(step({ jobs: { succeeded: 9, failed: 1 } }))).toEqual(["worker jobs not succeeded: failed 1"]);
    expect(stepFailures(step({ jobs: { succeeded: 8, cancelled: 1, claimed: 1 } }))).toEqual(["worker jobs not succeeded: cancelled 1, claimed 1"]);
    expect(stepFailures(step({ jobs: { succeeded: 7 } }))).toEqual(["only 7 of 10 targets ran to success"]);
    expect(stepFailures(step({ timed_out: true }))).toContain("step timed out");
    expect(stepFailures(step({ guard_tripped: "sandbox-minutes 5.0 reached the limit 5" }))).toContain("guard tripped: sandbox-minutes 5.0 reached the limit 5");
  });

  test("unavailable, malformed or missing native measurements fail the step even when every job succeeded", () => {
    const measured = (decisions: object, compare: object) => step({ native_measurements: {
      native_decisions: { calls: 10, ok: 10, failed: 0, by_reason: {}, ...decisions },
      compare_sources: { calls: 10, ok: 10, failed: 0, by_reason: {}, ...compare },
    } });
    expect(stepFailures(measured({}, {}))).toEqual([]);
    expect(stepFailures(measured({ ok: 9, failed: 1, by_reason: { unavailable: 1 } }, {}))).toEqual([
      "native_decisions measurement failed 1 time(s) (unavailable 1)",
      "native_decisions measured 9 of 10 succeeded attempts",
    ]);
    expect(stepFailures(measured({}, { ok: 8, failed: 2, by_reason: { malformed: 2 } }))).toContain("compare_sources measurement failed 2 time(s) (malformed 2)");
    // A measurement that never ran (no phase recorded) is missing, not a pass.
    expect(stepFailures(step({ native_measurements: { native_decisions: { calls: 10, ok: 10, failed: 0 } } }))).toEqual(["compare_sources measured 0 of 10 succeeded attempts"]);
  });

  test("integration infrastructure failures fail the step", () => {
    expect(stepFailures(step({ integration_failures: 0 }))).toEqual([]);
    expect(stepFailures(step({ integration_failures: 2 }))).toEqual(["integration failed 2 time(s)"]);
  });

  test("any failure makes the command exit non-zero", () => {
    const quiet = console.error;
    console.error = () => undefined;
    try {
      expect(runExitCode([])).toBe(0);
      expect(runExitCode(["step 10: worker jobs not succeeded: failed 1"])).toBe(1);
      expect(runExitCode(["guard tripped: max alive"])).toBe(1);
    } finally {
      console.error = quiet;
    }
  });
});

describe("cost guard", () => {
  test("refuses creates past max alive, frees capacity on delete", async () => {
    const guard = new CostGuard({ maxAlive: 2, maxSandboxMinutes: 1_000, allowBuildSandboxes: false }, memorySink());
    await guard.admitCreate("worker"); await guard.created("a", "worker");
    await guard.admitCreate("worker"); await guard.created("b", "worker");
    await expect(guard.admitCreate("worker")).rejects.toBeInstanceOf(CostGuardError);
    await guard.deleted("a");
    await guard.admitCreate("worker");
    expect(guard.summary()).toMatchObject({ created: 2, alive: 1, peak_alive: 2, refused_creates: 1 });
  });

  test("refuses build sandboxes unless allowed", async () => {
    const sink = memorySink();
    const guard = new CostGuard({ maxAlive: 10, maxSandboxMinutes: 1_000, allowBuildSandboxes: false }, sink);
    await expect(guard.admitCreate("build")).rejects.toThrow("build sandboxes");
    expect(sink.events.some((event) => event.kind === "failure" && event.failureKind === "build_sandbox_requested")).toBe(true);
    const allowing = new CostGuard({ maxAlive: 10, maxSandboxMinutes: 1_000, allowBuildSandboxes: true }, memorySink());
    await allowing.admitCreate("build");
  });

  test("trips on sandbox-minutes, then refuses every create and notifies the kill switch", async () => {
    let now = 0;
    const guard = new CostGuard({ maxAlive: 10, maxSandboxMinutes: 5, allowBuildSandboxes: false }, memorySink(), () => now);
    const trips: string[] = [];
    guard.whenTripped((reason) => trips.push(reason));
    await guard.admitCreate("worker"); await guard.created("a", "worker");
    await guard.admitCreate("worker"); await guard.created("b", "worker");
    now = 2 * 60_000;
    expect(guard.check()).toBeNull();
    now = 3 * 60_000;
    expect(guard.check()).toContain("sandbox-minutes");
    expect(trips).toHaveLength(1);
    await expect(guard.admitCreate("worker")).rejects.toThrow("tripped");
  });

  /** A client whose create allocates, spends `startupMs` of guard time starting, then answers 429 (the SDK's order). */
  function postAllocationFailures(clock: { now: number }, options: { startupMs: number; listFails?: boolean }) {
    const world = new Map<string, ClientSandbox>();
    let next = 1;
    const sandbox = (id: string, labels: Record<string, string>): ClientSandbox => ({
      id, labels,
      process: { createSession: async () => {}, executeSessionCommand: async () => ({ exitCode: 0 }), deleteSession: async () => {} },
      fs: { uploadFile: async () => {}, downloadFile: async () => Buffer.alloc(0) },
      stop: async () => {}, start: async () => {},
      delete: async () => { world.delete(id); },
    });
    let listFails = options.listFails ?? false;
    const client: ClientShape = {
      create: async (params) => {
        const id = `alloc-${next++}`;
        world.set(id, sandbox(id, params.labels));
        clock.now += options.startupMs;
        throw Object.assign(new Error("Too Many Requests"), { statusCode: 429 });
      },
      get: async (id) => world.get(id)!,
      list: async ({ labels }: { labels: Record<string, string> }) => {
        if (listFails) throw new Error("list unavailable");
        return [...world.values()].filter((item) => Object.entries(labels).every(([key, value]) => item.labels?.[key] === value));
      },
    };
    return { world, client, healList: () => { listFails = false; } };
  }
  const createRequest = (requestId: string) => ({ snapshot: "s", labels: { orch_create_attempt: requestId }, autoStopInterval: 0, ttlMinutes: 60 });

  test("three 180 s post-allocation failures trip a 1-minute budget: minutes count from admission and include failed allocations", async () => {
    const clock = { now: 0 };
    const guard = new CostGuard({ maxAlive: 10, maxSandboxMinutes: 1, allowBuildSandboxes: false }, memorySink(), () => clock.now);
    const { world, client } = postAllocationFailures(clock, { startupMs: 180_000 });
    const instrumented = instrumentClient(client, { sink: memorySink(), scaleRunId: "scale-test-run", admission: guard, defaultPurpose: "worker" });
    const outcomes: string[] = [];
    for (const requestId of ["r1", "r2", "r3"]) {
      outcomes.push(await instrumented.create(createRequest(requestId)).then(() => "created", (error: unknown) => String(error)));
      guard.check();
    }
    // The first failure alone spent 3 sandbox-minutes of startup; the guard trips and refuses the rest.
    expect(outcomes[0]).toContain("Too Many Requests");
    expect(outcomes.slice(1).every((outcome) => outcome.includes("tripped"))).toBeTrue();
    expect(guard.tripped).toContain("sandbox-minutes");
    expect(guard.sandboxMinutes()).toBeGreaterThanOrEqual(3);
    expect(guard.summary()).toMatchObject({ created: 0, failed_creates: { allocated: 1 }, alive: 1 });
    // The failed allocation stays counted until it is deleted (through a listed, wrapped handle).
    const [listed] = await (instrumented.list({ labels: { orch_create_attempt: "r1" } }) as Promise<ClientSandbox[]>);
    await listed!.delete!();
    expect(world.size).toBe(0);
    expect(guard.alive()).toBe(0);
    const frozen = guard.sandboxMinutes();
    clock.now += 600_000;
    expect(guard.sandboxMinutes()).toBe(frozen);
  });

  test("a failed create whose allocations cannot be listed counts until a later list settles it", async () => {
    const clock = { now: 0 };
    const guard = new CostGuard({ maxAlive: 10, maxSandboxMinutes: 1_000, allowBuildSandboxes: false }, memorySink(), () => clock.now);
    const { client, healList } = postAllocationFailures(clock, { startupMs: 60_000, listFails: true });
    const instrumented = instrumentClient(client, { sink: memorySink(), scaleRunId: "scale-test-run", admission: guard, defaultPurpose: "worker" });
    await expect(instrumented.create(createRequest("r1"))).rejects.toThrow("Too Many Requests");
    expect(guard.summary()).toMatchObject({ failed_creates: { unconfirmed: 1 }, alive: 1 });
    clock.now += 60_000;
    expect(guard.sandboxMinutes()).toBe(2);
    // The provider's cleanup lists by the request label: the allocation becomes known, then deleted.
    healList();
    const listed = await (instrumented.list({ labels: { orch_create_attempt: "r1" } }) as Promise<ClientSandbox[]>);
    expect(guard.summary()).toMatchObject({ failed_creates: { allocated: 1, unconfirmed: 0 }, alive: 1 });
    await listed[0]!.delete!();
    expect(guard.alive()).toBe(0);
    expect(guard.sandboxMinutes()).toBe(2);
  });

  test("blocks a create at the instrumented client, before Daytona sees it", async () => {
    const guard = new CostGuard({ maxAlive: 1, maxSandboxMinutes: 1_000, allowBuildSandboxes: false }, memorySink());
    const stack = fakeStack({ admission: guard });
    try {
      await stack.provider.create(createParams);
      await expect(stack.provider.create(createParams)).rejects.toThrow("max alive");
      expect(stack.world.sandboxes.size).toBe(1);
    } finally {
      stack.served.stop();
    }
  });
});

describe("fake Daytona and the provider", () => {
  test("labels every sandbox with the run id and counts each API call", async () => {
    const stack = fakeStack();
    try {
      const handle = await stack.provider.create(createParams);
      await handle.exec(["test", "-d", "."], { cwd: "/work/sms", timeoutMs: 5_000 });
      const listed = await stack.provider.listByLabels({ [SCALE_RUN_LABEL]: "scale-test-run" });
      expect(listed.map((entry) => entry.sandboxId)).toEqual([handle.sandboxId]);
      const ops = stack.sink.events.filter((event) => event.kind === "api").map((event) => (event as { op: string }).op);
      // One session per sandbox handle, reused: no per-command session create/delete.
      await handle.exec(["test", "-d", "."], { cwd: "/work/sms", timeoutMs: 5_000 });
      expect(ops).toEqual(["sandbox.create", "session.create", "session.exec", "sandbox.list"]);
      expect(stack.sink.events.filter((event) => event.kind === "api").map((event) => (event as { op: string }).op).filter((op) => op.startsWith("session."))).toEqual(["session.create", "session.exec", "session.exec"]);
    } finally {
      stack.served.stop();
    }
  });

  test("an account quota answers 429; the provider queues the worker create until a sandbox is deleted", async () => {
    const stack = fakeStack({ quota: 1 });
    try {
      const first = await stack.provider.create(createParams);
      let second: string | null = null;
      const queued = stack.provider.create(createParams).then((handle) => { second = handle.sandboxId; });
      await Bun.sleep(50);
      expect(second).toBeNull();
      const failed = stack.sink.events.filter((event) => event.kind === "api" && !event.ok);
      expect(failed).toHaveLength(1);
      expect(failed[0]).toMatchObject({ op: "sandbox.create", status: 429 });
      await stack.provider.delete(first.sandboxId, "settlement");
      await queued;
      expect(second).not.toBeNull();
      expect(stack.world.alive()).toBe(1);
    } finally {
      stack.served.stop();
    }
  });

  test("the kill switch deletes exactly the run's labelled sandboxes", async () => {
    const stack = fakeStack();
    try {
      for (let i = 0; i < 3; i += 1) await stack.provider.create(createParams);
      // A sandbox this run did not create (no run label) must survive.
      const other = await stack.world.create({ labels: { game_id: "sms" } });
      const result = await killSwitch(stack.provider, "scale-test-run", stack.sink);
      expect(result).toEqual({ found: 3, deleted: 3, errors: [], remaining: 0 });
      expect(stack.world.alive()).toBe(1);
      expect(stack.world.sandbox(other.id).deletedAt).toBeNull();
    } finally {
      stack.served.stop();
    }
  });

  test("git diff and cat follow the canned edit over the seed checkout", async () => {
    const seed = tempDir();
    Bun.spawnSync(["mkdir", "-p", join(seed, "src")]);
    writeFileSync(join(seed, "src", "a.c"), "int a(void) {\n    return 0;\n}\n");
    const stack = fakeStack({ seedRoot: seed });
    try {
      const handle = await stack.provider.create(createParams);
      const exec = (argv: string[]) => handle.exec(argv, { cwd: "/work/sms", timeoutMs: 5_000 });
      expect((await exec(["git", "diff", "--name-only"])).stdout).toBe("");
      await handle.writeFile("/work/sms/src/a.c", "int a(void) {\n    return 1;\n}\n");
      expect((await exec(["git", "diff", "--name-only"])).stdout).toBe("src/a.c\n");
      expect((await exec(["cat", "src/a.c"])).stdout).toContain("return 1");
      expect((await exec(["git", "diff", "--", "src/a.c"])).stdout).toContain("+    return 1;");
    } finally {
      stack.served.stop();
    }
  });
});

describe("report", () => {
  test("percentile uses the nearest-rank definition", () => {
    expect(percentile([], 50)).toBeNull();
    expect(percentile([5, 1, 3, 2, 4], 50)).toBe(3);
    expect(percentile(Array.from({ length: 100 }, (_, i) => i + 1), 95)).toBe(95);
  });
});

describe("worker RSS sampler (readiness item 15)", () => {
  const worker = (id: string) => `bun /repo/apps/server/src/job-runner.ts --game sms --repo-root /r --state-dir /s worker --run-id run-1 --worker-id ${id} --base-rev abc`;

  test("samples only harness worker children, each with its process tree", () => {
    const snapshot = [
      { pid: 10, ppid: 1, rssKb: 900_000, cpuSeconds: 1, command: "bun /repo/apps/server/src/job-runner.ts --game sms run-loop --max-workers 5" },
      { pid: 11, ppid: 10, rssKb: 300_000, cpuSeconds: 1, command: worker("w-a") },
      { pid: 12, ppid: 11, rssKb: 50_000, cpuSeconds: 1, command: "python3 tool.py" },
      { pid: 13, ppid: 10, rssKb: 200_000, cpuSeconds: 1, command: worker("w-b") },
    ];
    const samples = sampleWorkers(snapshot, 0);
    expect(samples.map((s) => [s.workerId, s.runId, s.rssKb, s.treeRssKb, s.processes])).toEqual([
      ["w-a", "run-1", 300_000, 350_000, 2],
      ["w-b", "run-1", 200_000, 200_000, 1],
    ]);
  });

  test("samples production sandbox workers (worker-task --task-file), identity read from the task file", () => {
    const dir = tempDir();
    const taskFile = join(dir, "task_spec.json");
    writeFileSync(taskFile, JSON.stringify({ version: 1, run_id: "run-live", worker_id: "w-prod", job_id: "job-1" }));
    // The command buildWorkerTask (workers/worker-job.ts) spawns.
    const production = `bun /repo/apps/server/src/job-runner.ts --game sms --repo-root /r --state-dir /s --provider p --model m --thinking-level high --sandbox-profile 1-core worker-task --task-file ${taskFile}`;
    const snapshot = [
      { pid: 21, ppid: 1, rssKb: 500_000, cpuSeconds: 1, command: production },
      { pid: 22, ppid: 21, rssKb: 20_000, cpuSeconds: 1, command: "git status" },
      { pid: 23, ppid: 1, rssKb: 400_000, cpuSeconds: 1, command: `bun /repo/apps/server/src/job-runner.ts worker-task --task-file ${join(dir, "gone.json")}` },
    ];
    const samples = sampleWorkers(snapshot, 0, readTaskFileIdentity);
    expect(samples.map((s) => [s.workerId, s.runId, s.treeRssKb, s.processes])).toEqual([
      ["w-prod", "run-live", 520_000, 2],
      [`task:${join(dir, "gone.json")}`, null, 400_000, 1],
    ]);
  });

  test("summarizes per session: max, growth over time, and the 200-worker projection", () => {
    const minute = 60_000;
    const samples = [0, 5, 10].flatMap((m) => [
      { t: m * minute, pid: 11, workerId: "w-a", runId: "r", rssKb: 0, treeRssKb: (300 + m * 10) * 1024, processes: 1 },
      { t: m * minute, pid: 13, workerId: "w-b", runId: "r", rssKb: 0, treeRssKb: 200 * 1024, processes: 1 },
    ]);
    const summary = summarizeWorkerRss(samples, 64 * 1024 ** 3);
    expect(summary.sessions.map((s) => [s.workerId, s.maxMb, s.growthMbPerMin])).toEqual([["w-a", 400, 10], ["w-b", 200, 0]]);
    expect(summary.peakConcurrentSessions).toBe(2);
    expect(summary.peakTotalMb).toBe(600);
    expect(summary.sessionMaxMb).toEqual({ p50: 200, p95: 400, max: 400 });
    expect(summary.projected200Gb).toBe(78.1);
    expect(summary.hostRamGb).toBe(64);
  });
});

describe("native measurements (readiness item 6)", () => {
  /** Real mwcc_alloc output (samples/native-osreport.json: an sms 1.2.5n trace through decisions.py; shapes per snapshot.py / compare_sources.py). */
  const sample = JSON.parse(readFileSync(join(import.meta.dir, "samples", "native-osreport.json"), "utf8")) as {
    capture_envelope: Record<string, any>; decisions_document: Record<string, any>; compare_sources_result: Record<string, any>; compare_sources_full_report: Record<string, any>;
  };
  const envelope = (parsed: unknown, exitCode = 0) => commandToolPayload({ operation: "tool:mwcc_alloc", command: ["python3"], cwd: "/work/sms", exitCode, stdout: JSON.stringify(parsed), stderr: "" });
  const decisionsPath = sample.capture_envelope.files.find((file: { kind: string }) => file.kind === "decisions").path as string;
  /** The sandbox checkout as the tool left it: checkout-relative path -> file text. */
  const sandboxFiles = (files: Record<string, unknown>) => async (path: string) => {
    if (!(path in files)) throw new Error(`File not found: ${path}`);
    const value = files[path];
    return typeof value === "string" ? value : JSON.stringify(value);
  };

  test("a real decisions capture counts once its decisions.json is loaded and validated", async () => {
    expect(sample.capture_envelope).toMatchObject({ status: "ok", format: "mwcc-alloc-native-capture-v1", function: "OSReport" });
    expect(sample.capture_envelope.schema).toBeUndefined();
    const reader = sandboxFiles({ [decisionsPath]: sample.decisions_document });
    expect(await classifyNativeResult("native_decisions", envelope(sample.capture_envelope), reader)).toEqual({ ok: true, schema: "mwcc-decisions-v1" });
    // The artifact is required: missing, unreadable, not JSON, another schema or another function is malformed.
    const malformed = async (parsed: unknown, files: Record<string, unknown>) =>
      expect(await classifyNativeResult("native_decisions", envelope(parsed), sandboxFiles(files))).toMatchObject({ ok: false, reason: "malformed" });
    await malformed(sample.capture_envelope, {});
    await malformed(sample.capture_envelope, { [decisionsPath]: "{ not json" });
    await malformed(sample.capture_envelope, { [decisionsPath]: { ...sample.decisions_document, schema: "mwcc-decision-diff-v1" } });
    await malformed(sample.capture_envelope, { [decisionsPath]: { ...sample.decisions_document, function: "OSPanic" } });
    await malformed(sample.capture_envelope, { [decisionsPath]: { ...sample.decisions_document, vregs: undefined } });
    await malformed({ ...sample.capture_envelope, files: sample.capture_envelope.files.filter((file: { kind: string }) => file.kind !== "decisions") }, { [decisionsPath]: sample.decisions_document });
    await malformed({ ...sample.capture_envelope, format: undefined }, { [decisionsPath]: sample.decisions_document });
    expect(await classifyNativeResult("native_decisions", envelope(sample.capture_envelope))).toMatchObject({ ok: false, reason: "malformed" });
  });

  test("native decisions that did not run or are unavailable never count", async () => {
    const reader = sandboxFiles({ [decisionsPath]: sample.decisions_document });
    expect(await classifyNativeResult("native_decisions", envelope({ backend: "native", capture: "decisions", status: "unavailable", unavailable: "trace-overflow" }), reader)).toMatchObject({ ok: false, reason: "unavailable", detail: "trace-overflow" });
    expect(await classifyNativeResult("native_decisions", envelope({ status: "unit_build_failed" }), reader)).toMatchObject({ ok: false, reason: "not_ok" });
    expect(await classifyNativeResult("native_decisions", envelope(sample.capture_envelope, 2), reader)).toMatchObject({ ok: false, reason: "tool_failed" });
    expect(await classifyNativeResult("native_decisions", { tool: "x", exit_code: 0, parsed: null, stdout: "not json" }, reader)).toMatchObject({ ok: false, reason: "malformed" });
    expect(await classifyNativeResult("native_decisions", null, reader)).toMatchObject({ ok: false, reason: "malformed" });
  });

  test("a real compare_sources result counts with its full report validated", async () => {
    const fullPath = sample.compare_sources_result.full_report as string;
    const reader = sandboxFiles({ [fullPath]: sample.compare_sources_full_report });
    expect(await classifyNativeResult("compare_sources", envelope(sample.compare_sources_result), reader)).toEqual({ ok: true, schema: "mwcc-decision-diff-v1" });
    expect(await classifyNativeResult("compare_sources", envelope(sample.compare_sources_result), sandboxFiles({}))).toMatchObject({ ok: false, reason: "malformed" });
    expect(await classifyNativeResult("compare_sources", envelope(sample.compare_sources_result), sandboxFiles({ [fullPath]: { ...sample.compare_sources_full_report, status: "unavailable" } }))).toMatchObject({ ok: false, reason: "malformed" });
    expect(await classifyNativeResult("compare_sources", envelope({ ...sample.compare_sources_result, changes: undefined }), reader)).toMatchObject({ ok: false, reason: "malformed" });
    expect(await classifyNativeResult("compare_sources", envelope({ ...sample.compare_sources_result, schema: "mwcc-decisions-v1" }), reader)).toMatchObject({ ok: false, reason: "malformed" });
    expect(await classifyNativeResult("compare_sources", envelope({ ...sample.compare_sources_result, status: "unavailable", unavailable: "traced-object-mismatch" }), reader)).toMatchObject({ ok: false, reason: "unavailable", detail: "traced-object-mismatch" });
    expect(await classifyNativeResult("compare_sources", { status: "sandbox_required" }, reader)).toMatchObject({ ok: false, reason: "tool_failed" });
  });

  test("the report counts unavailable, malformed and failed results as measurement failures", () => {
    const phase = (op: string, ok: boolean) => ({ kind: "phase", phase: `tool:${op}`, ok });
    const failure = (op: string, detail: string) => ({ kind: "failure", failureKind: `measurement:${op}`, detail });
    expect(nativeMeasurementSummary([
      phase("native_decisions", true), phase("native_decisions", false), failure("native_decisions", "unavailable: trace-overflow"),
      phase("compare_sources", false), failure("compare_sources", "malformed: no parsed result"),
      phase("compare_sources", false), failure("compare_sources", "tool_failed: exit 2"),
    ])).toEqual({
      native_decisions: { calls: 2, ok: 1, failed: 1, by_reason: { unavailable: 1 } },
      compare_sources: { calls: 2, ok: 0, failed: 2, by_reason: { malformed: 1, tool_failed: 1 } },
    });
  });
});
