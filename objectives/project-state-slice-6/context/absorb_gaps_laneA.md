# Gap Absorption Ledger — Lane A

| Fact | Destination doc | Block added or extended |
| --- | --- | --- |
| S036 | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | Added `psa-session-state-shape`: exact `SessionState.status` domain `active | closing | closed`. |
| S042 | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | Added `psa-session-state-shape`: `TimelineEntry.occurred_at: timestamp`. |
| S043 | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | Added `psa-session-state-shape`: creation-order `workflow_ids: WorkflowId[]`. |
| R023 | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | Added `psa-run-state-shape`: optional stored `RunControl.stop_request`. |
| R025 | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | Added `psa-run-state-shape`: nullable `RunScheduling.active_epoch_id`. |
| R037 | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | Added `psa-run-state-shape`: ordered `epoch_ids: EpochId[]`. |
| R038 | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | Added `psa-run-state-shape`: timeline-order `remote_application_ids: RemoteApplicationId[]`. |
| R049 | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | Added `psa-run-state-shape`: exact `StopRequest { target: sync, mode: finish_epoch }` pairing. |
| P032 | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | Extended `psa-lifecycle-body`: dormant review during Run is supported but not the expected operating norm. |
| P035 | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | Added `psa-campaign-state-shape`: campaign `session_id: SessionId`. |
| P040 | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | Added `psa-campaign-state-shape`: captured `source_anchor.source_revision: SourceRevision`. |
| Y054 | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | Added `psa-sync-state-shape`: sync `session_id: SessionId`. |
| Y057 | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | Added `psa-sync-state-shape`: durable `intake: SyncIntake` captured at canonical pre-start observation. |
| Y063 | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | Added `psa-sync-state-shape`: nullable `staging: StagingProgress | null`. |
| Y073 | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | Added `psa-sync-state-shape`: nullable `publication: PublicationRecord | null` with before/after rule. |
| S022 | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | Extended `b-sync-slice3-21`: remote-boundary transaction or commit failure enters durable `blocked` with a visible blocker and cannot publish. |
| S017 | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | Extended `b-session-flow-lineage-decision`: dated decision explicitly retires the old long-lived campaign meaning. |
| R033 | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | Extended `b-01-session-operating-flow-this-keeps-the-shape-sim-52`: `RunProgress.tentative_changes` count. |
| R034 | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | Extended `b-01-session-operating-flow-this-keeps-the-shape-sim-52`: `RunProgress.confirmed_changes` count. |
| R074 | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | Extended `b-01-session-operating-flow-this-keeps-the-shape-sim-52`: partial-epoch history retention. |
| Y021 | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | Extended `b-sync-slice3-11`: most-clean, agent-resolved semantic, and mechanical auto-resolution distinction. |
| Y039 | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | Extended `b-sync-slice3-15`: build-failure repair during staged reconciliation. |

## Render Results

| Destination | Result |
| --- | --- |
| `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | PASS — docs CLI render succeeded; zero lowercase emphasis artifacts. |
| `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | PASS — docs CLI render succeeded; zero lowercase emphasis artifacts. |

## Deviations

None.
