# Ghidra Tool

Cache-backed Ghidra lookup surface for xrefs, strings, names, and bounded
headless import/analyze evidence.

Current state: live runner v1. `bun run kg:tool-runner:ghidra` resolves the
Homebrew Ghidra/OpenJDK install, runs `analyzeHeadless` against
`build/GALE01/main.elf`, and writes:

- `cache/runner_status.json`
- `cache/ghidra_headless_probe.log`
- `indexes/ghidra_headless_probe.jsonl`

`build_tool_indexes.py` also generates `indexes/symbol_lookup.jsonl` from local
code-graph/source-symbol evidence for symbol/address/file lookup. Those rows
are supplemental; live readiness comes from the headless runner smoke.

Reference material:

- `reference/SKILL.md`
