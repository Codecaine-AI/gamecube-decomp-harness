import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineContext } from "@agent-kernel/kernel/agent-definition";
import type { LoaderDeclaration } from "@agent-kernel/kernel/context";
import type {
  PiPromptBundle,
  RunProjectMetadata,
} from "@server/core/shared/types";
import {
  fileGraphCard,
  globalStandardsPromptXml,
  graphDbExists,
  openKnowledgeGraph,
  resourceGraphDbPath,
} from "@server/core/knowledge";
import {
  renderTemplate,
  stableJson,
} from "@server/infrastructure/agent-runtime/runtime";
import { availableToolsPromptXml, defaultWorkerToolProfile } from "@server/core/tools/index.js";
import {
  createInlineAgentContextResolver,
  defaultKernelTurnPrompt,
  promptKernelContext,
  rootContextLoaderDeclaration,
} from "@server/core/agent-catalog/kernel-context.js";
import { workerCanonicalToolPathsXml } from "./tool-paths.js";

export type WorkerPromptContextBudget = "full" | "compact" | "minimal";

export const WORKER_TARGET_FILE_INLINE_CHAR_LIMIT = 32_000;
export const WORKER_COMPACT_TARGET_FILE_INLINE_CHAR_LIMIT = 12_000;
export const WORKER_MINIMAL_TARGET_FILE_INLINE_CHAR_LIMIT = 3_000;

const WORKER_CONTEXT_BUDGETS = {
  full: {
    sourceLimit: WORKER_TARGET_FILE_INLINE_CHAR_LIMIT,
    tools: "full",
    standards: "full",
    graph: "full",
  },
  compact: {
    sourceLimit: WORKER_COMPACT_TARGET_FILE_INLINE_CHAR_LIMIT,
    tools: "summary",
    standards: "summary",
    graph: "summary",
  },
  minimal: {
    sourceLimit: WORKER_MINIMAL_TARGET_FILE_INLINE_CHAR_LIMIT,
    tools: "summary",
    standards: "minimal",
    graph: "minimal",
  },
} as const satisfies Record<
  WorkerPromptContextBudget,
  {
    sourceLimit: number;
    tools: "full" | "summary";
    standards: "full" | "summary" | "minimal";
    graph: "full" | "summary" | "minimal";
  }
>;

const loaders = [
  rootContextLoaderDeclaration,
  { kind: "worker-packet", ref: "worker-packet", label: "worker-packet" },
  {
    kind: "knowledge-graph-file-card",
    ref: "knowledge-graph-file-card",
    label: "knowledge-graph-file-card",
  },
] as const satisfies readonly LoaderDeclaration[];

export const context = defineContext(
  createInlineAgentContextResolver(loaders, defaultKernelTurnPrompt("worker")),
);

export interface WorkerPromptOptions {
  packet: Record<string, unknown>;
  repoRoot: string;
  stateDir: string;
  project?: RunProjectMetadata;
  initialBoardPath: string;
  workerLogDir: string;
  contextBudget?: WorkerPromptContextBudget;
}

export interface WorkerPromptInputXmlOptions {
  packet: Record<string, unknown>;
  repoRoot: string;
  project?: RunProjectMetadata;
  contextBudget?: WorkerPromptContextBudget;
}

export interface WorkerPromptInputXml {
  targetXml: string;
  baselineXml: string;
  targetGraphFileCardXml: string;
}

const WORKER_PACKET_CONTEXT_TEMPLATE = `
{{REPAIR_REQUEST_XML}}

{{TARGET_XML}}

{{BASELINE_XML}}

{{AVAILABLE_TOOLS_XML}}

{{CANONICAL_TOOL_PATHS_XML}}

{{DECOMP_STANDARDS_XML}}
`;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.map(asRecord).filter((item) => Object.keys(item).length > 0)
    : [];
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function optionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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

