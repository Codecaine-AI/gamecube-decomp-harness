import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { openState } from "@server/core/orchestrator-state";
import { resolveGame } from "@server/core/game-registry/resolver.js";
import { listStackOnlyFunctions, recordStackOnlyFunction } from "@server/core/harness-runtime/run-state/stack-only-functions.js";
import {
  latestCleanSteeringBackfillRun,
  listSteeringBackfill,
  steeringCoverageFor,
  steeringCoverageReport,
} from "@server/core/harness-runtime/run-state/steering.js";
import { assertSteeringGatePreflight } from "@server/core/validation/steering/steering-preflight.js";
import type { SteeringRunner } from "@server/core/validation/steering/steering-check.js";
import type { CommandResult } from "@server/infrastructure/shell";
import { runSteeringBackfill, steeringGateJob, type SteeringBuildRunner } from "./steering-gate.js";

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "steering-gate-job-"));
  dirs.push(dir);
  return dir;
}

function git(repo: string, ...args: string[]): string {
  const result = Bun.spawnSync(["git", "-C", repo, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" },
  });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString().trim();
}

const UNIT_A = "mario/Enemy/a";
const UNIT_B = "mario/Enemy/b";
const SRC_A = "src/Enemy/a.cpp";
const SRC_B = "src/Enemy/b.cpp";
const HEADER = "include/Enemy/shared.h";
const STEERED = "int f() { int t = g(); return t; }\n";
const REAL = "int f() { return g(); }\n";

/** A committed checkout: two units and a header both include. */
function checkout(): { repo: string; head: string } {
  const repo = tempDir();
  git(repo, "init", "-q", "-b", "main");
  for (const [path, text] of [[SRC_A, STEERED], [SRC_B, STEERED], [HEADER, "// shared\n"]] as const) {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), text);
  }
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "steered");
  return { repo, head: git(repo, "rev-parse", "HEAD") };
}

function fn(unit: string, name: string, decision: string) {
  return {
    unit, name, decision, semantic: decision === "pass" ? "clean" : "steering", analysis: "complete", audit_label: "x",
    match: { base: 90, candidate: 100, real_only: 97 },
  };
}

interface CheckFixture {
  attempt: string;
  functions: ReturnType<typeof fn>[];
  units?: Array<{ unit: string; built: boolean; compared: boolean }>;
  removable?: Array<{ id: string; file: string }>;
  removableNoncosmetic?: string[];
  analysis?: string;
  unresolvedGroups?: string[];
  files?: string[];
  noChanges?: boolean;
  /** decide's final unresolved groups; absent = decide did not report them. */
  decideUnresolved?: string[];
}

const covered = (...units: string[]) => units.map((unit) => ({ unit, built: true, compared: true }));

/** `check` output; `attempt` is set independently of the function rows. */
function check(fixture: CheckFixture) {
  return {
    edits: {
      files: (fixture.files ?? [SRC_A]).map((path) => ({ path })),
      units: [
        { unit: UNIT_A, source: SRC_A, object: "build/GMSJ01/src/Enemy/a.o" },
        { unit: UNIT_B, source: SRC_B, object: "build/GMSJ01/src/Enemy/b.o" },
      ],
      header_units: { [HEADER]: [UNIT_A, UNIT_B] },
    },
    reduce: {
      analysis: fixture.analysis ?? "complete",
      groups: [
        ...(fixture.removable ?? []).map((group) => ({ ...group, status: "removable", edit_ids: [`${group.id}e`] })),
        ...(fixture.unresolvedGroups ?? []).map((id) => ({ id, file: SRC_A, status: "unresolved", edit_ids: [] })),
      ],
    },
    decision: {
      attempt: fixture.attempt,
      reasons: [],
      functions: fixture.functions,
      removable_noncosmetic: fixture.removableNoncosmetic ?? [],
      probes: [{ function: "steer", unit: UNIT_A, hypotheses: [] }],
      ...(fixture.units ? { units: fixture.units } : {}),
      ...(fixture.noChanges ? { no_changes: true } : {}),
      ...(fixture.decideUnresolved ? { unresolved_groups: fixture.decideUnresolved } : {}),
    },
  };
}

