# Code Graph Data

This slice reads the current target checkout rather than owning a copied corpus.
Paths in `source.json` are resolved relative to the `--repo-root` supplied to
graph commands.

The most important input is `src/`. Symbols, splits, objdiff, and report files
are optional but improve function linking, match status, and editability.
