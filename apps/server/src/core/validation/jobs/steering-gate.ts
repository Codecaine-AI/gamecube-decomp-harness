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
  recordSteeringRollback,
  updateSteeringRollback,
  type SteeringRollbackStatus,
} from "@server/core/harness-runtime/run-state/steering.js";
import { steeringGateActive } from "@server/core/tools/steering-gate.js";
import {
  STEERING_CHECK_TOOLPACK_PATH,
  hostSteeringRunner,
  parseSteeringDecision,
  steeringCertificateContext,
  steeringCertificateProblems,
  steeringViolationProblem,
  unitCovered,
  type SteeringDecision,
  type SteeringFunctionDecision,
  type SteeringProbe,
  type SteeringRunner,
  type SteeringViolation,
} from "@server/core/validation/steering/steering-check.js";
import { runCommand, type CommandResult } from "@server/infrastructure/shell";
import { runShardedSteeringBackfill } from "./steering-gate-sharded.js";

/**
 * Backfill for steering-gated games (plan 3.6). Runs `steering_check.py
 * check` on a built checkout against `--base`.
 *
 * - `--record` certifies the checkout's HEAD itself, so it needs a clean
 *   `src/ include/ libs/` working tree. It writes `steering_backfill` rows,
 *   per-unit coverage and, for a full run (no `--unit`/`--function`/`--paths`),
 *   a backfill run: the enforce-mode run preflight's prerequisite.
 * - `--apply` writes S*, rebuilds the touched units' objects and
 *   `report.json` (`ninja -j3`), re-checks, and records the result as
 *   provisional (applied rows, unclean coverage, no backfill run): nothing is
 *   certified until the operator commits the cleanup and reruns with
 *   `--record`. A scoped `--apply` is refused unless every reverted edit lies
 *   in files that belong only to the scoped units. The job never commits.
 * - `--paths a,b` (or `--paths-file F`) scopes the one check to those files
 *   (a scoped run). `--budget-seconds`, `--max-groups`, `--cache-dir` go to
 *   `check`; `--timeout-ms` is the per-call ceiling of the host runner. The
 *   worker gate's defaults (`STEERING_GATE_BUDGET_MS`) are unchanged.
 * - `--from-reports <dir|glob>[,...]` (sharded backfill, see
 *   `steering-gate-sharded.ts`) reuses existing `check` reports instead of
 *   running `check` over the whole tree.
 *
 * `steering_backfill.report_json` (one row per function; stable shape, read
 * by the worker prompt wiring), `SteeringBackfillFunctionReport`:
 *
 * ```
 * {
 *   base_rev: string,                  // trusted base the check measured against
 *   initial: decision | "absent",      // first check ("absent": only the re-check listed it)
 *   decision: decision,                // final: re-check after --apply, else the first check
 *   applied: boolean,                  // --apply removed its steering and the re-check passed
 *   provisional: boolean,              // written by --apply, not committed/certified yet
 *   match: { base, candidate, real_only },        // first check, percent or null
 *   final_match: { base, candidate, real_only } | null,  // re-check, when re-checked
 *   removed_edit_groups: [{            // first check: behaviour-identical groups S* removes (applied: removed)
 *     id, file, line: number | null, location: "file:line", shapes: string[],
 *     text: string,                    // candidate (steered) lines, " / "-joined, <= 160 chars
 *     restored: string,                // base lines S* restores, same format
 *   }],
 *   violations: [{                     // first check: rule violations attached to this function
 *     kind: "dead_unused_body" | "out_of_order" | ..., file, line: number | null,
 *     location: "file:line", function: string | null, problem: string,
 *   }],
 *   rules: string[],                   // what a rollback enforces: "steering" (removed groups / steering verdict) + violation kinds
 *   reasons: string[],                 // first check's reasons + violation problems, then the re-check's new ones
 *   final_reasons: string[] | null,    // the re-check's reasons alone, or its failure (null: not re-checked)
 *   probe: object | null,              // decide's steering probe for the function
 *   check: string, recheck: string | null,   // report paths
 * }
 * ```
 * decision is one of pass | steering_located | unresolved | rule_violation.
 *
 * Every function an `--apply` rewrote (non-empty `rules`) also gets one
 * append-only `steering_rollbacks` row with this report: `steering_backfill`
 * is the current certification and a later `--record` overwrites it with
 * `pass`; the rollback row is what the next worker's `previous_attempt` reads.
 *
 * Rebuild after `--apply`: `--rebuild ninja` (default) runs `ninja -j3
 * <touched objects> <report.json>`; `--rebuild none` skips it (for a host
 * clone whose `build/` is stale, or when ninja would run remotely); the
 * harness rebuilds `report.json` in its sandbox after the commit. Either way
 * the re-check compiles every touched unit itself in shadow roots, so before
 * any write the job refuses a checkout whose `build.ninja` references
 * absolute paths that do not exist on this host (a sandbox-generated
 * `build.ninja`): regenerate it with `configure.py` in the clone first.
 * Records bind to commit SHAs, so a clone at the integration head records
 * rows (baseline_rev) valid for the live checkout once it is fast-forwarded.
 *
 * Every `steering_check.py` call runs under `--timeout-ms` (backfill default
 * `STEERING_BACKFILL_TIMEOUT_MS`); a timed-out call is a failure, never a pass.
 */