/** `check` answers with the next queued report; `apply` rewrites the listed files to their S* text. */
function fakeRunners(repo: string, reports: unknown[], applyWrites: Record<string, string> = {}) {
  const calls: string[][] = [];
  const builds: string[][] = [];
  const runner: SteeringRunner = async (args, where) => {
    expect(where).toBe("host");
    calls.push(args);
    if (args[0] === "check") writeFileSync(args[args.indexOf("--out") + 1]!, JSON.stringify(reports.shift()));
    if (args[0] === "apply" && !args.includes("--dry-run")) {
      for (const [path, text] of Object.entries(applyWrites)) writeFileSync(join(repo, path), text);
    }
    return { exitCode: 0, stdout: "", stderr: "" };
  };
  const buildRunner: SteeringBuildRunner = async (command): Promise<CommandResult> => {
    builds.push(command);
    return { exitCode: 0, stdout: "", stderr: "" };
  };
  return { runner, buildRunner, calls, builds };
}

async function withStore(run: (store: ReturnType<typeof openState>, dir: string) => Promise<void>): Promise<void> {
  const dir = tempDir();
  const store = openState(join(dir, "state"));
  try {
    await run(store, dir);
  } finally {
    store.db.close();
  }
}

const VALIDATION = { reportPath: "build/GMSJ01/report.json" };
const enforced = { gameId: "sms", matching: { stackFramePolicy: "stop_at_frame" as const, steeringGate: "enforce" as const } };

function backfill(repo: string, head: string, store: ReturnType<typeof openState>, dir: string, runners: ReturnType<typeof fakeRunners>, extra: Partial<Parameters<typeof runSteeringBackfill>[0]> = {}) {
  return runSteeringBackfill({
    store, gameId: "sms", repoRoot: repo, baseRev: "base000", headRev: head, record: true, apply: false, dryRun: false,
    runner: runners.runner, buildRunner: runners.buildRunner, outputDir: join(dir, `out-${Math.random()}`), validation: VALIDATION, ...extra,
  });
}

