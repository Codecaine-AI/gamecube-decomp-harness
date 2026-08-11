/**
 * Source-specific Pi tools for each knowledge silo.
 *
 * The model should choose the source it needs, such as external mirrors or SSBM
 * data sheets, instead of sending every query through one generic lookup endpoint.
 */
import { globalStandardsContext } from "@server/core/knowledge";
import { searchLedgerLearnings, type LearningScope } from "@server/core/knowledge/ledger.js";
import { graphFileCard, graphSearch, runSourceApi } from "../runtime/execution.js";
import type { AgentToolRegistration, AgentToolRuntimeContext, PiToolDefinition } from "../types.js";
import { boundedLimit, jsonToolResult } from "../runtime/results.js";

const sourceContextToolRoles = [
  "worker",
  "conflict-resolver",
  "integration-resolver",
  "pr-splitter",
  "librarian",
  "pr-fixer",
  "reconcile",
  "qa-repair",
] as const;

const searchParameters = {
  type: "object",
  properties: {
    query: { type: "string", description: "Concrete term, source path, symbol, address, field, opcode, review term, or data-sheet term to search." },
    limit: { type: "number", description: "Maximum results to return. Values are clamped to a small safe bound." },
  },
  required: ["query"],
  additionalProperties: false,
};

const fileCardParameters = {
  type: "object",
  properties: {
    source_path: { type: "string", description: "Project-relative source file path." },
  },
  required: ["source_path"],
  additionalProperties: false,
};

const dataSheetAddressParameters = {
  type: "object",
  properties: {
    address: { type: "string", description: "Hex or decimal address to look up in normalized SSBM data sheet rows." },
    limit: { type: "number", description: "Maximum results to return." },
  },
  required: ["address"],
  additionalProperties: false,
};

const dataSheetOffsetParameters = {
  type: "object",
  properties: {
    type: { type: "string", description: "Data type/category for the offset lookup, when known." },
    offset: { type: "string", description: "Hex or decimal offset to look up in normalized SSBM data sheet rows." },
    limit: { type: "number", description: "Maximum results to return." },
  },
  required: ["offset"],
  additionalProperties: false,
};

