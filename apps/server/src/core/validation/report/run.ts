import { createHash, randomUUID } from "node:crypto";
import { chmod, copyFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  isHostToolPlatform,
  requiredStateToolArtifactError,
  resolveStateToolArtifact,
  resolveToolPlatform,
  type ToolPlatform,
} from "@server/core/tools/platform.js";
import { runCommand, type CommandResult } from "@server/infrastructure/shell/index.js";
import { actionableFailureOutput } from "../failure-output.js";
import { reportBuildIdFromPath } from "@server/core/game-registry/report-build-id.js";

export interface ReportRunStep extends CommandResult {
  command: string[];
  durationMs: number;
  name: string;
  stderrPath?: string;
  stdoutPath?: string;
}

export interface ReportRunSummary {
  completeCodePercent: number | null;
  completeDataPercent: number | null;
  completeUnits: number | null;
  fuzzyMatchPercent: number | null;
  incompleteUnits: number | null;
  matchedCodeBytes: number | null;
  matchedCodePercent: number | null;
  matchedDataBytes: number | null;
  matchedDataPercent: number | null;
  matchedFunctions: number | null;
  matchedFunctionsPercent: number | null;
  totalCodeBytes: number | null;
  totalDataBytes: number | null;
  totalFunctions: number | null;
  totalUnits: number | null;
  unmatchedTargets: number | null;
}

export interface ReportRunResult {
  baselinePath: string;
  reportChangesPath: string;
  reportPath: string;
  resetBaseline: boolean;
  reusedReport?: boolean;
  steps: ReportRunStep[];
  summary?: ReportRunSummary;
  timestamps: {
    baseline?: string;
    report?: string;
    reportChanges?: string;
  };
}

export interface ReportRunOptions {
  generateChanges?: boolean;
  logDir?: string;
  resetBaseline?: boolean;
  timeoutMs?: number;
  toolPlatform?: ToolPlatform;
  /** The game's report path from its descriptor (e.g. "build/GALE01/report.json"); defaults to Melee's. */
  reportRelPath?: string;
}

export interface ReportReuseKeyInput {
  buildNinja: string | Uint8Array;
  dolConfig: string | Uint8Array;
  headCommit: string;
}

