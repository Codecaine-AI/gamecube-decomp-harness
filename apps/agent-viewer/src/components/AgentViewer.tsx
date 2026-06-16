import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, Copy, FileText, Minus, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Plus, RefreshCw } from "lucide-react";
import {
  asArray,
  asObject,
  text,
  type PromptPreview,
  type PromptPreviewAgentId,
  type PromptPreviewSource,
  type PromptPreviewStats,
  type UiConfig,
} from "@decomp-orchestrator/ui-contract";
import { defaultWorkerToolProfile, workerToolPromptInfo } from "@decomp-orchestrator/agents/tools/profile-data";
import standardsJsonlRaw from "../../../../knowledge/sources/injectable/decomp_standards/data/standards.jsonl?raw";
import { fetchPromptPreview, loadConfig, projectOptionLabel, type AgentViewerForm } from "../lib/api";
import { promptStats } from "../lib/promptStats";
import { Button } from "./primitives";

type PromptKind = "system" | "user";

const DEFAULT_PROMPT_FONT_SIZE = 13;
const MIN_PROMPT_FONT_SIZE = 10;
const MAX_PROMPT_FONT_SIZE = 18;

interface AccessRow {
  title: string;
  body?: string;
  code?: string;
  meta?: string;
  chips?: string[];
}

interface AccessGroup {
  id: string;
  title: string;
  rows: AccessRow[];
  emptyText: string;
  summaryLabel?: string;
  badgeCount?: number;
}

type JsonRecord = Record<string, unknown>;

const agents: Array<{ id: PromptPreviewAgentId; label: string }> = [
  { id: "worker", label: "Worker" },
  { id: "pr-review", label: "PR Intake" },
  { id: "knowledge-curator", label: "Curator" },
  { id: "qa-repair", label: "QA Repair" },
];

const sources: Array<{ id: PromptPreviewSource; label: string }> = [
  { id: "latest", label: "Latest Run" },
  { id: "sample", label: "Sample" },
];

function defaultPromptForm(): AgentViewerForm {
  return {
    projectId: "",
    usePathOverrides: false,
    repoRoot: "",
    stateDir: "",
    graphDbPath: "",
  };
}

function formatCount(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString() : "0";
}

function clampPromptFontSize(value: number): number {
  return Math.min(MAX_PROMPT_FONT_SIZE, Math.max(MIN_PROMPT_FONT_SIZE, value));
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
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

function promptStandardId(value: unknown): string {
  return String(value ?? "").replace(/^global_standard:/, "");
}

function localStandardsPromptXml(): string {
  const standards = standardsJsonlRaw
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line): JsonRecord | null => {
      try {
        return JSON.parse(line) as JsonRecord;
      } catch {
        return null;
      }
    })
    .filter((record): record is JsonRecord => record !== null && record.status === "accepted");
  const lines = [
    "<decomp_standards>",
    "    <instruction>All code changes must conform to the following standards.</instruction>",
    "    <authority>Current source, headers, symbols, splits, assembly, objdiff, and regression output outrank global standards and path facts.</authority>",
  ];

  for (const standard of standards) {
    lines.push(`    <standard id="${xmlAttribute(promptStandardId(standard.id))}">`);
    lines.push(`        <summary>${xmlText(standard.summary)}</summary>`);
    lines.push("        <do>");
    for (const item of stringArray(standard.do)) {
      lines.push(`            - ${xmlText(item)}`);
    }
    lines.push("        </do>");
    lines.push("        <do_not>");
    for (const item of stringArray(standard.do_not)) {
      lines.push(`            - ${xmlText(item)}`);
    }
    lines.push("        </do_not>");
    lines.push("    </standard>");
  }

  lines.push("</decomp_standards>");
  return lines.join("\n");
}

const LOCAL_DECOMP_STANDARDS_XML = localStandardsPromptXml();

function localAvailableToolsPromptXml(): string {
  const groups = new Map<string, { provider: string; type: string; toolIds: string[] }>();
  for (const toolId of defaultWorkerToolProfile) {
    const info = workerToolPromptInfo[toolId] ?? {
      provider: "custom",
      type: "other",
      useWhen: "Use this attached worker tool when it fits the current target.",
    };
    const groupKey = `${info.provider}\0${info.type}`;
    const group = groups.get(groupKey) ?? { provider: info.provider, type: info.type, toolIds: [] };
    group.toolIds.push(toolId);
    groups.set(groupKey, group);
  }

  const lines = ["    <available_tools>"];
  for (const group of groups.values()) {
    lines.push(`        <tool_group provider="${xmlAttribute(group.provider)}" type="${xmlAttribute(group.type)}">`);
    for (const toolId of group.toolIds) {
      const info = workerToolPromptInfo[toolId];
      lines.push(`            <tool name="${xmlAttribute(toolId)}" label="${xmlAttribute(toolId)}" use_when="${xmlAttribute(info?.useWhen ?? "")}" />`);
    }
    lines.push("        </tool_group>");
  }
  lines.push("    </available_tools>");
  return lines.join("\n");
}

const LOCAL_AVAILABLE_TOOLS_XML = localAvailableToolsPromptXml();

function optionalXmlAttribute(name: string, value: unknown): string {
  const attr = accessString(value);
  return attr ? ` ${name}="${xmlAttribute(attr)}"` : "";
}

