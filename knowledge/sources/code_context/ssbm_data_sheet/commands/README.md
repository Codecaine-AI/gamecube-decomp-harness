# SSBM Data Sheet Commands

Current commands:

- `build_codebase_facts.py --repo-root <repo_root> --json` refreshes the local
  generated CSVs, `indexes/codebase_facts.jsonl`, and freshness metadata from
  the current checkout.
- `build_codebase_facts.py --repo-root <repo_root> --check --json` reports
  whether the generated facts are stale against report, objdiff, symbols,
  splits, source files, and curator updates.
- `data/tools/export_ssbm_data_sheet.py` reruns the workbook-to-CSV export when
  the external workbook is replaced.

`kg-maintain` runs `build_codebase_facts.py` after curator updates and before
graph rebuild unless `--no-data-sheet-facts` is supplied.