function cdata(value: string): string {
  return `<![CDATA[${value.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

function optionalAttribute(name: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  return ` ${name}="${xmlAttribute(value)}"`;
}

function jsonBlockXml(
  tag: string,
  value: unknown,
  indent = "        ",
): string {
  return [
    `${indent}<${tag}>`,
    "```json",
    stableJson(value),
    "```",
    `${indent}</${tag}>`,
  ].join("\n");
}

function compactValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    const compacted = value.map(compactValue).filter((item) => {
      if (item === null || item === undefined || item === "") return false;
      if (Array.isArray(item)) return item.length > 0;
      if (typeof item === "object")
        return Object.keys(item as Record<string, unknown>).length > 0;
      return true;
    });
    return compacted;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([key, entry]) => [key, compactValue(entry)] as const)
        .filter(([, entry]) => {
          if (entry === null || entry === undefined || entry === "")
            return false;
          if (Array.isArray(entry)) return entry.length > 0;
          if (typeof entry === "object")
            return Object.keys(entry as Record<string, unknown>).length > 0;
          return true;
        }),
    );
  }
  return value;
}

function compactObject(
  value: Record<string, unknown>,
): Record<string, unknown> {
  return compactValue(value) as Record<string, unknown>;
}

function stringArray(value: unknown, limit: number): string[] {
  return Array.isArray(value)
    ? value
        .map((item) => String(item ?? ""))
        .filter(Boolean)
        .slice(0, limit)
    : [];
}

function targetFileXml(
  target: Record<string, unknown>,
  baseline: Record<string, unknown>,
  primarySourcePath: string,
  primarySourceAbs: string,
  contextBudget: WorkerPromptContextBudget,
  indent = "    ",
): string {
  const budget = WORKER_CONTEXT_BUDGETS[contextBudget];
  const fileText = primarySourceAbs && existsSync(primarySourceAbs) ? readFileSync(primarySourceAbs, "utf8") : null;
  const originalChars = fileText?.length ?? null;
  const truncated = fileText != null && fileText.length > budget.sourceLimit;
  const inlineText = fileText == null
    ? null
    : truncated
      ? truncateTargetSourceForPrompt(fileText, budget.sourceLimit)
      : fileText;
  const attrs = [
    optionalAttribute("path", primarySourcePath),
    optionalAttribute("unit", optionalString(target.unit)),
    optionalAttribute("symbol", optionalString(target.symbol)),
    optionalAttribute("size", optionalNumber(target.size)),
    optionalAttribute(
      "baseline_match_percent",
      optionalNumber(baseline.fuzzy_match_percent) ??
        optionalNumber(target.fuzzy_match_percent),
    ),
    optionalAttribute("context_budget", contextBudget),
    truncated ? optionalAttribute("truncated", "true") : "",
    truncated ? optionalAttribute("original_chars", originalChars) : "",
    truncated ? optionalAttribute("inline_char_limit", budget.sourceLimit) : "",
  ].join("");
  if (fileText == null) {
    return [
      `${indent}<target_file${attrs}>`,
      `${indent}    <content unavailable="true">${xmlText(primarySourceAbs ? `File not found: ${primarySourceAbs}` : "No target source path provided.")}</content>`,
      `${indent}</target_file>`,
    ].join("\n");
  }
  return [
    `${indent}<target_file${attrs}>`,
    cdata(inlineText ?? ""),
    `${indent}</target_file>`,
  ].join("\n");
}

function truncateTargetSourceForPrompt(source: string, limit: number): string {
  if (source.length <= limit) return source;
  const markerBudget = 512;
  const sliceBudget = Math.max(1_000, limit - markerBudget);
  const headChars = Math.floor(sliceBudget * 0.55);
  const tailChars = sliceBudget - headChars;
  const omitted = source.length - headChars - tailChars;
  return [
    source.slice(0, headChars).trimEnd(),
    "",
    `[target source truncated after ${limit} characters; ${omitted} characters omitted. The full file is available at the target_file path in the worker checkout. Read the local file before editing code outside this excerpt.]`,
    "",
    source.slice(-tailChars).trimStart(),
  ].join("\n");
}

