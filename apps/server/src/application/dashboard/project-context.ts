import { resolve } from "node:path";
import { listProjects, projectToSummary, resolveProject, type ProjectRuntimeContext, type ProjectSummary, type ResolvedProject } from "@server/core/project-registry";
import { projectToolConcurrencyDefaults } from "@server/core/tools/concurrency-config";

type JsonObject = Record<string, unknown>;

export interface DashboardProjectContextService {
  availableProjects: () => ProjectSummary[];
  defaultProject: () => ResolvedProject | null;
  projectDefaults: (project: ResolvedProject | null) => JsonObject | null;
  requestPaths: (url: URL, options?: { useDefaultProject?: boolean }) => ProjectRuntimeContext;
  resolveDashboardProject: (input: JsonObject, options?: { useDefaultProject?: boolean }) => ProjectRuntimeContext;
}

export interface DashboardProjectContextServiceDeps {
  appendLog: (stream: "stdout" | "stderr" | "ui", text: string) => void;
  defaultRepoRoot: string;
  defaultStateDir: string;
  packageRoot: string;
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function boolValue(value: unknown): boolean {
  return value === true || value === "true";
}

export function createDashboardProjectContextService(deps: DashboardProjectContextServiceDeps): DashboardProjectContextService {
  function projectDefaults(project: ResolvedProject | null): JsonObject | null {
    if (!project) return null;
    return {
      processName: project.processName,
      baseRef: project.baseRef,
      graphDbPath: project.graphDbPath,
      validation: project.validation,
      dashboard: project.dashboard,
      toolConcurrency: projectToolConcurrencyDefaults(project.localEnvPath),
      pr: project.pr,
      knowledge: project.knowledge,
    };
  }

  function availableProjects(): ProjectSummary[] {
    try {
      return listProjects({ orchestratorRoot: deps.packageRoot });
    } catch (error) {
      deps.appendLog("stderr", `project list failed: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  function defaultProject(): ResolvedProject | null {
    try {
      return resolveProject({ orchestratorRoot: deps.packageRoot, useDefaultProject: true });
    } catch {
      return null;
    }
  }

  function resolveDashboardProject(input: JsonObject, options: { useDefaultProject?: boolean } = {}): ProjectRuntimeContext {
    const projectId = stringValue(input.projectId).trim();
    const usePathOverrides = boolValue(input.usePathOverrides);
    if (projectId || options.useDefaultProject) {
      try {
        const project = resolveProject({
          orchestratorRoot: deps.packageRoot,
          projectId: projectId || undefined,
          useDefaultProject: !projectId && options.useDefaultProject === true,
          explicitOverrides: usePathOverrides
            ? {
                repoRoot: stringValue(input.repoRoot) || undefined,
                stateDir: stringValue(input.stateDir) || undefined,
                graphDb: stringValue(input.graphDbPath, stringValue(input.graphDb)) || undefined,
              }
            : undefined,
        });
        return {
          project,
          repoRoot: project.repoRoot,
          stateDir: project.stateDir,
          graphDbPath: project.graphDbPath,
          usePathOverrides,
        };
      } catch (error) {
        if (projectId) throw error;
      }
    }

    return {
      project: null,
      repoRoot: resolve(stringValue(input.repoRoot, deps.defaultRepoRoot)),
      stateDir: resolve(stringValue(input.stateDir, deps.defaultStateDir)),
      graphDbPath: resolve(stringValue(input.graphDbPath, stringValue(input.graphDb, "")) || resolve(deps.defaultStateDir, "knowledge-graph.sqlite")),
      usePathOverrides: true,
    };
  }

  function requestPaths(url: URL, options: { useDefaultProject?: boolean } = {}): ProjectRuntimeContext {
    return resolveDashboardProject(
      {
        projectId: url.searchParams.get("projectId") ?? "",
        repoRoot: url.searchParams.get("repoRoot") ?? "",
        stateDir: url.searchParams.get("stateDir") ?? "",
        graphDbPath: url.searchParams.get("graphDbPath") ?? url.searchParams.get("graphDb") ?? "",
        usePathOverrides: url.searchParams.get("usePathOverrides") ?? "",
      },
      options,
    );
  }

  return {
    availableProjects,
    defaultProject,
    projectDefaults,
    requestPaths,
    resolveDashboardProject,
  };
}

export { projectToSummary };
