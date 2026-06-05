# Resource-Guided Research

Use this reference before nontrivial decompilation, naming, struct-field, data
layout, or large-sweep decisions. The goal is to build a small evidence packet
before editing so the work is driven by known project facts, prior PR lessons,
and local resources rather than broad ad hoc search.

## Core Rule

Search with a question in mind:

```text
target fact -> local analogs -> historical PR analogs -> resource lookup -> hypothesis -> verifier
```

Do not keep searching because more text exists. Stop when the evidence answers
the current question well enough to make one source-shape or naming decision,
then verify that decision.

## First-Pass Context Packet

For a concrete target file or symbol, start with the bundled helper:

```bash
python3 decomp-orchestrator/knowledge/tools/decomp_context_lookup.py \
  --target src/melee/it/items/itlinkbomb.c \
  --symbol itLinkbomb_UnkMotion3_Anim
```

Add `--term` for observed constants, addresses, callbacks, structs, action
states, hitbox terms, assert strings, or mismatch words:

```bash
python3 decomp-orchestrator/knowledge/tools/decomp_context_lookup.py \
  --target src/melee/ft/chara/ftFox/ftFx_SpecialHi.c \
  --term "0x804D927C" \
  --term "Up-B charge"
```

Use the output as a lead list, not a conclusion. Follow only the hits that are
actually relevant to the target.

## Evidence Surfaces

Use these local sources in this order.

### Target Metadata

Answer: where is the target, what owns its code/data, and what is the current
match state?

```bash
rg -n "FunctionName|file.c" config/GALE01/symbols.txt config/GALE01/splits.txt objdiff.json
jq '.units[] | select(.name=="main/melee/path/file")' build/GALE01/report.json
```

Check this before adding statics, literals, asserts, source files, or includes.
Splits and symbols often explain data-order problems better than C guessing.

### Local Code And Naming

Answer: how does this subsystem already name the same concept?

Search the target file, sibling files, headers, and glossary:

```bash
rg -n "symbol|callback|field|literal" src/melee/path docs/glossary.md
rg -n "Prefix_|MotionState|GET_ITEM|GET_FIGHTER|HSD_ASSERT" src/melee/path
```

Prefer names from:

- existing functions in the same file/TU
- sibling motion-state callbacks or item/fighter variants
- headers and typed union fields
- assert strings, OSReport strings, and known data symbols
- `docs/glossary.md` for common local names like `gobj`, `fp`, `ip`, `jobj`, `pos`, `vel`, `idx`, `cb`, `src`, `dst`, and `cur`

If only an offset is known, use an offset-backed name or `M2C_FIELD` bridge
until a real field name is supported. Do not invent a high-level semantic name
just because it sounds plausible.

### Historical PR Analogs

Answer: has someone solved this file, subsystem, or mismatch pattern before?

Search by exact file first:

```bash
jq 'select(.file=="src/melee/it/items/itlinkbomb.c")' \
  decomp-orchestrator/knowledge/past_prs/current/analysis/changed_files.jsonl
```

Then search by symbol, subsystem, and tactic:

```bash
rg -n "FunctionName|file.c|subsystem" \
  decomp-orchestrator/knowledge/past_prs/current/analysis/human_pr_text.md \
  decomp-orchestrator/knowledge/past_prs/current/analysis/review_comments.md

rg -n "PAD_STACK|regalloc|inline|M2C_FIELD|sdata2|symbols.txt|fake static" \
  decomp-orchestrator/knowledge/past_prs/current/analysis/review_comments.md
```

Use the structured PR library when you want distilled lessons before reading raw
diffs:

```bash
rg -n "FunctionName|file.c|subsystem|regalloc|M2C_FIELD" \
  decomp-orchestrator/knowledge/past_prs/prs/index.jsonl \
  decomp-orchestrator/knowledge/past_prs/prs/known_fixes.md
```

When a PR looks relevant, inspect its text and diff lines:

```bash
jq 'select(.pr == 2510)' decomp-orchestrator/knowledge/past_prs/current/analysis/text_corpus.jsonl
jq 'select(.pr == 2510)' decomp-orchestrator/knowledge/past_prs/current/analysis/diff_lines.jsonl
```

