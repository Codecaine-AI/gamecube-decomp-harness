# Ghidra Runners

Knowledge-graph evidence runner:

```sh
python3 toolpacks/gamecube-decomp/research/ghidra/runners/export_xrefs.py --repo-root <repo_root>
```

The runner resolves Ghidra/OpenJDK, analyzes `build/GALE01/main.elf`, and writes
cross-reference rows to `indexes/xrefs.jsonl`. A missing local Ghidra install
records a clean skipped status without erasing an existing export.

Set `GHIDRA_ANALYZE_HEADLESS` or pass `--analyze-headless <path>` to use a
non-Homebrew Ghidra install.

`run_headless_probe.py` remains an operator smoke diagnostic; it is not the
registered knowledge-maintenance runner.
