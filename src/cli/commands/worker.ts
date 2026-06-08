import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import {
  evaluateWorkerReportAcceptance,
  isWorkerReportType,
  lintWorkerReviewDiff,
  parseWorkerAgentReport,
  targetPacketTarget,
  workerPacket,
  workerPrompt,
  workerReturnRepairReasons,
  type WorkerRunnerValidation,
} from "../../agents/worker/index.js";
import { runPiAgent } from "../../agents/runtime/index.js";
import { loadBoardSnapshot } from "../../board/index.js";
import {
  fileGraphCard,
  globalStandardsContext,
  graphDbExists,
  openKnowledgeGraph,
  resolvePathFactsContext,
  resourceGraphDbPath,
} from "../../knowledge/index.js";
import { runCommand } from "../../shell/index.js";
import { addPiSession, getLatestRun, getRun, leaseNextQueuedTarget, openState, recordWorkerReport } from "../../state/index.js";
import type { PiRunResult, WorkerReportType } from "../../types/index.js";
import { numberArg, stringArg, workerReportTypeArg, type GlobalArgs } from "../args.js";
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
  reportId: string;
  wakeEvent: string;
  dryRun: boolean;
  failed?: boolean;
  error?: string;
}

interface WorkerAttemptEvaluation {
  result: PiRunResult;
  agentReport: Record<string, unknown> | null;
  parsedError?: string;
  intendedReportType: WorkerReportType;
  acceptanceGate: ReturnType<typeof evaluateWorkerReportAcceptance>;
  runnerValidation: WorkerRunnerValidation;
  repairReasons: string[];
  writeSetDiffChanged: boolean;
  postAttemptDiffPath: string;
  repairFeedbackPath?: string;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
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
}): Promise<WorkerRunnerValidation> {
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
  return validation;
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
    const ttlSeconds = numberArg(args, "--ttl-seconds", 60 * 60);
    const repairAttempts = Math.max(0, Math.trunc(numberArg(args, "--repair-attempts", globals.dryRunAgents ? 0 : 2)));
    const postReturnCheckCommand = stringArg(args, "--post-return-check-command", "");
    const graphDbPath = stringArg(args, "--graph-db", resourceGraphDbPath());
    const leased = leaseNextQueuedTarget({ store, runId, workerId, baseRev, ttlSeconds });
    if (!leased) throw new Error(`No queued, unlocked targets available for run ${runId}`);

    const snapshot = loadBoardSnapshot(globals.repoRoot, 12, { graphDbPath });
    const target = targetPacketTarget(leased.target);
    const knowledgeContext = buildWorkerKnowledgeContext(String(target.source_path ?? ""), graphDbPath);
    const packet = workerPacket({
      run,
      leased,
      target,
      baselineMeasures: snapshot.measures,
      dryRunAgents: globals.dryRunAgents,
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
      let result: PiRunResult;
      try {
        result = await runPiAgent({
          role: "worker",
          cwd: globals.repoRoot,
          prompt: workerPrompt({
            packet: attemptPacket,
            repoRoot: globals.repoRoot,
            stateDir: globals.stateDir,
            initialBoardPath,
            workerLogDir: outputDir,
          }),
          outputDir,
          dryRun: globals.dryRunAgents,
          provider: globals.provider,
          model: globals.model,
          thinkingLevel: globals.thinkingLevel,
          timeoutMs: globals.agentTimeoutSeconds ? globals.agentTimeoutSeconds * 1000 : undefined,
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
        status: result.failed ? "failed" : result.dryRun ? "dry_run" : "succeeded",
        outputPath: result.outputPath,
      });

      const parsedAgentReport =
        result.dryRun || result.failed ? { report: null as Record<string, unknown> | null, error: result.error } : parseWorkerAgentReport(result.rawText);
      const agentReport = parsedAgentReport.report;
      const agentReportType = agentReport ? agentReport.report_type : null;
      const intendedReportType = result.failed ? "stalled_no_useful_guess" : isWorkerReportType(agentReportType) ? agentReportType : fallbackReportType;
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
      const runnerValidation = await runPostReturnCheck({
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
        shouldRun: acceptanceGate.accepted && (acceptanceGate.effectiveReportType === "progress" || acceptanceGate.effectiveReportType === "score_candidate"),
      });
      const repairReasons = workerReturnRepairReasons({ acceptanceGate, writeSetDiffChanged, runnerValidation, reviewLint });
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
      if (repairReasons.length === 0 || attemptIndex >= repairAttempts || result.dryRun) break;

      const repairFeedbackPath = resolve(validationDir, `attempt-${attemptIndex}.repair_request.json`);
      repairRequest = {
        attempt: attemptIndex + 1,
        max_attempts: repairAttempts,
        previous_agent_output_path: result.outputPath,
        previous_return_gate_path: attemptGatePath,
        previous_post_attempt_diff_path: postAttemptDiffPath,
        reasons: repairReasons,
        instruction:
          "The runner rejected your previous return. Fix retained worker-owned regressions or missing validation evidence, preserve pre-existing dirty work, and return the final JSON report again. Do not use whole-file destructive reset/restore/checkout/clean commands.",
      };
      evaluation.repairFeedbackPath = repairFeedbackPath;
      await writeFile(repairFeedbackPath, JSON.stringify(repairRequest, null, 2));
    }

    if (!finalEvaluation) throw new Error("Worker loop ended without an attempt evaluation");

    const result = finalEvaluation.result;
    const agentReport = finalEvaluation.agentReport;
    const acceptanceGate = finalEvaluation.acceptanceGate;
    const repairExhausted = finalEvaluation.repairReasons.length > 0;
    const reportType = repairExhausted ? "stalled_no_useful_guess" : acceptanceGate.effectiveReportType;
    const agentFacts = Array.isArray(agentReport?.facts) ? agentReport.facts : [];
    const agentBlockers = Array.isArray(agentReport?.blockers) ? agentReport.blockers : [];
    const blockerPath =
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
      repairExhausted
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
      agent_output_path: result.outputPath,
      summary: reportSummaryText,
      agent_report: agentReport,
      agent_report_parse_error: finalEvaluation.parsedError ?? null,
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
    return {
      runId,
      leaseId: leased.leaseId,
      target: leased.targetId,
      writeSet: leased.writeSet,
      workerOutput: result.outputPath,
      workerSystemPrompt: result.systemPromptPath,
      workerUserPrompt: result.userPromptPath,
      workerReport: summaryPath,
      reportId: report.reportId,
      wakeEvent: report.eventId,
      dryRun: result.dryRun,
      failed: result.failed ?? false,
    };
  } finally {
    store.db.close();
  }
}

export function buildWorkerKnowledgeContext(sourcePath: string, graphDb = resourceGraphDbPath()): Record<string, unknown> {
  const decompStandards = globalStandardsContext();
  const pathFacts = sourcePath ? resolvePathFactsContext(sourcePath, 5) : null;
  const lookupCommands = [
    `bun run kg:file-card -- --source ${shellQuote(sourcePath)} --graph-db ${shellQuote(graphDb)}`,
    "python3 knowledge/sources/decomp_standards/api/search.py --query <query> --limit 10 --json",
    sourcePath
      ? `python3 knowledge/sources/path_facts/api/resolve_for_path.py --path ${shellQuote(sourcePath)} --limit 5 --json`
      : "python3 knowledge/sources/path_facts/api/resolve_for_path.py --path <source_path> --limit 5 --json",
    "bun run kg:search -- --source past_prs --query <query> --limit 10",
    "bun run kg:search -- --source discord_knowledge --query <query> --limit 10",
    "bun run kg:search -- --source ssbm_data_sheet --query <query> --limit 10",
    "bun run kg:search -- --source powerpc_docs --query <query> --limit 10",
    "bun run kg:search -- --source external_mirrors --query <query> --limit 10",
    "python3 knowledge/tools/ghidra/api/lookup.py --query <query> --json",
    "python3 knowledge/tools/opseq/api/similar_functions.py --query <query> --json",
    "python3 knowledge/tools/mismatch_db/api/search.py --query <query> --json",
    "python3 knowledge/tools/mwcc_debug/api/lookup_dump.py --query <query> --json",
  ];
  if (!sourcePath) {
    return {
      status: "missing_source_path",
      graph_db: graphDb,
      decomp_standards: decompStandards,
      path_facts: { source: "path_facts", status: "missing_source_path" },
      lookup_commands: lookupCommands,
    };
  }
  if (!graphDbExists(graphDb)) {
    return {
      status: "graph_missing",
      graph_db: graphDb,
      decomp_standards: decompStandards,
      path_facts: pathFacts,
      lookup_commands: lookupCommands,
    };
  }
  const store = openKnowledgeGraph(graphDb);
  try {
    return {
      status: "ready",
      graph_db: graphDb,
      generated_at: new Date().toISOString(),
      file_card: fileGraphCard(store, sourcePath),
      decomp_standards: decompStandards,
      path_facts: pathFacts,
      lookup_commands: lookupCommands,
    };
  } catch (error) {
    return {
      status: "failed",
      graph_db: graphDb,
      reason: error instanceof Error ? error.message : String(error),
      decomp_standards: decompStandards,
      path_facts: pathFacts,
      lookup_commands: lookupCommands,
    };
  } finally {
    store.db.close();
  }
}

export async function worker(globals: GlobalArgs, args: Map<string, string | true>): Promise<void> {
  console.log(JSON.stringify(await runWorkerCycle(globals, args), null, 2));
}
