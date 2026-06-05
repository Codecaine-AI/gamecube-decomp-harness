# Scoring And Pareto Selection

Score candidates with both compiler evidence and review evidence. A 100% match is not automatically promotable if it is fake, brittle, or regresses neighbors.

## Primary Metrics

Record these in `sweep_results.csv`:

- `compiled`: candidate compiled successfully.
- `compile_seconds`: build cost.
- `match_percent`: objdiff symbol match percent.
- `score_delta`: candidate percent minus baseline percent.
- `instruction_diff_count`: all instruction rows with diffs.
- `arg_mismatch_count`: register/operand/relocation argument mismatches.
- `insert_count`, `delete_count`, `replace_count`: instruction stream differences.
- `reloc_diff_count`, `data_diff_count`: relocation and data-section mismatches.
- `neighbor_regression_count`: siblings that worsened after the candidate.
- `reviewability_score`: lower is cleaner.

## Reviewability Score

Use a simple additive score:

```text
0  natural/source-quality row
+1 local order or temp lifetime shaping
+2 scoped padding, awkward but local control flow, temporary M2C_FIELD
+4 PAD_STACK, dead local, empty branch, macro/cast only for codegen
+8 fake static, raw known offset math, unscoped pragma, undefined behavior risk
```

Rows with score `>= 8` are diagnostic only unless the user explicitly accepts a fake-match tradeoff.

## Pareto Criteria

Select rows that are not dominated across:

- higher `match_percent`;
- lower `instruction_diff_count`;
- lower `reviewability_score`;
- lower `neighbor_regression_count`;
- lower `reloc_diff_count + data_diff_count`;
- reasonable `compile_seconds`.

Also include:

- baseline row;
- current best row;
- safest zero-regression row;
- best row per promising family;
- strongest high-match diagnostic anchor;
- near-misses that explain a boundary;
- ablations that prove which feature mattered.

## Near-Miss Reasons

Add `frontier_near_misses.csv` rows when:

- one local-order change improves registers but worsens stack;
- a high-match row adds data/reloc damage;
- an unsafe row shows a likely missing brake;
- a simpler row ties a complex row;
- the best row fails only neighbor validation;
- a permuter seed produces score 0 but is not reviewable.

## Promotion Gate

Promote a candidate only when all are true:

- source is human-readable after cleanup;
- no forbidden fake-match technique remains undocumented;
- target symbol or accepted fuzzy target improves;
- neighbors and owned data sections do not regress for the relevant risk class;
- validation commands are recorded in `validation_results.csv`;
- `current_state.md` and charts point to the winning config.
