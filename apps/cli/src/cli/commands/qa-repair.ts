import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { qaRepairPrompt, validateQaRepairAgentResult } from "@decomp-orchestrator/agents/qa-repair";
import { artifactTimestamp, parseJsonObject, runPiAgent, type PiRunOptions } from "@decomp-orchestrator/agents/runtime";
import {
  applyQaRepairValidation,
  buildQaRepairQueue,
  candidateProofsFromCheckpoint,
  qaRepairShipStatus,
  renderQaRepairReport,
  summarizeQaRepairQueue,
  validateQaRepairOutcome,
  type QaRepairAttempt,
  type QaRepairQueue,
  type QaRepairQueueItem,
} from "@decomp-orchestrator/core/qa/repair-lane";
import { parseQaScanResult, runQaScanDiff, type QaScanResult } from "@decomp-orchestrator/core/qa";
import { runCommand } from "@decomp-orchestrator/core/shell";
import { addPiSession, getLatestRun, openState } from "@decomp-orchestrator/core/state";
import type { PiRunResult } from "@decomp-orchestrator/core/types";
import { latestCheckpointSummary } from "@decomp-orchestrator/core/handoff";
import { packageRoot } from "@decomp-orchestrator/knowledge";
import { booleanArg, numberArg, projectMetadata, stringArg, type GlobalArgs } from "../args.js";

export type QaRepairAgentRunner = (options: PiRunOptions) => Promise<PiRunResult>;
type QaRepairValidationKind = "score" | "build" | "regression";
type QaRepairValidationCommands = Partial<Record<QaRepairValidationKind, string>>;

