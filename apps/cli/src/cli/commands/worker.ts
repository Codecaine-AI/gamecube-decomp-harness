import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import {
  appendWorkerActivityEvent,
  captureWorkerChangeBaseline,
  evaluateWorkerReportAcceptance,
  isWorkerReportType,
  lintWorkerReviewDiff,
  parseWorkerAgentReport,
  targetPacketTarget,
  validateWorkerChange,
  workerPacket,
  workerPrompt,
  workerReturnRepairReasons,
  type WorkerChangeBaseline,
  type WorkerReviewLint,
  type WorkerRunnerValidation,
} from "@decomp-orchestrator/agents/worker";
import { qaLintRepairReasons, type WorkerChangeValidation } from "@decomp-orchestrator/agents/worker/change-validation";
import { runPiAgent } from "@decomp-orchestrator/agents/runtime";
import { defaultWorkerToolProfile } from "@decomp-orchestrator/agents/tools";
import {
  fileGraphCard,
  graphDbExists,
  loadKnowledgeBoardSnapshot,
  openKnowledgeGraph,
  resolvePathFactsContext,
  resourceGraphDbPath,
} from "@decomp-orchestrator/knowledge";
import { runCommand } from "@decomp-orchestrator/core/shell";
import {
  addPiSession,
  DEFAULT_WORKER_TTL_SECONDS,
  getLatestRun,
  getRun,
  leaseNextQueuedTarget,
  openState,
  recordRunnerAttempt,
  recordWorkerReport,
} from "@decomp-orchestrator/core/state";
import type { PiRunResult, WorkerReportType } from "@decomp-orchestrator/core/types";
import { numberArg, projectMetadata, stringArg, workerReportTypeArg, type GlobalArgs } from "../args.js";
import { assertSchedulableRun } from "./shared.js";

export interface WorkerCycleResult {
  runId: string;
  leaseId: string;
  target: string;
  writeSet: string[];
  workerOutput?: string;
  workerSystemPrompt?: string;
  workerUserPrompt?: string;
  workerReport: string;
  reportType?: WorkerReportType;
  reportId: string;
  wakeEvent: string;
  dryRun: boolean;
  failed?: boolean;
  providerFailure?: boolean;
  errorKind?: string;
  error?: string;
}

interface WorkerAttemptEvaluation {
  result: PiRunResult;
  agentReport: Record<string, unknown> | null;
  parsedError?: string;
  intendedReportType: WorkerReportType;
  acceptanceGate: ReturnType<typeof evaluateWorkerReportAcceptance>;
  runnerValidation: WorkerChangeValidation;
  repairReasons: string[];
  writeSetDiffChanged: boolean;
  postAttemptDiffPath: string;
  repairFeedbackPath?: string;
}

interface WorkerErrorClassification {
  kind: string;
  summary: string;
  reasons: string[];
}

type PostReturnCheckValidation = WorkerRunnerValidation & { status: "passed" | "failed" | "skipped" };

type WorkerOutcomeResult = "exact" | "improved" | "no_progress";
type WorkerStopReason = "target_complete" | "needs_fact" | "stalled";

const workerOutcomeResults = new Set<WorkerOutcomeResult>(["exact", "improved", "no_progress"]);
const workerStopReasons = new Set<WorkerStopReason>(["target_complete", "needs_fact", "stalled"]);

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function recordString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function reportAttempts(agentReport: Record<string, unknown> | null): Record<string, unknown>[] {
  return Array.isArray(agentReport?.attempts) ? agentReport.attempts.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
}

function numberField(value: unknown, fallback = NaN): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function positiveScoreDelta(agentReport: Record<string, unknown> | null): number {
  return reportAttempts(agentReport).reduce((sum, attempt) => sum + Math.max(0, numberField(attempt.delta, 0)), 0);
}

function hasExactAttempt(agentReport: Record<string, unknown> | null): boolean {
  return reportAttempts(agentReport).some((attempt) => numberField(attempt.old_score, NaN) < 99.99999 && numberField(attempt.new_score, NaN) >= 99.99999);
}

function normalizedWorkerResult(agentReport: Record<string, unknown> | null): WorkerOutcomeResult {
  const explicit = recordString(agentReport?.result);
  if (workerOutcomeResults.has(explicit as WorkerOutcomeResult)) return explicit as WorkerOutcomeResult;
  if (hasExactAttempt(agentReport)) return "exact";
  if (positiveScoreDelta(agentReport) > 0) return "improved";
  return "no_progress";
}

function normalizedStopReason(agentReport: Record<string, unknown> | null, reportType: WorkerReportType, result: WorkerOutcomeResult): WorkerStopReason {
  const explicit = recordString(agentReport?.stop_reason);
  if (reportType === "tool_error") return "stalled";
  if (explicit === "needs_fact" && reportType === "needs_fact") return "needs_fact";
  // The model can only claim target_complete when the canonical result agrees;
  // an over-claimed exact that validated as merely improved records stalled.
  if (explicit === "target_complete") return result === "exact" ? "target_complete" : "stalled";
  if (explicit === "stalled" && workerStopReasons.has(explicit as WorkerStopReason)) return explicit as WorkerStopReason;
  if (explicit === "no_useful_hypothesis") return "stalled";
  if (result === "exact") return "target_complete";
  if (reportType === "needs_fact") return "needs_fact";
  return "stalled";
}

function neededFact(agentReport: Record<string, unknown> | null): unknown {
  if (!agentReport || !("needed_fact" in agentReport)) return null;
  return agentReport.needed_fact ?? null;
}

