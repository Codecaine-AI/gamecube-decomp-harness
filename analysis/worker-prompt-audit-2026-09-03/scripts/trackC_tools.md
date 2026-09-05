# Research track C: Worker diagnostic tooling reference (for an "advanced tooling" prompt section)

Repo: `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness` (READ-ONLY except the output file).
Output: write ONE markdown file `analysis/worker-prompt-audit-2026-09-03/C-tooling-reference.md` (≤ 450 lines).
Use sub-agents / parallel execution wherever the work can be split — optimize for wall-clock speed (one sub-agent per tool group is a good split).

## Why
We are writing an "advanced tooling and diagnostic flow" section for the decomp worker's system prompt. It must be accurate to what each tool actually does and returns. An audit of 1,627 runs found the winning loop was: full diff → classify the residual → allocator/regflow snapshot → name the live range or coalescing edge → one edit → diff; and that the permuter only helped when pointed at a bounded, named region with per-candidate instruction deltas read (not score). Deliverable is analysis only — do not modify code.

## Tools to document (worker profile; verify the list against `apps/server/src/core/tools/profiles/defaults.ts`)
Build/diff: `checkdiff_run`, `checkdiff_summary`, `direct_compile_tu`, `objdiff_score_candidate`
Compiler diagnostics: `mwcc_alloc_snapshot`, `mwcc_alloc_compare`, `mwcc_debug_diagnose_regflow`, `mwcc_debug_diagnose_stack`, `mwcc_debug_diagnose_inlines`, `mwcc_debug_dump_function`, `mwcc_debug_lookup`
Search/mutation: `source_mutation_preview`, `source_permuter_run`, `source_permuter_replay`, `m2c_decompile`, `asm_window_search`
Type/layout: `type_layout_lookup`, `type_oracle_lookup`
Review: `review_lint_scan`, `review_lint_sdata2_order_helper`
Knowledge/history: `past_prs_search`, `graph_related_functions`, plus whatever knowledge-v2 tools the profile now exposes (`ledger_search`, `knowledge_graph_search`, `code_graph_search`, `code_graph_file_card` may be retired — say so).

## For EACH tool
- Source file:line of the implementation and its schema/description string (the text the model sees).
- Parameters, with the ones that matter (e.g. `checkdiff_run` full_diff / window options; `source_permuter_run` iteration/seed/scope/function params; `mwcc_alloc_snapshot` what it snapshots).
- Output shape: paste a REAL, truncated sample. Find samples in `games/melee/state/runs/4a45af8a-9f8c-499b-b375-c0d8e93fc8fd/worker_state/*/tool_events.jsonl` (params) and in condensed transcripts `analysis/worker-audit-2026-09-01/condensed/*.md` (results; grep for `TOOL <name>`).
- Median duration_ms across the run (compute from tool_events.jsonl across ~50 worker dirs — sample, don't read all 1,600), and error rate.
- What question it answers in the diagnostic loop, and what it does NOT tell you.
- Known failure modes seen in the audit (e.g. permuter "function not found at source path", stale checkdiff service, wibo 32-bit exec failures needing qemu-i386, missing FPR visibility in allocator snapshots) — grep the 44 pair reports in `analysis/worker-audit-2026-09-01/phase3_notes/` and `rollups/phase2_rollup.md` for tool names to find these.

## Then
- **Diagnostic flow table**: for each residual class (instruction shape / register-only swap / stack-slot or frame size / scheduling / relocation-symbol / data-section layout / inline boundary), which tool(s) give the decisive evidence and in what order, based on what exact workers actually did in the pair reports.
- **Permuter as probe**: exactly what `source_permuter_run` and `source_permuter_replay` output today per candidate (score only? diff? changed-instruction set?), and what would have to change for the tool to emit per-candidate changed-instruction sets clustered by residual mismatch. Cite the implementation.
- **Allocator visibility**: what `mwcc_alloc_snapshot`/`_compare` expose (GPR? FPR? virtual→physical map? live ranges?) and gaps.

Print DONE when finished.
