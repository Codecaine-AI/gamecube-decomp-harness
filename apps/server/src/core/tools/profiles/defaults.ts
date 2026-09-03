/**
 * Role-level tool bundles.
 *
 * The wrapper metadata lives beside each wrapper family; this file only decides
 * which stable tool ids each agent role receives by default.
 */

/**
 * Default worker Pi tools attached to worker launches.
 *
 * Pruned 2026-06-12 per reports/pi-agent-tool-analysis-2026-06-12.html and
 * 2026-06-30 per analysis/reports/fresh-tool-distribution-15-epoch-2026-06-30.html.
 * Low-lift/stale external sources are not advertised to workers. Knowledge V2
 * supplies the read-only target history and source-evidence tools.
 */
export const defaultWorkerToolProfile = [
  "code_graph_file_card",
  "code_graph_search",
  "knowledge_graph_search",
  "graph_related_functions",
  "past_prs_search",
  "kv2_subject_record",
  "kv2_pr_search",
  "kv2_discord_search",
  "kv2_wiki_search",
  "kv2_attempt_search",
  "kv2_resolve_locator",
  "mwcc_debug_lookup",
  "checkdiff_run",
  "checkdiff_summary",
  "direct_compile_tu",
  "objdiff_score_candidate",
  "mwcc_debug_dump_function",
  "mwcc_debug_diagnose_stack",
  "mwcc_debug_diagnose_regflow",
  "mwcc_debug_diagnose_inlines",
  "mwcc_alloc_snapshot",
  "mwcc_alloc_compare",
  "source_permuter_run",
  "source_permuter_replay",
  "source_mutation_preview",
  "type_oracle_lookup",
  "m2c_decompile",
  "asm_window_search",
  "type_layout_lookup",
  "review_lint_scan",
  "review_lint_sdata2_order_helper",
] as const;

/** Default PR splitter tools attached to handoff planning launches. */
export const defaultPrSplitterToolProfile = [
  "code_graph_search",
  "past_prs_search",
  "review_lint_scan",
] as const;

/** Default reconcile tools attached to ship-validate / sync-merge launches. */
export const defaultReconcileToolProfile = [
  "code_graph_file_card",
  "code_graph_search",
  "knowledge_graph_search",
  "past_prs_search",
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
  "knowledge_graph_search",
  "past_prs_search",
  "checkdiff_run",
  "checkdiff_summary",
  "direct_compile_tu",
  "objdiff_score_candidate",
  "source_mutation_preview",
  "type_oracle_lookup",
  "review_lint_scan",
  "review_lint_sdata2_order_helper",
] as const;

/** Default librarian tools for citable knowledge-v2 sources and graph context. */
export const defaultLibrarianToolProfile = [
  "code_graph_search",
  "graph_related_functions",
  "kv2_discord_search",
  "kv2_wiki_search",
  "kv2_pr_search",
  "kv2_attempt_search",
  "kv2_subject_record",
  "kv2_entity_lookup",
  "kv2_resolve_locator",
  "kv2_unit_context",
] as const;
