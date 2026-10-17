import { afterAll, describe, expect, spyOn, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as shell from "@server/infrastructure/shell";
import type { CommandResult, WorkspaceExec } from "@server/infrastructure/shell";
import {
  SANDBOX_STEERING_CACHE_DIR,
  STEERING_GATE_PLACEMENT_ENV,
  evaluateSandboxProbe,
  runWorkerSteeringGate,
  sandboxAttributePath,
  sandboxInputsDir,
  sandboxStepPath,
  steeringGatePlacement,
  steeringRejectionReason,
  uploadFilesThroughExec,
  workspaceSteeringRunner,
  type SteeringCallOptions,
  type SteeringPlacement,
  type SteeringRunner,
} from "./steering-check.js";
import { APPLE_CLANG_21_PROBE, LLVM_CLANG_18_PROBE, LLVM_CLANG_21_PROBE, NO_CLANG_PROBE } from "./__fixtures__/clang-probe.js";

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "steering-placement-"));
  dirs.push(dir);
  return dir;
}

const ok = (value: unknown): CommandResult => ({ exitCode: 0, stdout: JSON.stringify(value), stderr: "" });
const flag = (args: string[], name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);

const EDITS = {
  tool: "steering_check", version: 1, base_rev: "base", edits_hash: "h1",
  files: [{ path: "src/Enemy/x.cpp", base_exists: true, cand_exists: true, base_text: "a", cand_text: "b" }],
};
const REDUCE = {
  edits_hash: "h1", analysis: "complete",
  groups: [{ id: "g1", status: "removable", edit_ids: ["e1"] }, { id: "g2", status: "real", edit_ids: ["e2"] }],
};
const MWCC = { edits_hash: "h1", functions: [{ unit: "u", name: "f" }], errors: [] };
const DECISION = {
  attempt: "pass", reasons: [],
  functions: [{
    unit: "mario/Enemy/x", name: "T::f", decision: "pass", semantic: "clean", analysis: "complete", audit_label: "real",
    match: { base: 90, candidate: 100, real_only: 100 }, groups: ["src/Enemy/x.cpp@1"],
  }],
  removable_noncosmetic: [], probes: [], units: [{ unit: "mario/Enemy/x", built: true, compared: true }],
};
const OUTPUTS: Record<string, unknown> = { edits: EDITS, reduce: REDUCE, mwcc: MWCC, decide: DECISION };

/** The host game files the sandbox placement uploads: approvals, lessons, rulings and game.json. */
function hostGame() {
  const root = tempDir();
  const lessonsDir = join(root, "games/sms/knowledge/sources/injectable/steering_lessons");
  mkdirSync(lessonsDir, { recursive: true });
  const approvalsPath = join(lessonsDir, "evidence_approvals.jsonl");
  const lessonsPath = join(lessonsDir, "lessons.jsonl");
  writeFileSync(approvalsPath, "{\"game\":\"sms\",\"unit\":\"mario/Enemy/x\"}\n");
  writeFileSync(lessonsPath, "{\"id\":\"lesson-1\"}\n");
  writeFileSync(join(lessonsDir, "review_rulings.jsonl"), "{\"id\":\"ruling-1\"}\n");
  const descriptorPath = join(root, "games/sms/game.json");
  writeFileSync(descriptorPath, "{\"id\":\"sms\",\"kind\":\"doldecomp-sms\"}\n");
  return { approvalsPath, lessonsPath, descriptorPath };
}

let defaultDescriptorPath: string | null = null;
/** A valid SMS game.json, written once. */
function defaultDescriptor(): string {
  defaultDescriptorPath ??= hostGame().descriptorPath;
  return defaultDescriptorPath;
}

type Call = { step: string; where: "sandbox" | "host"; args: string[]; env?: Record<string, string> };

