/**
 * Map-symbol validation shared by the worker micro-gate, the epoch boundary
 * sync, and Sync validation. It runs the checkout's own CI driver
 * (`tools/check-changed-symbol-order.py --baseline-dir <base build> <files>`)
 * inside a game sandbox whose image bakes the linker map; no harness-side copy
 * of the validator exists. The exec callback is the sandbox command runner
 * (worker session exec or the build task worker), rooted at the checkout.
 *
 * Baseline objects come from one of two places, in order:
 *   1. a directory of already-built base-revision objects plus its
 *      objdiff.json (the pre-attempt object a worker session built, or the
 *      warm image objects when the baseline is the baked revision);
 *   2. a detached worktree of the baseline revision configured against the
 *      sandbox's toolchain and built for the changed units only, exactly the
 *      way upstream CI builds its symbol-validation baseline.
 */
import type { CommandResult, RunCommandOptions } from "@server/infrastructure/shell/run-command.js";
import type { GameSymbolCheckConfig } from "@server/core/game-registry/build-layout.js";

export type { GameSymbolCheckConfig };

/** The CI driver only validates C++ translation units. */
export const SYMBOL_CHECK_SOURCE_RE = /\.cpp$/i;
/** Sandbox-local directory of snapshotted baseline objects (`<dir>/objdiff.json` + `<dir>/<base_path>`). */
export const SYMBOL_BASELINE_DIR = "/tmp/symbol-baseline";
/** Sandbox-local detached worktree used when baseline objects have to be built. */
export const SYMBOL_BASELINE_WORKTREE = "/tmp/symbol-baseline-src";
const DEFAULT_TIMEOUT_MS = 20 * 60_000;
const OUTPUT_TAIL = 20_000;

export type SymbolCheckCommandRunner = (command: string[], options?: RunCommandOptions) => Promise<CommandResult>;

export interface SymbolCheckUnitResult {
  source: string;
  unit: string | null;
  /** passed/failed come from the validator's RESULT line; skipped is an untracked file; error means the check could not run for this unit. */
  status: "passed" | "failed" | "skipped" | "error";
  /** The validator's `RESULT: ...` line without the prefix. */
  result: string | null;
  newErrors: number | null;
  inheritedErrors: number | null;
  resolvedErrors: number | null;
  /** `[NEW] kind | symbol ...` lines: errors present now that the baseline object did not have. */
  newLines: string[];
  /** Strict-mode `[FAIL]` blocks (a unit whose source did not exist at the baseline has no inherited debt). */
  failLines: string[];
  /** Driver-level reason for skipped/error units. */
  message: string | null;
}

export interface SymbolCheckResult {
  status: "clean" | "regressions" | "tool_unavailable";
  files: string[];
  units: SymbolCheckUnitResult[];
  mapPath: string;
  validator: { script: string; revision: string | null };
  baseline: { revision: string | null; dir: string | null; source: "provided" | "worktree_build" | null };
  driverExitCode: number | null;
  toolError: string | null;
  /** Tail of the driver's combined output, for evidence. */
  output: string;
}

