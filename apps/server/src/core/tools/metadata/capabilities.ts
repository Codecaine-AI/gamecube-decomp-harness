import type { AgentToolPromptMetadata } from "../types.js";

/** Prompt metadata for callable decomp capabilities backed by the enabled toolpack. */
export const capabilityToolPromptMetadata: Record<string, AgentToolPromptMetadata> = {
  mwcc_debug_lookup: {
    provider: "mwcc_debug",
    type: "compiler_analysis",
    useWhen: "Search cached MWCC compiler-shape notes after lighter evidence stops explaining a mismatch.",
  },
  mwcc_alloc_snapshot: {
    provider: "mwcc_alloc",
    type: "compiler_analysis",
    useWhen: "After a residual is classified as register-only GPR: capture PCode and GPR coloring (vreg to physical register, interference neighbors, simplify order) for two stages of one compile. No FPR coloring. Before/after are not candidate vs target.",
  },
  mwcc_alloc_compare: {
    provider: "mwcc_alloc",
    type: "compiler_analysis",
    useWhen: "Compare the before/after GPR coloring snapshot paths returned by mwcc_alloc_snapshot and report which virtual registers changed color, degree, neighbors, or simplify position. No FPR coloring. Not candidate vs target.",
  },
  checkdiff_run: {
    provider: "checkdiff",
    type: "verification",
    useWhen: "Run focused checkdiff/objdiff output for one function. full_diff returns up to 24 mismatching rows with kind and both sides: left is target and right is current. Instruction parity can still hide strict relocation/data differences.",
  },
  checkdiff_summary: {
    provider: "checkdiff",
    type: "verification",
    useWhen: "Run PASS/FAIL summaries for a target and affected neighbors instead of raw asm-differ shell commands.",
  },
  direct_compile_tu: {
    provider: "checkdiff",
    type: "verification",
    useWhen: "Compile one function's translation unit to separate build failure from objdiff mismatch. Pass exactly one of `function` or `unit`.",
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
    useWhen: "Diagnose one compact register-only window; not full liveness or FPR coloring.",
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
    useWhen: "Search source mutations in named functions and return the best scalar score and one source diff. Returns no instruction rows; replay the candidate and read its delta with checkdiff_run. Use only on a named region after the residual is classified.",
  },
  source_permuter_replay: {
    provider: "source_permuter",
    type: "exploration",
    useWhen: "Replay a saved permuter recipe and return its score and source diff; read the instruction delta with checkdiff_run afterwards.",
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
  asm_window_search: {
    provider: "asm_window_search",
    type: "exploration",
    useWhen: "Find matched donor functions for a specific normalized instruction window when whole-function analogs are too broad.",
  },
  type_layout_lookup: {
    provider: "type_layout_lookup",
    type: "diagnostics",
    useWhen: "Compare record layouts, union aliases, and cast-only overlay evidence before changing a type.",
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
