/** Graph-first knowledge tools plus the few intentionally direct corpus APIs. */
import { globalStandardsContext } from "@server/core/knowledge";
import { searchLedgerLearnings, type LearningScope } from "@server/core/knowledge/ledger.js";
import { graphFileCard, graphRelatedFunctions, graphSearch, runSourceApi } from "../runtime/execution.js";
import type { AgentToolRegistration, AgentToolRuntimeContext, PiToolDefinition } from "../types.js";
import { boundedLimit, jsonToolResult } from "../runtime/results.js";

const sourceContextToolRoles = [
  "worker",
  "pr-splitter",
  "librarian",
  "reconcile",
  "qa-repair",
] as const;

const searchParameters = {
  type: "object",
  properties: {
    query: { type: "string", description: "Concrete term, source path, symbol, address, field, opcode, mismatch symptom, or review term to search." },
    limit: { type: "number", description: "Maximum results to return. Values are clamped to a small safe bound." },
  },
  required: ["query"],
  additionalProperties: false,
};

const fileCardParameters = {
  type: "object",
  properties: {
    source_path: { type: "string", description: "Game-relative source file path." },
  },
  required: ["source_path"],
  additionalProperties: false,
};

const relatedFunctionsParameters = {
  type: "object",
  properties: {
    source_path: { type: "string", description: "Game-relative source path. Returns relationships for its functions, optionally narrowed by unit or symbol." },
    unit: { type: "string", description: "Object unit. Pair with symbol when source_path and entity_id are omitted." },
    symbol: { type: "string", description: "Function symbol. Pair with unit, or use it to narrow source_path." },
    entity_id: { type: "string", description: "Exact graph function entity id." },
    limit: { type: "number", description: "Maximum functions and relationships per category to return." },
  },
  additionalProperties: false,
};

const smashWikiPageParameters = {
  type: "object",
  properties: {
    title: { type: "string", description: "Mirrored SmashWiki page title." },
    section: { type: "string", description: "Print only the section fuzzy-matching this heading." },
    sections: { type: "boolean", description: "List section headings only." },
  },
  required: ["title"],
  additionalProperties: false,
};

const ledgerSearchParameters = {
  type: "object",
  properties: {
    query: { type: "string", description: "Candidate statement, symbol, file, or topic to corroborate or refute." },
    scope: {
      type: "string",
      enum: ["symbol", "file", "area", "general"],
      description: "Optional learning scope to filter after joining ledger records.",
    },
    limit: { type: "number", description: "Maximum results to return. Values are clamped to a small safe bound." },
  },
  required: ["query"],
  additionalProperties: false,
};

const noArgumentParameters = {
  type: "object",
  properties: {},
  additionalProperties: false,
};

interface SourceSearchDefinition {
  id: string;
  sourceId: string;
  label: string;
  purpose: string;
  description: string;
  guidance: string;
  graphBacked?: boolean;
}

/** Create a source-specific search tool backed by either graph search or a source API. */
function sourceSearchTool(definition: SourceSearchDefinition): AgentToolRegistration {
  return {
    id: definition.id,
    purpose: definition.purpose,
    allowedRoles: [...sourceContextToolRoles],
    capabilities: ["knowledge_source_search", definition.sourceId],
    create(context) {
      return {
        name: definition.id,
        label: definition.label,
        description: definition.description,
        promptSnippet: `${definition.id}: ${definition.purpose}`,
        promptGuidelines: [definition.guidance],
        parameters: searchParameters,
        executionMode: "parallel",
        async execute(_toolCallId, params) {
          const query = String(params.query ?? "").trim();
          if (!query) return jsonToolResult(definition.id, { status: "missing_query" });
          const limit = boundedLimit(params.limit);
          const payload = definition.graphBacked
            ? graphSearch(context, query, definition.sourceId, limit)
            : await runSourceApi(definition.sourceId, "search.py", ["--query", query, "--limit", String(limit), "--json"]);
          return jsonToolResult(definition.id, payload);
        },
      };
    },
  };
}