export interface SymbolCheckBaseline {
  /** Directory holding baseline objects and objdiff.json; used when it covers every changed unit. */
  dir?: string | null;
  /** Revision to build baseline objects from when `dir` is missing or incomplete. */
  revision?: string | null;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

/** Sorted, de-duplicated `.cpp` paths from any path list. */
export function symbolCheckSourcePaths(paths: Iterable<string>): string[] {
  const unique = new Set<string>();
  for (const raw of paths) {
    const path = normalizePath(raw.trim());
    if (path && SYMBOL_CHECK_SOURCE_RE.test(path)) unique.add(path);
  }
  return [...unique].sort();
}

/** Post-image `.cpp` paths touched by a `git diff` text. */
export function changedCppPathsFromDiff(diffText: string): string[] {
  const paths: string[] = [];
  for (const line of diffText.split(/\r?\n/)) {
    const match = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
    if (match?.[2]) paths.push(match[2]);
  }
  return symbolCheckSourcePaths(paths);
}

const SECTION_RULE = /^=+$/;
const SECTION_HEADER = /^(\S.*?\.cpp)  ->  (\S+)\s*$/;
const DRIVER_SKIP = /^skip\s+(\S+)\s+\((.*)\)\s*$/;
const DRIVER_FAIL_UNIT = /^FAIL\s+(\S+)\s+\(([^:]+):\s*(.*)\)\s*$/;
const DRIVER_FAIL_PLAIN = /^FAIL\s+(\S+):\s*(.*)$/;
const REGRESSIONS = /^Symbol regressions:\s*(\d+) new,\s*(\d+) inherited,\s*(\d+) resolved\./;

function emptyUnit(source: string, unit: string | null): SymbolCheckUnitResult {
  return { source, unit, status: "error", result: null, newErrors: null, inheritedErrors: null, resolvedErrors: null, newLines: [], failLines: [], message: null };
}

/** Per-unit results out of the CI driver's stdout (run with PYTHONUNBUFFERED so driver and validator lines interleave in order). */
export function parseSymbolCheckOutput(stdout: string): SymbolCheckUnitResult[] {
  const lines = stdout.split(/\r?\n/);
  const units: SymbolCheckUnitResult[] = [];
  let current: SymbolCheckUnitResult | null = null;
  let inFailBlock = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const header = SECTION_HEADER.exec(line);
    if (header && index > 0 && SECTION_RULE.test(lines[index - 1]!.trim())) {
      current = emptyUnit(normalizePath(header[1]!), header[2]!);
      current.status = "error";
      units.push(current);
      inFailBlock = false;
      continue;
    }
    const skipped = DRIVER_SKIP.exec(line);
    if (skipped) {
      units.push({ ...emptyUnit(normalizePath(skipped[1]!), null), status: "skipped", message: skipped[2]! });
      current = null;
      continue;
    }
    const failedUnit = DRIVER_FAIL_UNIT.exec(line);
    const failedPlain = failedUnit ? null : DRIVER_FAIL_PLAIN.exec(line);
    if (failedUnit || failedPlain) {
      const source = normalizePath((failedUnit ?? failedPlain)![1]!);
      const message = failedUnit ? failedUnit[3]! : failedPlain![2]!;
      const owner = current && current.source === source ? current : null;
      if (owner) {
        owner.status = "error";
        owner.message = message;
      } else {
        units.push({ ...emptyUnit(source, failedUnit?.[2] ?? null), status: "error", message });
      }
      current = null;
      continue;
    }
    if (!current) continue;
    if (SECTION_RULE.test(line.trim())) { inFailBlock = false; continue; }
    const regressions = REGRESSIONS.exec(line);
    if (regressions) {
      current.newErrors = Number(regressions[1]);
      current.inheritedErrors = Number(regressions[2]);
      current.resolvedErrors = Number(regressions[3]);
      continue;
    }
    if (line.startsWith("[NEW] ")) { current.newLines.push(line.slice("[NEW] ".length).trim()); continue; }
    if (line.startsWith("RESULT: ")) {
      current.result = line.slice("RESULT: ".length).trim();
      current.status = current.result.startsWith("PASS") ? "passed" : current.result.startsWith("FAIL") ? "failed" : "error";
      inFailBlock = false;
      continue;
    }
    if (line.startsWith("[FAIL]")) { inFailBlock = true; current.failLines.push(line.trim()); continue; }
    if (inFailBlock) {
      if (/^\s+\S/.test(line)) current.failLines.push(line.trim());
      else inFailBlock = false;
    }
  }
  return units;
}

const FIX_HINT = "fix hint from tools/validate-symbol-order.py: MISSING means define the map symbol in this unit (nothing stops you from just defining the function); ORDER means reorder the definitions to match the map's .text layout; BINDING means match the map's weak/local/global linkage (out-of-line vs header inline, dropped static)";

/** Reasons for a failed gate: one line per regressed unit, the `[NEW]` (or strict `[FAIL]`) lines capped, then the validator's fix hint. */
export function symbolValidationReasons(result: SymbolCheckResult, cap = 20): string[] {
  const reasons: string[] = [];
  const detail: string[] = [];
  for (const unit of result.units) {
    if (unit.status !== "failed") continue;
    const label = unit.unit ? `${unit.unit} (${unit.source})` : unit.source;
    reasons.push(`${label}: ${unit.newErrors ?? unit.failLines.length} new symbol-validation error(s); RESULT: ${unit.result ?? "FAIL"}`);
    const lines = unit.newLines.length > 0 ? unit.newLines.map((line) => `[NEW] ${line}`) : unit.failLines;
    for (const line of lines) detail.push(`${unit.source}: ${line}`);
  }
  if (reasons.length === 0) return [];
  reasons.push(...detail.slice(0, cap));
  if (detail.length > cap) reasons.push(`${detail.length - cap} more symbol-validation line(s) omitted`);
  const units = result.units.filter((unit) => unit.status === "failed" && unit.unit).map((unit) => unit.unit!);
  reasons.push(`${FIX_HINT}; reproduce with: NM=build/binutils/powerpc-eabi-nm python3 tools/validate-symbol-order.py -u ${units[0] ?? "<unit>"} (upstream CI rejects new map-symbol errors)`);
  return reasons;
}

