import { resolve } from "node:path";
import { isWorkerReportType } from "../agents/worker/index.js";
import type { WorkerReportType } from "../types/index.js";
import { DEFAULT_PI_MODEL, DEFAULT_PI_PROVIDER, DEFAULT_PI_THINKING_LEVEL, DEFAULT_STATE_DIR_NAME } from "./defaults.js";
import { usage } from "./usage.js";

export interface GlobalArgs {
  repoRoot: string;
  stateDir: string;
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

function readFlag(argv: string[], index: number): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`Missing value for ${argv[index]}`);
  return value;
}

export function parse(argv: string[]): ParsedArgs {
  const defaultStateRoot = process.cwd();
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
      console.log(usage());
      process.exit(0);
    }
    if (!command && !arg.startsWith("--")) {
      command = arg;
      continue;
    }

    if (arg === "--repo-root") {
      globals.repoRoot = resolve(readFlag(argv, i));
      i += 1;
    } else if (arg === "--state-dir") {
      globals.stateDir = resolve(readFlag(argv, i));
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
  if (!globals.stateDir) globals.stateDir = resolve(defaultStateRoot, DEFAULT_STATE_DIR_NAME);
  return { command, globals, args };
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

export function workerReportTypeArg(args: Map<string, string | true>, name: string, fallback: WorkerReportType): WorkerReportType {
  const value = stringArg(args, name, fallback);
  if (isWorkerReportType(value)) return value;
  throw new Error(`${name} must be one of: stalled_no_useful_guess, progress, needs_fact, score_candidate`);
}
