# Implementation Scope — four exclusive lanes

Full per-lane specifications live in lane1_spec.md .. lane4_spec.md. Ownership is
exclusive: no file appears in two lanes.

## Lane 1 — durable background knowledge processing (server core)
- `apps/server/src/core/orchestrator-state/storage/migrations/017-*.ts` + registration in
  `migrations/index.ts`, DDL additions, `migrations.test.ts` additions.
- `apps/server/src/core/knowledge/background/**` (new).
- `closeWorkerState` enqueue integration (session-runtime run-state).
- Librarian/job-runner integration; removal of opt-in-only behavior.

## Lane 2 — server ProjectStateView and action authority (after Lane 1)
- `apps/server/src/application/dashboard/read-model.ts` + nearby read-model tests.
- Project-session and knowledge API routes/tests (`api/routes/sessions.ts`,
  `api/routes/knowledge.ts`), narrow HTTP registration for the new route.

## Lane 3 — frontend projection and controls
- Workspace ProjectState types/model (`apps/frontend/src/pages/workspace/_lib/`).
- Workspace and app-shell projected controls (`apps/frontend/src/components/app/_lib/`),
  knowledge controls, PR compatibility controls, nearby frontend tests.

## Lane 4 — documentation structure and absorption
- Five new canonical doc subtrees (System Design: project-state-and-authority,
  knowledge execution-classes-and-jobs; Implementation: knowledge background-processing,
  state project-state-and-authority, ui project-state-workspace).
- Absorption of 10-authority-and-actions, 60-knowledge, 80-operator-view.
- Source-fact ledger at context/absorption_ledger.md.
- Compact index updates to existing section parents only.

## Orchestrator (no lane)
- Wave sequencing, integration review, migration-copy validation, current_state.md,
  scoped staging, single commit.