function stringValuesFromObject(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(stringValuesFromObject);
  const record = value as Record<string, unknown>;
  const values: string[] = [];
  for (const [key, item] of Object.entries(record)) {
    if (typeof item === "string") values.push(`${key}: ${item}`);
    else if (item && typeof item === "object") values.push(...stringValuesFromObject(item));
  }
  return values;
}

function textLooksLikeToolError(value: unknown): boolean {
  const text = typeof value === "string" ? value : stringValuesFromObject(value).join("\n");
  if (!text.trim()) return false;
  const toolTerm = /\b(tool|command|api|build tool|compiler runner|validation harness|post-return|checkdiff|objdiff|wibo|weebo|wine|mwcc|stderr|parse error|timeout|timed out|missing executable|harness)\b/i;
  const failureTerm = /\b(fail(?:ed|ing|ure)?|missing|blocked|unavailable|error|exited|cannot|can't|unable|not found)\b/i;
  return toolTerm.test(text) && failureTerm.test(text);
}

function blockerIsExplicitlyNonBlocking(record: Record<string, unknown>): boolean {
  const kind = recordString(record.kind || record.type || record.status || record.reason);
  const text = [kind, ...stringValuesFromObject(record)].join("\n");
  return /(?:non[_ -]?blocking|optional|did not block|does not block|not block normal|regular .* sufficient|usable .* evidence|rerunning .* succeeded)/i.test(text);
}

// fatal: the agent explicitly declared a tool failure (report_type or a structured
// blocker kind) — trustworthy enough to drain the pool via --exit-on-worker-error.
// advisory: a regex hunch over free text. Worth classifying as tool_error for triage,
// but a hunch must never have pool-drain authority (a needs_fact whose *description*
// mentions a tool and a failure word once cost a full 32-worker drain cycle).
export function agentReportSignalsToolError(agentReport: Record<string, unknown> | null): { fatal: string[]; advisory: string[] } {
  if (!agentReport) return { fatal: [], advisory: [] };
  const fatal: string[] = [];
  const advisory: string[] = [];
  const reportType = recordString(agentReport.report_type);
  if (reportType === "tool_error") fatal.push("agent report_type is tool_error");
  const blockers = Array.isArray(agentReport.blockers) ? agentReport.blockers : [];
  for (const blocker of blockers) {
    const record = blocker && typeof blocker === "object" && !Array.isArray(blocker) ? (blocker as Record<string, unknown>) : {};
    if (blockerIsExplicitlyNonBlocking(record)) continue;
    const kind = recordString(record.kind || record.type || record.status || record.reason);
    if (/(?:tool|command|api|build|validation|compiler|runner|parse|timeout).*error|error.*(?:tool|command|api|build|validation|compiler|runner|parse|timeout)/i.test(kind)) {
      fatal.push(`agent blocker marks tool error: ${kind}`);
      continue;
    }
    if (textLooksLikeToolError(record)) advisory.push(`agent blocker looks like a tool error: ${stringValuesFromObject(record).join("; ").slice(0, 240)}`);
  }
  if (reportType === "needs_fact" && (textLooksLikeToolError(agentReport.needed_fact) || textLooksLikeToolError(agentReport.summary))) {
    advisory.push("agent reported needs_fact for text that looks like a tool/build/validation failure");
  }
  return { fatal, advisory };
}

function runnerValidationFailureReasons(validation: WorkerRunnerValidation): string[] {
  if (validation.status === "passed" || validation.status === "skipped") {
    if (validation.postReturnCheck?.status !== "failed") return [];
    return validation.postReturnCheck.reasons.length > 0
      ? validation.postReturnCheck.reasons.map((reason) => `post-return check: ${reason}`)
      : ["post-return check failed"];
  }
  const reasons = validation.reasons.length > 0 ? [...validation.reasons] : [`runner validation status: ${validation.status}`];
  if (validation.postReturnCheck?.status === "failed") {
    reasons.push(...validation.postReturnCheck.reasons.map((reason) => `post-return check: ${reason}`));
  }
  return reasons;
}

export function classifyWorkerError(params: {
  result: PiRunResult;
  parsedError?: string;
  agentReport: Record<string, unknown> | null;
  acceptanceGate: ReturnType<typeof evaluateWorkerReportAcceptance>;
  runnerValidation: WorkerChangeValidation;
}): WorkerErrorClassification | null {
  if (params.result.failed) {
    const message = params.result.error ?? "unknown Pi session error";
    return {
      kind: "worker_session_failed",
      summary: `Worker Pi session failed before producing a complete report: ${message}`,
      reasons: [message],
    };
  }
  if (params.parsedError && params.result.providerError) {
    return {
      kind: "provider_error",
      summary: `LLM provider failed before the worker produced a report: ${params.result.providerError}`,
      reasons: [params.result.providerError, params.parsedError],
    };
  }
  if (params.parsedError) {
    return {
      kind: "worker_report_parse_error",
      summary: `Worker output did not contain a usable JSON report: ${params.parsedError}`,
      reasons: [params.parsedError],
    };
  }
  const agentToolErrors = agentReportSignalsToolError(params.agentReport);
  if (agentToolErrors.fatal.length > 0) {
    return {
      kind: "agent_reported_tool_error",
      summary: `Worker reported a tool/build/validation failure: ${agentToolErrors.fatal.join("; ")}`,
      reasons: agentToolErrors.fatal,
    };
  }
  if (agentToolErrors.advisory.length > 0) {
    return {
      kind: "agent_reported_tool_error_advisory",
      summary: `Worker report text resembles a tool/build/validation failure (heuristic): ${agentToolErrors.advisory.join("; ")}`,
      reasons: agentToolErrors.advisory,
    };
  }
  const validationReasons = runnerValidationFailureReasons(params.runnerValidation);
  // L1 QA lint rejection: the attempt re-added a maintainer-rejected pattern.
  // The runner_validation_ prefix keeps this a rework kind (isReworkErrorKind),
  // so it routes to needs_rework/repair and can never hit the tool_error
  // quarantine path — by policy, tool_error targets are never auto-requeued.
  if (params.runnerValidation.qaLint?.status === "violations") {
    const qaReasons = qaLintRepairReasons(params.runnerValidation.qaLint);
    return {
      kind: "runner_validation_qa_lint_failed",
      summary: `QA lint rejected the attempt: ${params.runnerValidation.qaLint.findings.length} maintainer-rejected pattern finding(s)`,
      reasons: [...validationReasons, ...qaReasons.filter((reason) => !validationReasons.includes(reason))],
    };
  }
  if (validationReasons.length > 0) {
    return {
      kind: `runner_validation_${params.runnerValidation.status}`,
      summary: `Runner validation failed: ${validationReasons.join("; ")}`,
      reasons: validationReasons,
    };
  }
  if (!params.acceptanceGate.accepted) {
    const reasons = params.acceptanceGate.reasons.length > 0 ? params.acceptanceGate.reasons : ["worker report failed the acceptance gate"];
    return {
      kind: "acceptance_gate_failed",
      summary: `Worker reported ${params.acceptanceGate.intendedReportType} but failed the acceptance gate: ${reasons.join("; ")}`,
      reasons,
    };
  }
  return null;
}

// Gate rejections mean the worker ran fine but its return didn't verify (claim vs
// canonical measurement disagree, or the return state was inconsistent). The work may
// even be correct — code, tooling, or our understanding needs another look — so these
// are needs_rework, never tool_error, and they never count as system failures.
export function isReworkErrorKind(kind: string): boolean {
  return /^(?:runner_validation_|acceptance_gate_failed$)/.test(kind);
}

// Advisory (heuristic) tool-error kinds still report as tool_error for triage, but they
// never set the pool-fatal failed flag — only explicit/structured tool errors may drain
// the pool via --exit-on-worker-error.
export function isPoolFatalErrorKind(kind: string): boolean {
  return kind !== "agent_reported_tool_error_advisory" && kind !== "provider_error";
}

// All repair feedback for one attempt: the shared return-gate reasons plus the
// L1 QA lint findings, formatted verbatim for the worker's next iteration.
export function workerAttemptRepairReasons(params: {
  acceptanceGate: ReturnType<typeof evaluateWorkerReportAcceptance>;
  writeSetDiffChanged: boolean;
  runnerValidation: WorkerChangeValidation;
  reviewLint?: WorkerReviewLint;
}): string[] {
  return [
    ...workerReturnRepairReasons({
      acceptanceGate: params.acceptanceGate,
      writeSetDiffChanged: params.writeSetDiffChanged,
      runnerValidation: params.runnerValidation,
      reviewLint: params.reviewLint,
    }),
    ...qaLintRepairReasons(params.runnerValidation.qaLint),
  ];
}

export function finalWorkerReportType(params: {
  errorClassification: { kind: string; summary: string; reasons: string[] } | null;
  repairExhausted: boolean;
  acceptanceGate: ReturnType<typeof evaluateWorkerReportAcceptance>;
}): WorkerReportType {
  if (params.errorClassification) {
    if (isReworkErrorKind(params.errorClassification.kind)) return "needs_rework";
    if (params.errorClassification.kind === "provider_error") return "provider_error";
    return "tool_error";
  }
  if (params.repairExhausted) return "needs_rework";
  return params.acceptanceGate.effectiveReportType;
}

function renderPostReturnCheckCommand(
  template: string,
  params: {
    repoRoot: string;
    stateDir: string;
    workerLogDir: string;
    leaseId: string;
    writeSet: string[];
    target: Record<string, unknown>;
  },
): string {
  const replacements: Record<string, string> = {
    repo_root: shellQuote(params.repoRoot),
    state_dir: shellQuote(params.stateDir),
    worker_log_dir: shellQuote(params.workerLogDir),
    lease_id: shellQuote(params.leaseId),
    source_path: shellQuote(String(params.target.source_path ?? "")),
    unit: shellQuote(String(params.target.unit ?? "")),
    symbol: shellQuote(String(params.target.symbol ?? "")),
    write_set: params.writeSet.map(shellQuote).join(" "),
  };
  return template.replace(/\{([a-z_]+)\}/g, (match, key: string) => replacements[key] ?? match);
}

async function captureWriteSetDiff(repoRoot: string, writeSet: string[], outputPath: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const result = writeSet.length > 0 ? await runCommand(repoRoot, ["git", "diff", "--", ...writeSet]) : { exitCode: 0, stdout: "", stderr: "" };
  await writeFile(outputPath, result.stdout);
  if (result.stderr) await writeFile(`${outputPath}.stderr.txt`, result.stderr);
  return result;
}

async function runPostReturnCheck(params: {
  commandTemplate: string;
  dryRun: boolean;
  repoRoot: string;
  stateDir: string;
  workerLogDir: string;
  leaseId: string;
  writeSet: string[];
  target: Record<string, unknown>;
  outputDir: string;
  attemptIndex: number;
  shouldRun: boolean;
}): Promise<PostReturnCheckValidation> {
  if (!params.commandTemplate) {
    return { status: "skipped", reasons: ["no --post-return-check-command configured"] };
  }
  if (params.dryRun) {
    return { status: "skipped", reasons: ["dry-run agents do not execute post-return check commands"] };
  }
  if (!params.shouldRun) {
    return { status: "skipped", reasons: ["structured acceptance gate did not pass for progress/score_candidate"] };
  }

  const command = renderPostReturnCheckCommand(params.commandTemplate, params);
  const validationDir = resolve(params.outputDir, "runner_validation");
  await mkdir(validationDir, { recursive: true });
  const stdoutPath = resolve(validationDir, `attempt-${params.attemptIndex}.post_return.stdout.txt`);
  const stderrPath = resolve(validationDir, `attempt-${params.attemptIndex}.post_return.stderr.txt`);
  const summaryPath = resolve(validationDir, `attempt-${params.attemptIndex}.post_return.summary.json`);
  const result = await runCommand(params.repoRoot, ["/bin/sh", "-lc", command]);
  await writeFile(stdoutPath, result.stdout);
  await writeFile(stderrPath, result.stderr);
  const validation: WorkerRunnerValidation = {
    status: result.exitCode === 0 ? "passed" : "failed",
    reasons: result.exitCode === 0 ? [] : [`post-return check command exited ${result.exitCode}`],
    command,
    exitCode: result.exitCode,
    summaryPath,
    stdoutPath,
    stderrPath,
  };
  await writeFile(summaryPath, JSON.stringify(validation, null, 2));
  return validation as PostReturnCheckValidation;
}

function compactPostReturnCheck(validation: PostReturnCheckValidation): NonNullable<WorkerRunnerValidation["postReturnCheck"]> {
  return {
    status: validation.status,
    reasons: validation.reasons,
    command: validation.command,
    exitCode: validation.exitCode,
    summaryPath: validation.summaryPath,
    stdoutPath: validation.stdoutPath,
    stderrPath: validation.stderrPath,
  };
}

function mergeRunnerValidation(changeValidation: WorkerChangeValidation, postReturnCheck: PostReturnCheckValidation): WorkerChangeValidation {
  const postReturnCheckSummary = compactPostReturnCheck(postReturnCheck);
  if (changeValidation.status !== "passed") {
    return { ...changeValidation, postReturnCheck: postReturnCheckSummary };
  }
  if (postReturnCheck.status === "failed") {
    return {
      ...changeValidation,
      status: "failed",
      reasons: [...changeValidation.reasons, ...postReturnCheck.reasons],
      postReturnCheck: postReturnCheckSummary,
    };
  }
  return { ...changeValidation, postReturnCheck: postReturnCheckSummary };
}

/**
 * Derive the durable worker result from runner-owned validation evidence.
 *
 * The model's JSON stays a proposed claim: only a passed runner validation can
 * mark a live report exact/improved. Dry-run agents skip runner validation, so
 * they keep the model/configured result to preserve smoke flows.
 */
export function canonicalWorkerResult(params: {
  runnerValidation: WorkerRunnerValidation;
  agentReport: Record<string, unknown> | null;
  dryRun: boolean;
}): WorkerOutcomeResult {
  const target = params.runnerValidation.target;
  if (params.runnerValidation.status === "passed" && target) {
    if (target.exact) return "exact";
    if (target.improved) return "improved";
    return "no_progress";
  }
  if (params.dryRun) return normalizedWorkerResult(params.agentReport);
  return "no_progress";
}

function runnerValidationCompiled(validation: WorkerRunnerValidation): boolean {
  if (validation.status === "build_failed") return false;
  if (validation.status === "passed" || validation.status === "failed") return Boolean(validation.target) || validation.exitCode === 0;
  if (validation.status === "no_official_score_change" || validation.status === "target_regressed" || validation.status === "same_unit_regression") return true;
  // snapshot_unavailable after a successful object build still carries the unit
  // diff command; pre-build failures carry no command at all.
  return typeof validation.command === "string" && validation.command.includes("objdiff");
}

function clampSummary(text: string, maxChars = 400): string {
  const trimmed = text.trim();
  return trimmed.length <= maxChars ? trimmed : `${trimmed.slice(0, maxChars)}…`;
}

export async function runWorkerCycle(globals: GlobalArgs, args: Map<string, string | true>): Promise<WorkerCycleResult> {
  const store = openState(globals.stateDir);
  try {
    const runId = stringArg(args, "--run-id", getLatestRun(store)?.id ?? "");
    if (!runId) throw new Error("No run found. Run init-run first.");
    const run = getRun(store, runId);
    if (!run) throw new Error(`Run not found: ${runId}`);
    assertSchedulableRun(run, "worker");

    const workerId = stringArg(args, "--worker-id", `worker-${process.pid}-${Date.now()}-${randomUUID().slice(0, 8)}`);
    const fallbackReportType = workerReportTypeArg(args, "--report-type", "stalled_no_useful_guess");
    const baseRev = stringArg(args, "--base-rev", "unknown");
    const ttlSeconds = numberArg(args, "--ttl-seconds", DEFAULT_WORKER_TTL_SECONDS);
    const repairAttempts = Math.max(0, Math.trunc(numberArg(args, "--repair-attempts", globals.dryRunAgents ? 0 : 2)));
    const postReturnCheckCommand = stringArg(args, "--post-return-check-command", "");
    const graphDbPath = stringArg(args, "--graph-db", globals.graphDbPath ?? resourceGraphDbPath());
    const project = projectMetadata(globals, { graphDbPath });
    const leased = leaseNextQueuedTarget({ store, runId, workerId, baseRev, ttlSeconds });
    if (!leased) throw new Error(`No queued, unlocked targets available for run ${runId}`);

    const snapshot = loadKnowledgeBoardSnapshot(globals.repoRoot, 12, { graphDbPath });
    const target = targetPacketTarget(leased.target);
    const knowledgeContext = buildWorkerKnowledgeContext(String(target.source_path ?? ""), graphDbPath);
    const packet = workerPacket({
      run,
      leased,
      target,
      baselineMeasures: snapshot.measures,
      knowledgeContext,
    });
    const outputDir = resolve(globals.stateDir, "runs", runId, "worker_logs", leased.leaseId);
    const initialBoardPath = resolve(globals.stateDir, "runs", runId, "snapshots", "initial_board.json");
    const reportDir = resolve(outputDir, "report");
    await mkdir(reportDir, { recursive: true });
    const validationDir = resolve(outputDir, "runner_validation");
    await mkdir(validationDir, { recursive: true });
    const summaryPath = resolve(reportDir, "worker_report.json");
    const factsPath = resolve(reportDir, "facts.json");
    const preAttemptDiffPath = resolve(validationDir, "pre_worker_write_set.diff");
    const preAttemptDiff = await captureWriteSetDiff(globals.repoRoot, leased.writeSet, preAttemptDiffPath);
    const workerChangeBaseline: WorkerChangeBaseline = await captureWorkerChangeBaseline({
      repoRoot: globals.repoRoot,
      outputDir: validationDir,
      target,
      dryRun: globals.dryRunAgents,
    });
    await writeFile(resolve(validationDir, "pre_worker_baseline.summary.json"), JSON.stringify(workerChangeBaseline, null, 2));
    const targetUnit = String(target.unit ?? "");
    const targetSymbol = String(target.symbol ?? "");
    appendWorkerActivityEvent(outputDir, {
      lease_id: leased.leaseId,
      phase: "setup",
      event_type: "lease_started",
      unit: targetUnit,
      symbol: targetSymbol,
      summary: `worker ${leased.workerId} leased ${targetSymbol} (${targetUnit}); baseline ${workerChangeBaseline.status}`,
      score:
        workerChangeBaseline.snapshot?.targetScore != null
          ? { before: workerChangeBaseline.snapshot.targetScore, after: null, exact: false }
          : undefined,
      artifact_path: workerChangeBaseline.snapshotPath,
    });
    const artifactExists = (artifactPath: string): boolean => {
      if (isAbsolute(artifactPath)) return existsSync(artifactPath);
      return [globals.repoRoot, globals.stateDir, outputDir].some((root) => existsSync(resolve(root, artifactPath)));
    };

    let repairRequest: Record<string, unknown> | null = null;
    let finalEvaluation: WorkerAttemptEvaluation | null = null;
    for (let attemptIndex = 0; attemptIndex <= repairAttempts; attemptIndex += 1) {
      const attemptPacket = repairRequest
        ? {
            ...packet,
            repair_request: repairRequest,
          }
        : packet;
      appendWorkerActivityEvent(outputDir, {
        lease_id: leased.leaseId,
        attempt_index: attemptIndex,
        phase: repairRequest ? "repair" : "attempt",
        event_type: "attempt_started",
        unit: targetUnit,
        symbol: targetSymbol,
        summary: repairRequest
          ? clampSummary(`repair attempt ${attemptIndex} in flight: ${(repairRequest.reasons as string[]).join("; ")}`)
          : `worker attempt ${attemptIndex} started`,
      });
      let result: PiRunResult;
      try {
        result = await runPiAgent({
          role: "worker",
          cwd: globals.repoRoot,
          prompt: workerPrompt({
            packet: attemptPacket,
            repoRoot: globals.repoRoot,
            stateDir: globals.stateDir,
            project,
            initialBoardPath,
            workerLogDir: outputDir,
          }),
          outputDir,
          dryRun: globals.dryRunAgents,
          provider: globals.provider,
          model: globals.model,
          thinkingLevel: globals.thinkingLevel,
          timeoutMs: globals.agentTimeoutSeconds ? globals.agentTimeoutSeconds * 1000 : undefined,
          // Whole-file writes conflict with the preserve-dirty-work rule and were
          // used in 0% of confirmed exacts (-51pt lift); edit/bash cover the need.
          excludeBuiltinTools: ["write"],
          toolContext: {
            repoRoot: globals.repoRoot,
            stateDir: globals.stateDir,
            project,
            packet: attemptPacket,
            initialBoardPath,
            workerLogDir: outputDir,
            leaseId: leased.leaseId,
            attemptIndex,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        result = {
          sessionId: `worker-launch-failed-${randomUUID()}`,
          outputPath: resolve(outputDir, `worker_launch_failed_${attemptIndex}.txt`),
          systemPromptPath: resolve(outputDir, `worker_launch_failed_${attemptIndex}.system.md`),
          userPromptPath: resolve(outputDir, `worker_launch_failed_${attemptIndex}.user.md`),
          rawText: `[worker launch failed]\n${message}\n`,
          dryRun: globals.dryRunAgents,
          failed: true,
          error: message,
        };
        await writeFile(result.outputPath, result.rawText);
        await writeFile(result.systemPromptPath, "");
        await writeFile(result.userPromptPath, "");
      }

      addPiSession({
        store,
        runId,
        leaseId: leased.leaseId,
        role: "worker",
        sessionId: result.sessionId,
        sessionFile: result.sessionFile,
        provider: globals.provider,
        model: globals.model,
        thinkingLevel: globals.thinkingLevel,
        status: result.failed || result.providerError ? "failed" : result.dryRun ? "dry_run" : "succeeded",
        outputPath: result.outputPath,
      });
      appendWorkerActivityEvent(outputDir, {
        lease_id: leased.leaseId,
        session_id: result.sessionId,
        attempt_index: attemptIndex,
        phase: repairRequest ? "repair" : "attempt",
        event_type: "pi_session_finished",
        unit: targetUnit,
        symbol: targetSymbol,
        summary: result.failed ? clampSummary(`Pi session failed: ${result.error ?? "unknown error"}`) : "Pi session returned; evaluating report",
        artifact_path: result.outputPath,
      });

      const parsedAgentReport =
        result.dryRun || result.failed ? { report: null as Record<string, unknown> | null, error: result.error } : parseWorkerAgentReport(result.rawText);
      const agentReport = parsedAgentReport.report;
      const agentReportType = agentReport ? agentReport.report_type : null;
      const intendedReportType = result.failed ? "tool_error" : isWorkerReportType(agentReportType) ? agentReportType : fallbackReportType;
      const acceptanceGate = evaluateWorkerReportAcceptance({
        agentReport,
        reportType: intendedReportType,
        writeSet: leased.writeSet,
        parseError: parsedAgentReport.error,
        artifactExists,
      });
      const postAttemptDiffPath = resolve(validationDir, `attempt-${attemptIndex}.write_set.diff`);
      const postAttemptDiff = await captureWriteSetDiff(globals.repoRoot, leased.writeSet, postAttemptDiffPath);
      const writeSetDiffChanged = postAttemptDiff.stdout !== preAttemptDiff.stdout;
      const reviewLint = lintWorkerReviewDiff(postAttemptDiff.stdout);
      const shouldRunRunnerValidation =
        acceptanceGate.accepted && (acceptanceGate.effectiveReportType === "progress" || acceptanceGate.effectiveReportType === "score_candidate");
      const changeValidation = await validateWorkerChange({
        repoRoot: globals.repoRoot,
        outputDir: validationDir,
        attemptIndex,
        baseline: workerChangeBaseline,
        target,
        dryRun: globals.dryRunAgents,
        shouldRun: shouldRunRunnerValidation,
        claimedExact: normalizedWorkerResult(agentReport) === "exact" || hasExactAttempt(agentReport),
      });
      const postReturnCheck = await runPostReturnCheck({
        commandTemplate: postReturnCheckCommand,
        dryRun: globals.dryRunAgents,
        repoRoot: globals.repoRoot,
        stateDir: globals.stateDir,
        workerLogDir: outputDir,
        leaseId: leased.leaseId,
        writeSet: leased.writeSet,
        target,
        outputDir,
        attemptIndex,
        shouldRun: shouldRunRunnerValidation && changeValidation.status === "passed",
      });
      const runnerValidation = mergeRunnerValidation(changeValidation, postReturnCheck);
      if (runnerValidation.summaryPath) await writeFile(runnerValidation.summaryPath, JSON.stringify(runnerValidation, null, 2));
      recordRunnerAttempt(store, {
        leaseId: leased.leaseId,
        targetId: leased.targetId,
        attemptIndex,
        artifactPath: runnerValidation.summaryPath ?? null,
        compiled: runnerValidationCompiled(runnerValidation),
        oldScore: runnerValidation.target?.before ?? null,
        newScore: runnerValidation.target?.after ?? null,
        status: runnerValidation.status,
      });
      appendWorkerActivityEvent(outputDir, {
        lease_id: leased.leaseId,
        session_id: result.sessionId,
        attempt_index: attemptIndex,
        phase: repairRequest ? "repair_validation" : "validation",
        event_type: "acceptance_gate",
        unit: targetUnit,
        symbol: targetSymbol,
        summary: acceptanceGate.accepted
          ? `acceptance gate accepted ${acceptanceGate.effectiveReportType}`
          : clampSummary(`acceptance gate rejected ${acceptanceGate.intendedReportType}: ${acceptanceGate.reasons.join("; ")}`),
      });
      appendWorkerActivityEvent(outputDir, {
        lease_id: leased.leaseId,
        session_id: result.sessionId,
        attempt_index: attemptIndex,
        phase: repairRequest ? "repair_validation" : "validation",
        event_type: runnerValidation.status === "passed" ? "runner_validation_passed" : runnerValidation.status === "skipped" ? "runner_validation_skipped" : "runner_validation_rejected",
        unit: targetUnit,
        symbol: targetSymbol,
        summary: clampSummary(`runner validation ${runnerValidation.status}${runnerValidation.reasons.length > 0 ? `: ${runnerValidation.reasons.join("; ")}` : ""}`),
        score: runnerValidation.target
          ? { before: runnerValidation.target.before, after: runnerValidation.target.after, exact: runnerValidation.target.exact }
          : undefined,
        artifact_path: runnerValidation.summaryPath,
      });
      const repairReasons = workerAttemptRepairReasons({ acceptanceGate, writeSetDiffChanged, runnerValidation, reviewLint });
      const attemptGatePath = resolve(validationDir, `attempt-${attemptIndex}.return_gate.json`);
      const evaluation: WorkerAttemptEvaluation = {
        result,
        agentReport,
        parsedError: parsedAgentReport.error,
        intendedReportType,
        acceptanceGate,
        runnerValidation,
        repairReasons,
        writeSetDiffChanged,
        postAttemptDiffPath,
      };
      await writeFile(
        attemptGatePath,
        JSON.stringify(
          {
            attempt_index: attemptIndex,
            max_repair_attempts: repairAttempts,
            agent_output_path: result.outputPath,
            agent_report_parse_error: parsedAgentReport.error ?? null,
            intended_report_type: intendedReportType,
            acceptance_gate: acceptanceGate,
            runner_validation: runnerValidation,
            review_lint: reviewLint,
            write_set_diff: {
              baseline_path: preAttemptDiffPath,
              post_attempt_path: postAttemptDiffPath,
              changed_from_pre_worker: writeSetDiffChanged,
            },
            repair_reasons: repairReasons,
          },
          null,
          2,
        ),
      );

      finalEvaluation = evaluation;
      // A dead provider can't repair anything — retrying just burns ~20 minutes of
      // timeout-retries per attempt while the endpoint is down.
      if (result.providerError && !agentReport) break;
      if (repairReasons.length === 0 || attemptIndex >= repairAttempts || result.dryRun) break;

      const repairFeedbackPath = resolve(validationDir, `attempt-${attemptIndex}.repair_request.json`);
      repairRequest = {
        attempt: attemptIndex + 1,
        previous_agent_output_path: result.outputPath,
        previous_return_gate_path: attemptGatePath,
        previous_post_attempt_diff_path: postAttemptDiffPath,
        reasons: repairReasons,
        instruction:
          "The runner rejected your previous return. Fix retained worker-owned regressions or missing validation evidence, preserve pre-existing dirty work, and return the final JSON report again. Do not use whole-file destructive reset/restore/checkout/clean commands.",
      };
      evaluation.repairFeedbackPath = repairFeedbackPath;
      await writeFile(repairFeedbackPath, JSON.stringify(repairRequest, null, 2));
      appendWorkerActivityEvent(outputDir, {
        lease_id: leased.leaseId,
        session_id: result.sessionId,
        attempt_index: attemptIndex,
        phase: "repair_request",
        event_type: "repair_requested",
        unit: targetUnit,
        symbol: targetSymbol,
        summary: clampSummary(`runner rejected the return; repair attempt ${attemptIndex + 1} requested: ${repairReasons.join("; ")}`),
        artifact_path: repairFeedbackPath,
      });
    }

    if (!finalEvaluation) throw new Error("Worker loop ended without an attempt evaluation");

    const result = finalEvaluation.result;
    const agentReport = finalEvaluation.agentReport;
    const acceptanceGate = finalEvaluation.acceptanceGate;
    const repairExhausted = finalEvaluation.repairReasons.length > 0;
    const errorClassification = classifyWorkerError({
      result,
      parsedError: finalEvaluation.parsedError,
      agentReport,
      acceptanceGate,
      runnerValidation: finalEvaluation.runnerValidation,
    });
    const reportType = finalWorkerReportType({ errorClassification, repairExhausted, acceptanceGate });
    const outcomeResult = canonicalWorkerResult({
      runnerValidation: finalEvaluation.runnerValidation,
      agentReport,
      dryRun: result.dryRun,
    });
    const outcomeStopReason = repairExhausted && !errorClassification ? "stalled" : normalizedStopReason(agentReport, reportType, outcomeResult);
    const outcomeNeededFact = errorClassification || (repairExhausted && reportType === "stalled_no_useful_guess") ? null : neededFact(agentReport);
    const agentFacts = Array.isArray(agentReport?.facts) ? agentReport.facts : [];
    const agentBlockers = Array.isArray(agentReport?.blockers) ? agentReport.blockers : [];
    const blockerPath =
      reportType === "tool_error" ||
      reportType === "provider_error" ||
      reportType === "stalled_no_useful_guess" ||
      reportType === "needs_fact" ||
      finalEvaluation.parsedError ||
      agentBlockers.length > 0 ||
      !acceptanceGate.accepted ||
      repairExhausted
        ? resolve(reportDir, "blocker.json")
        : undefined;
    const patchPath = typeof agentReport?.patch_path === "string" ? agentReport.patch_path : undefined;
    const reportSummaryText =
      errorClassification
        ? errorClassification.summary
        : repairExhausted
        ? `Worker exhausted ${repairAttempts} repair attempt(s); latest return still failed the post-return gate: ${finalEvaluation.repairReasons.join("; ")}`
        : !acceptanceGate.accepted
        ? `Worker reported ${acceptanceGate.intendedReportType} but failed the acceptance gate: ${acceptanceGate.reasons.join("; ")}`
        : typeof agentReport?.summary === "string"
          ? agentReport.summary
        : result.dryRun && reportType === "stalled_no_useful_guess"
          ? "Dry-run worker preserved the target packet and stopped before unsupported edits."
          : result.dryRun
            ? "Dry-run worker completed the configured report path."
            : result.failed
              ? `Worker Pi session failed before producing a complete report: ${result.error ?? "unknown error"}`
              : "Live worker output was persisted for reducer review.";
    const reportSummary = {
      run_id: runId,
      lease_id: leased.leaseId,
      worker_id: leased.workerId,
      target,
      write_set: leased.writeSet,
      report_type: reportType,
      result: outcomeResult,
      stop_reason: outcomeStopReason,
      needed_fact: outcomeNeededFact,
      agent_output_path: result.outputPath,
      summary: reportSummaryText,
      agent_report: agentReport,
      agent_report_parse_error: finalEvaluation.parsedError ?? null,
      error: errorClassification
        ? {
            kind: errorClassification.kind,
            summary: errorClassification.summary,
            reasons: errorClassification.reasons,
          }
        : null,
      acceptance_gate: acceptanceGate,
      runner_validation: finalEvaluation.runnerValidation,
      repair_attempts: {
        configured: repairAttempts,
        exhausted: repairExhausted,
        latest_reasons: finalEvaluation.repairReasons,
        latest_write_set_diff_path: finalEvaluation.postAttemptDiffPath,
        repair_feedback_path: finalEvaluation.repairFeedbackPath ?? null,
      },
      created_at: new Date().toISOString(),
    };
    await writeFile(summaryPath, JSON.stringify(reportSummary, null, 2));
    await writeFile(factsPath, JSON.stringify(agentFacts, null, 2));
    if (blockerPath) {
      await writeFile(
        blockerPath,
        JSON.stringify(
          {
            reason: reportType,
            note:
              errorClassification?.summary ??
              finalEvaluation.parsedError ??
              (repairExhausted
                ? `Worker exhausted repair attempts. Latest reasons: ${finalEvaluation.repairReasons.join("; ")}`
                : !acceptanceGate.accepted
                ? `Worker reported ${acceptanceGate.intendedReportType} but failed the acceptance gate.`
                : result.dryRun
                  ? "Synthetic smoke report."
                  : "Live worker reported blockers."),
            acceptance_gate: acceptanceGate,
            runner_validation: finalEvaluation.runnerValidation,
            repair_attempts: {
              configured: repairAttempts,
              exhausted: repairExhausted,
              latest_reasons: finalEvaluation.repairReasons,
              latest_write_set_diff_path: finalEvaluation.postAttemptDiffPath,
              repair_feedback_path: finalEvaluation.repairFeedbackPath ?? null,
            },
            error: errorClassification
              ? {
                  kind: errorClassification.kind,
                  summary: errorClassification.summary,
                  reasons: errorClassification.reasons,
                }
              : null,
            blockers: agentBlockers,
          },
          null,
          2,
        ),
      );
    }

    const report = recordWorkerReport({
      store,
      runId,
      leaseId: leased.leaseId,
      reportType,
      summaryPath,
      factsPath,
      blockerPath,
      patchPath,
      payload: {
        lease_id: leased.leaseId,
        worker_id: leased.workerId,
        target,
        report_type: reportType,
        result: outcomeResult,
        stop_reason: outcomeStopReason,
        needed_fact: outcomeNeededFact,
        error: errorClassification
          ? {
              kind: errorClassification.kind,
              summary: errorClassification.summary,
              reasons: errorClassification.reasons,
            }
          : null,
        intended_report_type: acceptanceGate.intendedReportType,
        acceptance_gate: acceptanceGate,
        runner_validation: finalEvaluation.runnerValidation,
        repair_attempts: {
          configured: repairAttempts,
          exhausted: repairExhausted,
          latest_reasons: finalEvaluation.repairReasons,
        },
        summary_path: summaryPath,
      },
    });
    appendWorkerActivityEvent(outputDir, {
      lease_id: leased.leaseId,
      session_id: result.sessionId,
      phase: "report",
      event_type: "report_recorded",
      unit: targetUnit,
      symbol: targetSymbol,
      summary: clampSummary(`recorded ${reportType} / ${outcomeResult} (${outcomeStopReason}): ${reportSummaryText}`),
      score: finalEvaluation.runnerValidation.target
        ? {
            before: finalEvaluation.runnerValidation.target.before,
            after: finalEvaluation.runnerValidation.target.after,
            exact: finalEvaluation.runnerValidation.target.exact,
          }
        : undefined,
      artifact_path: summaryPath,
    });
    return {
      runId,
      leaseId: leased.leaseId,
      target: leased.targetId,
      writeSet: leased.writeSet,
      workerOutput: result.outputPath,
      workerSystemPrompt: result.systemPromptPath,
      workerUserPrompt: result.userPromptPath,
      workerReport: summaryPath,
      reportType,
      reportId: report.reportId,
      wakeEvent: report.eventId,
      dryRun: result.dryRun,
      failed: reportType === "tool_error" && (!errorClassification || isPoolFatalErrorKind(errorClassification.kind)),
      providerFailure: reportType === "provider_error",
      errorKind: errorClassification?.kind,
      error: errorClassification?.summary,
    };
  } finally {
    store.db.close();
  }
}

export function buildWorkerKnowledgeContext(sourcePath: string, graphDb = resourceGraphDbPath()): Record<string, unknown> {
  const pathFacts = sourcePath ? resolvePathFactsContext(sourcePath, 5) : null;
  const lookupTools = [...defaultWorkerToolProfile];
  if (!sourcePath) {
    return {
      status: "missing_source_path",
      graph_db: graphDb,
      path_facts: { source: "path_facts", status: "missing_source_path" },
      lookup_tools: lookupTools,
    };
  }
  if (!graphDbExists(graphDb)) {
    return {
      status: "graph_missing",
      graph_db: graphDb,
      path_facts: pathFacts,
      lookup_tools: lookupTools,
    };
  }
  const store = openKnowledgeGraph(graphDb);
  try {
    return {
      status: "ready",
      graph_db: graphDb,
      generated_at: new Date().toISOString(),
      file_card: fileGraphCard(store, sourcePath),
      path_facts: pathFacts,
      lookup_tools: lookupTools,
    };
  } catch (error) {
    return {
      status: "failed",
      graph_db: graphDb,
      reason: error instanceof Error ? error.message : String(error),
      path_facts: pathFacts,
      lookup_tools: lookupTools,
    };
  } finally {
    store.db.close();
  }
}

export async function worker(globals: GlobalArgs, args: Map<string, string | true>): Promise<void> {
  console.log(JSON.stringify(await runWorkerCycle(globals, args), null, 2));
}
