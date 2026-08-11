import { resolve } from "node:path";
import { resolveProject, type ResolvedProject } from "./resolver.js";
import type { RunProjectMetadata } from "@server/core/shared/types";
import { DEFAULT_PI_MODEL, DEFAULT_PI_PROVIDER, DEFAULT_PI_THINKING_LEVEL, DEFAULT_STATE_DIR_NAME } from "./runtime-defaults.js";

export interface GlobalArgs {
  repoRoot: string;
  stateDir: string;
  projectId?: string;
  project?: ResolvedProject;
  graphDbPath?: string;
  dryRunAgents: boolean;
  provider: string;
  model: string;
  thinkingLevel: string;
  agentTimeoutSeconds?: number;
}

export interface ParsedArgs {
  command: string;
  globals: GlobalArgs;
  args: Map<string, string | true>;
}

export const WRITE_SET_WIDENING_MODES = ["off", "shadow", "config", "header"] as const;
export type WriteSetWideningMode = (typeof WRITE_SET_WIDENING_MODES)[number];

export interface WriteSetIntegrationFlags {
  /** Apply and commit accepted worker output as soon as its worker finishes. */
  mergeOnFinish: boolean;
  /** The highest write-set widening rung enabled for the run. */
  writeSetWidening: WriteSetWideningMode;
  /** Boundary confirmation requires both experimental features. */
  confirmationPass: boolean;
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

    if (arg === "--repo-root") {
      globals.repoRoot = resolve(readFlag(argv, i));
      repoRootExplicit = true;
      i += 1;
    } else if (arg === "--state-dir") {
      globals.stateDir = resolve(readFlag(argv, i));
      stateDirExplicit = true;
      i += 1;
    } else if (arg === "--project") {
      globals.projectId = readFlag(argv, i);
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
  if (globals.projectId) {
    const project = resolveProject({
      projectId: globals.projectId,
      explicitOverrides: {
        repoRoot: repoRootExplicit ? globals.repoRoot : undefined,
        stateDir: stateDirExplicit ? globals.stateDir : undefined,
      },
      explicitOverrideBaseDir: process.cwd(),
    });
    globals.project = project;
    globals.projectId = project.projectId;
    globals.repoRoot = project.repoRoot;
    globals.stateDir = project.stateDir;
    globals.graphDbPath = project.graphDbPath;
  } else if (!globals.stateDir) {
    globals.stateDir = resolve(defaultStateRoot, DEFAULT_STATE_DIR_NAME);
  }
  return { command, globals, args };
}

export function projectMetadata(globals: GlobalArgs, overrides: Partial<RunProjectMetadata> = {}): RunProjectMetadata | undefined {
  const project = globals.project;
  if (!project) return undefined;
  return {
    projectId: project.projectId,
    projectKind: project.kind,
    repoRoot: project.repoRoot,
    stateDir: project.stateDir,
    graphDbPath: project.graphDbPath,
    descriptorPath: project.descriptorPath,
    localOverridePath: project.localOverridePath,
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

export function writeSetWideningArg(args: Map<string, string | true>): WriteSetWideningMode {
  const raw = args.get("--write-set-widening");
  const value = (raw === true ? "shadow" : typeof raw === "string" ? raw : "off").trim().toLowerCase();
  if (!WRITE_SET_WIDENING_MODES.includes(value as WriteSetWideningMode)) {
    throw new Error(`--write-set-widening must be one of: ${WRITE_SET_WIDENING_MODES.join(", ")}`);
  }
  return value as WriteSetWideningMode;
}

export function mergeOnFinishArg(args: Map<string, string | true>): boolean {
  const value = args.get("--merge-on-finish");
  if (value === undefined) return false;
  if (value === true) return true;
  return !/^(?:0|false|no|off)$/i.test(value.trim());
}

export function writeSetIntegrationFlags(args: Map<string, string | true>): WriteSetIntegrationFlags {
  const mergeOnFinish = mergeOnFinishArg(args);
  const writeSetWidening = writeSetWideningArg(args);
  return {
    mergeOnFinish,
    writeSetWidening,
    confirmationPass: mergeOnFinish && writeSetWidening !== "off",
  };
}
