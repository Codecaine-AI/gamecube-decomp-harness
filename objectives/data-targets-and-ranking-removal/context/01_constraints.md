# Constraints

## Decisions already made (do not re-litigate)

- Ranking/priority logic is removed *fully*, not gated behind a flag.
- Admission default is admit-all of open candidates; a single optional cap
  flag (first-N by admission order) is the only throughput knob. No scoring.
- Same-file claim exclusivity ships in Phase A: a target whose source_path has
  an active claim is not claimable. Nice-to-have (reduces duplicate work and
  integration conflicts), not correctness-critical — sandbox isolation plus the
  serialized integration queue already prevent corruption.
- Section targets are unit-level ("finish this unit's .sdata2"), not
  per-symbol. That matches how humans do it (#3210 worked file-by-file) and
  matches report.json granularity.
- No DB migration: priority columns in targets/epoch_targets stay, written 0.
  Column removal is a later cleanup objective.

## Invariants to preserve

- Already-exact same-unit functions and already-100% sibling sections must stay
  protected on every attempt (compareRows section kind + section-parity gate).
- Function-target flow must be unregressed: verdict ladder semantics, micro-gate
  behavior, integration queue, boundary sync, PR flow all unchanged for
  kind=function targets.
- Write sets stay path-based; targetKey stays `unit::symbol` (a leading dot in
  the symbol half is safe at all 7 split sites — verified).
- Verification stays runner-owned; workers cannot self-report success.

## Execution constraints (house rules)

- Every code/test/doc edit is produced through `codex exec -m gpt-5.6-sol
  -c model_reasoning_effort="low" --enable fast_mode` (xhigh only if a low
  attempt fails or the change is provably interlocking, e.g. the
  change-validation carve-out). Claude workers orchestrate and relay only.
- Fan out independent Codex invocations in parallel; each Codex prompt
  instructs internal parallelization.
- Fable (primary) does planning, decomposition, review, final acceptance.

## Known sharp edges (from the 2026-08-30 blast-radius probes)

- Verdict rejection is *silent*: a data target today reaches
  `no_official_score_change` and burns its full attempt budget with no error.
  Any partial implementation that admits section candidates before fixing the
  verdict will waste sandboxes at scale.
- Three divergent "exact" thresholds exist: EXACT_SCORE=99.99999
  (change-validation.ts:28), EXACT_SECTION_SCORE=99.99999 (micro-gates.ts:4),
  bare 100.0 (report.ts:405, section-measures.ts:43, snapshot.ts:137,
  code-graph.ts:90). A section at 99.999995 is "exact" to one and "broken" to
  another. Unify on EXACT_SCORE.
- banned_idioms rules (static_added_to_global_symbol,
  qualifier_changed_on_shared_global, /order/i static) fire on exactly the
  edits data matching consists of. Must branch per target kind or data attempts
  fail the gate mysteriously.
- `locked`/`blocked` editability: before deleting the rank-feature provider,
  verify whether these are ever operator-set (vs derived). If operator-set,
  preserve a thin path blocklist.
