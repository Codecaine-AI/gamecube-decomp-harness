import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadKnowledgeBoardSnapshot, resourceGraphDbPath } from "@server/core/knowledge";
import { normalizeCandidateRerankMode } from "@server/core/session-runtime/phases/running/board";
import { createRun, openState, parseEpochSize } from "@server/core/session-runtime/run-state";
import { recordDashboardArtifact } from "@server/core/orchestrator-state";
import { numberArg, projectMetadata, stringArg, type GlobalArgs } from "@server/core/project-registry/runtime-options.js";

function positiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return Math.max(1, Math.floor(fallback));
  return Math.max(1, Math.floor(parsed));
}

export async function initRun(globals: GlobalArgs, args: Map<string, string | true>): Promise<void> {
  const store = openState(globals.stateDir);
  try {
    const goalKind = stringArg(args, "--goal-kind", "matched_code_percent");
    const goalValue = numberArg(args, "--goal-value", globals.project?.dashboard.goalValue ?? 70);
    const desiredWorkers = numberArg(args, "--desired-workers", 16);
    const epochSize = parseEpochSize(stringArg(args, "--epoch-size", globals.project?.dashboard.epochSize == null ? "64" : String(globals.project.dashboard.epochSize)));
    const graphDbPath = stringArg(args, "--graph-db", globals.graphDbPath ?? resourceGraphDbPath());
    const project = projectMetadata(globals, { graphDbPath });
    const epochDerivedWindow = epochSize.mode === "fixed" ? Math.max(desiredWorkers, epochSize.value ?? desiredWorkers) : Math.max(desiredWorkers, 64);
    const candidateWindowArg = args.get("--candidate-window");
    const candidateWindowDefault = typeof candidateWindowArg === "string" ? candidateWindowArg : globals.project?.dashboard.candidateWindow;
    const candidateWindow = Math.max(desiredWorkers, positiveInt(candidateWindowDefault, epochDerivedWindow));
    const candidateRerankArg = args.get("--candidate-rerank");
    const candidateRerank = normalizeCandidateRerankMode(
      typeof candidateRerankArg === "string" ? candidateRerankArg : globals.project?.dashboard.candidateRerank,
    );
    const configurationSnapshot = {
      agent_timeout_seconds: globals.agentTimeoutSeconds ?? globals.project?.dashboard.agentTimeoutSeconds ?? 1800,
      candidate_rerank: candidateRerank,
      candidate_window: candidateWindow,
      desired_workers: desiredWorkers,
      dry_run_agents: globals.dryRunAgents,
      epoch_configure_command: stringArg(args, "--epoch-configure-command", "").trim(),
      epoch_size: epochSize,
      goal_kind: goalKind,
      goal_value: goalValue,
      integration_resolver_concurrency: Math.max(
        1,
        Math.trunc(
          numberArg(
            args,
            "--integration-resolver-concurrency",
            globals.project?.dashboard.integrationResolverConcurrency ?? 4,
          ),
        ),
      ),
      model: globals.model,
      provider: globals.provider,
      thinking_level: globals.thinkingLevel,
      worker_configure_command: stringArg(args, "--worker-configure-command", "").trim(),
    };
    const run = createRun(store, goalKind, goalValue, desiredWorkers, project, {
      commandId: stringArg(args, "--command-id", "") || undefined,
      configurationSnapshot,
      requireReady: true,
    });
    const snapshot = loadKnowledgeBoardSnapshot(globals.repoRoot, candidateWindow, {
      candidateRerank,
      graphDbPath,
      predictorDbPath: store.path,
      predictorSessionId: run.id,
    });
    const schedulableSources = new Set(snapshot.candidates.map((candidate) => candidate.sourcePath).filter(Boolean)).size;

    await mkdir(resolve(globals.stateDir, "runs", run.id, "snapshots"), { recursive: true });
    await writeFile(resolve(globals.stateDir, "runs", run.id, "snapshots", "initial_board.json"), JSON.stringify(snapshot, null, 2));
    recordDashboardArtifact(store, {
      runId: run.id,
      projectId: project?.projectId ?? globals.projectId ?? null,
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
          project: project ?? null,
          targetCount: snapshot.candidates.length,
          schedulableSources,
          candidateWindow,
          candidateRerank,
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