describe("steering-gate --record certifies HEAD only", () => {
  test("record-only with steering writes unclean coverage and an unclean run", async () => {
    await withStore(async (store, dir) => {
      const { repo, head } = checkout();
      const runners = fakeRunners(repo, [check({ attempt: "steering_located", functions: [fn(UNIT_A, "steer", "steering_located"), fn(UNIT_B, "fine", "pass")], units: covered(UNIT_A, UNIT_B), removable: [{ id: "g1", file: SRC_A }], removableNoncosmetic: ["g1"] })]);
      const result = await backfill(repo, head, store, dir, runners);
      expect(result.clean).toBe(false);
      expect(runners.calls.map((args) => args[0])).toEqual(["check"]);
      expect(steeringCoverageFor(store, "sms", UNIT_A)).toEqual({ baselineRev: head, clean: false, analyzedRev: head });
      // Unit b's functions pass, but a removable non-cosmetic group remains in the report: nothing is clean.
      expect(steeringCoverageFor(store, "sms", UNIT_B)?.clean).toBe(false);
      expect(latestCleanSteeringBackfillRun(store, "sms")).toBeNull();
      const rows = listSteeringBackfill(store, "sms");
      expect(rows.map((row) => [row.symbol, row.verdict, row.applied])).toEqual([["steer", "steering_located", false], ["fine", "pass", false]]);
      expect(rows[0]?.report.probe).toMatchObject({ function: "steer" });
    });
  });

  test("a clean, fully covered pass at HEAD records a clean run that satisfies the enforce preflight", async () => {
    await withStore(async (store, dir) => {
      const { repo, head } = checkout();
      const runners = fakeRunners(repo, [check({ attempt: "pass", functions: [fn(UNIT_A, "f", "pass"), fn(UNIT_B, "g", "pass")], units: covered(UNIT_A, UNIT_B) })]);
      const result = await backfill(repo, head, store, dir, runners);
      expect(result).toMatchObject({ clean: true, problems: [] });
      expect(steeringCoverageFor(store, "sms", UNIT_A)?.clean).toBe(true);
      expect(latestCleanSteeringBackfillRun(store, "sms")?.baselineRev).toBe(head);
      expect(() => assertSteeringGatePreflight(store, { game: enforced, repoRoot: repo, command: "run-loop" })).not.toThrow();
      expect(steeringCoverageReport(store, "sms", UNIT_A)).toMatchObject({ base_rev: "base000", provisional: false, coverage: { built: true, compared: true } });
    });
  });

  test("a consumer unit reported as skipped is persisted unclean and keeps the run unclean", async () => {
    await withStore(async (store, dir) => {
      const { repo, head } = checkout();
      const units = [...covered(UNIT_A), { unit: UNIT_B, built: false, compared: false, exempt: "ir_unchanged" } as never];
      const result = await backfill(repo, head, store, dir, fakeRunners(repo, [check({ attempt: "pass", functions: [fn(UNIT_A, "f", "pass")], units })]));
      expect(result.clean).toBe(false);
      expect(steeringCoverageFor(store, "sms", UNIT_A)?.clean).toBe(true);
      expect(steeringCoverageFor(store, "sms", UNIT_B)?.clean).toBe(false);
      expect(steeringCoverageReport(store, "sms", UNIT_B)).toMatchObject({ coverage: { built: false, compared: false, exempt: "ir_unchanged" } });
      expect(latestCleanSteeringBackfillRun(store, "sms")).toBeNull();
    });
  });

  test("refuses to record or apply on a dirty source tree", async () => {
    await withStore(async (store, dir) => {
      const { repo, head } = checkout();
      writeFileSync(join(repo, SRC_B), REAL);
      const runners = fakeRunners(repo, [check({ attempt: "pass", functions: [], units: [] })]);
      await expect(backfill(repo, head, store, dir, runners)).rejects.toThrow(/needs a clean src\/ include\/ libs\/ working tree.*src\/Enemy\/b\.cpp/);
      await expect(backfill(repo, head, store, dir, runners, { record: false, apply: true })).rejects.toThrow(/needs a clean/);
      expect(runners.calls).toEqual([]);
    });
  });
});

