import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { artifactTimestamp } from "@server/infrastructure/agent-runtime/runtime";
import { latestPrSplitPlanSummary, latestQaRepairSummary, latestRegressionCheckSummary } from "./artifacts.js";
import { createRunCheckpoint, latestCheckpointSummary } from "@server/core/session-runtime/phases/pr/checkpoint";
import { DEFAULT_PR_BATCH_LIMIT, type PrRecordContext } from "@server/core/session-runtime/phases/pr/pr-records";
import { upstreamRepoSlug } from "@server/core/session-runtime/phases/pr/pr-sync";
import type { CodeIssuesResult } from "@server/core/session-runtime/phases/pr/pr-worktrees";
import { planRegressionRepair } from "@server/core/session-runtime/phases/running/epochs";
import { getLatestRun, getRun, openState, admitPriorityTargets } from "@server/core/session-runtime/run-state";
import { compactCheckpointResult, type GitSyncResult } from "@server/core/session-runtime/phases/preparing/runtime";
import { readRegressionReport, type RegressionReport } from "@server/core/validation/objdiff/report";
import { recordDashboardArtifact } from "@server/core/orchestrator-state";
import { DispatchLeaseUnavailableError, withDispatchLease, type DispatchLeaseRevalidator } from "@server/core/session-runtime/dispatch-guard";
import { activateRun } from "@server/core/session-runtime/phases/running/run-control.js";
import { commitBoundaryWorktree } from "./boundary-commit.js";
import { getProjectState, requireLease } from "@server/core/project-state";
import type { SavePointRuntime } from "./save-points-runtime.js";
import type { CliResult } from "@server/infrastructure/shell/ui-command-runner";
import type { ProjectRuntimeContext, ProjectSummary, ResolvedProject } from "@server/core/project-registry";
import { commentUnresolvedFindings, fetchGithubComments, type CommentableFinding } from "./github-comments.js";
import { findLatestLedger, ledgerAnchorsReliable, ledgerEntriesForFiles, loadReviewLedger, type LedgerEntry, type ReviewLedger } from "./review-ledger.js";

type JsonObject = Record<string, unknown>;
type OperationRecordLike = { name?: unknown; status?: unknown };

interface OperationStateRuntime {
  failOperationStep: (stepName: string) => void;
  operationNextHint: (next: string) => void;
  operationStep: (stepName: string, detail?: string) => void;
  operationStepDetail: (stepName: string, detail: string) => void;
  withOperation: <T>(name: string, label: string, stepNames: string[], fn: () => Promise<T>) => Promise<T>;
}

const PREPARE_LOCAL_PR_OPERATION = "prepare-local-pr";
const PREPARE_LOCAL_BATCH_OPERATION = "prepare-local-batch";
const LOCAL_PREP_OPERATION_NAMES = new Set([PREPARE_LOCAL_PR_OPERATION, PREPARE_LOCAL_BATCH_OPERATION]);

type WorkflowEventInput = {
  kind: "pr-publication";
  operation: string;
  status?: "started" | "completed" | "failed" | "skipped";
  sessionId?: string | null;
  runId?: string | null;
  prId?: string | null;
  detail?: string | null;
  metadata?: Record<string, unknown>;
};

export interface HandoffRuntimeDeps {
  appendLog: (stream: "stdout" | "stderr" | "ui", text: string) => void;
  hasActiveProcess: (stateDir: string) => { active: boolean; name?: unknown };
  operationState: OperationStateRuntime;
  outputTail: (textValue: string, maxLength?: number) => string;
  prRecords: {
    buildPrRecordsView: (stateDir: string, runId: string) => JsonObject;
    normalizePrRecord: (record: JsonObject, context?: PrRecordContext) => JsonObject;
    normalizePrRecordsPayload: (payload: JsonObject, context?: PrRecordContext) => JsonObject;
    prHandoffArtifactPath: (stateDir: string, savedPath: string, filename: string) => string;
    prRecordContext: (stateDir: string, runId?: string) => PrRecordContext;
    prRecordMatchesRun: (record: JsonObject, runId: string, activeBranches?: Set<string>) => boolean;
    readPrRecords: (stateDir: string) => JsonObject;
    updatePrRecord: (stateDir: string, branch: string, update: (record: JsonObject) => JsonObject) => JsonObject | null;
    writePrRecords: (stateDir: string, payload: JsonObject) => JsonObject;
  };
  prSync: {
    isLocalBranchPrRecord: (record: JsonObject) => boolean;
    syncPrRecords: (body: JsonObject) => Promise<JsonObject>;
  };
  prWorktrees: {
    assertSliceVerificationClean: (branch: string, validation: JsonObject) => void;
    ensureOpenPrBaseline: (paths: ProjectRuntimeContext, revalidateLease?: DispatchLeaseRevalidator) => Promise<JsonObject>;
    prepareLocalPrWorkspace: (params: {
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
    }) => Promise<JsonObject>;
    publishPatchToFork: (params: { baseSha: string; branch: string; files: string[]; supportFiles?: string[]; patchPath: string; repoRoot: string; revalidateLease?: DispatchLeaseRevalidator; title: string }) => Promise<void>;
    readyLocalPrSource: (params: { baseSha: string; branch: string; files: string[]; supportFiles?: string[]; record: JsonObject; repoRoot: string; stateDir: string }) => Promise<JsonObject | null>;
    rebuildProductionBaseline: (paths: ProjectRuntimeContext, revalidateLease?: DispatchLeaseRevalidator) => Promise<JsonObject>;
    remoteOwner: (repoRoot: string, remote: string) => string;
    sliceValidationSummary: (report: RegressionReport, issues: CodeIssuesResult) => JsonObject;
    verifyPrSliceInBaseline: (params: { baseSha: string; baselineWorktree: string; files: string[]; supportFiles?: string[]; patchPath: string; revalidateLease?: DispatchLeaseRevalidator }) => Promise<{ issues: CodeIssuesResult; report: RegressionReport }>;
    verifySupportMergeOrder: (params: {
      repoRoot: string;
      branch: string;
      sliceId: string;
      files: string[];
      supportFiles: string[];
      others: Array<{ branch: string; sliceId: string; files: string[]; supportFiles: string[] }>;
    }) => Promise<JsonObject>;
    verifyShipSet: (paths: ProjectRuntimeContext, baseline: JsonObject, matchPathspecs: string[], options?: { revalidateLease?: DispatchLeaseRevalidator; sourceRef?: string }) => Promise<JsonObject>;
  };
  processControl: {
    drainManaged: (body: JsonObject) => Promise<JsonObject>;
  };
  projectToSummary: (project: ResolvedProject) => ProjectSummary;
  resolveDashboardProject: (input: JsonObject, options?: { useDefaultProject?: boolean }) => ProjectRuntimeContext;
  runCli: (command: string[], cwd?: string) => Promise<CliResult>;
  runGit: (repoRoot: string, args: string[], options?: { check?: boolean; failureHint?: string }) => Promise<CliResult>;
  savePoints: SavePointRuntime;
  serverJobPath: string;
  submitWorkflowEvent: (paths: ProjectRuntimeContext, input: WorkflowEventInput) => Promise<JsonObject | null>;
  syncMergedPrIntakeForPrepare: (paths: ProjectRuntimeContext, dryRunAgents: boolean, revalidateLease?: DispatchLeaseRevalidator) => Promise<GitSyncResult>;
}

export interface HandoffRuntime {
  checkpointRunForPr: (body: JsonObject, reworkSymbols?: string[]) => Promise<JsonObject>;
  createSavePoint: (body: JsonObject) => Promise<JsonObject>;
  openAllPlannedPrs: (body: JsonObject) => Promise<JsonObject>;
  openNextDraftBatch: (body: JsonObject) => Promise<JsonObject>;
  openPrForSlice: (body: JsonObject) => Promise<JsonObject>;
  pauseRunForPr: (body: JsonObject) => Promise<JsonObject>;
  prepareLocalPr: (body: JsonObject) => Promise<JsonObject>;
  prepareLocalPrBatch: (body: JsonObject) => Promise<JsonObject>;
  preparePrHandoff: (body: JsonObject) => Promise<JsonObject>;
  reconcile: (body: JsonObject) => Promise<JsonObject>;
  resumeRunForPr: (body: JsonObject) => JsonObject;
  runPrQa: (body: JsonObject) => Promise<JsonObject>;
  runPrSplitPlan: (body: JsonObject) => Promise<JsonObject>;
  runQaRepairForPr: (body: JsonObject) => Promise<JsonObject>;
  setPrReviewState: (body: JsonObject) => Promise<JsonObject>;
  syncPrRecords: (body: JsonObject) => Promise<JsonObject>;
  verifyShipSet: (body: JsonObject) => Promise<JsonObject>;
}