interface QaRepairCommandValidation {
  kind: QaRepairValidationKind;
  status: "passed" | "failed" | "skipped";
  command?: string;
  exitCode?: number;
  stdoutPath?: string;
  stderrPath?: string;
  summaryPath?: string;
  preTargetScore?: number | null;
  postTargetScore?: number | null;
  scoreImpact?: "same_match" | "lower_score" | "unknown" | null;
  reason?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function resolvePath(path: string): string {
  return isAbsolute(path) ? path : resolve(path);
}

function stringList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function numberField(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function scoreImpactField(value: unknown): "same_match" | "lower_score" | "unknown" | null {
  return value === "same_match" || value === "lower_score" || value === "unknown" ? value : null;
}

async function runProcess(repoRoot: string, command: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolveProcess) => {
    const child = spawn(command[0] ?? "", command.slice(1), { cwd: repoRoot });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (error) => {
      resolveProcess({ exitCode: -1, stdout: Buffer.concat(stdout).toString("utf8"), stderr: `${Buffer.concat(stderr).toString("utf8")}${error.message}` });
    });
    child.on("close", (code) => {
      resolveProcess({ exitCode: code ?? -1, stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") });
    });
  });
}

function candidateListFromFile(path: string): string[] {
  if (!path) return [];
  const raw = readFileSync(resolvePath(path), "utf8");
  if (path.endsWith(".json")) {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed.filter((item): item is string => typeof item === "string");
    if (isRecord(parsed) && Array.isArray(parsed.files)) return parsed.files.filter((item): item is string => typeof item === "string");
    throw new Error(`--candidate-list ${path} must be a JSON array, or an object with files[]`);
  }
  return raw
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

function scanResultFromJson(raw: unknown, sourcePath: string): QaScanResult {
  if (!isRecord(raw)) throw new Error(`${sourcePath} is not a JSON object`);
  const parsed = parseQaScanResult(JSON.stringify(raw));
  if (!parsed) throw new Error(`${sourcePath} is not a review_lint scan_diff JSON result`);
  return parsed;
}

function latestRunId(stateDir: string): string {
  const store = openState(stateDir);
  try {
    return getLatestRun(store)?.id ?? "manual";
  } finally {
    store.db.close();
  }
}

function latestCheckpointPath(stateDir: string, runId: string): string {
  if (!runId || runId === "manual") return "";
  const store = openState(stateDir);
  try {
    return String(latestCheckpointSummary(store, runId)?.summaryPath ?? "");
  } finally {
    store.db.close();
  }
}

function renderQaRepairValidationCommand(
  template: string,
  params: {
    repoRoot: string;
    stateDir: string;
    outputDir: string;
    runId: string;
    item: QaRepairQueueItem;
    baseRef: string | null;
  },
): string {
  const replacements: Record<string, string> = {
    repo_root: shellQuote(params.repoRoot),
    state_dir: shellQuote(params.stateDir),
    output_dir: shellQuote(params.outputDir),
    run_id: shellQuote(params.runId),
    item_id: shellQuote(params.item.id),
    source_path: shellQuote(params.item.source_path),
    base_ref: shellQuote(params.baseRef ?? ""),
  };
  return template.replace(/\{([a-z_]+)\}/g, (match, key: string) => replacements[key] ?? match);
}

function parseScoreValidation(stdout: string): Pick<QaRepairCommandValidation, "preTargetScore" | "postTargetScore" | "scoreImpact"> {
  try {
    const parsed = JSON.parse(stdout) as Record<string, unknown>;
    const preTargetScore = numberField(parsed.preTargetScore ?? parsed.pre_target_score ?? parsed.before_score ?? parsed.pre_score);
    const postTargetScore = numberField(parsed.postTargetScore ?? parsed.post_target_score ?? parsed.after_score ?? parsed.post_score);
    const scoreImpact = scoreImpactField(parsed.scoreImpact ?? parsed.score_impact);
    return { preTargetScore, postTargetScore, scoreImpact };
  } catch {
    return {};
  }
}

async function runQaRepairValidationCommand(params: {
  kind: QaRepairValidationKind;
  template: string;
  globals: GlobalArgs;
  runId: string;
  item: QaRepairQueueItem;
  itemDir: string;
  baseRef: string | null;
}): Promise<QaRepairCommandValidation> {
  const command = renderQaRepairValidationCommand(params.template, {
    repoRoot: params.globals.repoRoot,
    stateDir: params.globals.stateDir,
    outputDir: params.itemDir,
    runId: params.runId,
    item: params.item,
    baseRef: params.baseRef,
  });
  const result = await runProcess(params.globals.repoRoot, ["/bin/sh", "-lc", command]);
  const stdoutPath = resolve(params.itemDir, `${params.kind}_check.stdout.txt`);
  const stderrPath = resolve(params.itemDir, `${params.kind}_check.stderr.txt`);
  const summaryPath = resolve(params.itemDir, `${params.kind}_check.summary.json`);
  await writeFile(stdoutPath, result.stdout);
  await writeFile(stderrPath, result.stderr);
  const score = params.kind === "score" ? parseScoreValidation(result.stdout) : {};
  const validation: QaRepairCommandValidation = {
    kind: params.kind,
    status: result.exitCode === 0 ? "passed" : "failed",
    command,
    exitCode: result.exitCode,
    stdoutPath,
    stderrPath,
    summaryPath,
    ...score,
  };
  await writeFile(summaryPath, `${JSON.stringify(validation, null, 2)}\n`);
  return validation;
}

async function runQaRepairValidationCommands(params: {
  commands: QaRepairValidationCommands;
  globals: GlobalArgs;
  runId: string;
  item: QaRepairQueueItem;
  itemDir: string;
  baseRef: string | null;
}): Promise<QaRepairCommandValidation[]> {
  const validations: QaRepairCommandValidation[] = [];
  for (const kind of ["score", "build", "regression"] as const) {
    const template = params.commands[kind];
    if (!template) {
      validations.push({ kind, status: "skipped", reason: `no --${kind}-check-command configured` });
      continue;
    }
    validations.push(await runQaRepairValidationCommand({ kind, template, globals: params.globals, runId: params.runId, item: params.item, itemDir: params.itemDir, baseRef: params.baseRef }));
  }
  return validations;
}

function commandValidationByKind(validations: QaRepairCommandValidation[], kind: QaRepairValidationKind): QaRepairCommandValidation | undefined {
  return validations.find((validation) => validation.kind === kind);
}

function commandPassed(validation: QaRepairCommandValidation | undefined): boolean | null {
  if (!validation || validation.status === "skipped") return null;
  return validation.status === "passed";
}

function validationArtifactPaths(validations: QaRepairCommandValidation[]): Record<string, string | null> {
  const artifacts: Record<string, string | null> = {};
  for (const validation of validations) {
    artifacts[`${validation.kind}_check`] = validation.summaryPath ?? null;
  }
  return artifacts;
}

function validationSummaryPath(validations: QaRepairCommandValidation[], kind: QaRepairValidationKind): string | undefined {
  return commandValidationByKind(validations, kind)?.summaryPath;
}

async function headSha(repoRoot: string): Promise<string | null> {
  const result = await runCommand(repoRoot, ["git", "rev-parse", "HEAD"]);
  return result.exitCode === 0 ? result.stdout.trim() : null;
}

function recordQaRepairSession(globals: GlobalArgs, runId: string, result: PiRunResult): void {
  if (!runId || runId === "manual") return;
  const store = openState(globals.stateDir);
  try {
    addPiSession({
      store,
      runId,
      role: "qa-repair",
      sessionId: result.sessionId,
      sessionFile: result.sessionFile,
      provider: globals.provider,
      model: globals.model,
      thinkingLevel: globals.thinkingLevel,
      status: result.failed ? "failed" : result.dryRun ? "dry_run" : "succeeded",
      outputPath: result.outputPath,
    });
  } finally {
    store.db.close();
  }
}

async function writeArtifacts(queue: QaRepairQueue, outputDir: string): Promise<{ queuePath: string; summaryPath: string; reportPath: string; shipStatusPath: string }> {
  await mkdir(outputDir, { recursive: true });
  const queuePath = resolve(outputDir, "queue.json");
  const summaryPath = resolve(outputDir, "summary.json");
  const reportPath = resolve(outputDir, "report.md");
  const shipStatusPath = resolve(outputDir, "ship_status.json");
  const summary = summarizeQaRepairQueue(queue, {
    artifact_dir: outputDir,
    queue_path: queuePath,
    summary_path: summaryPath,
    report_path: reportPath,
    ship_status_path: shipStatusPath,
  });
  const shipStatus = qaRepairShipStatus(queue);
  await writeFile(queuePath, `${JSON.stringify(queue, null, 2)}\n`);
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  await writeFile(reportPath, renderQaRepairReport(queue, summary));
  await writeFile(shipStatusPath, `${JSON.stringify(shipStatus, null, 2)}\n`);
  return { queuePath, summaryPath, reportPath, shipStatusPath };
}

function appendAttempt(queue: QaRepairQueue, itemId: string, attempt: QaRepairAttempt): QaRepairQueue {
  return {
    ...queue,
    items: queue.items.map((item) => (item.id === itemId ? { ...item, attempts: [...item.attempts, attempt] } : item)),
  };
}

async function writeScanInvocation(outputDir: string, name: string, invocation: Awaited<ReturnType<typeof runQaScanDiff>>): Promise<string> {
  const jsonPath = resolve(outputDir, `${name}.json`);
  const textPath = resolve(outputDir, `${name}.txt`);
  await writeFile(
    jsonPath,
    invocation.stdout ||
      `${JSON.stringify({ command: invocation.command, exitCode: invocation.exitCode, toolError: invocation.toolError, result: invocation.result }, null, 2)}\n`,
  );
  if (invocation.stderr) await writeFile(textPath, invocation.stderr);
  return jsonPath;
}

async function processQueueItem(params: {
  globals: GlobalArgs;
  runId: string;
  queue: QaRepairQueue;
  item: QaRepairQueueItem;
  outputDir: string;
  baseRef: string | null;
  validationCommands: QaRepairValidationCommands;
  runner: QaRepairAgentRunner;
}): Promise<QaRepairQueue> {
  const itemDir = resolve(params.outputDir, params.item.id);
  await mkdir(itemDir, { recursive: true });
  const startedAt = new Date().toISOString();
  const run = await params.runner({
    role: "qa-repair",
    cwd: params.globals.repoRoot,
    prompt: qaRepairPrompt({
      item: params.item,
      queueSummary: summarizeQaRepairQueue(params.queue),
      repoRoot: params.globals.repoRoot,
      stateDir: params.globals.stateDir,
      project: projectMetadata(params.globals),
    }),
    outputDir: itemDir,
    dryRun: params.globals.dryRunAgents,
    provider: params.globals.provider,
    model: params.globals.model,
    thinkingLevel: params.globals.thinkingLevel,
    timeoutMs: params.globals.agentTimeoutSeconds ? params.globals.agentTimeoutSeconds * 1000 : undefined,
    toolContext: {
      repoRoot: params.globals.repoRoot,
      stateDir: params.globals.stateDir,
      project: params.globals.project,
    },
  });
  recordQaRepairSession(params.globals, params.runId, run);
  const baseAttempt: QaRepairAttempt = {
    id: run.sessionId,
    status: run.dryRun ? "dry_run" : "agent_failed",
    createdAt: startedAt,
    outputDir: itemDir,
    systemPromptPath: run.systemPromptPath,
    userPromptPath: run.userPromptPath,
    agentOutputPath: run.outputPath,
  };
  if (run.dryRun) {
    return appendAttempt(params.queue, params.item.id, { ...baseAttempt, summary: "dry-run agents wrote prompt artifacts; no validation ran" });
  }
  if (run.failed || run.providerError) {
    const validation = validateQaRepairOutcome({
      item: params.item,
      postScan: null,
      blockedReason: `qa-repair agent failed: ${run.error ?? run.providerError ?? "unknown failure"}`,
      validationArtifacts: { agent_output: run.outputPath },
    });
    return applyQaRepairValidation(params.queue, validation, { ...baseAttempt, status: "agent_failed", error: validation.reasons.join("; ") });
  }

  const parsed = parseJsonObject(run.rawText);
  if (!parsed.object) {
    const validation = validateQaRepairOutcome({
      item: params.item,
      postScan: null,
      blockedReason: `qa-repair output was not parseable JSON: ${parsed.error ?? "unknown parse error"}`,
      validationArtifacts: { agent_output: run.outputPath },
    });
    return applyQaRepairValidation(params.queue, validation, { ...baseAttempt, status: "invalid_output", error: validation.reasons.join("; ") });
  }
  const validated = validateQaRepairAgentResult(parsed.object);
  const parsedOutputPath = resolve(itemDir, "agent_result.json");
  await writeFile(parsedOutputPath, `${JSON.stringify({ parsed: parsed.object, validation_errors: validated.errors }, null, 2)}\n`);
  if (!validated.result) {
    const validation = validateQaRepairOutcome({
      item: params.item,
      postScan: null,
      blockedReason: `qa-repair output failed schema validation: ${validated.errors.join("; ")}`,
      validationArtifacts: { agent_output: run.outputPath, parsed_output: parsedOutputPath },
    });
    return applyQaRepairValidation(params.queue, validation, { ...baseAttempt, status: "invalid_output", parsedOutputPath, error: validation.reasons.join("; ") });
  }

  const postScan = await runQaScanDiff({
    repoRoot: params.globals.repoRoot,
    orchestratorRoot: packageRoot(),
    ...(params.baseRef ? { baseRef: params.baseRef } : {}),
    files: [params.item.source_path],
    includeWorktree: true,
  });
  const postScanPath = await writeScanInvocation(itemDir, "post_scan", postScan);
  const commandValidations = await runQaRepairValidationCommands({
    commands: params.validationCommands,
    globals: params.globals,
    runId: params.runId,
    item: params.item,
    itemDir,
    baseRef: params.baseRef,
  });
  const scoreValidation = commandValidationByKind(commandValidations, "score");
  const validation = validateQaRepairOutcome({
    item: params.item,
    postScan: postScan.result,
    postScanToolError: postScan.toolError,
    scorePassed: commandPassed(scoreValidation),
    scoreImpact: scoreValidation?.scoreImpact ?? validated.result.score_impact,
    preTargetScore: scoreValidation?.preTargetScore,
    postTargetScore: scoreValidation?.postTargetScore,
    buildPassed: commandPassed(commandValidationByKind(commandValidations, "build")),
    regressionPassed: commandPassed(commandValidationByKind(commandValidations, "regression")),
    falsePositive: validated.result.outcome === "false_positive",
    blockedReason: validated.result.outcome === "blocked" ? validated.result.summary : undefined,
    validationArtifacts: {
      agent_output: run.outputPath,
      parsed_output: parsedOutputPath,
      post_scan: postScanPath,
      ...validationArtifactPaths(commandValidations),
    },
  });
  const validationPath = resolve(itemDir, "validation.json");
  await writeFile(validationPath, `${JSON.stringify(validation, null, 2)}\n`);
  return applyQaRepairValidation(params.queue, validation, {
    ...baseAttempt,
    status: validation.status === "clean_same_match" || validation.status === "clean_lower_score" ? "validated" : "validation_failed",
    parsedOutputPath,
    postScanPath,
    scoreCheckPath: validationSummaryPath(commandValidations, "score"),
    buildCheckPath: validationSummaryPath(commandValidations, "build"),
    regressionCheckPath: validationSummaryPath(commandValidations, "regression"),
    validationPath,
    summary: validation.reasons.join("; "),
  });
}

export async function runQaRepair(
  globals: GlobalArgs,
  args: Map<string, string | true>,
  runner: QaRepairAgentRunner = runPiAgent,
): Promise<{ queue: QaRepairQueue; artifacts: { queuePath: string; summaryPath: string; reportPath: string; shipStatusPath: string }; outputDir: string }> {
  const runId = stringArg(args, "--run-id", "") || latestRunId(globals.stateDir);
  const baseRef = stringArg(args, "--base-ref", globals.project?.baseRef ?? "origin/master");
  const explicitOutputDir = stringArg(args, "--output-dir", "");
  const outputDir = explicitOutputDir ? resolvePath(explicitOutputDir) : resolve(globals.stateDir, "qa_repairs", runId, artifactTimestamp());
  await mkdir(outputDir, { recursive: true });

  const checkpointArg = stringArg(args, "--checkpoint", "");
  const checkpointPath = checkpointArg === "none" ? "" : checkpointArg ? resolvePath(checkpointArg) : latestCheckpointPath(globals.stateDir, runId);
  const checkpoint = checkpointPath && existsSync(checkpointPath) ? readJson(checkpointPath) : null;
  const checkpointCandidates = candidateProofsFromCheckpoint(checkpoint, {
    includeImprovementCandidates: !booleanArg(args, "--match-only"),
  }).map((proof) => proof.sourcePath);
  const explicitCandidates = [
    ...stringList(stringArg(args, "--candidate-files", "")),
    ...candidateListFromFile(stringArg(args, "--candidate-list", "")),
  ];
  const candidateFiles = [...new Set([...checkpointCandidates, ...explicitCandidates])];

  const scanJsonPath = stringArg(args, "--scan-json", "");
  const validationCommands: QaRepairValidationCommands = {
    score: stringArg(args, "--score-check-command", ""),
    build: stringArg(args, "--build-check-command", ""),
    regression: stringArg(args, "--regression-check-command", ""),
  };
  let scanResult: QaScanResult;
  if (scanJsonPath) {
    scanResult = scanResultFromJson(readJson(resolvePath(scanJsonPath)), scanJsonPath);
  } else {
    const invocation = await runQaScanDiff({
      repoRoot: globals.repoRoot,
      orchestratorRoot: packageRoot(),
      baseRef,
      files: candidateFiles.length > 0 ? candidateFiles : undefined,
      includeWorktree: true,
      gate: false,
    });
    await writeScanInvocation(outputDir, "pre_scan", invocation);
    if (!invocation.result || invocation.toolError) {
      throw new Error(`QA repair scan failed: ${invocation.toolError ?? "missing scanner result"}`);
    }
    scanResult = invocation.result;
  }

  let queue = buildQaRepairQueue({
    runId,
    repoRoot: globals.repoRoot,
    baseRef,
    headSha: await headSha(globals.repoRoot),
    scanResult,
    checkpoint,
    candidateFiles,
    includeImprovementCandidates: !booleanArg(args, "--match-only"),
    includeAllScanFilesWhenNoCandidates: booleanArg(args, "--all-scan-files") || candidateFiles.length === 0,
    repairWarnings: booleanArg(args, "--repair-warnings"),
    createdAt: new Date().toISOString(),
    dryRun: globals.dryRunAgents || !booleanArg(args, "--run-agents"),
  });

  if (booleanArg(args, "--run-agents")) {
    const itemId = stringArg(args, "--item-id", "");
    const maxItems = Math.max(0, Math.floor(numberArg(args, "--max-items", queue.items.length)));
    const selected = queue.items
      .filter((item) => !itemId || item.id === itemId)
      .slice(0, maxItems);
    if (itemId && selected.length === 0) throw new Error(`No QA repair queue item with id ${itemId}`);
    for (const item of selected) {
      queue = await processQueueItem({ globals, runId, queue, item, outputDir, baseRef, validationCommands, runner });
      await writeArtifacts(queue, outputDir);
    }
  }

  const artifacts = await writeArtifacts(queue, outputDir);
  return { queue, artifacts, outputDir };
}

export async function qaRepair(globals: GlobalArgs, args: Map<string, string | true>): Promise<void> {
  const result = await runQaRepair(globals, args);
  const summary = summarizeQaRepairQueue(result.queue, {
    artifact_dir: result.outputDir,
    queue_path: result.artifacts.queuePath,
    summary_path: result.artifacts.summaryPath,
    report_path: result.artifacts.reportPath,
    ship_status_path: result.artifacts.shipStatusPath,
  });
  console.log(JSON.stringify(summary, null, 2));
}
