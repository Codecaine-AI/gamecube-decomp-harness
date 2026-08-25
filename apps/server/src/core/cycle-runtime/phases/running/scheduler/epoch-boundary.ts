import { randomUUID } from "node:crypto";
import { packageRoot } from "@server/core/knowledge";
import { reconcilePendingIntegrationAttempt as reconcilePendingIntegrationAttemptDefault } from "@server/core/cycle";
import { runEpochCycle as runEpochCycleDefault, type EpochCycleResult } from "@server/core/cycle-runtime/phases/running/epochs";
import { publishCycleDraftPr as publishCycleDraftPrDefault } from "@server/core/cycle-runtime/phases/running/epochs/cycle-draft-pr.js";
import {
  addEvent,
  closeSchedulerEpoch,
  closeSchedulerEpochWithEvidence,
  type SchedulerEpochConfig,
  type StateStore,
} from "@server/core/cycle-runtime/run-state";
import { runKnowledgeMaintenance as runKnowledgeMaintenanceDefault, type KnowledgeMaintenanceProgressEvent } from "@server/core/knowledge/jobs/kg.js";
import { ensureSchedulerEpochFromBoard as ensureSchedulerEpochFromBoardDefault } from "./tick.js";
import type { GlobalArgs, WriteSetIntegrationFlags } from "@server/core/game-registry/runtime-options.js";

export type KnowledgeProgressReporter = (
  store: StateStore,
  runId: string,
  params: { lane: string; mode?: string; epochId?: string | null; epochOrdinal?: number | null; repoRoot?: string },
) => (event: KnowledgeMaintenanceProgressEvent) => void;

type ReconcilePendingIntegrationAttempt = typeof reconcilePendingIntegrationAttemptDefault;
type RunEpochCycle = typeof runEpochCycleDefault;
type PublishCycleDraftPr = typeof publishCycleDraftPrDefault;
type RunKnowledgeMaintenance = typeof runKnowledgeMaintenanceDefault;
type EnsureSchedulerEpochFromBoard = typeof ensureSchedulerEpochFromBoardDefault;

export interface EpochBoundaryDependencies {
  reconcilePendingIntegrationAttempt?: ReconcilePendingIntegrationAttempt;
  runEpochCycle?: RunEpochCycle;
  publishCycleDraftPr?: PublishCycleDraftPr;
  runKnowledgeMaintenance?: RunKnowledgeMaintenance;
  ensureSchedulerEpochFromBoard?: EnsureSchedulerEpochFromBoard;
}

export interface EpochBoundaryParams {
  store: StateStore;
  globals: GlobalArgs;
  args: Map<string, string | true>;
  runId: string;
  leaseId: string;
  trigger: string;
  schedulerEpochId?: string;
  epochOrdinal: number;
  config: {
    epochConfigureCommand: string;
    epochLinkPaths: string[];
    epochPauseThreshold: number;
    epochRequeueLimit: number;
    epochRetryMs: number;
    cycleDraftPrEnabled: boolean;
    fullKgMaintenanceMode: string;
    writeSetFlags: WriteSetIntegrationFlags;
    schedulerEpochConfig: SchedulerEpochConfig;
    graphDbPath: string;
    epochWorktreeDir: string;
  };
  reportKnowledgeProgress: KnowledgeProgressReporter;
  dependencies?: EpochBoundaryDependencies;
}

export interface EpochBoundaryOutcome {
  ok: boolean;
  error?: string;
  boundaryResult?: EpochCycleResult;
  reconciled: boolean;
  paused: boolean;
  nextEpoch?: ReturnType<typeof ensureSchedulerEpochFromBoardDefault>;
  exhausted: boolean;
  retryAtMs: number | null;
  knowledgeMaintenanceRun?: Record<string, unknown>;
}

function knowledgeMaintenanceArgs(args: Map<string, string | true>, runId: string): Map<string, string | true> {
  const next = new Map<string, string | true>([["--run-id", runId]]);
  for (const key of [
    "--agent-state-enrichment",
    "--curator-agent-batch-size",
    "--curator-agent-jobs",
    "--curator-agent-record-limit",
    "--graph-db",
    "--knowledge-curator-enrichment",
    "--no-pr-index",
    "--no-rebuild",
    "--no-run-pr-agent",
    "--no-tool-index",
    "--no-tool-runners",
    "--progress-only",
    "--pr-jobs",
    "--pr-limit",
    "--rerun-existing-prs",
    "--run-pr-agent",
    "--run-curator-agent",
    "--sources",
    "--worker-limit",
  ]) {
    const value = args.get(key);
    if (value !== undefined) next.set(key, value);
  }
  if (next.has("--run-pr-agent") && !next.has("--pr-limit")) next.set("--pr-limit", "8");
  return next;
}