export type SteeringBuildRunner = (command: string[]) => Promise<CommandResult>;

/** Per-call ceiling for every `steering_check.py` call (and ninja) of the backfill job; `--timeout-ms` overrides. */
export const STEERING_BACKFILL_TIMEOUT_MS = 30 * 60_000;

/** After `--apply`: rebuild touched objects + report.json with ninja, or leave the rebuild to the harness sandbox. */
export type SteeringRebuild = "ninja" | "none";

/** Working-tree facts the job needs from git; injectable for tests. */
export interface SteeringGitOps {
  /** Paths under `src/ include/ libs/` that differ from HEAD (modified, added, deleted, untracked). */
  changedPaths(repoRoot: string): string[];
  /** Paths under `src/ include/ libs/` that differ between `baseRev` and HEAD (what a full sharded backfill must cover); defaults to git. */
  changedSinceBase?(repoRoot: string, baseRev: string): string[];
}

export const STEERING_SOURCE_ROOTS = ["src", "include", "libs"] as const;

export const gitSteeringOps: Required<SteeringGitOps> = {
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
  changedSinceBase(repoRoot, baseRev) {
    const result = Bun.spawnSync(
      ["git", "-C", repoRoot, "diff", "--name-only", "--no-renames", baseRev, "HEAD", "--", ...STEERING_SOURCE_ROOTS],
      { stdout: "pipe", stderr: "pipe" },
    );
    if (result.exitCode !== 0) throw new Error(`git diff failed in ${repoRoot}: ${result.stderr.toString().trim()}`);
    return result.stdout.toString().split("\n").filter(Boolean).sort();
  },
};

/** Options handed to `steering_check.py check` (backfill only; the worker gate never sets them). */
export interface SteeringCheckOptions {
  /** `--paths`: scope the check to these repo-relative files or directories. */
  paths?: string[];
  budgetSeconds?: number;
  maxGroups?: number;
  cacheDir?: string;
  jobs?: number;
}

export function steeringCheckArgs(options: SteeringCheckOptions | undefined): string[] {
  if (!options) return [];
  return [
    ...(options.paths && options.paths.length > 0 ? ["--paths", ...options.paths] : []),
    ...(options.budgetSeconds !== undefined ? ["--budget-seconds", String(options.budgetSeconds)] : []),
    ...(options.maxGroups !== undefined ? ["--max-groups", String(options.maxGroups)] : []),
    ...(options.cacheDir ? ["--cache-dir", options.cacheDir] : []),
    ...(options.jobs !== undefined ? ["--jobs", String(Math.max(1, Math.min(3, options.jobs)))] : []),
  ];
}

type Match = SteeringFunctionDecision["match"];

/** One behaviour-identical edit group S* removes from a function (see the report shape above). */
export interface SteeringRemovedEditGroup {
  id: string;
  file: string;
  line: number | null;
  location: string;
  shapes: string[];
  text: string;
  restored: string;
}

