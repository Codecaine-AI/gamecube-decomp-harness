import { createRunCheckpoint } from "../../handoff/checkpoint.js";
import { getLatestRun, getRun, openState } from "../../state/index.js";
import { booleanArg, stringArg, type GlobalArgs } from "../args.js";

function compactItem(item: {
  disposition: string;
  exactMatch: boolean;
  patchPath: string;
  reportId: string;
  reportType: string;
  sourcePath: string;
  symbol: string;
  unit: string;
}): Record<string, unknown> {
  return {
    disposition: item.disposition,
    exactMatch: item.exactMatch,
    reportId: item.reportId,
    reportType: item.reportType,
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
    const result = createRunCheckpoint(store, runId, {
      allowActiveLeases: booleanArg(args, "--allow-active-leases"),
      artifactDir: artifactDir || undefined,
      title: stringArg(args, "--title", "Run checkpoint"),
    });
    console.log(
      JSON.stringify(
        {
          checkpoint: result.checkpoint,
          counts: result.counts,
          prCandidates: result.items.filter((item) => item.disposition === "pr_candidate").map(compactItem),
          carryForwardCount: result.items.filter((item) => item.disposition !== "pr_candidate").length,
        },
        null,
        2,
      ),
    );
  } finally {
    store.db.close();
  }
}
