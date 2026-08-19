import { randomUUID } from "node:crypto";
import { newSpanId, releaseDispatch } from "@server/core/harness-state";
import { immediateTransaction } from "@server/core/orchestrator-state";
import { reconcilePendingIntegrations } from "@server/core/cycle";
import {
  buildRunningProcessCommand,
  runningProcessConfigurationConflicts,
  type RunningProcessCommandPlan,
} from "@server/core/cycle-runtime/phases/running/process-command";
import { type ManagedProcessController, type ProcessLogLine } from "@server/infrastructure/process-control/managed-process-controller";
import {
  activeSchedulerEpoch,
  addEvent,
  getLatestRun,
  getRun,
  openState,
  schedulerEpochProgress,
  updateRunStatus,
} from "@server/core/cycle-runtime/run-state";
import { activateRun, reconcileRunLeaseState } from "@server/core/cycle-runtime/phases/running/run-control.js";
import type { GameSummary, ResolvedGame } from "@server/core/game-registry";
import type { RunRecord } from "@server/core/shared/types";

type JsonObject = Record<string, unknown>;
type JsonResponder = (data: unknown, init?: ResponseInit) => Response;

export interface CliResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export interface ProcessControlGameContext {
  graphDbPath: string;
  game: ResolvedGame | null;
  repoRoot: string;
  stateDir: string;
  usePathOverrides: boolean;
}

export interface ProcessControlRuntimeDeps {
  appendLog: (stream: ProcessLogLine["stream"], text: string) => void;
  json: JsonResponder;
  processController: ManagedProcessController;
  processStatus: (stateDir?: string, game?: ResolvedGame | null) => JsonObject;
  gameToSummary: (game: ResolvedGame) => GameSummary;
  resolveDashboardGame: (input: JsonObject, options: { useDefaultGame?: boolean }) => ProcessControlGameContext;
  runCli: (command: string[]) => Promise<CliResult>;
  serverJobPath: string;
}