describe("steering-gate clean needs the whole certificate", () => {
  test("an unresolved report with zero function rows is not clean", async () => {
    await withStore(async (store, dir) => {
      const { repo, head } = checkout();
      const runners = fakeRunners(repo, [check({ attempt: "unresolved", functions: [], units: [] })]);
      const result = await backfill(repo, head, store, dir, runners);
      expect(result.clean).toBe(false);
      expect(result.problems.join("; ")).toContain("no function was considered");
      expect(latestCleanSteeringBackfillRun(store, "sms")).toBeNull();
    });
  });

  test("passing functions under a rejected attempt (removable non-cosmetic groups) are not clean", async () => {
    await withStore(async (store, dir) => {
      const { repo, head } = checkout();
      const runners = fakeRunners(repo, [check({ attempt: "steering_located", functions: [fn(UNIT_A, "f", "pass")], units: covered(UNIT_A), removable: [{ id: "g1", file: SRC_A }], removableNoncosmetic: ["g1"] })]);
      const result = await backfill(repo, head, store, dir, runners);
      expect(result.clean).toBe(false);
      expect(result.problems.join("; ")).toContain("behaviour-identical edit groups left in the patch: g1");
      expect(result.units).toEqual([{ unit: UNIT_A, clean: false, provisional: false, coverage: { built: true, compared: true } }]);
      expect(latestCleanSteeringBackfillRun(store, "sms")).toBeNull();
    });
  });

  test("a pass attempt with uncovered units, missing coverage, incomplete analysis or unresolved groups is not clean", async () => {
    const cases: CheckFixture[] = [
      { attempt: "pass", functions: [fn(UNIT_A, "f", "pass")], units: [{ unit: UNIT_A, built: true, compared: false }] },
      { attempt: "pass", functions: [fn(UNIT_A, "f", "pass")] },
      { attempt: "pass", functions: [fn(UNIT_A, "f", "pass")], units: covered(UNIT_A), analysis: "incomplete" },
      { attempt: "pass", functions: [fn(UNIT_A, "f", "pass")], units: covered(UNIT_A), unresolvedGroups: ["g4"] },
    ];
    for (const fixture of cases) {
      await withStore(async (store, dir) => {
        const { repo, head } = checkout();
        const result = await backfill(repo, head, store, dir, fakeRunners(repo, [check(fixture)]));
        expect(result.clean).toBe(false);
        expect(steeringCoverageFor(store, "sms", UNIT_A)?.clean).toBe(false);
        expect(latestCleanSteeringBackfillRun(store, "sms")).toBeNull();
      });
    }
  });

  test("a reduce group decide promoted is clean; decide's own unresolved groups are not", async () => {
    await withStore(async (store, dir) => {
      const { repo, head } = checkout();
      const promoted = await backfill(repo, head, store, dir, fakeRunners(repo, [check({ attempt: "pass", functions: [fn(UNIT_A, "f", "pass")], units: covered(UNIT_A), unresolvedGroups: ["g4"], decideUnresolved: [] })]));
      expect(promoted.clean).toBe(true);
      expect(steeringCoverageFor(store, "sms", UNIT_A)?.clean).toBe(true);
      const still = await backfill(repo, head, store, dir, fakeRunners(repo, [check({ attempt: "pass", functions: [fn(UNIT_A, "f", "pass")], units: covered(UNIT_A), decideUnresolved: ["g5"] })]));
      expect(still.clean).toBe(false);
      expect(steeringCoverageFor(store, "sms", UNIT_A)?.clean).toBe(false);
    });
  });

  test("an explicit no-change report with no edited files is clean without coverage", async () => {
    await withStore(async (store, dir) => {
      const { repo, head } = checkout();
      const result = await backfill(repo, head, store, dir, fakeRunners(repo, [check({ attempt: "pass", functions: [], units: [], files: [], noChanges: true })]));
      expect(result.clean).toBe(true);
      expect(latestCleanSteeringBackfillRun(store, "sms")?.baselineRev).toBe(head);
    });
  });
});

