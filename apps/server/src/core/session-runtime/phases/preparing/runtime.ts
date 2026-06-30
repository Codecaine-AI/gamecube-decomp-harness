import { runningScheduling } from "@server/core/session-runtime/phases/running/process-command";
import { createRunCheckpoint, shipsInPr, type RunCheckpointResult } from "@server/core/session-runtime/phases/pr/checkpoint";
import { getRun, openState, updateRunStatus } from "@server/core/session-runtime/run-state";
import { projectSessionView, type PreparingPhaseState, type ProjectSessionPatch, type ProjectSessionView } from "@server/core/project-session";
import { getActiveProjectSession, getOrCreateActiveProjectSession, getProjectSessionBySelector, updateProjectSession } from "@server/core/project-session/store";
import { forceReportRun } from "@server/core/validation/report";
import { canonicalProcessName } from "@server/core/project-session/process-identity";
import type { ResolvedProject } from "@server/core/project-registry";
import { now as currentTime } from "@server/core/orchestrator-state";
import { completePreparing, setPreparingSubphase } from "./index.js";
import {
  boolValue,
  latestRunId,
  numberValue,
  parseCliJsonOutput,
  runFreshStep,
  serverJobPrefix,
  stringValue,
  type FreshRunStep,
  type GitSyncResult,
  type JsonObject,
  type PreparingRuntimeDeps,
  type PreparingRuntimeProjectContext,
  type PreparingRuntimeState,
} from "./runtime-shared.js";
import {
  refreshKnowledgeForPrepare,
  reportAgainstNewBaselineForPrepare,
  resetReportBaselineForPrepare,
  runGitIntakeForPrepare,
  runMergedPrIntakeForPrepare,
  runPrIndexForPrepare,
  scanPrIndexDebtForPrepare,
  pendingPrsFromDebt,
  prepareIntakeCounts,
  type PrepareIntakeItemState,
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

function ensureFreshProjectSession(paths: PreparingRuntimeProjectContext, body: JsonObject): ProjectSessionView | null {
  const projectId = projectIdFromContext(paths, body);
  if (!projectId) return null;
  const store = openState(paths.stateDir);
  try {
    const selector = projectSessionSelector(body, projectId);
    let record =
      getProjectSessionBySelector(store.db, selector) ??
      getOrCreateActiveProjectSession(store.db, {
        projectId,
        baseRef: paths.project?.baseRef ?? (stringValue(body.baseRef) || null),
        baseSha: stringValue(body.baseSha) || null,
      });
    if (record.phase !== "preparing") {
      throw new Error(`Cannot prepare a fresh run while project session ${record.session_uuid} is in ${record.phase} phase.`);
    }
    const at = currentTime();
    record = updateProjectSession(
      store.db,
      record.id,
      setPreparingSubphase(record, at, "sync_intake", {
        detail: "Checking upstream and syncing intake before baseline.",
      }),
      at,
    );
    return projectSessionView(record);
  } finally {
    store.db.close();
  }
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
    return projectSessionView(
      updateProjectSession(
        store.db,
        record.id,
        {
          ...setPreparingSubphase(record, at, subphase, { detail, data }),
          ...patch,
        },
        at,
      ),
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

function sessionMergedPrs(session: ProjectSessionView): number[] {
  const sync = session.phases.preparing.sync ?? {};
  const raw = Array.isArray(sync.mergedPrs) ? sync.mergedPrs : [];
  return raw.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0);
}

function prIndexDebtSummary(prIndexDebt: JsonObject): string {
  const status = stringValue(prIndexDebt.status);
  if (status !== "available") return status ? `PR index debt ${status}` : "PR index debt unknown";
  const pendingMerged = numberValue(prIndexDebt.pendingMergedAgentPrs, 0);
  const pendingTotal = numberValue(prIndexDebt.pendingAgentPrs, pendingMerged);
  const indexedMerged = numberValue(prIndexDebt.agentIndexedMergedPrs, 0);
  const knownMerged = numberValue(prIndexDebt.knownMergedPrs, 0);
  return `${pendingMerged} merged / ${pendingTotal} total PR(s) need agent indexing (${indexedMerged}/${knownMerged} merged indexed)`;
}

function retryableIntakePrs(session: ProjectSessionView): number[] {
  const items = Array.isArray(session.phases.preparing.intake?.items) ? session.phases.preparing.intake.items : [];
  return items
    .map((item) => (item && typeof item === "object" ? (item as JsonObject) : null))
    .filter((item): item is JsonObject => Boolean(item))
    .filter((item) => item.retryable === true || stringValue(item.status) === "failed")
    .map((item) => numberValue(item.pr, NaN))
    .filter((value) => Number.isInteger(value) && value > 0);
}

function gitSyncSummary(gitSync: GitSyncResult): string {
  const head = gitSync.afterRef ? gitSync.afterRef.slice(0, 10) : "unknown";
  if (gitSync.beforeRef && gitSync.beforeRef === gitSync.afterRef) {
    return `upstream unchanged at ${head}; ${gitSync.mergedPrs.length} newly discovered merged PR(s)`;
  }
  return `upstream at ${head}; ${gitSync.mergedPrs.length} newly discovered merged PR(s)`;
}

function prepareMainWorktreeRoot(paths: PreparingRuntimeProjectContext, session: ProjectSessionView): string {
  return stringValue(session.phases.preparing.sync?.upstreamWorktreePath, stringValue(session.phases.preparing.sync?.mainWorktreePath, paths.repoRoot));
}

function prepareSessionWorktreeRoot(paths: PreparingRuntimeProjectContext, session: ProjectSessionView | null): string {
  return stringValue(
    session?.phases.preparing.sync?.sessionCurrentWorktreePath,
    stringValue(session?.phases.preparing.sync?.sessionWorktreePath, paths.repoRoot),
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
    agentTimeoutSeconds: numberValue(body.agentTimeoutSeconds, numberValue(dashboard?.agentTimeoutSeconds, 3000)),
    toolConcurrency: body.toolConcurrency && typeof body.toolConcurrency === "object" ? body.toolConcurrency : undefined,
  };
}

function completeFreshProjectSession(paths: PreparingRuntimeProjectContext, body: JsonObject, session: ProjectSessionView | null, activeRunId: string, completion: JsonObject): ProjectSessionView | null {
  const projectId = projectIdFromContext(paths, body);
  if (!projectId || !session) return null;
  const store = openState(paths.stateDir);
  try {
    const selector = projectSessionSelector({ ...body, sessionUuid: session.sessionUuid }, projectId);
    const record = getProjectSessionBySelector(store.db, selector);
    if (!record) return null;
    const at = currentTime();
    const patch = completePreparing(record, at, completion);
    patch.active_run_id = activeRunId || record.active_run_id;
    return projectSessionView(updateProjectSession(store.db, record.id, patch, at));
  } finally {
    store.db.close();
  }
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
    "init-run",
    "--desired-workers",
    String(maxWorkers),
    "--epoch-size",
    stringValue(body.epochSize, project?.dashboard.epochSize == null ? "64" : String(project.dashboard.epochSize)),
    "--goal-kind",
    stringValue(body.goalKind, "matched_code_percent"),
    "--goal-value",
    String(project?.dashboard.goalValue ?? numberValue(body.goalValue, 100)),
    "--graph-db",
    graphDbPath,
  ];
  return { command, repoRoot, stateDir, graphDbPath, project };
}

async function runSyncMergedPrIntakeForPrepare(
  deps: PreparingRuntimeDeps,
  paths: PreparingRuntimeProjectContext,
  dryRunAgents: boolean,
): Promise<GitSyncResult> {
  const gitSync = await runGitIntakeForPrepare(deps, paths);
  const prIndex = await runPrIndexForPrepare(deps, paths, gitSync.mergedPrs, dryRunAgents);
  gitSync.steps.push(...prIndex.steps.map((step) => ({ ...step })));
  return gitSync;
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
  syncMergedPrIntakeForPrepare: (paths: PreparingRuntimeProjectContext, dryRunAgents: boolean) => Promise<GitSyncResult>;
  syncProjectIntake: (body: JsonObject) => Promise<JsonObject>;
} {
  const runReport = deps.runReport ?? forceReportRun;
  let freshRunActive = false;
  let projectSyncActive = false;

  return {
    state: () => ({ freshRunActive, projectSyncActive }),

    initRunCommand: (body) => initRunCommand(deps, body),

    async syncGitForPrepare(body): Promise<JsonObject> {
      if (projectSyncActive) {
        throw new Error("GitHub sync is already running. Wait for it to finish before starting another sync.");
      }
      projectSyncActive = true;
      const paths = deps.resolveDashboardProject(body, { useDefaultProject: true });
      try {
        const projectSession = activePreparingProjectSession(paths, body);
        assertPrepareActionAllowed(deps, paths);
        deps.beginOperation("prepare-sync-git", "Sync GitHub", ["fetch upstream", "update upstream current", "prepare session current", "discover merged PRs"]);
        let session = updateFreshProjectSessionSubphase(
          paths,
          body,
          projectSession,
          "sync_intake",
          "Fetching upstream and preparing session current.",
          {
            sync: {
              status: "active",
              startedAt: new Date().toISOString(),
            },
          },
        );
        await deps.submitWorkflowEvent(paths, {
          kind: "sync-intake",
          operation: "prepare.syncGitHub",
          status: "started",
          sessionId: projectSession.sessionUuid,
          detail: paths.project?.baseRef ?? "origin/master",
        });
        deps.appendLog("ui", `prepare git sync started for ${paths.project?.baseRef ?? "origin/master"} in session ${projectSession.sessionUuid}`);
        try {
          const gitSync = await runGitIntakeForPrepare(deps, paths, projectSession.sessionUuid);
          const gitDetail = gitSyncSummary(gitSync);
          deps.appendLog("ui", `prepare git sync complete: ${gitDetail}`);
          await deps.submitWorkflowEvent(paths, {
            kind: "sync-intake",
            operation: "prepare.syncGitHub.git",
            status: "completed",
            sessionId: projectSession.sessionUuid,
            detail: gitDetail,
            metadata: {
              afterRef: gitSync.afterRef,
              baseRef: gitSync.baseRef,
              beforeRef: gitSync.beforeRef,
              branch: gitSync.branch,
              mainWorktreePath: gitSync.mainWorktreePath,
              mergedPrs: gitSync.mergedPrs,
              sessionBranch: gitSync.sessionBranch,
              sessionCurrentWorktreePath: gitSync.sessionCurrentWorktreePath,
              sessionRootPath: gitSync.sessionRootPath,
              sessionWorktreePath: gitSync.sessionWorktreePath,
              upstreamWorktreePath: gitSync.upstreamWorktreePath,
            },
          });
          const prIndexDebt = scanPrIndexDebtForPrepare(deps, paths, gitSync.mergedPrs);
          const prIndexDebtDetail = prIndexDebtSummary(prIndexDebt);
          deps.appendLog("ui", `prepare PR index debt: ${prIndexDebtDetail}`);
          await deps.submitWorkflowEvent(paths, {
            kind: "sync-intake",
            operation: "prepare.syncGitHub.prIndexDebt",
            status: "completed",
            sessionId: projectSession.sessionUuid,
            detail: prIndexDebtDetail,
            metadata: {
              mergedPrs: gitSync.mergedPrs,
              prIndexDebt,
            },
          });
          const completedAt = new Date().toISOString();
          session = updateFreshProjectSessionSubphase(
            paths,
            body,
            session,
            "sync_intake",
            gitSync.mergedPrs.length > 0
              ? `${gitSync.mergedPrs.length} merged PR(s) discovered. ${prIndexDebtDetail}.`
              : `Upstream worktree is current; no newly merged PRs discovered. ${prIndexDebtDetail}.`,
            {
              sync: {
                ...gitSync,
                prIndexDebt,
                status: "complete",
                completedAt,
              },
            },
            {
              base_sha: gitSync.afterRef || null,
            },
          );
          await deps.submitWorkflowEvent(paths, {
            kind: "sync-intake",
            operation: "prepare.syncGitHub",
            status: "completed",
            sessionId: projectSession.sessionUuid,
            detail:
              gitSync.beforeRef === gitSync.afterRef
                ? `upstream worktree already current; ${prIndexDebtDetail}`
                : `${gitSync.mergedPrs.length} merged PR(s) discovered; ${prIndexDebtDetail}`,
            metadata: {
              afterRef: gitSync.afterRef,
              baseRef: gitSync.baseRef,
              beforeRef: gitSync.beforeRef,
              branch: gitSync.branch,
              mainWorktreePath: gitSync.mainWorktreePath,
              mergedPrs: gitSync.mergedPrs,
              prIndexDebt,
              sessionBranch: gitSync.sessionBranch,
              sessionCurrentWorktreePath: gitSync.sessionCurrentWorktreePath,
              sessionRootPath: gitSync.sessionRootPath,
              sessionWorktreePath: gitSync.sessionWorktreePath,
              steps: gitSync.steps,
              upstreamWorktreePath: gitSync.upstreamWorktreePath,
            },
          });
          deps.endOperation();
          return {
            synced: true,
            project: paths.project ? deps.projectToSummary(paths.project) : null,
            projectSession: session,
            repoRoot: paths.repoRoot,
            stateDir: paths.stateDir,
            ...gitSync,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          session = updateFreshProjectSessionSubphase(
            paths,
            body,
            session,
            "sync_intake",
            `Git sync failed: ${message}`,
            {
              sync: {
                ...(session?.phases.preparing.sync ?? {}),
                status: "failed",
                failedAt: new Date().toISOString(),
                error: message,
              },
            },
          );
          await deps.submitWorkflowEvent(paths, {
            kind: "sync-intake",
            operation: "prepare.syncGitHub",
            status: "failed",
            sessionId: projectSession.sessionUuid,
            metadata: {
              error: message,
            },
          }).catch(() => null);
          throw error;
        }
      } catch (error) {
        deps.endOperation(error);
        throw error;
      } finally {
        projectSyncActive = false;
      }
    },

    async indexPrsForPrepare(body): Promise<JsonObject> {
      if (freshRunActive) {
        throw new Error("PR intake is already running. Wait for it to finish before starting another intake.");
      }
      freshRunActive = true;
      const paths = deps.resolveDashboardProject(body, { useDefaultProject: true });
      try {
        const projectSession = activePreparingProjectSession(paths, body);
        const syncStatus = stringValue(projectSession.phases.preparing.sync?.status);
        if (syncStatus !== "complete" && !projectSession.phases.preparing.sync?.completedAt) {
          throw new Error("Run Sync GitHub before starting PR intake.");
        }
        const mergedPrs = sessionMergedPrs(projectSession);
        const dryRunAgents = boolValue(body.dryRunAgents);
        const steps: FreshRunStep[] = [];
        assertPrepareActionAllowed(deps, paths);
        const prIndexDebtBefore = scanPrIndexDebtForPrepare(deps, paths, mergedPrs);
        const prIndexDebtBeforeDetail = prIndexDebtSummary(prIndexDebtBefore);
        const retryPrs = retryableIntakePrs(projectSession);
        const intakePrs = pendingPrsFromDebt(prIndexDebtBefore, [...mergedPrs, ...retryPrs]);
        let intakeItems: PrepareIntakeItemState[] = intakePrs.map((pr) => ({
          pr,
          status: "pending",
          retryable: false,
          postmortemStatus: "pending",
          knowledgeStatus: "pending",
        }));
        let intakeItemCounts = prepareIntakeCounts(intakeItems);
        deps.appendLog("ui", `prepare PR index before intake: ${prIndexDebtBeforeDetail}`);
        deps.beginOperation("prepare-pr-index", "PR Intake", ["PR intake agents", "sync missing PRs", "refresh knowledge"]);
        let session = updateFreshProjectSessionSubphase(
          paths,
          body,
          projectSession,
          "processing_prs",
          `Indexing merged and missing PR records. ${prIndexDebtBeforeDetail}.`,
          {
            intake: {
              intakePrs,
              items: intakeItems,
              itemCounts: intakeItemCounts,
              mergedPrs,
              prIndexDebtBefore,
              retryPrs,
              status: "active",
              startedAt: new Date().toISOString(),
            },
          },
        );
        await deps.submitWorkflowEvent(paths, {
          kind: "intake",
          operation: "prepare.indexPrs",
          status: "started",
          sessionId: projectSession.sessionUuid,
          detail: `${intakePrs.length} PR intake item(s); ${prIndexDebtBeforeDetail}`,
          metadata: { intakePrs, itemCounts: intakeItemCounts, mergedPrs, prIndexDebtBefore, retryPrs },
        });
        try {
          const persistIntakeItems = async (items: PrepareIntakeItemState[], counts = prepareIntakeCounts(items)): Promise<void> => {
            intakeItems = items;
            intakeItemCounts = counts;
            session = updateFreshProjectSessionSubphase(
              paths,
              body,
              session,
              "processing_prs",
              `PR intake running: ${counts.complete}/${counts.total} complete, ${counts.failed} failed.`,
              {
                intake: {
                  ...(session?.phases.preparing.intake ?? {}),
                  intakePrs,
                  items: intakeItems,
                  itemCounts: intakeItemCounts,
                  mergedPrs,
                  prIndexDebtBefore,
                  retryPrs,
                  status: "active",
                },
              },
            );
          };
          const prIndex = await runPrIndexForPrepare(deps, paths, mergedPrs, dryRunAgents, projectSession.sessionUuid, {
            intakePrs,
            onItemsChange: persistIntakeItems,
          });
          const prIndexDebtAfter = scanPrIndexDebtForPrepare(deps, paths, mergedPrs);
          const prIndexDebtAfterDetail = prIndexDebtSummary(prIndexDebtAfter);
          deps.appendLog("ui", `prepare PR index after intake: ${prIndexDebtAfterDetail}`);
          steps.push(...prIndex.steps);
          if (prIndex.failed) {
            session = updateFreshProjectSessionSubphase(
              paths,
              body,
              session,
              "processing_prs",
              `PR intake failed for ${prIndex.counts.failed} item(s); retryable items remain visible.`,
              {
                intake: {
                  ...prIndex.metadata,
                  intakePrs,
                  items: prIndex.items,
                  itemCounts: prIndex.counts,
                  prIndexDebtBefore,
                  prIndexDebtAfter,
                  retryPrs,
                  status: "failed",
                  failedAt: new Date().toISOString(),
                },
              },
            );
            await deps.submitWorkflowEvent(paths, {
              kind: "intake",
              operation: "prepare.indexPrs",
              status: "failed",
              sessionId: projectSession.sessionUuid,
              detail: `${prIndex.counts.failed} PR intake item(s) failed`,
              metadata: { ...prIndex.metadata, prIndexDebtBefore, prIndexDebtAfter },
            });
            throw new Error(`${prIndex.counts.failed} PR intake item(s) failed and can be retried.`);
          }
          const completedAt = new Date().toISOString();
          session = updateFreshProjectSessionSubphase(
            paths,
            body,
            session,
            "knowledge_refresh",
            "Refreshing the knowledge graph after PR intake.",
            {
              intake: {
                ...prIndex.metadata,
                intakePrs,
                items: prIndex.items,
                itemCounts: prIndex.counts,
                prIndexDebtBefore,
                prIndexDebtAfter,
                retryPrs,
                status: "complete",
                completedAt,
                steps: prIndex.steps,
              },
            },
          );
          await deps.submitWorkflowEvent(paths, {
            kind: "intake",
            operation: "prepare.indexPrs",
            status: "completed",
            sessionId: projectSession.sessionUuid,
            detail: `${prIndex.counts.complete} PR intake item(s) complete`,
            metadata: { ...prIndex.metadata, prIndexDebtBefore, prIndexDebtAfter },
          });
          await deps.submitWorkflowEvent(paths, {
            kind: "intake",
            operation: "prepare.indexPrs.prIndexDebt",
            status: "completed",
            sessionId: projectSession.sessionUuid,
            detail: prIndexDebtAfterDetail,
            metadata: { prIndexDebtBefore, prIndexDebtAfter },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          session = updateFreshProjectSessionSubphase(
            paths,
            body,
            session,
            "processing_prs",
            `PR intake failed: ${message}`,
            {
              intake: {
                ...(session?.phases.preparing.intake ?? {}),
                intakePrs,
                items: intakeItems,
                itemCounts: intakeItemCounts,
                retryPrs,
                status: "failed",
                failedAt: new Date().toISOString(),
                error: message,
              },
            },
          );
          await deps.submitWorkflowEvent(paths, {
            kind: "intake",
            operation: "prepare.indexPrs",
            status: "failed",
            sessionId: projectSession.sessionUuid,
            metadata: {
              error: message,
            },
          }).catch(() => null);
          throw error;
        }

        await deps.submitWorkflowEvent(paths, {
          kind: "knowledge-refresh",
          operation: "prepare.refreshKnowledge",
          status: "started",
          sessionId: projectSession.sessionUuid,
          detail: "refresh knowledge graph",
        });
        try {
          const knowledgeStep = await refreshKnowledgeForPrepare(deps, steps, paths);
          session = updateFreshProjectSessionSubphase(
            paths,
            body,
            session,
            "baseline",
            "PR intake and knowledge refresh are complete. Calculate the baseline next.",
            {
              knowledge: {
                ...knowledgeStep,
                status: "complete",
                completedAt: new Date().toISOString(),
              },
            },
          );
          await deps.submitWorkflowEvent(paths, {
            kind: "knowledge-refresh",
            operation: "prepare.refreshKnowledge",
            status: "completed",
            sessionId: projectSession.sessionUuid,
            detail: "knowledge graph refreshed",
            metadata: knowledgeStep,
          });
          deps.endOperation();
          return {
            indexed: true,
            project: paths.project ? deps.projectToSummary(paths.project) : null,
            projectSession: session,
            repoRoot: paths.repoRoot,
            stateDir: paths.stateDir,
            mergedPrs,
            steps,
            knowledge: knowledgeStep,
          };
        } catch (error) {
          await deps.submitWorkflowEvent(paths, {
            kind: "knowledge-refresh",
            operation: "prepare.refreshKnowledge",
            status: "failed",
            sessionId: projectSession.sessionUuid,
            metadata: {
              error: error instanceof Error ? error.message : String(error),
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
          if (run.status !== "complete") {
            run = updateRunStatus(store, runId, "complete", "ui");
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
        const savePoint = await deps.boundarySavePoint({ ...projectPaths, repoRoot: init.repoRoot }, "init");
        const activeRunId = latestRunId(init.stateDir);
        const payload = {
          project: init.project ? deps.projectToSummary(init.project) : null,
          command,
          repoRoot: init.repoRoot,
          parsed: parseCliJsonOutput(result.stdout),
          savePoint,
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

    async freshRun(body): Promise<JsonObject> {
      if (freshRunActive) {
        throw new Error("Fresh Run is already running. Wait for it to finish before starting another one.");
      }
      freshRunActive = true;
      const paths = deps.resolveDashboardProject(body, { useDefaultProject: true });
      const { repoRoot, stateDir } = paths;
      try {
        const name = canonicalProcessName(paths.project?.processName ?? stringValue(body.processName, "melee-live"));
        const active = deps.hasActiveProcess(stateDir);
        if (active.active) {
          const activeName = stringValue(active.name, name);
          throw new Error(`Stop the active process (${activeName}) before starting a fresh run.`);
        }
        const prBlockers = deps.activeSessionPrBlockers(stateDir);
        if (prBlockers.length > 0) {
          throw new Error(`Resolve this session's PR work before starting a fresh run: ${prBlockers.slice(0, 6).join("; ")}${prBlockers.length > 6 ? `; +${prBlockers.length - 6} more` : ""}`);
        }

        let projectSession = ensureFreshProjectSession(paths, body);
        const steps: FreshRunStep[] = [];
        const resetReportBaseline = body.resetReportBaseline !== false;
        const refreshPrLibrary = body.refreshPrLibrary !== false;
        const checkpointBeforeFresh = body.checkpointBeforeFresh !== false;
        const dryRunAgents = boolValue(body.dryRunAgents);
        let gitSync: GitSyncResult | null = null;
        let reportRunResult: JsonObject | null = null;
        let checkpointResult: JsonObject | null = null;
        deps.beginOperation("fresh", "New Session", [
          "checkpoint",
          "fetch upstream",
          "update upstream current",
          "prepare session current",
          "discover merged PRs",
          "PR intake agents",
          "knowledge graph rebuild",
          "reset report baseline",
          "init run",
          "report against new baseline",
          "sync missing PRs",
          "refresh knowledge",
          "save point",
        ]);
        await deps.submitWorkflowEvent(paths, {
          kind: "prepare",
          operation: "prepareSession",
          status: "started",
          detail: "prepare session",
          metadata: {
            baseRef: paths.project?.baseRef ?? "origin/master",
          },
        });

        if (checkpointBeforeFresh) {
          const runId = stringValue(body.runId) || latestRunId(stateDir);
          if (runId) {
            deps.operationStep("checkpoint", `run ${runId}`);
            deps.appendLog("ui", `fresh checkpoint started for run ${runId}`);
            const store = openState(stateDir);
            try {
              checkpointResult = compactCheckpointResult(
                createRunCheckpoint(store, runId, {
                  improvementPromotion: {
                    minGainPoints: paths.project?.pr.improvementMinGainPoints,
                    minMatchedBytes: paths.project?.pr.improvementMinMatchedBytes,
                  },
                  title: "Fresh run checkpoint",
                }),
              );
            } finally {
              store.db.close();
            }
            deps.appendLog("ui", `fresh checkpoint complete for run ${runId}`);
          }
        }

        projectSession = updateFreshProjectSessionSubphase(
          paths,
          body,
          projectSession,
          "sync_intake",
          "Checking upstream and discovering merged PR intake.",
        );
        await deps.submitWorkflowEvent(paths, {
          kind: "sync-intake",
          operation: "freshRun.syncUpstream",
          status: "started",
          detail: paths.project?.baseRef ?? "origin/master",
        });
        try {
          gitSync = await runGitIntakeForPrepare(deps, paths, projectSession?.sessionUuid ?? "");
          await deps.submitWorkflowEvent(paths, {
            kind: "sync-intake",
            operation: "freshRun.syncUpstream",
            status: "completed",
            detail:
              gitSync.beforeRef === gitSync.afterRef
                ? "checkout already current; no newly merged PRs"
                : `${gitSync.mergedPrs.length} merged PR(s) discovered`,
            metadata: {
              afterRef: gitSync.afterRef,
              baseRef: gitSync.baseRef,
              beforeRef: gitSync.beforeRef,
              branch: gitSync.branch,
              mainWorktreePath: gitSync.mainWorktreePath,
              mergedPrs: gitSync.mergedPrs,
              sessionBranch: gitSync.sessionBranch,
              sessionCurrentWorktreePath: gitSync.sessionCurrentWorktreePath,
              sessionRootPath: gitSync.sessionRootPath,
              sessionWorktreePath: gitSync.sessionWorktreePath,
              steps: gitSync.steps,
              upstreamWorktreePath: gitSync.upstreamWorktreePath,
            },
          });
        } catch (error) {
          await deps.submitWorkflowEvent(paths, {
            kind: "sync-intake",
            operation: "freshRun.syncUpstream",
            status: "failed",
            metadata: {
              error: error instanceof Error ? error.message : String(error),
            },
          }).catch(() => null);
          throw error;
        }

        const currentGitSync = gitSync;
        const prepareContextId = projectSession?.sessionUuid ?? stringValue(body.sessionUuid, stringValue(body.sessionId));
        const baselineReady = async (): Promise<JsonObject | null> => {
          if (!resetReportBaseline) return null;
          projectSession = updateFreshProjectSessionSubphase(
            paths,
            body,
            projectSession,
            "baseline",
            "Resetting baseline while PR intake catches up.",
          );
          await deps.submitWorkflowEvent(paths, {
            kind: "baseline",
            operation: "freshRun.resetReportBaseline",
            status: "started",
            detail: "reset report baseline",
          });
          try {
            const result = await resetReportBaselineForPrepare(deps, runReport, repoRoot, {
              stateDir,
              projectId: paths.project?.projectId ?? projectIdFromContext(paths, body) ?? null,
              sessionUuid: prepareContextId || null,
              boardKey: "baseline",
              trustedReportKey: "baseline",
              reportRunKey: "fresh_baseline_reset",
            });
            await deps.submitWorkflowEvent(paths, {
              kind: "baseline",
              operation: "freshRun.resetReportBaseline",
              status: "completed",
              detail: "report baseline reset",
              metadata: result,
            });
            return result;
          } catch (error) {
            await deps.submitWorkflowEvent(paths, {
              kind: "baseline",
              operation: "freshRun.resetReportBaseline",
              status: "failed",
              metadata: {
                error: error instanceof Error ? error.message : String(error),
              },
            }).catch(() => null);
            throw error;
          }
        };

        const prAndKnowledgeReady = async (): Promise<void> => {
          if (!refreshPrLibrary) return;
          const prIndexDebtBefore = scanPrIndexDebtForPrepare(deps, paths, currentGitSync.mergedPrs);
          const prIndexDebtBeforeDetail = prIndexDebtSummary(prIndexDebtBefore);
          const retryPrs = projectSession ? retryableIntakePrs(projectSession) : [];
          const intakePrs = pendingPrsFromDebt(prIndexDebtBefore, [...currentGitSync.mergedPrs, ...retryPrs]);
          let intakeItems: PrepareIntakeItemState[] = intakePrs.map((pr) => ({
            pr,
            status: "pending",
            retryable: false,
            postmortemStatus: "pending",
            knowledgeStatus: "pending",
          }));
          let intakeItemCounts = prepareIntakeCounts(intakeItems);
          projectSession = updateFreshProjectSessionSubphase(
            paths,
            body,
            projectSession,
            "processing_prs",
            `Indexing merged and missing PR records. ${prIndexDebtBeforeDetail}.`,
            {
              intake: {
                intakePrs,
                items: intakeItems,
                itemCounts: intakeItemCounts,
                mergedPrs: currentGitSync.mergedPrs,
                prIndexDebtBefore,
                retryPrs,
                status: "active",
                startedAt: new Date().toISOString(),
              },
            },
          );
          await deps.submitWorkflowEvent(paths, {
            kind: "intake",
            operation: "freshRun.indexPrKnowledge",
            status: "started",
            detail: `${intakePrs.length} PR intake item(s); ${prIndexDebtBeforeDetail}`,
            metadata: { intakePrs, itemCounts: intakeItemCounts, mergedPrs: currentGitSync.mergedPrs, prIndexDebtBefore, retryPrs },
          });
          try {
            const persistIntakeItems = async (items: PrepareIntakeItemState[], counts = prepareIntakeCounts(items)): Promise<void> => {
              intakeItems = items;
              intakeItemCounts = counts;
              projectSession = updateFreshProjectSessionSubphase(
                paths,
                body,
                projectSession,
                "processing_prs",
                `PR intake running: ${counts.complete}/${counts.total} complete, ${counts.failed} failed.`,
                {
                  intake: {
                    ...(projectSession?.phases.preparing.intake ?? {}),
                    intakePrs,
                    items: intakeItems,
                    itemCounts: intakeItemCounts,
                    mergedPrs: currentGitSync.mergedPrs,
                    prIndexDebtBefore,
                    retryPrs,
                    status: "active",
                  },
                },
              );
            };
            const prIndex = await runPrIndexForPrepare(deps, paths, currentGitSync.mergedPrs, dryRunAgents, prepareContextId, {
              intakePrs,
              onItemsChange: persistIntakeItems,
            });
            const prIndexDebtAfter = scanPrIndexDebtForPrepare(deps, paths, currentGitSync.mergedPrs);
            steps.push(...prIndex.steps);
            if (prIndex.failed) {
              projectSession = updateFreshProjectSessionSubphase(
                paths,
                body,
                projectSession,
                "processing_prs",
                `PR intake failed for ${prIndex.counts.failed} item(s); retryable items remain visible.`,
                {
                  intake: {
                    ...prIndex.metadata,
                    intakePrs,
                    items: prIndex.items,
                    itemCounts: prIndex.counts,
                    prIndexDebtBefore,
                    prIndexDebtAfter,
                    retryPrs,
                    status: "failed",
                    failedAt: new Date().toISOString(),
                  },
                },
              );
              await deps.submitWorkflowEvent(paths, {
                kind: "intake",
                operation: "freshRun.indexPrKnowledge",
                status: "failed",
                detail: `${prIndex.counts.failed} PR intake item(s) failed`,
                metadata: { ...prIndex.metadata, prIndexDebtBefore, prIndexDebtAfter },
              });
              throw new Error(`${prIndex.counts.failed} PR intake item(s) failed and can be retried.`);
            }
            projectSession = updateFreshProjectSessionSubphase(
              paths,
              body,
              projectSession,
              "processing_prs",
              "PR intake records indexed.",
              {
                intake: {
                  ...prIndex.metadata,
                  intakePrs,
                  items: prIndex.items,
                  itemCounts: prIndex.counts,
                  prIndexDebtBefore,
                  prIndexDebtAfter,
                  retryPrs,
                  status: "complete",
                  completedAt: new Date().toISOString(),
                  steps: prIndex.steps,
                },
              },
            );
            await deps.submitWorkflowEvent(paths, {
              kind: "intake",
              operation: "freshRun.indexPrKnowledge",
              status: "completed",
              detail: `${prIndex.counts.complete} PR intake item(s) complete`,
              metadata: { ...prIndex.metadata, prIndexDebtBefore, prIndexDebtAfter },
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            projectSession = updateFreshProjectSessionSubphase(
              paths,
              body,
              projectSession,
              "processing_prs",
              `PR intake failed: ${message}`,
              {
                intake: {
                  ...(projectSession?.phases.preparing.intake ?? {}),
                  intakePrs,
                  items: intakeItems,
                  itemCounts: intakeItemCounts,
                  retryPrs,
                  status: "failed",
                  failedAt: new Date().toISOString(),
                  error: message,
                },
              },
            );
            await deps.submitWorkflowEvent(paths, {
              kind: "intake",
              operation: "freshRun.indexPrKnowledge",
              status: "failed",
              metadata: {
                error: message,
              },
            }).catch(() => null);
            throw error;
          }

          projectSession = updateFreshProjectSessionSubphase(
            paths,
            body,
            projectSession,
            "knowledge_refresh",
            "Refreshing the knowledge graph after PR intake.",
          );
          await deps.submitWorkflowEvent(paths, {
            kind: "knowledge-refresh",
            operation: "freshRun.refreshKnowledge",
            status: "started",
            detail: "refresh knowledge graph",
          });
          try {
            const knowledgeStep = await refreshKnowledgeForPrepare(deps, steps, paths);
            await deps.submitWorkflowEvent(paths, {
              kind: "knowledge-refresh",
              operation: "freshRun.refreshKnowledge",
              status: "completed",
              detail: "knowledge graph refreshed",
              metadata: knowledgeStep,
            });
          } catch (error) {
            await deps.submitWorkflowEvent(paths, {
              kind: "knowledge-refresh",
              operation: "freshRun.refreshKnowledge",
              status: "failed",
              metadata: {
                error: error instanceof Error ? error.message : String(error),
              },
            }).catch(() => null);
            throw error;
          }
        };

        const [baselineResult] = await Promise.all([baselineReady(), prAndKnowledgeReady()]);
        if (baselineResult) reportRunResult = baselineResult;

        deps.operationStep("init run");
        const init = initRunCommand(deps, { ...body, repoRoot, stateDir });
        await runFreshStep(deps, steps, "init-run", init.command, deps.packageRoot);
        const activeRunId = latestRunId(stateDir);

        if (resetReportBaseline) {
          projectSession = updateFreshProjectSessionSubphase(
            paths,
            body,
            projectSession,
            "baseline",
            "Reporting against the new baseline.",
          );
          await deps.submitWorkflowEvent(paths, {
            kind: "baseline",
            operation: "freshRun.reportAgainstNewBaseline",
            status: "started",
            detail: "report against new baseline",
          });
          try {
            reportRunResult = await reportAgainstNewBaselineForPrepare(deps, runReport, repoRoot, {
              stateDir,
              runId: activeRunId || null,
              projectId: paths.project?.projectId ?? projectIdFromContext(paths, body) ?? null,
              sessionUuid: prepareContextId || null,
              boardKey: "current",
              trustedReportKey: "current",
              reportRunKey: "fresh_report",
            });
            await deps.submitWorkflowEvent(paths, {
              kind: "baseline",
              operation: "freshRun.reportAgainstNewBaseline",
              status: "completed",
              detail: "baseline report refreshed",
              metadata: reportRunResult,
            });
          } catch (error) {
            await deps.submitWorkflowEvent(paths, {
              kind: "baseline",
              operation: "freshRun.reportAgainstNewBaseline",
              status: "failed",
              metadata: {
                error: error instanceof Error ? error.message : String(error),
              },
            }).catch(() => null);
            throw error;
          }
        }
        deps.operationStep("save point");
        const savePoint = await deps.boundarySavePoint(paths, "fresh");
        projectSession = completeFreshProjectSession(paths, body, projectSession, activeRunId, {
          checkpoint: checkpointResult,
          gitSync,
          reportRun: reportRunResult,
          refreshPrLibrary,
          resetReportBaseline,
          savePoint,
          steps,
        });
        await deps.submitWorkflowEvent(paths, {
          kind: "prepare",
          operation: "prepareSession",
          status: "completed",
          detail: "session ready",
          metadata: {
            activeRunId,
            gitSync,
            refreshPrLibrary,
            resetReportBaseline,
            savePoint,
          },
        });
        deps.endOperation();
        return {
          fresh: true,
          project: paths.project ? deps.projectToSummary(paths.project) : null,
          projectSession,
          repoRoot,
          stateDir,
          activeRunId,
          gitSync,
          refreshPrLibrary,
          resetReportBaseline,
          checkpointBeforeFresh,
          checkpoint: checkpointResult,
          reportRun: reportRunResult,
          savePoint,
          steps,
        };
      } catch (error) {
        await deps.submitWorkflowEvent(paths, {
          kind: "prepare",
          operation: "prepareSession",
          status: "failed",
          metadata: {
            error: error instanceof Error ? error.message : String(error),
          },
        }).catch(() => null);
        deps.endOperation(error);
        throw error;
      } finally {
        freshRunActive = false;
      }
    },

    async syncMergedPrIntakeForPrepare(paths, dryRunAgents): Promise<GitSyncResult> {
      return runSyncMergedPrIntakeForPrepare(deps, paths, dryRunAgents);
    },

    async syncProjectIntake(body): Promise<JsonObject> {
      if (projectSyncActive) {
        throw new Error("Fetch & Re-sync is already running. Wait for it to finish before starting another sync.");
      }
      projectSyncActive = true;
      const paths = deps.resolveDashboardProject(body, { useDefaultProject: true });
      const { repoRoot, stateDir } = paths;
        deps.beginOperation("sync", "Sync Merged PRs", ["fetch upstream", "update upstream current", "discover merged PRs", "PR intake agents", "knowledge graph rebuild", "save point"]);
      try {
        const active = deps.hasActiveProcess(stateDir);
        if (active.active) {
          const activeName = stringValue(active.name, paths.project?.processName ?? "melee-live");
          throw new Error(`Stop the active process (${activeName}) before fetching and re-syncing.`);
        }
        const runId = latestRunId(stateDir);
        if (runId) {
          const store = openState(stateDir);
          try {
            const run = getRun(store, runId);
            if (run && run.status === "active") {
              throw new Error(
                `Run ${run.id} is active. Sync is hard-locked while a run is active because pulling upstream invalidates the run baseline. Pause intake (PR handoff) or complete the run first.`,
              );
            }
          } finally {
            store.db.close();
          }
        }

        await deps.submitWorkflowEvent(paths, {
          kind: "sync-intake",
          operation: "syncProjectIntake",
          status: "started",
          detail: paths.project?.baseRef ?? "origin/master",
        });
        const gitSync = await runGitIntakeForPrepare(deps, paths);
        if (gitSync.mergedPrs.length === 0) {
          deps.appendLog("ui", "merged PR intake skipped: no newly merged PRs found after git sync");
          deps.operationStep("save point", "no newly merged PRs; intake skipped");
          const skippedSavePoint = await deps.boundarySavePoint(paths, "sync", `sync ${gitSync.afterRef ?? ""}`.trim());
          await deps.submitWorkflowEvent(paths, {
            kind: "sync-intake",
            operation: "syncProjectIntake",
            status: "skipped",
            detail: "no newly merged PRs",
            metadata: {
              beforeRef: gitSync.beforeRef,
              afterRef: gitSync.afterRef,
              branch: gitSync.branch,
              mergedPrs: [],
            },
          });
          deps.endOperation();
          return {
            synced: true,
            skippedIntake: true,
            savePoint: skippedSavePoint,
            reason: "no_newly_merged_prs",
            project: paths.project ? deps.projectToSummary(paths.project) : null,
            repoRoot,
            stateDir,
            beforeRef: gitSync.beforeRef,
            afterRef: gitSync.afterRef,
            branch: gitSync.branch,
            mergedPrs: [],
            steps: gitSync.steps,
            createdAt: new Date().toISOString(),
          };
        }

        await deps.submitWorkflowEvent(paths, {
          kind: "pr-index",
          operation: "syncProjectIntake.indexMergedPrs",
          status: "started",
          detail: `${gitSync.mergedPrs.length} merged PR(s)`,
        });
        let intakeSteps: FreshRunStep[] = [];
        try {
          intakeSteps = await runMergedPrIntakeForPrepare(deps, paths, gitSync.mergedPrs, boolValue(body.dryRunAgents));
          await deps.submitWorkflowEvent(paths, {
            kind: "pr-index",
            operation: "syncProjectIntake.indexMergedPrs",
            status: "completed",
            detail: "merged PR postmortems indexed",
            metadata: {
              mergedPrs: gitSync.mergedPrs,
              steps: intakeSteps,
            },
          });
        } catch (error) {
          await deps.submitWorkflowEvent(paths, {
            kind: "pr-index",
            operation: "syncProjectIntake.indexMergedPrs",
            status: "failed",
            metadata: {
              error: error instanceof Error ? error.message : String(error),
            },
          }).catch(() => null);
          throw error;
        }
        const knowledgeSteps: FreshRunStep[] = [];
        await deps.submitWorkflowEvent(paths, {
          kind: "knowledge-refresh",
          operation: "syncProjectIntake.refreshKnowledge",
          status: "started",
          detail: "refresh knowledge graph",
        });
        try {
          const knowledgeStep = await refreshKnowledgeForPrepare(deps, knowledgeSteps, paths);
          await deps.submitWorkflowEvent(paths, {
            kind: "knowledge-refresh",
            operation: "syncProjectIntake.refreshKnowledge",
            status: "completed",
            detail: "knowledge graph refreshed",
            metadata: knowledgeStep,
          });
        } catch (error) {
          await deps.submitWorkflowEvent(paths, {
            kind: "knowledge-refresh",
            operation: "syncProjectIntake.refreshKnowledge",
            status: "failed",
            metadata: {
              error: error instanceof Error ? error.message : String(error),
            },
          }).catch(() => null);
          throw error;
        }
        deps.operationStep("save point");
        const syncSavePoint = await deps.boundarySavePoint(paths, "sync", `sync ${gitSync.afterRef ?? ""}`.trim());
        await deps.submitWorkflowEvent(paths, {
          kind: "sync-intake",
          operation: "syncProjectIntake",
          status: "completed",
          detail: `${gitSync.mergedPrs.length} merged PR(s) intaken`,
          metadata: {
            beforeRef: gitSync.beforeRef,
            afterRef: gitSync.afterRef,
            branch: gitSync.branch,
            mergedPrs: gitSync.mergedPrs,
          },
        });
        deps.endOperation();
        return {
          synced: true,
          savePoint: syncSavePoint,
          project: paths.project ? deps.projectToSummary(paths.project) : null,
          repoRoot,
          stateDir,
          beforeRef: gitSync.beforeRef,
          afterRef: gitSync.afterRef,
          branch: gitSync.branch,
          mergedPrs: gitSync.mergedPrs,
          steps: [...gitSync.steps, ...intakeSteps, ...knowledgeSteps],
          createdAt: new Date().toISOString(),
        };
      } catch (error) {
        await deps.submitWorkflowEvent(paths, {
          kind: "sync-intake",
          operation: "syncProjectIntake",
          status: "failed",
          metadata: {
            error: error instanceof Error ? error.message : String(error),
          },
        }).catch(() => null);
        deps.endOperation(error);
        throw error;
      } finally {
        projectSyncActive = false;
      }
    },
  };
}
