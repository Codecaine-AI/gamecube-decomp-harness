import {
  recordDashboardArtifact,
  type JsonObject,
  type StateStore,
} from "@server/core/orchestrator-state";
import type { SteeringGateMode } from "@server/core/game-registry/resolver.js";
import { steeringCompletionHolds, unknownCompletionHolds } from "@server/core/harness-runtime/phases/pr/checkpoint/completion-index.js";
import { withholdUnverifiedStoredMeasures } from "@server/core/harness-runtime/phases/running/board/unverified-measures.js";
import { compactReportMeasures, type ReportRunResult, type ReportRunSummary } from "./run.js";
import { loadTrustedReportFile } from "./trusted-report.js";

export interface RecordReportRunDashboardArtifactsInput {
  result: ReportRunResult;
  runId?: string | null;
  gameId?: string | null;
  boardKey?: string;
  trustedReportKey?: string;
  reportChangesSource?: string;
  reportRunKey?: string;
  /** The checkout whose HEAD the report measures; a missing checkout clears no rollback hold. */
  repoRoot?: string | null;
  /** The game's steering gate: when active, published completion metrics withhold unverified and rollback-held functions. */
  steeringGate?: SteeringGateMode | null;
}

/** A report run as published: `summary` carries the completion metrics, `reportSummary` the report's own. */
export interface PublishedReportRunResult extends ReportRunResult {
  /** The report's raw summary (evidence), set whenever completion is withheld by steering state. */
  reportSummary?: ReportRunSummary;
  /**
   * The shared helper's `unverified_*` figures: the separate "100% unverified"
   * count, code and percent, withheld fuzzy and complete units, and
   * `unverified_unbounded` when the report could not be read. Set with `reportSummary`.
   */
  unverifiedMeasures?: JsonObject;
  /**
   * The checkout HEAD the holds were judged at (null: unknown, every rollback
   * held). Set only with an active gate; the board snapshot pins it so the
   * dashboard re-scores at the same revision.
   */
  measuredRevision?: string | null;
}

/** Summary fields an unreadable report cannot bound while steering holds are active (`UNVERIFIED_UNBOUNDED_KEYS`). */
const UNBOUNDED_SUMMARY_FIELDS = [
  "fuzzyMatchPercent",
  "matchedCodeBytes",
  "matchedCodePercent",
  "matchedFunctions",
  "matchedFunctionsPercent",
  "completeCodePercent",
  "completeDataPercent",
  "completeUnits",
  "incompleteUnits",
  "unmatchedTargets",
] as const satisfies readonly (keyof ReportRunSummary)[];

function unknownCompletionSummary(summary: ReportRunSummary): ReportRunSummary {
  const next = { ...summary };
  for (const field of UNBOUNDED_SUMMARY_FIELDS) next[field] = null;
  return next;
}

function unverifiedFigures(measures: JsonObject): JsonObject {
  return Object.fromEntries(Object.entries(measures).filter(([key]) => key.startsWith("unverified_")));
}

function compactSteps(result: ReportRunResult): JsonObject[] {
  return result.steps.map((step) => ({
    name: step.name,
    command: step.command,
    exitCode: step.exitCode,
  }));
}

export function boardMeasuresFromReportSummary(summary: ReportRunSummary | undefined): JsonObject {
  if (!summary) return {};
  return {
    fuzzy_match_percent: summary.fuzzyMatchPercent,
    matched_code_percent: summary.matchedCodePercent,
    complete_code_percent: summary.completeCodePercent,
    matched_functions_percent: summary.matchedFunctionsPercent,
    complete_units: summary.completeUnits,
    total_units: summary.totalUnits,
    unmatched_targets: summary.unmatchedTargets,
  };
}

/**
 * The run with its summary's completion metrics as published. With a
 * steering gate active and unverified or unresolved rollback holds, the summary is
 * re-derived from the report through the shared helper (exact unverified
 * functions leave the matched counts, every unverified function's fuzzy
 * share and its complete unit are withheld); an unreadable report fails
 * closed to unknown (null) completion metrics. `reportSummary` keeps the raw
 * summary and `unverifiedMeasures` the separate "100% unverified" figures.
 * A rollback clears only when its certificate is an ancestor of this
 * checkout's HEAD. A missing checkout or revision clears no rollback;
 * unreadable steering state makes completion unknown. Games without an
 * active gate (Melee) or holds publish the raw summary.
 */
