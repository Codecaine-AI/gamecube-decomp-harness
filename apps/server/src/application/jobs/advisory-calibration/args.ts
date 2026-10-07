// `advisory-calibration <command> [--flag value | --flag=value | --switch]`.
// The positional subcommand is why this job parses its own argv instead of
// the server job parser (which rejects a second positional argument).
import { CALIBRATION_ENGINES, type CalibrationEngine } from "./types.js";

/** Flags that never take a value. */
const SWITCHES = new Set(["--dry-run", "--write", "--all"]);

export interface CalibrationArgs {
  command: string;
  flags: Map<string, string | true>;
}

export function parseCalibrationArgs(argv: readonly string[]): CalibrationArgs {
  let command = "";
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (!arg.startsWith("--")) {
      if (command) throw new Error(`advisory-calibration: unexpected argument ${arg}`);
      command = arg;
      continue;
    }
    const eq = arg.indexOf("=");
    if (eq > 0) {
      flags.set(arg.slice(0, eq), arg.slice(eq + 1));
      continue;
    }
    if (SWITCHES.has(arg)) {
      flags.set(arg, true);
      continue;
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`advisory-calibration: missing value for ${arg}`);
    flags.set(arg, value);
    i += 1;
  }
  if (!command) throw new Error("advisory-calibration: missing command");
  return { command, flags };
}

export function stringFlag(args: CalibrationArgs, name: string): string | undefined {
  const value = args.flags.get(name);
  if (value === true) throw new Error(`advisory-calibration ${args.command}: ${name} needs a value`);
  return value;
}

export function requiredFlag(args: CalibrationArgs, name: string): string {
  const value = stringFlag(args, name);
  if (!value) throw new Error(`advisory-calibration ${args.command}: ${name} is required`);
  return value;
}

export function switchFlag(args: CalibrationArgs, name: string): boolean {
  return args.flags.get(name) === true;
}

export function integerFlag(args: CalibrationArgs, name: string): number | undefined {
  const value = stringFlag(args, name);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`advisory-calibration ${args.command}: ${name} must be a non-negative integer`);
  return parsed;
}

export function numberFlag(args: CalibrationArgs, name: string): number | undefined {
  const value = stringFlag(args, name);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`advisory-calibration ${args.command}: ${name} must be a number`);
  return parsed;
}

/** Live model calls are opt-in (plan §6.9, §7.3): `--engine live` needs this set to 1. */
export const LIVE_OPT_IN_ENV = "MODEL_NODES_LIVE";

export function assertLiveOptIn(what: string, env: Record<string, string | undefined> = process.env): void {
  if (env[LIVE_OPT_IN_ENV] !== "1") {
    throw new Error(`${what}: --engine live makes model calls; set ${LIVE_OPT_IN_ENV}=1 to opt in`);
  }
}

/** The engine; `live` is refused here, before anything is read or written, unless MODEL_NODES_LIVE=1. */
export function engineFlag(args: CalibrationArgs, allowed: readonly CalibrationEngine[] = CALIBRATION_ENGINES): CalibrationEngine {
  const value = requiredFlag(args, "--engine");
  if (!allowed.includes(value as CalibrationEngine)) {
    throw new Error(`advisory-calibration ${args.command}: --engine must be ${allowed.join(" | ")}`);
  }
  if (value === "live") assertLiveOptIn(`advisory-calibration ${args.command}`);
  return value as CalibrationEngine;
}

/** Rejects flags the command does not know, so a typo never silently changes behaviour. */
export function assertKnownFlags(args: CalibrationArgs, known: readonly string[]): void {
  for (const name of args.flags.keys()) {
    if (!known.includes(name)) throw new Error(`advisory-calibration ${args.command}: unknown flag ${name}`);
  }
}
