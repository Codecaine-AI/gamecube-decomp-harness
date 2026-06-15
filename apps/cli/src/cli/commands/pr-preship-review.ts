/**
 * Pre-ship adversarial PR review gate (QA ship gate L3).
 *
 * Runs the pr-review agent in preship mode over each planned PR slice diff
 * (from a saved `pr-split-plan --json` output), aggregates the verdicts, and
 * fails closed: any "reject" verdict — or any infrastructure failure (git,
 * lint tooling crash, agent failure, unparseable/invalid output) — exits 1.
 * This gate is low-frequency (one agent call per slice, at handoff time) and
 * load-bearing, so it never silently approves.
 *
 * Artifacts per slice land under
 * <state-dir>/preship_reviews/<run-id>/<slice-id>/:
 *   slice.diff, lint.json, prompt_system.md, prompt_user.md, review.json,
 *   review.md (human-readable verdict + findings table).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  prPreshipReviewPrompt,
  validatePreshipReview,
  type PreshipReview,
} from "@decomp-orchestrator/agents/pr-review";
import { parseJsonObject, runPiAgent, type PiRunOptions } from "@decomp-orchestrator/agents/runtime";
import { qaGatePassed, runQaScanDiff, type QaScanInvocation } from "@decomp-orchestrator/core/qa";
import { runCommand } from "@decomp-orchestrator/core/shell";
import type { PiRunResult } from "@decomp-orchestrator/core/types";
import { packageRoot } from "@decomp-orchestrator/knowledge";
import { booleanArg, stringArg, type GlobalArgs } from "../args.js";

/** Injectable agent runner; the default is the in-process Pi runtime the other CLI agent commands use. */
export type PreshipAgentRunner = (options: PiRunOptions) => Promise<PiRunResult>;

export type PreshipSliceVerdictKind = "approve" | "reject" | "error" | "dry_run" | "skipped_local";

export interface PreshipSliceOutcome {
  id: string;
  verdict: PreshipSliceVerdictKind;
  rejectFindings: number;
  warnFindings: number;
  reviewPath: string | null;
  error?: string;
}

export interface PreshipAggregate {
  runId: string;
  dryRun: boolean;
  slices: Array<{
    id: string;
    verdict: PreshipSliceVerdictKind;
    rejectFindings: number;
    warnFindings: number;
    reviewPath: string | null;
    error?: string;
  }>;
  allApproved: boolean;
}

interface PreshipPlanSlice {
  id: string;
  lane: string | null;
  pathspecs: string[];
}

interface PreshipPlan {
  repoRoot: string;
  baseRef: string;
  headRef: string;
  slices: PreshipPlanSlice[];
}

