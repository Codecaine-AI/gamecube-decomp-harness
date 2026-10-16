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
  listSteeringRollbacks,
  steeringCoverageFor,
  steeringCoverageReport,
} from "@server/core/harness-runtime/run-state/steering.js";
import { assertSteeringGatePreflight } from "@server/core/validation/steering/steering-preflight.js";
import { listUnverifiedMatches, recordUnverifiedMatch } from "@server/core/harness-runtime/run-state/unverified-matches.js";
import { steeringPreviousAttempt } from "@server/core/agent-catalog/agents/running/worker/previous-attempt.js";
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

function fn(unit: string, name: string, decision: string, extra: Record<string, unknown> = {}) {
  return {
    unit, name, decision, semantic: decision === "pass" ? "clean" : decision === "unresolved" ? "unresolved" : "steering",
    analysis: decision === "unresolved" ? "incomplete" : "complete", audit_label: "x",
    match: { base: 90, candidate: 100, real_only: 97 }, ...extra,
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
  violations?: Array<Record<string, unknown>>;
  orderChecks?: Array<Record<string, unknown>>;
  unusedChecks?: Array<{ unit: string; file: string; function: string; status: string; changed: unknown[]; reason?: string }>;
  /** decide's structured attempt issues and reduce's incomplete details. */
  attemptIssues?: Array<Record<string, unknown>>;
  incompleteDetails?: Array<Record<string, unknown>>;
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
      ...(fixture.incompleteDetails ? { incomplete_details: fixture.incompleteDetails } : {}),
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
      ...(fixture.violations ? { violations: fixture.violations } : {}),
      ...(fixture.unusedChecks ? { unused_checks: fixture.unusedChecks } : {}),
      ...(fixture.orderChecks ? { order_checks: fixture.orderChecks } : {}),
      ...(fixture.attemptIssues ? { attempt_issues: fixture.attemptIssues } : {}),
    },
  };
}

const issue = (category: string, extra: Record<string, unknown> = {}) => ({ category, units: [], groups: [], files: [], detail: "", ...extra });

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
    runner: runners.runner, buildRunner: runners.buildRunner, outputDir: join(dir, `out-${Math.random()}`), validation: VALIDATION,
    buildCheck: () => null, ...extra,
  });
}

