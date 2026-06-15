export interface WorkerToolPromptInfo {
  provider: string;
  type: string;
  useWhen: string;
}

/**
 * Default worker Pi tools attached to worker launches.
 *
 * Pruned 2026-06-12 per reports/pi-agent-tool-analysis-2026-06-12.html: tools
 * used in <2% of 749 terminal xhigh leases (powerpc_*, discord topics,
 * include_fixer_preview, struct_infer_from_asm, item_state_table_preview,
 * ssbm search/offset, mwcc_debug_raw_dump) are no longer advertised to
 * workers. Registrations stay in the registry; re-enable per run via the
 * profile `enable` override.
 */
export const defaultWorkerToolProfile = [
  "code_graph_file_card",
  "code_graph_search",
  "past_prs_search",
  "discord_knowledge_search",
  "ssbm_data_sheet_lookup_address",
  "external_mirrors_search",
  "external_symbol_lookup",
  "path_facts_resolve",
  "ghidra_lookup",
  "opseq_similar_functions",
  "mismatch_db_search",
  "mwcc_debug_lookup",
  "checkdiff_run",
  "checkdiff_summary",
  "direct_compile_tu",
  "objdiff_score_candidate",
  "mwcc_debug_dump_function",
  "mwcc_debug_diagnose_stack",
  "mwcc_debug_diagnose_regflow",
  "mwcc_debug_diagnose_inlines",
  "source_permuter_run",
  "source_permuter_replay",
  "source_mutation_preview",
  "type_oracle_lookup",
  "m2c_decompile",
  "review_lint_scan",
] as const;

/** Default PR intake tools attached to PR postmortem launches. */
export const defaultPrReviewToolProfile = [
  "code_graph_search",
  "path_facts_resolve",
  "review_lint_scan",
] as const;

/** Default reconcile tools attached to ship-validate / sync-merge launches. */
export const defaultReconcileToolProfile = [
  "code_graph_file_card",
  "code_graph_search",
  "past_prs_search",
  "path_facts_resolve",
  "mismatch_db_search",
  "checkdiff_run",
  "checkdiff_summary",
  "direct_compile_tu",
  "objdiff_score_candidate",
  "type_oracle_lookup",
  "include_fixer_preview",
  "review_lint_scan",
] as const;

/** Default QA repair tools attached to candidate-file repair launches. */
export const defaultQaRepairToolProfile = [
  "code_graph_file_card",
  "code_graph_search",
  "past_prs_search",
  "path_facts_resolve",
  "mismatch_db_search",
  "checkdiff_run",
  "checkdiff_summary",
  "direct_compile_tu",
  "objdiff_score_candidate",
  "source_mutation_preview",
  "type_oracle_lookup",
  "review_lint_scan",
] as const;

/** Default knowledge-curator tools attached to curator launches. */
export const defaultKnowledgeCuratorToolProfile = [
  "code_graph_search",
  "past_prs_search",
  "decomp_standards_context",
  "decomp_standards_proposals",
  "path_facts_resolve",
  "path_facts_proposals",
] as const;

