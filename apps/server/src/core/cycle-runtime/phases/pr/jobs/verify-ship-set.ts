import { copyFileSync, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { latestPrSplitPlanSummary } from "@server/core/cycle-runtime/phases/pr/artifacts.js";
import { prHandoffArtifactPath } from "@server/core/cycle-runtime/phases/pr/pr-records.js";
import { getLatestRun, openState } from "@server/core/cycle-runtime/run-state/index.js";
import {
  createPrWorktreeService,
  type CliResult,
  type CodeIssuesResult,
  type JsonObject,
  type PrWorktreeGameContext,
} from "@server/core/cycle-runtime/phases/pr/pr-worktrees.js";
import { stringArg, type GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import { readRegressionReport, type RegressionReport } from "@server/core/validation/objdiff/report.js";
import { runCommand } from "@server/infrastructure/shell/index.js";

export interface VerifyShipSetDeps {
  codeIssuesChecker?: (worktreeDir: string) => Promise<CodeIssuesResult>;
  readRegressionReport?: (reportChangesPath: string, title: string, maxRows: number) => Promise<RegressionReport>;
  runCli?: (command: string[], cwd?: string) => Promise<CliResult>;
  trace?: (message: string) => void;
}

interface StandalonePrContext extends PrWorktreeGameContext {
  handoffDir: string;
  game: { baseRef: string };
}

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function outputTail(value: string, maxLength = 4000): string {
  return value.length <= maxLength ? value : value.slice(-maxLength);
}

function sanitizePathPart(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "manual";
}

function matchPathspecsFromPlan(plan: JsonObject): string[] {
  const slices = asArray(plan.slices).map(asObject);
  const fromSlices = slices
    .filter((slice) => slice.lane === "match")
    .flatMap((slice) => asArray(slice.pathspecs))
    .map((path) => stringValue(path).trim())
    .filter(Boolean);
  const pathspecs = fromSlices.length > 0 ? fromSlices : asArray(plan.matchPathspecs).map((path) => stringValue(path).trim()).filter(Boolean);
  return [...new Set(pathspecs)];
}

function publishArtifacts(params: {
  baseline: JsonObject;
  runId: string;
  ship: JsonObject;
  sourceRef: string;
  sourceSha: string;
  stagedPatchPath: string;
  stateDir: string;
}): { baselineStatusPath: string; patchPath: string; shipStatusPath: string } {
  const baselineStatusPath = prHandoffArtifactPath(params.stateDir, "", "baseline_status.json");
  const shipStatusPath = prHandoffArtifactPath(params.stateDir, "", "ship_status.json");
  const patchPath = prHandoffArtifactPath(params.stateDir, "", "ship_set.patch");
  const handoffDir = dirname(shipStatusPath);
  mkdirSync(handoffDir, { recursive: true });
  const publishDir = mkdtempSync(resolve(handoffDir, ".verify-ship-set-publish-"));
  const staged = [
    { target: patchPath, path: resolve(publishDir, "ship_set.patch") },
    { target: baselineStatusPath, path: resolve(publishDir, "baseline_status.json") },
    { target: shipStatusPath, path: resolve(publishDir, "ship_status.json") },
  ];
  const backups: Array<{ target: string; path: string }> = [];
  try {
    copyFileSync(params.stagedPatchPath, staged[0].path);
    writeFileSync(staged[1].path, JSON.stringify(params.baseline, null, 2), "utf8");
    writeFileSync(
      staged[2].path,
      JSON.stringify(
        {
          ...params.ship,
          baseSha: stringValue(params.baseline.baseSha),
          patchPath,
          runId: params.runId,
          sourceRef: params.sourceRef,
          sourceSha: params.sourceSha,
        },
        null,
        2,
      ),
      "utf8",
    );

    for (const artifact of staged) {
      if (!existsSync(artifact.target)) continue;
      const backupPath = resolve(publishDir, `backup-${backups.length}`);
      renameSync(artifact.target, backupPath);
      backups.push({ target: artifact.target, path: backupPath });
    }
    for (const artifact of staged) renameSync(artifact.path, artifact.target);
    return { baselineStatusPath, patchPath, shipStatusPath };
  } catch (error) {
    for (const artifact of staged) rmSync(artifact.target, { force: true });
    for (const backup of backups.reverse()) {
      if (existsSync(backup.path)) renameSync(backup.path, backup.target);
    }
    throw error;
  } finally {
    rmSync(publishDir, { force: true, recursive: true });
  }
}

export async function verifyShipSet(globals: GlobalArgs, args: Map<string, string | true>, deps: VerifyShipSetDeps = {}): Promise<JsonObject> {
  let runId = stringArg(args, "--run-id", "").trim();
  if (!runId) {
    const store = openState(globals.stateDir);
    try {
      runId = getLatestRun(store)?.id ?? "";
    } finally {
      store.db.close();
    }
  }
  if (!runId) throw new Error("No run found. Pass --run-id or run init-run first.");
  const baseRef = stringArg(args, "--base-ref", "origin/master").trim() || "origin/master";
  const sourceRef = stringArg(args, "--source-ref", "HEAD").trim() || "HEAD";
  const trace = deps.trace ?? ((message: string) => process.stderr.write(`[verify-ship-set] ${message}\n`));
  const runCli =
    deps.runCli ??
    (async (command: string[], cwd = globals.repoRoot): Promise<CliResult> => {
      return runCommand(cwd, command);
    });
  const runGit = async (
    repoRoot: string,
    gitArgs: string[],
    options: { check?: boolean; failureHint?: string } = {},
  ): Promise<CliResult> => {
    const result = await runCli(["git", ...gitArgs], repoRoot);
    if (options.check !== false && result.exitCode !== 0) {
      throw new Error(`${options.failureHint ?? `git ${gitArgs.join(" ")} failed`} (${result.exitCode}): ${outputTail(result.stderr || result.stdout)}`);
    }
    return result;
  };

  trace("fetching origin");
  await runGit(globals.repoRoot, ["fetch", "--prune", "origin"], { failureHint: "Unable to fetch origin" });
  const baseSha = (
    await runGit(globals.repoRoot, ["rev-parse", "--verify", `${baseRef}^{commit}`], { failureHint: `Unable to resolve ${baseRef}` })
  ).stdout.trim();
  const sourceSha = (
    await runGit(globals.repoRoot, ["rev-parse", "--verify", `${sourceRef}^{commit}`], { failureHint: `Unable to resolve ${sourceRef}` })
  ).stdout.trim();

  const plan = latestPrSplitPlanSummary(globals.stateDir, runId);
  if (!plan || stringValue(plan.status) !== "passed") {
    throw new Error(`No passed PR split plan found for run ${runId}. Run Plan PRs before verify-ship-set.`);
  }
  const matchPathspecs = matchPathspecsFromPlan(plan);
  if (matchPathspecs.length === 0) throw new Error(`The latest PR split plan for run ${runId} has no match-lane pathspecs.`);

  const handoffRoot = dirname(prHandoffArtifactPath(globals.stateDir, "", "ship_status.json"));
  mkdirSync(handoffRoot, { recursive: true });
  const stagingDir = mkdtempSync(resolve(handoffRoot, `.verify-ship-set-${sanitizePathPart(runId)}-`));
  const paths: StandalonePrContext = {
    handoffDir: stagingDir,
    game: { baseRef },
    repoRoot: globals.repoRoot,
    stateDir: globals.stateDir,
  };
  const worktrees = createPrWorktreeService<StandalonePrContext>({
    appendLog: (_stream, message) => trace(message),
    branchExists: () => false,
    codeIssuesChecker: deps.codeIssuesChecker,
    isLocalBranchPrRecord: () => false,
    localBranchDiffBase: () => "",
    outputTail,
    prBranchPathSlug: sanitizePathPart,
    prWorkspacePath: () => "",
    readRegressionReport: deps.readRegressionReport ?? readRegressionReport,
    runCli,
    runGit,
    updatePrRecord: () => null,
  });

  try {
    trace(`building production baseline for ${baseRef} @ ${baseSha.slice(0, 10)}`);
    const baseline = await worktrees.rebuildProductionBaseline(paths);
    if (stringValue(baseline.baseSha) !== baseSha) {
      throw new Error(`Baseline moved during verification (${baseSha} -> ${stringValue(baseline.baseSha) || "unknown"}); rerun verify-ship-set.`);
    }
    trace(`verifying ${matchPathspecs.length} match-lane file(s) from ${sourceRef} @ ${sourceSha.slice(0, 10)}`);
    const ship = await worktrees.verifyShipSet(paths, baseline, matchPathspecs, { sourceRef: sourceSha });
    if (stringValue(ship.status) !== "pr_ready") {
      throw new Error(`Ship-set verification returned ${stringValue(ship.status, "unknown")}; live handoff stamps were not updated.`);
    }
    const stagedPatchPath = stringValue(ship.patchPath);
    if (!stagedPatchPath || !existsSync(stagedPatchPath)) throw new Error("Ship-set verification did not produce ship_set.patch.");
    const finalBaseSha = (
      await runGit(globals.repoRoot, ["rev-parse", "--verify", `${baseRef}^{commit}`], { failureHint: `Unable to re-resolve ${baseRef}` })
    ).stdout.trim();
    const finalSourceSha = (
      await runGit(globals.repoRoot, ["rev-parse", "--verify", `${sourceRef}^{commit}`], { failureHint: `Unable to re-resolve ${sourceRef}` })
    ).stdout.trim();
    if (finalBaseSha !== baseSha || finalSourceSha !== sourceSha) {
      throw new Error(
        `Refs moved during verification (base ${baseSha} -> ${finalBaseSha || "unknown"}; source ${sourceSha} -> ${finalSourceSha || "unknown"}); live handoff stamps were not updated.`,
      );
    }
    const artifacts = publishArtifacts({ baseline, runId, ship, sourceRef, sourceSha, stagedPatchPath, stateDir: globals.stateDir });
    const result = {
      status: "pr_ready",
      runId,
      baseRef,
      baseSha,
      sourceRef,
      sourceSha,
      matchPathspecs,
      planSummaryPath: stringValue(plan.summaryPath),
      ...artifacts,
    };
    console.log(JSON.stringify(result, null, 2));
    return result;
  } finally {
    rmSync(stagingDir, { force: true, recursive: true });
  }
}
