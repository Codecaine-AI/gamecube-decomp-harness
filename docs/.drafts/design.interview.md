# Design Interview: Project State and Events

**Date**: 2026-08-11
**Scope**: Whole-project state, concurrent workflows, allowed actions, events, tracing, and operator projections
**Status**: Working draft — values are proposals until confirmed in the interview

---

## Current Design Direction

The project is not one large lifecycle. It is an aggregate of concurrent state machines. A run can be active while knowledge-processing jobs consume completed-worker evidence. PR workflows may also remain active independently of the run that produced their immutable ship snapshot.

```ascii
Project state
  ├─ project truth
  │   ├─ observed upstream revision
  │   ├─ current knowledge revision
  │   └─ configured policy and capabilities
  ├─ run control state machine
  │   ├─ epochs
  │   ├─ claims and workers
  │   └─ integration and confirmation
  ├─ knowledge-processing state machines
  │   ├─ worker-result ingestion
  │   ├─ PR postmortem ingestion
  │   └─ Discord and other source pipelines
  ├─ PR-series and PR-slice state machines
  └─ derived operator projection
      ├─ current state
      ├─ available actions
      └─ blockers for unavailable actions
```

The machines coordinate through immutable references and durable events. They do not share one universal `status` vocabulary.

## Common State Envelope

Every durable state object uses a small common envelope. Domain-specific state is stored separately.

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | yes | Stable identity of this state object. |
| `project_id` | yes | Project that owns the object. |
| `kind` | yes | State-machine kind, such as `run`, `knowledge_job`, `pr_series`, or `pr_slice`. |
| `status` | yes | A value from that kind's own status vocabulary. |
| `revision` | yes | Monotonic version used for ordered updates and stale-write protection. |
| `created_at` | yes | Creation time. |
| `updated_at` | yes | Time of the latest accepted transition. |
| `trace_id` | yes | Root trace identity for this object's work. |
| `caused_by_event_id` | no | Event that produced the current revision. |
| `blockers` | yes | Structured reasons that currently prevent one or more actions; empty when none. |

`status` is intentionally not standardized across all kinds. Only the envelope and transition/event contracts are shared.

## State Machine Inventory

| State machine | Cardinality | Owns | Does not own |
| --- | --- | --- | --- |
| Project truth | one per project | Observed upstream, knowledge revision, policy revision, capability inventory | Run control, individual jobs, PR review state |
| Run control | zero or one active per project | Autonomous scheduling authority, stop/drain intent, run inputs, progress summary | Individual worker lifecycle, knowledge processing, PR review |
| Epoch | zero or one active per run | Fixed admission window, boundary confirmation, refresh decision | Run-wide operator intent |
| Worker execution | many per epoch | Claim execution, sandbox, attempts, checkpoints, terminal result | Scheduling and cross-worker strategy |
| Knowledge job | many concurrent | One ingestion or maintenance job and its cursor/result | Run or PR lifecycle |
| PR series | many historical; policy decides active limit | Immutable ship snapshot, slice plan, series-level readiness | Autonomous scheduling |
| PR slice | many per series | Local preparation, publication, CI, review, repair, terminal disposition | Other slices except declared dependencies |

## Run State

A run represents one autonomous scheduling effort against immutable inputs. Pause and resume retain the same run identity.

### Run Shape

| Group | Values |
| --- | --- |
| Identity | `run_id`, `project_id`, optional lineage/session reference, `revision` |
| Immutable inputs | `base_revision`, `knowledge_revision`, `policy_revision`, `configuration_snapshot` |
| Control | `status`, optional `stop_request`, optional `terminal_reason` |
| Scheduling | `active_epoch_id`, desired workers, scheduler condition, admitted/claimed/running counts |
| Progress | baseline score, confirmed score, tentative/confirmed/regressed counts |
| Queues | worker-output integration summary, unresolved conflict count, pending confirmation count |
| References | epoch ids, worker-state ids, checkpoint ids, save-point ids |
| Operations | active operation ids, latest completed operation ids |
| Observability | trace id, latest event sequence, timestamps, blockers |

### Proposed Run Status Values

| Status | Meaning | Stable invariant |
| --- | --- | --- |
| `draft` | The run exists, but immutable inputs or configuration are incomplete. | No scheduler or worker may start. |
| `ready` | Required inputs have been captured and readiness gates pass. | Starting the run cannot change its input revisions. |
| `active` | Autonomous scheduling authority is enabled. | The scheduler may admit epochs and realize worker slots. |
| `draining` | New work admission is disabled while existing work settles. | No new claims are created. |
| `paused` | Scheduling is disabled and the run remains resumable. | Existing work has settled or been explicitly recovered. |
| `completed` | Autonomous work is closed normally. | The run cannot resume or admit more work. |
| `failed` | Autonomous work stopped because the runner could not safely continue. | Recovery or explicit closure is required. |
| `cancelled` | The operator intentionally abandoned the run. | The run cannot resume; preserved evidence remains readable. |

`starting` and `completing` are not proposed as durable run statuses. They are operations with their own progress and events. If the process dies during one, recovery derives the safe run status from the last committed transition.

### Scheduler Condition

Scheduler condition is separate from run status so the UI can distinguish an active-but-sleeping run from a paused run.

| Condition | Meaning |
| --- | --- |
| `idle` | No scheduler operation is executing. |
| `planning` | Candidate evidence is being reduced into an admission decision. |
| `dispatching` | Admitted work is being assigned to available worker capacity. |
| `waiting` | The run is active and sleeping until a durable wake event arrives. |
| `boundary` | Epoch confirmation, integration, report refresh, or save-point work is executing. |
| `blocked` | An active run cannot make progress without recovery or operator action. |

