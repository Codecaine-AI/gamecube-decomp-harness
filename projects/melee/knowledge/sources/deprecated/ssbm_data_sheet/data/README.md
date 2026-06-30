# SSBM Data Sheet Data

The workbook and CSV exports remain in
`knowledge/sources/code_context/ssbm_data_sheet/data`.

This source treats the sheet as useful but potentially stale external evidence.
Graph edges from this corpus should be conservative and clearly cite the sheet
or CSV row that produced the hint.

`data/generated` contains checkout-derived CSVs maintained by
`commands/build_codebase_facts.py`. Those files are local evidence, not edits to
the external workbook. They let the data-sheet lookup answer from current
function addresses, symbols, source references, and local curator lessons while
keeping the workbook available for historical comparison.
