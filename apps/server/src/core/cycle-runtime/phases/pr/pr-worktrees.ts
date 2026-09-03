import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import {
  isHostToolPlatform,
  requiredStateToolArtifactError,
  resolveStateToolArtifact,
  resolveToolPlatform,
  type ToolPlatform,
} from "@server/core/tools/platform.js";
import { installMwccCacheShim } from "@server/core/tools/mwcc-cache.js";
import { reportBuildIdFromPath } from "@server/core/game-registry/report-build-id.js";
import type { RegressionReport } from "@server/core/validation/objdiff/report";
import type { DispatchLeaseRevalidator } from "@server/core/cycle-runtime/dispatch-guard";
import type { GameEventTraceLinkage } from "@server/core/harness-state/kernel-links.js";
import { uiLog } from "@server/infrastructure/logging/ui-log";

export type JsonObject = Record<string, unknown>;

export interface CliResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export interface CodeIssuesResult {
  status: "clean" | "issues" | "unavailable";
  output: string;
  files: string[];
}

export interface PrWorktreeGameContext {
  handoffDir?: string;
  game: { baseRef?: string; reportPath?: string } | null;
  repoRoot: string;
  stateDir: string;
  toolPlatform?: ToolPlatform;
}

type WorkflowStatus = "started" | "completed" | "failed" | "skipped";

interface WorkflowEventInput extends GameEventTraceLinkage {
  kind: "baseline";
  operation: string;
  status?: WorkflowStatus;
  detail?: string | null;
  metadata?: Record<string, unknown>;
}

export interface PrProductionWorkflowLinkage extends GameEventTraceLinkage {
  workflowId: string;
}

interface RunGitOptions {
  check?: boolean;
  failureHint?: string;
}

export interface PrWorktreeServiceDeps<Context extends PrWorktreeGameContext> {
  branchExists: (repoRoot: string, branch: string) => boolean;
  codeIssuesChecker?: (worktreeDir: string) => Promise<CodeIssuesResult>;
  isLocalBranchPrRecord: (record: JsonObject) => boolean;
  localBranchDiffBase: (repoRoot: string, baseRef: string, branch: string) => string;
  outputTail: (textValue: string, maxLength?: number) => string;
  prBranchPathSlug: (branch: string) => string;
  prWorkspacePath: (stateDir: string, runId: string, branch: string) => string;
  readRegressionReport: (reportChangesPath: string, title: string, maxRows: number) => Promise<RegressionReport>;
  runCli: (command: string[], cwd?: string) => Promise<CliResult>;
  runGit: (repoRoot: string, args: string[], options?: RunGitOptions) => Promise<CliResult>;
  submitWorkflowEvent?: (paths: Context, input: WorkflowEventInput) => Promise<JsonObject | null>;
  updatePrRecord: (stateDir: string, branch: string, updater: (record: JsonObject) => JsonObject) => JsonObject | null;
}

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function requiredProductionTraceLinkage(
  input: PrProductionWorkflowLinkage | undefined,
): GameEventTraceLinkage {
  if (!input) {
    throw new Error("Production baseline tracing requires durable PR dispatch linkage");
  }
  const workflowId = input.workflowId.trim();
  const correlationId = input.correlationId.trim();
  const gameEventId = input.gameEventId.trim();
  const causedByEventId = input.causedByEventId?.trim() ?? "";
  if (!workflowId || !correlationId || !gameEventId || !causedByEventId) {
    throw new Error("Production baseline tracing requires complete durable PR dispatch linkage");
  }
  if (correlationId !== workflowId) {
    throw new Error(
      `Production baseline trace correlation ${correlationId} does not match owning PR workflow ${workflowId}`,
    );
  }
  return { correlationId, gameEventId, causedByEventId };
}

/** Preserve the legacy primary manifest exactly; append only novel support paths. */
function manifestFiles(files: string[], supportFiles?: string[]): string[] {
  if (!supportFiles?.length) return files;
  const seen = new Set(files);
  const manifest = [...files];
  for (const file of supportFiles) {
    if (seen.has(file)) continue;
    seen.add(file);
    manifest.push(file);
  }
  return manifest;
}

