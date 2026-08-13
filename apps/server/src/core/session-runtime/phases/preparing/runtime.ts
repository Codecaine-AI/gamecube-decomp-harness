import { randomUUID } from "node:crypto";
import type { Database } from "bun:sqlite";
import { runningScheduling } from "@server/core/session-runtime/phases/running/process-command";
import { createRunCheckpoint, shipsInPr, type RunCheckpointResult } from "@server/core/session-runtime/phases/pr/checkpoint";
import { getRun, openState, updateRunStatus } from "@server/core/session-runtime/run-state";
import { projectSessionView, type PreparingPhaseState, type ProjectSessionPatch, type ProjectSessionRecord, type ProjectSessionView } from "@server/core/project-session";
import { getActiveProjectSession, getProjectSessionBySelector, transitionProjectSession } from "@server/core/project-session/store";
import { forceReportRun } from "@server/core/validation/report";
import { canonicalProcessName } from "@server/core/project-session/process-identity";
import type { ResolvedProject } from "@server/core/project-registry";
import { now as currentTime } from "@server/core/orchestrator-state";
import { withDispatchLease } from "@server/core/session-runtime/dispatch-guard";
import { commitBoundaryWorktree } from "@server/core/session-runtime/phases/pr/boundary-commit.js";
import { setPreparingSubphase } from "./index.js";
import {
  boolValue,
  latestRunId,
  numberValue,
  parseCliJsonOutput,
  serverJobPrefix,
  stringValue,
  type JsonObject,
  type PreparingRuntimeDeps,
  type PreparingRuntimeProjectContext,
  type PreparingRuntimeState,
} from "./runtime-shared.js";
import {
  reportAgainstNewBaselineForPrepare,
  resetReportBaselineForPrepare,
  prepareWorktreePaths,
} from "./subphases/index.js";

export { compactReportRunResult, mergedPullRequestNumbers, parseBaseRef } from "./subphases/index.js";
export type {
  GitSyncResult,
  JsonObject,
  PreparingRuntimeDeps,
  PreparingRuntimeProjectContext,
  PreparingRuntimeState,
} from "./runtime-shared.js";

function projectIdFromContext(paths: PreparingRuntimeProjectContext, body: JsonObject): string {
  return paths.project?.projectId ?? stringValue(body.projectId);
}

function projectSessionSelector(body: JsonObject, projectId: string): { id?: string | null; sessionUuid?: string | null; projectId?: string | null } {
  const explicitId = stringValue(body.id);
  const sessionId = stringValue(body.sessionId);
  const sessionIdLooksLikeRowId = sessionId.startsWith("project-session:");
  return {
    id: explicitId || (sessionIdLooksLikeRowId ? sessionId : ""),
    sessionUuid: stringValue(body.sessionUuid, stringValue(body.session_uuid, sessionIdLooksLikeRowId ? "" : sessionId)),
    projectId,
  };
}

function acceptPreparingTransition(
  db: Database,
  record: ProjectSessionRecord,
  patch: ProjectSessionPatch,
  eventType: string,
  at: string,
): ProjectSessionView {
  return projectSessionView(
    transitionProjectSession(db, record.id, {
      actor: "runner",
      commandId: `command-${eventType.replaceAll(".", "-")}-${randomUUID()}`,
      correlationId: patch.active_run_id ?? record.active_run_id ?? record.session_uuid,
      eventType,
      expectedRevision: record.revision,
      occurredAt: at,
      patch,
      payload: {
        previous_phase: record.phase,
        previous_status: record.status,
        phase: patch.phase ?? record.phase,
        status: patch.status ?? record.status,
      },
      projectId: record.project_id,
      sessionUuid: record.session_uuid,
    }),
  );
}

function activePreparingProjectSession(paths: PreparingRuntimeProjectContext, body: JsonObject): ProjectSessionView {
  const projectId = projectIdFromContext(paths, body);
  if (!projectId) throw new Error("Project id is required for session preparation.");
  const store = openState(paths.stateDir);
  try {
    const selector = projectSessionSelector(body, projectId);
    const record = getProjectSessionBySelector(store.db, selector) ?? getActiveProjectSession(store.db, projectId);
    if (!record) throw new Error("Create a project session before running preparation steps.");
    if (record.phase !== "preparing") {
      throw new Error(`Cannot run preparation while project session ${record.session_uuid} is in ${record.phase} phase.`);
    }
    return projectSessionView(record);
  } finally {
    store.db.close();
  }
}

