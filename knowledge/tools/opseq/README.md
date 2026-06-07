# Opseq Tool

Opcode sequence lookup surface for finding similar matched and unmatched
functions by instruction patterns.

Current state: live runner v1. `bun run kg:tool-runner:opseq` parses
`build/GALE01/asm/**/*.s`, extracts one opcode fingerprint per function, and
writes:

- `cache/runner_status.json`
- `cache/opcode_fingerprints.jsonl`
- `indexes/opcode_sequences.jsonl`

`build_tool_indexes.py` still generates `indexes/function_shapes.jsonl` from
local code-graph/function-shape evidence, so `api/similar_functions.py` can
search both live opcode fingerprints and supplemental shape rows.

Reference material:

- `reference/SKILL.md`
