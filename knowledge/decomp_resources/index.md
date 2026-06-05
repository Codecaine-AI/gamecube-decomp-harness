# Melee Decomp Resource Library

This is the single top-level entry point for local decompilation resources. The
folder is vertically sliced so agents can search targeted evidence instead of
wandering across unrelated files.

## Search First

For a target, build evidence in this order:

1. Target metadata: `config/GALE01/symbols.txt`, `config/GALE01/splits.txt`,
   `objdiff.json`, and `build/GALE01/report.json`.
2. Local code and naming: nearby `src/` files, headers, `.github/README.md`,
   `.github/CONTRIBUTING.md`, and `docs/glossary.md`.
3. Historical analogs: `decomp-orchestrator/knowledge/past_prs/current/analysis/` and
   `decomp-orchestrator/knowledge/past_prs/prs/`.
4. Resource facts from this library.
5. One hypothesis plus one verifier command.

Fast resource searches:

```sh
rg -i "hitbox group|r3 = sfx|0x80453080" \
  decomp-orchestrator/knowledge/decomp_resources/data_sheets/ssbm_data_sheet_1_02/csv

rg -n "stack frame|Condition Register|rlwinm|conversion|branch" \
  decomp-orchestrator/knowledge/decomp_resources/documents/powerpc/indexes/powerpc_pdf_pages.csv

rg -n "0x8029ef84|SubactionEvent|itLinkBomb" \
  decomp-orchestrator/knowledge/decomp_resources/external/training_mode/indexes/gtme01_map_symbols.csv \
  decomp-orchestrator/knowledge/decomp_resources/external/m_ex/indexes/header_symbols.csv

rg -n "PAD_STACK|regalloc|M2C_FIELD|sdata2" \
  decomp-orchestrator/knowledge/past_prs/current/analysis \
  decomp-orchestrator/knowledge/past_prs/prs
```

The bundled context helper searches the main local and mirrored surfaces:

```sh
python3 decomp-orchestrator/knowledge/tools/decomp_context_lookup.py \
  --target src/melee/it/items/itlinkbomb.c \
  --symbol itLinkbomb_UnkMotion3_Anim
```

## Library Layout

| Slice | Path | What it contains |
| --- | --- | --- |
| Manifests | `manifests/` | `resource_index.csv` for known resources and `acquisition_queue.csv` for mirrored/candidate external pulls. |
| Data sheets | `data_sheets/ssbm_data_sheet_1_02/` | Source workbook, 18 per-sheet CSVs, normalized `cells.csv`, and the exporter. |
| Documents | `documents/powerpc/` | PowerPC PDFs plus page-level searchable CSV. |
| External mirrors | `external/` | Training Mode MAP, Tockdom compiler page, m-ex include snapshot, ppc2cpp branch snapshot, and generated indexes. |
| Guides | `guides/` | Cleaned-up human notes and trust/caution rules for resource use. |

## Primary Local Artifacts

| Path | Records | Best use |
| --- | ---: | --- |
| `manifests/resource_index.csv` | 50+ resources | Machine-readable top-level catalog for ingestion. |
| `manifests/acquisition_queue.csv` | 8 resources | Pull status, local mirror paths, cautions, and refresh commands. |
| `data_sheets/ssbm_data_sheet_1_02/csv/cells.csv` | 9,628 cells | Global search across the SSBM Data Sheet workbook. |
| `data_sheets/ssbm_data_sheet_1_02/csv/sheet_index.csv` | 18 sheets | Find the right per-sheet CSV and understand sheet scope. |
| `documents/powerpc/indexes/powerpc_pdf_pages.csv` | 520 pages | Search ABI, compiler-guide, and ISA PDFs by page. |
| `external/training_mode/indexes/gtme01_map_symbols.csv` | 20,951 symbols | Address/name hint lookup for Dolphin MAP/debugger workflows. |
| `external/m_ex/indexes/header_symbols.csv` | 2,790 symbols | Header names, defines, typedefs, struct names, and function-name hints. |
| `external/tockdom/compiler.txt` | 1 page | Quick compiler/calling-convention reference text. |
| `external/ppc2cpp/indexes/source_files.csv` | 710 files | Historical PPC mips_to_c branch archaeology. |
| `decomp-orchestrator/knowledge/past_prs/prs/index.jsonl` | 378 PRs | Structured PR lessons, tactics, and postmortem lookup. |

## Slice Details

### Data Sheets

Source workbook:

- `data_sheets/ssbm_data_sheet_1_02/source/ssbm_data_sheet_1_02.xlsx`

Generated search tables:

- `data_sheets/ssbm_data_sheet_1_02/csv/cells.csv`
- `data_sheets/ssbm_data_sheet_1_02/csv/sheet_index.csv`
- `data_sheets/ssbm_data_sheet_1_02/csv/*.csv`

Refresh:

```sh
python3 decomp-orchestrator/knowledge/decomp_resources/data_sheets/ssbm_data_sheet_1_02/tools/export_ssbm_data_sheet.py
```

High-value sheets include global addresses, function addresses, action states,
ID lists, stage/entity/hitbox/hurtbox offsets, character data offsets,
character attributes, subaction events, and debug/free-memory maps.

### PowerPC Documents

PDFs:

- `documents/powerpc/pdfs/PPCEABI.pdf`
- `documents/powerpc/pdfs/powerpc-cwg.pdf`
- `documents/powerpc/pdfs/ppc_isa.pdf`

Search index:

- `documents/powerpc/indexes/powerpc_pdf_pages.csv`

Refresh:

```sh
python3 decomp-orchestrator/knowledge/decomp_resources/documents/powerpc/tools/build_powerpc_pdf_index.py
```

Use these for ABI rules, register roles, stack frames, parameter passing,
instruction semantics, condition-register behavior, branch forms, conversions,
and compiler-emitted code patterns.

### External Mirrors

Training Mode MAP:

- Raw: `external/training_mode/GTME01.map`
- Index: `external/training_mode/indexes/gtme01_map_symbols.csv`
- Use as address/name hints for debugger work. Validate names locally.

Tockdom compiler page:

- HTML: `external/tockdom/compiler.html`
- Text: `external/tockdom/compiler.txt`
- Index: `external/tockdom/indexes/compiler_page.csv`
- Use as a quick calling-convention reference, below the ABI PDF in authority.

m-ex include snapshot:

- Snapshot: `external/m_ex/include/`
- Commit: `external/m_ex/source_commit.txt`
- Indexes: `external/m_ex/indexes/header_files.csv`,
  `external/m_ex/indexes/header_symbols.csv`
- Use names as search hints only. Do not copy structs/fields into this repo
  without decompilation evidence.

ppc2cpp historical branch:

- Snapshot: `external/ppc2cpp/mips_to_c_ppc2cpp_branch/`
- Commit: `external/ppc2cpp/source_commit.txt`
- Index: `external/ppc2cpp/indexes/source_files.csv`
- Use only for archaeology or old scratch comparison. Prefer current
  `tools/decomp.py` and m2c for new work.

Refresh all external indexes after replacing mirrored files:

```sh
python3 decomp-orchestrator/knowledge/decomp_resources/external/tools/build_external_indexes.py
```

## Trust Rules

- Local source, headers, symbols, splits, and objdiff verification outrank all
  mirrored external resources.
- Data sheet rows are useful for offsets, IDs, and lookup terms; verify names and
  struct fields against local code/assembly.
- Training Mode and m-ex names are hints, not canonical repo naming decisions.
- PDF page indexes are search artifacts. Inspect the PDF/page when the exact rule
  matters.
- PR postmortems and review comments provide tactics and warnings, not code to
  copy blindly.