/** Create a fixed-argument source API tool for non-search operations. */
function fixedSourceApiTool(params: {
  id: string;
  sourceId: string;
  label: string;
  purpose: string;
  description: string;
  guidance: string;
  parameters: Record<string, unknown>;
  args(toolParams: Record<string, unknown>): string[] | Record<string, unknown>;
  scriptName: string;
}): AgentToolRegistration {
  return {
    id: params.id,
    purpose: params.purpose,
    allowedRoles: [...sourceContextToolRoles],
    capabilities: ["knowledge_source_lookup", params.sourceId],
    create() {
      return {
        name: params.id,
        label: params.label,
        description: params.description,
        promptSnippet: `${params.id}: ${params.purpose}`,
        promptGuidelines: [params.guidance],
        parameters: params.parameters,
        executionMode: "parallel",
        async execute(_toolCallId, toolParams) {
          const args = params.args(toolParams);
          if (!Array.isArray(args)) return jsonToolResult(params.id, args);
          return jsonToolResult(params.id, await runSourceApi(params.sourceId, params.scriptName, args));
        },
      };
    },
  };
}

/** Create a source API tool that lists pending update proposals for a silo. */
function proposalSourceApiTool(params: {
  id: string;
  sourceId: string;
  label: string;
  purpose: string;
  description: string;
  guidance: string;
}): AgentToolRegistration {
  return fixedSourceApiTool({
    ...params,
    parameters: noArgumentParameters,
    scriptName: "proposals.py",
    args() {
      return ["--json"];
    },
  });
}

/** Tool for retrieving the graph-owned context packet for one source file. */
export const codeGraphFileCardToolRegistration: AgentToolRegistration = {
  id: "code_graph_file_card",
  purpose: "Load the graph file card for one source path, including editability, match status, PR history, resources, and scheduling signals.",
  allowedRoles: [...sourceContextToolRoles],
  capabilities: ["code_graph", "file_card", "target_context"],
  create(context): PiToolDefinition {
    return {
      name: "code_graph_file_card",
      label: "Code Graph File Card",
      description: "Load graph-owned source-file context for a game-relative path.",
      promptSnippet: "code_graph_file_card: load editability, match status, PR history, resource hits, and scheduling signals for a source path.",
      promptGuidelines: ["Use code_graph_file_card first when a worker needs target-specific graph context for the claimed source path."],
      parameters: fileCardParameters,
      executionMode: "parallel",
      async execute(_toolCallId, params) {
        const sourcePath = String(params.source_path ?? "").trim();
        return jsonToolResult("code_graph_file_card", graphFileCard(context, sourcePath));
      },
    };
  },
};

/** Tool for searching local code graph entities and metadata. */
export const codeGraphSearchToolRegistration = sourceSearchTool({
  id: "code_graph_search",
  sourceId: "code_graph",
  label: "Code Graph Search",
  purpose: "Search graph-indexed local code entities and file/function metadata.",
  description: "Search the code graph slice for source paths, symbols, functions, units, and local code metadata.",
  guidance: "Use code_graph_search for local source paths, symbols, functions, units, and graph-indexed code metadata.",
  graphBacked: true,
});

/** Tool for searching every currently active graph source without a source-local filter. */
export const knowledgeGraphSearchToolRegistration: AgentToolRegistration = {
  id: "knowledge_graph_search",
  purpose: "Search all active graph-indexed knowledge sources in one query.",
  allowedRoles: [...sourceContextToolRoles],
  capabilities: ["knowledge_graph", "all_source_search"],
  create(context): PiToolDefinition {
    return {
      name: "knowledge_graph_search",
      label: "Knowledge Graph Search",
      description: "Search active code, opseq, callgraph, sibling, PR, ledger, standards, and curated graph chunks.",
      promptSnippet: "knowledge_graph_search: search all active graph-indexed knowledge when the relevant evidence source is not known.",
      promptGuidelines: ["Use knowledge_graph_search for cross-source discovery; use a structured graph query for known functions or files."],
      parameters: searchParameters,
      executionMode: "parallel",
      async execute(_toolCallId, params) {
        const query = String(params.query ?? "").trim();
        if (!query) return jsonToolResult("knowledge_graph_search", { status: "missing_query" });
        return jsonToolResult(
          "knowledge_graph_search",
          graphSearch(context, query, undefined, boundedLimit(params.limit), { activeSourcesOnly: true }),
        );
      },
    };
  },
};

