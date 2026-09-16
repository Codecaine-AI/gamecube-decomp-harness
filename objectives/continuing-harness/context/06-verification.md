# Continuing Harness Verification

The parent reviewed the Astra changes and repaired configuration fingerprinting, sandbox readiness blockers, per-profile admission, legacy checkout identity, accepted upstream preservation, active-Sync configuration checks, grouped storage defaults, and remaining Python projects lookups.

Passed final checks:

- Publication, engine and epoch-boundary integration: 62 tests, 379 assertions.
- Canonical state, import, sandbox validation/admission, save-point runtime and cycle API: 41 tests.
- Save-point jobs: 12 tests. Sources/API/read models: 38 tests.
- Storage layout and dashboard prompt preview: 21 tests. Knowledge read-only and ingestion: 23 tests.
- Config revision: 5 tests. Staging layout: 2 tests. Python helper game layout: 3 tests.
- Full server/frontend TypeScript, frontend production build, repository policy, diff check, and Docs MCP component completion.
- docs:check: zero errors, warnings, or stale references.

Counts are per suite, with overlap; they are not a unique total. Earlier state/layout/epoch/Sync regression batches are recorded in current_state.md. Frontend build retained existing font/chunk warnings.

## Review-Lint Result

`bun run review-lint:test` runs after fixing its obsolete projects directory detection and shared lookup helpers. Result: 108 passed, seven failed. The fixture now reads the descriptor-selected Melee checkout. The failures depend on the current external checkout's symbol names and ownership ranges, while golden patches describe historical PRs. No lint rules were weakened and no golden expectations were changed to hide the failures.

Failing tests:

- `test_melee_symbol_metadata_resolves_known_function`: expects `gm_80169238`, absent under that name in the checkout metadata.
- `test_golden_fixture_hard_fails`: two gm_1832 cases, grkongo, and tydisplay expect older TU data ownership.
- `test_ftcoll_forward_decl_externs_now_hard_fail`.
- `test_gm1832_extern_own_tu_data_detail`.

Full output is `/tmp/continuing-harness-review-lint-final.txt`. A future fixture repair should pin the metadata revision matching the historical patches or deliberately regenerate the expectations against a reviewed revision. The full repository check is not green until this is resolved.

## Live Boundary

No live ownership import, game checkout movement, source acquisition, worker execution, or Daytona image push was performed. Existing databases remain at their configured paths. The obsolete projects files were archived intact with a hash manifest.

The custom-component spec describes the implemented loop and the stopped-runtime preview, backup, import, readiness, and sandbox-validation sequence. Compatibility cycle code remains for existing installations and historical evidence.