function updateFreshProjectSessionSubphase(
  paths: PreparingRuntimeProjectContext,
  body: JsonObject,
  session: ProjectSessionView | null,
  subphase: PreparingPhaseState["subphase"],
  detail: string,
  data: Partial<PreparingPhaseState> = {},
  patch: Pick<ProjectSessionPatch, "active_run_id" | "base_sha"> = {},
): ProjectSessionView | null {
  const projectId = projectIdFromContext(paths, body);
  if (!projectId || !session) return session;
  const store = openState(paths.stateDir);
  try {
    const selector = projectSessionSelector({ ...body, sessionUuid: session.sessionUuid }, projectId);
    const record = getProjectSessionBySelector(store.db, selector);
    if (!record) return session;
    const at = currentTime();
    return acceptPreparingTransition(
      store.db,
      record,
      {
        ...setPreparingSubphase(record, at, subphase, { detail, data }),
        ...patch,
      },
      "session.preparing_subphase_updated",
      at,
    );
  } finally {
    store.db.close();
  }
}

function assertPrepareActionAllowed(deps: PreparingRuntimeDeps, paths: PreparingRuntimeProjectContext): void {
  const active = deps.hasActiveProcess(paths.stateDir);
  if (active.active) {
    const activeName = stringValue(active.name, paths.project?.processName ?? "melee-live");
    throw new Error(`Stop the active process (${activeName}) before changing session preparation.`);
  }
  const runId = latestRunId(paths.stateDir);
  if (!runId) return;
  const store = openState(paths.stateDir);
  try {
    const run = getRun(store, runId);
    if (run && run.status === "active") {
      throw new Error(`Run ${run.id} is active. Preparation changes are locked while workers are running.`);
    }
  } finally {
    store.db.close();
  }
}

function prepareMainWorktreeRoot(paths: PreparingRuntimeProjectContext, session: ProjectSessionView): string {
  return stringValue(session.phases.preparing.sync?.upstreamWorktreePath, stringValue(session.phases.preparing.sync?.mainWorktreePath, paths.repoRoot));
}

function prepareSessionWorktreeRoot(paths: PreparingRuntimeProjectContext, session: ProjectSessionView | null): string {
  const fallback = session
    ? prepareWorktreePaths(paths, session.sessionUuid).sessionCurrentWorktreePath
    : undefined;
  return stringValue(
    session?.phases.preparing.sync?.sessionCurrentWorktreePath,
    stringValue(session?.phases.preparing.sync?.sessionWorktreePath, fallback ?? paths.repoRoot),
  );
}

function activeProjectSessionOrNull(paths: PreparingRuntimeProjectContext, body: JsonObject): ProjectSessionView | null {
  const projectId = projectIdFromContext(paths, body);
  if (!projectId) return null;
  const store = openState(paths.stateDir);
  try {
    const selector = projectSessionSelector(body, projectId);
    const record = getProjectSessionBySelector(store.db, selector) ?? getActiveProjectSession(store.db, projectId);
    return record ? projectSessionView(record) : null;
  } finally {
    store.db.close();
  }
}

function workerConfigFromBody(body: JsonObject, dashboard: JsonObject | undefined): JsonObject {
  return {
    workerCount: numberValue(body.maxWorkers, 16),
    epochSize: stringValue(body.epochSize, dashboard?.epochSize == null ? "64" : String(dashboard.epochSize)),
    candidateWindow: stringValue(body.candidateWindow, dashboard?.candidateWindow == null ? "128" : String(dashboard.candidateWindow)),
    candidateRerank: stringValue(body.candidateRerank, dashboard?.candidateRerank == null ? "priority" : String(dashboard.candidateRerank)),
    agentTimeoutSeconds: numberValue(body.agentTimeoutSeconds, numberValue(dashboard?.agentTimeoutSeconds, 1800)),
    toolConcurrency: body.toolConcurrency && typeof body.toolConcurrency === "object" ? body.toolConcurrency : undefined,
  };
}