function cdata(value: string): string {
  return `<![CDATA[${value.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

function firstObject(...values: unknown[]): JsonRecord {
  for (const value of values) {
    const record = asObject(value);
    if (Object.keys(record).length) return record;
  }
  return {};
}

function localPromptTargetAndBaseline(context: JsonRecord): { target: JsonRecord; baseline: JsonRecord; sourcePath: string } {
  const options = asObject(context.options);
  const packet = asObject(options.packet);
  const target = firstObject(context.target, packet.target);
  let baseline = firstObject(packet.baseline, context.baseline);
  if (!Object.keys(baseline).length) {
    const currentScores = firstObject(context.baseline_current_scores, context.current_scores, context.baseline_measures, context.baselineMeasures);
    baseline = Object.keys(currentScores).length
      ? {
          current_scores: currentScores,
          fuzzy_match_percent: target.fuzzy_match_percent,
        }
      : {};
  }
  const sourcePath = accessString(target.source_path) || accessString(target.sourcePath) || accessString(target.path);
  return { target, baseline, sourcePath };
}

function localJsonBlockXml(tag: string, value: unknown, indent = "        "): string {
  return [`${indent}<${tag}>`, "```json", JSON.stringify(value, null, 2), "```", `${indent}</${tag}>`].join("\n");
}

function localTargetFilePromptXml(context: JsonRecord, indent = "    "): string {
  const { target, baseline, sourcePath } = localPromptTargetAndBaseline(context);
  const attrs = [
    optionalXmlAttribute("path", sourcePath),
    optionalXmlAttribute("unit", target.unit),
    optionalXmlAttribute("symbol", target.symbol),
    optionalXmlAttribute("size", target.size),
    optionalXmlAttribute("baseline_match_percent", baseline.fuzzy_match_percent || target.fuzzy_match_percent),
  ].join("");
  const message = sourcePath ? `Target file content is unavailable in this preview payload: ${sourcePath}` : "Target file content is unavailable in this preview payload.";
  return [`${indent}<target_file${attrs}>`, `${indent}    <content unavailable="true">${xmlText(message)}</content>`, `${indent}</target_file>`].join("\n");
}

function localTargetPromptXml(context: JsonRecord): string {
  const { target } = localPromptTargetAndBaseline(context);
  return ["    <target>", localJsonBlockXml("details_json", target), localTargetFilePromptXml(context, "        "), "    </target>"].join("\n");
}

function localBaselinePromptXml(context: JsonRecord): string {
  const { baseline } = localPromptTargetAndBaseline(context);
  return ["    <baseline>", localJsonBlockXml("details_json", baseline), "    </baseline>"].join("\n");
}

function graphFunctionName(fn: JsonRecord): string {
  return accessString(fn.name) || accessString(fn.symbol) || accessString(fn.function_name) || accessString(fn.id);
}

function localCompactGraphFunction(fn: JsonRecord): JsonRecord {
  return compactRecord({
    name: graphFunctionName(fn),
    symbol: accessString(fn.symbol),
    unit: accessString(fn.unit),
    size: accessString(fn.size),
    fuzzy_match_percent: accessString(fn.fuzzy_match_percent) || accessString(fn.match_percent) || accessString(fn.fuzzy),
    status: accessString(fn.status),
    build_status: accessString(fn.build_status),
    reason: accessString(fn.reason),
  });
}

function localCompactGraphPattern(pattern: JsonRecord): JsonRecord {
  return compactRecord({
    pattern_id: accessString(pattern.pattern_id) || accessString(pattern.id),
    title: accessString(pattern.title),
    category: accessString(pattern.category),
    symptoms: accessArrayStrings(pattern.symptoms).slice(0, 4),
    tactics: accessArrayStrings(pattern.tactics).slice(0, 4),
    evidence_count: accessString(pattern.evidence_count),
    evidence_refs: accessArrayStrings(pattern.linked_evidence_refs).slice(0, 4),
  });
}

function localCompactTouchingPr(pr: JsonRecord): JsonRecord {
  return compactRecord({
    pr: accessString(pr.pr) || accessString(pr.number) || accessString(pr.id),
    title: accessString(pr.title) || accessString(pr.summary),
    author: accessString(pr.author),
    merged_at: accessString(pr.merged_at) || accessString(pr.date),
    role: accessString(pr.role),
  });
}

function localCompactGraphFileCard(card: JsonRecord, target: JsonRecord, sourcePath: string): JsonRecord {
  if (Object.keys(asObject(card.search_leads)).length) return card;
  const functions = asArray(card.functions)
    .map((item) => localCompactGraphFunction(asObject(item)))
    .filter((item) => Object.keys(item).length > 0);
  const targetSymbol = accessString(target.symbol);
  const targetFunction = functions.find((fn) => graphFunctionName(fn) === targetSymbol || accessString(fn.symbol) === targetSymbol);
  const sameFileFunctions = functions.filter((fn) => fn !== targetFunction).slice(0, 10);
  const prHistory = asObject(card.pr_history);
  const mismatchPatterns = asArray(card.mismatch_patterns)
    .slice(0, 6)
    .map((item) => localCompactGraphPattern(asObject(item)));
  const touchingPrs = asArray(prHistory.touching_prs)
    .slice(0, 6)
    .map((item) => localCompactTouchingPr(asObject(item)));
  const resources = asArray(card.resource_hits)
    .slice(0, 8)
    .map((item) => {
      const hit = asObject(item);
      return compactRecord({
        source_id: accessString(hit.source_id),
        title: accessString(hit.title),
        evidence_ref: accessString(hit.evidence_ref),
      });
    });
  const units = asArray(card.units)
    .map((item) => {
      const unit = asObject(item);
      return accessString(unit.unit) || accessString(unit.name);
    })
    .filter(Boolean)
    .slice(0, 8);
  const sameFileSymbols = sameFileFunctions
    .map((fn) => accessString(fn.symbol) || graphFunctionName(fn))
    .filter(Boolean)
    .slice(0, 10);
  const source = accessString(card.source_path) || sourcePath;
  const mismatchQueries = mismatchPatterns
    .map((pattern) => accessString(pattern.title))
    .filter(Boolean)
    .slice(0, 4);
  const hasGraphContext = functions.length > 0 || mismatchPatterns.length > 0 || touchingPrs.length > 0 || resources.length > 0;
  const followUpQueries = [
    compactRecord({ tool: "code_graph_file_card", source_path: source }),
    compactRecord({ tool: "code_graph_search", query: [source, targetSymbol].filter(Boolean).join(" ") }),
    compactRecord({ tool: "past_prs_search", query: [source, targetSymbol].filter(Boolean).join(" ") }),
    ...(mismatchQueries.length ? [compactRecord({ tool: "mismatch_db_search", query: mismatchQueries.join(" OR ") })] : []),
    compactRecord({ tool: "path_facts_resolve", source_path: source }),
  ];

  return compactRecord({
    status: "ready",
    source: "code_graph_file_card",
    authority: "Graph-derived context. Current source, headers, objdiff, and validation output outrank this summary.",
    source_path: source,
    has_graph_context: hasGraphContext,
    editability: asObject(card.editability),
    search_leads: compactRecord({
      symbols: compactRecord({
        source_path: source,
        units,
        target_symbol: targetSymbol,
        same_file_symbols: sameFileSymbols,
      }),
      target_function: targetFunction ?? null,
      same_file_functions: sameFileFunctions,
      mismatch_patterns: mismatchPatterns,
      past_prs: compactRecord({
        touching_prs: touchingPrs,
        search_terms: [targetSymbol, source, ...mismatchQueries].filter(Boolean).slice(0, 8),
      }),
      resources,
      review_risks: asArray(prHistory.review_risks).slice(0, 6),
      tactics: asArray(prHistory.tactics).slice(0, 6),
      follow_up_queries: followUpQueries,
    }),
    no_context_note: hasGraphContext ? "" : "Graph file card had no attached functions, patterns, PRs, resources, or path facts for this source path.",
  });
}

function localTargetGraphFileCardPromptXml(context: JsonRecord): string {
  const { target, sourcePath } = localPromptTargetAndBaseline(context);
  const card = firstObject(context.target_graph_file_card, asObject(context.knowledge_context).file_card);
  const details = Object.keys(card).length
    ? localCompactGraphFileCard(card, target, sourcePath)
    : {
        status: "preview_unavailable",
        source: "code_graph_file_card",
        source_path: sourcePath,
        reason: "Graph file card is unavailable in this client-side preview fallback.",
        has_graph_context: false,
        search_leads: {
          follow_up_queries: [
            compactRecord({ tool: "code_graph_file_card", source_path: sourcePath }),
            compactRecord({ tool: "code_graph_search", query: sourcePath }),
            compactRecord({ tool: "path_facts_resolve", source_path: sourcePath }),
          ],
        },
      };
  return ["    <target_graph_file_card unavailable=\"true\">", localJsonBlockXml("details_json", details), "    </target_graph_file_card>"].join("\n");
}

function localPrContextMetadata(prContext: JsonRecord): JsonRecord {
  return compactRecord({
    schema_version: accessString(prContext.schema_version),
    object_id: accessString(prContext.object_id),
    generated_at: accessString(prContext.generated_at),
    context_source: accessString(prContext.context_source),
    project: prContext.project,
    source: prContext.source,
    pr: prContext.pr,
    counts: prContext.counts,
    activity: prContext.activity,
    initial_classification: prContext.initial_classification,
    changed_files: prContext.changed_files,
    review_feedback_examples: prContext.review_feedback_examples,
    intake_focus: prContext.intake_focus,
  });
}

function localPrEvidenceExcerptsXml(prContext: JsonRecord): string {
  const lines = ["    <evidence_excerpts>"];
  for (const [tag, value] of [
    ["human_pr_text_excerpt", prContext.human_text_excerpt],
    ["review_comments_excerpt", prContext.review_comments_excerpt],
    ["diff_excerpt", prContext.diff_excerpt],
  ] as const) {
    const body = accessString(value);
    if (!body) continue;
    lines.push(`        <${tag}>`);
    lines.push(cdata(body));
    lines.push(`        </${tag}>`);
  }
  lines.push("    </evidence_excerpts>");
  return lines.join("\n");
}

function localPrLoadedFilesXml(prContext: JsonRecord): string {
  const files = asArray(prContext.loaded_files)
    .map((item) => asObject(item))
    .filter((item) => Object.keys(item).length > 0)
    .slice(0, 10);
  if (!files.length) return '    <loaded_files count="0" />';
  const lines = [`    <loaded_files count="${files.length}">`];
  for (const file of files) {
    const attrs = [
      optionalXmlAttribute("label", file.label),
      optionalXmlAttribute("path", file.path),
      optionalXmlAttribute("media_type", file.media_type),
      optionalXmlAttribute("truncated", file.truncated === undefined ? "" : String(Boolean(file.truncated))),
      optionalXmlAttribute("original_chars", file.original_chars),
    ].join("");
    lines.push(`        <file${attrs}>`);
    lines.push(cdata(accessString(file.content)));
    lines.push("        </file>");
  }
  lines.push("    </loaded_files>");
  return lines.join("\n");
}

function localPrContextPromptXml(context: JsonRecord): string {
  const prContext = asObject(context.prContext);
  const attrs = [optionalXmlAttribute("schema_version", prContext.schema_version), optionalXmlAttribute("object_id", prContext.object_id)].join("");
  return [
    `<pr_context${attrs}>`,
    localJsonBlockXml("metadata_json", localPrContextMetadata(prContext), "    "),
    localPrEvidenceExcerptsXml(prContext),
    localPrLoadedFilesXml(prContext),
    "</pr_context>",
  ].join("\n");
}

function hydratePromptPlaceholders(prompt: string, context: JsonRecord = {}): string {
  return prompt
    .replace(/\{\{\s*AVAILABLE_TOOLS_XML\s*\}\}/g, () => accessString(context.available_tools_xml) || LOCAL_AVAILABLE_TOOLS_XML)
    .replace(/\{\{\s*BASELINE_XML\s*\}\}/g, () => localBaselinePromptXml(context))
    .replace(/\{\{\s*CURATOR_CONTEXT_JSON\s*\}\}/g, () => JSON.stringify(asObject(context.curatorContext), null, 2))
    .replace(/\{\{\s*CURATOR_OUTPUT_SCHEMA_JSON\s*\}\}/g, () => JSON.stringify(asObject(context.output_schema), null, 2))
    .replace(/\{\{\s*DECOMP_STANDARDS_XML\s*\}\}/g, () => LOCAL_DECOMP_STANDARDS_XML)
    .replace(/\{\{\s*PR_CONTEXT_JSON\s*\}\}/g, () => JSON.stringify(asObject(context.prContext), null, 2))
    .replace(/\{\{\s*PR_CONTEXT_XML\s*\}\}/g, () => localPrContextPromptXml(context))
    .replace(/\{\{\s*PR_OUTPUT_SCHEMA_JSON\s*\}\}/g, () => JSON.stringify(asObject(context.output_schema), null, 2))
    .replace(/\{\{\s*QA_REPAIR_ITEM_JSON\s*\}\}/g, () => JSON.stringify(asObject(context.qaRepairItem), null, 2))
    .replace(/\{\{\s*QA_REPAIR_OUTPUT_SCHEMA_JSON\s*\}\}/g, () => JSON.stringify(asObject(context.output_schema), null, 2))
    .replace(/\{\{\s*QA_REPAIR_QUEUE_SUMMARY_JSON\s*\}\}/g, () => JSON.stringify(firstObject(context.queueSummary, context.qaRepairQueueSummary), null, 2))
    .replace(/\{\{\s*TARGET_GRAPH_FILE_CARD_XML\s*\}\}/g, () => localTargetGraphFileCardPromptXml(context))
    .replace(/\{\{\s*TARGET_XML\s*\}\}/g, () => localTargetPromptXml(context))
    .replace(/\{\{\s*TARGET_FILE_XML\s*\}\}/g, () => localTargetFilePromptXml(context));
}

function renderInline(value: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /`([^`]+)`/g;
  let lastIndex = 0;
  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > lastIndex) nodes.push(value.slice(lastIndex, index));
    nodes.push(
      <code className="prompt-inline-code" key={`${keyPrefix}-code-${index}`}>
        {match[1]}
      </code>,
    );
    lastIndex = index + match[0].length;
  }
  if (lastIndex < value.length) nodes.push(value.slice(lastIndex));
  return nodes;
}

