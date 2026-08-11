import { createHash } from "node:crypto";
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

export interface ReportRunStep extends CommandResult {
  command: string[];
  name: string;
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
  resetBaseline?: boolean;
  toolPlatform?: ToolPlatform;
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
  const stateDir = process.env.ORCH_PROJECT_STATE_DIR;
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

async function runStep(repoRoot: string, steps: ReportRunStep[], name: string, command: string[]): Promise<void> {
  const result = await runCommand(repoRoot, command);
  steps.push({ name, command, ...result });
  if (result.exitCode !== 0) {
    const output = result.stderr || result.stdout || "no output";
    throw new Error(`${name} failed (${result.exitCode}): ${output.slice(-2000)}`);
  }
}

async function ensureConfigured(repoRoot: string, steps: ReportRunStep[], toolPlatform: ToolPlatform): Promise<void> {
  if (await pathExists(resolve(repoRoot, "build.ninja"))) return;
  if (!(await pathExists(resolve(repoRoot, "configure.py")))) {
    throw new Error(`configure failed: build.ninja is missing and configure.py was not found in ${repoRoot}`);
  }
  await runStep(repoRoot, steps, "configure", await preferredConfigureCommand(repoRoot, toolPlatform));
}

async function reportReuseMetadata(repoRoot: string): Promise<ReportReuseMetadata> {
  const head = await runCommand(repoRoot, ["git", "rev-parse", "--verify", "HEAD"]);
  if (head.exitCode !== 0 || !head.stdout.trim()) {
    throw new Error(`report reuse key failed to resolve worktree HEAD: ${(head.stderr || head.stdout).trim() || `exit ${head.exitCode}`}`);
  }
  const [buildNinja, dolConfig] = await Promise.all([
    readFile(resolve(repoRoot, "build.ninja")),
    readFile(resolve(repoRoot, "config/GALE01/config.yml")),
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

export async function forceReportRun(repoRoot: string, options: ReportRunOptions = {}): Promise<ReportRunResult> {
  const buildDir = resolve(repoRoot, "build/GALE01");
  const reportPath = resolve(buildDir, "report.json");
  const baselinePath = resolve(buildDir, "baseline.json");
  const reportChangesPath = resolve(buildDir, "report_changes.json");
  const reportReusePath = resolve(buildDir, "report.reuse-key.json");
  const generateChanges = options.generateChanges !== false;
  const resetBaseline = options.resetBaseline === true;
  const steps: ReportRunStep[] = [];
  const toolPlatform = resolveToolPlatform({ targetPlatform: options.toolPlatform });
  const reportReuseEnabled = process.env.ORCH_REPORT_REUSE === "1";

  await ensureConfigured(repoRoot, steps, toolPlatform);
  await removeIfExists(reportChangesPath);
  const reuseMetadata = reportReuseEnabled ? await reportReuseMetadata(repoRoot) : null;
  const reusedReport = Boolean(
    reuseMetadata &&
      (await pathExists(reportPath)) &&
      (await storedReportReuseKey(reportReusePath)) === reuseMetadata.key,
  );
  if (!reusedReport) {
    await removeIfExists(reportPath);
    await runStep(repoRoot, steps, "generate report", ["ninja", "build/GALE01/report.json"]);
    if (reuseMetadata) await writeFile(reportReusePath, `${JSON.stringify(reuseMetadata, null, 2)}\n`);
  }

  if (resetBaseline) {
    await copyFile(reportPath, baselinePath);
  }

  if (generateChanges) {
    await runStep(repoRoot, steps, "generate report changes", ["ninja", "changes_all"]);
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
