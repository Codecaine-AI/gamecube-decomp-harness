import { text } from "@/lib/format";

/** Strict numeric parse: null/undefined are missing data, never zero. */
export function strictNumber(value: unknown): number {
  if (value === null || value === undefined || value === "") return NaN;
  return Number(value);
}

export function tapeClass(value: number, epsilon = 0.0005): string {
  if (!Number.isFinite(value) || Math.abs(value) < epsilon) return "text-dim";
  return value > 0 ? "text-up" : "text-down";
}

export function timeMs(value: unknown): number {
  const ms = Date.parse(text(value));
  return Number.isFinite(ms) ? ms : 0;
}
