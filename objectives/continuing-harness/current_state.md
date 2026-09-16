<current_state>
<last_updated>2026-09-11</last_updated>
<status>Implementation, live cutover, canonical naming, and documentation merge complete and verified.</status>
<completed>
- Per-game Harness State replaces cycle runtime ownership. Runtime source lives under apps/server/src/core/harness-runtime. HarnessState in core/harness-state/state.ts owns durable state; DispatchState owns leases.
- Epoch settlement records save points and timeline evidence before mandatory Sync. The next epoch requires accepted source/report truth and preserved desired Run intent. Startup and a 2.5-second server reconciler resume eligible intent after Sync/readiness clears.
- Grouped game configuration and workspace, knowledge, and runtime directories are live. Melee checkout is games/melee/workspace/checkout; its common Git repository is workspace/repository. All 23 registered worktree HEADs were preserved.
- PR, Discord, and local wiki source pipelines expose acquisition/import/index/curation readiness. Named 2-core and optional 4-core sandbox profiles retain claim provenance.
- Schema through v9 and archived path migration applied to live Melee state. All 566,678 original rows across 46 tables reconstruct exactly.24 runs,63 epochs,91 continuing timeline entries, and 6 kernel associations remain available. Exactly 2 new events cancel an abandoned unstaged Sync and release its lease.
- The 17,786,601,472-byte Agent Kernel database is byte-identical to backup. .pi-sessions, .pi-agent, ref, source captures, and historical workspaces are retained.
- The standalone feature specification is merged into canonical Game, Harness, and Knowledge docs and removed. State definitions/examples use State Shape components; ownership Canvas and epoch Sequence live under Harness. README and operator guidance point to those chapters.
- Schema v10 renames the durable table to harness_state and lease coordination to dispatch_state. Independent verification preserves all 638,786 original rows across 58 tables, with only migration/checkpoint bookkeeping added. The game remains paused.
</completed>
<verification>
- Naming correction: full parent runtime suite ran 620 tests, with 610 passing and 10 stale fixtures corrected. All 31 tests in the four corrected files pass. No production behavior was weakened to satisfy the fixtures.
- Canonical docs contain 55 State Shape components, all with JSON examples, and no state-definition Code blocks. Browser QA covers 50 pages, 17 rendered sequences, and all 55 examples with zero failures. Final typed checks and bun run docs:check report zero errors, warnings, or stale references. The redundant Foundation heading was removed while preserving its paragraph.
- Live v10 second apply is a no-op with identical fingerprints. Agent Kernel retains SHA-256 0c1dd464837d92505e41aaf76d1eca2a449b0268320145e98a1be6e0967b0a5d, matching the pre-cutover database.
- bun run check passes, including docs audit/links, repo policy, server/frontend TypeScript, and 115 review-lint tests. Frontend production build passes.
- Parent focused continuing/state/trace/checkout suite:129 pass. Additional controller, source, staging, schema, epoch, and dashboard agent suites pass; counts overlap.
- Lint regression metadata is pinned to its historical PR revision without weakened assertions or changed lint rules.
- Live independent integrity/FK/preservation audit passes. Repeated schema apply is idempotent. Filesystem scan covered 31,780 asset links, repaired 111, and left 0 mapped failures. Process-control JSON now uses canonical paths.
</verification>
<execution_boundary>
- Melee desired state is paused, all readiness gates pending, and no dispatch lease is active. Server remains stopped. No external acquisition, worker run, or image push performed.
- Before Run, perform Sync and validate the selected sandbox against the accepted current configuration. Tests do not establish live Daytona scoring parity.
- Backups/journals: /Users/Ford/Decomp Migration Backups/continuing-2026-09-11. Historical snapshots were retained through reversible renames; active checkout and mutable sources were backed up separately. Partial archive duplicate is retained.
</execution_boundary>
<next_actions>
- No implementation or migration work remains for this correction. Verification is recorded in context/14-canonical-harness-docs.md and context/15-docs-diagrams-and-examples.md.
- Canonical docs start at docs/10-system-design/20-harness/20-harness-state; project setup and the global tree live at docs/10-system-design/10-game/20-registration-and-setup.
</next_actions>
</current_state>
