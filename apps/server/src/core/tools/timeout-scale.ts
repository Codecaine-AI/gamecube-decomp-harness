/**
 * CPU-sensitive tool timeout scaling for the active worker sandbox profile.
 *
 * The worker job spawner exports the claimed profile's `timeout_scale` as
 * ORCH_TOOL_TIMEOUT_SCALE; an explicit context value wins. Only defaults and
 * floors scale; existing maximum clamps stay authoritative.
 */
export const TOOL_TIMEOUT_SCALE_ENV = "ORCH_TOOL_TIMEOUT_SCALE";

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
