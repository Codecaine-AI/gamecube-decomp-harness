Prior Python findings:

1. **RESOLVED:** S* selection gives `steering_sstar` precedence when both flags apply.
2. **RESOLVED:** `no_decisions_traced` publishes unavailable.
3. **RESOLVED:** `fit()` removes change details before measured summaries.

Prior lifecycle and ranking findings:

1. **NOT RESOLVED:** Queued-input binding still permits replacement artifacts for jobs without fidelity.
2. **RESOLVED:** Expiring leases recover interrupted jobs; owner checks reject superseded runners.
3. **RESOLVED:** Tool hashing includes transitive vendor Python dependencies.
4. **NOT RESOLVED:** Ranking checks source equality but omits current input identity.

Remaining findings:

1. **[BLOCKING] Missing fidelity bypasses observation binding** — `apps/server/src/core/validation/jobs/steering-explain.ts:155`. The worker hook queues missing-fidelity jobs with `{}`. These omit the expected-hash argument and prepared-hash check. If artifacts are replaced with a valid newer report before execution, its delta can publish under the old observation. **Fix:** immediately publish reconstruction-unavailable when queued fidelity lacks an input hash; add a replacement-report regression for this case.

2. **[NON-BLOCKING] Ranking still accepts historical input provenance** — `apps/server/src/core/harness-runtime/run-state/steering-explain.ts:368`. An unchanged source file can have different header dependencies, trusted base, or S*. Its previous single-change delta still earns priority because only the source hash is compared. **Fix:** require the active fidelity/input identity and base revision; test unchanged source with changed inputs.

No additional findings. Typecheck and 16 focused Python tests passed. Bun reported 2 passes; 26 tests were blocked by temporary-directory `EPERM`.

1 blocking findings.