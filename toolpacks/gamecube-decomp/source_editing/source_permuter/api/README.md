# Source Permuter API

Worker-facing commands:

- `python3 toolpacks/gamecube-decomp/source_editing/source_permuter/api/status.py --repo-root <repo_root> --json`
- `python3 toolpacks/gamecube-decomp/source_editing/source_permuter/api/run.py --repo-root <repo_root> --function <symbol> --json`
- `python3 toolpacks/gamecube-decomp/source_editing/source_permuter/api/replay.py --repo-root <repo_root> --replay <recipe.json> --json`
- `python3 toolpacks/gamecube-decomp/source_editing/source_permuter/api/preview_mutation.py --repo-root <repo_root> --source-path <src.c> --function <symbol> --json`

`run.py` and `replay.py` preserve the tool-local command output. `run.py`
defaults to one internal job and caps accepted `--jobs` values with
`ORCH_SOURCE_PERMUTER_MAX_JOBS` (default 1). They are opportunistic expensive
tools: if all configured source-permuter slots are full, the API returns
`queue_busy` instead of waiting. `preview_mutation.py` is useful for asking
"what kind of source-shape change would this pass try?" before spending compile
time.
