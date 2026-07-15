import { fileURLToPath } from "node:url";
import {
  bulletList,
  definePrompt,
  item,
  orderedList,
  renderXmlMarkdown,
  section,
  usesContext,
} from "@codecaine-ai/prompt-kit";
import type { PiPromptBundle } from "@server/core/shared/types";
import {
  buildQaRepairKernelContext,
  QA_REPAIR_TURN_PROMPT,
  type QaRepairPromptOptions,
} from "./context.js";
export { type QaRepairPromptOptions } from "./context.js";

export const QA_REPAIR_AGENT_SCHEMA_VERSION = "melee_qa_repair_result_v1";

export type QaRepairAgentOutcome = "fixed" | "needs_rework" | "blocked" | "false_positive";
export type QaRepairScoreImpact = "same_match" | "lower_score" | "unknown";
export type QaRepairFindingDisposition = "fixed_source" | "fixed_by_minimal_revert" | "left_with_evidence" | "false_positive";

export interface QaRepairAgentResult {
  schema_version: typeof QA_REPAIR_AGENT_SCHEMA_VERSION;
  item_id: string;
  source_path: string;
  outcome: QaRepairAgentOutcome;
  score_impact: QaRepairScoreImpact;
  summary: string;
  edits: string[];
  validation: Array<{
    command: string;
    status: "passed" | "failed" | "not_run";
    artifact_path: string | null;
    notes: string;
  }>;
  finding_dispositions: Array<{
    rule_id: string;
    line: number | null;
    disposition: QaRepairFindingDisposition;
    evidence: string;
  }>;
  remaining_findings: Array<{
    rule_id: string;
    line: number | null;
    reason: string;
  }>;
  risks: string[];
}

function agentFilePath(): string {
  return fileURLToPath(new URL("./agent.ts", import.meta.url));
}