/** Both streams: ninja reports "subcommand failed" on stderr while the failing tool's diagnostics sit on stdout. */
function failureText(result: CommandResult): string {
  const text = [result.stderr.trim(), result.stdout.trim()].filter(Boolean).join("\n");
  return (text || `exit code ${result.exitCode}`).slice(-3000);
}

interface UnitMapping { unit: string; basePath: string }

function unitsBySource(objdiffText: string): Map<string, UnitMapping> {
  const parsed = JSON.parse(objdiffText) as { units?: Array<{ name?: string; base_path?: string; metadata?: { source_path?: string } }> };
  const mapping = new Map<string, UnitMapping>();
  for (const unit of parsed.units ?? []) {
    const source = unit.metadata?.source_path;
    if (typeof source === "string" && typeof unit.name === "string") {
      mapping.set(normalizePath(source), { unit: unit.name, basePath: typeof unit.base_path === "string" ? unit.base_path : "" });
    }
  }
  return mapping;
}

const SNAPSHOT_SCRIPT = [
  "import json, os, shutil, sys",
  "target = sys.argv[1]",
  "wanted = set(sys.argv[2:])",
  "units = json.load(open('objdiff.json', encoding='utf-8')).get('units', [])",
  "os.makedirs(target, exist_ok=True)",
  "shutil.copy2('objdiff.json', os.path.join(target, 'objdiff.json'))",
  "copied = 0",
  "for unit in units:",
  "    source = unit.get('metadata', {}).get('source_path')",
  "    base = unit.get('base_path')",
  "    if source in wanted and base and os.path.isfile(base):",
  "        os.makedirs(os.path.dirname(os.path.join(target, base)), exist_ok=True)",
  "        shutil.copy2(base, os.path.join(target, base))",
  "        copied += 1",
  "print('snapshotted %d baseline object(s) into %s' % (copied, target))",
].join("\n");

/**
 * Copies the current (not yet rebuilt) objects of the given sources plus
 * objdiff.json into `dir`, so they can serve as `--baseline-dir` after HEAD's
 * build overwrites them. Callers decide whether the current objects really are
 * the baseline (pre-attempt build, or warm image objects at the baked revision).
 */
