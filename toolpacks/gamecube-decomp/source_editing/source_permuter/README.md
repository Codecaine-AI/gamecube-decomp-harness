# Source Permuter Tool Suite

This suite wraps the tool-local source-level permuter. It works on the real C
translation unit text, compiles candidates with the same MWCC rule as the
project build, and scores candidates through objdiff.

APIs:

- `run.py` searches for an improving candidate and returns the best diff.
- `replay.py` replays a saved JSON recipe against the current source.
- `preview_mutation.py` runs one or more tree-sitter mutation steps and returns
  a unified diff without compiling.

The default API behavior is conservative: permutation calls use `--apply never`
unless explicitly overridden outside the worker profile, and `run.py` defaults
to a single internal worker thread. `ORCH_SOURCE_PERMUTER_MAX_JOBS` caps
accepted `--jobs` values and defaults to 1. Run/replay calls are opportunistic;
when the configured source-permuter slots are full, new calls return
`queue_busy` rather than blocking a worker. A worker should treat the result as
a candidate hypothesis, then apply a small understood edit and verify it with
checkdiff/objdiff.
