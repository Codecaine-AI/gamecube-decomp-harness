/**
 * Draft PR QA lifecycle coordinator.
 *
 * This command treats an opened draft PR as the durable remote object, then
 * runs the local pre-human-review loop around it: fetch refs, review the diff,
 * run deterministic QA scan + optional repairs, comment unresolved findings,
 * and verify local/CI checks before declaring the draft ready for humans.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { artifactTimestamp } from "@decomp-orchestrator/agents/runtime";
import type { PreshipReview, PreshipReviewFinding } from "@decomp-orchestrator/agents/pr-review";
import { runQaScanDiff, type QaScanFinding, type QaScanInvocation, type QaScanResult, type RunQaScanDiffOptions } from "@decomp-orchestrator/core/qa";
import type { QaRepairItemStatus, QaRepairQueue, QaRepairQueueItem } from "@decomp-orchestrator/core/qa/repair-lane";
import { runCommand, type CommandResult } from "@decomp-orchestrator/core/shell";
import { packageRoot } from "@decomp-orchestrator/knowledge";
import { booleanArg, numberArg, stringArg, type GlobalArgs } from "../args.js";
import { runPreshipReview, type PreshipAgentRunner, type PreshipAggregate, type PreshipReviewRunOptions } from "./pr-preship-review.js";
import { runQaRepair, type QaRepairAgentRunner } from "./qa-repair.js";

const SUMMARY_SCHEMA_VERSION = "pr_draft_qa_summary_v1";
const COMMENT_MARKER_PREFIX = "decomp-orchestrator:pr-draft-qa";

export type DraftQaStatus =
  | "ready_for_human_review"
  | "ready_for_human_review_with_warnings"
  | "manual_review_required"
  | "needs_repair"
  | "blocked";

export interface DraftPrMetadata {
  number: number;
  url: string;
  title: string;
  state: string;
  isDraft: boolean;
  baseRefName: string;
  baseRefOid: string;
  headRefName: string;
  headRefOid: string;
  authorLogin: string | null;
  headOwnerLogin: string | null;
}

interface PreshipFindingRecord {
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

interface CommentableFinding {
  source: "preship" | "review_lint" | "qa_repair";
  severity: "error" | "warning" | "reject" | "blocked";
  file: string | null;
  line: number | null;
  ruleId: string | null;
  standardId: string | null;
  message: string;
  suggestedFix: string | null;
  artifactPath: string | null;
}

interface PostedCommentRecord {
  marker: string;
  finding: CommentableFinding;
  status: "posted_inline" | "posted_top_level" | "already_present" | "dry_run" | "failed";
  url?: string | null;
  error?: string;
}

interface VerificationResult {
  status: "passed" | "failed" | "skipped";
  command?: string[];
  exitCode?: number;
  stdoutPath?: string;
  stderrPath?: string;
  summaryPath?: string;
  reason?: string;
}

interface DraftQaRound {
  round: number;
  includeWorktree: boolean;
  planPath: string;
  diffPath: string;
  qaScanPath: string | null;
  qaScanInvocationPath: string;
  preship: PreshipAggregate;
  qaRepairOutputDir: string | null;
  qaRepairQueuePath: string | null;
  qaRepairSummaryPath: string | null;
  scanErrors: number;
  scanWarnings: number;
  preshipRejects: number;
  preshipWarnings: number;
  repairUnresolved: number;
  repairLowerScore: number;
  repairFalsePositive: number;
}

export interface DraftQaSummary {
  schema_version: typeof SUMMARY_SCHEMA_VERSION;
  runId: string;
  pr: DraftPrMetadata;
  repo: string;
  baseRef: string;
  headRef: string;
  includeWorktree: boolean;
  status: DraftQaStatus;
  readyForHumanReview: boolean;
  exitCode: number;
  artifacts: {
    outputDir: string;
    reportPath: string;
    summaryPath: string;
    commentsPath: string;
    githubCommentsPath: string | null;
    ciSummaryPath: string | null;
    localCheckSummaryPath: string | null;
  };
  counts: {
    changedFiles: number;
    preshipRejects: number;
    preshipWarnings: number;
    qaErrors: number;
    qaWarnings: number;
    repairUnresolved: number;
    repairLowerScore: number;
    repairFalsePositive: number;
    commentableFindings: number;
    commentsPosted: number;
    commentsAlreadyPresent: number;
  };
  rounds: DraftQaRound[];
  ci: VerificationResult;
  localCheck: VerificationResult;
  notes: string[];
}

type CommandRunner = (cwd: string, command: string[]) => Promise<CommandResult>;
type PreshipReviewRunner = (options: PreshipReviewRunOptions, runner?: PreshipAgentRunner) => Promise<{ aggregate: PreshipAggregate; exitCode: number }>;
type QaRepairRunner = typeof runQaRepair;
type ScanDiffRunner = (options: RunQaScanDiffOptions) => Promise<QaScanInvocation>;

export interface DraftPrQaDeps {
  commandRunner?: CommandRunner;
  preshipReview?: PreshipReviewRunner;
  preshipAgentRunner?: PreshipAgentRunner;
  qaRepair?: QaRepairRunner;
  qaRepairAgentRunner?: QaRepairAgentRunner;
  scanDiff?: ScanDiffRunner;
  now?: () => Date;
  orchestratorRoot?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function nullableStringValue(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function numberValue(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function resolveInputPath(path: string, repoRoot: string): string {
  return isAbsolute(path) ? resolve(path) : resolve(repoRoot, path);
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function stableHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function commentMarker(finding: CommentableFinding): string {
  const material = [
    finding.source,
    finding.severity,
    finding.file ?? "",
    String(finding.line ?? ""),
    finding.ruleId ?? "",
    finding.standardId ?? "",
    finding.message,
  ].join("\0");
  return `<!-- ${COMMENT_MARKER_PREFIX}:${stableHash(material)} -->`;
}

function repoSlugFromRemoteUrl(url: string): string | null {
  const trimmed = url.trim().replace(/\.git$/, "");
  const ssh = trimmed.match(/github\.com[:/]([^/]+)\/([^/]+)$/);
  if (ssh) return `${ssh[1]}/${ssh[2]}`;
  const https = trimmed.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)$/);
  return https ? `${https[1]}/${https[2]}` : null;
}

function prNumberFromSelector(selector: string): number | null {
  const trimmed = selector.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const match = trimmed.match(/\/pull\/(\d+)(?:\D|$)/);
  return match ? Number(match[1]) : null;
}

function parseBaseRemote(baseRef: string): string {
  const slash = baseRef.indexOf("/");
  return slash > 0 ? baseRef.slice(0, slash) : "origin";
}

async function runExternal(deps: DraftPrQaDeps, cwd: string, command: string[]): Promise<CommandResult> {
  return (deps.commandRunner ?? ((runCwd, runCommandArgs) => runCommand(runCwd, runCommandArgs)))(cwd, command);
}

function parseJsonOutput(output: string, label: string): unknown {
  try {
    return JSON.parse(output) as unknown;
  } catch (error) {
    throw new Error(`${label} did not return JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function parseGhPaginatedJson(output: string): unknown[] {
  const trimmed = output.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    const rows: unknown[] = [];
    for (const line of trimmed.split(/\r?\n/)) {
      const text = line.trim();
      if (!text) continue;
      const parsed = JSON.parse(text) as unknown;
      if (Array.isArray(parsed)) rows.push(...parsed);
      else rows.push(parsed);
    }
    return rows;
  }
}

async function defaultRepoSlug(globals: GlobalArgs, deps: DraftPrQaDeps): Promise<string> {
  const remote = await runExternal(deps, globals.repoRoot, ["git", "remote", "get-url", "origin"]);
  if (remote.exitCode === 0) {
    const slug = repoSlugFromRemoteUrl(remote.stdout);
    if (slug) return slug;
  }
  if (globals.project?.kind === "doldecomp-melee" || globals.projectId === "melee") return "doldecomp/melee";
  throw new Error("Could not infer GitHub repo; pass --repo owner/name.");
}

async function createDraftPr(params: {
  globals: GlobalArgs;
  deps: DraftPrQaDeps;
  repo: string;
  title: string;
  bodyFile: string;
  base: string;
  head: string;
}): Promise<{ selector: string; url: string }> {
  const command = ["gh", "pr", "create", "--repo", params.repo, "--draft", "--title", params.title, "--body-file", params.bodyFile];
  if (params.base) command.push("--base", params.base);
  if (params.head) command.push("--head", params.head);
  const result = await runExternal(params.deps, params.globals.repoRoot, command);
  if (result.exitCode !== 0) throw new Error(`gh pr create failed (${result.exitCode}): ${result.stderr.trim() || result.stdout.trim()}`);
  const url = result.stdout.trim().split(/\r?\n/).filter(Boolean).pop() ?? "";
  const number = prNumberFromSelector(url);
  return { selector: number ? String(number) : url, url };
}

function prMetadataFromJson(raw: unknown): DraftPrMetadata {
  if (!isRecord(raw)) throw new Error("gh pr view returned a non-object payload");
  const owner = isRecord(raw.headRepositoryOwner) ? nullableStringValue(raw.headRepositoryOwner.login) : null;
  const author = isRecord(raw.author) ? nullableStringValue(raw.author.login) : null;
  const number = numberValue(raw.number, NaN);
  if (!Number.isFinite(number) || number <= 0) throw new Error("gh pr view payload is missing PR number");
  return {
    number,
    url: stringValue(raw.url),
    title: stringValue(raw.title),
    state: stringValue(raw.state),
    isDraft: raw.isDraft === true,
    baseRefName: stringValue(raw.baseRefName),
    baseRefOid: stringValue(raw.baseRefOid),
    headRefName: stringValue(raw.headRefName),
    headRefOid: stringValue(raw.headRefOid),
    authorLogin: author,
    headOwnerLogin: owner,
  };
}

async function viewPr(globals: GlobalArgs, deps: DraftPrQaDeps, repo: string, selector: string): Promise<DraftPrMetadata> {
  const fields = [
    "number",
    "url",
    "title",
    "state",
    "isDraft",
    "baseRefName",
    "baseRefOid",
    "headRefName",
    "headRefOid",
    "headRepositoryOwner",
    "author",
  ].join(",");
  const result = await runExternal(deps, globals.repoRoot, ["gh", "pr", "view", selector, "--repo", repo, "--json", fields]);
  if (result.exitCode !== 0) throw new Error(`gh pr view failed (${result.exitCode}): ${result.stderr.trim() || result.stdout.trim()}`);
  return prMetadataFromJson(parseJsonOutput(result.stdout, "gh pr view"));
}

async function fetchPrRefs(params: {
  globals: GlobalArgs;
  deps: DraftPrQaDeps;
  pr: DraftPrMetadata;
  remote: string;
  skipFetch: boolean;
}): Promise<string[]> {
  if (params.skipFetch) return [];
  const commands = [
    ["git", "fetch", params.remote, params.pr.baseRefName],
    ["git", "fetch", params.remote, `pull/${params.pr.number}/head:refs/remotes/orchestrator-pr/${params.pr.number}`],
  ];
  const notes: string[] = [];
  for (const command of commands) {
    const result = await runExternal(params.deps, params.globals.repoRoot, command);
    if (result.exitCode !== 0) {
      throw new Error(`${command.join(" ")} failed (${result.exitCode}): ${result.stderr.trim() || result.stdout.trim()}`);
    }
    notes.push(command.join(" "));
  }
  return notes;
}

async function changedFiles(params: {
  globals: GlobalArgs;
  deps: DraftPrQaDeps;
  baseRef: string;
  headRef: string;
  includeWorktree: boolean;
}): Promise<string[]> {
  const range = params.includeWorktree ? [params.baseRef] : [params.baseRef, params.headRef];
  const result = await runExternal(params.deps, params.globals.repoRoot, ["git", "diff", "--name-only", ...range, "--"]);
  if (result.exitCode !== 0) {
    const label = params.includeWorktree ? `${params.baseRef}..WORKTREE` : `${params.baseRef}..${params.headRef}`;
    throw new Error(`git diff --name-only ${label} failed (${result.exitCode}): ${result.stderr.trim() || result.stdout.trim()}`);
  }
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function writeDiff(params: {
  globals: GlobalArgs;
  deps: DraftPrQaDeps;
  baseRef: string;
  headRef: string;
  includeWorktree: boolean;
  pathspecs: string[];
  outputPath: string;
}): Promise<void> {
  const range = params.includeWorktree ? [params.baseRef] : [params.baseRef, params.headRef];
  const result = await runExternal(params.deps, params.globals.repoRoot, ["git", "diff", `--output=${params.outputPath}`, ...range, "--", ...params.pathspecs]);
  if (result.exitCode !== 0) {
    const label = params.includeWorktree ? `${params.baseRef}..WORKTREE` : `${params.baseRef}..${params.headRef}`;
    throw new Error(`git diff ${label} failed (${result.exitCode}): ${result.stderr.trim() || result.stdout.trim()}`);
  }
}

async function readPreshipFindings(aggregate: PreshipAggregate): Promise<PreshipFindingRecord[]> {
  const records: PreshipFindingRecord[] = [];
  for (const slice of aggregate.slices) {
    if (!slice.reviewPath) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(slice.reviewPath, "utf8")) as unknown;
    } catch {
      continue;
    }
    const payload = isRecord(parsed) && isRecord(parsed.review) ? (parsed.review as unknown) : parsed;
    const review = isRecord(payload) ? (payload as Partial<PreshipReview>) : null;
    for (const rawFinding of asArray(review?.findings)) {
      const finding = rawFinding as Partial<PreshipReviewFinding>;
      records.push({
        source: "preship",
        sliceId: slice.id,
        file: stringValue(finding.file),
        line: typeof finding.line === "number" ? finding.line : null,
        verdict: finding.verdict === "warn" ? "warn" : "reject",
        standardId: typeof finding.standard_id === "string" ? finding.standard_id : null,
        rationale: stringValue(finding.rationale),
        suggestedFix: typeof finding.suggested_fix === "string" ? finding.suggested_fix : null,
        reviewPath: slice.reviewPath,
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

function preshipFindingsAsQaFindings(findings: PreshipFindingRecord[], includeWarnings: boolean): QaScanFinding[] {
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

function mergeRepairScanFindings(scan: QaScanResult, preshipFindings: PreshipFindingRecord[], includePreshipWarnings: boolean): QaScanResult {
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

function unresolvedRepairItems(queue: QaRepairQueue | null, options: { allowLowerScore?: boolean } = {}): QaRepairQueueItem[] {
  if (!queue) return [];
  return queue.items.filter((item) => {
    if (item.status === "clean_same_match") return false;
    if (item.status === "clean_lower_score" && options.allowLowerScore) return false;
    return true;
  });
}

function repairItemsWithStatus(queue: QaRepairQueue | null, status: QaRepairItemStatus): QaRepairQueueItem[] {
  return queue?.items.filter((item) => item.status === status) ?? [];
}

function updateRepairDispositionByPath(dispositions: Map<string, QaRepairItemStatus>, queue: QaRepairQueue | null): void {
  if (!queue) return;
  for (const item of queue.items) dispositions.set(item.source_path.replace(/\\/g, "/"), item.status);
}

function countRepairDispositions(dispositions: Map<string, QaRepairItemStatus>, status: QaRepairItemStatus): number {
  let count = 0;
  for (const value of dispositions.values()) {
    if (value === status) count += 1;
  }
  return count;
}

function commentablesFromPreship(findings: PreshipFindingRecord[], includeWarnings: boolean): CommentableFinding[] {
  return findings
    .filter((finding) => finding.verdict === "reject" || includeWarnings)
    .map((finding) => ({
      source: "preship",
      severity: finding.verdict === "reject" ? "reject" : "warning",
      file: finding.file || null,
      line: finding.line,
      ruleId: null,
      standardId: finding.standardId,
      message: finding.rationale,
      suggestedFix: finding.suggestedFix,
      artifactPath: finding.reviewPath,
    }));
}

function commentablesFromScan(findings: QaScanFinding[], scanPath: string | null, includeWarnings: boolean): CommentableFinding[] {
  return findings
    .filter((finding) => finding.severity === "error" || includeWarnings)
    .map((finding) => ({
      source: "review_lint",
      severity: finding.severity,
      file: finding.file,
      line: finding.line,
      ruleId: finding.rule_id,
      standardId: finding.standard_id,
      message: finding.message,
      suggestedFix: null,
      artifactPath: scanPath,
    }));
}

function commentablesFromRepair(queue: QaRepairQueue | null, queuePath: string | null, options: { allowLowerScore?: boolean } = {}): CommentableFinding[] {
  return unresolvedRepairItems(queue, options).map((item) => {
    const first = item.findings[0] ?? item.warnings[0];
    return {
      source: "qa_repair",
      severity: "blocked",
      file: item.source_path,
      line: first?.line ?? null,
      ruleId: first?.rule_id ?? null,
      standardId: first?.standard_id ?? null,
      message: item.routing_reason || `QA repair item remains ${item.status}`,
      suggestedFix: "Review the QA repair artifacts and either fix the item or document why it is acceptable.",
      artifactPath: queuePath,
    };
  });
}

function renderCommentBody(finding: CommentableFinding, marker: string, prNumber: number): string {
  const lines = [
    marker,
    "Automated draft PR QA could not fully clear this finding.",
    "",
    `Source: ${finding.source}`,
    `Severity: ${finding.severity}`,
  ];
  if (finding.ruleId) lines.push(`Rule: ${finding.ruleId}`);
  if (finding.standardId) lines.push(`Standard: ${finding.standardId}`);
  lines.push("", finding.message);
  if (finding.suggestedFix) lines.push("", `Suggested follow-up: ${finding.suggestedFix}`);
  if (finding.artifactPath) lines.push("", `Artifact: \`${finding.artifactPath}\``);
  lines.push("", `After fixing or intentionally accepting this, rerun \`make pr-draft-qa PR=${prNumber}\`.`);
  return `${lines.join("\n")}\n`;
}

function markersFromComments(comments: unknown[]): Set<string> {
  const markers = new Set<string>();
  const regex = new RegExp(`<!--\\s*${COMMENT_MARKER_PREFIX}:[^>]+-->`, "g");
  for (const comment of comments) {
    const body = isRecord(comment) ? stringValue(comment.body) : "";
    for (const match of body.matchAll(regex)) markers.add(match[0]);
  }
  return markers;
}

async function fetchGithubComments(params: {
  globals: GlobalArgs;
  deps: DraftPrQaDeps;
  repo: string;
  prNumber: number;
  outputPath: string;
}): Promise<{ comments: unknown[]; warnings: string[] }> {
  const warnings: string[] = [];
  const comments: unknown[] = [];
  const endpoints = [
    ["issue", `repos/${params.repo}/issues/${params.prNumber}/comments`],
    ["review", `repos/${params.repo}/pulls/${params.prNumber}/comments`],
  ] as const;
  for (const [kind, endpoint] of endpoints) {
    const result = await runExternal(params.deps, params.globals.repoRoot, ["gh", "api", "--paginate", endpoint]);
    if (result.exitCode !== 0) {
      warnings.push(`gh api ${endpoint} failed (${result.exitCode}): ${result.stderr.trim() || result.stdout.trim()}`);
      continue;
    }
    try {
      for (const comment of parseGhPaginatedJson(result.stdout)) comments.push({ kind, ...(isRecord(comment) ? comment : { value: comment }) });
    } catch (error) {
      warnings.push(`Could not parse gh api ${endpoint}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  await writeFile(params.outputPath, `${JSON.stringify({ comments, warnings }, null, 2)}\n`);
  return { comments, warnings };
}

async function postTopLevelComment(params: {
  globals: GlobalArgs;
  deps: DraftPrQaDeps;
  repo: string;
  prNumber: number;
  body: string;
}): Promise<{ status: "posted_top_level" | "failed"; url?: string | null; error?: string }> {
  const result = await runExternal(params.deps, params.globals.repoRoot, ["gh", "api", `repos/${params.repo}/issues/${params.prNumber}/comments`, "-f", `body=${params.body}`]);
  if (result.exitCode !== 0) return { status: "failed", error: result.stderr.trim() || result.stdout.trim() };
  const parsed = parseJsonOutput(result.stdout || "{}", "gh issue comment");
  return { status: "posted_top_level", url: isRecord(parsed) ? nullableStringValue(parsed.html_url) : null };
}

async function postFindingComment(params: {
  globals: GlobalArgs;
  deps: DraftPrQaDeps;
  repo: string;
  pr: DraftPrMetadata;
  finding: CommentableFinding;
  body: string;
}): Promise<{ status: "posted_inline" | "posted_top_level" | "failed"; url?: string | null; error?: string }> {
  if (params.finding.file && params.finding.line && params.finding.line > 0) {
    const inline = await runExternal(params.deps, params.globals.repoRoot, [
      "gh",
      "api",
      `repos/${params.repo}/pulls/${params.pr.number}/comments`,
      "-f",
      `body=${params.body}`,
      "-f",
      `commit_id=${params.pr.headRefOid}`,
      "-f",
      `path=${params.finding.file}`,
      "-F",
      `line=${params.finding.line}`,
      "-f",
      "side=RIGHT",
    ]);
    if (inline.exitCode === 0) {
      const parsed = parseJsonOutput(inline.stdout || "{}", "gh review comment");
      return { status: "posted_inline", url: isRecord(parsed) ? nullableStringValue(parsed.html_url) : null };
    }
  }
  return postTopLevelComment({ globals: params.globals, deps: params.deps, repo: params.repo, prNumber: params.pr.number, body: params.body });
}

async function commentUnresolvedFindings(params: {
  globals: GlobalArgs;
  deps: DraftPrQaDeps;
  repo: string;
  pr: DraftPrMetadata;
  findings: CommentableFinding[];
  existingComments: unknown[];
  dryRun: boolean;
}): Promise<PostedCommentRecord[]> {
  const existingMarkers = markersFromComments(params.existingComments);
  const records: PostedCommentRecord[] = [];
  for (const finding of params.findings) {
    const marker = commentMarker(finding);
    if (existingMarkers.has(marker)) {
      records.push({ marker, finding, status: "already_present" });
      continue;
    }
    const body = renderCommentBody(finding, marker, params.pr.number);
    if (params.dryRun) {
      records.push({ marker, finding, status: "dry_run" });
      continue;
    }
    const posted = await postFindingComment({ ...params, finding, body });
    records.push({ marker, finding, ...posted });
    if (posted.status !== "failed") existingMarkers.add(marker);
  }
  return records;
}

function renderTemplateCommand(template: string, params: { globals: GlobalArgs; outputDir: string; runId: string; pr: DraftPrMetadata; baseRef: string; headRef: string }): string {
  const replacements: Record<string, string> = {
    repo_root: shellQuote(params.globals.repoRoot),
    state_dir: shellQuote(params.globals.stateDir),
    output_dir: shellQuote(params.outputDir),
    run_id: shellQuote(params.runId),
    pr: shellQuote(String(params.pr.number)),
    base_ref: shellQuote(params.baseRef),
    head_ref: shellQuote(params.headRef),
  };
  return template.replace(/\{([a-z_]+)\}/g, (match, key: string) => replacements[key] ?? match);
}

async function runLocalCheck(params: {
  globals: GlobalArgs;
  deps: DraftPrQaDeps;
  outputDir: string;
  runId: string;
  pr: DraftPrMetadata;
  baseRef: string;
  headRef: string;
  template: string;
}): Promise<VerificationResult> {
  if (!params.template) return { status: "skipped", reason: "no --local-check-command configured" };
  const commandText = renderTemplateCommand(params.template, params);
  const result = await runExternal(params.deps, params.globals.repoRoot, ["/bin/sh", "-lc", commandText]);
  const stdoutPath = resolve(params.outputDir, "local_check.stdout.txt");
  const stderrPath = resolve(params.outputDir, "local_check.stderr.txt");
  const summaryPath = resolve(params.outputDir, "local_check.summary.json");
  const summary: VerificationResult = {
    status: result.exitCode === 0 ? "passed" : "failed",
    command: ["/bin/sh", "-lc", commandText],
    exitCode: result.exitCode,
    stdoutPath,
    stderrPath,
    summaryPath,
  };
  await writeFile(stdoutPath, result.stdout);
  await writeFile(stderrPath, result.stderr);
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}

async function runCiCheck(params: {
  globals: GlobalArgs;
  deps: DraftPrQaDeps;
  repo: string;
  prNumber: number;
  outputDir: string;
  wait: boolean;
  skip: boolean;
}): Promise<VerificationResult> {
  if (params.skip) return { status: "skipped", reason: "--skip-ci was set" };
  const command = ["gh", "pr", "checks", String(params.prNumber), "--repo", params.repo];
  if (params.wait) command.push("--watch");
  const result = await runExternal(params.deps, params.globals.repoRoot, command);
  const stdoutPath = resolve(params.outputDir, "ci_checks.stdout.txt");
  const stderrPath = resolve(params.outputDir, "ci_checks.stderr.txt");
  const summaryPath = resolve(params.outputDir, "ci_checks.summary.json");
  const summary: VerificationResult = {
    status: result.exitCode === 0 ? "passed" : "failed",
    command,
    exitCode: result.exitCode,
    stdoutPath,
    stderrPath,
    summaryPath,
  };
  await writeFile(stdoutPath, result.stdout);
  await writeFile(stderrPath, result.stderr);
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}

function deriveStatus(params: {
  scanToolError: string | null;
  strictWarnings: boolean;
  allowLowerScoreRepairs: boolean;
  qaErrors: number;
  qaWarnings: number;
  preshipRejects: number;
  preshipWarnings: number;
  repairUnresolved: number;
  repairLowerScore: number;
  repairFalsePositive: number;
  comments: PostedCommentRecord[];
  ci: VerificationResult;
  localCheck: VerificationResult;
}): { status: DraftQaStatus; exitCode: number; readyForHumanReview: boolean } {
  if (params.scanToolError || params.ci.status === "failed" || params.localCheck.status === "failed") {
    return { status: "blocked", exitCode: 1, readyForHumanReview: false };
  }
  if (
    params.qaErrors > 0 ||
    params.repairUnresolved > 0 ||
    params.repairFalsePositive > 0 ||
    (!params.allowLowerScoreRepairs && params.repairLowerScore > 0)
  ) {
    return { status: "needs_repair", exitCode: 1, readyForHumanReview: false };
  }
  if (params.preshipRejects > 0) {
    const allCommented =
      params.comments.length > 0 && params.comments.every((comment) => comment.status === "posted_inline" || comment.status === "posted_top_level" || comment.status === "already_present" || comment.status === "dry_run");
    return {
      status: allCommented ? "manual_review_required" : "needs_repair",
      exitCode: allCommented ? 0 : 1,
      readyForHumanReview: allCommented,
    };
  }
  if (params.strictWarnings && (params.qaWarnings > 0 || params.preshipWarnings > 0)) {
    const allCommented =
      params.comments.length > 0 && params.comments.every((comment) => comment.status === "posted_inline" || comment.status === "posted_top_level" || comment.status === "already_present" || comment.status === "dry_run");
    return {
      status: allCommented ? "manual_review_required" : "needs_repair",
      exitCode: allCommented ? 0 : 1,
      readyForHumanReview: allCommented,
    };
  }
  if (params.qaWarnings > 0 || params.preshipWarnings > 0 || params.repairLowerScore > 0) {
    return { status: "ready_for_human_review_with_warnings", exitCode: 0, readyForHumanReview: true };
  }
  return { status: "ready_for_human_review", exitCode: 0, readyForHumanReview: true };
}

function renderReport(summary: DraftQaSummary, commentRecords: PostedCommentRecord[]): string {
  const lines = [
    `# Draft PR QA #${summary.pr.number}`,
    "",
    `Status: **${summary.status}**`,
    `PR: ${summary.pr.url || `#${summary.pr.number}`}`,
    `Run ID: \`${summary.runId}\``,
    "",
    "## Counts",
    "",
    `- Changed files: ${summary.counts.changedFiles}`,
    `- Preship rejects: ${summary.counts.preshipRejects}`,
    `- Preship warnings: ${summary.counts.preshipWarnings}`,
    `- QA errors: ${summary.counts.qaErrors}`,
    `- QA warnings: ${summary.counts.qaWarnings}`,
    `- Repair unresolved: ${summary.counts.repairUnresolved}`,
    `- Repair lower-score: ${summary.counts.repairLowerScore}`,
    `- Repair false-positive: ${summary.counts.repairFalsePositive}`,
    `- Comments posted: ${summary.counts.commentsPosted}`,
    `- Comments already present: ${summary.counts.commentsAlreadyPresent}`,
    "",
    "## Verification",
    "",
    `- CI: ${summary.ci.status}${summary.ci.exitCode !== undefined ? ` (exit ${summary.ci.exitCode})` : ""}`,
    `- Local check: ${summary.localCheck.status}${summary.localCheck.exitCode !== undefined ? ` (exit ${summary.localCheck.exitCode})` : ""}`,
    "",
    "## Rounds",
    "",
  ];
  for (const round of summary.rounds) {
    lines.push(
      `- Round ${round.round}: preship ${round.preshipRejects} reject/${round.preshipWarnings} warn; QA ${round.scanErrors} error/${round.scanWarnings} warn; repair unresolved ${round.repairUnresolved}, lower-score ${round.repairLowerScore}, false-positive ${round.repairFalsePositive}`,
    );
  }
  if (commentRecords.length > 0) {
    lines.push("", "## Comments", "");
    for (const record of commentRecords) {
      const where = record.finding.file ? `${record.finding.file}${record.finding.line ? `:${record.finding.line}` : ""}` : "top-level";
      lines.push(`- ${record.status}: ${where} (${record.finding.source})`);
    }
  }
  if (summary.notes.length > 0) {
    lines.push("", "## Notes", "", ...summary.notes.map((note) => `- ${note}`));
  }
  lines.push("");
  return lines.join("\n");
}

async function writeScanArtifacts(invocation: QaScanInvocation, outputDir: string): Promise<{ invocationPath: string; resultPath: string | null }> {
  const invocationPath = resolve(outputDir, "qa_scan_invocation.json");
  const resultPath = invocation.result ? resolve(outputDir, "qa_scan.json") : null;
  await writeFile(
    invocationPath,
    `${JSON.stringify({ command: invocation.command, exitCode: invocation.exitCode, toolError: invocation.toolError, stdout: invocation.stdout, stderr: invocation.stderr, result: invocation.result }, null, 2)}\n`,
  );
  if (resultPath && invocation.result) await writeFile(resultPath, `${JSON.stringify(invocation.result, null, 2)}\n`);
  return { invocationPath, resultPath };
}

async function maybeCreateDraftBody(params: {
  args: Map<string, string | true>;
  globals: GlobalArgs;
  createDir: string;
  title: string;
}): Promise<string> {
  const bodyFile = stringArg(params.args, "--body-file", "");
  if (bodyFile) return resolveInputPath(bodyFile, params.globals.repoRoot);
  const body = stringArg(
    params.args,
    "--body",
    ["## Summary", "", "Work-in-progress draft opened by the decomp orchestrator PR lifecycle.", "", "## Status", "", "Automated QA will update this draft before human review."].join("\n"),
  );
  await mkdir(params.createDir, { recursive: true });
  const path = resolve(params.createDir, "draft_body.md");
  await writeFile(path, `${body}\n`);
  return path;
}

export async function runDraftPrQa(globals: GlobalArgs, args: Map<string, string | true>, deps: DraftPrQaDeps = {}): Promise<DraftQaSummary> {
  const runId = stringArg(args, "--run-id", "") || artifactTimestamp(deps.now?.() ?? new Date());
  const repo = stringArg(args, "--repo", "") || (await defaultRepoSlug(globals, deps));
  const createDir = resolve(globals.stateDir, "pr_draft_qa", "_create", runId);

  let selector = stringArg(args, "--pr", "") || stringArg(args, "--pr-url", "");
  if (booleanArg(args, "--create-draft")) {
    const title = stringArg(args, "--title", "");
    if (!title) throw new Error("--title is required with --create-draft");
    const bodyFile = await maybeCreateDraftBody({ args, globals, createDir, title });
    const created = await createDraftPr({
      globals,
      deps,
      repo,
      title,
      bodyFile,
      base: stringArg(args, "--base-branch", ""),
      head: stringArg(args, "--head-branch", ""),
    });
    selector = created.selector;
  }
  if (!selector) throw new Error("Pass --pr <number>, --pr-url <url>, or --create-draft --title <title>.");

  const selectorNumber = prNumberFromSelector(selector);
  const pr = await viewPr(globals, deps, repo, selectorNumber ? String(selectorNumber) : selector);
  const outputDir = resolve(globals.stateDir, "pr_draft_qa", `pr-${pr.number}`, runId);
  await mkdir(outputDir, { recursive: true });

  const notes: string[] = [];
  if (!pr.isDraft) notes.push("PR is not currently marked draft; lifecycle still ran but did not change readiness state.");

  const baseRef = stringArg(args, "--base", pr.baseRefOid || globals.project?.baseRef || "origin/master");
  const headRef = stringArg(args, "--head", pr.headRefOid || `refs/remotes/orchestrator-pr/${pr.number}`);
  const includeWorktree = booleanArg(args, "--include-worktree") || booleanArg(args, "--run-agents");
  const strictWarnings = !booleanArg(args, "--advisory-warnings");
  const repairWarnings = strictWarnings && !booleanArg(args, "--no-repair-warnings");
  const allowLowerScoreRepairs = booleanArg(args, "--allow-lower-score-repairs");
  const remote = stringArg(args, "--remote", parseBaseRemote(globals.project?.baseRef ?? "origin/master"));
  const fetchNotes = await fetchPrRefs({ globals, deps, pr, remote, skipFetch: booleanArg(args, "--skip-fetch") });
  notes.push(...fetchNotes.map((note) => `fetched: ${note}`));

  const files = await changedFiles({ globals, deps, baseRef, headRef, includeWorktree });
  const pathspecs = files.length > 0 ? files : ["."];
  await writeFile(resolve(outputDir, "changed_files.json"), `${JSON.stringify({ files }, null, 2)}\n`);

  const rounds: DraftQaRound[] = [];
  let latestPreshipFindings: PreshipFindingRecord[] = [];
  let latestScan: QaScanInvocation | null = null;
  let latestScanPath: string | null = null;
  let latestQueue: QaRepairQueue | null = null;
  let latestQueuePath: string | null = null;
  let scanToolError: string | null = null;
  const repairDispositionByPath = new Map<string, QaRepairItemStatus>();
  const maxRepairRounds = Math.max(1, Math.floor(numberArg(args, "--max-repair-rounds", booleanArg(args, "--run-agents") ? 2 : 1)));
  const preship = deps.preshipReview ?? runPreshipReview;
  const qaRepairRunner = deps.qaRepair ?? runQaRepair;
  const scanDiff = deps.scanDiff ?? runQaScanDiff;
  const orchestratorRoot = deps.orchestratorRoot ?? packageRoot();

  for (let round = 1; round <= maxRepairRounds; round += 1) {
    const roundDir = resolve(outputDir, `round-${round}`);
    await mkdir(roundDir, { recursive: true });
    const planPath = resolve(roundDir, "plan.json");
    const diffPath = resolve(roundDir, "pr.diff");
    const plan = {
      repoRoot: globals.repoRoot,
      baseRef,
      headRef,
      slices: [{ id: `pr-${pr.number}`, lane: "match", pathspecs }],
    };
    await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`);
    await writeDiff({ globals, deps, baseRef, headRef, includeWorktree, pathspecs, outputPath: diffPath });

    const preshipResult = await preship(
      {
        plan,
        selection: { kind: "all" },
        baseRef,
        headRef,
        includeWorktree,
        runId: `${runId}-round-${round}`,
        stateDir: outputDir,
        orchestratorRoot,
        dryRun: booleanArg(args, "--dry-run") || globals.dryRunAgents,
        provider: globals.provider,
        model: globals.model,
        thinkingLevel: stringArg(args, "--thinking", globals.thinkingLevel),
        timeoutMs: globals.agentTimeoutSeconds ? globals.agentTimeoutSeconds * 1000 : undefined,
        project: globals.project,
      },
      deps.preshipAgentRunner,
    );
    latestPreshipFindings = await readPreshipFindings(preshipResult.aggregate);

    latestScan = await scanDiff({ repoRoot: globals.repoRoot, orchestratorRoot, diffFile: diffPath, gate: false });
    const scanArtifacts = await writeScanArtifacts(latestScan, roundDir);
    latestScanPath = scanArtifacts.resultPath;
    scanToolError = latestScan.toolError;

    latestQueue = null;
    latestQueuePath = null;
    let qaRepairOutputDir: string | null = null;
    let qaRepairSummaryPath: string | null = null;
    if (latestScan.result && scanArtifacts.resultPath) {
      qaRepairOutputDir = resolve(roundDir, "qa_repair");
      const repairScanResult = mergeRepairScanFindings(latestScan.result, latestPreshipFindings, strictWarnings);
      const repairScanPath = resolve(roundDir, "qa_repair_input_scan.json");
      await writeFile(repairScanPath, `${JSON.stringify(repairScanResult, null, 2)}\n`);
      const repairArgs = new Map<string, string | true>([
        ["--run-id", `${runId}-round-${round}`],
        ["--base-ref", baseRef],
        ["--scan-json", repairScanPath],
        ["--all-scan-files", true],
        ["--output-dir", qaRepairOutputDir],
      ]);
      if (booleanArg(args, "--run-agents")) repairArgs.set("--run-agents", true);
      if (repairWarnings) repairArgs.set("--repair-warnings", true);
      const maxItems = numberArg(args, "--max-items", 0);
      if (maxItems > 0) repairArgs.set("--max-items", String(Math.floor(maxItems)));
      for (const flag of ["--score-check-command", "--build-check-command", "--regression-check-command"] as const) {
        const value = stringArg(args, flag, "");
        if (value) repairArgs.set(flag, value);
      }
      const repair = await qaRepairRunner({ ...globals, stateDir: outputDir, dryRunAgents: globals.dryRunAgents || booleanArg(args, "--dry-run") }, repairArgs, deps.qaRepairAgentRunner);
      latestQueue = repair.queue;
      latestQueuePath = repair.artifacts.queuePath;
      qaRepairSummaryPath = repair.artifacts.summaryPath;
      updateRepairDispositionByPath(repairDispositionByPath, latestQueue);
    }

    const roundScanErrors = latestScan.result?.counts.errors ?? 0;
    const roundScanWarnings = latestScan.result?.counts.warnings ?? 0;
    const roundPreshipRejects = latestPreshipFindings.filter((finding) => finding.verdict === "reject").length;
    const roundPreshipWarnings = latestPreshipFindings.filter((finding) => finding.verdict === "warn").length;
    const roundRepairUnresolved = unresolvedRepairItems(latestQueue, { allowLowerScore: allowLowerScoreRepairs }).length;
    const roundRepairLowerScore = repairItemsWithStatus(latestQueue, "clean_lower_score").length;
    const roundRepairFalsePositive = repairItemsWithStatus(latestQueue, "false_positive").length;
    rounds.push({
      round,
      includeWorktree,
      planPath,
      diffPath,
      qaScanPath: scanArtifacts.resultPath,
      qaScanInvocationPath: scanArtifacts.invocationPath,
      preship: preshipResult.aggregate,
      qaRepairOutputDir,
      qaRepairQueuePath: latestQueuePath,
      qaRepairSummaryPath,
      scanErrors: roundScanErrors,
      scanWarnings: roundScanWarnings,
      preshipRejects: roundPreshipRejects,
      preshipWarnings: roundPreshipWarnings,
      repairUnresolved: roundRepairUnresolved,
      repairLowerScore: roundRepairLowerScore,
      repairFalsePositive: roundRepairFalsePositive,
    });

    if (!booleanArg(args, "--run-agents")) break;
    if (
      !scanToolError &&
      roundScanErrors === 0 &&
      roundRepairUnresolved === 0 &&
      roundPreshipRejects === 0 &&
      (!strictWarnings || (roundScanWarnings === 0 && roundPreshipWarnings === 0))
    ) {
      break;
    }
  }

  const githubCommentsPath = resolve(outputDir, "github_comments.json");
  const commentIntake = booleanArg(args, "--skip-comment-intake")
    ? { comments: [] as unknown[], warnings: ["--skip-comment-intake was set"] }
    : await fetchGithubComments({ globals, deps, repo, prNumber: pr.number, outputPath: githubCommentsPath });
  notes.push(...commentIntake.warnings);

  const scanFindings = latestScan?.result?.findings ?? [];
  const includeWarningComments = strictWarnings || booleanArg(args, "--comment-warnings");
  const commentableFindings = [
    ...commentablesFromPreship(latestPreshipFindings, includeWarningComments),
    ...commentablesFromScan(scanFindings, latestScanPath, includeWarningComments),
    ...commentablesFromRepair(latestQueue, latestQueuePath, { allowLowerScore: allowLowerScoreRepairs }),
  ];
  const comments = booleanArg(args, "--comment-unresolved")
    ? await commentUnresolvedFindings({
        globals,
        deps,
        repo,
        pr,
        findings: commentableFindings,
        existingComments: commentIntake.comments,
        dryRun: booleanArg(args, "--dry-run"),
      })
    : [];
  const commentsPath = resolve(outputDir, "comments.json");
  await writeFile(commentsPath, `${JSON.stringify({ comments, skipped: !booleanArg(args, "--comment-unresolved") }, null, 2)}\n`);

  const localCheck = await runLocalCheck({
    globals,
    deps,
    outputDir,
    runId,
    pr,
    baseRef,
    headRef,
    template: stringArg(args, "--local-check-command", ""),
  });
  const ci = await runCiCheck({
    globals,
    deps,
    repo,
    prNumber: pr.number,
    outputDir,
    wait: booleanArg(args, "--wait-ci"),
    skip: booleanArg(args, "--skip-ci"),
  });

  const latestRound = rounds[rounds.length - 1];
  const qaErrors = latestRound?.scanErrors ?? 0;
  const qaWarnings = latestRound?.scanWarnings ?? 0;
  const preshipRejects = latestPreshipFindings.filter((finding) => finding.verdict === "reject").length;
  const preshipWarnings = latestPreshipFindings.filter((finding) => finding.verdict === "warn").length;
  const repairUnresolved = unresolvedRepairItems(latestQueue, { allowLowerScore: allowLowerScoreRepairs }).length;
  const repairLowerScore = countRepairDispositions(repairDispositionByPath, "clean_lower_score");
  const repairFalsePositive = countRepairDispositions(repairDispositionByPath, "false_positive");
  const verdict = deriveStatus({
    scanToolError,
    strictWarnings,
    allowLowerScoreRepairs,
    qaErrors,
    qaWarnings,
    preshipRejects,
    preshipWarnings,
    repairUnresolved,
    repairLowerScore,
    repairFalsePositive,
    comments,
    ci,
    localCheck,
  });
  const reportPath = resolve(outputDir, "report.md");
  const summaryPath = resolve(outputDir, "summary.json");
  const summary: DraftQaSummary = {
    schema_version: SUMMARY_SCHEMA_VERSION,
    runId,
    pr,
    repo,
    baseRef,
    headRef,
    includeWorktree,
    ...verdict,
    artifacts: {
      outputDir,
      reportPath,
      summaryPath,
      commentsPath,
      githubCommentsPath: booleanArg(args, "--skip-comment-intake") ? null : githubCommentsPath,
      ciSummaryPath: ci.summaryPath ?? null,
      localCheckSummaryPath: localCheck.summaryPath ?? null,
    },
    counts: {
      changedFiles: files.length,
      preshipRejects,
      preshipWarnings,
      qaErrors,
      qaWarnings,
      repairUnresolved,
      repairLowerScore,
      repairFalsePositive,
      commentableFindings: commentableFindings.length,
      commentsPosted: comments.filter((comment) => comment.status === "posted_inline" || comment.status === "posted_top_level").length,
      commentsAlreadyPresent: comments.filter((comment) => comment.status === "already_present").length,
    },
    rounds,
    ci,
    localCheck,
    notes,
  };
  await writeFile(reportPath, renderReport(summary, comments));
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}

export async function prDraftQa(globals: GlobalArgs, args: Map<string, string | true>): Promise<void> {
  const summary = await runDraftPrQa(globals, args);
  console.log(JSON.stringify(summary, null, 2));
  if (summary.exitCode !== 0) process.exitCode = summary.exitCode;
}
