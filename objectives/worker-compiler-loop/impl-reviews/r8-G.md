| R7 item | Status | Evidence |
|---|---|---|
| Claim budget expires during provisioning | RESOLVED | Owner-fenced renewal runs during provisioning; dispatch extends claim TTL and updates the job payload. |
| Admission allocates after deadline | RESOLVED | Expiry checks precede slot acceptance and follow retry cleanup. Slow-cleanup regression passes without a second allocation. |

No new findings.

Focused admission, session/recovery, and scope checks passed. Fixture tests requiring temporary files were blocked by read-only `mkdtemp EPERM`; dispatch-TTL verification is source-based. Server typecheck fails at excluded `certified-merge.test.ts:170`.

No blocking findings.