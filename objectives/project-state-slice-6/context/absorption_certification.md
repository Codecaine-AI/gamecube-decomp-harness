# Slice 6 Gap Absorption Certification

Audit method: each canonical destination was rendered with `bun packages/docs-framework/packages/docs-cli/src/index.ts render <path>`. Source bundles under `docs/40-new-features/20-project-state-and-events/` were re-rendered where fidelity required comparison. Lane ledgers were used only to assign work, not as evidence. S017 has two required destinations and is reported once, with both destination checks.

| ID | Destination | Status | Rendered evidence or justification |
| --- | --- | --- | --- |
| S036 | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | PRESENT | `status: "active" \| "closing" \| "closed"` is the canonical lifecycle vocabulary. |
| S042 | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | PRESENT | `TimelineEntry` includes `occurred_at: timestamp`. |
| S043 | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | PRESENT | `workflow_ids: WorkflowId[]` stores child identities “in creation order.” |
| R023 | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | PRESENT | `RunControl` includes stored `stop_request?: StopRequest`. |
| R025 | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | PRESENT | `active_epoch_id: EpochId \| null` names the active epoch or is null between epochs. |
| R037 | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | PRESENT | `epoch_ids: EpochId[]` is explicitly ordered by creation. |
| R038 | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | PRESENT | `remote_application_ids: RemoteApplicationId[]` is ordered by the session timeline. |
| R049 | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | PRESENT | Exact stored pairing: `StopRequest { target: sync, mode: finish_epoch }`. |
| P032 | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | PRESENT | “Dormant review while Run holds dispatch is supported but is not the expected operating norm.” |
| P035 | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | PRESENT | `PrCampaignState` stores `session_id: SessionId`. |
| P040 | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | PRESENT | `source_revision: SourceRevision` is the session head captured when the campaign split is created. |
| Y054 | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | PRESENT | `SyncState` stores `session_id: SessionId`. |
| Y057 | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | PRESENT | Durable `intake: SyncIntake` is captured at observation, before operator start, preserving canonical timing. |
| Y063 | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | PRESENT | `staging: StagingProgress \| null`; null before staging and for knowledge-only sync. |
| Y073 | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | PRESENT | `publication: PublicationRecord \| null` has explicit pre-publication, knowledge-only, and source-changing rules. |
| S022 | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | PRESENT | Boundary transaction or commit failure durably enters `blocked` with a visible blocker and cannot become published. |
| S017 | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow`; `docs/20-implementation/40-state` | PRESENT | Design explicitly supersedes the old long-lived campaign meaning; implementation says ProjectSession owns project timeline/head lineage and campaign means PR review only. |
| R033 | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | PRESENT | `RunProgress.tentative_changes` counts banked changes not yet confirmed. |
| R034 | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | PRESENT | `RunProgress.confirmed_changes` counts changes accepted by the epoch boundary. |
| R074 | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | PRESENT | Recovery retains partial-epoch history, including settled/cancelled claims and unconfirmed integrations. |
| Y021 | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | PRESENT | Most series rebase cleanly; agents resolve semantic conflicts, while only mechanical conflicts auto-resolve. |
| Y039 | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | PRESENT | “Build-failure repair” is explicitly included in staged reconciliation. |
| S041 | `docs/10-system-design/03-state-and-events/05-project-state-and-authority/10-project-state-composition` | PRESENT | “Every TimelineEntry carries `entry_id: string` as its universal stable identity.” |
| R045 | `docs/10-system-design/03-state-and-events/05-project-state-and-authority/10-project-state-composition` | PRESENT | RunState requires run-owned `active_operation_ids: OperationId[]`. |
| R046 | `docs/10-system-design/03-state-and-events/05-project-state-and-authority/10-project-state-composition` | PRESENT | RunState requires run-local `latest_event_sequence: integer`. |
| P046 | `docs/10-system-design/03-state-and-events/05-project-state-and-authority/10-project-state-composition` | PRESENT | PrCampaignState requires campaign-local `latest_event_sequence: integer`. |
| Y052 | `docs/10-system-design/03-state-and-events/05-project-state-and-authority/10-project-state-composition` | PRESENT | SyncState requires typed domain identity `sync_id: SyncId`. |
| Y080 | `docs/10-system-design/03-state-and-events/05-project-state-and-authority/10-project-state-composition` | PRESENT | SyncState requires sync-local `latest_event_sequence: integer`. |
| R024 | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | PRESENT | `RunControl` contains stored `terminal_reason?: string`. |
| R026 | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | PRESENT | `RunScheduling` contains durable `desired_workers: integer`. |
| R028 | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | PRESENT | `RunScheduling.admitted: integer` is the active epoch aggregate. |
| R029 | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | PRESENT | `RunScheduling.claimed: integer` is the active epoch aggregate. |
| R030 | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | PRESENT | `RunScheduling.running: integer` counts workers actively running claimed work. |
| R031 | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | PRESENT | `RunProgress.baseline_score: number` is the fixed original baseline. |
| R032 | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | PRESENT | `RunProgress.confirmed_score: number` is the latest confirmed commit-boundary score. |
| R035 | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | PRESENT | `RunProgress.regressed_changes: integer` counts regressed changes. |
| R036 | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | PRESENT | RunState contains `integration_queue: IntegrationQueueSummary`. |
| R043 | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | PRESENT | RunState stores run-owned `worker_state_ids: WorkerStateId[]`. |
| R044 | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | PRESENT | RunState stores run-owned `checkpoint_ids: CheckpointId[]`. |
| R050 | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | PRESENT | IntegrationQueueSummary contains integer `pending` and `conflicts` fields. |
| R004 | `docs/10-system-design/20-running/10-run-director-loop` | PRESENT | “Every scheduler decision and worker packet records the `knowledge_revision` it actually consumed.” |
| P066 | `docs/10-system-design/03-state-and-events/40-project-events/10-envelope-and-lineage` | PRESENT | Series state stores `revision: integer`, advanced per accepted transition. |
| P084 | `docs/10-system-design/03-state-and-events/40-project-events/10-envelope-and-lineage` | PRESENT | Series state stores `updated_at: timestamp` for the latest accepted update. |
| P085 | `docs/10-system-design/03-state-and-events/40-project-events/10-envelope-and-lineage` | PRESENT | Series state stores root `trace_id: TraceId`. |
| P048 | `docs/10-system-design/03-state-and-events/40-project-events/20-registry-and-catalog` | PRESENT | `PrCampaignState.closed_at?: timestamp` is absent while open and present only after closure. |
| P065 | `docs/10-system-design/03-state-and-events/40-project-events/20-registry-and-catalog` | PRESENT | Every `PrSeriesState` stores `campaign_id: PrCampaignId`. |
| P076 | `docs/10-system-design/03-state-and-events/40-project-events/20-registry-and-catalog` | PRESENT | Every durable PrWorkItem maps origin with `source_kind: string`. |
| P077 | `docs/10-system-design/03-state-and-events/40-project-events/20-registry-and-catalog` | PRESENT | Every durable PrWorkItem maps origin with `source_id: string`. |
| P078 | `docs/10-system-design/03-state-and-events/40-project-events/20-registry-and-catalog` | PRESENT | Status vocabulary is exactly `pending`, `in_progress`, `resolved`, and `declined`. |
| P103 | `docs/10-system-design/03-state-and-events/40-project-events/20-registry-and-catalog` | PRESENT | Complete work-item vocabulary is explicitly the same closed four-value set. |
| P110 | `docs/10-system-design/03-state-and-events/40-project-events/20-registry-and-catalog` | PRESENT | `declined` requires a reason and is explicitly terminal. |
| Y046 | `docs/10-system-design/03-state-and-events/40-project-events/40-sync-and-knowledge-events` | PRESENT | `sync.boundary_published` identifies every invalidated target, checkpoint, and PR snapshot. |
| Y078 | `docs/10-system-design/03-state-and-events/40-project-events/40-sync-and-knowledge-events` | PRESENT | Durable invalidation identities explicitly cover target, checkpoint, and PR-snapshot classes. |
| Y064 | `docs/10-system-design/03-state-and-events/40-project-events/40-sync-and-knowledge-events` | PRESENT | Nested `staging: StagingProgress` contains `workspace_id: WorkspaceId`. |
| Y065 | `docs/10-system-design/03-state-and-events/40-project-events/40-sync-and-knowledge-events` | PRESENT | Nested staging projection contains `epochs_total: integer`. |
| Y066 | `docs/10-system-design/03-state-and-events/40-project-events/40-sync-and-knowledge-events` | PRESENT | Nested staging projection contains `epochs_applied: integer`. |
| Y067 | `docs/10-system-design/03-state-and-events/40-project-events/40-sync-and-knowledge-events` | PRESENT | Nested staging projection contains `minor_conflicts_resolved: integer`. |
| Y068 | `docs/10-system-design/03-state-and-events/40-project-events/40-sync-and-knowledge-events` | PRESENT | Nested staging projection contains `conflicts_awaiting_operator: integer`. |
| Y069 | `docs/10-system-design/03-state-and-events/40-project-events/40-sync-and-knowledge-events` | PRESENT | `pr_reconciliation` contains exactly one entry for every open PR series. |
| Y070 | `docs/10-system-design/03-state-and-events/40-project-events/40-sync-and-knowledge-events` | PRESENT | Each reconciliation entry stores `series_id: PrSeriesId`. |
| Y071 | `docs/10-system-design/03-state-and-events/40-project-events/40-sync-and-knowledge-events` | PRESENT | Entry result is the closed enum `clean \| auto_resolved \| needs_operator`. |
| Y072 | `docs/10-system-design/03-state-and-events/40-project-events/40-sync-and-knowledge-events` | PRESENT | Entry `pushed: boolean` starts false and becomes true only on atomic upstream publication. |
| Y074 | `docs/10-system-design/03-state-and-events/40-project-events/40-sync-and-knowledge-events` | PRESENT | Publication stores `remote_application_id?: RemoteApplicationId`, omitted for knowledge-only passes. |
| P006 | `docs/10-system-design/50-ship-and-pr/10-score-and-pr-handoff` | PRESENT | Review outcomes must enter standards and knowledge before a subsequent Run consumes campaign learning. |
| P072 | `docs/10-system-design/50-ship-and-pr/10-score-and-pr-handoff` | PRESENT | Series `target_units` identifies its primary translation units. |
| P073 | `docs/10-system-design/50-ship-and-pr/10-score-and-pr-handoff` | PRESENT | Cross-module edits may join only when serving listed `target_units`. |
| P014 | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | PRESENT | Concurrent Run and PR progress is an explicitly desired future relaxation. |
| P015 | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | PRESENT | “PR workspaces share no mutable state with the session source.” |
| P016 | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | PRESENT | V1 exclusivity is a capacity/simplicity constraint, not a source-truth requirement. |
| P018 | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | PRESENT | Future concurrency must revisit the single dispatch-lease decision. |
| P030 | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | PRESENT | A campaign normally concludes before the next Run produces another batch. |
| P039 | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | PRESENT | PrCampaignState stores `save_point_id: SavePointId`. |
| P043 | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | PRESENT | `publication_policy.batch_size: integer` stores the approved batch size. |
| P045 | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | PRESENT | Campaign state stores `activation_ids: PrPhaseId[]`. |
| P055 | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | PRESENT | `in_review` requires at least one upstream-open series; prepared-only waiting remains `preparing`. |
| P079 | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | PRESENT | PrWorkItem stores operator-readable `summary: string`. |
| P081 | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | PRESENT | ValidationRecord stores `validated_at: timestamp`. |
| P082 | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | PRESENT | ValidationRecord stores `source_revision: SourceRevision`. |
| P083 | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | PRESENT | ValidationRecord stores `result: string`; publication requires `clean`. |
| P101 | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | PRESENT | `closed` means withdrawn or rejected without merging and is terminal. |
| P108 | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | PRESENT | An item may be resolved by a review-thread answer without a pushed revision. |
| P109 | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | PRESENT | Resolved work items are terminal and cannot be claimed again. |
| R075 | `docs/20-implementation/60-ui/20-project-state-workspace/20-state-summary-and-freshness` | PRESENT | Trace/history surfaces render `run.recovered` as a visually distinct recovery marker while preserving event order. |

## Per-lane counts

| Lane | Unique facts credited | Destination checks | PRESENT | STILL-ABSENT | UNFAITHFUL |
| --- | ---: | ---: | ---: | ---: | ---: |
| A | 22 | 22 | 22 | 0 | 0 |
| B | 19 | 19 | 19 | 0 | 0 |
| C | 22 | 22 | 22 | 0 | 0 |
| D | 20 | 21 | 21 | 0 | 0 |
| **Total** | **83** | **84** | **84** | **0** | **0** |

S017 accounts for the extra destination check: lane A verified the design retirement statement and lane D verified the implementation projection alignment.

## INBOUND LINKS

The docs CLI was run against the canonical layers (`docs/00-foundation`, `docs/10-system-design`, and `docs/20-implementation`) for the parent path and every child target:

- `docs/40-new-features/20-project-state-and-events` — no matches.
- Child targets `10-authority-and-actions`, `20-project-session`, `30-run`, `40-pr-campaign`, `50-sync`, `60-knowledge`, and `80-operator-view` under that parent — no matches.

No canonical-corpus inbound links point into the retiring bundle.

VERDICT: CERTIFIED CLEAN
