import { fileURLToPath } from "node:url";
import {
  bulletList,
  definePrompt,
  orderedList,
  renderXmlMarkdown,
  section,
  usesContext,
} from "@server/core/agent-catalog/prompt-kit-compat";
import type { PiPromptBundle } from "@server/core/shared/types";
import {
  buildPrFixerKernelContext,
  PR_FIXER_TURN_PROMPT,
  type PrFixerPromptOptions,
} from "./context.js";
export { type PrFixerPromptOptions } from "./context.js";

export const PR_FIXER_SCHEMA_VERSION = "melee_pr_fixer_result_v1";

export type PrFixerOutcome = "fixed" | "needs_rework" | "blocked" | "manual_review_required";
export type PrFixerDisposition = "fixed_source" | "fixed_by_minimal_revert" | "left_with_evidence" | "manual_review" | "false_positive";

export interface PrFixerAgentResult {
  schema_version: typeof PR_FIXER_SCHEMA_VERSION;
  pr: {
    number: number | null;
    branch: string | null;
    title: string | null;
  };
  outcome: PrFixerOutcome;
  summary: string;
  edits: string[];
  validation: Array<{
    command: string;
    status: "passed" | "failed" | "not_run";
    artifact_path: string | null;
    notes: string;
  }>;
  comment_dispositions: Array<{
    comment_id: string | null;
    file: string | null;
    line: number | null;
    disposition: PrFixerDisposition;
    evidence: string;
  }>;
  remaining_items: Array<{
    comment_id: string | null;
    file: string | null;
    line: number | null;
    reason: string;
  }>;
  manual_review_notes: string[];
  risks: string[];
}

function agentFilePath(): string {
  return fileURLToPath(new URL("./agent.ts", import.meta.url));
}

export const prompt = definePrompt({
  id: "melee.pr-fixer.system",
  title: "Melee PR Fixer System Prompt",
  archetype: "workflow",
  nodes: [
    section("goal", [
      bulletList([
        "Resolve maintainer PR comments, review-thread feedback, and PR reviewer findings on an opened PR branch.",
        "Make the smallest source edits that address the actual review concern.",
        "Preserve exact matches and useful worker output when they remain reviewable and standards-compliant.",
        "Do not preserve exactness by keeping generated, fake, brittle, or maintainer-rejected source shapes.",
        "If a comment cannot be safely resolved, return a concrete manual-review note instead of hiding the issue.",
      ]),
    ]),
    section("context_contract", [
      usesContext("pr-fixer-context", {
        instructions: [
          "Use the injected PR identity, branch, comments, reviewer findings, diff context, validation artifacts, available tools, decomp standards, and output schema as the authoritative task packet.",
          "Fix only files and lines connected to the supplied PR comments, reviewer findings, or validation failures.",
        ],
      }),
      usesContext("standard-examples", {
        instructions: ["Use the injected targeted standard examples only when a comment or finding names the relevant standard, rule, or source pattern."],
      }),
    ]),
    section("definition_of_done", [
      "Return exactly one JSON object following the injected output contract.",
      bulletList([
        "Every actionable PR comment or reviewer finding in `<pr_fixer_context>` has a disposition row.",
        "Fixed items include source evidence and validation evidence.",
        "Unfixed items are listed in `remaining_items[]` with a concrete blocker.",
        "Any item that needs human judgment has a specific `manual_review_notes[]` entry that can become a PR response.",
        "You did not edit unrelated files or opportunistically rewrite nearby code.",
        "You ran the most relevant validation available from the attached tools and reported what passed, failed, or was not run.",
      ]),
    ]),
    section("rules", [
      orderedList([
        "Return JSON only; no Markdown outside the JSON object.",
        "Fix only files and lines connected to the supplied PR comments, reviewer findings, or validation failures.",
        "Treat human maintainer comments as stronger evidence than local matching convenience.",
        "Use `<standard_examples>` only when a comment or finding names the relevant standard, rule, or source pattern.",
        "Do not delete useful implementation work just to silence a comment when an idiomatic source repair exists.",
        "Use `fixed_by_minimal_revert` only for the smallest hunk that cannot be made reviewable.",
        "If exactness depends on a non-banned but reviewer-sensitive shape, keep only the smallest match-preserving form and record `left_with_evidence` plus a risk for reviewer judgment.",
        "If a comment is stale or false-positive, leave the source minimal, mark `false_positive`, and explain the evidence gap.",
        "Do not post comments, mark GitHub threads resolved, or mutate PR records directly. Return the result; the runner owns remote state.",
        "Do not use destructive git commands or reset unrelated user work.",
      ]),
    ]),
    section("workflow", [
      section("phase", [
        bulletList([
          "Read the PR identity, branch, comments, review findings, diff context, and validation artifacts.",
          "Group related comments by file and source concern.",
        ]),
      ], { attrs: { id: "1", name: "read_feedback" } }),
      section("phase", [
        bulletList([
          "Inspect the relevant source and nearby game idioms before editing.",
          "Use past PR evidence and standards examples only when they match the comment or rule.",
        ]),
      ], { attrs: { id: "2", name: "inspect_source" } }),
      section("phase", [
        bulletList([
          "Resolve each actionable item with the smallest edit that addresses the reviewer concern.",
          "Prefer source-quality repairs over score-preserving tactics.",
          "Keep a disposition trail for every comment/finding.",
        ]),
      ], { attrs: { id: "3", name: "repair_feedback" } }),
      section("phase", [
        bulletList([
          "Run focused lint, compile, score, or PR-diff checks available to you.",
          "Record each command and artifact path.",
        ]),
      ], { attrs: { id: "4", name: "validate" } }),
      section("phase", [
        "Return one compact JSON object with edits, dispositions, validation, remaining items, manual-review notes, and risks.",
      ], { attrs: { id: "5", name: "report" } }),
    ]),
  ],
});

