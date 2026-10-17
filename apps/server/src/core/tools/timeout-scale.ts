/**
 * CPU-sensitive tool timeout scaling for the active worker sandbox profile.
 *
 * The worker job spawner exports the claimed profile's `timeout_scale` as
 * ORCH_TOOL_TIMEOUT_SCALE; an explicit context value wins. Only defaults and
 * floors scale; existing maximum clamps stay authoritative.
 */
export const TOOL_TIMEOUT_SCALE_ENV = "ORCH_TOOL_TIMEOUT_SCALE";
/** The claimed profile's sandbox CPU count, exported by the worker job spawner. */
export const SANDBOX_CPUS_ENV = "ORCH_SANDBOX_CPUS";

function validScale(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

/** Resolve the timeout multiplier for a tool call; defaults to 1. */
export function toolTimeoutScale(context?: { timeoutScale?: number } | null): number {
  return validScale(context?.timeoutScale) ?? validScale(process.env[TOOL_TIMEOUT_SCALE_ENV]) ?? 1;
}

/** Scale a timeout default or floor, never exceeding `max` when given. */
export function scaleTimeout(value: number, scale: number, max = Number.POSITIVE_INFINITY): number {
  return Math.min(max, Math.round(value * scale));
}

/** The worker sandbox's CPU count from the env, or undefined when unset or not a positive integer. */
export function sandboxCpuCount(): number | undefined {
  const raw = process.env[SANDBOX_CPUS_ENV]?.trim();
  const parsed = raw ? Number(raw) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
