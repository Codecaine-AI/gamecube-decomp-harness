import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";
import { gameBuildLayout, type GameBuildValidation } from "@server/core/game-registry/build-layout.js";
import type { StateStore } from "@server/core/orchestrator-state";
import { clearStackOnlyFunction } from "@server/core/harness-runtime/run-state/stack-only-functions.js";
import {
  recordSteeringBackfill,
  recordSteeringBackfillRun,
  recordSteeringCoverage,
} from "@server/core/harness-runtime/run-state/steering.js";
import {
  parseSteeringDecision,
  steeringInconclusiveProblem,
  steeringOrderCheckProblem,
  steeringViolationProblem,
  unitCovered,
  type SteeringDecision,
  type SteeringFunctionDecision,
  type SteeringRunner,
  type SteeringUnitCoverage,
  type SteeringViolation,
} from "@server/core/validation/steering/steering-check.js";
import {
  STEERING_SOURCE_ROOTS,
  appliedAndVerified,
  asArray,
  asObject,
  attachViolations,
  functionKey,
  gitSteeringOps,
  hostBuildProblem,
  invocationError,
  rewrittenReport,
  runCheck,
  SteeringRollbackLedger,
  shortGroupText,
  steeringFunctionReport,
  type CheckReport,
  type SteeringBackfillFunctionReport,
  type SteeringRebuild,
  type JsonObject,
  type SteeringBackfillFunction,
  type SteeringBackfillResult,
  type SteeringBackfillUnit,
  type SteeringBuildRunner,
  type SteeringCheckOptions,
  type SteeringGitOps,
} from "./steering-gate.js";

/**
 * Sharded steering backfill (`steering-gate --from-reports`). A whole-tree
 * `check` exceeds every practical budget, so the operator runs `check` in
 * shards (`--paths <a few sources> <every changed header>`) and this job
 * merges the reports. A sharded full run is judged like an unscoped one:
 * same baseline (every report's `head_rev` is HEAD and its `edits_hash`
 * still matches the tree), every changed file and unit covered, and clean
 * only when every analysed function ends `pass` (or applied and re-verified).
 *
 * File ownership. A changed file that is the source of a unit in exactly one
 * report is owned by that report; a source listed by two reports is an error
 * (shards must be disjoint). Every other changed file (the headers each shard
 * repeats) is shared.
 *
 * Shared files (headers) are never written by the sharded apply: each
 * report's `apply` runs with `--only-paths <its owned files>`, so a header
 * edit is never applied twice or from conflicting reports, and the
 * `edits_hash` of every later report still verifies. Each non-cosmetic group
 * of a shared file is listed in `shared_groups` with every report's status:
 * - `steering`: some report found it behaviour-identical (removable). It is a
 *   steering edit the sharded apply left in place, so the run is unclean
 *   until a scoped run (`--paths <header>,<its units' sources> --apply`)
 *   removes it.
 * - `unanalysed`: no report analysed it (no unit compiles the header, the
 *   `"<header> (no unit)"` pseudo-unit, or analysis incomplete). Listed, but it
 *   does not by itself make any unit unclean; units' own functions decide.
 * - `unresolved`: analysed and unresolved; dirties the units it names.
 * - `real`: a real change; nothing to do.
 * Header pseudo-units (`... (no unit)`) are never recorded as units.
 *
 * Unresolved (and rule-violating) functions stay listed under `not_pass`
 * and keep their unit and the run unclean; nothing here decides a policy.
 *
 * Attempt-level certification. Function rows can all pass while `decide`
 * rejects the attempt (missing link-map coverage for the UNUSED rule, a
 * shadow-root tool error, a header over the unit cap, a global budget). Each
 * report's `decision.attempt_issues` names those facts by category; every
 * category the per-unit judgement below does not already cover makes the run
 * unclean (and dirties the units it names, else the report's own units). The
 * one allowed residual is a changed header no unit compiles
 * (`header_no_unit`, `group_no_unit`, and the no-unit groups of
 * `unresolved_groups`): listed in `notes`, never judged. A non-pass report
 * without `attempt_issues` (an older checker) is unclean: rerun the shard.
 *
 * Repository identity: `apply` writes to the report's `edits.repo`, so every
 * report must have measured `--repo` itself (same realpath); a report of
 * another checkout (e.g. a host clone) is refused before anything is written.
 * A re-check that fails (timeout, tool error) leaves its functions
 * `unresolved` with the failure as a reason; it is never a pass.
 *
 * `--apply` then rebuilds only the touched objects plus `report.json`
 * (`ninja -j3`), re-checks each applied report with `--paths <touched
 * owned files> <its shared files>`, clears `stack_only_functions` rows in
 * touched units and records everything as provisional (no backfill run).
 * `--record` (no `--apply`) over reports that cover every changed file writes
 * the backfill run row the enforce preflight needs.
 */

export interface ShardReport {
  path: string;
  raw: JsonObject;
  decision: SteeringDecision;
  /** The check's `--paths`. */
  paths: string[];
  /** Changed files the check saw. */
  files: string[];
  /** unit -> source file, from `edits.units`. */
  unitSources: Map<string, string>;
  /** unit -> object path, from `edits.units`. */
  unitObjects: Map<string, string>;
  editsHash: string;
}

