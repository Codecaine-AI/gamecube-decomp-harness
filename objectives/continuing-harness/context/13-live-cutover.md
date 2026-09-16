# Completed Live Cutover

2026-09-11. User authorized development-only cutover without runtime compatibility.

- Canonical Melee worktree: `games/melee/workspace/checkout`, clean accepted HEAD `c302741689bd67c361cd7faadb221df3193992c3`.
- Backing repository: `games/melee/workspace/repository`, HEAD `480b0445408ddcd8db7b8ac64175c6d373053763`.
- Filesystem:21 journaled moves; all 23 registered worktree HEADs preserved. Historical workspaces moved intact, with reversible path/pointer journals. Active checkout and mutable database/config sources have independent backups. Partial archive duplicate remains outside the repo.
- Schema through v9 applied. Operational cycle tables and code are gone.6 original owners and 90 timeline records remain immutable historical evidence;91 continuing timeline entries include reconciliation.
- All 566,678 original rows across 46 tables reconstruct exactly from current and archived rows. Raw event history unchanged; exactly 2 migration events cancel the abandoned unstaged Sync and release its lease.
- Updated 71,875 path-reference rows with complete original-row archives. Tests and a disposable copied database verified reconstruction before live apply.
- Agent Kernel database:17,786,601,472 bytes, unchanged SHA256 `0c1dd464837d92505e41aaf76d1eca2a449b0268320145e98a1be6e0967b0a5d`. All 6 historical kernel session associations retained.
-24 runs and 63 epochs retained. Melee remains paused, with all readiness gates pending. The previous accepted head `fcafa1a22316a668099594d94cad8dec8774fecb` remains archived; the observed clean descendant is the continuing head.
- Second schema apply reports alreadyMigrated without repeating cancellation/release events.

## Verification

`bun run check` passes: docs audit/reference checks, repository policy, server/frontend TypeScript, and 115 Python lint tests. Frontend production build passes. Parent focused suite passed 129 tests; controller tests, trace tests, staging tests, and startup reconciliation passed. Agent suites additionally cover Run/Sync, schema preservation, source pipeline, sandbox contracts, and dashboard rendering; counts overlap and are not added together.

Historical ownership regression fixtures now pin exact symbol/split excerpts to doldecomp/melee commit `4e6bf71581f93ae7149eefebd819c85ef32b6360`. This fixes live-checkout drift without weakening lint assertions or rules.

The server remains stopped. No external source acquisition, worker run, or image push was performed. Before Run, perform Sync and sandbox validation for the accepted current configuration.

Full backup/journals: `/Users/Ford/Decomp Migration Backups/continuing-2026-09-11`.

Final filesystem verification covered 31,780 links, repaired 111, and found 0 remaining mapped link failures.12 exact process-control JSON paths were migrated. The 10,048 .pi-sessions entries are unchanged. Preexisting missing links in historical snapshots remain preserved and recorded; no current checkout assets are unresolved.
