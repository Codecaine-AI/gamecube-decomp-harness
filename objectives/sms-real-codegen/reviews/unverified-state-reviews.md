# Reviews: "100% but unverified" state (migration 015)

Functions the SMS backfill could neither prove real nor find steering in stay in
the code as `unverified_match`. Together with unresolved `steering_rollbacks`
(migration 014) they earn no completion credit, are never retired, never ship as
exact and never count as knowledge matches. Only an enforced-gate pass that
certifies the code against the recorded trusted base clears them.

## Round 1 (Codex gpt-6.1-sol): 3 blockers

1. [P1] `steering-gate.ts` cleared the state on any pass, including a re-record
   against a later base. Fixed: clear only when the certifying base is the
   recorded trusted base or its ancestor. A re-record keeps the original base,
   and the worker apply path requires the target source to be unchanged since
   the claim base.
2. [P1] Dashboard and settlement still counted unverified functions in matched
   percentages, timeline and history. Fixed: adjusted measures everywhere.
   History is re-scored from archived raw reports, and unknown stays unknown.
3. [P1] Checkpoint classified unverified or rolled-back exacts as `pr_candidate`.
   Fixed: active-state recheck in checkpoint, draft PR, publication, ship-set
   and PR-slice verification.

Same pass: knowledge import and summarizer, worker board refresh, boundary Sync
totals, C++ namespaced keys, unknown regression byte totals.

## Round 2 (Codex): item 1 resolved, 4 P1 and 2 P2 open

- Worker result counts ignored rollback-only holds.
- The initial board had no pinned revision and fell back to the moving run head.
- The scheduler used only 015 rows, so a failed rollback rebuild could retire the
  target.
- Ship sets accepted mixed files with held functions.
- Knowledge ignored rollbacks.
- Melee PR output gained steering fields.

All six fixed, each with a regression test.

## Round 3 (Opus, 2 reviewers): No blocking findings

P2s fixed before commit:

- Cleared 015 rows now carry `cleared_rev` and stay held for revisions that
  don't contain the clear.
- report-run boards pin `measuredRevision`.
- Melee keeps its legacy score fallback, save-point output and knowledge match
  rule.
- Worker-facing file labels use the combined 014+015 holds.

Accepted as-is:

- Additive checkpoint JSON keys.
- Whole-file ship-set exclusion is conservative, and that service has no
  production caller.
- The live draft-PR path pushes the branch and lists held functions in the PR
  body.

Codex rounds 3 and 3b dropped on a provider transport error before reporting,
so round 3 ran on Opus.

## Validation at commit

- `bunx tsc --noEmit -p .` and `bun run ui:check` are clean.
- 498/499 tests pass across the 46 touched test files, including
  `prompt.head-fixtures.test.ts` (Melee fixtures unchanged).
- The one failure is `worker-reports.test.ts` (unresolved `@/` alias under
  `bun test`). It fails identically at 4e5cd202d.
- `test_steering_check.py`: 55 passed.
