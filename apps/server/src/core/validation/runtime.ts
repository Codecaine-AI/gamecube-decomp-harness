import { compactReportRunResult } from "@server/core/validation/report/summary";
import { forceReportRun, recordReportRunDashboardArtifacts, reportRunOptionsForGame } from "@server/core/validation/report";
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
    try {
      const requestedRunId = stringValue(body.runId);
      const run = requestedRunId ? getRun(store, requestedRunId) : getLatestRun(store);
      await recordReportRunDashboardArtifacts(store, {
        result,
        runId: run?.id ?? null,
        gameId: paths.game?.gameId ?? null,
        boardKey: resetBaseline ? "baseline" : "current",
        trustedReportKey: "current",
      });
    } finally {
      store.db.close();
    }
    uiLog("ui", `report-run${resetBaseline ? " --reset-baseline" : ""} complete`);
    return { game: paths.game ? deps.gameToSummary(paths.game) : null, ...compactReportRunResult(result) };
  }

  return { runReportNow };
}
