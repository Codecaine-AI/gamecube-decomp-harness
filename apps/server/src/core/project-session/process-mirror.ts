import { markPreparingComplete as runtimeMarkPreparingComplete, startRunning as runtimeStartRunning } from "@server/core/session-runtime";
import { sessionProcessState } from "./process-state.js";
import { getActiveProjectSession, getOrCreateActiveProjectSession, updateProjectSession } from "./store.js";
import { openState } from "@server/core/session-runtime/run-state";
import type { ProjectSummary, ResolvedProject } from "@server/core/project-registry";

type ProjectIdentity = {
  baseRef: string | null;
  graphDbPath: string | null;
  id: string;
  repoRoot: string | null;
  stateDir: string | null;
};

export interface ProjectSessionProcessMirrorDeps {
  appendLog: (stream: "stdout" | "stderr" | "ui", text: string) => void;
}

export interface ProjectSessionProcessMirror {
  mirrorProcessStateToProjectSession: (params: {
    command?: string[];
    createIfMissing?: boolean;
    endedAt?: string | null;
    graphDbPath?: string | null;
    name?: string | null;
    pid?: number | null;
    processFilePath?: string | null;
    project: ResolvedProject | ProjectSummary | null | undefined;
    repoRoot?: string | null;
    startedAt?: string | null;
    state?: string | null;
    stateDir: string;
  }) => void;
  projectIdentity: (project: ResolvedProject | ProjectSummary | null | undefined) => ProjectIdentity | null;
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function createProjectSessionProcessMirror(deps: ProjectSessionProcessMirrorDeps): ProjectSessionProcessMirror {
  function projectIdentity(project: ResolvedProject | ProjectSummary | null | undefined): ProjectIdentity | null {
    if (!project) return null;
    const candidate = project as Partial<ResolvedProject & ProjectSummary>;
    const id = stringValue(candidate.projectId, stringValue(candidate.id));
    if (!id) return null;
    return {
      id,
      baseRef: stringValue(candidate.baseRef) || null,
      graphDbPath: stringValue(candidate.graphDbPath) || null,
      repoRoot: stringValue(candidate.repoRoot) || null,
      stateDir: stringValue(candidate.stateDir) || null,
    };
  }

  function mirrorProcessStateToProjectSession(params: Parameters<ProjectSessionProcessMirror["mirrorProcessStateToProjectSession"]>[0]): void {
    const identity = projectIdentity(params.project);
    if (!identity) return;
    const store = openState(params.stateDir);
    try {
      let record = params.createIfMissing
          ? getOrCreateActiveProjectSession(store.db, {
            projectId: identity.id,
            baseRef: identity.baseRef,
            actor: "runner",
            worktreeIdentity: params.repoRoot ?? identity.repoRoot ?? undefined,
          })
        : getActiveProjectSession(store.db, identity.id);
      if (!record) return;
      if (params.createIfMissing && record.phase === "preparing") {
        if (record.preparing_state_json.status !== "complete") {
          record = runtimeMarkPreparingComplete(store.db, { id: record.id }, {
            completion: { source: "process_start" },
            correlationId: record.session_uuid,
          }).record;
        }
        record = runtimeStartRunning(store.db, { id: record.id }, { correlationId: record.session_uuid }).record;
      }
      updateProjectSession(store.db, record.id, {
        process_state_json: sessionProcessState({
          command: params.command,
          endedAt: params.endedAt,
          graphDbPath: params.graphDbPath ?? identity.graphDbPath,
          name: params.name,
          pid: params.pid,
          processFilePath: params.processFilePath,
          projectId: identity.id,
          repoRoot: params.repoRoot ?? identity.repoRoot,
          sessionUuid: record.session_uuid,
          startedAt: params.startedAt,
          state: params.state,
          stateDir: params.stateDir ?? identity.stateDir,
        }),
      });
    } catch (error) {
      deps.appendLog("stderr", `project-session process mirror failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      store.db.close();
    }
  }

  return { mirrorProcessStateToProjectSession, projectIdentity };
}