/** Tool for graph-owned opseq analogs, callers, callees, and data references. */
export const graphRelatedFunctionsToolRegistration: AgentToolRegistration = {
  id: "graph_related_functions",
  purpose: "Load opseq analogs and call relationships for graph functions selected by file, unit/symbol, or entity id.",
  allowedRoles: [...sourceContextToolRoles],
  capabilities: ["knowledge_graph", "opseq_similarity", "call_graph", "function_relationships"],
  create(context): PiToolDefinition {
    return {
      name: "graph_related_functions",
      label: "Graph Related Functions",
      description: "Return graph-owned opseq analogs, callers, callees, and data references for one or more functions.",
      promptSnippet: "graph_related_functions: retrieve structured opseq and callgraph relationships for a file or function.",
      promptGuidelines: ["Use graph_related_functions when analog or caller/callee relationships matter; pass source_path for all functions in a file."],
      parameters: relatedFunctionsParameters,
      executionMode: "parallel",
      async execute(_toolCallId, params) {
        return jsonToolResult(
          "graph_related_functions",
          graphRelatedFunctions(context, {
            sourcePath: String(params.source_path ?? "").trim() || undefined,
            unit: String(params.unit ?? "").trim() || undefined,
            symbol: String(params.symbol ?? "").trim() || undefined,
            entityId: String(params.entity_id ?? "").trim() || undefined,
            limit: boundedLimit(params.limit),
          }),
        );
      },
    };
  },
};

/** Tool for searching distilled historical PR lessons and review evidence. */
export const pastPrsSearchToolRegistration = sourceSearchTool({
  id: "past_prs_search",
  sourceId: "past_prs",
  label: "Past PR Search",
  purpose: "Search distilled historical PR lessons, touched files, review notes, and tactics.",
  description: "Search past PR summaries and postmortem records for exact files, symbols, subsystems, review risks, and matching tactics.",
  guidance: "Use past_prs_search when historical accepted or rejected PR work might explain a name, tactic, review risk, or subsystem pattern.",
  graphBacked: true,
});

/** Tool for listing proposed updates to global decomp standards. */
export const decompStandardsProposalsToolRegistration = proposalSourceApiTool({
  id: "decomp_standards_proposals",
  sourceId: "decomp_standards",
  label: "Decomp Standards Proposals",
  purpose: "List pending proposal records for global decomp standards.",
  description: "Return proposal-only records that could become decomp standards after validation.",
  guidance: "Use decomp_standards_proposals when curating or reviewing potential standards updates; workers should treat proposal rows as unaccepted hints.",
});

/** Tool for reloading the compact global standards bundle already injected into worker context. */
export const decompStandardsContextToolRegistration: AgentToolRegistration = {
  id: "decomp_standards_context",
  purpose: "Return the compact global decomp standards context that is also preloaded into worker packets.",
  allowedRoles: [...sourceContextToolRoles],
  capabilities: ["decomp_standards", "preloaded_context"],
  create(): PiToolDefinition {
    return {
      name: "decomp_standards_context",
      label: "Decomp Standards Context",
      description: "Return the compact global standards context used by agent prompts and worker packets.",
      promptSnippet: "decomp_standards_context: return the compact preloaded global decomp standards context.",
      promptGuidelines: ["Use decomp_standards_context only when you need to inspect the compact standards bundle already available to the worker."],
      parameters: { type: "object", properties: {}, additionalProperties: false },
      executionMode: "parallel",
      async execute() {
        return jsonToolResult("decomp_standards_context", {
          status: "ok",
          global_standards: globalStandardsContext(),
        });
      },
    };
  },
};

