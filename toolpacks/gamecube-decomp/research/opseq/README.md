# Opseq Tool

Opcode sequence lookup surface for finding similar matched and unmatched
functions by instruction patterns.

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

`build_tool_indexes.py` still generates `indexes/function_shapes.jsonl` from
local code-graph/function-shape evidence, so `api/similar_functions.py` can
fall back to supplemental shape rows when no concrete opcode sequence resolves.
