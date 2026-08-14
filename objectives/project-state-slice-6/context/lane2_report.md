# Lane 2 report — canonical project state view and action authority

## Changed files

- `apps/server/src/application/dashboard/read-model.ts` — exports canonical
  `getProjectStateView`, maps Lane 1's background-knowledge summary, and projects
  the fixed canonical/compatibility action inventories.
- `apps/server/src/application/dashboard/read-model.test.ts` — covers the fixed
  inventory and absent-domain projection.
- `apps/server/src/api/routes/knowledge.ts` — adds projection-gated
  `POST /api/knowledge/process`, including race re-projection.
- `apps/server/src/api/routes/knowledge.test.ts` — covers enabled, disabled,
  lease-race, and existing standards behavior.
- `apps/server/src/infrastructure/http/server.ts` — narrow registration wiring
  for the canonical projection and Lane 1 shared trigger/process seam.
- `objectives/project-state-slice-6/context/lane2_report.md` — this report.

`apps/server/src/api/routes/sessions.ts` and `sessions.test.ts` required no edits.

## DTO field coverage

`getProjectStateView` returns `project_id`, `project_revision`, `session` with
latest timeline entry, `active_workflow` with required human `headline` and
blockers, `queued_dispatch_requests`, `run`, array-valued `pr_work`, Lane 1
`knowledge` freshness/queue/lease/retry/failure data, `sync`, project-scoped
`active_operations` and `recent_events`, `available_actions`, and the separate
`compatibility_actions` collection. Legacy focused read-model exports remain
available.

## Full 21-action matrix coverage

| Domain | Always-projected actions | Confirmation-required actions |
| --- | --- | --- |
| Run | `run.start`, `run.pause`, `run.resume`, `run.hard_stop`, `run.cancel`, `run.recover` | `run.hard_stop`, `run.cancel`, `run.recover` |
| PR | `pr.open_campaign`, `pr.activate`, `pr.publish_batch`, `pr.release`, `pr.close_campaign`, `pr.abandon_campaign`, `pr.campaign_recover` | `pr.publish_batch`, `pr.close_campaign`, `pr.abandon_campaign`, `pr.campaign_recover` |
| Sync | `sync.start`, `sync.resolve_conflict`, `sync.publish`, `sync.cancel`, `sync.recover` | `sync.publish`, `sync.cancel`, `sync.recover` |
| Session | `session.save_point`, `session.close` | `session.close` |
| Knowledge | `knowledge.process` | none |

Every row retains its expected transition when disabled. Missing domain objects
produce explicit `run_not_found`, `pr_campaign_not_found`, `sync_not_found`, or
`session_not_found` blockers. `pr.adopt_legacy` is emitted only in
`compatibility_actions`; it is never one of the 21 canonical rows.

Run, PR, and sync command routes already independently re-project availability,
reject disabled actions, and apply the matrix confirmation tier. The new
knowledge route does the same and returns its blocker payload with HTTP 409.

## Validation

- `bun test ./apps/server/src/application/dashboard/read-model.test.ts` — PASS:
  13 tests, 0 failures, 111 assertions.
- `bun test ./apps/server/src/api/routes/sessions.test.ts` — PASS: 2 tests,
  0 failures, 6 assertions.
- `bun test ./apps/server/src/api/routes/knowledge.test.ts` — PASS: 4 tests,
  0 failures, 14 assertions.
- `bunx tsc --noEmit --pretty false` — only the documented pre-existing TS6059
  `rootDir` errors for `../../Codecaine/Core/prompt-kit` (surfacing through
  `apps/frontend/src/lib/api.ts`); no Lane 2 diagnostic remained.

No server or full test suite was started. No git write command was run.

## Out-of-scope need not edited

The canonical session command handler is
`apps/server/src/api/project-session/routes.ts`, outside Lane 2's exclusive
ownership list. It already re-derives `session.save_point`/`session.close`
availability, but `session.close` does not reject an unconfirmed request. Full
requirement 6 therefore needs a follow-up edit and focused test in that file by
its owner; Lane 2 did not duplicate the route or violate ownership.

## Bounded Slice 6 follow-up — session close confirmation

The canonical project-session route now rejects enabled `session.close`
requests unless the JSON body contains `confirmed: true`. The rejection matches
the run/PR/sync command pattern: HTTP 409 with the full action projection,
`result: null`, and `error: "session.close requires operator confirmation"`.
Availability is still re-derived and checked before confirmation.
`session.save_point` remains single-click and accepts a request without a
confirmation flag.

- `bun test ./apps/server/src/api/project-session/routes.test.ts` — PASS:
  8 tests, 0 failures, 36 assertions.