function isXmlLine(line: string): boolean {
  return /^<\/?[A-Za-z0-9_:-]+(?:\s[^>]*)?>$/.test(line.trim());
}

function renderJsonLine(line: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const tokenPattern = /("(?:\\.|[^"\\])*")(\s*:)?|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\b(?:true|false|null)\b|[{}\[\],:]/g;
  let lastIndex = 0;

  for (const match of line.matchAll(tokenPattern)) {
    const index = match.index ?? 0;
    if (index > lastIndex) nodes.push(line.slice(lastIndex, index));
    const value = match[0];
    const stringPart = match[1];
    const keySuffix = match[2] ?? "";
    const key = `${keyPrefix}-json-${index}`;

    if (stringPart && keySuffix) {
      nodes.push(
        <span className="prompt-json-key" key={`${key}-key`}>
          {stringPart}
        </span>,
      );
      nodes.push(
        <span className="prompt-json-punctuation" key={`${key}-suffix`}>
          {keySuffix}
        </span>,
      );
    } else if (value.startsWith('"')) {
      nodes.push(
        <span className="prompt-json-string" key={key}>
          {value}
        </span>,
      );
    } else if (/^-?\d/.test(value)) {
      nodes.push(
        <span className="prompt-json-number" key={key}>
          {value}
        </span>,
      );
    } else if (value === "true" || value === "false") {
      nodes.push(
        <span className="prompt-json-boolean" key={key}>
          {value}
        </span>,
      );
    } else if (value === "null") {
      nodes.push(
        <span className="prompt-json-null" key={key}>
          {value}
        </span>,
      );
    } else {
      nodes.push(
        <span className="prompt-json-punctuation" key={key}>
          {value}
        </span>,
      );
    }
    lastIndex = index + value.length;
  }

  if (lastIndex < line.length) nodes.push(line.slice(lastIndex));
  return nodes;
}