/** Agent-facing labels used to render the prompt's available tools section. */
export const workerToolPromptInfo: Record<string, WorkerToolPromptInfo> = {
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
  past_prs_search: {
    provider: "past_prs",
    type: "history",
    useWhen: "Find prior accepted or rejected PR evidence for a file, subsystem, tactic, or review risk.",
  },
  discord_knowledge_search: {
    provider: "discord_knowledge",
    type: "community_knowledge",
    useWhen: "Search community/compiler notes for concrete decomp or review terms.",
  },
  discord_knowledge_topics_for_terms: {
    provider: "discord_knowledge",
    type: "community_knowledge",
    useWhen: "Expand several loose compiler, review, or workflow terms into topic-style hits.",
  },
  ssbm_data_sheet_search: {
    provider: "ssbm_data_sheet",
    type: "reference_data",
    useWhen: "Search data-sheet rows for addresses, offsets, IDs, action states, hitboxes, attributes, or resources.",
  },
  ssbm_data_sheet_lookup_address: {
    provider: "ssbm_data_sheet",
    type: "reference_data",
    useWhen: "Look up one concrete address in normalized SSBM data-sheet rows.",
  },
  ssbm_data_sheet_lookup_offset: {
    provider: "ssbm_data_sheet",
    type: "reference_data",
    useWhen: "Look up one concrete typed or untyped offset in normalized SSBM data-sheet rows.",
  },
  powerpc_docs_search: {
    provider: "powerpc_docs",
    type: "reference_data",
    useWhen: "Search PowerPC ABI, register, stack-frame, branch, conversion, or condition-register docs.",
  },
  powerpc_instruction_lookup: {
    provider: "powerpc_docs",
    type: "reference_data",
    useWhen: "Look up documentation for one concrete PowerPC instruction mnemonic.",
  },
  external_mirrors_search: {
    provider: "external_mirrors",
    type: "external_reference",
    useWhen: "Search supplemental external mirrors for names, symbols, headers, or reference hints.",
  },
  external_symbol_lookup: {
    provider: "external_mirrors",
    type: "external_reference",
    useWhen: "Look up one specific external symbol or name, then verify locally.",
  },
  path_facts_resolve: {
    provider: "path_facts",
    type: "path_context",
    useWhen: "Resolve accepted path-scoped facts and directory-slice hints for a source path.",
  },
  path_facts_proposals: {
    provider: "path_facts",
    type: "proposal_review",
    useWhen: "Inspect pending path-fact proposals before creating another scoped proposal.",
  },
  decomp_standards_context: {
    provider: "decomp_standards",
    type: "standards_context",
    useWhen: "Inspect compact accepted decomp standards when classifying a PR or curator proposal.",
  },
  decomp_standards_proposals: {
    provider: "decomp_standards",
    type: "proposal_review",
    useWhen: "Inspect pending standards proposals before creating another global rule proposal.",
  },
  ghidra_lookup: {
    provider: "ghidra",
    type: "symbol_context",
    useWhen: "Check cached symbol, address, string, name, caller, callee, or type hints as a second opinion.",
  },
  opseq_similar_functions: {
    provider: "opseq",
    type: "duplicate_matching",
    useWhen: "Find similar instruction-shape functions before duplicate adaptation or broad rewrites.",
  },
  mismatch_db_search: {
    provider: "mismatch_db",
    type: "mismatch_research",
    useWhen: "Search known mismatch symptoms and source-shape tactics after a concrete diff symptom.",
  },
  mwcc_debug_lookup: {
    provider: "mwcc_debug",
    type: "compiler_analysis",
    useWhen: "Search cached MWCC compiler-shape notes after lighter evidence stops explaining a mismatch.",
  },
  checkdiff_run: {
    provider: "checkdiff",
    type: "validation",
    useWhen: "Run focused checkdiff/objdiff output for one function.",
  },
  checkdiff_summary: {
    provider: "checkdiff",
    type: "validation",
    useWhen: "Run PASS/FAIL summaries for a target and affected neighbors.",
  },
  direct_compile_tu: {
    provider: "checkdiff",
    type: "validation",
    useWhen: "Compile one function's translation unit to separate build failure from objdiff mismatch.",
  },
  objdiff_score_candidate: {
    provider: "objdiff_score",
    type: "validation",
    useWhen: "Score an already-built candidate object for a known function.",
  },
  mwcc_debug_dump_function: {
    provider: "mwcc_debug",
    type: "compiler_analysis",
    useWhen: "Dump function-filtered mwcc_debug pcdump evidence for a concrete compiler-pass question.",
  },
  mwcc_debug_diagnose_stack: {
    provider: "mwcc_debug",
    type: "compiler_analysis",
    useWhen: "Diagnose stack/frame mismatch evidence after source-shape and type evidence are checked.",
  },
  mwcc_debug_diagnose_regflow: {
    provider: "mwcc_debug",
    type: "compiler_analysis",
    useWhen: "Diagnose late register-flow windows when instruction sequence, calls, types, and structure are already close.",
  },
  mwcc_debug_diagnose_inlines: {
    provider: "mwcc_debug",
    type: "compiler_analysis",
    useWhen: "Diagnose inline/helper extraction boundaries when mismatch evidence points there.",
  },
  mwcc_debug_raw_dump: {
    provider: "mwcc_debug",
    type: "compiler_analysis",
    useWhen: "Inspect raw function-filtered pcdump when summarized MWCC output is insufficient.",
  },
  source_permuter_run: {
    provider: "source_permuter",
    type: "source_exploration",
    useWhen: "Run bounded non-mutating source-shape search after a named axis is too tedious to test manually.",
  },
  source_permuter_replay: {
    provider: "source_permuter",
    type: "source_exploration",
    useWhen: "Replay a saved non-mutating source-permutation recipe against the current checkout.",
  },
  source_mutation_preview: {
    provider: "source_permuter",
    type: "source_exploration",
    useWhen: "Preview source mutation passes as a diff before spending compile time.",
  },
  type_oracle_lookup: {
    provider: "type_oracle",
    type: "type_layout",
    useWhen: "Check clang expression/span types before temporary extraction or pointer/value type changes.",
  },
  struct_infer_from_asm: {
    provider: "struct_infer",
    type: "type_layout",
    useWhen: "Infer candidate struct fields from a specific pointer register and offset pattern.",
  },
  m2c_decompile: {
    provider: "m2c_decomp",
    type: "scaffold",
    useWhen: "Generate an m2c scaffold as a reading aid only.",
  },
  include_fixer_preview: {
    provider: "include_fixer",
    type: "source_maintenance",
    useWhen: "Preview missing include additions when compile diagnostics point to undeclared functions.",
  },
  item_state_table_preview: {
    provider: "item_state_table",
    type: "reference_data",
    useWhen: "Preview an ItemStateTable C definition from an asm data label.",
  },
  review_lint_scan: {
    provider: "review_lint",
    type: "review",
    useWhen: "Scan source text or files for decomp review anti-patterns before reporting retained edits.",
  },
};