export const prompt = definePrompt({
  id: "melee.qa-repair.system",
  title: "Melee QA Repair System Prompt",
  archetype: "workflow",
  nodes: [
    section("goal", [
      bulletList([
        "Repair one PR-bound candidate file that has deterministic QA findings.",
        "Every finding in the queue item is a requirement violation, not a suggestion. The default disposition is to repair it. Leaving a finding unfixed requires stated evidence, not preference.",
        "Make the smallest valuable source edits that remove the listed maintainer-rejected patterns.",
        "Treat worker output as useful but fallible: make the retained source worth merging into the repo, not preserve every score gain.",
        "Preserve useful matching work when possible by converting bad tactics into project idioms.",
        "Exact matches are the primary PR value. Fuzzy-only improvements are expendable, and peeling them back is acceptable when that keeps the code reviewable.",
        "Do not introduce new regressions in existing report items. If a repair would break an already-matched or already-improved baseline item, stop and report the regression evidence instead of shipping the edit.",
        "If a clean source repair is not possible, revert only the minimal problematic hunk needed to remove the violation.",
        'If the clean fix lowers score, report `score_impact: "lower_score"` and explain exactly which useful work was lost and why the lower-score repair is still the cleanest option.',
        "If the only source shape that keeps a new exact match is review-sensitive but not fake, banned, or a listed QA violation, keep the match-preserving shape only with explicit `left_with_evidence` and `risks[]` entries naming the line, concern, validation result, and reviewer question.",
        "Do not recover the score by replacing one rejected tactic with another; clean source is the repair objective.",
      ]),
    ]),
    section("context_contract", [
      usesContext("qa-repair-item", {
        instructions: [
          "Use the injected queue item, available tools, source path, lane, findings, proofs, and repair task as the authoritative repair packet.",
          "Fix only the source file and findings named in the queue item. Do not edit headers; if a repair requires a header change, leave the finding with evidence and report the blocker.",
        ],
      }),
      usesContext("qa-repair-queue-summary", {
        instructions: ["Use the injected queue summary only to understand repair batch context and priority."],
      }),
      usesContext("standard-examples", {
        instructions: [
          "Use the injected decomp standards, targeted examples, and output schema as context for repair choices and JSON shape.",
          "Treat standard examples as pattern-specific repair guidance, not as permission to edit unrelated code.",
        ],
      }),
    ]),
    section("definition_of_done", [
      "Return exactly one JSON object following the injected output contract.",
      bulletList([
        "Every error finding in `<qa_repair_item>` is fixed, or the remaining blocker is listed with concrete evidence.",
        "If `<qa_repair_item>.repair_warnings` is true, every warning finding is also fixed or listed with concrete evidence.",
        "`<standard_examples>` has been used as targeted repair context for matching `standard_id` or `rule_id` findings.",
        "Every finding has a `finding_dispositions[]` row: `fixed_source`, `fixed_by_minimal_revert`, `left_with_evidence`, or `false_positive`.",
        "Any retained match-vs-cleanliness tradeoff is called out in `risks[]` with enough line-level evidence for a maintainer or PR reviewer to decide.",
        "You did not edit unrelated files or opportunistically improve nearby code.",
        "You ran the most relevant validation you can run from the available tools and report what passed, failed, or was not run.",
        "You do not claim final cleanliness. The runner will re-run `review_lint scan_diff`, score/build/regression checks, and ship-set verification.",
      ]),
    ]),
    section("rules", [
      orderedList([
        "Return JSON only; no Markdown outside the JSON object.",
        "Fix only the source file and findings named in the queue item. Header edits are outside this repair lane and will be rolled back; report a header dependency as evidence instead.",
        "Do not preserve exactness by retaining `register`, inline asm, `M2C_FIELD`, generated labels, fake assert macros, extern-literal anchors, packed string blobs, define aliases, or other listed QA violations.",
        "Prefer project idioms already present in nearby source: existing field names, helpers, HSD_ASSERT/HSD_ASSERTMSG forms, canonical macros, and typed accesses.",
        "Treat `<standard_examples>` as pattern-specific repair guidance, not as permission to edit unrelated code.",
        "Do not invent semantic names. If semantics are not evidenced, use a conservative local name and explain the evidence.",
        'Do not "fix" a finding by deleting useful unrelated implementation work. Preserve the useful hunk and remove only the banned tactic when an idiomatic source repair exists.',
        "Revert or drop source only after trying an idiomatic repair. When you revert, keep the revert minimal and report the disposition as `fixed_by_minimal_revert`.",
        "For extern/data-symbol/literal findings, inspect ownership evidence before editing: determine whether the current TU owns the data, whether an inline literal is sufficient, or whether binary-order data definition is required. Do not leave fake self-TU externs.",
        "For raw `__assert`/`OSReport` findings, try to restore the project assert/report idiom (`HSD_ASSERT`, `HSD_ASSERTMSG`, or an existing helper) before removing matching work.",
        "Do not use destructive git commands or reset unrelated user work.",
        "A small score loss is acceptable when it is the cost of removing standards-violating worker output; record the loss instead of chasing it back with generated, tactic-shaped, or fake source. Fuzzy improvements are less important than exact matches, and both are less important than avoiding new regressions in existing items.",
        'A finding is a requirement violation by default; do not mark `false_positive` to avoid a repair. Only when a finding is genuinely a scanner error may you set `outcome: "false_positive"`, add a `false_positive` disposition, and you MUST state the concrete rule/evidence gap (the source fact the detector misread). An unexplained `false_positive` is not acceptable and is not clean.',
        'An `llm_review`-advisory finding (the scanner marked it advisory, deferring to reviewer judgment) may be kept as-is only with a `left_with_evidence` disposition and a `risks[]` entry that justifies why the retained shape is acceptable — the line, the tradeoff, and the reviewer question. Silence is not justification.',
        "Do not silently normalize away a new exact match for a merely suspicious source shape. First try a clean idiomatic repair; if exactness depends on a non-banned but reviewer-sensitive line, leave the smallest match-preserving form and mark it `left_with_evidence` plus a `risks[]` entry for reviewer judgment. If the shape is fake, cheating, a listed violation, or causes an existing regression, fix/revert it even if the match is lost.",
        "If you cannot validate, set the relevant validation row to `not_run` and explain why.",
      ]),
    ]),
    section("workflow", [
      section("phase", [
        bulletList([
          "Read the queue item, proofs, lane, source path, and every finding.",
          "Inspect nearby source and available standards before editing.",
          "Separate repair targets from advisory context. Error findings are always repair targets; warning findings are repair targets when `repair_warnings` is true.",
        ]),
      ], { attrs: { id: "1", name: "understand_findings" } }),
      section("phase", [
        bulletList([
          "Group function-scoped findings by repair target, and process those targets one at a time.",
          "Before editing a target, record its current source shape and whether its function is already exact so you can restore only that target if its checkpoint regresses.",
          "Remove the concrete violations for the current target while keeping unrelated matching work intact.",
          "Try `fixed_source` first: inline a constant, use an owned data definition, restore an HSD assert macro, replace generated residue names, or use typed fields/helpers.",
          "Use `fixed_by_minimal_revert` only for the smallest hunk that cannot be made reviewable without keeping the banned tactic.",
          "Prefer losing fuzzy improvements over losing exact matches when both choices remain standards-compliant and regression-free.",
          "When a new exact match created during this repair and a known violation conflict, choose cleanliness and report the score impact honestly; this does not override the checkpoint rule protecting a function that was already exact before its target edit.",
          "When exact match depends on a non-banned unresolved style or source-shape tradeoff, keep the minimal match-preserving code and annotate that line in the JSON for PR-reviewer/maintainer guidance rather than hiding the concern.",
        ]),
      ], { attrs: { id: "2", name: "repair_targets_one_at_a_time" } }),
      section("phase", [
        bulletList([
          "After fixing each target's findings, and before moving to the next target, you MUST run the available compile tool and objdiff/checkdiff score tool scoped to that function.",
          "If a function that was exact before this target's edit is no longer exact, restore the prior source shape you recorded for this target; do not leave the regressing edit in the file.",
          "For every target finding left by that restore, record `left_with_evidence` and include the measured before/after exact-match regression in `evidence`, then continue to the next target.",
          "Re-run the target checkpoint after restoring its prior shape when the available tools permit, and record every checkpoint command, result, and artifact path in `validation[]`.",
        ]),
      ], { attrs: { id: "3", name: "checkpoint_each_target" } }),
      section("phase", [
        bulletList([
          "Only after all function targets have completed their checkpoints, handle file-scope findings such as data ordering, includes, and literals.",
          "Keep file-scope repairs minimal and do not reopen already checkpointed function targets unless the file-scope repair requires it.",
        ]),
      ], { attrs: { id: "4", name: "repair_file_scope_findings" } }),
      section("phase", [
        bulletList([
          "After file-scope repairs, you MUST run a whole-file compile and whole-file objdiff/checkdiff score check, plus the focused QA checks available to you.",
          "Record each command, result, and artifact path in the JSON.",
          "If validation still reports findings, return `needs_rework` with the remaining rule IDs.",
          "Do not return `fixed` while a required finding lacks a disposition row.",
        ]),
      ], { attrs: { id: "5", name: "validate_whole_file" } }),
      section("phase", [
        "Return one compact JSON object with edits, validations, remaining findings, risks, and score impact.",
      ], { attrs: { id: "6", name: "report" } }),
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

function numberOrNull(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function scoreImpactValue(value: unknown): QaRepairScoreImpact | null {
  const raw = stringValue(value);
  if (raw === "same_match" || raw === "lower_score" || raw === "unknown") return raw;
  if (raw === "not_checked" || raw === "not_measured" || raw === "not_run") return "unknown";
  return null;
}

function validationRows(value: unknown): QaRepairAgentResult["validation"] | null {
  if (!Array.isArray(value)) return null;
  const rows: QaRepairAgentResult["validation"] = [];
  for (const raw of value) {
    if (!isRecord(raw)) return null;
    const rawStatus = stringValue(raw.status);
    const status = rawStatus === "warned" || rawStatus === "warning_only" ? "passed" : rawStatus === "skipped" ? "not_run" : rawStatus;
    if (status !== "passed" && status !== "failed" && status !== "not_run") return null;
    rows.push({
      command: stringValue(raw.command),
      status,
      artifact_path: raw.artifact_path === null ? null : stringValue(raw.artifact_path) || null,
      notes: stringValue(raw.notes),
    });
  }
  return rows;
}

function remainingFindings(value: unknown): QaRepairAgentResult["remaining_findings"] | null {
  if (!Array.isArray(value)) return null;
  const rows: QaRepairAgentResult["remaining_findings"] = [];
  for (const raw of value) {
    if (!isRecord(raw)) return null;
    rows.push({
      rule_id: stringValue(raw.rule_id),
      line: numberOrNull(raw.line),
      reason: stringValue(raw.reason),
    });
  }
  return rows;
}

function findingDispositions(value: unknown): QaRepairAgentResult["finding_dispositions"] | null {
  if (!Array.isArray(value)) return null;
  const rows: QaRepairAgentResult["finding_dispositions"] = [];
  for (const raw of value) {
    if (!isRecord(raw)) return null;
    const disposition = stringValue(raw.disposition);
    if (disposition !== "fixed_source" && disposition !== "fixed_by_minimal_revert" && disposition !== "left_with_evidence" && disposition !== "false_positive") return null;
    rows.push({
      rule_id: stringValue(raw.rule_id),
      line: numberOrNull(raw.line),
      disposition,
      evidence: stringValue(raw.evidence),
    });
  }
  return rows;
}

export function validateQaRepairAgentResult(value: unknown): { result: QaRepairAgentResult | null; errors: string[] } {
  if (!isRecord(value)) return { result: null, errors: ["result is not an object"] };
  const errors: string[] = [];
  if (value.schema_version !== QA_REPAIR_AGENT_SCHEMA_VERSION) errors.push(`schema_version must be ${QA_REPAIR_AGENT_SCHEMA_VERSION}`);
  const outcome = stringValue(value.outcome);
  if (!["fixed", "needs_rework", "blocked", "false_positive"].includes(outcome)) errors.push("outcome is not a valid QA repair outcome");
  const scoreImpact = scoreImpactValue(value.score_impact);
  if (!scoreImpact) errors.push("score_impact is not valid");
  const validation = validationRows(value.validation);
  if (!validation) errors.push("validation must be an array of command/status rows");
  const remaining = remainingFindings(value.remaining_findings);
  if (!remaining) errors.push("remaining_findings must be an array");
  const dispositions = findingDispositions(value.finding_dispositions);
  if (!dispositions) errors.push("finding_dispositions must be an array");
  const edits = stringArray(value.edits);
  if (!Array.isArray(value.edits)) errors.push("edits must be an array");
  const risks = stringArray(value.risks);
  if (!Array.isArray(value.risks)) errors.push("risks must be an array");
  const itemId = stringValue(value.item_id);
  const sourcePath = stringValue(value.source_path);
  const summary = stringValue(value.summary);
  if (!itemId) errors.push("item_id is required");
  if (!sourcePath) errors.push("source_path is required");
  if (!summary) errors.push("summary is required");
  if (errors.length > 0 || !validation || !remaining || !dispositions) return { result: null, errors };
  return {
    result: {
      schema_version: QA_REPAIR_AGENT_SCHEMA_VERSION,
      item_id: itemId,
      source_path: sourcePath,
      outcome: outcome as QaRepairAgentOutcome,
      score_impact: scoreImpact!,
      summary,
      edits,
      validation,
      finding_dispositions: dispositions,
      remaining_findings: remaining,
      risks,
    },
    errors: [],
  };
}

export function qaRepairPrompt(options: QaRepairPromptOptions): PiPromptBundle {
  const systemTemplatePath = agentFilePath();
  const userTemplatePath = promptFilePath();
  return {
    systemPrompt: renderSystemPrompt(),
    userPrompt: QA_REPAIR_TURN_PROMPT,
    systemTemplatePath,
    userTemplatePath,
    kernelContext: buildQaRepairKernelContext(options),
  };
}
