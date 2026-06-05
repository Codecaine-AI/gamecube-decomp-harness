---
name: melee-decomp
description: Decompile and improve doldecomp/melee source using repo-specific matching tactics, resource-guided research, MWCC code-shape heuristics, objdiff/checkdiff verification, PR review standards, and AI-assisted decomp quality gates. Use when working on Melee decompilation tasks, matching functions, improving fuzzy matches, cleaning AI-generated decomp code, naming functions or fields, diagnosing regalloc/stack/data-ordering mismatches, splitting translation units, planning large sweeps, or preparing/reviewing PRs in this repo.
---

# Melee Decomp

Use this knowledge pack to behave like a careful `doldecomp/melee` contributor, not just a C generator. Prefer byte matches that also improve source quality, type information, and future maintainability.

## First Move

1. Identify the exact target: symbol, file, object/TU, current match percent, and whether the user wants a 100% match, fuzzy improvement, cleanup, split, or analysis.
2. For nontrivial targets, build a small evidence packet before editing: target metadata, local analogs, historical PR analogs, resource/data-sheet facts, and the verifier command that will test the next hypothesis.
3. Inspect existing local style before changing code. Search nearby matched functions, headers, unions, macros, includes, and prior source in the same subsystem.
4. Establish a baseline with the narrowest relevant build/diff command available. Do not claim a match without verifier output.
5. If target context is missing and cannot be inferred, ask for the symbol or file. Otherwise proceed with the strongest local assumption.

## Core Workflow

For a detailed one-symbol path from target selection through objdiff, permuter, cleanup, and final verification, read [single-function-iteration.md](references/single-function-iteration.md). For naming, struct/data layout, architecture-reference, historical-PR, or large-sweep decisions, read [resource-guided-research.md](references/resource-guided-research.md).

1. **Gather context**
   - Use `rg` for the symbol, file, related callbacks, assert strings, OSReport strings, literals, and existing helper patterns.
   - Check `config/GALE01/symbols.txt`, `config/GALE01/splits.txt`, headers, and neighboring functions when data layout or TU boundaries matter.
   - Use `decomp-orchestrator/knowledge/packs/melee-decomp/scripts/decomp_context_lookup.py` to assemble first-pass local/PR/resource hits for concrete file or symbol targets.
   - Search `decomp-orchestrator/knowledge/decomp_resources/data_sheets/ssbm_data_sheet_1_02/csv/cells.csv` and per-sheet CSVs when offsets, IDs, action states, hitboxes, hurtboxes, attributes, SFX, stages, or character data might explain a name or layout.
   - For generated or AI-written code, compare against `m2c`, Ghidra, objdiff/checkdiff, and existing repo conventions before trusting semantics.

2. **Generate or adjust source shape**
   - Start from natural C and repo idioms.
   - Change one dimension at a time: control flow, local order/lifetime, helper extraction, inline shape, pragmas, struct fields, or data declarations.
   - Prefer real types and named fields over offset math. Use `M2C_FIELD` or a temporary struct only as a bridge.

3. **Verify narrowly, then broadly**
   - Use commands such as `python configure.py --require-protos`, `ninja`, target object builds, and `build/tools/objdiff-cli diff -p . -u <unit> <symbol>`.
   - Treat `tools/checkdiff.py` references in old PR notes as contributor-specific or historical unless that script exists in the checkout.
   - Check adjacent functions and object/TU-level regressions after changing pragmas, includes, literals, statics, splits, or source bodies in partially matched files.
   - Treat `main.dol: OK` or object-level reports as stronger evidence than a single-symbol local match.

4. **Clean for review**
   - Remove fake statics, template leftovers, speculative comments, unused includes, and verifier-only scaffolding.
   - Scope pragmas with `#pragma push` / `#pragma pop`.
   - Use canonical macros and include style.
   - Explain known fake-match tradeoffs, remaining mismatches, and exact verification commands in the PR notes.

## Resource-Guided Decisions