export function publishedReportRunResult(
  store: StateStore,
  input: Pick<RecordReportRunDashboardArtifactsInput, "result" | "gameId" | "steeringGate" | "repoRoot">,
): PublishedReportRunResult {
  const { result } = input;
  if (!result.summary) return result;
  let holds: ReturnType<typeof steeringCompletionHolds>;
  try {
    holds = steeringCompletionHolds(store, { gameId: input.gameId, steeringGate: input.steeringGate }, input.repoRoot);
  } catch {
    holds = unknownCompletionHolds();
  }
  if (!holds) return result;
  let revision: string | null = null;
  if (input.repoRoot) {
    try {
      const head = Bun.spawnSync(["git", "-C", input.repoRoot, "rev-parse", "--verify", "HEAD"], { stdout: "pipe", stderr: "ignore" });
      if (head.exitCode === 0) revision = head.stdout.toString().trim() || null;
    } catch {
      // No revision means the shared index keeps every rollback held.
    }
  }
  const unverified = holds.at(revision);
  if (!holds.unknown && unverified.size === 0) return { ...result, measuredRevision: revision };
  const completion = withholdUnverifiedStoredMeasures({}, result.reportPath, unverified);
  const summary = completion.unverified_unbounded === true ? unknownCompletionSummary(result.summary) : compactReportMeasures(completion);
  return { ...result, summary, reportSummary: result.summary, unverifiedMeasures: unverifiedFigures(completion), measuredRevision: revision };
}

/** Records the run's dashboard artifacts and returns the run as published (see `publishedReportRunResult`). */
export async function recordReportRunDashboardArtifacts(
  store: StateStore,
  input: RecordReportRunDashboardArtifactsInput,
): Promise<PublishedReportRunResult> {
  const published = publishedReportRunResult(store, input);
  const common = {
    runId: input.runId ?? null,
    gameId: input.gameId ?? null,
  };
  const reportRunKey = input.reportRunKey ?? (input.result.resetBaseline ? "baseline_reset" : "report");
  recordDashboardArtifact(store, {
    ...common,
    artifactType: "report_run",
    artifactKey: reportRunKey,
    sourcePath: input.result.reportPath,
    sourceLabel: input.result.reportPath,
    payload: {
      baselinePath: input.result.baselinePath,
      reportChangesPath: input.result.reportChangesPath,
      reportPath: input.result.reportPath,
      resetBaseline: input.result.resetBaseline,
      summary: published.summary ?? null,
      ...(published.reportSummary ? { reportSummary: published.reportSummary } : {}),
      ...(published.unverifiedMeasures ? { unverifiedMeasures: published.unverifiedMeasures } : {}),
      timestamps: input.result.timestamps,
      steps: compactSteps(input.result),
    },
    createdAt: input.result.timestamps.report ?? undefined,
  });

  // The board carries the "100% unverified" figures (`unverified_*`) next to the withheld completion metrics.
  const measures = { ...boardMeasuresFromReportSummary(published.summary), ...(published.unverifiedMeasures ?? {}) };
  if (Object.keys(measures).length > 0) {
    const boardKey = input.boardKey ?? (input.result.resetBaseline ? "baseline" : "current");
    recordDashboardArtifact(store, {
      ...common,
      artifactType: "board_snapshot",
      artifactKey: boardKey,
      sourcePath: input.result.reportPath,
      sourceLabel: input.result.reportPath,
      payload: {
        generatedAt: input.result.timestamps.report ?? null,
        measures,
        candidates: [],
        reportPath: input.result.reportPath,
        source: input.result.resetBaseline ? "baseline_report" : "report_run",
        // Steering-gated games: the revision the published holds were judged at (`completionRevision`).
        ...(published.measuredRevision !== undefined ? { measuredRevision: published.measuredRevision } : {}),
      },
      createdAt: input.result.timestamps.report ?? undefined,
    });
  }

  if (input.result.timestamps.reportChanges) {
    const source = input.reportChangesSource ?? "build/GALE01/report_changes.json";
    const trustedReport = await loadTrustedReportFile(input.result.reportChangesPath, source, 0);
    if (trustedReport.status === "ready") {
      recordDashboardArtifact(store, {
        ...common,
        artifactType: "trusted_report",
        artifactKey: input.trustedReportKey ?? "current",
        sourcePath: input.result.reportChangesPath,
        sourceLabel: source,
        payload: trustedReport as unknown as JsonObject,
        createdAt: trustedReport.generatedAt ?? undefined,
      });
    }
  }
  return published;
}