/** Tool for searching mirrored SmashWiki pages and sections. */
export const smashWikiSearchToolRegistration = sourceSearchTool({
  id: "smashwiki_search",
  sourceId: "smashwiki",
  label: "SmashWiki Search",
  purpose: "Search mirrored SmashWiki page titles, summaries, and sections for game-mechanics evidence.",
  description: "Search the mirrored SmashWiki corpus for game mechanics, character moves, hitboxes, and technique names.",
  guidance: "Use smashwiki_search to ground game-mechanics terms, character moves, hitboxes, and technique names in mirrored wiki evidence.",
});

/** Tool for retrieving a mirrored SmashWiki page, section, or section list. */
export const smashWikiGetPageToolRegistration = fixedSourceApiTool({
  id: "smashwiki_get_page",
  sourceId: "smashwiki",
  label: "SmashWiki Get Page",
  purpose: "Read a mirrored SmashWiki page, one fuzzy-matched section, or its section headings.",
  description: "Retrieve a mirrored SmashWiki page by title, optionally narrowing to one section or listing its headings.",
  guidance: "Use smashwiki_get_page after search to inspect the exact mirrored page or section that grounds a game-mechanics claim.",
  parameters: smashWikiPageParameters,
  scriptName: "get_page.py",
  args(params) {
    const title = String(params.title ?? "").trim();
    if (!title) return { status: "missing_title" };
    const args = ["--title", title];
    const section = String(params.section ?? "").trim();
    if (section) args.push("--section", section);
    if (params.sections) args.push("--sections");
    return args;
  },
});

/** Tool for corroborating candidate learnings against the game knowledge ledger. */
export const ledgerSearchToolRegistration: AgentToolRegistration = {
  id: "ledger_search",
  purpose: "Search the communal ledger of prior-attempt learnings to reuse what worked, avoid known dead ends, and corroborate candidate statements.",
  allowedRoles: ["librarian", "worker"],
  capabilities: ["knowledge_ledger", "learning_search"],
  create(context): PiToolDefinition {
    return {
      name: "ledger_search",
      label: "Knowledge Ledger Search",
      description: "Search the communal ledger of prior-attempt learnings by subject, provenance, status (corroborated/proposed/refuted), and confidence.",
      promptSnippet: "ledger_search: search communal prior-attempt learnings for a target, its unit, or analog symbols, weighed by status and confidence.",
      promptGuidelines: [
        "Search ledger learnings for your target, its unit, and opseq-analog solved symbols; weigh corroborated high-confidence entries above proposed ones and treat refuted entries as known dead ends.",
        "Use ledger_search before emitting a candidate learning so existing statements can corroborate, refute, or deduplicate it by judgment.",
      ],
      parameters: ledgerSearchParameters,
      executionMode: "parallel",
      async execute(_toolCallId, params) {
        const query = String(params.query ?? "").trim();
        if (!query) return jsonToolResult("ledger_search", { status: "missing_query" });
        const scope = typeof params.scope === "string" ? (params.scope as LearningScope) : undefined;
        return jsonToolResult("ledger_search", {
          ...searchLedgerLearnings({
            query,
            scope,
            limit: boundedLimit(params.limit),
            gameId: context.game?.gameId ?? "melee",
          }),
        });
      },
    };
  },
};

/** All knowledge-source Pi tool registrations, kept reusable across agent profiles. */
export const knowledgeToolRegistrations = [
  codeGraphFileCardToolRegistration,
  codeGraphSearchToolRegistration,
  knowledgeGraphSearchToolRegistration,
  graphRelatedFunctionsToolRegistration,
  pastPrsSearchToolRegistration,
  decompStandardsProposalsToolRegistration,
  decompStandardsContextToolRegistration,
  smashWikiSearchToolRegistration,
  smashWikiGetPageToolRegistration,
  ledgerSearchToolRegistration,
] as const;
