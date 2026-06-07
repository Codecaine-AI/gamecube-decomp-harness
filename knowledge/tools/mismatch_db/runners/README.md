# Mismatch DB Runners

Live runner:

```sh
bun run kg:tool-runner:mismatch-db
```

The runner chooses an imperfect function from `build/GALE01/report.json`, runs a
narrow `build/tools/objdiff-cli diff`, and writes `cache/objdiff_<symbol>.json`,
`indexes/objdiff_mismatches.jsonl`, and `cache/runner_status.json`.

Pass `--unit <unit> --symbol <symbol>` to analyze a specific target.