const externalSymbolParameters = {
  type: "object",
  properties: {
    symbol: { type: "string", description: "External mirror symbol or name to look up." },
    limit: { type: "number", description: "Maximum results to return." },
  },
  required: ["symbol"],
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
      description: "Load graph-owned source-file context for a project-relative path.",
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

/** Tool for searching normalized SSBM data sheet rows. */
export const ssbmDataSheetSearchToolRegistration = sourceSearchTool({
  id: "ssbm_data_sheet_search",
  sourceId: "ssbm_data_sheet",
  label: "SSBM Data Sheet Search",
  purpose: "Search normalized SSBM data sheet rows for addresses, IDs, offsets, action states, hitboxes, and attributes.",
  description: "Search SSBM data sheet CSV indexes for addresses, offsets, IDs, action states, hitbox/hurtbox data, attributes, and resource rows.",
  guidance: "Use ssbm_data_sheet_search for concrete data-sheet terms such as addresses, offsets, IDs, SFX, action states, attributes, or hitbox fields.",
});

/** Tool for exact SSBM data sheet address lookup. */
export const ssbmDataSheetAddressLookupToolRegistration = fixedSourceApiTool({
  id: "ssbm_data_sheet_lookup_address",
  sourceId: "ssbm_data_sheet",
  label: "SSBM Address Lookup",
  purpose: "Look up one address in normalized SSBM data sheet rows.",
  description: "Lookup a concrete address in the SSBM data sheet source.",
  guidance: "Use ssbm_data_sheet_lookup_address when the question is a specific address rather than a broad data-sheet term.",
  parameters: dataSheetAddressParameters,
  scriptName: "lookup_address.py",
  args(params) {
    const address = String(params.address ?? "").trim();
    if (!address) return { status: "missing_address" };
    return ["--address", address, "--limit", String(boundedLimit(params.limit)), "--json"];
  },
});

/** Tool for exact SSBM data sheet offset lookup. */
export const ssbmDataSheetOffsetLookupToolRegistration = fixedSourceApiTool({
  id: "ssbm_data_sheet_lookup_offset",
  sourceId: "ssbm_data_sheet",
  label: "SSBM Offset Lookup",
  purpose: "Look up one typed offset in normalized SSBM data sheet rows.",
  description: "Lookup a concrete offset, optionally within a type/category, in the SSBM data sheet source.",
  guidance: "Use ssbm_data_sheet_lookup_offset when a struct/category offset is the concrete fact being checked.",
  parameters: dataSheetOffsetParameters,
  scriptName: "lookup_offset.py",
  args(params) {
    const offset = String(params.offset ?? "").trim();
    if (!offset) return { status: "missing_offset" };
    const type = String(params.type ?? "").trim();
    const args = ["--offset", offset, "--limit", String(boundedLimit(params.limit)), "--json"];
    if (type) args.push("--type", type);
    return args;
  },
});

/** Tool for searching external mirror snapshots and supplemental references. */
export const externalMirrorsSearchToolRegistration = sourceSearchTool({
  id: "external_mirrors_search",
  sourceId: "external_mirrors",
  label: "External Mirrors Search",
  purpose: "Search mirrored external references such as m-ex headers, Training Mode map symbols, Tockdom, and ppc2cpp.",
  description: "Search external mirror indexes for supplemental names, symbols, headers, compiler notes, and reference snippets.",
  guidance: "Use external_mirrors_search for supplemental external hints; local source, symbols, splits, assembly, and objdiff still outrank mirror data.",
});

/** Tool for exact external mirror symbol lookup. */
export const externalSymbolLookupToolRegistration = fixedSourceApiTool({
  id: "external_symbol_lookup",
  sourceId: "external_mirrors",
  label: "External Symbol Lookup",
  purpose: "Look up one symbol/name in external mirror indexes.",
  description: "Lookup a concrete symbol in external mirror indexes.",
  guidance: "Use external_symbol_lookup for a specific external symbol/name, then verify against local source and graph evidence.",
  parameters: externalSymbolParameters,
  scriptName: "lookup_external_symbol.py",
  args(params) {
    const symbol = String(params.symbol ?? "").trim();
    if (!symbol) return { status: "missing_symbol" };
    return ["--symbol", symbol, "--limit", String(boundedLimit(params.limit)), "--json"];
  },
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

/** Tool for corroborating candidate learnings against the project knowledge ledger. */
export const ledgerSearchToolRegistration: AgentToolRegistration = {
  id: "ledger_search",
  purpose: "Search past ledger learnings to corroborate or refute candidate statements before emitting them.",
  allowedRoles: ["librarian"],
  capabilities: ["knowledge_ledger", "learning_search"],
  create(context): PiToolDefinition {
    return {
      name: "ledger_search",
      label: "Knowledge Ledger Search",
      description: "Search project ledger learnings and their subjects, provenance, status, and confidence.",
      promptSnippet: "ledger_search: search past learnings to corroborate or refute a candidate statement by judgment.",
      promptGuidelines: [
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
            projectId: context.project?.projectId ?? "melee",
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
  pastPrsSearchToolRegistration,
  ssbmDataSheetSearchToolRegistration,
  ssbmDataSheetAddressLookupToolRegistration,
  ssbmDataSheetOffsetLookupToolRegistration,
  externalMirrorsSearchToolRegistration,
  externalSymbolLookupToolRegistration,
  decompStandardsProposalsToolRegistration,
  decompStandardsContextToolRegistration,
  smashWikiSearchToolRegistration,
  smashWikiGetPageToolRegistration,
  ledgerSearchToolRegistration,
] as const;
