Fix the command-replay fence and reject synthetic live evidence.

| Round-2 item | Status | Evidence |
|---|---|---|
| #1 Session double execution | NOT RESOLVED | Delayed original execution can run alongside its retry. |
| #2 Stale stamp memo | RESOLVED | Fingerprint includes ctime/inode/device; regression requires resync. |
| #3 Tool-data stamp mismatch | RESOLVED | Staging supplies both hashed and archived bytes. |
| #4 Runbook extra revisions | RESOLVED | Both snapshot examples pass `--extra-revs-file`. |

1. **[BLOCKING] Sentinel absence does not prevent double execution** — `apps/server/src/core/job-queue/sandbox.ts:285`. An accepted request returns a session-closure error before its subprocess starts. The sentinel probe sees absence and authorizes replay; the original subsequently starts too. Unconditional sentinel creation at line 175 permits both executions. A controlled delayed-request reproduction produced two mutations for one `exec`. **Fix:** atomically claim the shared command identity before execution and reconcile duplicate claims, or refuse replay after ambiguous closure. Add a delayed-original regression.

2. **[BLOCKING] Dry-run evidence bypasses live validation** — `objectives/worker-compiler-loop/scale/load-test.ts:135`. A generated dry-run `sandbox-validation-evidence.json` contains `status: "passed"` and the configured snapshot name, so this validator accepts it for `--live` despite `synthetic: "dry-run load test"` and no actual snapshot validation. Reproduced directly against `liveAdmissionEvidence`. **Fix:** reject synthetic evidence and require the real validator’s provenance/report fields. Add a regression passing generated dry-run evidence into the live gate.

Server typecheck passed. In-memory checks passed; fixture-based verification was limited by read-only `mkdtemp EPERM` errors.

2 blocking findings.