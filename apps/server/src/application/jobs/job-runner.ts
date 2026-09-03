import { basename, dirname } from "node:path";

import { closeDefaultAppKernelRuntime, resetDefaultAppKernelRuntimeForTests } from "@server/infrastructure/kernel/bridge/runtime";
import { loadLocalEnv } from "@server/infrastructure/env";
import { configureGlobalCompileJobserver } from "@server/infrastructure/shell/global-compile-jobserver";
import { parse } from "@server/core/game-registry/runtime-options.js";
import { kg2Backfill } from "@server/core/knowledge-v2/backfill/cli.js";
import { kg2Ingest } from "@server/core/knowledge-v2/ingest/cli.js";
import { kg2Index } from "@server/core/knowledge-v2/index/job.js";
import { kg2Prioritize } from "@server/core/knowledge-v2/migration/prioritize.js";
import { kg2Renarrate } from "@server/core/knowledge-v2/renarrate/cli.js";
import { kg2Librarian } from "@server/core/knowledge-v2/librarian/cli.js";
import { checkpointRun } from "@server/core/cycle-runtime/phases/pr/jobs/checkpoint-run.js";
import { savePoint } from "@server/core/cycle-runtime/phases/pr/jobs/save-point.js";
import {
  kgFileCard,
  kgImportAgentState,
  kgMaintain,
  kgRebuildGraph,
  kgSearch,
  kgSmoke,
  kgSources,
  kgStatus,
} from "@server/core/knowledge/jobs/kg.js";
import { recoverClaims } from "@server/core/cycle-runtime/phases/running/jobs/recover-claims.js";
import { tick } from "@server/core/cycle-runtime/phases/running/scheduler/tick.js";
import { runLoop } from "@server/core/cycle-runtime/phases/running/scheduler/run-loop.js";
import { initRun } from "@server/core/cycle-runtime/phases/running/service/init-run.js";
import { status } from "@server/core/cycle-runtime/phases/running/service/status.js";
import { workerTask } from "@server/core/cycle-runtime/phases/running/workers/worker-cycle.js";
import { regressionCheck } from "@server/core/validation/jobs/regression-check.js";
import { reportRun } from "@server/core/validation/jobs/report-run.js";
import { boundarySync } from "@server/application/jobs/boundary-sync.js";
import { STATE_MIGRATION_MODE_ENV } from "@server/core/orchestrator-state/storage/store.js";

function jobOwnsStorageMigrations(command: string): boolean {
  return command === "tick" || command === "run-loop";
}

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

  const previousMigrationMode = process.env[STATE_MIGRATION_MODE_ENV];
  if (jobOwnsStorageMigrations(command)) delete process.env[STATE_MIGRATION_MODE_ENV];
  else process.env[STATE_MIGRATION_MODE_ENV] = "verify";

  try {
    if (command === "boundary-sync") await boundarySync(globals, args);
    else if (command === "init-run") await initRun(globals, args);
    else if (command === "tick") await tick(globals, args);
    else if (command === "worker-task") await workerTask(globals, args);
    else if (command === "run-loop") await runLoop(globals, args);
    else if (command === "checkpoint-run") await checkpointRun(globals, args);
    else if (command === "recover-claims") await recoverClaims(globals, args);
    else if (command === "report-run") await reportRun(globals, args);
    else if (command === "save-point") await savePoint(globals, args);
    else if (command === "regression-check") await regressionCheck(globals, args);
    else if (command === "kg-sources") await kgSources();
    else if (command === "kg-status") await kgStatus(globals, args);
    else if (command === "kg-import-agent-state") await kgImportAgentState(args);
    else if (command === "kg-maintain") await kgMaintain(globals, args);
    else if (command === "kg-rebuild-graph") await kgRebuildGraph(globals, args);
    else if (command === "kg-search") await kgSearch(globals, args);
    else if (command === "kg-smoke") await kgSmoke(globals, args);
    else if (command === "kg-file-card") await kgFileCard(globals, args);
    else if (command === "kg2-ingest") await kg2Ingest(globals, args);
    else if (command === "kg2-index") await kg2Index(globals, args);
    else if (command === "kg2-prioritize") await kg2Prioritize(globals, args);
    else if (command === "kg2-backfill") await kg2Backfill(globals, args);
    else if (command === "kg2-renarrate") await kg2Renarrate(globals, args);
    else if (command === "kg2-librarian") await kg2Librarian(globals, args);
    else if (command === "status") await status(globals);
    else throw new Error(`Unknown server job: ${command}`);
  } finally {
    if (previousMigrationMode === undefined) delete process.env[STATE_MIGRATION_MODE_ENV];
    else process.env[STATE_MIGRATION_MODE_ENV] = previousMigrationMode;
    await closeDefaultAppKernelRuntime();
    resetDefaultAppKernelRuntimeForTests();
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
