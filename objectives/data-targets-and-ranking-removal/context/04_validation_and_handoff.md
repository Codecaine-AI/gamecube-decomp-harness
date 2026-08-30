# Validation and handoff

## Test additions (required for completion)

1. `change-validation.test.ts`:
   - section-symbol target resolves targetScore from `rows.sections`; improved
     score -> `passed`; score >= EXACT_SCORE -> `reachedExact`.
   - carve-out: section target + non-exact same-unit function fuzzy dip ->
     still `passed`; exact function dip -> `same_unit_regression`.
   - threshold: section at 99.999995 treated as exact everywhere (single
     constant).
2. `boundary-model.test.ts` (frontend) + boundary-sync path: `unit::.bss`
   targetKey round-trips (construction, split, commit subject, displacement
   detection).
3. Board test: fixture unit at 100% code / sub-100 `.sdata2` yields exactly one
   candidate (kind section); fully-exact unit yields zero; candidate count with
   no cap flag equals open count; cap flag = N yields first N by admission
   order.
4. Claim test: two admitted targets sharing source_path — second claim is not
   granted while the first is active; granted after close.
5. Micro-gate test: section target with `static` added to a symbols.txt global
   passes banned-idioms; function target with same edit still fails.

## Commands

- `bun test` (apps/server; frontend suite as touched).
- Shakedown: existing run-operator flow (RUN_OPERATOR.md / run-operator skill),
  one epoch, then inspect boundary new-matches for section rows admitted as
  targets rather than incidental.

## Audit trail (house-rule compliance)

- Every change lists which `codex exec` invocation produced it (worker reports
  relay the command + summary). Fable reviews diffs before merge.

## Handoff rules

- Update current_state.md: after A0 decisions, after each phase gate, before
  any pause/compaction, and at close.
- If handing off mid-run during Phase C, record run/epoch state per the
  run-operator conventions (state log commit) and the safest next action.
- Deferred items (priority column migration, data% goal metric) get spun into
  their own objectives, not silently absorbed here.