/** Fake runner with a fixed placement: every step answers on stdout (host steps also write `--out`). */
function placedRunner(
  placement: SteeringPlacement | null,
  /** `descriptorPath` defaults to a valid SMS game.json; `null` leaves it out. */
  options: { gameId?: string; descriptorPath?: string | null; overrides?: Partial<Record<string, (args: string[]) => Promise<CommandResult> | CommandResult>> } = {},
) {
  const calls: Call[] = [];
  const uploads = new Map<string, string>();
  const runner: SteeringRunner = async (args, where, call?: SteeringCallOptions) => {
    const name = args[0]!;
    calls.push({ step: name, where, args, ...(call?.env ? { env: call.env } : {}) });
    const override = options.overrides?.[name];
    if (override) return override(args);
    const out = flag(args, "--out");
    if (where === "host" && out) writeFileSync(out, JSON.stringify(OUTPUTS[name]));
    return ok(OUTPUTS[name]);
  };
  runner.uploadToSandbox = async (path, content) => {
    calls.push({ step: "upload", where: "sandbox", args: [path] });
    uploads.set(path, content);
  };
  runner.uploadFilesToSandbox = async (files) => {
    calls.push({ step: "upload-files", where: "sandbox", args: Object.keys(files) });
    for (const [path, content] of Object.entries(files)) uploads.set(path, content);
  };
  if (placement) runner.placement = async () => placement;
  runner.sandboxGame = {
    ...(options.gameId !== undefined ? { id: options.gameId } : {}),
    ...(options.descriptorPath !== null ? { descriptorPath: options.descriptorPath ?? defaultDescriptor() } : {}),
  };
  return { runner, calls, uploads };
}

const SANDBOX: SteeringPlacement = { requested: "auto", where: "sandbox", reason: "sandbox has clang 21", clang: "/usr/bin/clang-21", clang_version: "Debian clang version 21.1.8" };
const HOST: SteeringPlacement = { requested: "host", where: "host", reason: "ORCH_STEERING_GATE_PLACEMENT=host" };

function gate(runner: SteeringRunner, extra: Partial<Parameters<typeof runWorkerSteeringGate>[0]> = {}) {
  const outputDir = tempDir();
  return runWorkerSteeringGate({
    baseRev: "base", functions: ["T::f"], hostRepoRoot: "/host/repo", cacheDir: join(outputDir, "cache"),
    outputDir, attemptIndex: 3, mode: "enforce", runner, ...extra,
  });
}

