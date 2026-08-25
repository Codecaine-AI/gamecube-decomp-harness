import { basename, dirname } from "node:path";

import { closeDefaultMeleeKernelRuntime, resetDefaultMeleeKernelRuntimeForTests } from "@server/infrastructure/kernel/bridge/runtime";
import { loadLocalEnv } from "@server/infrastructure/env";
import { configureGlobalCompileJobserver } from "@server/infrastructure/shell/global-compile-jobserver";
import { parse } from "@server/core/game-registry/runtime-options.js";
import { checkpointRun } from "@server/core/cycle-runtime/phases/pr/jobs/checkpoint-run.js";
import { savePoint } from "@server/core/cycle-runtime/phases/pr/jobs/save-point.js";
import {
  kgCurate,
  kgFileCard,
  kgImportAgentState,
  kgKnowledgeIntakeAgent,
  kgMaintain,
  kgPrIndexerAgent,
  kgRankFeatures,
  kgRebuildGraph,
  kgSearch,
  kgSmoke,
  kgSources,
  kgStatus,
} from "@server/core/knowledge/jobs/kg.js";
import { kgLibrarianCondense } from "@server/core/knowledge/jobs/librarian.js";
import { kgLibrarianCorroborate } from "@server/core/knowledge/jobs/librarian-corroborate.js";
import { kgLibrarianBackfill } from "@server/core/knowledge/jobs/librarian-backfill.js";
import { integrationResolve } from "@server/core/cycle-runtime/phases/running/integration/index.js";
import { recoverClaims } from "@server/core/cycle-runtime/phases/running/jobs/recover-claims.js";
import { tick } from "@server/core/cycle-runtime/phases/running/scheduler/tick.js";
import { runLoop } from "@server/core/cycle-runtime/phases/running/scheduler/run-loop.js";
import { initRun } from "@server/core/cycle-runtime/phases/running/service/init-run.js";
import { status } from "@server/core/cycle-runtime/phases/running/service/status.js";
import { workerTask } from "@server/core/cycle-runtime/phases/running/workers/worker-cycle.js";
import { regressionCheck } from "@server/core/validation/jobs/regression-check.js";
import { reportRun } from "@server/core/validation/jobs/report-run.js";

export async function main(argv = process.argv.slice(2)): Promise<void> {
  loadLocalEnv();
  const { command, globals, args } = parse(argv);
  if (globals.game) {
    loadLocalEnv({
      root: dirname(globals.game.localEnvPath),
      filenames: [basename(globals.game.localEnvPath)],
    });
  }
  await configureGlobalCompileJobserver();

  try {
    if (command === "init-run") await initRun(globals, args);
    else if (command === "tick") await tick(globals, args);
    else if (command === "worker-task") await workerTask(globals, args);
    else if (command === "run-loop") await runLoop(globals, args);
    else if (command === "checkpoint-run") await checkpointRun(globals, args);
    else if (command === "recover-claims") await recoverClaims(globals, args);
    else if (command === "integration-resolve") await integrationResolve(globals, args);
    else if (command === "report-run") await reportRun(globals, args);
    else if (command === "save-point") await savePoint(globals, args);
    else if (command === "regression-check") await regressionCheck(globals, args);
    else if (command === "kg-sources") await kgSources();
    else if (command === "kg-status") await kgStatus(globals, args);
    else if (command === "kg-import-agent-state") await kgImportAgentState(args);
    else if (command === "kg-curate") await kgCurate(globals, args);
    else if (command === "kg-librarian-condense") await kgLibrarianCondense(globals, args);
    else if (command === "kg-librarian-corroborate") await kgLibrarianCorroborate(globals, args);
    else if (command === "kg-librarian-backfill") await kgLibrarianBackfill(globals, args);
    else if (command === "kg-maintain") await kgMaintain(globals, args);
    else if (command === "kg-pr-indexer-agent") await kgPrIndexerAgent(globals, args);
    else if (command === "kg-knowledge-intake-agent") await kgKnowledgeIntakeAgent(globals, args);
    else if (command === "kg-rebuild-graph") await kgRebuildGraph(globals, args);
    else if (command === "kg-search") await kgSearch(globals, args);
    else if (command === "kg-smoke") await kgSmoke(globals, args);
    else if (command === "kg-file-card") await kgFileCard(globals, args);
    else if (command === "kg-rank-features") await kgRankFeatures(globals, args);
    else if (command === "status") await status(globals);
    else throw new Error(`Unknown server job: ${command}`);
  } finally {
    await closeDefaultMeleeKernelRuntime();
    resetDefaultMeleeKernelRuntimeForTests();
  }

  if (command === "worker-task") {
    // The result JSON is written synchronously before workerTask returns. Exit now so remote-SDK
    // handles cannot delay the child exit that tells the host consumer to settle the job.
    process.exit(0);
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