export async function snapshotBaselineObjects(params: { exec: SymbolCheckCommandRunner; files: string[]; dir: string; timeoutMs?: number }): Promise<CommandResult> {
  const files = symbolCheckSourcePaths(params.files);
  try {
    return await params.exec(["python3", "-c", SNAPSHOT_SCRIPT, params.dir, ...files], { timeoutMs: params.timeoutMs ?? 120_000 });
  } catch (error) {
    return { exitCode: 127, stdout: "", stderr: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Builds the changed units at HEAD, resolves or builds the baseline objects,
 * then runs the checkout's CI driver from the checkout root.
 */
export async function runSymbolCheck(params: {
  files: string[];
  config: GameSymbolCheckConfig;
  baseline: SymbolCheckBaseline;
  /** Absolute checkout root inside the sandbox; the baseline worktree links its toolchain here. */
  repoRoot: string;
  /** Game version passed to the baseline configure (`--version`), e.g. GMSJ01. */
  version: string;
  exec: SymbolCheckCommandRunner;
  timeoutMs?: number;
}): Promise<SymbolCheckResult> {
  const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const files = symbolCheckSourcePaths(params.files);
  const script = normalizePath(params.config.script);
  const mapPath = normalizePath(params.config.map);
  const validatorPath = `${script.includes("/") ? script.slice(0, script.lastIndexOf("/") + 1) : ""}validate-symbol-order.py`;
  const base: Omit<SymbolCheckResult, "status" | "toolError"> = {
    files, units: [], mapPath, validator: { script, revision: null },
    baseline: { revision: params.baseline.revision ?? null, dir: null, source: null }, driverExitCode: null, output: "",
  };
  const unavailable = (toolError: string): SymbolCheckResult => ({ ...base, status: "tool_unavailable", toolError });
  if (files.length === 0) return { ...base, status: "clean", toolError: null };
  const run = async (command: string[], options: RunCommandOptions = {}): Promise<CommandResult> => {
    try {
      return await params.exec(command, { timeoutMs, ...options });
    } catch (error) {
      return { exitCode: 127, stdout: "", stderr: error instanceof Error ? error.message : String(error) };
    }
  };
  const nmPath = "build/binutils/powerpc-eabi-nm";
  const present = await run(["sh", "-c", 'for f in "$@"; do [ -e "$f" ] || echo "$f"; done', "sh", mapPath, script, validatorPath, nmPath, "objdiff.json"], { timeoutMs: 60_000 });
  if (present.exitCode !== 0) return unavailable(`sandbox presence check failed: ${failureText(present)}`);
  const missing = present.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (missing.includes(mapPath)) return unavailable(`linker map ${mapPath} is missing from the sandbox; rebake the image with the disc files extracted`);
  if (missing.includes(script) || missing.includes(validatorPath)) return unavailable(`symbol validator ${missing.includes(script) ? script : validatorPath} is missing from the checkout`);
  if (missing.includes(nmPath)) return unavailable(`${nmPath} is missing from the sandbox toolchain`);
  if (missing.includes("objdiff.json")) return unavailable("objdiff.json is missing; configure the checkout before the symbol check");
  const revision = await run(["git", "rev-parse", `HEAD:${validatorPath}`], { timeoutMs: 60_000 });
  base.validator.revision = revision.exitCode === 0 ? revision.stdout.trim() || null : null;

  const objdiff = await run(["cat", "objdiff.json"], { timeoutMs: 60_000 });
  if (objdiff.exitCode !== 0) return unavailable(`could not read objdiff.json: ${failureText(objdiff)}`);
  let mapping: Map<string, UnitMapping>;
  try { mapping = unitsBySource(objdiff.stdout); } catch (error) { return unavailable(`objdiff.json is not readable: ${error instanceof Error ? error.message : String(error)}`); }
  const tracked = files.map((file) => ({ file, mapping: mapping.get(file) })).filter((entry): entry is { file: string; mapping: UnitMapping } => !!entry.mapping?.basePath);
  if (tracked.length === 0) {
    return { ...base, status: "clean", toolError: null, units: files.map((file) => ({ ...emptyUnit(file, null), status: "skipped", message: "not a tracked decomp unit" })) };
  }
  const objects = tracked.map((entry) => entry.mapping.basePath);
  const build = await run(["ninja", ...objects]);
  if (build.exitCode !== 0) return unavailable(`object build for the changed units failed: ${failureText(build)}`);

  // Baseline objects: prefer the provided directory when it covers every tracked unit.
  let baselineDir: string | null = null;
  let baselineSource: SymbolCheckResult["baseline"]["source"] = null;
  const providedDir = params.baseline.dir?.trim() || null;
  if (providedDir) {
    const check = await run(["sh", "-c", 'for f in "$@"; do [ -e "$f" ] || echo "$f"; done', "sh", `${providedDir}/objdiff.json`, ...objects.map((object) => `${providedDir}/${object}`)], { timeoutMs: 60_000 });
    if (check.exitCode === 0 && !check.stdout.trim()) { baselineDir = providedDir; baselineSource = "provided"; }
  }
  const baselineRevision = params.baseline.revision?.trim() || null;
  if (!baselineDir && baselineRevision) {
    const worktree = SYMBOL_BASELINE_WORKTREE;
    await run(["git", "worktree", "remove", "--force", worktree], { timeoutMs: 120_000 });
    await run(["rm", "-rf", worktree], { timeoutMs: 120_000 });
    const added = await run(["git", "worktree", "add", "--force", "--detach", worktree, baselineRevision], { timeoutMs: 300_000 });
    if (added.exitCode !== 0) return unavailable(`baseline worktree at ${baselineRevision.slice(0, 10)} could not be created: ${failureText(added)}`);
    // orig/<version>/ is tracked (a .gitkeep), so link the disc files into it
    // entry by entry rather than replacing the directory.
    const linked = await run(["sh", "-c", 'mkdir -p "$2/orig/$3" && for entry in "$1/orig/$3"/* "$1/orig/$3"/.[!.]*; do [ -e "$entry" ] && ln -sfn "$entry" "$2/orig/$3/$(basename "$entry")"; done; true', "sh", params.repoRoot, worktree, params.version], { timeoutMs: 60_000 });
    if (linked.exitCode !== 0) return unavailable(`baseline worktree could not link orig/${params.version}: ${failureText(linked)}`);
    const tools = params.repoRoot;
    const configure = await run(["sh", "-c", 'cd "$1" && shift && python3 configure.py "$@"', "sh", worktree,
      "--map", "--version", params.version,
      "--wrapper", `${tools}/build/tools/wibo`, "--dtk", `${tools}/build/tools/dtk`, "--objdiff", `${tools}/build/tools/objdiff-cli`,
      "--compilers", `${tools}/build/compilers`, "--binutils", `${tools}/build/binutils`, "--sjiswrap", `${tools}/build/tools/sjiswrap.exe`,
    ], { timeoutMs: 600_000 });
    if (configure.exitCode !== 0) return unavailable(`baseline configure at ${baselineRevision.slice(0, 10)} failed: ${failureText(configure)}`);
    // configure.py alone only emits the split step; the full manifest and
    // objdiff.json appear once ninja has split the DOL and re-run configure.
    const manifest = await run(["ninja", "-C", worktree, "build.ninja"], { timeoutMs: 600_000 });
    if (manifest.exitCode !== 0) return unavailable(`baseline split/manifest at ${baselineRevision.slice(0, 10)} failed: ${failureText(manifest)}`);
    const existing = await run(["git", "ls-tree", "--name-only", baselineRevision, "--", ...tracked.map((entry) => entry.file)], { timeoutMs: 60_000 });
    if (existing.exitCode !== 0) return unavailable(`baseline source listing failed: ${failureText(existing)}`);
    const atBaseline = new Set(existing.stdout.split(/\r?\n/).map((line) => normalizePath(line.trim())).filter(Boolean));
    const baselineObjdiff = await run(["cat", `${worktree}/objdiff.json`], { timeoutMs: 60_000 });
    if (baselineObjdiff.exitCode !== 0) return unavailable(`baseline objdiff.json is missing after configure: ${failureText(baselineObjdiff)}`);
    let baselineMapping: Map<string, UnitMapping>;
    try { baselineMapping = unitsBySource(baselineObjdiff.stdout); } catch (error) { return unavailable(`baseline objdiff.json is not readable: ${error instanceof Error ? error.message : String(error)}`); }
    const baselineObjects = tracked.filter((entry) => atBaseline.has(entry.file)).map((entry) => baselineMapping.get(entry.file)?.basePath).filter((path): path is string => !!path);
    if (baselineObjects.length > 0) {
      const baselineBuild = await run(["ninja", "-C", worktree, ...baselineObjects]);
      if (baselineBuild.exitCode !== 0) return unavailable(`baseline object build at ${baselineRevision.slice(0, 10)} failed: ${failureText(baselineBuild)}`);
    }
    baselineDir = worktree;
    baselineSource = "worktree_build";
  }
  if (!baselineDir) return unavailable(providedDir ? `baseline objects under ${providedDir} do not cover every changed unit and no baseline revision was given` : "no baseline objects or revision for the symbol check");
  base.baseline = { revision: baselineRevision, dir: baselineDir, source: baselineSource };

  const driver = await run(["python3", script, "--baseline-dir", baselineDir, ...files], {
    env: { NM: `${params.repoRoot}/${nmPath}`, PYTHONUNBUFFERED: "1" },
  });
  const output = `${driver.stdout}\n${driver.stderr}`.slice(-OUTPUT_TAIL);
  const units = parseSymbolCheckOutput(driver.stdout);
  base.driverExitCode = driver.exitCode;
  base.output = output;
  if (units.length === 0 && driver.exitCode !== 0) return { ...base, units, status: "tool_unavailable", toolError: `symbol check driver exited ${driver.exitCode}: ${failureText(driver)}` };
  const errored = units.filter((unit) => unit.status === "error");
  if (errored.length > 0) {
    return { ...base, units, status: "tool_unavailable", toolError: `symbol check could not run for ${errored.map((unit) => `${unit.source}${unit.message ? ` (${unit.message})` : ""}`).join(", ")}${driver.stderr.trim() ? `: ${driver.stderr.trim().slice(-1000)}` : ""}` };
  }
  const regressed = units.some((unit) => unit.status === "failed");
  return { ...base, units, status: regressed ? "regressions" : "clean", toolError: null };
}
