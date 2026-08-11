# Ghidra Tool

Cache-backed Ghidra lookup surface for xrefs, strings, names, and bounded
headless import/analyze evidence.

Current state: live runner v1.
`python3 toolpacks/gamecube-decomp/research/ghidra/runners/run_headless_probe.py --repo-root <repo_root>`
resolves the Homebrew Ghidra/OpenJDK install, runs `analyzeHeadless` against
`build/GALE01/main.elf`, and writes:

- `cache/runner_status.json`
- `cache/ghidra_headless_probe.log`
- `indexes/ghidra_headless_probe.jsonl`

`build_tool_indexes.py` also generates `indexes/symbol_lookup.jsonl` from local
code-graph/source-symbol evidence for symbol/address/file lookup. Those rows
are supplemental; live readiness comes from the headless runner smoke.

## Xref export

`python3 toolpacks/gamecube-decomp/research/ghidra/runners/export_xrefs.py --repo-root <repo_root>`
runs a separate headless project and writes `indexes/xrefs.jsonl`,
`cache/export_xrefs_status.json`, and `cache/ghidra_export_xrefs.log` under the
tool storage root. Use `--limit <rows>` to retain a bounded prefix or `0` for
all exported references.
