import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { settlePausedRun } from "@server/core/cycle-runtime/phases/running/run-control.js";
import { getLatestRun, getRun, openState } from "@server/core/cycle-runtime/run-state";
import { createSyncRuntime } from "@server/core/cycle-runtime/phases/sync/runtime.js";
import { resolveGame } from "@server/core/game-registry";
import { stringArg, type GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import { getHarnessState } from "@server/core/harness-state";
import { packageRoot, sourceRoot } from "@server/core/knowledge";
import { runCommand } from "@server/infrastructure/shell/run-command.js";

function packageBin(): string {
  return resolve(packageRoot(), "apps/server/src/job-runner.ts");
}

export async function settleSupervisedRun(params: {
  globals: GlobalArgs;
  args: Map<string, string | true>;
  leaseId: string | null;
  stoppedReason: string;
}): Promise<void> {
  const { globals, args, leaseId, stoppedReason } = params;
  let acquiredSyncId: string | null = null;
  if (leaseId) {
    const store = openState(globals.stateDir);
    try {
      const runId = stringArg(args, "--run-id", "") || getLatestRun(store)?.id;
      const run = runId ? getRun(store, runId) : null;
      if (run?.status === "active" || run?.status === "draining" || run?.status === "paused") {
        settlePausedRun({
          actor: "guardian",
          commandId: `command-run-supervisor-settled-${randomUUID()}`,
          leaseId,
          reason: `supervisor settled after ${stoppedReason}`,
          runId: run.id,
          store,
        });
        const active = run.gameId ? getHarnessState(store, run.gameId)?.active_workflow : null;
        if (active?.kind === "sync" && active.status === "active") {
          acquiredSyncId = active.workflow_id;
        }
      }
    } finally {
      store.db.close();
    }
  }
  if (acquiredSyncId) {
    const gameId = globals.game?.gameId ?? globals.gameId;
    if (!gameId) throw new Error(`Acquired sync ${acquiredSyncId} without a game id`);
    const controlGame = globals.game
      ? resolveGame({
          orchestratorRoot: globals.game.orchestratorRoot,
          gameId: globals.game.gameId,
        })
      : null;
    const paths = {
      graphDbPath: controlGame?.graphDbPath ?? globals.graphDbPath ?? resolve(globals.stateDir, "knowledge-graph.sqlite"),
      game: controlGame,
      repoRoot: controlGame?.repoRoot ?? globals.repoRoot,
      stateDir: globals.stateDir,
    };
    const syncRuntime = createSyncRuntime({
      packageRoot: packageRoot(),
      resolveDashboardGame: () => paths,
      runCli: async (command, cwd = packageRoot()) => runCommand(cwd, command),
      runGit: async (repoRoot, args, options = {}) => {
        const result = await runCommand(repoRoot, ["git", ...args]);
        if (options.check !== false && result.exitCode !== 0) {
          throw new Error(`${options.failureHint ?? `git ${args.join(" ")} failed`}: ${result.stderr || result.stdout}`);
        }
        return result;
      },
      serverJobPath: packageBin(),
      sourceRoot,
    });
    await syncRuntime.advance(paths, {}, acquiredSyncId);
  }
}
