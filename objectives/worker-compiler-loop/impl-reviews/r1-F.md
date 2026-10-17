1. [BLOCKING] Wrong S* variant recorded — `toolpacks/gamecube-decomp/_impl/gamecube/tools/steering_check.py:3407`. When both evidence flags are true, `real_only` comes from `steering_sstar`, but fidelity selects `evidence_sstar`. The job explains a different comparison. Fix: give `steering_sstar_used` precedence; test both flags together.

2. [BLOCKING] Missing traces never publish unavailable — `toolpacks/gamecube-decomp/_impl/gamecube/tools/steering_explain.py:298`. `compare_sources` returns `no_decisions_traced`, which falls through to retryable error. Retries exhaust without a probe reason. Fix: map that status to `{unavailable: ...}` and cover the consumer boundary.

3. [BLOCKING] Summary removed before details — `toolpacks/gamecube-decomp/_impl/gamecube/tools/steering_diagnose.py:564`. A reproduced probe loses measured summary lines while retaining change details, although removing details preserves the entire summary within 3 KB. Fix: discard `changes` before truncating `summary_lines`; add that regression case.

Job lifecycle and ranking:

1. [BLOCKING] Queued inputs are not bound to the observation — `apps/server/src/core/validation/jobs/steering-explain.ts:138`. Preparation reloads mutable artifact paths without checking persisted fidelity, input hash, or base revision. Replacing a report while queued publishes the replacement candidate's delta under the original observation. Fix: snapshot artifacts or verify queued provenance, then verify the returned prepared-input hash.

2. [BLOCKING] Interrupted jobs remain permanently running — `apps/server/src/core/harness-runtime/run-state/steering-explain.ts:137`. Process death after batch claiming strands up to ten jobs; subsequent claims exclude them, and sweep deduplication prevents replacement. Fix: add expiring claim leases, bounded recovery, and completion ownership checks.

3. [BLOCKING] Tool hash omits a computation dependency — `apps/server/src/core/harness-runtime/run-state/steering-explain-tool-hash.ts:12`. Changing `coloring_model.py` changes allocator interpretation without changing `tool_hash`; completed sweep jobs then suppress remeasurement. Fix: hash transitive computation dependencies or a complete toolpack content stamp.

4. [NON-BLOCKING] Historical deltas prioritize changed targets — `apps/server/src/core/harness-runtime/run-state/steering-explain.ts:251`. Ranking selects completed jobs by unit/symbol without matching current source or input provenance. A refreshed target inherits an old single-change priority. Fix: match the active observation/source/input identity.

Verification: focused Bun tests hit filesystem `EPERM`; typecheck failed in unrelated `sandbox-scan.test.ts` placement tests. In-memory reproductions confirmed variant selection, unavailable handling, trimming, and abandoned claims.

6 blocking findings.