# SSBM Data Sheet Source

Deprecated source slice. It remains available under
`projects/melee/knowledge/sources/deprecated/ssbm_data_sheet` for manual lookup
and reproducibility, but it is inactive in `registry.json` and is not part of
the default worker tool surface.

Indexed source for codebase-backed data-sheet search and conservative graph
hints.

The actual workbook and CSV exports live in
`projects/melee/knowledge/sources/deprecated/ssbm_data_sheet/data`. This
slice points to them through project storage and should treat results as
external hints because the sheet can be stale.

The lookup surface also includes generated local facts derived from the current
checkout:

- `data/generated/function_addresses.csv` from `build/GALE01/report.json`, with
  fallback to the checked-in `code_graph` index.
- `data/generated/data_symbols.csv` from `config/GALE01/symbols.txt`, enriched
  with owner ranges from `config/GALE01/splits.txt`.
- `data/generated/source_references.csv` from `src/` and `include/` symbol and
  hex-literal references.
- `data/generated/curator_updates.csv` from local curator proposals targeting
  this source.
- `data/generated/sheet_reconciliation.csv` comparing generated code facts to
  legacy workbook mentions.

Generated local lookup facts are written to `indexes/codebase_facts.jsonl` by
`commands/build_codebase_facts.py`. Generated cell/row graph chunks are written
to `indexes/cells.jsonl` during `kg-rebuild-graph`, which reads both `data/csv`
and `data/generated`.
