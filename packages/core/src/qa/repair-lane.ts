import type { QaScanFinding, QaScanResult } from "./scan-diff.js";

export const QA_REPAIR_QUEUE_SCHEMA_VERSION = "qa_repair_queue_v1";
export const QA_REPAIR_SUMMARY_SCHEMA_VERSION = "qa_repair_summary_v1";
export const QA_REPAIR_SHIP_STATUS_SCHEMA_VERSION = "qa_repair_ship_status_v1";

export type QaRepairLane = "match" | "improvement" | "support" | "unknown";
export type QaRepairItemStatus = "queued" | "in_progress" | "clean_same_match" | "clean_lower_score" | "needs_rework" | "false_positive" | "blocked";

export interface QaRepairProof {
  checkpointItemId?: string;
  disposition?: string;
  lane: QaRepairLane;
  sourcePath: string;
  symbol?: string;
  unit?: string;
  exactMatch?: boolean;
  summaryPath?: string;
  patchPath?: string;
}

export interface QaRepairCandidateFile {
  sourcePath: string;
  lane: QaRepairLane;
  proofs: QaRepairProof[];
  errorCount: number;
  warningCount: number;
  ruleCounts: Record<string, number>;
  status: "clean" | "warning_only" | "needs_qa_repair";
}

export interface QaRepairAttempt {
  id: string;
  status: "dry_run" | "agent_failed" | "invalid_output" | "validation_failed" | "validated";
  createdAt: string;
  outputDir: string;
  systemPromptPath?: string;
  userPromptPath?: string;
  agentOutputPath?: string;
  parsedOutputPath?: string;
  preScanPath?: string;
  postScanPath?: string;
  scoreCheckPath?: string;
  buildCheckPath?: string;
  regressionCheckPath?: string;
  validationPath?: string;
  summary?: string;
  error?: string;
}

export interface QaRepairQueueItem {
  schema_version: "qa_repair_queue_item_v1";
  id: string;
  status: QaRepairItemStatus;
  source_path: string;
  lane: QaRepairLane;
  base_ref: string | null;
  head_sha: string | null;
  proofs: QaRepairProof[];
  findings: QaScanFinding[];
  warnings: QaScanFinding[];
  rule_counts: Record<string, number>;
  created_at: string;
  validation: {
    qa_scan: string;
    target_check: string;
    ship_set_check: string;
  };
  attempts: QaRepairAttempt[];
  routing_reason?: string;
}

export interface QaRepairIgnoredFinding {
  finding: QaScanFinding;
  reason: string;
}

export interface QaRepairQueue {
  schema_version: typeof QA_REPAIR_QUEUE_SCHEMA_VERSION;
  run_id: string;
  created_at: string;
  repo_root: string;
  base_ref: string | null;
  head_sha: string | null;
  dry_run: boolean;
  candidate_files: QaRepairCandidateFile[];
  items: QaRepairQueueItem[];
  ignored_findings: QaRepairIgnoredFinding[];
  all_findings: QaScanFinding[];
  scan: {
    status: QaScanResult["status"];
    base: string | null;
    counts: { errors: number; warnings: number };
  };
}

export interface QaRepairSummary {
  schema_version: typeof QA_REPAIR_SUMMARY_SCHEMA_VERSION;
  run_id: string;
  created_at: string;
  repo_root: string;
  base_ref: string | null;
  head_sha: string | null;
  dry_run: boolean;
  artifact_dir: string | null;
  queue_path: string | null;
  summary_path: string | null;
  report_path: string | null;
  ship_status_path: string | null;
  counts: {
    candidate_files: number;
    files_with_errors: number;
    files_with_warnings: number;
    queued_items: number;
    ignored_findings: number;
    errors: number;
    warnings: number;
    by_status: Record<string, number>;
    by_rule: Record<string, number>;
  };
  recommendation: "clean" | "repair_required" | "blocked";
}