function PromptLineRows({ startLine = 1, text: prompt }: { startLine?: number; text: string }) {
  const rows = useMemo(() => {
    if (!prompt) return [];
    const lines = prompt.split(/\r\n|\r|\n/);
    let inCode = false;
    let codeLanguage = "";
    return lines.map((line, index) => {
      const trimmed = line.trim();
      const lineNumber = startLine + index;
      const fence = trimmed.startsWith("```");
      const wasInCode = inCode;
      const languageForLine = wasInCode ? codeLanguage : fence ? trimmed.slice(3).trim().toLowerCase() : "";
      if (fence) {
        if (wasInCode) {
          inCode = false;
          codeLanguage = "";
        } else {
          inCode = true;
          codeLanguage = languageForLine;
        }
      }

      let className = "prompt-line";
      let content: ReactNode = renderInline(line, `line-${lineNumber}`);
      if (!trimmed) {
        className += " prompt-line-blank";
        content = "\u00a0";
      } else if (wasInCode || fence) {
        className += fence ? " prompt-line-code-fence" : " prompt-line-code";
        if (!fence && languageForLine === "json") {
          className += " prompt-line-json";
          content = renderJsonLine(line || " ", `json-${lineNumber}`);
        } else {
          content = line || "\u00a0";
        }
      } else if (isXmlLine(trimmed)) {
        className += " prompt-line-xml";
      } else if (/^#{1,6}\s/.test(trimmed)) {
        className += " prompt-line-heading";
      }

      return (
        <div className={className} key={lineNumber}>
          <div className="prompt-line-number">{lineNumber}</div>
          <div className="prompt-line-content">{content}</div>
        </div>
      );
    });
  }, [prompt, startLine]);

  return <>{rows}</>;
}

function RenderedPrompt({ fontSize, text: prompt }: { fontSize: number; text: string }) {
  return (
    <article className="prompt-rendered" style={{ fontSize }}>
      <PromptLineRows text={prompt} />
    </article>
  );
}

function JsonLineView({ text: value }: { text: string }) {
  const rows = useMemo(
    () =>
      value.split(/\r\n|\r|\n/).map((line, index) => {
        const lineNumber = index + 1;
        return (
          <div className="prompt-context-line" key={lineNumber}>
            <div className="prompt-context-line-number">{lineNumber}</div>
            <div className="prompt-context-line-content">{renderJsonLine(line || " ", `context-json-${lineNumber}`)}</div>
          </div>
        );
      }),
    [value],
  );

  return <article className="prompt-context-rendered">{rows}</article>;
}

function stripJsonFence(value: string): string {
  const trimmed = value.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return (fence?.[1] ?? trimmed).trim();
}

function taggedBlock(prompt: string, tag: string): string {
  const pattern = new RegExp(`<${tag}>\\s*([\\s\\S]*?)\\s*</${tag}>`, "i");
  return pattern.exec(prompt)?.[1] ?? "";
}

