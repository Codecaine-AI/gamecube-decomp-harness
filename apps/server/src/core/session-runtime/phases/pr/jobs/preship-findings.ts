import { readFile } from "node:fs/promises";
import type { PreshipReview, PreshipReviewFinding } from "@server/core/agent-catalog/agents/pr/reviewer";
import type { QaScanFinding, QaScanResult } from "@server/core/validation/qa";
import type { PreshipSliceOutcome } from "./pr-preship-review.js";

export interface PreshipFindingRecord {
  source: "preship";
  sliceId: string;
  file: string;
  line: number | null;
  verdict: "reject" | "warn";
  standardId: string | null;
  rationale: string;
  suggestedFix: string | null;
  reviewPath: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Read the durable per-slice review artifacts into the shared finding shape. */
export async function preshipFindingRecordsFromOutcomes(
  outcomes: Array<Pick<PreshipSliceOutcome, "id" | "reviewPath">>,
): Promise<PreshipFindingRecord[]> {
  const records: PreshipFindingRecord[] = [];
  for (const outcome of outcomes) {
    if (!outcome.reviewPath) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(outcome.reviewPath, "utf8")) as unknown;
    } catch {
      continue;
    }
    const payload = isRecord(parsed) && isRecord(parsed.review) ? parsed.review : parsed;
    const review = isRecord(payload) ? (payload as Partial<PreshipReview>) : null;
    for (const rawFinding of Array.isArray(review?.findings) ? review.findings : []) {
      const finding = rawFinding as Partial<PreshipReviewFinding>;
      records.push({
        source: "preship",
        sliceId: outcome.id,
        file: typeof finding.file === "string" ? finding.file : "",
        line: typeof finding.line === "number" ? finding.line : null,
        verdict: finding.verdict === "warn" ? "warn" : "reject",
        standardId: typeof finding.standard_id === "string" ? finding.standard_id : null,
        rationale: typeof finding.rationale === "string" ? finding.rationale : "",
        suggestedFix: typeof finding.suggested_fix === "string" ? finding.suggested_fix : null,
        reviewPath: outcome.reviewPath,
      });
    }
  }
  return records;
}

function slugForRule(value: string | null): string {
  return (value ?? "review")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase() || "review";
}

export function preshipFindingsAsQaFindings(findings: PreshipFindingRecord[], includeWarnings: boolean): QaScanFinding[] {
  return findings
    .filter((finding) => finding.file && (finding.verdict === "reject" || includeWarnings))
    .map((finding) => ({
      rule_id: `preship_${finding.verdict}_${slugForRule(finding.standardId)}`,
      severity: finding.verdict === "reject" ? "error" : "warning",
      file: finding.file,
      line: finding.line ?? 1,
      excerpt: finding.suggestedFix ?? finding.rationale,
      message: finding.rationale,
      standard_id: finding.standardId,
      detail: {
        source: "preship",
        slice_id: finding.sliceId,
        review_path: finding.reviewPath,
        suggested_fix: finding.suggestedFix,
      },
    }));
}

export function mergeRepairScanFindings(scan: QaScanResult, preshipFindings: PreshipFindingRecord[], includePreshipWarnings: boolean): QaScanResult {
  const findings = [...scan.findings, ...preshipFindingsAsQaFindings(preshipFindings, includePreshipWarnings)];
  const errors = findings.filter((finding) => finding.severity === "error").length;
  const warnings = findings.filter((finding) => finding.severity === "warning").length;
  return {
    ...scan,
    findings,
    counts: { errors, warnings },
    status: errors > 0 ? "failed" : warnings > 0 ? "warned" : "passed",
  };
}
