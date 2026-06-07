# Ghidra Runners

Live runner:

```sh
bun run kg:tool-runner:ghidra
```

The runner resolves Homebrew Ghidra/OpenJDK when present, runs
`analyzeHeadless` against `build/GALE01/main.elf`, and records bounded smoke
evidence in `cache/runner_status.json`, `cache/ghidra_headless_probe.log`, and
`indexes/ghidra_headless_probe.jsonl`.

Set `GHIDRA_ANALYZE_HEADLESS` or pass `--analyze-headless <path>` to use a
non-Homebrew Ghidra install.
