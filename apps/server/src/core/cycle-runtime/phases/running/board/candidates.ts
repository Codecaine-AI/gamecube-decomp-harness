import type { TargetCandidate } from "@server/core/shared/types/index.js";
import { asArray, asObject, numberValue, stringValue, type JsonObject } from "./json.js";

export function objdiffSourceMap(objdiff: JsonObject): Map<string, string> {
  const byUnit = new Map<string, string>();
  for (const unitValue of asArray(objdiff.units)) {
    const unit = asObject(unitValue);
    const metadata = asObject(unit.metadata);
    const name = stringValue(unit.name);
    const sourcePath = stringValue(metadata.source_path);
    if (name && sourcePath) byUnit.set(name, sourcePath);
  }
  return byUnit;
}

export function candidateFromReportFunction(params: {
  unitName: string;
  sourcePath: string;
  fn: JsonObject;
}): TargetCandidate | null {
  const fuzzy = numberValue(params.fn.fuzzy_match_percent, 100);
  if (fuzzy >= 100) return null;
  const size = numberValue(params.fn.size);
  const symbol = stringValue(params.fn.name);
  if (!symbol || size <= 0) return null;
  return {
    unit: params.unitName,
    sourcePath: params.sourcePath,
    symbol,
    size,
    fuzzy,
    kind: "function",
  };
}
