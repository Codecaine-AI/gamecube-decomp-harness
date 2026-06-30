# SSBM Data Sheet API

CLI-style worker access:

- `python3 projects/melee/knowledge/sources/deprecated/ssbm_data_sheet/api/status.py --json`
- `python3 projects/melee/knowledge/sources/deprecated/ssbm_data_sheet/api/search.py --query <query> --limit <n> --json`
- `python3 projects/melee/knowledge/sources/deprecated/ssbm_data_sheet/api/lookup_address.py --address <hex> --limit <n> --json`
- `python3 projects/melee/knowledge/sources/deprecated/ssbm_data_sheet/api/lookup_offset.py --type <type> --offset <hex> --limit <n> --json`

Results include sheet/source CSV paths, row/column context, evidence refs, and
payload rows.

Lookup results rank generated local facts before legacy workbook rows when both
match the query. Codebase function, symbol, source-reference, and curator lesson
records carry their own `lookup_source` and `trust_tier` fields. Workbook rows
remain available as legacy sheet evidence and should still be treated as hints
until local code and assembly confirm them.

`status.py --json` reports whether `indexes/codebase_facts.jsonl` is fresh
against the checkout inputs recorded in `indexes/codebase_facts.meta.json`.
