import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gameLayoutPath, readGameDescriptorConfig } from "./config.js";
import type { GameFormattingConfig, GameSymbolCheckConfig } from "./build-layout.js";

export interface GameValidationDefaults {
  qaTarget?: string;
  reportPath?: string;
  reportChangesPath?: string;
  objdiffPath?: string;
  /** Game-owned vendor paths excluded from worker target admission. */
  targetExcludePrefixes?: string[];
  addressNamedStaticDataAllowlist?: AddressNamedStaticDataAllowlistEntry[];
  /** Per-attempt worker micro-gate: fail attempts whose rebuilt TU loses an exact non-code section. */
  workerSectionParityGate?: boolean;
  /** Per-attempt worker micro-gate: fail attempts whose rebuilt TU references symbols outside the link universe. */
  workerUndefinedSymbolGate?: boolean;
  /** Per-attempt worker micro-gate: fail attempts whose diff adds banned idioms (section-order hacks, bare short/long, K&R declarations). */
  workerBannedIdiomGate?: boolean;
  /** Per-attempt worker micro-gate: fail attempts whose changed sources are not clang-formatted (requires `formatting`). */
  workerFormattingGate?: boolean;
  /** Upstream CI clang-format policy; unset skips every formatting gate and step. */
  formatting?: GameFormattingConfig;
  /** Per-attempt worker micro-gate: fail attempts whose changed units report new map-symbol validation errors (requires `symbolCheck`). */
  workerSymbolValidationGate?: boolean;
  /** Upstream CI map-symbol validator; unset skips the symbol_validation gate and the boundary/Sync symbol-check. */
  symbolCheck?: GameSymbolCheckConfig;
  /** Refuse epoch admission when the knowledge board lacks fresh objdiff report provenance. */
  epochAdmissionFreshReportGate?: boolean;
  /** Refuse candidate spikes above this multiple of a recent non-empty epoch. */
  epochAdmissionCandidateMultiple?: number;
  /** Refuse epochs with more candidates than this absolute limit. */
  epochAdmissionCandidateCap?: number;
  /** Retry failed epoch boundaries with persisted exponential backoff. */
  epochBoundaryRetryEnabled?: boolean;
  epochBoundaryRetryMaxAttempts?: number;
  epochBoundaryRetryBaseMs?: number;
  epochBoundaryRetryMaxMs?: number;
}

export interface AddressNamedStaticDataAllowlistEntry {
  symbol: string;
  file?: string;
  reason?: string;
}