describe("steering-gate --record certifies HEAD only", () => {
  test("record-only with steering writes unclean coverage and an unclean run", async () => {
    await withStore(async (store, dir) => {
      const { repo, head } = checkout();
      const runners = fakeRunners(repo, [check({ attempt: "steering_located", functions: [fn(UNIT_A, "steer", "steering_located", { groups: ["g1"] }), fn(UNIT_B, "fine", "pass")], units: covered(UNIT_A, UNIT_B), removable: [{ id: "g1", file: SRC_A }], removableNoncosmetic: ["g1"] })]);
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

  test("a dead UNUSED body or an inconclusive stub test keeps its unit and the run unclean; other units stay clean", async () => {
    await withStore(async (store, dir) => {
      const { repo, head } = checkout();
      const result = await backfill(repo, head, store, dir, fakeRunners(repo, [check({
        attempt: "rule_violation",
        functions: [fn(UNIT_A, "f", "pass"), fn(UNIT_B, "f", "pass")],
        units: covered(UNIT_A, UNIT_B),
        files: [SRC_A, SRC_B],
        violations: [{ kind: "dead_unused_body", unit: UNIT_A, file: SRC_A, function: "T::emitEffect", line: 3 }],
        unusedChecks: [
          { unit: UNIT_A, file: SRC_A, function: "T::emitEffect", status: "dead", changed: [] },
          { unit: UNIT_B, file: SRC_B, function: "T::rolling", status: "inlined", changed: [{ function: "T::execute" }] },
        ],
      })]));
      expect(result.clean).toBe(false);
      expect(result.problems).toEqual([`dead UNUSED body: T::emitEffect (${SRC_A}:3) — UNUSED functions may only be reconstructed when inlined`]);
      expect(result.units.map((unit) => [unit.unit, unit.clean])).toEqual([[UNIT_A, false], [UNIT_B, true]]);
      expect(latestCleanSteeringBackfillRun(store, "sms")).toBeNull();

      const inconclusive = await backfill(repo, head, store, dir, fakeRunners(repo, [check({
        attempt: "unresolved",
        functions: [fn(UNIT_A, "f", "pass"), fn(UNIT_B, "f", "pass")],
        units: covered(UNIT_A, UNIT_B),
        files: [SRC_A, SRC_B],
        unusedChecks: [{ unit: UNIT_B, file: SRC_B, function: "T::rolling", status: "inconclusive", changed: [], reason: "stub build failed" }],
      })]));
      expect(inconclusive.clean).toBe(false);
      expect(inconclusive.problems).toEqual([`UNUSED stub test inconclusive: T::rolling (${SRC_B}): stub build failed`]);
      expect(inconclusive.units.map((unit) => [unit.unit, unit.clean])).toEqual([[UNIT_A, true], [UNIT_B, false]]);
    });
  });

  test("an out_of_order violation without a unit dirties the unit that compiles its file; an unknown order check dirties its unit", async () => {
    await withStore(async (store, dir) => {
      const { repo, head } = checkout();
      const result = await backfill(repo, head, store, dir, fakeRunners(repo, [check({
        attempt: "rule_violation",
        functions: [fn(UNIT_A, "f", "pass"), fn(UNIT_B, "f", "pass")],
        units: covered(UNIT_A, UNIT_B),
        files: [SRC_A, SRC_B],
        violations: [{ kind: "out_of_order", file: SRC_A, line: 5, class: "TKoopa", owner_unit: "mario/Enemy/Koopa", owner_progress: 0, reason: "blank stub" }],
        orderChecks: [
          { file: SRC_A, line: 5, class: "TKoopa", owner_unit: "mario/Enemy/Koopa", owner_progress: 0, status: "out_of_order", reason: "blank stub" },
          { file: SRC_B, line: 9, class: "TMystery", owner_unit: null, owner_progress: null, status: "unknown", reason: "owner unit unknown" },
        ],
      })]));
      expect(result.clean).toBe(false);
      expect(result.problems.join("; ")).toContain(`out of order: ${SRC_A}:5 uses TKoopa`);
      expect(result.problems.join("; ")).toContain(`order check unknown: TMystery at ${SRC_B}:9`);
      expect(result.units.map((unit) => [unit.unit, unit.clean])).toEqual([[UNIT_A, false], [UNIT_B, false]]);

      // A violation in a file no known unit compiles dirties every unit (fail closed).
      const orphan = await backfill(repo, head, store, dir, fakeRunners(repo, [check({
        attempt: "rule_violation",
        functions: [fn(UNIT_A, "f", "pass"), fn(UNIT_B, "f", "pass")],
        units: covered(UNIT_A, UNIT_B),
        violations: [{ kind: "out_of_order", file: "src/System/MarNameRefGen_Enemy.cpp", line: 5, class: "TKoopa", owner_unit: "mario/Enemy/Koopa" }],
      })]));
      expect(orphan.units.map((unit) => [unit.unit, unit.clean])).toEqual([[UNIT_A, false], [UNIT_B, false]]);
    });
  });

  test("a non-pass attempt that no per-unit finding explains keeps every unit unclean", async () => {
    await withStore(async (store, dir) => {
      const { repo, head } = checkout();
      const result = await backfill(repo, head, store, dir, fakeRunners(repo, [check({
        attempt: "unresolved", functions: [fn(UNIT_A, "f", "pass")], units: covered(UNIT_A),
      })]));
      expect(result.clean).toBe(false);
      expect(result.problems).toEqual(["attempt decision is unresolved"]);
      expect(result.units).toEqual([{ unit: UNIT_A, clean: false, provisional: false, coverage: { built: true, compared: true } }]);
      expect(steeringCoverageFor(store, "sms", UNIT_A)?.clean).toBe(false);
    });
  });

  test("a dead UNUSED body alone makes --apply restore the stub and rebuild its unit", async () => {
    await withStore(async (store, dir) => {
      const { repo, head } = checkout();
      const violated = check({
        attempt: "rule_violation", functions: [fn(UNIT_A, "f", "pass")], units: covered(UNIT_A),
        violations: [{ kind: "dead_unused_body", unit: UNIT_A, file: SRC_A, function: "T::emitEffect" }],
      });
      const runners = fakeRunners(repo, [violated, check({ attempt: "pass", functions: [fn(UNIT_A, "f", "pass")], units: covered(UNIT_A) })], { [SRC_A]: REAL });
      const result = await backfill(repo, head, store, dir, runners, { record: false, apply: true });
      expect(runners.calls.map((args) => args[0])).toEqual(["check", "apply", "check"]);
      expect(result.applied).toBe(true);
      expect(result.touchedUnits).toEqual([UNIT_A]);
      expect(runners.builds).toEqual([["ninja", "-j3", "build/GMSJ01/src/Enemy/a.o", VALIDATION.reportPath]]);
    });
  });

  test("an applied dead UNUSED body is attached to its passing function and kept as a rule rollback", async () => {
    await withStore(async (store, dir) => {
      const { repo, head } = checkout();
      const violated = check({
        attempt: "rule_violation", functions: [fn(UNIT_A, "T::emitEffect", "pass")], units: covered(UNIT_A),
        violations: [{ kind: "dead_unused_body", unit: UNIT_A, file: SRC_A, function: "T::emitEffect", line: 3 }],
      });
      const runners = fakeRunners(repo, [violated, check({ attempt: "pass", functions: [fn(UNIT_A, "T::emitEffect", "pass")], units: covered(UNIT_A) })], { [SRC_A]: REAL });
      const result = await backfill(repo, head, store, dir, runners, { record: false, apply: true });
      expect(result.functions).toEqual([expect.objectContaining({ name: "T::emitEffect", initial: "pass", final: "pass", applied: true })]);
      expect(listSteeringRollbacks(store, "sms").map((row) => [row.symbol, row.rules])).toEqual([["T::emitEffect", ["dead_unused_body"]]]);
      expect(listSteeringBackfill(store, "sms")[0]!.report).toMatchObject({ rules: ["dead_unused_body"], violations: [{ kind: "dead_unused_body", location: `${SRC_A}:3` }] });
    });
  });

  test("rollback events are written when apply rewrites, so a failed rebuild or re-check never loses them", async () => {
    const steered = () => check({ attempt: "steering_located", functions: [fn(UNIT_A, "steer", "steering_located", { groups: ["g1"] })], units: covered(UNIT_A), removable: [{ id: "g1", file: SRC_A }], removableNoncosmetic: ["g1"] });
    await withStore(async (store, dir) => {
      const { repo, head } = checkout();
      const runners = fakeRunners(repo, [steered()], { [SRC_A]: REAL });
      const failingBuild: SteeringBuildRunner = async () => ({ exitCode: 124, stdout: "", stderr: "Command timed out after 1800s: ninja" });
      await expect(backfill(repo, head, store, dir, { ...runners, buildRunner: failingBuild }, { record: false, apply: true })).rejects.toThrow(/ninja exited 124/);
      expect(listSteeringRollbacks(store, "sms").map((row) => [row.symbol, row.status, row.initialVerdict, row.rules])).toEqual([["steer", "rebuild_failed", "steering_located", ["steering"]]]);
      // The operator commits the cleanup and records it: the worker still gets the rollback.
      git(repo, "commit", "-q", "-am", "steering cleanup");
      await backfill(repo, git(repo, "rev-parse", "HEAD"), store, dir, fakeRunners(repo, [check({ attempt: "pass", functions: [fn(UNIT_A, "steer", "pass")], units: covered(UNIT_A) })]));
      expect(steeringPreviousAttempt(store, { gameId: "sms", unit: UNIT_A, symbol: "steer" })).toMatchObject({ decision: "steering_located", analyzed_rev: head, applied: true });
    });
    await withStore(async (store, dir) => {
      const { repo, head } = checkout();
      const runners = fakeRunners(repo, [steered()], { [SRC_A]: REAL });
      const runner: SteeringRunner = async (args, where) => (args[0] === "check" && runners.calls.some((call) => call[0] === "apply")
        ? { exitCode: 124, stdout: "", stderr: "Command timed out after 1800s: check" }
        : runners.runner(args, where));
      await expect(backfill(repo, head, store, dir, { ...runners, runner }, { record: false, apply: true })).rejects.toThrow(/check exited 124/);
      expect(listSteeringRollbacks(store, "sms").map((row) => [row.symbol, row.status])).toEqual([["steer", "recheck_failed"]]);
      expect(steeringPreviousAttempt(store, { gameId: "sms", unit: UNIT_A, symbol: "steer" })?.rules.map((rule) => rule.kind)).toEqual(["steering"]);
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

describe("steering-gate unverified_match", () => {
  test("--record writes unresolved functions as unverified_match; the run is clean and enforce starts", async () => {
    await withStore(async (store, dir) => {
      const { repo, head } = checkout();
      const report = check({
        attempt: "unresolved",
        functions: [fn(UNIT_A, "f", "pass"), fn(UNIT_B, "u", "unresolved", { groups: ["g9"], reasons: ["IR oracle failed for the unit"] })],
        units: covered(UNIT_A, UNIT_B),
        analysis: "incomplete",
        unresolvedGroups: ["g9"],
        incompleteDetails: [issue("unit_oracle_failed", { units: [UNIT_B] })],
        attemptIssues: [issue("unit_oracle_failed", { units: [UNIT_B] }), issue("unresolved_functions", { units: [UNIT_B] }), issue("unresolved_groups", { groups: ["g9"] })],
      });
      const result = await backfill(repo, head, store, dir, fakeRunners(repo, [report]));
      expect(result).toMatchObject({ clean: true, problems: [], unverifiedRecorded: 1 });
      expect(result.unverified.map((row) => row.name)).toEqual(["u"]);
      expect(steeringCoverageFor(store, "sms", UNIT_A)?.clean).toBe(true);
      expect(steeringCoverageFor(store, "sms", UNIT_B)?.clean).toBe(false);
      expect(latestCleanSteeringBackfillRun(store, "sms")?.baselineRev).toBe(head);
      expect(() => assertSteeringGatePreflight(store, { game: enforced, repoRoot: repo, command: "run-loop" })).not.toThrow();
      expect(listUnverifiedMatches(store, "sms")).toEqual([expect.objectContaining({
        unit: UNIT_B, symbol: "u", analyzedRev: head, baseRev: "base000", sourcePath: SRC_B, reasons: ["IR oracle failed for the unit"],
        match: { base: 90, candidate: 100, real_only: 97 },
      })]);
    });
  });

  test("only a certified pass clears a row: an unclean full run or an unlisted row leaves it active; unresolved again reactivates it", async () => {
    await withStore(async (store, dir) => {
      const { repo, head } = checkout();
      const unverified = (unit: string, symbol: string) =>
        recordUnverifiedMatch(store, { gameId: "sms", unit, symbol, analyzedRev: "old", baseRev: "base000", match: { base: null, candidate: 100, real_only: null }, reasons: ["why"] });
      unverified(UNIT_B, "u");
      unverified("gone", "old");
      const active = () => listUnverifiedMatches(store, "sms").map((row) => row.symbol).sort();
      const passing = (extra: Partial<CheckFixture> = {}) =>
        check({ attempt: "pass", functions: [fn(UNIT_A, "f", "pass"), fn(UNIT_B, "u", "pass")], units: covered(UNIT_A, UNIT_B), ...extra });

      expect((await backfill(repo, head, store, dir, fakeRunners(repo, [passing()]), { dryRun: true })).unverifiedCleared).toBe(0);
      // A full run with a link-map gap is not a certificate: u passes in it but stays unverified.
      const gap = await backfill(repo, head, store, dir, fakeRunners(repo, [passing({ attempt: "unresolved", attemptIssues: [issue("unused_map_gap", { units: [UNIT_A] })] })]));
      expect(gap).toMatchObject({ clean: false, unverifiedCleared: 0 });
      expect(active()).toEqual(["old", "u"]);
      // A dead UNUSED body in u's unit leaves u's pass uncertified.
      const dead = await backfill(repo, head, store, dir, fakeRunners(repo, [passing({ attempt: "rule_violation", violations: [{ kind: "dead_unused_body", unit: UNIT_B, file: SRC_B, function: "T::x" }] })]));
      expect(dead).toMatchObject({ clean: false, unverifiedCleared: 0 });
      expect(active()).toEqual(["old", "u"]);

      // A clean full run clears u, which it passes; the row it does not list stays active.
      const clean = await backfill(repo, head, store, dir, fakeRunners(repo, [passing()]));
      expect(clean).toMatchObject({ clean: true, unverifiedCleared: 1 });
      expect(active()).toEqual(["old"]);
      expect(listUnverifiedMatches(store, "sms", { includeCleared: true }).find((row) => row.symbol === "u")).toMatchObject({ clearedBy: `backfill:${head}`, clearedRev: head });

      // Unresolved again: the cleared row is active again with this run's facts.
      const again = check({ attempt: "unresolved", functions: [fn(UNIT_A, "f", "pass"), fn(UNIT_B, "u", "unresolved", { reasons: ["IR oracle failed for the unit"] })], units: covered(UNIT_A, UNIT_B),
        attemptIssues: [issue("unresolved_functions", { units: [UNIT_B] })] });
      expect(await backfill(repo, head, store, dir, fakeRunners(repo, [again]))).toMatchObject({ clean: true, unverifiedRecorded: 1 });
      expect(listUnverifiedMatches(store, "sms").find((row) => row.symbol === "u")).toMatchObject({ analyzedRev: head, clearedAt: null, reasons: ["IR oracle failed for the unit"] });
    });
  });

  test("only a pass measured from the row's trusted base or an ancestor clears it; a later base neither clears nor re-bases it", async () => {
    await withStore(async (store, dir) => {
      // A -> B -> H -> H2: the backfill at H measured from B marks f unresolved (f's unexplained code is in B..H).
      const { repo, head: revA } = checkout();
      const commit = (path: string, text: string, message: string) => {
        writeFileSync(join(repo, path), text);
        git(repo, "commit", "-qam", message);
        return git(repo, "rev-parse", "HEAD");
      };
      const revB = commit(HEADER, "// shared, trusted\n", "trusted base");
      const revH = commit(SRC_B, "int f() { int t = g(); return t + 0; }\n", "f implemented");
      const unresolvedF = () => check({ attempt: "unresolved", functions: [fn(UNIT_B, "f", "unresolved", { reasons: ["IR oracle failed for the unit"] })],
        units: covered(UNIT_B), files: [SRC_B], attemptIssues: [issue("unresolved_functions", { units: [UNIT_B] })] });
      const passF = () => check({ attempt: "pass", functions: [fn(UNIT_B, "f", "pass")], units: covered(UNIT_B), files: [SRC_B] });
      const row = () => listUnverifiedMatches(store, "sms", { includeCleared: true }).find((entry) => entry.symbol === "f");
      const record = (report: unknown, baseRev: string, headRev: string) =>
        backfill(repo, headRev, store, dir, fakeRunners(repo, [report]), { baseRev, functions: ["f"] });

      expect(await record(unresolvedF(), revB, revH)).toMatchObject({ unverifiedRecorded: 1 });
      expect(row()).toMatchObject({ baseRev: revB, analyzedRev: revH, clearedAt: null });

      // H committed, then a cosmetic edit: the code the backfill could not explain is now below the --base H.
      const revH2 = commit(SRC_B, "int f() { int t = g(); return t + 0; }\n\n", "cosmetic");
      // Still unresolved from H: the facts refresh, the trusted base stays B.
      await record(unresolvedF(), revH, revH2);
      expect(row()).toMatchObject({ baseRev: revB, analyzedRev: revH2, clearedAt: null });
      // A clean, certified pass from H (or from a base git cannot place) never clears it.
      for (const baseRev of [revH, "no-such-rev"]) {
        const later = await record(passF(), baseRev, revH2);
        expect(later).toMatchObject({ clean: true, unverifiedCleared: 0 });
        expect(later.unverifiedClearRefused).toEqual([expect.objectContaining({ unit: UNIT_B, symbol: "f", row_base_rev: revB })]);
        expect(row()).toMatchObject({ baseRev: revB, clearedAt: null });
      }

      // Unresolved again from A, an ancestor of B: the comparison covers more, so A becomes the trusted base.
      await record(unresolvedF(), revA, revH2);
      expect(row()).toMatchObject({ baseRev: revA, clearedAt: null });
      expect((await record(passF(), revB, revH2)).unverifiedCleared).toBe(0);
      expect(row()?.clearedAt).toBeNull();

      const certified = await record(passF(), revA, revH2);
      expect(certified).toMatchObject({ clean: true, unverifiedCleared: 1, unverifiedClearRefused: [] });
      expect(row()).toMatchObject({ baseRev: revA, clearedBy: `backfill:${revH2}` });
    });
  });

  test("tool errors, uncovered units and budgets still make the run unclean", async () => {
    await withStore(async (store, dir) => {
      const { repo, head } = checkout();
      const unresolved = fn(UNIT_B, "u", "unresolved");
      const cases = [
        check({ attempt: "unresolved", functions: [unresolved], units: [{ unit: UNIT_B, built: false, compared: false }], attemptIssues: [issue("tool_error", { units: [UNIT_B] }), issue("unresolved_functions")] }),
        check({ attempt: "unresolved", functions: [unresolved], units: covered(UNIT_B), analysis: "incomplete", incompleteDetails: [issue("global", { detail: "budget of 120s exceeded" })], attemptIssues: [issue("global", { detail: "budget of 120s exceeded" }), issue("unresolved_functions")] }),
        check({ attempt: "unresolved", functions: [unresolved], units: covered(UNIT_B), attemptIssues: [issue("unused_map_gap", { units: [UNIT_B] }), issue("unresolved_functions")] }),
      ];
      for (const report of cases) {
        const result = await backfill(repo, head, store, dir, fakeRunners(repo, [report]));
        expect(result.clean).toBe(false);
        expect(result.problems.length).toBeGreaterThan(0);
      }
      // An order-sensitive reduction alone is tolerated (every function unresolved).
      const order = check({ attempt: "unresolved", functions: [unresolved], units: covered(UNIT_B), analysis: "incomplete",
        incompleteDetails: [issue("global", { detail: "order sensitive: forward and reverse reductions differ on g1" })],
        attemptIssues: [issue("global", { detail: "order sensitive: forward and reverse reductions differ on g1" }), issue("unresolved_functions")] });
      expect(await backfill(repo, head, store, dir, fakeRunners(repo, [order]))).toMatchObject({ clean: true, problems: [] });
    });
  });

  test("--apply never removes an unresolved function's groups: they are held, not reported removed, and no rollback is recorded for it or a steering function they hold", async () => {
    await withStore(async (store, dir) => {
      const { repo, head } = checkout();
      // "mixed" is steering-located only through g2, which it shares with the unresolved u: held whole.
      const first = check({
        attempt: "steering_located",
        functions: [fn(UNIT_A, "steer", "steering_located", { groups: ["g1"] }), fn(UNIT_A, "mixed", "steering_located", { groups: ["g2"] }),
          fn(UNIT_A, "u", "unresolved", { groups: ["g2"] })],
        units: covered(UNIT_A),
        removable: [{ id: "g1", file: SRC_A }, { id: "g2", file: SRC_A }],
        removableNoncosmetic: ["g1", "g2"],
      });
      const recheck = check({ attempt: "unresolved", functions: [fn(UNIT_A, "steer", "pass"), fn(UNIT_A, "mixed", "steering_located", { groups: ["g2"] }),
        fn(UNIT_A, "u", "unresolved", { groups: ["g2"] })], units: covered(UNIT_A),
        removable: [{ id: "g2", file: SRC_A }], removableNoncosmetic: ["g2"] });
      const result = await backfill(repo, head, store, dir, fakeRunners(repo, [first, recheck], { [SRC_A]: REAL }), { apply: true });
      expect(result.applied).toBe(true);
      const rows = listSteeringBackfill(store, "sms", UNIT_A);
      expect(rows.find((row) => row.symbol === "steer")?.report.removed_edit_groups).toEqual([expect.objectContaining({ id: "g1" })]);
      const held = rows.find((row) => row.symbol === "u")!;
      expect(held.report.removed_edit_groups).toEqual([]);
      expect(held.report.unexplained_edit_groups).toEqual([expect.objectContaining({ id: "g2", status: "held" })]);
      // Its source was rewritten (steer's g1), but nothing of mixed was: no rule, no rollback event.
      expect(rows.find((row) => row.symbol === "mixed")?.report).toMatchObject({ removed_edit_groups: [], rules: [], applied: false });
      expect(listSteeringRollbacks(store, "sms").map((row) => row.symbol)).toEqual(["steer"]);
      // An apply is provisional: nothing becomes unverified until the commit is recorded.
      expect(listUnverifiedMatches(store, "sms")).toEqual([]);
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
        check({ attempt: "steering_located", functions: [fn(UNIT_A, "steer", "steering_located", { groups: ["g1"] }), fn(UNIT_B, "fine", "pass")], units: covered(UNIT_A, UNIT_B), removable: [{ id: "g1", file: SRC_A }], removableNoncosmetic: ["g1"] }),
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
        check({ attempt: "steering_located", functions: [fn(UNIT_A, "steer", "steering_located", { groups: ["g1"] })], units: covered(UNIT_A), removable: [{ id: "g1", file: SRC_A }], removableNoncosmetic: ["g1"] }),
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
        check({ attempt: "steering_located", functions: [fn(UNIT_A, "steer", "steering_located", { groups: ["g1"] })], units: covered(UNIT_A), removable: [{ id: "g1", file: HEADER }], removableNoncosmetic: ["g1"] }),
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
        check({ attempt: "steering_located", functions: [fn(UNIT_A, "steer", "steering_located", { groups: ["g1"] }), fn(UNIT_B, "other", "steering_located", { groups: ["g2"] })], units: covered(UNIT_A, UNIT_B), removable: [{ id: "g1", file: SRC_A }, { id: "g2", file: SRC_B }], removableNoncosmetic: ["g1", "g2"] }),
      ], { [SRC_A]: REAL, [SRC_B]: REAL });
      await expect(backfill(repo, head, store, dir, runners, { apply: true, unitFilter: "Enemy/a" }))
        .rejects.toThrow(/refuses a scoped --apply: apply reverts behaviour-identical edits in src\/Enemy\/b\.cpp/);
      expect(runners.calls.map((args) => args[0])).toEqual(["check"]);
      expect(readFileSync(join(repo, SRC_A), "utf8")).toBe(STEERED);
      expect(readFileSync(join(repo, SRC_B), "utf8")).toBe(STEERED);
      // A header shared with an out-of-scope unit is refused too.
      const header = fakeRunners(repo, [check({ attempt: "steering_located", functions: [fn(UNIT_A, "steer", "steering_located", { groups: ["g1"] })], units: covered(UNIT_A), removable: [{ id: "g1", file: HEADER }] })]);
      await expect(backfill(repo, head, store, dir, header, { apply: true, unitFilter: "Enemy/a" })).rejects.toThrow(/include\/Enemy\/shared\.h/);
    });
  });

  test("a removable group no steering function claims is not reverted, so it never makes a scoped --apply refuse", async () => {
    await withStore(async (store, dir) => {
      const { repo, head } = checkout();
      const runners = fakeRunners(repo, [
        check({ attempt: "steering_located", functions: [fn(UNIT_A, "steer", "steering_located", { groups: ["g1"] }), fn(UNIT_B, "fine", "pass", { groups: ["g2"] })], units: covered(UNIT_A, UNIT_B),
          removable: [{ id: "g1", file: SRC_A }, { id: "g2", file: SRC_B }, { id: "g3", file: HEADER }], removableNoncosmetic: ["g1", "g2", "g3"] }),
        check({ attempt: "pass", functions: [fn(UNIT_A, "steer", "pass")], units: covered(UNIT_A) }),
      ], { [SRC_A]: REAL });
      const result = await backfill(repo, head, store, dir, runners, { apply: true, unitFilter: "Enemy/a" });
      expect(runners.calls.map((args) => args[0])).toEqual(["check", "apply", "check"]);
      expect(result.touchedUnits).toEqual([UNIT_A]);
      expect(listSteeringBackfill(store, "sms", UNIT_A)[0]!.report.removed_edit_groups).toEqual([expect.objectContaining({ id: "g1" })]);
    });
  });

  test("applies when every reverted edit is in the scoped unit's own files; the other unit's file is untouched", async () => {
    await withStore(async (store, dir) => {
      const { repo, head } = checkout();
      const runners = fakeRunners(repo, [
        check({ attempt: "steering_located", functions: [fn(UNIT_A, "steer", "steering_located", { groups: ["g1"] }), fn(UNIT_B, "fine", "pass")], units: covered(UNIT_A, UNIT_B), removable: [{ id: "g1", file: SRC_A }], removableNoncosmetic: ["g1"] }),
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
      const runners = fakeRunners(repo, [check({ attempt: "steering_located", functions: [fn(UNIT_A, "steer", "steering_located", { groups: ["g1"] })], units: covered(UNIT_A), removable: [{ id: "g1", file: SRC_A }] })], { [SRC_A]: REAL });
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
