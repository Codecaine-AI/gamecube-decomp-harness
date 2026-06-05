# Evidence Index

Use this reference when you need concrete examples behind the Melee decomp knowledge-pack guidance.

## Contents

- Corpus
- Source files
- High-signal PRs
- Frequency notes
- How to search deeper

## Corpus

This knowledge pack was distilled from the current repo-local `doldecomp/melee` past-PR
corpus. Refresh-window details live in
`decomp-orchestrator/knowledge/past_prs/current/fetch_metadata.json`.

Local dump:

```text
decomp-orchestrator/knowledge/past_prs/current
```

Counts:

- 378 PRs
- 427 issue comments
- 104 inline review comments
- 107 review summaries
- 378 diffs
- 0 non-empty `.diff.err` files

## Source Files

Useful repo-local files:

- `decomp-orchestrator/knowledge/past_prs/current/analysis/human_pr_text.md`: human PR bodies, issue comments, and review bodies
- `decomp-orchestrator/knowledge/past_prs/current/analysis/review_comments.md`: inline review comments with diff hunks
- `decomp-orchestrator/knowledge/past_prs/current/analysis/text_corpus.jsonl`: structured PR/comment/review text records
- `decomp-orchestrator/knowledge/past_prs/current/analysis/diff_lines.jsonl`: structured added/deleted diff lines
- `decomp-orchestrator/knowledge/past_prs/current/analysis/changed_files.jsonl`: per-PR changed file records
- `decomp-orchestrator/knowledge/past_prs/current/analysis/decomp_tips_library.md`: longer narrative summary that preceded this knowledge pack
- `decomp-orchestrator/knowledge/past_prs/prs/index.csv`: spreadsheet-friendly per-PR knowledge index
- `decomp-orchestrator/knowledge/past_prs/prs/index.jsonl`: structured per-PR knowledge index for search/RAG ingestion
- `decomp-orchestrator/knowledge/past_prs/prs/known_fixes.md`: compact human-readable rollup of recurring lessons
- `decomp-orchestrator/knowledge/past_prs/prs/pr-*/postmortem.json`: structured per-PR postmortem records

Resource-guided lookup files:

- `decomp-orchestrator/knowledge/decomp_resources/index.md`: human-readable index for local decomp resources
- `decomp-orchestrator/knowledge/decomp_resources/manifests/resource_index.csv`: machine-readable resource manifest
- `decomp-orchestrator/knowledge/decomp_resources/manifests/acquisition_queue.csv`: pull status for mirrored and candidate external resources
- `decomp-orchestrator/knowledge/decomp_resources/data_sheets/ssbm_data_sheet_1_02/csv/sheet_index.csv`: generated workbook sheet index
- `decomp-orchestrator/knowledge/decomp_resources/data_sheets/ssbm_data_sheet_1_02/csv/cells.csv`: normalized searchable SSBM data sheet cell index
- `decomp-orchestrator/knowledge/decomp_resources/documents/powerpc/indexes/powerpc_pdf_pages.csv`: page-level ABI, compiler-guide, and ISA text index
- `decomp-orchestrator/knowledge/decomp_resources/external/training_mode/indexes/gtme01_map_symbols.csv`: debugger MAP address/name hint index
- `decomp-orchestrator/knowledge/decomp_resources/external/m_ex/indexes/header_symbols.csv`: m-ex header name hint index
- `decomp-orchestrator/knowledge/decomp_resources/documents/powerpc/pdfs/PPCEABI.pdf`, `decomp-orchestrator/knowledge/decomp_resources/documents/powerpc/pdfs/powerpc-cwg.pdf`, `decomp-orchestrator/knowledge/decomp_resources/documents/powerpc/pdfs/ppc_isa.pdf`: ABI, compiler-pattern, and instruction references

## High-Signal PRs

Use these examples for specific recurring patterns.

Target selection and tooling:

