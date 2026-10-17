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
} from "@server/core/harness-runtime/run-state/steering.js";
import { listUnverifiedMatches, recordUnverifiedMatch } from "@server/core/harness-runtime/run-state/unverified-matches.js";
import { steeringPreviousAttempt } from "@server/core/agent-catalog/agents/running/worker/previous-attempt.js";
import { assertSteeringGatePreflight } from "@server/core/validation/steering/steering-preflight.js";
import type { SteeringRunner } from "@server/core/validation/steering/steering-check.js";
import type { CommandResult } from "@server/infrastructure/shell";
import { resolveReportPaths, runShardedSteeringBackfill } from "./steering-gate-sharded.js";
import { steeringGateJob, type SteeringBuildRunner } from "./steering-gate.js";

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "steering-gate-sharded-"));
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

const UNIT_A = "Enemy/a";
const UNIT_B = "Enemy/b";
const SRC_A = "src/Enemy/a.cpp";
const SRC_B = "src/Enemy/b.cpp";
const HEADER = "include/Enemy/new.hpp";
const BASE_TEXT = "int f() { return g(); }\n";
const STEERED = "int f() { int t = g(); return t; }\n";

/** Upstream base commit, then the integration HEAD: both sources steered plus a new header. */
function checkout(): { repo: string; base: string; head: string } {
  const repo = tempDir();
  git(repo, "init", "-q", "-b", "main");
  const write = (path: string, text: string) => {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), text);
  };
  write(SRC_A, BASE_TEXT);
  write(SRC_B, BASE_TEXT);
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "upstream");
  const base = git(repo, "rev-parse", "HEAD");
  write(SRC_A, STEERED);
  write(SRC_B, STEERED);
  write(HEADER, "class TNew {};\n");
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "integration");
  REPO = repo;
  return { repo, base, head: git(repo, "rev-parse", "HEAD") };
}

function fn(unit: string, name: string, decision: string, groups: string[] = []) {
  return {
    unit, name, decision, semantic: decision === "pass" ? "clean" : decision === "unresolved" ? "unresolved" : "steering",
    analysis: decision === "unresolved" ? "incomplete" : "complete", audit_label: "x",
    match: { base: 90, candidate: 100, real_only: 97 }, groups, reasons: decision === "pass" ? [] : [`${name}: why`],
  };
}

const HEADER_PSEUDO = { unit: `${HEADER} (no unit)`, built: false, compared: false, builds: {} };
/** The header group every shard repeats: no unit compiles the header, so analysis is incomplete. */
const HEADER_GROUP = {
  id: `${HEADER}@0.0`, file: HEADER, line: 1, status: "unresolved", incomplete: true, units: [], cosmetic: false,
  shapes: ["other"], cand_lines: ["class TNew {};"], base_lines: [], edit_ids: [`${HEADER}#0.0`],
};

interface ShardFixture {
  unit: string;
  source: string;
  functions: ReturnType<typeof fn>[];
  groups?: Array<Record<string, unknown>>;
  headerGroup?: Record<string, unknown>;
  covered?: boolean;
  headRev?: string;
  violations?: Array<Record<string, unknown>>;
  /** Extra decide `attempt_issues` (e.g. a link-map gap); null drops the field (an older checker). */
  issues?: Array<Record<string, unknown>> | null;
  attempt?: string;
  repo?: string;
}

/** The checkout the reports measured; `shard` binds every report to it (edits.repo). */
let REPO = "/unset";

const issue = (category: string, extra: Record<string, unknown> = {}) => ({ category, units: [], groups: [], files: [], detail: "", ...extra });

/** A `check --paths <source> <header>` report as run_shard.sh writes it. */
function shard(base: string, head: string, fixture: ShardFixture) {
  const header = fixture.headerGroup ?? HEADER_GROUP;
  const groups = [...(fixture.groups ?? []), header];
  const byDecision = (kind: string) => fixture.functions.filter((row) => row.decision === kind);
  const unresolvedIds = groups.filter((group) => group.status === "unresolved").map((group) => String(group.id));
  const removableIds = groups.filter((group) => group.status === "removable" && !group.cosmetic).map((group) => String(group.id));
  const headerNoUnit = header.incomplete === true && asArrayLength(header.units) === 0;
  const issues = fixture.issues === null ? undefined : [
    ...(headerNoUnit ? [issue("header_no_unit", { files: [HEADER] }), issue("group_no_unit", { groups: [header.id], files: [HEADER] })] : []),
    ...(byDecision("steering_located").length > 0 ? [issue("steering_functions", { units: [fixture.unit] })] : []),
    ...(byDecision("unresolved").length > 0 ? [issue("unresolved_functions", { units: [fixture.unit] })] : []),
    ...(unresolvedIds.length > 0 ? [issue("unresolved_groups", { groups: unresolvedIds })] : []),
    ...(removableIds.length > 0 ? [issue("removable_noncosmetic", { groups: removableIds })] : []),
    ...(fixture.issues ?? []),
  ];
  return {
    tool: "steering_check",
    version: 1,
    edits: {
      repo: fixture.repo ?? REPO, base_rev: base, head_rev: fixture.headRev ?? head, overlay: false,
      paths: [fixture.source, HEADER], edits_hash: `hash-${fixture.source}`,
      files: [{ path: HEADER, base_exists: false, cand_exists: true }, { path: fixture.source, base_exists: true, cand_exists: true }],
      units: [{ unit: fixture.unit, source: fixture.source, object: `build/GMSJ01/${fixture.source.replace(".cpp", ".o")}` }],
      header_units: { [HEADER]: [] },
    },
    reduce: { analysis: "incomplete", global_incomplete: [], groups },
    decision: {
      attempt: fixture.attempt ?? "unresolved",
      ...(issues ? { attempt_issues: issues } : {}),
      reasons: [`units without a complete MWCC build/comparison: ${HEADER} (no unit) ({})`],
      functions: fixture.functions,
      removable_noncosmetic: groups.filter((group) => group.status === "removable" && !group.cosmetic).map((group) => String(group.id)),
      unresolved_groups: groups.filter((group) => group.status === "unresolved").map((group) => String(group.id)),
      group_statuses: Object.fromEntries(groups.map((group) => [group.id, group.status])),
      probes: fixture.functions.filter((row) => row.decision !== "pass").map((row) => ({ function: `${row.name}()`, symbol: row.name, unit: row.unit, hypotheses: [] })),
      units: [HEADER_PSEUDO, { unit: fixture.unit, built: fixture.covered ?? true, compared: fixture.covered ?? true, builds: {} }],
      violations: fixture.violations ?? [],
      unused_checks: [],
      order_checks: [],
    },
  };
}

function asArrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function writeReports(dir: string, reports: unknown[]): string[] {
  return reports.map((report, index) => {
    const path = join(dir, "runs", `shard${index}`, "batch001.json");
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(report));
    return path;
  });
}

/** `edits` answers each report's own hash (or `staleHash`), `apply` writes `applyWrites` for `--only-paths`, `check` answers queued rechecks. */
function fakeRunners(repo: string, options: {
  applyWrites?: Record<string, string>; rechecks?: unknown[]; staleHash?: boolean; recheckTimeout?: boolean; buildFails?: boolean; applyFailsFor?: string;
} = {}) {
  const calls: string[][] = [];
  const builds: string[][] = [];
  const rechecks = [...(options.rechecks ?? [])];
  const runner: SteeringRunner = async (args) => {
    calls.push(args);
    if (args[0] === "edits") {
      const paths = args.slice(args.indexOf("--paths") + 1, args.indexOf("--json"));
      return { exitCode: 0, stdout: JSON.stringify({ edits_hash: options.staleHash ? "changed" : `hash-${paths[0]}` }), stderr: "" };
    }
    if (args[0] === "apply" && options.applyFailsFor && args.includes(options.applyFailsFor)) return { exitCode: 2, stdout: "", stderr: "edits_hash mismatch" };
    if (args[0] === "apply" && !args.includes("--dry-run")) {
      const only = args.slice(args.indexOf("--only-paths") + 1).filter((arg) => !arg.startsWith("--"));
      for (const [path, text] of Object.entries(options.applyWrites ?? {})) if (only.includes(path)) writeFileSync(join(repo, path), text);
    }
    if (args[0] === "check" && options.recheckTimeout) return { exitCode: 124, stdout: "", stderr: "Command timed out after 1800s: python3 steering_check.py check" };
    if (args[0] === "check") writeFileSync(args[args.indexOf("--out") + 1]!, JSON.stringify(rechecks.shift()));
    return { exitCode: 0, stdout: "", stderr: "" };
  };
  const buildRunner: SteeringBuildRunner = async (command): Promise<CommandResult> => {
    builds.push(command);
    return options.buildFails ? { exitCode: 124, stdout: "", stderr: "Command timed out after 1800s: ninja" } : { exitCode: 0, stdout: "", stderr: "" };
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

function sharded(
  repo: string, base: string, head: string, store: ReturnType<typeof openState> | null, dir: string,
  runners: ReturnType<typeof fakeRunners>, reports: string | string[], extra: Partial<Parameters<typeof runShardedSteeringBackfill>[0]> = {},
) {
  return runShardedSteeringBackfill({
    store, gameId: "sms", repoRoot: repo, baseRev: base, headRev: head, reports, record: true, apply: false, dryRun: false,
    runner: runners.runner, buildRunner: runners.buildRunner, outputDir: join(dir, `out-${Math.random()}`), validation: VALIDATION,
    buildCheck: () => null, ...extra,
  });
}

describe("sharded steering backfill --record", () => {
  test("shards that together cover every changed file and pass record one clean run; header-only analysis is listed, not judged", async () => {
    await withStore(async (store, dir) => {
      const { repo, base, head } = checkout();
      writeReports(dir, [
        shard(base, head, { unit: UNIT_A, source: SRC_A, functions: [fn(UNIT_A, "f__a", "pass")] }),
        shard(base, head, { unit: UNIT_B, source: SRC_B, functions: [fn(UNIT_B, "f__b", "pass")] }),
      ]);
      const runners = fakeRunners(repo);
      const result = await sharded(repo, base, head, store, dir, runners, join(dir, "runs/shard*/batch*.json"));
      expect(result).toMatchObject({ clean: true, problems: [], coverageComplete: true, verified: true, uncoveredFiles: [], full: true });
      // Every report was re-bound to the tree through `edits`; nothing was applied or rebuilt.
      expect(runners.calls.map((args) => args[0])).toEqual(["edits", "edits"]);
      expect(runners.builds).toEqual([]);
      // Header pseudo-units are never units; the header group is listed once with both reports' statuses.
      expect(result.units.map((unit) => [unit.unit, unit.clean])).toEqual([[UNIT_A, true], [UNIT_B, true]]);
      expect(result.sharedGroups).toEqual([expect.objectContaining({ id: `${HEADER}@0.0`, classification: "unanalysed", location: `${HEADER}:1` })]);
      expect(Object.keys(result.sharedGroups[0]!.statuses)).toHaveLength(2);
      expect(result.notes.join(" ")).toContain("not analysed by any report");
      expect(steeringCoverageFor(store, "sms", UNIT_A)).toEqual({ baselineRev: head, clean: true, analyzedRev: head });
      expect(steeringCoverageFor(store, "sms", `${HEADER} (no unit)`)).toBeNull();
      expect(latestCleanSteeringBackfillRun(store, "sms")?.baselineRev).toBe(head);
      expect(() => assertSteeringGatePreflight(store, { game: enforced, repoRoot: repo, command: "run-loop" })).not.toThrow();
    });
  });

  test("an unresolved function is recorded as unverified_match: the full run is clean, enforce starts, the unit stays unclean", async () => {
    await withStore(async (store, dir) => {
      const { repo, base, head } = checkout();
      const unresolvedGroup = { id: `${SRC_B}@0.0`, file: SRC_B, line: 1, status: "unresolved", units: [UNIT_B], shapes: ["temp_alias", "other"], cand_lines: ["int t = g();"], base_lines: [] };
      const reports = writeReports(dir, [
        shard(base, head, { unit: UNIT_A, source: SRC_A, functions: [fn(UNIT_A, "f__a", "pass")] }),
        shard(base, head, { unit: UNIT_B, source: SRC_B, functions: [fn(UNIT_B, "f__b", "unresolved", [`${SRC_B}@0.0`])], groups: [unresolvedGroup] }),
      ]);
      const result = await sharded(repo, base, head, store, dir, fakeRunners(repo), reports);
      expect(result.clean).toBe(true);
      expect(result.problems).toEqual([]);
      expect(result.notes.join(" ")).toContain("unverified_match (unresolved; recorded, not done): f__b (without steering: 97%)");
      expect(result.unverified.map((row) => row.name)).toEqual(["f__b"]);
      expect(result.unverifiedRecorded).toBe(1);
      // The unit with the unverified function never authorizes a claim shortcut.
      expect(result.units.map((unit) => [unit.unit, unit.clean])).toEqual([[UNIT_A, true], [UNIT_B, false]]);
      expect(steeringCoverageFor(store, "sms", UNIT_B)?.clean).toBe(false);
      // A clean full run is recorded and the enforce preflight accepts it.
      expect(latestCleanSteeringBackfillRun(store, "sms")?.baselineRev).toBe(head);
      expect(() => assertSteeringGatePreflight(store, { game: enforced, repoRoot: repo, command: "run-loop" })).not.toThrow();
      const row = listSteeringBackfill(store, "sms", UNIT_B)[0]!;
      expect(row.report).toMatchObject({ decision: "unresolved", applied: false, provisional: false, reasons: ["f__b: why"], removed_edit_groups: [], probe: { symbol: "f__b" } });
      expect(row.report.unexplained_edit_groups).toEqual([expect.objectContaining({ id: `${SRC_B}@0.0`, status: "unresolved", location: `${SRC_B}:1` })]);
      const [state] = listUnverifiedMatches(store, "sms");
      expect(state).toMatchObject({
        unit: UNIT_B, symbol: "f__b", analyzedRev: head, baseRev: base, sourcePath: SRC_B, reasons: ["f__b: why"],
        match: { base: 90, candidate: 100, real_only: 97 }, clearedAt: null,
      });
      expect(state!.functionSourceSha).toMatch(/^[0-9a-f]{64}$/);
      // The next record run that passes it clears the state.
      writeReports(dir, [
        shard(base, head, { unit: UNIT_A, source: SRC_A, functions: [fn(UNIT_A, "f__a", "pass")] }),
        shard(base, head, { unit: UNIT_B, source: SRC_B, functions: [fn(UNIT_B, "f__b", "pass")] }),
      ]);
      const again = await sharded(repo, base, head, store, dir, fakeRunners(repo), reports);
      expect(again).toMatchObject({ clean: true, unverifiedCleared: 1 });
      expect(listUnverifiedMatches(store, "sms")).toEqual([]);
      expect(listUnverifiedMatches(store, "sms", { includeCleared: true })[0]).toMatchObject({ clearedBy: `backfill:${head}` });
    });
  });

  test("an unverified function does not excuse anything else: a link-map gap or a budget keeps the run unclean and clears nothing", async () => {
    await withStore(async (store, dir) => {
      const { repo, base, head } = checkout();
      const unresolvedB = fn(UNIT_B, "f__b", "unresolved");
      // f__a was unverified before; "old" is a row no report lists.
      for (const [unit, symbol] of [[UNIT_A, "f__a"], ["gone", "old"]] as const) {
        recordUnverifiedMatch(store, { gameId: "sms", unit, symbol, analyzedRev: "before", baseRev: base, match: { base: null, candidate: 100, real_only: null }, reasons: [] });
      }
      const active = () => listUnverifiedMatches(store, "sms").map((row) => row.symbol).sort();
      const gap = writeReports(dir, [
        shard(base, head, { unit: UNIT_A, source: SRC_A, functions: [fn(UNIT_A, "f__a", "pass")] }),
        shard(base, head, { unit: UNIT_B, source: SRC_B, functions: [unresolvedB], issues: [issue("unused_map_gap", { units: [UNIT_B], detail: "Enemy/b (no map)" })] }),
      ]);
      const mapGap = await sharded(repo, base, head, store, dir, fakeRunners(repo), gap);
      expect(mapGap.clean).toBe(false);
      expect(mapGap.problems.join("; ")).toContain("unused_map_gap");
      // f__a passes, but in an unclean run: not a certificate, so it stays unverified.
      expect(mapGap.unverifiedCleared).toBe(0);
      expect(active()).toEqual(["f__a", "f__b", "old"]);

      const budget = shard(base, head, { unit: UNIT_B, source: SRC_B, functions: [unresolvedB], issues: [issue("global", { detail: "budget of 120s exceeded" })] });
      (budget.reduce as Record<string, unknown>).global_incomplete = ["budget of 120s exceeded"];
      const budgetReports = writeReports(dir, [shard(base, head, { unit: UNIT_A, source: SRC_A, functions: [fn(UNIT_A, "f__a", "pass")] }), budget]);
      const overBudget = await sharded(repo, base, head, store, dir, fakeRunners(repo), budgetReports);
      expect(overBudget.clean).toBe(false);
      expect(overBudget.problems.join("; ")).toContain("reduction incomplete");
      expect(overBudget.unverifiedCleared).toBe(0);

      // Order sensitivity alone (every function of the report unresolved) is tolerated.
      const order = shard(base, head, { unit: UNIT_B, source: SRC_B, functions: [unresolvedB], issues: [issue("global", { detail: "order sensitive: forward and reverse reductions differ on x" })] });
      (order.reduce as Record<string, unknown>).global_incomplete = ["order sensitive: forward and reverse reductions differ on x"];
      const orderReports = writeReports(dir, [shard(base, head, { unit: UNIT_A, source: SRC_A, functions: [fn(UNIT_A, "f__a", "pass")] }), order]);
      const orderSensitive = await sharded(repo, base, head, store, dir, fakeRunners(repo), orderReports);
      expect(orderSensitive).toMatchObject({ clean: true, problems: [] });
      expect(orderSensitive.notes.join(" ")).toContain("reduction order-sensitive");
      // The clean run certifies f__a's pass; the row no report lists stays active.
      expect(orderSensitive.unverifiedCleared).toBe(1);
      expect(active()).toEqual(["f__b", "old"]);
    });
  });

  test("reports that miss a changed file, or a failed shard, record no backfill run", async () => {
    await withStore(async (store, dir) => {
      const { repo, base, head } = checkout();
      const [onlyA] = writeReports(dir, [shard(base, head, { unit: UNIT_A, source: SRC_A, functions: [fn(UNIT_A, "f__a", "pass")] })]);
      const missing = await sharded(repo, base, head, store, dir, fakeRunners(repo), [onlyA!]);
      expect(missing).toMatchObject({ clean: false, coverageComplete: false, uncoveredFiles: [SRC_B], full: false });
      expect(missing.problems.join("; ")).toContain(`changed files no report covers: ${SRC_B}`);
      expect(store.db.query("SELECT COUNT(*) AS n FROM steering_backfill_runs").get()).toEqual({ n: 0 });

      writeFileSync(join(dirname(onlyA!), "batch002.failed.json"), "{}");
      const failed = await sharded(repo, base, head, store, dir, fakeRunners(repo), [onlyA!]);
      expect(failed.failedReports).toEqual([join(dirname(onlyA!), "batch002.failed.json")]);
      expect(failed.problems.join("; ")).toContain("failed shards (no report)");
      expect(store.db.query("SELECT COUNT(*) AS n FROM steering_backfill_runs").get()).toEqual({ n: 0 });
    });
  });

  test("refuses overlapping shards, reports of another HEAD, and reports whose edits_hash no longer matches the tree", async () => {
    await withStore(async (store, dir) => {
      const { repo, base, head } = checkout();
      const twice = writeReports(dir, [
        shard(base, head, { unit: UNIT_A, source: SRC_A, functions: [fn(UNIT_A, "f__a", "pass")] }),
        shard(base, head, { unit: UNIT_A, source: SRC_A, functions: [fn(UNIT_A, "f__a", "pass")] }),
      ]);
      await expect(sharded(repo, base, head, store, dir, fakeRunners(repo), twice)).rejects.toThrow(/reports overlap on src\/Enemy\/a\.cpp/);
      const other = writeReports(join(dir, "other"), [shard(base, head, { unit: UNIT_A, source: SRC_A, functions: [], headRev: base })]);
      await expect(sharded(repo, base, head, store, dir, fakeRunners(repo), other)).rejects.toThrow(/checked HEAD .* rerun that shard/);
      const stale = writeReports(join(dir, "stale"), [shard(base, head, { unit: UNIT_A, source: SRC_A, functions: [fn(UNIT_A, "f__a", "pass")] })]);
      await expect(sharded(repo, base, head, store, dir, fakeRunners(repo, { staleHash: true }), stale)).rejects.toThrow(/no longer match the working tree/);
      expect(store.db.query("SELECT COUNT(*) AS n FROM steering_backfill").get()).toEqual({ n: 0 });
    });
  });

  test("a sharded full run judges like one unscoped report: a removable group left in a source keeps its unit unclean", async () => {
    await withStore(async (store, dir) => {
      const { repo, base, head } = checkout();
      const removable = { id: `${SRC_A}@0.0`, file: SRC_A, line: 1, status: "removable", units: [UNIT_A], cosmetic: false, shapes: ["temp_alias"], cand_lines: ["int t = g();", "return t;"], base_lines: ["return g();"] };
      const reports = writeReports(dir, [
        shard(base, head, { unit: UNIT_A, source: SRC_A, functions: [fn(UNIT_A, "f__a", "steering_located", [`${SRC_A}@0.0`])], groups: [removable] }),
        shard(base, head, { unit: UNIT_B, source: SRC_B, functions: [fn(UNIT_B, "f__b", "pass")] }),
      ]);
      const result = await sharded(repo, base, head, store, dir, fakeRunners(repo), reports);
      expect(result.clean).toBe(false);
      expect(result.problems.join("; ")).toContain("steering located in f__a");
      expect(result.units.map((unit) => [unit.unit, unit.clean])).toEqual([[UNIT_A, false], [UNIT_B, true]]);
      // The worker-facing outcome: the removed steering group with file:line and short text.
      expect(listSteeringBackfill(store, "sms", UNIT_A)[0]!.report).toMatchObject({
        decision: "steering_located",
        match: { base: 90, candidate: 100, real_only: 97 },
        removed_edit_groups: [{ id: `${SRC_A}@0.0`, location: `${SRC_A}:1`, shapes: ["temp_alias"], text: "int t = g(); / return t;", restored: "return g();" }],
      });
    });
  });
});

describe("sharded certification needs the attempt, not only the function rows", () => {
  test("missing link-map coverage for the UNUSED rule keeps its unit and the run unclean although every function passes", async () => {
    await withStore(async (store, dir) => {
      const { repo, base, head } = checkout();
      const reports = writeReports(dir, [
        shard(base, head, { unit: UNIT_A, source: SRC_A, functions: [fn(UNIT_A, "f__a", "pass")] }),
        shard(base, head, { unit: UNIT_B, source: SRC_B, functions: [fn(UNIT_B, "f__b", "pass")], issues: [issue("unused_map_gap", { units: [UNIT_B], detail: "Enemy/b (link map unavailable)" })] }),
      ]);
      const result = await sharded(repo, base, head, store, dir, fakeRunners(repo), reports);
      expect(result.functions.every((row) => row.final === "pass")).toBe(true);
      expect(result.clean).toBe(false);
      expect(result.problems).toEqual([`batch001.json: attempt unresolved: unused_map_gap (${UNIT_B}): Enemy/b (link map unavailable)`]);
      expect(result.units.map((unit) => [unit.unit, unit.clean])).toEqual([[UNIT_A, true], [UNIT_B, false]]);
      // The header-only residual alone is listed, not judged.
      expect(result.notes.join(" ")).toContain(`header residual (changed files no unit compiles; listed, not judged): ${HEADER}`);
      expect(latestCleanSteeringBackfillRun(store, "sms")).toBeNull();
    });
  });

  test("a shadow-root tool error, or a non-pass report without attempt_issues, is never certified", async () => {
    await withStore(async (store, dir) => {
      const { repo, base, head } = checkout();
      const reports = writeReports(dir, [
        shard(base, head, { unit: UNIT_A, source: SRC_A, functions: [fn(UNIT_A, "f__a", "pass")], issues: [issue("tool_error", { units: [UNIT_A], detail: "shadow-root path too long: MWCC opened a truncated include name 'fdlibm.'" })] }),
        shard(base, head, { unit: UNIT_B, source: SRC_B, functions: [fn(UNIT_B, "f__b", "pass")], issues: null }),
      ]);
      const result = await sharded(repo, base, head, store, dir, fakeRunners(repo), reports);
      expect(result.clean).toBe(false);
      expect(result.problems.join("\n")).toContain("tool_error (Enemy/a): shadow-root path too long");
      expect(result.problems.join("\n")).toContain("without structured attempt_issues (the report predates them); rerun the shard");
      expect(result.units.map((unit) => unit.clean)).toEqual([false, false]);
    });
  });

  test("refuses a report that measured another checkout before writing anything", async () => {
    await withStore(async (store, dir) => {
      const { repo, base, head } = checkout();
      const reports = writeReports(dir, [shard(base, head, { unit: UNIT_A, source: SRC_A, functions: [fn(UNIT_A, "f__a", "pass")], repo: tempDir() })]);
      const runners = fakeRunners(repo);
      await expect(sharded(repo, base, head, store, dir, runners, reports, { apply: true })).rejects.toThrow(/measured repo .* not --repo/);
      expect(runners.calls).toEqual([]);
    });
  });
});

describe("sharded --apply rebuild and timeouts", () => {
  const removable = { id: `${SRC_A}@0.0`, file: SRC_A, line: 1, status: "removable", units: [UNIT_A], cosmetic: false, shapes: ["temp_alias"], cand_lines: ["int t = g();"], base_lines: ["return g();"] };
  const steered = (base: string, head: string) => shard(base, head, { unit: UNIT_A, source: SRC_A, functions: [fn(UNIT_A, "f__a", "steering_located", [`${SRC_A}@0.0`])], groups: [removable] });

  test("refuses a sandbox-generated build.ninja before writing anything", async () => {
    await withStore(async (store, dir) => {
      const { repo, base, head } = checkout();
      writeFileSync(join(repo, "build.ninja"), "rule mwcc\n  command = /work/sms/build/compilers/mwcceppc.exe $in\n");
      const reports = writeReports(dir, [steered(base, head)]);
      const runners = fakeRunners(repo, { applyWrites: { [SRC_A]: BASE_TEXT } });
      await expect(sharded(repo, base, head, store, dir, runners, reports, { record: false, apply: true, buildCheck: undefined }))
        .rejects.toThrow(/refuses before writing anything: .*\(\/work\/sms\).*configure\.py/);
      expect(runners.calls).toEqual([]);
      expect(readFileSync(join(repo, SRC_A), "utf8")).toBe(STEERED);
    });
  });

  test("--rebuild none skips ninja; a timed-out re-check leaves the function unresolved, never a pass", async () => {
    await withStore(async (store, dir) => {
      const { repo, base, head } = checkout();
      const reports = writeReports(dir, [steered(base, head)]);
      const runners = fakeRunners(repo, { applyWrites: { [SRC_A]: BASE_TEXT }, recheckTimeout: true });
      const result = await sharded(repo, base, head, store, dir, runners, reports, { record: false, apply: true, rebuild: "none" });
      expect(runners.builds).toEqual([]);
      expect(result.recheckFailures).toEqual([{ report: reports[0]!, error: expect.stringContaining("timed out") }]);
      expect(result.functions).toEqual([expect.objectContaining({ name: "f__a", final: "unresolved", applied: false })]);
      expect(result.problems.join("\n")).toContain("re-check failed (functions left unresolved)");
      const row = listSteeringBackfill(store, "sms", UNIT_A)[0]!;
      expect(row).toMatchObject({ verdict: "unresolved", applied: false });
      expect(row.report.final_reasons).toEqual([expect.stringMatching(/^re-check failed \(counted unresolved\): .*timed out/)]);
      // The rollback event was written at rewrite time and survives the failed re-check; the worker still sees it.
      expect(listSteeringRollbacks(store, "sms").map((event) => [event.symbol, event.status, event.finalVerdict])).toEqual([["f__a", "recheck_failed", "unresolved"]]);
      expect(steeringPreviousAttempt(store, { gameId: "sms", unit: UNIT_A, symbol: "f__a" })?.rules.map((rule) => rule.kind)).toEqual(["steering"]);
    });
  });
});

describe("sharded rollback events are written when the source is rewritten", () => {
  const removableIn = (src: string, unit: string) => ({ id: `${src}@0.0`, file: src, line: 1, status: "removable", units: [unit], cosmetic: false, shapes: ["temp_alias"], cand_lines: ["int t = g();"], base_lines: ["return g();"] });
  const steeredShard = (base: string, head: string, unit: string, src: string, name: string) =>
    shard(base, head, { unit, source: src, functions: [fn(unit, name, "steering_located", [`${src}@0.0`])], groups: [removableIn(src, unit)] });

  test("a rebuild that fails after the rewrite keeps every report's events; commit + record still leaves the worker its block", async () => {
    await withStore(async (store, dir) => {
      const { repo, base, head } = checkout();
      const reports = writeReports(dir, [steeredShard(base, head, UNIT_A, SRC_A, "f__a"), steeredShard(base, head, UNIT_B, SRC_B, "f__b")]);
      const runners = fakeRunners(repo, { applyWrites: { [SRC_A]: BASE_TEXT, [SRC_B]: BASE_TEXT }, buildFails: true });
      await expect(sharded(repo, base, head, store, dir, runners, reports, { record: false, apply: true })).rejects.toThrow(/ninja exited 124/);
      expect(listSteeringRollbacks(store, "sms").map((event) => [event.symbol, event.status, event.analyzedRev])).toEqual([["f__a", "rebuild_failed", head], ["f__b", "rebuild_failed", head]]);

      git(repo, "commit", "-q", "-am", "steering cleanup");
      const cleaned = git(repo, "rev-parse", "HEAD");
      const recorded = writeReports(join(dir, "after"), [
        shard(base, cleaned, { unit: UNIT_A, source: SRC_A, functions: [fn(UNIT_A, "f__a", "pass")] }),
        shard(base, cleaned, { unit: UNIT_B, source: SRC_B, functions: [fn(UNIT_B, "f__b", "pass")] }),
      ]);
      expect((await sharded(repo, base, cleaned, store, dir, fakeRunners(repo), recorded)).clean).toBe(true);
      const attempt = steeringPreviousAttempt(store, { gameId: "sms", unit: UNIT_B, symbol: "f__b" });
      expect(attempt).toMatchObject({ decision: "steering_located", analyzed_rev: head, applied: true });
      expect(attempt!.removed_edits[0]).toMatchObject({ file: SRC_B, line: 1 });
    });
  });

  test("when shard N's apply fails, shards 1..N-1 keep their events", async () => {
    await withStore(async (store, dir) => {
      const { repo, base, head } = checkout();
      const reports = writeReports(dir, [steeredShard(base, head, UNIT_A, SRC_A, "f__a"), steeredShard(base, head, UNIT_B, SRC_B, "f__b")]);
      const runners = fakeRunners(repo, { applyWrites: { [SRC_A]: BASE_TEXT, [SRC_B]: BASE_TEXT }, applyFailsFor: reports[1]! });
      await expect(sharded(repo, base, head, store, dir, runners, reports, { record: false, apply: true })).rejects.toThrow(/apply exited 2/);
      expect(listSteeringRollbacks(store, "sms").map((event) => [event.symbol, event.status])).toEqual([["f__a", "rewritten"]]);
      expect(steeringPreviousAttempt(store, { gameId: "sms", unit: UNIT_A, symbol: "f__a" })?.rules.map((rule) => rule.kind)).toEqual(["steering"]);
    });
  });
});

describe("rule rollbacks reach the next worker through apply -> commit -> re-check -> record", () => {
  test("a dead UNUSED body in a passing function is applied, kept as rollback history, and still rendered after the record", async () => {
    await withStore(async (store, dir) => {
      const { repo, base, head } = checkout();
      const violation = { kind: "dead_unused_body", unit: UNIT_A, file: SRC_A, function: "f__a", line: 1 };
      const reports = writeReports(dir, [
        shard(base, head, { unit: UNIT_A, source: SRC_A, functions: [fn(UNIT_A, "f__a", "pass", [`${SRC_A}@0.0`])], violations: [violation], issues: [issue("dead_unused_body", { units: [UNIT_A], files: [SRC_A] })], attempt: "rule_violation" }),
        shard(base, head, { unit: UNIT_B, source: SRC_B, functions: [fn(UNIT_B, "f__b", "pass")] }),
      ]);
      const recheck = shard(base, head, { unit: UNIT_A, source: SRC_A, functions: [fn(UNIT_A, "f__a", "pass")] });
      const applyResult = await sharded(repo, base, head, store, dir, fakeRunners(repo, { applyWrites: { [SRC_A]: BASE_TEXT }, rechecks: [recheck] }), reports, { record: false, apply: true });
      expect(applyResult.functions.find((row) => row.name === "f__a")).toMatchObject({ initial: "pass", final: "pass", applied: true });
      const [rollback] = listSteeringRollbacks(store, "sms");
      expect(rollback).toMatchObject({ unit: UNIT_A, symbol: "f__a", analyzedRev: head, initialVerdict: "pass", finalVerdict: "pass", rules: ["dead_unused_body"] });
      expect(rollback!.report).toMatchObject({ violations: [{ kind: "dead_unused_body", location: `${SRC_A}:1`, function: "f__a" }] });

      // The operator commits the cleanup, re-runs the shards on the new HEAD and records them.
      git(repo, "commit", "-q", "-am", "steering cleanup");
      const cleaned = git(repo, "rev-parse", "HEAD");
      const recorded = writeReports(join(dir, "after"), [
        shard(base, cleaned, { unit: UNIT_A, source: SRC_A, functions: [fn(UNIT_A, "f__a", "pass")] }),
        shard(base, cleaned, { unit: UNIT_B, source: SRC_B, functions: [fn(UNIT_B, "f__b", "pass")] }),
      ]);
      const record = await sharded(repo, base, cleaned, store, dir, fakeRunners(repo), recorded);
      expect(record.clean).toBe(true);
      expect(listSteeringBackfill(store, "sms", UNIT_A)[0]).toMatchObject({ verdict: "pass", applied: false, analyzedRev: cleaned });
      const attempt = steeringPreviousAttempt(store, { gameId: "sms", unit: UNIT_A, symbol: "f__a" });
      expect(attempt).toMatchObject({ decision: "rule_violation", analyzed_rev: head, applied: true });
      expect(attempt!.rules.map((rule) => rule.name)).toEqual(["UNUSED-only-when-inlined"]);
    });
  });
});

describe("sharded steering backfill --apply", () => {
  test("applies each report to its own sources only, never to shared headers; rebuilds, re-checks and records provisionally", async () => {
    await withStore(async (store, dir) => {
      const { repo, base, head } = checkout();
      recordStackOnlyFunction(store, { gameId: "sms", unit: UNIT_A, symbol: "f__a", fuzzy: 99, source: "backfill" });
      recordStackOnlyFunction(store, { gameId: "sms", unit: UNIT_B, symbol: "f__b", fuzzy: 98, source: "backfill" });
      const removable = { id: `${SRC_A}@0.0`, file: SRC_A, line: 1, status: "removable", units: [UNIT_A], cosmetic: false, shapes: ["temp_alias"], cand_lines: ["int t = g();"], base_lines: ["return g();"] };
      // Shard 0 also found a steering edit in the shared header (it has a unit there); the sharded apply leaves it.
      const headerSteering = { ...HEADER_GROUP, status: "removable", incomplete: false, units: [UNIT_A] };
      const reports = writeReports(dir, [
        shard(base, head, { unit: UNIT_A, source: SRC_A, functions: [fn(UNIT_A, "f__a", "steering_located", [`${SRC_A}@0.0`])], groups: [removable], headerGroup: headerSteering }),
        shard(base, head, { unit: UNIT_B, source: SRC_B, functions: [fn(UNIT_B, "f__b", "pass")] }),
      ]);
      const recheck = shard(base, head, { unit: UNIT_A, source: SRC_A, functions: [{ ...fn(UNIT_A, "f__a", "pass"), match: { base: 90, candidate: 97, real_only: 97 } }] });
      const runners = fakeRunners(repo, { applyWrites: { [SRC_A]: BASE_TEXT, [HEADER]: "// must never be written\n" }, rechecks: [recheck] });
      const result = await sharded(repo, base, head, store, dir, runners, reports, {
        record: false, apply: true, checkOptions: { budgetSeconds: 3600, maxGroups: 4000 },
      });
      const applies = runners.calls.filter((args) => args[0] === "apply");
      expect(applies).toEqual([["apply", "--report", reports[0]!, "--only-paths", SRC_A]]);
      expect(readFileSync(join(repo, SRC_A), "utf8")).toBe(BASE_TEXT);
      expect(readFileSync(join(repo, HEADER), "utf8")).toBe("class TNew {};\n");
      expect(runners.builds).toEqual([["ninja", "-j3", "build/GMSJ01/src/Enemy/a.o", "build/GMSJ01/report.json"]]);
      const check = runners.calls.find((args) => args[0] === "check")!;
      expect(check.slice(check.indexOf("--paths"), check.indexOf("--json"))).toEqual(["--paths", SRC_A, HEADER, "--budget-seconds", "3600", "--max-groups", "4000"]);
      expect(result).toMatchObject({ applied: true, clean: false, touchedFiles: [SRC_A], touchedUnits: [UNIT_A], stackOnlyCleared: 1 });
      expect(result.sharedGroups).toEqual([expect.objectContaining({ classification: "steering", units: [UNIT_A] })]);
      expect(result.problems.join("; ")).toContain(`shared files that the sharded apply never writes: ${HEADER}:1`);
      expect(listStackOnlyFunctions(store, "sms").map((row) => row.symbol)).toEqual(["f__b"]);
      const row = listSteeringBackfill(store, "sms", UNIT_A)[0]!;
      expect(row).toMatchObject({ verdict: "pass", applied: true, appliedRev: null });
      expect(row.report).toMatchObject({
        initial: "steering_located", decision: "pass", applied: true, provisional: true,
        final_match: { candidate: 97 }, removed_edit_groups: [{ location: `${SRC_A}:1`, text: "int t = g();" }],
        recheck: result.recheckPaths[0],
      });
      expect(steeringCoverageFor(store, "sms", UNIT_A)?.clean).toBe(false);
      expect(store.db.query("SELECT COUNT(*) AS n FROM steering_backfill_runs").get()).toEqual({ n: 0 });
    });
  });

  test("a shard whose revert leaves a unit uncompilable is refused (named, checkout unchanged); nothing is rebuilt or re-checked for it", async () => {
    await withStore(async (store, dir) => {
      const { repo, base, head } = checkout();
      const removable = { id: `${SRC_A}@0.0`, file: SRC_A, line: 1, status: "removable", units: [UNIT_A], cosmetic: false, shapes: ["temp_alias"], cand_lines: ["int t = g();"], base_lines: ["return g();"] };
      const reports = writeReports(dir, [
        shard(base, head, { unit: UNIT_A, source: SRC_A, functions: [fn(UNIT_A, "f__a", "steering_located", [`${SRC_A}@0.0`])], groups: [removable] }),
        shard(base, head, { unit: UNIT_B, source: SRC_B, functions: [fn(UNIT_B, "f__b", "pass")] }),
      ]);
      const runners = fakeRunners(repo);
      const before = readFileSync(join(repo, SRC_A), "utf8");
      const failure = { unit: UNIT_A, object: "build/GMSJ01/src/Enemy/a.o", output: "error: undefined identifier 't'" };
      const inner = runners.runner;
      const verifies: unknown[] = [];
      const runner: typeof inner = async (args, where, call) => {
        if (args[0] !== "apply") return inner(args, where, call);
        verifies.push(call?.verify);
        return { exitCode: 4, stdout: "", stderr: "apply refused", compile: { ok: false, changed: [SRC_A], objects: [failure.object], failures: [failure], unowned: [] } };
      };
      const result = await sharded(repo, base, head, store, dir, { ...runners, runner }, reports, { record: false, apply: true });
      expect(verifies).toHaveLength(1);
      expect((verifies[0] as { owners: Record<string, unknown> }).owners[SRC_A]).toEqual([{ unit: UNIT_A, object: "build/GMSJ01/src/Enemy/a.o" }]);
      expect(result.applied).toBe(false);
      expect(result.applyRefusals).toEqual([{ ok: false, changed: [SRC_A], objects: [failure.object], failures: [failure], unowned: [], report: reports[0] }]);
      expect(result.problems.join("; ")).toContain(`apply refused: 1 unit(s) no longer compile after the revert: ${UNIT_A}`);
      expect(readFileSync(join(repo, SRC_A), "utf8")).toBe(before);
      expect(runners.builds).toEqual([]);
      expect(runners.calls.filter((args) => args[0] === "check")).toEqual([]);
      expect(result.nextSteps.join(" ")).toContain("Refused applies left the checkout unchanged");
    });
  });

  test("--dry-run passes --dry-run to every apply and writes nothing", async () => {
    await withStore(async (store, dir) => {
      const { repo, base, head } = checkout();
      const removable = { id: `${SRC_A}@0.0`, file: SRC_A, line: 1, status: "removable", units: [UNIT_A], shapes: [], cand_lines: [], base_lines: [] };
      const reports = writeReports(dir, [shard(base, head, { unit: UNIT_A, source: SRC_A, functions: [fn(UNIT_A, "f__a", "steering_located", [`${SRC_A}@0.0`])], groups: [removable] })]);
      const runners = fakeRunners(repo, { applyWrites: { [SRC_A]: BASE_TEXT } });
      await sharded(repo, base, head, null, dir, runners, reports, { record: false, apply: true, dryRun: true });
      expect(runners.calls).toEqual([["apply", "--report", reports[0]!, "--only-paths", SRC_A, "--dry-run"]]);
      expect(runners.builds).toEqual([]);
      expect(readFileSync(join(repo, SRC_A), "utf8")).toBe(STEERED);
      expect(store.db.query("SELECT COUNT(*) AS n FROM steering_backfill").get()).toEqual({ n: 0 });
    });
  });
});

describe("--from-reports resolution and job flags", () => {
  test("a glob skips *.failed.json and reports it", () => {
    const dir = tempDir();
    for (const name of ["shard0/batch001.json", "shard0/batch002.failed.json", "shard1/batch001.json", "cache/x.json"]) {
      mkdirSync(dirname(join(dir, name)), { recursive: true });
      writeFileSync(join(dir, name), "{}");
    }
    expect(resolveReportPaths(`${dir}/shard*/batch*.json`, "/")).toEqual({
      reports: [join(dir, "shard0/batch001.json"), join(dir, "shard1/batch001.json")],
      failed: [join(dir, "shard0/batch002.failed.json")],
    });
    expect(resolveReportPaths(join(dir, "shard1"), "/").reports).toEqual([join(dir, "shard1/batch001.json")]);
  });

  test("--from-reports refuses an extra --paths scope", async () => {
    const { repo } = checkout();
    const globals = { game: resolveGame({ gameId: "sms" }), gameId: "sms", repoRoot: repo, stateDir: tempDir(), dryRunAgents: true, model: "m", provider: "p", thinkingLevel: "low" };
    const args = new Map<string, string | true>([["--base", "HEAD~1"], ["--repo", repo], ["--from-reports", "x.json"], ["--paths", SRC_A], ["--dry-run", true]]);
    await expect(steeringGateJob(globals as never, args)).rejects.toThrow(/drop --paths/);
  });
});
