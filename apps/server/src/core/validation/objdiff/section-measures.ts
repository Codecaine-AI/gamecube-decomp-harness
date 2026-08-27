import { readFileSync } from "node:fs";

export interface SectionMeasure {
  sizeBytes: number;
  fuzzyMatchPercent: number;
  exactRows: number;
  totalRows: number;
}

interface SectionAccumulator {
  sizeBytes: number;
  weightedPercent: number;
  exactRows: number;
  totalRows: number;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function sectionMeasuresFromReportJson(raw: unknown): Record<string, SectionMeasure> {
  const report = objectValue(raw);
  if (!report || !Array.isArray(report.units)) return {};

  const accumulators = new Map<string, SectionAccumulator>();
  for (const unitValue of report.units) {
    const unit = objectValue(unitValue);
    if (!unit || !Array.isArray(unit.sections)) continue;
    for (const sectionValue of unit.sections) {
      const section = objectValue(sectionValue);
      if (!section || typeof section.name !== "string") continue;
      const size = Number(section.size);
      const fuzzy = Number(section.fuzzy_match_percent);
      if (!Number.isFinite(size) || size < 0 || !Number.isFinite(fuzzy)) continue;
      const accumulator = accumulators.get(section.name) ?? {
        sizeBytes: 0,
        weightedPercent: 0,
        exactRows: 0,
        totalRows: 0,
      };
      accumulator.sizeBytes += size;
      accumulator.weightedPercent += size * fuzzy;
      accumulator.exactRows += fuzzy >= 100 ? 1 : 0;
      accumulator.totalRows += 1;
      accumulators.set(section.name, accumulator);
    }
  }

  return Object.fromEntries([...accumulators].map(([name, value]) => [name, {
    sizeBytes: value.sizeBytes,
    fuzzyMatchPercent: value.sizeBytes > 0
      ? Math.round((value.weightedPercent / value.sizeBytes) * 10_000) / 10_000
      : 0,
    exactRows: value.exactRows,
    totalRows: value.totalRows,
  }]));
}

export function sectionMeasuresFromReport(reportPath: string): Record<string, SectionMeasure> {
  try {
    return sectionMeasuresFromReportJson(JSON.parse(readFileSync(reportPath, "utf8")));
  } catch {
    return {};
  }
}