function taggedXml(prompt: string, tag: string): { attrs: JsonRecord; body: string } | null {
  const pattern = new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)</${tag}>`, "i");
  const match = pattern.exec(prompt);
  if (!match) return null;
  return {
    attrs: xmlAttributes(match[1] ?? ""),
    body: match[2] ?? "",
  };
}

function taggedJson(prompt: string, tag: string): unknown {
  const block = taggedBlock(prompt, tag);
  if (!block) return null;
  try {
    return JSON.parse(stripJsonFence(block));
  } catch {
    return null;
  }
}

function xmlDecode(value: string): string {
  return value.replace(/&quot;/g, '"').replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&");
}

function xmlAttributes(value: string): JsonRecord {
  const attrs: JsonRecord = {};
  const pattern = /([A-Za-z0-9_:-]+)\s*=\s*"([^"]*)"/g;
  for (const match of value.matchAll(pattern)) {
    attrs[match[1] ?? ""] = xmlDecode(match[2] ?? "");
  }
  return attrs;
}

function accessString(value: unknown): string {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : "";
}

function accessArrayStrings(value: unknown): string[] {
  return asArray(value)
    .map((item) => accessString(item))
    .filter(Boolean);
}

function rowFromPathLike(value: unknown, fallbackTitle: string): AccessRow | null {
  if (typeof value === "string") {
    return { title: fallbackTitle, code: value };
  }
  const item = asObject(value);
  const path = accessString(item.path);
  const command = accessString(item.command);
  const label = accessString(item.id) || accessString(item.title) || accessString(item.kind) || fallbackTitle;
  const purpose = accessString(item.purpose) || accessString(item.reason) || accessString(item.description);
  const cwd = accessString(item.cwd);
  const code = command || path || accessString(item.value);
  if (!label && !purpose && !code) return null;
  return {
    title: label,
    body: purpose,
    code,
    meta: cwd ? `cwd: ${cwd}` : undefined,
    chips: accessArrayStrings(item.fields),
  };
}

function rowsFromArray(value: unknown, fallbackTitle: string): AccessRow[] {
  return asArray(value)
    .map((item, index) => rowFromPathLike(item, `${fallbackTitle} ${index + 1}`))
    .filter((row): row is AccessRow => Boolean(row));
}

function rowsFromRecord(value: unknown): AccessRow[] {
  return Object.entries(asObject(value))
    .map(([key, entry]) => {
      if (typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean") {
        return { title: key, code: String(entry) };
      }
      const row = rowFromPathLike(entry, key);
      return row ? { ...row, title: row.title === key ? key : `${key}: ${row.title}` } : null;
    })
    .filter((row): row is AccessRow => Boolean(row));
}

function toolRows(prompt: string): AccessRow[] {
  const value = taggedJson(prompt, "available_pi_tools_json");
  const compactToolIds = accessArrayStrings(asObject(value).tool_ids);
  if (compactToolIds.length) {
    return compactToolIds.map((toolId) => ({ title: toolId }));
  }
  return asArray(value)
    .map((item): AccessRow | null => {
      const tool = asObject(item);
      const title = accessString(tool.id);
      if (!title) return null;
      return {
        title,
        body: accessString(tool.purpose),
        chips: accessArrayStrings(tool.capabilities),
      };
    })
    .filter((row): row is AccessRow => Boolean(row));
}

function attachedToolRows(context: JsonRecord, useWorkerFallback: boolean): AccessRow[] {
  const rows = asArray(context.attached_tools)
    .map((item): AccessRow | null => {
      const tool = asObject(item);
      const title = accessString(tool.id);
      if (!title) return null;
      return {
        title,
        body: accessString(tool.purpose),
        chips: accessArrayStrings(tool.capabilities),
      };
    })
    .filter((row): row is AccessRow => Boolean(row));
  if (rows.length) return rows;
  if (!useWorkerFallback) return [];
  return defaultWorkerToolProfile.map((toolId) => ({
    title: toolId,
    meta: "Default worker tool attached by the launcher.",
  }));
}

function availableToolsRows(prompt: string): AccessRow[] {
  const block = taggedXml(prompt, "available_tools");
  if (!block) return [];
  const rows: AccessRow[] = [];
  const groupPattern = /<tool_group\b([^>]*)>([\s\S]*?)<\/tool_group>/gi;
  for (const groupMatch of block.body.matchAll(groupPattern)) {
    const groupAttrs = xmlAttributes(groupMatch[1] ?? "");
    const provider = accessString(groupAttrs.provider);
    const type = accessString(groupAttrs.type);
    const toolPattern = /<tool\b([^>]*)\/>/gi;
    for (const toolMatch of (groupMatch[2] ?? "").matchAll(toolPattern)) {
      const attrs = xmlAttributes(toolMatch[1] ?? "");
      const name = accessString(attrs.name);
      if (!name) continue;
      const label = accessString(attrs.label);
      rows.push({
        title: name,
        body: accessString(attrs.use_when),
        meta: label && label !== name ? label : undefined,
        chips: [provider, type].filter(Boolean),
      });
    }
  }
  return rows;
}

function targetFileRows(prompt: string): AccessRow[] {
  const targetFile = taggedXml(prompt, "target_file");
  if (!targetFile) return [];
  const path = accessString(targetFile.attrs.path);
  const unit = accessString(targetFile.attrs.unit);
  const symbol = accessString(targetFile.attrs.symbol);
  const size = accessString(targetFile.attrs.size);
  const baseline = accessString(targetFile.attrs.baseline_match_percent);
  const contentUnavailable = /<content\b[^>]*\bunavailable="true"/i.test(targetFile.body);
  const content = /<!\[CDATA\[([\s\S]*?)\]\]>/.exec(targetFile.body)?.[1] ?? "";
  const lineCount = content ? content.split(/\r\n|\r|\n/).filter((line, index, lines) => line || index < lines.length - 1).length : 0;
  const chips = [
    unit ? `unit: ${unit}` : "",
    symbol ? `symbol: ${symbol}` : "",
    size ? `size: ${size}` : "",
    baseline ? `baseline: ${baseline}%` : "",
    contentUnavailable ? "content unavailable" : content ? `${formatCount(lineCount)} lines included` : "",
  ].filter(Boolean);
  return [
    {
      title: path || "Target file",
      body: [unit, symbol].filter(Boolean).join(" / "),
      code: path,
      meta: contentUnavailable ? "Target file content was not available when this prompt rendered." : "Target file content is included in the rendered XML block.",
      chips,
    },
  ];
}

function baselineRows(prompt: string): AccessRow[] {
  const baseline = taggedXml(prompt, "baseline");
  if (!baseline) return [];
  const details = asObject(taggedJson(baseline.body, "details_json"));
  const matchPercent = accessString(details.fuzzy_match_percent) || accessString(details.match_percent) || accessString(baseline.attrs.match_percent);
  const currentScores = firstObject(details.current_scores, details.measures);
  const currentScoreCount = Object.keys(currentScores).length;
  return [
    {
      title: "Baseline",
      body: currentScoreCount ? `${formatCount(currentScoreCount)} current scores included` : matchPercent ? `target score: ${matchPercent}%` : "",
      chips: [matchPercent ? `target: ${matchPercent}%` : "", currentScoreCount ? `${formatCount(currentScoreCount)} current scores` : ""].filter(Boolean),
    },
  ];
}

function targetGraphFileCardRows(prompt: string): AccessRow[] {
  const block = taggedXml(prompt, "target_graph_file_card");
  if (!block) return [];
  const details = asObject(taggedJson(block.body, "details_json"));
  const editability = asObject(details.editability);
  const searchLeads = asObject(details.search_leads);
  const targetFunction = firstObject(searchLeads.target_function, details.target_function);
  const symbols = asObject(searchLeads.symbols);
  const pastPrs = asObject(searchLeads.past_prs);
  const patternCount = asArray(searchLeads.mismatch_patterns).length || asArray(details.mismatch_patterns).length;
  const neighborCount = asArray(searchLeads.same_file_functions).length || asArray(details.same_file_functions).length;
  const sameFileSymbolCount = accessArrayStrings(symbols.same_file_symbols).length;
  const resourceCount = asArray(searchLeads.resources).length || asArray(details.resource_hits).length;
  const pastPrCount = asArray(pastPrs.touching_prs).length;
  const followUpCount = asArray(searchLeads.follow_up_queries).length || asArray(details.follow_up_queries).length;
  const status = accessString(details.status);
  const sourcePath = accessString(details.source_path);
  const targetName = accessString(targetFunction.name) || accessString(targetFunction.symbol);
  return [
    {
      title: "Target graph search leads",
      body: targetName ? `target: ${targetName}` : sourcePath,
      code: sourcePath,
      meta: accessString(details.authority) || accessString(details.reason),
      chips: [
        status,
        accessString(editability.mode) ? `editability: ${accessString(editability.mode)}` : "",
        patternCount ? `${formatCount(patternCount)} patterns` : "",
        sameFileSymbolCount ? `${formatCount(sameFileSymbolCount)} same-file symbols` : "",
        neighborCount && !sameFileSymbolCount ? `${formatCount(neighborCount)} same-file functions` : "",
        pastPrCount ? `${formatCount(pastPrCount)} PRs` : "",
        resourceCount ? `${formatCount(resourceCount)} resources` : "",
        followUpCount ? `${formatCount(followUpCount)} follow-ups` : "",
      ].filter(Boolean),
    },
  ];
}

function compactRecord(record: JsonRecord): JsonRecord {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== "" && value !== null && value !== undefined));
}

function workerTargetBaselineJson(prompt: string): string {
  const target = taggedXml(prompt, "target");
  const targetFile = taggedXml(prompt, "target_file");
  const baseline = taggedXml(prompt, "baseline");
  const state: JsonRecord = {};

  const targetDetails = target ? asObject(taggedJson(target.body, "details_json")) : {};
  if (Object.keys(targetDetails).length) {
    state.target = targetDetails;
  } else if (targetFile) {
    state.target = compactRecord({
      path: accessString(targetFile.attrs.path),
      unit: accessString(targetFile.attrs.unit),
      symbol: accessString(targetFile.attrs.symbol),
      size: accessString(targetFile.attrs.size),
    });
  }

  if (baseline) {
    const baselineDetails = asObject(taggedJson(baseline.body, "details_json"));
    state.baseline = Object.keys(baselineDetails).length
      ? baselineDetails
      : compactRecord({
          match_percent: accessString(baseline.attrs.match_percent),
        });
  }

  return Object.keys(state).length ? JSON.stringify(state, null, 2) : "";
}

function standardsRows(prompt: string): { count: number; rows: AccessRow[] } {
  const block = taggedXml(prompt, "decomp_standards");
  if (!block) return { count: 0, rows: [] };
  const count = [...block.body.matchAll(/<standard\b/gi)].length;
  return {
    count,
    rows: [
      {
        title: "Decomp standards",
        body: "Global standards are injected in this rendered prompt.",
        chips: count ? [`${formatCount(count)} standards`] : [],
      },
    ],
  };
}

function filesToReadRows(prompt: string): AccessRow[] {
  return rowsFromArray(taggedJson(prompt, "files_to_read_first_json"), "File");
}

function resourceGroups(prompt: string): AccessGroup[] {
  const resources = asObject(taggedJson(prompt, "available_resources_json"));
  if (!Object.keys(resources).length) return [];
  const compactKeyPaths = asObject(resources.key_paths);
  if (Object.keys(compactKeyPaths).length) {
    return [
      {
        id: "resources",
        title: "Key Resources",
        rows: [...rowsFromRecord(compactKeyPaths), ...rowsFromRecord(resources.objective)],
        emptyText: "No key resources are listed in the rendered prompt.",
      },
      {
        id: "policy",
        title: "Policy",
        rows: rowsFromRecord(resources.policy),
        emptyText: "No resource policy is listed in the rendered prompt.",
      },
    ];
  }
  const agentContext = asObject(resources.agent_context);
  const pastPrs = asObject(resources.past_prs);
  const decompResources = asObject(resources.decomp_resources);
  const knowledgeGraph = asObject(resources.knowledge_graph);

  const resourceRows = [
    ...rowsFromRecord(resources.roots),
    ...rowsFromArray(resources.progress_inputs, "Progress input"),
    ...rowsFromArray(resources.target_metadata, "Target metadata"),
    ...rowsFromArray(resources.local_context, "Local context"),
    rowFromPathLike(asObject(pastPrs.structured_index), "Past PR structured index"),
    rowFromPathLike(pastPrs.known_fixes, "Past PR known fixes"),
    ...rowsFromArray(pastPrs.raw_analysis, "Past PR analysis"),
    rowFromPathLike(decompResources.index, "Resource guide index"),
    rowFromPathLike(decompResources.notes, "Resource guide notes"),
    rowFromPathLike(decompResources.data_sheet_csv_dir, "Data sheet CSV directory"),
    ...rowsFromArray(decompResources.data_sheet_csvs, "Data sheet CSV"),
    rowFromPathLike(decompResources.powerpc_index, "PowerPC index"),
    ...rowsFromArray(decompResources.external_hint_indexes, "External hint index"),
    rowFromPathLike(knowledgeGraph.sources_root, "Knowledge sources root"),
    rowFromPathLike(knowledgeGraph.tools_root, "Knowledge tools root"),
    rowFromPathLike(knowledgeGraph.graph_root, "Knowledge graph root"),
    rowFromPathLike(knowledgeGraph.graph_db, "Knowledge graph DB"),
    {
      title: "Knowledge graph IDs",
      body: accessString(knowledgeGraph.cli_policy),
      chips: [...accessArrayStrings(knowledgeGraph.source_ids), ...accessArrayStrings(knowledgeGraph.tool_ids)],
    },
  ].filter((row): row is AccessRow => Boolean(row));

  return [
    {
      id: "agent-context",
      title: "Agent Context Files",
      rows: [...rowsFromArray(agentContext.selected_references, "Context file"), ...rowsFromRecord(agentContext.scripts)],
      emptyText: "No context files are listed in the rendered prompt.",
    },
    {
      id: "resources",
      title: "Resources",
      rows: resourceRows,
      emptyText: "No resources are listed in the rendered prompt.",
    },
    {
      id: "commands",
      title: "Commands And Tools",
      rows: [
        ...rowsFromArray(resources.helper_scripts, "Helper script"),
        ...rowsFromArray(resources.optional_experimental_tools, "Experimental tool"),
        ...rowsFromArray(resources.commands, "Command"),
        ...rowsFromArray(knowledgeGraph.commands, "Knowledge graph command"),
        ...rowsFromArray(resources.optional_experimental_commands, "Experimental command"),
      ],
      emptyText: "No commands are listed in the rendered prompt.",
    },
  ];
}

function buildAccessGroups(agent: PromptPreviewAgentId, prompt: string, context: JsonRecord): AccessGroup[] {
  const targetFiles = targetFileRows(prompt);
  const baselines = baselineRows(prompt);
  const targetGraphFileCard = targetGraphFileCardRows(prompt);
  const isWorker = agent === "worker";
  const attachedTools = attachedToolRows(context, isWorker);
  const availableTools = availableToolsRows(prompt);
  const standards = standardsRows(prompt);
  if (isWorker) {
    return [
      {
        id: "available-tools",
        title: "Available Tools",
        rows: availableTools.length ? availableTools : attachedTools,
        emptyText: "This rendered worker prompt does not include an available tools block.",
        summaryLabel: "tools",
      },
      {
        id: "target-file",
        title: "Target File",
        rows: targetFiles,
        emptyText: "This rendered worker prompt does not include a target file block.",
        summaryLabel: "target file",
      },
      {
        id: "baseline",
        title: "Baseline",
        rows: baselines,
        emptyText: "This rendered worker prompt does not include a baseline block.",
        summaryLabel: "baseline",
      },
      {
        id: "target-graph-file-card",
        title: "Target Graph File Card",
        rows: targetGraphFileCard,
        emptyText: "This rendered worker prompt does not include a target graph file card.",
        summaryLabel: "graph card",
      },
      {
        id: "standards",
        title: "Standards",
        rows: standards.rows,
        emptyText: "This rendered worker prompt does not include injected standards.",
        summaryLabel: "standards",
        badgeCount: standards.count,
      },
    ].filter((group) => group.rows.length);
  }

  const tools = availableTools.length ? availableTools : attachedTools.length ? attachedTools : toolRows(prompt);
  const files = filesToReadRows(prompt);
  return [
    {
      id: "pi-tools",
      title: availableTools.length ? "Available Tools" : attachedTools.length ? "Attached Tools" : "Pi Tools",
      rows: tools,
      emptyText: "This rendered agent prompt does not declare Pi custom tools.",
      summaryLabel: "tools",
    },
    {
      id: "files",
      title: "Files To Read First",
      rows: files,
      emptyText: "This rendered agent prompt does not declare first-read files.",
    },
    ...resourceGroups(prompt),
  ].filter((group) => group.rows.length);
}

function InspectorSection({ badge, children, title }: { badge?: ReactNode; children: ReactNode; title: string }) {
  return (
    <details className="prompt-inspector-section">
      <summary>
        <span>{title}</span>
        {badge != null ? <span>{badge}</span> : null}
      </summary>
      <div className="prompt-inspector-section-body">{children}</div>
    </details>
  );
}

function AccessGroupView({ group }: { group: AccessGroup }) {
  const badgeCount = group.badgeCount ?? group.rows.length;
  return (
    <details className="prompt-access-group">
      <summary>
        <span>{group.title}</span>
        <span>{badgeCount}</span>
      </summary>
      {group.rows.length ? (
        <div className="prompt-access-rows">
          {group.rows.map((row, index) => (
            <div className="prompt-access-row" key={`${group.id}-${row.title}-${index}`}>
              <div className="prompt-access-row-title">{row.title}</div>
              {row.body ? <div className="prompt-access-row-body">{row.body}</div> : null}
              {row.code ? <code className="prompt-access-row-code">{row.code}</code> : null}
              {row.meta ? <div className="prompt-access-row-meta">{row.meta}</div> : null}
              {row.chips?.length ? (
                <div className="prompt-access-chips">
                  {row.chips.map((chip) => (
                    <span key={chip}>{chip}</span>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="prompt-muted">{group.emptyText}</p>
      )}
    </details>
  );
}

function AgentAccessPanel({ agent, context, prompt }: { agent: PromptPreviewAgentId; context: JsonRecord; prompt: string }) {
  const groups = useMemo(() => buildAccessGroups(agent, prompt, context), [agent, context, prompt]);
  const title = agent === "worker" ? "Worker Launch Inputs" : agent === "pr-review" ? "PR Intake Access" : agent === "knowledge-curator" ? "Curator Access" : "Agent Access";

  return (
    <InspectorSection badge={formatCount(groups.reduce((total, group) => total + (group.badgeCount ?? group.rows.length), 0))} title={title}>
      <div className="prompt-access-summary">
        {groups.length ? (
          groups.map((group) => (
            <span key={group.id}>
              {formatCount(group.badgeCount ?? group.rows.length)} {group.summaryLabel ?? group.title.toLowerCase()}
            </span>
          ))
        ) : (
          <span>0 prompt inputs</span>
        )}
      </div>
      <div className="prompt-access-list">
        {groups.length ? groups.map((group) => <AccessGroupView group={group} key={group.id} />) : <p className="prompt-muted">No access blocks are listed in the rendered prompt.</p>}
      </div>
    </InspectorSection>
  );
}

function PromptStats({ attachedToolCount = 0, stats }: { attachedToolCount?: number; stats: PromptPreviewStats }) {
  return (
    <div className="prompt-stats">
      <span>{formatCount(stats.tokens)} tokens</span>
      {attachedToolCount > 0 ? <span>{formatCount(attachedToolCount)} attached tools</span> : null}
    </div>
  );
}

function PromptFontControls({
  fontSize,
  onDecrease,
  onIncrease,
}: {
  fontSize: number;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  return (
    <div aria-label="Prompt text size" className="prompt-font-controls" role="group">
      <button aria-label="Decrease prompt text size" disabled={fontSize <= MIN_PROMPT_FONT_SIZE} onClick={onDecrease} title="Decrease prompt text size" type="button">
        <Minus size={14} />
      </button>
      <span aria-live="polite">{fontSize}px</span>
      <button aria-label="Increase prompt text size" disabled={fontSize >= MAX_PROMPT_FONT_SIZE} onClick={onIncrease} title="Increase prompt text size" type="button">
        <Plus size={14} />
      </button>
    </div>
  );
}

function PromptDocument({
  fontSize,
  onDecreaseFontSize,
  onCopy,
  onIncreaseFontSize,
  templatePath,
  attachedToolCount,
  text: prompt,
  title,
}: {
  attachedToolCount?: number;
  fontSize: number;
  onDecreaseFontSize: () => void;
  onCopy: () => void;
  onIncreaseFontSize: () => void;
  templatePath: string;
  text: string;
  title: string;
}) {
  const stats = useMemo(() => promptStats(prompt), [prompt]);
  return (
    <section className="prompt-document">
      <header className="prompt-document-header">
        <div className="min-w-0">
          <div className="prompt-document-title">{title}</div>
          <div className="prompt-template-path" title={templatePath}>
            {templatePath}
          </div>
        </div>
        <div className="prompt-document-actions">
          <PromptFontControls fontSize={fontSize} onDecrease={onDecreaseFontSize} onIncrease={onIncreaseFontSize} />
          <Button className="h-8 min-w-8 px-2" icon={<Copy size={14} />} onClick={onCopy} title={`Copy ${title.toLowerCase()} prompt`} type="button">
            Copy
          </Button>
        </div>
      </header>
      <PromptStats attachedToolCount={attachedToolCount} stats={stats} />
      {stats.unresolvedPlaceholders.length ? <div className="prompt-warning-line">Unresolved: {stats.unresolvedPlaceholders.join(", ")}</div> : null}
      <div className="prompt-document-body">
        <RenderedPrompt fontSize={fontSize} text={prompt} />
      </div>
    </section>
  );
}

export function AgentViewer() {
  const [config, setConfig] = useState<UiConfig | null>(null);
  const [form, setForm] = useState<AgentViewerForm>(defaultPromptForm);
  const [agent, setAgent] = useState<PromptPreviewAgentId>("worker");
  const [source, setSource] = useState<PromptPreviewSource>("latest");
  const [promptKind, setPromptKind] = useState<PromptKind>("user");
  const [preview, setPreview] = useState<PromptPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);
  const [promptFontSize, setPromptFontSize] = useState(DEFAULT_PROMPT_FONT_SIZE);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);

  useEffect(() => {
    void loadConfig()
      .then((loaded) => {
        setConfig(loaded);
        setForm({
          projectId: loaded.defaultProjectId,
          usePathOverrides: false,
          repoRoot: loaded.defaultRepoRoot,
          stateDir: loaded.defaultStateDir,
          graphDbPath: loaded.defaultGraphDbPath,
        });
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : String(loadError)));
  }, []);

  useEffect(() => {
    if (!config) return;
    setLoading(true);
    setError("");
    void fetchPromptPreview(form, agent, source)
      .then(setPreview)
      .catch((loadError) => {
        setPreview(null);
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      })
      .finally(() => setLoading(false));
  }, [agent, config, form, refreshTick, source]);

  const projects = config?.availableProjects ?? [];
  const selectedProject = projects.find((project) => project.id === form.projectId) ?? config?.selectedProject ?? null;
  const context = asObject(preview?.context);
  const contextJson = text(context.renderedContextJson) || JSON.stringify(preview?.context ?? {}, null, 2);
  const contextSummary = preview ? `${preview.contextSource === "latest" ? "latest run" : "sample"} / ${preview.agent}` : "loading";
  const projectLabel = preview?.project?.displayName ?? selectedProject?.displayName ?? form.projectId;
  const graphLabel = preview?.graphDbPath ?? form.graphDbPath;
  const hydratedSystemPrompt = useMemo(() => hydratePromptPlaceholders(preview?.systemPrompt ?? "", context), [context, preview?.systemPrompt]);
  const hydratedUserPrompt = useMemo(() => hydratePromptPlaceholders(preview?.userPrompt ?? "", context), [context, preview?.userPrompt]);
  const attachedToolCount = useMemo(() => (preview?.agent === "worker" ? attachedToolRows(context, true).length : 0), [context, preview?.agent]);
  const workerTargetBaseline = useMemo(() => workerTargetBaselineJson(hydratedUserPrompt), [hydratedUserPrompt]);
  const inspectorJson = preview?.agent === "worker" && workerTargetBaseline ? workerTargetBaseline : contextJson;
  const inspectorTitle = preview?.agent === "worker" && workerTargetBaseline ? "Target / Baseline" : "Injected Context";
  const inspectorCopyLabel = preview?.agent === "worker" && workerTargetBaseline ? "Target / Baseline" : "Context";
  const activePrompt = preview
    ? promptKind === "system"
      ? {
          label: "System Prompt",
          text: hydratedSystemPrompt,
          templatePath: preview.systemTemplatePath,
        }
      : {
          label: "User Prompt",
          text: hydratedUserPrompt,
          templatePath: preview.userTemplatePath,
        }
    : null;

  const copyText = useCallback(async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied((current) => (current === label ? "" : current)), 1400);
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : String(copyError));
    }
  }, []);

  return (
    <main className="prompt-app">
      <aside className={`prompt-sidebar${sidebarOpen ? "" : " collapsed"}`}>
        {sidebarOpen ? (
          <>
            <header className="prompt-sidebar-header">
              <FileText size={16} />
              <h1>Agent Viewer</h1>
              <button aria-label="Collapse sidebar" className="prompt-rail-button" onClick={() => setSidebarOpen(false)} title="Collapse sidebar" type="button">
                <PanelLeftClose size={15} />
              </button>
            </header>
            <div className="prompt-sidebar-body">
              <label>
                <span>Project</span>
                <select
                  disabled={form.usePathOverrides}
                  onChange={(event) => {
                    const project = projects.find((item) => item.id === event.currentTarget.value);
                    setForm({
                      projectId: event.currentTarget.value,
                      usePathOverrides: false,
                      repoRoot: project?.repoRoot ?? form.repoRoot,
                      stateDir: project?.stateDir ?? form.stateDir,
                      graphDbPath: project?.graphDbPath ?? form.graphDbPath,
                    });
                  }}
                  value={form.projectId}
                >
                  {(projects.length ? projects : selectedProject ? [selectedProject] : []).map((project) => (
                    <option key={project.id} value={project.id}>
                      {projectOptionLabel(project)}
                    </option>
                  ))}
                  {!projects.length && !selectedProject ? <option value="">Default paths</option> : null}
                </select>
              </label>

              <label>
                <span>Agent</span>
                <select onChange={(event) => setAgent(event.currentTarget.value as PromptPreviewAgentId)} value={agent}>
                  {agents.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Source</span>
                <select onChange={(event) => setSource(event.currentTarget.value as PromptPreviewSource)} value={source}>
                  {sources.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="prompt-checkbox">
                <input checked={form.usePathOverrides} onChange={(event) => setForm((current) => ({ ...current, usePathOverrides: event.currentTarget.checked }))} type="checkbox" />
                <span>Custom paths</span>
              </label>

              {form.usePathOverrides ? (
                <>
                  <label>
                    <span>Repo root</span>
                    <input onChange={(event) => setForm((current) => ({ ...current, repoRoot: event.currentTarget.value }))} spellCheck={false} value={form.repoRoot} />
                  </label>
                  <label>
                    <span>State dir</span>
                    <input onChange={(event) => setForm((current) => ({ ...current, stateDir: event.currentTarget.value }))} spellCheck={false} value={form.stateDir} />
                  </label>
                  <label>
                    <span>Graph DB</span>
                    <input onChange={(event) => setForm((current) => ({ ...current, graphDbPath: event.currentTarget.value }))} spellCheck={false} value={form.graphDbPath} />
                  </label>
                </>
              ) : null}

              <Button disabled={loading} icon={<RefreshCw size={14} />} onClick={() => setRefreshTick((tick) => tick + 1)} title="Render the selected prompt again" type="button">
                Refresh
              </Button>

              <div className="prompt-sidebar-info">
                <div>
                  <span>Context</span>
                  <strong>{contextSummary}</strong>
                </div>
                <div>
                  <span>Project</span>
                  <strong>{projectLabel || "-"}</strong>
                </div>
                <div>
                  <span>Graph</span>
                  <strong>{graphLabel || "-"}</strong>
                </div>
                {preview ? (
                  <>
                    <div>
                      <span>Checkout</span>
                      <strong>{preview.repoRoot}</strong>
                    </div>
                    <div>
                      <span>State</span>
                      <strong>{preview.stateDir}</strong>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </>
        ) : (
          <button aria-label="Expand sidebar" className="prompt-rail-button" onClick={() => setSidebarOpen(true)} title="Expand sidebar" type="button">
            <PanelLeftOpen size={15} />
          </button>
        )}
      </aside>

      <section className="prompt-main">
        {error ? <div className="prompt-error">{error}</div> : null}

        {preview && activePrompt ? (
          <div className="prompt-reader">
            <div className="prompt-prompt-selector" role="group" aria-label="Prompt">
              <button className={promptKind === "system" ? "active" : ""} onClick={() => setPromptKind("system")} type="button">
                System Prompt
              </button>
              <button className={promptKind === "user" ? "active" : ""} onClick={() => setPromptKind("user")} type="button">
                User Prompt
              </button>
            </div>
            <PromptDocument
              fontSize={promptFontSize}
              onDecreaseFontSize={() => setPromptFontSize((current) => clampPromptFontSize(current - 1))}
              onCopy={() => void copyText(promptKind === "system" ? "System" : "User", activePrompt.text)}
              onIncreaseFontSize={() => setPromptFontSize((current) => clampPromptFontSize(current + 1))}
              attachedToolCount={attachedToolCount}
              templatePath={activePrompt.templatePath}
              text={activePrompt.text}
              title={activePrompt.label}
            />
          </div>
        ) : (
          <div className="prompt-loading">{loading ? "Rendering prompt preview..." : "No prompt preview loaded."}</div>
        )}
      </section>

      <aside className={`prompt-inspector${inspectorOpen ? "" : " collapsed"}`}>
        {inspectorOpen ? (
          <>
            <header className="prompt-inspector-bar">
              <button aria-label="Collapse inspector" className="prompt-rail-button" onClick={() => setInspectorOpen(false)} title="Collapse inspector" type="button">
                <PanelRightClose size={15} />
              </button>
              <span>Inspector</span>
            </header>
            {preview ? (
              <>
                <InspectorSection badge={formatCount(preview.warnings.length)} title="Warnings">
                  {preview.warnings.length ? (
                    <ul className="prompt-warning-list">
                      {preview.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="prompt-muted">No render warnings.</p>
                  )}
                </InspectorSection>

                <AgentAccessPanel agent={preview.agent} context={context} prompt={hydratedUserPrompt} />

                <InspectorSection title={inspectorTitle}>
                  <div className="prompt-inspector-actions">
                    <Button className="h-8 min-w-8 px-2" icon={<Copy size={14} />} onClick={() => void copyText(inspectorCopyLabel, inspectorJson)} title={`Copy ${inspectorTitle.toLowerCase()} JSON`} type="button">
                      Copy
                    </Button>
                  </div>
                  <div className="prompt-context-json">
                    <JsonLineView text={inspectorJson} />
                  </div>
                </InspectorSection>
              </>
            ) : null}
          </>
        ) : (
          <button aria-label="Expand inspector" className="prompt-rail-button" onClick={() => setInspectorOpen(true)} title="Expand inspector" type="button">
            <PanelRightOpen size={15} />
          </button>
        )}
      </aside>

      {copied ? (
        <div className="prompt-toast">
          <Check size={14} />
          <strong>{copied} copied</strong>
        </div>
      ) : null}
    </main>
  );
}
