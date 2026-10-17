import { forceReportRun, recordReportRunDashboardArtifacts, reportRunOptionsForGame, type PublishedReportRunResult } from "@server/core/validation/report";
import { getLatestRun, openState } from "@server/core/harness-runtime/run-state";
import { booleanArg, type GlobalArgs } from "@server/core/game-registry/runtime-options.js";

export async function reportRun(globals: GlobalArgs, args: Map<string, string | true>): Promise<void> {
  const resetBaseline = booleanArg(args, "--reset-baseline");
  const result = await forceReportRun(globals.repoRoot, { ...reportRunOptionsForGame(globals.game), resetBaseline });
  const store = openState(globals.stateDir);
  let published: PublishedReportRunResult;
  try {
    const run = getLatestRun(store);
    published = await recordReportRunDashboardArtifacts(store, {
      result,
      repoRoot: globals.repoRoot,
      runId: run?.id ?? null,
      gameId: globals.game?.gameId ?? globals.gameId ?? null,
      steeringGate: globals.game?.matching?.steeringGate ?? null,
      boardKey: resetBaseline ? "baseline" : "current",
      trustedReportKey: "current",
    });
  } finally {
    store.db.close();
  }
  // `summary` is the published completion summary; with steering holds `reportSummary`
  // keeps the report's own and `unverifiedMeasures` the separate "100% but unverified" figures.
  console.log(
    JSON.stringify(
      {
        ...published,
        steps: published.steps.map((step) => ({
          name: step.name,
          command: step.command,
          exitCode: step.exitCode,
        })),
      },
      null,
      2,
    ),
  );
}
