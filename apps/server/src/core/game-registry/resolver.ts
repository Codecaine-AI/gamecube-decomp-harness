import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface GameValidationDefaults {
  qaTarget?: string;
  reportPath?: string;
  reportChangesPath?: string;
  objdiffPath?: string;
}

export interface GameDashboardDefaults {
  epochSize?: number | string;
  candidateWindow?: number | string;
  candidateRerank?: string;
  integrationResolverConcurrency?: number;
  agentTimeoutSeconds?: number;
  goalValue?: number;
}

export interface GamePrDefaults {
  groupMode?: string;
  titlePrefix?: string;
  branchPrefix?: string;
  maxFilesPerPr?: number;
  splitStrategy?: string;
  improvementMinGainPoints?: number;
  improvementMinMatchedBytes?: number;
}

export interface GameKnowledgeConfig {
  globalSources?: string[];
  gameSources?: string[];
}

export interface GameSandboxResourceClass {
  cpu?: number;
  memory_gib?: number;
  disk_gib?: number;
}

export interface GameSandboxConfig {
  resource_class?: GameSandboxResourceClass;
  snapshot_name?: string;
}

export interface SandboxRuntimeOptions {
  resource_class: Required<GameSandboxResourceClass>;
  snapshot_name: string;
}

export interface GameDescriptor {
  id: string;
  displayName?: string;
  kind?: string;
  repoRoot?: string;
  stateDir?: string;
  graphDb?: string;
  processName?: string;
  baseRef?: string;
  localEnv?: string;
  validation?: GameValidationDefaults;
  dashboard?: GameDashboardDefaults;
  pr?: GamePrDefaults;
  knowledge?: GameKnowledgeConfig;
  sandbox?: GameSandboxConfig;
}

export interface GamesConfig {
  defaultGame?: string;
}

export interface GameResolveOverrides {
  displayName?: string;
  kind?: string;
  repoRoot?: string;
  stateDir?: string;
  graphDb?: string;
  processName?: string;
  baseRef?: string;
  localEnv?: string;
  validation?: GameValidationDefaults;
  dashboard?: GameDashboardDefaults;
  pr?: GamePrDefaults;
  sandbox?: GameSandboxConfig;
}

export interface GameResolveOptions {
  gameId?: string;
  orchestratorRoot?: string;
  useDefaultGame?: boolean;
  explicitOverrides?: GameResolveOverrides;
  explicitOverrideBaseDir?: string;
}

export interface ResolvedGame {
  gameId: string;
  displayName: string;
  kind: string;
  repoRoot: string;
  stateDir: string;
  graphDbPath: string;
  processName: string;
  baseRef: string;
  localEnvPath: string;
  validation: Required<GameValidationDefaults>;
  dashboard: Required<GameDashboardDefaults>;
  pr: Required<GamePrDefaults>;
  knowledge: Required<GameKnowledgeConfig>;
  sandbox: SandboxRuntimeOptions;
  orchestratorRoot: string;
  gamesRoot: string;
  gameDir: string;
  descriptorPath: string;
  localOverridePath?: string;
  warnings: string[];
}

