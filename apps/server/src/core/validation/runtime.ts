import { compactReportRunResult } from "@server/core/validation/report/summary";
import { forceReportRun, recordReportRunDashboardArtifacts, reportRunOptionsForGame, type PublishedReportRunResult } from "@server/core/validation/report";
import { getLatestRun, getRun, openState } from "@server/core/harness-runtime/run-state";
import type { GameRuntimeContext, GameSummary, ResolvedGame } from "@server/core/game-registry";
import { uiLog } from "@server/infrastructure/logging/ui-log";

type JsonObject = Record<string, unknown>;

export interface ValidationRuntime {
  runReportNow: (body: JsonObject) => Promise<JsonObject>;
}

export interface ValidationRuntimeDeps {
  gameToSummary: (game: ResolvedGame) => GameSummary;
  resolveDashboardGame: (input: JsonObject, options?: { useDefaultGame?: boolean }) => GameRuntimeContext;
}

function boolValue(value: unknown): boolean {
  return value === true || value === "true";
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function createValidationRuntime(deps: ValidationRuntimeDeps): ValidationRuntime {
  async function runReportNow(body: JsonObject): Promise<JsonObject> {
    const paths = deps.resolveDashboardGame(body, { useDefaultGame: true });
    const repoRoot = paths.repoRoot;
    const resetBaseline = boolValue(body.resetBaseline);
    uiLog("ui", `report-run${resetBaseline ? " --reset-baseline" : ""} started`);
    const result = await forceReportRun(repoRoot, { ...reportRunOptionsForGame(paths.game), resetBaseline });
    const store = openState(paths.stateDir);
    let published: PublishedReportRunResult;
    try {
      const requestedRunId = stringValue(body.runId);
      const run = requestedRunId ? getRun(store, requestedRunId) : getLatestRun(store);
      published = await recordReportRunDashboardArtifacts(store, {
        result,
        repoRoot: paths.repoRoot,
        runId: run?.id ?? null,
        gameId: paths.game?.gameId ?? null,
        steeringGate: paths.game?.matching?.steeringGate ?? null,
        boardKey: resetBaseline ? "baseline" : "current",
        trustedReportKey: "current",
      });
    } finally {
      store.db.close();
    }
    uiLog("ui", `report-run${resetBaseline ? " --reset-baseline" : ""} complete`);
    // `summary` is the published completion summary; with steering holds `reportSummary`
    // keeps the report's own and `unverifiedMeasures` the separate "100% unverified" figures.
    return {
      game: paths.game ? deps.gameToSummary(paths.game) : null,
      ...compactReportRunResult(published),
      ...(published.reportSummary ? { reportSummary: published.reportSummary } : {}),
      ...(published.unverifiedMeasures ? { unverifiedMeasures: published.unverifiedMeasures } : {}),
    };
  }

  return { runReportNow };
}
