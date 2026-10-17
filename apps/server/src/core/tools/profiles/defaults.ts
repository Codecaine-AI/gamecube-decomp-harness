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
 *
 * 2026-10-17 (worker-compiler-loop): the `mwcc_debug_*` live tools never ran in
 * sandboxes and are gone; `mwcc_debug_lookup` only searched an index that was
 * never generated (it returned "scaffolded" for every query) and is gone too.
 * `mwcc_alloc_compare_sources` shows what a source edit changed inside the
 * compiler.
 */
export const defaultWorkerToolProfile = [
  "request_write_set_widening",
  "knowledge_render_file",
  "knowledge_record",
  "pr_search",
  "discord_search",
  "wiki_search",
  "attempt_search",
  "resolve_locator",
  "checkdiff_run",
  "checkdiff_summary",
  "direct_compile_tu",
  "objdiff_score_candidate",
  "mwcc_alloc_snapshot",
  "mwcc_alloc_compare",
  "mwcc_alloc_analyze",
  "mwcc_alloc_compare_sources",
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

/**
 * Worker tools added only for games whose steering gate is active (shadow or
 * enforce). Games with the gate off (Melee) do not get them.
 */
export const steeringGateWorkerToolProfile = [
  "real_code_evidence",
  "unused_stub_test",
] as const;

/**
 * Read-only graph tools added for games with a code graph (its build indexes
 * the game's Ghidra export: callers, callees, data references).
 */
export const codeGraphWorkerToolProfile = [
  "graph_related_functions",
  "code_graph_file_card",
] as const;

/** What a game's worker tool list depends on beyond the static profile. */
export interface WorkerToolProfileFacts {
  /** The game's steering gate is active (shadow or enforce). */
  steeringGateActive: boolean;
  /** The game has a code graph with cross-references. */
  codeGraph: boolean;
}

/** The game-gated worker tools, in profile order. */
export function gatedWorkerToolIds(facts: WorkerToolProfileFacts): string[] {
  return [
    ...(facts.steeringGateActive ? steeringGateWorkerToolProfile : []),
    ...(facts.codeGraph ? codeGraphWorkerToolProfile : []),
  ];
}

/** A game's full default worker tool list: the static profile plus its gated tools. */
export function workerToolIds(facts: WorkerToolProfileFacts): string[] {
  return [...defaultWorkerToolProfile, ...gatedWorkerToolIds(facts)];
}

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
  "knowledge_render_file",
  "code_graph_search",
  "graph_related_functions",
  "discord_search",
  "wiki_search",
  "pr_search",
  "attempt_search",
  "knowledge_record",
  "entity_lookup",
  "resolve_locator",
  "unit_context",
] as const;
