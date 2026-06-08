import type { WorkerReportType } from "../../types/index.js";
import { parseJsonObject } from "../runtime/index.js";

export interface WorkerReportAcceptanceGate {
  intendedReportType: WorkerReportType;
  effectiveReportType: WorkerReportType;
  accepted: boolean;
  reasons: string[];
}

export interface WorkerRunnerValidation {
  status: "passed" | "failed" | "skipped";
  reasons: string[];
  command?: string;
  exitCode?: number;
  summaryPath?: string;
  stdoutPath?: string;
  stderrPath?: string;
}

export interface WorkerReviewLintFinding {
  ruleId: string;
  severity: "error";
  path: string;
  evidence: string;
  message: string;
}

export interface WorkerReviewLint {
  status: "passed" | "failed" | "skipped";
  reasons: string[];
  findings: WorkerReviewLintFinding[];
}

export function parseWorkerAgentReport(rawText: string): { report: Record<string, unknown> | null; error?: string } {
  const parsed = parseJsonObject(rawText);
  return { report: parsed.object, error: parsed.error };
}

export function isWorkerReportType(value: unknown): value is WorkerReportType {
  return value === "stalled_no_useful_guess" || value === "progress" || value === "needs_fact" || value === "score_candidate";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isProgressReportType(reportType: WorkerReportType): boolean {
  return reportType === "progress" || reportType === "score_candidate";
}

const DIFF_FILE_RE = /^diff --git a\/(.+?) b\/(.+)$/;
const ADDED_DEFINE_ALIAS_RE = /^\+\s*#\s*define\s+([A-Za-z_][A-Za-z0-9_]*)\b(?!\s*\()\s+([A-Za-z_][A-Za-z0-9_]*)\b\s*(?:$|\/\/|\/\*)/;
const ADDRESS_EXTERN_RE = /^([ +])\s*\/\*\s*(?:0x)?([0-9A-Fa-f]{6,8})\s*\*\/\s*extern\b.*?\b([A-Za-z_][A-Za-z0-9_]*)\s*(?:\[.*\])?\s*;/;
const C_STRING_LITERAL_RE = /"(?:(?:\\.)|[^"\\])*"/g;
const IDENTIFIER_EXPR_RE = "(?:\\(\\s*(?:const\\s+)?(?:char|void)\\s*\\*+\\s*\\)\\s*)?([A-Za-z_][A-Za-z0-9_]*)";

interface AddressExtern {
  address: string;
  name: string;
  added: boolean;
  evidence: string;
}

interface RemovedStringLine {
  body: string;
  evidence: string;
}

