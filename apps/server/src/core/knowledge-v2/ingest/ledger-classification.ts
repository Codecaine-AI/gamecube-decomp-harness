import { readFileSync, writeFileSync } from "node:fs";
import type { LedgerClassificationReport } from "./types.js";

export interface LedgerClassificationOptions {
  ledgerPath: string;
  outPath?: string;
}

export function classifyLedger(options: LedgerClassificationOptions): LedgerClassificationReport {
  const report: LedgerClassificationReport = {
    total: 0,
    counts: { semantic_candidate: 0, attempt: 0, operational: 0, lineage: 0, quarantine: 0 },
  };

  for (const line of readFileSync(options.ledgerPath, "utf8").split(/\r?\n/)) {
    if (line.trim().length === 0) continue;
    report.total++;
    let value: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(line);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("not an object");
      value = parsed as Record<string, unknown>;
    } catch {
      report.counts.quarantine++;
      continue;
    }

    if (typeof value.origin !== "string" || typeof value.statement !== "string") {
      report.counts.quarantine++;
      continue;
    }
    const evidenceTypes = Array.isArray(value.evidence)
      ? value.evidence.map((entry) => typeof entry === "object" && entry !== null && "type" in entry
        ? String((entry as { type: unknown }).type)
        : "")
      : [];
    const producedBy = typeof value.produced_by === "string" ? value.produced_by : "";

    // Destination precedence is fixed: quarantine, lineage, attempt, operational, then fallback.
    if (evidenceTypes.some((type) => /boundary|upstream/i.test(type))
      || value.statement.includes("overridden_by_upstream")) report.counts.lineage++;
    else if (/worker|attempt/i.test(value.origin) || /worker/i.test(producedBy)
      || evidenceTypes.some((type) => /checkpoint|attempt/i.test(type))) report.counts.attempt++;
    else if (/operator|human/i.test(value.origin) || /operator|run_operator/i.test(producedBy)) {
      report.counts.operational++;
    } else report.counts.semantic_candidate++;
  }

  if (options.outPath !== undefined) {
    writeFileSync(options.outPath, JSON.stringify(report, null, 2));
  }
  return report;
}