export function localPrPreparationOperationRunning(operation: OperationRecordLike | null | undefined): boolean {
  return Boolean(operation && operation.status === "running" && typeof operation.name === "string" && LOCAL_PREP_OPERATION_NAMES.has(operation.name));
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

function numberValue(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function boolValue(value: unknown): boolean {
  return value === true || value === "true";
}

function intValue(value: unknown, fallback: number, min = 0): number {
  const parsed = Math.trunc(numberValue(value, fallback));
  return Math.max(min, parsed);
}

function readJsonObject(path: string): JsonObject {
  try {
    if (!path || !existsSync(path)) return {};
    return asObject(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return {};
  }
}

function serverJobPrefix(paths: ProjectRuntimeContext, serverJobPath: string): string[] {
  const command = ["bun", serverJobPath];
  if (paths.project) command.push("--project", paths.project.projectId);
  command.push("--repo-root", paths.repoRoot, "--state-dir", paths.stateDir);
  return command;
}

export function createHandoffRuntime(deps: HandoffRuntimeDeps): HandoffRuntime {
  const {
    appendLog,
    operationState,
    outputTail,
    prRecords,
    prSync,
    prWorktrees,
    projectToSummary,
    resolveDashboardProject,
    runCli,
    savePoints,
    serverJobPath,
  } = deps;
  const {
    failOperationStep,
    operationNextHint,
    operationStep,
    operationStepDetail,
    withOperation,
  } = operationState;

  function activeRunIdFromBody(body: JsonObject, stateDir: string): string {
    const runId = stringValue(body.runId);
    if (runId) return runId;
    const store = openState(stateDir);
    try {
      const latest = getLatestRun(store)?.id ?? "";
      if (latest) return latest;
    } finally {
      store.db.close();
    }
    throw new Error("No run found. Run init-run first.");
  }

  function prGroupMode(value: unknown): string {
    const groupMode = stringValue(value, "melee-subsystem");
    return groupMode === "top-dir" ? groupMode : "melee-subsystem";
  }

  function prSplitStrategy(value: unknown): string {
    const strategy = stringValue(value, "deterministic");
    return strategy === "agent" ? strategy : "deterministic";
  }

  function prHandoffRoot(stateDir: string, runId: string, kind: string): string {
    return resolve(stateDir, "pr_handoff", runId, kind, artifactTimestamp());
  }

  function recordHandoffStatus(paths: ProjectRuntimeContext, runId: string, artifactKey: "baseline" | "ship", payload: JsonObject): void {
    if (!runId) return;
    const store = openState(paths.stateDir);
    try {
      recordDashboardArtifact(store, {
        runId,
        projectId: paths.project?.projectId ?? null,
        artifactType: "handoff_status",
        artifactKey,
        sourcePath: stringValue(payload.baselinePath, stringValue(payload.patchPath)),
        sourceLabel: artifactKey === "baseline" ? "pr_handoff/baseline_status" : "pr_handoff/ship_status",
        payload,
        createdAt: stringValue(payload.installedAt, stringValue(payload.checkedAt)) || undefined,
      });
    } finally {
      store.db.close();
    }
  }

  function ledgerCommentFinding(entry: LedgerEntry): CommentableFinding {
    return {
      source: entry.source,
      severity: entry.severity,
      file: entry.file,
      line: entry.line,
      ruleId: entry.ruleId,
      standardId: entry.standardId,
      message: entry.message,
      suggestedFix: entry.suggestedFix,
      artifactPath: null,
      tier: entry.tier,
      disposition: entry.disposition,
      evidence: entry.evidence,
      matchContext: entry.match_context,
    };
  }

  async function postReviewLedgerComments(params: {
    body: JsonObject;
    branch: string;
    files: string[];
    paths: ProjectRuntimeContext;
    prUrl: string;
    record: JsonObject | null;
    repoSlug: string;
    sessionHeadSha: string;
    title: string;
  }): Promise<void> {
    const { body, branch, files, paths, prUrl, record, repoSlug, sessionHeadSha, title } = params;
    if (body.postLedgerComments === false) {
      appendLog("ui", `ledger comments for ${branch}: disabled`);
      return;
    }

    const ledgerPath = stringValue(body.ledgerPath) || findLatestLedger(paths.stateDir);
    if (!ledgerPath) {
      appendLog("ui", `ledger comments for ${branch}: no review ledger found; skipped`);
      return;
    }

    let ledger: ReviewLedger;
    let entries: LedgerEntry[];
    try {
      ledger = loadReviewLedger(ledgerPath);
      entries = ledgerEntriesForFiles(ledger, files);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      appendLog("stderr", `ledger comments for ${branch}: could not load ${ledgerPath} — ${message}`);
      appendLog("ui", `ledger comments for ${branch}: posted 0, failed 1`);
      return;
    }
    if (entries.length === 0) {
      appendLog("ui", `ledger comments for ${branch}: no entries matched the slice files; skipped`);
      return;
    }

    const reliableAnchors = ledgerAnchorsReliable(ledger.head_sha, sessionHeadSha);
    try {
      const view = await runCli(["gh", "pr", "view", prUrl || branch, "--repo", repoSlug, "--json", "number,headRefOid"], paths.repoRoot);
      if (view.exitCode !== 0) throw new Error(`gh pr view failed (${view.exitCode}): ${outputTail(view.stderr || view.stdout, 1000)}`);
      const metadata = asObject(JSON.parse(view.stdout));
      const prNumber = numberValue(record?.prNumber, numberValue(metadata.number));
      const headRefOid = stringValue(metadata.headRefOid);
      if (!prNumber || !headRefOid) throw new Error("gh pr view did not return a PR number and headRefOid");

      const commandDeps = {
        commandRunner: async (cwd: string, command: string[]) => {
          const result = await runCli(command, cwd);
          return { ...result, exitCode: result.exitCode ?? 1 };
        },
      };
      const globals = {
        repoRoot: paths.repoRoot,
        stateDir: paths.stateDir,
        projectId: paths.project?.projectId,
        project: paths.project ?? undefined,
        graphDbPath: paths.graphDbPath,
        dryRunAgents: false,
        provider: "",
        model: "",
        thinkingLevel: "",
      };

      const outputDir = resolve(paths.stateDir, "pr_handoff", "ledger_comments");
      mkdirSync(outputDir, { recursive: true });
      const outputPath = resolve(outputDir, `${branch.replace(/[^A-Za-z0-9_.-]+/g, "-")}.github-comments.json`);
      const intake = await fetchGithubComments({ globals, deps: commandDeps, repo: repoSlug, prNumber, outputPath });
      for (const warning of intake.warnings) appendLog("stderr", `ledger comments for ${branch}: ${warning}`);
      const results = await commentUnresolvedFindings({
        globals,
        deps: commandDeps,
        repo: repoSlug,
        pr: {
          number: prNumber,
          url: prUrl,
          title,
          state: "OPEN",
          isDraft: true,
          baseRefName: "",
          baseRefOid: "",
          headRefName: branch,
          headRefOid,
          authorLogin: null,
          headOwnerLogin: null,
        },
        findings: entries.map(ledgerCommentFinding),
        existingComments: intake.comments,
        dryRun: false,
        allowInline: reliableAnchors,
      });
      const posted = results.filter((result) => result.status === "posted_inline" || result.status === "posted_top_level").length;
      const failed = results.filter((result) => result.status === "failed").length;
      const alreadyPresent = results.filter((result) => result.status === "already_present").length;
      for (const result of results) {
        if (result.status === "failed") appendLog("stderr", `ledger comments for ${branch}: ${result.finding.file}:${result.finding.line} — ${result.error ?? "posting failed"}`);
      }
      const anchorNote = reliableAnchors ? "" : "; anchors stale, used issue comments";
      appendLog("ui", `ledger comments for ${branch}: posted ${posted}, failed ${failed}${alreadyPresent ? `, already present ${alreadyPresent}` : ""}${anchorNote}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      appendLog("stderr", `ledger comments for ${branch}: ${message}`);
      appendLog("ui", `ledger comments for ${branch}: posted 0, failed 1`);
    }
  }

  function assertHandoffIdle(stateDir: string, action: string): void {
    const active = deps.hasActiveProcess(stateDir);
    if (active.active) {
      const name = stringValue(active.name, "managed process");
      throw new Error(`${action} requires stopped workers. Stop or drain the active process (${name}) first.`);
    }
  }

  function currentDispatchLeaseRevalidator(paths: ProjectRuntimeContext, runId: string): DispatchLeaseRevalidator {
    const projectId = paths.project?.projectId;
    if (!projectId) throw new Error("Pause boundary commit requires a project id for dispatch fencing");
    const store = openState(paths.stateDir);
    let leaseId = "";
    try {
      const lease = getProjectState(store, projectId)?.active_workflow;
      if (!lease) throw new Error(`Pause boundary commit requires current dispatch authority for run ${runId}`);
      leaseId = lease.lease_id;
      requireLease(store, leaseId, projectId);
    } finally {
      store.db.close();
    }
    return () => {
      const next = openState(paths.stateDir);
      try {
        return requireLease(next, leaseId, projectId);
      } finally {
        next.db.close();
      }
    };
  }

  async function pauseRunForPr(body: JsonObject, revalidateLease?: DispatchLeaseRevalidator): Promise<JsonObject> {
    const paths = resolveDashboardProject(body, { useDefaultProject: true });
    const { repoRoot, stateDir } = paths;
    const runId = activeRunIdFromBody(body, stateDir);
    assertHandoffIdle(stateDir, "Pause boundary");
    const store = openState(stateDir);
    let run: ReturnType<typeof getRun>;
    try {
      run = getRun(store, runId);
      if (!run) throw new Error(`Run not found: ${runId}`);
      if (run.status !== "paused") {
        throw new Error(`Pause boundary requires supervisor-settled paused run ${runId}; current status is ${run.status}`);
      }
    } finally {
      store.db.close();
    }
    const validateBoundaryLease = revalidateLease ?? currentDispatchLeaseRevalidator(paths, runId);
    const boundaryCommit = await commitBoundaryWorktree({
      message: `boundary(pause): run ${runId}`,
      repoRoot,
      revalidateLease: validateBoundaryLease,
      runGit: deps.runGit,
      stateDir,
    });
    appendLog("ui", `run ${runId} boundary recorded after supervisor settlement`);
    const savePoint = await savePoints.boundarySavePoint(paths, "pause");
    return {
      paused: true,
      project: paths.project ? projectToSummary(paths.project) : null,
      repoRoot,
      stateDir,
      run,
      drain: { draining: false, reason: "supervisor_settled" },
      boundaryCommit,
      savePoint,
    };
  }

  function resumeRunForPr(body: JsonObject): JsonObject {
    const paths = resolveDashboardProject(body, { useDefaultProject: true });
    const { repoRoot, stateDir } = paths;
    const runId = activeRunIdFromBody(body, stateDir);
    const store = openState(stateDir);
    try {
      const currentRun = getRun(store, runId);
      if (!currentRun) throw new Error(`Run not found: ${runId}`);
      const projectId = paths.project?.projectId ?? currentRun.projectId ?? "";
      if (!projectId) throw new Error(`Run ${runId} cannot resume without a project id`);
      const commandId = stringValue(body.commandId, `command-run-resume-${randomUUID()}`);
      const { run } = activateRun({
        actor: "operator",
        commandId,
        correlationId: runId,
        projectId,
        reason: "resume run after PR handoff pause",
        runId,
        store,
      });
      appendLog("ui", `run ${runId} resumed after PR handoff pause`);
      return { resumed: true, project: paths.project ? projectToSummary(paths.project) : null, repoRoot, stateDir, run };
    } finally {
      store.db.close();
    }
  }

  async function checkpointRunForPr(body: JsonObject, reworkSymbols: string[] = []): Promise<JsonObject> {
    const paths = resolveDashboardProject(body, { useDefaultProject: true });
    const stateDir = paths.stateDir;
    const runId = activeRunIdFromBody(body, stateDir);
    assertHandoffIdle(stateDir, "Checkpoint");
    return withOperation("checkpoint", "Checkpoint", ["checkpoint"], async () => {
      operationStep("checkpoint", `run ${runId}`);
      appendLog("ui", `PR checkpoint started for run ${runId}`);
      const store = openState(stateDir);
      let result: JsonObject;
      try {
        const checkpointResult = createRunCheckpoint(store, runId, {
          improvementPromotion: {
            minGainPoints: paths.project?.pr.improvementMinGainPoints,
            minMatchedBytes: paths.project?.pr.improvementMinMatchedBytes,
          },
          reworkSymbols,
          title: "PR handoff checkpoint",
        });
        for (const item of checkpointResult.items) {
          const eligibility = asObject(item.evidence.pr_eligibility);
          if (eligibility.excluded !== true) continue;
          appendLog(
            "ui",
            `[pr-eligibility] excluded ${item.symbol || item.targetKey} from PR preparation: ${stringValue(eligibility.reason)}`,
          );
        }
        result = compactCheckpointResult(checkpointResult);
        appendLog("ui", `PR checkpoint complete for run ${runId}`);
      } finally {
        store.db.close();
      }
      const savePoint = await savePoints.boundarySavePoint(paths, "checkpoint");
      return { project: paths.project ? projectToSummary(paths.project) : null, ...result, savePoint };
    });
  }

  async function runPrQa(body: JsonObject): Promise<JsonObject> {
    const paths = resolveDashboardProject(body, { useDefaultProject: true });
    const { stateDir } = paths;
    const runId = activeRunIdFromBody(body, stateDir);
    assertHandoffIdle(stateDir, "PR QA");
    const target = stringValue(body.qaTarget, paths.project?.validation.qaTarget ?? "changes_all").trim() || "changes_all";
    if (target.startsWith("-") || /\s/.test(target)) throw new Error("QA target must be one Ninja target name.");
    const command = [
      ...serverJobPrefix(paths, serverJobPath),
      "regression-check",
      "--run-id",
      runId,
      "--target",
      target,
      "--report-title",
      stringValue(body.qaReportTitle, "Report for GALE01 PR handoff"),
      "--report-max-rows",
      String(intValue(body.qaReportMaxRows, 300, 0)),
    ];
    if (body.requirePrPromotion !== false) command.push("--require-pr-promotion");
    return withOperation("qa", "QA Gate", ["QA build & regression gate"], async () => {
      operationStep("QA build & regression gate", `ninja ${target} + saved-baseline regression check`);
      appendLog("ui", `PR QA started: ${command.join(" ")}`);
      const result = await runCli(command);
      appendLog("ui", `PR QA exit=${result.exitCode}`);
      const parsed = savePoints.parseCliJsonOutput(result.stdout);
      const latest = latestRegressionCheckSummary(stateDir, runId) ?? {};
      const merged = { ...latest, ...parsed };
      const promotion = asObject(merged.prPromotion);
      const evidence = asObject(promotion.evidence);
      const verdictParts = [`verdict ${stringValue(promotion.status, stringValue(merged.status, "unknown"))}`];
      if (Object.keys(evidence).length > 0) {
        verdictParts.push(
          `${numberValue(evidence.newMatches)} new match(es)`,
          `${numberValue(evidence.matchedCodeBytesDelta)}B matched code`,
          `${numberValue(evidence.unmatchedImprovementBytes)}B fuzzy improvement`,
        );
      }
      operationStepDetail("QA build & regression gate", verdictParts.join(" · "));
      const savePoint = await savePoints.boundarySavePoint(paths, "qa");
      return {
        ...merged,
        savePoint,
        uiCommand: command,
        cliExitCode: result.exitCode,
        stdout: outputTail(result.stdout, 4000),
        stderr: outputTail(result.stderr, 4000),
      };
    });
  }

  async function runVerifyShipSet(body: JsonObject): Promise<JsonObject> {
    const paths = resolveDashboardProject(body, { useDefaultProject: true });
    const { stateDir } = paths;
    const runId = activeRunIdFromBody(body, stateDir);
    assertHandoffIdle(stateDir, "Verify ship set");
    const baseRef = stringValue(body.baseRef, stringValue(body.prBaseRef, paths.project?.baseRef ?? "origin/master")).trim() || "origin/master";
    const sourceRef = stringValue(body.sourceRef, stringValue(body.prSourceRef, "HEAD")).trim() || "HEAD";
    const command = [
      ...serverJobPrefix(paths, serverJobPath),
      "verify-ship-set",
      "--run-id",
      runId,
      "--base-ref",
      baseRef,
      "--source-ref",
      sourceRef,
    ];
    return withOperation("verify-ship-set", "Verify Ship Set", ["verify ship set"], async () => {
      operationStep("verify ship set", `${sourceRef} onto ${baseRef}`);
      appendLog("ui", `ship-set verification started: ${command.join(" ")}`);
      const result = await runCli(command);
      appendLog("ui", `ship-set verification exit=${result.exitCode}`);
      if (result.exitCode !== 0) {
        throw new Error(`Ship-set verification failed (${result.exitCode}): ${outputTail(result.stderr || result.stdout, 4000)}`);
      }
      const parsed = savePoints.parseCliJsonOutput(result.stdout);
      operationStepDetail("verify ship set", `${stringValue(parsed.status, "unknown")} @ ${stringValue(parsed.baseSha).slice(0, 10)}`);
      return {
        ...parsed,
        project: paths.project ? projectToSummary(paths.project) : null,
        runId,
        uiCommand: command,
        cliExitCode: result.exitCode,
        stdout: outputTail(result.stdout, 4000),
        stderr: outputTail(result.stderr, 4000),
      };
    });
  }

  async function runReconcile(body: JsonObject): Promise<JsonObject> {
    const paths = resolveDashboardProject(body, { useDefaultProject: true });
    const { stateDir } = paths;
    const runId = activeRunIdFromBody(body, stateDir);
    const mode = stringValue(body.mode, "ship-validate") === "sync-merge" ? "sync-merge" : "ship-validate";
    const store = openState(stateDir);
    try {
      const run = getRun(store, runId);
      if (run && run.status === "active") {
        throw new Error(`Run ${run.id} is active. The reconcile agent only runs while worker scheduling is locked.`);
      }
    } finally {
      store.db.close();
    }
    const command = [
      ...serverJobPrefix(paths, serverJobPath),
      ...(boolValue(body.dryRunAgents) ? ["--dry-run-agents"] : []),
      "reconcile",
      "--mode",
      mode,
      "--run-id",
      runId,
      "--base-ref",
      stringValue(body.prBaseRef, paths.project?.baseRef ?? "origin/master"),
      "--attempt-budget",
      String(intValue(body.reconcileAttemptBudget, 3, 1)),
    ];
    if (mode === "ship-validate" && body.allowMissingRegressionCheck === true) command.push("--allow-missing-regression-check");
    return withOperation("reconcile", "Reconcile", ["reconcile regressions"], async () => {
      operationStep("reconcile regressions", `${mode} agent fix loop`);
      appendLog("ui", `reconcile (${mode}) started: ${command.join(" ")}`);
      const result = await runCli(command);
      appendLog("ui", `reconcile (${mode}) exit=${result.exitCode}`);
      return {
        mode,
        parsed: savePoints.parseCliJsonOutput(result.stdout),
        uiCommand: command,
        cliExitCode: result.exitCode,
        stdout: outputTail(result.stdout, 4000),
        stderr: outputTail(result.stderr, 4000),
      };
    });
  }

  async function runQaRepairForPr(body: JsonObject): Promise<JsonObject> {
    const paths = resolveDashboardProject(body, { useDefaultProject: true });
    const { stateDir } = paths;
    const runId = activeRunIdFromBody(body, stateDir);
    assertHandoffIdle(stateDir, "QA repair");
    let checkpointPath = "";
    const checkpointStore = openState(stateDir);
    try {
      checkpointPath = stringValue(latestCheckpointSummary(checkpointStore, runId)?.summaryPath);
    } finally {
      checkpointStore.db.close();
    }
    const command = [
      ...serverJobPrefix(paths, serverJobPath),
      ...(boolValue(body.dryRunAgents) ? ["--dry-run-agents"] : []),
      "qa-repair",
      "--run-id",
      runId,
      "--base-ref",
      stringValue(body.prBaseRef, paths.project?.baseRef ?? "origin/master").trim() || "origin/master",
    ];
    if (checkpointPath && existsSync(checkpointPath)) command.push("--checkpoint", checkpointPath);
    else command.push("--all-scan-files");
    if (body.qaRepairRunAgents !== false) command.push("--run-agents");
    const itemId = stringValue(body.qaRepairItemId).trim();
    if (itemId) command.push("--item-id", itemId);
    const maxItems = intValue(body.qaRepairMaxItems, 0, 0);
    if (maxItems > 0) command.push("--max-items", String(maxItems));
    return withOperation("qa-repair", "QA Repair", ["QA repair lane"], async () => {
      operationStep("QA repair lane", checkpointPath ? "candidate-file scan and repair queue" : "scan replay/candidate fallback");
      appendLog("ui", `QA repair started: ${command.join(" ")}`);
      const result = await runCli(command);
      appendLog("ui", `QA repair exit=${result.exitCode}`);
      const parsed = savePoints.parseCliJsonOutput(result.stdout);
      const latest = latestQaRepairSummary(stateDir, runId) ?? {};
      const merged = { ...latest, ...parsed };
      const counts = asObject(merged.counts);
      operationStepDetail(
        "QA repair lane",
        `${numberValue(counts.files_with_errors)} file(s) with errors; ${numberValue(counts.queued_items)} repair item(s); ${stringValue(merged.recommendation, "unknown")}`,
      );
      return {
        ...merged,
        project: paths.project ? projectToSummary(paths.project) : null,
        runId,
        checkpointPath: checkpointPath || null,
        uiCommand: command,
        cliExitCode: result.exitCode,
        stdout: outputTail(result.stdout, 4000),
        stderr: outputTail(result.stderr, 4000),
      };
    });
  }

  async function runPrSplitPlan(body: JsonObject): Promise<JsonObject> {
    const paths = resolveDashboardProject(body, { useDefaultProject: true });
    const { stateDir } = paths;
    const runId = activeRunIdFromBody(body, stateDir);
    assertHandoffIdle(stateDir, "PR split planning");
    const artifactDir = prHandoffRoot(stateDir, runId, "split_plans");
    const outputPath = resolve(artifactDir, "pr_split_plan.md");
    const summaryPath = resolve(artifactDir, "summary.json");
    mkdirSync(artifactDir, { recursive: true });
    let checkpointPath = "";
    const checkpointStore = openState(stateDir);
    try {
      checkpointPath = stringValue(latestCheckpointSummary(checkpointStore, runId)?.summaryPath);
    } finally {
      checkpointStore.db.close();
    }
    const command = [
      ...serverJobPrefix(paths, serverJobPath),
      "pr-split-plan",
      "--base-ref",
      stringValue(body.prBaseRef, paths.project?.baseRef ?? "origin/master").trim() || "origin/master",
      "--group-mode",
      prGroupMode(stringValue(body.prGroupMode, paths.project?.pr.groupMode ?? "melee-subsystem")),
      "--strategy",
      prSplitStrategy(stringValue(body.prSplitStrategy, paths.project?.pr.splitStrategy ?? "deterministic")),
      "--max-files-per-pr",
      String(intValue(body.prMaxFilesPerPr, paths.project?.pr.maxFilesPerPr ?? 30, 1)),
      "--branch-prefix",
      stringValue(body.prBranchPrefix, paths.project?.pr.branchPrefix ?? "pr-split").trim() || "pr-split",
      "--title-prefix",
      stringValue(body.prTitlePrefix, paths.project?.pr.titlePrefix ?? "Melee decomp"),
      "--output",
      outputPath,
      "--agent-output-dir",
      resolve(artifactDir, "splitter_agent"),
      "--run-id",
      runId,
      "--json",
    ];
    if (checkpointPath && existsSync(checkpointPath)) command.push("--checkpoint", checkpointPath);
    const supportMapInput = stringValue(body.prSupportMapPath);
    if (supportMapInput) {
      const supportMapPath = resolve(paths.repoRoot, supportMapInput);
      if (!existsSync(supportMapPath)) throw new Error(`PR support map does not exist: ${supportMapPath}`);
      command.push("--support-map", supportMapPath);
    }
    const reportChangesRelative = paths.project?.validation.reportChangesPath ?? "build/GALE01/report_changes.json";
    if (existsSync(resolve(paths.repoRoot, reportChangesRelative))) command.push("--report-changes", reportChangesRelative);
    const shipStatusPath = stringValue(body.prShipStatusPath);
    if (shipStatusPath && existsSync(shipStatusPath)) command.push("--ship-status", shipStatusPath);
    if (boolValue(body.prCommittedOnly)) command.push("--committed-only");
    if (body.prIncludeUntracked === false) command.push("--no-untracked");
    return withOperation("split-plan", "Plan PRs", ["plan PR slices"], async () => {
      operationStep("plan PR slices", checkpointPath ? "lane-aware (latest checkpoint)" : "no checkpoint; lane-less plan");
      appendLog("ui", `PR split plan started: ${command.join(" ")}`);
      const result = await runCli(command);
      appendLog("ui", `PR split plan exit=${result.exitCode}`);
      const plan = savePoints.parseCliJsonOutput(result.stdout);
      const slices = (Array.isArray(plan.slices) ? plan.slices : []).map(asObject);
      if (result.exitCode === 0) {
        operationStepDetail(
          "plan PR slices",
          `${slices.filter((slice) => slice.lane === "match").length} match PR(s) · ${slices.filter((slice) => slice.lane === "local").length} local-only slice(s)`,
        );
      }
      const summary = {
        status: result.exitCode === 0 ? "passed" : "failed",
        totalFiles: numberValue(plan.totalFiles, 0),
        sliceCount: slices.length,
        shipFilterApplied: boolValue(plan.shipFilterApplied),
        planningStrategy: stringValue(plan.planningStrategy, "deterministic"),
        splitterApplied: boolValue(plan.splitterApplied),
        splitterArtifacts: asObject(plan.splitterArtifacts),
        matchSlices: slices.filter((slice) => slice.lane === "match").length,
        localSlices: slices.filter((slice) => slice.lane === "local").length,
        unassignedSlices: slices.filter((slice) => !slice.lane).length,
        matchPathspecs: [
          ...new Set(
            slices
              .filter((slice) => slice.lane === "match")
              .flatMap((slice) => [...asArray(slice.pathspecs), ...asArray(slice.supportPathspecs)])
              .map((path) => stringValue(path))
              .filter(Boolean),
          ),
        ],
        slices: slices.map((slice) => {
          const supportPathspecs = asArray(slice.supportPathspecs).map((path) => stringValue(path)).filter(Boolean);
          return {
            id: stringValue(slice.id),
            displayName: stringValue(slice.displayName),
            lane: slice.lane ?? null,
            scope: stringValue(slice.scope),
            branchName: stringValue(slice.branchName),
            title: stringValue(slice.title),
            pathspecs: asArray(slice.pathspecs).map((path) => stringValue(path)).filter(Boolean),
            ...(supportPathspecs.length > 0 ? { supportPathspecs } : {}),
            fileCount: numberValue(slice.fileCount),
          };
        }),
        runId,
        project: paths.project ? projectToSummary(paths.project) : null,
        repoRoot: paths.repoRoot,
        stateDir,
        artifactDir,
        outputPath,
        summaryPath,
        checkpointPath: checkpointPath || null,
        baseRef: stringValue(body.prBaseRef, paths.project?.baseRef ?? "origin/master").trim() || "origin/master",
        groupMode: prGroupMode(stringValue(body.prGroupMode, paths.project?.pr.groupMode ?? "melee-subsystem")),
        requestedPlanningStrategy: prSplitStrategy(stringValue(body.prSplitStrategy, paths.project?.pr.splitStrategy ?? "deterministic")),
        maxFilesPerPr: intValue(body.prMaxFilesPerPr, paths.project?.pr.maxFilesPerPr ?? 30, 1),
        command,
        exitCode: result.exitCode,
        stdout: outputTail(result.stdout, 4000),
        stderr: outputTail(result.stderr, 4000),
        createdAt: new Date().toISOString(),
      };
      writeFileSync(summaryPath, JSON.stringify(summary, null, 2), "utf8");
      return summary;
    });
  }

  async function regressionReportFromChanges(repoRoot: string): Promise<RegressionReport | null> {
    const reportChangesPath = resolve(repoRoot, "build/GALE01/report_changes.json");
    if (!existsSync(reportChangesPath)) return null;
    try {
      return await readRegressionReport(reportChangesPath, "prepare handoff", 0);
    } catch (error) {
      appendLog("stderr", `regression report parse failed: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  function preparedMergePeers(records: JsonObject[], currentBranch: string, runId: string, baseSha: string) {
    return records
      .filter((candidate) => stringValue(candidate.branch) !== currentBranch)
      .filter((candidate) => prRecords.prRecordMatchesRun(candidate, runId))
      .filter((candidate) => stringValue(candidate.baseSha) === baseSha)
      .filter((candidate) => {
        const localStatus = stringValue(asObject(candidate.local).status);
        const prStatus = stringValue(candidate.status);
        const hasOpenPrNumber =
          Number.isFinite(numberValue(candidate.prNumber, NaN)) && prStatus !== "closed" && prStatus !== "merged";
        return (
          ["ready", "local_only"].includes(localStatus) ||
          hasOpenPrNumber ||
          prStatus === "draft" ||
          prStatus === "open"
        );
      })
      .map((candidate) => ({
        branch: stringValue(candidate.branch),
        sliceId: stringValue(candidate.sliceId, stringValue(candidate.branch)),
        files: asArray(candidate.files).map((path) => stringValue(path)).filter(Boolean),
        supportFiles: asArray(candidate.supportFiles).map((path) => stringValue(path)).filter(Boolean),
      }))
      .filter((candidate) => candidate.branch);
  }

  function peersWithSupportOverlap(
    files: string[],
    supportFiles: string[],
    peers: Array<{ files: string[]; supportFiles: string[] }>,
  ): boolean {
    const primary = new Set(files);
    return peers.some((peer) => {
      const peerFiles = new Set([...peer.files, ...peer.supportFiles]);
      return supportFiles.some((path) => peerFiles.has(path)) || peer.supportFiles.some((path) => primary.has(path));
    });
  }

  async function prepareLocalPrForBranch(
    body: JsonObject,
    branch: string,
    revalidateLease: DispatchLeaseRevalidator,
  ): Promise<JsonObject> {
    const paths = resolveDashboardProject(body, { useDefaultProject: true });
    const { repoRoot, stateDir } = paths;
    assertHandoffIdle(stateDir, "Prepare local PR");
    const runId = activeRunIdFromBody(body, stateDir);
    const context = prRecords.prRecordContext(stateDir, runId);
    const payload = prRecords.normalizePrRecordsPayload(prRecords.readPrRecords(stateDir));
    const records = asArray(payload.records).map(asObject);
    const index = records.findIndex((candidate) => stringValue(candidate.branch) === branch);
    if (index < 0) throw new Error(`No PR record for branch ${branch}; run Sync PR Status first.`);
    const record = prRecords.normalizePrRecord(records[index], context);
    const status = stringValue(record.status, "planned");
    if (status !== "planned") throw new Error(`Local preparation expects a planned PR slice; ${branch} is ${status}.`);
    const files = asArray(record.files).map((path) => stringValue(path)).filter(Boolean);
    const supportFiles = asArray(record.supportFiles).map((path) => stringValue(path)).filter(Boolean);
    if (files.length === 0) throw new Error(`PR record for ${branch} has no file manifest; re-run Plan PRs and Sync PR Status.`);

    const shipStatus = readJsonObject(resolve(stateDir, "pr_handoff", "ship_status.json"));
    if (stringValue(shipStatus.status) !== "pr_ready") throw new Error("Ship set is not pr_ready; run Prepare Handoff first.");
    const patchPath = stringValue(shipStatus.patchPath, resolve(stateDir, "pr_handoff", "ship_set.patch"));
    if (!existsSync(patchPath)) throw new Error(`Verified ship patch missing at ${patchPath}; run Prepare Handoff first.`);
    const baselineStatus = readJsonObject(resolve(stateDir, "pr_handoff", "baseline_status.json"));
    const baseSha = stringValue(baselineStatus.baseSha);
    const baselineWorktree = stringValue(baselineStatus.worktreeDir);
    if (!baseSha || !baselineWorktree || !existsSync(baselineWorktree)) {
      throw new Error("Baseline worktree missing; run Prepare Handoff to rebuild the production baseline.");
    }
    if (baseSha !== stringValue(shipStatus.baseSha)) throw new Error("Baseline and ship status disagree on the base SHA; re-run Prepare Handoff.");

    try {
      prRecords.updatePrRecord(stateDir, branch, (current) => ({
        ...current,
        local: { ...asObject(current.local), status: "preparing", prepStartedAt: new Date().toISOString(), error: "" },
      }));
      operationStep("verify slice locally", `${supportFiles.length > 0 ? `${files.length}+${supportFiles.length}` : files.length} file(s) onto baseline ${baseSha.slice(0, 10)}`);
      revalidateLease();
      const { report, issues } = await prWorktrees.verifyPrSliceInBaseline({
        baseSha,
        baselineWorktree,
        files,
        ...(supportFiles.length > 0 ? { supportFiles } : {}),
        patchPath,
        revalidateLease,
      });
      const validation = prWorktrees.sliceValidationSummary(report, issues);
      prWorktrees.assertSliceVerificationClean(branch, validation);
      operationStepDetail("verify slice locally", `${numberValue(validation.newMatches)} new match(es), ${stringValue(validation.issuesCheck)} issues check`);

      operationStep("prepare local worktree", branch);
      const title = stringValue(record.title, `Melee decomp: ${stringValue(record.displayName, branch)}`);
      revalidateLease();
      const prepared = await prWorktrees.prepareLocalPrWorkspace({
        baseSha,
        branch,
        files,
        ...(supportFiles.length > 0 ? { supportFiles } : {}),
        force: body.forceLocalPrepare === true,
        patchPath,
        record: { ...record, baseSha, validation },
        repoRoot,
        revalidateLease,
        runId,
        stateDir,
        title,
      });
      const otherRecords = preparedMergePeers(records, branch, runId, baseSha);
      if (peersWithSupportOverlap(files, supportFiles, otherRecords)) {
        await prWorktrees.verifySupportMergeOrder({
          repoRoot,
          branch,
          sliceId: stringValue(record.sliceId, branch),
          files,
          supportFiles,
          others: otherRecords,
        });
      }
      const updated = prRecords.normalizePrRecord(
        {
          ...prepared,
          status: "planned",
          baseSha,
          validation,
          batch: {
            ...asObject(prepared.batch),
            state: stringValue(asObject(prepared.batch).state, "unbatched"),
          },
        },
        context,
      );
      records[index] = updated;
      const nextPayload = prRecords.writePrRecords(stateDir, { ...payload, records, syncedAt: stringValue(payload.syncedAt) || new Date().toISOString() });
      operationStepDetail("prepare local worktree", `${branch} @ ${stringValue(asObject(updated.local).commitSha).slice(0, 10)}`);
      appendLog("ui", `local PR prepared: ${branch} -> ${stringValue(asObject(updated.local).worktreePath)}`);
      return { prepared: true, branch, record: updated, prs: nextPayload };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      records[index] = prRecords.normalizePrRecord(
        {
          ...record,
          local: {
            ...asObject(record.local),
            status: "blocked",
            error: message,
          },
          validation: {
            ...asObject(record.validation),
            status: "failed",
            checkedAt: new Date().toISOString(),
          },
        },
        context,
      );
      prRecords.writePrRecords(stateDir, { ...payload, records });
      throw error;
    }
  }

  async function prepareLocalPr(body: JsonObject): Promise<JsonObject> {
    const branch = stringValue(body.prBranch);
    if (!branch) throw new Error("Prepare local PR needs prBranch (the slice's branch name).");
    const paths = resolveDashboardProject(body, { useDefaultProject: true });
    const runId = activeRunIdFromBody(body, paths.stateDir);
    return withDispatchLease(
      paths,
      {
        kind: "pr",
        workflowId: `pr-local:${runId}`,
        reason: `prepare local PR workspace for ${branch}`,
      },
      (_leaseId, revalidateLease) =>
        withOperation(
          PREPARE_LOCAL_PR_OPERATION,
          `Prepare Local PR — ${branch}`,
          ["verify slice locally", "prepare local worktree"],
          () => prepareLocalPrForBranch(body, branch, revalidateLease),
        ),
    );
  }

  async function setPrReviewState(body: JsonObject): Promise<JsonObject> {
    const paths = resolveDashboardProject(body, { useDefaultProject: true });
    const branch = stringValue(body.prBranch);
    if (!branch) throw new Error("Review state needs prBranch (the slice's branch name).");
    const subState = stringValue(body.subState);
    const allowed = new Set(["awaiting", "new_comments", "changes_requested", "fixing", ""]);
    if (!allowed.has(subState)) throw new Error(`Unknown review subState: ${subState || "(empty)"}.`);
    const seenComments = numberValue(body.seenComments, NaN);
    const updated = prRecords.updatePrRecord(paths.stateDir, branch, (record) => {
      const review = asObject(record.review);
      const github = asObject(record.github);
      const currentComments = numberValue(github.comments, numberValue(record.comments, 0));
      return {
        ...record,
        review: {
          ...review,
          subState,
          lastSeenComments: Number.isFinite(seenComments) ? seenComments : currentComments,
          subStateSetAt: new Date().toISOString(),
          ...(subState === "fixing" ? { lastOurActionAt: new Date().toISOString() } : subState === "awaiting" ? { lastReviewerSeenAt: new Date().toISOString() } : {}),
        },
      };
    });
    if (!updated) throw new Error(`No PR record for branch ${branch}; run Sync PR Status first.`);
    appendLog("ui", `review state for ${branch}: ${subState || "(cleared)"}`);
    const runId = activeRunIdFromBody(body, paths.stateDir);
    return { branch, review: asObject(updated).review, prs: prRecords.buildPrRecordsView(paths.stateDir, runId) };
  }

  async function prepareLocalPrBatch(body: JsonObject): Promise<JsonObject> {
    const paths = resolveDashboardProject(body, { useDefaultProject: true });
    const runId = activeRunIdFromBody(body, paths.stateDir);
    const payload = prRecords.normalizePrRecordsPayload(prRecords.readPrRecords(paths.stateDir));
    const limit = intValue(body.batchLimit, DEFAULT_PR_BATCH_LIMIT, 1);
    const candidates = asArray(payload.records)
      .map(asObject)
      .filter((record) => prRecords.prRecordMatchesRun(record, runId) && stringValue(record.status, "planned") === "planned" && stringValue(asObject(record.local).status, "not_prepared") === "not_prepared" && stringValue(record.branch))
      .slice(0, limit);
    if (candidates.length === 0) throw new Error("No planned PR slices need local preparation.");
    return withDispatchLease(
      paths,
      {
        kind: "pr",
        workflowId: `pr-local:${runId}`,
        reason: `prepare local PR batch for run ${runId}`,
      },
      (_leaseId, revalidateLease) => withOperation(PREPARE_LOCAL_BATCH_OPERATION, `Prepare Local Batch — next ${candidates.length}`, candidates.map((record) => stringValue(record.branch)), async () => {
      const results: JsonObject[] = [];
      for (const record of candidates) {
        const branch = stringValue(record.branch);
        operationStep(branch, "local workspace preparation");
        try {
          const result = await prepareLocalPrForBranch(body, branch, revalidateLease);
          results.push({ branch, prepared: true, record: asObject(result.record) });
          operationStepDetail(branch, "local ready");
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          results.push({ branch, prepared: false, error: message });
          operationStepDetail(branch, `failed: ${outputTail(message, 300)}`);
          appendLog("stderr", `prepare-local-batch: ${branch} failed — ${message}`);
        }
      }
      const preparedCount = results.filter((result) => result.prepared === true).length;
      if (preparedCount === 0) throw new Error(`No local PR workspaces prepared; all ${results.length} slice(s) failed. See Logs.`);
      return { preparedCount, failedCount: results.length - preparedCount, results, prs: prRecords.normalizePrRecordsPayload(prRecords.readPrRecords(paths.stateDir)) };
      }),
    );
  }

  async function openPrForSlice(body: JsonObject): Promise<JsonObject> {
    const paths = resolveDashboardProject(body, { useDefaultProject: true });
    const { repoRoot, stateDir } = paths;
    assertHandoffIdle(stateDir, "Open PR");
    const branch = stringValue(body.prBranch);
    if (!branch) throw new Error("Open PR needs prBranch (the slice's branch name).");
    const records = asArray(prRecords.readPrRecords(stateDir).records).map(asObject);
    const record = records.find((candidate) => stringValue(candidate.branch) === branch);
    if (!record) throw new Error(`No PR record for branch ${branch}; run Sync PR Status first.`);
    if (record.prNumber) throw new Error(`Branch ${branch} already has PR #${numberValue(record.prNumber)}.`);
    const files = asArray(record.files).map((path) => stringValue(path)).filter(Boolean);
    const supportFiles = asArray(record.supportFiles).map((path) => stringValue(path)).filter(Boolean);
    if (files.length === 0) throw new Error(`PR record for ${branch} has no file manifest; re-run Plan PRs and Sync PR Status.`);

    let sessionHeadAtOpen = "";
    if (body.postLedgerComments !== false) {
      try {
        const sessionHead = await deps.runGit(repoRoot, ["rev-parse", "HEAD"], { check: false });
        if (sessionHead.exitCode === 0) sessionHeadAtOpen = sessionHead.stdout.trim();
      } catch {
        // A missing source SHA makes the ledger stale; comment posting remains best-effort.
      }
    }

    const repoSlug = upstreamRepoSlug(repoRoot);
    const forkOwner = prWorktrees.remoteOwner(repoRoot, "fork");
    if (!repoSlug || !forkOwner) throw new Error("Need an `origin` (upstream) and `fork` (push target) remote on the checkout.");

    const title = stringValue(record.title, `Melee decomp: ${stringValue(record.displayName, branch)}`);
    let publicationRunId = stringValue(record.runId);
    if (!publicationRunId) {
      try {
        publicationRunId = activeRunIdFromBody(body, stateDir);
      } catch {
        publicationRunId = "";
      }
    }
    const steps = ["prepare baseline", "prepare source patch", "verify slice in isolation", "check code issues", "publish branch", "create draft PR", "sync PR records"];
    return withDispatchLease(
      paths,
      {
        kind: "pr",
        workflowId: `pr-publish:${publicationRunId || branch}`,
        reason: `publish PR slice ${branch}`,
      },
      (_leaseId, revalidateLease) => withOperation("open-pr", `Open PR — ${stringValue(record.displayName, branch)}`, steps, async () => {
      await deps.submitWorkflowEvent(paths, {
        kind: "pr-publication",
        operation: "openPrForSlice",
        status: "started",
        runId: publicationRunId,
        prId: branch,
        detail: title,
        metadata: {
          branch,
          sliceId: stringValue(record.sliceId),
          files,
          ...(supportFiles.length > 0 ? { supportFiles } : {}),
        },
      });
      const baseRef = paths.project?.baseRef ?? "origin/master";
      operationStep("prepare baseline", baseRef);
      revalidateLease();
      const baselineStatus = await prWorktrees.ensureOpenPrBaseline(paths, revalidateLease);
      const baseSha = stringValue(baselineStatus.baseSha);
      const baselineWorktree = stringValue(baselineStatus.worktreeDir);
      const baselineJson = baselineWorktree ? resolve(baselineWorktree, "build/GALE01/baseline.json") : "";
      if (!baseSha || !baselineWorktree || !existsSync(baselineJson)) {
        failOperationStep("prepare baseline");
        throw new Error("Baseline worktree missing; run Prepare Handoff to rebuild the production baseline.");
      }
      operationStepDetail("prepare baseline", `${baseSha.slice(0, 10)} at ${baselineWorktree}`);

      operationStep("prepare source patch", prSync.isLocalBranchPrRecord(record) ? "local branch" : "verified ship set");
      const localSource = await prWorktrees.readyLocalPrSource({
        baseSha,
        branch,
        files,
        ...(supportFiles.length > 0 ? { supportFiles } : {}),
        record,
        repoRoot,
        stateDir,
      });
      const shipStatus = readJsonObject(resolve(stateDir, "pr_handoff", "ship_status.json"));
      let patchToApply = stringValue(localSource?.patchPath);
      let shipSetVerified = false;
      if (localSource) {
        operationStepDetail("prepare source patch", `${stringValue(localSource.source, "local source")} commit ${stringValue(localSource.commitSha).slice(0, 10)}`);
      } else {
        if (stringValue(shipStatus.status) !== "pr_ready") {
          operationNextHint("Run Prepare Handoff, or make sure the local PR branch exists so Open Draft can publish from that branch.");
          throw new Error("Ship set is not pr_ready and no local branch source was available.");
        }
        if (baseSha !== stringValue(shipStatus.baseSha)) {
          operationNextHint("Run Prepare Handoff again, or open from a local branch that can be verified against the current baseline.");
          throw new Error(`Verified ship set was prepared for ${stringValue(shipStatus.baseSha).slice(0, 10)}, but ${baseRef} is ${baseSha.slice(0, 10)}.`);
        }
        const shipPatchPath = prRecords.prHandoffArtifactPath(stateDir, stringValue(shipStatus.patchPath), "ship_set.patch");
        if (!existsSync(shipPatchPath)) throw new Error(`Verified ship patch missing at ${shipPatchPath}; run Prepare Handoff first.`);
        patchToApply = shipPatchPath;
        shipSetVerified = true;
        operationStepDetail("prepare source patch", "verified ship_set.patch");
      }
      if (!patchToApply) throw new Error(`No source patch could be prepared for ${branch}.`);

      const otherRecords = preparedMergePeers(records, branch, publicationRunId, baseSha);
      if (peersWithSupportOverlap(files, supportFiles, otherRecords)) {
        if (!localSource) {
          throw new Error(
            `Merge-order verification for slice ${stringValue(record.sliceId, branch)} requires a materialized local branch ` +
            `before opening because a prepared sibling overlaps its support files. Run Prepare Local PR first.`,
          );
        }
        await prWorktrees.verifySupportMergeOrder({
          repoRoot,
          branch,
          sliceId: stringValue(record.sliceId, branch),
          files,
          supportFiles,
          others: otherRecords,
        });
      }
      operationStep("verify slice in isolation", `${supportFiles.length > 0 ? `${files.length}+${supportFiles.length}` : files.length} file(s) onto baseline ${baseSha.slice(0, 10)}`);
      revalidateLease();
      const { report, issues } = await prWorktrees.verifyPrSliceInBaseline({
        baseSha,
        baselineWorktree,
        files,
        ...(supportFiles.length > 0 ? { supportFiles } : {}),
        patchPath: patchToApply,
        revalidateLease,
      });
      if (report.regressions.length > 0 || report.brokenMatches.length > 0 || report.fuzzyRegressions.length > 0) {
        failOperationStep("verify slice in isolation");
        operationNextHint("This slice does not stand alone - it likely depends on a shared/support slice. Open that slice's PR first, or stack the branches manually.");
        throw new Error(`Slice ${branch} regresses in isolation: ${report.brokenMatches.length} broken · ${report.fuzzyRegressions.length} fuzzy · ${report.regressions.length} metric.`);
      }
      operationStepDetail("verify slice in isolation", `${report.newMatches.length} new match(es), 0 regressions`);
      operationStep("check code issues", "upstream check-issues lint on the patched tree");
      if (issues.status === "issues") {
        failOperationStep("check code issues");
        operationNextHint("Upstream CI's Issues job would reject this slice. Fix the listed file(s) (e.g. permuter slop like self-assignment, conflicting prototypes) and re-run Prepare Handoff.");
        throw new Error(`Slice ${branch} fails the upstream Issues lint in ${asArray(issues.files).join(", ") || "(unattributed files)"}: ${outputTail(stringValue(issues.output), 1200)}`);
      }
      operationStepDetail("check code issues", issues.status === "clean" ? "Issues: OK" : `skipped - ${outputTail(stringValue(issues.output), 200)}`);

      if (localSource) {
        prRecords.updatePrRecord(stateDir, branch, (current) => ({
          ...current,
          local: {
            ...asObject(current.local),
            status: stringValue(localSource.source) === "local_worktree" ? "ready" : "local_only",
            worktreePath: stringValue(localSource.worktreePath),
            commitSha: stringValue(localSource.commitSha),
            error: "",
          },
          validation: prWorktrees.sliceValidationSummary(report, issues),
        }));
        operationStep("publish branch", `fork/${branch}`);
        revalidateLease();
        const push =
          stringValue(localSource.source) === "local_worktree"
            ? await runCli(["git", "push", "--force-with-lease", "-u", "fork", `HEAD:${branch}`], stringValue(localSource.worktreePath))
            : await runCli(["git", "push", "--force-with-lease", "-u", "fork", `${branch}:${branch}`], repoRoot);
        if (push.exitCode !== 0) throw new Error(`git push failed (${push.exitCode}): ${outputTail(push.stderr, 1500)}`);
      } else {
        operationStep("publish branch", branch);
        revalidateLease();
        await prWorktrees.publishPatchToFork({
          baseSha,
          branch,
          files,
          ...(supportFiles.length > 0 ? { supportFiles } : {}),
          patchPath: patchToApply,
          repoRoot,
          revalidateLease,
          title,
        });
      }

      operationStep("create draft PR", `${repoSlug} <- ${forkOwner}:${branch}`);
      revalidateLease();
      const bodyDir = resolve(stateDir, "pr_handoff", "pr_bodies");
      mkdirSync(bodyDir, { recursive: true });
      const bodyPath = resolve(bodyDir, `${branch.replace(/[^A-Za-z0-9_.-]+/g, "-")}.md`);
      const bodyLines = [
        "## Summary",
        "",
        `Exact-match decompilation of ${files.length} file(s) (${report.newMatches.length} newly matched function(s)). Produced by the decomp-orchestrator pipeline; only runner-validated exact matches ship.`,
        "",
        "## Files",
        "",
        ...files.map((file) => `- \`${file}\``),
        "",
        ...(supportFiles.length > 0
          ? [
              "## Support files",
              "",
              ...supportFiles.map((file) => `- \`${file}\``),
              "",
              "Cross-subsystem support files whose changes exist to serve this slice's matches (maintainer ruling: any file may be edited when the primary motivation is a match in this slice's target TU and nothing breaks). Verified in isolation together with the slice and merge-order-checked against sibling slices.",
              "",
            ]
          : []),
        "## Verification",
        "",
        `- Slice verified in isolation against the production baseline at \`${baseSha.slice(0, 10)}\`: applied alone, built with \`ninja changes_all\`, regression report clean (0 broken matches, 0 fuzzy regressions, 0 metric regressions).`,
        ...(shipSetVerified ? [`- Also verified as part of the full ship set (${numberValue(shipStatus.newMatches)} new matches, 0 regressions).`] : []),
        ...(localSource ? [`- Published from the ${stringValue(localSource.source, "local source").replace(/_/g, " ")} commit \`${stringValue(localSource.commitSha).slice(0, 10)}\`.`] : []),
        ...(issues.status === "clean" ? ["- Passed the upstream `check-issues` lint locally (same container as CI's Issues job)."] : []),
      ];
      writeFileSync(bodyPath, `${bodyLines.join("\n")}\n`, "utf8");
      revalidateLease();
      const create = await runCli(
        ["gh", "pr", "create", "--repo", repoSlug, "--head", `${forkOwner}:${branch}`, "--draft", "--title", title, "--body-file", bodyPath],
        stringValue(localSource?.worktreePath) || repoRoot,
      );
      if (create.exitCode !== 0) throw new Error(`gh pr create failed (${create.exitCode}): ${outputTail(create.stderr || create.stdout, 1500)}`);
      const prUrl = create.stdout.trim().split("\n").pop() ?? "";
      operationStepDetail("create draft PR", prUrl);
      appendLog("ui", `draft PR opened: ${prUrl}`);

      operationStep("sync PR records");
      const prs = await prSync.syncPrRecords({ ...body });
      const updated = asArray(prs.records).map(asObject).find((candidate) => stringValue(candidate.branch) === branch) ?? null;
      operationStepDetail("sync PR records", updated ? `${branch} -> ${stringValue(updated.status)} #${numberValue(updated.prNumber)}` : "synced");
      try {
        await postReviewLedgerComments({
          body,
          branch,
          files,
          paths,
          prUrl,
          record: updated ?? record,
          repoSlug,
          sessionHeadSha: sessionHeadAtOpen,
          title,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        appendLog("stderr", `ledger comments for ${branch}: unexpected failure — ${message}`);
        appendLog("ui", `ledger comments for ${branch}: posted 0, failed 1`);
      }
      await deps.submitWorkflowEvent(paths, {
        kind: "pr-publication",
        operation: "openPrForSlice",
        status: "completed",
        runId: publicationRunId,
        prId: branch,
        detail: prUrl,
        metadata: {
          branch,
          sliceId: stringValue(record.sliceId),
          prNumber: numberValue(asObject(updated).prNumber, 0),
          url: stringValue(asObject(updated).url, prUrl),
          files,
          ...(supportFiles.length > 0 ? { supportFiles } : {}),
        },
      });
      return { opened: true, branch, record: updated, prs };
      }),
    );
  }

  async function openAllPlannedPrs(body: JsonObject): Promise<JsonObject> {
    const paths = resolveDashboardProject(body, { useDefaultProject: true });
    const runId = activeRunIdFromBody(body, paths.stateDir);
    const records = asArray(prRecords.normalizePrRecordsPayload(prRecords.readPrRecords(paths.stateDir)).records).map(asObject);
    const planned = records.filter(
      (record) => prRecords.prRecordMatchesRun(record, runId) && stringValue(record.status, "planned") === "planned" && stringValue(record.branch) && asArray(record.files).length > 0,
    );
    if (planned.length === 0) throw new Error("No planned PR records to open. Run Prepare Handoff (or Plan PRs + Sync PR Status) first.");
    const ordered = [...planned].sort((left, right) => {
      const leftSubsystem = stringValue(left.scope).startsWith("melee/") ? 1 : 0;
      const rightSubsystem = stringValue(right.scope).startsWith("melee/") ? 1 : 0;
      return leftSubsystem - rightSubsystem || stringValue(left.branch).localeCompare(stringValue(right.branch));
    });
    return withOperation("open-all-prs", "Open All Draft PRs", ordered.map((record) => stringValue(record.branch)), async () => {
      const results: JsonObject[] = [];
      for (const record of ordered) {
        const branch = stringValue(record.branch);
        operationStep(branch);
        try {
          const result = await openPrForSlice({ ...body, prBranch: branch });
          const opened = asObject(result.record);
          results.push({ branch, opened: true, prNumber: numberValue(opened.prNumber, NaN), url: stringValue(opened.url) });
          operationStepDetail(branch, `draft #${numberValue(opened.prNumber)} opened`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          results.push({ branch, opened: false, error: message });
          operationStepDetail(branch, `failed: ${outputTail(message, 300)}`);
          appendLog("stderr", `open-all: ${branch} failed — ${message}`);
        }
      }
      const openedCount = results.filter((result) => result.opened === true).length;
      if (openedCount === 0) {
        operationNextHint("Every slice failed to open. Check the Logs tab for the first failure; isolation failures usually mean the slice needs to stack on a shared slice.");
        throw new Error(`No PRs opened; all ${results.length} slice(s) failed. See Logs.`);
      }
      appendLog("ui", `open-all: ${openedCount}/${results.length} draft PR(s) opened`);
      return { openedCount, failedCount: results.length - openedCount, results };
    });
  }

  async function openNextDraftBatch(body: JsonObject): Promise<JsonObject> {
    const paths = resolveDashboardProject(body, { useDefaultProject: true });
    const runId = activeRunIdFromBody(body, paths.stateDir);
    const limit = intValue(body.batchLimit, DEFAULT_PR_BATCH_LIMIT, 1);
    const payload = prRecords.normalizePrRecordsPayload(prRecords.readPrRecords(paths.stateDir));
    const ready = asArray(payload.records)
      .map(asObject)
      .filter((record) => {
        const localStatus = stringValue(asObject(record.local).status);
        return (
          prRecords.prRecordMatchesRun(record, runId) &&
          stringValue(record.status, "planned") === "planned" &&
          stringValue(record.branch) &&
          (localStatus === "ready" || (localStatus === "local_only" && prSync.isLocalBranchPrRecord(record)))
        );
      })
      .slice(0, limit);
    if (ready.length === 0) throw new Error("No local-ready or local-branch PR slices to open. Prepare a local batch first, or run Sync PRs to rediscover local branches.");
    return withOperation("open-draft-batch", `Open Draft Batch — next ${ready.length}`, ready.map((record) => stringValue(record.branch)), async () => {
      const results: JsonObject[] = [];
      const published = new Set<string>();
      for (const record of ready) {
        const branch = stringValue(record.branch);
        operationStep(branch);
        try {
          const result = await openPrForSlice({ ...body, prBranch: branch });
          const opened = asObject(result.record);
          results.push({ branch, opened: true, prNumber: numberValue(opened.prNumber, NaN), url: stringValue(opened.url) });
          published.add(branch);
          operationStepDetail(branch, `draft #${numberValue(opened.prNumber)} opened`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          results.push({ branch, opened: false, error: message });
          operationStepDetail(branch, `failed: ${outputTail(message, 300)}`);
          appendLog("stderr", `open-draft-batch: ${branch} failed — ${message}`);
        }
      }
      const openedCount = results.filter((result) => result.opened === true).length;
      if (openedCount === 0) {
        operationNextHint("Every local-ready slice failed to open. Check the Logs tab for the first failure.");
        throw new Error(`No PRs opened; all ${results.length} local-ready slice(s) failed. See Logs.`);
      }

      const latest = prRecords.normalizePrRecordsPayload(prRecords.readPrRecords(paths.stateDir));
      const updatedRecords = asArray(latest.records).map((value) => {
        const record = asObject(value);
        if (!published.has(stringValue(record.branch))) return record;
        return prRecords.normalizePrRecord({
          ...record,
          batch: {
            ...asObject(record.batch),
            state: "published",
            publishedAt: new Date().toISOString(),
          },
        });
      });
      const prs = prRecords.writePrRecords(paths.stateDir, { ...latest, records: updatedRecords, syncedAt: new Date().toISOString() });
      return { openedCount, failedCount: results.length - openedCount, results, prs };
    });
  }

  async function preparePrHandoff(body: JsonObject): Promise<JsonObject> {
    const paths = resolveDashboardProject(body, { useDefaultProject: true });
    const stateDir = paths.stateDir;
    const runId = activeRunIdFromBody(body, stateDir);
    const prepareSteps = [
      "stop worker scheduling",
      "fetch upstream",
      "update main worktree",
      "discover merged PRs",
      "PR intake agents",
      "knowledge graph rebuild",
      "rebuild production baseline",
      "QA build & regression gate",
      "checkpoint",
      "readmit rework",
      "QA repair lane",
      "plan PR slices",
      "verify ship set",
      "reconcile & re-verify",
      "replan PR slices",
      "sync PR records",
      "save point",
    ];
    return withDispatchLease(
      paths,
      {
        beginHandoffOnQueue: true,
        kind: "pr",
        workflowId: `pr-handoff:${runId}`,
        reason: `prepare PR handoff for run ${runId}`,
      },
      (_leaseId, revalidateLease) => withOperation("prepare", "Prepare Handoff", prepareSteps, async () => {
      assertHandoffIdle(stateDir, "Prepare handoff");
      operationStep("stop worker scheduling");
      const pause = body.pauseBeforeHandoff !== false ? await pauseRunForPr(body, revalidateLease) : null;

      revalidateLease();
      const gitSync = await deps.syncMergedPrIntakeForPrepare(paths, boolValue(body.dryRunAgents), revalidateLease);

      operationStep("rebuild production baseline");
      revalidateLease();
      const baseline = await prWorktrees.rebuildProductionBaseline(paths, revalidateLease);
      recordHandoffStatus(paths, runId, "baseline", baseline);
      operationStepDetail("rebuild production baseline", `${stringValue(baseline.baseSha).slice(0, 10)} ${baseline.cached ? "(cached)" : "(full build)"}`);

      revalidateLease();
      const qa = await runPrQa({ ...body, stateDir, runId });
      const regressionReport = await regressionReportFromChanges(paths.repoRoot);
      const reworkEntries = regressionReport ? [...regressionReport.brokenMatches, ...regressionReport.fuzzyRegressions] : [];
      const reworkSymbols = [...new Set(reworkEntries.map((entry) => entry.itemName).filter(Boolean))];
      revalidateLease();
      const checkpoint = await checkpointRunForPr({ ...body, stateDir, runId }, reworkSymbols);
      if (reworkSymbols.length > 0) {
        operationStepDetail("checkpoint", `${reworkSymbols.length} regressed symbol(s) moved to needs_rework`);
      }

      operationStep("readmit rework");
      let requeued = 0;
      if (regressionReport && reworkEntries.length > 0) {
        const sourcePaths = new Map<string, string>();
        for (const entry of reworkEntries) {
          if (entry.sourcePath) sourcePaths.set(entry.unitName, entry.sourcePath);
        }
        const repairPlan = planRegressionRepair(regressionReport, { pauseThreshold: 0, repairPriorityBase: 400, requeueLimit: 64, sourcePaths });
        const store = openState(stateDir);
        try {
          requeued = admitPriorityTargets(store, runId, repairPlan.repairCandidates);
        } finally {
          store.db.close();
        }
        appendLog("ui", `readmitted ${requeued} regressed target(s) for repair`);
        operationStepDetail("readmit rework", `${requeued} regressed target(s) admitted at repair priority`);
      } else {
        operationStepDetail("readmit rework", "nothing regressed against the baseline");
      }

      const branchVerdict = stringValue(asObject(qa.prPromotion).status, stringValue(qa.status, "unknown"));
      revalidateLease();
      const qaRepair = await runQaRepairForPr({ ...body, stateDir, runId });
      const qaRepairShipStatusPath = stringValue(qaRepair.shipStatusPath);

      const splitPlan = await runPrSplitPlan({ ...body, stateDir, runId, prShipStatusPath: qaRepairShipStatusPath });
      if (stringValue(splitPlan?.status) !== "passed") throw new Error("PR split planning failed; see Logs for the pr-split-plan output.");

      const matchPathspecs = asArray(splitPlan.matchPathspecs).map((path) => stringValue(path)).filter(Boolean);
      operationStep("verify ship set", `${matchPathspecs.length} match file(s) onto baseline ${stringValue(baseline.baseSha).slice(0, 10)}`);
      revalidateLease();
      let ship = await prWorktrees.verifyShipSet(paths, baseline, matchPathspecs, { revalidateLease });
      recordHandoffStatus(paths, runId, "ship", ship);
      let shipStatus = stringValue(ship.status);
      const shipDetail = (): string =>
        shipStatus === "pr_ready"
          ? `pr_ready — ${numberValue(ship.newMatches)} confirmed match(es) across ${numberValue(ship.files)} file(s), 0 regressions`
          : `${shipStatus} — ${numberValue(ship.fuzzyRegressions)} fuzzy · ${numberValue(ship.metricRegressions)} metric regression(s)`;
      operationStepDetail("verify ship set", shipDetail());
      if (shipStatus === "nothing_to_ship") {
        failOperationStep("verify ship set");
        operationNextHint("No confirmed matches survive verification yet. Resume the run to produce more matches; dropped files are already readmitted as rework.");
        throw new Error("Nothing to ship: no new matches survive against the production baseline.");
      }

      if (shipStatus !== "pr_ready" && body.autoReconcile !== false) {
        operationStep("reconcile & re-verify", "ship set blocked - reconcile agent fix loop");
        revalidateLease();
        await runReconcile({ ...body, stateDir, runId, mode: "ship-validate" });
        revalidateLease();
        ship = await prWorktrees.verifyShipSet(paths, baseline, matchPathspecs, { revalidateLease });
        recordHandoffStatus(paths, runId, "ship", ship);
        shipStatus = stringValue(ship.status);
        operationStepDetail("reconcile & re-verify", shipDetail());
      } else {
        operationStep("reconcile & re-verify", "skipped - ship set clean");
      }
      if (shipStatus !== "pr_ready") {
        failOperationStep("reconcile & re-verify");
        operationNextHint("Regressions persist after the reconcile attempt. Inspect ship_status.json, fix or drop the offending files, then re-run Prepare Handoff.");
        throw new Error(`Ship set is ${shipStatus}: ${numberValue(ship.fuzzyRegressions)} fuzzy and ${numberValue(ship.metricRegressions)} metric regression(s) remain after reconcile.`);
      }
      const droppedCount = Object.keys(asObject(ship.droppedFiles)).length;

      operationStep("replan PR slices");
      let finalSplitPlan = splitPlan;
      const shippedFiles = asArray(ship.shippedFiles).map((path) => stringValue(path)).filter(Boolean);
      const plannedMatches = asArray(splitPlan.matchPathspecs).map((path) => stringValue(path)).filter(Boolean);
      if (droppedCount > 0 || shippedFiles.length !== plannedMatches.length) {
        finalSplitPlan = await runPrSplitPlan({
          ...body,
          stateDir,
          runId,
          prShipStatusPath: resolve(stateDir, "pr_handoff", "ship_status.json"),
        });
        if (stringValue(finalSplitPlan?.status) !== "passed") {
          failOperationStep("replan PR slices");
          throw new Error("Post-verification PR split replan failed; see Logs for the pr-split-plan output.");
        }
        operationStepDetail(
          "replan PR slices",
          `${droppedCount} dropped file(s) moved to the local lane; match slices now carry ${asArray(finalSplitPlan.matchPathspecs).length} file(s)`,
        );
      } else {
        operationStepDetail("replan PR slices", "skipped - every planned match file survived verification");
      }

      operationStep("sync PR records");
      let prRecordsPayload: JsonObject | null = null;
      try {
        prRecordsPayload = await prSync.syncPrRecords({ ...body, stateDir, runId });
        operationStepDetail("sync PR records", `${asArray(prRecordsPayload.records).length} PR record(s) tracked`);
      } catch (error) {
        operationStepDetail("sync PR records", `seeding failed: ${error instanceof Error ? error.message : String(error)}`);
      }

      operationStep("save point", "hard save point - session handoff");
      const boundaryCommit = await commitBoundaryWorktree({
        message: `boundary(ship): handoff ${stringValue(baseline.baseSha).slice(0, 10)}`,
        repoRoot: paths.repoRoot,
        revalidateLease,
        runGit: deps.runGit,
        stateDir,
      });
      const savePoint = await savePoints.boundarySavePoint(paths, "ship", `handoff ${stringValue(baseline.baseSha).slice(0, 10)}`);
      if (savePoint.ok) operationStepDetail("save point", `ship save point recorded (${savePoint.savePointId})`);

      return {
        prepared: true,
        project: paths.project ? projectToSummary(paths.project) : null,
        blockedAt: null,
        runId,
        pause,
        boundaryCommit,
        prRecords: prRecordsPayload,
        savePoint,
        gitSync: { beforeRef: gitSync.beforeRef, afterRef: gitSync.afterRef, branch: gitSync.branch, mergedPrs: gitSync.mergedPrs },
        baseline,
        reworkSymbols,
        requeued,
        branchVerdict,
        checkpoint,
        qa,
        qaRepair,
        splitPlan: finalSplitPlan,
        ship,
      };
      }),
    );
  }

  return {
    checkpointRunForPr,
    createSavePoint: savePoints.createSavePoint,
    openAllPlannedPrs,
    openNextDraftBatch,
    openPrForSlice,
    pauseRunForPr,
    prepareLocalPr,
    prepareLocalPrBatch,
    preparePrHandoff,
    reconcile: runReconcile,
    resumeRunForPr,
    runPrQa,
    runPrSplitPlan,
    runQaRepairForPr,
    setPrReviewState,
    syncPrRecords: prSync.syncPrRecords,
    verifyShipSet: runVerifyShipSet,
  };
}