export interface GameDashboardDefaults {
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

export interface GameSandboxProfileConfig {
  resource_class?: GameSandboxResourceClass;
  snapshot_name?: string;
  snapshot_baked_rev?: string;
  workspace_root?: string;
}

export interface GameSandboxConfig extends GameSandboxProfileConfig {
  default_profile?: string;
  profiles?: Record<string, GameSandboxProfileConfig>;
}

export interface SandboxRuntimeOptions {
  resource_class: Required<GameSandboxResourceClass>;
  snapshot_name: string;
  snapshot_baked_rev: string;
  workspace_root: string;
}

export interface ResolvedSandboxConfig extends SandboxRuntimeOptions {
  default_profile: string;
  profiles: Record<string, SandboxRuntimeOptions>;
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
  validation: ResolvedGameValidation;
  dashboard: Required<GameDashboardDefaults>;
  pr: Required<GamePrDefaults>;
  knowledge: Required<GameKnowledgeConfig>;
  sandbox: ResolvedSandboxConfig;
  orchestratorRoot: string;
  gamesRoot: string;
  gameDir: string;
  descriptorPath: string;
  localOverridePath?: string;
  warnings: string[];
}

/** Optional keys stay unset for unconfigured games so their configuration fingerprint is stable. */
type OptionalValidationKey = "targetExcludePrefixes" | "formatting" | "symbolCheck";
export type ResolvedGameValidation = Required<Omit<GameValidationDefaults, OptionalValidationKey>> & Pick<GameValidationDefaults, OptionalValidationKey>;

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

const defaultValidation: Required<Omit<GameValidationDefaults, "formatting" | "symbolCheck">> = {
  qaTarget: "changes_all",
  reportPath: "build/GALE01/report.json",
  reportChangesPath: "build/GALE01/report_changes.json",
  objdiffPath: "objdiff.json",
  targetExcludePrefixes: [],
  addressNamedStaticDataAllowlist: [],
  workerSectionParityGate: true,
  workerUndefinedSymbolGate: true,
  workerBannedIdiomGate: true,
  workerFormattingGate: true,
  workerSymbolValidationGate: true,
  epochAdmissionFreshReportGate: true,
  epochAdmissionCandidateMultiple: 4,
  epochAdmissionCandidateCap: 500,
  epochBoundaryRetryEnabled: true,
  epochBoundaryRetryMaxAttempts: 5,
  epochBoundaryRetryBaseMs: 120_000,
  epochBoundaryRetryMaxMs: 1_800_000,
};

const defaultDashboard: Required<GameDashboardDefaults> = {
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
  snapshot_baked_rev: "",
  workspace_root: "/work/game",
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

function stringArrayField(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : undefined;
}

function addressNamedStaticDataAllowlistField(value: unknown): AddressNamedStaticDataAllowlistEntry[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error("validation.addressNamedStaticDataAllowlist must be an array");
  return value.map((entry, index) => {
    if (typeof entry === "string" && entry.trim()) return { symbol: entry.trim() };
    if (!isObject(entry)) throw new Error(`validation.addressNamedStaticDataAllowlist[${index}] must be a symbol string or object`);
    const symbol = stringField(entry.symbol);
    if (!symbol) throw new Error(`validation.addressNamedStaticDataAllowlist[${index}].symbol must be a non-empty string`);
    if (entry.file !== undefined && !stringField(entry.file)) {
      throw new Error(`validation.addressNamedStaticDataAllowlist[${index}].file must be a non-empty string`);
    }
    if (entry.reason !== undefined && !stringField(entry.reason)) {
      throw new Error(`validation.addressNamedStaticDataAllowlist[${index}].reason must be a non-empty string`);
    }
    const file = stringField(entry.file);
    const reason = stringField(entry.reason);
    return { symbol, ...(file ? { file } : {}), ...(reason ? { reason } : {}) };
  });
}

const CLANG_FORMAT_VERSION_RE = /^\d+\.\d+\.\d+$/;

function formattingField(value: unknown): GameFormattingConfig | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isObject(value)) throw new Error("validation.formatting must be an object");
  const version = stringField(value.clangFormatVersion);
  if (!version || !CLANG_FORMAT_VERSION_RE.test(version.trim())) {
    throw new Error("validation.formatting.clangFormatVersion must be an exact major.minor.patch version");
  }
  return { clangFormatVersion: version.trim() };
}

const CHECKOUT_RELATIVE_PATH_RE = /^(?!\/)(?!\.\.(?:\/|$))(?:[^\0\n]+\/)*[^\0\n]+$/;

function symbolCheckField(value: unknown): GameSymbolCheckConfig | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isObject(value)) throw new Error("validation.symbolCheck must be an object");
  const script = stringField(value.script)?.trim();
  const map = stringField(value.map)?.trim();
  for (const [key, path] of [["script", script], ["map", map]] as const) {
    if (!path || !CHECKOUT_RELATIVE_PATH_RE.test(path) || path.split("/").includes("..")) {
      throw new Error(`validation.symbolCheck.${key} must be a checkout-relative path`);
    }
  }
  return { script: script!, map: map! };
}

