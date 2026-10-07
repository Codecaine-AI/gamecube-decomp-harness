import { applyBackfillConfig } from './backfill-config';
import { resolve } from "node:path";
import { resolveGame, type ResolvedGame } from "./resolver.js";
import type { RunGameMetadata } from "@server/core/shared/types";
import { DEFAULT_PI_MODEL, DEFAULT_PI_PROVIDER, DEFAULT_PI_THINKING_LEVEL } from "./runtime-defaults.js";
import { resolveOrchestratorLayout } from "../config/orchestrator.js";

export interface GlobalArgs {
  repoRoot: string;
  stateDir: string;
  gameId?: string;
  game?: ResolvedGame;
  graphDbPath?: string;
  dryRunAgents: boolean;
  provider: string;
  model: string;
  thinkingLevel: string;
  agentTimeoutSeconds?: number;
  sandboxProfile?: string;
}

export interface ParsedArgs {
  command: string;
  globals: GlobalArgs;
  args: Map<string, string | true>;
}

export const WRITE_SET_WIDENING_MODES = ["off", "shadow", "config", "header"] as const;
export type WriteSetWideningMode = (typeof WRITE_SET_WIDENING_MODES)[number];
/**
 * Owning-header widening is on by default: the rung ladder (target source ->
 * config metadata -> one owning header) plus consumer-scoped validation and
 * boundary confirmation is the safety mechanism. `off` and `shadow` remain as
 * debugging escape hatches, not as the normal operating mode.
 */
export const DEFAULT_WRITE_SET_WIDENING_MODE: WriteSetWideningMode = "header";
export const SYNC_MERGE_POLICIES = ["score", "theirs"] as const;
export type SyncMergePolicy = (typeof SYNC_MERGE_POLICIES)[number];

export interface WriteSetIntegrationFlags {
  /** The highest write-set widening rung enabled for the run. */
  writeSetWidening: WriteSetWideningMode;
}

export const ADVISORY_ADJUDICATION_MODES = ["off", "shadow", "enforce"] as const;
export type AdvisoryAdjudicationMode = (typeof ADVISORY_ADJUDICATION_MODES)[number];
/**
 * Shadow by default: the worker only records a data-only review candidate and
 * the orchestrator adjudicates it later, out of band. `off` is the worker
 * exactly as before; `enforce` adjudicates inline before the checkpoint passes.
 */
export const DEFAULT_ADVISORY_ADJUDICATION_MODE: AdvisoryAdjudicationMode = "shadow";
/** Wins over `--advisory-adjudication` when set; `off` is the kill switch. */
export const ADVISORY_ADJUDICATION_ENV = "ORCH_ADVISORY_ADJUDICATION";
export const CHECKPOINT_KNOWLEDGE_FEED_MODES = ["on", "off"] as const;
export type CheckpointKnowledgeFeedMode = (typeof CHECKPOINT_KNOWLEDGE_FEED_MODES)[number];
export const DEFAULT_CHECKPOINT_KNOWLEDGE_FEED: CheckpointKnowledgeFeedMode = "on";
/** Wins over `--checkpoint-knowledge-feed` when set. */
export const CHECKPOINT_KNOWLEDGE_FEED_ENV = "ORCH_CHECKPOINT_KNOWLEDGE_FEED";
/** Confirmed-good checkpoints fed to the librarian per settled epoch. */
export const DEFAULT_CHECKPOINT_KNOWLEDGE_CAP = 50;
const MODEL_NODE_FLAGS = ["--advisory-adjudication", "--checkpoint-knowledge-feed", "--checkpoint-knowledge-cap"] as const;

export interface ModelNodeFlags {
  /** Threaded to workers through the task file; the feed flags stay in the run-loop process. */
  advisoryAdjudication: AdvisoryAdjudicationMode;
  checkpointKnowledgeFeed: CheckpointKnowledgeFeedMode;
  checkpointKnowledgeCap: number;
}

function readFlag(argv: string[], index: number): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`Missing value for ${argv[index]}`);
  return value;
}

