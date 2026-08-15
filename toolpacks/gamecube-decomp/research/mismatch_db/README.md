# Mismatch DB Tool

Objdiff evidence generator for graph-owned mismatch patterns, source-shape
fixes, and last-mile matching tactics.

Current state: live runner v1.
`python3 toolpacks/gamecube-decomp/research/mismatch_db/runners/analyze_objdiff_mismatches.py --repo-root <repo_root>`
chooses an imperfect function from `build/GALE01/report.json`, runs
`objdiff-cli diff`, and writes:

- `cache/runner_status.json`
- `cache/objdiff_<symbol>.json`
- `indexes/objdiff_mismatches.jsonl`

Rebuild the graph after refresh. Workers retrieve patterns with
`knowledge_graph_search` and linked file evidence with
`code_graph_file_card`. `api/search.py` remains an operator diagnostic for raw
indexes, not a worker-facing search API.
