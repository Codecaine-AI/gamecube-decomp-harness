# Opseq Runners

Live runner:

```sh
python3 toolpacks/gamecube-decomp/research/opseq/runners/extract_opcode_sequences.py --repo-root <repo_root>
```

The runner parses generated assembly under `build/GALE01/asm`, extracts opcode
sequences for each function, and writes:

- `cache/opcode_fingerprints.jsonl`
- `indexes/opcode_sequences.jsonl`
- `indexes/opcode_fingerprints.jsonl`
- `indexes/opcode_neighbors.jsonl`
- `cache/runner_status.json`

`opcode_sequences.jsonl` keeps the original v1 fields and adds the full
normalized `opcode_sequence`, sequence/hash fields, n-gram hints, and count
buckets. Neighbor rows include score components and evidence references.

Rerun it after regenerating assembly or `build/GALE01/report.json`.