function targetXml(
  target: Record<string, unknown>,
  baseline: Record<string, unknown>,
  primarySourcePath: string,
  primarySourceAbs: string,
  contextBudget: WorkerPromptContextBudget,
): string {
  return [
    `    <target context_budget="${contextBudget}">`,
    jsonBlockXml("details_json", target),
    targetFileXml(
      target,
      baseline,
      primarySourcePath,
      primarySourceAbs,
      contextBudget,
      "        ",
    ),
    "    </target>",
  ].join("\n");
}

function baselineXml(baseline: Record<string, unknown>): string {
  return [
    "    <baseline>",
    jsonBlockXml("details_json", baseline),
    "    </baseline>",
  ].join("\n");
}

// Repair attempts must see why the runner rejected the previous return; the
// packet carries repair_request but only rendered blocks reach the agent.
function repairRequestXml(packet: Record<string, unknown>): string {
  const repair = asRecord(packet.repair_request);
  if (Object.keys(repair).length === 0) return "";
  return [
    "    <repair_request>",
    jsonBlockXml("details_json", repair),
    "    </repair_request>",
  ].join("\n");
}

function functionName(fn: Record<string, unknown>): string {
  return (
    optionalString(fn.name) ??
    optionalString(fn.symbol) ??
    optionalString(fn.function_name) ??
    optionalString(fn.id) ??
    ""
  );
}

function compactFunction(fn: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    name: functionName(fn),
    symbol: optionalString(fn.symbol),
    unit: optionalString(fn.unit),
    size: optionalNumber(fn.size),
    fuzzy_match_percent:
      optionalNumber(fn.fuzzy_match_percent) ??
      optionalNumber(fn.match_percent) ??
      optionalNumber(fn.fuzzy),
    status: optionalString(fn.status),
    build_status: optionalString(fn.build_status),
    reason: optionalString(fn.reason),
  });
}

function compactMismatchPattern(
  pattern: Record<string, unknown>,
): Record<string, unknown> {
  return compactObject({
    pattern_id:
      optionalString(pattern.pattern_id) ?? optionalString(pattern.id),
    title: optionalString(pattern.title),
    category: optionalString(pattern.category),
    symptoms: stringArray(pattern.symptoms, 4),
    tactics: stringArray(pattern.tactics, 4),
    evidence_count: optionalNumber(pattern.evidence_count),
    evidence_refs: stringArray(pattern.linked_evidence_refs, 4),
    linked_evidence: asRecordArray(pattern.linked_evidence)
      .slice(0, 3)
      .map((evidence) =>
        compactObject({
          title: optionalString(evidence.title),
          kind: optionalString(evidence.kind),
          evidence_ref: optionalString(evidence.evidence_ref),
          unit: optionalString(evidence.unit),
          symbol: optionalString(evidence.symbol),
          pr: evidence.pr ?? null,
        }),
      ),
  });
}

function compactTouchingPr(
  pr: Record<string, unknown>,
): Record<string, unknown> {
  return compactObject({
    pr: pr.pr ?? pr.number ?? pr.id ?? null,
    title: optionalString(pr.title) ?? optionalString(pr.summary),
    author: optionalString(pr.author),
    merged_at: optionalString(pr.merged_at) ?? optionalString(pr.date),
    role: optionalString(pr.role),
  });
}

function compactResourceHit(
  hit: Record<string, unknown>,
): Record<string, unknown> {
  return compactObject({
    source_id: optionalString(hit.source_id),
    title: optionalString(hit.title),
    evidence_ref: optionalString(hit.evidence_ref),
  });
}

function compactToolHit(
  hit: Record<string, unknown>,
): Record<string, unknown> {
  return compactObject({
    tool_id: optionalString(hit.tool_id),
    source_id: optionalString(hit.source_id),
    unit: optionalString(hit.unit),
    symbol: optionalString(hit.symbol),
    analog_unit: optionalString(hit.analog_unit),
    analog_symbol: optionalString(hit.analog_symbol),
    analog_source_path: optionalString(hit.analog_source_path),
    score: optionalNumber(hit.score),
    exact_match: hit.exact_match ?? null,
    matched: hit.matched ?? null,
    evidence_ref: optionalString(hit.evidence_ref),
  });
}

