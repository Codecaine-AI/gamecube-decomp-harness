/**
 * Pre-ship adversarial review mode for the PR reviewer agent (QA ship gate L3).
 *
 * The runtime agent id is "pr-reviewer"; this mode uses the kernel-native
 * prompt.ts system and per-slice context rendering.
 * This module owns the mode's static
 * exhibits (curated past maintainer rejections from doldecomp/melee
 * PRs #2655-#2659), their prompt XML rendering, and the structural validator
 * for the agent's output contract (schema.json).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const PRESHIP_REVIEW_SCHEMA_VERSION = "melee_pr_preship_review_v1";

export type PreshipExhibitKind = "rejection" | "counter_exhibit";

export interface PreshipExhibit {
  id: string;
  kind: PreshipExhibitKind;
  pr: number;
  file: string;
  line: number;
  comment: string;
  url: string;
  pattern: string;
}

export type PreshipSliceVerdict = "approve" | "reject";
export type PreshipFindingVerdict = "reject" | "warn";

/**
 * The seven decomp-standards slice families (standards/<family>/ directories).
 * A proposed_rule names the family whose deterministic detector should have
 * caught the offending pattern.
 */
export const PRESHIP_PROPOSED_RULE_FAMILIES = [
  "asserts_reports_and_header_inlines",
  "authored_source_shape",
  "codegen_tactics",
  "literals_data_and_externs",
  "names_defines_headers_and_prototypes",
  "pipeline_owned_verification",
  "typed_access_and_pointer_math",
] as const;

export type PreshipProposedRuleFamily = (typeof PRESHIP_PROPOSED_RULE_FAMILIES)[number];

export interface PreshipReviewFinding {
  file: string;
  line: number | null;
  standard_id: string | null;
  verdict: PreshipFindingVerdict;
  rationale: string;
  suggested_fix: string | null;
}

/**
 * Optional reviewer output: a sketch for a NEW deterministic lint rule that
 * would have caught a violation the reviewer had to judge by hand. These are
 * accumulated as proposal-only records into the decomp_standards proposal
 * store; they are never auto-applied.
 */
export interface PreshipProposedRule {
  kind: "proposed_lint_rule";
  family: PreshipProposedRuleFamily;
  standard_id: string | null;
  description: string;
  example_excerpt: string;
  suggested_detector: string | null;
}

export interface PreshipReview {
  schema_version: typeof PRESHIP_REVIEW_SCHEMA_VERSION;
  slice_id: string;
  slice_verdict: PreshipSliceVerdict;
  findings: PreshipReviewFinding[];
  summary: string;
  confidence: number;
  /** Optional; absent on legacy artifacts. */
  proposed_rules?: PreshipProposedRule[];
}

export function preshipExhibitsPath(): string {
  return fileURLToPath(new URL("./exhibits/preship_exhibits.json", import.meta.url));
}

