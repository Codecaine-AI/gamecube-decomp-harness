# Addendum: UNUSED functions may only be reconstructed when inlined (SMS)

Source: SMS maintainer review of doldecomp/sms#342 (2026-10-15): "UNUSED functions may only be reconstructed when they were inlined into other functions in the same TU."

## Rule
A function that `mario.MAP` marks `UNUSED` (dead-stripped) for a unit, and that upstream left as an empty stub (or did not define), must not get a body unless the target object shows the original inlined it into another function of the same TU.

Examples (base upstream `7fed828b`, bodies from `sb-c1` `adffbc21`):
- `TMareEventDepressWall::emitEffect(int)` (`src/Map/MapEventMare.cpp`, map `UNUSED 0000c0 emitEffect__21TMareEventDepressWallFi`): dead, body removed.
- `TChuuHana::rolling()` (`src/Enemy/chuuhana.cpp`, map `UNUSED 000120 rolling__9TChuuHanaFv`): the stub test says inlined (`TNerveChuuHanaRoll::execute` 85.8% → 45.2% when emptied), so the mechanical rule allows the body. In review Mrkol still called `rolling` and `margeVelocity` "made up ... truly dead code" (#342, commit 360931f3) and both were removed before merge: nothing in the PR showed the inline evidence. Hence the evidence must travel with the change (order-scope-plan section 4).

## Mechanical test ("stub test")
1. Candidate C gives function F a non-trivial body; F is UNUSED in the base-rev map for C's unit object; the base text has F as a trivial stub (`{ }`, `{ return; }`, `{ return <constant>; }`) or no definition.
2. Build C' = C with F's body replaced by a stub, signature kept: `{ }` for void, else `{ return 0; }`. Built in a shadow root (never in the repo), MWCC as in `stack_check`.
3. Classify every function present in the target object for C and C' (`TargetOracle`, the same per-function status/match `stack_check target` reports).
4. No target-present function changes status or match → `dead` → rule violation (body must go).
   Some function changes → `inlined` → body allowed; the changed callers are recorded as evidence.
   C' fails to build → `inconclusive` → analysis incomplete (no credit under enforce).

## Where it lives
- `steering_check.py`: the check runs in the `mwcc` step (sandbox side, MWCC available) for every touched unit; results flow to `decide`. Standalone subcommand `unused-test --repo R [--base-ref REV] [--overlay-dir D] --file F --function QNAME [--json]` for workers and operators (supersedes /tmp/stubtest.py).
- `decide` output gains `unused_checks: [{unit, file, function, mangled, status: dead|inlined|inconclusive, stub, changed: [{function, before:{status,match_percent}, after:{...}}], reason}]` and `violations: [{kind: "dead_unused_body", unit, file, function, line}]`. Any `dead` → violation; attempt becomes `rule_violation` if it would otherwise pass (other non-pass verdicts keep their kind, violations still listed). Any `inconclusive` → attempt `unresolved` (analysis incomplete). `apply` restores the base stub for dead bodies (S* excludes them).
- TS: `SteeringDecisionKind` gains `rule_violation`; `parseSteeringDecision` parses `violations`/`unused_checks` (malformed → null); `steeringCertificateProblems` reports every violation; enforce rejects; backfill clean requires no violations and no inconclusive checks. Worker validation status stays `steering_located` with a reason naming the rule (new repair instruction text for dead UNUSED bodies).
- Lint `sms_unused_reconstruction` (sms_fidelity): a hunk that gives a non-trivial body to a function the map marks UNUSED for that file (stub-to-body or new definition). `llm_review` warning on the worker surface (the worker must justify with stub-test evidence or remove it; the gate is authoritative), warning on `pr_gate`. Map read via the existing `map_symbol_names`-style helpers (merge base / host checkout; skip silently when no map). Message names the rule and the `unused-test` command.
- Standard `global_standard:sms-unused-functions` with the maintainer's wording, do/do_not, examples emitEffect (dead) and rolling (inlined), in `order.json`.
- Prompt: one bullet in `<steering_policy>`.

## Tests
- Python: stub-test unit tests with the fake MWCC backend (dead, inlined, inconclusive build failure, non-void stub, overloaded names, function absent in base, base body already non-trivial → not checked, not UNUSED → not checked); decide/apply integration; `@needs_sandbox` real cases emitEffect → dead and rolling → inlined against `sb-up7f` (read-only, overlays).
- Lint tests incl. Melee unaffected and slice manifest/order coverage.
- TS: parse/certificate tests for `rule_violation`, violations, inconclusive; regenerated real-output fixture with a violation; backfill clean rule; worker rejection reason; prompt bullet in kernel-catalog/prompt tests (HEAD fixtures unaffected: they strip `<steering_policy>`).
