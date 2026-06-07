# Knowledge Tools

Callable external tool integrations live here. They are not nested under
`knowledge/resource_graph` because they are not the graph itself; the graph only
consumes their normalized cached outputs through the `tool_outputs` source.

Each tool keeps the same top-level shape:

```text
<tool_id>/
+-- tool.json
+-- README.md
+-- api/
|   +-- README.md
+-- runners/
|   +-- README.md
+-- cache/
|   +-- README.md
+-- indexes/
|   +-- README.md
+-- tests/
    +-- README.md
```

The v1 APIs are intentionally small CLI-style scripts. A tool is considered
live-ready only when its runner command has produced `cache/runner_status.json`
with `success: true`, and `api/status.py --json` reports
`operation_mode: live_runner_v1` plus `runner_smoke_passed: true`.

Generated local indexes:

- `python3 knowledge/tools/build_tool_indexes.py --repo-root <repo_root>`
  creates JSONL indexes for every registered tool.
- `bun run kg:tool-runner:ghidra` imports/analyzes
  `build/GALE01/main.elf` with Ghidra `analyzeHeadless` and writes
  `ghidra/indexes/ghidra_headless_probe.jsonl`.
- `bun run kg:tool-runner:opseq` extracts opcode fingerprints from
  `build/GALE01/asm` and writes `opseq/indexes/opcode_sequences.jsonl`.
- `bun run kg:tool-runner:mismatch-db` runs a narrow `objdiff-cli diff` on an
  imperfect function and writes `mismatch_db/indexes/objdiff_mismatches.jsonl`.
- `bun run kg:tool-runner:mwcc-debug` smokes the local Wine/MWCC compiler path
  and writes `mwcc_debug/indexes/mwcc_probes.jsonl`.

The generated source-symbol, function-shape, mismatch-note, and compiler-note
indexes remain useful lookup evidence, but they are supplemental. `kg:smoke
-- --strict` now requires live runner smoke for every registered tool.
