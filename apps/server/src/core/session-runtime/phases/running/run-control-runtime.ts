import type { GlobalArgs } from "@server/core/project-registry/runtime-options.js";
import type { ResolvedProject } from "@server/core/project-registry";
import {
  DEFAULT_PI_MODEL,
  DEFAULT_PI_PROVIDER,
  DEFAULT_PI_THINKING_LEVEL,
} from "@server/core/project-registry/runtime-defaults.js";
import { getRun, openState } from "@server/core/session-runtime/run-state";
import {
  cancelRun,
  hardStopRun,
  pauseRun,
  recoverRun,
  RunControlConfirmationRequiredError,
} from "./run-control.js";

type JsonObject = Record<string, unknown>;

export interface RunControlProjectContext {
  graphDbPath: string;
  project: ResolvedProject | null;
  repoRoot: string;
  stateDir: string;
}

export interface RunControlRuntimeDeps {
  hasActiveProcess: (stateDir: string) => { active: boolean };
  drainManaged: (body: JsonObject) => Promise<JsonObject>;
  resolveDashboardProject: (
    input: JsonObject,
    options: { useDefaultProject?: boolean },
  ) => RunControlProjectContext;
  stopManaged: (body: JsonObject) => Promise<JsonObject>;
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function runIdFromBody(body: JsonObject, stateDir: string): string {
  const explicit = stringValue(body.runId);
  if (explicit) return explicit;
  const store = openState(stateDir);
  try {
    const latest = store.db.query("SELECT id FROM runs ORDER BY created_at DESC LIMIT 1").get() as
      | { id: string }
      | null;
    return latest?.id ?? "";
  } finally {
    store.db.close();
  }
}

function globalsFor(paths: RunControlProjectContext): GlobalArgs {
  return {
    dryRunAgents: false,
    graphDbPath: paths.graphDbPath,
    model: DEFAULT_PI_MODEL,
    project: paths.project ?? undefined,
    projectId: paths.project?.projectId,
    provider: DEFAULT_PI_PROVIDER,
    repoRoot: paths.repoRoot,
    stateDir: paths.stateDir,
    thinkingLevel: DEFAULT_PI_THINKING_LEVEL,
  };
}

function requireConfirmed(body: JsonObject, action: string): void {
  if (body.confirmed !== true) throw new RunControlConfirmationRequiredError(action);
}

function currentStatus(paths: RunControlProjectContext, runId: string): string {
  const store = openState(paths.stateDir);
  try {
    const run = getRun(store, runId);
    if (!run) throw new Error(`Run not found: ${runId}`);
    return run.status;
  } finally {
    store.db.close();
  }
}

export function createRunControlRuntime(deps: RunControlRuntimeDeps): {
  cancel: (body: JsonObject) => JsonObject;
  hardStop: (body: JsonObject) => Promise<JsonObject>;
  pause: (body: JsonObject) => Promise<JsonObject>;
  recover: (body: JsonObject) => Promise<JsonObject>;
} {
  return {
    cancel(body): JsonObject {
      const paths = deps.resolveDashboardProject(body, { useDefaultProject: true });
      const runId = runIdFromBody(body, paths.stateDir);
      const store = openState(paths.stateDir);
      try {
        const run = cancelRun({
          commandId: stringValue(body.commandId) || undefined,
          confirmed: body.confirmed === true,
          correlationId: stringValue(body.correlationId) || runId,
          reason: stringValue(body.reason, "operator cancelled run"),
          runId,
          store,
        });
        return { cancelled: true, run };
      } finally {
        store.db.close();
      }
    },

    async hardStop(body): Promise<JsonObject> {
      requireConfirmed(body, "run.hard_stop");
      const paths = deps.resolveDashboardProject(body, { useDefaultProject: true });
      const runId = runIdFromBody(body, paths.stateDir);
      const process = deps.hasActiveProcess(paths.stateDir).active
        ? await deps.stopManaged({ ...body, recoverClaims: false, runId })
        : { stopped: false, reason: "not_running" };
      const store = openState(paths.stateDir);
      try {
        const result = await hardStopRun({
          commandId: stringValue(body.commandId) || undefined,
          confirmed: true,
          correlationId: stringValue(body.correlationId) || runId,
          globals: globalsFor(paths),
          reason: stringValue(body.reason, "operator hard-stopped run"),
          runId,
          store,
        });
        return { hardStopped: true, process, ...result };
      } finally {
        store.db.close();
      }
    },

    async pause(body): Promise<JsonObject> {
      const paths = deps.resolveDashboardProject(body, { useDefaultProject: true });
      const runId = runIdFromBody(body, paths.stateDir);
      const store = openState(paths.stateDir);
      let result;
      try {
        result = pauseRun({
          commandId: stringValue(body.commandId) || undefined,
          correlationId: stringValue(body.correlationId) || runId,
          reason: stringValue(body.reason, "operator paused run"),
          runId,
          store,
        });
      } finally {
        store.db.close();
      }
      if (result.settled) return { draining: false, paused: true, process: null, ...result };
      const process = await deps.drainManaged({ ...body, runId });
      return { draining: true, paused: false, process, ...result };
    },

    async recover(body): Promise<JsonObject> {
      requireConfirmed(body, "run.recover");
      const paths = deps.resolveDashboardProject(body, { useDefaultProject: true });
      const runId = runIdFromBody(body, paths.stateDir);
      const status = currentStatus(paths, runId);
      const process = status === "failed" && deps.hasActiveProcess(paths.stateDir).active
        ? await deps.stopManaged({ ...body, recoverClaims: false, runId })
        : null;
      const store = openState(paths.stateDir);
      try {
        const result = await recoverRun({
          commandId: stringValue(body.commandId) || undefined,
          confirmed: true,
          correlationId: stringValue(body.correlationId) || runId,
          globals: globalsFor(paths),
          hasActiveProcess: deps.hasActiveProcess,
          reason: stringValue(body.reason, "operator recovered run"),
          runId,
          store,
        });
        return { recovered: true, process, ...result };
      } finally {
        store.db.close();
      }
    },
  };
}