/** `steering_backfill.report_json`; documented in the module comment. Keep the shape stable. */
export interface SteeringBackfillFunctionReport {
  base_rev: string;
  initial: SteeringFunctionDecision["decision"] | "absent";
  decision: SteeringFunctionDecision["decision"];
  applied: boolean;
  provisional: boolean;
  match: Match;
  final_match: Match | null;
  removed_edit_groups: SteeringRemovedEditGroup[];
  violations: SteeringAppliedViolation[];
  rules: string[];
  reasons: string[];
  final_reasons: string[] | null;
  probe: SteeringProbe | null;
  check: string;
  recheck: string | null;
}

const SHORT_TEXT_LIMIT = 160;

/** Source lines as one short string: trimmed, " / "-joined, at most 160 chars. */
export function shortGroupText(value: unknown): string {
  const text = asArray(value).filter((line): line is string => typeof line === "string")
    .map((line) => line.trim()).filter(Boolean).join(" / ");
  return text.length > SHORT_TEXT_LIMIT ? `${text.slice(0, SHORT_TEXT_LIMIT - 3)}...` : text;
}

/** The raw `decide` row of one function in a `check` report (carries `groups` and `reasons`). */
export function rawFunctionRow(raw: JsonObject, unit: string, name: string): JsonObject | null {
  for (const row of asArray(asObject(raw.decision).functions)) {
    const fn = asObject(row);
    if (fn.unit === unit && fn.name === name) return fn;
  }
  return null;
}

/** The behaviour-identical, non-cosmetic `reduce` groups among a function's groups. */
export function removedEditGroups(raw: JsonObject, row: JsonObject | null): SteeringRemovedEditGroup[] {
  if (!row) return [];
  const ids = new Set(asArray(row.groups).filter((id): id is string => typeof id === "string"));
  const out: SteeringRemovedEditGroup[] = [];
  for (const entry of asArray(asObject(raw.reduce).groups)) {
    const group = asObject(entry);
    if (typeof group.id !== "string" || !ids.has(group.id) || group.status !== "removable" || group.cosmetic === true) continue;
    const file = typeof group.file === "string" ? group.file : group.id.split("@")[0] ?? "";
    const line = typeof group.line === "number" ? group.line : null;
    out.push({
      id: group.id,
      file,
      line,
      location: line === null ? file : `${file}:${line}`,
      shapes: asArray(group.shapes).filter((shape): shape is string => typeof shape === "string"),
      text: shortGroupText(group.cand_lines),
      restored: shortGroupText(group.base_lines),
    });
  }
  return out;
}

/** A rule violation attached to a function (see the report shape above). */
export interface SteeringAppliedViolation {
  kind: string;
  file: string;
  line: number | null;
  location: string;
  function: string | null;
  problem: string;
}

