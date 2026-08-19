import { randomUUID } from "node:crypto";
import type { Database } from "bun:sqlite";
import { runningScheduling } from "@server/core/cycle-runtime/phases/running/process-command";
import { createRunCheckpoint, shipsInPr, type RunCheckpointResult } from "@server/core/cycle-runtime/phases/pr/checkpoint";
import { getRun, openState, updateRunStatus } from "@server/core/cycle-runtime/run-state";
import { cycleView, type PreparingPhaseState, type CyclePatch, type CycleRecord, type CycleView } from "@server/core/cycle";
import { getActiveCycle, getCycleBySelector, transitionCycle } from "@server/core/cycle/store";
import { forceReportRun } from "@server/core/validation/report";
import { canonicalProcessName } from "@server/core/cycle/process-identity";
import type { ResolvedGame } from "@server/core/game-registry";
import { now as currentTime } from "@server/core/orchestrator-state";
import { withDispatchLease } from "@server/core/cycle-runtime/dispatch-guard";
import {
  resolveGameEventTraceLinkage,
  type GameEventTraceLinkage,
} from "@server/core/harness-state/kernel-links.js";
import { commitBoundaryWorktree } from "@server/core/cycle-runtime/phases/pr/boundary-commit.js";
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
  type PreparingRuntimeGameContext,
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
  PreparingRuntimeGameContext,
  PreparingRuntimeState,
} from "./runtime-shared.js";

function gameIdFromContext(paths: PreparingRuntimeGameContext, body: JsonObject): string {
  return paths.game?.gameId ?? stringValue(body.gameId);
}

function traceLinkageForEvent(
  stateDir: string,
  gameId: string,
  gameEventId: string | null,
): GameEventTraceLinkage {
  if (!gameEventId) throw new Error("Workflow trace requires a persisted game event");
  const store = openState(stateDir);
  try {
    return resolveGameEventTraceLinkage(store.db, gameId, gameEventId);
  } finally {
    store.db.close();
  }
}

function runTraceLinkage(
  stateDir: string,
  gameId: string,
  runId: string,
): GameEventTraceLinkage | null {
  const store = openState(stateDir);
  try {
    const run = getRun(store, runId);
    return run?.causedByEventId
      ? resolveGameEventTraceLinkage(store.db, gameId, run.causedByEventId)
      : null;
  } finally {
    store.db.close();
  }
}

function cycleSelector(body: JsonObject, gameId: string): { id?: string | null; cycleUuid?: string | null; gameId?: string | null } {
  return {
    id: stringValue(body.id),
    cycleUuid: stringValue(body.cycleUuid, stringValue(body.cycle_uuid)),
    gameId,
  };
}

function acceptPreparingTransition(
  db: Database,
  record: CycleRecord,
  patch: CyclePatch,
  at: string,
): CycleView {
  const eventType = "cycle.preparing_subphase_updated" as const;
  if (patch.status !== undefined) {
    throw new Error(`${eventType} must preserve game cycle status`);
  }
  const { status: _status, ...progressPatch } = patch;
  return cycleView(
    transitionCycle(db, record.id, {
      actor: "runner",
      commandId: `command-${eventType.replaceAll(".", "-")}-${randomUUID()}`,
      correlationId: record.cycle_uuid,
      eventType,
      expectedRevision: record.revision,
      occurredAt: at,
      patch: progressPatch,
      payload: {
        previous_phase: record.phase,
        previous_status: record.status,
        phase: patch.phase ?? record.phase,
        status: patch.status ?? record.status,
        subphase: patch.preparing_state_json?.subphase ?? record.preparing_state_json.subphase,
      },
      gameId: record.game_id,
      cycleUuid: record.cycle_uuid,
    }),
  );
}

function activePreparingCycle(paths: PreparingRuntimeGameContext, body: JsonObject): CycleView {
  const gameId = gameIdFromContext(paths, body);
  if (!gameId) throw new Error("Game id is required for cycle preparation.");
  const store = openState(paths.stateDir);
  try {
    const selector = cycleSelector(body, gameId);
    const record = getCycleBySelector(store.db, selector) ?? getActiveCycle(store.db, gameId);
    if (!record) throw new Error("Create a game cycle before running preparation steps.");
    if (record.phase !== "preparing") {
      throw new Error(`Cannot run preparation while game cycle ${record.cycle_uuid} is in ${record.phase} phase.`);
    }
    return cycleView(record);
  } finally {
    store.db.close();
  }
}

