# Melee Decomp Resource Notes

This is the cleaned-up archive of the original resource scratchpad. The canonical
entry point is `../index.md`; machine-readable manifests live in `../manifests/`.

Use these resources as evidence for a decompilation hypothesis, not as a
replacement for local code, assembly, and objdiff verification.

## Context Order

For a concrete target, gather context in this order:

1. Target metadata: `config/GALE01/symbols.txt`, `config/GALE01/splits.txt`,
   `objdiff.json`, and `build/GALE01/report.json`.
2. Local code and naming: nearby `src/` files, headers, `.github/README.md`,
   `.github/CONTRIBUTING.md`, and `docs/glossary.md`.
3. Historical analogs: `decomp-orchestrator/knowledge/past_prs/current/analysis/` and the structured
   per-PR JSON library under `decomp-orchestrator/knowledge/past_prs/prs/`.
4. Resource facts: data sheet CSVs, PowerPC PDF page index, Training Mode map
   symbols, m-ex header names, Tockdom compiler notes, and ppc2cpp archaeology.
5. One hypothesis plus one verifier command.

The helper below builds a first-pass packet across those surfaces:

```sh
python3 decomp-orchestrator/knowledge/tools/decomp_context_lookup.py \
  --target src/melee/it/items/itlinkbomb.c \
  --symbol itLinkbomb_UnkMotion3_Anim
```

## Local Slices

| Slice | Path | Best use |
| --- | --- | --- |
| Data sheet | `../data_sheets/ssbm_data_sheet_1_02/` | Workbook plus 18 per-sheet CSVs and a normalized `cells.csv` search table. |
| PowerPC documents | `../documents/powerpc/` | Local PDFs plus a page-level CSV index for ABI, compiler-pattern, and ISA lookup. |
| External mirrors | `../external/` | Training Mode MAP, Tockdom compiler page, m-ex include snapshot, and ppc2cpp branch snapshot. |
| Manifests | `../manifests/` | Resource manifest and acquisition status queue. |
| Past PRs | `../../past_prs/` | Searchable historical PR dump and per-PR JSON postmortems. |

## External Trust Notes

| Resource | Status | Caution |
| --- | --- | --- |
| Training Mode `GTME01.map` | Mirrored and indexed. | Good address/name hint source for debugger work, but labels are not canonical repo names. |
| Tockdom compiler page | Mirrored and indexed. | Useful quick calling-convention reference; prefer local ABI PDF for final rules. |
| m-ex `MexTK/include` | Mirrored and indexed. | Header names and field terms are search hints only; verify every layout decision locally. |
| ppc2cpp branch | Mirrored as historical source. | Superseded by current `tools/decomp.py`/m2c for normal work. |
| Ghidra, IDA, Dolphin workflow docs | Not mirrored as setup notes yet. | Write local repeatable workflow notes before treating these as agent resources. |
