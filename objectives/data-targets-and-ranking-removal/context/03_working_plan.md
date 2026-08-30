# Working plan — phase-gated

Sequencing: A before B (A deletes three B blockers: dataRiskPenalty, rank-miss
degradation, read_only_complete splice). Within each phase, independent Codex
invocations run in parallel; the verdict/carve-out work (B3+B4+B5) is one
serialized invocation because the changes interlock in change-validation.ts.

## Phase A0 — recon gate (cheap, do first)

- Objective: settle the two unknowns before deletion starts.
- Process:
  1. `grep -rn "locked\|blocked" apps/server/src/core/knowledge` — determine if
     editability `locked`/`blocked` is ever operator-set. Output: decision note
     in current_state.md (delete outright vs thin blocklist).
  2. `grep -rn "priority" apps/server/src/core apps/frontend/src` — full
     consumer inventory for A5. Output: checklist appended to this file.
- Gate: both notes written. Failure: none expected; this is read-only.

## Phase A — ranking removal (A1–A5 per scope map)

- Inputs: context/02 rows A1–A5, A0 outputs.
- Process: 3 parallel Codex invocations (low effort):
  1. A1+A2+A2b (board/candidates/rank deletion),
  2. A3 (admission admit-all + cap flag) — includes plumbing the flag through
     run config; document flag name in current_state.md,
  3. A4 (claim order + exclusivity predicate).
  Then A5 consumer sweep as a 4th invocation once 1–3 land (it depends on the
  final shapes).
- Outputs: green `bun test` in apps/server; boundary-model and cycles tests
  updated where they asserted priority values.
- Gate: full test suite passes; a board snapshot built from a checked-in
  report fixture yields candidates for every sub-100 function, count equals
  open count, no priority field anywhere in the packet.
- Failure handling: if a hidden priority consumer breaks something non-obvious,
  escalate that single invocation to xhigh with the failing test output.

## Phase B — section targets (B1–B7 per scope map)

- Inputs: Phase A merged; context/02 rows B1–B7.
- Process: parallel Codex invocations:
  1. B1+B2 (discovery + retirement),
  2. B3+B4+B5 serialized (verdict fallback, carve-out, threshold unification) —
     candidate for xhigh if the low attempt mangles the ladder,
  3. B6 (gate branching),
  4. B7 (packet + prompt).
- Outputs: tests from context/04; green suite.
- Gate: unit-level test — fixture unit at 100% code / 89% .sdata2 produces
  exactly one section candidate, and a simulated attempt improving the section
  yields `passed` (and `reachedExact` when >= EXACT_SCORE).
- Failure handling: any verdict-ladder regression on function targets blocks
  merge; revert the carve-out commit, re-spec, re-run.

## Phase C — shakedown

- Objective: prove it end to end on the real melee run without babysitting
  surprises.
- Process: one epoch with the run-operator flow; watch for (1) section targets
  admitted, (2) at least one data verdict `passed`, (3) no function-target
  behavior change, (4) no claim ever issued for a file with an active claim,
  (5) integration conflict rate not elevated.
- Outputs: shakedown notes + boundary new-matches screenshot equivalent in
  current_state.md; matched_data_percent delta recorded.
- Gate: Ford reviews shakedown notes before the objective closes.
- Failure handling: park the run (existing pause directive flow), record state,
  fix forward via a targeted Codex invocation.

## Explicitly deferred

- Priority column removal migration.
- Data% as a run goal / dashboard headline metric (worth its own small
  objective once targets flow).
- Per-symbol data granularity, decomp.me integration, new tools.
