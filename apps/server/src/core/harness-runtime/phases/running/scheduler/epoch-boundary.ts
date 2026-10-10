import { publishHarnessEpochSync } from "./harness-sync-publication.js";
import { requireLease } from "@server/core/harness-state";
import { getHarnessState, requestHarnessExecution, transitionHarnessState } from "@server/core/harness-state/state.js";
import { recordUpstreamDrift } from "@server/core/harness-state/upstream-drift.js";
import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { runGameSourcePipeline as runGameSourcePipelineDefault } from "@server/core/knowledge-v2/ingest/game-sources.js";
import { packageRoot } from "@server/core/knowledge";
import { gameKnowledgeRoot } from "@server/core/knowledge/paths.js";
import {
  runKnowledgeIntake as runKnowledgeIntakeDefault,
} from "@server/core/knowledge-v2/ingest/harness-intake.js";
import { insertEvent, type EventRefInput } from "@server/core/knowledge-v2/records/index.js";
import { openKnowledgeStore } from "@server/core/knowledge-v2/storage/store.js";
import { forceReportRun as forceReportRunDefault, reportRunOptionsForGame } from "@server/core/validation/report";
import {
  runCiParityGate as runCiParityGateDefault,
  runPreCommitGate as runPreCommitGateDefault,
  type CiParityResult,
} from "@server/core/validation/ci-parity/index.js";
import { sectionMeasuresFromReport } from "@server/core/validation/objdiff/section-measures.js";
import { addSavePoint, ensureCampaign, latestSavePointByTrigger, mergeSavePointPayload } from "@server/core/harness-runtime/phases/pr/state";
import { mergedPullRequestNumbers } from "@server/core/harness-runtime/phases/sync/upstream.js";
import { runBoundarySync as runBoundarySyncDefault, type BoundarySyncResult } from "@server/core/harness-runtime/phases/running/epochs/boundary-sync.js";
import { recordBoundaryRecovery, reportRecoveryTargets } from "../epochs/boundary-recovery.js";
import { runMasterBreakageGate as runMasterBreakageGateDefault, type MasterBreakageGateResult } from "@server/core/harness-runtime/phases/running/epochs/breakage-gate.js";
import { reconcilePendingIntegrationAttempt as reconcilePendingIntegrationAttemptDefault } from "@server/core/harness-state";
import {
  runEpochSettlement as runEpochSettlementDefault,
  type BoundaryBuildFixerInput,
  type BoundaryBuildFixerResult,
  type BoundaryDeferredFinding,
  type EpochSettlementResult,
} from "@server/core/harness-runtime/phases/running/epochs";
import { publishHarnessDraftPr as publishHarnessDraftPrDefault } from "@server/core/harness-runtime/phases/running/epochs/harness-draft-pr.js";
import {
  PhaseTracker,
  isBoundaryStepError,
  stepFailureCheckpoint,
} from "@server/core/harness-runtime/phases/running/epochs/step-failure.js";
import {
  addEvent,
  closeSchedulerEpoch,
  closeSchedulerEpochWithEvidence,
  activeClaimsForRun,
  blockingWorkerOutputIntegrationCount,
  readRunBoundarySyncHold,
  recordEpochBoundaryRetryFailure,
  type SchedulerEpochConfig,
  type StateStore,
} from "@server/core/harness-runtime/run-state";
import {
  runKnowledgeGraphRebuild,
  runKnowledgeMaintenance as runKnowledgeMaintenanceDefault,
  type KnowledgeMaintenanceProgressEvent,
} from "@server/core/knowledge/jobs/kg.js";
import { ensureSchedulerEpochFromBoard as ensureSchedulerEpochFromBoardDefault } from "./tick.js";
import type { GlobalArgs, SyncMergePolicy, WriteSetIntegrationFlags } from "@server/core/game-registry/runtime-options.js";

export type KnowledgeProgressReporter = (
  store: StateStore,
  runId: string,
  params: { lane: string; mode?: string; epochId?: string | null; epochOrdinal?: number | null; repoRoot?: string },
) => (event: KnowledgeMaintenanceProgressEvent) => void;

type ReconcilePendingIntegrationAttempt = typeof reconcilePendingIntegrationAttemptDefault;
type RunEpochSettlement = typeof runEpochSettlementDefault;
type PublishHarnessDraftPr = typeof publishHarnessDraftPrDefault;
type RunKnowledgeMaintenance = typeof runKnowledgeMaintenanceDefault;
type EnsureSchedulerEpochFromBoard = typeof ensureSchedulerEpochFromBoardDefault;
type RunBoundarySync = (input: { params: EpochBoundaryParams; epochResult: EpochSettlementResult }) => Promise<BoundarySyncResult | undefined>;
type ProductionRunBoundarySync = typeof runBoundarySyncDefault;
type CloseSchedulerEpochWithEvidence = typeof closeSchedulerEpochWithEvidence;
export interface BoundaryBreakageDeferral {
  gameId: string;
  harnessId: string | null;
  gate: MasterBreakageGateResult;
}
type WriteBoundaryBreakageDeferrals = (input: BoundaryBreakageDeferral) => void | Promise<void>;

export interface BoundaryKnowledgeEvent {
  id: string;
  stableKey?: string;
  sourcePath?: string;
  symbol?: string;
  cause?: "upstream_change";
  summary: string;
  refs: EventRefInput[];
}

interface BoundaryKnowledgeTarget {
  id: string;
}

