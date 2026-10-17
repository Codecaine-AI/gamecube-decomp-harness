1. **RESOLVED — Generated-input freshness.** `certified-inputs.ts:310` requires generator bindings and checks their hashes against the integrated tree. Missing or errored bindings fail closed. `worker-cycle.ts:3129` supplies the sandbox resolver.
2. **RESOLVED — Restoration credit.** `attempts.ts:246` uses `landedCertificates`, filtered to the same target and `gate_pass`. Stale or unbound landings cannot unlock knowledge credit.

No new correctness problems found from these fixes.

Server and UI typechecks passed. Focused checks: 7 Bun tests passed, 1 skipped; 31 Python tests passed. Fixture suites hit read-only temporary-directory restrictions. Baseline comparison and real-image/200-worker execution remain unverified.

No blocking findings.