function compactPathFact(
  fact: Record<string, unknown>,
): Record<string, unknown> {
  return compactObject({
    id: optionalString(fact.id),
    title: optionalString(fact.title),
    directory: optionalString(fact.directory),
    strength: optionalString(fact.strength),
    summary: optionalString(fact.summary),
    evidence_refs: stringArray(fact.evidence_refs, 4),
    watched_paths: stringArray(fact.watched_paths, 4),
    slice_ref: fact.slice_ref ?? null,
  });
}

function fileCardFromPacket(packet: Record<string, unknown>): {
  card: Record<string, unknown>;
  graphDb: string | null;
  pathFacts: Record<string, unknown>;
  status: string | null;
  reason: string | null;
} {
  const knowledgeContext = asRecord(packet.knowledge_context);
  const rawFileCard = asRecord(knowledgeContext.file_card);
  const nestedFileCard = asRecord(rawFileCard.file_card);
  return {
    card: Object.keys(nestedFileCard).length ? nestedFileCard : rawFileCard,
    graphDb: optionalString(knowledgeContext.graph_db),
    pathFacts: asRecord(knowledgeContext.path_facts),
    status: optionalString(knowledgeContext.status),
    reason: optionalString(knowledgeContext.reason),
  };
}

function fileCardFromGraph(
  sourcePath: string,
  project?: RunProjectMetadata,
  graphDbOverride?: string | null,
): {
  card: Record<string, unknown>;
  graphDb: string | null;
  status: string;
  reason: string | null;
} {
  const graphDb =
    graphDbOverride || project?.graphDbPath || resourceGraphDbPath();
  if (!sourcePath)
    return {
      card: {},
      graphDb,
      status: "missing_source_path",
      reason: "No target source_path is available.",
    };
  if (!graphDbExists(graphDb))
    return {
      card: {},
      graphDb,
      status: "graph_missing",
      reason: "Knowledge graph DB is not available.",
    };
  const store = openKnowledgeGraph(graphDb);
  try {
    return {
      card: fileGraphCard(store, sourcePath) as unknown as Record<
        string,
        unknown
      >,
      graphDb,
      status: "ready",
      reason: null,
    };
  } catch (error) {
    return {
      card: {},
      graphDb,
      status: "failed",
      reason: error instanceof Error ? error.message : String(error),
    };
  } finally {
    store.db.close();
  }
}

