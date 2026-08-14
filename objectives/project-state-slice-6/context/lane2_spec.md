# Lane 2 — server ProjectStateView and action authority (runs AFTER Lane 1)

First read: context/lane_common_rules.md, context/dto_contract.md,
context/lane1_report.md (Lane 1's exported knowledge seam — consume it, do not reimplement).
Contracts to render (docs CLI): docs/40-new-features/20-project-state-and-events/80-operator-view
and 10-authority-and-actions (full action matrix), plus 20-project-session / 30-run /
40-pr-campaign / 50-sync as needed for enablement conditions.

## Exclusive ownership (edit nothing else)
- `apps/server/src/application/dashboard/read-model.ts` + `read-model.test.ts` and any new
  sibling module/test under `apps/server/src/application/dashboard/` you add for action
  projection.
- `apps/server/src/api/routes/sessions.ts` + `sessions.test.ts`
- `apps/server/src/api/routes/knowledge.ts` + its tests (add the knowledge.process
  command route; create a focused test file if none exists)
- The narrow HTTP registration required for the new route (only the registration lines).
DO NOT touch: `apps/server/src/core/**` (Lane 1 owns knowledge core; consume its exports),
`apps/frontend/**`, `docs/**`, migrations.

## Requirements
1. Export ONE canonical `getProjectStateView` from the dashboard read model returning the
   exact DTO in context/dto_contract.md — every field, no lossy renaming:
   `project_revision` (not legacy `revision`), `pr_work` array (not singular `pr`),
   `active_workflow` with a required human `headline` and blockers,
   `queued_dispatch_requests`, `knowledge` filled from Lane 1's summary seam (freshness,
   queued jobs, active lease, retry/backoff, failures), project-scoped
   `active_operations` and `recent_events`, `available_actions`, `compatibility_actions`.
2. Project EXACTLY the 21 canonical actions, always — including when domain objects are
   absent (no run / no campaign / no sync ⇒ enabled=false with explicit blockers such as
   a "no such workflow" blocker code, plus expected_transition and confirmation_required
   still populated). Implement the v1 action-inventory matrix verbatim: enabled-when,
   blocked-by, expected result, confirm column.
3. `compatibility_actions` is a separate collection holding `pr.adopt_legacy` (reuse the
   existing adopt-legacy availability logic). It never appears in available_actions.
4. Add the `knowledge.process` command route: drives Lane 1's shared claim/process seam;
   rejects when the projection says disabled (lease held, backoff, empty queue) with the
   blocker payload.
5. Server-side enforcement everywhere: every command route (run, pr, sync, session,
   knowledge) independently re-derives availability for its action and rejects disabled
   actions — the route must not trust the client. Follow the existing route validation
   patterns; extend, do not rewrite, existing routes.
6. `session.close` enforces its confirmation server-side per the existing two-tier
   confirmation contract (reject unconfirmed closes). Apply the same tier rules the
   contract's Confirm column defines for any route that does not yet enforce them.
7. Do not weaken Slice 5 dispatch, event, actor, or tracing behavior. Keep existing
   read-model exports working unless they are the legacy view this replaces; if you
   retire a legacy view shape, update its direct consumers within your ownership only and
   note anything outside your ownership in your report instead of editing it.

## Validation (focused only)
- `bun test apps/server/src/application/dashboard/read-model.test.ts`
- `bun test apps/server/src/api/routes/sessions.test.ts`
- `bun test` on the knowledge route test file you add/extend
- `tsc --noEmit` from repo root.

## Report
Write `objectives/project-state-slice-6/context/lane2_report.md` (changed files, DTO
notes, action matrix coverage, test commands + results, anything out-of-scope you needed
but did not edit).
