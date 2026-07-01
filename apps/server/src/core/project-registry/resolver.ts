import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface ProjectValidationDefaults {
  qaTarget?: string;
  reportPath?: string;
  reportChangesPath?: string;
  objdiffPath?: string;
}

export interface ProjectDashboardDefaults {
  epochSize?: number | string;
  candidateWindow?: number | string;
  candidateRerank?: string;
  integrationResolverConcurrency?: number;
  agentTimeoutSeconds?: number;
  goalValue?: number;
}

export interface ProjectPrDefaults {
  groupMode?: string;
  titlePrefix?: string;
  branchPrefix?: string;
  maxFilesPerPr?: number;
  splitStrategy?: string;
  improvementMinGainPoints?: number;
  improvementMinMatchedBytes?: number;
}

export interface ProjectKnowledgeConfig {
  globalSources?: string[];
  projectSources?: string[];
}

export interface ProjectDescriptor {
  id: string;
  displayName?: string;
  kind?: string;
  repoRoot?: string;
  stateDir?: string;
  graphDb?: string;
  processName?: string;
  baseRef?: string;
  localEnv?: string;
  validation?: ProjectValidationDefaults;
  dashboard?: ProjectDashboardDefaults;
  pr?: ProjectPrDefaults;
  knowledge?: ProjectKnowledgeConfig;
}

export interface ProjectsConfig {
  defaultProject?: string;
}

export interface ProjectResolveOverrides {
  displayName?: string;
  kind?: string;
  repoRoot?: string;
  stateDir?: string;
  graphDb?: string;
  processName?: string;
  baseRef?: string;
  localEnv?: string;
  validation?: ProjectValidationDefaults;
  dashboard?: ProjectDashboardDefaults;
  pr?: ProjectPrDefaults;
}

export interface ProjectResolveOptions {
  projectId?: string;
  orchestratorRoot?: string;
  useDefaultProject?: boolean;
  explicitOverrides?: ProjectResolveOverrides;
  explicitOverrideBaseDir?: string;
}

export interface ResolvedProject {
  projectId: string;
  displayName: string;
  kind: string;
  repoRoot: string;
  stateDir: string;
  graphDbPath: string;
  processName: string;
  baseRef: string;
  localEnvPath: string;
  validation: Required<ProjectValidationDefaults>;
  dashboard: Required<ProjectDashboardDefaults>;
  pr: Required<ProjectPrDefaults>;
  knowledge: Required<ProjectKnowledgeConfig>;
  orchestratorRoot: string;
  projectsRoot: string;
  projectDir: string;
  descriptorPath: string;
  localOverridePath?: string;
  warnings: string[];
}

export interface ProjectSummary {
  id: string;
  displayName: string;
  kind: string;
  repoRoot: string;
  stateDir: string;
  graphDbPath: string;
  processName: string;
  baseRef: string;
  descriptorPath: string;
  localOverridePath?: string;
  repoRootExists: boolean;
  stateDirExists: boolean;
  graphDbExists: boolean;
}

const projectIdPattern = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

const defaultValidation: Required<ProjectValidationDefaults> = {
  qaTarget: "changes_all",
  reportPath: "build/GALE01/report.json",
  reportChangesPath: "build/GALE01/report_changes.json",
  objdiffPath: "objdiff.json",
};

const defaultDashboard: Required<ProjectDashboardDefaults> = {
  epochSize: 64,
  candidateWindow: 128,
  candidateRerank: "opseq_hot_lane",
  integrationResolverConcurrency: 4,
  agentTimeoutSeconds: 1800,
  goalValue: 100,
};

const defaultPr: Required<ProjectPrDefaults> = {
  groupMode: "melee-subsystem",
  titlePrefix: "Melee decomp",
  branchPrefix: "pr-split",
  maxFilesPerPr: 30,
  splitStrategy: "deterministic",
  improvementMinGainPoints: 2,
  improvementMinMatchedBytes: 64,
};

