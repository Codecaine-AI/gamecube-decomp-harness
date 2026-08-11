import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import type { GlobalArgs } from "@server/core/project-registry/runtime-options.js";
import { runCommand, type CommandResult } from "@server/infrastructure/shell";
import type { DraftPrMetadata, DraftPrQaDeps } from "./jobs/pr-draft-qa.js";
import type { LedgerEntryDisposition, LedgerEntryTier, LedgerMatchContext } from "./review-ledger.js";

export const COMMENT_MARKER_PREFIX = "decomp-orchestrator:pr-draft-qa";

export interface CommentableFinding {
  source: "preship" | "review_lint" | "qa_repair" | "llm_qa";
  severity: "error" | "warning" | "reject" | "blocked";
  file: string | null;
  line: number | null;
  ruleId: string | null;
  standardId: string | null;
  message: string;
  suggestedFix: string | null;
  artifactPath: string | null;
  /** True for advisory lint findings that defer to reviewer judgment (detail.llm_review). */
  llmReview?: boolean;
  tier?: LedgerEntryTier;
  disposition?: LedgerEntryDisposition;
  evidence?: string | null;
  matchContext?: LedgerMatchContext | null;
}

export interface PostedCommentRecord {
  marker: string;
  markers?: string[];
  finding: CommentableFinding;
  findings?: CommentableFinding[];
  status: "posted_inline" | "posted_top_level" | "already_present" | "dry_run" | "failed";
  url?: string | null;
  error?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function nullableStringValue(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
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

export function stableHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export function commentMarker(finding: CommentableFinding): string {
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

/** Renders free-form (AI-generated) prose as a markdown block quote, preserving line breaks. */
function blockQuote(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => (line ? `> ${line}` : ">"))
    .join("\n");
}

export function renderCommentBody(finding: CommentableFinding, marker: string, prNumber: number): string {
  const metadata = [
    `- Source: ${finding.source}`,
    `- Severity: ${finding.severity}`,
  ];
  if (finding.ruleId) metadata.push(`- Rule: \`${finding.ruleId}\``);
  if (finding.standardId) metadata.push(`- Standard: \`${finding.standardId}\``);
  if (finding.artifactPath) metadata.push(`- Artifact: \`${finding.artifactPath}\``);
  const lines = [
    marker,
    "Automated draft PR QA could not fully clear this finding.",
    "",
    ...metadata,
  ];
  if (finding.llmReview) {
    lines.push(
      "",
      "This is a requirement check that awaits reviewer judgment, not an optional suggestion. The deterministic scanner flagged it as advisory (llm_review) because a human reviewer must decide whether the retained shape is acceptable. Resolve it by fixing the source or by recording an explicit reviewer decision that it is acceptable.",
    );
  }
  lines.push("", blockQuote(finding.message));
  if (finding.suggestedFix) lines.push("", "Suggested follow-up:", "", blockQuote(finding.suggestedFix));
  lines.push("", `After fixing or intentionally accepting this, rerun \`make pr-draft-qa PR=${prNumber}\`.`);
  return `${lines.join("\n")}\n`;
}

export function renderMatchContext(context: LedgerMatchContext | null | undefined): string {
  const header = context?.function ? `**Match context:** in \`${context.function}\`` : "**Match context:**";
  const bullets: string[] = [];
  if (context?.exact === true) {
    bullets.push("- **exact match (100%)**; changing this shape risks the match");
  } else if (context?.fuzzy_percent !== null && context?.fuzzy_percent !== undefined) {
    bullets.push(`- improvement-lane (fuzzy ${context.fuzzy_percent}%); safe to change at some score cost`);
  } else {
    bullets.push("- match status unavailable");
  }
  if (context?.repair_reverted) {
    bullets.push(`- an automated fix attempt was **reverted**: ${context.repair_reverted}`);
  }
  return [header, "", ...bullets].join("\n");
}

function findingRule(finding: CommentableFinding): string {
  return finding.ruleId ?? finding.standardId ?? "review";
}

export function renderGroupedCommentBody(findings: CommentableFinding[], markers: string[]): string {
  const sorted = [...findings].sort((left, right) => (left.line ?? Number.MAX_SAFE_INTEGER) - (right.line ?? Number.MAX_SAFE_INTEGER));
  const lead = sorted[0];
  if (!lead) return `${markers.join("")}\n`;
  const leadLine = lead.line;
  const extraLines = [...new Set(
    sorted
      .map((finding) => finding.line)
      .filter((line): line is number => line !== null && line !== leadLine),
  )].sort((left, right) => left - right);
  const lines = [
    `**\`${findingRule(lead)}\`**`,
    "",
    blockQuote(lead.message),
  ];
  if (extraLines.length > 0) {
    lines.push("", `Also at ${extraLines.length === 1 ? "line" : "lines"}: ${extraLines.join(", ")}`);
  }
  lines.push("", renderMatchContext(lead.matchContext), "", markers.join(""));
  return `${lines.join("\n")}\n`;
}

function renderTierTwoBody(findings: CommentableFinding[], markers: string[]): string {
  const lines = [
    "<details>",
    "<summary>Already investigated by the repair pipeline — kept as-is with evidence</summary>",
    "",
  ];
  for (const finding of findings) {
    const location = finding.file ? `${finding.file}${finding.line ? `:${finding.line}` : ""}` : "top-level";
    lines.push(`**\`${findingRule(finding)}\`** at \`${location}\``, "", blockQuote(finding.message));
    if (finding.evidence) lines.push("", "Evidence:", "", blockQuote(finding.evidence));
    lines.push("");
  }
  lines.push(markers.join(""), "", "</details>");
  return `${lines.join("\n")}\n`;
}

export function markersFromComments(comments: unknown[]): Set<string> {
  const markers = new Set<string>();
  const regex = new RegExp(`<!--\\s*${COMMENT_MARKER_PREFIX}:[^>]+-->`, "g");
  for (const comment of comments) {
    const body = isRecord(comment) ? stringValue(comment.body) : "";
    for (const match of body.matchAll(regex)) markers.add(match[0]);
  }
  return markers;
}

export async function fetchGithubComments(params: {
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

export async function postTopLevelComment(params: {
  globals: GlobalArgs;
  deps: DraftPrQaDeps;
  repo: string;
  prNumber: number;
  body: string;
}): Promise<{ status: "posted_top_level" | "failed"; url?: string | null; error?: string }> {
  const result = await runExternal(params.deps, params.globals.repoRoot, ["gh", "api", `repos/${params.repo}/issues/${params.prNumber}/comments`, "-f", `body=${params.body}`]);
  if (result.exitCode !== 0) return { status: "failed", error: result.stderr.trim() || result.stdout.trim() };
  try {
    const parsed = parseJsonOutput(result.stdout || "{}", "gh issue comment");
    return { status: "posted_top_level", url: isRecord(parsed) ? nullableStringValue(parsed.html_url) : null };
  } catch (error) {
    return { status: "failed", error: error instanceof Error ? error.message : String(error) };
  }
}

async function postInlineComment(params: {
  globals: GlobalArgs;
  deps: DraftPrQaDeps;
  repo: string;
  pr: DraftPrMetadata;
  finding: CommentableFinding;
  body: string;
}): Promise<{ status: "posted_inline" | "failed"; url?: string | null; error?: string }> {
  if (!params.finding.file || !params.finding.line || params.finding.line <= 0) {
    return { status: "failed", error: "Finding has no reliable inline anchor." };
  }
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
  if (inline.exitCode !== 0) {
    return { status: "failed", error: inline.stderr.trim() || inline.stdout.trim() || `gh review comment failed (${inline.exitCode})` };
  }
  try {
    const parsed = parseJsonOutput(inline.stdout || "{}", "gh review comment");
    return { status: "posted_inline", url: isRecord(parsed) ? nullableStringValue(parsed.html_url) : null };
  } catch (error) {
    return { status: "failed", error: error instanceof Error ? error.message : String(error) };
  }
}

export async function postFindingComment(params: {
  globals: GlobalArgs;
  deps: DraftPrQaDeps;
  repo: string;
  pr: DraftPrMetadata;
  finding: CommentableFinding;
  body: string;
}): Promise<{ status: "posted_inline" | "posted_top_level" | "failed"; url?: string | null; error?: string }> {
  const inline = await postInlineComment(params);
  if (inline.status === "posted_inline") return inline;
  return postTopLevelComment({ globals: params.globals, deps: params.deps, repo: params.repo, prNumber: params.pr.number, body: params.body });
}

export async function commentUnresolvedFindings(params: {
  globals: GlobalArgs;
  deps: DraftPrQaDeps;
  repo: string;
  pr: DraftPrMetadata;
  findings: CommentableFinding[];
  existingComments: unknown[];
  dryRun: boolean;
  allowInline?: boolean;
  sleep?: (ms: number) => Promise<void>;
}): Promise<PostedCommentRecord[]> {
  const existingMarkers = markersFromComments(params.existingComments);
  const records: PostedCommentRecord[] = [];
  const tierOneGroups = new Map<string, Array<{ finding: CommentableFinding; marker: string }>>();
  const tierTwo: Array<{ finding: CommentableFinding; marker: string }> = [];
  for (const finding of params.findings) {
    const tier = finding.tier ?? 1;
    if (tier === 3) continue;
    const marked = { finding, marker: commentMarker(finding) };
    if (tier === 2) {
      tierTwo.push(marked);
      continue;
    }
    const key = `${finding.file ?? ""}\0${finding.ruleId ?? finding.standardId ?? ""}`;
    const group = tierOneGroups.get(key) ?? [];
    group.push(marked);
    tierOneGroups.set(key, group);
  }

  const fallbackGroups: Array<{
    finding: CommentableFinding;
    findings: CommentableFinding[];
    marker: string;
    markers: string[];
    body: string;
  }> = [];
  for (const rows of tierOneGroups.values()) {
    rows.sort((left, right) => (left.finding.line ?? Number.MAX_SAFE_INTEGER) - (right.finding.line ?? Number.MAX_SAFE_INTEGER));
    const finding = rows[0]!.finding;
    const findings = rows.map((row) => row.finding);
    const markers = [...new Set(rows.map((row) => row.marker))];
    const marker = markers[0]!;
    if (markers.every((candidate) => existingMarkers.has(candidate))) {
      records.push({ marker, markers, finding, findings, status: "already_present" });
      continue;
    }
    const body = renderGroupedCommentBody(findings, markers);
    if (params.dryRun) {
      records.push({ marker, markers, finding, findings, status: "dry_run" });
      continue;
    }
    if (params.allowInline === false || !finding.file || !finding.line || finding.line <= 0) {
      fallbackGroups.push({ finding, findings, marker, markers, body });
      continue;
    }
    try {
      const posted = await postInlineComment({ ...params, finding, body });
      if (posted.status === "posted_inline") {
        records.push({ marker, markers, finding, findings, ...posted });
        for (const candidate of markers) existingMarkers.add(candidate);
      } else {
        fallbackGroups.push({ finding, findings, marker, markers, body });
      }
    } catch {
      fallbackGroups.push({ finding, findings, marker, markers, body });
    }
  }

  const delay = params.sleep ?? ((ms: number) => new Promise<void>((resolveDelay) => setTimeout(resolveDelay, ms)));
  const postIssueWithRetry = async (body: string) => {
    const attempt = async () => {
      try {
        return await postTopLevelComment({
          globals: params.globals,
          deps: params.deps,
          repo: params.repo,
          prNumber: params.pr.number,
          body,
        });
      } catch (error) {
        return { status: "failed" as const, error: error instanceof Error ? error.message : String(error) };
      }
    };
    let posted = await attempt();
    if (posted.status === "failed" && /too quickly/i.test(posted.error ?? "")) {
      await delay(90_000);
      posted = await attempt();
    }
    return posted;
  };

  for (let offset = 0; offset < fallbackGroups.length; offset += 12) {
    const chunk = fallbackGroups.slice(offset, offset + 12);
    const body = chunk.map((group) => group.body.trim()).join("\n\n---\n\n");
    const markers = chunk.flatMap((group) => group.markers);
    const findings = chunk.flatMap((group) => group.findings);
    const finding = chunk[0]!.finding;
    const marker = chunk[0]!.marker;
    const posted = await postIssueWithRetry(`${body}\n`);
    records.push({ marker, markers, finding, findings, ...posted });
    if (posted.status !== "failed") {
      for (const candidate of markers) existingMarkers.add(candidate);
    }
  }

  if (tierTwo.length > 0) {
    const markers = [...new Set(tierTwo.map((row) => row.marker))];
    const findings = tierTwo.map((row) => row.finding);
    const finding = findings[0]!;
    const marker = markers[0]!;
    if (markers.every((candidate) => existingMarkers.has(candidate))) {
      records.push({ marker, markers, finding, findings, status: "already_present" });
    } else if (params.dryRun) {
      records.push({ marker, markers, finding, findings, status: "dry_run" });
    } else {
      const posted = await postIssueWithRetry(renderTierTwoBody(findings, markers));
      records.push({ marker, markers, finding, findings, ...posted });
      if (posted.status !== "failed") {
        for (const candidate of markers) existingMarkers.add(candidate);
      }
    }
  }
  return records;
}
