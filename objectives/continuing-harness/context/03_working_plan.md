<working_plan>
<phase id="1">
- Input: approved spec and current callers. Implement bounded agent scopes; send shared API contracts directly.
- Output: integrated runtime code and isolated fixture tests.
- Gate: actual runtime callers use durable state and source readiness. Reject unused helper-only implementations.
</phase>
<phase id="2">
- Input: agent diffs/tests. Parent reviews epoch ordering, interruption, idempotency, legacy migration and second-game isolation.
- Output: regression tests and validation report.
- Gate: targeted tests, TypeScript, repository policy and frontend checks pass. Fix failures before broadening checks.
- Strategy: production-shaped integration tests and failure injection; optimization sweeps are not applicable.
</phase>
<phase id="3">
- Input: final implementation. Update canonical docs using typed components and record live migration boundary.
- Output: checked docs and current_state.md with exact verification commands.
- Gate: no claim of live rollout without live evidence; no destructive data cleanup without confirmed reconciliation.
</phase>
</working_plan>
