1. [BLOCKING] **Historical high-water mark rejects valid repairs** — [worker-certification.ts:151](apps/server/src/core/harness-runtime/phases/running/workers/worker-certification.ts#L151). An earlier selectable certificate records 96 even if integration fails. A later claim repairing unverified 100 to certified 95 receives no `certifiedImprovement`, so its checkpoint is unselectable. **Fix:** separate repair acceptance from budget eligibility; accept certified repairs without granting again.

2. [BLOCKING] **Restoration skips compile inputs** — [certification-lane.ts:190](apps/server/src/core/agent-catalog/agents/running/worker/certification-lane.ts#L190). Generated `build/` dependencies are discarded; other inputs are checked only when Git lists them as changed. Restored source plus a changed generated header therefore clears unverified state without proving base identity. **Fix:** verify every compile input against trusted-base content; refuse restoration when identity is unavailable.

3. [BLOCKING] **Unrelated section regressions disappear** — [certified-regression.ts:223](apps/server/src/core/harness-runtime/phases/running/epochs/certified-regression.ts#L223). A certified repair holding 96 causes independent `.text` deterioration in its unit to be suppressed when no other named function regresses. Reproduced with `.text` falling 100→20 and the judged report containing zero regressions. **Fix:** retain section deterioration unless its entirety is attributable to the repair.

4. [BLOCKING] **Old sandbox code becomes “certified” after concurrent clearance** — [unverified-matches-evidence.ts:58](apps/server/src/core/harness-runtime/run-state/unverified-matches-evidence.ts#L58). Exporting only active rows omits a sibling cleared at a newer revision, although an older sandbox still contains its uncertified implementation. Rollback holds are also omitted. **Fix:** derive evidence status from completion holds at the sandbox’s exact revision.

5. [BLOCKING] **Changed literal operands reuse approvals** — [steering_approvals.py:65](toolpacks/gamecube-decomp/_impl/gamecube/tools/steering_approvals.py#L65). Normalization gives `getX("a  b")` and `getX("a b")` identical digests; approval lookup accepts the changed operand. **Fix:** preserve literal contents during normalization; cover string, character, and raw-string operands.

6. [BLOCKING] **Concurrent rejection leaves a live approval** — [evidence-reviews.ts:391](apps/server/src/core/harness-runtime/run-state/evidence-reviews.ts#L391). Approve awaits file publication while Reject wins the database update. Approve then fails its CAS, but its gate-readable approval remains active. **Fix:** atomically claim the decision before publication, with serialized publication or a durable outbox.

7. [BLOCKING] **Stale dashboard approval covers an unseen site** — [evidence-reviews.ts:378](apps/server/src/core/harness-runtime/run-state/evidence-reviews.ts#L378). Same-digest resubmissions update the request’s site/base. An operator viewing site A sends only its ID; the server reloads and approves newer site B. **Fix:** require the displayed request’s revision/fingerprint and reject changed requests atomically.

Direct reproductions succeeded. Filesystem-backed checks were limited by temporary-directory `EPERM` failures.

7 blocking findings.

