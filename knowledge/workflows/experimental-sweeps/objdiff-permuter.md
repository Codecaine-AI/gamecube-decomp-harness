# Objdiff And Permuter Integration

Use objdiff as the scorer and the permuter as a finalist accelerator.

## Isolation Rule

Do not run parallel candidates that write to the same `build/GALE01/src/...` object. Use one of:

- isolated candidate object output paths built with reconstructed MWCC commands;
- isolated git worktrees/build directories per worker;
- serialized `ninja` builds for candidates that must compile through the repo;
- permuter work directories, which already mutate copies under `decomp-permuter/nonmatchings/`.

## Objdiff JSON

Generate JSON for every candidate:

```bash
build/tools/objdiff-cli diff -1 <target.o> -2 <candidate.o> <symbol> \
  --format json-pretty -o decomp-runs/<run>/artifacts/diff_json/<config_id>.<symbol>.json
```

When using project units:

```bash
build/tools/objdiff-cli diff -p . -u <unit> <symbol> \
  --format json-pretty -o decomp-runs/<run>/artifacts/diff_json/<config_id>.<symbol>.json
```

Summarize the JSON into compact diff text:

```bash
python decomp-orchestrator/knowledge/tools/sweeps/summarize_objdiff_json.py \
  decomp-runs/<run>/artifacts/diff_json/<config_id>.<symbol>.json \
  --symbol <symbol> \
  --text-output decomp-runs/<run>/artifacts/diff_text/<config_id>.<symbol>.md
```

## Mismatch Classification

Map objdiff differences to search directions:

- many `DIFF_ARG_MISMATCH`: likely register allocation, local order, temp lifetime, accessor reuse.
- `DIFF_REPLACE`: expression shape, branch shape, call/literal mismatch, missing inline.
- `DIFF_INSERT` or `DIFF_DELETE`: branch order, stack frame, missing extra instruction, inline/scheduling.
- relocation diffs: wrong call target, symbol, literal, static, or section ownership.
- data diffs: literal/string/assert/static order; validate the full TU.

## Permuter Handoff

Run permuter after a candidate is semantically close and mismatch is source-shape/register/scheduling, not missing type knowledge or data ownership.

Store permuter results under:

```text
artifacts/permuter_runs/<config_id>/
+-- base.c
+-- target.s
+-- output-<score>-*/
+-- run_log.txt
+-- harvest_summary.json
```

Record in `sweep_results.csv` or `validation_results.csv`:

- seed config;
- duration;
- jobs;
- best score;
- number of score-0 hits;
- whether output was cleaned and revalidated.

Copy only the useful cleaned shape back into production source.