function updateFreshCycleSubphase(
  paths: PreparingRuntimeGameContext,
  body: JsonObject,
  cycle: CycleView,
  subphase: PreparingPhaseState["subphase"],
  detail: string,
  data: Partial<PreparingPhaseState> = {},
  patch: Pick<CyclePatch, "active_run_id" | "base_sha"> = {},
): CycleView {
  const gameId = gameIdFromContext(paths, body);
  if (!gameId) return cycle;
  const store = openState(paths.stateDir);
  try {
    const selector = cycleSelector({ ...body, cycleUuid: cycle.cycleUuid }, gameId);
    const record = getCycleBySelector(store.db, selector);
    if (!record) return cycle;
    const at = currentTime();
    return acceptPreparingTransition(
      store.db,
      record,
      {
        ...setPreparingSubphase(record, at, subphase, { detail, data }),
        ...patch,
      },
      at,
    );
  } finally {
    store.db.close();
  }
}

function assertPrepareActionAllowed(deps: PreparingRuntimeDeps, paths: PreparingRuntimeGameContext): void {
  const active = deps.hasActiveProcess(paths.stateDir);
  if (active.active) {
    const activeName = stringValue(active.name, paths.game?.processName ?? "melee-live");
    throw new Error(`Stop the active process (${activeName}) before changing cycle preparation.`);
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

function prepareMainWorktreeRoot(paths: PreparingRuntimeGameContext, cycle: CycleView): string {
  return stringValue(cycle.phases.preparing.sync?.upstreamWorktreePath, paths.repoRoot);
}

function prepareCycleWorktreeRoot(paths: PreparingRuntimeGameContext, cycle: CycleView | null): string {
  const fallback = cycle
    ? prepareWorktreePaths(paths, cycle.cycleUuid).cycleCurrentWorktreePath
    : undefined;
  return stringValue(
    cycle?.phases.preparing.sync?.cycleCurrentWorktreePath,
    stringValue(cycle?.phases.preparing.sync?.cycleWorktreePath, fallback ?? paths.repoRoot),
  );
}

function activeCycleOrNull(paths: PreparingRuntimeGameContext, body: JsonObject): CycleView | null {
  const gameId = gameIdFromContext(paths, body);
  if (!gameId) return null;
  const store = openState(paths.stateDir);
  try {
    const selector = cycleSelector(body, gameId);
    const record = getCycleBySelector(store.db, selector) ?? getActiveCycle(store.db, gameId);
    return record ? cycleView(record) : null;
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

function initRunCommand(deps: PreparingRuntimeDeps, body: JsonObject): { command: string[]; repoRoot: string; stateDir: string; graphDbPath: string; game: ResolvedGame | null } {
  const paths = deps.resolveDashboardGame(body, { useDefaultGame: true });
  const { graphDbPath, game, stateDir } = paths;
  const repoRoot = stringValue(body.cycleRepoRoot, paths.repoRoot);
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
    String(numberValue(body.agentTimeoutSeconds, numberValue(game?.dashboard.agentTimeoutSeconds, 1800))),
    "init-run",
    "--desired-workers",
    String(maxWorkers),
    "--epoch-size",
    stringValue(body.epochSize, game?.dashboard.epochSize == null ? "64" : String(game.dashboard.epochSize)),
    "--candidate-window",
    String(
      Math.max(
        1,
        Math.trunc(
          numberValue(
            body.candidateWindow,
            numberValue(game?.dashboard.candidateWindow, 128),
          ),
        ),
      ),
    ),
    "--candidate-rerank",
    stringValue(body.candidateRerank, game?.dashboard.candidateRerank == null ? "priority" : String(game.dashboard.candidateRerank)),
    "--integration-resolver-concurrency",
    String(numberValue(body.integrationResolverConcurrency, numberValue(game?.dashboard.integrationResolverConcurrency, 4))),
    "--goal-kind",
    stringValue(body.goalKind, "matched_code_percent"),
    "--goal-value",
    String(game?.dashboard.goalValue ?? numberValue(body.goalValue, 100)),
    "--graph-db",
    graphDbPath,
  ];
  const workerConfigureCommand = stringValue(body.workerConfigureCommand).trim();
  if (workerConfigureCommand) command.push("--worker-configure-command", workerConfigureCommand);
  const epochConfigureCommand = stringValue(body.epochConfigureCommand).trim();
  if (epochConfigureCommand) command.push("--epoch-configure-command", epochConfigureCommand);
  return { command, repoRoot, stateDir, graphDbPath, game };
}

export function createPreparingRuntime(deps: PreparingRuntimeDeps): {
  calculateBaselineForPrepare: (body: JsonObject) => Promise<JsonObject>;
  completeRun: (body: JsonObject) => Promise<JsonObject>;
  freshRun: (body: JsonObject) => Promise<JsonObject>;
  indexPrsForPrepare: (body: JsonObject) => Promise<JsonObject>;
  initRun: (body: JsonObject) => Promise<JsonObject>;
  initRunCommand: (body: JsonObject) => { command: string[]; repoRoot: string; stateDir: string; graphDbPath: string; game: ResolvedGame | null };
  state: () => PreparingRuntimeState;
  syncGitForPrepare: (body: JsonObject) => Promise<JsonObject>;
} {
  const runReport = deps.runReport ?? forceReportRun;
  let freshRunActive = false;
  let gameSyncActive = false;

  return {
    state: () => ({ freshRunActive, gameSyncActive }),

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
      const paths = deps.resolveDashboardGame(body, { useDefaultGame: true });
      try {
        const initialCycle = activePreparingCycle(paths, body);
        const intakeStatus = stringValue(initialCycle.phases.preparing.intake?.status);
        const knowledgeStatus = stringValue(initialCycle.phases.preparing.knowledge?.status);
        if ((intakeStatus !== "complete" && !initialCycle.phases.preparing.intake?.completedAt) || (knowledgeStatus !== "complete" && !initialCycle.phases.preparing.knowledge?.completedAt)) {
          throw new Error("Run PR intake before calculating the baseline.");
        }
        const baselineRepoRoot = prepareMainWorktreeRoot(paths, initialCycle);
        const baselinePaths = { ...paths, repoRoot: baselineRepoRoot };
        assertPrepareActionAllowed(deps, paths);
        deps.beginOperation("prepare-baseline", "Calculate Baseline", ["reset report baseline", "report against new baseline", "save point"]);
        let cycle = updateFreshCycleSubphase(
          paths,
          body,
          initialCycle,
          "baseline",
          "Calculating the cycle baseline.",
          {
            baseline: {
              status: "active",
              startedAt: new Date().toISOString(),
            },
          },
        );
        const baselineStartedLinkage = traceLinkageForEvent(
          paths.stateDir,
          gameIdFromContext(paths, body),
          cycle?.causedByEventId ?? null,
        );
        await deps.submitWorkflowEvent(paths, {
          kind: "baseline",
          operation: "prepare.calculateBaseline",
          status: "started",
          sessionId: cycle.cycleUuid,
          detail: `calculate baseline at ${baselineRepoRoot}`,
          ...baselineStartedLinkage,
        });
        try {
          const resetReport = await resetReportBaselineForPrepare(deps, runReport, baselineRepoRoot, {
            stateDir: paths.stateDir,
            gameId: gameIdFromContext(paths, body) || null,
            cycleUuid: cycle.cycleUuid,
            boardKey: "baseline",
            trustedReportKey: "baseline",
            reportRunKey: "prepare_baseline_reset",
          });
          await deps.submitWorkflowEvent(paths, {
            kind: "baseline",
            operation: "prepare.resetReportBaseline",
            status: "completed",
            sessionId: cycle.cycleUuid,
            detail: "report baseline reset",
            metadata: { ...resetReport, repoRoot: baselineRepoRoot },
            ...baselineStartedLinkage,
          });
          const reportRun = await reportAgainstNewBaselineForPrepare(deps, runReport, baselineRepoRoot, {
            stateDir: paths.stateDir,
            gameId: gameIdFromContext(paths, body) || null,
            cycleUuid: cycle.cycleUuid,
            boardKey: "baseline",
            trustedReportKey: "baseline",
            reportRunKey: "prepare_baseline_report",
          });
          await deps.submitWorkflowEvent(paths, {
            kind: "baseline",
            operation: "prepare.reportAgainstBaseline",
            status: "completed",
            sessionId: cycle.cycleUuid,
            detail: "baseline report refreshed",
            metadata: { ...reportRun, repoRoot: baselineRepoRoot },
            ...baselineStartedLinkage,
          });
          deps.operationStep("save point");
          const boundaryCommit = await withDispatchLease(
            baselinePaths,
            {
              kind: "run",
              gameId: gameIdFromContext(paths, body),
              reason: `commit prepared baseline for ${cycle.cycleUuid}`,
              workflowId: `run-prepare:${cycle.cycleUuid}`,
            },
            async (_leaseId, revalidateLease) => commitBoundaryWorktree({
              message: "boundary(init): prepare baseline",
              repoRoot: baselineRepoRoot,
              revalidateLease,
              runGit: deps.runGit,
              stateDir: paths.stateDir,
            }),
          );
          const savePoint = await deps.boundarySavePoint(
            baselinePaths,
            "init",
            cycle.cycleUuid,
            "prepare baseline",
          );
          cycle = updateFreshCycleSubphase(
            paths,
            body,
            cycle,
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
          const baselineCompletedLinkage = traceLinkageForEvent(
            paths.stateDir,
            gameIdFromContext(paths, body),
            cycle?.causedByEventId ?? null,
          );
          await deps.submitWorkflowEvent(paths, {
            kind: "baseline",
            operation: "prepare.calculateBaseline",
            status: "completed",
            sessionId: cycle.cycleUuid,
            detail: "baseline ready",
            metadata: {
              repoRoot: baselineRepoRoot,
              reportRun,
              resetReport,
              boundaryCommit,
              savePoint,
            },
            ...baselineCompletedLinkage,
          });
          deps.endOperation();
          return {
            baseline: true,
            game: paths.game ? deps.gameToSummary(paths.game) : null,
            cycle: cycle,
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
          cycle = updateFreshCycleSubphase(
            paths,
            body,
            cycle,
            "baseline",
            `Baseline calculation failed: ${message}`,
            {
              baseline: {
                ...(cycle?.phases.preparing.baseline ?? {}),
                status: "failed",
                failedAt: new Date().toISOString(),
                error: message,
                repoRoot: baselineRepoRoot,
              },
            },
          );
          const baselineFailedLinkage = traceLinkageForEvent(
            paths.stateDir,
            gameIdFromContext(paths, body),
            cycle?.causedByEventId ?? null,
          );
          await deps.submitWorkflowEvent(paths, {
            kind: "baseline",
            operation: "prepare.calculateBaseline",
            status: "failed",
            sessionId: cycle.cycleUuid,
            metadata: {
              error: message,
              repoRoot: baselineRepoRoot,
            },
            ...baselineFailedLinkage,
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
      const paths = deps.resolveDashboardGame(body, { useDefaultGame: true });
      const { repoRoot, stateDir } = paths;
      const runId = stringValue(body.runId) || latestRunId(stateDir);
      if (!runId) throw new Error("No run found to complete.");

      const active = deps.hasActiveProcess(stateDir);
      if (active.active) {
        const activeName = stringValue(active.name, paths.game?.processName ?? "melee-live");
        throw new Error(`Stop the active process (${activeName}) before closing this run.`);
      }

      const forceClose = body.force === true;
      const prBlockers = deps.activeCyclePrBlockers(stateDir);
      if (prBlockers.length > 0 && !forceClose) {
        throw new Error(`Resolve this cycle's PR work before closing the run: ${prBlockers.slice(0, 6).join("; ")}${prBlockers.length > 6 ? `; +${prBlockers.length - 6} more` : ""}`);
      }

      const initialStore = openState(stateDir);
      let run;
      try {
        run = getRun(initialStore, runId);
      } finally {
        initialStore.db.close();
      }
      if (!run) throw new Error(`Run not found: ${runId}`);
      let completeRunLinkage = traceLinkageForEvent(
        stateDir,
        gameIdFromContext(paths, body),
        run.causedByEventId,
      );

      deps.beginOperation("complete-run", "Close Cycle", ["record closeout", "save point"]);
      try {
        await deps.submitWorkflowEvent(paths, {
          kind: "session",
          operation: "completeLegacyRun",
          status: "started",
          runId,
          sessionId: run.cycleUuid,
          detail: "close legacy run",
          metadata: {
            force: forceClose,
            blockers: prBlockers,
          },
          ...completeRunLinkage,
        });

        deps.operationStep("record closeout", `run ${runId}`);
        const store = openState(stateDir);
        try {
          if (run.status !== "completed") {
            run = updateRunStatus(store, runId, "completed", "ui");
            deps.appendLog("ui", `run ${runId} marked complete`);
          }
          completeRunLinkage = traceLinkageForEvent(
            stateDir,
            gameIdFromContext(paths, body),
            run.causedByEventId,
          );
        } finally {
          store.db.close();
        }

        deps.operationStep("save point");
        if (!run?.cycleUuid) throw new Error(`Run ${runId} has no game cycle for closeout save-point evidence`);
        const savePoint = await deps.boundarySavePoint(paths, "manual", run.cycleUuid, "legacy run closeout");
        await deps.submitWorkflowEvent(paths, {
          kind: "session",
          operation: "completeLegacyRun",
          status: "completed",
          runId,
          sessionId: run.cycleUuid,
          detail: "legacy run closed",
          metadata: {
            force: forceClose,
            blockers: prBlockers,
            savePoint,
            run,
          },
          ...completeRunLinkage,
        });
        deps.endOperation();
        return {
          completed: true,
          game: paths.game ? deps.gameToSummary(paths.game) : null,
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
          sessionId: run.cycleUuid,
          metadata: {
            force: forceClose,
            blockers: prBlockers,
            error: error instanceof Error ? error.message : String(error),
          },
          ...completeRunLinkage,
        }).catch(() => null);
        deps.endOperation(error);
        throw error;
      }
    },

    async initRun(body): Promise<JsonObject> {
      const gamePaths = deps.resolveDashboardGame(body, { useDefaultGame: true });
      const cycle = activeCycleOrNull(gamePaths, body);
      if (!cycle) throw new Error("Create a game cycle before initializing a run.");
      const cycleRepoRoot = prepareCycleWorktreeRoot(gamePaths, cycle);
      const init = initRunCommand(deps, { ...body, cycleRepoRoot });
      const { command } = init;
      const cycleUuid = cycle.cycleUuid;
      const cycleTraceLinkage = traceLinkageForEvent(
        init.stateDir,
        gameIdFromContext(gamePaths, body),
        cycle.causedByEventId,
      );
      await deps.submitWorkflowEvent(init, {
        kind: "run",
        operation: "prepare.startRun",
        status: "started",
        sessionId: cycleUuid,
        detail: "initialize run",
        metadata: {
          repoRoot: init.repoRoot,
          cycleRepoRoot,
          workerConfig: workerConfigFromBody(body, init.game?.dashboard),
        },
        ...cycleTraceLinkage,
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
            gameId: gameIdFromContext(gamePaths, body),
            reason: `commit initialized run for ${cycleUuid || "current cycle"}`,
            workflowId: `run-init:${cycleUuid || gameIdFromContext(gamePaths, body)}`,
          },
          async (_leaseId, revalidateLease) => commitBoundaryWorktree({
            message: "boundary(init): initialize run",
            repoRoot: init.repoRoot,
            revalidateLease,
            runGit: deps.runGit,
            stateDir: init.stateDir,
          }),
        );
        const savePoint = await deps.boundarySavePoint(
          { ...gamePaths, repoRoot: init.repoRoot },
          "init",
          cycle.cycleUuid,
        );
        const activeRunId = latestRunId(init.stateDir);
        const payload = {
          game: init.game ? deps.gameToSummary(init.game) : null,
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
          sessionId: cycleUuid,
          runId: activeRunId,
          detail: activeRunId ? `run ${activeRunId} initialized` : "run initialized",
          metadata: {
            repoRoot: init.repoRoot,
            workerConfig: workerConfigFromBody(body, init.game?.dashboard),
            savePoint,
            boundaryCommit,
          },
          ...(runTraceLinkage(init.stateDir, gameIdFromContext(gamePaths, body), activeRunId) ?? cycleTraceLinkage),
        });
        return payload;
      } catch (error) {
        await deps.submitWorkflowEvent(init, {
          kind: "run",
          operation: "prepare.startRun",
          status: "failed",
          sessionId: cycleUuid,
          metadata: {
            error: error instanceof Error ? error.message : String(error),
            repoRoot: init.repoRoot,
            workerConfig: workerConfigFromBody(body, init.game?.dashboard),
          },
          ...(runTraceLinkage(init.stateDir, gameIdFromContext(gamePaths, body), latestRunId(init.stateDir)) ?? cycleTraceLinkage),
        }).catch(() => null);
        throw error;
      }
    },

    async freshRun(): Promise<JsonObject> {
      throw new Error(
        "Legacy Fresh Run bootstrap is disabled because it performs sync and merged-PR knowledge intake after cycle creation. Create the cycle, then use the operator sync.start workflow.",
      );
    },

  };
}