interface ReportReuseMetadata {
  buildNinjaSha256: string;
  dolConfigSha256: string;
  headCommit: string;
  key: string;
  version: 1;
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function computeReportReuseKey(input: ReportReuseKeyInput): string {
  const buildNinjaSha256 = sha256(input.buildNinja);
  const dolConfigSha256 = sha256(input.dolConfig);
  return sha256(`report-reuse-v1\0${input.headCommit.trim()}\0${buildNinjaSha256}\0${dolConfigSha256}`);
}

async function removeIfExists(path: string): Promise<void> {
  await rm(path, { force: true });
}

async function timestamp(path: string): Promise<string | undefined> {
  try {
    return (await stat(path)).mtime.toISOString();
  } catch {
    return undefined;
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

async function pathCommandExists(command: string): Promise<boolean> {
  const pathValue = process.env.PATH ?? "";
  for (const entry of pathValue.split(":")) {
    if (!entry) continue;
    if (await pathExists(resolve(entry, command))) return true;
  }
  return false;
}

async function stateWiboPath(repoRoot: string, toolPlatform: ToolPlatform): Promise<string | null> {
  const stateDir = process.env.ORCH_GAME_STATE_DIR;
  if (stateDir) {
    const candidate = resolveStateToolArtifact({ stateDir, name: "wibo", platform: toolPlatform });
    if (candidate && (await pathExists(candidate))) return candidate;
  }
  let current = resolve(repoRoot);
  while (true) {
    const name = current.split("/").at(-1);
    if (name === "worktrees") {
      const candidateStateDir = resolve(current, "..", "state");
      const candidate = resolveStateToolArtifact({ stateDir: candidateStateDir, name: "wibo", platform: toolPlatform });
      if (candidate && (await pathExists(candidate))) return candidate;
    }
    const candidateStateDir = resolve(current, "state");
    const candidate = resolveStateToolArtifact({ stateDir: candidateStateDir, name: "wibo", platform: toolPlatform });
    if (candidate && (await pathExists(candidate))) return candidate;
    const parent = resolve(current, "..");
    if (parent === current) break;
    current = parent;
  }
  if (!isHostToolPlatform(toolPlatform)) {
    throw requiredStateToolArtifactError({ stateDir: stateDir ?? resolve(repoRoot, "state"), name: "wibo", platform: toolPlatform });
  }
  return null;
}

async function preferredConfigureCommand(repoRoot: string, toolPlatform: ToolPlatform): Promise<string[]> {
  const localWibo = resolve(repoRoot, "build", "tools", "wibo");
  if (!isHostToolPlatform(toolPlatform) || !(await pathExists(localWibo))) {
    const source = await stateWiboPath(repoRoot, toolPlatform);
    if (source) {
      if (!isHostToolPlatform(toolPlatform)) await rm(localWibo, { recursive: true, force: true });
      await mkdir(dirname(localWibo), { recursive: true });
      await copyFile(source, localWibo);
      await chmod(localWibo, 0o755).catch(() => {});
    }
  }
  if (await pathExists(localWibo)) {
    return ["/bin/sh", "-c", `python3 configure.py --require-protos --wrapper ${shellQuote("build/tools/wibo")}`];
  }
  if (isHostToolPlatform(toolPlatform) && (await pathCommandExists("wibo"))) {
    return ["/bin/sh", "-c", "python3 configure.py --require-protos --wrapper wibo"];
  }
  return ["python3", "configure.py", "--require-protos"];
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function nullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function nullableDelta(total: number | null, complete: number | null): number | null {
  if (total === null || complete === null) return null;
  return Math.max(0, total - complete);
}

export function compactReportMeasures(measures: Record<string, unknown>): ReportRunSummary {
  const completeUnits = nullableNumber(measures.complete_units);
  const matchedFunctions = nullableNumber(measures.matched_functions);
  const totalFunctions = nullableNumber(measures.total_functions);
  const totalUnits = nullableNumber(measures.total_units);
  return {
    completeCodePercent: nullableNumber(measures.complete_code_percent),
    completeDataPercent: nullableNumber(measures.complete_data_percent),
    completeUnits,
    fuzzyMatchPercent: nullableNumber(measures.fuzzy_match_percent),
    incompleteUnits: nullableDelta(totalUnits, completeUnits),
    matchedCodeBytes: nullableNumber(measures.matched_code),
    matchedCodePercent: nullableNumber(measures.matched_code_percent),
    matchedDataBytes: nullableNumber(measures.matched_data),
    matchedDataPercent: nullableNumber(measures.matched_data_percent),
    matchedFunctions,
    matchedFunctionsPercent: nullableNumber(measures.matched_functions_percent),
    totalCodeBytes: nullableNumber(measures.total_code),
    totalDataBytes: nullableNumber(measures.total_data),
    totalFunctions,
    totalUnits,
    unmatchedTargets: nullableDelta(totalFunctions, matchedFunctions),
  };
}

export async function readReportSummary(path: string): Promise<ReportRunSummary | undefined> {
  try {
    const report = asObject(JSON.parse(await readFile(path, "utf8")));
    const measures = asObject(report.measures);
    if (Object.keys(measures).length === 0) return undefined;
    return compactReportMeasures(measures);
  } catch {
    return undefined;
  }
}

interface RunStepOptions {
  logDir?: string;
  timeoutMs?: number;
}

function stepSlug(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "step";
}

async function writeStepLog(path: string, output: string): Promise<string | undefined> {
  try {
    await writeFile(path, output);
    return path;
  } catch (error) {
    console.error(`Failed to persist report build log ${path}:`, error);
    return undefined;
  }
}

async function persistStepLogs(
  logDir: string,
  stepIndex: number,
  name: string,
  result: CommandResult,
): Promise<{ stderrPath?: string; stdoutPath?: string }> {
  try {
    await mkdir(logDir, { recursive: true });
  } catch (error) {
    console.error(`Failed to create report build log directory ${logDir}:`, error);
    return {};
  }

  const pathPrefix = resolve(logDir, `${stepIndex}-${stepSlug(name)}`);
  const [stdoutPath, stderrPath] = await Promise.all([
    writeStepLog(`${pathPrefix}.stdout.log`, result.stdout),
    writeStepLog(`${pathPrefix}.stderr.log`, result.stderr),
  ]);
  return {
    ...(stdoutPath ? { stdoutPath } : {}),
    ...(stderrPath ? { stderrPath } : {}),
  };
}

async function runStep(
  repoRoot: string,
  steps: ReportRunStep[],
  name: string,
  command: string[],
  options: RunStepOptions = {},
): Promise<void> {
  const startedAt = performance.now();
  const result = await runCommand(repoRoot, command, { timeoutMs: options.timeoutMs });
  const durationMs = Math.max(0, Math.round(performance.now() - startedAt));
  const { stdoutPath, stderrPath } = options.logDir
    ? await persistStepLogs(options.logDir, steps.length, name, result)
    : {};
  steps.push({
    name,
    command,
    ...result,
    durationMs,
    ...(stdoutPath ? { stdoutPath } : {}),
    ...(stderrPath ? { stderrPath } : {}),
  });
  if (result.exitCode !== 0) {
    const error = new Error(`${name} failed (${result.exitCode}): ${actionableFailureOutput(result)}`);
    Object.assign(error, {
      buildFixerDiagnostics: actionableFailureOutput(result, Number.POSITIVE_INFINITY),
      exitCode: result.exitCode,
      stdoutTail: result.stdout.slice(-4_000),
      stderrTail: result.stderr.slice(-4_000),
      logPaths: [stdoutPath, stderrPath].filter((path): path is string => Boolean(path)),
    });
    throw error;
  }
}

async function ensureConfigured(
  repoRoot: string,
  steps: ReportRunStep[],
  toolPlatform: ToolPlatform,
  options: RunStepOptions,
): Promise<void> {
  if (await pathExists(resolve(repoRoot, "build.ninja"))) return;
  if (!(await pathExists(resolve(repoRoot, "configure.py")))) {
    throw new Error(`configure failed: build.ninja is missing and configure.py was not found in ${repoRoot}`);
  }
  await runStep(repoRoot, steps, "configure", await preferredConfigureCommand(repoRoot, toolPlatform), options);
}

async function reportReuseMetadata(repoRoot: string, buildId: string): Promise<ReportReuseMetadata> {
  const head = await runCommand(repoRoot, ["git", "rev-parse", "--verify", "HEAD"]);
  if (head.exitCode !== 0 || !head.stdout.trim()) {
    throw new Error(`report reuse key failed to resolve worktree HEAD: ${(head.stderr || head.stdout).trim() || `exit ${head.exitCode}`}`);
  }
  const [buildNinja, dolConfig] = await Promise.all([
    readFile(resolve(repoRoot, "build.ninja")),
    readFile(resolve(repoRoot, `config/${buildId}/config.yml`)),
  ]);
  const headCommit = head.stdout.trim();
  const buildNinjaSha256 = sha256(buildNinja);
  const dolConfigSha256 = sha256(dolConfig);
  return {
    buildNinjaSha256,
    dolConfigSha256,
    headCommit,
    key: computeReportReuseKey({ buildNinja, dolConfig, headCommit }),
    version: 1,
  };
}

async function storedReportReuseKey(path: string): Promise<string | null> {
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as { key?: unknown; version?: unknown };
    return value.version === 1 && typeof value.key === "string" ? value.key : null;
  } catch {
    return null;
  }
}

const reportRuns = new Map<string, Promise<unknown>>();

async function runReportUnguarded(repoRoot: string, options: ReportRunOptions = {}): Promise<ReportRunResult> {
  const reportRelPath = options.reportRelPath ?? "build/GALE01/report.json";
  const buildId = reportBuildIdFromPath(reportRelPath);
  const buildDir = resolve(repoRoot, dirname(reportRelPath));
  const reportPath = resolve(buildDir, "report.json");
  const baselinePath = resolve(buildDir, "baseline.json");
  const reportChangesPath = resolve(buildDir, "report_changes.json");
  const reportReusePath = resolve(buildDir, "report.reuse-key.json");
  const generateChanges = options.generateChanges !== false;
  const resetBaseline = options.resetBaseline === true;
  const steps: ReportRunStep[] = [];
  const toolPlatform = resolveToolPlatform({ targetPlatform: options.toolPlatform });
  const reportReuseEnabled = process.env.ORCH_REPORT_REUSE === "1";

  const invocationLogDir = options.logDir
    ? resolve(
        options.logDir,
        "build-steps",
        `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}`,
      )
    : undefined;
  const stepOptions = { logDir: invocationLogDir, timeoutMs: options.timeoutMs };

  await ensureConfigured(repoRoot, steps, toolPlatform, stepOptions);
  await removeIfExists(reportChangesPath);
  const reuseMetadata = reportReuseEnabled ? await reportReuseMetadata(repoRoot, buildId) : null;
  const reusedReport = Boolean(
    reuseMetadata &&
      (await pathExists(reportPath)) &&
      (await storedReportReuseKey(reportReusePath)) === reuseMetadata.key,
  );
  if (!reusedReport) {
    await removeIfExists(reportPath);
    await runStep(repoRoot, steps, "generate report", ["ninja", "-k", "0", reportRelPath], stepOptions);
    if (reuseMetadata) await writeFile(reportReusePath, `${JSON.stringify(reuseMetadata, null, 2)}\n`);
  }

  if (resetBaseline) {
    await copyFile(reportPath, baselinePath);
  }

  if (generateChanges) {
    await runStep(repoRoot, steps, "generate report changes", ["ninja", "changes_all"], stepOptions);
  }

  return {
    baselinePath,
    reportChangesPath,
    reportPath,
    resetBaseline,
    ...(reportReuseEnabled ? { reusedReport } : {}),
    steps,
    summary: await readReportSummary(reportPath),
    timestamps: {
      baseline: await timestamp(baselinePath),
      report: await timestamp(reportPath),
      reportChanges: await timestamp(reportChangesPath),
    },
  };
}

export function forceReportRun(repoRoot: string, options: ReportRunOptions = {}): Promise<ReportRunResult> {
  const key = resolve(repoRoot);
  const previous = reportRuns.get(key) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(() => runReportUnguarded(repoRoot, options));
  let tracked: Promise<ReportRunResult>;
  tracked = run.finally(() => {
    if (reportRuns.get(key) === tracked) reportRuns.delete(key);
  });
  reportRuns.set(key, tracked);
  return tracked;
}