function readJsonObject(path: string): JsonObject {
  try {
    if (!path || !existsSync(path)) return {};
    return asObject(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return {};
  }
}

function linkMissingFiles(sourceDir: string, targetDir: string): number {
  let linked = 0;
  mkdirSync(targetDir, { recursive: true });
  for (const entry of readdirSync(sourceDir)) {
    const sourcePath = resolve(sourceDir, entry);
    const targetPath = resolve(targetDir, entry);
    if (statSync(sourcePath).isDirectory()) {
      linked += linkMissingFiles(sourcePath, targetPath);
    } else if (!existsSync(targetPath)) {
      symlinkSync(sourcePath, targetPath);
      linked += 1;
    }
  }
  return linked;
}

function pathCommandExists(command: string): boolean {
  for (const entry of (process.env.PATH ?? "").split(":")) {
    if (!entry) continue;
    if (existsSync(resolve(entry, command))) return true;
  }
  return false;
}

function seedLocalWibo(paths: PrWorktreeGameContext, worktreeDir: string, toolPlatform: ToolPlatform): boolean {
  const localWibo = resolve(worktreeDir, "build", "tools", "wibo");
  const crossPlatformTarget = !isHostToolPlatform(toolPlatform);
  if (!crossPlatformTarget && existsSync(localWibo)) {
    installMwccCacheShim(worktreeDir);
    return true;
  }
  const source = resolveStateToolArtifact({ stateDir: paths.stateDir, name: "wibo", platform: toolPlatform });
  if (!source) {
    if (crossPlatformTarget) {
      throw requiredStateToolArtifactError({ stateDir: paths.stateDir, name: "wibo", platform: toolPlatform });
    }
    return false;
  }
  if (crossPlatformTarget) rmSync(localWibo, { recursive: true, force: true });
  mkdirSync(dirname(localWibo), { recursive: true });
  copyFileSync(source, localWibo);
  try {
    chmodSync(localWibo, 0o755);
  } catch {
    // Best effort; copied game tools are usually already executable.
  }
  installMwccCacheShim(worktreeDir);
  return true;
}

function preferredConfigureCommand(paths: PrWorktreeGameContext, worktreeDir: string): string[] {
  const toolPlatform = resolveToolPlatform({ targetPlatform: paths.toolPlatform });
  if (seedLocalWibo(paths, worktreeDir, toolPlatform)) {
    return ["/bin/sh", "-c", "python3 configure.py --require-protos --wrapper build/tools/wibo"];
  }
  if (isHostToolPlatform(toolPlatform) && pathCommandExists("wibo")) {
    return ["/bin/sh", "-c", "python3 configure.py --require-protos --wrapper wibo"];
  }
  return ["python3", "configure.py", "--require-protos"];
}

function sourcePathFromUnit(name: string): string {
  const unit = name.split("::")[0] ?? "";
  const parts = unit.split("/").filter(Boolean);
  if (parts.length < 2) return "";
  return `src/${parts.slice(1).join("/")}.c`;
}

// Upstream CI's "Issues" job rejects PRs that introduce clang semantic issues
// (-Wself-assign, conflicting prototypes, ...) that the MWCC match build never
// sees. Run the exact same container locally so a slice fails here, before it
// is pushed, instead of failing on the PR. The image is amd64-only, so the
// platform is pinned (Docker on Apple Silicon runs it under Rosetta).
const CHECK_ISSUES_IMAGE = "ghcr.io/doldecomp/melee/check-issues:latest";
let dockerAvailable: boolean | null = null;

export function createPrWorktreeService<Context extends PrWorktreeGameContext>(deps: PrWorktreeServiceDeps<Context>) {
  const {
    branchExists,
    isLocalBranchPrRecord,
    localBranchDiffBase,
    outputTail,
    prBranchPathSlug,
    prWorkspacePath,
    readRegressionReport,
    runCli,
    runGit,
    submitWorkflowEvent,
    updatePrRecord,
  } = deps;

  async function rebuildProductionBaselineWithTrace(
    paths: Context,
    revalidateLease?: DispatchLeaseRevalidator,
    traceLinkage: GameEventTraceLinkage | null = null,
  ): Promise<JsonObject> {
    const { repoRoot } = paths;
    const baseRef = paths.game?.baseRef ?? "origin/master";
    const baseSha = (await runGit(repoRoot, ["rev-parse", "--verify", baseRef], { failureHint: `Unable to resolve ${baseRef}` })).stdout.trim();
    const buildId = reportBuildIdFromPath(paths.game?.reportPath);
    const worktreeDir = resolve(tmpdir(), `melee-baseline-${baseSha}`);
    const worktreeBaseline = resolve(worktreeDir, `build/${buildId}/baseline.json`);
    const cached = existsSync(worktreeBaseline);
    if (submitWorkflowEvent) {
      await submitWorkflowEvent(paths, {
        kind: "baseline",
        operation: "rebuildProductionBaseline",
        status: "started",
        detail: `${baseRef} ${baseSha.slice(0, 10)}${cached ? " cached" : ""}`.trim(),
        metadata: { baseRef, baseSha, cached, worktreeDir },
        ...traceLinkage!,
      });
    }
    if (!cached) {
      if (!existsSync(worktreeDir)) {
        uiLog("ui", `baseline worktree add ${worktreeDir} @ ${baseSha.slice(0, 10)}`);
        revalidateLease?.();
        await runGit(repoRoot, ["worktree", "add", "--detach", worktreeDir, baseSha], { failureHint: "Unable to add the baseline worktree" });
      }
      // Original game assets under orig/ are gitignored (only .gitkeep skeleton
      // dirs are tracked), so a fresh worktree cannot split the DOL. Symlink
      // every asset file the main checkout has that the worktree lacks.
      const origSource = resolve(repoRoot, "orig");
      if (existsSync(origSource)) {
        const linked = linkMissingFiles(origSource, resolve(worktreeDir, "orig"));
        if (linked > 0) uiLog("ui", `baseline worktree linked ${linked} orig/ game asset file(s) from the main checkout`);
      }
      if (!existsSync(resolve(worktreeDir, "build.ninja"))) {
        uiLog("ui", "baseline configure started");
        const configure = await runCli(preferredConfigureCommand(paths, worktreeDir), worktreeDir);
        if (configure.exitCode !== 0) {
          throw new Error(`Baseline configure failed (${configure.exitCode}): ${outputTail(configure.stderr || configure.stdout, 4000)}`);
        }
      }
      uiLog("ui", `baseline build started: ninja baseline @ ${baseSha.slice(0, 10)} (first build for this base SHA does a full build)`);
      const build = await runCli(["ninja", "baseline"], worktreeDir);
      if (build.exitCode !== 0) {
        throw new Error(`Baseline build failed (${build.exitCode}): ${outputTail(build.stderr || build.stdout, 4000)}`);
      }
      uiLog("ui", "baseline build complete");
    } else {
      uiLog("ui", `baseline reused from cache for ${baseSha.slice(0, 10)}`);
    }
    const baselinePath = resolve(repoRoot, `build/${buildId}/baseline.json`);
    mkdirSync(dirname(baselinePath), { recursive: true });
    copyFileSync(worktreeBaseline, baselinePath);
    uiLog("ui", `production baseline installed at ${baselinePath}`);
    const status = { baseRef, baseSha, worktreeDir, cached, baselinePath, installedAt: new Date().toISOString() };
    const statusPath = resolve(paths.handoffDir ?? resolve(paths.stateDir, "pr_handoff"), "baseline_status.json");
    mkdirSync(dirname(statusPath), { recursive: true });
    writeFileSync(statusPath, JSON.stringify(status, null, 2), "utf8");
    if (submitWorkflowEvent) {
      await submitWorkflowEvent(paths, {
        kind: "baseline",
        operation: "rebuildProductionBaseline",
        status: "completed",
        detail: `${baseSha.slice(0, 10)} installed`,
        metadata: status,
        ...traceLinkage!,
      });
    }
    return status as unknown as JsonObject;
  }

  async function rebuildProductionBaseline(
    paths: Context,
    revalidateLease?: DispatchLeaseRevalidator,
    productionLinkage?: PrProductionWorkflowLinkage,
  ): Promise<JsonObject> {
    const traceLinkage = submitWorkflowEvent
      ? requiredProductionTraceLinkage(productionLinkage)
      : null;
    return rebuildProductionBaselineWithTrace(paths, revalidateLease, traceLinkage);
  }

  async function ensureOpenPrBaseline(
    paths: Context,
    revalidateLease?: DispatchLeaseRevalidator,
    productionLinkage?: PrProductionWorkflowLinkage,
  ): Promise<JsonObject> {
    const baseRef = paths.game?.baseRef ?? "origin/master";
    const baseSha = (await runGit(paths.repoRoot, ["rev-parse", "--verify", baseRef], { failureHint: `Unable to resolve ${baseRef}` })).stdout.trim();
    const status = readJsonObject(resolve(paths.stateDir, "pr_handoff", "baseline_status.json"));
    const worktreeDir = stringValue(status.worktreeDir);
    const baselinePath = worktreeDir ? resolve(worktreeDir, `build/${reportBuildIdFromPath(paths.game?.reportPath)}/baseline.json`) : "";
    if (stringValue(status.baseSha) === baseSha && worktreeDir && existsSync(baselinePath)) return status;

    const reason =
      stringValue(status.baseSha) && stringValue(status.baseSha) !== baseSha
        ? `baseline cache is stale (${stringValue(status.baseSha).slice(0, 10)} != ${baseSha.slice(0, 10)})`
        : worktreeDir && !existsSync(baselinePath)
          ? `baseline cache is missing at ${worktreeDir}`
          : "baseline cache is missing";
    const traceLinkage = submitWorkflowEvent
      ? requiredProductionTraceLinkage(productionLinkage)
      : null;
    uiLog("ui", `open draft: ${reason}; rebuilding production baseline`);
    return rebuildProductionBaselineWithTrace(paths, revalidateLease, traceLinkage);
  }

  async function verifyShipSet(
    paths: Context,
    baseline: JsonObject,
    matchPathspecs: string[],
    options: { revalidateLease?: DispatchLeaseRevalidator; sourceRef?: string } = {},
  ): Promise<JsonObject> {
    const { repoRoot, stateDir } = paths;
    const worktreeDir = stringValue(baseline.worktreeDir);
    const baseSha = stringValue(baseline.baseSha);
    const handoffDir = paths.handoffDir ?? resolve(stateDir, "pr_handoff");
    const statusPath = resolve(handoffDir, "ship_status.json");
    const writeStatus = (status: JsonObject): JsonObject => {
      mkdirSync(dirname(statusPath), { recursive: true });
      writeFileSync(statusPath, JSON.stringify(status, null, 2), "utf8");
      return status;
    };
    if (!worktreeDir || !baseSha || !existsSync(worktreeDir)) {
      throw new Error("Ship-set verification needs the baseline worktree; run the rebuild-production-baseline step first.");
    }
    if (matchPathspecs.length === 0) {
      return writeStatus({ status: "nothing_to_ship", baseSha, files: 0, checkedAt: new Date().toISOString() });
    }

    const patchPath = resolve(handoffDir, "ship_set.patch");
    mkdirSync(dirname(patchPath), { recursive: true });
    let pathspecs = [...matchPathspecs];
    const droppedFiles = new Map<string, string[]>();

    // Survivor loop: anything that regresses the baseline drops out of the ship
    // set and the remainder re-verifies, until the assembly is clean. Dropped
    // symbols are already readmitted as rework by the branch QA pass.
    for (let round = 1; round <= 4; round += 1) {
      if (pathspecs.length === 0) {
        return writeStatus({ status: "nothing_to_ship", baseSha, files: 0, droppedFiles: Object.fromEntries(droppedFiles), checkedAt: new Date().toISOString() });
      }
      const sourceRef = stringValue(options.sourceRef);
      const diff = await runCli(["git", "diff", "--binary", baseSha, ...(sourceRef ? [sourceRef] : []), "--", ...pathspecs], repoRoot);
      if (diff.exitCode !== 0) throw new Error(`Ship-set diff failed (${diff.exitCode}): ${outputTail(diff.stderr, 2000)}`);
      writeFileSync(patchPath, diff.stdout, "utf8");

      let report: RegressionReport;
      let issues: CodeIssuesResult;
      try {
        uiLog("ui", `ship-set round ${round}: applying ${pathspecs.length} match file(s) onto the baseline worktree`);
        options.revalidateLease?.();
        const apply = await runCli(["git", "apply", patchPath], worktreeDir);
        if (apply.exitCode !== 0) throw new Error(`Ship-set patch did not apply cleanly (${apply.exitCode}): ${outputTail(apply.stderr, 2000)}`);
        const build = await runCli(["ninja", "changes_all"], worktreeDir);
        if (build.exitCode !== 0) throw new Error(`Ship-set build failed (${build.exitCode}): ${outputTail(build.stderr || build.stdout, 4000)}`);
        report = await readRegressionReport(resolve(worktreeDir, `build/${reportBuildIdFromPath(paths.game?.reportPath)}/report_changes.json`), "ship set", 0);
        // Upstream CI parity: the patched tree must also pass the Issues lint.
        issues = await checkCodeIssues(worktreeDir);
        if (issues.status === "unavailable") uiLog("ui", `ship-set round ${round}: code-issues check skipped — ${outputTail(issues.output, 300)}`);
        if (issues.status === "issues") uiLog("ui", `ship-set round ${round}: code issues in ${issues.files.join(", ") || "(unattributed)"}\n${outputTail(issues.output, 2000)}`);
      } finally {
        // Restore the cached worktree to its pristine base state for reuse.
        options.revalidateLease?.();
        await runCli(["git", "reset", "--hard", baseSha], worktreeDir);
        options.revalidateLease?.();
        await runCli(["git", "clean", "-fd", "--", "src", "include", "config"], worktreeDir);
      }

      const clean =
        report.regressions.length === 0 && report.brokenMatches.length === 0 && report.fuzzyRegressions.length === 0 && issues.status === "clean";
      if (clean) {
        const status = {
          status: report.newMatches.length > 0 ? "pr_ready" : "nothing_to_ship",
          baseSha,
          files: pathspecs.length,
          rounds: round,
          newMatches: report.newMatches.length,
          brokenMatches: 0,
          fuzzyRegressions: 0,
          metricRegressions: 0,
          matchedCodeBytesDelta: report.summary.matchedCodeBytesDelta,
          issuesCheck: issues.status,
          droppedFiles: Object.fromEntries(droppedFiles),
          shippedFiles: pathspecs,
          patchPath,
          checkedAt: new Date().toISOString(),
        };
        uiLog("ui", `ship-set verification: ${status.status} (${status.newMatches} confirmed matches, ${droppedFiles.size} file(s) dropped for rework)`);
        return writeStatus(status);
      }

      const offenders = new Map<string, string[]>();
      const note = (file: string, reason: string): void => {
        if (!file) return;
        offenders.set(file, [...(offenders.get(file) ?? []), reason]);
      };
      for (const file of issues.files) {
        note(file, "code issue (upstream check-issues lint)");
      }
      for (const entry of [...report.brokenMatches, ...report.fuzzyRegressions]) {
        note(entry.sourcePath || sourcePathFromUnit(entry.unitName), `${entry.itemName} ${entry.fromPercent.toFixed(2)} -> ${entry.toPercent.toFixed(2)}`);
      }
      for (const change of report.regressions) {
        note(sourcePathFromUnit(stringValue((change as unknown as JsonObject).name)), `metric ${stringValue((change as unknown as JsonObject).name)}`);
      }
      const droppable = [...offenders.keys()].filter((file) => pathspecs.includes(file));
      if (droppable.length === 0) {
        const status = {
          status: "blocked",
          baseSha,
          files: pathspecs.length,
          rounds: round,
          newMatches: report.newMatches.length,
          brokenMatches: report.brokenMatches.length,
          fuzzyRegressions: report.fuzzyRegressions.length,
          metricRegressions: report.regressions.length,
          droppedFiles: Object.fromEntries(droppedFiles),
          unattributed: Object.fromEntries(offenders),
          patchPath,
          checkedAt: new Date().toISOString(),
        };
        uiLog("ui", "ship-set verification: blocked — regressions could not be attributed to a shippable file");
        return writeStatus(status);
      }
      for (const file of droppable) {
        droppedFiles.set(file, offenders.get(file) ?? []);
        uiLog("ui", `ship-set round ${round}: dropping ${file} (${(offenders.get(file) ?? []).join("; ")})`);
      }
      pathspecs = pathspecs.filter((file) => !droppable.includes(file));
    }
    return writeStatus({ status: "blocked", baseSha, rounds: 4, droppedFiles: Object.fromEntries(droppedFiles), reason: "regressions persisted after 4 refinement rounds", checkedAt: new Date().toISOString() });
  }

  function remoteOwner(repoRoot: string, remote: string): string {
    const result = spawnSync("git", ["-C", repoRoot, "remote", "get-url", remote], { encoding: "utf8" });
    if (result.status !== 0) return "";
    const match = (result.stdout ?? "").trim().match(/github\.com[:/]([^/]+)\//);
    return match ? match[1] : "";
  }

  async function checkCodeIssues(worktreeDir: string): Promise<CodeIssuesResult> {
    if (deps.codeIssuesChecker) return deps.codeIssuesChecker(worktreeDir);
    if (dockerAvailable === null) {
      dockerAvailable = spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;
    }
    if (!dockerAvailable) {
      return { status: "unavailable", output: "docker is not available; upstream CI will still run the Issues check", files: [] };
    }
    const uid = typeof process.getuid === "function" ? process.getuid() : 0;
    const gid = typeof process.getgid === "function" ? process.getgid() : 0;
    const run = await runCli([
      "docker", "run", "--rm",
      "--platform", "linux/amd64",
      "--user", `${uid}:${gid}`,
      "--volume", `${worktreeDir}:/input:ro`,
      CHECK_ISSUES_IMAGE,
    ]);
    const output = `${run.stdout}\n${run.stderr}`.trim();
    if (run.exitCode === 0) return { status: "clean", output, files: [] };
    // The checker prints an issue tree with per-file counts; anything else
    // (daemon hiccup, image pull failure) is infrastructure, not a verdict.
    if (!/Issues: \d/.test(output)) return { status: "unavailable", output, files: [] };
    const files = [...new Set([...output.matchAll(/^\s+((?:src|include)\/\S+) \(\d+\)$/gm)].map((match) => match[1]))];
    return { status: "issues", output, files };
  }

  async function verifyPrSliceInBaseline(params: { baseSha: string; baselineWorktree: string; files: string[]; supportFiles?: string[]; patchPath: string; revalidateLease?: DispatchLeaseRevalidator; reportBuildId?: string }): Promise<{ issues: CodeIssuesResult; report: RegressionReport }> {
    const allFiles = manifestFiles(params.files, params.supportFiles);
    const includeArgs = allFiles.map((file) => `--include=${file}`);
    let report: RegressionReport | null = null;
    let issues: CodeIssuesResult = { status: "unavailable", output: "verification did not reach code-issues", files: [] };
    try {
      params.revalidateLease?.();
      const apply = await runCli(["git", "apply", ...includeArgs, params.patchPath], params.baselineWorktree);
      if (apply.exitCode !== 0) throw new Error(`Slice patch did not apply (${apply.exitCode}): ${outputTail(apply.stderr, 1500)}`);
      const build = await runCli(["ninja", "changes_all"], params.baselineWorktree);
      if (build.exitCode !== 0) throw new Error(`Slice build failed (${build.exitCode}): ${outputTail(build.stderr || build.stdout, 3000)}`);
      report = await readRegressionReport(resolve(params.baselineWorktree, `build/${reportBuildIdFromPath(params.reportBuildId)}/report_changes.json`), "slice isolation", 0);
      if (report.regressions.length === 0 && report.brokenMatches.length === 0 && report.fuzzyRegressions.length === 0) {
        issues = await checkCodeIssues(params.baselineWorktree);
      } else {
        issues = { status: "unavailable", output: "skipped — slice regressed in isolation", files: [] };
      }
    } finally {
      params.revalidateLease?.();
      const reset = await runCli(["git", "reset", "--hard", params.baseSha], params.baselineWorktree);
      const cleanPaths = params.supportFiles?.length
        ? dedupeStrings(["src", "include", "config", ...params.supportFiles])
        : ["src", "include", "config"];
      params.revalidateLease?.();
      const clean = await runCli(["git", "clean", "-fd", "--", ...cleanPaths], params.baselineWorktree);
      if (reset.exitCode !== 0 || clean.exitCode !== 0) {
        throw new Error(
          `Slice verification could not restore pristine baseline ${params.baseSha.slice(0, 10)} ` +
          `(reset=${String(reset.exitCode)}, clean=${String(clean.exitCode)}).`,
        );
      }
    }
    if (!report) throw new Error("Slice verification did not produce a regression report.");
    if (issues.status === "issues") {
      // The upstream image reports issues already present on pristine master
      // (e.g. types.h static_asserts); a slice only fails on issues it adds.
      const patchedEntries = issueEntries(issues.output);
      if (patchedEntries.length === 0) {
        throw new Error("Slice Issues output could not be parsed for pristine-master parity; refusing to classify it as a new clang issue.");
      }
      const baselineIssues = await checkCodeIssues(params.baselineWorktree);
      if (baselineIssues.status === "issues" || baselineIssues.status === "clean") {
        const pristineCounts = new Map<string, number>();
        const baselineEntries = issueEntries(baselineIssues.output);
        if (baselineIssues.status === "issues" && baselineEntries.length === 0) {
          throw new Error("Pristine baseline Issues output could not be parsed; refusing to guess slice/master clang parity.");
        }
        for (const entry of baselineEntries) pristineCounts.set(entry, (pristineCounts.get(entry) ?? 0) + 1);
        const added = patchedEntries.filter((entry) => {
          const remaining = pristineCounts.get(entry) ?? 0;
          if (remaining <= 0) return true;
          pristineCounts.set(entry, remaining - 1);
          return false;
        });
        if (added.length === 0) {
          issues = {
            status: "clean",
            output: `master-parity: every reported issue is pre-existing on pristine ${params.baseSha.slice(0, 10)}\n${outputTail(issues.output, 1200)}`,
            files: [],
          };
        } else {
          issues = { ...issues, output: `new vs pristine baseline:\n${added.join("\n")}\n\nfull output:\n${issues.output}` };
        }
      }
    }
    return { report, issues };
  }

  // Flatten a check-issues tree into "file :: message" entries, ignoring line
  // numbers so unrelated edits in the same header do not shift parity.
  function issueEntries(output: string): string[] {
    const entries: string[] = [];
    let file = "";
    for (const line of output.split("\n")) {
      const fileMatch = line.match(/^\s+((?:src|include)\/\S+) \(\d+\)$/);
      if (fileMatch) {
        file = fileMatch[1];
        continue;
      }
      const issueMatch = line.match(/^\s+\d+:\d+: (.+)$/);
      if (issueMatch && file) entries.push(`${file} :: ${issueMatch[1].trim()}`);
    }
    return entries.sort();
  }

  function sliceValidationSummary(report: RegressionReport, issues: CodeIssuesResult): JsonObject {
    const regressions = report.regressions.length + report.brokenMatches.length + report.fuzzyRegressions.length;
    const status = regressions > 0 || issues.status === "issues" ? "failed" : issues.status === "unavailable" ? "warning" : "passed";
    return {
      status,
      checkedAt: new Date().toISOString(),
      newMatches: report.newMatches.length,
      regressions,
      brokenMatches: report.brokenMatches.length,
      fuzzyRegressions: report.fuzzyRegressions.length,
      metricRegressions: report.regressions.length,
      matchedCodeBytesDelta: report.summary.matchedCodeBytesDelta,
      issuesCheck: issues.status,
      issuesFiles: issues.files,
      issuesOutput: issues.status === "clean" ? "" : outputTail(issues.output, 1200),
    };
  }

  function assertSliceVerificationClean(branch: string, validation: JsonObject): void {
    if (stringValue(validation.status) === "passed" || stringValue(validation.status) === "warning") return;
    throw new Error(
      `Slice ${branch} is not locally ready: ${numberValue(validation.brokenMatches)} broken · ${numberValue(validation.fuzzyRegressions)} fuzzy · ${numberValue(validation.metricRegressions)} metric · ${stringValue(validation.issuesCheck)} issues.`,
    );
  }

  async function readyLocalPrSource(params: { baseSha: string; branch: string; files: string[]; supportFiles?: string[]; record: JsonObject; repoRoot: string; stateDir: string }): Promise<JsonObject | null> {
    const local = asObject(params.record.local);
    const worktreePath = stringValue(local.worktreePath);
    const localStatus = stringValue(local.status);
    const localBranchRecord = isLocalBranchPrRecord(params.record);

    if (localStatus !== "ready" && !localBranchRecord) return null;
    if (localStatus === "ready" && (!worktreePath || !existsSync(resolve(worktreePath, ".git")))) {
      updatePrRecord(params.stateDir, params.branch, (record) => ({
        ...record,
        local: {
          ...asObject(record.local),
          status: localBranchRecord ? "local_only" : "blocked",
          error: worktreePath ? `Local PR worktree is missing at ${worktreePath}.` : "Local PR worktree path is missing.",
        },
      }));
      if (!localBranchRecord) return null;
    }

    if (worktreePath && existsSync(resolve(worktreePath, ".git"))) {
      const status = await runGit(worktreePath, ["status", "--porcelain"], { check: false });
      if (status.exitCode !== 0) throw new Error(`Unable to inspect local PR worktree for ${params.branch}: ${outputTail(status.stderr || status.stdout, 1200)}`);
      if (status.stdout.trim()) {
        const message = `Local PR worktree for ${params.branch} has uncommitted changes at ${worktreePath}. Commit or stash them before opening a draft.`;
        updatePrRecord(params.stateDir, params.branch, (record) => ({
          ...record,
          local: {
            ...asObject(record.local),
            status: "dirty",
            error: message,
          },
        }));
        throw new Error(message);
      }

      const currentBranch = await runGit(worktreePath, ["rev-parse", "--abbrev-ref", "HEAD"], { failureHint: `Unable to read local PR worktree branch for ${params.branch}` });
      if (currentBranch.stdout.trim() !== params.branch) {
        throw new Error(`Local PR worktree for ${params.branch} is checked out to ${currentBranch.stdout.trim() || "(detached)"}. Check out ${params.branch} before opening.`);
      }
    }

    if (!branchExists(params.repoRoot, params.branch)) return null;
    const sourceRepo = worktreePath && existsSync(resolve(worktreePath, ".git")) ? worktreePath : params.repoRoot;
    const head = await runGit(params.repoRoot, ["rev-parse", params.branch], { failureHint: `Unable to read local PR branch HEAD for ${params.branch}` });
    const commitSha = head.stdout.trim();
    const diffBase = localBranchDiffBase(params.repoRoot, params.baseSha, params.branch);
    const allFiles = manifestFiles(params.files, params.supportFiles);
    const changed = await runGit(params.repoRoot, ["diff", "--name-only", `${diffBase}..${params.branch}`], { failureHint: `Unable to inspect local PR diff for ${params.branch}` });
    const changedFiles = changed.stdout.split("\n").map((file) => file.trim()).filter(Boolean);
    if (changedFiles.length === 0) throw new Error(`Local PR branch ${params.branch} has no committed diff from ${diffBase.slice(0, 10)}.`);
    const manifest = new Set(allFiles);
    const outsideManifest = changedFiles.filter((file) => !manifest.has(file));
    if (outsideManifest.length > 0) {
      const manifestLabel = params.supportFiles?.length ? "PR manifest (files + declared support files)" : "PR manifest";
      throw new Error(`Local PR branch ${params.branch} changes file(s) outside the ${manifestLabel}: ${outsideManifest.slice(0, 8).join(", ")}${outsideManifest.length > 8 ? `, +${outsideManifest.length - 8} more` : ""}. Re-plan or move those edits before opening.`);
    }

    const patchDir = resolve(params.stateDir, "pr_handoff", "local_patches");
    mkdirSync(patchDir, { recursive: true });
    const patchPath = resolve(patchDir, `${prBranchPathSlug(params.branch)}.patch`);
    const diff = await runGit(params.repoRoot, ["diff", "--binary", `${diffBase}..${params.branch}`, "--", ...allFiles], { failureHint: `Unable to write local PR patch for ${params.branch}` });
    if (!diff.stdout.trim()) throw new Error(`Local PR worktree for ${params.branch} produced an empty manifest diff.`);
    writeFileSync(patchPath, diff.stdout, "utf8");

    return {
      commitSha,
      diffBase,
      patchPath,
      source: sourceRepo === worktreePath ? "local_worktree" : "local_branch",
      worktreePath: sourceRepo === worktreePath ? worktreePath : "",
    };
  }

  async function prepareLocalPrWorkspace(params: {
    baseSha: string;
    branch: string;
    files: string[];
    supportFiles?: string[];
    force: boolean;
    patchPath: string;
    record: JsonObject;
    repoRoot: string;
    revalidateLease?: DispatchLeaseRevalidator;
    runId: string;
    stateDir: string;
    title: string;
  }): Promise<JsonObject> {
    const local = asObject(params.record.local);
    const existingWorktree = stringValue(local.worktreePath);
    const worktreePath = existingWorktree || prWorkspacePath(params.stateDir, params.runId, params.branch);
    if (stringValue(local.status) === "ready" && worktreePath && existsSync(resolve(worktreePath, ".git"))) {
      return {
        ...params.record,
        local: { ...local, status: "ready", branch: params.branch, worktreePath },
      };
    }
    if (existsSync(worktreePath) && !params.force) {
      throw new Error(`Local worktree already exists at ${worktreePath}. Inspect it or rerun with force before overwriting local PR workspace state.`);
    }

    mkdirSync(dirname(worktreePath), { recursive: true });
    if (!existsSync(resolve(worktreePath, ".git"))) {
      params.revalidateLease?.();
      await runGit(params.repoRoot, ["worktree", "prune"], { check: false });
      params.revalidateLease?.();
      const add = await runGit(params.repoRoot, ["worktree", "add", "-B", params.branch, worktreePath, params.baseSha], { check: false });
      if (add.exitCode !== 0) throw new Error(`git worktree add failed (${add.exitCode}): ${outputTail(add.stderr || add.stdout, 1500)}`);
    } else if (params.force) {
      params.revalidateLease?.();
      const checkout = await runGit(worktreePath, ["checkout", "-B", params.branch, params.baseSha], { check: false });
      if (checkout.exitCode !== 0) throw new Error(`git checkout failed in local PR worktree (${checkout.exitCode}): ${outputTail(checkout.stderr || checkout.stdout, 1500)}`);
      params.revalidateLease?.();
      await runGit(worktreePath, ["reset", "--hard", params.baseSha], { check: false });
      params.revalidateLease?.();
      await runGit(worktreePath, ["clean", "-fd", "--", "src", "include", "config"], { check: false });
    }

    const origSource = resolve(params.repoRoot, "orig");
    params.revalidateLease?.();
    if (existsSync(origSource)) linkMissingFiles(origSource, resolve(worktreePath, "orig"));

    const allFiles = manifestFiles(params.files, params.supportFiles);
    const includeArgs = allFiles.map((file) => `--include=${file}`);
    params.revalidateLease?.();
    const apply = await runCli(["git", "apply", "--index", ...includeArgs, params.patchPath], worktreePath);
    if (apply.exitCode !== 0) throw new Error(`Patch apply failed in the local PR worktree (${apply.exitCode}): ${outputTail(apply.stderr, 1500)}`);
    params.revalidateLease?.();
    const commit = await runCli(["git", "commit", "-m", params.title], worktreePath);
    if (commit.exitCode !== 0) throw new Error(`git commit failed in the local PR worktree (${commit.exitCode}): ${outputTail(commit.stderr || commit.stdout, 1500)}`);
    const head = await runGit(worktreePath, ["rev-parse", "HEAD"], { failureHint: "Unable to read local PR worktree HEAD" });
    return {
      ...params.record,
      local: {
        ...local,
        status: "ready",
        branch: params.branch,
        worktreePath,
        commitSha: head.stdout.trim(),
        preparedAt: new Date().toISOString(),
        error: "",
      },
    };
  }

  async function publishPatchToFork(params: { baseSha: string; branch: string; files: string[]; supportFiles?: string[]; patchPath: string; repoRoot: string; revalidateLease?: DispatchLeaseRevalidator; title: string }): Promise<void> {
    const allFiles = manifestFiles(params.files, params.supportFiles);
    const includeArgs = allFiles.map((file) => `--include=${file}`);
    const worktreeDir = resolve(tmpdir(), `melee-pr-${params.branch.replace(/[^A-Za-z0-9_.-]+/g, "-")}`);
    params.revalidateLease?.();
    if (existsSync(worktreeDir)) await runCli(["git", "worktree", "remove", "--force", worktreeDir], params.repoRoot);
    params.revalidateLease?.();
    const add = await runCli(["git", "worktree", "add", "-B", params.branch, worktreeDir, params.baseSha], params.repoRoot);
    if (add.exitCode !== 0) throw new Error(`git worktree add failed (${add.exitCode}): ${outputTail(add.stderr, 1500)}`);
    try {
      params.revalidateLease?.();
      const apply = await runCli(["git", "apply", "--index", ...includeArgs, params.patchPath], worktreeDir);
      if (apply.exitCode !== 0) throw new Error(`Patch apply failed in the PR worktree (${apply.exitCode}): ${outputTail(apply.stderr, 1500)}`);
      params.revalidateLease?.();
      const commit = await runCli(["git", "commit", "-m", params.title], worktreeDir);
      if (commit.exitCode !== 0) throw new Error(`git commit failed (${commit.exitCode}): ${outputTail(commit.stderr || commit.stdout, 1500)}`);
      params.revalidateLease?.();
      const push = await runCli(["git", "push", "--force-with-lease", "-u", "fork", params.branch], worktreeDir);
      if (push.exitCode !== 0) throw new Error(`git push failed (${push.exitCode}): ${outputTail(push.stderr, 1500)}`);
    } finally {
      params.revalidateLease?.();
      await runCli(["git", "worktree", "remove", "--force", worktreeDir], params.repoRoot);
    }
  }

  async function verifySupportMergeOrder(params: {
    repoRoot: string;
    branch: string;
    sliceId: string;
    files: string[];
    supportFiles: string[];
    others: Array<{ branch: string; sliceId: string; files: string[]; supportFiles: string[] }>;
  }): Promise<JsonObject> {
    let checkedPairs = 0;
    const skipped: JsonObject[] = [];
    for (const other of params.others) {
      if (other.branch === params.branch) continue;
      const otherFiles = new Set([...other.files, ...other.supportFiles]);
      const otherSupportFiles = new Set(other.supportFiles);
      const overlap = dedupeStrings([
        ...params.supportFiles.filter((file) => otherFiles.has(file)),
        ...params.files.filter((file) => otherSupportFiles.has(file)),
      ]);
      if (overlap.length === 0) continue;
      if (!branchExists(params.repoRoot, params.branch)) {
        throw new Error(
          `Merge-order verification cannot resolve slice ${params.sliceId} (branch ${params.branch}) while checking ` +
          `prepared slice ${other.sliceId}; shared support file(s): ${overlap.join(", ")}.`,
        );
      }
      if (!branchExists(params.repoRoot, other.branch)) {
        throw new Error(
          `Merge-order verification cannot resolve prepared slice ${other.sliceId} (branch ${other.branch}) while checking ` +
          `slice ${params.sliceId} (branch ${params.branch}); shared support file(s): ${overlap.join(", ")}.`,
        );
      }

      const [forward, reverse] = await Promise.all([
        runGit(params.repoRoot, ["merge-tree", "--write-tree", "--name-only", params.branch, other.branch], { check: false }),
        runGit(params.repoRoot, ["merge-tree", "--write-tree", "--name-only", other.branch, params.branch], { check: false }),
      ]);
      const unsupported = [forward, reverse].find((result) => result.exitCode !== 0 && result.exitCode !== 1);
      if (unsupported) {
        throw new Error(
          `Merge-order verification requires git >= 2.38 with \`merge-tree --write-tree\` (git merge-tree exited ${String(unsupported.exitCode)} for slices ${params.sliceId} and ${other.sliceId}).`,
        );
      }
      const conflictedFiles = dedupeStrings(
        [forward, reverse]
          .filter((result) => result.exitCode === 1)
          .flatMap((result) => {
            const lines = result.stdout.split("\n");
            const oidLine = lines.findIndex((line) => line.trim().length > 0);
            if (oidLine < 0) return [];
            const files: string[] = [];
            for (const line of lines.slice(oidLine + 1)) {
              const trimmed = line.trim();
              if (!trimmed) {
                if (files.length > 0) break;
                continue;
              }
              files.push(trimmed.includes("\t") ? trimmed.slice(trimmed.lastIndexOf("\t") + 1) : trimmed);
            }
            return files;
          }),
      );
      if (forward.exitCode === 1 || reverse.exitCode === 1) {
        const conflictList = conflictedFiles.length > 0 ? conflictedFiles.join(", ") : overlap.join(", ");
        throw new Error(
          `Merge-order conflict: slice ${params.sliceId} (branch ${params.branch}) and slice ${other.sliceId} (branch ${other.branch}) both change ${conflictList} with non-identical, overlapping hunks. Per the cross-module ruling, shared foreign-file hunks must be byte-identical mirrors or zero-overlap.`,
        );
      }
      const forwardTree = forward.stdout.split("\n").map((line) => line.trim()).find((line) => /^[0-9a-f]{40,64}$/i.test(line));
      const reverseTree = reverse.stdout.split("\n").map((line) => line.trim()).find((line) => /^[0-9a-f]{40,64}$/i.test(line));
      if (!forwardTree || !reverseTree) {
        throw new Error(
          `Merge-order verification produced no result tree for slices ${params.sliceId} and ${other.sliceId}; ` +
          `shared support file(s): ${overlap.join(", ")}.`,
        );
      }
      if (forwardTree !== reverseTree) {
        throw new Error(
          `Merge-order result mismatch: slice ${params.sliceId} (branch ${params.branch}) and slice ${other.sliceId} ` +
          `(branch ${other.branch}) produce different trees in opposite orders for ${overlap.join(", ")}. ` +
          "Shared foreign-file changes must be byte-identical mirrors or zero-overlap.",
        );
      }
      checkedPairs += 1;
    }
    return { checkedPairs, conflicts: [], skipped };
  }

  return {
    assertSliceVerificationClean,
    checkCodeIssues,
    ensureOpenPrBaseline,
    prepareLocalPrWorkspace,
    publishPatchToFork,
    readyLocalPrSource,
    rebuildProductionBaseline,
    remoteOwner,
    sliceValidationSummary,
    verifyPrSliceInBaseline,
    verifySupportMergeOrder,
    verifyShipSet,
  };
}
