# Candidate Matrix

Treat every source-shape experiment as a row. Avoid hidden knobs; every transform, risk, and selection reason must be visible in `artifacts/config_matrix.csv`.

## Candidate Families

Use these initial families for Melee MWCC sweeps:

- `local_order`: reorder declarations, first uses, or preserved locals.
- `temp_lifetime`: narrow/widen scope, branch-local temps, split or reuse temporaries.
- `expression_shape`: direct expression versus named temporary, assignment at call site, cast placement.
- `branch_shape`: branch inversion, early return, nested block, empty branch retention.
- `loop_shape`: `for`, `while`, `do`, loop counter placement, pre/post increment.
- `inline_shape`: helper call versus static inline body, inline parameter order, duplicate accessors.
- `accessor_shape`: `GET_ITEM`/`GET_FIGHTER` reuse versus reload, typed local versus chained access.
- `stack_shape`: scoped dummy block, `PAD_STACK`, by-value temp, array padding.
- `literal_relocation`: literal spelling, float suffix/cast, string/assert movement.
- `prototype_type`: signature, field typing, enum width, pointer constness.

## Search Passes

Use a coarse-to-fine structure:

1. `baseline`: current source and any known hand candidate.
2. `coarse`: broad independent families with small batches.
3. `interaction`: combine promising families.
4. `ablation`: remove one family from a finalist.
5. `near_miss`: threshold or transform just across a boundary.
6. `permuter_seed`: finalists passed to the permuter.
7. `cleanup`: human-readable candidate after slop removal.

For high-throughput runs, add beam-search passes:

8. `queue_seed`: generated one-transform queue rows before execution.
9. `beam_expand`: selected cluster expansions from prior result shards.
10. `interaction_batch`: generated transform compositions.
11. `dedupe_skip`: source-hash or object-hash duplicates recorded but not compiled.

## Reviewability Risk

Use `low`, `medium`, `high`, or `reject`:

- `low`: natural C, local style, real types, no fake padding.
- `medium`: minor shaping such as local order, cast placement, or scoped padding.
- `high`: `PAD_STACK`, dead local, awkward empty branch, temporary `M2C_FIELD`.
- `reject`: raw offset math with known types, fake statics, unscoped pragma, undefined behavior, generated comments, unreviewable permuter slop.

Never promote `reject` rows. Use them only as diagnostic anchors if they explain codegen.

## Matrix Row Example

```text
config_id=symA_local_order_003
symbol=itLinkbomb_UnkMotion3_Anim
family=local_order
subfamily=preserved_pointer_order
search_pass=coarse
parent_config_id=baseline
posture=diagnostic
transform_list=move_attrs_after_ok;split_item_local
expected_mismatch_class=regalloc
reviewability_risk=medium
allowed_to_promote=false
selection_reason=tests whether r30/r31 swap follows local first-use order
```

## Generation Rules

- Default to parameterized queue generation for serious sweeps; hand-authored one-off rows are for runner bring-up, risky edits, or narrow diagnostics.
- Change one dimension per coarse row, then use beam expansion for measured interactions.
- Record parentage for every derived candidate.
- Add ablation rows for every promising interaction.
- Keep unsafe anchors explicit; do not silently delete them because they failed.
- Prefer deterministic config IDs: `<symbol-short>_<family>_<nnn>`.
- For large runs, generate candidates into `candidate_queue.csv`, dedupe by source hash before compile, execute workers into result shards, then reduce shared CSVs after workers complete.
- Keep transform parameters explicit in the queue; do not hide random seeds, reorder lists, or beam choices outside the artifacts.
- Track parent-relative deltas during analysis. Expand families that move the target mismatch window, not just rows with the highest absolute percent.
- Seed transform families from local PR/review evidence and nearby matched code when possible, then let the measured sweep results adjust priorities.