const defaultKnowledge: Required<ProjectKnowledgeConfig> = {
  globalSources: [
    "past_prs",
    "decomp_standards",
    "ssbm_data_sheet",
    "powerpc_docs",
    "external_mirrors",
    "path_facts",
  ],
  projectSources: ["code_graph"],
};

function repoRootFromModule(): string {
  return fileURLToPath(new URL("../../../../..", import.meta.url));
}

export function orchestratorRoot(root?: string): string {
  return resolve(root ?? repoRootFromModule());
}

export function projectsRoot(root = orchestratorRoot()): string {
  return resolve(root, "projects");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readJsonObject(path: string): Record<string, unknown> {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (!isObject(parsed)) throw new Error(`Expected JSON object in ${path}`);
  return parsed;
}

function readOptionalJsonObject(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null;
  return readJsonObject(path);
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function numberField(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringOrNumberField(value: unknown): string | number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return stringField(value);
}

function stringArrayField(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : undefined;
}

function validationFromObject(value: unknown): ProjectValidationDefaults | undefined {
  if (!isObject(value)) return undefined;
  return {
    qaTarget: stringField(value.qaTarget),
    reportPath: stringField(value.reportPath),
    reportChangesPath: stringField(value.reportChangesPath),
    objdiffPath: stringField(value.objdiffPath),
  };
}

function dashboardFromObject(value: unknown): ProjectDashboardDefaults | undefined {
  if (!isObject(value)) return undefined;
  return {
    epochSize: stringOrNumberField(value.epochSize),
    candidateWindow: stringOrNumberField(value.candidateWindow),
    candidateRerank: stringField(value.candidateRerank),
    integrationResolverConcurrency: numberField(value.integrationResolverConcurrency),
    agentTimeoutSeconds: numberField(value.agentTimeoutSeconds),
    goalValue: numberField(value.goalValue),
  };
}

function prFromObject(value: unknown): ProjectPrDefaults | undefined {
  if (!isObject(value)) return undefined;
  return {
    groupMode: stringField(value.groupMode),
    titlePrefix: stringField(value.titlePrefix),
    branchPrefix: stringField(value.branchPrefix),
    maxFilesPerPr: numberField(value.maxFilesPerPr),
    splitStrategy: stringField(value.splitStrategy),
    improvementMinGainPoints: numberField(value.improvementMinGainPoints),
    improvementMinMatchedBytes: numberField(value.improvementMinMatchedBytes),
  };
}

function knowledgeFromObject(value: unknown): ProjectKnowledgeConfig | undefined {
  if (!isObject(value)) return undefined;
  return {
    globalSources: stringArrayField(value.globalSources),
    projectSources: stringArrayField(value.projectSources),
  };
}

function descriptorFromObject(value: Record<string, unknown>, path: string): ProjectDescriptor {
  const id = stringField(value.id);
  if (!id) throw new Error(`Project descriptor ${path} is missing id`);
  if (!projectIdPattern.test(id)) throw new Error(`Invalid project id in ${path}: ${id}`);
  return {
    id,
    displayName: stringField(value.displayName),
    kind: stringField(value.kind),
    repoRoot: stringField(value.repoRoot),
    stateDir: stringField(value.stateDir),
    graphDb: stringField(value.graphDb),
    processName: stringField(value.processName),
    baseRef: stringField(value.baseRef),
    localEnv: stringField(value.localEnv),
    validation: validationFromObject(value.validation),
    dashboard: dashboardFromObject(value.dashboard),
    pr: prFromObject(value.pr),
    knowledge: knowledgeFromObject(value.knowledge),
  };
}

function overrideFromObject(value: Record<string, unknown>, path: string, expectedId: string): ProjectResolveOverrides & { id?: string } {
  const id = stringField(value.id);
  if (id && id !== expectedId) throw new Error(`Local project override ${path} has id ${id}, expected ${expectedId}`);
  return {
    id,
    displayName: stringField(value.displayName),
    kind: stringField(value.kind),
    repoRoot: stringField(value.repoRoot),
    stateDir: stringField(value.stateDir),
    graphDb: stringField(value.graphDb),
    processName: stringField(value.processName),
    baseRef: stringField(value.baseRef),
    localEnv: stringField(value.localEnv),
    validation: validationFromObject(value.validation),
    dashboard: dashboardFromObject(value.dashboard),
    pr: prFromObject(value.pr),
  };
}

function mergeNested<T extends object>(base: T | undefined, override: T | undefined): T | undefined {
  if (!base && !override) return undefined;
  return { ...(base ?? {}), ...(override ?? {}) } as T;
}

function mergeDescriptor(base: ProjectDescriptor, override: ProjectResolveOverrides & { id?: string }): ProjectDescriptor {
  const next: ProjectDescriptor = { ...base };
  if (override.displayName !== undefined) next.displayName = override.displayName;
  if (override.kind !== undefined) next.kind = override.kind;
  if (override.repoRoot !== undefined) next.repoRoot = override.repoRoot;
  if (override.stateDir !== undefined) next.stateDir = override.stateDir;
  if (override.graphDb !== undefined) next.graphDb = override.graphDb;
  if (override.processName !== undefined) next.processName = override.processName;
  if (override.baseRef !== undefined) next.baseRef = override.baseRef;
  if (override.localEnv !== undefined) next.localEnv = override.localEnv;
  next.validation = mergeNested(base.validation, override.validation);
  next.dashboard = mergeNested(base.dashboard, override.dashboard);
  next.pr = mergeNested(base.pr, override.pr);
  next.knowledge = base.knowledge;
  return next;
}

function readProjectsConfig(root: string): ProjectsConfig {
  const path = resolve(projectsRoot(root), "config.json");
  const raw = readOptionalJsonObject(path);
  if (!raw) return {};
  return {
    defaultProject: stringField(raw.defaultProject),
  };
}

function descriptorIds(root: string): string[] {
  const dir = projectsRoot(root);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((entry) => projectIdPattern.test(entry))
    .filter((entry) => {
      try {
        return statSync(resolve(dir, entry)).isDirectory() && existsSync(resolve(dir, entry, "project.json"));
      } catch {
        return false;
      }
    })
    .sort();
}

function selectedProjectId(options: ProjectResolveOptions, root: string): string {
  const explicit = options.projectId?.trim();
  if (explicit) return explicit;
  if (!options.useDefaultProject) throw new Error("No project id provided");
  const configDefault = readProjectsConfig(root).defaultProject;
  if (configDefault) return configDefault;
  const ids = descriptorIds(root);
  if (ids.length === 1) return ids[0];
  if (ids.length === 0) throw new Error(`No projects found under ${projectsRoot(root)}`);
  throw new Error(`Multiple projects are configured (${ids.join(", ")}); pass --project <id> or set projects/config.json defaultProject`);
}

function resolvePathCandidate(value: string | undefined, baseDir: string, fallback: string): string {
  const raw = value || fallback;
  return isAbsolute(raw) ? resolve(raw) : resolve(baseDir, raw);
}

function resolveExplicitPath(value: string | undefined, baseDir: string): string | undefined {
  if (!value) return undefined;
  return isAbsolute(value) ? resolve(value) : resolve(baseDir, value);
}

function requiredNested<T extends object>(defaults: Required<T>, value: T | undefined): Required<T> {
  return { ...defaults, ...(value ?? {}) } as Required<T>;
}

function projectWarnings(project: Pick<ResolvedProject, "repoRoot" | "graphDbPath" | "localEnvPath">): string[] {
  const warnings: string[] = [];
  if (!existsSync(project.repoRoot)) warnings.push(`Project checkout does not exist: ${project.repoRoot}`);
  if (!existsSync(dirname(project.graphDbPath))) warnings.push(`Project graph directory does not exist: ${dirname(project.graphDbPath)}`);
  if (!existsSync(project.localEnvPath)) warnings.push(`Project local env does not exist: ${project.localEnvPath}`);
  return warnings;
}

export function resolveProject(options: ProjectResolveOptions = {}): ResolvedProject {
  const root = orchestratorRoot(options.orchestratorRoot);
  const projectId = selectedProjectId(options, root);
  if (!projectIdPattern.test(projectId)) throw new Error(`Invalid project id: ${projectId}`);

  const projectDir = resolve(projectsRoot(root), projectId);
  const descriptorPath = resolve(projectDir, "project.json");
  if (!existsSync(descriptorPath)) throw new Error(`Project descriptor not found: ${descriptorPath}`);

  const descriptor = descriptorFromObject(readJsonObject(descriptorPath), descriptorPath);
  if (descriptor.id !== projectId) throw new Error(`Project descriptor ${descriptorPath} has id ${descriptor.id}, expected ${projectId}`);

  const localOverridePath = resolve(projectDir, "local.project.json");
  const localOverrideRaw = readOptionalJsonObject(localOverridePath);
  const localOverride = localOverrideRaw ? overrideFromObject(localOverrideRaw, localOverridePath, projectId) : {};
  const explicitBase = resolve(options.explicitOverrideBaseDir ?? process.cwd());
  const explicit = options.explicitOverrides ?? {};
  const explicitResolved: ProjectResolveOverrides = {
    ...explicit,
    repoRoot: resolveExplicitPath(explicit.repoRoot, explicitBase),
    stateDir: resolveExplicitPath(explicit.stateDir, explicitBase),
    graphDb: resolveExplicitPath(explicit.graphDb, explicitBase),
    localEnv: resolveExplicitPath(explicit.localEnv, explicitBase),
  };
  const merged = mergeDescriptor(mergeDescriptor(descriptor, localOverride), explicitResolved);
  const repoRoot = resolvePathCandidate(merged.repoRoot, projectDir, "./checkout");
  const stateDir = resolvePathCandidate(merged.stateDir, projectDir, "./state");
  const graphDbPath = resolvePathCandidate(merged.graphDb, projectDir, "./graph/graph.sqlite");
  const localEnvPath = resolvePathCandidate(merged.localEnv, projectDir, "./local.env");
  const resolved: ResolvedProject = {
    projectId,
    displayName: merged.displayName ?? projectId,
    kind: merged.kind ?? "decomp-project",
    repoRoot,
    stateDir,
    graphDbPath,
    processName: merged.processName ?? `${projectId}-live`,
    baseRef: merged.baseRef ?? "origin/master",
    localEnvPath,
    validation: requiredNested(defaultValidation, merged.validation),
    dashboard: requiredNested(defaultDashboard, merged.dashboard),
    pr: requiredNested(defaultPr, merged.pr),
    knowledge: requiredNested(defaultKnowledge, merged.knowledge),
    orchestratorRoot: root,
    projectsRoot: projectsRoot(root),
    projectDir,
    descriptorPath,
    localOverridePath: localOverrideRaw ? localOverridePath : undefined,
    warnings: [],
  };
  resolved.warnings = projectWarnings(resolved);
  return resolved;
}

export function projectToSummary(project: ResolvedProject): ProjectSummary {
  return {
    id: project.projectId,
    displayName: project.displayName,
    kind: project.kind,
    repoRoot: project.repoRoot,
    stateDir: project.stateDir,
    graphDbPath: project.graphDbPath,
    processName: project.processName,
    baseRef: project.baseRef,
    descriptorPath: project.descriptorPath,
    localOverridePath: project.localOverridePath,
    repoRootExists: existsSync(project.repoRoot),
    stateDirExists: existsSync(project.stateDir),
    graphDbExists: existsSync(project.graphDbPath),
  };
}

export function listProjects(options: Pick<ProjectResolveOptions, "orchestratorRoot"> = {}): ProjectSummary[] {
  const root = orchestratorRoot(options.orchestratorRoot);
  return descriptorIds(root).map((id) => projectToSummary(resolveProject({ orchestratorRoot: root, projectId: id })));
}
