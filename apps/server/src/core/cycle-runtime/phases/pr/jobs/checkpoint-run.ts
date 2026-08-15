import { createRunCheckpoint, shipsInPr } from "@server/core/cycle-runtime/phases/pr/checkpoint";
import { getLatestRun, getRun, openState } from "@server/core/cycle-runtime/run-state";
import { booleanArg, stringArg, type GlobalArgs } from "@server/core/game-registry/runtime-options.js";

function compactItem(item: {
  disposition: string;
  exactMatch: boolean;
  patchPath: string;
  workerCheckpointId: string;
  workerStateId: string;
  lifecycleStatus: string;
  validationStatus: string;
  sourcePath: string;
  symbol: string;
  unit: string;
}): Record<string, unknown> {
  return {
    disposition: item.disposition,
    exactMatch: item.exactMatch,
    workerCheckpointId: item.workerCheckpointId || null,
    workerStateId: item.workerStateId,
    lifecycleStatus: item.lifecycleStatus,
    validationStatus: item.validationStatus || null,
    symbol: item.symbol,
    unit: item.unit,
    sourcePath: item.sourcePath,
    patchPath: item.patchPath || null,
  };
}

export async function checkpointRun(globals: GlobalArgs, args: Map<string, string | true>): Promise<void> {
  const store = openState(globals.stateDir);
  try {
    const runId = stringArg(args, "--run-id", getLatestRun(store)?.id ?? "");
    if (!runId) throw new Error("No run found. Run init-run first.");
    const run = getRun(store, runId);
    if (!run) throw new Error(`Run not found: ${runId}`);
    const artifactDir = stringArg(args, "--artifact-dir", "");
    const reworkSymbols = stringArg(args, "--rework-symbols", "")
      .split(",")
      .map((symbol) => symbol.trim())
      .filter(Boolean);
    const result = createRunCheckpoint(store, runId, {
      allowActiveClaims: booleanArg(args, "--allow-active-claims"),
      artifactDir: artifactDir || undefined,
      improvementPromotion: {
        minGainPoints: globals.game?.pr.improvementMinGainPoints,
        minMatchedBytes: globals.game?.pr.improvementMinMatchedBytes,
      },
      reworkSymbols,
      title: stringArg(args, "--title", "Run checkpoint"),
    });
    console.log(
      JSON.stringify(
        {
          checkpoint: result.checkpoint,
          counts: result.counts,
          prCandidates: result.items.filter((item) => item.disposition === "pr_candidate").map(compactItem),
          improvementCandidates: result.items.filter((item) => item.disposition === "improvement_candidate").map(compactItem),
          carryForwardCount: result.items.filter((item) => !shipsInPr(item.disposition)).length,
        },
        null,
        2,
      ),
    );
  } finally {
    store.db.close();
  }
}