function validationFromObject(value: unknown): GameValidationDefaults | undefined {
  if (!isObject(value)) return undefined;
  return {
    qaTarget: stringField(value.qaTarget),
    reportPath: stringField(value.reportPath),
    reportChangesPath: stringField(value.reportChangesPath),
    objdiffPath: stringField(value.objdiffPath),
    targetExcludePrefixes: stringArrayField(value.targetExcludePrefixes),
    addressNamedStaticDataAllowlist: addressNamedStaticDataAllowlistField(value.addressNamedStaticDataAllowlist),
    ...(typeof value.workerSectionParityGate === "boolean" ? { workerSectionParityGate: value.workerSectionParityGate } : {}),
    ...(typeof value.workerUndefinedSymbolGate === "boolean" ? { workerUndefinedSymbolGate: value.workerUndefinedSymbolGate } : {}),
    ...(typeof value.workerBannedIdiomGate === "boolean" ? { workerBannedIdiomGate: value.workerBannedIdiomGate } : {}),
    ...(typeof value.workerFormattingGate === "boolean" ? { workerFormattingGate: value.workerFormattingGate } : {}),
    formatting: formattingField(value.formatting),
    ...(typeof value.workerSymbolValidationGate === "boolean" ? { workerSymbolValidationGate: value.workerSymbolValidationGate } : {}),
    symbolCheck: symbolCheckField(value.symbolCheck),
    ...(typeof value.epochAdmissionFreshReportGate === "boolean"
      ? { epochAdmissionFreshReportGate: value.epochAdmissionFreshReportGate }
      : {}),
    epochAdmissionCandidateMultiple: numberField(value.epochAdmissionCandidateMultiple),
    epochAdmissionCandidateCap: numberField(value.epochAdmissionCandidateCap),
    ...(typeof value.epochBoundaryRetryEnabled === "boolean"
      ? { epochBoundaryRetryEnabled: value.epochBoundaryRetryEnabled }
      : {}),
    epochBoundaryRetryMaxAttempts: numberField(value.epochBoundaryRetryMaxAttempts),
    epochBoundaryRetryBaseMs: numberField(value.epochBoundaryRetryBaseMs),
    epochBoundaryRetryMaxMs: numberField(value.epochBoundaryRetryMaxMs),
  };
}