export interface RunningProcessCommandWithGame extends RunningProcessCommandPlan {
  game: ResolvedGame | null;
  run: RunRecord | null;
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function latestRunId(stateDir: string): string {
  const store = openState(stateDir);
  try {
    return getLatestRun(store)?.id ?? "";
  } finally {
    store.db.close();
  }
}

function loadRun(stateDir: string, runId: string): RunRecord | null {
  if (!runId) return null;
  const store = openState(stateDir);
  try {
    return getRun(store, runId);
  } finally {
    store.db.close();
  }
}

function serverJobPrefix(paths: ProcessControlGameContext, serverJobPath: string): string[] {
  const command = ["bun", serverJobPath];
  if (paths.game) command.push("--game", paths.game.gameId);
  command.push("--repo-root", paths.repoRoot, "--state-dir", paths.stateDir);
  return command;
}

function commandFromBody(body: JsonObject, deps: ProcessControlRuntimeDeps): RunningProcessCommandWithGame {
  const paths = deps.resolveDashboardGame(body, { useDefaultGame: true });
  const { graphDbPath, game, repoRoot, stateDir } = paths;
  const runId = stringValue(body.runId) || latestRunId(stateDir);
  const run = loadRun(stateDir, runId);
  const effectiveRepoRoot = paths.usePathOverrides ? repoRoot : (run?.game?.repoRoot ?? repoRoot);
  const effectiveStateDir = paths.usePathOverrides ? stateDir : (run?.game?.stateDir ?? stateDir);
  const effectiveGraphDbPath = paths.usePathOverrides ? graphDbPath : (run?.game?.graphDbPath ?? graphDbPath);
  if (!run?.inputs) throw new Error(run ? `Run ${run.id} has no immutable inputs` : `Run not found: ${runId}`);
  const plan = buildRunningProcessCommand({
    body,
    graphDbPath: effectiveGraphDbPath,
    noRefillBatch: run?.goalKind === "never_run_sweep",
    game,
    repoRoot: effectiveRepoRoot,
    runId,
    runInputs: run.inputs,
    serverJobPath: deps.serverJobPath,
    stateDir: effectiveStateDir,
  });
  return { ...plan, game, run };
}

export function createProcessControlRuntime(deps: ProcessControlRuntimeDeps): {
  drainManaged: (body: JsonObject) => Promise<JsonObject>;
  finishEpochNow: (body: JsonObject) => Promise<JsonObject>;
  startManagedProcess: (body: JsonObject) => Promise<Response>;
  stopManaged: (body: JsonObject) => Promise<JsonObject>;
} {
  return {
    async finishEpochNow(body): Promise<JsonObject> {
      const paths = deps.resolveDashboardGame(body, { useDefaultGame: true });
      const { game, stateDir } = paths;
      const runId = stringValue(body.runId) || latestRunId(stateDir);
      if (!runId) return { requested: false, reason: "no_run", process: deps.processStatus(stateDir, game) };

      const store = openState(stateDir);
      try {
        const epoch = activeSchedulerEpoch(store, runId);
        if (!epoch) return { requested: false, reason: "no_active_epoch", runId, process: deps.processStatus(stateDir, game) };
        const progress = schedulerEpochProgress(store, epoch.id);
        const eventId = addEvent(store, runId, "epoch_force_finish_requested", "dashboard", {
          epoch_id: epoch.id,
          ordinal: epoch.ordinal,
          available: progress.available,
          claimed: progress.claimed,
          finished: progress.finished,
          admitted: progress.admitted,
          reason: stringValue(body.reason, "dashboard_finish_epoch"),
          created_by: "dashboard",
        });
        deps.appendLog("ui", `finish epoch requested for epoch ${epoch.ordinal} (${progress.finished}/${progress.admitted} finished, ${progress.claimed} claimed, ${progress.available} available)`);
        return {
          requested: true,
          eventId,
          runId,
          epochId: epoch.id,
          ordinal: epoch.ordinal,
          progress,
          process: deps.processStatus(stateDir, game),
        };
      } finally {
        store.db.close();
      }
    },

    async stopManaged(body): Promise<JsonObject> {
      const paths = deps.resolveDashboardGame(body, { useDefaultGame: true });
      const { stateDir } = paths;
      const runId = stringValue(body.runId) || latestRunId(stateDir);
      const name = paths.game?.processName ?? stringValue(body.processName, "melee-live");
      const recoveryCommand =
        runId && body.recoverClaims !== false
          ? [
              ...serverJobPrefix(paths, deps.serverJobPath),
              "recover-claims",
              "--run-id",
              runId,
              "--force",
              "--reason",
              "ui stop requested",
            ]
          : null;
      return deps.processController.stop({
        name,
        game: paths.game,
        recoverClaims: body.recoverClaims !== false,
        recoveryCommand,
        runCommand: (command) => deps.runCli(command),
        stateDir,
      });
    },

    async drainManaged(body): Promise<JsonObject> {
      const paths = deps.resolveDashboardGame(body, { useDefaultGame: true });
      const name = paths.game?.processName ?? stringValue(body.processName, "melee-live");
      return deps.processController.drain({ name, game: paths.game, stateDir: paths.stateDir });
    },

    async startManagedProcess(body): Promise<Response> {
      const paths = deps.resolveDashboardGame(body, { useDefaultGame: true });
      const requestedRunId = stringValue(body.runId) || latestRunId(paths.stateDir);
      const requestedRun = loadRun(paths.stateDir, requestedRunId);
      if (!requestedRunId) {
        return deps.json({ error: "No run found. Initialize a run before starting workers.", process: deps.processStatus(paths.stateDir, paths.game) }, { status: 409 });
      }
      if (!requestedRun?.inputs) {
        return deps.json({ error: requestedRun ? `Run ${requestedRun.id} has no immutable inputs.` : `Run not found: ${requestedRunId}`, process: deps.processStatus(paths.stateDir, paths.game) }, { status: 409 });
      }
      const conflicts = runningProcessConfigurationConflicts(body, requestedRun.inputs, requestedRun.id);
      if (conflicts.length > 0) {
        return deps.json(
          {
            error: `Process start options conflict with immutable run configuration: ${conflicts.map((conflict) => conflict.field).join(", ")}`,
            blocker: conflicts[0]!.blocker,
            blocked_by: conflicts.map((conflict) => conflict.blocker),
            conflicts: conflicts.map(({ blocker: _blocker, ...conflict }) => conflict),
            run: requestedRun,
            process: deps.processStatus(paths.stateDir, paths.game),
          },
          { status: 409 },
        );
      }

      const { command, name, stateDir, game, run, runId } = commandFromBody(body, deps);
      if (deps.processController.hasActiveProcess(stateDir).active) {
        return deps.json({ error: "process already running", process: deps.processStatus(stateDir, game) }, { status: 409 });
      }
      const startCommandId = stringValue(body.commandId, `command-run-start-${randomUUID()}`);
      const startCorrelationId = runId;
      const startSpanId = newSpanId();
      let acquiredLease: { leaseId: string; gameId: string } | null = null;
      let activatedRun = false;
      let spawnCausationId = startCommandId;
      try {
        const store = openState(stateDir);
        try {
          // Resolve any commit-without-lineage crash window before this start
          // can acquire dispatch authority or spawn another scheduler process.
          reconcilePendingIntegrations(store);
          const beforeReconciliation = getRun(store, runId) ?? run;
          if (beforeReconciliation) {
            const repair = reconcileRunLeaseState({
              actor: "guardian",
              commandId: `command-run-startup-reconcile-${randomUUID()}`,
              reason: "startup repaired run status and dispatch lease disagreement",
              runId,
              store,
            });
            if (repair) deps.appendLog("stderr", repair.message);
          }
          let currentRun = getRun(store, runId) ?? run;
          if (currentRun && currentRun.status !== "ready" && currentRun.status !== "active") {
            return deps.json({ error: `Run ${currentRun.id} is ${currentRun.status}; it must be ready or active before starting workers.`, run: currentRun, process: deps.processStatus(stateDir, game) }, { status: 409 });
          }
          if (!currentRun) {
            return deps.json({ error: `Run not found: ${runId}`, process: deps.processStatus(stateDir, game) }, { status: 409 });
          }

          const gameId = game?.gameId ?? currentRun.game?.gameId ?? stringValue(body.gameId).trim();
          if (!gameId) {
            return deps.json({ error: `Run ${runId} has no game id; dispatch authority cannot be acquired.`, process: deps.processStatus(stateDir, game) }, { status: 409 });
          }
          const activation = activateRun({
            actor: "operator",
            commandId: startCommandId,
            gameId,
            reason: stringValue(body.reason, "start managed run process"),
            runId,
            spanId: startSpanId,
            store,
          });
          acquiredLease = { leaseId: activation.leaseId, gameId };
          activatedRun = true;
          spawnCausationId = currentRun.status === "active"
            ? startCommandId
            : (activation.run.causedByEventId ?? startCommandId);
          deps.appendLog("ui", `run ${currentRun.id} activated under dispatch lease ${acquiredLease.leaseId}`);
        } finally {
          store.db.close();
        }
        command.push("--lease-id", acquiredLease.leaseId);
        deps.processController.spawn({ command, name, game, stateDir });
      } catch (error) {
        if (acquiredLease) {
          const store = openState(stateDir);
          try {
            immediateTransaction(store.db, () => {
              let releaseCausationId = spawnCausationId;
              if (activatedRun) {
                const activeRun = getRun(store, runId);
                if (activeRun?.status === "active") {
                  const failedRun = updateRunStatus(store, runId, "failed", "operator", {
                    causationId: spawnCausationId,
                    commandId: startCommandId,
                    spanId: startSpanId,
                  });
                  releaseCausationId = failedRun.causedByEventId ?? spawnCausationId;
                }
              }
              releaseDispatch(store, {
                leaseId: acquiredLease!.leaseId,
                gameId: acquiredLease!.gameId,
                actor: "operator",
                causationId: releaseCausationId,
                commandId: startCommandId,
                correlationId: startCorrelationId,
                spanId: startSpanId,
              });
            });
          } finally {
            store.db.close();
          }
        }
        throw error;
      }
      return deps.json({ started: true, leaseId: acquiredLease.leaseId, game: game ? deps.gameToSummary(game) : null, command, process: deps.processStatus(stateDir, game) });
    },
  };
}
