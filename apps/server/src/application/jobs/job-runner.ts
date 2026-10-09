import { remoteBuildsEnabled } from "@server/core/validation/build/execution.js";
import { basename, dirname } from "node:path";

import { closeDefaultMeleeKernelRuntime, resetDefaultMeleeKernelRuntimeForTests } from "@server/infrastructure/kernel/bridge/runtime";
import { closeNodeKernel } from "@server/infrastructure/kernel/nodes/node-kernel";
import { loadLocalEnv } from "@server/infrastructure/env";
import { loadCodecaineEnv } from "@server/infrastructure/env/codecaine-env";
import { configureGlobalCompileJobserver } from "@server/infrastructure/shell/global-compile-jobserver";
import { parse } from "@server/core/game-registry/runtime-options.js";
import { kg2Backfill } from "@server/core/knowledge-v2/backfill/cli.js";
import { kg2Ingest } from "@server/core/knowledge-v2/ingest/cli.js";
import { kg2Index } from "@server/core/knowledge-v2/index/job.js";
import { kg2Prioritize } from "@server/core/knowledge-v2/migration/prioritize.js";
import { kg2Renarrate } from "@server/core/knowledge-v2/renarrate/cli.js";
import { kg2Librarian } from "@server/core/knowledge-v2/librarian/cli.js";
import { kg2DriftReanchor, kg2DriftScan } from "@server/core/knowledge-v2/drift/cli.js";
import { checkpointRun } from "@server/core/harness-runtime/phases/pr/jobs/checkpoint-run.js";
import { savePoint } from "@server/core/harness-runtime/phases/pr/jobs/save-point.js";
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
import { recoverClaims } from "@server/core/harness-runtime/phases/running/jobs/recover-claims.js";
import { resolveIntegration } from "@server/core/harness-runtime/phases/running/jobs/resolve-integration.js";
import { requeueTargets } from "@server/core/harness-runtime/phases/running/jobs/requeue-targets.js";
import { tick } from "@server/core/harness-runtime/phases/running/scheduler/tick.js";
import { runLoop } from "@server/core/harness-runtime/phases/running/scheduler/run-loop.js";
import { initRun } from "@server/core/harness-runtime/phases/running/service/init-run.js";
import { prepareEpoch } from "@server/core/harness-runtime/phases/running/service/prepare-epoch.js";
import { setDesiredWorkers } from "@server/core/harness-runtime/phases/running/service/set-desired-workers.js";
import { status } from "@server/core/harness-runtime/phases/running/service/status.js";
import { workerTask } from "@server/core/harness-runtime/phases/running/workers/worker-cycle.js";
import { regressionCheck } from "@server/core/validation/jobs/regression-check.js";
import { reportRun } from "@server/core/validation/jobs/report-run.js";
import { validateSandbox } from "./validate-sandbox.js";
import { boundarySync } from "@server/application/jobs/boundary-sync.js";
import { advisoryShadowReport } from "@server/application/jobs/advisory-shadow-report.js";
import { advisoryCalibration } from "@server/application/jobs/advisory-calibration/index.js";
import { checkpointKnowledge } from "@server/core/knowledge-v2/checkpoint-feed/cli.js";
import { STATE_MIGRATION_MODE_ENV } from "@server/core/orchestrator-state/storage/store.js";

function jobOwnsStorageMigrations(command: string): boolean {
  return command === "tick" || command === "run-loop";
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  loadLocalEnv();
  loadCodecaineEnv();
  if (argv[0] === "advisory-calibration") {
    // Own positional-subcommand grammar; history is read only via --source-root.
    try {
      await advisoryCalibration(argv.slice(1));
    } finally {
      try {
        // The node kernel writes through the melee kernel runtime's DB: flush it first.
        await closeNodeKernel();
      } finally {
        await closeDefaultMeleeKernelRuntime();
        resetDefaultMeleeKernelRuntimeForTests();
      }
    }
    return;
  }
  // checkpoint-knowledge takes a positional subcommand (e.g. `backfill`); lift it to a flag for parse().
  const lifted =
    argv[0] === "checkpoint-knowledge" && argv[1] !== undefined && !argv[1].startsWith("--")
      ? ["checkpoint-knowledge", "--subcommand", argv[1], ...argv.slice(2)]
      : argv;
  const { command, globals, args } = parse(lifted);
  if (globals.game) {
    loadLocalEnv({
      root: dirname(globals.game.localEnvPath),
      filenames: [basename(globals.game.localEnvPath)],
    });
  }
  if (!remoteBuildsEnabled()) await configureGlobalCompileJobserver();

  const previousMigrationMode = process.env[STATE_MIGRATION_MODE_ENV];
  if (jobOwnsStorageMigrations(command)) delete process.env[STATE_MIGRATION_MODE_ENV];
  else process.env[STATE_MIGRATION_MODE_ENV] = "verify";

  try {
    if (command === "validate-sandbox") await validateSandbox(globals, args);
    else if (command === "boundary-sync") await boundarySync(globals, args);
    else if (command === "advisory-shadow-report") await advisoryShadowReport(globals, args);
    else if (command === "checkpoint-knowledge") await checkpointKnowledge(globals, args, argv);
    else if (command === "init-run") await initRun(globals, args);
    else if (command === "prepare-epoch") await prepareEpoch(globals, args);
    else if (command === "set-desired-workers") await setDesiredWorkers(globals, args);
    else if (command === "tick") await tick(globals, args);
    else if (command === "worker-task") await workerTask(globals, args);
    else if (command === "run-loop") await runLoop(globals, args);
    else if (command === "checkpoint-run") await checkpointRun(globals, args);
    else if (command === "recover-claims") await recoverClaims(globals, args);
    else if (command === "resolve-integration") await resolveIntegration(globals, args);
    else if (command === "requeue-targets") await requeueTargets(globals, args, argv);
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
    else if (command === "kg2-drift-scan") await kg2DriftScan(globals, args);
    else if (command === "kg2-drift-reanchor") await kg2DriftReanchor(globals, args);
    else if (command === "status") await status(globals);
    else throw new Error(`Unknown server job: ${command}`);
  } finally {
    if (previousMigrationMode === undefined) delete process.env[STATE_MIGRATION_MODE_ENV];
    else process.env[STATE_MIGRATION_MODE_ENV] = previousMigrationMode;
    try {
      // The node kernel writes through the melee kernel runtime's DB: flush it first.
      await closeNodeKernel();
    } finally {
      await closeDefaultMeleeKernelRuntime();
      resetDefaultMeleeKernelRuntimeForTests();
    }
  }

  if (command === "worker-task") {
    // The result JSON is written synchronously before workerTask returns. Exit now so remote-SDK
    // handles cannot delay the child exit that tells the host consumer to settle the job.
    process.exit(0);
  }
}

if (import.meta.main) {
  await main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
