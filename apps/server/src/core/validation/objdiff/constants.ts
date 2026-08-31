export const EXACT_SCORE = 99.99999;

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function objdiffRowScore(row: Record<string, unknown>, fallback = NaN): number {
  return finiteNumber(row.match_percent) ?? finiteNumber(row.fuzzy_match_percent) ?? fallback;
}
