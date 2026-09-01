import type { AgentToolPromptMetadata } from "../types.js";

/** Prompt metadata for wrappers over game-owned knowledge sources. */
export const knowledgeToolPromptMetadata: Record<string, AgentToolPromptMetadata> = {
  code_graph_file_card: {
    provider: "code_graph",
    type: "target_context",
    useWhen: "Get the file card for a specific source file.",
  },
  code_graph_search: {
    provider: "code_graph",
    type: "local_search",
    useWhen: "Search local source paths, symbols, functions, units, and graph metadata.",
  },
  knowledge_graph_search: {
    provider: "knowledge_graph",
    type: "cross_source_search",
    useWhen: "Search every active graph source when the evidence source is not known in advance.",
  },
  graph_related_functions: {
    provider: "knowledge_graph",
    type: "function_relationships",
    useWhen: "Retrieve opseq analogs, callers, callees, data references, and corroborating xref evidence for a file or function.",
  },
  past_prs_search: {
    provider: "past_prs",
    type: "history",
    useWhen: "Find prior accepted or rejected PR evidence for a file, subsystem, tactic, or review risk.",
  },
  ledger_search: {
    provider: "knowledge_ledger",
    type: "history",
    useWhen:
      "Search the communal ledger of prior-attempt learnings for your target, its unit, and opseq-analog symbols; entries carry status (corroborated/proposed/refuted) and confidence — weigh accordingly, and read refuted entries as what already failed.",
  },
};