function compactTargetGraphFileCard(
  packet: Record<string, unknown>,
  project?: RunProjectMetadata,
  contextBudget: WorkerPromptContextBudget = "full",
): Record<string, unknown> {
  const target = asRecord(packet.target);
  const sourcePath = String(target.source_path ?? "");
  const fromPacket = fileCardFromPacket(packet);
  const loaded = Object.keys(fromPacket.card).length
    ? { ...fromPacket, status: fromPacket.status ?? "ready" }
    : fileCardFromGraph(sourcePath, project, fromPacket.graphDb);
  const card = loaded.card;
  if (!Object.keys(card).length) {
    return compactObject({
      status: loaded.status ?? "unavailable",
      source: "code_graph_file_card",
      graph_db: loaded.graphDb,
      source_path: sourcePath,
      reason: loaded.reason,
      has_graph_context: false,
      search_leads: {
        symbols: compactObject({
          source_path: sourcePath,
        }),
        follow_up_queries: [
          compactObject({
            tool: "code_graph_file_card",
            source_path: sourcePath,
          }),
          compactObject({ tool: "code_graph_search", query: sourcePath }),
          compactObject({
            tool: "opseq_similar_functions",
            query: [sourcePath, optionalString(target.symbol)].filter(Boolean).join(" "),
          }),
        ],
      },
      no_context_note:
        loaded.reason ??
        "No graph context is attached to this target source path.",
    });
  }

  const functions = asRecordArray(card.functions)
    .map(compactFunction)
    .filter((fn) => Object.keys(fn).length > 0);
  const targetSymbol = optionalString(target.symbol);
  const targetFunction =
    functions.find(
      (fn) =>
        functionName(fn) === targetSymbol ||
        optionalString(fn.symbol) === targetSymbol,
    ) ?? null;
  const sameFileFunctions = functions
    .filter((fn) => fn !== targetFunction)
    .slice(0, contextBudget === "full" ? 10 : contextBudget === "compact" ? 5 : 0);
  const prHistory = asRecord(card.pr_history);
  const mismatchPatterns = asRecordArray(card.mismatch_patterns)
    .slice(0, contextBudget === "full" ? 6 : contextBudget === "compact" ? 3 : 0)
    .map(compactMismatchPattern);
  const touchingPrs = asRecordArray(prHistory.touching_prs)
    .slice(0, contextBudget === "full" ? 6 : contextBudget === "compact" ? 2 : 0)
    .map(compactTouchingPr);
  const resourceHits = asRecordArray(card.resource_hits)
    .slice(0, contextBudget === "full" ? 8 : contextBudget === "compact" ? 3 : 0)
    .map(compactResourceHit);
  const toolHits = asRecordArray(card.tool_hits)
    .filter((hit) => optionalString(hit.tool_id) === "opseq")
    .slice(0, contextBudget === "full" ? 8 : contextBudget === "compact" ? 4 : 2)
    .map(compactToolHit);
  const pathFacts = asRecordArray(fromPacket.pathFacts.facts)
    .slice(0, contextBudget === "full" ? 5 : contextBudget === "compact" ? 3 : 1)
    .map(compactPathFact);
  const unitNames = asRecordArray(card.units)
    .map((unit) => optionalString(unit.unit) ?? optionalString(unit.name))
    .filter((unit): unit is string => Boolean(unit));
  const sameFileSymbols = sameFileFunctions
    .map((fn) => optionalString(fn.symbol) ?? functionName(fn))
    .filter(Boolean)
    .slice(0, 10);
  const mismatchQueries = mismatchPatterns
    .map((pattern) => optionalString(pattern.title))
    .filter((title): title is string => Boolean(title))
    .slice(0, 4);
  const followUpQueries = [
    compactObject({ tool: "code_graph_file_card", source_path: sourcePath }),
    compactObject({
      tool: "code_graph_search",
      query: [sourcePath, targetSymbol].filter(Boolean).join(" "),
    }),
    compactObject({
      tool: "opseq_similar_functions",
      query: [sourcePath, targetSymbol].filter(Boolean).join(" "),
    }),
    compactObject({
      tool: "past_prs_search",
      query: [sourcePath, targetSymbol].filter(Boolean).join(" "),
    }),
    ...(mismatchQueries.length
      ? [
          compactObject({
            tool: "mismatch_db_search",
            query: mismatchQueries.join(" OR "),
          }),
        ]
      : []),
  ];

  if (contextBudget === "minimal") {
    return compactObject({
      status: "ready",
      source: "code_graph_file_card",
      context_budget: contextBudget,
      source_path: optionalString(card.source_path) ?? sourcePath,
      has_graph_context: Boolean(targetFunction || toolHits.length > 0 || pathFacts.length > 0),
      search_leads: {
        symbols: {
          source_path: optionalString(card.source_path) ?? sourcePath,
          target_symbol: targetSymbol,
        },
        target_function: targetFunction,
        opseq_analogs: toolHits,
        path_facts: pathFacts,
        follow_up_queries: followUpQueries.slice(0, 3),
      },
      compaction_note:
        "Minimal context budget after provider context-window rejection. Use local source and graph/search tools for additional context.",
    });
  }

  return compactObject({
    status: "ready",
    source: "code_graph_file_card",
    context_budget: contextBudget,
    authority:
      "Graph-derived context. Current source, headers, objdiff, and validation output outrank this summary.",
    graph_db: loaded.graphDb,
    source_path: optionalString(card.source_path) ?? sourcePath,
    has_graph_context: Boolean(
      functions.length > 0 ||
      mismatchPatterns.length > 0 ||
      touchingPrs.length > 0 ||
      resourceHits.length > 0 ||
      toolHits.length > 0 ||
      pathFacts.length > 0,
    ),
    editability: asRecord(card.editability),
    search_leads: {
      symbols: {
        source_path: optionalString(card.source_path) ?? sourcePath,
        units: unitNames.slice(0, 8),
        target_symbol: targetSymbol,
        same_file_symbols: sameFileSymbols,
      },
      target_function: targetFunction,
      same_file_functions: sameFileFunctions,
      mismatch_patterns: mismatchPatterns,
      past_prs: {
        touching_prs: touchingPrs,
        search_terms: [targetSymbol, sourcePath, ...mismatchQueries]
          .filter(Boolean)
          .slice(0, 8),
      },
      resources: resourceHits,
      opseq_analogs: toolHits,
      path_facts: pathFacts,
      review_risks: asRecordArray(prHistory.review_risks).slice(0, contextBudget === "full" ? 6 : 2),
      tactics: asRecordArray(prHistory.tactics).slice(0, contextBudget === "full" ? 6 : 2),
      follow_up_queries: followUpQueries,
    },
    no_context_note:
      functions.length === 0 &&
      mismatchPatterns.length === 0 &&
      touchingPrs.length === 0 &&
      resourceHits.length === 0 &&
      toolHits.length === 0 &&
      pathFacts.length === 0
        ? "Graph file card had no attached functions, patterns, PRs, resources, opseq analogs, or path facts for this source path."
        : null,
  });
}