export function lintWorkerReviewDiff(diffText: string): WorkerReviewLint {
  if (!diffText.trim()) {
    return { status: "skipped", reasons: ["empty write_set diff"], findings: [] };
  }

  const findings: WorkerReviewLintFinding[] = [];
  const externsByPath = new Map<string, AddressExtern[]>();
  let removedStringLines: RemovedStringLine[] = [];
  let currentPath = "";

  for (const line of diffText.split(/\r?\n/)) {
    const fileMatch = DIFF_FILE_RE.exec(line);
    if (fileMatch) {
      currentPath = fileMatch[2];
      removedStringLines = [];
      continue;
    }
    if (!currentPath) continue;
    if (line.startsWith("@@")) {
      removedStringLines = [];
      continue;
    }

    if (line.startsWith("-") && !line.startsWith("---")) {
      const body = line.slice(1);
      if (isCSourcePath(currentPath) && bodyHasStringLiteral(body)) {
        removedStringLines.push({ body, evidence: body.trim() });
      }
      continue;
    }

    const defineMatch = ADDED_DEFINE_ALIAS_RE.exec(line);
    if (defineMatch && (looksLikeVariableIdentifier(defineMatch[1]) || looksLikeVariableIdentifier(defineMatch[2]))) {
      findings.push({
        ruleId: "no-define-alias-global-renames",
        severity: "error",
        path: currentPath,
        evidence: line.slice(1).trim(),
        message: `Avoid renaming variables with #define aliases: ${defineMatch[1]} -> ${defineMatch[2]}.`,
      });
    }

    if (line.startsWith("+") && !line.startsWith("+++")) {
      const addedBody = line.slice(1);
      for (const removedLine of removedStringLines) {
        const replacement = stringLiteralReplacement(removedLine.body, addedBody);
        if (!replacement) continue;
        findings.push({
          ruleId: "no-string-literal-symbol-regression",
          severity: "error",
          path: currentPath,
          evidence: `${removedLine.evidence} -> ${addedBody.trim()}`,
          message: `Keep string literal ${replacement.literal} inline instead of replacing it with ${replacement.identifier}.`,
        });
      }
    } else if (line.startsWith(" ")) {
      removedStringLines = [];
    }

    const externMatch = ADDRESS_EXTERN_RE.exec(line);
    if (externMatch) {
      const entries = externsByPath.get(currentPath) ?? [];
      entries.push({
        address: externMatch[2].toUpperCase(),
        name: externMatch[3],
        added: externMatch[1] === "+",
        evidence: line.slice(1).trim(),
      });
      externsByPath.set(currentPath, entries);
    }
  }

  for (const [path, entries] of externsByPath) {
    const byAddress = new Map<string, AddressExtern[]>();
    for (const entry of entries) {
      const grouped = byAddress.get(entry.address) ?? [];
      grouped.push(entry);
      byAddress.set(entry.address, grouped);
    }
    for (const [address, grouped] of byAddress) {
      const names = [...new Set(grouped.map((entry) => entry.name))].sort();
      if (names.length <= 1 || !grouped.some((entry) => entry.added)) continue;
      findings.push({
        ruleId: "duplicate-address-extern-alias",
        severity: "error",
        path,
        evidence: grouped.map((entry) => entry.evidence).join(" | "),
        message: `Address-commented extern 0x${address} appears under multiple names: ${names.join(", ")}.`,
      });
    }
  }

  return {
    status: findings.length ? "failed" : "passed",
    reasons: findings.map((finding) => `${finding.ruleId}: ${finding.message}`),
    findings,
  };
}

function looksLikeVariableIdentifier(identifier: string): boolean {
  return /^[a-z]/.test(identifier) || /^(?:fn|lbl|un)_[0-9A-Fa-f_]+$/.test(identifier) || /_[0-9A-Fa-f]{6,8}$/.test(identifier);
}

function isCSourcePath(path: string): boolean {
  return /\.(?:c|h)$/i.test(path);
}

function bodyHasStringLiteral(body: string): boolean {
  C_STRING_LITERAL_RE.lastIndex = 0;
  return C_STRING_LITERAL_RE.test(body);
}

function stringLiteralReplacement(removedBody: string, addedBody: string): { literal: string; identifier: string } | null {
  C_STRING_LITERAL_RE.lastIndex = 0;
  for (const match of removedBody.matchAll(C_STRING_LITERAL_RE)) {
    const literal = match[0];
    const prefix = removedBody.slice(0, match.index);
    const suffix = removedBody.slice((match.index ?? 0) + literal.length);
    const replacementMatch = new RegExp(`^\\s*${codeFragmentPattern(prefix)}\\s*${IDENTIFIER_EXPR_RE}\\s*${codeFragmentPattern(suffix)}\\s*$`).exec(addedBody);
    const identifier = replacementMatch?.[1];
    if (identifier && looksLikeVariableIdentifier(identifier)) {
      return { literal, identifier };
    }
  }
  return null;
}

function codeFragmentPattern(fragment: string): string {
  let pattern = "";
  for (const char of fragment.trim()) {
    pattern += /\s/.test(char) ? "\\s*" : escapeRegExp(char);
  }
  return pattern;
}

