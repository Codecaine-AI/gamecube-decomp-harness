import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { packageRoot } from "@server/core/knowledge";
import { appendLearnings, defaultLedgerPath } from "@server/core/knowledge/ledger.js";
import { forceReportRun } from "@server/core/validation/report";
import {
  runCiParityGate as runCiParityGateDefault,
  runPreCommitGate as runPreCommitGateDefault,
  type CiParityResult,
} from "@server/core/validation/ci-parity/index.js";
import { sectionMeasuresFromReport } from "@server/core/validation/objdiff/section-measures.js";
import { addSavePoint, ensureCampaign, latestSavePointByTrigger, mergeSavePointPayload } from "@server/core/cycle-runtime/phases/pr/state";
import { runBoundarySync as runBoundarySyncDefault, type BoundarySyncResult } from "@server/core/cycle-runtime/phases/running/epochs/boundary-sync.js";
import { runMasterBreakageGate as runMasterBreakageGateDefault, type MasterBreakageGateResult } from "@server/core/cycle-runtime/phases/running/epochs/breakage-gate.js";
import { recordSavePointAnchor, reconcilePendingIntegrationAttempt as reconcilePendingIntegrationAttemptDefault } from "@server/core/cycle";
import {
  runEpochCycle as runEpochCycleDefault,
  type BoundaryBuildFixerInput,
  type BoundaryBuildFixerResult,
  type BoundaryDeferredFinding,
  type EpochCycleResult,
} from "@server/core/cycle-runtime/phases/running/epochs";
import { publishCycleDraftPr as publishCycleDraftPrDefault } from "@server/core/cycle-runtime/phases/running/epochs/cycle-draft-pr.js";
import {
  addEvent,
  closeSchedulerEpoch,
  closeSchedulerEpochWithEvidence,
  recordEpochBoundaryRetryFailure,
  type SchedulerEpochConfig,
  type StateStore,
} from "@server/core/cycle-runtime/run-state";
import {
  runKnowledgeGraphRebuild,
  runKnowledgeMaintenance as runKnowledgeMaintenanceDefault,
  type KnowledgeMaintenanceProgressEvent,
} from "@server/core/knowledge/jobs/kg.js";
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
type ProductionRunBoundarySync = typeof runBoundarySyncDefault;
type RecordSavePointAnchor = typeof recordSavePointAnchor;
type CloseSchedulerEpochWithEvidence = typeof closeSchedulerEpochWithEvidence;
export interface BoundaryBreakageDeferral {
  gameId: string;
  cycleUuid: string | null;
  gate: MasterBreakageGateResult;
}
type WriteBoundaryBreakageDeferrals = (input: BoundaryBreakageDeferral) => void | Promise<void>;

export interface EpochBoundaryDependencies {
  reconcilePendingIntegrationAttempt?: ReconcilePendingIntegrationAttempt;
  runEpochCycle?: RunEpochCycle;
  publishCycleDraftPr?: PublishCycleDraftPr;
  runKnowledgeMaintenance?: RunKnowledgeMaintenance;
  ensureSchedulerEpochFromBoard?: EnsureSchedulerEpochFromBoard;
  runBoundarySync?: RunBoundarySync;
  productionRunBoundarySync?: ProductionRunBoundarySync;
  recordSavePointAnchor?: RecordSavePointAnchor;
  closeSchedulerEpochWithEvidence?: CloseSchedulerEpochWithEvidence;
  runMasterBreakageGate?: typeof runMasterBreakageGateDefault;
  runCiParityGate?: typeof runCiParityGateDefault;
  runPreCommitGate?: typeof runPreCommitGateDefault;
  runPreCommitAutofix?: typeof import("@server/core/validation/ci-parity/index.js").runPreCommitAutofix;
  writeBoundaryBreakageDeferrals?: WriteBoundaryBreakageDeferrals;
  runBoundaryBuildFixer?: (input: BoundaryBuildFixerInput) => Promise<BoundaryBuildFixerResult>;
  deferBoundaryFindings?: (input: BoundaryDeferredFinding[]) => Promise<void> | void;
  now?: () => Date;
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
    ciParityEnabled: boolean;
    preCommitGateEnabled: boolean;
    preCommitAutofixEnabled: boolean;
    boundarySyncEnabled: boolean;
    breakageGateEnabled: boolean;
    boundaryBuildFixerEnabled: boolean;
    fullKgMaintenanceMode: string;
    writeSetFlags: WriteSetIntegrationFlags;
    schedulerEpochConfig: SchedulerEpochConfig;
    graphDbPath: string;
    epochWorktreeDir: string;
    boundaryRetry?: {
      enabled: boolean;
      maxAttempts: number;
      baseMs: number;
      maxMs: number;
    };
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
  breakageGate?: MasterBreakageGateResult;
  terminal?: boolean;
}

