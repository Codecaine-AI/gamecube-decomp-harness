# Opseq API

CLI-style worker access:

- `python3 toolpacks/gamecube-decomp/research/opseq/api/status.py --repo-root <repo_root> --json`
- `python3 toolpacks/gamecube-decomp/research/opseq/api/similar_functions.py --query <query> --limit <n> --json`

Queries should be small and concrete: a function name, source path, symbol, or
opcode-sequence fingerprint.

`similar_functions.py` returns separate `exact_lookup` and
`similar_neighbors` arrays. Symbol/path/address/hash queries that resolve to a
function use precomputed `indexes/opcode_neighbors.jsonl` evidence; raw opcode
sequence queries are scored on demand against `indexes/opcode_sequences.jsonl`.
