import { existsSync, readFileSync } from "node:fs";

export interface ToolConcurrencySettings {
  checkdiff: number;
  compile: number;
  m2cDecomp: number;
  mwccDebug: number;
  other: number;
  sourcePermuter: number;
  sourcePermuterJobs: number;
}

export const TOOL_CONCURRENCY_DEFAULTS: ToolConcurrencySettings = {
  checkdiff: 20,
  compile: 12,
  m2cDecomp: 15,
  mwccDebug: 6,
  other: 20,
  sourcePermuter: 3,
  sourcePermuterJobs: 1,
};

const toolConcurrencyEnv: Record<keyof ToolConcurrencySettings, { env: string; max: number }> = {
  checkdiff: { env: "ORCH_WORKER_TOOL_CONCURRENCY_CHECKDIFF", max: 64 },
  compile: { env: "ORCH_WORKER_COMPILE_CONCURRENCY", max: 64 },
  m2cDecomp: { env: "ORCH_WORKER_TOOL_CONCURRENCY_M2C_DECOMP", max: 64 },
  mwccDebug: { env: "ORCH_WORKER_TOOL_CONCURRENCY_MWCC_DEBUG", max: 64 },
  other: { env: "ORCH_WORKER_TOOL_CONCURRENCY", max: 64 },
  sourcePermuter: { env: "ORCH_WORKER_TOOL_CONCURRENCY_SOURCE_PERMUTER", max: 64 },
  sourcePermuterJobs: { env: "ORCH_SOURCE_PERMUTER_MAX_JOBS", max: 16 },
};

function boundedInt(value: unknown, fallback: number, max: number): number {
  const parsed = Math.trunc(typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(max, parsed));
}

function parseEnvFile(path: string | undefined): Record<string, string> {
  if (!path || !existsSync(path)) return {};
  const env: Record<string, string> = {};
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("export ")) line = line.slice("export ".length).trim();
    const equals = line.indexOf("=");
    if (equals <= 0) continue;
    const key = line.slice(0, equals).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = line.slice(equals + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

export function toolConcurrencyFromEnv(env: Record<string, unknown>): ToolConcurrencySettings {
  const configured = { ...TOOL_CONCURRENCY_DEFAULTS };
  for (const key of Object.keys(toolConcurrencyEnv) as Array<keyof ToolConcurrencySettings>) {
    const definition = toolConcurrencyEnv[key];
    configured[key] = boundedInt(env[definition.env], TOOL_CONCURRENCY_DEFAULTS[key], definition.max);
  }
  return configured;
}

export function projectToolConcurrencyDefaults(localEnvPath: string | undefined, env: Record<string, unknown> = process.env): {
  configured: ToolConcurrencySettings;
  defaults: ToolConcurrencySettings;
  env: Record<keyof ToolConcurrencySettings, string>;
  localEnvPath?: string;
} {
  const localEnv = parseEnvFile(localEnvPath);
  const effectiveEnv = { ...localEnv, ...env };
  return {
    configured: toolConcurrencyFromEnv(effectiveEnv),
    defaults: TOOL_CONCURRENCY_DEFAULTS,
    env: Object.fromEntries(Object.entries(toolConcurrencyEnv).map(([key, value]) => [key, value.env])) as Record<keyof ToolConcurrencySettings, string>,
    ...(localEnvPath ? { localEnvPath } : {}),
  };
}

export function toolConcurrencyEnvFromInput(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  const env: Record<string, string> = {};
  for (const key of Object.keys(toolConcurrencyEnv) as Array<keyof ToolConcurrencySettings>) {
    const definition = toolConcurrencyEnv[key];
    if (input[key] === undefined || input[key] === null || input[key] === "") continue;
    env[definition.env] = String(boundedInt(input[key], TOOL_CONCURRENCY_DEFAULTS[key], definition.max));
  }
  return env;
}