function escapeRegExp(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

export function evaluateWorkerReportAcceptance(params: {
  agentReport: Record<string, unknown> | null;
  reportType: WorkerReportType;
  writeSet: string[];
  parseError?: string;
  artifactExists?: (path: string) => boolean;
}): WorkerReportAcceptanceGate {
  if (!isProgressReportType(params.reportType)) {
    return {
      intendedReportType: params.reportType,
      effectiveReportType: params.reportType,
      accepted: true,
      reasons: [],
    };
  }

  const reasons: string[] = [];
  const report = params.agentReport;
  if (params.parseError) reasons.push(`agent report parse error: ${params.parseError}`);
  if (!report) {
    reasons.push("missing structured agent report");
  } else {
    const localRegressionCheck = report.local_regression_check;
    if (!isRecord(localRegressionCheck)) {
      reasons.push("missing local_regression_check object");
    } else {
      const baselineArtifact = localRegressionCheck.baseline_artifact;
      const finalArtifact = localRegressionCheck.final_artifact;
      if (localRegressionCheck.status !== "passed") {
        reasons.push(`local_regression_check.status must be passed, got ${String(localRegressionCheck.status ?? "missing")}`);
      }
      if (localRegressionCheck.target_regression !== false) {
        reasons.push("local_regression_check.target_regression must be false");
      }
      if (!Array.isArray(localRegressionCheck.neighbor_regressions)) {
        reasons.push("local_regression_check.neighbor_regressions must be an array");
      } else if (localRegressionCheck.neighbor_regressions.length > 0) {
        reasons.push("local_regression_check.neighbor_regressions must be empty");
      }
      if (!nonEmptyString(baselineArtifact)) {
        reasons.push("local_regression_check.baseline_artifact must reference a baseline artifact");
      } else if (params.artifactExists && !params.artifactExists(baselineArtifact)) {
        reasons.push(`local_regression_check.baseline_artifact does not exist: ${baselineArtifact}`);
      }
      if (!nonEmptyString(finalArtifact)) {
        reasons.push("local_regression_check.final_artifact must reference a final validation artifact");
      } else if (params.artifactExists && !params.artifactExists(finalArtifact)) {
        reasons.push(`local_regression_check.final_artifact does not exist: ${finalArtifact}`);
      }
    }

    const lease = report.lease;
    if (!isRecord(lease)) {
      reasons.push("missing lease object in worker report");
    } else {
      if (lease.write_set_checked !== true) {
        reasons.push("lease.write_set_checked must be true");
      }
      if (!Array.isArray(lease.edited_paths)) {
        reasons.push("lease.edited_paths must be an array");
      } else {
        const writeSet = new Set(params.writeSet);
        const outsideWriteSet = lease.edited_paths.filter((path) => typeof path !== "string" || !writeSet.has(path));
        if (outsideWriteSet.length > 0) {
          reasons.push(`lease.edited_paths contains paths outside write_set: ${outsideWriteSet.map(String).join(", ")}`);
        }
      }
    }
  }

  return {
    intendedReportType: params.reportType,
    effectiveReportType: reasons.length === 0 ? params.reportType : "stalled_no_useful_guess",
    accepted: reasons.length === 0,
    reasons,
  };
}

export function workerReturnRepairReasons(params: {
  acceptanceGate: WorkerReportAcceptanceGate;
  writeSetDiffChanged: boolean;
  runnerValidation?: WorkerRunnerValidation;
  reviewLint?: WorkerReviewLint;
}): string[] {
  const reasons: string[] = [];
  if (!params.acceptanceGate.accepted) {
    reasons.push(...params.acceptanceGate.reasons.map((reason) => `acceptance gate: ${reason}`));
  }
  if (params.runnerValidation?.status === "failed") {
    reasons.push(...params.runnerValidation.reasons.map((reason) => `runner validation: ${reason}`));
  }
  if (params.reviewLint?.status === "failed") {
    reasons.push(...params.reviewLint.reasons.map((reason) => `review lint: ${reason}`));
  }
  const acceptedProgress = params.acceptanceGate.accepted && isProgressReportType(params.acceptanceGate.effectiveReportType);
  if (params.writeSetDiffChanged && !acceptedProgress) {
    reasons.push("write_set diff changed but the worker did not return accepted progress/score_candidate validation");
  }
  return reasons;
}
