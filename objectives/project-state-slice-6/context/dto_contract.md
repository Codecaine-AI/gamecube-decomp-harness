# Canonical ProjectStateView DTO and 21-action contract (Slice 6)

Authority: rendered contracts
`docs/40-new-features/20-project-state-and-events/80-operator-view` (view shape) and
`docs/40-new-features/20-project-state-and-events/10-authority-and-actions` (action
inventory + confirmation). The rendered contract wins over this summary if they diverge.

## ProjectStateView — canonical top-level fields (no lossy renaming)

```
project_id: ProjectId
project_revision: integer            # NOT legacy `revision`
session: SessionSummary | null       # identity, head revision, latest timeline entry
active_workflow: ActiveWorkflowSummary | null
  kind: "run" | "pr" | "sync"
  workflow_id
  status: "acquiring" | "active" | "draining" | "blocked" | "releasing"
  headline: string                   # REQUIRED human headline
  blockers: Blocker[]
queued_dispatch_requests: DispatchRequest[]
run: RunSummary | null
pr_work: PrWorkflowSummary[]         # ARRAY, not singular `pr`
knowledge: KnowledgeFreshnessSummary # freshness, queued jobs, active lease,
                                     # retry/backoff, failures (see Lane 1 seam)
sync: SyncSummary | null
active_operations: OperationSummary[]   # project-scoped
recent_events: EventSummary[]           # project-scoped
available_actions: ActionProjection[]   # exactly the 21 canonical actions, always
  action_id, subject_kind, subject_id, enabled, blocked_by: Blocker[],
  expected_transition, confirmation_required
compatibility_actions: ActionProjection[]  # pr.adopt_legacy lives ONLY here
```

## The 21 canonical actions (always present; disabled ⇒ enabled=false + blockers, never omitted)

| Domain | Actions |
| --- | --- |
| Run | run.start, run.pause, run.resume, run.hard_stop, run.cancel, run.recover |
| PR | pr.open_campaign, pr.activate, pr.publish_batch, pr.release, pr.close_campaign, pr.abandon_campaign, pr.campaign_recover |
| Sync | sync.start, sync.resolve_conflict, sync.publish, sync.cancel, sync.recover |
| Session | session.save_point, session.close |
| Knowledge | knowledge.process |

Confirmation (two-tier, from the 2026-08-12 decision): confirmation_required is true
exactly when the action is outward-facing, work-discarding, or terminal:
run.hard_stop, run.cancel, run.recover, pr.publish_batch, pr.close_campaign,
pr.abandon_campaign, pr.campaign_recover, sync.publish, sync.cancel, sync.recover,
session.close. All others are single-click, gated only by blockers.

Enablement conditions, blockers, and expected transitions come from the v1 operator
action inventory table in 10-authority-and-actions — implement that matrix verbatim.

## Hard rules
- All 21 actions are always present even when domain objects are absent (subject_id may
  reference the would-be subject or be empty per existing envelope conventions; enabled
  false with explicit blockers such as "no run exists").
- `pr.adopt_legacy` never appears in available_actions, never replaces knowledge.process,
  never becomes a 22nd canonical action.
- Every command route independently re-derives availability and rejects disabled actions.
- `session.close` enforces confirmation server-side.
- Operator surfaces consume this DTO exactly; the frontend never derives action authority.