Read [resource-guided-research.md](references/resource-guided-research.md) when the task involves naming, unknown offsets, structs, data ownership, ABI/instruction interpretation, or broad strategy. The expected flow is:

```text
target fact -> local analogs -> historical PR analogs -> resource lookup -> hypothesis -> verifier
```

Use resources as evidence, not as replacements for verification:

- PR dumps show prior tactics and review lessons; they should guide hypotheses, not be copied blindly.
- The SSBM data sheet CSVs are good for finding addresses, offsets, IDs, hitbox/hurtbox fields, action states, attributes, and debug mappings; validate them against local code and assembly.
- PowerPC PDFs are for ABI, stack/register, instruction, and compiler-pattern questions.
- Names should come from nearby source, symbols, headers, assert/report strings, approved PR patterns, or exact offset/data-sheet evidence. If confidence is low, keep an offset-backed placeholder or `M2C_FIELD` bridge.

## Matching Heuristics

Read [matching-tactics.md](references/matching-tactics.md) when actively trying to close instruction, stack, register, literal, section-order, or TU-split mismatches.

High-yield patterns:

- MWCC register allocation is sensitive to local declaration order, branch scope, and temporary lifetime.
- Loop form matters. Try `for`/`while`/`do` variants, allocation placement, and direct control flow before accepting awkward gotos.
- Repeated stack mismatches often indicate a missing inline or helper, not just a need for `PAD_STACK`.
- Inlines can force original data-dependent register copies, but helper accessors can also break matches.
- Data and literal ordering can regress neighbors even when the target function improves.
- Wrong calls or float literals require relocation-aware diffing, not just instruction text comparison.

## Review Standards

Read [review-standards.md](references/review-standards.md) before opening a PR, reviewing AI-generated code, or deciding whether a byte-perfect match is too fake.

Default quality bar:

- Actual struct/field access is better than `M2C_FIELD`; `M2C_FIELD` is better than raw `u8*` offset math.
- `GET_GROUND`, `GET_ITEM`, `GET_FIGHTER`, `GET_JOBJ`, and domain-specific `GObj` typedefs are useful type signals.
- Use existing `HSD_ASSERT`, `HSD_ASSERTMSG`, `HSD_ASSERTREPORT`, and `OSReport` patterns. Do not redefine project macros to force data placement.
- Avoid inline assembly outside SDK-like code.
- Do not add fake statics or fake helper functions for section ordering unless the tradeoff is explicit and temporary.
- Do not let a 100% match hide undefined behavior, out-of-bounds writes, wrong pointer scaling, or missing varargs.

## AI-Assisted Work

Read [ai-assisted-workflow.md](references/ai-assisted-workflow.md) when using an LLM or agent harness to produce candidate matches.

Operating rule: use AI for variants, search, cleanup, and hypothesis generation; use compiler-aware tools and verifier gates to decide what survives.

Minimum gates for AI-generated source:

- starts from m2c/Ghidra/known source context, not pure invention
- no `NOT_IMPLEMENTED`, template leaks, or C99 loop-var declarations
- no raw pointer arithmetic where known project types exist
- improves objdiff/checkdiff or clearly documents fuzzy progress
- passes `--require-protos` and the relevant object/symbol checks
- has human-readable names and no unverified semantic comments

## Evidence Base

Read [evidence-index.md](references/evidence-index.md) for the PR-derived basis behind this knowledge pack and for examples worth loading when a tactic needs justification.

This knowledge pack was distilled from the current repo-local past-PR corpus:

- 378 PRs
- 427 issue comments
- 104 inline review comments
- 107 reviews
- 378 diffs
- 0 non-empty `.diff.err` files

The source corpus is repo-local under `decomp-orchestrator/knowledge/past_prs/current/analysis/`, including `text_corpus.jsonl`, `human_pr_text.md`, `review_comments.md`, and `diff_lines.jsonl`. The searchable per-PR JSON library lives under `decomp-orchestrator/knowledge/past_prs/prs/`. Refresh-window details live in `decomp-orchestrator/knowledge/past_prs/current/fetch_metadata.json`, not in the folder name.
