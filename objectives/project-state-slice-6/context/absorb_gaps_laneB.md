# Gap Absorption Ledger — Lane B

| Fact | Destination doc | Block added or extended |
| --- | --- | --- |
| S041 | `docs/10-system-design/03-state-and-events/05-project-state-and-authority/10-project-state-composition` | Added paragraph `b-doc-local-identity-trace-lead`: universal `TimelineEntry.entry_id: string`. |
| R045 | `docs/10-system-design/03-state-and-events/05-project-state-and-authority/10-project-state-composition` | Added row to structured table `b-struct-local-workflow-trace-fields`: `RunState.active_operation_ids: OperationId[]`. |
| R046 | `docs/10-system-design/03-state-and-events/05-project-state-and-authority/10-project-state-composition` | Added row content to structured table `b-struct-local-workflow-trace-fields`: `RunState.latest_event_sequence: integer`. |
| P046 | `docs/10-system-design/03-state-and-events/05-project-state-and-authority/10-project-state-composition` | Added row to structured table `b-struct-local-workflow-trace-fields`: `PrCampaignState.latest_event_sequence: integer`. |
| Y052 | `docs/10-system-design/03-state-and-events/05-project-state-and-authority/10-project-state-composition` | Added row content to structured table `b-struct-local-workflow-trace-fields`: `SyncState.sync_id: SyncId`. |
| Y080 | `docs/10-system-design/03-state-and-events/05-project-state-and-authority/10-project-state-composition` | Added row content to structured table `b-struct-local-workflow-trace-fields`: `SyncState.latest_event_sequence: integer`. |
| R024 | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | Added field to state-shape `b-run-operational-projections`: `control.terminal_reason?: string`. |
| R026 | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | Added field to state-shape `b-run-operational-projections`: `scheduling.desired_workers: integer`. |
| R028 | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | Added field to state-shape `b-run-operational-projections`: `scheduling.admitted: integer`. |
| R029 | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | Added field to state-shape `b-run-operational-projections`: `scheduling.claimed: integer`. |
| R030 | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | Added field to state-shape `b-run-operational-projections`: `scheduling.running: integer`. |
| R031 | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | Added field to state-shape `b-run-operational-projections`: `progress.baseline_score: number`. |
| R032 | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | Added field to state-shape `b-run-operational-projections`: `progress.confirmed_score: number`. |
| R035 | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | Added field to state-shape `b-run-operational-projections`: `progress.regressed_changes: integer`. |
| R036 | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | Added field to state-shape `b-run-operational-projections`: `integration_queue: IntegrationQueueSummary`. |
| R043 | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | Added field to state-shape `b-run-operational-projections`: `worker_state_ids: WorkerStateId[]`. |
| R044 | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | Added field to state-shape `b-run-operational-projections`: `checkpoint_ids: CheckpointId[]`. |
| R050 | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | Added nested fields to state-shape `b-run-operational-projections`: `integration_queue.pending: integer` and `integration_queue.conflicts: integer`. |
| R004 | `docs/10-system-design/20-running/10-run-director-loop` | Extended paragraph `b-10-run-director-loop-the-scheduler-s-decision-16`: every scheduler decision and worker packet records the consumed `knowledge_revision`. |

## Render Results

| Destination doc | Render | `[a-z]*[a-z]` artifacts |
| --- | --- | --- |
| `docs/10-system-design/03-state-and-events/05-project-state-and-authority/10-project-state-composition` | PASS | 0 |
| `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | PASS | 0 |
| `docs/10-system-design/20-running/10-run-director-loop` | PASS | 0 |

## Deviations

- `20-run-state-and-recovery` had no existing `state-shape` block to extend. One compact assigned-facts-only `state-shape` block, `b-run-operational-projections`, was added.
- No other deviations.