export interface EpochBoundaryDependencies {
  reconcilePendingIntegrationAttempt?: ReconcilePendingIntegrationAttempt;
  runEpochSettlement?: RunEpochSettlement;
  publishHarnessDraftPr?: PublishHarnessDraftPr;
  runKnowledgeMaintenance?: RunKnowledgeMaintenance;
  ensureSchedulerEpochFromBoard?: EnsureSchedulerEpochFromBoard;
  runBoundarySync?: RunBoundarySync;
  productionRunBoundarySync?: ProductionRunBoundarySync;
  closeSchedulerEpochWithEvidence?: CloseSchedulerEpochWithEvidence;
  runMasterBreakageGate?: typeof runMasterBreakageGateDefault;
  runCiParityGate?: typeof runCiParityGateDefault;
  runPreCommitGate?: typeof runPreCommitGateDefault;
  runPreCommitAutofix?: typeof import("@server/core/validation/ci-parity/index.js").runPreCommitAutofix;
  writeBoundaryBreakageDeferrals?: WriteBoundaryBreakageDeferrals;
  runBoundaryBuildFixer?: (input: BoundaryBuildFixerInput) => Promise<BoundaryBuildFixerResult>;
  deferBoundaryFindings?: (input: BoundaryDeferredFinding[]) => Promise<void> | void;
  forceReportRun?: typeof forceReportRunDefault;
  runKnowledgeIntake?: typeof runKnowledgeIntakeDefault;
  runGameSourcePipeline?: typeof runGameSourcePipelineDefault;
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
    harnessDraftPrEnabled: boolean;
    ciParityEnabled: boolean;
    preCommitGateEnabled: boolean;
    preCommitAutofixEnabled: boolean;
    linkCompleteUnitsEnabled?: boolean;
    boundarySyncEnabled: boolean;
    syncMergePolicy?: SyncMergePolicy;
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
  boundaryResult?: EpochSettlementResult;
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

async function boundaryGitOutput(repoRoot: string, args: string[]): Promise<string> {
  const proc = Bun.spawn(["git", "-C", repoRoot, ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(`boundary knowledge intake git ${args[0] ?? "command"} failed: ${(stderr || stdout).trim() || `exit ${exitCode}`}`);
  }
  return stdout.trim();
}

function boundaryKnowledgeTargets(
  store: ReturnType<typeof openKnowledgeStore>,
  event: BoundaryKnowledgeEvent,
): BoundaryKnowledgeTarget[] {
  if (event.stableKey) {
    const target = store.db.query<BoundaryKnowledgeTarget, [string]>(
      "SELECT id FROM target WHERE stable_key = ? AND identity_status = 'current'",
    ).get(event.stableKey);
    if (target) return [target];
  }
  if (event.sourcePath && event.symbol) {
    const target = store.db.query<BoundaryKnowledgeTarget, [string, string]>(`SELECT t.id
        FROM target t
        JOIN entity e ON e.id = t.unit_entity_id
        WHERE e.locator = ? AND t.symbol = ? AND t.identity_status = 'current'`,
      ).get(event.sourcePath, event.symbol);
    if (target) return [target];
  }
  if (!event.sourcePath) return [];
  return store.db.query<BoundaryKnowledgeTarget, [string]>(`SELECT t.id
      FROM target t
      JOIN entity e ON e.id = t.unit_entity_id
      WHERE e.locator = ? AND t.identity_status = 'current'
      ORDER BY t.id`,
    ).all(event.sourcePath);
}

function writeBoundaryKnowledgeEvents(gameId: string, events: readonly BoundaryKnowledgeEvent[]): void {
  if (events.length === 0) return;
  const store = openKnowledgeStore({ gameId });
  try {
    for (const event of events) {
      const targets = boundaryKnowledgeTargets(store, event);
      if (targets.length === 0) {
        console.warn(`[run-loop] boundary knowledge event skipped: no current V2 target for ${event.stableKey ?? `${event.sourcePath ?? "unknown path"}::${event.symbol ?? "unknown symbol"}`}`);
        continue;
      }
      for (const target of targets) {
        const eventId = targets.length === 1
          ? event.id
          : `${event.id}-${createHash("sha256").update(target.id).digest("hex").slice(0, 12)}`;
        if (store.db.query("SELECT 1 FROM event WHERE id = ?").get(eventId)) continue;
        insertEvent(store, {
          id: eventId,
          targetId: target.id,
          kind: "note",
          cause: event.cause ?? null,
          summary: event.summary,
        }, event.refs);
      }
    }
  } finally {
    store.close();
  }
}

function writeBoundaryBreakageDeferralsDefault(input: BoundaryBreakageDeferral): void {
  const events = input.gate.breakages.map((item) => {
    const targetKey = `${item.unitName}::${item.itemName}`;
    const upstreamSha = input.gate.baselineSha;
    const id = createHash("sha256")
      .update(`${input.harnessId ?? "no-harness"}:${targetKey}:${upstreamSha ?? "unknown-upstream"}:boundary_breakage_deferred`)
      .digest("hex");
    return {
      id: `boundary-${id}`,
      stableKey: targetKey.replace("::", ":"),
      cause: "upstream_change" as const,
      summary: `${targetKey} regressed locally from score ${item.fromPercent} to ${item.toPercent} against upstream ${upstreamSha ?? "unknown"}; outcome: deferred to next-epoch admission (${item.bytesDelta} bytes).`,
      refs: upstreamSha ? [{ refKind: "commit" as const, refId: upstreamSha }] : [],
    };
  });
  writeBoundaryKnowledgeEvents(input.gameId, events);
}

/**
 * The knowledge note for one boundary finding. Deferred findings keep the
 * re-admission instruction; an adjudicated advisory only records the
 * acceptance evidence, because there is nothing to re-admit or repair.
 */
export function boundaryFindingKnowledgeEvent(
  harnessId: string | null,
  upstreamSha: string | null,
  finding: BoundaryDeferredFinding,
): BoundaryKnowledgeEvent {
  const target = [finding.unit, finding.symbol].filter(Boolean).join("::") || finding.sourcePath || "unknown target";
  const id = createHash("sha256").update(`${harnessId ?? "no-harness"}:${finding.reason}:${target}:${finding.detail}`).digest("hex");
  const adjudication = finding.reason === "boundary_qa_adjudicated" ? finding.adjudication : undefined;
  return {
    id: `boundary-${id}`,
    stableKey: finding.unit && finding.symbol ? `${finding.unit}:${finding.symbol}` : undefined,
    sourcePath: finding.sourcePath,
    symbol: finding.symbol,
    summary: adjudication
      ? `Accepted llm_review advisory ${adjudication.ruleId} at ${adjudication.file} (fingerprint ${adjudication.fingerprint}, checkpoints ${adjudication.checkpointIds.join(", ")}); no action needed.`
      : `${finding.reason}: ${target}. ${finding.detail}${upstreamSha ? ` Upstream revision: ${upstreamSha}.` : ""} Re-admit through next-epoch admission; do not repair at the boundary.`,
    refs: upstreamSha ? [{ refKind: "commit" as const, refId: upstreamSha }] : [],
  };
}

function writeBoundaryFindingsDefault(
  gameId: string,
  harnessId: string | null,
  upstreamSha: string | null,
  findings: BoundaryDeferredFinding[],
): void {
  if (findings.length === 0) return;
  writeBoundaryKnowledgeEvents(gameId, findings.map((finding) => boundaryFindingKnowledgeEvent(harnessId, upstreamSha, finding)));
}

async function productionBoundarySync(
  params: EpochBoundaryParams,
  boundaryAttempt: number | null,
): Promise<BoundarySyncResult | undefined> {
  const gameId = params.globals.game?.gameId ?? params.globals.gameId;
  if (!gameId) return undefined;
  const harness = getHarnessState(params.store.db, gameId);
  if (!harness?.source.head || !harness.source.upstream_revision) throw new Error(`boundary sync requires accepted harness source for ${gameId}`);
  requireLease(params.store, params.leaseId, gameId);
  if (activeClaimsForRun(params.store, params.runId).length || blockingWorkerOutputIntegrationCount(params.store, params.runId)) {
    throw new Error("Epoch Sync requires all claims and worker integration to settle");
  }
  const anchor = { upstream_revision: harness.source.upstream_revision };
  const rows = params.store.db.query(`
    SELECT id, target_key, unit, symbol, source_path, baseline_score
    FROM epoch_targets WHERE run_id = ? AND status = 'finished'
  `).all(params.runId) as Array<Record<string, unknown>>;
  const reportRelPath = params.globals.game?.validation.reportPath ?? "build/GALE01/report.json";
  const reportPath = resolve(params.globals.repoRoot, reportRelPath);
  const achieved = new Map((existsSync(reportPath)
    ? reportRecoveryTargets(JSON.parse(readFileSync(reportPath, "utf8"))) : []).map((target) => [target.targetKey, target]));
  const campaign = ensureCampaign(params.store, { gameId, baseRef: params.globals.game?.baseRef });
  let pendingAnchorSha: string | null = null;
  let sourceManifests: Array<Record<string, unknown>> = [];
  const runBoundarySync = params.dependencies?.productionRunBoundarySync ?? runBoundarySyncDefault;
  const forceReportRun = params.dependencies?.forceReportRun ?? forceReportRunDefault;
  const runKnowledgeIntake = params.dependencies?.runKnowledgeIntake ?? runKnowledgeIntakeDefault;
  return runBoundarySync({
    repoRoot: params.globals.repoRoot,
    stateDir: params.globals.stateDir,
    anchorSha: anchor.upstream_revision,
    upstreamRef: params.globals.game?.baseRef,
    reportRelPath,
    targets: rows.map((row) => ({
      epochTargetId: String(row.id),
      targetKey: String(row.target_key),
      sourcePath: String(row.source_path),
      unit: String(row.unit),
      symbol: String(row.symbol),
      priorKind: achieved.get(String(row.target_key))?.priorKind ?? null,
      priorScore: achieved.get(String(row.target_key))?.priorScore ?? null,
    })),
    buildFixerEnabled: params.config.boundaryBuildFixerEnabled,
    mergePolicy: params.config.syncMergePolicy ?? "score",
    prepareMergeReport: async () => {
      await forceReportRun(params.globals.repoRoot, { ...reportRunOptionsForGame(params.globals.game), resetBaseline: false, generateChanges: false });
    },
    onMergePolicyFile: (entry) => {
      console.error(`[run-loop] boundary sync policy: ${entry.message}`);
      addEvent(params.store, params.runId, "epoch_checkpoint_progress", "epoch-cycle", {
        epoch: params.epochOrdinal,
        epoch_id: params.schedulerEpochId ?? null,
        boundary_attempt: boundaryAttempt,
        phase: "boundary_sync_policy_merge",
        status: "finished",
        path: entry.path,
        message: entry.message,
        strategy: entry.result?.strategy ?? "majority_fallback",
        decisions: entry.result?.decisions.map((decision) => ({
          function: decision.functionName,
          side: decision.side,
          reason: decision.reason,
        })) ?? [],
        fallback: entry.result?.fallback ?? null,
        whole_file_fallback_reason: entry.wholeFileFallbackReason,
        upstream_report_fallback_reason: entry.upstreamReportFallbackReason,
        created_by: "epoch-cycle",
      });
    },
    onBuildFixerEvent: (status, fixer) => addEvent(params.store, params.runId, "epoch_checkpoint_progress", "epoch-cycle", {
      epoch: params.epochOrdinal,
      epoch_id: params.schedulerEpochId ?? null,
      boundary_attempt: boundaryAttempt,
      phase: "boundary_sync_build_fixer",
      status,
      message: status === "started"
        ? "starting one bounded codex attempt for the post-merge report build"
        : status === "propagated"
          ? `committed ${(fixer?.files ?? []).length} boundary-sync build-fixer file(s)`
        : fixer?.timedOut
          ? "bounded codex boundary-sync build-fixer timed out"
          : `bounded codex boundary-sync build-fixer exited ${fixer?.exitCode ?? "unknown"}`,
      outcome: fixer ? (fixer.timedOut ? "timeout" : fixer.exitCode === 0 ? "completed" : "failed") : undefined,
      exit_code: fixer?.exitCode,
      timed_out: fixer?.timedOut,
      output: fixer?.output,
      files: fixer?.files,
      commit_sha: fixer?.commitSha,
      worktree_dir: params.globals.repoRoot,
      created_by: "epoch-cycle",
    }),
    symbolCheck: params.globals.game?.validation?.symbolCheck ?? null,
    onSymbolCheckEvent: (status, detail) => addEvent(params.store, params.runId, "epoch_checkpoint_progress", "epoch-cycle", {
      epoch: params.epochOrdinal,
      epoch_id: params.schedulerEpochId ?? null,
      boundary_attempt: boundaryAttempt,
      phase: "boundary_sync_symbol_check",
      status,
      message: status === "started"
        ? `validating map symbols of ${detail.files.length} changed C++ unit(s) against upstream ${detail.baselineRevision.slice(0, 10)} in the sandbox`
        : detail.result?.status === "tool_unavailable"
          ? `symbol check could not run: ${detail.result.toolError ?? "unknown"}`
          : `symbol check ${detail.reasons?.length ? "found new map-symbol errors" : "passed"}: ${detail.result?.units.filter((unit) => unit.status === "failed").length ?? 0} of ${detail.files.length} unit(s) regressed`,
      outcome: status === "started" ? undefined : detail.result?.status === "tool_unavailable" ? "failed" : detail.reasons?.length ? "blocked" : "completed",
      baseline_revision: detail.baselineRevision,
      files: detail.files,
      reasons: detail.reasons ?? [],
      symbol_check: detail.result ? { status: detail.result.status, map: detail.result.mapPath, validator: detail.result.validator, baseline: detail.result.baseline, units: detail.result.units.map((unit) => ({ source: unit.source, unit: unit.unit, status: unit.status, result: unit.result, new: unit.newErrors, inherited: unit.inheritedErrors, resolved: unit.resolvedErrors, new_lines: unit.newLines })) } : null,
      worktree_dir: params.globals.repoRoot,
      created_by: "epoch-cycle",
    }),
    onUpstreamDrift: (drift) => {
      // Non-blocking: the boundary merges upstream right after this; the notice
      // documents the drift and its first appearance lands on the timeline.
      recordUpstreamDrift(params.store.db, { gameId, drift });
      if (drift.upstream_ahead_by > 0) console.error(`[run-loop] upstream ${drift.upstream_ref} is ${drift.upstream_ahead_by} commit(s) ahead of accepted ${drift.accepted_upstream.slice(0, 10)}`);
    },
    formatting: params.globals.game?.validation?.formatting ?? null,
    onFormatEvent: (status, detail) => addEvent(params.store, params.runId, "epoch_checkpoint_progress", "epoch-cycle", {
      epoch: params.epochOrdinal,
      epoch_id: params.schedulerEpochId ?? null,
      boundary_attempt: boundaryAttempt,
      phase: "boundary_sync_format",
      status,
      message: status === "started"
        ? `running the sandbox's pinned clang-format over ${detail.files.length} changed source file(s)`
        : status === "propagated"
          ? `committed ${(detail.changedFiles ?? []).length} boundary-sync clang-format file(s)`
          : `clang-format ${detail.version ?? "unknown"} left ${(detail.changedFiles ?? []).length} of ${detail.files.length} file(s) changed`,
      outcome: status === "started" ? undefined : "completed",
      clang_format_version: detail.version ?? null,
      files: detail.files,
      changed_files: detail.changedFiles,
      commit_sha: detail.commitSha,
      worktree_dir: params.globals.repoRoot,
      created_by: "epoch-cycle",
    }),
    hooks: {
      ingestMergedUpstream: async ({ previousAnchorSha, upstreamHeadSha }) => {
        const range = `${previousAnchorSha}..${upstreamHeadSha}`;
        const [logText, expectedHead] = await Promise.all([
          boundaryGitOutput(params.globals.repoRoot, ["log", "--first-parent", "--format=%s%n%b", range]),
          boundaryGitOutput(params.globals.repoRoot, ["rev-parse", "--short", "HEAD"]),
        ]);
        const knowledgeRoot = gameKnowledgeRoot(gameId);
        await runKnowledgeIntake({
          knowledgeRoot,
          checkoutRoot: params.globals.repoRoot,
          reportPath: resolve(params.globals.repoRoot, reportRelPath),
          expectedHead,
          prNumbers: mergedPullRequestNumbers(logText),
          sourceRoot: resolve(knowledgeRoot, "sources/code_context/past_prs"),
          orchestratorDbPath: resolve(params.globals.stateDir, "orchestrator.sqlite"),
          fetch: { enabled: false },
          lanes: ["reconcile", "attempts"],
          dryRun: false,
          log: (message) => console.error(`[run-loop] boundary knowledge intake: ${message}`),
        });
        const sourceReadiness = await (params.dependencies?.runGameSourcePipeline ?? runGameSourcePipelineDefault)({
          gameId, gameRoot: dirname(knowledgeRoot), knowledgeRoot,
          stateRoot: params.globals.stateDir,
          operationId: `epoch-sync:${params.schedulerEpochId ?? params.epochOrdinal}`,
          mode: "sync",
        });
        sourceManifests = sourceReadiness.sources.map(source => ({ identity: source.identity, capture: source.capture ?? null, readiness: source.readiness }));
        if (!sourceReadiness.ready) throw new Error(`Source readiness blocked: ${sourceReadiness.sources.filter(source => source.readiness !== "ready" && source.readiness !== "disabled").map(source => `${source.identity.source_id}: ${source.reason ?? source.readiness}`).join("; ")}`);
      },
      appendOverrideNote: (item) => {
        const knowledge = openKnowledgeStore({ gameId });
        try { recordBoundaryRecovery(knowledge, item); }
        finally { knowledge.close(); }
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
        await forceReportRun(params.globals.repoRoot, { ...reportRunOptionsForGame(params.globals.game), resetBaseline: false });
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
        const prSyncArtifactDir = resolve(params.globals.stateDir, "pr_sync_reports", `epoch-${params.schedulerEpochId ?? params.epochOrdinal}`);
        mkdirSync(prSyncArtifactDir, { recursive: true });
        reportPath = resolve(prSyncArtifactDir, "report.json");
        copyFileSync(liveReportPath, reportPath);
        const savePoint = addSavePoint(params.store, {
          id: `epoch-pr-sync-save-point-${params.schedulerEpochId ?? params.epochOrdinal}`,
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
            epoch_id: params.schedulerEpochId ?? null,
            boundary_attempt: boundaryAttempt,
            measures: value.measures,
            matched_data_percent: value.matchedDataPercent ?? null,
            section_measures: value.sectionMeasures ?? {},
            prior_anchor: value.anchorSha,
            source_manifests: sourceManifests,
          },
        });

      },
      advanceAnchor: ({ upstreamHeadSha }) => {
        pendingAnchorSha = upstreamHeadSha;
      },
      advanceHarnessHead: ({ headSha }) => {
        if (!pendingAnchorSha) throw new Error("boundary sync anchor advance was not prepared");
        publishHarnessEpochSync(params.store, { gameId, runId: params.runId,
          epochId: params.schedulerEpochId ?? String(params.epochOrdinal), priorHead: harness.source.head!,
          head: headSha, upstream: pendingAnchorSha,
          savePointId: `epoch-pr-sync-save-point-${params.schedulerEpochId ?? params.epochOrdinal}` });
      },
    },
  });
}

function knowledgeMaintenanceArgs(args: Map<string, string | true>, runId: string): Map<string, string | true> {
  const next = new Map<string, string | true>([["--run-id", runId]]);
  for (const key of [
    "--agent-state-enrichment",
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

function publicationGateFailureReason(ciParityStatus: unknown, preCommitStatus: unknown): string | null {
  if (ciParityStatus === "failed" || ciParityStatus === "error") return "ci_parity_failed";
  if (preCommitStatus === "failed" || preCommitStatus === "error") return "pre_commit_failed";
  return null;
}

function completedBoundaryEvent(
  store: StateStore,
  runId: string,
  epochId: string,
  boundaryAttempt: number,
  eventType: "boundary_sync" | "boundary_breakage_gate" | "ci_parity_gate" | "draft_pr_publish",
): Record<string, unknown> | null {
  const rows = store.db.query(
    `SELECT payload_json FROM events
     WHERE run_id = ? AND event_type = ?
     ORDER BY created_at DESC, rowid DESC`,
  ).all(runId, eventType) as Array<{ payload_json: string }>;
  for (const row of rows) {
    const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
    if (payload.epoch_id === epochId && payload.boundary_attempt === boundaryAttempt && (eventType !== "boundary_sync" || payload.status === "finished")) {
      return payload;
    }
  }
  return null;
}

function hasPrSyncSavePoint(store: StateStore, runId: string, epochId: string, boundaryAttempt: number): boolean {
  return Boolean(store.db.query(
    `SELECT 1 FROM save_points
     WHERE run_id = ? AND trigger_kind = 'pr_sync'
       AND json_extract(payload_json, '$.epoch_id') = ?
       AND json_extract(payload_json, '$.boundary_attempt') = ?
     LIMIT 1`,
  ).get(runId, epochId, boundaryAttempt));
}

interface BoundaryProgressEvent {
  label: string | null;
  message: string;
  phase: string;
  status: "started" | "finished" | "skipped" | "warning" | "failed";
  [key: string]: unknown;
}

function epochProgress(store: StateStore, runId: string, event: BoundaryProgressEvent): void {
  console.error(`[epoch] ${event.label ?? runId.slice(0, 8)} ${event.phase} ${event.status}: ${event.message}`);
  addEvent(store, runId, "epoch_checkpoint_progress", "epoch-cycle", {
    ...event,
    created_by: "epoch-cycle",
  });
}

/**
 * Operator boundary Sync hold: the settled epoch keeps its save point and reads
 * sync_held, and the harness parks paused the way a user pause does, releasing the
 * Sync workflow its evidence opened. Resuming with the hold cleared runs the Sync.
 */
function holdBoundarySync(params: EpochBoundaryParams, held: { boundaryAttempt: number; commitSha: string; savePointId: string | null }): void {
  const { store, globals, runId, schedulerEpochId, epochOrdinal } = params;
  const gameId = globals.game?.gameId ?? globals.gameId;
  const evidence = { epoch: epochOrdinal, epoch_id: schedulerEpochId ?? null, boundary_attempt: held.boundaryAttempt, commit_sha: held.commitSha, save_point_id: held.savePointId };
  store.db.transaction(() => {
    if (schedulerEpochId) {
      store.db.query("UPDATE epochs SET boundary_status = 'sync_held' WHERE id = ? AND status = 'completed' AND boundary_status IN ('sync_pending', 'sync_held')").run(schedulerEpochId);
    }
    addEvent(store, runId, "boundary_sync_held", "run-loop", { ...evidence, created_by: "run-loop" });
    const harness = gameId ? getHarnessState(store.db, gameId) : null;
    const releaseSync = harness?.execution.workflow === "sync" && harness.execution.status === "active";
    if (gameId && harness && (harness.execution.desired !== "paused" || releaseSync)) requestHarnessExecution(store.db, {
      gameId, desired: "paused", expectedRevision: harness.identity.revision,
      commandId: `boundary-sync-hold:${schedulerEpochId ?? runId}:${harness.identity.revision}`,
      ...(releaseSync ? { execution: { workflow: "none" as const, status: "paused" as const } } : {}),
      boundary: { runId, epochId: schedulerEpochId ?? null, evidence: { reason: "boundary_sync_hold", ...evidence } },
    });
  })();
  console.error(`[run-loop] epoch ${epochOrdinal}: settled; holding before boundary Sync (operator hold)`);
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
  const harnessGameId = globals.game?.gameId ?? globals.gameId;
  const canonicalState = harnessGameId ? getHarnessState(store.db, harnessGameId) : null;
  if (!globals.dryRunAgents && !canonicalState) throw new Error("Epoch boundary requires a harness");
  config.boundarySyncEnabled = true;
  const reconcilePendingIntegrationAttempt = params.dependencies?.reconcilePendingIntegrationAttempt ?? reconcilePendingIntegrationAttemptDefault;
  const boundaryRetry = config.boundaryRetry ?? { enabled: true, maxAttempts: 5, baseMs: 120_000, maxMs: 1_800_000 };
  const runEpochSettlement = params.dependencies?.runEpochSettlement ?? runEpochSettlementDefault;
  const publishHarnessDraftPr = params.dependencies?.publishHarnessDraftPr ?? publishHarnessDraftPrDefault;
  const runKnowledgeMaintenance = params.dependencies?.runKnowledgeMaintenance ?? runKnowledgeMaintenanceDefault;
  const ensureSchedulerEpochFromBoard = params.dependencies?.ensureSchedulerEpochFromBoard ?? ensureSchedulerEpochFromBoardDefault;
  const runBoundarySync = params.dependencies?.runBoundarySync;
  const persistEpochEvidence = params.dependencies?.closeSchedulerEpochWithEvidence ?? closeSchedulerEpochWithEvidence;
  let epochEvidenceRecorded = false;
  const writeEpochEvidence: CloseSchedulerEpochWithEvidence = (state, epochId, evidence) => {
    if (epochEvidenceRecorded) return closeSchedulerEpoch(state, epochId, {
      status: evidence.status, boundaryStatus: evidence.boundaryStatus, routingSummary: evidence.routingSummary,
    });
    const recorded = persistEpochEvidence(state, epochId, evidence);
    epochEvidenceRecorded = true;
    return recorded;
  };
  let boundaryResult: EpochSettlementResult | undefined;
  let reconciled = false;
  let knowledgeMaintenanceRun: Record<string, unknown> | undefined;
  let nextEpoch: ReturnType<typeof ensureSchedulerEpochFromBoardDefault> | undefined;
  let boundarySync: BoundarySyncResult | undefined;
  let breakageGate: MasterBreakageGateResult | undefined;
  let boundaryAttempt: number | null = null;
  const label = `epoch-${epochOrdinal}`;
  const phaseTracker = new PhaseTracker<BoundaryProgressEvent>((event) => {
    if (event.status === "failed") epochProgress(store, runId, event);
  });
  const trackPhase = (phase: string, status: "started" | "finished"): void => {
    phaseTracker.progress({ label, phase, status, message: `${phase} ${status}` });
  };
  const reconcileSkippedSteps = [
    "link_complete_units", "precommit_autofix", "snapshot_commit", "worktree_prepare", "configure", "report_build", "report_read",
    "confirmation_pass", "qa_scan", "report_publish", "regression_repair", "save_point",
  ];
  const reconcileRerunSteps: string[] = [];

  try {
    if (globals.dryRunAgents) {
      // Dry runs skip the snapshot/build but still close/start scheduler epochs
      // so tests exercise deterministic admission.
    } else {
      const savedEpoch = schedulerEpochId ? store.db.query("SELECT payload_json FROM events WHERE run_id = ? AND event_type = 'epoch_checkpoint_progress' AND json_extract(payload_json, '$.phase') = 'epoch_settled_evidence' AND json_extract(payload_json, '$.epoch_id') = ? ORDER BY created_at DESC LIMIT 1").get(runId, schedulerEpochId) as { payload_json: string } | null : null;
      const savedResult = savedEpoch ? JSON.parse(savedEpoch.payload_json) as { result: EpochSettlementResult; attempt: number } : null;
      const retained = savedResult ? { status: "completed" as const, completed: { epochId: schedulerEpochId!, commitSha: savedResult.result.commitSha!, attempt: savedResult.attempt } } : schedulerEpochId
        ? reconcilePendingIntegrationAttempt(store, { runId, epochId: schedulerEpochId })
        : { status: "none" as const };
      if (retained.status === "completed") {
        if (!schedulerEpochId || retained.completed.epochId !== schedulerEpochId) {
          throw new Error(
            `Pending integration reconciliation returned epoch ${retained.completed.epochId}, expected ${schedulerEpochId ?? "none"}`,
          );
        }
        if (!Number.isInteger(retained.completed.attempt) || retained.completed.attempt < 1) {
          throw new Error(`Pending integration reconciliation returned invalid attempt ${retained.completed.attempt}`);
        }
        boundaryAttempt = retained.completed.attempt;
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
          reportCopiedToRepo: true, savePoint: {} as EpochSettlementResult["savePoint"],
          savePointEvidence: {} as EpochSettlementResult["savePointEvidence"], savePointId: null,
          scoreDelta: 0, worktreeDir: globals.repoRoot,
        };
        if (savedResult) { boundaryResult = savedResult.result; epochEvidenceRecorded = true; }
        const boundarySyncEvidence = completedBoundaryEvent(store, runId, retained.completed.epochId, boundaryAttempt, "boundary_sync");
        const prSyncRecorded = hasPrSyncSavePoint(store, runId, retained.completed.epochId, boundaryAttempt);
        if (config.boundarySyncEnabled && (!boundarySyncEvidence || !prSyncRecorded) && readRunBoundarySyncHold(store, runId)) {
          holdBoundarySync(params, { boundaryAttempt, commitSha: retained.completed.commitSha, savePointId: boundaryResult.savePointId ?? null });
          return { ok: true, boundaryResult, reconciled, paused: true };
        }
        if (config.boundarySyncEnabled && (!boundarySyncEvidence || !prSyncRecorded)) {
          reconcileRerunSteps.push("boundary_sync");
          trackPhase("boundary_sync", "started");
          boundarySync = runBoundarySync
            ? await runBoundarySync({ params, epochResult: boundaryResult })
            : await productionBoundarySync(params, boundaryAttempt);
          if (!boundarySync) throw new Error("Required epoch Sync is unavailable");
          if (!boundarySync.plan.drifted) {
            addEvent(store, runId, "boundary_sync", "run-loop", {
              epoch: epochOrdinal,
              epoch_id: retained.completed.epochId,
              boundary_attempt: boundaryAttempt,
              status: "finished",
              outcome: "no_source_change",
              head_sha: boundarySync.headSha,
              created_by: "run-loop",
            });
          } else {
            addEvent(store, runId, "boundary_sync", "run-loop", {
              epoch: epochOrdinal,
              epoch_id: retained.completed.epochId,
              boundary_attempt: boundaryAttempt,
              status: "finished",
              anchor_before: boundarySync.plan.anchorSha,
              anchor_after: boundarySync.plan.upstreamHeadSha,
              merge_commit_sha: boundarySync.headSha,
              drifted: true,
              upstream_taken_file_count: boundarySync.plan.upstreamTakenFiles.length,
              displaced_count: boundarySync.plan.targetsToRequeue.length,
              created_by: "run-loop",
            });
          }
          trackPhase("boundary_sync", "finished");
        } else reconcileSkippedSteps.push("boundary_sync");
        const breakageEvidence = completedBoundaryEvent(store, runId, retained.completed.epochId, boundaryAttempt, "boundary_breakage_gate");
        if (config.breakageGateEnabled && !breakageEvidence) {
          reconcileRerunSteps.push("master_breakage_gate");
          const gate = params.dependencies?.runMasterBreakageGate ?? runMasterBreakageGateDefault;
          trackPhase("master_breakage_gate", "started");
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
            epoch: epochOrdinal, epoch_id: retained.completed.epochId, boundary_attempt: boundaryAttempt, status: breakageGate.status,
            baseline_kind: breakageGate.baselineKind, baseline_sha: breakageGate.baselineSha,
            baseline_report_path: breakageGate.baselineReportPath, ours_report_path: breakageGate.oursReportPath,
            changes_path: breakageGate.changesPath, breakages: breakageGate.breakages.slice(0, 50),
            moved: breakageGate.moved.slice(0, 50), reasons: breakageGate.reasons, created_by: "run-loop",
          });
          if (breakageGate.status === "breakage") {
            await (params.dependencies?.writeBoundaryBreakageDeferrals ?? writeBoundaryBreakageDeferralsDefault)({
              gameId: globals.game?.gameId ?? globals.gameId ?? "melee",
              harnessId: canonicalState?.identity.harness_id ?? null,
              gate: breakageGate,
            });
            boundaryResult.repair.paused = true;
            boundaryResult.repair.reasons.push(`master breakage gate: ${breakageGate.breakages.length} item(s)`);
          }
          trackPhase("master_breakage_gate", "finished");
        } else reconcileSkippedSteps.push("master_breakage_gate");
        // A Sync recorded by an earlier attempt already moved the accepted head;
        // gating or publishing the settlement commit would switch source away from it.
        const acceptedHead = boundarySync?.headSha ?? (harnessGameId ? getHarnessState(store.db, harnessGameId)?.source.head : null) ?? retained.completed.commitSha;
        const gateEvidence = completedBoundaryEvent(store, runId, retained.completed.epochId, boundaryAttempt, "ci_parity_gate");
        const reusableGateStatus = (status: unknown) => status === "passed";
        const rerunCiParity = config.ciParityEnabled && !reusableGateStatus(gateEvidence?.ci_parity_status);
        const rerunPreCommit = config.preCommitGateEnabled && !reusableGateStatus(gateEvidence?.pre_commit_status);
        let ciParity: CiParityResult | undefined;
        let preCommit: CiParityResult | undefined;
        if (rerunCiParity) {
          reconcileRerunSteps.push("ci_parity_gate");
          trackPhase("ci_parity_gate", "started");
          ciParity = await (params.dependencies?.runCiParityGate ?? runCiParityGateDefault)({ worktreeDir: globals.repoRoot, sha: acceptedHead });
          trackPhase("ci_parity_gate", "finished");
        } else reconcileSkippedSteps.push("ci_parity_gate");
        const gitSwitchFailed = ciParity?.status === "error"
          && ciParity.steps.some((step) => step.name.toLowerCase().includes("git switch") && step.exitCode !== 0);
        if (rerunPreCommit && !gitSwitchFailed) {
          reconcileRerunSteps.push("pre_commit_gate");
          trackPhase("pre_commit_gate", "started");
          preCommit = await (params.dependencies?.runPreCommitGate ?? runPreCommitGateDefault)({ worktreeDir: globals.repoRoot, cacheDir: resolve(globals.stateDir, "pre-commit-cache") });
          trackPhase("pre_commit_gate", "finished");
        } else reconcileSkippedSteps.push("pre_commit_gate");
        const ciParityStatus = ciParity?.status ?? (config.ciParityEnabled ? gateEvidence?.ci_parity_status ?? "skipped" : "disabled");
        const preCommitStatus = preCommit?.status ?? (config.preCommitGateEnabled ? gateEvidence?.pre_commit_status ?? "skipped" : "disabled");
        if (rerunCiParity || rerunPreCommit) addEvent(store, runId, "ci_parity_gate", "run-loop", {
          epoch: epochOrdinal, epoch_id: retained.completed.epochId, boundary_attempt: boundaryAttempt,
          ci_parity_status: ciParityStatus,
          pre_commit_status: preCommitStatus,
          reasons: [...(ciParity?.reasons ?? []), ...(preCommit?.reasons ?? [])].slice(0, 20),
          warnings: [...(ciParity?.warnings ?? []), ...(preCommit?.warnings ?? [])].slice(0, 20),
          steps: [
            ...(ciParity?.steps ?? []).map((step) => ({ gate: "ci_parity", name: step.name, exit_code: step.exitCode })),
            ...(preCommit?.steps ?? []).map((step) => ({ gate: "pre_commit", name: step.name, exit_code: step.exitCode })),
          ], created_by: "run-loop",
        });
        const publishEvidence = completedBoundaryEvent(store, runId, retained.completed.epochId, boundaryAttempt, "draft_pr_publish");
        const publishCompleted = publishEvidence && (publishEvidence.status === "finished"
          || (publishEvidence.status === "skipped" && !["ci_parity_failed", "pre_commit_failed"].includes(String(publishEvidence.reason))));
        const gateFailureReason = publicationGateFailureReason(ciParityStatus, preCommitStatus);
        if (config.harnessDraftPrEnabled && !publishCompleted) {
          if (gateFailureReason) {
            reconcileSkippedSteps.push("draft_pr_publish");
            addEvent(store, runId, "draft_pr_publish", "run-loop", {
              epoch: epochOrdinal, epoch_id: retained.completed.epochId, boundary_attempt: boundaryAttempt,
              status: "skipped", reason: gateFailureReason, created_by: "run-loop",
            });
          } else {
            reconcileRerunSteps.push("draft_pr_publish");
            trackPhase("draft_pr_publish", "started");
            const publish = await publishHarnessDraftPr({
              baseRef: globals.game?.baseRef, commitSha: acceptedHead,
              epochLabel: label, epochOrdinal, matchedCodePercent: null,
              gameId: globals.game?.gameId ?? globals.gameId ?? null, qaGate: null,
              regressions: boundaryResult.regressions as unknown as Record<string, unknown>, repoRoot: globals.repoRoot,
              runId, savePointId: null, stateDir: globals.stateDir, store,
            });
            addEvent(store, runId, "draft_pr_publish", "run-loop", publish.status === "failed"
              ? { epoch: epochOrdinal, epoch_id: retained.completed.epochId, boundary_attempt: boundaryAttempt, status: "failed", error: publish.error ?? publish.reason, created_by: "run-loop" }
              : publish.status === "skipped"
                ? { epoch: epochOrdinal, epoch_id: retained.completed.epochId, boundary_attempt: boundaryAttempt, status: "skipped", reason: publish.reason ?? "publisher_skipped", created_by: "run-loop" }
                : { epoch: epochOrdinal, epoch_id: retained.completed.epochId, boundary_attempt: boundaryAttempt, status: "finished", pr_url: publish.url, head_sha: publish.commitSha, created_by: "run-loop" });
            trackPhase("draft_pr_publish", "finished");
          }
        } else reconcileSkippedSteps.push("draft_pr_publish");
        console.error(`[run-loop] epoch ${epochOrdinal}: pending integration attempt reconciled; skipped: ${reconcileSkippedSteps.join(", ")}; re-ran: ${reconcileRerunSteps.join(", ") || "none"}`);
        addEvent(store, runId, "epoch_boundary_reconciled", "run-loop", {
          epoch: epochOrdinal, epoch_id: retained.completed.epochId, boundary_attempt: boundaryAttempt, commit_sha: retained.completed.commitSha,
          skipped_steps: reconcileSkippedSteps, rerun_steps: reconcileRerunSteps, created_by: "run-loop",
        });
      } else {
        console.error(`[run-loop] epoch ${epochOrdinal}: ${trigger}; snapshotting and rebuilding report`);
        const boundaryGameId = globals.game?.gameId ?? globals.gameId ?? "unknown";
        const boundaryUpstreamSha = canonicalState?.source.upstream_revision ?? null;
        const result = await runEpochSettlement(store, runId, globals.repoRoot, globals.stateDir, {
          baseRef: globals.game?.baseRef,
          configureCommand: config.epochConfigureCommand,
          epochId: schedulerEpochId,
          label,
          leaseId,
          linkPaths: config.epochLinkPaths,
          gameId: globals.game?.gameId ?? globals.gameId ?? null,
          preCommitAutofixEnabled: config.preCommitAutofixEnabled,
          linkCompleteUnitsEnabled: config.linkCompleteUnitsEnabled !== false,
          runPreCommitAutofix: params.dependencies?.runPreCommitAutofix,
          boundaryBuildFixerEnabled: config.boundaryBuildFixerEnabled,
          runBoundaryBuildFixer: params.dependencies?.runBoundaryBuildFixer,
          deferBoundaryFindings: params.dependencies?.deferBoundaryFindings
            ?? ((findings) => writeBoundaryFindingsDefault(boundaryGameId, canonicalState?.identity.harness_id ?? null, boundaryUpstreamSha, findings)),
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
        if (schedulerEpochId) {
          const pending = store.db.query(
            "SELECT attempt FROM pending_integrations WHERE run_id = ? AND epoch_id = ?",
          ).get(runId, schedulerEpochId) as { attempt: number } | undefined;
          boundaryAttempt = pending ? Number(pending.attempt) : 1;
        }
        // Freeze worker evidence at the accepted epoch head before Sync can
        // advance source. A failed capture must stop upstream publication.
        if (config.boundarySyncEnabled && result.commitSha && schedulerEpochId) {
          trackPhase("epoch_evidence", "started");
          store.db.transaction(() => {
            writeEpochEvidence(store, schedulerEpochId, {
              status: "completed", boundaryStatus: "sync_pending",
              routingSummary: { trigger, save_point_id: result.savePointId },
              integration: {
                gameId: globals.game?.gameId ?? globals.gameId, runId,
                integrationCommit: result.commitSha!, scoreDelta: result.scoreDelta,
                commandId: `command-epoch-integrated-${schedulerEpochId}`, correlationId: runId,
                payload: { ordinal: epochOrdinal, boundary_status: "success", save_point_id: result.savePointId },
              },
              savePointEvidence: result.savePointEvidence,
            });
            addEvent(store, runId, "epoch_checkpoint_progress", "run-loop", { phase: "epoch_settled_evidence", epoch_id: schedulerEpochId, attempt: boundaryAttempt ?? 1, result });
          })();
          trackPhase("epoch_evidence", "finished");
        }
        if (config.boundarySyncEnabled && result.commitSha && schedulerEpochId && readRunBoundarySyncHold(store, runId)) {
          holdBoundarySync(params, { boundaryAttempt: boundaryAttempt ?? 1, commitSha: result.commitSha, savePointId: result.savePointId ?? null });
          return { ok: true, boundaryResult, reconciled, paused: true };
        }
        if (config.boundarySyncEnabled && result.commitSha) {
          const gameId = globals.game?.gameId ?? globals.gameId;
          const anchor = { upstream_revision: canonicalState?.source.upstream_revision ?? null };
          addEvent(store, runId, "boundary_sync", "run-loop", {
            epoch: epochOrdinal,
            epoch_id: schedulerEpochId ?? null,
            boundary_attempt: boundaryAttempt,
            status: "started",
            anchor_before: anchor?.upstream_revision ?? null,
            created_by: "run-loop",
          });
          trackPhase("boundary_sync", "started");
          try {
            boundarySync = runBoundarySync
              ? await runBoundarySync({ params, epochResult: result })
              : await productionBoundarySync(params, boundaryAttempt);
            if (!boundarySync) throw new Error("Required epoch Sync is unavailable");
          if (!boundarySync.plan.drifted) {
              addEvent(store, runId, "boundary_sync", "run-loop", {
                epoch: epochOrdinal,
                epoch_id: schedulerEpochId ?? null,
                boundary_attempt: boundaryAttempt,
                status: "finished",
                outcome: "no_source_change",
                head_sha: boundarySync.headSha,
                created_by: "run-loop",
              });
            } else {
              const plan = boundarySync.plan;
              addEvent(store, runId, "boundary_sync", "run-loop", {
                epoch: epochOrdinal,
                epoch_id: schedulerEpochId ?? null,
                boundary_attempt: boundaryAttempt,
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
            trackPhase("boundary_sync", "finished");
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            addEvent(store, runId, "boundary_sync", "run-loop", {
              epoch: epochOrdinal,
              epoch_id: schedulerEpochId ?? null,
              boundary_attempt: boundaryAttempt,
              status: "failed",
              anchor_before: anchor?.upstream_revision ?? null,
              error: message.slice(0, 8000),
              created_by: "run-loop",
            });
            if (config.harnessDraftPrEnabled) {
              console.error(`[run-loop] epoch ${epochOrdinal}: harness draft PR skipped (boundary_sync_failed)`);
              addEvent(store, runId, "draft_pr_publish", "run-loop", {
                epoch: epochOrdinal,
                epoch_id: schedulerEpochId ?? null,
                boundary_attempt: boundaryAttempt,
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
            epoch_id: schedulerEpochId ?? null,
            boundary_attempt: boundaryAttempt,
            status: "skipped",
            reason: config.boundarySyncEnabled ? "missing_commit" : "sync_disabled",
            created_by: "run-loop",
          });
        }
        if (config.breakageGateEnabled && result.commitSha) {
          const gameId = globals.game?.gameId ?? globals.gameId;
          const anchor = { upstream_revision: canonicalState?.source.upstream_revision ?? null };
          const reportRelPath = globals.game?.validation.reportPath ?? "build/GALE01/report.json";
          const gate = params.dependencies?.runMasterBreakageGate ?? runMasterBreakageGateDefault;
          trackPhase("master_breakage_gate", "started");
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
            epoch_id: schedulerEpochId ?? null,
            boundary_attempt: boundaryAttempt,
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
              harnessId: canonicalState?.identity.harness_id ?? null,
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
          trackPhase("master_breakage_gate", "finished");
        }
        if (config.harnessDraftPrEnabled) {
          const pushSha = boundarySync?.headSha ?? result.commitSha;
          let ciParity: CiParityResult | undefined;
          let preCommit: CiParityResult | undefined;
          if (config.ciParityEnabled && result.worktreeDir && pushSha) {
            const runCiParityGate = params.dependencies?.runCiParityGate ?? runCiParityGateDefault;
            trackPhase("ci_parity_gate", "started");
            ciParity = await runCiParityGate({ worktreeDir: result.worktreeDir, sha: pushSha });
            trackPhase("ci_parity_gate", "finished");
          }
          const gitSwitchFailed = ciParity?.status === "error"
            && ciParity.steps.some((step) => step.name.toLowerCase().includes("git switch") && step.exitCode !== 0);
          if (config.preCommitGateEnabled && result.worktreeDir && pushSha && !gitSwitchFailed) {
            const runPreCommitGate = params.dependencies?.runPreCommitGate ?? runPreCommitGateDefault;
            trackPhase("pre_commit_gate", "started");
            preCommit = await runPreCommitGate({
              worktreeDir: result.worktreeDir,
              cacheDir: resolve(globals.stateDir, "pre-commit-cache"),
            });
            trackPhase("pre_commit_gate", "finished");
          }
          if (config.ciParityEnabled || config.preCommitGateEnabled) {
            const reasons = [...(ciParity?.reasons ?? []), ...(preCommit?.reasons ?? [])].slice(0, 20);
            const gateSummary = {
              epoch: epochOrdinal,
              epoch_id: schedulerEpochId ?? null,
              boundary_attempt: boundaryAttempt,
              ci_parity_status: ciParity?.status ?? (config.ciParityEnabled ? "skipped" : "disabled"),
              pre_commit_status: preCommit?.status ?? (config.preCommitGateEnabled ? "skipped" : "disabled"),
              reasons,
              warnings: [...(ciParity?.warnings ?? []), ...(preCommit?.warnings ?? [])].slice(0, 20),
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
            const reason = publicationGateFailureReason(ciParity?.status, preCommit?.status);
            addEvent(store, runId, "draft_pr_publish", "run-loop", {
              epoch: epochOrdinal,
              epoch_id: schedulerEpochId ?? null,
              boundary_attempt: boundaryAttempt,
              status: "skipped",
              reason,
              created_by: "run-loop",
            });
            console.error(
              `[run-loop] epoch ${epochOrdinal}: harness draft PR skipped (ci_parity_failed: ${reasons.join("; ") || blockingGates.map((gate) => gate.status).join(", ")})`,
            );
          } else {
            addEvent(store, runId, "draft_pr_publish", "run-loop", {
              epoch: epochOrdinal,
              epoch_id: schedulerEpochId ?? null,
              boundary_attempt: boundaryAttempt,
              status: "started",
              created_by: "run-loop",
            });
            trackPhase("draft_pr_publish", "started");
            let publish;
            try {
              publish = await publishHarnessDraftPr({
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
                epoch_id: schedulerEpochId ?? null,
                boundary_attempt: boundaryAttempt,
                status: "failed",
                error: (error instanceof Error ? error.message : String(error)).slice(0, 2000),
                created_by: "run-loop",
              });
              throw error;
            }
            addEvent(store, runId, "draft_pr_publish", "run-loop", publish.status === "failed"
              ? { epoch: epochOrdinal, epoch_id: schedulerEpochId ?? null, boundary_attempt: boundaryAttempt, status: "failed", error: publish.error ?? publish.reason ?? "draft PR publish failed", created_by: "run-loop" }
              : publish.status === "skipped"
                ? { epoch: epochOrdinal, epoch_id: schedulerEpochId ?? null, boundary_attempt: boundaryAttempt, status: "skipped", reason: publish.reason ?? "publisher_skipped", created_by: "run-loop" }
                : { epoch: epochOrdinal, epoch_id: schedulerEpochId ?? null, boundary_attempt: boundaryAttempt, status: "finished", pr_url: publish.url ?? undefined, head_sha: publish.commitSha ?? pushSha ?? undefined, created_by: "run-loop" });
            trackPhase("draft_pr_publish", "finished");
            console.error(
              `[run-loop] epoch ${epochOrdinal}: harness draft PR ${publish.status}` +
                `${publish.url ? ` ${publish.url}` : publish.reason ? ` (${publish.reason})` : publish.error ? ` (${publish.error})` : ""}`,
            );
          }
        } else {
          addEvent(store, runId, "draft_pr_publish", "run-loop", {
            epoch: epochOrdinal,
            epoch_id: schedulerEpochId ?? null,
            boundary_attempt: boundaryAttempt,
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
                integrationCommit: result.commitSha!,
                scoreDelta: result.scoreDelta,
                commandId: `command-epoch-integrated-${schedulerEpochId ?? runId}`,
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
      // A Sync that moved source left the accepted report in the checkout, which
      // admission checks the board against; the settlement worktree is stale then.
      const acceptedHead = harnessGameId ? getHarnessState(store.db, harnessGameId)?.source.head : null;
      const syncMovedSource = Boolean(acceptedHead && boundaryResult?.commitSha && acceptedHead !== boundaryResult.commitSha);
      const maintenanceGlobals = boundaryResult?.worktreeDir && !syncMovedSource ? { ...globals, repoRoot: boundaryResult.worktreeDir } : globals;
      console.error(`[run-loop] epoch ${epochOrdinal}: full knowledge refresh started (${config.fullKgMaintenanceMode})`);
      addEvent(store, runId, "epoch_full_refresh_started", "run-loop", {
        epoch: epochOrdinal,
        lane: "full_boundary",
        mode: config.fullKgMaintenanceMode,
        repo_root: maintenanceGlobals.repoRoot,
        created_by: "run-loop",
      });
      trackPhase("knowledge_maintenance", "started");
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
      trackPhase("knowledge_maintenance", "finished");
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
            integrationCommit: boundaryResult.commitSha,
            scoreDelta: boundaryResult.scoreDelta,
            commandId: `command-epoch-integrated-${schedulerEpochId ?? runId}`,
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

    const currentRun = store.db.query("SELECT status, stop_request_json FROM runs WHERE id = ?").get(runId) as { status: string; stop_request_json: string | null } | undefined;
    const currentHarness = harnessGameId ? getHarnessState(store.db, harnessGameId) : null;
    if (currentHarness?.execution.desired === "paused" || currentRun?.status === "paused" || (currentRun?.stop_request_json && currentRun.stop_request_json !== "null")) {
      return { ok: true, boundaryResult, reconciled, paused: true, knowledgeMaintenanceRun, boundarySync,
        boundaryHeadSha: (harnessGameId ? getHarnessState(store.db, harnessGameId)?.source.head : null) ?? boundarySync?.headSha ?? boundaryResult?.commitSha ?? undefined, breakageGate };
    }
    trackPhase("admission", "started");
    nextEpoch = ensureSchedulerEpochFromBoard({
      config: config.schedulerEpochConfig,
      globals,
      graphDbPath: config.graphDbPath,
      runId,
      store,
    });
    console.error(
      `[run-loop] epoch ${nextEpoch.progress.ordinal}: admitted ${nextEpoch.progress.admitted} targets, ` +
        `${nextEpoch.progress.available} available`,
    );
    addEvent(store, runId, "epoch_admitted", "run-loop", {
      epoch_id: nextEpoch.epoch.id,
      ordinal: nextEpoch.progress.ordinal,
      admitted: nextEpoch.progress.admitted,
      available: nextEpoch.progress.available,
      created_by: "run-loop",
    });
    trackPhase("admission", "finished");
    return {
      ok: true,
      boundaryResult,
      reconciled,
      paused: false,
      nextEpoch,
      knowledgeMaintenanceRun,
      boundarySync,
      boundaryHeadSha: (harnessGameId ? getHarnessState(store.db, harnessGameId)?.source.head : null) ?? boundarySync?.headSha ?? boundaryResult?.commitSha ?? undefined,
      breakageGate,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (harnessGameId) {
      const current = getHarnessState(store.db, harnessGameId);
      if (current) transitionHarnessState(store.db, {
        gameId: harnessGameId, expectedRevision: current.identity.revision,
        commandId: `epoch-failed:${schedulerEpochId ?? runId}:${current.identity.revision}`,
        patch: {
          ...(/report|save_point|epoch_evidence|boundary_sync/.test(phaseTracker.current() ?? (isBoundaryStepError(error) ? error.phase : ""))
            ? { readiness: { evidence: "blocked" as const } } : {}),
          execution: { workflow: "sync", status: "blocked", blockers: [{ code: "epoch_boundary_failed", message, source_kind: "epoch", source_id: schedulerEpochId ?? runId, recoverable: true }] },
        },
        boundary: { eventId: `epoch-failed:${schedulerEpochId ?? runId}:${current.identity.revision}`, kind: "failed", outcome: "blocked", runId, epochId: schedulerEpochId,
          recovery: { stage: phaseTracker.current(), error: message } },
      });
    }
    const outerFailedPhase = phaseTracker.current();
    const carriedFailure = isBoundaryStepError(error) ? error : null;
    const failedPhase = outerFailedPhase ?? carriedFailure?.phase ?? null;
    const failureCheckpoint = stepFailureCheckpoint(error, boundaryResult?.artifactDir);
    const artifactDir = carriedFailure?.artifactDir ?? failureCheckpoint.artifact_dir ?? null;
    if (outerFailedPhase) {
      try {
        phaseTracker.progress({
          label,
          phase: outerFailedPhase,
          status: "failed",
          ...failureCheckpoint,
        });
      } catch (checkpointError) {
        const checkpointMessage = checkpointError instanceof Error ? checkpointError.message : String(checkpointError);
        console.error(`[run-loop] epoch ${epochOrdinal}: failed checkpoint emission for ${outerFailedPhase}: ${checkpointMessage}`);
      }
    }
    console.error(`[run-loop] epoch ${epochOrdinal} failed: ${message}`);
    addEvent(store, runId, "epoch_cycle_error", "run-loop", {
      epoch: epochOrdinal,
      error: message.slice(0, 8000),
      failed_phase: failedPhase,
      artifact_dir: artifactDir,
      created_by: "run-loop",
    });
    if (schedulerEpochId) {
      closeSchedulerEpoch(store, schedulerEpochId, {
        status: "error",
        boundaryStatus: "error",
        routingSummary: { trigger, error: message.slice(0, 8000), failed_phase: failedPhase },
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
        failed_phase: failedPhase,
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
      boundaryHeadSha: (harnessGameId ? getHarnessState(store.db, harnessGameId)?.source.head : null) ?? boundarySync?.headSha ?? boundaryResult?.commitSha ?? undefined,
      breakageGate,
      terminal: retry?.terminal ?? false,
    };
  }
}