- [#2195](https://github.com/doldecomp/melee/pull/2195): `tools/easy_funcs.py`
- [#2200](https://github.com/doldecomp/melee/pull/2200): permuter on high-fuzzy functions
- [#2373](https://github.com/doldecomp/melee/pull/2373): m2c/Ghidra/objdiff/permuter agentic pipeline

Control flow:

- [#2571](https://github.com/doldecomp/melee/pull/2571): loop rewrite and allocation movement
- [#2570](https://github.com/doldecomp/melee/pull/2570): while-to-for conversion
- [#2236](https://github.com/doldecomp/melee/pull/2236): direct traversal instead of helper traversal
- [#2257](https://github.com/doldecomp/melee/pull/2257): review of `goto next` vs `continue`

Locals, registers, and stack:

- [#2556](https://github.com/doldecomp/melee/pull/2556): extra local pointer for register allocation
- [#2503](https://github.com/doldecomp/melee/pull/2503): branch-local locals and volatile assert preservation
- [#2507](https://github.com/doldecomp/melee/pull/2507): declaration order for address materialization
- [#2515](https://github.com/doldecomp/melee/pull/2515): FPR allocation and cached constants
- [#2452](https://github.com/doldecomp/melee/pull/2452): scoped temp and `PAD_STACK` removal
- [#2458](https://github.com/doldecomp/melee/pull/2458): local lifetime/order-only improvement

Inlines and helpers:

- [#2510](https://github.com/doldecomp/melee/pull/2510): static inline wrapper for original register-copy shape
- [#2509](https://github.com/doldecomp/melee/pull/2509): helper extraction following local pattern
- [#2380](https://github.com/doldecomp/melee/pull/2380): helper accessor worsened codegen
- [#2241](https://github.com/doldecomp/melee/pull/2241): existing `jobj.h` behavior mattered

Types and pointer math:

- [#2373](https://github.com/doldecomp/melee/pull/2373): `GET_GROUND`, `M2C_FIELD`, and temporary structs
- [#2281](https://github.com/doldecomp/melee/pull/2281): per-type `ItemVars` union arms
- [#2237](https://github.com/doldecomp/melee/pull/2237): struct padding fixed hidden offset mismatch
- [#2217](https://github.com/doldecomp/melee/pull/2217): raw pointer arithmetic as cleanup debt

Data, literals, and splits:

- [#2568](https://github.com/doldecomp/melee/pull/2568): `.sdata2` layout and unused include
- [#2469](https://github.com/doldecomp/melee/pull/2469): source additions shifted local data and neighbors
- [#2358](https://github.com/doldecomp/melee/pull/2358): hard `.sdata2` ordering
- [#2247](https://github.com/doldecomp/melee/pull/2247): symbol metadata over fake static
- [#2294](https://github.com/doldecomp/melee/pull/2294): relocation-aware diffing for wrong calls/literals
- [#2546](https://github.com/doldecomp/melee/pull/2546): item TU resplit
- [#2488](https://github.com/doldecomp/melee/pull/2488): baselib split by extab/extabindex and data sections
- [#2559](https://github.com/doldecomp/melee/pull/2559): shared strings may require merging files

Review standards:

- [#2433](https://github.com/doldecomp/melee/pull/2433): assert strings and `HSD_ASSERT`
- [#2510](https://github.com/doldecomp/melee/pull/2510): macro redefinition rejected
- [#2349](https://github.com/doldecomp/melee/pull/2349): fake-match discussion and assert/report usage
- [#2344](https://github.com/doldecomp/melee/pull/2344): scoped pragmas
- [#2231](https://github.com/doldecomp/melee/pull/2231): pragma hygiene and no inline asm
- [#2409](https://github.com/doldecomp/melee/pull/2409): include style and AI cleanup

AI workflow:

- [#2373](https://github.com/doldecomp/melee/pull/2373): first AI-assisted byte-perfect batch with tooling notes
- [#2409](https://github.com/doldecomp/melee/pull/2409): human-in-the-loop cleanup after AI generation
- [#2495](https://github.com/doldecomp/melee/pull/2495): verifier gates for generated PRs
- [#2294](https://github.com/doldecomp/melee/pull/2294): suspected failure mode from not starting with m2c or not using relocation-aware diffing

## Frequency Notes

Added diff-line pattern counts from the local corpus:

- `GET_*`: 2,690 lines across 187 PRs
- pointer-math-like patterns: 2,566 lines across 134 PRs
- `PAD_STACK`: 1,314 lines across 205 PRs
- `extern`: 929 lines across 140 PRs
- sdata/sdata2/order-related strings: 915 lines across 69 PRs
- `inline`: 615 lines across 142 PRs
- assert-like calls: 561 lines across 122 PRs
- `M2C_FIELD`: 496 lines across 11 PRs
- `goto`: 482 lines across 75 PRs
- `#pragma`: 445 lines across 65 PRs
- `OSReport`: 237 lines across 67 PRs
- `NOT_IMPLEMENTED`: 3 lines across 2 PRs

Interpretation:

- Accessors, asserts, inlines, and stack padding are normal matching vocabulary.
- Pointer math is common but repeatedly criticized in review.
- `M2C_FIELD` is less frequent than raw pointer math but preferred as an intermediate form.
- `NOT_IMPLEMENTED` should be rejected by automated gates.

## How to Search Deeper

Use `rg` against local corpus files:

```bash
rg -n "M2C_FIELD|pointer math|GET_GROUND|union-field" decomp-orchestrator/knowledge/past_prs/current/analysis/review_comments.md decomp-orchestrator/knowledge/past_prs/current/analysis/human_pr_text.md decomp-orchestrator/knowledge/past_prs/prs/known_fixes.md
rg -n "sdata2|literal|ordering|fakeFunc|symbols.txt" decomp-orchestrator/knowledge/past_prs/current/analysis/review_comments.md decomp-orchestrator/knowledge/past_prs/current/analysis/human_pr_text.md decomp-orchestrator/knowledge/past_prs/prs/known_fixes.md
rg -n "PAD_STACK|inline|register|regalloc|FPR|local" decomp-orchestrator/knowledge/past_prs/current/analysis/review_comments.md decomp-orchestrator/knowledge/past_prs/current/analysis/human_pr_text.md decomp-orchestrator/knowledge/past_prs/prs/known_fixes.md
rg -n "objdiff|checkdiff|require-protos|functionRelocDiffs" decomp-orchestrator/knowledge/past_prs/current/analysis/human_pr_text.md decomp-orchestrator/knowledge/past_prs/prs/index.jsonl
```

Use structured files when counts or PR grouping matter:

```bash
jq 'select(.pr == 2373)' decomp-orchestrator/knowledge/past_prs/current/analysis/text_corpus.jsonl
jq 'select(.pr == 2373 and .change == "add")' decomp-orchestrator/knowledge/past_prs/current/analysis/diff_lines.jsonl
```