export function compactCheckpointResult(result: RunCheckpointResult): JsonObject {
  const compactItem = (item: RunCheckpointResult["items"][number]): JsonObject => ({
    workerStateId: item.workerStateId,
    workerCheckpointId: item.workerCheckpointId || null,
    symbol: item.symbol,
    sourcePath: item.sourcePath,
    patchPath: item.patchPath || null,
  });
  return {
    checkpoint: result.checkpoint,
    counts: result.counts,
    eligibility: result.eligibility,
    prCandidates: result.items.filter((item) => item.disposition === "pr_candidate").map(compactItem),
    improvementCandidates: result.items.filter((item) => item.disposition === "improvement_candidate").map(compactItem),
    carryForwardCount: result.items.filter((item) => !shipsInPr(item.disposition)).length,
  };
}

function initRunCommand(deps: PreparingRuntimeDeps, body: JsonObject): { command: string[]; repoRoot: string; stateDir: string; graphDbPath: string; project: ResolvedProject | null } {
  const paths = deps.resolveDashboardProject(body, { useDefaultProject: true });
  const { graphDbPath, project, stateDir } = paths;
  const repoRoot = stringValue(body.sessionRepoRoot, paths.repoRoot);
  const commandPaths = { ...paths, repoRoot };
  const { maxWorkers } = runningScheduling(body.maxWorkers);
  const command = [
    ...serverJobPrefix(commandPaths, deps.serverJobPath),
    ...(boolValue(body.dryRunAgents) ? ["--dry-run-agents"] : []),
    "--provider",
    stringValue(body.provider, "codex-lb"),
    "--model",
    stringValue(body.model, "gpt-5.6-sol"),
    "--thinking-level",
    stringValue(body.thinkingLevel, "xhigh"),
    "--agent-timeout-seconds",
    String(numberValue(body.agentTimeoutSeconds, numberValue(project?.dashboard.agentTimeoutSeconds, 1800))),
    "init-run",
    "--desired-workers",
    String(maxWorkers),
    "--epoch-size",
    stringValue(body.epochSize, project?.dashboard.epochSize == null ? "64" : String(project.dashboard.epochSize)),
    "--candidate-window",
    String(
      Math.max(
        1,
        Math.trunc(
          numberValue(
            body.candidateWindow,
            numberValue(project?.dashboard.candidateWindow, 128),
          ),
        ),
      ),
    ),
    "--candidate-rerank",
    stringValue(body.candidateRerank, project?.dashboard.candidateRerank == null ? "priority" : String(project.dashboard.candidateRerank)),
    "--integration-resolver-concurrency",
    String(numberValue(body.integrationResolverConcurrency, numberValue(project?.dashboard.integrationResolverConcurrency, 4))),
    "--goal-kind",
    stringValue(body.goalKind, "matched_code_percent"),
    "--goal-value",
    String(project?.dashboard.goalValue ?? numberValue(body.goalValue, 100)),
    "--graph-db",
    graphDbPath,
  ];
  const workerConfigureCommand = stringValue(body.workerConfigureCommand).trim();
  if (workerConfigureCommand) command.push("--worker-configure-command", workerConfigureCommand);
  const epochConfigureCommand = stringValue(body.epochConfigureCommand).trim();
  if (epochConfigureCommand) command.push("--epoch-configure-command", epochConfigureCommand);
  return { command, repoRoot, stateDir, graphDbPath, project };
}