function measuresAt(repoRoot: string, reportRelPath: string): Record<string, unknown> {
  const parsed = JSON.parse(readFileSync(resolve(repoRoot, reportRelPath), "utf8")) as Record<string, unknown>;
  return parsed.measures && typeof parsed.measures === "object" ? parsed.measures as Record<string, unknown> : {};
}

function writeBoundaryBreakageDeferralsDefault(input: BoundaryBreakageDeferral): void {
  const records = input.gate.breakages.map((item) => {
    const targetKey = `${item.unitName}::${item.itemName}`;
    const evidenceRef = input.gate.baselineSha ?? input.gate.changesPath ?? "boundary_breakage_gate";
    const id = createHash("sha256")
      .update(`${input.cycleUuid ?? "no-cycle"}:${targetKey}:${evidenceRef}:boundary_breakage_deferred`)
      .digest("hex");
    return {
      id: `boundary-${id}`,
      origin: "human_extracted" as const,
      subject: { scope: "symbol" as const, symbol: item.itemName },
      statement: `boundary_breakage_deferred: ${targetKey} regressed from ${item.fromPercent}% to ${item.toPercent}% (${item.bytesDelta} bytes) at the epoch boundary. Do not repair it at the boundary; re-evaluate it during next-epoch admission.`,
      evidence: [{ type: "boundary_breakage_deferred", ref: evidenceRef }],
      confidence: 1,
      produced_by: "epoch-boundary",
      status: "corroborated" as const,
    };
  });
  if (records.length > 0) appendLearnings(defaultLedgerPath(input.gameId), records);
}

function writeBoundaryFindingsDefault(gameId: string, cycleUuid: string | null, findings: BoundaryDeferredFinding[]): void {
  if (findings.length === 0) return;
  appendLearnings(defaultLedgerPath(gameId), findings.map((finding) => {
    const target = [finding.unit, finding.symbol].filter(Boolean).join("::") || finding.sourcePath || "unknown target";
    const id = createHash("sha256").update(`${cycleUuid ?? "no-cycle"}:${finding.reason}:${target}:${finding.detail}`).digest("hex");
    return {
      id: `boundary-${id}`,
      origin: "human_extracted" as const,
      subject: { scope: finding.symbol ? "symbol" as const : "file" as const, symbol: finding.symbol, file: finding.sourcePath },
      statement: `${finding.reason}: ${target}. ${finding.detail} Re-admit through next-epoch admission; do not repair at the boundary.`,
      evidence: [{ type: finding.reason, ref: cycleUuid ?? gameId }],
      confidence: 1,
      produced_by: "epoch-boundary",
      status: "corroborated" as const,
    };
  }));
}