function targetGraphFileCardXml(
  packet: Record<string, unknown>,
  project?: RunProjectMetadata,
  contextBudget: WorkerPromptContextBudget = "full",
): string {
  const compactCard = compactTargetGraphFileCard(packet, project, contextBudget);
  const status = optionalString(compactCard.status);
  const unavailable = status && status !== "ready" ? ' unavailable="true"' : "";
  return [
    `    <target_graph_file_card context_budget="${contextBudget}"${unavailable}>`,
    jsonBlockXml("details_json", compactCard),
    "    </target_graph_file_card>",
  ].join("\n");
}

function contextBudgetXml(contextBudget: WorkerPromptContextBudget): string {
  const budget = WORKER_CONTEXT_BUDGETS[contextBudget];
  return [
    `    <context_budget mode="${contextBudget}" target_file_inline_char_limit="${budget.sourceLimit}">`,
    contextBudget === "full"
      ? "        Normal worker context budget. Large target files are still excerpted; read the local file for complete source before editing."
      : contextBudget === "compact"
        ? "        Compact retry budget after a context-window rejection. Big source/tool/standards/graph blocks are reduced; use local files and tools for details."
        : "        Minimal retry budget after repeated context-window rejection. Treat injected context as task coordinates only; read local files and query tools for needed detail.",
    "    </context_budget>",
  ].join("\n");
}

function availableToolsBudgetXml(
  contextBudget: WorkerPromptContextBudget,
  toolContext: Parameters<typeof availableToolsPromptXml>[0],
): string {
  if (WORKER_CONTEXT_BUDGETS[contextBudget].tools === "full") return availableToolsPromptXml(toolContext);
  return [
    `    <available_tools context_budget="${contextBudget}" compacted="true">`,
    `        <summary>${xmlText("Worker tools are registered in the runtime. Use the tool schema shown by the agent shell/runtime; this compact block avoids duplicating every tool description in the model prompt.")}</summary>`,
    `        <tool_names>${xmlText(defaultWorkerToolProfile.join(", "))}</tool_names>`,
    "    </available_tools>",
  ].join("\n");
}