export function parse(argv: string[]): ParsedArgs {
  const defaultStateRoot = process.cwd();
  let repoRootExplicit = false;
  let stateDirExplicit = false;
  const globals: GlobalArgs = {
    repoRoot: process.cwd(),
    stateDir: "",
    dryRunAgents: false,
    provider: DEFAULT_PI_PROVIDER,
    model: DEFAULT_PI_MODEL,
    thinkingLevel: DEFAULT_PI_THINKING_LEVEL,
  };
  const args = new Map<string, string | true>();
  let command = "";

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      throw new Error("Server job options do not expose a help surface");
    }
    if (!command && !arg.startsWith("--")) {
      command = arg;
      continue;
    }

    if (arg.startsWith("--write-set-widening=")) {
      const value = arg.slice("--write-set-widening=".length);
      if (!value) throw new Error("Missing value for --write-set-widening");
      args.set("--write-set-widening", value);
      continue;
    }

    if (arg.startsWith("--sync-merge-policy=")) {
      const value = arg.slice("--sync-merge-policy=".length);
      if (!value) throw new Error("Missing value for --sync-merge-policy");
      args.set("--sync-merge-policy", value);
      continue;
    }

    const modelNodeFlag = MODEL_NODE_FLAGS.find((flag) => arg.startsWith(`${flag}=`));
    if (modelNodeFlag) {
      const value = arg.slice(modelNodeFlag.length + 1);
      if (!value) throw new Error(`Missing value for ${modelNodeFlag}`);
      args.set(modelNodeFlag, value);
      continue;
    }

    if (arg === "--repo-root") {
      globals.repoRoot = resolve(readFlag(argv, i));
      repoRootExplicit = true;
      i += 1;
    } else if (arg === "--state-dir") {
      globals.stateDir = resolve(readFlag(argv, i));
      stateDirExplicit = true;
      i += 1;
    } else if (arg === "--game") {
      globals.gameId = readFlag(argv, i);
      i += 1;
    } else if (arg === "--dry-run-agents") {
      globals.dryRunAgents = true;
    } else if (arg === "--provider") {
      globals.provider = readFlag(argv, i);
      i += 1;
    } else if (arg === "--model") {
      globals.model = readFlag(argv, i);
      i += 1;
    } else if (arg === "--thinking-level") {
      globals.thinkingLevel = readFlag(argv, i);
      i += 1;
    } else if (arg === "--agent-timeout-seconds") {
      globals.agentTimeoutSeconds = Number(readFlag(argv, i));
      if (!Number.isFinite(globals.agentTimeoutSeconds) || globals.agentTimeoutSeconds < 0) {
        throw new Error(`Invalid --agent-timeout-seconds: ${String(argv[i + 1])}`);
      }
      i += 1;
    } else if (arg === "--sandbox-profile") {
      globals.sandboxProfile = readFlag(argv, i);
      i += 1;
    } else if (arg.startsWith("--")) {
      const value = argv[i + 1];
      if (value && !value.startsWith("--")) {
        args.set(arg, value);
        i += 1;
      } else {
        args.set(arg, true);
      }
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }

  if (!command) command = "status";
  if (globals.gameId) {
    const game = resolveGame({
      gameId: globals.gameId,
      explicitOverrides: {
        repoRoot: repoRootExplicit ? globals.repoRoot : undefined,
        stateDir: stateDirExplicit ? globals.stateDir : undefined,
      },
      explicitOverrideBaseDir: process.cwd(),
    });
    globals.game = game;
    globals.gameId = game.gameId;
    globals.repoRoot = game.repoRoot;
    globals.stateDir = game.stateDir;
    globals.graphDbPath = game.graphDbPath;
    if (command === "kg2-backfill") applyBackfillConfig(game.gameDir, globals, args, argv);
  } else if (!globals.stateDir) {
    globals.stateDir = resolveOrchestratorLayout(defaultStateRoot).stateDir;
  }
  return { command, globals, args };
}

export function gameMetadata(globals: GlobalArgs, overrides: Partial<RunGameMetadata> = {}): RunGameMetadata | undefined {
  const game = globals.game;
  if (!game) return undefined;
  return {
    gameId: game.gameId,
    gameKind: game.kind,
    repoRoot: game.repoRoot,
    stateDir: game.stateDir,
    graphDbPath: game.graphDbPath,
    descriptorPath: game.descriptorPath,
    localOverridePath: game.localOverridePath,
    ...overrides,
  };
}

export function stringArg(args: Map<string, string | true>, name: string, fallback: string): string {
  const value = args.get(name);
  return typeof value === "string" ? value : fallback;
}

