import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { packageRoot } from "@server/core/knowledge";
import { appendLearnings, defaultLedgerPath } from "@server/core/knowledge/ledger.js";
import { rebuildKnowledgeGraph } from "@server/core/knowledge/graph";
import { forceReportRun } from "@server/core/validation/report";
import { addSavePoint, ensureCampaign } from "@server/core/cycle-runtime/phases/pr/state";
import { runBoundarySync as runBoundarySyncDefault, type BoundarySyncResult } from "@server/core/cycle-runtime/phases/running/epochs/boundary-sync.js";
import { recordSavePointAnchor, reconcilePendingIntegrationAttempt as reconcilePendingIntegrationAttemptDefault } from "@server/core/cycle";
import { runEpochCycle as runEpochCycleDefault, type EpochCycleResult } from "@server/core/cycle-runtime/phases/running/epochs";
import { publishCycleDraftPr as publishCycleDraftPrDefault } from "@server/core/cycle-runtime/phases/running/epochs/cycle-draft-pr.js";
import {
  addEvent,
  closeSchedulerEpoch,
  closeSchedulerEpochWithEvidence,
  requeueEpochTarget,
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
type RunBoundarySync = (input: { params: EpochBoundaryParams; epochResult: EpochCycleResult }) => Promise<BoundarySyncResult | undefined>;

export interface EpochBoundaryDependencies {
  reconcilePendingIntegrationAttempt?: ReconcilePendingIntegrationAttempt;
  runEpochCycle?: RunEpochCycle;
  publishCycleDraftPr?: PublishCycleDraftPr;
  runKnowledgeMaintenance?: RunKnowledgeMaintenance;
  ensureSchedulerEpochFromBoard?: EnsureSchedulerEpochFromBoard;
  runBoundarySync?: RunBoundarySync;
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
    cycleDraftPrEnabled: boolean;
    boundarySyncEnabled: boolean;
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
  knowledgeMaintenanceRun?: Record<string, unknown>;
  boundarySync?: BoundarySyncResult;
  boundaryHeadSha?: string;
}

function measuresAt(repoRoot: string, reportRelPath: string): Record<string, unknown> {
  const parsed = JSON.parse(readFileSync(resolve(repoRoot, reportRelPath), "utf8")) as Record<string, unknown>;
  return parsed.measures && typeof parsed.measures === "object" ? parsed.measures as Record<string, unknown> : {};
}

async function productionBoundarySync(params: EpochBoundaryParams): Promise<BoundarySyncResult | undefined> {
  const gameId = params.globals.game?.gameId ?? params.globals.gameId;
  if (!gameId) return undefined;
  const run = params.store.db.query("SELECT cycle_uuid FROM runs WHERE id = ?").get(params.runId) as { cycle_uuid: string | null } | undefined;
  if (!run?.cycle_uuid) return undefined;
  const anchor = params.store.db
    .query("SELECT upstream_revision FROM game_upstream_anchors WHERE game_id = ? AND cycle_uuid = ?")
    .get(gameId, run.cycle_uuid) as { upstream_revision: string } | undefined;
  if (!anchor?.upstream_revision) throw new Error(`boundary sync missing upstream anchor for ${gameId}/${run.cycle_uuid}`);
  const cycle = params.store.db.query("SELECT id, head_revision FROM cycles WHERE cycle_uuid = ?").get(run.cycle_uuid) as { id: string; head_revision: string } | undefined;
  if (!cycle?.head_revision) throw new Error(`boundary sync missing cycle head for ${run.cycle_uuid}`);
  const rows = params.store.db.query(`
    SELECT id, target_key, unit, symbol, source_path, baseline_score
    FROM epoch_targets WHERE run_id = ? AND status = 'finished'
  `).all(params.runId) as Array<Record<string, unknown>>;
  const reportRelPath = params.globals.game?.validation.reportPath ?? "build/GALE01/report.json";
  const campaign = ensureCampaign(params.store, { gameId, baseRef: params.globals.game?.baseRef });
  let pendingAnchorSha: string | null = null;
  return runBoundarySyncDefault({
    repoRoot: params.globals.repoRoot,
    anchorSha: anchor.upstream_revision,
    upstreamRef: params.globals.game?.baseRef,
    targets: rows.map((row) => ({
      epochTargetId: String(row.id),
      targetKey: String(row.target_key),
      sourcePath: String(row.source_path),
      unit: String(row.unit),
      symbol: String(row.symbol),
      priorKind: Number(row.baseline_score) >= 100 ? "match" as const : "improvement" as const,
      priorScore: Number.isFinite(Number(row.baseline_score)) ? Number(row.baseline_score) : null,
    })),
    hooks: {
      // The full boundary knowledge pass below owns merged-PR indexing. It is
      // deliberately outside operator-sync publication and confirmation.
      ingestMergedUpstream: async () => {},
      appendOverrideNote: (item) => {
        const id = createHash("sha256").update(`${run.cycle_uuid}:${item.targetKey}:${item.upstreamLandedSha}`).digest("hex");
        appendLearnings(defaultLedgerPath(gameId), [{
          id: `boundary-${id}`,
          origin: "human_extracted",
          subject: { scope: item.symbol ? "symbol" : "file", symbol: item.symbol ?? undefined, file: item.sourcePath },
          statement: `${item.targetKey} was ${item.priorKind} locally at score ${item.priorScore ?? "unknown"}; upstream ${item.upstreamLandedSha} overrode it. ${item.verdict}`,
          evidence: [{ type: "boundary_sync", ref: item.upstreamLandedSha }],
          confidence: 1,
          produced_by: "boundary-sync",
          status: "corroborated",
        }]);
      },
      requeueTarget: (item) => {
        if (!item.epochTargetId) throw new Error(`boundary sync cannot requeue ${item.targetKey} without an epoch target id`);
        requeueEpochTarget(params.store, { epochTargetId: item.epochTargetId });
      },
      rebuildKnowledgeGraph: async () => { rebuildKnowledgeGraph({ repoRoot: params.globals.repoRoot, dbPath: params.config.graphDbPath }); },
      recomputeReport: async () => {
        await forceReportRun(params.globals.repoRoot, { resetBaseline: false });
        const measures = measuresAt(params.globals.repoRoot, reportRelPath);
        const score = Number(measures.matched_code_percent);
        return { measures, matchedCodePercent: Number.isFinite(score) ? score : null };
      },
      writePrSyncSavePoint: (value) => {
        const savePoint = addSavePoint(params.store, {
          campaignId: campaign.id,
          runId: params.runId,
          triggerKind: "pr_sync",
          label: `epoch-${params.epochOrdinal}-pr-sync`,
          commitSha: value.commitSha,
          baseRef: params.globals.game?.baseRef,
          baseSha: value.upstreamHeadSha,
          matchedCodePercent: value.matchedCodePercent,
          reportPath: resolve(params.globals.repoRoot, reportRelPath),
          payload: { kind: value.kind, measures: value.measures, prior_anchor: value.anchorSha },
        });
        recordSavePointAnchor(params.store, {
          gameId,
          cycleUuid: run.cycle_uuid,
          savePointId: savePoint.id,
          commitSha: value.commitSha,
          triggerKind: "pr_sync",
          headlineScore: value.matchedCodePercent,
          artifactPaths: [resolve(params.globals.repoRoot, reportRelPath)],
          payload: { measures: value.measures, prior_anchor: value.anchorSha, upstream_revision: value.upstreamHeadSha },
          commandId: `command-boundary-pr-sync-${randomUUID()}`,
          correlationId: params.runId,
          actor: "runner",
        });
      },
      advanceAnchor: ({ upstreamHeadSha }) => {
        pendingAnchorSha = upstreamHeadSha;
      },
      advanceCycleHead: ({ headSha }) => {
        if (!pendingAnchorSha) throw new Error("boundary sync anchor advance was not prepared");
        const at = new Date().toISOString();
        params.store.db.transaction(() => {
          const anchorChanged = params.store.db.query(`UPDATE game_upstream_anchors
            SET upstream_revision = ?, sync_id = ?, caused_by_event_id = ?, updated_at = ?
            WHERE game_id = ? AND cycle_uuid = ? AND upstream_revision = ?`)
            .run(pendingAnchorSha, `boundary-${params.epochOrdinal}`, `boundary-${randomUUID()}`, at, gameId, run.cycle_uuid, anchor.upstream_revision);
          if (anchorChanged.changes !== 1) throw new Error(`boundary sync anchor CAS failed for ${run.cycle_uuid}`);
          const cycleChanged = params.store.db.query("UPDATE cycles SET head_revision = ?, revision = revision + 1, updated_at = ?, save_point_stale = 0 WHERE cycle_uuid = ? AND head_revision = ?")
            .run(headSha, at, run.cycle_uuid, cycle.head_revision);
          if (cycleChanged.changes !== 1) throw new Error(`boundary sync cycle head CAS failed for ${run.cycle_uuid}`);
          const runChanged = params.store.db.query("UPDATE runs SET head_revision = ?, revision = revision + 1 WHERE id = ? AND cycle_uuid = ?")
            .run(headSha, params.runId, run.cycle_uuid);
          if (runChanged.changes !== 1) throw new Error(`boundary sync run head CAS failed for ${params.runId}`);
        })();
      },
    },
  });
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
  const runBoundarySync = params.dependencies?.runBoundarySync;
  let boundaryResult: EpochCycleResult | undefined;
  let reconciled = false;
  let knowledgeMaintenanceRun: Record<string, unknown> | undefined;
  let nextEpoch: ReturnType<typeof ensureSchedulerEpochFromBoardDefault> | undefined;
  let boundarySync: BoundarySyncResult | undefined;

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
        if (config.boundarySyncEnabled && result.commitSha) {
          boundarySync = runBoundarySync
            ? await runBoundarySync({ params, epochResult: result })
            : await productionBoundarySync(params);
        }
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
          console.error(`[run-loop] epoch ${epochOrdinal}: paused on regressions`);
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
                integrationCommit: boundarySync?.headSha ?? result.commitSha!,
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
            integrationCommit: boundarySync?.headSha ?? boundaryResult.commitSha,
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
      `[run-loop] epoch ${nextEpoch.progress.ordinal}: admitted ${nextEpoch.progress.admitted} targets, ` +
        `${nextEpoch.progress.available} available, ${nextEpoch.priorityRefreshes} refreshed`,
    );
    addEvent(store, runId, "epoch_admitted", "run-loop", {
      epoch_id: nextEpoch.epoch.id,
      ordinal: nextEpoch.progress.ordinal,
      admitted: nextEpoch.progress.admitted,
      available: nextEpoch.progress.available,
      created_by: "run-loop",
    });
    return {
      ok: true,
      boundaryResult,
      reconciled,
      paused: false,
      nextEpoch,
      knowledgeMaintenanceRun,
      boundarySync,
      boundaryHeadSha: boundarySync?.headSha ?? boundaryResult?.commitSha ?? undefined,
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
      knowledgeMaintenanceRun,
      boundarySync,
      boundaryHeadSha: boundarySync?.headSha ?? boundaryResult?.commitSha ?? undefined,
    };
  }
}