function decompStandardsBudgetXml(contextBudget: WorkerPromptContextBudget): string {
  const mode = WORKER_CONTEXT_BUDGETS[contextBudget].standards;
  if (mode === "full") return globalStandardsPromptXml();
  const rules =
    mode === "summary"
      ? [
          "Preserve local style and original-author source shapes.",
          "Prefer nearby solved source evidence over broad rewrites.",
          "Avoid destructive resets and preserve pre-existing dirty work.",
          "Validate retained edits with runner/checkdiff/build/review evidence.",
          "Do not hand-pack strings/data when normal source ownership is available.",
        ]
      : [
          "Preserve local style, pre-existing dirty work, and runner evidence.",
          "Read local standards/source if a choice is ambiguous.",
        ];
  return [
    `    <decomp_standards context_budget="${contextBudget}" compacted="true">`,
    ...rules.map((rule) => `        <rule>${xmlText(rule)}</rule>`),
    "    </decomp_standards>",
  ].join("\n");
}

export function workerPromptInputXml(
  options: WorkerPromptInputXmlOptions,
): WorkerPromptInputXml {
  const contextBudget = options.contextBudget ?? "full";
  const target = (options.packet.target ?? {}) as Record<string, unknown>;
  const baseline = asRecord(options.packet.baseline);
  const primarySourcePath = String(target.source_path ?? "");
  const primarySourceAbs = primarySourcePath
    ? resolve(options.repoRoot, primarySourcePath)
    : "";
  return {
    targetXml: targetXml(target, baseline, primarySourcePath, primarySourceAbs, contextBudget),
    baselineXml: baselineXml(baseline),
    targetGraphFileCardXml: targetGraphFileCardXml(
      options.packet,
      options.project,
      contextBudget,
    ),
  };
}

export function buildWorkerKernelContext(
  options: WorkerPromptOptions,
): NonNullable<PiPromptBundle["kernelContext"]> {
  const contextBudget = options.contextBudget ?? "full";
  const inputXml = workerPromptInputXml({
    packet: options.packet,
    repoRoot: options.repoRoot,
    project: options.project,
    contextBudget,
  });
  const toolContext = {
    role: "worker" as const,
    cwd: options.repoRoot,
    repoRoot: options.repoRoot,
    stateDir: options.stateDir,
    project: options.project,
    packet: options.packet,
    initialBoardPath: options.initialBoardPath,
    workerLogDir: options.workerLogDir,
  };
  const values = {
    AVAILABLE_TOOLS_XML: availableToolsBudgetXml(contextBudget, toolContext),
    BASELINE_XML: inputXml.baselineXml,
    CANONICAL_TOOL_PATHS_XML: workerCanonicalToolPathsXml(options.repoRoot),
    CONTEXT_BUDGET_XML: contextBudgetXml(contextBudget),
    DECOMP_STANDARDS_XML: decompStandardsBudgetXml(contextBudget),
    REPAIR_REQUEST_XML: repairRequestXml(options.packet),
    TARGET_GRAPH_FILE_CARD_XML: inputXml.targetGraphFileCardXml,
    TARGET_XML: inputXml.targetXml,
  };
  const workerPacketContext = renderTemplate(
    `{{CONTEXT_BUDGET_XML}}\n\n${WORKER_PACKET_CONTEXT_TEMPLATE}`,
    values,
  ).trim();
  const renderedContext = [
    workerPacketContext,
    values.TARGET_GRAPH_FILE_CARD_XML,
  ]
    .filter(Boolean)
    .join("\n\n");
  return promptKernelContext(
    renderedContext,
    [
      {
        loaderKind: "worker-packet",
        inputRef: "worker-packet",
        content: workerPacketContext,
      },
      {
        loaderKind: "knowledge-graph-file-card",
        inputRef: "knowledge-graph-file-card",
        content: values.TARGET_GRAPH_FILE_CARD_XML,
      },
    ],
    defaultKernelTurnPrompt("worker"),
  );
}

export default context;
