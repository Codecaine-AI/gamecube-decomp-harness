# Remaining Feature-Doc Absorption Audit

Scope: fact-level audit of the remaining project-state-and-events feature-doc children against canonical destinations in `docs/10-system-design/**` and `docs/20-implementation/**`. Sources and destinations were read only through the docs CLI `render`; canonical discovery used the docs CLI `grep`.

Legend: **COVERED** means the complete fact is present canonically, including a noted cross-link; **PARTIAL** means only part of the fact or a materially different vocabulary is canonical; **MISSING** means no canonical destination preserves the fact.

## `20-project-session`

| Fact | Source anchor | Atomic fact | Canonical destination | Verdict |
| --- | --- | --- | --- | --- |
| S001 | opening ¶1 | One durable session owns the project worktree and head lineage from opening baseline sync through explicit close. | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | COVERED |
| S002 | opening ¶1 | Run, PR, and sync are durable child workflows of the active session. | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | COVERED |
| S003 | opening ¶1 | The dispatch lease arbitrates authority among child workflows; session ownership does not replace it. | CROSS-LINKED → `docs/10-system-design/03-state-and-events/05-project-state-and-authority/20-dispatch-authority-and-handoffs` | COVERED |
| S004 | opening ¶1 | The ordered session timeline is the truth of head movement and evidence boundaries: epochs, remote applications, PR phases, and save points. | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | COVERED |
| S005 | opening ¶1 | Recovery reads ProjectSession, not events/logs, to determine current head and its lineage. | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | COVERED |
| S006 | decision “a durable session container owns head lineage” (2026-08-11) | Durable ProjectSession sits above Run/PR/sync and owns `head_revision`. | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | PARTIAL |
| S007 | same decision | `RunState.head_revision` is a mirror used by scheduler planning, not the canonical owner. | CROSS-LINKED → `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | COVERED |
| S008 | Between-Run Lineage, bullet 1 | Sync records `remote_application` on the session even with no active run; an active run also records/references the applied boundary. | CROSS-LINKED → `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | COVERED |
| S009 | Between-Run Lineage, bullet 2 + close decision | No automatic transition closes a session; close is an explicit operator action. | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | COVERED |
| S010 | close decision (2026-08-11) | The prior session must close before the next baseline sync opens a successor on a freshly re-anchored baseline/worktree. | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | COVERED |
| S011 | Close Semantics ¶1 | Close is valid only when no workflow holds the dispatch lease. | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | COVERED |
| S012 | Close Semantics ¶1 | If close would orphan unshipped local work, it is blocked or requires confirmation plus a named save point. | CROSS-LINKED → `docs/10-system-design/03-state-and-events/05-project-state-and-authority/30-operator-action-contract` | COVERED |
| S013 | Close Semantics, “absorbed point” bullet 1 | Natural close posture: shipped PRs merged upstream, sync rebased them in, and local delta near zero. | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | MISSING |
| S014 | Close Semantics, “absorbed point” bullet 2 | The system neither detects nor enforces that natural absorbed point. | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | COVERED |
| S015 | Close Semantics, “absorbed point” bullet 3 | A session may remain open indefinitely and continue accepting workflows without harm. | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | COVERED |
| S016 | decision “head lineage is transactional; save points are evidence anchors” (2026-08-12) | Timeline has two role classes with different failure policy: commit-creating head movement vs evidence anchors on existing commits. | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | COVERED |
| S017 | same decision | ProjectSession supersedes the old “one canonical campaign per project”; “campaign” now means only PR campaign. | — | MISSING |
| S018 | Lineage and Evidence Failure Policies ¶1 | Exactly `epoch_completed` and `remote_application` are the head-advancing timeline kinds. | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | COVERED |
| S019 | same, bullet 1 + table `epoch_completed` | `epoch_completed` exists iff its integration commit exists and is recorded atomically with it. | `docs/10-system-design/10-intake-and-sessions/30-save-points` | COVERED |
| S020 | same, bullet 1 + table `remote_application` | `remote_application` exists iff the published boundary commit exists and is transactional with sync publication. | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | COVERED |
| S021 | same, bullet 2 + table `epoch_completed` | Failure to durably create the epoch commit/entry fails the epoch boundary loudly. | `docs/10-system-design/10-intake-and-sessions/30-save-points` | COVERED |
| S022 | same, bullet 2 + table `remote_application` | Failure of the remote-application commit/entry durable step fails the sync boundary loudly. | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | PARTIAL |
| S023 | Save-points bullets + table | A save point is an evidence anchor pinned to an existing commit. | `docs/10-system-design/10-intake-and-sessions/30-save-points` | COVERED |
| S024 | Save-points bullet 1 + table | A save point never creates the commit carrying the work and never advances head. | `docs/10-system-design/10-intake-and-sessions/30-save-points` | COVERED |
| S025 | Save-points bullet 2 | Save-point evidence includes reports, board snapshot, and headline score. | `docs/10-system-design/10-intake-and-sessions/30-save-points` | COVERED |
| S026 | Save-points bullet 3 | Boundary hooks and manual creation make save points frequent/available at defined boundaries. | `docs/10-system-design/10-intake-and-sessions/30-save-points` | COVERED |
| S027 | Save-points bullet 4 | Save-point failure raises a durable session blocker and staleness flag instead of a silent log. | `docs/10-system-design/10-intake-and-sessions/30-save-points` | COVERED |
| S028 | Save-points bullet 4 + table | Save-point failure does not block or roll back the triggering boundary. | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | COVERED |
| S029 | Save-points bullet 4 | This strict visibility policy was motivated by the July 2026 silent boundary-commit failure. | — | MISSING |
| S030 | Consequences bullet 1 | Dashboard “where we are” reads latest save point, `aheadOfBase`, and `stale` from session-backed durable state. | `docs/10-system-design/10-intake-and-sessions/30-save-points` | COVERED |
| S031 | Consequences bullet 2 | Intake/session pages are to be repointed to session lineage/evidence. | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | COVERED |
| S032 | Consequences bullet 3 | Splitting lineage from evidence gives each class its own failure policy and improves controllability. | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | COVERED |
| S033 | `SessionState.session_id` | Session state has stable `session_id: SessionId`. | CROSS-LINKED → `docs/10-system-design/03-state-and-events/05-project-state-and-authority/10-project-state-composition` | COVERED |
| S034 | `SessionState.project_id` | Session state carries owning `project_id: ProjectId`. | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | COVERED |
| S035 | `SessionState.revision` | Session state carries monotonic integer `revision`. | CROSS-LINKED → `docs/10-system-design/03-state-and-events/05-project-state-and-authority/10-project-state-composition` | COVERED |
| S036 | `SessionState.status` | Session lifecycle vocabulary is exactly `active \| closing \| closed`; only one may be active per project. | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | PARTIAL |
| S037 | `SessionState.original_baseline_revision` | Opening baseline revision is immutable. | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | COVERED |
| S038 | `SessionState.head_revision` | `head_revision` is canonical session head and only epoch integrations / remote applications advance it. | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | COVERED |
| S039 | `SessionState.timeline` | `timeline` is the ordered head-lineage/evidence record. | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | COVERED |
| S040 | `TimelineEntry.entry_kind` | Entry-kind vocabulary is `epoch_completed \| remote_application \| pr_phase \| save_point`. | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | COVERED |
| S041 | `TimelineEntry.entry_id` | Every timeline entry has string `entry_id`. | CROSS-LINKED → `docs/10-system-design/03-state-and-events/40-project-events/20-registry-and-catalog` | PARTIAL |
| S042 | `TimelineEntry.occurred_at` | Every timeline entry has timestamp `occurred_at`. | — | MISSING |
| S043 | `SessionState.workflow_ids` | Session records child workflow IDs as `WorkflowId[]` in creation order. | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | PARTIAL |
| S044 | `SessionState.created_at` | Session state has creation timestamp. | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | COVERED |
| S045 | `SessionState.closed_at` | Session state has optional close-completion timestamp. | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | COVERED |
| S046 | `SessionState.trace_id` | Session state carries root `TraceId`. | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | COVERED |
| S047 | `SessionState.blockers` | Session state carries durable `Blocker[]`. | CROSS-LINKED → `docs/10-system-design/03-state-and-events/05-project-state-and-authority/10-project-state-composition` | COVERED |
| S048 | Timeline table `pr_phase` | `pr_phase` does not advance head and is durably written at PR-campaign lease acquisition/release. | CROSS-LINKED → `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | COVERED |

## `30-run`

| Fact | Source anchor | Atomic fact | Canonical destination | Verdict |
| --- | --- | --- | --- | --- |
| R001 | opening ¶1 | A run is one autonomous scheduling effort. | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | COVERED |
| R002 | opening ¶1 | Pause, resume, recovery, and sync retain the run identity. | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | COVERED |
| R003 | opening ¶1 | Background knowledge may advance while a run is active. | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery`; `docs/10-system-design/03-state-and-events/05-project-state-and-authority/30-operator-action-contract` | PARTIAL |
| R004 | opening ¶1 | Scheduler decisions and worker packets record the knowledge revision actually consumed. | — | MISSING |
| R005 | decision “runs survive sync via remote-application boundaries” (2026-08-11) | Sync does not close the interrupted run; run identity and original baseline stay fixed while upstream enters through a remote-application boundary. | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | COVERED |
| R006 | How a Run Survives Sync, bullet 1 | Sync first rebases the session worktree onto new upstream work. | CROSS-LINKED (superseded) → `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | PARTIAL |
| R007 | How a Run Survives Sync, bullet 2 | Reconciliation passes through completed epoch history and resolves conflicts against the prior session lineage. | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | PARTIAL |
| R008 | How a Run Survives Sync, bullet 3 | The published application is an epoch-like boundary after prior run history and carries its own upstream score delta. | `docs/10-system-design/10-intake-and-sessions/30-save-points` | PARTIAL |
| R009 | Run continuity, bullet 1 | `run_id` and `base_revision` remain fixed; the session continues and the scheduler replans against the new head. | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery`; `docs/10-system-design/20-running/05-run-state` | COVERED |
| R010 | Run continuity, bullet 2 | Run `head_revision` mirrors the owning session head. | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | COVERED |
| R011 | Run continuity, bullet 2 | Upstream source work advances the head only through a published `remote_application` boundary. | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | COVERED |
| R012 | Run continuity, bullet 3 | The boundary belongs to the session timeline; an active run references it, while sync without an active run attaches it only to the session. | `docs/10-system-design/20-running/05-run-state`; `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | COVERED |
| R013 | decision “head_revision mirrors the session head at every advance” (2026-08-13) | Epoch integrations and remote applications both advance the session/run head mirror; this supersedes remote-only phrasing. | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery`; `docs/10-system-design/20-running/05-run-state` | PARTIAL |
| R014 | `RunState.run_id` | `run_id: RunId` is the stable run identity. | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | COVERED |
| R015 | `RunState.project_id` | `project_id: ProjectId` records the owning project. | CROSS-LINKED → `docs/10-system-design/03-state-and-events/05-project-state-and-authority/10-project-state-composition` | COVERED |
| R016 | `RunState.session_id` | `session_id: SessionId` identifies the owning session container. | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | COVERED |
| R017 | `RunState.revision` | `revision: integer` is the accepted-state version. | CROSS-LINKED → `docs/10-system-design/03-state-and-events/05-project-state-and-authority/10-project-state-composition` | COVERED |
| R018 | `RunState.inputs.base_revision` | `base_revision` is the immutable original baseline. | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery`; `docs/10-system-design/20-running/05-run-state` | COVERED |
| R019 | `RunState.inputs.policy_revision` | `policy_revision` is immutable after activation. | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | COVERED |
| R020 | `RunState.inputs.starting_knowledge_revision` | The run records a fixed starting knowledge revision. | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery`; `docs/10-system-design/20-running/05-run-state` | COVERED |
| R021 | `RunState.inputs.configuration_snapshot` | RunInputs contain an immutable configuration snapshot. | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | COVERED |
| R022 | `RunState.head_revision` comment | `head_revision` equals `base_revision` until only a remote-application boundary advances it. | CROSS-LINKED (superseded) → `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | PARTIAL |
| R023 | `RunState.control.stop_request` | Control may contain an optional `StopRequest`. | — | MISSING |
| R024 | `RunState.control.terminal_reason` | Control may contain an optional terminal reason. | `docs/10-system-design/03-state-and-events/40-project-events/20-registry-and-catalog` | PARTIAL |
| R025 | `RunState.scheduling.active_epoch_id` | Scheduling stores nullable `active_epoch_id`. | — | MISSING |
| R026 | `RunState.scheduling.desired_workers` | Scheduling stores desired worker count. | `docs/10-system-design/03-state-and-events/40-project-events/20-registry-and-catalog` | PARTIAL |
| R027 | `RunState.scheduling.scheduler_condition` | Scheduler condition vocabulary is `idle`, `planning`, `dispatching`, `waiting`, `boundary`, or `blocked`. | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery`; `docs/10-system-design/20-running/05-run-state` | COVERED |
| R028 | `RunState.scheduling.admitted` | Scheduling stores an aggregate admitted count. | — | MISSING |
| R029 | `RunState.scheduling.claimed` | Scheduling stores an aggregate claimed count. | — | MISSING |
| R030 | `RunState.scheduling.running` | Scheduling stores an aggregate running count. | — | MISSING |
| R031 | `RunState.progress.baseline_score` | Progress stores `baseline_score`. | — | MISSING |
| R032 | `RunState.progress.confirmed_score` | Progress stores `confirmed_score`. | — | MISSING |
| R033 | `RunState.progress.tentative_changes` | Progress stores tentative-change count. | — | MISSING |
| R034 | `RunState.progress.confirmed_changes` | Progress stores confirmed-change count. | — | MISSING |
| R035 | `RunState.progress.regressed_changes` | Progress stores regressed-change count. | — | MISSING |
| R036 | `RunState.integration_queue` | RunState contains an `IntegrationQueueSummary`. | — | MISSING |
| R037 | `RunState.epoch_ids` | RunState stores IDs of its epochs. | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | PARTIAL |
| R038 | `RunState.remote_application_ids` | RunState stores remote-application IDs in timeline order. | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery`; `docs/10-system-design/20-running/05-run-state` | PARTIAL |
| R039 | `remote_application_ids` comment | Each remote application records the prior head. | `docs/10-system-design/03-state-and-events/40-project-events/20-registry-and-catalog`; `docs/10-system-design/10-intake-and-sessions/30-save-points` | COVERED |
| R040 | `remote_application_ids` comment | Each remote application records the applied upstream/new head revision. | `docs/10-system-design/03-state-and-events/40-project-events/20-registry-and-catalog`; `docs/10-system-design/03-state-and-events/40-project-events/40-sync-and-knowledge-events` | COVERED |
| R041 | `remote_application_ids` comment | Each remote application records resolved conflicts. | `docs/10-system-design/03-state-and-events/40-project-events/20-registry-and-catalog` | COVERED |
| R042 | `remote_application_ids` comment | Each remote application records a nullable score delta. | `docs/10-system-design/03-state-and-events/40-project-events/20-registry-and-catalog`; `docs/10-system-design/10-intake-and-sessions/30-save-points` | COVERED |
| R043 | `RunState.worker_state_ids` | RunState stores worker-state IDs. | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | PARTIAL |
| R044 | `RunState.checkpoint_ids` | RunState stores checkpoint IDs. | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | PARTIAL |
| R045 | `RunState.active_operation_ids` | RunState stores active operation IDs. | CROSS-LINKED → `docs/10-system-design/03-state-and-events/05-project-state-and-authority/10-project-state-composition` | PARTIAL |
| R046 | `RunState.latest_event_sequence` | RunState stores the latest event sequence. | CROSS-LINKED → `docs/10-system-design/03-state-and-events/05-project-state-and-authority/10-project-state-composition` | PARTIAL |
| R047 | `RunState.blockers` | RunState carries blockers. | CROSS-LINKED → `docs/10-system-design/03-state-and-events/05-project-state-and-authority/10-project-state-composition` | COVERED |
| R048 | JSON `inputs.configuration_snapshot` | The example gives configuration snapshot an `epoch_size` field. | — | MISSING |
| R049 | JSON `control.stop_request` | A sync handoff may request stop mode `finish_epoch`. | `docs/10-system-design/03-state-and-events/05-project-state-and-authority/30-operator-action-contract`; `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | PARTIAL |
| R050 | JSON `integration_queue` | IntegrationQueueSummary has `pending` and `conflicts` counts. | — | MISSING |
| R051 | Run status `draft` meaning | `draft` means inputs or configuration are incomplete. | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | COVERED |
| R052 | Run status `draft` invariant | No scheduler or worker may start while draft. | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | COVERED |
| R053 | Run status `ready` meaning | `ready` means required inputs are captured and readiness gates pass. | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | COVERED |
| R054 | Run status `ready` invariant | Activation cannot alter the bound RunInputs. | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | COVERED |
| R055 | Run status `active` meaning | `active` means autonomous scheduling authority is enabled. | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | COVERED |
| R056 | Run status `active` invariant | An active run holds the project dispatch lease. | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | COVERED |
| R057 | Run status `draining` meaning | `draining` disables new admission while existing work settles. | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | COVERED |
| R058 | Run status `draining` invariant | No new claims are created while draining. | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | COVERED |
| R059 | Run status `paused` meaning | `paused` disables scheduling but remains resumable. | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | COVERED |
| R060 | Run status `paused` invariant | Work has settled or explicit recovery recorded cancellations. | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | COVERED |
| R061 | Run status `completed` meaning | `completed` means autonomous work closed normally. | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | COVERED |
| R062 | Run status `completed` invariant | Completed is terminal and cannot resume or admit work. | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | COVERED |
| R063 | Run status `failed` meaning | `failed` means the runner cannot continue safely. | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | COVERED |
| R064 | Run status `failed` invariant | Recovery returns the same run to paused; failed is not terminal. | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | COVERED |
| R065 | Run status `cancelled` meaning | `cancelled` means the operator abandoned the run. | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | COVERED |
| R066 | Run status `cancelled` invariant | Evidence remains readable and the run cannot resume. | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | COVERED |
| R067 | decision “failed runs resume in place” (2026-08-11) | Recovery never creates a successor run; only completed and cancelled are terminal. | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery`; `docs/10-system-design/20-running/05-run-state` | COVERED |
| R068 | How In-Place Recovery Works, bullet 1 | Recovery settles or cancels orphaned claims and operations. | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery`; `docs/10-system-design/20-running/05-run-state` | COVERED |
| R069 | How In-Place Recovery Works, bullet 1 | `run.recovered` names every cancelled claim and operation. | `docs/10-system-design/03-state-and-events/40-project-events/20-registry-and-catalog` | COVERED |
| R070 | How In-Place Recovery Works, bullet 1 | System recovery performs failed → paused on the existing run identity. | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | COVERED |
| R071 | How In-Place Recovery Works, bullet 2 | The operator subsequently resumes paused → active through normal lease acquisition. | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery`; `docs/10-system-design/03-state-and-events/05-project-state-and-authority/30-operator-action-contract` | COVERED |
| R072 | How In-Place Recovery Works, bullet 2 | Only completed and cancelled are terminal statuses. | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | COVERED |
| R073 | Recovery continuity, bullet 1 | `run_id` persists across every interruption. | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | COVERED |
| R074 | Recovery continuity, bullet 2 | Recovery history retains cancelled claims and partial epochs. | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | PARTIAL |
| R075 | Recovery continuity, bullet 3 | Trace and UI must prominently distinguish the recovery point from normal history. | — | MISSING |
| R076 | Scheduler condition `idle` | `idle` means no scheduler operation is executing. | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | COVERED |
| R077 | Scheduler condition `planning` | `planning` means candidate evidence is becoming an admission decision. | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | COVERED |
| R078 | Scheduler condition `dispatching` | `dispatching` means admitted work is being assigned to capacity. | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | COVERED |
| R079 | Scheduler condition `waiting` | `waiting` means the active run sleeps for a durable wake event. | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | COVERED |
| R080 | Scheduler condition `boundary` | `boundary` means confirmation, integration, report refresh, or save-point work is executing. | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | COVERED |
| R081 | Scheduler condition `blocked` | `blocked` means progress requires recovery or operator action. | `docs/10-system-design/03-state-and-events/20-run-state-and-recovery` | COVERED |

## PR Campaign

| Fact | Source anchor | Atomic fact | Canonical destination | Verdict |
| --- | --- | --- | --- | --- |
| P001 | opening paragraph | One campaign converts one stable point into a set of reviewable series and owns them through upstream review. | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | COVERED |
| P002 | opening paragraph | The campaign is durable across long external review latency and is mostly dormant. | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | COVERED |
| P003 | opening paragraph | Remote observation may advance series in the background. | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | COVERED |
| P004 | opening paragraph | Feedback ingestion may advance durable PR state in the background. | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | COVERED |
| P005 | opening paragraph | Publication, fixing, and validation execute only in lease-holding activations. | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | COVERED |
| P006 | opening paragraph | Review outcomes are processed into standards and knowledge before the next run consumes them. | CROSS-LINKED → `docs/10-system-design/40-knowledge/70-execution-classes-and-jobs/10-source-classification`; `docs/10-system-design/40-knowledge/30-knowledge-stores/15-knowledge-intake`; `docs/10-system-design/50-ship-and-pr/10-score-and-pr-handoff` | PARTIAL |
| P007 | decision “PR work is an operator-entered phase, never a preemption” (2026-08-11) | PR work is operator-entered and never preempts a run. | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | COVERED |
| P008 | decision “PR work is an operator-entered phase, never a preemption” (2026-08-11) | Review feedback arriving during an active run is ingested immediately as durable work items. | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | COVERED |
| P009 | decision “PR work is an operator-entered phase, never a preemption” (2026-08-11) | Ingested PR work is surfaced in the operator projection during the run. | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | PARTIAL |
| P010 | decision “PR work is an operator-entered phase, never a preemption” (2026-08-11) | Fixer execution waits for operator activation. | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | COVERED |
| P011 | decision “PR work is an operator-entered phase, never a preemption” (2026-08-11) | PR authority normally follows run completion. | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | COVERED |
| P012 | decision “PR work is an operator-entered phase, never a preemption” (2026-08-11) | Mid-run PR entry requires explicit handoff and drains Run at the current epoch boundary. | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | COVERED |
| P013 | How PR Work Yields to a Run | The normal operating sequence is useful Run → stable point → PR split → roughly week-long review. | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | PARTIAL |
| P014 | How PR Work Yields to a Run | Concurrent Run processing and lease-holding PR work is an explicitly desired future relaxation. | `docs/10-system-design/03-state-and-events/05-project-state-and-authority/20-dispatch-authority-and-handoffs` | MISSING |
| P015 | How PR Work Yields to a Run | PR workspaces share no mutable state with the session source. | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | PARTIAL |
| P016 | How PR Work Yields to a Run | Single-active-workflow is a worker-capacity/simplicity constraint, not a source-truth requirement. | `docs/10-system-design/03-state-and-events/05-project-state-and-authority/20-dispatch-authority-and-handoffs` | MISSING |
| P017 | How PR Work Yields to a Run | v1 keeps exactly one dispatch-lease holder. | `docs/10-system-design/03-state-and-events/05-project-state-and-authority/20-dispatch-authority-and-handoffs` | COVERED |
| P018 | How PR Work Yields to a Run | Any later PR/Run concurrency must explicitly revisit the one-lease decision. | `docs/10-system-design/03-state-and-events/05-project-state-and-authority/20-dispatch-authority-and-handoffs` | MISSING |
| P019 | decision “one durable PrCampaign spans the review cycle” (2026-08-12) | One durable PrCampaign spans the review cycle. | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | COVERED |
| P020 | decision “one durable PrCampaign spans the review cycle” (2026-08-12) | Each split of a stable point creates one durable campaign. | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | COVERED |
| P021 | decision “one durable PrCampaign spans the review cycle” (2026-08-12) | v1 allows at most one open campaign per project. | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | COVERED |
| P022 | decision “one durable PrCampaign spans the review cycle” (2026-08-12) | Campaign lifetime spans the full preparation/publication/review/revision/terminal cycle. | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | COVERED |
| P023 | decision “one durable PrCampaign spans the review cycle” (2026-08-12) | Campaign holds dispatch only in operator-entered publish/fix/validate activations. | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | COVERED |
| P024 | Why One Campaign at a Time | Remote observation and feedback ingestion advance an inactive campaign; activations publish, fix, or validate. | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | COVERED |
| P025 | Why One Campaign at a Time | Each lease-holding activation is recorded as a `pr_phase` session-timeline entry. | CROSS-LINKED → `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking`; `docs/10-system-design/10-intake-and-sessions/30-save-points` | COVERED |
| P026 | Why One Campaign at a Time | Publication is explicitly operator-gated. | CROSS-LINKED → `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking`; `docs/10-system-design/03-state-and-events/05-project-state-and-authority/30-operator-action-contract` | COVERED |
| P027 | Why One Campaign at a Time | Publication batches are around/default four series to avoid swamping reviewers. | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | COVERED |
| P028 | Why One Campaign at a Time | Series outside the approved batch remain prepared until explicit operator go. | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | COVERED |
| P029 | Why One Campaign at a Time | Review outcomes become standards and knowledge. | CROSS-LINKED → `docs/10-system-design/40-knowledge/30-knowledge-stores/15-knowledge-intake`; `docs/10-system-design/50-ship-and-pr/10-score-and-pr-handoff` | COVERED |
| P030 | Why One Campaign at a Time | A campaign normally concludes before the next Run produces another batch. | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | MISSING |
| P031 | Why One Campaign at a Time | Overlapping campaigns would interleave learning from two baselines. | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | PARTIAL |
| P032 | Why One Campaign at a Time | Runs during an open campaign are possible only through explicit dispatch handoff and are not expected. | CROSS-LINKED → `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture`; `docs/10-system-design/03-state-and-events/05-project-state-and-authority/20-dispatch-authority-and-handoffs` | PARTIAL |
| P033 | `PrCampaignState.campaign_id` | `campaign_id: PrCampaignId` is the campaign’s stable identity field. | `docs/10-system-design/03-state-and-events/05-project-state-and-authority/10-project-state-composition` | PARTIAL |
| P034 | `PrCampaignState.project_id` | `project_id: ProjectId` identifies the owning project. | `docs/10-system-design/03-state-and-events/05-project-state-and-authority/10-project-state-composition` | COVERED |
| P035 | `PrCampaignState.session_id` | `session_id: SessionId` identifies the owning session container. | CROSS-LINKED → `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking`; `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | PARTIAL |
| P036 | `PrCampaignState.revision` | `revision: integer` is the campaign state revision. | `docs/10-system-design/03-state-and-events/05-project-state-and-authority/10-project-state-composition` | COVERED |
| P037 | `PrCampaignState.status` | `status` uses exactly `preparing \| in_review \| working \| completed \| abandoned`. | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | COVERED |
| P038 | `PrCampaignState.source_anchor` | Campaign stores a `SourceAnchor` for the stable point from which it was split. | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | COVERED |
| P039 | `PrCampaignState.source_anchor.save_point_id` | Source anchor stores the stable `SavePointId`. | CROSS-LINKED → `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking`; `docs/10-system-design/10-intake-and-sessions/30-save-points` | PARTIAL |
| P040 | `PrCampaignState.source_anchor.source_revision` | Source anchor stores the session-head `SourceRevision` at the split. | CROSS-LINKED → `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking`; `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | PARTIAL |
| P041 | `PrCampaignState.source_anchor` comment | The source anchor is immutable; sync invalidation creates blockers rather than rewriting it. | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | COVERED |
| P042 | `PrCampaignState.publication_policy` | Campaign stores a publication policy that gates opening per operator-approved batch; preparation alone never opens series. | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | COVERED |
| P043 | `PrCampaignState.publication_policy.batch_size` | `batch_size: integer` is the number opened in each approved batch. | CROSS-LINKED → `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking`; `docs/10-system-design/03-state-and-events/40-project-events/20-registry-and-catalog` | PARTIAL |
| P044 | `PrCampaignState.series_ids` | `series_ids: PrSeriesId[]` contains every published and unpublished series in batch order. | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | PARTIAL |
| P045 | `PrCampaignState.activation_ids` | `activation_ids: PrPhaseId[]` lists lease-holding activations, each mirrored as `pr_phase` timeline evidence. | CROSS-LINKED → `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking`; `docs/10-system-design/10-intake-and-sessions/30-save-points` | PARTIAL |
| P046 | `PrCampaignState.latest_event_sequence` | `latest_event_sequence: integer` is stored on campaign state. | `docs/10-system-design/03-state-and-events/05-project-state-and-authority/10-project-state-composition` | MISSING |
| P047 | `PrCampaignState.created_at` | `created_at: timestamp` records campaign creation. | `docs/10-system-design/03-state-and-events/05-project-state-and-authority/10-project-state-composition` | COVERED |
| P048 | `PrCampaignState.closed_at` | `closed_at?: timestamp` is present only after closure. | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | MISSING |
| P049 | `PrCampaignState.trace_id` | `trace_id: TraceId` roots campaign tracing. | `docs/10-system-design/03-state-and-events/05-project-state-and-authority/10-project-state-composition` | COVERED |
| P050 | `PrCampaignState.blockers` | `blockers: Blocker[]` stores campaign blockers. | `docs/10-system-design/03-state-and-events/05-project-state-and-authority/10-project-state-composition` | COVERED |
| P051 | PrCampaignState JSON example | The example demonstrates an open `in_review` campaign anchored at save-point-12/source revision upstream-9ba1, batch size four, five ordered series, two activation IDs, trace/sequence, and no `closed_at`. | CROSS-LINKED → `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking`; `docs/10-system-design/03-state-and-events/05-project-state-and-authority/10-project-state-composition` | PARTIAL |
| P052 | PR campaign status values | The campaign status vocabulary is the complete five-state set `preparing`, `in_review`, `working`, `completed`, `abandoned`. | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | COVERED |
| P053 | campaign status `preparing` meaning | In `preparing`, series are cut and validated from the source anchor while nothing is open upstream. | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | COVERED |
| P054 | campaign status `preparing` invariant | No series in a `preparing` campaign has an upstream PR. | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | COVERED |
| P055 | campaign status `in_review` meaning | `in_review` requires at least one upstream-open series and no activation holding the lease. | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | PARTIAL |
| P056 | campaign status `in_review` invariant | Only background remote observation and feedback ingestion may advance series while campaign is `in_review`. | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | COVERED |
| P057 | campaign status `working` meaning | `working` means an activation holds the dispatch lease and publish/fix/validate work may execute. | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | COVERED |
| P058 | campaign status `working` invariant | Every checkout/workspace mutation carries the current lease ID. | CROSS-LINKED → `docs/10-system-design/03-state-and-events/05-project-state-and-authority/20-dispatch-authority-and-handoffs`; `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | COVERED |
| P059 | campaign status `completed` meaning | Completion requires every series merged or closed and explicit operator closure. | CROSS-LINKED → `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking`; `docs/10-system-design/03-state-and-events/05-project-state-and-authority/30-operator-action-contract` | COVERED |
| P060 | campaign status `completed` invariant | `completed` is terminal; no series can be published or revised. | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | COVERED |
| P061 | campaign status `abandoned` meaning | `abandoned` is entered only by explicit operator abandonment. | CROSS-LINKED → `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking`; `docs/10-system-design/03-state-and-events/05-project-state-and-authority/30-operator-action-contract` | COVERED |
| P062 | campaign status `abandoned` invariant | `abandoned` is terminal. | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | COVERED |
| P063 | campaign status `abandoned` invariant | Unpublished series remain readable evidence after abandonment. | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | COVERED |
| P064 | `PrSeriesState.series_id` | `series_id: PrSeriesId` is the stable series identity field. | `docs/10-system-design/03-state-and-events/40-project-events/10-envelope-and-lineage` | PARTIAL |
| P065 | `PrSeriesState.campaign_id` | `campaign_id: PrCampaignId` links each series to its containing campaign. | CROSS-LINKED → `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking`; `docs/10-system-design/03-state-and-events/40-project-events/10-envelope-and-lineage` | PARTIAL |
| P066 | `PrSeriesState.revision` | `revision: integer` versions each series state. | `docs/10-system-design/03-state-and-events/40-project-events/10-envelope-and-lineage` | PARTIAL |
| P067 | `PrSeriesState.batch_index` | `batch_index: integer` records publication-batch membership. | `docs/10-system-design/03-state-and-events/40-project-events/20-registry-and-catalog` | COVERED |
| P068 | `PrSeriesState.batch_index` comment | Batches open in index order and only on explicit operator go. | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | COVERED |
| P069 | `PrSeriesState.status` | `status` uses exactly `prepared \| published \| changes_requested \| revising \| approved \| merged \| closed`. | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | COVERED |
| P070 | `PrSeriesState.branch` | `branch: BranchRef` records the series branch. | CROSS-LINKED → `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking`; `docs/10-system-design/03-state-and-events/40-project-events/20-registry-and-catalog` | PARTIAL |
| P071 | `PrSeriesState.upstream_pr_number` | `upstream_pr_number?: integer` is absent before publication and recorded at publication. | CROSS-LINKED → `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking`; `docs/10-system-design/03-state-and-events/40-project-events/20-registry-and-catalog` | COVERED |
| P072 | `PrSeriesState.target_units` | `target_units: string[]` lists the primary translation units motivating the series. | `docs/10-system-design/50-ship-and-pr/10-score-and-pr-handoff` | MISSING |
| P073 | `PrSeriesState.target_units` comment | Cross-module edits are allowed when they serve the listed target units. | `docs/10-system-design/50-ship-and-pr/10-score-and-pr-handoff` | MISSING |
| P074 | `PrSeriesState.work_items` | `work_items: PrWorkItem[]` are durable feedback items; ingestion is background-safe and never waits for the lease. | CROSS-LINKED → `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking`; `docs/10-system-design/40-knowledge/70-execution-classes-and-jobs/10-source-classification` | COVERED |
| P075 | `PrWorkItem.item_id` | `item_id: PrWorkItemId` identifies each feedback item. | `docs/10-system-design/03-state-and-events/40-project-events/20-registry-and-catalog` | PARTIAL |
| P076 | `PrWorkItem.source_kind` | `source_kind: string` records the kind of feedback source. | `docs/10-system-design/03-state-and-events/40-project-events/20-registry-and-catalog` | PARTIAL |
| P077 | `PrWorkItem.source_id` | `source_id: string` records the exact feedback source identity. | `docs/10-system-design/03-state-and-events/40-project-events/20-registry-and-catalog` | PARTIAL |
| P078 | `PrWorkItem.status` | Work-item `status` uses exactly `pending \| in_progress \| resolved \| declined`. | CROSS-LINKED → `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking`; `docs/10-system-design/03-state-and-events/40-project-events/20-registry-and-catalog` | PARTIAL |
| P079 | `PrWorkItem.summary` | `summary: string` stores the feedback-item summary. | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | MISSING |
| P080 | `PrSeriesState.last_validation` | `last_validation?: ValidationRecord` stores the most recent gate validation for the branch. | CROSS-LINKED → `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking`; `docs/10-system-design/50-ship-and-pr/10-score-and-pr-handoff` | PARTIAL |
| P081 | `ValidationRecord.validated_at` | `validated_at: timestamp` records when validation ran. | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | MISSING |
| P082 | `ValidationRecord.source_revision` | `source_revision: SourceRevision` records the revision against which validation ran. | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | PARTIAL |
| P083 | `ValidationRecord.result` | `result: string` stores the validation result. | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | PARTIAL |
| P084 | `PrSeriesState.updated_at` | `updated_at: timestamp` records series update time. | `docs/10-system-design/03-state-and-events/40-project-events/10-envelope-and-lineage` | MISSING |
| P085 | `PrSeriesState.trace_id` | `trace_id: TraceId` roots series tracing. | `docs/10-system-design/03-state-and-events/40-project-events/10-envelope-and-lineage` | PARTIAL |
| P086 | `PrSeriesState.blockers` | `blockers: Blocker[]` stores series blockers. | CROSS-LINKED → `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking`; `docs/10-system-design/03-state-and-events/05-project-state-and-authority/10-project-state-composition` | PARTIAL |
| P087 | PrSeriesState JSON example | The example demonstrates a batch-0 changes-requested series with branch/upstream identity, one lbvector target, one pending review-comment item, clean source-anchored validation, trace, and no blockers. | CROSS-LINKED → `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking`; `docs/10-system-design/03-state-and-events/40-project-events/20-registry-and-catalog` | PARTIAL |
| P088 | PR series status values | The complete series status vocabulary has seven values: prepared, published, changes_requested, revising, approved, merged, closed. | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | COVERED |
| P089 | series status `prepared` meaning | `prepared` means locally cut and gate-validated, not open upstream. | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | COVERED |
| P090 | series status `prepared` authority | A lease-holding activation advances a series to `prepared`. | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | COVERED |
| P091 | series status `published` meaning | `published` means the PR is open upstream and waiting for review. | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | COVERED |
| P092 | series status `published` authority | Only an operator-gated, lease-holding batch publication advances to `published`. | CROSS-LINKED → `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking`; `docs/10-system-design/03-state-and-events/05-project-state-and-authority/30-operator-action-contract` | COVERED |
| P093 | series status `changes_requested` meaning | `changes_requested` means reviewer feedback exists as pending work items. | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | COVERED |
| P094 | series status `changes_requested` authority | Background remote observation advances to `changes_requested`. | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | COVERED |
| P095 | series status `revising` meaning | `revising` means fixers are executing against feedback. | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | COVERED |
| P096 | series status `revising` authority | Only a lease-holding activation advances/executes `revising`. | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | COVERED |
| P097 | series status `approved` meaning | `approved` means reviewer approval exists and merge is pending. | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | COVERED |
| P098 | series status `approved` authority | Background remote observation advances to `approved`. | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | COVERED |
| P099 | series status `merged` | `merged` is terminal, and the merged upstream result returns to the session through a later sync. | CROSS-LINKED → `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking`; `docs/10-system-design/40-knowledge/70-execution-classes-and-jobs/10-source-classification`; `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | COVERED |
| P100 | series status `merged` authority | Background remote observation advances to `merged`. | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | COVERED |
| P101 | series status `closed` meaning | `closed` means withdrawn or rejected without merging and is terminal. | CROSS-LINKED → `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking`; `docs/10-system-design/03-state-and-events/40-project-events/20-registry-and-catalog` | PARTIAL |
| P102 | series status `closed` authority | Background observation or an operator may advance a series to `closed`. | CROSS-LINKED → `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking`; `docs/10-system-design/03-state-and-events/40-project-events/20-registry-and-catalog` | COVERED |
| P103 | PR work-item status values | The complete work-item vocabulary is pending, in_progress, resolved, declined. | CROSS-LINKED → `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking`; `docs/10-system-design/03-state-and-events/40-project-events/20-registry-and-catalog` | PARTIAL |
| P104 | work-item status `pending` meaning | `pending` means feedback is ingested and unclaimed/unacted-on. | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | COVERED |
| P105 | work-item status `pending` terminality | `pending` is nonterminal. | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | PARTIAL |
| P106 | work-item status `in_progress` meaning | `in_progress` means a fixer under a campaign activation owns the item. | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | COVERED |
| P107 | work-item status `in_progress` terminality | `in_progress` is nonterminal. | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | PARTIAL |
| P108 | work-item status `resolved` meaning | `resolved` means addressed and pushed, or answered in the review thread. | CROSS-LINKED → `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking`; `docs/10-system-design/03-state-and-events/40-project-events/20-registry-and-catalog` | PARTIAL |
| P109 | work-item status `resolved` terminality | `resolved` is terminal. | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | MISSING |
| P110 | work-item status `declined` | `declined` means deliberately not actioned with a recorded reason, and is terminal. | `docs/10-system-design/03-state-and-events/40-project-events/20-registry-and-catalog` | PARTIAL |

## `50-sync`

| Fact | Source anchor | Atomic fact | Canonical destination | Verdict |
| --- | --- | --- | --- | --- |
| Y001 | opening ¶1 | Sync is one operator-initiated intake/reconciliation entry point for merged upstream PR evidence and staged corpora. | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | COVERED |
| Y002 | opening ¶1 | Upstream PR movement is observed/requested immediately, but reconciliation starts only after sync gets dispatch authority. | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | COVERED |
| Y003 | opening ¶1 | Source-conflict resolution belongs to sync, not running or PR workers. | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | COVERED |
| Y004 | opening ¶1 | With no upstream movement, sync is knowledge-only and leaves the source baseline/head unchanged. | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | COVERED |
| Y005 | Decision (2026-08-11) | There is no standalone `knowledge_intake` workflow kind. | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | COVERED |
| Y006 | Decision (2026-08-11) | Run, PR, and sync are the only workflow kinds that may hold the dispatch lease. | `docs/10-system-design/03-state-and-events/05-project-state-and-authority/20-dispatch-authority-and-handoffs` | COVERED |
| Y007 | Decision (2026-08-11) | Worker-result evidence is the only always-on knowledge input. | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | COVERED |
| Y008 | Decision (2026-08-11) | Every other knowledge source is processed only inside operator-started sync. | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | COVERED |
| Y009 | Knowledge Sources and Sync Intake | Source-changing intake is sync itself, preventing merged-PR evidence from entering through competing routes. | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | COVERED |
| Y010 | Knowledge Sources and Sync Intake | Conflicting upstream changes are reconciled into the session lineage before publication. | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | COVERED |
| Y011 | Knowledge Sources and Sync Intake | A no-movement pass publishes staged knowledge only, without source/head movement or remote boundary. | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | COVERED |
| Y012 | Decision (2026-08-12) | Sync never mutates the session worktree in place; all reconciliation is isolated staging. | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | COVERED |
| Y013 | Decision (2026-08-12) | Confirmed publication advances session/head and knowledge truth, records remote application/invalidations, and completes reconciled PR pushes. | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | COVERED |
| Y014 | Staging and Atomic Publish ¶1 | Staging rebases session history onto upstream, resolves conflicts, and revalidates before any head advances. | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | COVERED |
| Y015 | Staging and Atomic Publish ¶1 | A mid-run sync first pauses/drains Run, then reconciles, and only later advances heads. | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | COVERED |
| Y016 | Staging recovery bullets | Before publish, cancellation discards staging and leaves the session byte-identical. | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | COVERED |
| Y017 | Staging recovery bullets | “Not today” remains an available operator choice before publication. | `docs/10-system-design/03-state-and-events/05-project-state-and-authority/30-operator-action-contract` | COVERED |
| Y018 | Staging recovery bullets | A pre-publish crash can resume the last durable stage or discard staging. | `docs/10-system-design/03-state-and-events/40-project-events/40-sync-and-knowledge-events` | COVERED |
| Y019 | Staging recovery bullets | Once publishing starts, abort is unavailable; recovery moves forward from durable records. | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | COVERED |
| Y020 | PR reconciliation ¶1 | Sync reconciles the open PR campaign’s series alongside session history. | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | COVERED |
| Y021 | PR reconciliation bullets | Most series rebase cleanly; agents resolve minor conflicts and mechanical conflicts auto-resolve. | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | PARTIAL |
| Y022 | PR reconciliation bullets | Conflicts beyond confident agent resolution block sync for operator action. | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | COVERED |
| Y023 | PR reconciliation bullets | Ambiguous conflict outcomes cannot publish without operator resolution. | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | COVERED |
| Y024 | PR reconciliation bullets | Head advancement and reconciled PR pushes are one all-at-once atomic boundary. | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | PARTIAL |
| Y025 | process: observe | Observation records upstream revision and merged PR identities. | `docs/10-system-design/03-state-and-events/40-project-events/20-registry-and-catalog` | COVERED |
| Y026 | process: observe | Sync stages dumps/postmortem inputs and a sync request. | `docs/10-system-design/50-ship-and-pr/10-score-and-pr-handoff` | COVERED |
| Y027 | process: observe | Observation does not mutate the active workflow. | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | COVERED |
| Y028 | process: handoff | Handoff stops new worker admission. | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | COVERED |
| Y029 | process: handoff | Handoff drains or recovers active workers and operations. | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | COVERED |
| Y030 | process: handoff | Handoff writes an immutable snapshot before release. | `docs/10-system-design/03-state-and-events/05-project-state-and-authority/20-dispatch-authority-and-handoffs` | COVERED |
| Y031 | process: handoff | Old workflow authority releases before sync acquires. | `docs/10-system-design/03-state-and-events/05-project-state-and-authority/20-dispatch-authority-and-handoffs` | COVERED |
| Y032 | process: sync lease | Sync acquires the dispatch lease before active intake/reconciliation. | `docs/10-system-design/03-state-and-events/05-project-state-and-authority/30-operator-action-contract` | COVERED |
| Y033 | process: sync lease | Sync fetches and identifies the complete upstream change set. | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | COVERED |
| Y034 | process: sync lease | Merged-PR evidence is processed into staged knowledge. | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | COVERED |
| Y035 | process: sync lease | Staged corpora such as Discord are processed into staged knowledge. | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | COVERED |
| Y036 | process: sync lease | Session history through completed epochs is rebased onto new upstream in staging. | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | COVERED |
| Y037 | process: sync lease | Minor conflicts auto-resolve; ambiguous conflicts block for the operator. | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | COVERED |
| Y038 | process: sync lease | Duplicate-match conflicts are repaired in staged reconciliation. | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | COVERED |
| Y039 | process: sync lease | Build failures are resolved during reconciliation. | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | PARTIAL |
| Y040 | process: sync lease | Open PR series branches are rebased in staging and their pushes are staged for publish. | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | COVERED |
| Y041 | process: sync lease | Reconciled staging is validated “without rebuilding everything.” | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | MISSING |
| Y042 | process: sync lease | With no upstream movement, rebase is skipped and sync remains knowledge-only. | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | COVERED |
| Y043 | process: publish | Publish begins only through explicit confirm-gated operator action after resting at validated. | `docs/10-system-design/03-state-and-events/05-project-state-and-authority/30-operator-action-contract` | COVERED |
| Y044 | process: publish | Publication advances upstream/head and knowledge revisions in one durable transaction. | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | COVERED |
| Y045 | process: publish | The remote_application boundary records prior head, new head, resolved conflicts, and score delta. | `docs/10-system-design/10-intake-and-sessions/30-save-points` | COVERED |
| Y046 | process: publish | Publication explicitly invalidates targets, checkpoints, and PR snapshots. | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | PARTIAL |
| Y047 | process: publish | Reconciled PR series branches are pushed to their upstream PRs before sync becomes published. | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | COVERED |
| Y048 | process: publish | Releasing sync authority automatically resumes the interrupted run and recomputes candidates. | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | MISSING |
| Y049 | process: publish | Knowledge-only publication advances only knowledge revision and records no remote_application boundary. | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | COVERED |
| Y050 | process: publish | Pre-publish cancellation is allowed; post-publish-start abort is forbidden. | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | COVERED |
| Y051 | `SyncState` shape | Sync is a durable child workflow owned by a ProjectSession container. | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | COVERED |
| Y052 | `SyncState.sync_id` | Sync state has stable `sync_id: SyncId`. | `docs/10-system-design/03-state-and-events/05-project-state-and-authority/10-project-state-composition` | PARTIAL |
| Y053 | `SyncState.project_id` | Sync state carries owning `project_id`. | `docs/10-system-design/03-state-and-events/05-project-state-and-authority/10-project-state-composition` | COVERED |
| Y054 | `SyncState.session_id` | Sync state carries owning `session_id`. | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | PARTIAL |
| Y055 | `SyncState.revision` | Sync state carries monotonic integer revision. | `docs/10-system-design/03-state-and-events/05-project-state-and-authority/10-project-state-composition` | COVERED |
| Y056 | `SyncState.status` | Sync status is one of requested, ingesting, reconciling, validating, validated, publishing, published, blocked, or cancelled. | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | COVERED |
| Y057 | `SyncState.intake` | Sync has an intake object describing what it ingests, captured when the operator starts it. | `docs/10-system-design/03-state-and-events/40-project-events/20-registry-and-catalog` | PARTIAL |
| Y058 | `intake.upstream_from` | Intake records the session head’s upstream anchor before sync. | `docs/10-system-design/03-state-and-events/40-project-events/20-registry-and-catalog` | PARTIAL |
| Y059 | `intake.upstream_to` | Intake records observed upstream target. | `docs/10-system-design/03-state-and-events/40-project-events/20-registry-and-catalog` | PARTIAL |
| Y060 | `intake.merged_pr_ids` | Intake records the complete merged upstream PR identity set. | `docs/10-system-design/03-state-and-events/40-project-events/20-registry-and-catalog` | PARTIAL |
| Y061 | `intake.corpus_batch_ids` | Intake records staged corpus batch identities. | `docs/10-system-design/03-state-and-events/40-project-events/20-registry-and-catalog` | PARTIAL |
| Y062 | `intake.knowledge_only` | Boolean is true when upstream did not move; reconciliation is skipped and only knowledge revision advances. | `docs/10-system-design/03-state-and-events/40-project-events/20-registry-and-catalog` | PARTIAL |
| Y063 | `SyncState.staging` | Staging is nullable; it is the isolated reconciliation workspace and null for knowledge-only passes. | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | PARTIAL |
| Y064 | `staging.workspace_id` | Staging carries workspace identity. | `docs/10-system-design/03-state-and-events/40-project-events/20-registry-and-catalog` | PARTIAL |
| Y065 | `staging.epochs_total` | Staging tracks total epochs to apply as integer. | `docs/10-system-design/03-state-and-events/40-project-events/40-sync-and-knowledge-events` | PARTIAL |
| Y066 | `staging.epochs_applied` | Staging tracks applied epochs as integer. | `docs/10-system-design/03-state-and-events/40-project-events/40-sync-and-knowledge-events` | PARTIAL |
| Y067 | `staging.minor_conflicts_resolved` | Staging tracks count of minor conflicts resolved. | `docs/10-system-design/03-state-and-events/40-project-events/40-sync-and-knowledge-events` | PARTIAL |
| Y068 | `staging.conflicts_awaiting_operator` | Staging tracks count of conflicts awaiting operator. | `docs/10-system-design/03-state-and-events/40-project-events/40-sync-and-knowledge-events` | PARTIAL |
| Y069 | `SyncState.pr_reconciliation` | State keeps one reconciliation entry per open PR series rebased with the session. | `docs/10-system-design/03-state-and-events/40-project-events/40-sync-and-knowledge-events` | PARTIAL |
| Y070 | `pr_reconciliation[].series_id` | Each reconciliation entry identifies a PR series. | `docs/10-system-design/03-state-and-events/40-project-events/20-registry-and-catalog` | PARTIAL |
| Y071 | `pr_reconciliation[].result` | Per-series result vocabulary is `clean`, `auto_resolved`, or `needs_operator`. | `docs/10-system-design/03-state-and-events/40-project-events/40-sync-and-knowledge-events` | PARTIAL |
| Y072 | `pr_reconciliation[].pushed` | Per-series boolean becomes true once reconciled branch is pushed at publish. | `docs/10-system-design/03-state-and-events/40-project-events/20-registry-and-catalog` | PARTIAL |
| Y073 | `SyncState.publication` | Publication record is null until atomic publish and non-null afterward. | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | PARTIAL |
| Y074 | `publication.remote_application_id` | Source-changing publish records a remote-application identity; it is absent on knowledge-only passes. | `docs/10-system-design/10-intake-and-sessions/30-save-points` | PARTIAL |
| Y075 | `publication.prior_head` | Publication records prior source head. | `docs/10-system-design/10-intake-and-sessions/30-save-points` | COVERED |
| Y076 | `publication.new_head` | Publication records new source head. | `docs/10-system-design/10-intake-and-sessions/30-save-points` | COVERED |
| Y077 | `publication.knowledge_revision` | Publication records the published knowledge revision. | `docs/10-system-design/03-state-and-events/40-project-events/20-registry-and-catalog` | COVERED |
| Y078 | `publication.invalidated_ids` | Publication records target/checkpoint/PR-snapshot identities explicitly invalidated by the boundary. | `docs/10-system-design/03-state-and-events/40-project-events/20-registry-and-catalog` | PARTIAL |
| Y079 | `SyncState.created_at` | Sync state records creation timestamp. | `docs/10-system-design/03-state-and-events/05-project-state-and-authority/10-project-state-composition` | COVERED |
| Y080 | `SyncState.latest_event_sequence` | Sync state stores integer latest event sequence. | `docs/10-system-design/03-state-and-events/05-project-state-and-authority/10-project-state-composition` | MISSING |
| Y081 | `SyncState.trace_id` | Sync state stores root trace identity. | `docs/10-system-design/03-state-and-events/05-project-state-and-authority/10-project-state-composition` | COVERED |
| Y082 | `SyncState.blockers` | Sync state carries a blocker list. | `docs/10-system-design/03-state-and-events/05-project-state-and-authority/10-project-state-composition` | COVERED |
| Y083 | `Blocker.code` | Each blocker has code. | `docs/10-system-design/03-state-and-events/05-project-state-and-authority/10-project-state-composition` | COVERED |
| Y084 | `Blocker.message` | Each blocker has message. | `docs/10-system-design/03-state-and-events/05-project-state-and-authority/10-project-state-composition` | COVERED |
| Y085 | `Blocker.source_kind` | Each blocker has source kind. | `docs/10-system-design/03-state-and-events/05-project-state-and-authority/10-project-state-composition` | COVERED |
| Y086 | `Blocker.source_id` | Each blocker has source identity. | `docs/10-system-design/03-state-and-events/05-project-state-and-authority/10-project-state-composition` | COVERED |
| Y087 | `Blocker.recoverable` | Each blocker marks recoverability. | `docs/10-system-design/03-state-and-events/05-project-state-and-authority/10-project-state-composition` | COVERED |
| Y088 | JSON example | A state may remain `reconciling` while `conflicts_awaiting_operator = 1` and a conflict-needs-operator blocker is already present. | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | MISSING |
| Y089 | JSON example | During reconciliation, an auto-resolved PR series may still be unpushed and `publication` remains null. | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | COVERED |
| Y090 | status `requested` meaning | Upstream movement or staged corpora have been observed/recorded; operator has not started sync. | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | COVERED |
| Y091 | status `requested` invariant | Requested holds no lease and mutates nothing. | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | COVERED |
| Y092 | status `ingesting` meaning | Merged-PR evidence and staged corpora are processed into staged knowledge. | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | COVERED |
| Y093 | status `ingesting` invariant | Source truth remains unchanged; only staged knowledge grows. | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | COVERED |
| Y094 | status `reconciling` meaning | Staging rebases session history and open PR series onto new upstream. | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | COVERED |
| Y095 | status `reconciling` invariant | Session worktree and head remain untouched. | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | COVERED |
| Y096 | status `validating` meaning | Reconciled staged state is being validated. | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | COVERED |
| Y097 | status `validating` invariant | Publication cannot begin until validation evidence exists/succeeds. | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | COVERED |
| Y098 | status `validated` meaning | Reconciliation and validation are complete; sync rests pending operator publish confirmation. | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | COVERED |
| Y099 | status `validated` invariant | Nothing advances automatically; later upstream movement creates staleness and requires revalidation. | `docs/10-system-design/03-state-and-events/05-project-state-and-authority/30-operator-action-contract` | COVERED |
| Y100 | status `publishing` meaning | Confirmed publish advances head/knowledge, records boundary/invalidations, and performs reconciled PR pushes. | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | COVERED |
| Y101 | status `publishing` invariant | Publication is all-or-nothing and no partial boundary is observable. | `docs/10-system-design/10-intake-and-sessions/20-project-session-architecture` | PARTIAL |
| Y102 | status `published` meaning | Boundary is durable and sync authority is released. | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | COVERED |
| Y103 | status `published` invariant | Published is terminal. | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | COVERED |
| Y104 | status `blocked` meaning | Operator conflict resolution or recovery is required before sync can proceed. | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | COVERED |
| Y105 | status `blocked` invariant | Sync retains the lease and preserves recoverable staging. | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | COVERED |
| Y106 | status `cancelled` meaning | Operator abandons sync before publish and staging is discarded. | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | COVERED |
| Y107 | status `cancelled` invariant | Cancelled is terminal and session is exactly/byte-identically as before sync. | `docs/10-system-design/10-intake-and-sessions/10-session-operating-flow` | COVERED |

## Summary

| Source child | COVERED | PARTIAL | MISSING | Total |
| --- | ---: | ---: | ---: | ---: |
| `20-project-session` | 39 | 5 | 4 | 48 |
| `30-run` | 50 | 16 | 15 | 81 |
| `40-pr-campaign` | 63 | 35 | 12 | 110 |
| `50-sync` | 77 | 26 | 4 | 107 |
| **Total** | **229** | **82** | **35** | **346** |

VERDICT: GAPS — `20-project-session` PARTIAL: S006, S022, S036, S041, S043; MISSING: S013, S017, S029, S042. `30-run` PARTIAL: R003, R006, R007, R008, R013, R022, R024, R026, R037, R038, R043, R044, R045, R046, R049, R074; MISSING: R004, R023, R025, R028, R029, R030, R031, R032, R033, R034, R035, R036, R048, R050, R075. `40-pr-campaign` PARTIAL: P006, P009, P013, P015, P031, P032, P033, P035, P039, P040, P043, P044, P045, P051, P055, P064, P065, P066, P070, P075, P076, P077, P078, P080, P082, P083, P085, P086, P087, P101, P103, P105, P107, P108, P110; MISSING: P014, P016, P018, P030, P046, P048, P072, P073, P079, P081, P084, P109. `50-sync` PARTIAL: Y021, Y024, Y039, Y046, Y052, Y054, Y057, Y058, Y059, Y060, Y061, Y062, Y063, Y064, Y065, Y066, Y067, Y068, Y069, Y070, Y071, Y072, Y073, Y074, Y078, Y101; MISSING: Y041, Y048, Y080, Y088.
