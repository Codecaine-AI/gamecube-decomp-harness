# Gate-Exact Repair Playbook

You are repairing stuck decompilation targets in the Melee decomp project. Orchestrator workers reached (or nearly reached) an exact match for your target function(s), but the return was rejected by QA/hard gates and the repair tail exhausted. Your job: deliver the match **gate-clean**. Your coordinator's prompt gives you the unit, targets, artifact dirs, and deliverable dir.

## Target selection (coordinator)

The canonical marker for this playbook is the worker end event **"gate-exact tail"** — stop reason `gate_failed_exact_followup_budget_exhausted`, stored in `worker_state.summary_json` (emitted by `apps/server/src/core/cycle-runtime/phases/running/workers/worker-cycle.ts`, UI label in `worker-reports.ts`). Select targets with:

```sql
SELECT target_key, id, artifact_dir, best_score, ended_at FROM worker_state
WHERE run_id='<run-id>' AND summary_json LIKE '%gate_failed_exact_followup_budget_exhausted%';
```

Do NOT approximate with best_score thresholds: tail closures exist with recorded best scores well below 100 (the rejected candidate isn't always the best checkpoint), and high-percent near-misses that never gate-failed are out of scope. Then dedupe before fleeting: drop targets covered by `games/melee/state/runs/<run>/oob_repairs/manifest.json` (prior repair fleets; match by symbol too — units get renamed/split), targets currently 100 in the cycle tree, targets claimed by `lifecycle_status='running'` workers, and targets with an integration applied after the last report snapshot (mind `report.json` mtime). Map missing symbols via `metadata.virtual_address` in `report.json`.

## Mission, in preference order

1. Exact match (100.0) for each assigned target with ZERO QA findings and ZERO regressions of any other symbol in the unit (or any unit, if you touch shared headers/config).

2. If exact truly requires a banned pattern, produce the best gate-clean version and document precisely why exact is unattainable cleanly in `result.json.why_not_exact`.

## Proven repair patterns (check in this order)

1. **symbols.txt / splits.txt metadata, not source.** If the residual diff is only relocation-symbol naming/extent differences: check `config/GALE01/symbols.txt` for wrong data extents (missed NUL terminators, pad bytes, unsplit blobs), TU-local literals mis-annotated `scope:global` (rename to `@NNN scope:local data:string` and claim the gap in `config/GALE01/splits.txt`), data attributed to the wrong TU, or a missing TU split — MWCC 1.2.5n's merged-data anchor always sits at the object's .data+0; a retail anchor elsewhere proves the code lived in a separate TU.

2. **Name evidenced data properly.** `numeric_literal_to_symbol` / `address_named_static_data` findings on real, evidenced, unit-owned tables: give the data a semantic name across `.c` / `.static.h` / `symbols.txt` (precedent: `gm_HandicapDamageRatios`). Declarations of another TU's data belong in the OWNING header, never `extern` in `.c`. Define data after its user to defeat constant folding / force symbol-anchored addressing when the target relocations demand it.

3. **Asserts: use the real header inline helpers.** Open-coded `__assert(...)` with extracted strings usually means the proper `HSD_ASSERT`-bearing inline helper in the sysdolphin header already produces exactly those strings/lines. If a header helper is missing an assert its sibling has, fixing the header (with repo-wide A/B proof) may be the true repair.

4. **Fix headers truthfully.** Begin with in-slice typing; if evidence proves the canonical signature is the blocker, request owning-header widening instead of hiding the mismatch behind a banned `#define` alias, K&R declaration, or bare local prototype. Retype the owning prototype and run scope-following checks for the owner and direct consumers.

5. **MWCC codegen idioms** (each needs an evidence comment per `global_standard:matching-tactics-need-evidence`):

   - Anti-inline without pragmas: unreachable `if (0) { ...no-op call statements... }` pads the pre-expansion statement count (auto-inline threshold: 14; loop bodies/switch cases/call args don't count) and generates zero code.

   - `__declspec(weak)` on a data definition removes it from MWCC's ≥3-object same-section pooling.

   - An inlined u16-returning helper reproduces argument-materialization truncation (replaces banned goto shapes).

   - Inline-helper return temps land in the host frame's bottom temp pool and propagate through inline copies (never across real calls); named locals slot by declaration order in the standalone compile only.

   - When clean C provably cannot match, the sanctioned last resort is the upstream-master `#ifdef __MWERKS__` / prototype-clean `#else` guard (see toy.c) — clang/CI must never see the non-clean form. Verify with `clang @compile_flags.txt -fsyntax-only`.

6. **Suspect lint false positives.** e.g. the m2c stack-residue regex fires on any local named `sp` + ≥2 hex-letter chars (`speed`). If the only finding is a name, rename to a role name.

## Method

- Read your targets' worker artifacts FIRST: `sqlite3 -readonly games/melee/state/orchestrator.sqlite "SELECT id, artifact_dir FROM worker_state WHERE target_key='<unit>::<symbol>';"` then `<artifact_dir>/runner_validation/attempt-N.repair_request.json` (verbatim QA findings) and `attempt-N.write_set.diff` (the near-miss diffs). Worker output `.txt` files show exact build/diff commands.

- Base on the run's cycle tree (coordinator provides the path). DO NOT edit it. Private worktree: `git -C <session-current> worktree add <deliverable-dir>-wt HEAD`, then snapshot and apply the dirty state: `git -C <session-current> diff > <deliverable-dir>/session-dirty.snapshot.patch && git -C <wt> apply <that file>`. Copy any untracked cycle files your unit needs.

- Build/verify with the project's tooling: `configure.py --require-protos --wrapper build/tools/wibo`, `ninja build/GALE01/<unit>.o`, `build/tools/objdiff-cli diff -p . -u <unit> --config functionRelocDiffs=data_value --format json`. Warm tool cache: /private/tmp/melee-tool-cache. COPY build/tools + build/compilers from an existing worktree — never symlink into the cycle tree.

- **Same-tool scoring only**: all before/after comparisons must be objdiff-cli-diff vs objdiff-cli-diff (report-generate disagrees on partial matches; they agree at 100).

- **Run the official QA gate yourself**: `python3 toolpacks/gamecube-decomp/source_editing/review_lint/api/scan_diff.py --repo <wt> --diff-file <repair.patch> --surface worker --gate --json` and again with `--surface pr_gate`. Both must pass 0 errors / 0 warnings; put outcomes in `result.json.qa_scan`.

- Shared headers or `config/GALE01/*` edits: verify every consuming unit (object sha A/B or repo-wide report comparison) — zero regressions required.

- Semantic source-tree guide: `games/melee/knowledge/tree_guide/`.

## Constraints

- Orchestrator DB READ-ONLY. Never write to the cycle tree, `games/melee/state/`, or the DB. No git commits anywhere.

- No banned constructs in your diff: `#pragma` (net-new), `.c` externs, open-coded `__assert`, K&R/empty-paren decls, `register`, inline asm, function-like `#define` aliases for renames, unevidenced literal↔symbol swaps, resubmission tombstones.

## Deliverables (in your assigned deliverable dir)

- `repair.patch` — `git diff` vs the HEAD+dirty base (one combined patch per unit)

- `result.json` per target — `{"symbol", "exact", "match_percent", "neighbor_regressions": [], "qa_clean", "qa_scan": {"worker", "pr_gate"}, "approach", "why_not_exact"?}`

- Keep your worktree in place. Final message: outcome per target (exact-clean / clean-at-X% / blocked), approach, measured numbers, deliverable paths.