function dashboardFromObject(value: unknown): GameDashboardDefaults | undefined {
  if (!isObject(value)) return undefined;
  return {
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

function sandboxProfileFromObject(value: unknown): GameSandboxProfileConfig | undefined {
  if (!isObject(value)) return undefined;
  const config: GameSandboxProfileConfig = {};
  if (isObject(value.resource_class)) {
    for (const key of ["cpu", "memory_gib", "disk_gib"] as const) {
      const amount = value.resource_class[key];
      if (amount !== undefined && (typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0)) {
        throw new Error(`Sandbox profile has invalid ${key}: ${String(amount)}`);
      }
    }
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
  const snapshotBakedRev = stringField(value.snapshot_baked_rev);
  if (snapshotBakedRev !== undefined) config.snapshot_baked_rev = snapshotBakedRev;
  const workspaceRoot = stringField(value.workspace_root);
  if (workspaceRoot !== undefined) config.workspace_root = workspaceRoot;
  return config;
}

function sandboxFromObject(value: unknown): GameSandboxConfig | undefined {
  if (!isObject(value)) return undefined;
  const config: GameSandboxConfig = sandboxProfileFromObject(value) ?? {};
  const defaultProfile = stringField(value.default_profile);
  if (defaultProfile !== undefined) config.default_profile = defaultProfile;
  if (isObject(value.profiles)) {
    const profiles = Object.fromEntries(
      Object.entries(value.profiles)
        .map(([name, profile]) => [name, sandboxProfileFromObject(profile)] as const)
        .filter((entry): entry is [string, GameSandboxProfileConfig] => Boolean(entry[1])),
    );
    if (Object.keys(profiles).length > 0) config.profiles = profiles;
  }
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
  return { ...(base ?? {}), ...Object.fromEntries(Object.entries(override ?? {}).filter(([, value]) => value !== undefined)) } as T;
}

function mergeSandboxProfile(
  base: GameSandboxProfileConfig | undefined,
  override: GameSandboxProfileConfig | undefined,
): GameSandboxProfileConfig | undefined {
  const merged = mergeNested(base, override);
  if (!merged) return undefined;
  return {
    ...merged,
    resource_class: mergeNested(base?.resource_class, override?.resource_class),
  };
}

function mergeSandbox(
  base: GameSandboxConfig | undefined,
  override: GameSandboxConfig | undefined,
): GameSandboxConfig | undefined {
  const merged = mergeSandboxProfile(base, override);
  if (!merged) return undefined;
  const profileNames = new Set([
    ...Object.keys(base?.profiles ?? {}),
    ...Object.keys(override?.profiles ?? {}),
  ]);
  const profiles = Object.fromEntries(
    [...profileNames].map((name) => [
      name,
      mergeSandboxProfile(base?.profiles?.[name], override?.profiles?.[name]) ?? {},
    ]),
  );
  return {
    ...merged,
    default_profile: override?.default_profile ?? base?.default_profile,
    ...(Object.keys(profiles).length > 0 ? { profiles } : {}),
  };
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
  next.sandbox = mergeSandbox(base.sandbox, override.sandbox);
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

function requiredSandboxProfile(
  base: SandboxRuntimeOptions,
  value: GameSandboxProfileConfig | undefined,
): SandboxRuntimeOptions {
  return {
    resource_class: requiredNested(base.resource_class, value?.resource_class),
    snapshot_name: value?.snapshot_name ?? base.snapshot_name,
    snapshot_baked_rev: value?.snapshot_baked_rev ?? base.snapshot_baked_rev,
    workspace_root: value?.workspace_root ?? base.workspace_root,
  };
}

function requiredSandbox(value: GameSandboxConfig | undefined): ResolvedSandboxConfig {
  const base = {
    resource_class: requiredNested(defaultSandbox.resource_class, value?.resource_class),
    snapshot_name: value?.snapshot_name ?? defaultSandbox.snapshot_name,
    snapshot_baked_rev: value?.snapshot_baked_rev ?? defaultSandbox.snapshot_baked_rev,
    workspace_root: value?.workspace_root ?? defaultSandbox.workspace_root,
  };
  const profiles = Object.fromEntries(
    Object.entries(value?.profiles ?? {}).map(([name, profile]) => [
      name,
      requiredSandboxProfile(base, profile),
    ]),
  );
  const defaultProfile = value?.default_profile ?? (Object.keys(profiles).length ? "2-core" : "");
  if (defaultProfile && !profiles[defaultProfile]) {
    throw new Error(`Sandbox default profile ${defaultProfile} is not defined`);
  }
  for (const [name, profile] of Object.entries({ base, ...profiles })) {
    for (const [resource, amount] of Object.entries(profile.resource_class)) {
      if (!Number.isInteger(amount) || amount <= 0) throw new Error(`Sandbox profile ${name} has invalid ${resource}: ${amount}`);
    }
    if (!profile.workspace_root.startsWith("/")) throw new Error(`Sandbox profile ${name} workspace_root must be absolute`);
  }
  return { ...base, default_profile: defaultProfile, profiles };
}

export function sandboxRuntimeOptions(
  game?: Pick<ResolvedGame, "sandbox"> | null,
  profileName?: string,
): SandboxRuntimeOptions {
  const sandbox: ResolvedSandboxConfig = game?.sandbox ?? {
    ...defaultSandbox,
    default_profile: "",
    profiles: {},
  };
  const selectedProfile = profileName?.trim() || sandbox.default_profile;
  const selected = selectedProfile ? sandbox.profiles[selectedProfile] : sandbox;
  if (!selected) throw new Error(`Sandbox profile ${selectedProfile} is not defined`);
  return {
    resource_class: { ...selected.resource_class },
    snapshot_name: selected.snapshot_name,
    snapshot_baked_rev: selected.snapshot_baked_rev,
    workspace_root: selected.workspace_root,
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

  const descriptor = descriptorFromObject(readGameDescriptorConfig(descriptorPath), descriptorPath);
  if (descriptor.id !== gameId) throw new Error(`Game descriptor ${descriptorPath} has id ${descriptor.id}, expected ${gameId}`);

  const localOverridePath = gameLayoutPath(gameDir, "config/local.json");
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
  const repoRoot = resolvePathCandidate(merged.repoRoot, gameDir, merged.repoRoot ? "" : gameLayoutPath(gameDir, "workspace/checkout"));
  const stateDir = resolvePathCandidate(merged.stateDir, gameDir, merged.stateDir ? "" : gameLayoutPath(gameDir, "runtime/state"));
  const graphDbPath = resolvePathCandidate(merged.graphDb, gameDir, merged.graphDb ? "" : gameLayoutPath(gameDir, "knowledge/graph/graph.sqlite"));
  const localEnvPath = resolvePathCandidate(merged.localEnv, gameDir, merged.localEnv ? "" : gameLayoutPath(gameDir, "config/local.env"));
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
    validation: {
      ...requiredNested(defaultValidation, merged.validation),
      // Unconfigured games retain their existing effective configuration fingerprint.
      targetExcludePrefixes: merged.validation?.targetExcludePrefixes,
      formatting: merged.validation?.formatting,
      symbolCheck: merged.validation?.symbolCheck,
      reportChangesPath: merged.validation?.reportChangesPath
        ?? (merged.validation?.reportPath
          ? `${dirname(merged.validation.reportPath)}/report_changes.json`
          : defaultValidation.reportChangesPath),
    },
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