function fullBoundaryKnowledgeMaintenanceArgs(args: Map<string, string | true>, runId: string, mode: string): Map<string, string | true> {
  const next = knowledgeMaintenanceArgs(args, runId);
  if (!next.has("--run-pr-agent")) next.set("--no-run-pr-agent", true);
  if (mode === "no-tool-runners") next.set("--no-tool-runners", true);
  return next;
}

export async function runEpochBoundary(params: EpochBoundaryParams): Promise<EpochBoundaryOutcome> {
  const {
    store,
    globals,
    args,
    runId,
    leaseId,
    trigger,
    schedulerEpochId,
    epochOrdinal,
    config,
    reportKnowledgeProgress,
  } = params;
  const reconcilePendingIntegrationAttempt = params.dependencies?.reconcilePendingIntegrationAttempt ?? reconcilePendingIntegrationAttemptDefault;
  const runEpochCycle = params.dependencies?.runEpochCycle ?? runEpochCycleDefault;
  const publishCycleDraftPr = params.dependencies?.publishCycleDraftPr ?? publishCycleDraftPrDefault;
  const runKnowledgeMaintenance = params.dependencies?.runKnowledgeMaintenance ?? runKnowledgeMaintenanceDefault;
  const ensureSchedulerEpochFromBoard = params.dependencies?.ensureSchedulerEpochFromBoard ?? ensureSchedulerEpochFromBoardDefault;
  let boundaryResult: EpochCycleResult | undefined;
  let reconciled = false;
  let knowledgeMaintenanceRun: Record<string, unknown> | undefined;
  let nextEpoch: ReturnType<typeof ensureSchedulerEpochFromBoardDefault> | undefined;
  let exhausted = false;

  try {
    if (globals.dryRunAgents) {
      // Dry runs skip the snapshot/build but still close/start scheduler epochs
      // so tests exercise deterministic admission.
    } else {
      const label = `epoch-${epochOrdinal}`;
      const retained = reconcilePendingIntegrationAttempt(store, {
        runId,
        epochId: schedulerEpochId ?? label,
      });
      if (retained.status === "completed") {
        reconciled = true;
        console.error(`[run-loop] epoch ${epochOrdinal}: pending integration attempt reconciled`);
        if (schedulerEpochId) {
          closeSchedulerEpoch(store, schedulerEpochId, {
            status: "completed",
            boundaryStatus: "success",
            routingSummary: { trigger, reconciled: true, ...retained.completed },
          });
        }
      } else {
        console.error(`[run-loop] epoch ${epochOrdinal}: ${trigger}; snapshotting and rebuilding report`);
        const result = await runEpochCycle(store, runId, globals.repoRoot, globals.stateDir, {
          baseRef: globals.game?.baseRef,
          configureCommand: config.epochConfigureCommand,
          epochId: schedulerEpochId,
          label,
          leaseId,
          linkPaths: config.epochLinkPaths,
          gameId: globals.game?.gameId ?? globals.gameId ?? null,
          qaScan: { orchestratorRoot: packageRoot() },
          regressionPauseThreshold: config.epochPauseThreshold,
          regressionRequeueLimit: config.epochRequeueLimit,
          reportRelPath: globals.game?.validation.reportPath,
          reportChangesRelPath: globals.game?.validation.reportChangesPath,
          worktreeDir: config.epochWorktreeDir,
        });
        boundaryResult = result;
        if (config.cycleDraftPrEnabled) {
          const publish = await publishCycleDraftPr({
            baseRef: globals.game?.baseRef,
            commitSha: result.commitSha,
            epochLabel: result.label,
            matchedCodePercent: result.matchedCodePercent,
            gameId: globals.game?.gameId ?? globals.gameId ?? null,
            qaGate: result.qaGate as unknown as Record<string, unknown> | null,
            regressions: result.regressions as unknown as Record<string, unknown>,
            repoRoot: globals.repoRoot,
            runId,
            savePointId: result.savePointId,
            stateDir: globals.stateDir,
            store,
          });
          console.error(
            `[run-loop] epoch ${epochOrdinal}: cycle draft PR ${publish.status}` +
              `${publish.url ? ` ${publish.url}` : publish.reason ? ` (${publish.reason})` : publish.error ? ` (${publish.error})` : ""}`,
          );
        }
        console.error(
          `[run-loop] epoch ${epochOrdinal}: matched_code ${result.matchedCodePercent ?? "?"}%, ` +
            `${result.regressions.regressedFunctions} regressed functions, ${result.repair.requeued} repairs readmitted, ` +
            `qa gate ${result.qaGate === null ? "not run" : `${result.qaGate.status} (${result.qaGate.errors} errors, ${result.qaGate.warnings} warnings)`} ` +
            `(${Math.round(result.durationMs / 1000)}s)`,
        );
        if (result.repair.paused) {
          addEvent(store, runId, "epoch_regression_pause", "run-loop", {
            epoch: epochOrdinal,
            qa_gate: result.qaGate,
            reasons: result.repair.reasons,
            regressions: result.regressions,
            save_point_id: result.savePointId,
            created_by: "run-loop",
          });
          console.error(`[run-loop] epoch ${epochOrdinal}: paused on regressions; retrying in ${Math.round(config.epochRetryMs / 1000)}s`);
          if (schedulerEpochId) {
            closeSchedulerEpochWithEvidence(store, schedulerEpochId, {
              status: "paused",
              boundaryStatus: "regression_pause",
              routingSummary: {
                trigger,
                save_point_id: result.savePointId,
                regressions: result.regressions,
                repair: result.repair,
                qa_gate: result.qaGate,
              },
              integration: {
                gameId: globals.game?.gameId ?? globals.gameId,
                runId,
                integrationCommit: result.commitSha!,
                scoreDelta: result.scoreDelta,
                commandId: `command-epoch-integrated-${randomUUID()}`,
                correlationId: runId,
                payload: {
                  ordinal: epochOrdinal,
                  boundary_status: "regression_pause",
                  save_point_id: result.savePointId,
                },
              },
              savePointEvidence: result.savePointEvidence,
            });
          }
          return {
            ok: true,
            boundaryResult,
            reconciled,
            paused: true,
            exhausted: false,
            retryAtMs: Date.now() + config.epochRetryMs,
          };
        }
      }
    }

    if (!globals.dryRunAgents && config.fullKgMaintenanceMode !== "skip" && config.fullKgMaintenanceMode !== "none" && config.fullKgMaintenanceMode !== "off") {
      const maintenanceGlobals = boundaryResult?.worktreeDir ? { ...globals, repoRoot: boundaryResult.worktreeDir } : globals;
      console.error(`[run-loop] epoch ${epochOrdinal}: full knowledge refresh started (${config.fullKgMaintenanceMode})`);
      addEvent(store, runId, "epoch_full_refresh_started", "run-loop", {
        epoch: epochOrdinal,
        lane: "full_boundary",
        mode: config.fullKgMaintenanceMode,
        repo_root: maintenanceGlobals.repoRoot,
        created_by: "run-loop",
      });
      const maintenance = await runKnowledgeMaintenance(
        maintenanceGlobals,
        fullBoundaryKnowledgeMaintenanceArgs(args, runId, config.fullKgMaintenanceMode),
        {
          progress: reportKnowledgeProgress(store, runId, {
            lane: "full_boundary",
            mode: config.fullKgMaintenanceMode,
            epochId: schedulerEpochId,
            epochOrdinal,
            repoRoot: maintenanceGlobals.repoRoot,
          }),
        },
      );
      knowledgeMaintenanceRun = {
        ...maintenance,
        lane: "full_boundary",
        mode: config.fullKgMaintenanceMode,
        repo_root: maintenanceGlobals.repoRoot,
      };
      console.error(`[run-loop] epoch ${epochOrdinal}: full knowledge refresh finished`);
      addEvent(store, runId, "epoch_full_refresh_finished", "run-loop", {
        epoch: epochOrdinal,
        lane: "full_boundary",
        mode: config.fullKgMaintenanceMode,
        repo_root: maintenanceGlobals.repoRoot,
        created_by: "run-loop",
      });
    }

    if (schedulerEpochId && !reconciled) {
      const routingSummary = {
        trigger,
        dry_run: globals.dryRunAgents,
        save_point_id: boundaryResult?.savePointId ?? null,
        matched_code_percent: boundaryResult?.matchedCodePercent ?? null,
        regressions: boundaryResult?.regressions ?? null,
        repair: boundaryResult?.repair ?? null,
        qa_gate: boundaryResult?.qaGate ?? null,
      };
      if (boundaryResult?.commitSha) {
        closeSchedulerEpochWithEvidence(store, schedulerEpochId, {
          status: "completed",
          boundaryStatus: "success",
          routingSummary,
          integration: {
            gameId: globals.game?.gameId ?? globals.gameId,
            runId,
            integrationCommit: boundaryResult.commitSha,
            scoreDelta: boundaryResult.scoreDelta,
            commandId: `command-epoch-integrated-${randomUUID()}`,
            correlationId: runId,
            payload: {
              ordinal: epochOrdinal,
              boundary_status: "success",
              save_point_id: boundaryResult.savePointId,
            },
          },
          savePointEvidence: boundaryResult.savePointEvidence,
        });
      } else {
        closeSchedulerEpoch(store, schedulerEpochId, {
          status: "completed",
          boundaryStatus: "dry_run",
          routingSummary,
        });
      }
    }

    nextEpoch = ensureSchedulerEpochFromBoard({
      config: config.schedulerEpochConfig,
      globals,
      graphDbPath: config.graphDbPath,
      runId,
      store,
    });
    console.error(
      `[run-loop] epoch ${nextEpoch.progress.ordinal}: admitted ${nextEpoch.progress.admitted}/${nextEpoch.progress.size.mode === "full" ? "full" : nextEpoch.progress.size.value} ` +
        `targets from candidate window ${config.schedulerEpochConfig.candidateWindow} (${config.schedulerEpochConfig.candidateRerank ?? "priority"}), ` +
        `${nextEpoch.progress.available} available, ${nextEpoch.priorityRefreshes} refreshed` +
        (nextEpoch.admissionCap
          ? `, capped ${nextEpoch.admissionCap.candidateCount} -> ${nextEpoch.admissionCap.cap} (${nextEpoch.admissionCap.mode})`
          : ""),
    );
    exhausted =
      (nextEpoch.progress.admitted === 0 || nextEpoch.progress.remaining === 0) &&
      nextEpoch.progress.available === 0 &&
      nextEpoch.progress.claimed === 0;
    if (exhausted) {
      closeSchedulerEpoch(store, nextEpoch.epoch.id, {
        status: "exhausted",
        boundaryStatus: "board_exhausted",
        routingSummary: { trigger: "post_boundary_admission", board_exhausted: nextEpoch.boardExhausted },
      });
      addEvent(store, runId, "epoch_exhausted", "run-loop", {
        epoch_id: nextEpoch.epoch.id,
        ordinal: nextEpoch.progress.ordinal,
        size: nextEpoch.progress.size,
        created_by: "run-loop",
      });
    } else {
      addEvent(store, runId, "epoch_admitted", "run-loop", {
        epoch_id: nextEpoch.epoch.id,
        ordinal: nextEpoch.progress.ordinal,
        admitted: nextEpoch.progress.admitted,
        available: nextEpoch.progress.available,
        candidate_rerank: config.schedulerEpochConfig.candidateRerank ?? "priority",
        candidate_window: config.schedulerEpochConfig.candidateWindow,
        admission_cap: nextEpoch.admissionCap,
        size: nextEpoch.progress.size,
        created_by: "run-loop",
      });
    }
    return {
      ok: true,
      boundaryResult,
      reconciled,
      paused: false,
      nextEpoch,
      exhausted,
      retryAtMs: exhausted ? Date.now() + config.epochRetryMs : null,
      knowledgeMaintenanceRun,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[run-loop] epoch ${epochOrdinal} failed: ${message}`);
    addEvent(store, runId, "epoch_cycle_error", "run-loop", {
      epoch: epochOrdinal,
      error: message.slice(0, 2000),
      created_by: "run-loop",
    });
    if (schedulerEpochId) {
      closeSchedulerEpoch(store, schedulerEpochId, {
        status: "error",
        boundaryStatus: "error",
        routingSummary: { trigger, error: message.slice(0, 2000) },
      });
    }
    return {
      ok: false,
      error: message,
      boundaryResult,
      reconciled,
      paused: false,
      nextEpoch,
      exhausted,
      retryAtMs: Date.now() + config.epochRetryMs,
      knowledgeMaintenanceRun,
    };
  }
}