describe("steering-gate --apply is provisional", () => {
  test("apply writes S*, rebuilds and re-checks, records provisional rows; discarding it leaves enforce refused", async () => {
    await withStore(async (store, dir) => {
      const { repo, head } = checkout();
      recordStackOnlyFunction(store, { gameId: "sms", unit: UNIT_A, symbol: "steer", fuzzy: 99, source: "backfill" });
      recordStackOnlyFunction(store, { gameId: "sms", unit: UNIT_B, symbol: "fine", fuzzy: 98, source: "backfill" });
      const runners = fakeRunners(repo, [
        check({ attempt: "steering_located", functions: [fn(UNIT_A, "steer", "steering_located"), fn(UNIT_B, "fine", "pass")], units: covered(UNIT_A, UNIT_B), removable: [{ id: "g1", file: SRC_A }], removableNoncosmetic: ["g1"] }),
        check({ attempt: "pass", functions: [fn(UNIT_A, "steer", "pass"), fn(UNIT_B, "fine", "pass")], units: covered(UNIT_A, UNIT_B) }),
      ], { [SRC_A]: REAL });
      const result = await backfill(repo, head, store, dir, runners, { apply: true });
      expect(runners.calls.map((args) => args[0])).toEqual(["check", "apply", "check"]);
      expect(runners.builds).toEqual([["ninja", "-j3", "build/GMSJ01/src/Enemy/a.o", "build/GMSJ01/report.json"]]);
      expect(result).toMatchObject({ clean: false, applied: true, touchedFiles: [SRC_A], touchedUnits: [UNIT_A], stackOnlyCleared: 1 });
      expect(result.nextSteps.join(" ")).toContain("--record");
      expect(listSteeringBackfill(store, "sms").find((row) => row.symbol === "steer")).toMatchObject({ verdict: "pass", applied: true, appliedRev: null });
      expect(steeringCoverageFor(store, "sms", UNIT_A)?.clean).toBe(false);
      expect(latestCleanSteeringBackfillRun(store, "sms")).toBeNull();
      expect(listStackOnlyFunctions(store, "sms").map((row) => row.symbol)).toEqual(["fine"]);

      // The operator discards the cleanup: HEAD is still the steered history and enforce stays refused.
      git(repo, "checkout", "--", ".");
      expect(readFileSync(join(repo, SRC_A), "utf8")).toBe(STEERED);
      expect(() => assertSteeringGatePreflight(store, { game: enforced, repoRoot: repo, command: "run-loop" })).toThrow(/no clean steering backfill run/);
    });
  });

  test("commit after apply, then --record certifies the new HEAD", async () => {
    await withStore(async (store, dir) => {
      const { repo, head } = checkout();
      const applyRunners = fakeRunners(repo, [
        check({ attempt: "steering_located", functions: [fn(UNIT_A, "steer", "steering_located")], units: covered(UNIT_A), removable: [{ id: "g1", file: SRC_A }], removableNoncosmetic: ["g1"] }),
        check({ attempt: "pass", functions: [fn(UNIT_A, "steer", "pass")], units: covered(UNIT_A) }),
      ], { [SRC_A]: REAL });
      await backfill(repo, head, store, dir, applyRunners, { apply: true, record: false });
      git(repo, "commit", "-q", "-am", "steering cleanup");
      const cleaned = git(repo, "rev-parse", "HEAD");
      const recordRunners = fakeRunners(repo, [check({ attempt: "pass", functions: [fn(UNIT_A, "steer", "pass")], units: covered(UNIT_A) })]);
      const result = await backfill(repo, cleaned, store, dir, recordRunners);
      expect(result.clean).toBe(true);
      expect(latestCleanSteeringBackfillRun(store, "sms")?.baselineRev).toBe(cleaned);
      expect(() => assertSteeringGatePreflight(store, { game: enforced, repoRoot: repo, command: "run-loop" })).not.toThrow();
    });
  });

  test("a full apply that rewrites a shared header rebuilds and records every unit that includes it", async () => {
    await withStore(async (store, dir) => {
      const { repo, head } = checkout();
      const runners = fakeRunners(repo, [
        check({ attempt: "steering_located", functions: [fn(UNIT_A, "steer", "steering_located")], units: covered(UNIT_A), removable: [{ id: "g1", file: HEADER }], removableNoncosmetic: ["g1"] }),
        check({ attempt: "pass", functions: [fn(UNIT_A, "steer", "pass"), fn(UNIT_B, "other", "pass")], units: covered(UNIT_A, UNIT_B) }),
      ], { [HEADER]: "// shared, cleaned\n" });
      const result = await backfill(repo, head, store, dir, runners, { apply: true });
      expect(result.touchedUnits).toEqual([UNIT_A, UNIT_B]);
      expect(runners.builds[0]).toEqual(["ninja", "-j3", "build/GMSJ01/src/Enemy/a.o", "build/GMSJ01/src/Enemy/b.o", "build/GMSJ01/report.json"]);
      expect(listSteeringBackfill(store, "sms").map((row) => row.symbol).sort()).toEqual(["other", "steer"]);
      expect(steeringCoverageFor(store, "sms", UNIT_B)).toMatchObject({ clean: false });
    });
  });
});

