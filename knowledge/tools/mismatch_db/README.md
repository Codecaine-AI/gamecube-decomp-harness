# Mismatch DB Tool

Search surface for known assembly mismatch patterns, source-shape fixes, and
last-mile matching tactics.

Current state: live runner v1. `bun run kg:tool-runner:mismatch-db` chooses an
imperfect function from `build/GALE01/report.json`, runs `objdiff-cli diff`,
and writes:

- `cache/runner_status.json`
- `cache/objdiff_<symbol>.json`
- `indexes/objdiff_mismatches.jsonl`

`build_tool_indexes.py` still generates `indexes/patterns.jsonl` from imported
mismatch/MWCC reference docs, so `api/search.py` returns both live objdiff
evidence and supplemental local pattern notes.

Reference material:

- `reference/SKILL.md`
