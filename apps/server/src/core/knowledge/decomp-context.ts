import { existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { gameKnowledgeRoot, globalSourceRoot, globalSourceStorageRoot, packageRoot } from "./paths.js";
import {
  readComposedSliceRecords,
  standardsRoots as composeStandardsRoots,
  standardsSlicesRoot,
  type StandardsRoot,
  type StandardsScope,
} from "./standards-files.js";

type JsonRecord = Record<string, unknown>;

const FINAL_AUTHORITY =
  "Current source, headers, symbols, splits, assembly, objdiff, and regression output outrank global standards.";

function packageRelativePath(path: string): string {
  const relativePath = relative(packageRoot(), path);
  return relativePath && !relativePath.startsWith("..") ? relativePath : path;
}

function globalSourceScriptCommand(sourceId: string, ...parts: string[]): string {
  return `python3 ${packageRelativePath(resolve(globalSourceRoot(sourceId), ...parts))}`;
}

export interface StandardExampleSelector {
  standardIds?: Iterable<string>;
  qaRuleIds?: Iterable<string>;
  limit?: number;
}

export interface StandardsSelection {
  gameId?: string;
  knowledgeRoot?: string;
}

/**
 * Storage root of the selected standards source. With no game selected this is
 * the global source itself (`knowledge/global/sources/injectable/decomp_standards`).
 */
function selectedStandardsRoot(selection: StandardsSelection = {}): string {
  if (!selection.gameId && !selection.knowledgeRoot) return globalSourceStorageRoot("decomp_standards");
  const root = selection.knowledgeRoot ?? gameKnowledgeRoot(selection.gameId);
  const registryPath = resolve(root, "sources/registry.json");
  const registry = existsSync(registryPath) ? JSON.parse(readFileSync(registryPath, "utf8")) : {};
  const entry = (registry.sources ?? []).find((item: unknown) =>
    typeof item === "object" && item !== null && (item as JsonRecord).id === "decomp_standards");
  return resolve(root, "sources", entry?.path ?? "decomp_standards");
}

/**
 * Ordered standards slices roots for a selection: the selected game's root
 * first, then the global root (`REVIEW_LINT_GLOBAL_STANDARDS_DIR`, default
 * `<globalKnowledgeRoot>/sources/injectable/decomp_standards/standards`) when
 * it differs. Every game composes the same way; Melee's own root is an empty
 * shell so it yields the global set. No selection yields the global root alone.
 */
export function standardsRoots(selection: StandardsSelection = {}): StandardsRoot[] {
  return composeStandardsRoots(standardsSlicesRoot(selectedStandardsRoot(selection)));
}

/**
 * Whether the selection contributes game-scoped standards on top of the global
 * set. Games without their own records (Melee, or no selection) render the
 * global-host prompt wording and may use summarized standards budgets.
 */
export function hasGameScopedStandards(selection: StandardsSelection = {}): boolean {
  return loadScopedStandards(selection).some((item) => item.scope === "game");
}

interface ScopedStandard {
  record: JsonRecord;
  scope: StandardsScope;
}

export function globalStandardsContext(selection: StandardsSelection = {}): Record<string, unknown> {
  const scoped = loadScopedStandards(selection);
  const records = scoped.map((item) => item.record);
  const examples = examplesByStandardId(loadStandardExamples(selection));
  const roots = standardsRoots(selection);
  return {
    source: "decomp_standards",
    status: records.length ? "ready" : "missing_records",
    standard_count: records.length,
    accepted_standard_count: records.filter(
      (record) => record.status === "accepted",
    ).length,
    trust_rule: FINAL_AUTHORITY,
    mutation_policy: "proposal_only_until_validated",
    source_path: selectedStandardsRoot(selection),
    global_source_path: roots.find((item) => item.scope === "global")?.root,
    search_command: !selection.gameId && !selection.knowledgeRoot
      ? `${globalSourceScriptCommand("decomp_standards", "api/search.py")} --query <query> --limit 10 --json`
      : undefined,
    standards: scoped.map(({ record, scope }) => ({
      id: record.id,
      scope,
      status: record.status,
      family: record.family,
      disposition: record.disposition,
      severity: record.severity,
      qa_enforcement: record.qa_enforcement,
      worker_facing: record.worker_facing,
      retired_into: record.retired_into,
      title: record.title,
      summary: stringArray(record.summary),
      qa_rule_ids: stringArray(record.qa_rule_ids),
      example_count: examples.get(stringValue(record.id))?.length ?? 0,
      canonical_example: formatStandardExampleContext(
        examples.get(stringValue(record.id))?.[0],
      ),
      prompt_signals: {
        preferred: stringArray(record.do),
        rejected: stringArray(record.do_not),
      },
    })),
  };
}

export function loadStandardExamples(selection: StandardsSelection = {}): JsonRecord[] {
  return readComposedSliceRecords<JsonRecord>(
    standardsRoots(selection),
    "examples.jsonl",
    "examples",
  ).map((item) => item.record);
}

export function standardExamplesPromptXml(
  selector: StandardExampleSelector = {},
): string {
  const standardIds = new Set(
    [...(selector.standardIds ?? [])].filter(Boolean),
  );
  const qaRuleIds = new Set([...(selector.qaRuleIds ?? [])].filter(Boolean));
  const hasFilter = standardIds.size > 0 || qaRuleIds.size > 0;
  const allExamples = loadStandardExamples();
  const examples = (hasFilter
    ? allExamples.filter((record) => {
        const standardId = stringValue(record.standard_id);
        const qaRuleId = stringValue(record.qa_rule_id);
        return (
          (standardId && standardIds.has(standardId)) ||
          (qaRuleId && qaRuleIds.has(qaRuleId))
        );
      })
    : canonicalExamplesByStandard(allExamples)
  ).slice(0, Math.max(0, selector.limit ?? 12));

  const lines = [
    `<standard_examples count="${examples.length}">`,
    "    <instruction>Use these standard-linked code pairs only after a lint finding, repair item, or pre-ship concern identifies the relevant standard or rule.</instruction>",
  ];
  for (const example of examples) {
    const attrs = [
      optionalXmlAttribute("id", example.id),
      optionalXmlAttribute("standard_id", example.standard_id),
      optionalXmlAttribute("qa_rule_id", example.qa_rule_id),
      optionalXmlAttribute("severity", example.severity),
    ].filter(Boolean);
    lines.push(`    <example ${attrs.join(" ")}>`);
    lines.push(`        <bad_code>${xmlText(example.bad_pattern)}</bad_code>`);
    lines.push(
      `        <preferred_code>${xmlText(example.preferred_shape)}</preferred_code>`,
    );
    lines.push("        <why>");
    for (const item of standardExampleDescription(example)) {
      lines.push(`            - ${xmlText(item)}`);
    }
    lines.push("        </why>");
    lines.push("    </example>");
  }
  lines.push("</standard_examples>");
  return lines.join("\n");
}

export function globalStandardsPromptXml(selection: StandardsSelection = {}): string {
  const scoped = loadScopedStandards(selection);
  const records = scoped.filter(
    ({ record }) => record.status === "accepted" && record.worker_facing !== false,
  );
  const composed = standardsRoots(selection).length > 1;
  // Game-scoped records carry their own enforcement declarations; a global-only
  // set (Melee, or no selection) keeps the global-host wording.
  const gameScoped = scoped.some((item) => item.scope === "game");
  const examples = examplesByStandardId(loadStandardExamples(selection));
  const lines = [
    "<decomp_standards>",
    "    <instruction>",
    "        These standards are mandatory requirements enforced by lint and review, not preferences.",
    "        Read each description and its bad/preferred code pair, apply the required transformation, and repair every finding before an attempt is accepted.",
    gameScoped
      ? "        Follow each rule's declared lint or review mechanism. Accepted rules do not imply an automated check exists."
      : "        Two rules are llm_review advisories (a type_erasing_cast surface and the authored-style pre-ship check): if either is kept, justify it in the attempt summary. Every other rule is a hard error.",
    "    </instruction>",
  ];

  for (const { record, scope } of records) {
    const attrs = [
      `id="${xmlAttribute(promptStandardId(record.id))}"`,
      composed ? `scope="${scope}"` : "",
    ].filter(Boolean);
    lines.push(`    <standard ${attrs.join(" ")}>`);
    lines.push("        <description>");
    for (const item of stringArray(record.summary)) {
      lines.push(`            - ${xmlText(item)}`);
    }
    lines.push("        </description>");
    if (gameScoped) {
      lines.push(`        <enforcement>${xmlText(stringValue(record.qa_enforcement))}</enforcement>`);
      for (const item of stringArray(record.do)) lines.push(`        <do>${xmlText(item)}</do>`);
      for (const item of stringArray(record.do_not)) lines.push(`        <do_not>${xmlText(item)}</do_not>`);
    }
    const example = examples.get(stringValue(record.id))?.[0];
    if (example) {
      const exampleAttrs = [
        optionalXmlAttribute("id", example.id),
        optionalXmlAttribute("qa_rule_id", example.qa_rule_id),
        optionalXmlAttribute("severity", example.severity),
      ].filter(Boolean);
      lines.push(`        <canonical_example ${exampleAttrs.join(" ")}>`);
      lines.push(`            <bad_code>${xmlText(example.bad_pattern)}</bad_code>`);
      lines.push(
        `            <preferred_code>${xmlText(example.preferred_shape)}</preferred_code>`,
      );
      lines.push("            <why>");
      for (const item of standardExampleDescription(example)) {
        lines.push(`                - ${xmlText(item)}`);
      }
      lines.push("            </why>");
      lines.push("        </canonical_example>");
    }
    const qaRuleIds = stringArray(record.qa_rule_ids);
    if (qaRuleIds.length > 0) {
      lines.push("        <qa_rules>");
      for (const item of qaRuleIds) {
        lines.push(`            - ${xmlText(item)}`);
      }
      lines.push("        </qa_rules>");
    }
    lines.push("    </standard>");
  }

  lines.push("</decomp_standards>");
  return lines.join("\n");
}

function loadScopedStandards(selection: StandardsSelection = {}): ScopedStandard[] {
  return readComposedSliceRecords<JsonRecord>(
    standardsRoots(selection),
    "standards.jsonl",
    "standards",
  ).map((item) => ({ record: item.record, scope: item.scope }));
}

function examplesByStandardId(
  examples: JsonRecord[],
): Map<string, JsonRecord[]> {
  const grouped = new Map<string, JsonRecord[]>();
  for (const example of examples) {
    const standardId = stringValue(example.standard_id);
    if (!standardId) continue;
    const items = grouped.get(standardId) ?? [];
    items.push(example);
    grouped.set(standardId, items);
  }
  return grouped;
}

function canonicalExamplesByStandard(examples: JsonRecord[]): JsonRecord[] {
  const seen = new Set<string>();
  const result: JsonRecord[] = [];
  for (const example of examples) {
    const standardId = stringValue(example.standard_id);
    if (!standardId || seen.has(standardId)) continue;
    seen.add(standardId);
    result.push(example);
  }
  return result;
}

function formatStandardExampleContext(
  example: JsonRecord | undefined,
): JsonRecord | null {
  if (!example) return null;
  return {
    id: example.id,
    qa_rule_id: example.qa_rule_id,
    severity: example.severity,
    bad_code: example.bad_pattern,
    preferred_code: example.preferred_shape,
    why: standardExampleDescription(example),
  };
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item));
  const text = stringValue(value).trim();
  return text ? [text] : [];
}

function standardExampleDescription(record: JsonRecord): string[] {
  const description = stringArray(record.description).filter((item) =>
    item.trim(),
  );
  if (description.length > 0) return description;
  const legacyWhy = stringValue(record.why).trim();
  return legacyWhy ? [legacyWhy] : [];
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function promptStandardId(value: unknown): string {
  return String(value ?? "").replace(/^global_standard:/, "");
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

function optionalXmlAttribute(name: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  return `${name}="${xmlAttribute(value)}"`;
}