### Run Actions

Actions are derived from run state and referenced subordinate state. The action projection is not a second source of truth.

| Action | Normally available from | Important gates | Result |
| --- | --- | --- | --- |
| Capture run inputs | `draft` | Base, knowledge, and policy revisions are resolvable | Updates the draft; may make it `ready` |
| Start | `ready` | No conflicting run authority; readiness still valid | `active` |
| Request drain | `active` | None | `draining` plus a durable stop request |
| Hard stop | `active`, `draining` | Confirmation may be required | Recovers/cancels active claims, then `paused` or `failed` |
| Pause after drain | `draining` | Claims and required boundary work settled | `paused` |
| Resume | `paused` | Inputs remain valid; blockers cleared | `active` |
| Complete | `paused`, settled `draining` | No active claims or unresolved required integrations | `completed` |
| Recover | `failed` | Recovery action is known and authorized | A specific safe status determined by recovery |
| Create ship snapshot | Policy decision: active boundary, `paused`, or `completed` | Only confirmed work; immutable snapshot can be reproduced | Creates or updates a PR-series input without transferring run authority |

The unresolved row is `Create ship snapshot`. It determines whether PR work can proceed concurrently with an active run or only after the run settles.

## Concurrent Knowledge Processing

Knowledge ingestion is not a run phase. Each source pipeline owns independent jobs and advances the project's current knowledge revision when accepted outputs are committed.

### Proposed Knowledge Job Status Values

| Status | Meaning |
| --- | --- |
| `queued` | Durable work exists but has not started. |
| `processing` | A processor owns the job lease. |
| `waiting` | The job is waiting on a dependency or retry time. |
| `succeeded` | Outputs were accepted and provenance was recorded. |
| `failed` | The attempt ended without accepted outputs; retry policy applies. |
| `cancelled` | The job was intentionally discarded without deleting prior knowledge. |

Worker completion emits a knowledge candidate event. That event may enqueue one or more jobs, but worker completion does not wait for the knowledge job unless a later run readiness policy requires a minimum processed revision.

```sequence
sequenceDiagram
    participant Worker
    participant RunState
    participant EventLog
    participant KnowledgeQueue
    participant KnowledgeStore
    Worker->>RunState: terminal result and checkpoint evidence
    RunState->>EventLog: worker.result_recorded
    EventLog->>KnowledgeQueue: enqueue provenance-linked job
    KnowledgeQueue->>KnowledgeStore: process and accept knowledge
    KnowledgeStore->>EventLog: knowledge.revision_advanced
```

Discord, merged-PR postmortems, and other source pipelines use the same job contract with different source-specific payloads and processors.

## Commands, Events, and Actions

- A **command** requests work or a transition: `run.request_drain`.
- An **event** records an accepted fact: `run.drain_requested`.
- An **operation** tracks potentially long-running execution: boundary confirmation or knowledge rebuild.
- An **action projection** tells the UI which commands are currently admissible and why.

### Event Envelope

| Field | Meaning |
| --- | --- |
| `event_id` | Globally unique durable event identity. |
| `sequence` | Monotonic project-local ordering value. |
| `event_type` | Stable semantic name. |
| `schema_version` | Payload contract version. |
| `project_id` | Owning project. |
| `subject_kind` / `subject_id` | State object changed or observed. |
| `correlation_id` | Groups one user-visible workflow. |
| `causation_id` | Command or prior event that directly caused this event. |
| `trace_id` / `span_id` | Distributed tracing linkage. |
| `actor` | Operator, runner, agent, guardian, or external observer. |
| `occurred_at` | Time the fact became true. |
| `payload` | Event-specific facts, not a replacement state snapshot. |

## Operator Projection

The UI reads a server-owned projection assembled from the independent machines.

```text
Project state view
  project truth
  active run summary
  active epoch and worker summary
  background knowledge jobs and freshness
  active PR series and slices
  active operations
  recent events
  available actions
       action_id
       subject
       enabled
       blocked_by[]
       expected_transition
       confirmation_required
```

This projection may cache derived values, but canonical transitions remain in the owning state objects and event log.

## Invariants Identified So Far

- Different process kinds use different status vocabularies.
- Every accepted state transition increments the owning object's revision and emits a provenance-linked event.
- A run's base, knowledge, and policy revisions do not change after the run becomes active.
- Background knowledge processing does not silently mutate the immutable knowledge revision bound to an existing run.
- PR work consumes an immutable ship snapshot rather than reading a moving run branch without a boundary record.
- Available actions are derived from canonical state and blockers.

## Open Questions

1. May a confirmed epoch boundary create a ship snapshot and start PR preparation while the same run continues, or must the run pause/complete first?
2. Is `session` still a durable lineage container above run and PR objects, or can immutable snapshot references replace it?
3. Does project policy allow only one active run, one active PR series, or multiple independent instances?
4. Which knowledge jobs must finish before a new run can bind its knowledge revision?
5. Should failed runs be resumable in place after recovery, or should recovery create a successor run with explicit lineage?

## Suggested Canonical Design Doc Structure

- `03-state-and-events/`: overview and ownership rules.
- `03-state-and-events/10-project-and-session-state/`: project truth, lineage, immutable revisions.
- `03-state-and-events/20-run-state/`: run, epoch, claim, worker, integration, and Daytona execution state.
- `03-state-and-events/30-knowledge-state/`: asynchronous source pipelines and knowledge revisions.
- `03-state-and-events/40-pr-state/`: ship snapshots, PR series, slices, review and repair.
- `03-state-and-events/50-events-actions-and-projections/`: commands, events, operations, allowed actions, tracing, and UI read models.

---

*Working interview artifact. Canonical `doc.json` documents are updated after the values are confirmed.*
