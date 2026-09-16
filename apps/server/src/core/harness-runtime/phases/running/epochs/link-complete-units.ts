import { readFile, writeFile } from "node:fs/promises";

export interface LinkCompleteUnitsResult {
  completeUnits: string[];
  flippedUnits: string[];
  missingUnits: string[];
}

export interface LinkCompleteUnitsCheckResult {
  exitCode: number;
  output: string;
}

export interface VerifiedLinkCompleteUnitsResult extends LinkCompleteUnitsResult {
  check: LinkCompleteUnitsCheckResult | null;
  status: "kept" | "reverted" | "unchanged";
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/** Return configure.py unit paths which are complete and still need linking. */
export function completeUnitNames(report: unknown): string[] {
  const root = record(report);
  const units = Array.isArray(root?.units) ? root.units : [];
  const names: string[] = [];
  for (const value of units) {
    const unit = record(value);
    const measures = record(unit?.measures);
    const metadata = record(unit?.metadata);
    const sourcePath = typeof metadata?.source_path === "string"
      ? metadata.source_path.trim().replace(/^src\//, "").replace(/\.c$/, "")
      : "";
    const name = sourcePath || (typeof unit?.name === "string"
      ? unit.name.trim().replace(/^main\//, "").replace(/\.(?:c|o)$/, "")
      : "");
    const code = Number(unit?.matched_code_percent ?? measures?.matched_code_percent);
    const data = Number(unit?.matched_data_percent ?? measures?.matched_data_percent);
    const fuzzy = Number(unit?.fuzzy_match_percent ?? measures?.fuzzy_match_percent);
    const exact = code === 100 && data === 100;
    const upstreamComplete = Number.isFinite(fuzzy) ? fuzzy >= 100 : exact;
    if (name && exact && upstreamComplete && metadata?.auto_generated !== true && metadata?.complete !== true) names.push(name);
  }
  return [...new Set(names)].sort();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Rewrite only Object(Linkable|NonMatching, "<unit>.c") declarations. */
export function linkCompleteUnitsInConfigure(configure: string, completeUnits: string[]): LinkCompleteUnitsResult & { configure: string } {
  let updated = configure;
  const flippedUnits: string[] = [];
  const missingUnits: string[] = [];
  for (const unit of [...new Set(completeUnits)].sort()) {
    const sourceSuffix = `${unit.replace(/^src\//, "")}.c`;
    const pattern = new RegExp(
      `(Object\\(\\s*)(Linkable|NonMatching)(\\s*,\\s*["'](?:src/)?${escapeRegExp(sourceSuffix)}["'])`,
      "g",
    );
    let changed = false;
    updated = updated.replace(pattern, (_match, prefix: string, _status: string, suffix: string) => {
      changed = true;
      return `${prefix}Matching${suffix}`;
    });
    if (changed) flippedUnits.push(unit);
    else if (!new RegExp(`Object\\(\\s*Matching\\s*,\\s*["'](?:src/)?${escapeRegExp(sourceSuffix)}["']`).test(updated)) {
      missingUnits.push(unit);
    }
  }
  return { configure: updated, completeUnits: [...new Set(completeUnits)].sort(), flippedUnits, missingUnits };
}

export async function linkCompleteUnitsFromReport(input: {
  configurePath: string;
  reportPath: string;
  verify?: () => Promise<LinkCompleteUnitsCheckResult>;
}): Promise<VerifiedLinkCompleteUnitsResult> {
  const [configure, reportText] = await Promise.all([
    readFile(input.configurePath, "utf8"),
    readFile(input.reportPath, "utf8"),
  ]);
  const result = linkCompleteUnitsInConfigure(configure, completeUnitNames(JSON.parse(reportText)));
  if (result.configure === configure) return { ...result, check: null, status: "unchanged" };
  await writeFile(input.configurePath, result.configure);
  if (!input.verify) return { ...result, check: null, status: "kept" };
  let check: LinkCompleteUnitsCheckResult;
  try {
    check = await input.verify();
  } catch (error) {
    await writeFile(input.configurePath, configure);
    throw error;
  }
  if (check.exitCode === 0) return { ...result, check, status: "kept" };
  await writeFile(input.configurePath, configure);
  return { ...result, check, status: "reverted" };
}
