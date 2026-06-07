# MWCC Debug Runners

Live runner:

```sh
bun run kg:tool-runner:mwcc-debug
```

The runner smokes `build/compilers/GC/1.2.5n/mwcceppc.exe` through Wine,
captures the version output, extracts representative MWCC build-rule snippets
from `build.ninja`, and writes `cache/mwcc_version_probe.txt`,
`cache/mwcc_build_rule_snippets.json`, `indexes/mwcc_probes.jsonl`, and
`cache/runner_status.json`.