export interface GameSummary {
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

const gameIdPattern = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

const defaultValidation: Required<GameValidationDefaults> = {
  qaTarget: "changes_all",
  reportPath: "build/GALE01/report.json",
  reportChangesPath: "build/GALE01/report_changes.json",
  objdiffPath: "objdiff.json",
};

const defaultDashboard: Required<GameDashboardDefaults> = {
  epochSize: 64,
  candidateWindow: 128,
  candidateRerank: "opseq_hot_lane",
  integrationResolverConcurrency: 4,
  agentTimeoutSeconds: 1800,
  goalValue: 100,
};

const defaultPr: Required<GamePrDefaults> = {
  groupMode: "melee-subsystem",
  titlePrefix: "Melee decomp",
  branchPrefix: "pr-split",
  maxFilesPerPr: 30,
  splitStrategy: "deterministic",
  improvementMinGainPoints: 2,
  improvementMinMatchedBytes: 64,
};

const defaultKnowledge: Required<GameKnowledgeConfig> = {
  globalSources: [
    "past_prs",
    "decomp_standards",
  ],
  gameSources: ["code_graph"],
};

const defaultSandbox: SandboxRuntimeOptions = {
  resource_class: {
    cpu: 2,
    memory_gib: 4,
    disk_gib: 5,
  },
  snapshot_name: "",
};

function repoRootFromModule(): string {
  return fileURLToPath(new URL("../../../../..", import.meta.url));
}

export function orchestratorRoot(root?: string): string {
  return resolve(root ?? repoRootFromModule());
}

export function gamesRoot(root = orchestratorRoot()): string {
  return resolve(root, "games");
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

function validationFromObject(value: unknown): GameValidationDefaults | undefined {
  if (!isObject(value)) return undefined;
  return {
    qaTarget: stringField(value.qaTarget),
    reportPath: stringField(value.reportPath),
    reportChangesPath: stringField(value.reportChangesPath),
    objdiffPath: stringField(value.objdiffPath),
  };
}

function dashboardFromObject(value: unknown): GameDashboardDefaults | undefined {
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

function prFromObject(value: unknown): GamePrDefaults | undefined {
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

function knowledgeFromObject(value: unknown): GameKnowledgeConfig | undefined {
  if (!isObject(value)) return undefined;
  return {
    globalSources: stringArrayField(value.globalSources),
    gameSources: stringArrayField(value.gameSources),
  };
}

function sandboxFromObject(value: unknown): GameSandboxConfig | undefined {
  if (!isObject(value)) return undefined;
  const config: GameSandboxConfig = {};
  if (isObject(value.resource_class)) {
    const resourceClass: GameSandboxResourceClass = {};
    const cpu = numberField(value.resource_class.cpu);
    const memoryGiB = numberField(value.resource_class.memory_gib);
    const diskGiB = numberField(value.resource_class.disk_gib);
    if (cpu !== undefined) resourceClass.cpu = cpu;
    if (memoryGiB !== undefined) resourceClass.memory_gib = memoryGiB;
    if (diskGiB !== undefined) resourceClass.disk_gib = diskGiB;
    config.resource_class = resourceClass;
  }
  const snapshotName = stringField(value.snapshot_name);
  if (snapshotName !== undefined) config.snapshot_name = snapshotName;
  return config;
}

function descriptorFromObject(value: Record<string, unknown>, path: string): GameDescriptor {
  const id = stringField(value.id);
  if (!id) throw new Error(`Game descriptor ${path} is missing id`);
  if (!gameIdPattern.test(id)) throw new Error(`Invalid game id in ${path}: ${id}`);
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
    sandbox: sandboxFromObject(value.sandbox),
  };
}

function overrideFromObject(value: Record<string, unknown>, path: string, expectedId: string): GameResolveOverrides & { id?: string } {
  const id = stringField(value.id);
  if (id && id !== expectedId) throw new Error(`Local game override ${path} has id ${id}, expected ${expectedId}`);
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
    sandbox: sandboxFromObject(value.sandbox),
  };
}

function mergeNested<T extends object>(base: T | undefined, override: T | undefined): T | undefined {
  if (!base && !override) return undefined;
  return { ...(base ?? {}), ...(override ?? {}) } as T;
}

function mergeDescriptor(base: GameDescriptor, override: GameResolveOverrides & { id?: string }): GameDescriptor {
  const next: GameDescriptor = { ...base };
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
  next.sandbox = mergeNested(base.sandbox, override.sandbox);
  next.sandbox = next.sandbox
    ? { ...next.sandbox, resource_class: mergeNested(base.sandbox?.resource_class, override.sandbox?.resource_class) }
    : undefined;
  return next;
}

function readGamesConfig(root: string): GamesConfig {
  const raw = readOptionalJsonObject(resolve(gamesRoot(root), "config.json"));
  if (!raw) return {};
  return {
    defaultGame: stringField(raw.defaultGame),
  };
}

function descriptorPathFor(root: string, gameId: string): string | null {
  const descriptorPath = resolve(gamesRoot(root), gameId, "game.json");
  return existsSync(descriptorPath) ? descriptorPath : null;
}

function descriptorIds(root: string): string[] {
  const ids = new Set<string>();
  const dir = gamesRoot(root);
  if (!existsSync(dir)) return [];
  for (const entry of readdirSync(dir)) {
    if (!gameIdPattern.test(entry)) continue;
    try {
      if (statSync(resolve(dir, entry)).isDirectory() && descriptorPathFor(root, entry)) ids.add(entry);
    } catch {
      // Ignore transient or unreadable directory entries.
    }
  }
  return [...ids].sort();
}

function selectedGameId(options: GameResolveOptions, root: string): string {
  const explicit = options.gameId?.trim();
  if (explicit) return explicit;
  if (!options.useDefaultGame) throw new Error("No game id provided");
  const configDefault = readGamesConfig(root).defaultGame;
  if (configDefault) return configDefault;
  const ids = descriptorIds(root);
  if (ids.length === 1) return ids[0];
  if (ids.length === 0) throw new Error(`No games found under ${gamesRoot(root)}`);
  throw new Error(`Multiple games are configured (${ids.join(", ")}); pass --game <id> or set games/config.json defaultGame`);
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

function requiredSandbox(value: GameSandboxConfig | undefined): SandboxRuntimeOptions {
  return {
    resource_class: requiredNested(defaultSandbox.resource_class, value?.resource_class),
    snapshot_name: value?.snapshot_name ?? defaultSandbox.snapshot_name,
  };
}

export function sandboxRuntimeOptions(game?: Pick<ResolvedGame, "sandbox"> | null): SandboxRuntimeOptions {
  const sandbox = game?.sandbox ?? defaultSandbox;
  return {
    resource_class: { ...sandbox.resource_class },
    snapshot_name: sandbox.snapshot_name,
  };
}

function gameWarnings(game: Pick<ResolvedGame, "repoRoot" | "graphDbPath" | "localEnvPath">): string[] {
  const warnings: string[] = [];
  if (!existsSync(game.repoRoot)) warnings.push(`Game checkout does not exist: ${game.repoRoot}`);
  if (!existsSync(dirname(game.graphDbPath))) warnings.push(`Game graph directory does not exist: ${dirname(game.graphDbPath)}`);
  if (!existsSync(game.localEnvPath)) warnings.push(`Game local env does not exist: ${game.localEnvPath}`);
  return warnings;
}

export function resolveGame(options: GameResolveOptions = {}): ResolvedGame {
  const root = orchestratorRoot(options.orchestratorRoot);
  const gameId = selectedGameId(options, root);
  if (!gameIdPattern.test(gameId)) throw new Error(`Invalid game id: ${gameId}`);

  const descriptorPath = descriptorPathFor(root, gameId);
  if (!descriptorPath) throw new Error(`Game descriptor not found for ${gameId}`);
  const gameDir = dirname(descriptorPath);

  const descriptor = descriptorFromObject(readJsonObject(descriptorPath), descriptorPath);
  if (descriptor.id !== gameId) throw new Error(`Game descriptor ${descriptorPath} has id ${descriptor.id}, expected ${gameId}`);

  const localOverridePath = resolve(gameDir, "local.game.json");
  const localOverrideRaw = readOptionalJsonObject(localOverridePath);
  const localOverride = localOverrideRaw ? overrideFromObject(localOverrideRaw, localOverridePath, gameId) : {};
  const explicitBase = resolve(options.explicitOverrideBaseDir ?? process.cwd());
  const explicit = options.explicitOverrides ?? {};
  const explicitResolved: GameResolveOverrides = {
    ...explicit,
    repoRoot: resolveExplicitPath(explicit.repoRoot, explicitBase),
    stateDir: resolveExplicitPath(explicit.stateDir, explicitBase),
    graphDb: resolveExplicitPath(explicit.graphDb, explicitBase),
    localEnv: resolveExplicitPath(explicit.localEnv, explicitBase),
  };
  const merged = mergeDescriptor(mergeDescriptor(descriptor, localOverride), explicitResolved);
  const repoRoot = resolvePathCandidate(merged.repoRoot, gameDir, "./checkout");
  const stateDir = resolvePathCandidate(merged.stateDir, gameDir, "./state");
  const graphDbPath = resolvePathCandidate(merged.graphDb, gameDir, "./graph/graph.sqlite");
  const localEnvPath = resolvePathCandidate(merged.localEnv, gameDir, "./local.env");
  const resolved: ResolvedGame = {
    gameId,
    displayName: merged.displayName ?? gameId,
    kind: merged.kind ?? "decomp-project",
    repoRoot,
    stateDir,
    graphDbPath,
    processName: merged.processName ?? `${gameId}-live`,
    baseRef: merged.baseRef ?? "origin/master",
    localEnvPath,
    validation: requiredNested(defaultValidation, merged.validation),
    dashboard: requiredNested(defaultDashboard, merged.dashboard),
    pr: requiredNested(defaultPr, merged.pr),
    knowledge: requiredNested(defaultKnowledge, merged.knowledge),
    sandbox: requiredSandbox(merged.sandbox),
    orchestratorRoot: root,
    gamesRoot: gamesRoot(root),
    gameDir,
    descriptorPath,
    localOverridePath: localOverrideRaw ? localOverridePath : undefined,
    warnings: [],
  };
  resolved.warnings = gameWarnings(resolved);
  return resolved;
}

export function gameToSummary(game: ResolvedGame): GameSummary {
  return {
    id: game.gameId,
    displayName: game.displayName,
    kind: game.kind,
    repoRoot: game.repoRoot,
    stateDir: game.stateDir,
    graphDbPath: game.graphDbPath,
    processName: game.processName,
    baseRef: game.baseRef,
    descriptorPath: game.descriptorPath,
    localOverridePath: game.localOverridePath,
    repoRootExists: existsSync(game.repoRoot),
    stateDirExists: existsSync(game.stateDir),
    graphDbExists: existsSync(game.graphDbPath),
  };
}

export function listGames(options: Pick<GameResolveOptions, "orchestratorRoot"> = {}): GameSummary[] {
  const root = orchestratorRoot(options.orchestratorRoot);
  return descriptorIds(root).map((id) => gameToSummary(resolveGame({ orchestratorRoot: root, gameId: id })));
}
