# Validation and Handoff

## Server (focused only)
- `bun test apps/server/src/core/orchestrator-state/storage/migrations/migrations.test.ts`
- `bun test apps/server/src/core/knowledge/background/` (new suites)
- `bun test apps/server/src/application/dashboard/read-model.test.ts`
- `bun test apps/server/src/api/routes/sessions.test.ts apps/server/src/api/routes/knowledge*.test.ts`
- Touched session-runtime worker-state tests.
- `tsc --noEmit` (root project, covers server).

## Frontend (focused only)
- `bun test apps/frontend/src/pages/workspace/_lib/model.test.ts` + projected-control tests
  + new knowledge/compat control tests.
- `bun run ui:check`.

## Documentation
- `docs-cli render` for each new parent and child bundle.
- Scoped links check for affected bundles; scoped diff check (only intended doc.json
  bundles changed vs the pre-existing dirty snapshot).

## Migration copy check
- Backup: `~/backups/melee-orchestrator-schema16-<UTC>-<shorthash>.sqlite` + SHA-256.
- Temp copy: migrate 16→17 twice; integrity_check ok; foreign_key_check 0 rows;
  pre-existing table row counts and content fingerprints unchanged; migration-017 schema
  objects and indexes present; second run no-op.
- HOLD: live application only after explicit user approval.

## Handoff artifacts
- context/lane1..4_report.md — per-lane changed files, seams, test results, deviations.
- context/absorption_ledger.md — source-fact ledger for docs absorption.
- current_state.md — kept current at every phase gate.
- Final report: focused test results, docs paths created, migration-copy result, commit
  hash, live-migration hold point, retained new-features bundle.