Extract the lesson, not the surface syntax. Prior fake matches are warning signs
unless the same tradeoff is still justified and documented.

### Resource Lookups

Answer: do the resource sheets or PowerPC references already describe this
address, offset, ID, event, or instruction pattern?

Start with the resource index:

```bash
sed -n '1,180p' decomp-orchestrator/knowledge/decomp_resources/index.md
```

Search the normalized data sheet when the target involves memory layout, IDs,
action states, hitboxes, hurtboxes, character data, stage data, attributes,
subaction events, free memory, SFX, music, or debug mappings:

```bash
rg -i "0x80453080|hitbox group|subaction 0x2C|r3 = sfx" \
  decomp-orchestrator/knowledge/decomp_resources/data_sheets/ssbm_data_sheet_1_02/csv/cells.csv
```

Use per-sheet CSVs when a hit needs context:

```bash
sed -n '1,80p' decomp-orchestrator/knowledge/decomp_resources/data_sheets/ssbm_data_sheet_1_02/csv/hitbox_offsets.csv
sed -n '1,80p' decomp-orchestrator/knowledge/decomp_resources/data_sheets/ssbm_data_sheet_1_02/csv/char_data_offsets.csv
```

Use mirrored external indexes as hint sources when local names are missing:

```bash
rg -n "FunctionName|0x8029ef84|itLinkBomb|SubactionEvent" \
  decomp-orchestrator/knowledge/decomp_resources/external/training_mode/indexes/gtme01_map_symbols.csv \
  decomp-orchestrator/knowledge/decomp_resources/external/m_ex/indexes/header_symbols.csv \
  decomp-orchestrator/knowledge/decomp_resources/external/tockdom/compiler.txt
```

Use PDFs when the question is architectural:

```bash
rg -n "mcrfs|rlwinm|Condition Register|r3|stack frame|parameter|compare|conversion|branch" \
  decomp-orchestrator/knowledge/decomp_resources/documents/powerpc/indexes/powerpc_pdf_pages.csv
pdftotext -layout decomp-orchestrator/knowledge/decomp_resources/documents/powerpc/pdfs/ppc_isa.pdf - | rg -n "mcrfs|rlwinm|Condition Register"
pdftotext -layout decomp-orchestrator/knowledge/decomp_resources/documents/powerpc/pdfs/PPCEABI.pdf - | rg -n "r3|stack frame|parameter"
pdftotext -layout decomp-orchestrator/knowledge/decomp_resources/documents/powerpc/pdfs/powerpc-cwg.pdf - | rg -n "compare|conversion|branch"
```

Do not treat community data-sheet wording as final source truth. Use it to find
offsets, IDs, and likely concepts, then validate against local code, asm, and
objdiff.

## Naming Decisions

When choosing function, variable, field, or enum names:

- Keep module prefixes and casing consistent with neighboring code.
- Prefer existing repo names over workbook prose.
- Prefer physical role names (`hitbox`, `hurtbox`, `bone`, `jobj`, `x`, `y`,
  `z`, `scale`, `timer`, `flags`) when behavior is not fully proven.
- Use action/motion names from nearby tables or symbols when available.
- Use address/offset-backed placeholders when confidence is low.
- Record why a name is credible if it comes from data-sheet text, a PR, or a
  debugger note rather than a typed local source.

Good naming evidence:

- same field or helper in a matched sibling function
- same offset named in a header or struct
- assert/report string naming the concept
- PR review approving or correcting the name
- data sheet row matching the exact offset/address plus code behavior

Weak naming evidence:

- a single community prose note without offset/code confirmation
- AI-generated comments
- a broad term found only in unrelated files
- a functionally plausible name that would overstate what is proven

## Hypothesis Log

Before editing, write or keep mentally a compact packet:

```text
Target: symbol, file, unit, address, current fuzzy/match state
Local analogs: 2-5 nearby functions/types/naming examples
Historical analogs: relevant PR numbers or review lessons
Resource facts: exact data-sheet/PDF/doc rows, if any
Decision: one naming/type/control-flow/data-layout hypothesis
Verifier: exact objdiff/build command that will test it
```

For large sweeps, persist this in the run notes. For a quick single-function
change, include the important parts in the final summary.
