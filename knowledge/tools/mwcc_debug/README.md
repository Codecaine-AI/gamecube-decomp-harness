# MWCC Debug Tool

Lookup surface for cached MWCC pcdump output, compiler-pass summaries, and
last-mile compiler behavior notes.

Current state: live runner v1. `bun run kg:tool-runner:mwcc-debug` runs the
local `GC/1.2.5n` MWCC executable through Wine with `-version`, captures the
compiler output, extracts representative build-rule snippets from
`build.ninja`, and writes:

- `cache/runner_status.json`
- `cache/mwcc_version_probe.txt`
- `cache/mwcc_build_rule_snippets.json`
- `indexes/mwcc_probes.jsonl`

`build_tool_indexes.py` still generates `indexes/dumps.jsonl` from imported
MWCC reference docs. Full pcdump cache generation remains a richer future
runner, but the registered slice now has live local compiler evidence.

Reference material:

- `reference/SKILL.md`
- `reference/mwcc-inspect-SKILL.md`
- `knowledge/sources/reference_docs/data/docs/mwcc-debug.md`
