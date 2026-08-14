# Lane 3 — frontend ProjectState projection and controls

First read: context/lane_common_rules.md, context/dto_contract.md.
Contracts to render (docs CLI): docs/40-new-features/20-project-state-and-events/80-operator-view
and 10-authority-and-actions.

## Exclusive ownership (edit nothing else)
- `apps/frontend/src/pages/workspace/_lib/types.ts`, `model.ts`, `model.test.ts`
- `apps/frontend/src/components/app/_lib/**` (projected controls + tests; add new
  projected-control modules here, e.g. knowledge controls, PR compatibility controls)
- Workspace/app-shell components that render these controls and summaries
  (`apps/frontend/src/pages/workspace/**`, `apps/frontend/src/components/app/**`) —
  only as far as needed to surface the new DTO fields and controls.
DO NOT touch: `apps/server/**`, `docs/**`, migrations, packages/.

## Requirements
1. Model the exact server DTO from context/dto_contract.md in the workspace ProjectState
   types/model: `project_revision` (not `revision`), `pr_work` as an array,
   `active_workflow` with `headline` + blockers, `queued_dispatch_requests`, `knowledge`
   freshness (published revision, queued/processing/waiting/failed counts,
   oldest_pending_at, active lease, retry/backoff, failures), project-scoped
   `active_operations` and `recent_events`, `available_actions`, `compatibility_actions`.
   Preserve every canonical field; no renaming, no dropping.
   Note: the server lane runs in parallel; code against the dto_contract.md shape, not
   against the current server code. Mismatches get reconciled by the orchestrator.
2. Render ALL 21 canonical actions from the server projection: disabled actions render
   disabled with their `blocked_by` blockers and `expected_transition` visible — never
   hidden. Enablement and confirmation come ONLY from the projection fields
   (`enabled`, `confirmation_required`); never recompute policy client-side.
3. Confirmation flow: actions with `confirmation_required: true` (session.close included)
   prompt before sending; cancelling the prompt sends NO command. Follow the existing
   confirmation UI pattern in the projected sync/PR controls.
4. Knowledge controls: show freshness (published revision, oldest pending age), queue
   counts, active lease, retry/backoff, failures, and a knowledge.process trigger driven
   by its ActionProjection.
5. Active workflow: show `headline`, status, blockers; show queued_dispatch_requests.
6. `pr.adopt_legacy` renders only in a visibly separate compatibility section sourced from
   `compatibility_actions`, clearly distinct from the 21 canonical actions.
7. Follow existing patterns in projectedSyncControls / projectedPrCampaignControls for
   structure and tests.

## Validation (focused only)
- `bun test apps/frontend/src/pages/workspace/_lib/model.test.ts`
- `bun test apps/frontend/src/components/app/_lib/`
- Any new/touched component test files.
- `bun run ui:check` (frontend TypeScript). Do NOT run `bun run ui` or any server.

## Report
Write `objectives/project-state-slice-6/context/lane3_report.md` (changed files, model
shape decisions, test commands + results, deviations).