export function numberArg(args: Map<string, string | true>, name: string, fallback: number): number {
  const raw = args.get(name);
  if (typeof raw !== "string") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${name} must be numeric`);
  return value;
}

export function booleanArg(args: Map<string, string | true>, name: string): boolean {
  return args.get(name) === true;
}

export function workerSummaryFlag(args: Map<string, string | true>): boolean {
  return booleanArg(args, "--worker-summary");
}

export function librarianConsumerFlag(args: Map<string, string | true>): boolean {
  return booleanArg(args, "--librarian-consumer");
}

export function writeSetWideningArg(args: Map<string, string | true>): WriteSetWideningMode {
  const raw = args.get("--write-set-widening");
  const value = (raw === true ? "shadow" : typeof raw === "string" ? raw : DEFAULT_WRITE_SET_WIDENING_MODE).trim().toLowerCase();
  if (!WRITE_SET_WIDENING_MODES.includes(value as WriteSetWideningMode)) {
    throw new Error(`--write-set-widening must be one of: ${WRITE_SET_WIDENING_MODES.join(", ")}`);
  }
  return value as WriteSetWideningMode;
}

export function syncMergePolicyArg(args: Map<string, string | true>): SyncMergePolicy {
  const raw = args.get("--sync-merge-policy");
  if (raw === true) throw new Error("Missing value for --sync-merge-policy");
  const value = (typeof raw === "string" ? raw : "score").trim().toLowerCase();
  if (!SYNC_MERGE_POLICIES.includes(value as SyncMergePolicy)) {
    throw new Error(`--sync-merge-policy must be one of: ${SYNC_MERGE_POLICIES.join(", ")}`);
  }
  return value as SyncMergePolicy;
}

export function writeSetIntegrationFlags(args: Map<string, string | true>): WriteSetIntegrationFlags {
  return { writeSetWidening: writeSetWideningArg(args) };
}

type EnvSource = Record<string, string | undefined>;

// Error messages name the source and the allowed modes, never the rejected value.
function modeValue<T extends string>(raw: unknown, modes: readonly T[], source: string): T {
  if (raw === true) throw new Error(`Missing value for ${source}`);
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!modes.includes(value as T)) throw new Error(`${source} must be one of: ${modes.join(", ")}`);
  return value as T;
}

/** The flag is validated even when the env var overrides it. */
function modeArg<T extends string>(
  args: Map<string, string | true>,
  flag: string,
  envName: string,
  env: EnvSource,
  modes: readonly T[],
  fallback: T,
): T {
  const raw = args.get(flag);
  const fromFlag = raw === undefined ? fallback : modeValue(raw, modes, flag);
  const fromEnv = env[envName];
  return fromEnv === undefined ? fromFlag : modeValue(fromEnv, modes, envName);
}

export function parseAdvisoryAdjudicationMode(raw: unknown, source: string): AdvisoryAdjudicationMode {
  return modeValue(raw, ADVISORY_ADJUDICATION_MODES, source);
}

export function advisoryAdjudicationArg(
  args: Map<string, string | true>,
  env: EnvSource = process.env,
): AdvisoryAdjudicationMode {
  return modeArg(
    args, "--advisory-adjudication", ADVISORY_ADJUDICATION_ENV, env,
    ADVISORY_ADJUDICATION_MODES, DEFAULT_ADVISORY_ADJUDICATION_MODE,
  );
}

export function checkpointKnowledgeFeedArg(
  args: Map<string, string | true>,
  env: EnvSource = process.env,
): CheckpointKnowledgeFeedMode {
  return modeArg(
    args, "--checkpoint-knowledge-feed", CHECKPOINT_KNOWLEDGE_FEED_ENV, env,
    CHECKPOINT_KNOWLEDGE_FEED_MODES, DEFAULT_CHECKPOINT_KNOWLEDGE_FEED,
  );
}

export function checkpointKnowledgeCapArg(args: Map<string, string | true>): number {
  const raw = args.get("--checkpoint-knowledge-cap");
  if (raw === undefined) return DEFAULT_CHECKPOINT_KNOWLEDGE_CAP;
  const value = typeof raw === "string" && raw.trim() ? Number(raw) : Number.NaN;
  if (!Number.isInteger(value) || value < 1) throw new Error("--checkpoint-knowledge-cap must be a positive integer");
  return value;
}

export function modelNodeFlags(args: Map<string, string | true>, env: EnvSource = process.env): ModelNodeFlags {
  return {
    advisoryAdjudication: advisoryAdjudicationArg(args, env),
    checkpointKnowledgeFeed: checkpointKnowledgeFeedArg(args, env),
    checkpointKnowledgeCap: checkpointKnowledgeCapArg(args),
  };
}