describe("sandbox placement", () => {
  test("every step runs in the sandbox: reduce writes the attribute report, decide reads the uploaded approvals and lessons", async () => {
    const game = hostGame();
    const { runner, calls, uploads } = placedRunner(SANDBOX, { gameId: "sms", descriptorPath: game.descriptorPath });
    const result = await gate(runner, { approvalsPath: game.approvalsPath, lessonsPath: game.lessonsPath });
    expect(result.error).toBeNull();
    expect(steeringRejectionReason(result)).toBeNull();
    expect(calls.map(({ step, where }) => `${step}:${where}`)).toEqual(["edits:sandbox", "upload-files:sandbox", "reduce:sandbox", "mwcc:sandbox", "decide:sandbox"]);

    const inputs = sandboxInputsDir(3);
    const env = { ORCH_GAME_ID: "sms", ORCH_GAME_DIR: `${inputs}/game/sms` };
    expect(flag(calls[0]!.args, "--out")).toBe(sandboxStepPath(3, "edits"));
    expect([...uploads.keys()].sort()).toEqual([
      `${inputs}/evidence_approvals.jsonl`, `${inputs}/game/sms/game.json`, `${inputs}/lessons.jsonl`, `${inputs}/review_rulings.jsonl`,
    ]);
    expect(uploads.get(`${inputs}/evidence_approvals.jsonl`)).toBe(readFileSync(game.approvalsPath, "utf8"));
    expect(uploads.get(`${inputs}/lessons.jsonl`)).toBe(readFileSync(game.lessonsPath, "utf8"));
    expect(uploads.get(`${inputs}/game/sms/game.json`)).toBe(readFileSync(game.descriptorPath, "utf8"));

    const reduce = calls[2]!;
    expect(reduce.args.slice(0, 5)).toEqual(["reduce", "--oracle-repo", ".", "--input", sandboxStepPath(3, "edits")]);
    expect(flag(reduce.args, "--cache-dir")).toBe(SANDBOX_STEERING_CACHE_DIR);
    expect(flag(reduce.args, "--approvals")).toBe(`${inputs}/evidence_approvals.jsonl`);
    expect(flag(reduce.args, "--out")).toBe(sandboxAttributePath(3));
    expect(reduce.env).toEqual(env);

    // mwcc gets the uploaded policy too (stack-frame policy recorded for decide).
    expect(calls[3]!.env).toEqual(env);
    const mwcc = calls[3]!.args;
    expect(flag(mwcc, "--attribute")).toBe(sandboxAttributePath(3));
    expect(flag(mwcc, "--out")).toBe(sandboxStepPath(3, "mwcc"));
    expect(flag(mwcc, "--revert-edits")).toBe("e1");

    const decide = calls[4]!;
    expect(flag(decide.args, "--reduce")).toBe(sandboxAttributePath(3));
    expect(flag(decide.args, "--mwcc")).toBe(sandboxStepPath(3, "mwcc"));
    expect(flag(decide.args, "--evidence-repo")).toBe(".");
    expect(flag(decide.args, "--approvals")).toBe(`${inputs}/evidence_approvals.jsonl`);
    expect(flag(decide.args, "--lessons")).toBe(`${inputs}/lessons.jsonl`);
    expect(decide.env).toEqual(env);
    // No host paths reach a sandbox step.
    for (const call of calls) expect(call.args.join(" ")).not.toContain("/host/repo");

    // Host copies of every step output, and the placement in the artifact.
    const artifact = JSON.parse(readFileSync(result.artifactPath!, "utf8"));
    expect(artifact.placement).toEqual(SANDBOX);
    expect(result.placement).toEqual(SANDBOX);
    expect(artifact.steps["attribute upload"]).toBeUndefined();
    for (const [step, expected] of [["reduce", REDUCE], ["mwcc", MWCC], ["decision", DECISION]] as const) {
      expect(JSON.parse(readFileSync(join(dirname(result.artifactPath!), `attempt-3.steering.${step}.json`), "utf8"))).toEqual(expected);
    }
  });

  test("without approvals or lessons on the host only game.json is uploaded and decide gets no flags", async () => {
    const { runner, calls, uploads } = placedRunner(SANDBOX, { gameId: "sms" });
    const result = await gate(runner);
    expect(result.error).toBeNull();
    expect([...uploads.keys()]).toEqual([`${sandboxInputsDir(3)}/game/sms/game.json`]);
    expect(calls.map(({ step }) => step)).toEqual(["edits", "upload-files", "reduce", "mwcc", "decide"]);
    const decide = calls.at(-1)!;
    expect(decide.args).not.toContain("--approvals");
    expect(decide.args).not.toContain("--lessons");
    expect(decide.env).toEqual({ ORCH_GAME_ID: "sms", ORCH_GAME_DIR: `${sandboxInputsDir(3)}/game/sms` });
  });

  test("a missing or invalid game.json fails closed before anything runs (no link-map rule without it)", async () => {
    const dir = tempDir();
    const invalid = join(dir, "game.json");
    writeFileSync(invalid, "{not json");
    const melee = join(dir, "melee.json");
    writeFileSync(melee, JSON.stringify({ id: "melee", kind: "doldecomp-melee" }));
    for (const [descriptorPath, detail] of [[null, "no game.json path for sms"], [join(dir, "missing.json"), "cannot read"], [invalid, "is not valid JSON"], [melee, "names game \"melee\", not sms"]] as const) {
      const { runner, calls, uploads } = placedRunner(SANDBOX, { gameId: "sms", descriptorPath });
      const result = await gate(runner);
      expect(result.decision).toBeNull();
      expect(result.error).toContain("steering gate needs the game's policy (game.json) to enforce its rules");
      expect(result.error).toContain(detail);
      expect(calls).toEqual([]);
      expect(uploads.size).toBe(0);
      expect(steeringRejectionReason(result)).toContain("steering_located");
    }
  });

  test("a sandbox run without a game id fails closed before reduce or decide, and never passes", async () => {
    for (const gameId of [undefined, " "]) {
      const { runner, calls } = placedRunner(SANDBOX, { ...(gameId !== undefined ? { gameId } : {}) });
      const result = await gate(runner);
      expect(result.decision).toBeNull();
      expect(result.error).toContain("no game id");
      expect(calls).toEqual([]);
      expect(steeringRejectionReason(result)).toContain("steering_located");
    }
  });

  test("an unavailable sandbox placement is a gate error, never a host run", async () => {
    const { runner, calls } = placedRunner({ requested: "sandbox", where: null, reason: "ORCH_IR_ORACLE_CLANG is not set on the sandbox" }, { gameId: "sms" });
    const result = await gate(runner);
    expect(result.error).toBe("steering gate placement sandbox unavailable: ORCH_IR_ORACLE_CLANG is not set on the sandbox");
    expect(calls).toEqual([]);
    expect(JSON.parse(readFileSync(result.artifactPath!, "utf8")).placement.where).toBeNull();
  });

  test("malformed sandbox reduce or decide output is an error", async () => {
    const bad = () => ({ exitCode: 0, stdout: "not json", stderr: "" });
    const reduce = await gate(placedRunner(SANDBOX, { gameId: "sms", overrides: { reduce: bad } }).runner);
    expect(reduce.error).toBe("steering_check.py reduce did not return JSON");
    const decide = await gate(placedRunner(SANDBOX, { gameId: "sms", overrides: { decide: () => ok({ attempt: "maybe", functions: [] }) } }).runner);
    expect(decide.error).toBe("steering_check.py decide did not return a valid decision");
    expect(decide.decision).toBeNull();
  });

  test("the gate budget still ends a hanging sandbox decide", async () => {
    const { runner } = placedRunner(SANDBOX, { gameId: "sms", overrides: { decide: () => new Promise<CommandResult>(() => undefined) } });
    const result = await gate(runner, { budgetMs: 300 });
    expect(result.decision).toBeNull();
    expect(result.error).toContain("exceeded during decide");
  });

  test("a failing inputs upload is a gate error before reduce", async () => {
    const game = hostGame();
    const { runner, calls } = placedRunner(SANDBOX, { gameId: "sms" });
    runner.uploadFilesToSandbox = async () => {
      throw new Error("upload of build/steering/attempt-3.inputs/lessons.jsonl did not verify");
    };
    const result = await gate(runner, { lessonsPath: game.lessonsPath });
    expect(result.error).toContain("did not verify");
    expect(calls.map(({ step }) => step)).toEqual(["edits"]);
  });
});