async function productionBoundarySync(params: EpochBoundaryParams): Promise<BoundarySyncResult | undefined> {
  const gameId = params.globals.game?.gameId ?? params.globals.gameId;
  if (!gameId) return undefined;
  const run = params.store.db.query("SELECT cycle_uuid FROM runs WHERE id = ?").get(params.runId) as { cycle_uuid: string | null } | undefined;
  if (!run?.cycle_uuid) return undefined;
  const cycleUuid = run.cycle_uuid;
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
  const runBoundarySync = params.dependencies?.productionRunBoundarySync ?? runBoundarySyncDefault;
  const writeSavePointAnchor = params.dependencies?.recordSavePointAnchor ?? recordSavePointAnchor;
  return runBoundarySync({
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
        console.error(`[run-loop] boundary sync: ${item.targetKey} displaced by upstream; deferring to next-epoch admission`);
      },
      rebuildKnowledgeGraph: async () => {
        await runKnowledgeGraphRebuild(params.globals, new Map([
          ["--graph-db", params.config.graphDbPath],
        ]));
      },
      recomputeReport: async () => {
        await forceReportRun(params.globals.repoRoot, { resetBaseline: false });
        const measures = measuresAt(params.globals.repoRoot, reportRelPath);
        const score = Number(measures.matched_code_percent);
        const dataScore = Number(measures.matched_data_percent);
        const sectionMeasures = sectionMeasuresFromReport(resolve(params.globals.repoRoot, reportRelPath));
        return {
          measures,
          matchedCodePercent: Number.isFinite(score) ? score : null,
          matchedDataPercent: Number.isFinite(dataScore) ? dataScore : null,
          sectionMeasures,
        };
      },
      writePrSyncSavePoint: (value) => {
        const liveReportPath = resolve(params.globals.repoRoot, reportRelPath);
        let reportPath = liveReportPath;
        try {
          const prSyncArtifactDir = resolve(params.globals.stateDir, "pr_sync_reports", `epoch-${params.epochOrdinal}-${randomUUID().slice(0, 8)}`);
          mkdirSync(prSyncArtifactDir, { recursive: true });
          reportPath = resolve(prSyncArtifactDir, "report.json");
          copyFileSync(liveReportPath, reportPath);
        } catch (error) {
          console.error(`[run-loop] epoch ${params.epochOrdinal}: failed to copy pr_sync report artifact; using live report path: ${error instanceof Error ? error.message : String(error)}`);
        }
        const savePoint = addSavePoint(params.store, {
          campaignId: campaign.id,
          runId: params.runId,
          triggerKind: "pr_sync",
          label: `epoch-${params.epochOrdinal}-pr-sync`,
          commitSha: value.commitSha,
          baseRef: params.globals.game?.baseRef,
          baseSha: value.upstreamHeadSha,
          matchedCodePercent: value.matchedCodePercent,
          reportPath,
          payload: {
            kind: value.kind,
            measures: value.measures,
            matched_data_percent: value.matchedDataPercent ?? null,
            section_measures: value.sectionMeasures ?? {},
            prior_anchor: value.anchorSha,
          },
        });
        writeSavePointAnchor(params.store, {
          gameId,
          cycleUuid,
          savePointId: savePoint.id,
          commitSha: value.commitSha,
          triggerKind: "pr_sync",
          headlineScore: value.matchedCodePercent,
          artifactPaths: [reportPath],
          payload: {
            measures: value.measures,
            matched_data_percent: value.matchedDataPercent ?? null,
            section_measures: value.sectionMeasures ?? {},
            prior_anchor: value.anchorSha,
            upstream_revision: value.upstreamHeadSha,
          } as never,
          commandId: `command-boundary-pr-sync-${randomUUID()}`,
          correlationId: cycleUuid,
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

function completedBoundaryEvent(
  store: StateStore,
  runId: string,
  epochId: string,
  epochOrdinal: number,
  eventType: "boundary_sync" | "boundary_breakage_gate" | "ci_parity_gate" | "draft_pr_publish",
): Record<string, unknown> | null {
  const rows = store.db.query(
    `SELECT payload_json FROM events
     WHERE run_id = ? AND event_type = ?
     ORDER BY created_at DESC`,
  ).all(runId, eventType) as Array<{ payload_json: string }>;
  for (const row of rows) {
    const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
    if (payload.epoch_id === epochId || (payload.epoch_id == null && Number(payload.epoch) === epochOrdinal)) {
      return payload;
    }
  }
  return null;
}

function hasPrSyncSavePoint(store: StateStore, runId: string, epochOrdinal: number): boolean {
  return Boolean(store.db.query(
    `SELECT 1 FROM save_points
     WHERE run_id = ? AND trigger_kind = 'pr_sync' AND label = ?
     LIMIT 1`,
  ).get(runId, `epoch-${epochOrdinal}-pr-sync`));
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
  const run = store.db.query("SELECT cycle_uuid FROM runs WHERE id = ?").get(runId) as { cycle_uuid: string | null } | undefined;
  const cycleCorrelationId = run?.cycle_uuid ?? runId;
  const reconcilePendingIntegrationAttempt = params.dependencies?.reconcilePendingIntegrationAttempt ?? reconcilePendingIntegrationAttemptDefault;
  const boundaryRetry = config.boundaryRetry ?? { enabled: true, maxAttempts: 5, baseMs: 120_000, maxMs: 1_800_000 };
  const runEpochCycle = params.dependencies?.runEpochCycle ?? runEpochCycleDefault;
  const publishCycleDraftPr = params.dependencies?.publishCycleDraftPr ?? publishCycleDraftPrDefault;
  const runKnowledgeMaintenance = params.dependencies?.runKnowledgeMaintenance ?? runKnowledgeMaintenanceDefault;
  const ensureSchedulerEpochFromBoard = params.dependencies?.ensureSchedulerEpochFromBoard ?? ensureSchedulerEpochFromBoardDefault;
  const runBoundarySync = params.dependencies?.runBoundarySync;
  const writeEpochEvidence = params.dependencies?.closeSchedulerEpochWithEvidence ?? closeSchedulerEpochWithEvidence;
  let boundaryResult: EpochCycleResult | undefined;
  let reconciled = false;
  let knowledgeMaintenanceRun: Record<string, unknown> | undefined;
  let nextEpoch: ReturnType<typeof ensureSchedulerEpochFromBoardDefault> | undefined;
  let boundarySync: BoundarySyncResult | undefined;
  let breakageGate: MasterBreakageGateResult | undefined;
  const reconcileSkippedSteps = [
    "precommit_autofix", "snapshot_commit", "worktree_prepare", "configure", "report_build", "report_read",
    "confirmation_pass", "qa_scan", "report_publish", "regression_repair", "save_point",
  ];
  const reconcileRerunSteps: string[] = [];

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
        const reportRelPath = globals.game?.validation.reportPath ?? "build/GALE01/report.json";
        const reportPath = resolve(globals.repoRoot, reportRelPath);
        boundaryResult = {
          artifactDir: resolve(globals.stateDir, "epoch_artifacts", label),
          buildSteps: [], commitSha: retained.completed.commitSha, committed: true, durationMs: 0,
          label, lockedPathsExcluded: [], matchedCodePercent: null, matchedDataPercent: null,
          measures: {}, sectionMeasures: {}, qaGate: null,
          regressions: { brokenMatches: 0, fuzzyRegressions: 0, metricRegressions: 0, regressedFunctions: 0, regressedSections: 0 },
          repair: { paused: false, planned: 0, reasons: [], requeued: 0 },
          reportCopiedToRepo: true, savePoint: {} as EpochCycleResult["savePoint"],
          savePointEvidence: {} as EpochCycleResult["savePointEvidence"], savePointId: null,
          scoreDelta: 0, worktreeDir: globals.repoRoot,
        };
        const boundarySyncEvidence = completedBoundaryEvent(store, runId, schedulerEpochId ?? label, epochOrdinal, "boundary_sync");
        const prSyncRecorded = hasPrSyncSavePoint(store, runId, epochOrdinal);
        if (config.boundarySyncEnabled && (!boundarySyncEvidence || !prSyncRecorded)) {
          reconcileRerunSteps.push("boundary_sync");
          boundarySync = runBoundarySync
            ? await runBoundarySync({ params, epochResult: boundaryResult })
            : await productionBoundarySync(params);
        } else reconcileSkippedSteps.push("boundary_sync");
        const breakageEvidence = completedBoundaryEvent(store, runId, schedulerEpochId ?? label, epochOrdinal, "boundary_breakage_gate");
        if (config.breakageGateEnabled && !breakageEvidence) {
          reconcileRerunSteps.push("master_breakage_gate");
          const gate = params.dependencies?.runMasterBreakageGate ?? runMasterBreakageGateDefault;
          breakageGate = await gate({
            repoRoot: globals.repoRoot,
            stateDir: globals.stateDir,
            worktreeDir: globals.repoRoot,
            oursReportPath: reportPath,
            anchorSha: null,
            reportRelPath,
            changesOutPath: resolve(globals.stateDir, `${label}-master-breakage-changes.json`),
            prSyncFallbackReportPath: latestSavePointByTrigger(store, "pr_sync")?.reportPath ?? null,
          });
          addEvent(store, runId, "boundary_breakage_gate", "run-loop", {
            epoch: epochOrdinal, epoch_id: schedulerEpochId ?? label, status: breakageGate.status,
            baseline_kind: breakageGate.baselineKind, baseline_sha: breakageGate.baselineSha,
            baseline_report_path: breakageGate.baselineReportPath, ours_report_path: breakageGate.oursReportPath,
            changes_path: breakageGate.changesPath, breakages: breakageGate.breakages.slice(0, 50),
            moved: breakageGate.moved.slice(0, 50), reasons: breakageGate.reasons, created_by: "run-loop",
          });
          if (breakageGate.status === "breakage") {
            await (params.dependencies?.writeBoundaryBreakageDeferrals ?? writeBoundaryBreakageDeferralsDefault)({
              gameId: globals.game?.gameId ?? globals.gameId ?? "melee",
              cycleUuid: run?.cycle_uuid ?? null,
              gate: breakageGate,
            });
            boundaryResult.repair.paused = true;
            boundaryResult.repair.reasons.push(`master breakage gate: ${breakageGate.breakages.length} item(s)`);
          }
        } else reconcileSkippedSteps.push("master_breakage_gate");
        const gateEvidence = completedBoundaryEvent(store, runId, schedulerEpochId ?? label, epochOrdinal, "ci_parity_gate");
        for (const [enabled, step] of [[config.ciParityEnabled, "ci_parity_gate"], [config.preCommitGateEnabled, "pre_commit_gate"]] as const) {
          if (enabled && !gateEvidence) reconcileRerunSteps.push(step);
          else reconcileSkippedSteps.push(step);
        }
        let ciParity: CiParityResult | undefined;
        let preCommit: CiParityResult | undefined;
        if (!gateEvidence) {
          if (config.ciParityEnabled) ciParity = await (params.dependencies?.runCiParityGate ?? runCiParityGateDefault)({ worktreeDir: globals.repoRoot, sha: boundarySync?.headSha ?? retained.completed.commitSha });
          if (config.preCommitGateEnabled) preCommit = await (params.dependencies?.runPreCommitGate ?? runPreCommitGateDefault)({ worktreeDir: globals.repoRoot, cacheDir: resolve(globals.stateDir, "pre-commit-cache") });
          if (config.ciParityEnabled || config.preCommitGateEnabled) addEvent(store, runId, "ci_parity_gate", "run-loop", {
            epoch: epochOrdinal, epoch_id: schedulerEpochId ?? label,
            ci_parity_status: ciParity?.status ?? (config.ciParityEnabled ? "skipped" : "disabled"),
            pre_commit_status: preCommit?.status ?? (config.preCommitGateEnabled ? "skipped" : "disabled"),
            reasons: [...(ciParity?.reasons ?? []), ...(preCommit?.reasons ?? [])].slice(0, 20),
            steps: [
              ...(ciParity?.steps ?? []).map((step) => ({ gate: "ci_parity", name: step.name, exit_code: step.exitCode })),
              ...(preCommit?.steps ?? []).map((step) => ({ gate: "pre_commit", name: step.name, exit_code: step.exitCode })),
            ], created_by: "run-loop",
          });
        }
        const publishEvidence = completedBoundaryEvent(store, runId, schedulerEpochId ?? label, epochOrdinal, "draft_pr_publish");
        const publishCompleted = publishEvidence && ["finished", "skipped"].includes(String(publishEvidence.status));
        if (config.cycleDraftPrEnabled && !publishCompleted) {
          reconcileRerunSteps.push("draft_pr_publish");
          const publish = await publishCycleDraftPr({
            baseRef: globals.game?.baseRef, commitSha: boundarySync?.headSha ?? retained.completed.commitSha,
            epochLabel: label, epochOrdinal, matchedCodePercent: null,
            gameId: globals.game?.gameId ?? globals.gameId ?? null, qaGate: null,
            regressions: boundaryResult.regressions as unknown as Record<string, unknown>, repoRoot: globals.repoRoot,
            runId, savePointId: null, stateDir: globals.stateDir, store,
          });
          addEvent(store, runId, "draft_pr_publish", "run-loop", publish.status === "failed"
            ? { epoch: epochOrdinal, epoch_id: schedulerEpochId ?? label, status: "failed", error: publish.error ?? publish.reason, created_by: "run-loop" }
            : publish.status === "skipped"
              ? { epoch: epochOrdinal, epoch_id: schedulerEpochId ?? label, status: "skipped", reason: publish.reason ?? "publisher_skipped", created_by: "run-loop" }
              : { epoch: epochOrdinal, epoch_id: schedulerEpochId ?? label, status: "finished", pr_url: publish.url, head_sha: publish.commitSha, created_by: "run-loop" });
        } else reconcileSkippedSteps.push("draft_pr_publish");
        console.error(`[run-loop] epoch ${epochOrdinal}: pending integration attempt reconciled; skipped: ${reconcileSkippedSteps.join(", ")}; re-ran: ${reconcileRerunSteps.join(", ") || "none"}`);
        addEvent(store, runId, "epoch_boundary_reconciled", "run-loop", {
          epoch: epochOrdinal, epoch_id: schedulerEpochId ?? label, commit_sha: retained.completed.commitSha,
          skipped_steps: reconcileSkippedSteps, rerun_steps: reconcileRerunSteps, created_by: "run-loop",
        });
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
          preCommitAutofixEnabled: config.preCommitAutofixEnabled,
          runPreCommitAutofix: params.dependencies?.runPreCommitAutofix,
          boundaryBuildFixerEnabled: config.boundaryBuildFixerEnabled,
          runBoundaryBuildFixer: params.dependencies?.runBoundaryBuildFixer,
          deferBoundaryFindings: params.dependencies?.deferBoundaryFindings
            ?? ((findings) => writeBoundaryFindingsDefault(globals.game?.gameId ?? globals.gameId ?? "unknown", run?.cycle_uuid ?? null, findings)),
          qaScan: {
            orchestratorRoot: packageRoot(),
            addressNamedStaticDataAllowlist: globals.game?.validation.addressNamedStaticDataAllowlist,
          },
          regressionPauseThreshold: config.epochPauseThreshold,
          regressionRequeueLimit: config.epochRequeueLimit,
          reportRelPath: globals.game?.validation.reportPath,
          reportChangesRelPath: globals.game?.validation.reportChangesPath,
          worktreeDir: config.epochWorktreeDir,
        });
        boundaryResult = result;
        if (config.boundarySyncEnabled && result.commitSha) {
          const gameId = globals.game?.gameId ?? globals.gameId;
          const anchor = gameId && run?.cycle_uuid
            ? store.db.query("SELECT upstream_revision FROM game_upstream_anchors WHERE game_id = ? AND cycle_uuid = ?")
                .get(gameId, run.cycle_uuid) as { upstream_revision: string | null } | undefined
            : undefined;
          addEvent(store, runId, "boundary_sync", "run-loop", {
            epoch: epochOrdinal,
            status: "started",
            anchor_before: anchor?.upstream_revision ?? null,
            created_by: "run-loop",
          });
          try {
            boundarySync = runBoundarySync
              ? await runBoundarySync({ params, epochResult: result })
              : await productionBoundarySync(params);
            if (!boundarySync || !boundarySync.plan.drifted) {
              addEvent(store, runId, "boundary_sync", "run-loop", {
                epoch: epochOrdinal,
                status: "skipped",
                reason: boundarySync ? "not_drifted" : "sync_unavailable",
                created_by: "run-loop",
              });
            } else {
              const plan = boundarySync.plan;
              addEvent(store, runId, "boundary_sync", "run-loop", {
                epoch: epochOrdinal,
                status: "finished",
                anchor_before: plan.anchorSha,
                anchor_after: plan.upstreamHeadSha,
                merge_commit_sha: boundarySync.headSha,
                drifted: plan.drifted,
                upstream_taken_file_count: plan.upstreamTakenFiles.length,
                displaced_count: plan.targetsToRequeue.length,
                displaced: plan.targetsToRequeue.slice(0, 100).map((target) => ({
                  target_key: target.targetKey,
                  unit: target.unit,
                  symbol: target.symbol,
                  prior_kind: target.priorKind,
                  prior_score: target.priorScore,
                  upstream_landed_sha: target.upstreamLandedSha,
                })),
                created_by: "run-loop",
              });
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            addEvent(store, runId, "boundary_sync", "run-loop", {
              epoch: epochOrdinal,
              status: "failed",
              anchor_before: anchor?.upstream_revision ?? null,
              error: message.slice(0, 2000),
              created_by: "run-loop",
            });
            if (config.cycleDraftPrEnabled) {
              console.error(`[run-loop] epoch ${epochOrdinal}: cycle draft PR skipped (boundary_sync_failed)`);
              addEvent(store, runId, "draft_pr_publish", "run-loop", {
                epoch: epochOrdinal,
                status: "skipped",
                reason: "sync_failed",
                created_by: "run-loop",
              });
            }
            throw error;
          }
        } else {
          addEvent(store, runId, "boundary_sync", "run-loop", {
            epoch: epochOrdinal,
            status: "skipped",
            reason: config.boundarySyncEnabled ? "missing_commit" : "sync_disabled",
            created_by: "run-loop",
          });
        }
        if (config.breakageGateEnabled && result.commitSha) {
          const gameId = globals.game?.gameId ?? globals.gameId;
          const anchor = gameId && run?.cycle_uuid
            ? store.db.query("SELECT upstream_revision FROM game_upstream_anchors WHERE game_id = ? AND cycle_uuid = ?")
                .get(gameId, run.cycle_uuid) as { upstream_revision: string | null } | undefined
            : undefined;
          const reportRelPath = globals.game?.validation.reportPath ?? "build/GALE01/report.json";
          const gate = params.dependencies?.runMasterBreakageGate ?? runMasterBreakageGateDefault;
          breakageGate = await gate({
            repoRoot: globals.repoRoot,
            stateDir: globals.stateDir,
            worktreeDir: result.worktreeDir ?? null,
            oursReportPath: boundarySync?.changed
              ? resolve(globals.repoRoot, reportRelPath)
              : resolve(result.artifactDir, "report.json"),
            anchorSha: anchor?.upstream_revision ?? null,
            reportRelPath,
            changesOutPath: resolve(result.artifactDir, "master_breakage_changes.json"),
            prSyncFallbackReportPath: latestSavePointByTrigger(store, "pr_sync")?.reportPath ?? null,
          });
          addEvent(store, runId, "boundary_breakage_gate", "run-loop", {
            epoch: epochOrdinal,
            status: breakageGate.status,
            baseline_kind: breakageGate.baselineKind,
            baseline_sha: breakageGate.baselineSha,
            baseline_report_path: breakageGate.baselineReportPath,
            ours_report_path: breakageGate.oursReportPath,
            changes_path: breakageGate.changesPath,
            breakages: breakageGate.breakages.slice(0, 50),
            moved: breakageGate.moved.slice(0, 50),
            reasons: breakageGate.reasons,
            created_by: "run-loop",
          });
          if (result.savePointId) mergeSavePointPayload(store, result.savePointId, { master_breakage_gate: breakageGate });
          for (const item of breakageGate.moved) {
            console.error(`[run-loop] boundary breakage exempt (moved): ${item.unitName}::${item.itemName} -> ${item.movedToUnit}`);
          }
          if (breakageGate.status === "breakage") {
            await (params.dependencies?.writeBoundaryBreakageDeferrals ?? writeBoundaryBreakageDeferralsDefault)({
              gameId: globals.game?.gameId ?? globals.gameId ?? "melee",
              cycleUuid: run?.cycle_uuid ?? null,
              gate: breakageGate,
            });
            for (const item of breakageGate.breakages) {
              console.error(`[run-loop] boundary breakage: ${item.unitName}::${item.itemName} ${item.fromPercent}% -> ${item.toPercent}% (${item.kind}, baseline ${breakageGate.baselineKind} ${breakageGate.baselineSha?.slice(0, 10) ?? "n/a"})`);
            }
            result.repair = {
              ...result.repair,
              paused: true,
              reasons: [...(result.repair.reasons ?? []), `master breakage gate: ${breakageGate.breakages.length} item(s) went 100 -> <100 vs ${breakageGate.baselineKind}`],
            };
          } else if (breakageGate.status === "skipped" || breakageGate.status === "error") {
            console.error(`[run-loop] epoch ${epochOrdinal}: master breakage gate ${breakageGate.status}: ${breakageGate.reasons.join("; ")}`);
          }
        }
        if (config.cycleDraftPrEnabled) {
          const pushSha = boundarySync?.headSha ?? result.commitSha;
          let ciParity: CiParityResult | undefined;
          let preCommit: CiParityResult | undefined;
          if (config.ciParityEnabled && result.worktreeDir && pushSha) {
            const runCiParityGate = params.dependencies?.runCiParityGate ?? runCiParityGateDefault;
            ciParity = await runCiParityGate({ worktreeDir: result.worktreeDir, sha: pushSha });
          }
          const gitSwitchFailed = ciParity?.status === "error"
            && ciParity.steps.some((step) => step.name.toLowerCase().includes("git switch") && step.exitCode !== 0);
          if (config.preCommitGateEnabled && result.worktreeDir && pushSha && !gitSwitchFailed) {
            const runPreCommitGate = params.dependencies?.runPreCommitGate ?? runPreCommitGateDefault;
            preCommit = await runPreCommitGate({
              worktreeDir: result.worktreeDir,
              cacheDir: resolve(globals.stateDir, "pre-commit-cache"),
            });
          }
          if (config.ciParityEnabled || config.preCommitGateEnabled) {
            const reasons = [...(ciParity?.reasons ?? []), ...(preCommit?.reasons ?? [])].slice(0, 20);
            const gateSummary = {
              epoch: epochOrdinal,
              ci_parity_status: ciParity?.status ?? (config.ciParityEnabled ? "skipped" : "disabled"),
              pre_commit_status: preCommit?.status ?? (config.preCommitGateEnabled ? "skipped" : "disabled"),
              reasons,
              steps: [
                ...(ciParity?.steps ?? []).map((step) => ({ gate: "ci_parity", name: step.name, exit_code: step.exitCode })),
                ...(preCommit?.steps ?? []).map((step) => ({ gate: "pre_commit", name: step.name, exit_code: step.exitCode })),
              ],
              created_by: "run-loop",
            };
            addEvent(store, runId, "ci_parity_gate", "run-loop", gateSummary);
            if (result.savePointId) mergeSavePointPayload(store, result.savePointId, { ci_parity_gate: gateSummary });
          }
          const blockingGates = [ciParity, preCommit].filter(
            (gate): gate is CiParityResult => gate?.status === "failed" || gate?.status === "error",
          );
          if (blockingGates.length > 0) {
            const reasons = blockingGates.flatMap((gate) => gate.reasons).slice(0, 20);
            const reason = ciParity?.status === "failed" || ciParity?.status === "error"
              ? "ci_parity_failed"
              : "pre_commit_failed";
            addEvent(store, runId, "draft_pr_publish", "run-loop", {
              epoch: epochOrdinal,
              status: "skipped",
              reason,
              created_by: "run-loop",
            });
            console.error(
              `[run-loop] epoch ${epochOrdinal}: cycle draft PR skipped (ci_parity_failed: ${reasons.join("; ") || blockingGates.map((gate) => gate.status).join(", ")})`,
            );
          } else {
            addEvent(store, runId, "draft_pr_publish", "run-loop", {
              epoch: epochOrdinal,
              status: "started",
              created_by: "run-loop",
            });
            let publish;
            try {
              publish = await publishCycleDraftPr({
                baseRef: globals.game?.baseRef,
                commitSha: pushSha,
                epochLabel: result.label,
                epochOrdinal,
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
            } catch (error) {
              addEvent(store, runId, "draft_pr_publish", "run-loop", {
                epoch: epochOrdinal,
                status: "failed",
                error: (error instanceof Error ? error.message : String(error)).slice(0, 2000),
                created_by: "run-loop",
              });
              throw error;
            }
            addEvent(store, runId, "draft_pr_publish", "run-loop", publish.status === "failed"
              ? { epoch: epochOrdinal, status: "failed", error: publish.error ?? publish.reason ?? "draft PR publish failed", created_by: "run-loop" }
              : publish.status === "skipped"
                ? { epoch: epochOrdinal, status: "skipped", reason: publish.reason ?? "publisher_skipped", created_by: "run-loop" }
                : { epoch: epochOrdinal, status: "finished", pr_url: publish.url ?? undefined, head_sha: publish.commitSha ?? pushSha ?? undefined, created_by: "run-loop" });
            console.error(
              `[run-loop] epoch ${epochOrdinal}: cycle draft PR ${publish.status}` +
                `${publish.url ? ` ${publish.url}` : publish.reason ? ` (${publish.reason})` : publish.error ? ` (${publish.error})` : ""}`,
            );
          }
        } else {
          addEvent(store, runId, "draft_pr_publish", "run-loop", {
            epoch: epochOrdinal,
            status: "skipped",
            reason: "draft_pr_disabled",
            created_by: "run-loop",
          });
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
            writeEpochEvidence(store, schedulerEpochId, {
              status: "paused",
              boundaryStatus: "regression_pause",
              routingSummary: {
                trigger,
                save_point_id: result.savePointId,
                regressions: result.regressions,
                repair: result.repair,
                qa_gate: result.qaGate,
                breakage_gate: breakageGate ?? null,
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
            breakageGate,
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

    if (schedulerEpochId && reconciled) {
      closeSchedulerEpoch(store, schedulerEpochId, {
        status: boundaryResult?.repair.paused ? "paused" : "completed",
        boundaryStatus: boundaryResult?.repair.paused ? "regression_pause" : "success",
        routingSummary: {
          trigger, reconciled: true, commitSha: boundaryResult?.commitSha,
          skipped_steps: reconcileSkippedSteps, rerun_steps: reconcileRerunSteps,
          breakage_gate: breakageGate ?? null,
        },
      });
    } else if (schedulerEpochId) {
      const routingSummary = {
        trigger,
        dry_run: globals.dryRunAgents,
        save_point_id: boundaryResult?.savePointId ?? null,
        matched_code_percent: boundaryResult?.matchedCodePercent ?? null,
        regressions: boundaryResult?.regressions ?? null,
        repair: boundaryResult?.repair ?? null,
        qa_gate: boundaryResult?.qaGate ?? null,
        breakage_gate: breakageGate ?? null,
      };
      if (boundaryResult?.commitSha) {
        writeEpochEvidence(store, schedulerEpochId, {
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
      breakageGate,
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
    const retry = schedulerEpochId
      ? recordEpochBoundaryRetryFailure(
          store,
          schedulerEpochId,
          boundaryRetry,
          params.dependencies?.now?.() ?? new Date(),
        )
      : null;
    if (retry) {
      const payload = {
        epoch: epochOrdinal,
        epoch_id: schedulerEpochId,
        attempt: retry.attemptCount,
        max_attempts: boundaryRetry.maxAttempts,
        next_attempt_at: retry.nextAttemptAt,
        delay_ms: retry.delayMs,
        error: message.slice(0, 2000),
        created_by: "run-loop",
      };
      addEvent(store, runId, retry.terminal ? "epoch_boundary_retry_exhausted" : "epoch_boundary_retry_scheduled", "run-loop", payload);
      if (retry.terminal) {
        console.error(`[run-loop] EPOCH BOUNDARY TERMINAL: epoch ${epochOrdinal} exhausted ${retry.attemptCount}/${boundaryRetry.maxAttempts} attempts; run will park paused for operator recovery`);
      } else {
        console.error(`[run-loop] epoch ${epochOrdinal}: boundary retry ${retry.attemptCount + 1}/${boundaryRetry.maxAttempts} scheduled for ${retry.nextAttemptAt}`);
      }
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
      breakageGate,
      terminal: retry?.terminal ?? false,
    };
  }
}