export interface QaRepairShipStatus {
  schema_version: typeof QA_REPAIR_SHIP_STATUS_SCHEMA_VERSION;
  status: "qa_repair_clean" | "qa_repair_pending" | "qa_repair_blocked";
  runId: string;
  baseRef: string | null;
  headSha: string | null;
  shippedFiles: string[];
  droppedFiles: Record<string, string[]>;
  cleanLowerScoreFiles: string[];
  falsePositiveFiles: string[];
  summary: {
    candidateFiles: number;
    shippedFiles: number;
    droppedFiles: number;
  };
}

export interface BuildQaRepairQueueOptions {
  runId: string;
  repoRoot: string;
  baseRef?: string | null;
  headSha?: string | null;
  scanResult: QaScanResult;
  checkpoint?: unknown;
  candidateFiles?: string[];
  includeImprovementCandidates?: boolean;
  includeAllScanFilesWhenNoCandidates?: boolean;
  createdAt?: string;
  dryRun?: boolean;
}

export interface QaRepairValidationInput {
  item: QaRepairQueueItem;
  postScan: QaScanResult | null;
  postScanToolError?: string | null;
  scorePassed?: boolean | null;
  scoreImpact?: "same_match" | "lower_score" | "unknown" | null;
  preTargetScore?: number | null;
  postTargetScore?: number | null;
  buildPassed?: boolean | null;
  regressionPassed?: boolean | null;
  falsePositive?: boolean;
  blockedReason?: string;
  validationArtifacts?: Record<string, string | null | undefined>;
}

export interface QaRepairValidationResult {
  itemId: string;
  sourcePath: string;
  status: QaRepairItemStatus;
  reasons: string[];
  remainingFindings: QaScanFinding[];
  validationArtifacts: Record<string, string | null>;
}

function asObject(value: unknown): Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function boolValue(value: unknown): boolean {
  return value === true || value === 1 || value === "true";
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/^\/+/, "");
}

function sameOrSuffixPath(left: string, right: string): boolean {
  const a = normalizePath(left);
  const b = normalizePath(right);
  return a === b || a.endsWith(`/${b}`) || b.endsWith(`/${a}`);
}