describe("host placement", () => {
  test("host placement keeps the host split unchanged and records why", async () => {
    const game = hostGame();
    const { runner, calls, uploads } = placedRunner(HOST, { gameId: "sms" });
    const result = await gate(runner, { approvalsPath: game.approvalsPath, lessonsPath: game.lessonsPath });
    expect(result.error).toBeNull();
    expect(calls.map(({ step, where }) => `${step}:${where}`)).toEqual(["edits:sandbox", "reduce:host", "upload:sandbox", "mwcc:sandbox", "decide:host"]);
    expect(calls[0]!.args).not.toContain("--out");
    expect(flag(calls[1]!.args, "--oracle-repo")).toBe("/host/repo");
    expect(calls.find((call) => call.step === "mwcc")!.args).not.toContain("--out");
    const decide = calls.at(-1)!;
    expect(flag(decide.args, "--approvals")).toBe(game.approvalsPath);
    expect(flag(decide.args, "--lessons")).toBe(game.lessonsPath);
    expect(decide.env).toBeUndefined();
    expect([...uploads.keys()]).toEqual([sandboxAttributePath(3)]);
    expect(result.placement).toEqual(HOST);
  });

  test("a runner without a placement (backfill, older runners) is the host split", async () => {
    const { runner, calls } = placedRunner(null);
    const result = await gate(runner);
    expect(result.error).toBeNull();
    expect(calls.map(({ step, where }) => `${step}:${where}`)).toEqual(["edits:sandbox", "reduce:host", "upload:sandbox", "mwcc:sandbox", "decide:host"]);
    expect(result.placement?.where).toBe("host");
  });
});

