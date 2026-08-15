# Opseq Tool

Opcode-sequence evidence generator for linking similar matched and unmatched
functions in the knowledge graph.

Current state: live runner v2.
`python3 toolpacks/gamecube-decomp/research/opseq/runners/extract_opcode_sequences.py --repo-root <repo_root>`
parses `build/GALE01/asm/**/*.s`, extracts one opcode fingerprint per function,
persists full normalized opcode sequences, deterministic fingerprints, and
top-K neighbor evidence. It writes:

- `cache/runner_status.json`
- `cache/opcode_fingerprints.jsonl`
- `indexes/opcode_sequences.jsonl`
- `indexes/opcode_fingerprints.jsonl`
- `indexes/opcode_neighbors.jsonl`

Rebuild the graph after refresh. Workers retrieve analogs with
`graph_related_functions`, `knowledge_graph_search`, or
`code_graph_file_card`. `api/similar_functions.py` remains an operator
diagnostic for inspecting raw indexes, not a worker-facing search API.
