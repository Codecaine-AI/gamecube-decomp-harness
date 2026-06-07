# Opseq Runners

Live runner:

```sh
bun run kg:tool-runner:opseq
```

The runner parses generated assembly under `build/GALE01/asm`, extracts opcode
fingerprints for each function, and writes `cache/opcode_fingerprints.jsonl`,
`indexes/opcode_sequences.jsonl`, and `cache/runner_status.json`.

Rerun it after regenerating assembly or `build/GALE01/report.json`.