describe("placement setting and sandbox probe", () => {
  test("ORCH_STEERING_GATE_PLACEMENT is sandbox unless it explicitly says host", () => {
    expect(steeringGatePlacement({})).toBe("sandbox");
    expect(steeringGatePlacement({ [STEERING_GATE_PLACEMENT_ENV]: " Sandbox " })).toBe("sandbox");
    expect(steeringGatePlacement({ [STEERING_GATE_PLACEMENT_ENV]: "auto" })).toBe("sandbox");
    expect(steeringGatePlacement({ [STEERING_GATE_PLACEMENT_ENV]: "host" })).toBe("host");
    expect(steeringGatePlacement({ [STEERING_GATE_PLACEMENT_ENV]: "elsewhere" })).toBe("sandbox");
  });

  const probe = (value: unknown, where: "sandbox" | "host" = "sandbox", exitCode = 0) =>
    evaluateSandboxProbe({ exitCode, stdout: JSON.stringify(value), stderr: "" }, where);

  test("an LLVM 21 clang with a demangler passes the probe, on the sandbox or the host", () => {
    expect(probe(LLVM_CLANG_21_PROBE)).toMatchObject({ ok: true, clang: "/usr/bin/clang-21", llvmMajor: 21, demangler: "/usr/local/bin/llvm-cxxfilt" });
    expect(probe({ ...LLVM_CLANG_21_PROBE, version: "Homebrew clang version 21.1.8" }, "host")).toMatchObject({ ok: true, reason: "host has Homebrew clang version 21.1.8 at /usr/bin/clang-21" });
  });

  test("Apple clang 21 is refused: its 21 is Apple's numbering, not LLVM's", () => {
    const apple = probe(APPLE_CLANG_21_PROBE, "host");
    expect(apple.ok).toBe(false);
    expect(apple.reason).toContain("is Apple clang (Apple clang version 21.0.0 (clang-2100.1.1.101))");
    // Either signal alone is enough: the version line or the __apple_build_version__ macro.
    expect(probe({ ...APPLE_CLANG_21_PROBE, version: "clang version 21.0.0" }).ok).toBe(false);
    expect(probe({ ...APPLE_CLANG_21_PROBE, macros: { __clang_major__: "21" } }).ok).toBe(false);
  });

  test("another LLVM major, an inconsistent version, no demangler, or no clang at all is refused", () => {
    expect(probe(LLVM_CLANG_18_PROBE)).toMatchObject({ ok: false, llvmMajor: 18, reason: `sandbox clang is LLVM 18, not 21 (${LLVM_CLANG_18_PROBE.version})` });
    expect(probe({ ...LLVM_CLANG_21_PROBE, macros: { __clang_major__: "18" } }).reason).toContain("no consistent LLVM version");
    expect(probe({ ...LLVM_CLANG_21_PROBE, macros: {} }).reason).toContain("__clang_major__ missing");
    expect(probe({ ...LLVM_CLANG_21_PROBE, demangler: null })).toMatchObject({ ok: false, reason: "no c++filt or llvm-cxxfilt on the sandbox PATH (ir_oracle.demangle)" });
    expect(probe(NO_CLANG_PROBE)).toMatchObject({ ok: false, reason: "ORCH_IR_ORACLE_CLANG is not set on the sandbox" });
    expect(probe({ ...LLVM_CLANG_21_PROBE, executable: false }).reason).toContain("not an executable file");
    expect(probe({}, "sandbox", 127).ok).toBe(false);
    expect(evaluateSandboxProbe({ exitCode: 0, stdout: "garbage", stderr: "" }).reason).toBe("sandbox clang probe did not return JSON");
  });
});

/**
 * A fake sandbox: the probe answers `probe`, multi-file uploads really run
 * (python3 in `dir`), and steering_check.py subcommands answer from OUTPUTS.
 */
function fakeSandbox(probe: unknown) {
  const dir = tempDir();
  const commands: Array<{ command: string[]; env?: Record<string, string> }> = [];
  const exec: WorkspaceExec = {
    exec: async (command, options) => {
      commands.push({ command, ...(options?.env ? { env: options.env as Record<string, string> } : {}) });
      if (command[1] === "-c" && command[2]!.includes("ORCH_IR_ORACLE_CLANG")) return ok(probe);
      if (command[1] === "-c") {
        const proc = Bun.spawnSync(command, { cwd: dir, stdout: "pipe", stderr: "pipe" });
        return { exitCode: proc.exitCode, stdout: proc.stdout.toString(), stderr: proc.stderr.toString() };
      }
      return ok(OUTPUTS[command[2]!]);
    },
    captureGitDiff: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
  };
  const subcommands = () => commands.filter(({ command }) => command[1] !== "-c").map(({ command }) => command[2]);
  return { exec, dir, commands, subcommands };
}