export function renderSystemPrompt(): string {
  return renderXmlMarkdown(prompt);
}

function promptFilePath(): string {
  return fileURLToPath(new URL("./prompt.ts", import.meta.url));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function validationRows(value: unknown): PrFixerAgentResult["validation"] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((row) => {
      const status = stringValue(row.status);
      return {
        command: stringValue(row.command),
        status: status === "passed" || status === "failed" || status === "not_run" ? status : "not_run",
        artifact_path: nullableString(row.artifact_path ?? row.artifactPath),
        notes: stringValue(row.notes),
      };
    });
}

function dispositionRows(value: unknown): PrFixerAgentResult["comment_dispositions"] {
  const allowed = new Set<PrFixerDisposition>(["fixed_source", "fixed_by_minimal_revert", "left_with_evidence", "manual_review", "false_positive"]);
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((row) => {
      const disposition = stringValue(row.disposition) as PrFixerDisposition;
      return {
        comment_id: nullableString(row.comment_id ?? row.commentId),
        file: nullableString(row.file),
        line: nullableNumber(row.line),
        disposition: allowed.has(disposition) ? disposition : "manual_review",
        evidence: stringValue(row.evidence),
      };
    });
}

function remainingRows(value: unknown): PrFixerAgentResult["remaining_items"] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((row) => ({
      comment_id: nullableString(row.comment_id ?? row.commentId),
      file: nullableString(row.file),
      line: nullableNumber(row.line),
      reason: stringValue(row.reason),
    }));
}

export function validatePrFixerAgentResult(value: unknown): { result: PrFixerAgentResult | null; errors: string[] } {
  const errors: string[] = [];
  if (!isRecord(value)) return { result: null, errors: ["result is not an object"] };
  if (value.schema_version !== PR_FIXER_SCHEMA_VERSION) errors.push(`schema_version must be ${PR_FIXER_SCHEMA_VERSION}`);
  const outcome = stringValue(value.outcome);
  if (!["fixed", "needs_rework", "blocked", "manual_review_required"].includes(outcome)) errors.push("outcome is not a valid PR fixer outcome");
  const summary = stringValue(value.summary);
  if (!summary) errors.push("summary is required");
  const pr = isRecord(value.pr) ? value.pr : {};
  const result: PrFixerAgentResult = {
    schema_version: PR_FIXER_SCHEMA_VERSION,
    pr: {
      number: nullableNumber(pr.number),
      branch: nullableString(pr.branch),
      title: nullableString(pr.title),
    },
    outcome: outcome as PrFixerOutcome,
    summary,
    edits: stringArray(value.edits),
    validation: validationRows(value.validation),
    comment_dispositions: dispositionRows(value.comment_dispositions),
    remaining_items: remainingRows(value.remaining_items),
    manual_review_notes: stringArray(value.manual_review_notes),
    risks: stringArray(value.risks),
  };
  if (result.comment_dispositions.length === 0 && result.remaining_items.length === 0) {
    errors.push("comment_dispositions or remaining_items must describe the reviewed feedback");
  }
  return { result: errors.length ? null : result, errors };
}

export function prFixerPrompt(options: PrFixerPromptOptions): PiPromptBundle {
  const systemTemplatePath = agentFilePath();
  const userTemplatePath = promptFilePath();
  return {
    systemPrompt: renderSystemPrompt(),
    userPrompt: PR_FIXER_TURN_PROMPT,
    systemTemplatePath,
    userTemplatePath,
    kernelContext: buildPrFixerKernelContext(options),
  };
}