export function createPreparingRuntime(deps: PreparingRuntimeDeps): {
  calculateBaselineForPrepare: (body: JsonObject) => Promise<JsonObject>;
  completeRun: (body: JsonObject) => Promise<JsonObject>;
  freshRun: (body: JsonObject) => Promise<JsonObject>;
  indexPrsForPrepare: (body: JsonObject) => Promise<JsonObject>;
  initRun: (body: JsonObject) => Promise<JsonObject>;
  initRunCommand: (body: JsonObject) => { command: string[]; repoRoot: string; stateDir: string; graphDbPath: string; project: ResolvedProject | null };
  state: () => PreparingRuntimeState;
  syncGitForPrepare: (body: JsonObject) => Promise<JsonObject>;
} {
  const runReport = deps.runReport ?? forceReportRun;
  let freshRunActive = false;
  let projectSyncActive = false;

  return {
    state: () => ({ freshRunActive, projectSyncActive }),

    initRunCommand: (body) => initRunCommand(deps, body),

    async syncGitForPrepare(): Promise<JsonObject> {
      throw new Error(
        "Legacy preparation sync is disabled. Use the operator sync.start action so observation, lease acquisition, staged validation, and confirm-gated publication remain inside SyncState.",
      );
    },

    async indexPrsForPrepare(): Promise<JsonObject> {
      throw new Error(
        "Legacy preparation PR intake is disabled. Use the operator sync.start action so merged-PR knowledge advances only through SyncState.",
      );
    },

    async calculateBaselineForPrepare(body): Promise<JsonObject> {
      if (freshRunActive) {
        throw new Error("Baseline calculation is already running. Wait for it to finish before starting another baseline.");
      }
      freshRunActive = true;
      const paths = deps.resolveDashboardProject(body, { useDefaultProject: true });
      try {
        const projectSession = activePreparingProjectSession(paths, body);
        const intakeStatus = stringValue(projectSession.phases.preparing.intake?.status);
        const knowledgeStatus = stringValue(projectSession.phases.preparing.knowledge?.status);
        if ((intakeStatus !== "complete" && !projectSession.phases.preparing.intake?.completedAt) || (knowledgeStatus !== "complete" && !projectSession.phases.preparing.knowledge?.completedAt)) {
          throw new Error("Run PR intake before calculating the baseline.");
        }
        const baselineRepoRoot = prepareMainWorktreeRoot(paths, projectSession);
        const baselinePaths = { ...paths, repoRoot: baselineRepoRoot };
        assertPrepareActionAllowed(deps, paths);
        deps.beginOperation("prepare-baseline", "Calculate Baseline", ["reset report baseline", "report against new baseline", "save point"]);
        let session = updateFreshProjectSessionSubphase(
          paths,
          body,
          projectSession,
          "baseline",
          "Calculating the session baseline.",
          {
            baseline: {
              status: "active",
              startedAt: new Date().toISOString(),
            },
          },
        );
        await deps.submitWorkflowEvent(paths, {
          kind: "baseline",
          operation: "prepare.calculateBaseline",
          status: "started",
          sessionId: projectSession.sessionUuid,
          detail: `calculate baseline at ${baselineRepoRoot}`,
        });
        try {
          const resetReport = await resetReportBaselineForPrepare(deps, runReport, baselineRepoRoot, {
            stateDir: paths.stateDir,
            projectId: projectIdFromContext(paths, body) || null,
            sessionUuid: projectSession.sessionUuid,
            boardKey: "baseline",
            trustedReportKey: "baseline",
            reportRunKey: "prepare_baseline_reset",
          });
          await deps.submitWorkflowEvent(paths, {
            kind: "baseline",
            operation: "prepare.resetReportBaseline",
            status: "completed",
            sessionId: projectSession.sessionUuid,
            detail: "report baseline reset",
            metadata: { ...resetReport, repoRoot: baselineRepoRoot },
          });
          const reportRun = await reportAgainstNewBaselineForPrepare(deps, runReport, baselineRepoRoot, {
            stateDir: paths.stateDir,
            projectId: projectIdFromContext(paths, body) || null,
            sessionUuid: projectSession.sessionUuid,
            boardKey: "baseline",
            trustedReportKey: "baseline",
            reportRunKey: "prepare_baseline_report",
          });
          await deps.submitWorkflowEvent(paths, {
            kind: "baseline",
            operation: "prepare.reportAgainstBaseline",
            status: "completed",
            sessionId: projectSession.sessionUuid,
            detail: "baseline report refreshed",
            metadata: { ...reportRun, repoRoot: baselineRepoRoot },
          });
          deps.operationStep("save point");
          const boundaryCommit = await withDispatchLease(
            baselinePaths,
            {
              kind: "run",
              projectId: projectIdFromContext(paths, body),
              reason: `commit prepared baseline for ${projectSession.sessionUuid}`,
              workflowId: `run-prepare:${projectSession.sessionUuid}`,
            },
            async (_leaseId, revalidateLease) => commitBoundaryWorktree({
              message: "boundary(init): prepare baseline",
              repoRoot: baselineRepoRoot,
              revalidateLease,
              runGit: deps.runGit,
              stateDir: paths.stateDir,
            }),
          );
          const savePoint = await deps.boundarySavePoint(baselinePaths, "init", "prepare baseline");
          session = updateFreshProjectSessionSubphase(
            paths,
            body,
            session,
            "ready",
            "Baseline is ready. Choose worker config before starting the run.",
            {
              baseline: {
                status: "complete",
                completedAt: new Date().toISOString(),
                reportRun,
                repoRoot: baselineRepoRoot,
                resetReport,
                boundaryCommit,
                savePoint,
              },
            },
          );
          await deps.submitWorkflowEvent(paths, {
            kind: "baseline",
            operation: "prepare.calculateBaseline",
            status: "completed",
            sessionId: projectSession.sessionUuid,
            detail: "baseline ready",
            metadata: {
              repoRoot: baselineRepoRoot,
              reportRun,
              resetReport,
              boundaryCommit,
              savePoint,
            },
          });
          deps.endOperation();
          return {
            baseline: true,
            project: paths.project ? deps.projectToSummary(paths.project) : null,
            projectSession: session,
            repoRoot: paths.repoRoot,
            baselineRepoRoot,
            stateDir: paths.stateDir,
            reportRun,
            resetReport,
            boundaryCommit,
            savePoint,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          session = updateFreshProjectSessionSubphase(
            paths,
            body,
            session,
            "baseline",
            `Baseline calculation failed: ${message}`,
            {
              baseline: {
                ...(session?.phases.preparing.baseline ?? {}),
                status: "failed",
                failedAt: new Date().toISOString(),
                error: message,
                repoRoot: baselineRepoRoot,
              },
            },
          );
          await deps.submitWorkflowEvent(paths, {
            kind: "baseline",
            operation: "prepare.calculateBaseline",
            status: "failed",
            sessionId: projectSession.sessionUuid,
            metadata: {
              error: message,
              repoRoot: baselineRepoRoot,
            },
          }).catch(() => null);
          throw error;
        }
      } catch (error) {
        deps.endOperation(error);
        throw error;
      } finally {
        freshRunActive = false;
      }
    },

    async completeRun(body): Promise<JsonObject> {
      const paths = deps.resolveDashboardProject(body, { useDefaultProject: true });
      const { repoRoot, stateDir } = paths;
      const runId = stringValue(body.runId) || latestRunId(stateDir);
      if (!runId) throw new Error("No run found to complete.");

      const active = deps.hasActiveProcess(stateDir);
      if (active.active) {
        const activeName = stringValue(active.name, paths.project?.processName ?? "melee-live");
        throw new Error(`Stop the active process (${activeName}) before closing this run.`);
      }

      const forceClose = body.force === true;
      const prBlockers = deps.activeSessionPrBlockers(stateDir);
      if (prBlockers.length > 0 && !forceClose) {
        throw new Error(`Resolve this session's PR work before closing the run: ${prBlockers.slice(0, 6).join("; ")}${prBlockers.length > 6 ? `; +${prBlockers.length - 6} more` : ""}`);
      }

      deps.beginOperation("complete-run", "Close Session", ["record closeout", "save point"]);
      try {
        await deps.submitWorkflowEvent(paths, {
          kind: "session",
          operation: "completeLegacyRun",
          status: "started",
          runId,
          detail: "close legacy run",
          metadata: {
            force: forceClose,
            blockers: prBlockers,
          },
        });

        deps.operationStep("record closeout", `run ${runId}`);
        const store = openState(stateDir);
        let run = getRun(store, runId);
        try {
          if (!run) throw new Error(`Run not found: ${runId}`);
          if (run.status !== "completed") {
            run = updateRunStatus(store, runId, "completed", "ui");
            deps.appendLog("ui", `run ${runId} marked complete`);
          }
        } finally {
          store.db.close();
        }

        deps.operationStep("save point");
        const savePoint = await deps.boundarySavePoint(paths, "manual", "legacy run closeout");
        await deps.submitWorkflowEvent(paths, {
          kind: "session",
          operation: "completeLegacyRun",
          status: "completed",
          runId,
          detail: "legacy run closed",
          metadata: {
            force: forceClose,
            blockers: prBlockers,
            savePoint,
            run,
          },
        });
        deps.endOperation();
        return {
          completed: true,
          project: paths.project ? deps.projectToSummary(paths.project) : null,
          repoRoot,
          stateDir,
          run,
          savePoint,
        };
      } catch (error) {
        await deps.submitWorkflowEvent(paths, {
          kind: "session",
          operation: "completeLegacyRun",
          status: "failed",
          runId,
          metadata: {
            force: forceClose,
            blockers: prBlockers,
            error: error instanceof Error ? error.message : String(error),
          },
        }).catch(() => null);
        deps.endOperation(error);
        throw error;
      }
    },

    async initRun(body): Promise<JsonObject> {
      const projectPaths = deps.resolveDashboardProject(body, { useDefaultProject: true });
      const projectSession = activeProjectSessionOrNull(projectPaths, body);
      const sessionRepoRoot = prepareSessionWorktreeRoot(projectPaths, projectSession);
      const init = initRunCommand(deps, { ...body, sessionRepoRoot });
      const { command } = init;
      const sessionUuid = stringValue(body.sessionUuid, stringValue(body.sessionId));
      await deps.submitWorkflowEvent(init, {
        kind: "run",
        operation: "prepare.startRun",
        status: "started",
        sessionId: sessionUuid || null,
        detail: "initialize run",
        metadata: {
          repoRoot: init.repoRoot,
          sessionRepoRoot,
          workerConfig: workerConfigFromBody(body, init.project?.dashboard),
        },
      });
      deps.appendLog("ui", `init-run started: ${command.join(" ")}`);
      try {
        const result = await deps.runCli(command);
        deps.appendLog("ui", `init-run exit=${result.exitCode}`);
        if (result.exitCode !== 0) {
          throw new Error(`init-run failed (${result.exitCode ?? "signal"}): ${result.stderr || result.stdout || "no output"}`);
        }
        const boundaryCommit = await withDispatchLease(
          init,
          {
            kind: "run",
            projectId: projectIdFromContext(projectPaths, body),
            reason: `commit initialized run for ${sessionUuid || "current session"}`,
            workflowId: `run-init:${sessionUuid || projectIdFromContext(projectPaths, body)}`,
          },
          async (_leaseId, revalidateLease) => commitBoundaryWorktree({
            message: "boundary(init): initialize run",
            repoRoot: init.repoRoot,
            revalidateLease,
            runGit: deps.runGit,
            stateDir: init.stateDir,
          }),
        );
        const savePoint = await deps.boundarySavePoint({ ...projectPaths, repoRoot: init.repoRoot }, "init");
        const activeRunId = latestRunId(init.stateDir);
        const payload = {
          project: init.project ? deps.projectToSummary(init.project) : null,
          command,
          repoRoot: init.repoRoot,
          parsed: parseCliJsonOutput(result.stdout),
          savePoint,
          boundaryCommit,
          activeRunId,
          ...result,
        };
        await deps.submitWorkflowEvent(init, {
          kind: "run",
          operation: "prepare.startRun",
          status: "completed",
          sessionId: sessionUuid || null,
          runId: activeRunId,
          detail: activeRunId ? `run ${activeRunId} initialized` : "run initialized",
          metadata: {
            repoRoot: init.repoRoot,
            workerConfig: workerConfigFromBody(body, init.project?.dashboard),
            savePoint,
            boundaryCommit,
          },
        });
        return payload;
      } catch (error) {
        await deps.submitWorkflowEvent(init, {
          kind: "run",
          operation: "prepare.startRun",
          status: "failed",
          sessionId: sessionUuid || null,
          metadata: {
            error: error instanceof Error ? error.message : String(error),
            repoRoot: init.repoRoot,
            workerConfig: workerConfigFromBody(body, init.project?.dashboard),
          },
        }).catch(() => null);
        throw error;
      }
    },

    async freshRun(): Promise<JsonObject> {
      throw new Error(
        "Legacy Fresh Run bootstrap is disabled because it performs sync and merged-PR knowledge intake after session creation. Create the session, then use the operator sync.start workflow.",
      );
    },

  };
}