/** decide names a violation's function mangled, demangled, or qualified with or without parameters. */
function sameFunction(name: string, row: JsonObject): boolean {
  const bare = (text: string) => text.replace(/\s*\(.*$/s, "").trim();
  const demangled = typeof row.demangled === "string" ? row.demangled : "";
  const candidates = new Set([String(row.name ?? ""), demangled, bare(demangled), bare(String(row.name ?? ""))].filter(Boolean));
  return candidates.has(name) || candidates.has(bare(name));
}

/**
 * Attaches each rule violation of a check report to the function rows it
 * concerns, whatever their verdict: by function name (dead UNUSED bodies),
 * else by the groups covering its line (out-of-order hunks), else by every
 * function with a group in its file. A violation no function row matches is
 * returned under `unattached`.
 */
export function attachViolations(raw: JsonObject, decision: SteeringDecision): {
  byFunction: Map<string, SteeringViolation[]>;
  unattached: SteeringViolation[];
} {
  const rows = asArray(asObject(raw.decision).functions).map(asObject).filter((row) => typeof row.unit === "string" && typeof row.name === "string");
  const groups = asArray(asObject(raw.reduce).groups).map(asObject);
  const byFunction = new Map<string, SteeringViolation[]>();
  const unattached: SteeringViolation[] = [];
  for (const violation of decision.violations ?? []) {
    const inUnit = rows.filter((row) => violation.unit === undefined || row.unit === violation.unit);
    let matched = violation.function !== undefined ? inUnit.filter((row) => sameFunction(violation.function!, row)) : [];
    if (matched.length === 0 && typeof violation.line === "number") {
      const line = violation.line;
      const ids = new Set(groups.filter((group) => group.file === violation.file && typeof group.line === "number"
        && line >= group.line && line < group.line + Math.max(1, asArray(group.cand_lines).length)).map((group) => String(group.id)));
      matched = inUnit.filter((row) => asArray(row.groups).some((id) => ids.has(String(id))));
    }
    if (matched.length === 0) matched = inUnit.filter((row) => asArray(row.groups).some((id) => String(id).startsWith(`${violation.file}@`)));
    if (matched.length === 0) {
      unattached.push(violation);
      continue;
    }
    for (const row of matched) {
      const key = functionKey({ unit: String(row.unit), name: String(row.name) });
      byFunction.set(key, [...(byFunction.get(key) ?? []), violation]);
    }
  }
  return { byFunction, unattached };
}

export function appliedViolation(violation: SteeringViolation): SteeringAppliedViolation {
  const line = typeof violation.line === "number" ? violation.line : null;
  return {
    kind: violation.kind,
    file: violation.file,
    line,
    location: line === null ? violation.file : `${violation.file}:${line}`,
    function: violation.function ?? null,
    problem: steeringViolationProblem(violation),
  };
}

/** decide's reasons for one function plus the problems of the violations attached to it. */
export function functionReasons(raw: JsonObject, fn: { unit: string; name: string }, violations: readonly SteeringViolation[] = []): string[] {
  const row = rawFunctionRow(raw, fn.unit, fn.name);
  const reasons = asArray(row?.reasons).filter((reason): reason is string => typeof reason === "string");
  for (const violation of violations) reasons.push(steeringViolationProblem(violation));
  return reasons;
}

/** What rolling a function back enforces: `steering` when S* removed its groups or it was steering-located, plus each violation kind. */
export function rollbackRules(report: Pick<SteeringBackfillFunctionReport, "initial" | "removed_edit_groups" | "violations">): string[] {
  const rules = new Set<string>();
  if (report.removed_edit_groups.length > 0 || report.initial === "steering_located") rules.add("steering");
  for (const violation of report.violations) rules.add(violation.kind);
  return [...rules];
}

/**
 * Applied and re-verified: the apply rewrote the function's unit, the re-check
 * passes it, and the rollback enforced something (a non-pass first verdict,
 * removed steering, or an attached rule violation, whatever the verdict).
 */
export function appliedAndVerified(fn: { initial: string; final: string }, touched: boolean, rules: readonly string[]): boolean {
  return touched && fn.final === "pass" && (fn.initial !== "pass" || rules.length > 0);
}

/** Absolute paths `build.ninja` references whose top directories do not exist here (a sandbox-generated build.ninja). */
export function hostBuildProblem(repoRoot: string): string | null {
  const ninja = resolve(repoRoot, "build.ninja");
  if (!existsSync(ninja)) return `${repoRoot} has no build.ninja`;
  const text = readFileSync(ninja, "utf8");
  const missing = new Set<string>();
  for (const match of text.matchAll(/(?:^|[\s="'])(\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+)/gm)) {
    const prefix = match[1]!;
    if (!missing.has(prefix) && !existsSync(prefix)) missing.add(prefix);
    if (missing.size >= 5) break;
  }
  return missing.size === 0 ? null
    : `${ninja} references paths that do not exist on this host (${[...missing].join(", ")}): it was generated elsewhere (a sandbox). `
      + "Regenerate it on the host (configure.py) before --apply; the re-check compiles every touched unit from it";
}

/** Builds one function's `report_json` from the first check and, when re-checked, the re-check. */
export function steeringFunctionReport(params: {
  baseRev: string;
  initial: { raw: JsonObject; decision: SteeringDecision; path: string };
  recheck: { raw: JsonObject; decision: SteeringDecision; path: string } | null;
  fn: SteeringBackfillFunction;
  provisional: boolean;
  probe: SteeringProbe | null;
  /** First-check violations attached to this function (`attachViolations`). */
  violations?: readonly SteeringViolation[];
  /** Re-check violations attached to this function. */
  recheckViolations?: readonly SteeringViolation[];
  /** The re-check of this function's unit failed (timeout, tool error): never a pass. */
  recheckError?: string | null;
  /** Keep only removed groups in these files (the sharded apply never writes shared headers). */
  groupFilter?: (file: string) => boolean;
}): SteeringBackfillFunctionReport {
  const { fn } = params;
  const after = params.recheck?.decision.functions.find((row) => row.unit === fn.unit && row.name === fn.name) ?? null;
  const violations = params.violations ?? [];
  // The first check explains what was wrong (an applied rule violation keeps its reason); the re-check adds what remains.
  const initialReasons = fn.initial === "absent" ? [] : functionReasons(params.initial.raw, fn, violations);
  const finalReasons = params.recheckError
    ? [`re-check failed (counted unresolved): ${params.recheckError}`]
    : params.recheck && after ? functionReasons(params.recheck.raw, fn, params.recheckViolations ?? []) : null;
  const removed = removedEditGroups(params.initial.raw, rawFunctionRow(params.initial.raw, fn.unit, fn.name))
    .filter((group) => !params.groupFilter || params.groupFilter(group.file));
  return {
    base_rev: params.baseRev,
    initial: fn.initial,
    decision: fn.final,
    applied: fn.applied,
    provisional: params.provisional,
    match: fn.match,
    final_match: after ? after.match : null,
    removed_edit_groups: removed,
    violations: violations.map(appliedViolation),
    rules: rollbackRules({ initial: fn.initial, removed_edit_groups: removed, violations: violations.map(appliedViolation) }),
    reasons: [...new Set([...initialReasons, ...(finalReasons ?? [])])],
    final_reasons: finalReasons,
    probe: params.probe,
    check: params.initial.path,
    recheck: params.recheck?.path ?? null,
  };
}

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

export type JsonObject = Record<string, unknown>;

export function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function listArg(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

export function invocationError(result: CommandResult, label: string): string {
  const stderr = result.stderr.trim();
  return `${label} exited ${result.exitCode}${stderr ? `: ${stderr.slice(-600)}` : ""}`;
}

export interface CheckReport {
  raw: JsonObject;
  decision: SteeringDecision;
}

export async function runCheck(params: {
  runner: SteeringRunner;
  repoRoot: string;
  baseRev: string;
  functions: string[];
  outPath: string;
  options?: SteeringCheckOptions;
}): Promise<CheckReport> {
  const result = await params.runner([
    "check", "--repo", params.repoRoot, "--base-ref", params.baseRev, "--oracle-repo", params.repoRoot,
    ...(params.functions.length > 0 ? ["--functions", params.functions.join(",")] : []),
    ...steeringCheckArgs(params.options),
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

export function functionKey(fn: { unit: string; name: string }): string {
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

/**
 * The rollback events of one `--apply`, kept apart from `steering_backfill`
 * (which a later `--record` overwrites). `open` appends an event as soon as
 * `apply` has rewritten a function's unit, before the rebuild or re-check
 * that can fail; `mark` and `finish` move it on. A function gets an event
 * when the rollback enforced something: its report names rules, or its first
 * verdict was not pass.
 */
export class SteeringRollbackLedger {
  private readonly ids = new Map<string, number>();

  constructor(
    private readonly store: StateStore | null,
    private readonly params: { gameId: string; headRev: string; baseRev: string },
  ) {}

  open(items: Iterable<{ fn: SteeringBackfillFunction; report: SteeringBackfillFunctionReport }>): void {
    if (!this.store) return;
    for (const { fn, report } of items) {
      const key = functionKey(fn);
      if (this.ids.has(key) || fn.initial === "absent" || (report.rules.length === 0 && fn.initial === "pass")) continue;
      const id = recordSteeringRollback(this.store, {
        gameId: this.params.gameId,
        unit: fn.unit,
        symbol: fn.name,
        analyzedRev: this.params.headRev,
        baseRev: this.params.baseRev,
        initialVerdict: fn.initial,
        finalVerdict: "unverified",
        rules: report.rules,
        report: report as unknown as Record<string, unknown>,
        status: "rewritten",
      });
      if (id !== null) this.ids.set(key, id);
    }
  }

  /** Sets the status of these functions' events (every open event without keys). */
  mark(status: SteeringRollbackStatus, keys?: Iterable<string>): void {
    if (!this.store) return;
    for (const key of keys ?? [...this.ids.keys()]) {
      const id = this.ids.get(key);
      if (id !== undefined) updateSteeringRollback(this.store, id, { status });
    }
  }

  /** The final verdict and report once the re-check ran (or failed). */
  finish(fn: SteeringBackfillFunction, report: SteeringBackfillFunctionReport, recheckFailed: boolean): void {
    const id = this.ids.get(functionKey(fn));
    if (!this.store || id === undefined) return;
    const status: SteeringRollbackStatus = recheckFailed ? "recheck_failed" : fn.final === "pass" ? "reverified" : "recheck_not_pass";
    updateSteeringRollback(this.store, id, { status, finalVerdict: fn.final, rules: report.rules, report: report as unknown as Record<string, unknown> });
  }

  get size(): number {
    return this.ids.size;
  }
}

/** A function's report as `apply` leaves it: nothing re-checked yet, its verdict still the first one. */
export function rewrittenReport(params: Omit<Parameters<typeof steeringFunctionReport>[0], "recheck" | "recheckViolations" | "recheckError" | "provisional">): SteeringBackfillFunctionReport {
  return steeringFunctionReport({ ...params, fn: { ...params.fn, final: params.fn.initial === "absent" ? "unresolved" : params.fn.initial, applied: false }, recheck: null, provisional: true });
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
  /** `check` options for both the first check and the re-check (`--paths` scopes the run). */
  checkOptions?: SteeringCheckOptions;
  rebuild?: SteeringRebuild;
  /** Defaults to `hostBuildProblem`; tests inject one. */
  buildCheck?: (repoRoot: string) => string | null;
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
  if (params.apply && !params.dryRun) {
    const problem = (params.buildCheck ?? hostBuildProblem)(params.repoRoot);
    if (problem) throw new Error(`steering-gate --apply refuses before writing anything: ${problem}`);
  }
  mkdirSync(params.outputDir, { recursive: true });
  const requested = params.functions ?? [];
  const full = requested.length === 0 && !params.unitFilter && !(params.checkOptions?.paths?.length);
  const checkPath = resolve(params.outputDir, "check.json");
  const initial = await runCheck({ runner: params.runner, repoRoot: params.repoRoot, baseRev: params.baseRev, functions: requested, outPath: checkPath, options: params.checkOptions });
  const inScope = (unit: string) => !params.unitFilter || unit.includes(params.unitFilter);
  const considered = initial.decision.functions.filter((fn) => inScope(fn.unit));
  // decide names a probe by its demangled `function` and mangled `symbol`; function rows use the symbol.
  const probes = new Map(initial.decision.probes.flatMap((probe) => [
    ...(typeof probe.symbol === "string" ? [[functionKey({ unit: probe.unit, name: probe.symbol }), probe] as const] : []),
    [functionKey({ unit: probe.unit, name: probe.function }), probe] as const,
  ]));
  const owners = fileOwners(initial.raw);
  const scopedUnits = new Set([
    ...considered.map((fn) => fn.unit),
    ...(initial.decision.units ?? []).map((row) => row.unit).filter(inScope),
  ]);

  const final = new Map(considered.map((fn) => [functionKey(fn), { fn, decision: fn.decision }]));
  const ledger = new SteeringRollbackLedger(params.store, params);
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
  let recheckReport: CheckReport | null = null;
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
      // The sources are rewritten: record the rollback events before anything that can fail.
      if (writes) {
        const attachedNow = attachViolations(initial.raw, { ...initial.decision, violations });
        ledger.open(considered.filter((fn) => touchedUnits.has(fn.unit)).map((fn) => {
          const row: SteeringBackfillFunction = { unit: fn.unit, name: fn.name, initial: fn.decision, final: fn.decision, applied: false, match: fn.match };
          return {
            fn: row,
            report: rewrittenReport({
              baseRev: params.baseRev, initial: { ...initial, path: checkPath }, fn: row,
              probe: probes.get(functionKey(fn)) ?? null, violations: attachedNow.byFunction.get(functionKey(fn)) ?? [],
            }),
          };
        }));
      }
      if (!full) {
        const escaped = [...touchedUnits].filter((unit) => !scopedUnits.has(unit));
        if (escaped.length > 0) throw new Error(`steering_check.py apply touched units outside the scope: ${escaped.join(", ")}; review the working tree before rebuilding`);
      }
      if ((params.rebuild ?? "ninja") === "ninja") {
        rebuilt = objectsForUnits(initial.raw, touchedUnits, params.validation);
        const reportPath = params.validation?.reportPath ?? `${gameBuildLayout(params.validation).buildDir}/report.json`;
        const build = await params.buildRunner(["ninja", "-j3", ...rebuilt, reportPath]);
        if (build.exitCode !== 0) {
          ledger.mark("rebuild_failed");
          throw new Error(invocationError(build, "ninja"));
        }
      }
      recheckPath = resolve(params.outputDir, "recheck.json");
      let recheck: CheckReport;
      try {
        recheck = await runCheck({ runner: params.runner, repoRoot: params.repoRoot, baseRev: params.baseRev, functions: requested, outPath: recheckPath, options: params.checkOptions });
      } catch (error) {
        ledger.mark("recheck_failed");
        throw error;
      }
      recheckReport = recheck;
      const verified = new Map(recheck.decision.functions.map((fn) => [functionKey(fn), fn]));
      for (const [key, entry] of final) {
        if (!touchedUnits.has(entry.fn.unit)) continue;
        entry.decision = verified.get(key)?.decision ?? "unresolved";
      }
      // Every function the re-check reports in a touched unit is recorded, even one the first check did not list.
      for (const fn of recheck.decision.functions) {
        if (touchedUnits.has(fn.unit) && !final.has(functionKey(fn))) final.set(functionKey(fn), { fn: { ...fn, decision: fn.decision }, decision: fn.decision });
      }
    }
  }

  const initialKeys = new Set(considered.map(functionKey));
  const attached = attachViolations(initial.raw, { ...initial.decision, violations });
  const recheckAttached = recheckReport ? attachViolations(recheckReport.raw, recheckReport.decision) : null;
  const reports = new Map<string, SteeringBackfillFunctionReport>();
  const functions: SteeringBackfillFunction[] = [...final.entries()].map(([key, { fn, decision }]) => {
    const row: SteeringBackfillFunction = {
      unit: fn.unit, name: fn.name, initial: initialKeys.has(key) ? fn.decision : "absent", final: decision, applied: false, match: fn.match,
    };
    const report = steeringFunctionReport({
      baseRev: params.baseRev,
      initial: { ...initial, path: checkPath },
      recheck: recheckReport && recheckPath ? { ...recheckReport, path: recheckPath } : null,
      fn: row,
      provisional: applied,
      probe: probes.get(key) ?? null,
      violations: attached.byFunction.get(key) ?? [],
      recheckViolations: recheckAttached?.byFunction.get(key) ?? [],
    });
    row.applied = applied && appliedAndVerified(row, touchedUnits.has(row.unit), report.rules);
    reports.set(key, { ...report, applied: row.applied });
    return row;
  });

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
        report: reports.get(functionKey(fn)) as unknown as Record<string, unknown>,
      });
      recorded += 1;
      if (applied && touchedUnits.has(fn.unit)) ledger.finish(fn, reports.get(functionKey(fn))!, false);
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

function positiveNumber(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`steering-gate ${flag} needs a positive number, got ${value}`);
  return parsed;
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
  const timeoutArg = stringArg(args, "--timeout-ms", "").trim();
  const timeoutMs = timeoutArg ? positiveNumber(timeoutArg, "--timeout-ms") : STEERING_BACKFILL_TIMEOUT_MS;
  const rebuildArg = stringArg(args, "--rebuild", "ninja").trim();
  if (rebuildArg !== "ninja" && rebuildArg !== "none") throw new Error(`steering-gate --rebuild is ninja or none, got ${rebuildArg}`);
  const rebuild: SteeringRebuild = rebuildArg;
  const pathsFile = stringArg(args, "--paths-file", "").trim();
  const paths = [
    ...listArg(stringArg(args, "--paths", "")),
    ...(pathsFile ? readFileSync(resolve(pathsFile), "utf8").split("\n").map((line) => line.trim()).filter(Boolean) : []),
  ];
  const budgetArg = stringArg(args, "--budget-seconds", "").trim();
  const maxGroupsArg = stringArg(args, "--max-groups", "").trim();
  const cacheDir = stringArg(args, "--cache-dir", "").trim();
  const checkOptions: SteeringCheckOptions = {
    ...(budgetArg ? { budgetSeconds: positiveNumber(budgetArg, "--budget-seconds") } : {}),
    ...(maxGroupsArg ? { maxGroups: positiveNumber(maxGroupsArg, "--max-groups") } : {}),
    ...(cacheDir ? { cacheDir: resolve(cacheDir) } : {}),
  };
  // Every steering_check.py call (and ninja) runs under the same explicit ceiling; a timeout exits 124 and fails the step.
  const runner = hostSteeringRunner(script, repoRoot, { mode: mode === "off" ? "shadow" : mode, timeoutMs });
  const buildRunner: SteeringBuildRunner = (command) => runCommand(repoRoot, command, { timeoutMs });
  const fromReports = stringArg(args, "--from-reports", "").trim();
  const store = !dryRun && (record || apply) ? openState(globals.stateDir) : null;
  try {
    if (fromReports) {
      if (paths.length > 0 || stringArg(args, "--unit", "") || stringArg(args, "--function", "")) {
        throw new Error("steering-gate --from-reports takes the reports' own scope; drop --paths/--unit/--function");
      }
      const result = await runShardedSteeringBackfill({
        store, gameId, repoRoot, baseRev, headRev, reports: fromReports, record, apply, dryRun, runner,
        buildRunner, outputDir, validation: game?.validation, checkOptions, rebuild,
      });
      console.log(JSON.stringify({
        game_id: gameId,
        repo: repoRoot,
        base_rev: result.baseRev,
        head_rev: result.headRev,
        dry_run: dryRun,
        timeout_ms: timeoutMs,
        rebuild,
        reports: result.reports.length,
        recheck_failures: result.recheckFailures,
        failed_reports: result.failedReports,
        coverage_complete: result.coverageComplete,
        uncovered_files: result.uncoveredFiles,
        verified: result.verified,
        full: result.full,
        clean: result.clean,
        problems: result.problems,
        notes: result.notes,
        applied: result.applied,
        touched_files: result.touchedFiles,
        touched_units: result.touchedUnits,
        rebuilt: result.rebuilt,
        rechecks: result.recheckPaths,
        recorded: result.recorded,
        stack_only_cleared: result.stackOnlyCleared,
        units_clean: result.units.filter((unit) => unit.clean).length,
        units_unclean: result.units.filter((unit) => !unit.clean).map((unit) => unit.unit),
        not_pass: result.functions.filter((fn) => fn.final !== "pass"),
        functions_checked: result.functions.length,
        shared_groups: result.sharedGroups,
        summary: resolve(outputDir, "sharded-backfill.json"),
        next_steps: result.nextSteps,
      }, null, 2));
      return;
    }
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
      runner,
      buildRunner,
      outputDir,
      validation: game?.validation,
      checkOptions: { ...checkOptions, ...(paths.length > 0 ? { paths } : {}) },
      rebuild,
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
