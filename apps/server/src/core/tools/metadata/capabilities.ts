import type { AgentToolPromptMetadata } from "../types.js";

/** Prompt metadata for callable decomp capabilities backed by the enabled toolpack. */
export const capabilityToolPromptMetadata: Record<string, AgentToolPromptMetadata> = {
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
    type: "verification",
    useWhen: "Run focused checkdiff/objdiff output for one function instead of raw asm-differ shell commands.",
  },
  checkdiff_summary: {
    provider: "checkdiff",
    type: "verification",
    useWhen: "Run PASS/FAIL summaries for a target and affected neighbors instead of raw asm-differ shell commands.",
  },
  direct_compile_tu: {
    provider: "checkdiff",
    type: "verification",
    useWhen: "Compile one function's translation unit to separate build failure from objdiff mismatch.",
  },
  objdiff_score_candidate: {
    provider: "objdiff_score",
    type: "verification",
    useWhen: "Score an already-built candidate object for a known function.",
  },
  mwcc_debug_dump_function: {
    provider: "mwcc_debug",
    type: "diagnostics",
    useWhen: "Dump function-filtered mwcc_debug pcdump evidence for a concrete compiler-pass question.",
  },
  mwcc_debug_diagnose_stack: {
    provider: "mwcc_debug",
    type: "diagnostics",
    useWhen: "Diagnose stack/frame mismatch evidence after source-shape and type evidence are checked.",
  },
  mwcc_debug_diagnose_regflow: {
    provider: "mwcc_debug",
    type: "diagnostics",
    useWhen: "Diagnose late register-flow windows when instruction sequence, calls, types, and structure are already close.",
  },
  mwcc_debug_diagnose_inlines: {
    provider: "mwcc_debug",
    type: "diagnostics",
    useWhen: "Diagnose inline/helper extraction boundaries when mismatch evidence points there.",
  },
  mwcc_debug_raw_dump: {
    provider: "mwcc_debug",
    type: "diagnostics",
    useWhen: "Inspect raw function-filtered pcdump when summarized MWCC output is insufficient.",
  },
  source_permuter_run: {
    provider: "source_permuter",
    type: "exploration",
    useWhen: "Run last-resort bounded non-mutating source-shape search only after cheaper evidence is exhausted; may return queue_busy instead of waiting.",
  },
  source_permuter_replay: {
    provider: "source_permuter",
    type: "exploration",
    useWhen: "Replay a saved non-mutating source-permutation recipe against the current checkout when a slot is available; may return queue_busy instead of waiting.",
  },
  source_mutation_preview: {
    provider: "source_permuter",
    type: "exploration",
    useWhen: "Preview source mutation passes as a diff before spending compile time.",
  },
  type_oracle_lookup: {
    provider: "type_oracle",
    type: "diagnostics",
    useWhen: "Check clang expression/span types before temporary extraction or pointer/value type changes.",
  },
  struct_infer_from_asm: {
    provider: "struct_infer",
    type: "conversion",
    useWhen: "Infer candidate struct fields from a specific pointer register and offset pattern.",
  },
  m2c_decompile: {
    provider: "m2c_decomp",
    type: "exploration",
    useWhen: "Generate an m2c scaffold as a reading aid only; formatting is best-effort.",
  },
  include_fixer_preview: {
    provider: "include_fixer",
    type: "source_review",
    useWhen: "Preview missing include additions when compile diagnostics point to undeclared functions.",
  },
  item_state_table_preview: {
    provider: "item_state_table",
    type: "conversion",
    useWhen: "Preview an ItemStateTable C definition from an asm data label.",
  },
  review_lint_scan: {
    provider: "review_lint",
    type: "source_review",
    useWhen: "Scan source text or files for decomp review anti-patterns before reporting retained edits.",
  },
  review_lint_sdata2_order_helper: {
    provider: "review_lint",
    type: "source_editing",
    useWhen: "Preview or explicitly apply an isolated .sdata2 ordering helper after restoring inline numeric literals.",
  },
};