export type SharedGroupClass = "steering" | "unanalysed" | "unresolved" | "real";

export interface SteeringSharedGroup {
  id: string;
  file: string;
  location: string;
  shapes: string[];
  text: string;
  classification: SharedGroupClass;
  /** Report path -> the group's status there (`incomplete` when unanalysed). */
  statuses: Record<string, string>;
  units: string[];
}

export interface SteeringRecheckFailure {
  report: string;
  error: string;
}

export interface SteeringShardedBackfillResult extends SteeringBackfillResult {
  recheckFailures: SteeringRecheckFailure[];
  reports: string[];
  /** `*.failed.json` next to the matched reports: shards that produced no report. */
  failedReports: string[];
  /** Changed files (base..HEAD) no report saw. */
  uncoveredFiles: string[];
  coverageComplete: boolean;
  /** Every report's edits_hash re-verified against the tree (`--record`); null when not checked. */
  verified: boolean | null;
  sharedGroups: SteeringSharedGroup[];
  recheckPaths: string[];
  /** Facts listed for the operator that do not by themselves make the run unclean. */
  notes: string[];
}

/** `"include/X.hpp (no unit)"`: decide's coverage row for a changed file no unit compiles. */
export function isHeaderPseudoUnit(unit: string): boolean {
  return / \(no unit\)$/.test(unit);
}

const GLOB_CHARS = /[*?[\]{}]/;

/** Report files for `--from-reports`: comma-separated dirs (their `*.json`) or globs; `*.failed.json` excluded. */
export function resolveReportPaths(spec: string, cwd: string): { reports: string[]; failed: string[] } {
  const found = new Set<string>();
  for (const item of spec.split(",").map((part) => part.trim()).filter(Boolean)) {
    const absolute = isAbsolute(item) ? item : resolve(cwd, item);
    if (existsSync(absolute) && statSync(absolute).isDirectory()) {
      for (const name of readdirSync(absolute)) if (name.endsWith(".json")) found.add(join(absolute, name));
      continue;
    }
    if (!GLOB_CHARS.test(item)) {
      if (!existsSync(absolute)) throw new Error(`--from-reports: ${item} does not exist`);
      found.add(absolute);
      continue;
    }
    const segments = absolute.split("/");
    const firstGlob = segments.findIndex((segment) => GLOB_CHARS.test(segment));
    const root = segments.slice(0, firstGlob).join("/") || "/";
    const pattern = segments.slice(firstGlob).join("/");
    for (const match of new Bun.Glob(pattern).scanSync({ cwd: root, onlyFiles: true })) found.add(join(root, match));
  }
  const all = [...found].sort();
  return { reports: all.filter((path) => !path.endsWith(".failed.json")), failed: all.filter((path) => path.endsWith(".failed.json")) };
}

/** Siblings `*.failed.json` of the report directories: shards whose check failed. */
function failedSiblings(reports: string[]): string[] {
  const dirs = new Set(reports.map((path) => resolve(path, "..")));
  const failed: string[] = [];
  for (const dir of dirs) for (const name of readdirSync(dir)) if (name.endsWith(".failed.json")) failed.push(join(dir, name));
  return failed.sort();
}

function canonical(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

export function loadShardReport(path: string, expect: { baseRev: string; headRev: string; repoRoot?: string }): ShardReport {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`${path}: not JSON (${error instanceof Error ? error.message : String(error)})`);
  }
  const decision = parseSteeringDecision(raw);
  const record = asObject(raw);
  const edits = asObject(record.edits);
  if (!decision || Object.keys(edits).length === 0) throw new Error(`${path}: not a steering_check.py check report (needs edits and a valid decision)`);
  if (edits.overlay === true) throw new Error(`${path}: the check used --overlay-dir; the backfill needs checks of the working tree`);
  if (edits.base_rev !== expect.baseRev) throw new Error(`${path}: measured against base ${String(edits.base_rev)}, not --base ${expect.baseRev}`);
  if (edits.head_rev !== expect.headRev) throw new Error(`${path}: checked HEAD ${String(edits.head_rev)}, but the checkout is at ${expect.headRev}; rerun that shard`);
  if (expect.repoRoot !== undefined) {
    // `apply` writes to `edits.repo`: the report must have measured --repo itself.
    if (typeof edits.repo !== "string" || canonical(edits.repo) !== canonical(expect.repoRoot)) {
      throw new Error(`${path}: measured repo ${String(edits.repo)}, not --repo ${expect.repoRoot}; a report applies only to the checkout it checked`);
    }
  }
  const unitSources = new Map<string, string>();
  const unitObjects = new Map<string, string>();
  for (const row of asArray(edits.units)) {
    const unit = asObject(row);
    if (typeof unit.unit !== "string") continue;
    if (typeof unit.source === "string") unitSources.set(unit.unit, unit.source);
    if (typeof unit.object === "string") unitObjects.set(unit.unit, unit.object);
  }
  return {
    path,
    raw: record,
    decision,
    paths: asArray(edits.paths).filter((item): item is string => typeof item === "string"),
    files: asArray(edits.files).map((file) => asObject(file).path).filter((item): item is string => typeof item === "string"),
    unitSources,
    unitObjects,
    editsHash: typeof edits.edits_hash === "string" ? edits.edits_hash : "",
  };
}

