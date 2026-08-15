import { compactReportRunResult } from "@server/core/cycle-runtime/phases/preparing/runtime";
import { forceReportRun, recordReportRunDashboardArtifacts } from "@server/core/validation/report";
import { getLatestRun, getRun, openState } from "@server/core/cycle-runtime/run-state";
import type { GameRuntimeContext, GameSummary, ResolvedGame } from "@server/core/game-registry";

type JsonObject = Record<string, unknown>;

export interface ValidationRuntime {
  runReportNow: (body: JsonObject) => Promise<JsonObject>;
}

export interface ValidationRuntimeDeps {
  appendLog: (stream: "stdout" | "stderr" | "ui", text: string) => void;
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
    deps.appendLog("ui", `report-run${resetBaseline ? " --reset-baseline" : ""} started`);
    const result = await forceReportRun(repoRoot, { resetBaseline });
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
    deps.appendLog("ui", `report-run${resetBaseline ? " --reset-baseline" : ""} complete`);
    return { game: paths.game ? deps.gameToSummary(paths.game) : null, ...compactReportRunResult(result) };
  }

  return { runReportNow };
}
