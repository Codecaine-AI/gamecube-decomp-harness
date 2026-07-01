import { buildRunningProcessCommand, runningScheduling, type RunningProcessCommandPlan } from "@server/core/session-runtime/phases/running/process-command";
import { type ManagedProcessController, type ProcessLogLine } from "@server/infrastructure/process-control/managed-process-controller";
import { activeSchedulerEpoch, addEvent, getLatestRun, getRun, openState, schedulerEpochProgress, setRunDesiredWorkers } from "@server/core/session-runtime/run-state";
import type { ProjectSummary, ResolvedProject } from "@server/core/project-registry";
import type { RunRecord } from "@server/core/shared/types";
import { toolConcurrencyEnvFromInput } from "@server/core/tools/concurrency-config";

type JsonObject = Record<string, unknown>;
type JsonResponder = (data: unknown, init?: ResponseInit) => Response;

export interface CliResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export interface ProcessControlProjectContext {
  graphDbPath: string;
  project: ResolvedProject | null;
  repoRoot: string;
  stateDir: string;
  usePathOverrides: boolean;
}

export interface ProcessControlRuntimeDeps {
  appendLog: (stream: ProcessLogLine["stream"], text: string) => void;
  json: JsonResponder;
  processController: ManagedProcessController;
  processStatus: (stateDir?: string, project?: ResolvedProject | null) => JsonObject;
  projectToSummary: (project: ResolvedProject) => ProjectSummary;
  resolveDashboardProject: (input: JsonObject, options: { useDefaultProject?: boolean }) => ProcessControlProjectContext;
  runCli: (command: string[]) => Promise<CliResult>;
  serverJobPath: string;
}

export interface RunningProcessCommandWithProject extends RunningProcessCommandPlan {
  project: ResolvedProject | null;
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

function serverJobPrefix(paths: ProcessControlProjectContext, serverJobPath: string): string[] {
  const command = ["bun", serverJobPath];
  if (paths.project) command.push("--project", paths.project.projectId);
  command.push("--repo-root", paths.repoRoot, "--state-dir", paths.stateDir);
  return command;
}

function commandFromBody(body: JsonObject, deps: ProcessControlRuntimeDeps): RunningProcessCommandWithProject {
  const paths = deps.resolveDashboardProject(body, { useDefaultProject: true });
  const { graphDbPath, project, repoRoot, stateDir } = paths;
  const runId = stringValue(body.runId) || latestRunId(stateDir);
  const run = loadRun(stateDir, runId);
  const effectiveRepoRoot = paths.usePathOverrides ? repoRoot : (run?.project?.repoRoot ?? repoRoot);
  const effectiveStateDir = paths.usePathOverrides ? stateDir : (run?.project?.stateDir ?? stateDir);
  const effectiveGraphDbPath = paths.usePathOverrides ? graphDbPath : (run?.project?.graphDbPath ?? graphDbPath);
  const plan = buildRunningProcessCommand({
    body,
    graphDbPath: effectiveGraphDbPath,
    noRefillBatch: run?.goalKind === "never_run_sweep",
    project,
    repoRoot: effectiveRepoRoot,
    runId,
    serverJobPath: deps.serverJobPath,
    stateDir: effectiveStateDir,
  });
  return { ...plan, project, run };
}

export function createProcessControlRuntime(deps: ProcessControlRuntimeDeps): {
  drainManaged: (body: JsonObject) => Promise<JsonObject>;
  finishEpochNow: (body: JsonObject) => Promise<JsonObject>;
  startManagedProcess: (body: JsonObject) => Promise<Response>;
  stopManaged: (body: JsonObject) => Promise<JsonObject>;
} {
  return {
    async finishEpochNow(body): Promise<JsonObject> {
      const paths = deps.resolveDashboardProject(body, { useDefaultProject: true });
      const { project, stateDir } = paths;
      const runId = stringValue(body.runId) || latestRunId(stateDir);
      if (!runId) return { requested: false, reason: "no_run", process: deps.processStatus(stateDir, project) };

      const store = openState(stateDir);
      try {
        const epoch = activeSchedulerEpoch(store, runId);
        if (!epoch) return { requested: false, reason: "no_active_epoch", runId, process: deps.processStatus(stateDir, project) };
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
          process: deps.processStatus(stateDir, project),
        };
      } finally {
        store.db.close();
      }
    },

    async stopManaged(body): Promise<JsonObject> {
      const paths = deps.resolveDashboardProject(body, { useDefaultProject: true });
      const { stateDir } = paths;
      const runId = stringValue(body.runId) || latestRunId(stateDir);
      const name = paths.project?.processName ?? stringValue(body.processName, "melee-live");
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
        project: paths.project,
        recoverClaims: body.recoverClaims !== false,
        recoveryCommand,
        runCommand: (command) => deps.runCli(command),
        stateDir,
      });
    },

    async drainManaged(body): Promise<JsonObject> {
      const paths = deps.resolveDashboardProject(body, { useDefaultProject: true });
      const name = paths.project?.processName ?? stringValue(body.processName, "melee-live");
      return deps.processController.drain({ name, project: paths.project, stateDir: paths.stateDir });
    },

    async startManagedProcess(body): Promise<Response> {
      const { command, name, stateDir, project, run, runId } = commandFromBody(body, deps);
      if (deps.processController.hasActiveProcess(stateDir).active) {
        return deps.json({ error: "process already running", process: deps.processStatus(stateDir, project) }, { status: 409 });
      }
      if (runId) {
        const requestedWorkers = runningScheduling(body.maxWorkers).maxWorkers;
        const store = openState(stateDir);
        try {
          const currentRun = getRun(store, runId) ?? run;
          if (currentRun && currentRun.status !== "active") {
            return deps.json({ error: `Run ${currentRun.id} is ${currentRun.status}; resume it before starting workers.`, run: currentRun, process: deps.processStatus(stateDir, project) }, { status: 409 });
          }
          // The worker pool clamps --max-workers to the run's desired_workers,
          // so align the run record with the requested size before spawning.
          if (currentRun && currentRun.desiredWorkers !== requestedWorkers) {
            setRunDesiredWorkers(store, currentRun.id, requestedWorkers, "dashboard");
            deps.appendLog("ui", `run ${currentRun.id} desired_workers ${currentRun.desiredWorkers} -> ${requestedWorkers}`);
          }
        } finally {
          store.db.close();
        }
      }
      const env = toolConcurrencyEnvFromInput(body.toolConcurrency);
      if (Object.keys(env).length > 0) deps.appendLog("ui", `tool concurrency env: ${Object.keys(env).sort().join(", ")}`);
      deps.processController.spawn({ command, env, name, project, stateDir });
      return deps.json({ started: true, project: project ? deps.projectToSummary(project) : null, command, process: deps.processStatus(stateDir, project) });
    },
  };
}