describe("steering-gate scoped --apply", () => {
  test("refuses when a reverted edit lies in a file outside the scoped units, and leaves every file untouched", async () => {
    await withStore(async (store, dir) => {
      const { repo, head } = checkout();
      const runners = fakeRunners(repo, [
        check({ attempt: "steering_located", functions: [fn(UNIT_A, "steer", "steering_located"), fn(UNIT_B, "other", "steering_located")], units: covered(UNIT_A, UNIT_B), removable: [{ id: "g1", file: SRC_A }, { id: "g2", file: SRC_B }], removableNoncosmetic: ["g1", "g2"] }),
      ], { [SRC_A]: REAL, [SRC_B]: REAL });
      await expect(backfill(repo, head, store, dir, runners, { apply: true, unitFilter: "Enemy/a" }))
        .rejects.toThrow(/refuses a scoped --apply: apply reverts behaviour-identical edits in src\/Enemy\/b\.cpp/);
      expect(runners.calls.map((args) => args[0])).toEqual(["check"]);
      expect(readFileSync(join(repo, SRC_A), "utf8")).toBe(STEERED);
      expect(readFileSync(join(repo, SRC_B), "utf8")).toBe(STEERED);
      // A header shared with an out-of-scope unit is refused too.
      const header = fakeRunners(repo, [check({ attempt: "steering_located", functions: [fn(UNIT_A, "steer", "steering_located")], units: covered(UNIT_A), removable: [{ id: "g1", file: HEADER }] })]);
      await expect(backfill(repo, head, store, dir, header, { apply: true, unitFilter: "Enemy/a" })).rejects.toThrow(/include\/Enemy\/shared\.h/);
    });
  });

  test("applies when every reverted edit is in the scoped unit's own files; the other unit's file is untouched", async () => {
    await withStore(async (store, dir) => {
      const { repo, head } = checkout();
      const runners = fakeRunners(repo, [
        check({ attempt: "steering_located", functions: [fn(UNIT_A, "steer", "steering_located"), fn(UNIT_B, "fine", "pass")], units: covered(UNIT_A, UNIT_B), removable: [{ id: "g1", file: SRC_A }], removableNoncosmetic: ["g1"] }),
        check({ attempt: "pass", functions: [fn(UNIT_A, "steer", "pass")], units: covered(UNIT_A) }),
      ], { [SRC_A]: REAL });
      const result = await backfill(repo, head, store, dir, runners, { apply: true, unitFilter: "Enemy/a" });
      expect(readFileSync(join(repo, SRC_A), "utf8")).toBe(REAL);
      expect(readFileSync(join(repo, SRC_B), "utf8")).toBe(STEERED);
      expect(result.touchedFiles).toEqual([SRC_A]);
      expect(runners.builds).toEqual([["ninja", "-j3", "build/GMSJ01/src/Enemy/a.o", "build/GMSJ01/report.json"]]);
      expect(listSteeringBackfill(store, "sms").map((row) => row.unit)).toEqual([UNIT_A]);
      expect(steeringCoverageFor(store, "sms", UNIT_B)).toBeNull();
    });
  });

  test("--dry-run passes --dry-run to apply and writes nothing", async () => {
    await withStore(async (store, dir) => {
      const { repo, head } = checkout();
      const runners = fakeRunners(repo, [check({ attempt: "steering_located", functions: [fn(UNIT_A, "steer", "steering_located")], units: covered(UNIT_A), removable: [{ id: "g1", file: SRC_A }] })], { [SRC_A]: REAL });
      await backfill(repo, head, store, dir, runners, { apply: true, dryRun: true });
      expect(runners.calls.map((args) => args.filter((arg) => arg === "apply" || arg === "check" || arg === "--dry-run"))).toEqual([["check"], ["apply", "--dry-run"]]);
      expect(runners.builds).toEqual([]);
      expect(readFileSync(join(repo, SRC_A), "utf8")).toBe(STEERED);
      expect(steeringCoverageFor(store, "sms", UNIT_A)).toBeNull();
    });
  });
});

describe("steering-gate errors", () => {
  test("a failing check is an error", async () => {
    await withStore(async (store, dir) => {
      const { repo, head } = checkout();
      const runner: SteeringRunner = async () => ({ exitCode: 2, stdout: "", stderr: "no clang" });
      await expect(backfill(repo, head, store, dir, { runner, buildRunner: async () => ({ exitCode: 0, stdout: "", stderr: "" }), calls: [], builds: [] }))
        .rejects.toThrow("steering_check.py check exited 2: no clang");
    });
  });

  test("refuses games with the gate off unless --force", async () => {
    const globals = { game: resolveGame({ gameId: "melee" }), gameId: "melee", repoRoot: tempDir(), stateDir: tempDir(), dryRunAgents: true, model: "m", provider: "p", thinkingLevel: "low" };
    await expect(steeringGateJob(globals as never, new Map([["--base", "HEAD"]]))).rejects.toThrow(/melee is off \(pass --force/);
  });
});
