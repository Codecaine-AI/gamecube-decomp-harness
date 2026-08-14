# Slice 6 Gap Verification

This audit re-examines only the 117 `PARTIAL` and `MISSING` facts named in the final verdict of `absorption_audit_remaining.md`. Each feature source was re-rendered through the docs CLI, then searched under exact field names and alternate phrasings across `docs/10-system-design` and `docs/20-implementation`.

| ID | Original verdict | Verified verdict | Evidence path or justification |
| --- | --- | --- | --- |
| S006 | PARTIAL | FALSE-GAP | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` explicitly makes Run, PR campaign, and sync child workflows and assigns shared lineage and `head_revision` to `ProjectSession`. |
| S022 | PARTIAL | CONFIRMED-PARTIAL | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` and `30-save-points` cover atomic remote publication and pre-durability compensation. Missing: an explicit durable failed/blocked outcome that makes commit failure “fail loudly.” |
| S036 | PARTIAL | CONFIRMED-PARTIAL | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` covers the single-active-session rule. Missing: the exact `active | closing | closed` domain vocabulary; the projection also has `idle`, `blocked`, and `complete`. |
| S041 | PARTIAL | CONFIRMED-PARTIAL | `docs/10-system-design/03-state-and-events/40-project-events/20-registry-and-catalog` requires `session.updated.timeline_entry_id: string`. Missing: a universal `TimelineEntry.entry_id` contract. |
| S043 | PARTIAL | CONFIRMED-PARTIAL | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` records child identities and the event registry has workflow-ID additions/removals. Missing: an ordered, creation-order `WorkflowId[]` session field. |
| S013 | MISSING | NOT-CONTRACT-WEIGHT | This is a non-enforced close-posture heuristic; canonical close gates in `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` intentionally allow ahead-of-base commits. |
| S017 | MISSING | CONFIRMED-PARTIAL | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` makes `ProjectSession` the durable root and PR campaign the review workflow. Missing: explicit retirement of the old campaign meaning; `docs/20-implementation/40-state` still describes campaigns as long-lived timeline owners. |
| S029 | MISSING | NOT-CONTRACT-WEIGHT | The July 2026 incident is transient history; its durable consequence—visible blockers and stale evidence—is canonical in `docs/10-system-design/10-intake-and-sessions/30-save-points`. |
| S042 | MISSING | CONFIRMED-MISSING | Exact and synonym searches found no timeline-entry timestamp contract. `docs/10-system-design/03-state-and-events/40-project-events/10-envelope-and-lineage` timestamps the separate event envelope only. |
| R003 | PARTIAL | FALSE-GAP | `docs/10-system-design/20-running/05-run-state` fixes starting evidence while background knowledge advances; `docs/10-system-design/03-state-and-events/05-project-state-and-authority/20-dispatch-authority-and-handoffs` permits background result ingestion regardless of lease. |
| R006 | PARTIAL | NOT-CONTRACT-WEIGHT | Superseded behavior: `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` requires isolated sync staging and forbids in-place session-worktree reconciliation. |
| R007 | PARTIAL | FALSE-GAP | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` covers ordered epoch lineage, rebasing onto upstream, mechanical resolution, and operator escalation. |
| R008 | PARTIAL | NOT-CONTRACT-WEIGHT | Obsolete “run timeline/epoch-like” wording; `docs/10-system-design/10-intake-and-sessions/30-save-points` canonically defines the ordered session-owned `remote_application` boundary and its contents. |
| R013 | PARTIAL | FALSE-GAP | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` makes run head a session-head mirror; `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` advances it for epoch and remote-application boundaries. |
| R022 | PARTIAL | NOT-CONTRACT-WEIGHT | Superseded source comment; `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` says epoch integrations and remote applications both advance head. |
| R024 | PARTIAL | CONFIRMED-PARTIAL | `docs/10-system-design/03-state-and-events/40-project-events/20-registry-and-catalog` defines optional `terminal_reason` on `run.failed`. Missing: storage as `RunControl.terminal_reason`. |
| R026 | PARTIAL | CONFIRMED-PARTIAL | The event registry defines integer `desired_workers` in run draft/change events. Missing: the `RunScheduling.desired_workers` projection. |
| R037 | PARTIAL | CONFIRMED-PARTIAL | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` composes epochs beneath a run via `run_id`. Missing: ordered `RunState.epoch_ids`. |
| R038 | PARTIAL | CONFIRMED-PARTIAL | `docs/10-system-design/10-intake-and-sessions/30-save-points` orders remote applications and the event catalog links them to runs. Missing: `RunState.remote_application_ids`. |
| R043 | PARTIAL | CONFIRMED-PARTIAL | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` composes workers beneath a run via `run_id`. Missing: `RunState.worker_state_ids`. |
| R044 | PARTIAL | CONFIRMED-PARTIAL | The same doc composes checkpoints beneath a run via `run_id`. Missing: `RunState.checkpoint_ids`. |
| R045 | PARTIAL | CONFIRMED-PARTIAL | `docs/10-system-design/03-state-and-events/05-project-state-and-authority/10-project-state-composition` defines project-level `active_operation_ids`. Missing: Run-state ownership/projection. |
| R046 | PARTIAL | CONFIRMED-PARTIAL | The same doc defines project-level `latest_event_sequence`. Missing: a Run-local cursor. |
| R049 | PARTIAL | CONFIRMED-PARTIAL | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` defines `finish_epoch` stop and sync drain handoff. Missing: exact `StopRequest { target: sync, mode: finish_epoch }` pairing. |
| R074 | PARTIAL | CONFIRMED-PARTIAL | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` retains recovery history and reconciles unfinished epoch boundaries. Missing: explicit retention of partial-epoch history. |
| R004 | MISSING | CONFIRMED-MISSING | Searches for consumed revision, scheduler decision, worker packet, and knowledge revision found no rule that each scheduler decision and packet records the revision consumed. |
| R023 | MISSING | CONFIRMED-PARTIAL | `docs/10-system-design/03-state-and-events/05-project-state-and-authority/20-dispatch-authority-and-handoffs` defines optional handoff and session architecture defines stop modes. Missing: `RunControl.stop_request: StopRequest`. |
| R025 | MISSING | CONFIRMED-PARTIAL | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` and `docs/20-implementation/60-ui` expose an active epoch. Missing: nullable `RunScheduling.active_epoch_id`. |
| R028 | MISSING | CONFIRMED-PARTIAL | `docs/20-implementation/60-ui` exposes durable active-epoch admitted count. Missing: aggregate `RunScheduling.admitted`. |
| R029 | MISSING | CONFIRMED-PARTIAL | `docs/20-implementation/60-ui` exposes durable active-epoch claimed count. Missing: aggregate `RunScheduling.claimed`. |
| R030 | MISSING | CONFIRMED-PARTIAL | `docs/10-system-design/20-running/10-run-director-loop` covers active-worker pressure and UI distinguishes active claims. Missing: aggregate `RunScheduling.running`. |
| R031 | MISSING | CONFIRMED-PARTIAL | `docs/10-system-design/10-intake-and-sessions/30-save-points` anchors score to commits and UI preserves the starting position. Missing: `RunProgress.baseline_score`. |
| R032 | MISSING | CONFIRMED-PARTIAL | Save-point docs define commit-anchored headline score after confirmed boundaries. Missing: `RunProgress.confirmed_score`. |
| R033 | MISSING | CONFIRMED-PARTIAL | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` defines tentative work. Missing: `RunProgress.tentative_changes` count. |
| R034 | MISSING | CONFIRMED-PARTIAL | The operating-flow doc defines confirmed work and integrations. Missing: `RunProgress.confirmed_changes` count. |
| R035 | MISSING | CONFIRMED-PARTIAL | UI exposes epoch regression counts and operating flow defines regressed work. Missing: `RunProgress.regressed_changes`. |
| R036 | MISSING | CONFIRMED-PARTIAL | `docs/10-system-design/30-workers/30-write-safety` defines the integration queue and conflict path. Missing: `RunState.integration_queue: IntegrationQueueSummary`. |
| R048 | MISSING | NOT-CONTRACT-WEIGHT | `epoch_size` is one illustrative configuration snapshot member; canonical epoch-size behavior already exists in running/UI configuration docs. |
| R050 | MISSING | CONFIRMED-PARTIAL | `docs/10-system-design/30-workers/30-write-safety` defines pending checkpoints and conflict state. Missing: numeric `pending` and `conflicts` summary fields. |
| R075 | MISSING | CONFIRMED-MISSING | Searches for recovery point/marker/boundary and prominence found recovery events but no trace/UI rule to visually distinguish the recovery point. |
| P006 | PARTIAL | CONFIRMED-PARTIAL | Knowledge source docs make PR review background-safe and turn PR material into lessons/feedback. Missing: outcomes must enter knowledge/standards before the next Run consumes them. |
| P009 | PARTIAL | FALSE-GAP | `docs/10-system-design/03-state-and-events/05-project-state-and-authority/40-project-state-view` projects PR work alongside active Run and exemplifies both together. |
| P013 | PARTIAL | NOT-CONTRACT-WEIGHT | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` covers the sequence; “roughly week-long” is an external-latency estimate. |
| P015 | PARTIAL | CONFIRMED-PARTIAL | Session/PR docs cover confirmed source slices and dedicated review workspaces. Missing: explicit no-shared-mutable-state guarantee. |
| P031 | PARTIAL | FALSE-GAP | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` says the single-open invariant prevents interleaved publication decisions and review learning. |
| P032 | PARTIAL | CONFIRMED-PARTIAL | Session and authority docs permit dormant review while Run holds dispatch. Missing: “not expected” as the operating norm. |
| P033 | PARTIAL | FALSE-GAP | `docs/10-system-design/03-state-and-events/05-project-state-and-authority/10-project-state-composition` applies stable envelope identity to every PR campaign. |
| P035 | PARTIAL | CONFIRMED-PARTIAL | Session architecture makes ProjectSession the campaign parent and records child identities. Missing: campaign-side `session_id: SessionId`. |
| P039 | PARTIAL | CONFIRMED-PARTIAL | Ship/handoff docs anchor campaign source at a hard `ship` save point. Missing: `save_point_id: SavePointId` storage. |
| P040 | PARTIAL | CONFIRMED-PARTIAL | PR tracking anchors the campaign at the stable split point. Missing: captured session-head `SourceRevision`. |
| P043 | PARTIAL | CONFIRMED-PARTIAL | PR docs define default-four batches and event payload `publication_batch_size`. Missing: campaign-state `publication_policy.batch_size`. |
| P044 | PARTIAL | FALSE-GAP | PR tracking says the campaign owns every series and records prepared series in publication order under ordered batches. |
| P045 | PARTIAL | CONFIRMED-PARTIAL | PR tracking requires `pr_phase` acquisition/release evidence. Missing: stored `activation_ids: PrPhaseId[]`. |
| P051 | PARTIAL | NOT-CONTRACT-WEIGHT | Illustrative JSON identifiers, counts, timestamps, and sample values do not create a separate contract. |
| P055 | PARTIAL | CONFIRMED-PARTIAL | PR tracking covers dormant/no-lease `in_review`. Missing—and in tension with canonical text—the requirement that at least one series already be open upstream. |
| P064 | PARTIAL | FALSE-GAP | Envelope/lineage makes each series a durable event subject and the event catalog carries exact `series_id` identities. |
| P065 | PARTIAL | CONFIRMED-PARTIAL | PR tracking and lineage establish campaign containment. Missing: stored `campaign_id: PrCampaignId` on series state. |
| P066 | PARTIAL | CONFIRMED-PARTIAL | Lineage defines accepted revisions on per-series subjects. Missing: stored integer series revision. |
| P070 | PARTIAL | FALSE-GAP | PR tracking says each series retains its branch; the registry requires `branch` on preparation/publication events. |
| P075 | PARTIAL | FALSE-GAP | The event registry uses exact work-item identities across ingestion, claim, resolution, decline, and revision. |
| P076 | PARTIAL | CONFIRMED-PARTIAL | The registry records review-source identities and classification distinguishes PR review. Missing: per-item `source_kind`. |
| P077 | PARTIAL | CONFIRMED-PARTIAL | The registry records exact review-source identities. Missing: explicit per-item `source_id` mapping. |
| P078 | PARTIAL | CONFIRMED-PARTIAL | Lifecycle/event docs cover pending, in-progress, resolved, and declined. Missing: declaration that exactly those four values are allowed. |
| P080 | PARTIAL | FALSE-GAP | `docs/10-system-design/50-ship-and-pr/10-score-and-pr-handoff` says each series records latest validation; PR tracking ties it to branch/source anchor. |
| P082 | PARTIAL | CONFIRMED-PARTIAL | PR tracking requires source-anchor validation and revalidation. Missing: persisted `ValidationRecord.source_revision`. |
| P083 | PARTIAL | CONFIRMED-PARTIAL | PR tracking requires clean validation evidence. Missing: persisted generic `result` field/value contract. |
| P085 | PARTIAL | CONFIRMED-PARTIAL | Per-series events carry trace lineage. Missing: series-owned root `trace_id`. |
| P086 | PARTIAL | FALSE-GAP | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` explicitly says each series retains blockers. |
| P087 | PARTIAL | NOT-CONTRACT-WEIGHT | Illustrative batch, branch, target, review comment, validation, and IDs are not an independent contract. |
| P101 | PARTIAL | CONFIRMED-PARTIAL | PR tracking makes `closed` terminal and registry requires a close reason separate from merge. Missing: exhaustive “withdrawn or rejected without merging” meaning. |
| P103 | PARTIAL | CONFIRMED-PARTIAL | Lifecycle/event docs exercise all four statuses. Missing: explicit complete four-value vocabulary. |
| P105 | PARTIAL | FALSE-GAP | PR tracking moves pending work to in-progress on claim, directly establishing nonterminality. |
| P107 | PARTIAL | FALSE-GAP | PR tracking requires later resolution after in-progress and forbids release while it remains, establishing nonterminality. |
| P108 | PARTIAL | CONFIRMED-PARTIAL | PR tracking covers addressed items with pushed revision. Missing: resolution by review-thread answer without push. |
| P110 | PARTIAL | CONFIRMED-PARTIAL | Registry records declined IDs and mandatory reason. Missing: explicit terminality. |
| P014 | MISSING | CONFIRMED-MISSING | Parallel/simultaneous Run+PR searches found only exclusive dispatch and durable inactive workflows; no canonical desired concurrency relaxation exists. |
| P016 | MISSING | CONFIRMED-MISSING | Capacity, simplicity, and source-truth searches found no statement that exclusivity is a capacity/simplicity constraint rather than source truth. |
| P018 | MISSING | CONFIRMED-MISSING | Authority docs define one lease but never require a future concurrency design to revisit that decision. |
| P030 | MISSING | CONFIRMED-MISSING | PR tracking prevents two open campaigns but never states that one normally concludes before the next Run batch. |
| P046 | MISSING | CONFIRMED-PARTIAL | Campaign events are sequenced and project state has a latest-event cursor. Missing: campaign-local `latest_event_sequence`. |
| P048 | MISSING | CONFIRMED-PARTIAL | Registry defines `pr.campaign_closed` with envelope `occurred_at`. Missing: campaign-state `closed_at?` and presence rule. |
| P072 | MISSING | CONFIRMED-MISSING | Exact and alternate searches for target units, translation units, primary units, and series targets found no equivalent series contract. |
| P073 | MISSING | CONFIRMED-MISSING | Generic cross-module safety exists, but no rule permits cross-module edits specifically in service of listed series target units. |
| P079 | MISSING | CONFIRMED-MISSING | Feedback summary/item summary/description/message searches found no `PrWorkItem.summary` contract. |
| P081 | MISSING | CONFIRMED-MISSING | `validated_at`, validation timestamp/time, and occurrence searches found no validation-record timestamp field. |
| P084 | MISSING | CONFIRMED-PARTIAL | Per-series event transitions have `occurred_at`. Missing: latest-update timestamp stored as `PrSeriesState.updated_at`. |
| P109 | MISSING | CONFIRMED-MISSING | Resolution events and meaning exist, but searches found no rule that resolved work items are terminal. |
| Y021 | PARTIAL | CONFIRMED-PARTIAL | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` covers reconciliation and mechanical auto-resolution. Missing: “most rebase cleanly” and the agent-resolved versus mechanical distinction. |
| Y024 | PARTIAL | FALSE-GAP | Operator-action and session-architecture docs define atomic `sync.publish`, head advance, and completion of all reconciled PR pushes before `published`. |
| Y039 | PARTIAL | CONFIRMED-PARTIAL | Operating flow covers staged repair, conflict resolution, and validation. Missing: explicit build-failure repair during reconciliation. |
| Y046 | PARTIAL | CONFIRMED-PARTIAL | Sync-event and session docs require transactional explicit invalidation identities. Missing: required target/checkpoint/PR-snapshot classes. |
| Y052 | PARTIAL | CONFIRMED-PARTIAL | Project-state composition gives sync a stable envelope `id` and slot `workflow_id`. Missing: domain field `sync_id: SyncId`. |
| Y054 | PARTIAL | CONFIRMED-PARTIAL | Session architecture makes sync a child workflow. Missing: `SyncState.session_id` back-reference. |
| Y057 | PARTIAL | CONFIRMED-PARTIAL | Session architecture covers requested intake content. Missing: durable `SyncState.intake` object; the source’s “captured when operator starts” also conflicts with canonical pre-start observation. |
| Y058 | PARTIAL | FALSE-GAP | Registry requires `sync.requested.upstream_from`; session architecture ties it to the prior upstream revision. |
| Y059 | PARTIAL | FALSE-GAP | Registry requires `sync.requested.upstream_to`; session architecture defines the observed upstream target. |
| Y060 | PARTIAL | FALSE-GAP | `docs/10-system-design/03-state-and-events/40-project-events/40-sync-and-knowledge-events` requires the complete PR identity set and exact `merged_pr_ids`. |
| Y061 | PARTIAL | FALSE-GAP | The same doc requires the complete corpus identity set and exact `corpus_batch_ids`. |
| Y062 | PARTIAL | FALSE-GAP | Registry defines `knowledge_only`; operating/session docs define no movement, skipped reconciliation/staging, and knowledge-only revision advance. |
| Y063 | PARTIAL | CONFIRMED-PARTIAL | Session architecture covers isolated staging and knowledge-only skipping. Missing: nullable `SyncState.staging` representation. |
| Y064 | PARTIAL | CONFIRMED-PARTIAL | Registry records exact `staging_workspace_id`. Missing: nested `staging.workspace_id: WorkspaceId` state shape. |
| Y065 | PARTIAL | CONFIRMED-PARTIAL | Sync events define integer `epochs_total`. Missing: persistence as `SyncState.staging.epochs_total`. |
| Y066 | PARTIAL | CONFIRMED-PARTIAL | Sync events define integer `epochs_applied`. Missing: persistence as `SyncState.staging.epochs_applied`. |
| Y067 | PARTIAL | CONFIRMED-PARTIAL | Sync events define integer `minor_conflicts_resolved`. Missing: SyncState staging projection. |
| Y068 | PARTIAL | CONFIRMED-PARTIAL | Sync events define integer `conflicts_awaiting_operator`. Missing: SyncState staging projection. |
| Y069 | PARTIAL | CONFIRMED-PARTIAL | Session architecture requires every open series rebased; sync events have only aggregate summary. Missing: one-entry-per-series state array. |
| Y070 | PARTIAL | CONFIRMED-PARTIAL | Registry identifies series on per-push events. Missing: `series_id` on each durable reconciliation entry. |
| Y071 | PARTIAL | CONFIRMED-PARTIAL | Sync events define aggregate `clean`, `auto_resolved`, and `needs_operator` counts. Missing: closed per-entry result enum. |
| Y072 | PARTIAL | CONFIRMED-PARTIAL | Sync events track pushed count and registry defines push success. Missing: per-entry `pushed` boolean and transition. |
| Y073 | PARTIAL | CONFIRMED-PARTIAL | Session architecture describes independent publication records created during publish. Missing: nullable before/after state shape. |
| Y074 | PARTIAL | CONFIRMED-PARTIAL | Save-point docs cover source-changing remote application and absence for knowledge-only passes. Missing: nested `publication.remote_application_id`. |
| Y078 | PARTIAL | CONFIRMED-PARTIAL | Sync events require explicit invalidation identities. Missing: target/checkpoint/PR-snapshot identity classes. |
| Y101 | PARTIAL | FALSE-GAP | Operator-action and operating-flow docs require atomic publication, one durable transaction, and all push records before `published`. |
| Y041 | MISSING | NOT-CONTRACT-WEIGHT | “Without rebuilding everything” is an implementation/performance tactic; the durable contract is successful staged validation evidence. |
| Y048 | MISSING | NOT-CONTRACT-WEIGHT | Superseded by `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow`, which keeps Run paused until explicit operator resume. |
| Y080 | MISSING | CONFIRMED-PARTIAL | Project-state composition defines project-level `trace.latest_event_sequence`. Missing: sync-local cursor. |
| Y088 | MISSING | NOT-CONTRACT-WEIGHT | Illustrative snapshot, not an invariant; it conflicts with session architecture, where unresolved operator conflicts move sync to `blocked`. |

## Revised counts

| Source child | FALSE-GAP | CONFIRMED-PARTIAL | CONFIRMED-MISSING | NOT-CONTRACT-WEIGHT | Requires absorption | Total audited |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `20-project-session` | 1 | 5 | 1 | 2 | 6 | 9 |
| `30-run` | 3 | 22 | 2 | 4 | 24 | 31 |
| `40-pr-campaign` | 11 | 24 | 9 | 3 | 33 | 47 |
| `50-sync` | 7 | 20 | 0 | 3 | 20 | 30 |
| **Total** | **22** | **71** | **12** | **12** | **83** | **117** |

## MINIMAL ABSORPTION WORKLIST

Only `CONFIRMED-PARTIAL` and `CONFIRMED-MISSING` facts appear below. Each item names only the aspect still absent.

### `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture`

- S036 exact session-status domain vocabulary; S043 ordered creation-order workflow-ID collection; S042 timeline-entry timestamp.
- R023 stored stop request; R025 active-epoch ID; R037 ordered epoch IDs; R038 remote-application IDs; R049 exact sync/finish-epoch stop pairing.
- P035 campaign-side session ID; P040 captured source revision; P032 expected dormant-review operating norm.
- Y054 sync-side session ID; Y057 durable intake object with canonical capture timing; Y063 nullable staging; Y073 nullable publication record.

### `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow`

- S022 explicit visible failed/blocked remote-boundary outcome; S017 explicit retirement of the old long-lived campaign meaning.
- R033/R034 tentative and confirmed change counts; R074 partial-epoch history retention.
- Y021 clean/agent/mechanical reconciliation distinction; Y039 build-failure repair during reconciliation.

### `docs/10-system-design/03-state-and-events/05-project-state-and-authority/10-project-state-composition`

- S041 universal timeline-entry identity; R045 Run-local active-operation IDs; R046 Run-local latest-event cursor.
- P046 campaign-local latest-event cursor; Y052 typed sync ID; Y080 sync-local latest-event cursor.

### `docs/10-system-design/03-state-and-events/20-run-state-and-recovery`

- R024 RunControl terminal reason; R026 desired-worker projection; R028/R029/R030 admitted, claimed, and running scheduling counts.
- R031/R032 baseline and confirmed score; R035 regressed-change count; R036 integration-queue summary.
- R043 worker-state IDs; R044 checkpoint IDs; R050 pending/conflict queue counts.

### `docs/10-system-design/20-running/10-run-director-loop`

- R004 consumed knowledge revision on every scheduler decision and worker packet.

### `docs/10-system-design/03-state-and-events/40-project-events/10-envelope-and-lineage`

- P066 stored series revision; P084 series `updated_at`; P085 series-root trace ID.

### `docs/10-system-design/03-state-and-events/40-project-events/20-registry-and-catalog`

- P048 campaign `closed_at` presence rule; P065 stored series campaign ID.
- P076/P077 per-work-item source kind and source ID; P078/P103 closed four-value work-item vocabulary; P110 declined terminality.

### `docs/10-system-design/50-ship-and-pr/10-score-and-pr-handoff`

- P006 PR outcomes absorbed into knowledge/standards before the next Run consumes them.
- P072/P073 target-unit field and its cross-module-edit rule.

### `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking`

- P014 desired future Run/PR concurrency relaxation; P015 no-shared-mutable-state guarantee; P016 exclusivity rationale; P018 explicit concurrency revisit requirement; P030 normal campaign-before-next-batch sequencing.
- P039 stored save-point ID; P043 publication-policy batch-size field; P045 activation-ID collection; P055 upstream-open requirement or explicit rejection of it.
- P079 work-item summary; P081 validation timestamp; P082 validation source revision; P083 validation result field.
- P101 exhaustive closed meaning; P108 review-thread-only resolution; P109 resolved terminality.

### `docs/10-system-design/03-state-and-events/40-project-events/40-sync-and-knowledge-events`

- Y046/Y078 required invalidation classes: targets, checkpoints, and PR snapshots.
- Y064 nested staging workspace ID; Y065/Y066 applied/total epoch persistence; Y067/Y068 conflict-count persistence.
- Y069/Y070 one reconciliation entry per open series with series ID; Y071 per-entry result enum; Y072 per-entry pushed state; Y074 publication remote-application ID.

### `docs/20-implementation/40-state`

- S017 align the implementation projection so campaigns no longer claim ownership of the long-lived project timeline.

### `docs/20-implementation/60-ui`

- R075 visually distinguish the recovery point in trace/history surfaces.

VERDICT: 83 facts require absorption.