function xmlText(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function xmlAttribute(value: unknown): string {
  return xmlText(value).replace(/"/g, "&quot;");
}

export function loadPreshipExhibits(path = preshipExhibitsPath()): PreshipExhibit[] {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  const rows = Array.isArray(parsed.exhibits) ? parsed.exhibits : [];
  return rows
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object" && !Array.isArray(row))
    .map((row) => ({
      id: String(row.id ?? ""),
      kind: row.kind === "counter_exhibit" ? "counter_exhibit" : "rejection",
      pr: Number(row.pr ?? 0),
      file: String(row.file ?? ""),
      line: Number(row.line ?? 0),
      comment: String(row.comment ?? ""),
      url: String(row.url ?? ""),
      pattern: String(row.pattern ?? ""),
    }));
}

export function preshipExhibitsPromptXml(exhibits = loadPreshipExhibits()): string {
  const lines = [
    `<maintainer_rejection_exhibits count="${exhibits.length}">`,
    "    <instruction>",
    "        Each rejection exhibit is a verbatim maintainer rejection from a past PR.",
    "        Any diff hunk matching an exhibit's pattern is a reject, even when it improves the match score.",
    "        Counter-exhibits show patterns the maintainer ACCEPTED; do not reject them.",
    "    </instruction>",
  ];
  for (const exhibit of exhibits) {
    const attrs = [
      ` id="${xmlAttribute(exhibit.id)}"`,
      ` kind="${xmlAttribute(exhibit.kind)}"`,
      ` pr="${xmlAttribute(exhibit.pr)}"`,
      ` file="${xmlAttribute(exhibit.file)}"`,
      ` line="${xmlAttribute(exhibit.line)}"`,
      ` url="${xmlAttribute(exhibit.url)}"`,
    ].join("");
    lines.push(`    <exhibit${attrs}>`);
    lines.push(`        <pattern>${xmlText(exhibit.pattern)}</pattern>`);
    lines.push(`        <maintainer_comment>${xmlText(exhibit.comment)}</maintainer_comment>`);
    if (exhibit.kind === "counter_exhibit") {
      lines.push("        <note>ACCEPTED counter-exhibit: this pattern is what NOT to reject.</note>");
    }
    lines.push("    </exhibit>");
  }
  lines.push("</maintainer_rejection_exhibits>");
  return lines.join("\n");
}

const SLICE_VERDICTS: readonly string[] = ["approve", "reject"];
const FINDING_VERDICTS: readonly string[] = ["reject", "warn"];
const PROPOSED_RULE_FAMILIES: readonly string[] = PRESHIP_PROPOSED_RULE_FAMILIES;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateFinding(value: unknown, index: number, errors: string[]): PreshipReviewFinding | null {
  const label = `findings[${index}]`;
  if (!isRecord(value)) {
    errors.push(`${label} must be an object`);
    return null;
  }
  if (typeof value.file !== "string" || !value.file) errors.push(`${label}.file must be a non-empty string`);
  if (!("verdict" in value)) errors.push(`${label}.verdict is required`);
  else if (typeof value.verdict !== "string" || !FINDING_VERDICTS.includes(value.verdict)) {
    errors.push(`${label}.verdict must be one of: ${FINDING_VERDICTS.join(", ")}`);
  }
  if (typeof value.rationale !== "string" || !value.rationale) errors.push(`${label}.rationale must be a non-empty string`);
  const line = value.line ?? null;
  if (line !== null && (typeof line !== "number" || !Number.isFinite(line))) errors.push(`${label}.line must be a number or null`);
  const standardId = value.standard_id ?? null;
  if (standardId !== null && typeof standardId !== "string") errors.push(`${label}.standard_id must be a string or null`);
  const suggestedFix = value.suggested_fix ?? null;
  if (suggestedFix !== null && typeof suggestedFix !== "string") errors.push(`${label}.suggested_fix must be a string or null`);
  if (errors.length > 0) return null;
  return {
    file: value.file as string,
    line: line as number | null,
    standard_id: standardId as string | null,
    verdict: value.verdict as PreshipFindingVerdict,
    rationale: value.rationale as string,
    suggested_fix: suggestedFix as string | null,
  };
}

function validateProposedRule(value: unknown, index: number, errors: string[]): PreshipProposedRule | null {
  const label = `proposed_rules[${index}]`;
  if (!isRecord(value)) {
    errors.push(`${label} must be an object`);
    return null;
  }
  if (value.kind !== "proposed_lint_rule") errors.push(`${label}.kind must be "proposed_lint_rule"`);
  if (typeof value.family !== "string" || !PROPOSED_RULE_FAMILIES.includes(value.family)) {
    errors.push(`${label}.family must be one of: ${PROPOSED_RULE_FAMILIES.join(", ")}`);
  }
  if (typeof value.description !== "string" || !value.description) errors.push(`${label}.description must be a non-empty string`);
  if (typeof value.example_excerpt !== "string" || !value.example_excerpt) errors.push(`${label}.example_excerpt must be a non-empty string`);
  const standardId = value.standard_id ?? null;
  if (standardId !== null && typeof standardId !== "string") errors.push(`${label}.standard_id must be a string or null`);
  const suggestedDetector = value.suggested_detector ?? null;
  if (suggestedDetector !== null && typeof suggestedDetector !== "string") errors.push(`${label}.suggested_detector must be a string or null`);
  if (errors.length > 0) return null;
  return {
    kind: "proposed_lint_rule",
    family: value.family as PreshipProposedRuleFamily,
    standard_id: standardId as string | null,
    description: value.description as string,
    example_excerpt: value.example_excerpt as string,
    suggested_detector: suggestedDetector as string | null,
  };
}

/**
 * Lightweight structural validator for the preship review output contract.
 * Required keys and verdict enums only — no external schema dependencies.
 * `proposed_rules` is optional and additive: absent leaves it undefined; when
 * present it must be an array of valid proposed-rule objects.
 */
export function validatePreshipReview(value: unknown): { review: PreshipReview | null; errors: string[] } {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { review: null, errors: ["review must be a JSON object"] };
  }
  if (value.schema_version !== PRESHIP_REVIEW_SCHEMA_VERSION) {
    errors.push(`schema_version must be "${PRESHIP_REVIEW_SCHEMA_VERSION}"`);
  }
  if (typeof value.slice_id !== "string" || !value.slice_id) errors.push("slice_id must be a non-empty string");
  if (!("slice_verdict" in value)) errors.push("slice_verdict is required");
  else if (typeof value.slice_verdict !== "string" || !SLICE_VERDICTS.includes(value.slice_verdict)) {
    errors.push(`slice_verdict must be one of: ${SLICE_VERDICTS.join(", ")}`);
  }
  if (typeof value.summary !== "string") errors.push("summary must be a string");
  if (typeof value.confidence !== "number" || !Number.isFinite(value.confidence)) errors.push("confidence must be a finite number");
  if (!Array.isArray(value.findings)) {
    errors.push("findings must be an array");
    return { review: null, errors };
  }
  let proposedRules: PreshipProposedRule[] | undefined;
  if ("proposed_rules" in value && value.proposed_rules !== undefined && value.proposed_rules !== null) {
    if (!Array.isArray(value.proposed_rules)) {
      errors.push("proposed_rules must be an array when present");
    } else {
      proposedRules = value.proposed_rules
        .map((rule, index) => validateProposedRule(rule, index, errors))
        .filter((rule): rule is PreshipProposedRule => rule !== null);
    }
  }
  const findings = value.findings.map((finding, index) => validateFinding(finding, index, errors));
  if (errors.length > 0) return { review: null, errors };
  return {
    review: {
      schema_version: PRESHIP_REVIEW_SCHEMA_VERSION,
      slice_id: value.slice_id as string,
      slice_verdict: value.slice_verdict as PreshipSliceVerdict,
      findings: findings as PreshipReviewFinding[],
      summary: value.summary as string,
      confidence: value.confidence as number,
      ...(proposedRules ? { proposed_rules: proposedRules } : {}),
    },
    errors: [],
  };
}