export interface PreshipReviewRunOptions {
  plan: PreshipPlan;
  /** "all" reviews every shipping slice; otherwise one explicit slice id. */
  selection: { kind: "all" } | { kind: "slice"; id: string };
  baseRef: string;
  headRef: string;
  runId: string;
  stateDir: string;
  orchestratorRoot: string;
  dryRun: boolean;
  provider: string;
  model: string;
  thinkingLevel: string;
  timeoutMs?: number;
  project?: GlobalArgs["project"];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parsePreshipPlan(raw: unknown, planPath: string): PreshipPlan {
  if (!isRecord(raw)) throw new Error(`${planPath} is not a JSON object; expected saved pr-split-plan --json output`);
  if (typeof raw.repoRoot !== "string" || !raw.repoRoot) throw new Error(`${planPath} is missing repoRoot`);
  if (typeof raw.baseRef !== "string" || !raw.baseRef) throw new Error(`${planPath} is missing baseRef`);
  if (typeof raw.headRef !== "string" || !raw.headRef) throw new Error(`${planPath} is missing headRef`);
  if (!Array.isArray(raw.slices) || raw.slices.length === 0) throw new Error(`${planPath} has no slices`);
  const slices = raw.slices.map((value, index) => {
    if (!isRecord(value) || typeof value.id !== "string" || !value.id) {
      throw new Error(`${planPath} slices[${index}] is missing an id`);
    }
    const pathspecs = Array.isArray(value.pathspecs)
      ? value.pathspecs.filter((item): item is string => typeof item === "string" && item.length > 0)
      : [];
    const filePaths = Array.isArray(value.files)
      ? value.files
          .map((file) => (isRecord(file) && typeof file.path === "string" ? file.path : ""))
          .filter((path) => path.length > 0)
      : [];
    const resolved = pathspecs.length > 0 ? pathspecs : filePaths;
    if (resolved.length === 0) throw new Error(`${planPath} slice "${value.id}" has no pathspecs or files`);
    return {
      id: value.id,
      lane: typeof value.lane === "string" ? value.lane : null,
      pathspecs: resolved,
    };
  });
  return { repoRoot: raw.repoRoot, baseRef: raw.baseRef, headRef: raw.headRef, slices };
}

/**
 * Exit contract: 1 when any slice verdict is "reject", any finding verdict is
 * "reject" (rejectFindings > 0), or any slice hit an infrastructure error
 * (fail-closed). Dry runs exit 0 — nothing was approved, and allApproved says so.
 */
export function aggregatePreshipOutcomes(runId: string, outcomes: PreshipSliceOutcome[], dryRun: boolean): { aggregate: PreshipAggregate; exitCode: number } {
  const reviewed = outcomes.filter((outcome) => outcome.verdict !== "skipped_local" && outcome.verdict !== "dry_run");
  const blocked = outcomes.some((outcome) => outcome.verdict === "reject" || outcome.verdict === "error" || outcome.rejectFindings > 0);
  const allApproved = !dryRun && reviewed.length > 0 && reviewed.every((outcome) => outcome.verdict === "approve" && outcome.rejectFindings === 0);
  return {
    aggregate: { runId, dryRun, slices: outcomes, allApproved },
    exitCode: blocked ? 1 : 0,
  };
}

function lintNoteFromInvocation(invocation: QaScanInvocation): string | undefined {
  if (invocation.toolError === null) return undefined;
  return `Deterministic lint (review_lint scan_diff) was unavailable for this slice: ${invocation.toolError}. Review the diff with extra suspicion; no L1/L2 findings were available.`;
}

function findingCounts(review: PreshipReview): { rejectFindings: number; warnFindings: number } {
  let rejectFindings = 0;
  let warnFindings = 0;
  for (const finding of review.findings) {
    if (finding.verdict === "reject") rejectFindings += 1;
    else warnFindings += 1;
  }
  return { rejectFindings, warnFindings };
}

function reviewMarkdown(sliceId: string, review: PreshipReview, lintNote: string | undefined): string {
  const lines = [
    `# Pre-ship review: ${sliceId}`,
    "",
    `Verdict: **${review.slice_verdict}**`,
    `Confidence: ${review.confidence}`,
    "",
    `Summary: ${review.summary}`,
  ];
  if (lintNote) lines.push("", `> ${lintNote}`);
  lines.push("", `## Findings (${review.findings.length})`, "");
  if (review.findings.length === 0) {
    lines.push("No findings.");
  } else {
    lines.push("| Verdict | File | Line | Standard | Rationale | Suggested fix |", "| --- | --- | --- | --- | --- | --- |");
    for (const finding of review.findings) {
      const cell = (value: string | number | null) => String(value ?? "-").replaceAll("|", "\\|").replaceAll("\n", " ");
      lines.push(
        `| ${finding.verdict} | ${cell(finding.file)} | ${cell(finding.line)} | ${cell(finding.standard_id)} | ${cell(finding.rationale)} | ${cell(finding.suggested_fix)} |`,
      );
    }
  }
  lines.push("");
  return lines.join("\n");
}

async function sliceDiff(repoRoot: string, baseRef: string, headRef: string, pathspecs: string[], outputPath: string): Promise<string> {
  const result = await runCommand(repoRoot, ["git", "-C", repoRoot, "diff", `--output=${outputPath}`, baseRef, headRef, "--", ...pathspecs]);
  if (result.exitCode !== 0) {
    throw new Error(`git diff ${baseRef} ${headRef} failed (exit ${result.exitCode}): ${result.stderr.trim() || result.stdout.trim()}`);
  }
  return readFile(outputPath, "utf8").catch(() => "");
}

async function reviewOneSlice(slice: PreshipPlanSlice, options: PreshipReviewRunOptions, runner: PreshipAgentRunner): Promise<PreshipSliceOutcome> {
  const reviewDir = resolve(options.stateDir, "preship_reviews", options.runId, slice.id);
  await mkdir(reviewDir, { recursive: true });
  const repoRoot = options.plan.repoRoot;

  const diffPath = resolve(reviewDir, "slice.diff");
  const diff = await sliceDiff(repoRoot, options.baseRef, options.headRef, slice.pathspecs, diffPath);

  if (!diff.trim()) {
    const review: PreshipReview = {
      schema_version: "melee_pr_preship_review_v1",
      slice_id: slice.id,
      slice_verdict: "approve",
      findings: [],
      summary: `Empty diff for ${options.baseRef}..${options.headRef} over the slice pathspecs; nothing to review.`,
      confidence: 1,
    };
    const reviewPath = resolve(reviewDir, "review.json");
    await writeFile(reviewPath, `${JSON.stringify({ run_id: options.runId, slice_id: slice.id, agent_skipped: "empty diff", review }, null, 2)}\n`);
    await writeFile(resolve(reviewDir, "review.md"), reviewMarkdown(slice.id, review, undefined));
    return { id: slice.id, verdict: "approve", rejectFindings: 0, warnFindings: 0, reviewPath };
  }

  // L1/L2 lint findings (even warnings) ride along as deterministic evidence.
  // The python tool may not exist yet; that is a prompt note, not a gate skip.
  const lint = await runQaScanDiff({
    repoRoot,
    orchestratorRoot: options.orchestratorRoot,
    diffFile: diffPath,
  });
  await writeFile(
    resolve(reviewDir, "lint.json"),
    `${JSON.stringify({ command: lint.command, exitCode: lint.exitCode, toolError: lint.toolError, gatePassed: qaGatePassed(lint), result: lint.result }, null, 2)}\n`,
  );
  const lintNote = lintNoteFromInvocation(lint);

  const prompt = prPreshipReviewPrompt({
    sliceId: slice.id,
    sliceDiff: diff,
    lintFindings: lint.result,
    lintUnavailableNote: lintNote,
  });
  await writeFile(resolve(reviewDir, "prompt_system.md"), prompt.systemPrompt);
  await writeFile(resolve(reviewDir, "prompt_user.md"), prompt.userPrompt);

  if (options.dryRun) {
    return { id: slice.id, verdict: "dry_run", rejectFindings: 0, warnFindings: 0, reviewPath: null };
  }

  const result = await runner({
    role: "pr-review",
    cwd: repoRoot,
    prompt,
    outputDir: reviewDir,
    dryRun: false,
    provider: options.provider,
    model: options.model,
    thinkingLevel: options.thinkingLevel,
    timeoutMs: options.timeoutMs,
    // Diff-only review: the reviewer judges the diff and loaded evidence, no tools.
    toolProfile: { replace: [] },
    toolContext: { stateDir: options.stateDir, project: options.project },
  });
  if (result.failed || result.providerError) {
    return {
      id: slice.id,
      verdict: "error",
      rejectFindings: 0,
      warnFindings: 0,
      reviewPath: null,
      error: `pr-review agent failed: ${result.error ?? result.providerError ?? "unknown failure"} (output: ${result.outputPath})`,
    };
  }
  const parsed = parseJsonObject(result.rawText);
  if (!parsed.object) {
    return {
      id: slice.id,
      verdict: "error",
      rejectFindings: 0,
      warnFindings: 0,
      reviewPath: null,
      error: `pr-review agent output was not a JSON object: ${parsed.error ?? "unknown parse error"} (output: ${result.outputPath})`,
    };
  }
  const validated = validatePreshipReview(parsed.object);
  if (!validated.review) {
    return {
      id: slice.id,
      verdict: "error",
      rejectFindings: 0,
      warnFindings: 0,
      reviewPath: null,
      error: `pr-review agent output failed schema validation: ${validated.errors.join("; ")} (output: ${result.outputPath})`,
    };
  }

  const review = validated.review;
  const counts = findingCounts(review);
  const reviewPath = resolve(reviewDir, "review.json");
  await writeFile(
    reviewPath,
    `${JSON.stringify(
      {
        run_id: options.runId,
        slice_id: slice.id,
        base_ref: options.baseRef,
        head_ref: options.headRef,
        session_id: result.sessionId,
        agent_output_path: result.outputPath,
        lint_tool_error: lint.toolError,
        review,
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(resolve(reviewDir, "review.md"), reviewMarkdown(slice.id, review, lintNote));
  return { id: slice.id, verdict: review.slice_verdict, ...counts, reviewPath };
}

export async function runPreshipReview(
  options: PreshipReviewRunOptions,
  runner: PreshipAgentRunner = runPiAgent,
): Promise<{ aggregate: PreshipAggregate; exitCode: number }> {
  let selected: Array<{ slice: PreshipPlanSlice; skippedLocal: boolean }>;
  if (options.selection.kind === "slice") {
    const id = options.selection.id;
    const slice = options.plan.slices.find((candidate) => candidate.id === id);
    if (!slice) {
      const known = options.plan.slices.map((candidate) => candidate.id).join(", ");
      throw new Error(`Slice "${id}" is not in the plan. Known slices: ${known}`);
    }
    selected = [{ slice, skippedLocal: false }];
  } else {
    // Only shipping slices gate the handoff; local-only slices never ship, so
    // --all skips them (review one explicitly with --slice if needed).
    selected = options.plan.slices.map((slice) => ({ slice, skippedLocal: slice.lane === "local" }));
  }

  const outcomes: PreshipSliceOutcome[] = [];
  for (const { slice, skippedLocal } of selected) {
    if (skippedLocal) {
      outcomes.push({ id: slice.id, verdict: "skipped_local", rejectFindings: 0, warnFindings: 0, reviewPath: null });
      continue;
    }
    try {
      outcomes.push(await reviewOneSlice(slice, options, runner));
    } catch (error) {
      // Fail closed: infrastructure failures block the gate.
      outcomes.push({
        id: slice.id,
        verdict: "error",
        rejectFindings: 0,
        warnFindings: 0,
        reviewPath: null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return aggregatePreshipOutcomes(options.runId, outcomes, options.dryRun);
}

export async function prPreshipReview(globals: GlobalArgs, args: Map<string, string | true>): Promise<void> {
  const planPath = stringArg(args, "--plan", "");
  if (!planPath) throw new Error("--plan <path> is required (saved pr-split-plan --json output)");
  const planRaw = JSON.parse(await readFile(resolve(globals.repoRoot, planPath), "utf8")) as unknown;
  const plan = parsePreshipPlan(planRaw, planPath);

  const sliceId = stringArg(args, "--slice", "");
  const all = booleanArg(args, "--all");
  if (!sliceId && !all) throw new Error("Pass --all to review every shipping slice or --slice <id> for one slice.");
  if (sliceId && all) throw new Error("--slice and --all are mutually exclusive.");

  const { aggregate, exitCode } = await runPreshipReview({
    plan,
    selection: sliceId ? { kind: "slice", id: sliceId } : { kind: "all" },
    baseRef: stringArg(args, "--base", plan.baseRef),
    headRef: stringArg(args, "--head", plan.headRef),
    runId: stringArg(args, "--run-id", "manual"),
    stateDir: globals.stateDir,
    orchestratorRoot: packageRoot(),
    dryRun: booleanArg(args, "--dry-run") || globals.dryRunAgents,
    provider: globals.provider,
    model: globals.model,
    thinkingLevel: stringArg(args, "--thinking", globals.thinkingLevel),
    timeoutMs: globals.agentTimeoutSeconds ? globals.agentTimeoutSeconds * 1000 : undefined,
    project: globals.project,
  });
  console.log(JSON.stringify(aggregate, null, 2));
  if (exitCode !== 0) process.exitCode = exitCode;
}
