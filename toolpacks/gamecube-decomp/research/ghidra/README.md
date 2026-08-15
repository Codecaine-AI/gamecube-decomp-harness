# Ghidra Tool

Ghidra-derived cross-reference evidence generator. It is a maintenance input to
the knowledge graph, not a separate worker lookup surface.

## Xref export

`python3 toolpacks/gamecube-decomp/research/ghidra/runners/export_xrefs.py --repo-root <repo_root>`
runs a separate headless project and writes `indexes/xrefs.jsonl`,
`cache/export_xrefs_status.json`, and `cache/ghidra_export_xrefs.log` under the
tool storage root. Use `--limit <rows>` to retain a bounded prefix or `0` for
all exported references.

Rebuild the graph after export. Workers retrieve resolved calls and data
references with `graph_related_functions` or `code_graph_file_card`, and use
`knowledge_graph_search` for lexical discovery across unresolved evidence.
The older status and lookup scripts remain operator diagnostics only.
