import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadKnowledgeBoardSnapshot, resourceGraphDbPath } from "@server/core/knowledge";
import { createRun, openState } from "@server/core/cycle-runtime/run-state";
import { recordDashboardArtifact } from "@server/core/orchestrator-state";
import { numberArg, gameMetadata, stringArg, type GlobalArgs } from "@server/core/game-registry/runtime-options.js";

export async function initRun(globals: GlobalArgs, args: Map<string, string | true>): Promise<void> {
  const store = openState(globals.stateDir);
  try {
    const goalKind = stringArg(args, "--goal-kind", "matched_code_percent");
    const goalValue = numberArg(args, "--goal-value", globals.game?.dashboard.goalValue ?? 70);
    const desiredWorkers = numberArg(args, "--desired-workers", 16);
    const graphDbPath = stringArg(args, "--graph-db", globals.graphDbPath ?? resourceGraphDbPath());
    const game = gameMetadata(globals, { graphDbPath });
    const configurationSnapshot = {
      agent_timeout_seconds: globals.agentTimeoutSeconds ?? globals.game?.dashboard.agentTimeoutSeconds ?? 1800,
      desired_workers: desiredWorkers,
      dry_run_agents: globals.dryRunAgents,
      epoch_configure_command: stringArg(args, "--epoch-configure-command", "").trim(),
      goal_kind: goalKind,
      goal_value: goalValue,
      integration_resolver_concurrency: Math.max(
        1,
        Math.trunc(
          numberArg(
            args,
            "--integration-resolver-concurrency",
            globals.game?.dashboard.integrationResolverConcurrency ?? 4,
          ),
        ),
      ),
      model: globals.model,
      provider: globals.provider,
      thinking_level: globals.thinkingLevel,
      worker_configure_command: stringArg(args, "--worker-configure-command", "").trim(),
    };
    const run = createRun(store, goalKind, goalValue, desiredWorkers, game, {
      commandId: stringArg(args, "--command-id", "") || undefined,
      configurationSnapshot,
      requireReady: true,
    });
    const snapshot = loadKnowledgeBoardSnapshot(globals.repoRoot, { graphDbPath });
    const schedulableSources = new Set(snapshot.candidates.map((candidate) => candidate.sourcePath).filter(Boolean)).size;

    await mkdir(resolve(globals.stateDir, "runs", run.id, "snapshots"), { recursive: true });
    await writeFile(resolve(globals.stateDir, "runs", run.id, "snapshots", "initial_board.json"), JSON.stringify(snapshot, null, 2));
    recordDashboardArtifact(store, {
      runId: run.id,
      gameId: game?.gameId ?? globals.gameId ?? null,
      artifactType: "board_snapshot",
      artifactKey: "initial",
      sourcePath: snapshot.reportPath,
      sourceLabel: "initial_board",
      payload: snapshot as unknown as Record<string, unknown>,
      createdAt: snapshot.generatedAt,
    });
    console.log(
      JSON.stringify(
        {
          run,
          game: game ?? null,
          targetCount: snapshot.candidates.length,
          schedulableSources,
          stateDir: globals.stateDir,
          graphDbPath,
          measures: snapshot.measures,
        },
        null,
        2,
      ),
    );
  } finally {
    store.db.close();
  }
}