function capList(items: string[], limit = 25): string {
  return items.length <= limit ? items.join(", ") : `${items.slice(0, limit).join(", ")} and ${items.length - limit} more`;
}

function functionLabel(fn: { name: string; match: SteeringFunctionDecision["match"] }): string {
  return fn.match.real_only == null ? fn.name : `${fn.name} (without steering: ${fn.match.real_only}%)`;
}

interface Finding {
  kind: "violation" | "inconclusive" | "unknown_order";
  file: string;
  unit?: string;
  problem: string;
  violation?: SteeringViolation;
}

/** Groups of a report by id, with decide's final status where it reported one. */
function reportGroups(report: ShardReport): Array<JsonObject & { id: string; file: string; finalStatus: string }> {
  const statuses = asObject(asObject(report.raw.decision).group_statuses);
  return asArray(asObject(report.raw.reduce).groups).map(asObject)
    .filter((group): group is JsonObject & { id: string; file: string } => typeof group.id === "string" && typeof group.file === "string")
    .map((group) => ({ ...group, finalStatus: typeof statuses[group.id] === "string" ? String(statuses[group.id]) : String(group.status ?? "unresolved") }));
}

export async function runShardedSteeringBackfill(params: {
  store: StateStore | null;
  gameId: string;
  repoRoot: string;
  baseRev: string;
  headRev: string;
  /** `--from-reports` spec (dirs/globs, comma-separated) or explicit report paths. */
  reports: string | string[];
  record: boolean;
  apply: boolean;
  dryRun: boolean;
  runner: SteeringRunner;
  buildRunner: SteeringBuildRunner;
  outputDir: string;
  validation?: GameBuildValidation | null;
  git?: SteeringGitOps;
  /** Re-check options (`--budget-seconds`, `--max-groups`, `--cache-dir`); `paths` is set per report. */
  checkOptions?: Omit<SteeringCheckOptions, "paths">;
  cwd?: string;
  rebuild?: SteeringRebuild;
  /** Defaults to `hostBuildProblem`; tests inject one. */
  buildCheck?: (repoRoot: string) => string | null;
}): Promise<SteeringShardedBackfillResult> {
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
  const resolved = Array.isArray(params.reports)
    ? { reports: [...params.reports].map((path) => resolve(params.cwd ?? process.cwd(), path)).sort(), failed: [] as string[] }
    : resolveReportPaths(params.reports, params.cwd ?? process.cwd());
  if (resolved.reports.length === 0) throw new Error(`--from-reports matched no check reports (${String(params.reports)})`);
  const failedReports = [...new Set([...resolved.failed, ...failedSiblings(resolved.reports)])].sort();
  const reports = resolved.reports.map((path) => loadShardReport(path, { baseRev: params.baseRev, headRev: params.headRev, repoRoot: params.repoRoot }));
  if (params.apply && !params.dryRun) {
    const problem = (params.buildCheck ?? hostBuildProblem)(params.repoRoot);
    if (problem) throw new Error(`steering-gate --apply refuses before writing anything: ${problem}`);
  }
  mkdirSync(params.outputDir, { recursive: true });

  // ---- ownership -------------------------------------------------------------------------------
  const listedBy = new Map<string, ShardReport[]>();
  for (const report of reports) for (const file of report.files) listedBy.set(file, [...(listedBy.get(file) ?? []), report]);
  const sourceOwner = new Map<string, ShardReport>();
  const unitSource = new Map<string, string>();
  const unitObject = new Map<string, string>();
  for (const report of reports) {
    for (const [unit, source] of report.unitSources) {
      unitSource.set(unit, source);
      const object = report.unitObjects.get(unit);
      if (object) unitObject.set(unit, object);
      if (!report.files.includes(source)) continue;
      const listing = listedBy.get(source) ?? [];
      if (listing.length > 1) {
        throw new Error(`reports overlap on ${source} (${listing.map((row) => row.path).join(", ")}); each changed source must be checked by exactly one report`);
      }
      sourceOwner.set(source, report);
    }
  }
  const owned = new Map(reports.map((report) => [report, report.files.filter((file) => sourceOwner.get(file) === report).sort()]));
  const sharedFiles = new Set([...listedBy.keys()].filter((file) => !sourceOwner.has(file)));
  const unitOwner = (unit: string): ShardReport | undefined => {
    const source = unitSource.get(unit);
    return source ? sourceOwner.get(source) : undefined;
  };
  const fileUnits = (file: string): string[] => [...unitSource.entries()].filter(([, source]) => source === file).map(([unit]) => unit);

  // ---- coverage of every changed file at the baseline ------------------------------------------
  const changed = params.record ? (git.changedSinceBase ?? gitSteeringOps.changedSinceBase)(params.repoRoot, params.baseRev) : [];
  const uncoveredFiles = changed.filter((file) => !listedBy.has(file));
  const coverageComplete = params.record && uncoveredFiles.length === 0 && failedReports.length === 0;

  // ---- reports still describe this tree (`edits_hash`) -----------------------------------------
  let verified: boolean | null = null;
  if (params.record) {
    const stale: string[] = [];
    for (const report of reports) {
      const result = await params.runner(["edits", "--repo", params.repoRoot, "--base-ref", params.baseRev, "--paths", ...report.paths, "--json"], "host");
      if (result.exitCode !== 0) throw new Error(invocationError(result, "steering_check.py edits"));
      let hash: unknown;
      try {
        hash = asObject(JSON.parse(result.stdout)).edits_hash;
      } catch {
        hash = undefined;
      }
      if (typeof hash !== "string" || hash !== report.editsHash) stale.push(report.path);
    }
    if (stale.length > 0) {
      throw new Error(`these reports no longer match the working tree (edits_hash changed): ${capList(stale, 10)}; rerun those shards`);
    }
    verified = true;
  }

  // ---- functions: the owning report's rows; units without an owner merge (any non-pass wins) ---
  const entries = new Map<string, { fn: SteeringFunctionDecision; report: ShardReport; decision: SteeringFunctionDecision["decision"] }>();
  for (const report of reports) {
    for (const fn of report.decision.functions) {
      const owner = unitOwner(fn.unit);
      if (owner && owner !== report) continue;
      const key = functionKey(fn);
      const existing = entries.get(key);
      if (existing && (existing.decision !== "pass" || fn.decision === "pass")) continue;
      entries.set(key, { fn, report, decision: fn.decision });
    }
  }
  const coverage = new Map<string, SteeringUnitCoverage & { report: string }>();
  for (const report of reports) {
    for (const row of report.decision.units ?? []) {
      if (isHeaderPseudoUnit(row.unit)) continue;
      const owner = unitOwner(row.unit);
      if (owner && owner !== report) continue;
      const existing = coverage.get(row.unit);
      if (existing && !unitCovered(existing)) continue;
      coverage.set(row.unit, { ...row, report: report.path });
    }
  }

  // ---- findings (deduplicated: shared files repeat in every report) ----------------------------
  const findings = new Map<string, Finding>();
  for (const report of reports) {
    const keep = (file: string) => sharedFiles.has(file) || sourceOwner.get(file) === report || !listedBy.has(file);
    for (const violation of report.decision.violations ?? []) {
      if (!keep(violation.file)) continue;
      findings.set(JSON.stringify(["v", violation]), { kind: "violation", file: violation.file, ...(violation.unit ? { unit: violation.unit } : {}), problem: steeringViolationProblem(violation), violation });
    }
    for (const check of report.decision.unused_checks ?? []) {
      if (check.status !== "inconclusive" || !keep(check.file)) continue;
      findings.set(JSON.stringify(["u", check.unit, check.file, check.function]), { kind: "inconclusive", file: check.file, unit: check.unit, problem: steeringInconclusiveProblem(check) });
    }
    for (const check of report.decision.order_checks ?? []) {
      if (check.status !== "unknown" || !keep(check.file)) continue;
      findings.set(JSON.stringify(["o", check.file, check.line, check.class]), { kind: "unknown_order", file: check.file, problem: steeringOrderCheckProblem(check) });
    }
  }

  // ---- shared groups ----------------------------------------------------------------------------
  const shared = new Map<string, SteeringSharedGroup & { analysed: boolean[] }>();
  for (const report of reports) {
    for (const group of reportGroups(report)) {
      if (!sharedFiles.has(group.file) || group.cosmetic === true) continue;
      const units = asArray(group.units).filter((unit): unit is string => typeof unit === "string" && !isHeaderPseudoUnit(unit));
      const analysed = group.incomplete !== true && units.length > 0;
      const row = shared.get(group.id) ?? {
        id: group.id,
        file: group.file,
        location: typeof group.line === "number" ? `${group.file}:${group.line}` : group.file,
        shapes: asArray(group.shapes).filter((shape): shape is string => typeof shape === "string"),
        text: shortGroupText(group.cand_lines),
        classification: "unanalysed" as SharedGroupClass,
        statuses: {},
        units: [],
        analysed: [],
      };
      row.statuses[report.path] = analysed ? group.finalStatus : `${group.finalStatus} (incomplete)`;
      row.units = [...new Set([...row.units, ...units])].sort();
      row.analysed.push(analysed);
      if (group.finalStatus === "removable") row.classification = "steering";
      else if (row.classification !== "steering" && analysed && group.finalStatus === "unresolved") row.classification = "unresolved";
      else if (row.classification === "unanalysed" && analysed) row.classification = "real";
      shared.set(group.id, row);
    }
  }
  const sharedGroups: SteeringSharedGroup[] = [...shared.values()].map(({ analysed: _analysed, ...row }) => row)
    .sort((a, b) => a.id.localeCompare(b.id));

  // ---- apply ------------------------------------------------------------------------------------
  const touchedUnits = new Set<string>();
  const recheckFailures: SteeringRecheckFailure[] = [];
  const recheckErrors = new Map<ShardReport, string>();
  let touchedFiles: string[] = [];
  let rebuilt: string[] = [];
  const recheckPaths: string[] = [];
  const rechecks = new Map<ShardReport, CheckReport & { path: string }>();
  let applied = false;
  const ownedRemovable = (report: ShardReport) => reportGroups(report)
    .filter((group) => group.status === "removable" && group.cosmetic !== true && sourceOwner.get(group.file) === report);
  const ownedViolations = (report: ShardReport) => (report.decision.violations ?? []).filter((violation) => sourceOwner.get(violation.file) === report);
  const toApply = reports.filter((report) => ownedRemovable(report).length > 0 || ownedViolations(report).length > 0);

  const attachments = new Map(reports.map((report) => [report, attachViolations(report.raw, report.decision)]));
  const probeFor = (report: ShardReport, fn: { unit: string; name: string }) =>
    report.decision.probes.find((probe) => probe.unit === fn.unit && (probe.function === fn.name || probe.symbol === fn.name)) ?? null;
  const ledger = new SteeringRollbackLedger(writes ? params.store : null, params);
  const ledgerKeys = new Map<ShardReport, string[]>();

  if (params.apply && toApply.length > 0) {
    const allowed = new Set(toApply.flatMap((report) => owned.get(report) ?? []));
    for (const report of toApply) {
      const result = await params.runner(["apply", "--report", report.path, "--only-paths", ...(owned.get(report) ?? []), ...(params.dryRun ? ["--dry-run"] : [])], "host");
      if (result.exitCode !== 0) throw new Error(`${invocationError(result, "steering_check.py apply")} (report ${report.path})`);
      if (params.dryRun) continue;
      applied = true;
      // This report's sources are rewritten: record its rollback events now, before the next apply,
      // the rebuild or a re-check can fail (shards 1..N-1 keep theirs when shard N fails).
      touchedFiles = git.changedPaths(params.repoRoot);
      const escaped = touchedFiles.filter((file) => !allowed.has(file));
      if (escaped.length > 0) throw new Error(`steering_check.py apply wrote files outside the applied reports' own sources: ${escaped.join(", ")}; review the working tree before rebuilding`);
      const units = new Set<string>();
      for (const file of (owned.get(report) ?? []).filter((path) => touchedFiles.includes(path))) for (const unit of fileUnits(file)) units.add(unit);
      for (const violation of ownedViolations(report)) for (const unit of violation.unit ? [violation.unit] : fileUnits(violation.file)) units.add(unit);
      for (const unit of units) touchedUnits.add(unit);
      const opened = [...entries.entries()].filter(([, entry]) => entry.report === report && units.has(entry.fn.unit)).map(([key, entry]) => {
        const fn: SteeringBackfillFunction = { unit: entry.fn.unit, name: entry.fn.name, initial: entry.fn.decision, final: entry.fn.decision, applied: false, match: entry.fn.match };
        return {
          key,
          fn,
          report: rewrittenReport({
            baseRev: params.baseRev, initial: { raw: report.raw, decision: report.decision, path: report.path }, fn,
            probe: probeFor(report, fn), violations: attachments.get(report)?.byFunction.get(key) ?? [],
            groupFilter: (file: string) => !sharedFiles.has(file),
          }),
        };
      });
      ledger.open(opened);
      ledgerKeys.set(report, opened.map((row) => row.key));
    }
    if (!params.dryRun) {
      if ((params.rebuild ?? "ninja") === "ninja") {
        const layout = gameBuildLayout(params.validation);
        rebuilt = [...new Set([...touchedUnits].map((unit) => unitObject.get(unit) ?? layout.objectPathForUnit(unit)).filter((path): path is string => Boolean(path)))].sort();
        const reportPath = params.validation?.reportPath ?? `${layout.buildDir}/report.json`;
        const build = await params.buildRunner(["ninja", "-j3", ...rebuilt, reportPath]);
        if (build.exitCode !== 0) {
          ledger.mark("rebuild_failed");
          throw new Error(invocationError(build, "ninja"));
        }
      }
      let index = 0;
      for (const report of toApply) {
        const touched = (owned.get(report) ?? []).filter((file) => touchedFiles.includes(file));
        if (touched.length === 0) continue;
        index += 1;
        const recheckPath = resolve(params.outputDir, `recheck-${String(index).padStart(3, "0")}-${basename(report.path)}`);
        const paths = [...touched, ...report.paths.filter((path) => !sourceOwner.has(path))];
        let recheck: CheckReport;
        try {
          recheck = await runCheck({
            runner: params.runner, repoRoot: params.repoRoot, baseRev: params.baseRev, functions: [], outPath: recheckPath,
            options: { ...params.checkOptions, paths },
          });
        } catch (error) {
          // A timed-out or failed re-check is a failed report, never a pass: its functions stay unresolved.
          const message = error instanceof Error ? error.message : String(error);
          recheckFailures.push({ report: report.path, error: message });
          recheckErrors.set(report, message);
          ledger.mark("recheck_failed", ledgerKeys.get(report) ?? []);
          for (const entry of entries.values()) if (entry.report === report && touchedUnits.has(entry.fn.unit)) entry.decision = "unresolved";
          continue;
        }
        rechecks.set(report, { ...recheck, path: recheckPath });
        recheckPaths.push(recheckPath);
        const after = new Map(recheck.decision.functions.map((fn) => [functionKey(fn), fn]));
        for (const [key, entry] of entries) {
          if (entry.report !== report || !touchedUnits.has(entry.fn.unit)) continue;
          entry.decision = after.get(key)?.decision ?? "unresolved";
        }
        for (const fn of recheck.decision.functions) {
          if (touchedUnits.has(fn.unit) && unitOwner(fn.unit) === report && !entries.has(functionKey(fn))) {
            entries.set(functionKey(fn), { fn: { ...fn }, report, decision: fn.decision });
          }
        }
      }
    }
  }

  const initialKeys = new Map<string, boolean>();
  for (const report of reports) for (const fn of report.decision.functions) initialKeys.set(functionKey(fn), true);
  const recheckAttachments = new Map([...rechecks.entries()].map(([report, recheck]) => [report, attachViolations(recheck.raw, recheck.decision)]));
  const functionReports = new Map<string, SteeringBackfillFunctionReport>();
  const functions: Array<SteeringBackfillFunction & { report: ShardReport }> = [...entries.entries()].map(([key, entry]) => {
    const fn: SteeringBackfillFunction & { report: ShardReport } = {
      unit: entry.fn.unit,
      name: entry.fn.name,
      initial: initialKeys.has(key) ? entry.fn.decision : "absent",
      final: entry.decision,
      applied: false,
      match: entry.fn.match,
      report: entry.report,
    };
    const touched = applied && touchedUnits.has(fn.unit);
    const recheck = touched ? rechecks.get(entry.report) ?? null : null;
    const report = steeringFunctionReport({
      baseRev: params.baseRev,
      initial: { raw: entry.report.raw, decision: entry.report.decision, path: entry.report.path },
      recheck,
      fn,
      provisional: applied,
      probe: probeFor(entry.report, fn),
      violations: attachments.get(entry.report)?.byFunction.get(key) ?? [],
      recheckViolations: recheck ? recheckAttachments.get(entry.report)?.byFunction.get(key) ?? [] : [],
      recheckError: touched ? recheckErrors.get(entry.report) ?? null : null,
      // The sharded apply writes only each report's own sources: shared-header groups were not removed.
      ...(applied ? { groupFilter: (file: string) => !sharedFiles.has(file) } : {}),
    });
    fn.applied = touched && appliedAndVerified(fn, true, report.rules);
    functionReports.set(key, { ...report, applied: fn.applied });
    return fn;
  });
  const unattachedViolations = [...attachments.values()].flatMap((attached) => attached.unattached);

  // ---- judge ------------------------------------------------------------------------------------
  const problems: string[] = [];
  const notes: string[] = [];
  const dirty = new Map<string, string[]>();
  const allUnits = new Set<string>([...coverage.keys(), ...functions.map((fn) => fn.unit)]);
  for (const report of reports) for (const unit of report.unitSources.keys()) if (unitOwner(unit) === report || !unitOwner(unit)) allUnits.add(unit);
  const markDirty = (units: Iterable<string>, why: string) => {
    for (const unit of units) dirty.set(unit, [...(dirty.get(unit) ?? []), why]);
  };

  const byDecision = (kind: SteeringFunctionDecision["decision"]) => functions.filter((fn) => fn.final === kind);
  if (byDecision("steering_located").length > 0) problems.push(`steering located in ${capList(byDecision("steering_located").map(functionLabel))}`);
  if (byDecision("unresolved").length > 0) problems.push(`unresolved: ${capList(byDecision("unresolved").map(functionLabel))}`);
  if (byDecision("rule_violation").length > 0) problems.push(`rule violation in ${capList(byDecision("rule_violation").map((fn) => fn.name))}`);
  const finalRow = (fn: (typeof functions)[number]) => (rechecks.get(fn.report)?.decision.functions ?? fn.report.decision.functions)
    .find((row) => row.unit === fn.unit && row.name === fn.name);
  const inconsistent = functions.filter((fn) => {
    const row = finalRow(fn);
    return fn.final === "pass" && row !== undefined && (row.semantic !== "clean" || row.analysis !== "complete");
  });
  if (inconsistent.length > 0) problems.push(`pass without clean, complete analysis: ${capList(inconsistent.map((fn) => fn.name))}`);
  markDirty(inconsistent.map((fn) => fn.unit), "pass without clean, complete analysis");

  for (const finding of findings.values()) {
    problems.push(finding.problem);
    const units = finding.unit ? [finding.unit] : fileUnits(finding.file);
    // A finding no unit owns dirties every unit (fail closed).
    markDirty(units.length > 0 ? units : allUnits, finding.problem);
  }

  const uncovered = [...allUnits].filter((unit) => !coverage.has(unit) || !unitCovered(coverage.get(unit)!)).sort();
  if (uncovered.length > 0) problems.push(`units not built and compared: ${capList(uncovered)}`);

  for (const report of reports) {
    const unresolvedIds = new Set(report.decision.unresolved_groups ?? reportGroups(report).filter((group) => group.status === "unresolved").map((group) => group.id));
    const left: string[] = [];
    for (const group of reportGroups(report)) {
      if (sourceOwner.get(group.file) !== report) continue;
      const units = fileUnits(group.file);
      if (group.status === "removable" && group.cosmetic !== true && !(applied && touchedFiles.includes(group.file))) {
        left.push(group.id);
        markDirty(units, `behaviour-identical edit group left: ${group.id}`);
      } else if (unresolvedIds.has(group.id) || group.incomplete === true) {
        markDirty(units, `unresolved edit group: ${group.id}`);
      }
    }
    if (left.length > 0 && !applied) problems.push(`behaviour-identical edit groups left in ${basename(report.path)}: ${capList(left)}`);
    const global = asArray(asObject(report.raw.reduce).global_incomplete).filter((reason): reason is string => typeof reason === "string");
    if (global.length > 0) {
      problems.push(`reduction incomplete in ${report.path}: ${global.join("; ")}`);
      markDirty([...report.unitSources.keys()].filter((unit) => unitOwner(unit) === report), "reduction incomplete");
    }
  }

  // ---- attempt-level issues (decide's `attempt_issues`, by category) ---------------------------------
  const headerResidual = new Set<string>();
  const ownedUnitsOf = (report: ShardReport) => [...report.unitSources.keys()].filter((unit) => unitOwner(unit) === report);
  const groupById = (report: ShardReport) => new Map(reportGroups(report).map((group) => [group.id, group]));
  const noUnitShared = (group: (ReturnType<typeof reportGroups>)[number] | undefined) => Boolean(group)
    && sharedFiles.has(group!.file) && asArray(group!.units).filter((unit) => typeof unit === "string" && !isHeaderPseudoUnit(unit)).length === 0;
  // Categories the per-unit judgement above already covers (function rows, findings, coverage, owned and shared groups).
  const JUDGED = new Set(["steering_functions", "unresolved_functions", "removable_noncosmetic", "uncovered_unit",
    "dead_unused_body", "out_of_order", "unused_inconclusive", "order_unknown"]);
  for (const report of reports) {
    if (report.decision.attempt === "pass") continue;
    const name = basename(report.path);
    const raw = asObject(report.raw.decision).attempt_issues;
    if (!Array.isArray(raw)) {
      problems.push(`${name}: attempt ${report.decision.attempt} (${capList(report.decision.reasons, 3)}) without structured attempt_issues (the report predates them); rerun the shard`);
      markDirty(ownedUnitsOf(report), "attempt not certified (no attempt_issues)");
      continue;
    }
    const groups = groupById(report);
    for (const entry of raw.map(asObject)) {
      const category = typeof entry.category === "string" ? entry.category : "unknown";
      const units = asArray(entry.units).filter((unit): unit is string => typeof unit === "string" && !isHeaderPseudoUnit(unit));
      const files = asArray(entry.files).filter((file): file is string => typeof file === "string");
      const ids = asArray(entry.groups).filter((id): id is string => typeof id === "string");
      const detail = typeof entry.detail === "string" && entry.detail ? `: ${entry.detail}` : "";
      if (category === "header_no_unit" && files.length > 0 && files.every((file) => sharedFiles.has(file))) {
        for (const file of files) headerResidual.add(file);
        continue;
      }
      if (category === "group_no_unit" && ids.length > 0 && ids.every((id) => noUnitShared(groups.get(id)))) {
        for (const id of ids) headerResidual.add(groups.get(id)!.file);
        continue;
      }
      if (category === "unresolved_groups") continue; // owned and shared groups are judged above; no-unit shared ones are the residual
      if (JUDGED.has(category)) continue;
      if (category === "unit_oracle_failed" || category === "group_incomplete") {
        markDirty(units.length > 0 ? units : ownedUnitsOf(report), `${category}${detail}`);
        continue;
      }
      // Anything else (tool, tool_error, unused_map_gap, header_cap, global, unstructured, unknown): not certified.
      problems.push(`${name}: attempt ${report.decision.attempt}: ${category}${units.length > 0 ? ` (${capList(units, 6)})` : ""}${detail}`);
      markDirty(units.length > 0 ? units : ownedUnitsOf(report), `attempt issue ${category}`);
    }
  }
  if (headerResidual.size > 0) {
    notes.push(`header residual (changed files no unit compiles; listed, not judged): ${capList([...headerResidual].sort(), 10)}`);
  }
  if (recheckFailures.length > 0) {
    problems.push(`re-check failed (functions left unresolved): ${capList(recheckFailures.map((row) => `${basename(row.report)}: ${row.error.slice(0, 200)}`), 5)}`);
  }
  if (unattachedViolations.length > 0) {
    notes.push(`rule violations no function row names (rolled back by the apply, not attached to a function): ${capList(unattachedViolations.map((violation) => `${violation.kind} ${violation.file}${violation.line != null ? `:${violation.line}` : ""}`), 10)}`);
  }

  const steeringShared = sharedGroups.filter((group) => group.classification === "steering");
  if (steeringShared.length > 0) {
    problems.push(
      `behaviour-identical edits in shared files that the sharded apply never writes: ${capList(steeringShared.map((group) => group.location))}; `
        + "remove them with a scoped run (steering-gate --paths <header>,<its units' sources> --apply) or by hand",
    );
    for (const group of steeringShared) markDirty(group.units, `steering in shared file: ${group.location}`);
  }
  for (const group of sharedGroups.filter((row) => row.classification === "unresolved")) markDirty(group.units, `unresolved shared group: ${group.location}`);
  const unanalysed = sharedGroups.filter((group) => group.classification === "unanalysed");
  if (unanalysed.length > 0) {
    notes.push(`${unanalysed.length} shared (header) edit groups were not analysed by any report (no unit compiles them); listed under shared_groups, not judged: ${capList(unanalysed.map((group) => group.location), 10)}`);
  }

  if (params.record) {
    if (failedReports.length > 0) problems.push(`failed shards (no report): ${capList(failedReports, 10)}`);
    if (uncoveredFiles.length > 0) problems.push(`changed files no report covers: ${capList(uncoveredFiles)}`);
  }
  if (applied) problems.unshift("applied: the cleanup is uncommitted; commit it, rerun the check shards on the new HEAD and record them with --from-reports --record");

  const units: SteeringBackfillUnit[] = [...allUnits].sort().map((unit) => {
    const row = coverage.get(unit);
    const unitClean = !applied
      && Boolean(row && unitCovered(row))
      && !dirty.has(unit)
      && functions.filter((fn) => fn.unit === unit).every((fn) => fn.final === "pass");
    return {
      unit,
      clean: unitClean,
      provisional: applied,
      coverage: row ? { built: row.built, compared: row.compared, ...(row.exempt !== undefined ? { exempt: row.exempt } : {}) } : null,
    };
  });
  const clean = !applied && coverageComplete && problems.length === 0 && units.every((unit) => unit.clean);
  if (!coverageComplete && params.record && problems.length === 0) problems.push("reports do not cover every changed file");

  // ---- record -----------------------------------------------------------------------------------
  let recorded = 0;
  let stackOnlyCleared = 0;
  const store = params.store;
  if (store && writes) {
    for (const fn of functions) {
      const report = functionReports.get(functionKey(fn))!;
      recordSteeringBackfill(store, {
        gameId: params.gameId,
        unit: fn.unit,
        symbol: fn.name,
        analyzedRev: params.headRev,
        verdict: fn.final,
        applied: fn.applied,
        appliedRev: null,
        report: report as unknown as Record<string, unknown>,
      });
      recorded += 1;
      if (applied && touchedUnits.has(fn.unit)) ledger.finish(fn, report, recheckErrors.has(fn.report));
    }
    for (const unit of units) {
      const row = coverage.get(unit.unit);
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
          check: row?.report ?? unitOwner(unit.unit)?.path ?? null,
          sharded: true,
          ...(dirty.has(unit.unit) ? { dirty: dirty.get(unit.unit) } : {}),
        },
      });
    }
    if (params.record && !applied && coverageComplete) recordSteeringBackfillRun(store, { gameId: params.gameId, baselineRev: params.headRev, clean });
  }
  if (store && applied) {
    for (const fn of functions.filter((row) => touchedUnits.has(row.unit))) {
      clearStackOnlyFunction(store, { gameId: params.gameId, unit: fn.unit, symbol: fn.name });
      stackOnlyCleared += 1;
    }
  }

  const nextSteps = applied
    ? [
        "Review the rewritten sources (git diff), then commit them through the normal integration path.",
        "Rerun the check shards on the new HEAD, then steering-gate --from-reports <reports> --record (no --apply) to certify it.",
      ]
    : !clean && params.record
      ? ["Fix or --apply the functions listed under not_pass (and the problems), commit, rerun the affected shards and record again."]
      : [];

  const result: SteeringShardedBackfillResult = {
    gameId: params.gameId,
    baseRev: params.baseRev,
    headRev: params.headRev,
    full: coverageComplete,
    functions: functions.map(({ report: _report, ...fn }) => fn),
    units,
    clean,
    problems,
    applied,
    touchedFiles,
    touchedUnits: [...touchedUnits].sort(),
    rebuilt,
    recorded,
    stackOnlyCleared,
    checkPath: Array.isArray(params.reports) ? params.reports.join(",") : params.reports,
    recheckPath: recheckPaths[0] ?? null,
    nextSteps,
    reports: reports.map((report) => report.path),
    recheckFailures,
    failedReports,
    uncoveredFiles,
    coverageComplete,
    verified,
    sharedGroups,
    recheckPaths,
    notes,
  };
  writeFileSync(resolve(params.outputDir, "sharded-backfill.json"), `${JSON.stringify(result, null, 2)}\n`);
  return result;
}