function slugForPath(path: string): string {
  return normalizePath(path)
    .replace(/\.[^.]+$/, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "unknown";
}

function increment(map: Record<string, number>, key: string, delta = 1): void {
  map[key] = (map[key] ?? 0) + delta;
}

function dispositionLane(disposition: string): QaRepairLane | null {
  if (disposition === "pr_candidate") return "match";
  if (disposition === "improvement_candidate") return "improvement";
  return null;
}

function proofFromCheckpointItem(raw: unknown, includeImprovementCandidates: boolean): QaRepairProof | null {
  const item = asObject(raw);
  const sourcePath = stringValue(item.sourcePath, stringValue(item.source_path));
  const disposition = stringValue(item.disposition);
  const lane = dispositionLane(disposition);
  if (!sourcePath || !lane) return null;
  if (lane === "improvement" && !includeImprovementCandidates) return null;
  return {
    checkpointItemId: stringValue(item.id),
    disposition,
    lane,
    sourcePath: normalizePath(sourcePath),
    symbol: stringValue(item.symbol),
    unit: stringValue(item.unit),
    exactMatch: boolValue(item.exactMatch ?? item.exact_match),
    summaryPath: stringValue(item.summaryPath, stringValue(item.summary_path)),
    patchPath: stringValue(item.patchPath, stringValue(item.patch_path)),
  };
}

export function candidateProofsFromCheckpoint(checkpoint: unknown, options: { includeImprovementCandidates?: boolean } = {}): QaRepairProof[] {
  const payload = asObject(checkpoint);
  const includeImprovementCandidates = options.includeImprovementCandidates !== false;
  const proofs: QaRepairProof[] = [];
  for (const raw of asArray(payload.items)) {
    const proof = proofFromCheckpointItem(raw, includeImprovementCandidates);
    if (proof) proofs.push(proof);
  }
  return proofs;
}

function mergeCandidateProofs(options: BuildQaRepairQueueOptions): QaRepairProof[] {
  const proofs = candidateProofsFromCheckpoint(options.checkpoint, {
    includeImprovementCandidates: options.includeImprovementCandidates,
  });
  const known = new Set(proofs.map((proof) => normalizePath(proof.sourcePath)));
  for (const path of options.candidateFiles ?? []) {
    const normalized = normalizePath(path);
    if (!normalized || known.has(normalized)) continue;
    proofs.push({ sourcePath: normalized, lane: "unknown" });
    known.add(normalized);
  }
  if (proofs.length === 0 && options.includeAllScanFilesWhenNoCandidates !== false) {
    for (const finding of options.scanResult.findings) {
      const normalized = normalizePath(finding.file);
      if (!normalized || known.has(normalized)) continue;
      proofs.push({ sourcePath: normalized, lane: "unknown" });
      known.add(normalized);
    }
  }
  return proofs;
}

function proofLane(proofs: QaRepairProof[]): QaRepairLane {
  if (proofs.some((proof) => proof.lane === "match")) return "match";
  if (proofs.some((proof) => proof.lane === "improvement")) return "improvement";
  if (proofs.some((proof) => proof.lane === "support")) return "support";
  return "unknown";
}

function candidateMatcher(candidatePaths: string[]): (path: string) => string | null {
  return (path: string) => {
    for (const candidate of candidatePaths) {
      if (sameOrSuffixPath(path, candidate)) return normalizePath(candidate);
    }
    return null;
  };
}

function findingsForPath(findings: QaScanFinding[], path: string, severity?: QaScanFinding["severity"]): QaScanFinding[] {
  return findings.filter((finding) => sameOrSuffixPath(finding.file, path) && (!severity || finding.severity === severity));
}

function ruleCounts(findings: QaScanFinding[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const finding of findings) increment(counts, finding.rule_id);
  return counts;
}

function candidateFileStatus(errors: number, warnings: number): QaRepairCandidateFile["status"] {
  if (errors > 0) return "needs_qa_repair";
  if (warnings > 0) return "warning_only";
  return "clean";
}

export function buildQaRepairQueue(options: BuildQaRepairQueueOptions): QaRepairQueue {
  const createdAt = options.createdAt ?? new Date().toISOString();
  const candidateProofs = mergeCandidateProofs(options);
  const proofGroups = new Map<string, QaRepairProof[]>();
  for (const proof of candidateProofs) {
    const key = normalizePath(proof.sourcePath);
    const group = proofGroups.get(key) ?? [];
    group.push(proof);
    proofGroups.set(key, group);
  }
  const candidatePaths = [...proofGroups.keys()].sort();
  const matchCandidate = candidateMatcher(candidatePaths);
  const ignored_findings: QaRepairIgnoredFinding[] = [];
  for (const finding of options.scanResult.findings) {
    if (!matchCandidate(finding.file)) {
      ignored_findings.push({ finding, reason: "outside_candidate_set" });
    }
  }

  const candidate_files: QaRepairCandidateFile[] = [];
  const items: QaRepairQueueItem[] = [];
  for (const sourcePath of candidatePaths) {
    const proofs = proofGroups.get(sourcePath) ?? [];
    const errors = findingsForPath(options.scanResult.findings, sourcePath, "error");
    const warnings = findingsForPath(options.scanResult.findings, sourcePath, "warning");
    const allFileFindings = [...errors, ...warnings];
    const fileRuleCounts = ruleCounts(allFileFindings);
    const lane = proofLane(proofs);
    candidate_files.push({
      sourcePath,
      lane,
      proofs,
      errorCount: errors.length,
      warningCount: warnings.length,
      ruleCounts: fileRuleCounts,
      status: candidateFileStatus(errors.length, warnings.length),
    });
    if (errors.length === 0) continue;
    items.push({
      schema_version: "qa_repair_queue_item_v1",
      id: slugForPath(sourcePath),
      status: "queued",
      source_path: sourcePath,
      lane,
      base_ref: options.baseRef ?? options.scanResult.base ?? null,
      head_sha: options.headSha ?? null,
      proofs,
      findings: errors,
      warnings,
      rule_counts: fileRuleCounts,
      created_at: createdAt,
      validation: {
        qa_scan: `review_lint scan_diff --gate for ${sourcePath}`,
        target_check: "runner-owned score/build validation when available",
        ship_set_check: "final PR ship-set verification before inclusion",
      },
      attempts: [],
    });
  }

  return {
    schema_version: QA_REPAIR_QUEUE_SCHEMA_VERSION,
    run_id: options.runId,
    created_at: createdAt,
    repo_root: options.repoRoot,
    base_ref: options.baseRef ?? options.scanResult.base ?? null,
    head_sha: options.headSha ?? null,
    dry_run: options.dryRun ?? false,
    candidate_files,
    items,
    ignored_findings,
    all_findings: options.scanResult.findings,
    scan: {
      status: options.scanResult.status,
      base: options.scanResult.base,
      counts: options.scanResult.counts,
    },
  };
}

export function summarizeQaRepairQueue(queue: QaRepairQueue, artifactPaths: Partial<Pick<QaRepairSummary, "artifact_dir" | "queue_path" | "summary_path" | "report_path" | "ship_status_path">> = {}): QaRepairSummary {
  const byStatus: Record<string, number> = {};
  const byRule: Record<string, number> = {};
  for (const item of queue.items) {
    increment(byStatus, item.status);
    for (const finding of [...item.findings, ...item.warnings]) increment(byRule, finding.rule_id);
  }
  const filesWithErrors = queue.candidate_files.filter((file) => file.errorCount > 0).length;
  const filesWithWarnings = queue.candidate_files.filter((file) => file.warningCount > 0).length;
  const blocked = queue.items.some((item) => item.status === "blocked");
  const queued = queue.items.some((item) => item.status === "queued" || item.status === "in_progress");
  return {
    schema_version: QA_REPAIR_SUMMARY_SCHEMA_VERSION,
    run_id: queue.run_id,
    created_at: queue.created_at,
    repo_root: queue.repo_root,
    base_ref: queue.base_ref,
    head_sha: queue.head_sha,
    dry_run: queue.dry_run,
    artifact_dir: artifactPaths.artifact_dir ?? null,
    queue_path: artifactPaths.queue_path ?? null,
    summary_path: artifactPaths.summary_path ?? null,
    report_path: artifactPaths.report_path ?? null,
    ship_status_path: artifactPaths.ship_status_path ?? null,
    counts: {
      candidate_files: queue.candidate_files.length,
      files_with_errors: filesWithErrors,
      files_with_warnings: filesWithWarnings,
      queued_items: queue.items.length,
      ignored_findings: queue.ignored_findings.length,
      errors: queue.candidate_files.reduce((sum, file) => sum + file.errorCount, 0),
      warnings: queue.candidate_files.reduce((sum, file) => sum + file.warningCount, 0),
      by_status: byStatus,
      by_rule: byRule,
    },
    recommendation: blocked ? "blocked" : queued || filesWithErrors > 0 ? "repair_required" : "clean",
  };
}

function renderRuleCounts(counts: Record<string, number>): string {
  const entries = Object.entries(counts).sort(([left], [right]) => left.localeCompare(right));
  return entries.length ? entries.map(([rule, count]) => `${rule} x${count}`).join(", ") : "none";
}

function renderFindingLine(finding: QaScanFinding): string {
  return `- ${finding.severity.toUpperCase()} ${finding.rule_id} ${finding.file}:${finding.line} - ${finding.message} (excerpt: ${finding.excerpt})`;
}

export function renderQaRepairReport(queue: QaRepairQueue, summary = summarizeQaRepairQueue(queue)): string {
  const lines: string[] = [
    "# QA Repair Report",
    "",
    `Run: ${queue.run_id}`,
    `Created: ${queue.created_at}`,
    `Repo: ${queue.repo_root}`,
    `Base: ${queue.base_ref ?? "-"}`,
    `Head: ${queue.head_sha ?? "-"}`,
    `Dry run: ${queue.dry_run ? "yes" : "no"}`,
    "",
    "## Summary",
    "",
    `- Candidate files: ${summary.counts.candidate_files}`,
    `- Files with errors: ${summary.counts.files_with_errors}`,
    `- Files with warnings: ${summary.counts.files_with_warnings}`,
    `- Queue items: ${summary.counts.queued_items}`,
    `- Errors: ${summary.counts.errors}`,
    `- Warnings: ${summary.counts.warnings}`,
    `- Recommendation: ${summary.recommendation}`,
    "",
    "## Files With QA Errors",
    "",
  ];
  const filesWithErrors = queue.candidate_files.filter((file) => file.errorCount > 0).sort((left, right) => left.sourcePath.localeCompare(right.sourcePath));
  if (filesWithErrors.length === 0) {
    lines.push("No candidate files have error-severity QA findings.", "");
  } else {
    for (const file of filesWithErrors) {
      const item = queue.items.find((candidate) => sameOrSuffixPath(candidate.source_path, file.sourcePath));
      lines.push(`### ${file.sourcePath}`, "");
      lines.push(`- Lane: ${file.lane}`);
      lines.push(`- Status: ${item?.status ?? file.status}`);
      lines.push(`- Errors: ${file.errorCount}`);
      lines.push(`- Warnings: ${file.warningCount}`);
      lines.push(`- Rules: ${renderRuleCounts(file.ruleCounts)}`);
      if (item?.routing_reason) lines.push(`- Routing: ${item.routing_reason}`);
      lines.push("");
      for (const finding of item?.findings ?? []) lines.push(renderFindingLine(finding));
      if ((item?.warnings ?? []).length > 0) {
        lines.push("", "Warnings:");
        for (const finding of item?.warnings ?? []) lines.push(renderFindingLine(finding));
      }
      lines.push("");
    }
  }
  const warningOnly = queue.candidate_files.filter((file) => file.errorCount === 0 && file.warningCount > 0);
  if (warningOnly.length > 0) {
    lines.push("## Warning-Only Candidate Files", "");
    for (const file of warningOnly.sort((left, right) => left.sourcePath.localeCompare(right.sourcePath))) {
      lines.push(`- ${file.sourcePath}: ${renderRuleCounts(file.ruleCounts)}`);
    }
    lines.push("");
  }
  if (queue.ignored_findings.length > 0) {
    lines.push("## Ignored Findings", "");
    const counts: Record<string, number> = {};
    for (const ignored of queue.ignored_findings) increment(counts, ignored.reason);
    for (const [reason, count] of Object.entries(counts)) lines.push(`- ${reason}: ${count}`);
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

function finiteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function cleanStatusFromScores(input: QaRepairValidationInput): QaRepairItemStatus {
  if (finiteNumber(input.preTargetScore) && finiteNumber(input.postTargetScore) && input.postTargetScore + 0.000001 < input.preTargetScore) {
    return "clean_lower_score";
  }
  if (input.scoreImpact === "lower_score") return "clean_lower_score";
  return "clean_same_match";
}

export function validateQaRepairOutcome(input: QaRepairValidationInput): QaRepairValidationResult {
  const reasons: string[] = [];
  const artifacts = Object.fromEntries(
    Object.entries(input.validationArtifacts ?? {}).map(([key, value]) => [key, value ?? null]),
  ) as Record<string, string | null>;
  if (input.blockedReason) {
    return {
      itemId: input.item.id,
      sourcePath: input.item.source_path,
      status: "blocked",
      reasons: [input.blockedReason],
      remainingFindings: [],
      validationArtifacts: artifacts,
    };
  }
  if (input.falsePositive) {
    return {
      itemId: input.item.id,
      sourcePath: input.item.source_path,
      status: "false_positive",
      reasons: ["operator or rule refinement marked the finding false positive; do not treat as clean without follow-up"],
      remainingFindings: input.postScan?.findings.filter((finding) => sameOrSuffixPath(finding.file, input.item.source_path)) ?? [],
      validationArtifacts: artifacts,
    };
  }
  if (input.postScanToolError) {
    return {
      itemId: input.item.id,
      sourcePath: input.item.source_path,
      status: "blocked",
      reasons: [`post-repair QA scan failed: ${input.postScanToolError}`],
      remainingFindings: [],
      validationArtifacts: artifacts,
    };
  }
  if (!input.postScan) {
    return {
      itemId: input.item.id,
      sourcePath: input.item.source_path,
      status: "blocked",
      reasons: ["post-repair QA scan is missing; agent output alone cannot mark an item clean"],
      remainingFindings: [],
      validationArtifacts: artifacts,
    };
  }
  const remainingFindings = findingsForPath(input.postScan.findings, input.item.source_path, "error");
  if (remainingFindings.length > 0) {
    reasons.push(`post-repair QA scan still has ${remainingFindings.length} error finding(s) for ${input.item.source_path}`);
  }
  if (input.scorePassed === false) reasons.push("post-repair score validation failed");
  if (input.buildPassed === false) reasons.push("post-repair build validation failed");
  if (input.regressionPassed === false) reasons.push("post-repair regression validation failed");
  if (reasons.length > 0) {
    return {
      itemId: input.item.id,
      sourcePath: input.item.source_path,
      status: "needs_rework",
      reasons,
      remainingFindings,
      validationArtifacts: artifacts,
    };
  }
  return {
    itemId: input.item.id,
    sourcePath: input.item.source_path,
    status: cleanStatusFromScores(input),
    reasons: ["post-repair QA scan is clean for the item"],
    remainingFindings: [],
    validationArtifacts: artifacts,
  };
}

export function applyQaRepairValidation(queue: QaRepairQueue, result: QaRepairValidationResult, attempt?: QaRepairAttempt): QaRepairQueue {
  const items = queue.items.map((item) => {
    if (item.id !== result.itemId) return item;
    return {
      ...item,
      status: result.status,
      routing_reason: result.reasons.join("; "),
      attempts: attempt ? [...item.attempts, attempt] : item.attempts,
    };
  });
  return { ...queue, items };
}

export function qaRepairShipStatus(queue: QaRepairQueue): QaRepairShipStatus {
  const itemByPath = new Map(queue.items.map((item) => [normalizePath(item.source_path), item]));
  const shippedFiles: string[] = [];
  const droppedFiles: Record<string, string[]> = {};
  const cleanLowerScoreFiles: string[] = [];
  const falsePositiveFiles: string[] = [];
  for (const candidate of queue.candidate_files) {
    const item = itemByPath.get(normalizePath(candidate.sourcePath));
    if (!item) {
      shippedFiles.push(candidate.sourcePath);
      continue;
    }
    if (item.status === "clean_same_match") {
      shippedFiles.push(candidate.sourcePath);
    } else if (item.status === "clean_lower_score") {
      cleanLowerScoreFiles.push(candidate.sourcePath);
      droppedFiles[candidate.sourcePath] = ["qa repair cleaned the file but lowered match score; carry forward or route through an explicit improvement policy"];
    } else if (item.status === "false_positive") {
      falsePositiveFiles.push(candidate.sourcePath);
      droppedFiles[candidate.sourcePath] = ["qa repair marked a scanner false positive; requires rule follow-up before shipping"];
    } else {
      droppedFiles[candidate.sourcePath] = [item.routing_reason || `qa repair status ${item.status}`];
    }
  }
  const pending = queue.items.some((item) => item.status === "queued" || item.status === "in_progress");
  const blocked = queue.items.some((item) => item.status === "blocked" || item.status === "needs_rework" || item.status === "false_positive");
  return {
    schema_version: QA_REPAIR_SHIP_STATUS_SCHEMA_VERSION,
    status: blocked ? "qa_repair_blocked" : pending ? "qa_repair_pending" : "qa_repair_clean",
    runId: queue.run_id,
    baseRef: queue.base_ref,
    headSha: queue.head_sha,
    shippedFiles: shippedFiles.sort(),
    droppedFiles,
    cleanLowerScoreFiles: cleanLowerScoreFiles.sort(),
    falsePositiveFiles: falsePositiveFiles.sort(),
    summary: {
      candidateFiles: queue.candidate_files.length,
      shippedFiles: shippedFiles.length,
      droppedFiles: Object.keys(droppedFiles).length,
    },
  };
}