describe("workspace runner placement", () => {
  test("auto with a clang-21 sandbox runs decide there with the uploaded inputs and ORCH_GAME_ID; the probe runs once per sandbox", async () => {
    const game = hostGame();
    const sandbox = fakeSandbox(LLVM_CLANG_21_PROBE);
    const run = spyOn(shell, "runCommand").mockResolvedValue({ exitCode: 1, stdout: "", stderr: "host must not run" });
    try {
      const runner = () => workspaceSteeringRunner(sandbox.exec, "/host/steering_check.py", "/host", {
        mode: "enforce", placement: "auto", game: { id: "sms", descriptorPath: game.descriptorPath },
      });
      const result = await gate(runner(), { approvalsPath: game.approvalsPath, lessonsPath: game.lessonsPath });
      expect(result.error).toBeNull();
      expect(result.placement).toMatchObject({ requested: "auto", where: "sandbox", clang: "/usr/bin/clang-21", demangler: "/usr/local/bin/llvm-cxxfilt" });
      expect(run).not.toHaveBeenCalled();
      expect(sandbox.subcommands()).toEqual(["edits", "reduce", "mwcc", "decide"]);
      const decide = sandbox.commands.find(({ command }) => command[2] === "decide")!;
      expect(decide.env).toMatchObject({ ORCH_STEERING_GATE: "enforce", ORCH_GAME_ID: "sms", ORCH_GAME_DIR: `${sandboxInputsDir(3)}/game/sms` });
      const approvals = flag(decide.command, "--approvals")!;
      const lessons = flag(decide.command, "--lessons")!;
      // The uploaded files really landed in the sandbox workspace, byte for byte.
      expect(readFileSync(join(sandbox.dir, approvals), "utf8")).toBe(readFileSync(game.approvalsPath, "utf8"));
      expect(readFileSync(join(sandbox.dir, lessons), "utf8")).toBe(readFileSync(game.lessonsPath, "utf8"));
      expect(readFileSync(join(sandbox.dir, sandboxInputsDir(3), "review_rulings.jsonl"), "utf8")).toContain("ruling-1");
      // edits/mwcc keep their own env; only reduce and decide get the game env.
      expect(sandbox.commands.find(({ command }) => command[2] === "edits")!.env).toEqual({ ORCH_STEERING_GATE: "enforce" });

      await gate(runner());
      const probes = sandbox.commands.filter(({ command }) => command[1] === "-c" && command[2]!.includes("ORCH_IR_ORACLE_CLANG"));
      expect(probes).toHaveLength(1);
    } finally {
      run.mockRestore();
    }
  });

  /** A host probe answering a recorded probe output, counting its calls. */
  const hostProbe = (fixture: unknown) => {
    const probe = Object.assign(async () => {
      probe.calls += 1;
      return evaluateSandboxProbe({ exitCode: 0, stdout: JSON.stringify(fixture), stderr: "" }, "host");
    }, { calls: 0 });
    return probe;
  };

  test("the default placement without a qualifying sandbox clang fails closed: the host is never probed and nothing runs", async () => {
    for (const placement of [undefined, "auto", "sandbox"] as const) {
      const sandbox = fakeSandbox(NO_CLANG_PROBE);
      const host = hostProbe(LLVM_CLANG_21_PROBE);
      const run = spyOn(shell, "runCommand").mockResolvedValue({ exitCode: 1, stdout: "", stderr: "host must not run" });
      try {
        const runner = workspaceSteeringRunner(sandbox.exec, "/host/steering_check.py", "/host", { mode: "enforce", ...(placement ? { placement } : {}), game: { id: "sms" }, hostProbe: host });
        const result = await gate(runner);
        expect(result.decision).toBeNull();
        expect(result.error).toBe(`steering gate placement ${placement ?? "sandbox"} unavailable: snapshot lacks clang-21; rebuild the image (ORCH_IR_ORACLE_CLANG is not set on the sandbox)`);
        expect(steeringRejectionReason(result)).toContain("steering_located");
        expect(JSON.parse(readFileSync(result.artifactPath!, "utf8")).placement).toMatchObject({ where: null });
        expect(host.calls).toBe(0);
        expect(run).not.toHaveBeenCalled();
        expect(sandbox.subcommands()).toEqual([]);
      } finally {
        run.mockRestore();
      }
    }
  });

  test("the default placement with a qualifying sandbox never probes the host", async () => {
    const host = hostProbe(LLVM_CLANG_21_PROBE);
    const placement = await workspaceSteeringRunner(fakeSandbox(LLVM_CLANG_21_PROBE).exec, "/host/steering_check.py", "/host", { hostProbe: host }).placement!();
    expect(placement).toMatchObject({ requested: "sandbox", where: "sandbox" });
    expect(host.calls).toBe(0);
  });

  test("explicit host is probed: it runs only with an LLVM 21 host clang, and never probes the sandbox", async () => {
    const sandbox = fakeSandbox({});
    const host = hostProbe(LLVM_CLANG_21_PROBE);
    const good = await workspaceSteeringRunner(sandbox.exec, "/host/steering_check.py", "/host", { placement: "host", hostProbe: host }).placement!();
    expect(good).toMatchObject({ requested: "host", where: "host", clang: "/usr/bin/clang-21" });
    expect(host.calls).toBe(1);
    const refused = await workspaceSteeringRunner(sandbox.exec, "/host/steering_check.py", "/host", { placement: "host", hostProbe: hostProbe(APPLE_CLANG_21_PROBE) }).placement!();
    expect(refused).toMatchObject({ requested: "host", where: null });
    expect(refused.reason).toContain("ORCH_STEERING_GATE_PLACEMENT=host but the host clang is refused: /usr/bin/clang is Apple clang");
    expect(sandbox.commands).toEqual([]);
  });
});

