| Round-1 blocker | Status | Verification |
|---|---|---|
| #1 Historical high-water rejects repair | RESOLVED | In-memory reproduction: unlanded 96 → certified 95 stays selectable; no second grant. |
| #2 Restoration skips compile inputs | NOT RESOLVED | Generated content still lacks trusted-base identity; finding 1. |
| #3 Unrelated section regressions disappear | RESOLVED | Four attribution tests pass, including independent `.text` deterioration. |
| #4 Older sandbox inherits newer certification | RESOLVED | Revision-bound reproduction retains the hold at A and clears it at B; rollback holds are included. |
| #5 Changed literal operands reuse approval | NOT RESOLVED | Multiline operands still collide; finding 2. |
| #6 Rejection leaves live approval | NOT RESOLVED | Stale publication recovery retains this failure; finding 3. |
| #7 Dashboard approves unseen site | RESOLVED | Displayed revision reaches the decision CAS; stale-site reproduction returns 409 before publication. |

1. **[BLOCKING] Restoration trusts generated-file timestamps** — `apps/server/src/core/agent-catalog/agents/running/worker/certification-lane.ts:270`. A modified generated header newer than its inputs passes `ninja -n`; its hash is recorded without comparison to trusted-base output. Reproduction accepted two different generated-header hashes as identity proofs. **Fix:** regenerate from verified trusted inputs and compare content, or refuse restoration when identity cannot be established.

2. **[BLOCKING] Multiline operands reuse approvals** — `toolpacks/gamecube-decomp/_impl/gamecube/tools/steering_approvals.py:110`. Normalization resets literal state per physical line. Changing whitespace inside a backslash-continued string produces the same digest; direct lookup accepted the altered operand. **Fix:** preserve literal state across lines and add continuation/raw-string regression cases.

3. **[BLOCKING] Stale recovery rejects already-published approvals** — `apps/server/src/core/harness-runtime/run-state/evidence-reviews.ts:415`. Publication can succeed before a crash prevents finalization. After ten minutes, rejection takes over without removing gate-readable approvals. In-memory reproduction returned `rejected` with one approval still published. **Fix:** make stale recovery approval-only, or reconcile publication/revocation durably before rejection; cover crash and resumed-publisher cases.

4. **[BLOCKING] Certified steering repairs remain unselectable** — `apps/server/src/core/harness-runtime/phases/running/workers/worker-certification.ts:145`. A `steering_located` target repaired from 90 → certified 88 uses uncertified 90 as its implicit baseline. Reproduction produced `progress:null`, `improvement:null`, and `selectable:false` despite passing validation. **Fix:** make certified-lane acceptance independent of progress eligibility; retain separate budget-grant rules.

5. **[BLOCKING] One unit’s approval certifies other units** — `toolpacks/gamecube-decomp/_impl/gamecube/tools/steering_check.py:1314`. Lookup accepts one approved unit, then line 1114 marks the whole shared-header group real. Reducer/decision reproduction approved only `u1`, yet both `u1` and `u2` passed. **Fix:** require approval for every affected `(unit, target)`, or track approval per target.

Focused executable checks passed. Filesystem-backed fixtures were blocked by `mkdtemp EPERM`. Server typecheck reports an error at `steering-explain.test.ts:57`, in the excluded compiler-delta slice.

5 blocking findings.