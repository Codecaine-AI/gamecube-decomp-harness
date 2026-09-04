import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { hardStopRun, settleStoppedRun } from "@server/core/cycle-runtime/phases/running/run-control.js";
import { getLatestRun, getRun, openState } from "@server/core/cycle-runtime/run-state";
import { createSyncRuntime } from "@server/core/cycle-runtime/phases/sync/runtime.js";
import { resolveGame } from "@server/core/game-registry";
import { stringArg, syncMergePolicyArg, type GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import { getHarnessState } from "@server/core/harness-state";
import { packageRoot, sourceRoot } from "@server/core/knowledge";
import { runCommand } from "@server/infrastructure/shell/run-command.js";

export async function settleRunOnExit(params: {
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
      if (run?.status === "active" || run?.status === "paused") {
        const unexpectedExit = stoppedReason === "database_closed" || stoppedReason === "error";
        if (unexpectedExit) {
          await hardStopRun({
            commandId: `command-run-loop-emergency-settled-${randomUUID()}`,
            confirmed: true,
            globals,
            processIntegrations: false,
            reason: `run-loop emergency settlement after ${stoppedReason}`,
            repoRoot: run.game?.repoRoot ?? globals.repoRoot,
            runId: run.id,
            store,
          });
        } else {
          settleStoppedRun({
            actor: "guardian",
            commandId: `command-run-loop-settled-${randomUUID()}`,
            leaseId,
            reason: `run-loop settled after ${stoppedReason}`,
            runId: run.id,
            store,
          });
        }
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
      mergePolicy: syncMergePolicyArg(args),
      resolveDashboardGame: () => paths,
      runGit: async (repoRoot, args, options = {}) => {
        const result = await runCommand(repoRoot, ["git", ...args]);
        if (options.check !== false && result.exitCode !== 0) {
          throw new Error(`${options.failureHint ?? `git ${args.join(" ")} failed`}: ${result.stderr || result.stdout}`);
        }
        return result;
      },
      stopManaged: async () => {
        throw new Error("A successor sync cannot request another run stop during exit settlement");
      },
      sourceRoot,
    });
    await syncRuntime.advance(paths, {}, acquiredSyncId);
  }
}