describe("uploadFilesThroughExec", () => {
  function spawnExec(dir: string, commands: string[][]): WorkspaceExec {
    return {
      exec: async (command) => {
        commands.push(command);
        const proc = Bun.spawnSync(command, { cwd: dir, stdout: "pipe", stderr: "pipe" });
        return { exitCode: proc.exitCode, stdout: proc.stdout.toString(), stderr: proc.stderr.toString() };
      },
      captureGitDiff: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
    };
  }

  test("small files go in one command and verify; large sets fall back to per-file chunked uploads", async () => {
    const dir = tempDir();
    const commands: string[][] = [];
    await uploadFilesThroughExec(spawnExec(dir, commands), { "a/x.jsonl": "x\n", "b/y.json": "é{}" });
    expect(commands).toHaveLength(1);
    expect(readFileSync(join(dir, "a/x.jsonl"), "utf8")).toBe("x\n");
    expect(readFileSync(join(dir, "b/y.json"), "utf8")).toBe("é{}");

    commands.length = 0;
    await uploadFilesThroughExec(spawnExec(dir, commands), { "big.jsonl": "z".repeat(100_000), "small.json": "{}" });
    expect(readFileSync(join(dir, "big.jsonl"), "utf8")).toHaveLength(100_000);
    expect(commands.length).toBeGreaterThan(2);
    expect(Math.max(...commands.map((command) => command.at(-1)!.length))).toBeLessThan(128 * 1024);
  });

  test("a write that does not verify, or a passed deadline, rejects", async () => {
    const lying: WorkspaceExec = { exec: async () => ok({ "a.json": "0".repeat(64) }), captureGitDiff: async () => ({ exitCode: 0, stdout: "", stderr: "" }) };
    await expect(uploadFilesThroughExec(lying, { "a.json": "{}" })).rejects.toThrow("did not verify");
    await expect(uploadFilesThroughExec(lying, { "a.json": "{}" }, 60_000, Date.now() - 1)).rejects.toThrow("ran past its deadline");
  });
});

function dirname(path: string): string {
  return path.slice(0, path.lastIndexOf("/"));
}
