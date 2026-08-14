# Gap Absorption Ledger — Lane C

| Fact | Destination doc | Block added or extended |
| --- | --- | --- |
| P066 | `docs/10-system-design/03-state-and-events/40-project-events/10-envelope-and-lineage` | Added `PrSeriesState lineage projection`; stored `revision: integer`. |
| P084 | `docs/10-system-design/03-state-and-events/40-project-events/10-envelope-and-lineage` | Extended `PrSeriesState lineage projection`; stored latest accepted update as `updated_at: timestamp`. |
| P085 | `docs/10-system-design/03-state-and-events/40-project-events/10-envelope-and-lineage` | Extended `PrSeriesState lineage projection`; stored the series-root `trace_id: TraceId`. |
| P048 | `docs/10-system-design/03-state-and-events/40-project-events/20-registry-and-catalog` | Added `PR Projection Contracts`; `PrCampaignState.closed_at?: timestamp` is absent while open and present only after closure. |
| P065 | `docs/10-system-design/03-state-and-events/40-project-events/20-registry-and-catalog` | Extended `PR Projection Contracts`; each `PrSeriesState` stores `campaign_id: PrCampaignId`. |
| P076 | `docs/10-system-design/03-state-and-events/40-project-events/20-registry-and-catalog` | Extended `PR Projection Contracts`; each `PrWorkItem` stores `source_kind: string`. |
| P077 | `docs/10-system-design/03-state-and-events/40-project-events/20-registry-and-catalog` | Extended `PR Projection Contracts`; each `PrWorkItem` stores `source_id: string`. |
| P078 | `docs/10-system-design/03-state-and-events/40-project-events/20-registry-and-catalog` | Extended `PR Projection Contracts`; declared the closed `pending`, `in_progress`, `resolved`, `declined` vocabulary. |
| P103 | `docs/10-system-design/03-state-and-events/40-project-events/20-registry-and-catalog` | Absorbed with P078 in the same closed four-value vocabulary statement. |
| P110 | `docs/10-system-design/03-state-and-events/40-project-events/20-registry-and-catalog` | Extended `PR Projection Contracts`; declared `declined` terminal and tied it to a recorded reason. |
| Y046 | `docs/10-system-design/03-state-and-events/40-project-events/40-sync-and-knowledge-events` | Extended the `sync.boundary_published` contract to require identities for every invalidated target, checkpoint, and PR snapshot. |
| Y078 | `docs/10-system-design/03-state-and-events/40-project-events/40-sync-and-knowledge-events` | Absorbed with Y046 in the same required invalidation-identity contract. |
| Y064 | `docs/10-system-design/03-state-and-events/40-project-events/40-sync-and-knowledge-events` | Added `SyncState reconciliation projections`; stored `staging.workspace_id: WorkspaceId`. |
| Y065 | `docs/10-system-design/03-state-and-events/40-project-events/40-sync-and-knowledge-events` | Extended `SyncState reconciliation projections`; stored `staging.epochs_total: integer`. |
| Y066 | `docs/10-system-design/03-state-and-events/40-project-events/40-sync-and-knowledge-events` | Extended `SyncState reconciliation projections`; stored `staging.epochs_applied: integer`. |
| Y067 | `docs/10-system-design/03-state-and-events/40-project-events/40-sync-and-knowledge-events` | Extended `SyncState reconciliation projections`; stored `staging.minor_conflicts_resolved: integer`. |
| Y068 | `docs/10-system-design/03-state-and-events/40-project-events/40-sync-and-knowledge-events` | Extended `SyncState reconciliation projections`; stored `staging.conflicts_awaiting_operator: integer`. |
| Y069 | `docs/10-system-design/03-state-and-events/40-project-events/40-sync-and-knowledge-events` | Extended `SyncState reconciliation projections`; added `pr_reconciliation: PrBranchReconciliation[]` with exactly one entry per open PR series. |
| Y070 | `docs/10-system-design/03-state-and-events/40-project-events/40-sync-and-knowledge-events` | Extended each reconciliation entry with `series_id: PrSeriesId`. |
| Y071 | `docs/10-system-design/03-state-and-events/40-project-events/40-sync-and-knowledge-events` | Extended each reconciliation entry with closed `result: clean \| auto_resolved \| needs_operator`. |
| Y072 | `docs/10-system-design/03-state-and-events/40-project-events/40-sync-and-knowledge-events` | Extended each reconciliation entry with `pushed: boolean` and its publication-only false-to-true transition. |
| Y074 | `docs/10-system-design/03-state-and-events/40-project-events/40-sync-and-knowledge-events` | Extended `SyncState reconciliation projections`; added optional `publication.remote_application_id: RemoteApplicationId`, omitted for knowledge-only passes. |

## Render Results

| Destination doc | Result | Emphasis artifacts |
| --- | --- | --- |
| `docs/10-system-design/03-state-and-events/40-project-events/10-envelope-and-lineage` | PASS — docs CLI render exited 0. | 0 |
| `docs/10-system-design/03-state-and-events/40-project-events/20-registry-and-catalog` | PASS — docs CLI render exited 0. | 0 |
| `docs/10-system-design/03-state-and-events/40-project-events/40-sync-and-knowledge-events` | PASS — docs CLI render exited 0. | 0 |

## Deviations

- `20-registry-and-catalog` had no compatible destination state-shape, so the assigned projection contracts were added as compact design narrative without changing catalog rows.
- `40-sync-and-knowledge-events` had no existing `SyncState` state-shape, so one compact projection block was added. Y046/Y078 and P078/P103 were consolidated to avoid duplicate contracts.
- No dated decision callouts were changed. No source bundles were changed.
