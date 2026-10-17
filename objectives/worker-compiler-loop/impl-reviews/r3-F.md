R2 fidelity bypass: **RESOLVED**. `apps/server/src/core/validation/jobs/steering-explain.ts:161` publishes unavailable before preparation when queued fidelity is missing. Replacement-report regression coverage exists.

R2 ranking: **NOT RESOLVED**.

1. **[NON-BLOCKING] Reused report paths accept stale ranking evidence** — `apps/server/src/core/harness-runtime/run-state/steering-explain.ts:383`. Re-run backfill into the same output directory after changing a header or S*, keeping source and base unchanged. `check.json` is overwritten, but ranking still accepts the old single-change delta: it compares the job’s input hash against its own fidelity record, never the current report’s inputs. **Fix:** persist the active report’s fidelity input hash and require equality with the job’s hash. Add a regression with unchanged source/base/path and changed inputs.

No new findings. Sixteen focused Python tests passed. Bun fixture tests were blocked by temporary-directory `EPERM`.

No blocking findings.