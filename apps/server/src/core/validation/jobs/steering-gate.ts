import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { booleanArg, stringArg, type GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import { gameBuildLayout, type GameBuildValidation } from "@server/core/game-registry/build-layout.js";
import { packageRoot } from "@server/core/knowledge";
import { openState } from "@server/core/harness-runtime/run-state";
import type { StateStore } from "@server/core/orchestrator-state";
import { clearStackOnlyFunction } from "@server/core/harness-runtime/run-state/stack-only-functions.js";
import {
  recordSteeringBackfill,
  recordSteeringBackfillRun,
  recordSteeringCoverage,
} from "@server/core/harness-runtime/run-state/steering.js";
import { steeringGateActive } from "@server/core/tools/steering-gate.js";
import {
  STEERING_CHECK_TOOLPACK_PATH,
  hostSteeringRunner,
  parseSteeringDecision,
  steeringCertificateContext,
  steeringCertificateProblems,
  unitCovered,
  type SteeringDecision,
  type SteeringFunctionDecision,
  type SteeringRunner,
} from "@server/core/validation/steering/steering-check.js";
import { runCommand, type CommandResult } from "@server/infrastructure/shell";

/**
 * Backfill for steering-gated games (plan 3.6). Runs `steering_check.py
 * check` on a built checkout against `--base`.
 *
 * - `--record` certifies the checkout's HEAD itself, so it needs a clean
 *   `src/ include/ libs/` working tree. It writes `steering_backfill` rows,
 *   per-unit coverage and, for a full run (no `--unit`/`--function`), a
 *   backfill run: the enforce-mode run preflight's prerequisite.
 * - `--apply` writes S*, rebuilds the touched units' objects and
 *   `report.json`, re-checks, and records the result as provisional
 *   (applied rows, unclean coverage, no backfill run): nothing is certified
 *   until the operator commits the cleanup and reruns with `--record`. A
 *   scoped `--apply` is refused unless every reverted edit lies in files that
 *   belong only to the scoped units. The job never commits.
 */
export type SteeringBuildRunner = (command: string[]) => Promise<CommandResult>;

/** Working-tree facts the job needs from git; injectable for tests. */
export interface SteeringGitOps {
  /** Paths under `src/ include/ libs/` that differ from HEAD (modified, added, deleted, untracked). */
  changedPaths(repoRoot: string): string[];
}

export const STEERING_SOURCE_ROOTS = ["src", "include", "libs"] as const;

export const gitSteeringOps: SteeringGitOps = {
  changedPaths(repoRoot) {
    const result = Bun.spawnSync(
      ["git", "-C", repoRoot, "status", "--porcelain", "--untracked-files=all", "--", ...STEERING_SOURCE_ROOTS],
      { stdout: "pipe", stderr: "pipe" },
    );
    if (result.exitCode !== 0) throw new Error(`git status failed in ${repoRoot}: ${result.stderr.toString().trim()}`);
    return result.stdout.toString().split("\n").filter(Boolean)
      .map((line) => line.slice(3).replace(/^"|"$/g, ""))
      .map((path) => (path.includes(" -> ") ? path.split(" -> ").at(-1)! : path))
      .sort();
  },
};

export interface SteeringBackfillFunction {
  unit: string;
  name: string;
  initial: SteeringFunctionDecision["decision"] | "absent";
  final: SteeringFunctionDecision["decision"];
  applied: boolean;
  match: SteeringFunctionDecision["match"];
}

export interface SteeringBackfillUnit {
  unit: string;
  clean: boolean;
  provisional: boolean;
  /** decide's coverage row for the unit; null when decide did not report it. */
  coverage: { built: boolean; compared: boolean; exempt?: string } | null;
}

export interface SteeringBackfillResult {
  gameId: string;
  baseRev: string;
  headRev: string;
  full: boolean;
  functions: SteeringBackfillFunction[];
  units: SteeringBackfillUnit[];
  /** The whole checkout is certified at `headRev` (never true after `--apply`). */
  clean: boolean;
  /** Why the run is not clean. */
  problems: string[];
  applied: boolean;
  /** Files the apply changed (from git), and the units whose objects were rebuilt. */
  touchedFiles: string[];
  touchedUnits: string[];
  rebuilt: string[];
  recorded: number;
  stackOnlyCleared: number;
  checkPath: string;
  recheckPath: string | null;
  nextSteps: string[];
}

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function listArg(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function invocationError(result: CommandResult, label: string): string {
  const stderr = result.stderr.trim();
  return `${label} exited ${result.exitCode}${stderr ? `: ${stderr.slice(-600)}` : ""}`;
}

interface CheckReport {
  raw: JsonObject;
  decision: SteeringDecision;
}

async function runCheck(params: {
  runner: SteeringRunner;
  repoRoot: string;
  baseRev: string;
  functions: string[];
  outPath: string;
}): Promise<CheckReport> {
  const result = await params.runner([
    "check", "--repo", params.repoRoot, "--base-ref", params.baseRev, "--oracle-repo", params.repoRoot,
    ...(params.functions.length > 0 ? ["--functions", params.functions.join(",")] : []),
    "--json", "--out", params.outPath,
  ], "host");
  if (result.exitCode !== 0) throw new Error(invocationError(result, "steering_check.py check"));
  let raw: unknown;
  try {
    raw = JSON.parse(existsSync(params.outPath) ? readFileSync(params.outPath, "utf8") : result.stdout);
  } catch {
    raw = undefined;
  }
  if (!existsSync(params.outPath) && raw !== undefined) writeFileSync(params.outPath, `${JSON.stringify(raw, null, 2)}\n`);
  const decision = parseSteeringDecision(raw);
  if (!decision) throw new Error("steering_check.py check did not return a valid decision");
  return { raw: asObject(raw), decision };
}

function functionKey(fn: { unit: string; name: string }): string {
  return `${fn.unit}::${fn.name}`;
}

/** File -> units that compile it: unit sources plus `header_units` from the check's `edits` table. */
function fileOwners(raw: JsonObject): Map<string, Set<string>> {
  const edits = asObject(raw.edits);
  const owners = new Map<string, Set<string>>();
  const add = (file: string, unit: string) => {
    const set = owners.get(file) ?? new Set<string>();
    set.add(unit);
    owners.set(file, set);
  };
  for (const row of asArray(edits.units)) {
    const unit = asObject(row);
    if (typeof unit.unit === "string" && typeof unit.source === "string") add(unit.source, unit.unit);
  }
  for (const [header, units] of Object.entries(asObject(edits.header_units))) {
    for (const unit of asArray(units)) if (typeof unit === "string") add(header, unit);
  }
  return owners;
}

/** Files `apply` rewrites: removable groups it reverts and dead UNUSED bodies it restores to the base stub. */
function revertedFiles(raw: JsonObject, decision: SteeringDecision): string[] {
  const files = new Set<string>((decision.violations ?? []).map((violation) => violation.file));
  for (const group of asArray(asObject(raw.reduce).groups)) {
    const row = asObject(group);
    if (row.status === "removable" && typeof row.file === "string") files.add(row.file);
  }
  return [...files].sort();
}

/** Objects `ninja` must rebuild for these units: from the check's unit table, else the build layout. */
function objectsForUnits(raw: JsonObject, units: Iterable<string>, validation?: GameBuildValidation | null): string[] {
  const table = new Map<string, string>();
  for (const row of asArray(asObject(raw.edits).units)) {
    const unit = asObject(row);
    if (typeof unit.unit === "string" && typeof unit.object === "string") table.set(unit.unit, unit.object);
  }
  const layout = gameBuildLayout(validation);
  return [...new Set([...units].map((unit) => table.get(unit) ?? layout.objectPathForUnit(unit)).filter((path): path is string => Boolean(path)))].sort();
}

/**
 * Units a unit-scoped finding (violation, stub test, order check) belongs to:
 * its own `unit`, else every unit that compiles its file. Null when no unit is
 * known: such a finding dirties every unit (fail closed).
 */
function findingUnits(row: { unit?: string; file: string }, owners: Map<string, Set<string>>): string[] | null {
  if (typeof row.unit === "string") return [row.unit];
  const units = [...(owners.get(row.file) ?? [])];
  return units.length > 0 ? units : null;
}

/** Unit-scoped findings of a decision: what dirties single units rather than the whole run. */
function unitFindings(decision: SteeringDecision) {
  return {
    violations: decision.violations ?? [],
    inconclusive: (decision.unused_checks ?? []).filter((check) => check.status === "inconclusive"),
    unknownOrder: (decision.order_checks ?? []).filter((check) => check.status === "unknown"),
  };
}

/**
 * Certificate facts shared by every unit: a broken reduction, a leftover
 * removable group, or a non-pass attempt that no unit-scoped finding explains
 * dirties them all. Violations, stub tests and order checks carry a unit (or
 * a file) and are judged per unit instead.
 */
function sharedCertificateProblems(report: CheckReport): string[] {
  const findings = unitFindings(report.decision);
  const explained = report.decision.functions.some((fn) => fn.decision !== "pass")
    || findings.violations.length > 0 || findings.inconclusive.length > 0 || findings.unknownOrder.length > 0;
  return steeringCertificateProblems(
    {
      ...report.decision,
      // A non-pass attempt is only per-unit when a per-unit finding explains it.
      attempt: explained ? "pass" : report.decision.attempt,
      functions: [], units: [], no_changes: true, violations: [], unused_checks: [], order_checks: [],
    },
    steeringCertificateContext({ decision: report.decision, reduce: report.raw.reduce, sourceChanged: false }),
  );
}

export async function runSteeringBackfill(params: {
  store: StateStore | null;
  gameId: string;
  repoRoot: string;
  baseRev: string;
  headRev: string;
  functions?: string[];
  unitFilter?: string;
  record: boolean;
  apply: boolean;
  dryRun: boolean;
  runner: SteeringRunner;
  buildRunner: SteeringBuildRunner;
  outputDir: string;
  validation?: GameBuildValidation | null;
  git?: SteeringGitOps;
}): Promise<SteeringBackfillResult> {
  const git = params.git ?? gitSteeringOps;
  const writes = !params.dryRun && (params.record || params.apply);
  if (writes) {
    const dirty = git.changedPaths(params.repoRoot);
    if (dirty.length > 0) {
      throw new Error(
        `steering-gate --record/--apply analyses HEAD ${params.headRev} itself and needs a clean ${STEERING_SOURCE_ROOTS.join("/ ")}/ working tree; `
          + `${params.repoRoot} has changes in ${dirty.slice(0, 8).join(", ")}${dirty.length > 8 ? ", ..." : ""}. Commit or discard them first.`,
      );
    }
  }
  mkdirSync(params.outputDir, { recursive: true });
  const requested = params.functions ?? [];
  const full = requested.length === 0 && !params.unitFilter;
  const checkPath = resolve(params.outputDir, "check.json");
  const initial = await runCheck({ runner: params.runner, repoRoot: params.repoRoot, baseRev: params.baseRev, functions: requested, outPath: checkPath });
  const inScope = (unit: string) => !params.unitFilter || unit.includes(params.unitFilter);
  const considered = initial.decision.functions.filter((fn) => inScope(fn.unit));
  const probes = new Map(initial.decision.probes.map((probe) => [functionKey({ unit: probe.unit, name: probe.function }), probe]));
  const owners = fileOwners(initial.raw);
  const scopedUnits = new Set([
    ...considered.map((fn) => fn.unit),
    ...(initial.decision.units ?? []).map((row) => row.unit).filter(inScope),
  ]);

  const final = new Map(considered.map((fn) => [functionKey(fn), { fn, decision: fn.decision }]));
  const appliedKeys = new Set<string>();
  // A finding whose unit is unknown stays in every scope (fail closed).
  const findingInScope = (row: { unit?: string; file: string }) => findingUnits(row, owners)?.some(inScope) ?? true;
  const violations = (initial.decision.violations ?? []).filter(findingInScope);
  const unusedChecks = (initial.decision.unused_checks ?? []).filter(findingInScope);
  const orderChecks = (initial.decision.order_checks ?? []).filter(findingInScope);
  const needsApply = considered.some((fn) => fn.decision === "steering_located")
    || initial.decision.removable_noncosmetic.length > 0
    || violations.length > 0;
  let applied = false;
  let recheckPath: string | null = null;
  let rebuilt: string[] = [];
  let touchedFiles: string[] = [];
  const touchedUnits = new Set<string>();

  if (params.apply && needsApply) {
    if (!full) {
      const outside = revertedFiles(initial.raw, { ...initial.decision, violations }).filter((file) => {
        const fileUnits = owners.get(file);
        return !fileUnits || fileUnits.size === 0 || [...fileUnits].some((unit) => !scopedUnits.has(unit));
      });
      if (outside.length > 0) {
        throw new Error(
          `steering-gate refuses a scoped --apply: apply reverts behaviour-identical edits in ${outside.join(", ")}, `
            + `which ${outside.length === 1 ? "is" : "are"} compiled by units outside the scope (${[...scopedUnits].sort().join(", ") || "none"}) or by no known unit. `
            + "Rerun --apply without --unit/--function, or widen the scope to every unit that compiles those files.",
        );
      }
    }
    const applyResult = await params.runner(["apply", "--report", checkPath, ...(params.dryRun ? ["--dry-run"] : [])], "host");
    if (applyResult.exitCode !== 0) throw new Error(invocationError(applyResult, "steering_check.py apply"));
    if (!params.dryRun) {
      applied = true;
      touchedFiles = git.changedPaths(params.repoRoot);
      for (const file of touchedFiles) for (const unit of owners.get(file) ?? []) touchedUnits.add(unit);
      for (const fn of considered) if (fn.decision === "steering_located") touchedUnits.add(fn.unit);
      for (const violation of violations) for (const unit of findingUnits(violation, owners) ?? []) touchedUnits.add(unit);
      if (!full) {
        const escaped = [...touchedUnits].filter((unit) => !scopedUnits.has(unit));
        if (escaped.length > 0) throw new Error(`steering_check.py apply touched units outside the scope: ${escaped.join(", ")}; review the working tree before rebuilding`);
      }
      rebuilt = objectsForUnits(initial.raw, touchedUnits, params.validation);
      const reportPath = params.validation?.reportPath ?? `${gameBuildLayout(params.validation).buildDir}/report.json`;
      const build = await params.buildRunner(["ninja", "-j3", ...rebuilt, reportPath]);
      if (build.exitCode !== 0) throw new Error(invocationError(build, "ninja"));
      recheckPath = resolve(params.outputDir, "recheck.json");
      const recheck = await runCheck({ runner: params.runner, repoRoot: params.repoRoot, baseRev: params.baseRev, functions: requested, outPath: recheckPath });
      const verified = new Map(recheck.decision.functions.map((fn) => [functionKey(fn), fn]));
      for (const [key, entry] of final) {
        if (!touchedUnits.has(entry.fn.unit)) continue;
        const after = verified.get(key)?.decision ?? "unresolved";
        entry.decision = after;
        if (entry.fn.decision === "steering_located" && after === "pass") appliedKeys.add(key);
      }
      // Every function the re-check reports in a touched unit is recorded, even one the first check did not list.
      for (const fn of recheck.decision.functions) {
        if (touchedUnits.has(fn.unit) && !final.has(functionKey(fn))) final.set(functionKey(fn), { fn: { ...fn, decision: fn.decision }, decision: fn.decision });
      }
    }
  }

  const initialKeys = new Set(considered.map(functionKey));
  const functions: SteeringBackfillFunction[] = [...final.entries()].map(([key, { fn, decision }]) => ({
    unit: fn.unit,
    name: fn.name,
    initial: initialKeys.has(key) ? fn.decision : "absent",
    final: decision,
    applied: appliedKeys.has(key),
    match: fn.match,
  }));

  const certificate = steeringCertificateContext({ decision: initial.decision, reduce: initial.raw.reduce, edits: initial.raw.edits });
  const scopedDecision: SteeringDecision = {
    ...initial.decision,
    functions: considered,
    ...(initial.decision.units ? { units: initial.decision.units.filter((row) => inScope(row.unit)) } : {}),
    violations,
    unused_checks: unusedChecks,
    order_checks: orderChecks,
  };
  const problems = applied
    ? ["applied: the cleanup is uncommitted; commit it and rerun with --record to certify the new HEAD"]
    : steeringCertificateProblems(scopedDecision, certificate);
  const clean = !applied && problems.length === 0;

  const shared = sharedCertificateProblems(initial);
  const belongsTo = (row: { unit?: string; file: string }, unit: string) => findingUnits(row, owners)?.includes(unit) ?? true;
  const coverage = new Map((initial.decision.units ?? []).map((row) => [row.unit, row]));
  const unitNames = new Set([...scopedUnits, ...touchedUnits]);
  const units: SteeringBackfillUnit[] = [...unitNames].sort().map((unit) => {
    const covered = coverage.get(unit);
    const unitClean = !applied
      && shared.length === 0
      && Boolean(covered && unitCovered(covered))
      && !violations.some((violation) => belongsTo(violation, unit))
      && !unusedChecks.some((check) => check.status === "inconclusive" && belongsTo(check, unit))
      && !orderChecks.some((check) => check.status === "unknown" && belongsTo(check, unit))
      && functions.filter((fn) => fn.unit === unit).every((fn) => fn.final === "pass");
    const { unit: _name, ...coverageRow } = covered ?? { unit };
    return { unit, clean: unitClean, provisional: applied, coverage: covered ? coverageRow as SteeringBackfillUnit["coverage"] : null };
  });

  let recorded = 0;
  let stackOnlyCleared = 0;
  const store = params.store;
  if (store && writes) {
    for (const fn of functions) {
      recordSteeringBackfill(store, {
        gameId: params.gameId,
        unit: fn.unit,
        symbol: fn.name,
        analyzedRev: params.headRev,
        verdict: fn.final,
        applied: fn.applied,
        // Applied on top of headRev and not committed yet: the commit that carries it is unknown.
        appliedRev: null,
        report: {
          base_rev: params.baseRev,
          initial: fn.initial,
          match: fn.match,
          provisional: applied,
          probe: probes.get(functionKey(fn)) ?? null,
          check: checkPath,
          recheck: recheckPath,
        },
      });
      recorded += 1;
    }
    for (const unit of units) {
      recordSteeringCoverage(store, {
        gameId: params.gameId,
        unit: unit.unit,
        analyzedRev: params.headRev,
        baselineRev: params.headRev,
        clean: unit.clean,
        applied,
        report: {
          base_rev: params.baseRev,
          provisional: applied,
          coverage: unit.coverage,
          check: checkPath,
        },
      });
    }
    if (full && !applied) recordSteeringBackfillRun(store, { gameId: params.gameId, baselineRev: params.headRev, clean });
  }
  if (store && applied) {
    // A frame-only "done" verdict in a rewritten unit may have been bought by steering; let the board re-judge it.
    for (const fn of functions.filter((row) => touchedUnits.has(row.unit))) {
      clearStackOnlyFunction(store, { gameId: params.gameId, unit: fn.unit, symbol: fn.name });
      stackOnlyCleared += 1;
    }
  }

  const nextSteps = applied
    ? [
        "Review the rewritten sources (git diff), then commit them through the normal integration path.",
        "Rerun steering-gate with --record (no --apply) on the new HEAD to certify it.",
      ]
    : !clean && params.record
      ? ["Fix or --apply the functions listed under not_pass (and any dead UNUSED bodies under problems), commit, and rerun with --record."]
      : [];

  return {
    gameId: params.gameId,
    baseRev: params.baseRev,
    headRev: params.headRev,
    full,
    functions,
    units,
    clean,
    problems,
    applied,
    touchedFiles,
    touchedUnits: [...touchedUnits].sort(),
    rebuilt,
    recorded,
    stackOnlyCleared,
    checkPath,
    recheckPath,
    nextSteps,
  };
}

function gitRev(repoRoot: string, ref: string): string {
  const result = Bun.spawnSync(["git", "-C", repoRoot, "rev-parse", "--verify", `${ref}^{commit}`], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(`steering-gate cannot resolve ${ref} in ${repoRoot}: ${result.stderr.toString().trim()}`);
  return result.stdout.toString().trim();
}

export async function steeringGateJob(globals: GlobalArgs, args: Map<string, string | true>): Promise<void> {
  const game = globals.game;
  const gameId = game?.gameId ?? globals.gameId ?? "";
  if (!gameId) throw new Error("steering-gate needs a game (--game)");
  const mode = game?.matching?.steeringGate ?? "off";
  if (!steeringGateActive(mode) && !booleanArg(args, "--force")) {
    throw new Error(`steering-gate only applies to games with matching.steeringGate shadow or enforce; ${gameId} is ${mode} (pass --force to run anyway)`);
  }
  const repoRoot = resolve(stringArg(args, "--repo", globals.repoRoot));
  const base = stringArg(args, "--base", "").trim();
  if (!base) throw new Error("steering-gate needs --base <ref> (the trusted source the history is measured against)");
  const baseRev = gitRev(repoRoot, base);
  const headRev = gitRev(repoRoot, "HEAD");
  const headArg = stringArg(args, "--head", "").trim();
  if (headArg && gitRev(repoRoot, headArg) !== headRev) {
    throw new Error(`steering-gate analyses the checkout's working tree: ${repoRoot} is at ${headRev}, not --head ${headArg}; check it out first`);
  }
  const script = resolve(stringArg(args, "--script", resolve(packageRoot(), "toolpacks/gamecube-decomp", STEERING_CHECK_TOOLPACK_PATH)));
  if (!existsSync(script)) throw new Error(`steering_check.py not found at ${script}`);
  const outputDir = resolve(stringArg(args, "--out-dir", resolve(globals.stateDir, "steering-gate", `${gameId}-${new Date().toISOString().replaceAll(":", "-")}`)));
  const dryRun = booleanArg(args, "--dry-run");
  const record = booleanArg(args, "--record");
  const apply = booleanArg(args, "--apply");
  const store = !dryRun && (record || apply) ? openState(globals.stateDir) : null;
  try {
    const result = await runSteeringBackfill({
      store,
      gameId,
      repoRoot,
      baseRev,
      headRev,
      functions: listArg(stringArg(args, "--function", "")),
      unitFilter: stringArg(args, "--unit", "") || undefined,
      record,
      apply,
      dryRun,
      runner: hostSteeringRunner(script, repoRoot, { mode: mode === "off" ? "shadow" : mode }),
      buildRunner: (command) => runCommand(repoRoot, command),
      outputDir,
      validation: game?.validation,
    });
    console.log(JSON.stringify({
      game_id: gameId,
      repo: repoRoot,
      base_rev: result.baseRev,
      head_rev: result.headRev,
      dry_run: dryRun,
      full: result.full,
      clean: result.clean,
      problems: result.problems,
      applied: result.applied,
      touched_files: result.touchedFiles,
      touched_units: result.touchedUnits,
      rebuilt: result.rebuilt,
      recorded: result.recorded,
      stack_only_cleared: result.stackOnlyCleared,
      units: result.units,
      not_pass: result.functions.filter((fn) => fn.final !== "pass"),
      functions_checked: result.functions.length,
      check: result.checkPath,
      recheck: result.recheckPath,
      next_steps: result.nextSteps,
    }, null, 2));
  } finally {
    store?.db.close();
  }
}
