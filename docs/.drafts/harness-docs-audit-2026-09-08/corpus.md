# docs/00-foundation

# Overview

The Gamecube Decomp Harness, is a purpose built multi agent system designed to complete decompilation of gamecube games

## North Star

The only objective we care about is Exact Code match percentage, all work should be moving towards getting a game to 100% exact match code

# Core Idea

## Intelligent Brute Force

- This system is heavily inspired by the work the brought about Project Glasswing

  - How do you use a huge number of agents to complete a very low level hard to complete task

  - Mythos / Glasswing was security, this system is decompiling code

- The idea here is we can "brute force" this problem by running a large number of parallel agents on the code

  - Many agents will find nothing, some will find a match or improvement

  - Loop this enough times and you should achieve 100%

### Think Like Sudoku

The key design decision that this system implements is to treat the process of Decomp like completing a sudoku puzzle

- This in the sense that you cannot force figuring out a square in Sudoku without finding out other information on the board

  - The idea here that seemingly unconnected sections of the board massively influence eachother / provide information about each other

- Moving this logic to decomp

  - There are hundreds of files and thousands of targets / functions within those files

  - Finding a match in a given file may then give information of a completely disjoint file

    - Naming conventions, data control, etc 

  - Pairing this with a shared knowledge base, the workers can find new facts and find bits of improvement each round

  - Think of this like a death of thousand cuts 

### Process in Detail

- Humans have patterns that we operate in

  - EX, humans will copy and paste code, use the same formatting for writing different functions

- A worker agent will process and get a new match / improvement

  - A worker finding a fact does not always finish the file it is holding.

  - A struct field, source shape, duplicate pattern, naming convention, etc

- This then can be used to inform the other functions / targets

- We build a shared knowledge base that all the workers can access

  - They search for useful info from files that seem disjoint, but contain information that allows for the system find matches



# docs/10-system-design/10-architecture

The GameCube decomp harness coordinates many bounded workers around durable state and a shared knowledge system. Workers act independently inside role-specific boundaries; the harness creates coherence by selecting work, fencing dispatch, and publishing every useful result back into shared evidence.

## Harness at Altitude

```text
Shared knowledge → select work → spawn workers → use toolboxes → publish evidence → shared knowledge
```

The loop advances one body of knowledge. Selection is reproducible from durable evidence, while target work stays isolated until its result crosses a governed publication boundary.

## How the Swarm Flows

A configured game enters the harness, which derives eligible targets and dispatches bounded workers. Each worker searches existing evidence, acts through its toolbox, and returns claims, measurements, artifacts, or failures for publication.

<!-- sequence: architecture-swarm-flow title="Evidence propagation through the swarm" -->

<!-- canvas: ./assets/canvases/system-flow.canvas.json title="System flow" -->

## Worker Types and Toolboxes

| Worker type | Owns | Toolbox boundary | Publishes |
| --- | --- | --- | --- |
| Decomp worker | A bounded target change | Target files, build and scoring commands, relevant knowledge operations | Candidate code, measurements, evidence, and failed tactics |
| Evaluation worker | An independent result check | Read-only artifacts, build outputs, and scoring surfaces | Measurements and acceptance evidence |
| Knowledge worker | Reusable evidence consolidation | Knowledge inputs, classification, provenance, and publication operations | Durable findings and searchable surfaces |

Target-changing workers execute in per-claim Daytona micro-VM sandboxes. The sandbox bounds file and command access without granting scheduling or publication authority.

## Shared Knowledge Base

The shared knowledge system holds evidence-backed facts about targets and entities, the target ledger of runs, pull requests, and events, the raw sources those facts cite, and the search index derived from them. Workers search it before acting; the librarians are its only writers, through one apply layer; Knowledge System defines those stores and worker-facing surfaces.

## Coordination and Dispatch

The scheduler turns durable evidence into reproducible work selection. A fenced dispatch lease is the sole authority for spawning workers, so concurrent workflows cannot dispatch overlapping work; Dispatch Authority defines acquisition, handoff, release, and recovery.

## System Boundary

The boundary separates global coordination from bounded execution. This separation permits worker scale without allowing local reasoning to mutate global truth directly.

| Concern | Inside the boundary | Authority |
| --- | --- | --- |
| Common memory | Durable state, shared knowledge, and published evidence | Harness and governed knowledge operations |
| Work selection | Eligibility, prioritization, claims, and durable transitions | Scheduler under the dispatch lease |
| Target reasoning | One target inside an isolated execution context | Claimed worker |
| Capabilities | Role-specific files, commands, build tools, scoring surfaces, and knowledge operations | Worker toolbox policy |
| Coherence | Every accepted result returns through durable processing and publication | Harness workflows and knowledge system |



# docs/10-system-design/20-game/10-game-model

A game binds stable identity to the configuration and canonical worktree required for orchestration. Melee is the configured game today, but the contract contains no Melee-specific workflow semantics.

## Game Boundary

The game boundary answers what the harness may operate on. Runtime ownership, cycles, workflow authority, and source-head advancement belong to the harness placed around this boundary.

| Concern | Game owns | Why |
| --- | --- | --- |
| Identity | A stable game identifier and human-facing name | Durable records and configuration resolve to the same subject |
| Source | The repository and one canonical worktree identity | All harness work begins from an explicit source boundary |
| Capabilities | Available toolkits, build commands, and scoring surfaces | Workers receive game-appropriate execution capabilities |
| Policy | Defaults and constraints that apply when harness work begins | The orchestration core stays game-agnostic |
| Knowledge inputs | Configured external and repository evidence sources | The knowledge system knows what it may ingest for the game |

## Canonical Worktree

The canonical worktree is the source location the game exposes to the harness as current truth. Registration identifies it and verifies that it matches the configured repository; isolated staging worktrees are temporary workflow resources and never replace the game's identity boundary.

## Responsibilities

| Responsibility | Game contract | Consumer |
| --- | --- | --- |
| Identify the subject | Stable game identity | Harness records and operator surfaces |
| Locate source truth | Repository and canonical worktree | Sync, Run, and PR workflows |
| Describe execution | Toolkits, commands, and scoring configuration | Worker toolbox assembly |
| Constrain operation | Policy defaults | Harness state and workflow initialization |
| Seed knowledge | Configured knowledge inputs | Knowledge processing pipeline |

The Harness owns the lifecycle placed around a registered game, including cycles, baselines, head lineage, workflow authority, and save points.



# docs/10-system-design/20-game/20-registration-and-setup

Registration binds game-specific configuration to a stable identity and prepares its canonical source boundary. A game becomes available to the harness only after the descriptor and worktree pass validation.

## Game Registration

The operator supplies the repository, toolkits, policy defaults, Knowledge Sources, and canonical worktree identity. Registration validates that these values are complete, mutually coherent, and usable by the configured sync toolkit.

| Input | Validation | Result |
| --- | --- | --- |
| Game identity | Unique and stable | Durable subject for harness records |
| Repository | Reachable by the configured source toolkit | Source authority is explicit |
| Toolkits | Required commands and capabilities resolve | Workers can receive bounded game-specific tools |
| Policy defaults | Schema-valid and compatible with toolkits | Harness initialization has deterministic defaults |
| Knowledge inputs | Supported sources with required credentials or paths | Knowledge ingestion can start after sync handoff |

## Worktree Provisioning

Provisioning creates or adopts the one canonical worktree named by the game descriptor. Verification confirms its repository identity and source revision before activation; temporary reconciliation worktrees remain outside this contract.

**RegisteredGameWorktree**

```
game_id: GameId  # Stable game identity.
repository: RepositoryLocator  # Configured source repository.
worktree_identity: WorktreeIdentity  # Canonical worktree owned by the game.
source_revision: CommitId  # Revision verified during setup.
sync_toolkit: ToolkitId  # Toolkit authorized to inspect and reconcile the source.
```

```json
{
  "game_id": "melee",
  "repository": "github.com/doldecomp/melee",
  "worktree_identity": "melee-canonical",
  "source_revision": "abc123",
  "sync_toolkit": "melee-sync"
}
```

## Activation

```process-outline
Register a game
     -> Prepare the descriptor and canonical worktree
     -> Verify repository identity, revision, toolkits, policy, and knowledge inputs
     -> Activate the game as available to the harness
     -> Emit the durable registration result
```

## Setup Exchange

<!-- sequence: game-registration-setup title="Operator and sync toolkit during game setup" -->

Activation hands the registered game to the Harness process. Cycle opening, baseline preparation, opening sync, and workflow authority are defined there rather than in game setup.



# docs/10-system-design/20-game

A game is the stable identity and configuration the orchestrator operates on. It names the source repository, canonical worktree, tools, policy defaults, and Knowledge Sources needed before the harness can begin work.

## Section Map

The chapter defines the game boundary first, then the registration path that makes a game operable.

| Section | Question answered |
| --- | --- |
| Game Model | Which identity, configuration, and source boundary belong to a game? |
| Registration and Setup | How is that boundary validated and activated for the harness? |



# docs/10-system-design/30-harness/10-process-overview

A registered game enters an opening sync, builds its first searchable knowledge revision, runs autonomous workers, turns confirmed work into reviewable PRs, and reconciles merged results through sync again. The cycle keeps one identity across these handoffs while accepted knowledge advances beside it.

Registration and Setup prepares the game descriptor and canonical worktree. Cycles owns the baseline, head lineage, opening contract, and explicit close gate used by the story below.

## Full Process

```process-outline
Harness one registered game
     -> Open a cycle on the prepared canonical worktree
          -> Capture an immutable baseline and a matching `head_revision`
          -> Run opening sync and publish the validated working baseline
     -> Build the initial knowledge revision
          -> Hand synchronized source inputs to the standing knowledge pipeline
          -> Classify, process, validate, and publish searchable evidence
     -> Run autonomous work
          -> Prioritize the board and admit targets to the queue
          -> Workers claim isolated sandboxes and return durable evidence
          -> Epoch integration confirms eligible work and advances the cycle head
     -> Break confirmed work into PR slices
          -> Prepare and split candidates at the score gate
          -> Review, repair, run QA, and publish the campaign
     -> Reconcile merged results
          -> Operator-started sync stages and validates upstream movement
          -> Confirmed publication establishes the next working baseline
          -> Continue the cycle or pass the explicit close gate
```

## Workflow Handoffs

Every handoff settles the current dispatch lease before the successor acquires it. Harness State preserves all workflow slots while authority moves through sync, run, PR, and back to sync.

<!-- sequence: ./assets/sequences/harness-handoffs.sequence.json title="Sync, run, PR, and recovery handoffs" -->

An interruption does not skip settlement. The current owner stops, records completed or cancelled work, recovers stale authority when required, and only then allows the queued successor to acquire a fresh lease.

## Knowledge Lane

Knowledge processing is not a fourth workflow slot. It consumes immutable inputs under job leases, never takes the game dispatch lease, and publishes accepted evidence for subsequent workers.

```process-outline
Process knowledge beside the workflow story
     -> Sync or worker completion enqueues a typed source artifact
     -> A processor claims the durable job and materializes staged evidence
     -> Validation accepts the evidence and advances the knowledge revision
     -> Later workers search the coherent published revision
     > Knowledge work never holds the game dispatch lease or blocks a workflow handoff
```

Librarian Pathways owns what happens after either handoff enters the lane: the index task the producer enqueues, the librarian pass that consumes it, and the apply layer that validates and writes.



# docs/10-system-design/30-harness/20-harness-state

HarnessState is the canonical coordination aggregate for one game at one game revision. It composes the current cycle, durable sync, run, and PR slots, the active dispatch lease, queued handoff requests, knowledge freshness, and trace position without replacing any domain-owned state.

Exactly zero or one of sync, run, and PR may occupy the active workflow slot for a game. Inactive workflow objects remain durable and readable; CycleState is their container, and knowledge jobs run beside the slot rather than inside it.

The shared jobs table is a separate dispatch ledger. Its `result_ref` points to domain evidence instead of making a queue row authoritative for a result; Durable Records owns that global contract.

## Composition at a Glance

The aggregate presents one coherent read across cycle lineage, workflow summaries, dispatch authority, background knowledge freshness, and tracing. Each linked domain state remains the authority for its own payload and transition rules.

<!-- canvas: ./assets/canvases/state-composition-tree.canvas.json title="State composition tree" -->

## State Ownership

| State | Authority | Destination |
| --- | --- | --- |
| HarnessState | One coherent game projection and the sole active workflow slot. | This page |
| StateEnvelope | Shared identity, local revision, status, trace key, and blockers. | This page |
| CycleState | Baseline, head lineage, timeline, and explicit close. | Cycles |
| SyncState | Staged reconciliation, validation, publication, and recovery. | Sync State |
| RunState | Run control, scheduling progress, integration, and recovery. | Run State |
| PrCampaignState | Campaign, series, review, publication, and feedback. | PR State |
| Knowledge projection | Backlog and accepted-revision freshness derived from queue and publication evidence. | Knowledge Processing |
| JobRecord | Cross-domain execution, lease, retry, and result reference. | Durable Records |

## HarnessState Shape

**HarnessState**

```
game_id: GameId  # Stable game identity.
game_revision: integer  # Monotonic aggregate revision for coherent reads and stale-write rejection.
cycle: CycleSlot | null  # Envelope-level mirror of the current CycleState plus its minimum head lineage.
  id: StateObjectId
  cycle_id: CycleId
  revision: integer
  status: CycleStatus
  head_revision: SourceRevision
  blockers: Blocker[]
    code: string
    message: string
    source_kind: string
    source_id: string
    recoverable: boolean
sync: WorkflowSlot | null  # Envelope-level mirror of the current SyncState; the child object remains canonical.
  id: StateObjectId
  workflow_id: SyncId
  revision: integer
  status: SyncStatus
  blockers: Blocker[]
    code: string
    message: string
    source_kind: string
    source_id: string
    recoverable: boolean
run: WorkflowSlot | null  # Envelope-level mirror of the current RunState; the child object remains canonical.
  id: StateObjectId
  workflow_id: RunId
  revision: integer
  status: RunStatus
  blockers: Blocker[]
    code: string
    message: string
    source_kind: string
    source_id: string
    recoverable: boolean
pr: WorkflowSlot | null  # Envelope-level mirror of the current PrCampaignState; series detail stays in the campaign.
  id: StateObjectId
  workflow_id: PrCampaignId
  revision: integer
  status: PrCampaignStatus
  blockers: Blocker[]
    code: string
    message: string
    source_kind: string
    source_id: string
    recoverable: boolean
active_workflow: DispatchLease | null  # Current dispatch-lease holder. Null means authority is free; durable workflow slots remain visible.
  kind: "run" | "pr" | "sync"
  workflow_id: WorkflowId  # Owning domain workflow.
  lease_id: LeaseId  # Fencing token minted at acquisition; every worker-dispatch and source-mutation command must present the current lease id, so stale actors from a previous activation are refused.
  status: "acquiring" | "active" | "blocked" | "releasing"
  acquired_at: timestamp
  heartbeat_at: timestamp  # Liveness evidence used during recovery.
  requested_handoff?: HandoffRequest  # Queued transition that begins after the current owner settles.
    target_kind: "run" | "pr" | "sync"
    target_workflow_id: WorkflowId
    reason: string
    requested_at: timestamp
  blockers: Blocker[]  # Reasons the owner cannot settle or release authority.
    code: string
    message: string
    source_kind: string
    source_id: string
    recoverable: boolean
queued_dispatch_requests: DispatchRequest[]  # Operator workflows waiting for the current dispatch lease to settle and release.
  request_id: DispatchRequestId
  target_kind: "run" | "pr" | "sync"
  target_workflow_id: WorkflowId
  reason: string
  requested_at: timestamp
knowledge: KnowledgeFreshnessSummary  # Game-level background knowledge freshness and processing projection.
  published_revision: KnowledgeRevision | null
  queued: integer
  claimed: integer  # Knowledge jobs owned by a lease but not yet executing.
  running: integer  # Knowledge jobs executing under a fenced lease.
  waiting: integer
  failed: integer
  oldest_pending_at: timestamp | null
  active_lease: KnowledgeLeaseSummary | null
    id: LeaseId
    expires_at: timestamp
  retry: KnowledgeRetrySummary | null
    next_attempt_at: timestamp
    attempts: integer
  recent_failures: KnowledgeFailureSummary[]
    job_id: KnowledgeJobId
    worker_state_id: WorkerStateId
    error: string
    attempts: integer
    updated_at: timestamp
trace: TraceCursor
  trace_id: TraceId
  latest_event_sequence: integer
  active_operation_ids: OperationId[]
updated_at: timestamp
```

```json
{
  "game_id": "melee",
  "game_revision": 1842,
  "cycle": {
    "id": "cycle-state-7",
    "cycle_id": "cycle-7",
    "revision": 3104,
    "status": "active",
    "head_revision": "upstream-9ba1",
    "blockers": []
  },
  "sync": {
    "id": "sync-state-2026-08-11-02",
    "workflow_id": "sync-2026-08-11-02",
    "revision": 41,
    "status": "requested",
    "blockers": []
  },
  "run": {
    "id": "run-state-2026-08-11-01",
    "workflow_id": "run-2026-08-11-01",
    "revision": 288,
    "status": "active",
    "blockers": []
  },
  "pr": {
    "id": "pr-campaign-state-4",
    "workflow_id": "pr-campaign-4",
    "revision": 57,
    "status": "in_review",
    "blockers": []
  },
  "active_workflow": {
    "kind": "run",
    "workflow_id": "run-2026-08-11-01",
    "lease_id": "lease-7f3b",
    "status": "blocked",
    "acquired_at": "2026-08-11T18:00:00Z",
    "heartbeat_at": "2026-08-11T18:42:08Z",
    "requested_handoff": {
      "target_kind": "sync",
      "target_workflow_id": "sync-2026-08-11-02",
      "reason": "upstream PRs merged",
      "requested_at": "2026-08-11T18:41:30Z"
    },
    "blockers": [
      {
        "code": "active_claims",
        "message": "Two worker claims must settle before sync.",
        "source_kind": "run",
        "source_id": "run-2026-08-11-01",
        "recoverable": true
      }
    ]
  },
  "queued_dispatch_requests": [
    {
      "request_id": "dispatch-request-sync-02",
      "target_kind": "sync",
      "target_workflow_id": "sync-2026-08-11-02",
      "reason": "upstream PRs merged",
      "requested_at": "2026-08-11T18:41:30Z"
    }
  ],
  "knowledge": {
    "published_revision": "knowledge-381",
    "queued": 6,
    "claimed": 0,
    "running": 1,
    "waiting": 1,
    "failed": 0,
    "oldest_pending_at": "2026-08-11T18:35:12Z",
    "active_lease": {
      "id": "knowledge-lease-44",
      "expires_at": "2026-08-11T18:43:08Z"
    },
    "retry": {
      "next_attempt_at": "2026-08-11T18:45:00Z",
      "attempts": 2
    },
    "recent_failures": []
  },
  "trace": {
    "trace_id": "trace-game-melee",
    "latest_event_sequence": 92811,
    "active_operation_ids": [
      "operation-run-stop-44"
    ]
  },
  "updated_at": "2026-08-11T18:42:08Z"
}
```

Cycle and workflow slots mirror identity, status, blockers, and the minimum lineage needed for an at-a-glance read. A null slot means no object of that kind exists; a null active_workflow means dispatch authority is free even when workflow slots remain populated.

## One Active Workflow Slot

HarnessState owns the invariant: one game has at most one current `active_workflow` lease across sync, run, and PR. Queued requests express intent but grant no authority, and a successor cannot acquire until the current lease is durably released or recovered. Dispatch Authority and Handoffs defines the lease mechanics.

## Aggregate Revision

game_revision advances once for each accepted transaction that changes the aggregate view. Readers name it to obtain a coherent composition, and writers present the expected revision so commands derived from stale state are refused.

Child revisions remain local to their state objects. HarnessState records the coherent aggregate after a child transition; it does not replace domain ordering or trace lineage.

## StateEnvelope

**StateEnvelope**

```
id: StateObjectId  # Stable identity of the state object.
game_id: GameId  # Owning game.
kind: StateKind  # Domain state-machine kind.
status: domain-specific enum  # A value owned by this state kind.
revision: integer  # Monotonic accepted-transition version.
created_at: timestamp
updated_at: timestamp
trace_id: TraceId  # Root trace for the object.
caused_by_event_id: EventId  # The accepted event that produced this revision, including revision 1.
blockers: Blocker[]
  code: string
  message: string
  source_kind: string
  source_id: string
  recoverable: boolean
```

```json
{
  "id": "run-2026-08-11-01",
  "game_id": "melee",
  "kind": "run",
  "status": "active",
  "revision": 288,
  "created_at": "2026-08-11T18:00:00Z",
  "updated_at": "2026-08-11T18:42:08Z",
  "trace_id": "trace-run-2026-08-11-01",
  "caused_by_event_id": "event-92811",
  "blockers": []
}
```

Cycle, sync, run, and PR campaign objects extend this envelope with their own payload and status enum. The envelope carries no dispatch authority field: a sync, run, or PR object may act only when HarnessState points its active workflow lease at that object.

## Envelope Concerns

| Concern | Fields | Authority | Consumer |
| --- | --- | --- | --- |
| Identity and routing | id, game_id, kind | The domain store allocates stable identity. | Stores, views, events, and traces |
| Accepted ordering | revision, caused_by_event_id, updated_at | The domain transition commits the next local revision. | CAS writers and reconstruction |
| Domain status | status | Each state kind owns its vocabulary and transition rules. | Generic views display but do not reinterpret it |
| Tracing | trace_id | Tracing owns cross-transition lineage. | Operators and trace readers |
| Blockage | blockers | The domain records why an operation cannot proceed. | Action projection and recovery |
| Dispatch relationship | No envelope field | HarnessState.active_workflow is the sole grant. | Host dispatch and checkout mutation |

State remains authoritative for the current revision. Envelope and Lineage owns provenance and accepted-event reconstruction around the snapshot.

## Read the Aggregate

```process-outline
Read one coherent game projection
     -> Read HarnessState at a named `game_revision`
     -> Use its slots to identify the current objects and summarize their status
     -> Resolve the domain state only when payload or transition detail is required
     -> Use `active_workflow` only to identify current dispatch authority
     -> Consume the server-owned action projection instead of deriving authority in the client
```

## Envelope Procedures

### Create an Enveloped Object

```process-outline
Create an enveloped state object
     -> Allocate a stable object identity and trace root
     -> Set the game, kind, initial domain status, and payload
     -> Commit revision 1 with timestamps and its accepted creation event
     -> Leave dispatch authority out of the envelope
     -> Install the object in the corresponding HarnessState slot at the next game revision
```

### Transition Status

```process-outline
Accept a domain transition
     -> Read the object and require its expected local revision
     -> Validate the requested edge and current blockers
     -> Require the current dispatch lease for guarded host actions
     -> Commit payload, status, blockers, revision, timestamp, and causing event atomically
     -> Advance HarnessState so aggregate readers observe the accepted child revision
```

A refused or rolled-back transition changes neither the state revision nor accepted event history.

### Supersede an Object

```process-outline
Supersede a durable state object
     -> Settle the existing object's obligations and enter its terminal or replaced status
     -> Release any HarnessState dispatch lease held by that object
     -> Preserve its identity, revision, trace, and event lineage
     -> Create the successor with a new identity, revision 1, and trace root
     -> Replace the corresponding HarnessState slot in one aggregate transition
```

Supersession never reuses identity or resets an existing revision. Pause and lease reacquisition keep the same object and continue its revision sequence.



# docs/10-system-design/30-harness/30-cycles

A cycle is the durable container for one bounded period of work on a game. It fixes the opening baseline, owns the mutable head lineage and ordered workflow evidence, and remains inspectable after an explicit operator close.

## CycleState

CycleState extends the StateEnvelope with cycle-owned lineage, timeline, child workflow identities, and close state. It never holds the game dispatch lease itself.

**CycleState**

```
cycle_id: CycleId
game_id: GameId
revision: integer
status: "active" | "closing" | "closed"  # Only one cycle may be active per game; closing is an explicit operator action.
original_baseline_revision: SourceRevision  # Source revision captured at cycle opening. Immutable.
head_revision: SourceRevision  # Canonical cycle head. Only epoch integrations and remote-application boundaries advance it.
timeline: TimelineEntry[]  # Ordered head-lineage record. Head-advancing entries are transactional with their commits; save points are evidence anchors pinned to existing commits. See the timeline entry-kind table below.
  entry_kind: "epoch_completed" | "remote_application" | "pr_phase" | "save_point"
  entry_id: string
  occurred_at: timestamp
workflow_ids: WorkflowId[]  # Child run, PR, and sync workflows in creation order.
created_at: timestamp
closed_at?: timestamp
trace_id: TraceId
blockers: Blocker[]
```

```json
{
  "cycle_id": "cycle-7",
  "game_id": "melee",
  "revision": 3104,
  "status": "active",
  "original_baseline_revision": "upstream-9ac4",
  "head_revision": "upstream-9ba1",
  "timeline": [
    {
      "entry_kind": "epoch_completed",
      "entry_id": "epoch-19",
      "occurred_at": "2026-08-11T17:55:00Z"
    },
    {
      "entry_kind": "remote_application",
      "entry_id": "remote-application-3",
      "occurred_at": "2026-08-11T19:10:00Z"
    }
  ],
  "workflow_ids": [
    "run-2026-08-11-01",
    "sync-2026-08-11-02"
  ],
  "created_at": "2026-08-01T09:00:00Z",
  "trace_id": "trace-cycle-7",
  "blockers": []
}
```

## Baseline and Head

Each cycle captures one immutable baseline and advances one head_revision. Recovery reads those durable fields instead of inferring current source truth from workflow logs or dashboard history.

| Concern | Contract | Why |
| --- | --- | --- |
| Opening baseline | The source revision and game policy captured at open never change. | Later configuration edits cannot rewrite the meaning of existing work. |
| head_revision | The canonical commit currently owned by the active cycle. | The canonical worktree must agree with it at durable boundaries. |
| Head lineage | Only accepted Run integration and source-changing sync publication advance head. | PR phases and save points add evidence without pretending source moved. |
| Successor baseline | A new cycle captures a fresh baseline only after its predecessor closes. | Two cycles never compete for future head lineage. |

## Open a Cycle

Opening turns the worktree prepared by Registration and Setup into an active cycle only after its source boundary is complete and verified. The Sync Workflow performs Baseline Preparation when source reconciliation is required.

```process-outline
Open a cycle
     -> Require every prior cycle for the game to be closed
     -> Allocate the envelope and capture baseline preparation outside the active slot
     -> Provision or identify the canonical worktree
     -> Run opening sync when source preparation is required
     -> Verify the worktree, baseline, and opening head name the same source boundary
     -> Install active CycleState and append `cycle.opened` in one durable boundary
```

The first cycle has no predecessor head. Provisioning plus opening sync establishes its baseline; bootstrap may omit opening_sync_id only when provisioning itself supplies the validated source boundary. No active CycleState is exposed with an incomplete baseline or missing worktree identity.

## Single Active Cycle

A game has at most one cycle in active or closing ownership. Historical closed cycles remain readable, an active cycle persists while dispatch authority is free, and no workflow transition opens or closes a cycle automatically.

## Ordered Timeline

The timeline records head lineage and workflow evidence in one durable order. Each entry kind has one writer, one head effect, and a failure rule that keeps recovery deterministic.

| Entry | Writer | Purpose | Head Effect | Failure Rule |
| --- | --- | --- | --- | --- |
| `epoch_completed` | Run integrator | Record one confirmed epoch integration commit. | Advances head_revision. | The entry exists if and only if the integration commit exists. |
| `remote_application` | Sync publisher | Record confirmed source reconciliation and its prior/new heads. | Advances head_revision for source-changing sync only. | The entry, repoint, invalidations, and accepted publication commit as one recoverable boundary. |
| `pr_phase` | PR campaign | Record campaign activation and release evidence. | No head change. | Lease-bound campaign evidence must settle before authority releases. |
| `save_point` | Save-point capture | Pin reports, board state, and score evidence to an existing commit. | No head change. | Capture failure marks evidence stale and blocks the cycle without inventing or reverting a commit. |

## Workflow Authority

A cycle retains sync, run, and PR state at the same time, while Harness State owns the one-active-workflow-slot invariant. Moving authority changes which child may act; it does not replace the cycle or discard inactive state.

| Work | Authority Boundary | Cycle Effect | Release Condition |
| --- | --- | --- | --- |
| Run | Acquires dispatch authority for scheduling, workers, and integration. | Confirmed epoch integration appends epoch_completed and advances head. | A managed stop settles active work before release. |
| PR | Acquires authority for bounded campaign preparation, review, and repair. | pr_phase evidence is appended without changing head. | Campaign activation settles and releases without closing the cycle. |
| Sync | An observed request waits until the current owner stops and releases; staging remains isolated. | Confirmed source publication appends remote_application and may advance head. | Publication, cancellation, or recovery settles staging before release. |
| Knowledge | Uses jobs-table leases, never the game dispatch lease. | Accepted knowledge may advance its own revision but never cycle head. | Job lease settlement is independent of workflow handoff. |

## Close Explicitly

```process-outline
Close a cycle
     -> Require the game dispatch lease to be free
     -> Verify the canonical worktree contains no changes beyond `head_revision`
     -> Require fresh evidence and a named save point whose commit equals head
     -> Transition CycleState from `active` to `closing`
     -> Record the final evidence boundary and transition to `closed`
     -> Clear the current HarnessState cycle slot
     > No workflow transition closes the cycle automatically
```



# docs/10-system-design/30-harness/40-save-points

Save points are the harness's persistent progress anchors. They pin reports, board state, and score evidence to an existing cycle-head commit without staging work or creating a new commit.

The Cycles timeline owns the ordered save_point entry. Source-changing Sync Process invokes capture after durable publication; knowledge-only processing creates no source-boundary anchor.

## Save-Point Structure

A save point records enough evidence to reproduce what the game looked like at one existing commit and to tell whether that evidence still describes the live head.

| Field | Meaning |
| --- | --- |
| commit_sha / branch | The exact existing checkout position that the evidence describes; recording the save point never creates this commit. |
| base_ref / base_sha | The upstream anchor, defaulting to origin/master, against which the position is measured. |
| trigger_kind | The registered boundary that requested capture; the trigger table below defines all nine values. |
| Score and artifacts | matched_code_percent is the headline measure; report copies live under state_dir/save_points/<timestamp>/, and board_snapshot_path identifies the board evidence beside them. |
| Worktree and payload | worktree_dirty records remaining uncommitted work; payload carries ahead-of-base count, dirty paths, evidence warnings, and full measures. |

## Capture Triggers

| Trigger Kind | Boundary |
| --- | --- |
| `manual` | An operator requests evidence at the current commit. |
| `init` | The harness captures the initial operable position. |
| `pause` | A run settles into a resumable pause. |
| `checkpoint` | A named operational checkpoint requests durable evidence. |
| `epoch` | A confirmed epoch boundary publishes a new cycle head. |
| `qa` | QA records the source position behind its gate evidence. |
| `ship` | A shipping boundary pins its release evidence. |
| `sync` | Source-changing sync captures the published head after its durable transaction. |
| `fresh` | A fresh-run boundary captures the position before new autonomous work. |

## Capture and Failure Semantics

Manual and automatic hooks enter the same save-point job. The sync path is ordered deliberately: the operator confirms validated staging, durable source and knowledge publication completes, and capture then reads the published HEAD.

<!-- sequence: ./assets/sequences/save-point-capture.sequence.json title="Sync publication and save-point capture" -->

A capture failure raises a durable cycle blocker and marks evidence stale. The failure remains visible instead of becoming an untracked log message.

Because sync capture follows durable publication, capture failure does not revert the cycle repoint, remote_application entry, invalidations, knowledge revision, or completed PR-branch pushes.

A staging conflict blocks before publication. No source boundary or sync save point exists until the conflict is resolved, staging validates again, and the operator confirms publication.

## Cycle Close Gate

Cycle close requires fresh named evidence at `head_revision`, a free dispatch lease, and a canonical worktree with no changes beyond head. Cycles owns the full close procedure.

## Where-We-Are Contract

The dashboard answers where the game stands from durable cycle state and the most recent evidence anchor. It never triggers a build merely to render the projection.

| Projection | Source | Meaning | Stale Rule |
| --- | --- | --- | --- |
| Latest save point | commit, trigger, matched percent, artifacts | Names the exact source position described by the evidence. | Stale when the cycle head moves or capture fails. |
| Current head | head_revision, branch, dirty paths | Names the live canonical source position. | Dirty paths make the evidence stale. |
| aheadOfBase | Commits between base_sha and current head | Counts durable work not merged into the base reference. | The count remains valid only for its named base and head. |
| stale | Comparison of head, worktree, and capture outcome | Prevents old evidence from being presented as current. | True when head moved, uncommitted changes exist, or capture failed. |

## Runs and the Knowledge Ledger

Run State owns run, epoch, claim, worker-state, and checkpoint identities. A save point records which run was active at capture without absorbing those records into the cycle.

Fact and evidence rows own reusable knowledge across save points and cycles. A save point pins evidence to source; it is not a second fact store.



# docs/10-system-design/30-harness/50-dispatch-authority

The dispatch lease is the sole authority to dispatch worker agents and mutate a workflow's allowed checkout surfaces. Harness State owns the one-active-workflow-slot invariant; this page defines the fenced lease and its handoff operations.

## Lease Shape and Fencing

Every guarded dispatch or source-mutation command presents the current lease_id. Acquisition mints a fresh fence, so a stale actor from an earlier activation is refused even when it still knows the workflow identity.

**DispatchLease**

```
kind: "run" | "pr" | "sync"
workflow_id: WorkflowId  # Owning domain workflow.
lease_id: LeaseId  # Fencing token minted at acquisition; every worker-dispatch and source-mutation command must present the current lease id, so stale actors from a previous activation are refused.
status: "acquiring" | "active" | "blocked" | "releasing"
acquired_at: timestamp
heartbeat_at: timestamp  # Liveness evidence used during recovery.
requested_handoff?: HandoffRequest  # Queued transition that begins after the current owner settles.
  target_kind: "run" | "pr" | "sync"
  target_workflow_id: WorkflowId
  reason: string
  requested_at: timestamp
blockers: Blocker[]  # Reasons the owner cannot settle or release authority.
  code: string
  message: string
  source_kind: string
  source_id: string
  recoverable: boolean
```

```json
{
  "kind": "run",
  "workflow_id": "run-2026-08-11-01",
  "lease_id": "lease-7f3b",
  "status": "blocked",
  "acquired_at": "2026-08-11T18:00:00Z",
  "heartbeat_at": "2026-08-11T18:42:08Z",
  "requested_handoff": {
    "target_kind": "sync",
    "target_workflow_id": "sync-2026-08-11-02",
    "reason": "upstream PRs merged",
    "requested_at": "2026-08-11T18:41:30Z"
  },
  "blockers": [
    {
      "code": "active_claims",
      "message": "Two worker claims must settle before sync.",
      "source_kind": "run",
      "source_id": "run-2026-08-11-01",
      "recoverable": true
    }
  ]
}
```

## Lease Status

**Dispatch lease status values**

| Status | Meaning | Stable invariant |
| --- | --- | --- |
| acquiring | The workflow is establishing authority and validating its start gates. | No domain worker has started. |
| active | The workflow owns dispatch and its allowed mutable resources. | Every guarded action carries the current lease id. |
| blocked | The workflow cannot settle or safely continue without recovery or operator action. | The lease remains owned; another workflow cannot start. |
| releasing | Final state and handoff evidence are being committed. | The next workflow cannot acquire authority until release is durable. |

## Lease Operations

**Dispatch authority operations**

```
requestDispatch(target_kind: "run" | "pr" | "sync", target_workflow_id: WorkflowId, reason: string, expected_game_revision: integer) -> DispatchLease | DispatchRequest  # Acquire immediately when authority is free or append one ordered handoff request.
  target_kind: "run" | "pr" | "sync"  # Workflow kind requesting authority.
  target_workflow_id: WorkflowId  # Durable workflow object that will own the lease.
  reason: string  # Operator-visible reason for the transition.
  expected_game_revision: integer  # CAS fence for the aggregate projection.
releaseDispatch(lease_id: LeaseId, handoff_evidence: HandoffEvidence) -> HarnessState  # Commit final state and handoff evidence, then make authority free.
  lease_id: LeaseId  # Current dispatch fence.
  handoff_evidence: HandoffEvidence  # Settled work, cancellations, and successor-ready evidence.
recoverDispatch(lease_id: LeaseId, recovery_evidence: RecoveryEvidence, expected_game_revision: integer) -> HarnessState  # Break stale or failed authority only after cancellation and reconciliation evidence is durable.
  lease_id: LeaseId  # Lease being recovered.
  recovery_evidence: RecoveryEvidence  # Evidence that stale work cannot mutate protected state.
  expected_game_revision: integer  # CAS fence for the aggregate projection.
```

## Acquire, Stop, Release, Succeed

<!-- sequence: ./assets/sequences/dispatch-handoff.sequence.json title="Dispatch lease handoff" -->

Background-safe evidence ingestion stays outside this lease because it dispatches no agents and mutates no checkout surface. Dispatch, Cycle, and Replay owns the accepted handoff evidence and recovery trace.



# docs/10-system-design/30-harness/60-operator-actions

Harness State exposes HarnessStateView as the server-owned projection of current coordination and operator authority. Clients render its summaries, blockers, expected transitions, and confirmation policy without recomputing whether an action is safe.

## Projection State

**HarnessStateView**

```
game_id: GameId  # Stable game identity.
game_revision: integer  # Aggregate revision used for every projected field and guard.
cycle: CycleSummary | null  # Current cycle identity, head, timeline evidence, and blockers.
active_workflow: ActiveWorkflowSummary | null  # Current dispatch-lease holder and headline.
queued_dispatch_requests: DispatchRequest[]  # Ordered successors waiting for authority.
run: RunSummary | null
pr_work: PrWorkflowSummary[]
sync: SyncSummary | null
knowledge: KnowledgeFreshnessSummary
active_operations: OperationSummary[]
recent_events: EventSummary[]  # Bounded history; never current-state authority.
available_actions: ActionProjection[21]  # Complete canonical action inventory.
compatibility_actions: ActionProjection[]  # Noncanonical compatibility operations.
```

```json
{
  "game_id": "melee",
  "game_revision": 1842,
  "cycle": {
    "cycle_id": "cycle-7",
    "head_revision": "upstream-9ba1"
  },
  "active_workflow": {
    "kind": "run",
    "workflow_id": "run-01",
    "status": "active",
    "headline": "Settling two claims"
  },
  "queued_dispatch_requests": [
    {
      "target_kind": "sync",
      "target_workflow_id": "sync-02"
    }
  ],
  "run": {
    "run_id": "run-01",
    "status": "active"
  },
  "pr_work": [],
  "sync": {
    "sync_id": "sync-02",
    "status": "requested"
  },
  "knowledge": {
    "published_revision": "knowledge-381",
    "queued": 6,
    "claimed": 0,
    "running": 1,
    "waiting": 1,
    "failed": 0
  },
  "active_operations": [],
  "recent_events": [],
  "available_actions": [
    {
      "action_id": "run.hard_stop",
      "enabled": true
    }
  ],
  "compatibility_actions": []
}
```

**ActionProjection**

```
action_id: ActionId
subject_kind: SubjectKind
subject_id: string
enabled: boolean
blocked_by: Blocker[]
expected_transition: string
confirmation_required: boolean
```

```json
{
  "action_id": "sync.publish",
  "subject_kind": "sync",
  "subject_id": "sync-02",
  "enabled": true,
  "blocked_by": [],
  "expected_transition": "validated → publishing → published",
  "confirmation_required": true
}
```

## Projection Rules

The builder reads canonical state once and projects summaries, dispatch queue order, knowledge freshness, active operations, bounded recent history, and action guards at the same game revision. Disabled actions remain present with explicit blockers, and command routes re-derive availability before accepting a request.

## Canonical Actions

The 21 actions are owned by the Run, PR, Sync, Cycles, save-point, and Librarian Pathways contracts. The projection collects their current guards; it does not become a second transition authority.

Game registration and cycle opening are lifecycle entry operations outside this 21-action projection. Registration and Setup prepares the game, and Cycles installs the active cycle before this surface begins workflow control.

**Canonical operator action inventory**

| Action | Subject | Expected Transition | Confirmation | Owner |
| --- | --- | --- | --- | --- |
| `run.start` | Run | ready → active | single click | Run workflow |
| `run.resume` | Run | paused → active | single click | Run workflow |
| `run.hard_stop` | Run | active/paused → paused with cancellations | required | Run workflow |
| `run.cancel` | Run | nonterminal → cancelled | required | Run workflow |
| `run.recover` | Run | failed → paused after reconciliation | required | Run workflow |
| `pr.open_campaign` | PR campaign | absent → preparing | single click | PR workflow |
| `pr.activate` | PR campaign | preparing/in_review → working | single click | PR workflow |
| `pr.publish_batch` | PR series | prepared → published; campaign returns to in_review | required | PR workflow |
| `pr.release` | PR campaign | working → preparing/in_review | single click | PR workflow |
| `pr.close_campaign` | PR campaign | nonterminal → completed | required | PR workflow |
| `pr.abandon_campaign` | PR campaign | nonterminal → abandoned | required | PR workflow |
| `pr.campaign_recover` | PR campaign | stale working → safe preparing/in_review | required | PR workflow |
| `sync.start` | Sync | requested → ingesting | single click | Sync workflow |
| `sync.resolve_conflict` | Sync | blocked → reconciling/validating | single click | Sync workflow |
| `sync.publish` | Sync | validated → publishing → published | required | Sync workflow |
| `sync.cancel` | Sync | pre-publication → cancelled | required | Sync workflow |
| `sync.recover` | Sync | blocked/publishing → safe forward state | required | Sync workflow |
| `cycle.save_point` | Cycle | append evidence; lifecycle unchanged | single click | Save points |
| `cycle.close` | Cycle | active → closing → closed | required | Cycles |
| `knowledge.process` | Knowledge job | queued/waiting → claimed → running → succeeded/failed/cancelled | single click | Knowledge processing |

## Confirmation Rule

confirmation_required is true exactly when an action is outward-facing, work-discarding, or terminal. The table carries the rule per action so clients display one consistent confirmation boundary.

Sync remains validated until the operator confirms sync.publish. Later upstream movement adds a staleness blocker and requires validation again before publication can be projected as enabled.



# docs/10-system-design/30-harness/70-durable-records

The harness-wide durable remainder is deliberately small. The jobs table owns execution, lease, retry, and result-reference truth; accepted state revisions obey one causation rule, while domain records live with the workflow, knowledge, or tracing contract that interprets them.

## Jobs Table

**Global jobs-table contract**

| Field Group | Fields | Contract |
| --- | --- | --- |
| Identity and dedupe | job_id, kind, dedupe_key | One durable executable request selects a registered descriptor and idempotency policy. |
| Status | status | Exactly queued, waiting, claimed, running, succeeded, failed, or cancelled. |
| Ordering and CAS | revision, priority, created_at | Deterministic ordering chooses eligible work; expected revision rejects stale transitions. |
| Concurrency and execution | concurrency_key, execution_class | Consumer policy limits incompatible or capacity-bound work. |
| Lease | lease_id, claimed_by, visibility_timeout | A current fenced claim prevents two consumers from owning the same execution. |
| Retry | attempts, max_attempts, next_attempt_at, backoff | Retryable failures enter waiting until their durable retry time. |
| Input and result | payload, result_ref | Payload requests work; result_ref points to domain evidence and never embeds it in queue state. |
| Tracing | trace_id, operation_id, caused_by_event_id | Every accepted transition joins execution to its trace and causing event. |

BEGIN IMMEDIATE plus revision CAS prevents double claim. Every accepted job transition appends one registered job.* game event; a terminal status records execution outcome, while result_ref identifies the domain record that explains what the work produced.

## One Revision, One Causing Event

Every accepted durable-state transition increments its state revision exactly once and records the one game event that caused it. Creation follows the same rule. The state write, event append, and outgoing spool records commit together under the expected revision; rejection commits none of them. Envelope and Lineage owns the StateEnvelope and provenance contract around this invariant.

## Record Destinations

| Record Family | Authority | Destination |
| --- | --- | --- |
| Jobs | Dispatch, lease, retry, and result-reference truth. | This page |
| Runs, targets, epochs, claims, worker states, checkpoints, integration outcomes | Run-domain state and evidence. | Run State |
| Facts | Accepted reusable knowledge and its reconciled taxonomy. | Knowledge Ledger |
| StateEnvelope and provenance | Snapshot identity, causing-event lineage, and reconstruction. | Envelope and Lineage |



# docs/10-system-design/30-harness

The harness wraps one registered game in a durable cycle, coordinates its workflow state, and carries work from an opening baseline through run and PR publication. The end-to-end process comes first; state and authority then explain how each handoff remains recoverable.

Process Overview follows one game from opening sync through autonomous work, PR review, and post-merge reconciliation. Read it before the mechanics below.

## Chapter Guide

| Concern | Question answered | Destination |
| --- | --- | --- |
| End-to-end process | What happens to a registered game from opening sync through merged PRs? | Process Overview |
| Coordination state | What does the harness hold, and which workflow may act? | Harness State |
| Cycles | How do baseline, head lineage, workflow history, and explicit close fit together? | Cycles |
| Persistent progress | How is reproducible evidence pinned to a cycle head? | Campaign and Save Points |
| Dispatch authority | How is exclusive worker dispatch acquired, fenced, handed off, released, and recovered? | Dispatch Authority and Handoffs |
| Operator control | Which commands are projected, guarded, and confirm-gated? | Operator Actions |
| Global records | Which queue and causation contracts remain harness-wide? | Durable Records |

## Knowledge Continues the Harness

The Knowledge System is part of the harness: sync and worker completion enqueue index tasks for the librarian, and later workers read the facts it writes. It follows as a sibling chapter because its sources, record contracts, pathways, and worker surfaces form a large system of their own.



# docs/10-system-design/40-knowledge/10-knowledge-sources/10-archival/10-discord

DISCORD — The Discord source is the archival store behind `discord://` locators: community discussion landed from chat exports as `discord_message` rows. Archival class — a new export appends rows and gets them indexed; a row never changes after insert, so a locator into it cannot drift and carries no digest. Display resolves the locator and shows `content` at read time; nothing is snapshotted onto the citing row.

## Table `discord_message`

**discord_message**

```
id: discord message id  # Primary key; the payload of a `discord://message/` locator
channel: string
author: string
posted_at: timestamp  # When the message was written on Discord
content: string
thread_id?: discord message id  # Present when the message sits in a thread
ingested_at: timestamp  # When the export landed the row here
```

```json
{
  "id": "1123581321",
  "channel": "matching",
  "author": "ansem",
  "posted_at": "2026-08-10T22:14:00Z",
  "content": "pretty sure 800BFFD0 is the hitstun decay helper",
  "thread_id": null,
  "ingested_at": "2026-08-11T03:00:00Z"
}
```

- `id`: the locator `discord://message/1123581321` resolves to this row; two facts citing the same message each carry their own evidence row pointing here — the message row is the shared thing.

- `thread_id`: null here — the message sits directly in `channel`, not in a thread.

Parsing: in `discord://message/1123581321`, the scheme is `discord://` and the payload `1123581321` is a `discord_message.id`. The resolver checks the scheme against the citing row's `kind`, then looks the payload up as the primary key; any other shape — extra path segments, a payload that is not a message id — is rejected.

## Foreign keys

None, in either direction. `evidence` and `link` rows cite a message by `(kind, locator)`, not by foreign key: the five sources are heterogeneous, and one pointer mechanism spans them all. Reverse lookup — what stands on this message — is an indexed query on `(kind, locator)`. The table references nothing.

## Who writes

| Table | Written by | Never |
| --- | --- | --- |
| `discord_message` | The Discord importer only, appending rows as new exports land | Anyone after insert — rows are immutable; there is no update or delete path |

## Search surface

Keyword, structured, and vector; no graph. BM25 runs over `content`; structured filters narrow by channel, author, time range, and thread. Vector retrieval runs over message content embedded with thread-window context — a message embeds together with its surrounding thread, so fragments like "the thing that makes you slide" retrieve. Alongside the wiki, this is the strongest vector case: slang and allusion defeat BM25.

| Primitive | Over | Notes |
| --- | --- | --- |
| Keyword | `content` | BM25 full-text |
| Structured | `channel`, `author`, `posted_at` range, `thread_id` | Exact filters on the row columns |
| Vector | `content` with thread-window context | A message embeds with its surrounding thread; allusive fragments retrieve |

## Related

- Knowledge Sources — the source classes and the full locator grammar.

- Evidence — the fact-owned rows whose `discord://` locators point here.

- Patterns — the entities Discord material most often grounds.



# docs/10-system-design/40-knowledge/10-knowledge-sources/10-archival/20-pull-requests

PULL REQUESTS — The pull-request source is not a new table: the store behind `pr://` locators is the existing `pull_request` rows of the target ledger, together with the discussion archived on them. Archival class — past PRs and their comments are frozen once ingested; new PRs append; a locator into the archive cannot drift and carries no digest.

## Locator grammar

`pr://<pull_request.id>` resolves to the PR row itself — description, verdict, archived discussion. `pr://<pull_request.id>/comment/<n>` addresses one comment: `<n>` is the comment's position in the PR's archived discussion, in posted order. The archive is frozen, so an index that resolves once resolves forever; the resolver rejects an index past the end of the discussion and any other path shape.

The table is owned by the target ledger: shape, writers, and lifecycle live in Pull Requests. This page defines only how the knowledge graph cites into it.

## Search surface

Keyword, structured, and vector; no graph. BM25 runs over title, body, and the archived discussion. Structured filters narrow by touched file or target and by author. Vector retrieval runs over discussion chunks.

| Primitive | Over | Notes |
| --- | --- | --- |
| Keyword | Title, body, archived discussion | BM25 full-text |
| Structured | Touched file/target, author | Exact filters on the row columns |
| Vector | Discussion chunks | Semantic retrieval over embedded chunks |

## Related

- Knowledge Sources — the source classes and the full locator grammar.

- Pull Requests (ledger) — the `pull_request` table itself: state shape, writers, lifecycle.

- Evidence — the fact-owned rows whose `pr://` locators point here.



# docs/10-system-design/40-knowledge/10-knowledge-sources/10-archival/30-wiki

WIKI — The wiki source is the archival store behind `wiki://` locators: SmashWiki material mirrored into `wiki_section` rows. A `wiki_section.id` encodes page, section, and mirror revision, so a locator pins exactly the text a claim was read against. Archival class — a mirror re-sync inserts new rows at a new `mirror_revision`; existing rows never change, so a locator cannot drift and carries no digest.

## Table `wiki_section`

**wiki_section**

```
id: wiki section id  # Primary key; encodes page, section, and mirror revision — the payload of a `wiki://` locator
page: string
section: string
mirror_revision: mirror revision  # Which sync of the mirror this row came from
content: string
ingested_at: timestamp
```

```json
{
  "id": "hitstun#formula@r2026-08-15",
  "page": "Hitstun",
  "section": "Formula",
  "mirror_revision": "r2026-08-15",
  "content": "Hitstun is the number of frames a character is unable to act after being hit, derived from knockback.",
  "ingested_at": "2026-08-15T03:00:00Z"
}
```

- `mirror_revision`: a later re-sync of this page inserts new rows at a new revision; this row stays, and a `wiki://` locator keeps resolving to the text as it stood at citation time.

- `id`: the encoding shown is illustrative; what is contractual is that one id names one (page, section, mirror revision) triple.

## Who writes

| Table | Written by | Never |
| --- | --- | --- |
| `wiki_section` | The wiki importer only; a mirror re-sync inserts new rows at the new `mirror_revision` | Anyone after insert — old revisions are kept, not overwritten; there is no update or delete path |

## Search surface

Keyword, structured, and vector; no graph. BM25 runs over `content`; structured filters narrow by `page` and `mirror_revision`, with the latest revision the default. Vector retrieval runs over sections and is the primary surface for `game_mapping` work — conceptual queries land here.

| Primitive | Over | Notes |
| --- | --- | --- |
| Keyword | `content` | BM25 full-text over section content |
| Structured | `page`, `mirror_revision` | Latest mirror revision by default |
| Vector | Sections | The primary surface for conceptual queries |

## Related

- Knowledge Sources — the source classes and the full locator grammar.

- Evidence — the fact-owned rows whose `wiki://` locators point here.

- Game Concepts — the entities wiki material most often seeds and grounds.



# docs/10-system-design/40-knowledge/10-knowledge-sources/10-archival

ARCHIVAL SOURCES — The archival class holds raw inputs frozen once ingested: Discord, pull requests, and the wiki. New material appends rows and gets them indexed; existing rows never change. Because a row cannot change, a locator into an archival source cannot drift — archival citations carry no `digest`.

## Related

- Discord — the `discord_message` archive: draft shape, importer contract, locator parsing.

- Pull Requests — the existing ledger rows as an archival source; what `pr://` comment indices mean.

- Wiki — the `wiki_section` mirror: draft shape and the re-sync contract.

- Knowledge Sources — the source classes and the full locator grammar.

- Evidence — the fact-owned rows whose archival locators point here.



# docs/10-system-design/40-knowledge/10-knowledge-sources/20-operational/10-attempts

ATTEMPTS — The attempt source is not a new table: it is the target ledger wearing its evidence hat. `worker_run` rows, their submissions, and their archived transcripts are the store behind `attempt://` locators. Operational class — the store grows with every run, and rows and artifacts are immutable once written, so an attempt locator cannot drift and carries no digest.

## Locator grammar

`attempt://run/<worker_run.id>` resolves to the run itself. Appending `/submission/<seq>` narrows to one submission by its sequence within the run; appending `/transcript/<span>` narrows to a span of the run's archived transcript. The grammar is closed: the resolver rejects any other shape, and rejects a submission or span the run does not have.

The tables and artifacts are owned by the target ledger: shape, writers, and lifecycle live in Worker Runs. This page defines only how the knowledge graph cites into them.

## Search surface

Structured first: filters by target, outcome, score trajectory, and epoch, because attempt retrieval usually starts from a known target. BM25 runs over hypotheses and transcripts for the rest. There is no vector surface — deliberately. Vectors are added later only if lexical retrieval demonstrably misses; until then the surface stays structured and keyword only.

| Primitive | Over | Notes |
| --- | --- | --- |
| Structured | Target, outcome, score trajectory, epoch | The first query — retrieval starts from a known target |
| Keyword | Hypotheses, transcripts | BM25 full-text |

## Related

- Knowledge Sources — the source classes and the full locator grammar.

- Worker Runs — what stands behind `attempt://` locators: runs, submissions, transcripts, tool output.

- Evidence — the fact-owned rows whose `attempt://` locators point here.



# docs/10-system-design/40-knowledge/10-knowledge-sources/20-operational/20-code

CODE — The code source is the one kind with no store row: the checkout itself is the store. A `code://` locator names a line span in the checkout at a pinned revision. Operational class, and the only source that drifts — the checkout moves with every merge — so this is the one kind whose citations carry a required `digest`.

## Locator grammar

`code://<revision>/<path>#L<start>-L<end>` resolves to the lines `<start>` through `<end>` of `<path>` in the checkout at `<revision>`. There is no store row to look up; resolution reads the checkout. The grammar is closed — the resolver rejects any other shape, a path missing at the revision, or a line range past the end of the file.

## Digest and drift

Every code citation — an `evidence` row or a `link` with `kind = code` — carries a `digest` of the span text, fixing what was actually read at citation time. The resolver verifies the span and its digest when the citing row is written; reconciliation re-resolves `code://` locators later and flags claims whose spans no longer match. Drift detection applies to this source alone — archival and attempt locators are never rechecked, because their stores are immutable.

## Search surface

Graph only: symbol lookup, xrefs, and grep over the checkout. Navigation is deterministic and unranked — no BM25, no vectors. The code graph the harness already derives is the surface; there is no separate index to build.

| Primitive | Over | Notes |
| --- | --- | --- |
| Graph | Symbols, xrefs, grep over the checkout | Deterministic, unranked; the code graph the harness already derives |

## Related

- Knowledge Sources — the source classes and the full locator grammar.

- Evidence — the fact-owned rows whose `code://` locators and digests point here.

- Evidence, Confidence, and Lifecycle — what reconciliation does when a code span drifts: staleness, review, re-anchoring.



# docs/10-system-design/40-knowledge/10-knowledge-sources/20-operational

OPERATIONAL SOURCES — The operational class holds sources that grow as agents run. Attempts are the target ledger wearing its evidence hat: runs, submissions, and transcripts accumulate with every run, and rows are immutable once written. Code is the active checkout — the only drifting source, so every `code://` citation carries a required `digest` of the span text.

## Related

- Attempts — worker runs, submissions, and transcripts behind `attempt://` locators.

- Code — the checkout as source: the only drifting one, the digest requirement, drift rechecks.

- Knowledge Sources — the source classes and the full locator grammar.

- Evidence — the fact-owned rows whose operational locators point here.

- Evidence, Confidence, and Lifecycle — what reconciliation does when a code span drifts: staleness, review, re-anchoring.



# docs/10-system-design/40-knowledge/10-knowledge-sources

KNOWLEDGE SOURCES — A knowledge source is a store of raw material the knowledge graph cites into. Every `evidence` row and every `link` carries a `kind` and a typed `locator` that resolves to one record in one source. Sources hold records; the graph holds claims. Nothing points at a source row by foreign key — citation is by locator, one pointer mechanism across five heterogeneous sources — and reverse lookup (what stands on this record) is an indexed query on `(kind, locator)`. Display resolves a locator into its source at read time; no content snapshot is stored on the citing row.

## Two classes

| Class | Sources | Contract |
| --- | --- | --- |
| Archival | Discord, pull requests, wiki | Raw inputs, frozen once ingested. A new Discord export or PR import appends rows on the `kg2-ingest` sync lane and gets them indexed; the wiki mirror is imported only on an explicit `--lane wiki` — never implicitly, not even by `--lane all`. Existing rows never change, so a locator into an archival source cannot drift and carries no digest. |
| Operational | Attempts, code | Attempts are the target ledger wearing its evidence hat — runs, submissions, and transcripts grow with every run and are immutable once written. Code is the active checkout: the only drifting source, and the only one whose citations carry a required `digest`. |

## Standards sit outside

Standards are part of the knowledge system but outside the knowledge graph: QA-owned, deliberately authored rules with lints, injected at worker boot and enforced at the ship gate — see Standards. They are not a knowledge source, not walkable, and never citable as evidence. The `kind` enum has no `standards` entry, and the omission is deliberate.

## Locator grammar

The grammar is closed. The resolver rejects any locator that does not match its `kind`'s grammar, and rejects kind/scheme mismatches — a `discord` row with a `pr://` locator never resolves. Each form's payload is the store row's primary key. `code://` is the one kind with no store row — the checkout at `<revision>` is the store, and only there does a `digest` of the span text pin what was read.

| Kind | Grammar | Resolves to |
| --- | --- | --- |
| `discord` | `discord://message/<discord_message.id>` | One `discord_message` row |
| `pr` | `pr://<pull_request.id>[/comment/<n>]` | A `pull_request` row, or one comment in its archived discussion |
| `wiki` | `wiki://<wiki_section.id>` | One `wiki_section` row; the id encodes page, section, and mirror revision |
| `attempt` | `attempt://run/<worker_run.id>[/submission/<seq>][/transcript/<span>]` | A worker run, one of its submissions, or a span of its archived transcript |
| `code` | `code://<revision>/<path>#L<start>-L<end>` | A line span in the checkout at `<revision>`; no store row, `digest` required |

## Search surfaces

Every source declares a search surface: the retrieval primitives that may run against it, drawn from four families — keyword (BM25 full-text over the stated text columns), vector (semantic retrieval over embeddings of the stated chunks), structured (exact filters and joins on the row columns), and graph (deterministic code navigation, never ranked). Search indexes are derived and rebuildable from the source rows — never part of the record contract; dropping and re-deriving an index loses nothing. Embeddings are generated remotely through an embedding API (`text-embedding-3` class; the provider is swappable), fanned out as concurrent requests so backfill turns around quickly; re-embedding is an index rebuild — nothing else changes.

The librarian is the only agent that searches these surfaces directly. Workers never query knowledge sources; what workers see arrives through worker surfaces built from facts. Which agents get which worker surfaces is deliberately deferred.

| Source | Keyword | Vector | Structured | Graph |
| --- | --- | --- | --- | --- |
| Discord | BM25 over content | Message content with thread-window context | channel, author, time range, thread | — |
| Pull requests | BM25 over title, body, archived discussion | Discussion chunks | touched file/target, author | — |
| Wiki | BM25 over section content | Sections — the primary surface | page, mirror revision | — |
| Attempts | BM25 over hypotheses, transcripts | — | target, outcome, score trajectory, epoch — the first query | — |
| Code | — | — | — | Symbols, xrefs, grep over the checkout |

## Related

- Archival Sources — the frozen class: Discord, pull requests, wiki.

- Discord — the `discord_message` archive: draft shape, importer contract, locator parsing.

- Pull Requests — the existing ledger rows as an archival source; what `pr://` comment indices mean.

- Wiki — the `wiki_section` mirror: draft shape and the re-sync contract.

- Operational Sources — the growing class: attempts and code.

- Attempts — worker runs, submissions, and transcripts behind `attempt://` locators.

- Code — the checkout as source: the only drifting one, the digest requirement, the drift gate.

- Record Contracts — the tables that cite into these sources and the foreign keys among them.

- Evidence — the fact-owned rows that carry these locators, and the `kind` enum.



# docs/10-system-design/40-knowledge/20-record-contracts/10-core-objects/10-targets

TARGET — A target is something a worker can be handed and try to match: one function or one data piece, exactly as the GALE01 build report (build/GALE01/report.json) lists it. Every function item and every scored data section is exactly one target row, and there is no target row that is not a report item. `target.kind` is `function` or `data`; the set of targets is the report's workable item list, changing only with `report_revision`. A translation unit is a report item but never a target — workers do not match a whole unit at once. Each unit is a `translation_unit` entity, and every target hangs off its unit through `unit_entity_id`. Meaning, likely names, types, and behaviour are fact rows whose subject is the target — assembled on demand by the knowledge-record view — never columns on target; what was done to the target is its target ledger — worker_run, pull_request, and event rows; its current match, size, and content hash are its target_status row.

> **decision: Invariant — the report fixes the set** — One target row per workable report item: `report.units[].functions[]` for function rows, and `report.units[].sections[]` (excluding `.text`, whose match the unit's function rows already carry) for data rows. That many rows, no more. Nothing adds a row except a new `report_revision`; nothing the knowledge system learns about a target can create another one. The units themselves become `translation_unit` entities, written by the same mechanical reconciliation pass.

> **decision: Invariant — every column is mechanical** — Every `target` column is derived from the build report by reconciliation and is rebuildable from scratch at any epoch, byte for byte. No LLM — not the librarian, not a worker, not the summary agent — ever writes a `target` column. Judgment lives on the knowledge side only: `fact` rows on the target, and `entity` rows for the things the report does not list.

## How the report is laid out

The report nests three scored levels. A `unit` is a translation unit — one source file compiled to one object file, never a directory. Inside it, every function is scored individually, and every ELF section carries its own size and match percent. Functions become `function` targets and sections become `data` targets — those are the workable items a worker can be handed. The unit itself becomes a `translation_unit` entity: still mechanical, still report-derived, but never assigned to a worker — per-unit match % is a derived view over its members. Counts below are from the GALE01 report at rev 891a1c1aaa30.

```text
report.json
├── measures                          whole-game rollup — not a row anywhere
│     fuzzy 99.54%  ·  matched_code 85.69%  ·  matched_data 88.86%  ·  complete_code 60.91%
│     19,829 functions (19,481 matched)  ·  1,075 units (971 complete)
│
└── units[]  ×1,075                   →  one `translation_unit` ENTITY each (not a target)
    │   name                    main/melee/ft/ftcommon
    │   metadata.source_path    src/melee/ft/ftcommon.c     one translation unit = one source file
    │   measures                fuzzy 100%  ·  109/109 functions matched (derived per-unit view)
    │
    ├── functions[]  ×19,829     →  one `function` TARGET each
    │     name                    ftCommon_ApplyFrictionGround
    │     size                    92
    │     fuzzy_match_percent     100.0
    │     metadata.virtual_address 2147993904   →  address 0x8007C8F0
    │
    └── sections[]  ×3,468       →  one `data` TARGET each, except .text
          name                    .data
          size                    344
          fuzzy_match_percent     100.0
          metadata.virtual_address 2151389248
          .text (×1,058) is the code section: its match is already carried by the unit's
          function rows, so it is the one section kind that never becomes a data target.
```

| Report level | Becomes | stable_key / locator | Scored by |
| --- | --- | --- | --- |
| report.units[] | A translation_unit entity | Locator: the repo source path | Derived view over its member targets' statuses |
| report.units[].functions[] | A function target | unit:symbol | Its own fuzzy_match_percent |
| report.units[].sections[] (excluding .text) | A data target | unit:section name | The section's own fuzzy_match_percent |

## Table `target`

**target**

```
id: target id  # Primary key; stable across report revisions while `stable_key` and `address` still resolve
kind: function | data  # Derived from the report item type; a translation unit is an entity, never a target kind
unit: string  # `report.units[].name`; the unit the item belongs to
unit_entity_id: entity id  # FK → entity; the `translation_unit` entity the item belongs to, and through it the unit's source path
symbol: string  # The function symbol, or the section name (`.data`, `.sbss`, …) for a `data` row
stable_key: string  # `unit:symbol` for both kinds, exactly as `code-graph.ts` builds `stableKey`; with `address`, the identity used to diff report revisions. Derivable from `unit` and `symbol` by construction — stored for diffing and indexing; divergence from its parts is a bug, never information
address: string  # `metadata.virtual_address`; supports identity
identity_status: current | moved | unresolved | retired  # Whether the item still resolves in the current report
moved_to_id?: target id  # FK → target; the successor row when `identity_status` is `moved`, written by reconciliation's rename-continuity pairing; null otherwise
report_revision: revision  # The report revision this row was last reconciled against
```

```json
{
  "id": "tgt-ftCo_800BFFD0",
  "kind": "function",
  "unit": "main/melee/ft/chara/ftCommon/ftCo_09C4",
  "unit_entity_id": "ent-tu-ftCo_09C4",
  "symbol": "ftCo_8009C4F8",
  "stable_key": "main/melee/ft/chara/ftCommon/ftCo_09C4:ftCo_8009C4F8",
  "address": "0x8009C4F8",
  "identity_status": "current",
  "moved_to_id": null,
  "report_revision": "rev-2026-08-27"
}
```

- Identity, not content: the row pins which report item this is; what the item currently looks like — size, content hash, match % — is its `target_status` row.

- Reconciliation only: every value above is copied or derived from the report; no other writer ever touches a `target` column.

### Per-kind constraints

CHECK-style, not judgment calls: a row that violates its `kind`'s constraints is malformed, and reconciliation refuses to write it.

| kind | Requires | Notes |
| --- | --- | --- |
| function | symbol, address, unit_entity_id | The symbol is the function name |
| data | symbol, address, unit_entity_id | The symbol is the section name; a section without an address is malformed and reconciliation refuses it |

## Enum `target.kind`

| kind | Report item | stable_key | Lives as fact rows instead |
| --- | --- | --- | --- |
| function | report.units[].functions[]: name, size, fuzzy_match_percent, metadata.virtual_address | unit:symbol, plus address for identity | Likely purpose, state transitions, inputs, outputs, side effects, callers; local-variable roles as data_flow and inferred_type facts — parameters get their own entity rows. An inferred_name fact is a read-only alias, never a rename instruction |
| data | One scored ELF section of report.units[].sections[] — .data, .rodata, .sdata, .sbss, .bss, … — every section except .text | unit:section name, plus address for identity | Likely contents and layout, inferred_type, read and write semantics |

## Units are entities

`unit` is not a target kind and `file` is not an entity kind: both names point at the same real thing — one translation unit, one source file — and it lives as a `translation_unit` entity whose locator is the repo source path. Per-unit match % and editability are the derived unit view: member targets grouped by `unit_entity_id`, their target_status rows aggregated. Nothing operational hangs off the entity itself: no worker_run, no target_status, never in the queue. Unit-level history is the exception that proves the rule — a pull_request row may key on the translation_unit entity when only diff-path attribution exists (the pre-CI-bot era), via the same subject XOR fact rows use. Subsystem-level meaning lives as facts on the entity.

## What is not a target

Everything below is either derived structure or curated meaning. The curated side is `entity`: a meaning-only subject with a `locator`, admitted by the librarian and joined to targets by `link` rows. Nothing operational ever hangs off an entity, and no entity is ever counted in the target set.

| Thing | Where it lives | Why it is not a target |
| --- | --- | --- |
| Translation unit / source file | A translation_unit entity (locator: the repo source path); per-unit match % is the derived unit view over its member targets | Workers match function by function, never a whole unit at once; the unit is context, not an assignment |
| Struct field | An entity (kind struct_field) under its struct entity via parent_entity_id; what we think about it is fact rows on that entity | The report does not list it; it is curated meaning, not a report item |
| Parameter | An entity (kind parameter) joined to its function's target by a link row (role "parameter") | An interpretation of the function, not a report item |
| Local variable | inferred_type or data_flow facts on the function's target; never an entity | No stable identity across recompiles; there is nothing to pin a row to |
| Game concept (a move, state, mechanic, character) | An entity (kind game_concept), joined to code targets by link rows and cited to wiki evidence rows | It is not in the build at all |
| A symbol the report does not list | Nothing, until a report revision lists it | The report fixes the set |

## Table `target_status`

Match %, linked, size, and content hash are not columns of target. The latest scored report writes one target_status row per target, keyed by target_id, and overwrites it on the next report; it is the only table here that is edited in place. Only targets have status rows — a translation unit's match % is the derived unit view over its members, never a stored row. A changed content_hash is status, not identity: `target.identity_status` moves only through reconciliation's explicit rules. The target card shows the row; what led to it — including the latest activity on the target — is read from the derived ledger view over the target's worker_run, pull_request, and event rows; target_status carries no last-run pointer.

**target_status**

```
target_id: target id  # PK and FK → target; exactly one row per target (1:1)
match_pct: number 0..100  # Best current match for the target from the latest scored report
linked: bool  # Whether the target links in the current build
size?: integer  # Report `size` for the function or section
content_hash?: digest  # Digest of the current bytes; a changed hash alone never changes `target.identity_status`
report_revision: revision  # The scored report that wrote the row
updated_at: timestamp  # When that report ran
```

```json
{
  "target_id": "tgt-ftCo_800BFFD0",
  "match_pct": 87.5,
  "linked": true,
  "size": 344,
  "content_hash": "sha256:9f2c41d8e6a05b73",
  "report_revision": "rev-2026-08-27",
  "updated_at": "2026-08-27T14:12:09Z"
}
```

- Overwritten in place: the latest scored report replaces the whole row; how it got here is the target's ledger — the `worker_run`, `pull_request`, and `event` rows the derived ledger view assembles.

- Content lives here, identity does not: `size` and `content_hash` are observations of the current build; a changed hash never moves `target.identity_status`.

## Identity and drift

The report changes between builds. A new report revision is diffed against the stored `target` rows by `stable_key` and `address`: an item with the same key and a new `target_status.content_hash` is still the same row; an item the maintainers renamed in place — one newly unresolved key and one newly inserted key at the same address and kind within the same unit, paired 1:1 — becomes `moved`, with `target.moved_to_id` naming the successor row; a key that is gone becomes `retired`; a key that cannot be resolved and has no 1:1 pairing becomes `unresolved`. A new item is a new row. No row is ever reattached to a guessed symbol.

| `identity_status` | Meaning | Related column |
| --- | --- | --- |
| `current` | The item resolves in the current report revision | `report_revision`, and `target_status.content_hash` when present |
| `moved` | The maintainers renamed the item: reconciliation paired its vanished key 1:1 with a new key at the same address and kind in the same unit | `target.moved_to_id` — the successor row, written by reconciliation; facts, evidence, links, runs, PRs, events, and the index stamp are re-pointed at the successor |
| `unresolved` | The current report does not list the key and no mapping exists; no replacement is guessed | None |
| `retired` | The item is gone from the report and is no longer worked | The mapping may preserve an explicit successor |

## Example — a new report revision is reconciled

```process-outline
Resolve each stored `stable_key` and `address` against the new report revision.
Compare the item's current bytes or source with the stored `target_status.content_hash` when present; a changed hash alone does not change `identity_status`.
Insert a `target` row for every report item that has no row; set `report_revision` on every row that resolved. Never delete a row: a vanished item becomes `retired` or `unresolved`.
Record identity changes as explicit `moved`, `unresolved`, or `retired` values; never reattach to a guessed symbol.
Pair renames within a unit: one newly `unresolved` symbol and one newly inserted symbol at the same `address` and `kind` pair 1:1 only. The old row gets `identity_status` `moved` and `moved_to_id` naming the successor; its facts, evidence, links, worker runs, pull requests, events, and index stamp are re-pointed at the successor in one transaction, a fact type collision keeping the newer `updated_at`. An address with more than one candidate on either side is reported in the reconcile result and left alone.
> Reconciliation records nothing in `event` and enqueues no index tasks. Code drift is not its job: the deterministic flagger re-resolves each `code://` citation at the checkout head inside the librarian's next `pr_imported` or `run_closed` pass, and that pass reads `renamed_from` off `moved_to_id` — see Drift Gate.
> Rebuild the target card and search projections from the tables, and the code graph from the checkout.
```

## Foreign keys out

| From | To | Cardinality | Meaning |
| --- | --- | --- | --- |
| target.unit_entity_id | entity (kind translation_unit) | Exactly one | The unit the item belongs to, and through it the unit's source path; the only foreign key target carries — target stays the root every per-target table points at |
| target_status.target_id | target | Exactly one; PK (1:1) | The target the row describes |

## Foreign keys in

| From | To | Meaning |
| --- | --- | --- |
| target_status.target_id | target | The status row the card shows for this target |
| fact.target_id | target | A live claim about this target; the knowledge-record view assembles them by type |
| worker_run.target_id | target | A traced worker run on this target |
| pull_request.target_id | target | A reconstructed external PR attributed to this target; unit-level attribution keys on the translation_unit entity instead, via the subject XOR |
| event.target_id | target | One exception line of this target's ledger |
| link.from_target_id, link.to_target_id | target | A curated join: this target related to another subject, or named by one |

## Who writes

| Table | Written by | Never |
| --- | --- | --- |
| target | Build-report reconciliation, on each new report_revision: function and data rows, after upserting the translation_unit entities their unit_entity_id points at | The librarian, a worker, or a human; nothing learned about a target adds or edits a row |
| target_status | The latest scored report, in place | Anyone else; no field on it is set by hand |

> **decision: Open questions** — - The allowed `identity_status` transition graph, and who approves a mapping. Decided: the successor mapping is `target.moved_to_id`, written only by reconciliation's rename-continuity pairing; there is no separate reconciliation table.
> - Whether a future report that enumerates individual data symbols within a section should split a `data` section row into per-symbol rows, and how those rows would be reconciled against the section rows already stored.

## Related

- Core Objects — `target`, `entity`, and `link` side by side: mechanical versus curated, and the one join between them.

- Record Contracts — the full table list, the foreign-key table, and the derived views including the unit view and the target card.

- Entities — the curated counterpart: files, structs, struct fields, game concepts, parameters.

- Links — the one generic join; a parameter reaches its function, and a target names a related target, through `link` rows.

- Knowledge Record — the derived view that assembles a subject's live `fact` rows; a target "has a knowledge record" when facts exist for it.

- Target Ledger — everything that has happened on a target; integration outcomes live on the `worker_run` row, and reconciliation writes nothing to the ledger.

- Evidence, Confidence, and Lifecycle — what happens to facts and evidence when identity drifts.



# docs/10-system-design/40-knowledge/20-record-contracts/10-core-objects/20-entities/10-game-concepts

GAME CONCEPTS — `game_concept` is the `entity` kind that pins an idea from the game rather than a shape in the code: a move, a state, a mechanic, a character (`concept:shield`). It exists so code can be tied to game meaning. A concept row is an ordinary `entity` row: the same table, the same merge lifecycle, the same curated admission documented in Entities. Nothing on this page adds a column, a table, or a fact type. The other larger-idea kind, `pattern`, has its own page: Patterns.

> **decision: Invariant — freeform on purpose** — There are no concept-specific fact types. The type enum stays exactly the six in Fact — `purpose`, `inferred_name`, `inferred_type`, `data_flow`, `state_behavior`, `game_mapping` — and a concept's substance is ordinary prose facts, typically `purpose`, with confidence, a rationale, and evidence like any claim.

## Grounding and locator

A game concept exists so code can be tied to game meaning: shielding, wavedashing, hitlag, a character. The `locator` is a curated slug — `concept:shield`, `concept:wavedash` — or a wiki locator when one pins the subject better. Its natural grounding is the wiki corpus: facts on a `game_concept` typically cite `wiki://` evidence, and the wiki importer is the usual seeder. Code reaches the concept through `link` rows from the targets and entities that realize it; a `game_mapping` fact on a target names the concept from the code side, and the link makes the join queryable from either end.

## Seen through links

Seeing a concept across the codebase is a query over `link` rows, never a dedicated table. Each row carries a `role`, a one-line `why`, and an inline `kind` + `locator` citation like every link. Roles are short free text; these are the conventional ones here:

| Role | From → To | Meaning |
| --- | --- | --- |
| `implements` | Target → `game_concept` entity | The function or data realizes the mechanic in code |
| `example` | Subject → `game_concept` entity | A worked case worth reading first; the strongest citation the concept has |
| `related` | `game_concept` entity → `game_concept` entity | Subsystem grouping — the concepts that belong to one mechanic cluster |

Grouping is links too: concepts cluster into subsystems through entity→entity rows — `concept:shield`, `concept:powershield`, and `concept:shield-break` joined with `role` "related", each with a `why` and an inline citation — never through a dedicated grouping table. Walking a subsystem is walking those rows.

## Admission

Admission is the standard curated path: the librarian writes the rows. The wiki importer is the usual seeder — it proposes concepts and their facts, and the librarian admits. Discord material enters the system the same way: the importer lands it as facts and evidence on knowledge subjects — mostly game concepts and patterns — never as ledger entries.

```process-outline
The wiki importer, or a librarian pass over a target, proposes a `game_concept`: a draft locator like `concept:shield`, draft facts, candidate links.
The librarian judges the proposal: admit it as a new entity, fold it into an existing one, or discard it.
On admission, substance lands as ordinary facts (typically `purpose`) citing `wiki://` evidence; reach lands as `link` rows from the code that realizes it, each with a `why` and an inline `kind` + `locator` citation.
> A `game_mapping` fact on a target names the concept from the code side; the `implements` link makes the join queryable from either end.
```

## Worked micro-example

```json
{
  "entity": {
    "id": "ent-shield",
    "kind": "game_concept",
    "locator": "concept:shield",
    "parent_entity_id": null,
    "identity_status": "active",
    "merged_into_id": null
  },
  "facts": [
    {
      "type": "purpose",
      "value": "The defensive bubble: raised by the trigger, shrinks with damage and time, breaks into stun.",
      "confidence": 0.95,
      "rationale": "the wiki's shield page describes the trigger raise, the damage and time decay, and the break-into-stun outcome in one place; this is the community's settled account"
    }
  ],
  "links": [
    {
      "from_target_id": "tgt-ftCo_ShieldProc",
      "to_entity_id": "ent-shield",
      "role": "implements",
      "why": "Per-frame shield size and break handling",
      "kind": "code",
      "locator": "code://2026-08-27/melee/ft/ftcommon.c#L2101-L2168",
      "digest": "sha256:4be91d0c"
    },
    {
      "from_entity_id": "ent-shield-break",
      "to_entity_id": "ent-shield",
      "role": "related",
      "why": "Break is the shield's failure state; one subsystem",
      "kind": "wiki",
      "locator": "wiki://wsec-shield-break-r4"
    }
  ]
}
```

- Citations are inline: the `implements` link cites the checkout (`code://` with a `digest`), the `related` link the wiki. The `implements` link is what puts the concept on the function's knowledge record, one hop out; the `related` link is the subsystem grouping.

- Link rows: only the set side of each FK pair is shown; exactly one of `from_target_id` / `from_entity_id` (and of the to-pair) is non-null, per Links; ids are illustrative.

## Related

- Entities — the `entity` table the kind lives in: state shape, locators, merge lifecycle, the curated-admission invariant.

- Patterns — the sibling larger-idea kind: developer conventions rather than game meaning.

- Links — the one generic join; the XOR rules the example rows above follow.

- Fact — the six types and the overwrite-in-place contract every claim here uses.

- Evidence — the fact-owned citation rows and the closed locator grammar; `wiki://` is the knowledge source that grounds concepts.



# docs/10-system-design/40-knowledge/20-record-contracts/10-core-objects/20-entities/20-patterns

PATTERNS — `pattern` is the `entity` kind that pins a curated convention noticed in how the original developers wrote code (`pattern:velocity-fields-last` — velocity variables sit at the bottom of fighter structs). A pattern row is an ordinary `entity` row: the same table, the same merge lifecycle, the same curated admission documented in Entities. Nothing on this page adds a column, a table, or a fact type. The other larger-idea kind, `game_concept`, has its own page: Game Concepts.

> **decision: Invariant — freeform on purpose** — There are no pattern-specific fact types. The type enum stays exactly the six in Fact — `purpose`, `inferred_name`, `inferred_type`, `data_flow`, `state_behavior`, `game_mapping` — and a pattern's substance is ordinary prose facts, typically `purpose`, with confidence, a rationale, and evidence like any claim. The former `pattern`, `pattern_example`, and `target_pattern` tables are gone: pattern entities plus `link` rows replaced them.

## Grounding and locator

A pattern is a habit of the original developers, kept deliberately unstructured: layout habits ("velocity variables are always at the bottom of fighter structs"), ordering and ordinality habits in functions, idioms a matched function keeps reappearing with. The `locator` is a curated slug like `pattern:velocity-fields-last`. Grounding is typically `discord://` — community lore that names the habit — and `code://` — the convention visible in the checkout. What makes a pattern useful is not structure but reach: the `link` rows from everything that shows it.

## Seen through links

Seeing a pattern across the codebase is a query over `link` rows, never a dedicated table. Each row carries a `role`, a one-line `why`, and an inline `kind` + `locator` citation like every link. Roles are short free text; these are the conventional ones here:

| Role | From → To | Meaning |
| --- | --- | --- |
| `exhibits` | Subject → `pattern` entity | The subject's shape shows the convention — a struct laid out the way the pattern says |
| `uses` | Subject → `pattern` entity | The code relies on the convention — matching it means honoring the habit |
| `example` | Subject → `pattern` entity | A worked case worth reading first; the strongest citation the pattern has |

## Resolution moves are patterns

A resolution move — "mismatches of shape X resolve by Y" — is not its own table. It is a `pattern` entity whose substance is an ordinary fact: a `value` stating the move, a `rationale` arguing for it, a `confidence`, and `evidence` rows pointing at the worker-run submissions where the move worked (`attempt://` locators). Example fact: "two stores to the same struct swapped in the diff resolve by swapping the source assignments", its evidence pinning the submissions whose scores rose after the swap. Formerly this knowledge lived in the retired `tactic`, `tactic_use`, and `pattern_tactic` tables. The raw material stays in the ledger regardless — submission descriptions and hypotheses — so structure can be rebuilt from that data later if a real population emerges.

## Consulted, not matched

Patterns are not lookups, and there is no recognizer machinery: nothing fires them, ranks them, or turns them into a checklist. They are context the librarian reads by judgment while indexing new material — does this look like a convention we already noticed? — and cites only when it thinks the connection is real. Workers see them on the target card as information with provenance, never as a checklist or ranked prescriptions. Builder pipelines may propose `pattern` entities; the librarian admits and writes.

## Admission

Admission is the standard curated path — the librarian writes the rows — with one extra actor: the mechanical builders (`mismatch-patterns`, `opseq-similarity`) propose, and only propose. A builder's output never becomes an `entity` row directly. Discord material enters the system the same way: the importer lands it as facts and evidence on knowledge subjects — mostly patterns and game concepts — never as ledger entries.

```process-outline
A builder or a human notices a recurring convention and proposes a `pattern` entity: a draft locator, draft facts, candidate links.
The librarian judges the proposal: admit it as a new entity, fold it into an existing one, or discard it.
On admission, substance lands as ordinary facts (typically `purpose`) citing `discord://` and `code://` evidence; reach lands as `link` rows, each with a `why` and an inline `kind` + `locator` citation.
> Game concepts follow the same curated path, usually seeded from the wiki importer — see the Game Concepts sibling page.
```

## Worked micro-example

```json
{
  "entity": {
    "id": "ent-velocity-fields-last",
    "kind": "pattern",
    "locator": "pattern:velocity-fields-last",
    "parent_entity_id": null,
    "identity_status": "active",
    "merged_into_id": null
  },
  "facts": [
    {
      "type": "purpose",
      "value": "Velocity variables sit at the bottom of fighter structs; a mismatched struct tail usually means velocity fields placed too early.",
      "confidence": 0.7,
      "rationale": "the Discord struct-layout thread names the habit, and the fighter structs in the pinned checkout all keep their velocity block at the tail"
    }
  ],
  "links": [
    {
      "from_entity_id": "ent-struct-fighter",
      "to_entity_id": "ent-velocity-fields-last",
      "role": "exhibits",
      "why": "Fighter keeps its velocity block at the struct tail",
      "kind": "code",
      "locator": "code://2026-08-27/melee/ft/fighter.h#L210-L242",
      "digest": "sha256:7d31a9e2"
    },
    {
      "from_target_id": "tgt-ftCo_800BFFD0",
      "to_entity_id": "ent-velocity-fields-last",
      "role": "example",
      "why": "Matched only after the velocity fields moved last",
      "kind": "attempt",
      "locator": "attempt://run/wr-0192/submission/3"
    }
  ]
}
```

- Link rows: only the set side of each FK pair is shown; exactly one of `from_target_id` / `from_entity_id` (and of the to-pair) is non-null, per Links. The `example` link cites an `attempt://` locator — a pinned worker-run submission, no `digest`; the `exhibits` link cites the checkout with `code://`, so it carries one.

- The fact is plain prose in the `purpose` type — no pattern-shaped column anywhere; ids are illustrative.

## Related

- Entities — the `entity` table the kind lives in: state shape, locators, merge lifecycle, the curated-admission invariant.

- Game Concepts — the sibling larger-idea kind: game meaning rather than developer habit.

- Links — the one generic join; the XOR rules the example rows above follow.

- Fact — the six types and the overwrite-in-place contract every claim here uses.

- Evidence — the fact-owned citation rows and the closed locator grammar; `discord://` and `code://` are the knowledge sources that ground patterns.



# docs/10-system-design/40-knowledge/20-record-contracts/10-core-objects/20-entities

ENTITY — An entity is a knowledge subject a worker is never handed: a translation unit, a struct, a struct field, a function parameter, a game concept, a developer pattern. Like target it is pure identity — four of the six kinds are mechanical (`translation_unit`, `struct`, `struct_field`, `parameter` — auto-generated from the report and the checkout by the entity extractor), and two are curated decisions (`game_concept`, `pattern` — librarian-written, proposed but never auto-admitted). Everything debatable about an entity, including its human-readable name, is a fact row on it: an inferred_name fact is the display name; purpose and inferred_type facts say what we think it is. The locator pins which real thing the row is; link rows join it to targets and to other entities; the knowledge-record view assembles its facts like any other subject's.

> **decision: Invariant — curated in, nothing operational out** — The mechanical kinds (`translation_unit`, `struct`, `struct_field`, `parameter`) are written by reconciliation and the entity extractor — the same role report reconciliation plays for targets; the curated kinds (`game_concept`, `pattern`) are written by the librarian and never auto-admitted. Nothing operational hangs off an entity: no worker_run, no target_status, never in the work queue, never counted in the target set. The one ledger exception is unit-level PR attribution: a pull_request row may key on a translation_unit entity through the subject XOR when only diff-path attribution exists. An entity exists to carry meaning; a curated entity nobody has facts for has no reason to exist.

## Table `entity`

**entity**

```
id: entity id  # Primary key
kind: translation_unit | struct | struct_field | game_concept | parameter | pattern  # What sort of subject the `locator` pins
locator: string  # Pins the identity; format depends on `kind` (see the enum table). One row per real thing
parent_entity_id?: entity id  # FK → entity; containment — a `struct_field` points at its `struct`
identity_status: active | merged | retired  # Whether the row is live, folded into another row, or gone with no successor
merged_into_id?: entity id  # FK → entity; set when `identity_status` is `merged` — the winner the loser's facts were folded into
```

```json
{
  "id": "ent-tu-ftcommon",
  "kind": "translation_unit",
  "locator": "src/melee/ft/ftcommon.c",
  "parent_entity_id": null,
  "identity_status": "active",
  "merged_into_id": null
}
```

- Locator per kind: `concept:shield` pins a `game_concept`; a `struct_field` would read `struct:Fighter#x2C`, a `parameter` `main/melee/ft/ftcommon:ftCo_800BFFD0#r3`.

- Merge is a tombstone: a losing row keeps its `id`, flips `identity_status` to `merged`, and resolves through `merged_into_id`; it is never deleted.

- No name column: what this entity is called is an `inferred_name` fact on it, with confidence and evidence, never identity.

## Enum `entity.kind`

| `kind` | Locator format | Example | What it is |
| --- | --- | --- | --- |
| translation_unit | Repo source path | src/melee/ft/ftcommon.c | One translation unit — one source file compiled to one object file. Mechanical: reconciliation writes one per report.units[] entry; every function and data target hangs off it via unit_entity_id; per-unit match % is the derived unit view over those members |
| struct | struct:<StableName> | struct:Fighter | A structure whose layout and role we are inferring |
| struct_field | <struct-locator>#<field> | struct:Fighter#x2C | One field of a struct; parent_entity_id points at the struct |
| game_concept | Slug or wiki locator | concept:shield | A move, state, mechanic, or character from the game |
| parameter | <function stable_key>#<ABI slot> | main/melee/ft/ftcommon:ftCo_800BFFD0#r3 | A positional parameter of a function; position, never name. Mechanical: the entity extractor writes one per declaration it can read with certainty; no parent_entity_id, the function is joined by a link row |
| pattern | Curated slug | pattern:velocity-fields-last | A convention noticed in how the original developers wrote code; substance is prose facts, reach is link rows |

Four of the six kinds — `translation_unit`, `struct`, `struct_field`, `parameter` — are mechanical: auto-generated from the report and the checkout by reconciliation and the entity extractor, insert-if-missing only, never edited or retired by the extractor on its own. The two larger-idea kinds, `game_concept` and `pattern`, carry their own grounding and admission story — curated, librarian-written — and get their own child pages, Game Concepts and Patterns.

## Names are facts

`entity` has no name column. The display name is an `inferred_name` fact on the entity, carrying confidence, a rationale, and evidence like any other claim. Renaming a struct is a fact overwrite, never an identity change; the `locator` stays.

## Merge lifecycle

There is no revisioning here: no revision counter, no `supersedes_id`. A fact overwrite is the unit of change. The only identity transitions are `merged` — two rows turned out to be the same thing — and `retired` — the subject stopped existing, with no successor.

```process-outline
Pick the winner. The loser's `identity_status` becomes `merged` and its `merged_into_id` points at the winner.
Fold each of the loser's live facts into the winner as a normal fact overwrite; folding into an occupied type is still one overwrite of the winner's row.
Re-point the loser's `link` rows so joins land on the winner; the tombstone keeps old references resolvable.
> Never delete the loser's row: anything that stored the loser's id still resolves through `merged_into_id`.
```

## Parameters

A parameter's identity is its position, never its name: the `locator` is the function's `stable_key` plus the ABI slot (`main/melee/ft/ftcommon:ftCo_800BFFD0#r3`), and every name it has ever been given is an `inferred_name` fact. The entity extractor writes parameters from the checkout, insert-if-missing, with id parameter:<locator>; a parameter carries no parent_entity_id, because its function is a target rather than an entity, so the link row is its only join. Declarations the extractor cannot read with certainty (unnamed, nested braces, conditional compilation) are skipped and counted, never guessed. The entity is joined to its function's `target` by a `link` row (`role` "parameter"); a parameter typed as a known struct gets an entity→entity `link` to the struct entity (`role` "typed_as"). Signature drift is handled with the lifecycle, not relocation: a parameter that stops existing is `retired`; two parameters that collapse into one struct pointer are `merged` into the replacement. Local variables and return values are never entities — they have no stable identity across recompiles — and stay `inferred_type` and `data_flow` facts on the function's `target`.

## Foreign keys out

| From | To | Cardinality | Meaning |
| --- | --- | --- | --- |
| `entity.parent_entity_id` | `entity` | Zero or one | Containment: a `struct_field`'s struct; a parameter has none |
| `entity.merged_into_id` | `entity` | Zero or one | The winner, when `identity_status` is `merged` |

## Foreign keys in

| From | To | Meaning |
| --- | --- | --- |
| `entity.parent_entity_id` | `entity` | A field this struct contains |
| `entity.merged_into_id` | `entity` | A tombstone whose facts were folded into this row |
| `fact.entity_id` | `entity` | A live claim about this entity; the knowledge-record view assembles them by type |
| `link.from_entity_id`, `link.to_entity_id` | `entity` | A curated join to a target or another entity: a parameter's function, a field's readers, a concept's code |

## Who writes

| Table | Written by | Never |
| --- | --- | --- |
| entity | Mechanical kinds: reconciliation (translation_unit) and the entity extractor (struct, struct_field, parameter) — insert-if-missing only. Curated kinds: the librarian, when there is something to say about the subject | A worker or a human; the extractor never edits or retires an existing row on its own |

## Sections

- Game Concepts — `game_concept`: ideas from the game tied to the code that realizes them; `wiki://` grounding, subsystem grouping through links, wiki-importer-seeded admission.

- Patterns — `pattern`: freeform developer conventions; `discord://` and `code://` grounding, cross-entity reach through links, builder-proposed and librarian-admitted.

## Related

- Core Objects — `target`, `entity`, and `link` side by side: mechanical versus curated, and the one join between them.

- Targets — the mechanical counterpart: the report-derived set nothing curated can grow.

- Links — how an entity reaches its function, its struct, or a related subject: `link` rows with a `role`, a `why`, and an inline citation into a knowledge source.

- Fact — the atom of knowledge; an entity's name and meaning are its live `fact` rows.

- Knowledge Record — the derived view that assembles a subject's live facts; entities get one exactly as targets do.



# docs/10-system-design/40-knowledge/20-record-contracts/10-core-objects/30-links

LINK — `link` is the one generic join between knowledge subjects: any `target` or `entity` to any `target` or `entity`, with a `role` naming the relationship, a one-line `why`, and an inline citation — a `kind` and `locator` pointing into a knowledge source — that showed it. It subsumes two former tables: an old `related_target` row is a `link` target→target with `role` "related", and an old `entity_target` row is a `link` entity→target. One table, four optional foreign keys, two XOR rules.

## Table `link`

**link**

```
from_target_id?: target id  # FK → target; XOR with `from_entity_id` — exactly one of the two is set
from_entity_id?: entity id  # FK → entity; XOR with `from_target_id`
to_target_id?: target id  # FK → target; XOR with `to_entity_id` — exactly one of the two is set
to_entity_id?: entity id  # FK → entity; XOR with `to_target_id`
role: string  # Short free text naming the relationship: `parameter`, `member`, `reads`, `writes`, `typed_as`, `related`, …
why: string  # One-line rationale a reader can check
kind: pr | discord | attempt | wiki | code  # Which knowledge source the citation points into; the same closed enum as `evidence.kind`
locator: string  # Typed pointer into the source, matching the kind's closed grammar (`attempt://run/<id>/submission/<seq>`, `code://<rev>/<path>#L10-L20`, …); what showed the relationship
digest?: string  # Hash of the cited span text; required when `kind` is `code`, absent for every other kind
```

```json
{
  "from_target_id": null,
  "from_entity_id": "ent-param-ftCo_800BFFD0-r3",
  "to_target_id": "tgt-ftCo_800BFFD0",
  "to_entity_id": null,
  "role": "parameter",
  "why": "signature hypothesis names r3 as the fighter pointer",
  "kind": "attempt",
  "locator": "attempt://run/wr-0192/submission/3"
}
```

- Two XOR rules: exactly one of `from_target_id` and `from_entity_id` is set, and exactly one of `to_target_id` and `to_entity_id`; this row is entity→target.

- One table, formerly two: an `entity_target` row is a `link` entity→target; a `related_target` row is a `link` target→target with `role` "related".

- The citation is inline: `kind` and `locator` point straight into a knowledge source, resolved by the kind's closed grammar — a link never references the `evidence` table. This row cites an `attempt://` submission, so no `digest`; a `code://` citation would carry one.

## Roles by example

| From | To | `role` | Meaning |
| --- | --- | --- | --- |
| `entity` (a `parameter`) | `target` (its function) | `parameter` | The parameter belongs to this function; the entity's `locator` carries the ABI slot |
| `entity` (a `parameter`) | `entity` (a `struct`) | `typed_as` | The parameter is a pointer to this struct |
| `target` (a `function`) | `target` (a `function`) | `related` | One target's page names another as related — formerly a `related_target` row |
| `target` (a `function`) | `entity` (a `struct_field`) | `reads` | The function reads this field; `writes` is the mirror claim |

> **decision: Rule — observed containment is never a link** — That a function or data piece is in a translation unit is report-derived structure: it lives on target (`unit_entity_id`) and in the derived unit view, and stays derived. A link row is a curated claim someone made and cited; mechanical structure never becomes one.

> **decision: Invariant — curated, never from the report** — `link` rows are written by the librarian, each with a `why` and an inline `kind` + `locator` citation. The report and reconciliation never write one. A relationship with nothing to cite is not a row.

## Foreign keys out

| From | To | Cardinality | Meaning |
| --- | --- | --- | --- |
| `link.from_target_id` | `target` | Zero or one; XOR with `from_entity_id` | The subject side, when it is a target |
| `link.from_entity_id` | `entity` | Zero or one; XOR with `from_target_id` | The subject side, when it is an entity |
| `link.to_target_id` | `target` | Zero or one; XOR with `to_entity_id` | The object side, when it is a target |
| `link.to_entity_id` | `entity` | Zero or one; XOR with `to_target_id` | The object side, when it is an entity |
| `link.kind` + `link.locator` | Knowledge-source row | Exactly one | What showed the relationship — the pointer is resolved by the kind's closed locator grammar, not a foreign key; `digest` pins the span when `kind` is `code` |

## Foreign keys in

| From | To | Meaning |
| --- | --- | --- |
| `link` (no foreign keys in) | — | Nothing references a `link` row; the knowledge-record view and the target card assemble every link touching a subject, one hop out |

## Who writes

| Table | Written by | Never |
| --- | --- | --- |
| `link` | The librarian, with a `why` and an inline `kind` + `locator` citation | The report, reconciliation, or a worker; observed containment never becomes a row |

## Related

- Core Objects — `target`, `entity`, and `link` side by side: mechanical versus curated, and the one join between them.

- Targets — the report-derived subject a link most often touches; containment lives there, not here.

- Entities — the curated subjects: parameters, structs, fields, concepts, files.

- Evidence — the fact-owned citation rows; a `link` row carries the same `kind` + `locator` pointer inline instead of referencing them.

- Knowledge Record — the derived view that pulls a subject's links one hop out.



# docs/10-system-design/40-knowledge/20-record-contracts/10-core-objects

Two core objects and one join. target is what a worker can be handed: one row per workable GALE01 build-report item — a function or a data section — every column written by reconciliation, the operational root everything hangs off — status, the target ledger, the queue — in a set only a new report can change. entity is everything else worth knowing about: the mechanical kinds (`translation_unit`, `struct`, `struct_field`, `parameter`) auto-generated from the report and checkout, and the curated kinds (`game_concept`, `pattern`) admitted by the librarian — with nothing operational attached beyond the unit-level PR attribution exception. link joins any subject to any subject, target or entity on either side, with a role, a why, and an inline evidence pointer — a kind and locator into a knowledge source. Everything debatable about either object is fact rows on it, assembled by the knowledge-record view.

## The objects

| Object | Contract | Doc |
| --- | --- | --- |
| target | Workable only. One row per function or data section, deterministic and rebuildable; the fixed count the queue and dashboards report; target_status, worker_run, and event key on it; pull_request keys on it or on a translation_unit entity via the subject XOR | Targets |
| entity | Mechanical or curated. translation_unit/struct/struct_field/parameter are extracted; game_concept/pattern are librarian decisions. Pure identity pinned by a locator, with every debatable thing — the name included — a fact on it | Entities |
| link | Curated. The one generic join between subjects, with a role, a why, and its own citing kind + locator pointer into a knowledge source; subsumes the former entity_target and related_target tables | Links |

## `target` versus `entity`

|  | `target` | `entity` |
| --- | --- | --- |
| Admission | Mechanical: the report fixes the set of workable items; reconciliation inserts rows and nothing else can | Mechanical kinds: the report and checkout fix them; extractor inserts missing rows. Curated kinds: a row exists when someone has something to say |
| Written by | Build-report reconciliation only; no LLM ever writes a column | Reconciliation/extractor for the mechanical kinds; the librarian for game_concept and pattern |
| Identity source | The report: stable_key, address, report_revision | The locator: source path for a translation unit, struct name, field, concept slug, ABI slot |
| What hangs off it | Everything operational — target_status, worker_run, pull_request, event, the queue — plus facts and links | Facts and links; unit-level pull_request rows via the subject XOR; no worker runs, no status, no events, never in the queue or the target count |

## Sections

- Targets — `target` and `target_status`: the report-derived set, per-kind constraints, identity and drift, reconciliation.

- Entities — `entity`: the six kinds and their locators, names as facts, the merge lifecycle, parameters. Its child pages Game Concepts and Patterns cover the two larger-idea kinds.

- Links — `link`: the XOR rules, roles by example, and why observed containment never becomes a row.

## Related

- Record Contracts — the full table list, the foreign-key table, the derived views, and the writers table.

- Fact — the atom of knowledge both objects carry their meaning in.

- Knowledge Record — the derived view that assembles a subject's live facts, links, and evidence into one page.



# docs/10-system-design/40-knowledge/20-record-contracts/20-knowledge-system/10-fact

FACT — The atom of knowledge. One `fact` row per live claim: a `value` about exactly one subject — a `target` or an `entity` — filed under a `type`, weighted by `confidence`, argued through `rationale`, and pinned to its observations through its `evidence` rows, each carrying a pointer into a knowledge source and why it supports the claim. At most one live row exists per (subject, `type`), and the `value` runs as long as the claim needs to be. The live row is overwritten in place when the claim changes; the set of live `fact` rows is what we currently think. The assembled page of one subject's live facts is the knowledge record — a derived view, not a table.

Every fact is AI-inferred. The game is not decompiled; nothing in this system is ground truth, so there is no observed-versus-inferred category on a claim — `confidence` alone carries how sure we are. Upstream names that are not random hex are treated as likely directionally correct; that belief also lives in `confidence`, not in a category. What a claim stands on is explicit instead: `value` is the claim, `rationale` is the deriving agent's argument for it, and the fact's `evidence` rows point at the observations in the knowledge sources the argument stands on.

> **decision: Invariant — one writer, overwrite in place** — The librarian is the only writer of `fact` and `evidence`; humans do not edit facts. There is no `updated_by` column anywhere in the knowledge system — provenance lives in the cited `evidence` rows and the `rationale`, not in a byline. A changed claim overwrites its live row in place; a clear is a plain row DELETE, removing the `fact` row and its `evidence` rows in the same write. Accidental-overwrite recovery is a DB snapshot taken before each librarian indexing pass — an operational concern, not schema.

## Table `fact`

Exactly one of `target_id` and `entity_id` is set: a fact is about a report item or about a curated subject, never both, never neither. Uniqueness is enforced: exactly one live row per (subject, `type`), so a subject has at most six facts and the row to overwrite is always uniquely addressable. A changed claim overwrites its row; a multi-part claim is one longer `value`, never a neighbour row.

**fact**

```
id: fact id  # Primary key
target_id?: target id  # The subject when the claim is about a report item; exactly one of `target_id` and `entity_id` is set
entity_id?: entity id  # The subject when the claim is about a curated subject (translation unit, struct, struct field, game concept, parameter, pattern)
type: purpose | inferred_name | inferred_type | data_flow | state_behavior | game_mapping  # Which kind of claim this is; unique per subject
value: string  # The claim, as long as it needs to be
rationale: string  # The deriving agent's argument from the cited evidence to the value, addressed to the next reader
confidence: number 0..1  # How sure we are of this claim
updated_at: timestamp  # When this row was last written
```

```json
{
  "id": "fact-01j9x2",
  "target_id": "tgt-ftco-800bffd0",
  "entity_id": null,
  "type": "purpose",
  "value": "Applies knockback decay to the fighter's velocity each frame while in hitstun.",
  "rationale": "The loop scales vel.x and vel.y by the same decay constant the hitstun state dispatch loads; the unit sits in the ftCommon group and the only caller is the hitstun handler.",
  "confidence": 0.8,
  "updated_at": "2026-08-12T04:31:00Z"
}
```

- `target_id` set, `entity_id` null: the claim is about a report item; the two subject keys are never both set.

- No citation column: this fact's observations live as `evidence` rows — here a `code://` span and a `discord://` message — each checked by the resolver before the write.

- `rationale`: the argument from those observations to the claim. Each evidence row's `why` covers its own pointer; the rationale says why the set supports the `value`.

## Enum `fact.type`

| Type | The claim says |
| --- | --- |
| `purpose` | What the subject does and why it exists |
| `inferred_name` | One direct proposed identifier, filename, or short subject label; explanations and alternatives belong in rationale. |
| `inferred_type` | A likely type, shape, unit, enum domain, or callback signature |
| `data_flow` | Where a value originates, how it changes, where it is consumed |
| `state_behavior` | A state, transition, guard, timer, or event-driven behaviour |
| `game_mapping` | Which grounded game or SmashWiki concept the code behaviour is |

There is no `invariant` type and no `negative_semantic` type (both were list-valued facts on the retired `knowledge_record` table). An invariant is just a confident `state_behavior` or `purpose` fact. A tested interpretation that did not work lives on the ledger side — the `worker_run` and `submission` hypothesis and outcome columns already carry it — and never becomes a fact.

An inferred_name value is the direct proposed name only. Functions, structs, fields, and parameters require one C identifier. Translation units, aggregate data sections, game concepts, and patterns may use a short direct label or filename. Put sentence framing, uncertainty, alternatives, and the argument in rationale, keeping confidence and evidence attached. A useful reading name does not assert recovery of the original spelling. Omit unsupported names or clear their existing fact; omit or clear a name that already equals target.symbol. The apply layer rejects malformed or redundant names with repair instructions. Aggregate labels are not bindings to individual variables. Worker-facing projections show the name as a guess with its confidence, and target.symbol remains the only name a worker may write into source.

## Foreign keys out

| From | To | Cardinality | Meaning |
| --- | --- | --- | --- |
| `fact.target_id` | `target` | Zero or one; exactly one of the two subject keys | The report item the claim is about |
| `fact.entity_id` | `entity` | Zero or one; exactly one of the two subject keys | The curated subject the claim is about |

## Foreign keys in

| From | To | Meaning |
| --- | --- | --- |
| `evidence.fact_id` | `fact` | The citations hanging off this claim; replaced wholesale on overwrite, deleted with the row |

## Who writes

| Table | Written by | Never |
| --- | --- | --- |
| `fact` | The librarian, overwriting in place | A worker, a human, the report, or reconciliation; no `updated_by` column records who |

## Related

- Record Contracts — the tables, the foreign-key table, and the derived views.

- Knowledge Record — the derived view that assembles one subject's live facts into a page.

- Evidence — the `evidence` table: the fact-owned citation rows and the locator grammar they point through.

- Targets — the report-derived subjects facts attach to via `target_id`.

- Entities — the curated subjects facts attach to via `entity_id`.

- Worker Runs — where a tested interpretation that did not work lives: `worker_run` and `submission` hypothesis and outcome.



# docs/10-system-design/40-knowledge/20-record-contracts/20-knowledge-system/20-knowledge-record

KNOWLEDGE RECORD — Not a table. The knowledge record is the name of a derived view: the assembled page of all live `fact` rows for one subject — a `target` or an `entity` — grouped by `type`, with linked subjects one hop out via `link`, and every cited observation resolved through `evidence`. A subject "has a knowledge record" when facts exist for it; there is no row to create, no revision to supersede, no status to carry. This is a query, never a row.

> **decision: Invariant — a query, never a row** — Nothing on this page is stored. The former `knowledge_record` table — one revisioned row per target with typed fact columns — is retired; its columns became `fact` rows; the revision chain is gone — a changed claim overwrites its row in place. Any schema element named `knowledge_record` is a bug. The name survives because the assembled page is still how a worker meets a subject.

## What the view assembles

| Piece | Query | Shows |
| --- | --- | --- |
| Live facts | `fact` WHERE the subject key matches, grouped by `type` | What we currently think: one claim per `type`, each with its `confidence` and the `rationale` arguing it from the cited evidence |
| Linked subjects | `link` WHERE either end is the subject, one hop out | Parameters, members, typed-as structs, related targets, patterns exhibited — each with its `role` and `why` |
| Cited observations | `evidence` rows joined through `evidence.fact_id` | Each citation's `kind`, `locator`, and `why`; the pointed-at content is resolved from its knowledge source at read time, not stored |
| Patterns | `link` rows whose other end is an entity of kind `pattern` | Conventions the subject exhibits; patterns are entities, so their links surface through the same one-hop query |

## Assembled view — illustrative

Nothing below is a stored object; it is what the query returns for one `function` target with two live facts and three `link` rows, one of them to a pattern entity. Shape is illustrative, not a contract.

```json
{
  "subject": {
    "target_id": "tgt-ftco-800bffd0",
    "kind": "function",
    "stable_key": "main/melee/ft/ftcommon:ftCo_800BFFD0"
  },
  "facts": {
    "purpose": [
      {
        "value": "Applies knockback decay to the fighter's velocity each frame while in hitstun.",
        "confidence": 0.8,
        "rationale": "The loop scales vel.x and vel.y by the decay constant the hitstun state dispatch loads; the only caller is the hitstun handler.",
        "evidence": [
          {
            "kind": "code",
            "locator": "code://abc1234/src/melee/ft/ftcommon.c#L210-L242",
            "digest": "sha256:1f3a9c",
            "why": "The decay loop the claim describes"
          }
        ]
      }
    ],
    "inferred_name": [
      {
        "value": "ftCommon_ApplyKnockbackDecay",
        "confidence": 0.6,
        "rationale": "Named for the decay behaviour; a decomp regular referred to this address as the knockback decay helper.",
        "evidence": [
          {
            "kind": "discord",
            "locator": "discord://message/1123581321",
            "why": "A decomp regular calls this address the knockback decay helper"
          }
        ]
      }
    ]
  },
  "links": [
    {
      "role": "parameter",
      "to": {"entity_id": "ent-param-7f21", "locator": "main/melee/ft/ftcommon:ftCo_800BFFD0#r3"},
      "why": "First argument; the fighter struct pointer"
    },
    {
      "role": "related",
      "to": {"target_id": "tgt-ftco-800c0210"},
      "why": "Shares the hitstun decay constant"
    },
    {
      "role": "exhibits",
      "to": {"entity_id": "ent-pattern-3a90", "locator": "pattern:decay-constant-preload"},
      "why": "Loads the decay constant before the branch, like the other hitstun helpers"
    }
  ]
}
```

The view is assembled wherever a subject is shown. For a target it is the knowledge half of the target card, which stacks it with `target_status` and the derived target-ledger view (`submission` ⋈ `worker_run`, `pull_request` entries, `event` rows) — see the Record Contracts overview's derived views. For an entity it is the whole page: entities have no status and no ledger.

Patterns need no join table of their own: a pattern is an entity of kind `pattern`, and a subject that shows one carries an ordinary `link` row to it (roles like `exhibits` or `uses`, each with `why` and an inline `kind` + `locator` citation), so the view surfaces pattern links through the same linked-subjects hop as everything else. The former `target_pattern` join table is retired. Pattern entities are documented in Patterns.

## Who writes

| View | Written by | Never |
| --- | --- | --- |
| Knowledge record | Nobody — assembled by query at read time from `fact`, `link`, and `evidence` | Any writer; there is no row to write, and no table by this name |

## Related

- Fact — the `fact` table and its `evidence` rows this view is assembled from.

- Evidence — the pinned observations resolved onto the page.

- Links — the one-hop joins that bring linked subjects onto the page.

- Patterns — the pattern entities whose links the view surfaces for subjects that exhibit them.

- Targets — one of the two subject kinds; the target card stacks this view with the operational tables.

- Entities — the other subject kind; for an entity this view is the whole page.

- Record Contracts — the derived-views table this view is listed in, and the target card around it.



# docs/10-system-design/40-knowledge/20-record-contracts/20-knowledge-system/30-evidence

EVIDENCE — An `evidence` row is one citation hanging off a claim: a typed `locator` into a knowledge source and a `why` saying how the pointed-at record supports the owning fact. Each row belongs to exactly one fact through `fact_id`; two facts leaning on the same Discord message hold two evidence rows, and the source row is the shared thing. Nothing is snapshotted — no content is stored on the row; display resolves the `locator` into the source at read time. Only `code` rows carry a `digest`, pinning the span text against the one source that drifts. `why` is per-pointer; the claim-level argument that synthesizes the citations is the fact's `rationale`. The librarian writes evidence rows in the same write as their fact: an overwrite of the fact replaces its rows wholesale, a clear deletes them with it, and a row is immutable while it lives. Reverse lookup — what stands on this source record — is an indexed query on (`kind`, `locator`).

## Table `evidence`

**evidence**

```
id: evidence id  # Primary key; a plain surrogate id
fact_id: fact id  # The owning claim; required
kind: pr | discord | attempt | wiki | code
locator: typed source locator  # Must match `kind`'s closed grammar and resolve; the payload is the source row's id
digest?: digest  # Of the span text; required when `kind` is `code`, absent otherwise
why: string  # Why this pointed-at record supports the fact
captured_at: timestamp
```

```json
{
  "id": "ev-01j9x4",
  "fact_id": "fact-7c21e0",
  "kind": "discord",
  "locator": "discord://message/1123581321",
  "why": "The author identifies 800BFFD0 as the hitstun decay helper after matching it",
  "captured_at": "2026-08-10T22:14:00Z"
}
```

- `fact_id`: the owning claim — this row was written in the same write as that fact, and an overwrite or clear of the fact replaces or deletes it.

- `locator`: the payload `1123581321` is a `discord_message.id`; no `digest` because the Discord archive is immutable — the locator cannot drift.

- `why`: what this one message shows; the owning fact's `rationale` argues the claim across all of its citations.

## Enum `evidence.kind` — the knowledge sources

Five knowledge sources back the five kinds, in two classes. Archival sources — the `discord://` archive, the `pr://` past-PR index, the `wiki://` mirrored corpus — are raw inputs, frozen once ingested: new material appends and gets indexed, existing rows never change, so a locator into them cannot drift and carries no digest. Operational sources are `attempt://` — the target ledger wearing its evidence hat, growing every run, its rows immutable — and `code://`, the active checkout and the only drifting source, where the `digest` requirement and drift detection apply. Standards are part of the knowledge system but outside the knowledge graph: QA-owned, deliberately authored rules injected at worker boot and enforced at the ship gate. They are not a knowledge source and are never citable as evidence — the enum having no `standards` entry is deliberate.

| Material | `evidence.kind` | Locator resolves to |
| --- | --- | --- |
| Code span | `code` | A path and line range in the checkout at the named revision |
| Assembly span | `code` | A disassembly or object-listing path and line range at the named revision |
| Wiki section | `wiki` | A `wiki_section` row — its id encodes page, section, and mirror revision |
| PR comment | `pr` | A `pull_request` row, and a comment index into its archived discussion |
| Discord message | `discord` | A `discord_message` row |
| Worker-run submission | `attempt` | A `worker_run` row and the submission sequence number it names |
| Transcript span | `attempt` | A `worker_run` row and a span of its archived transcript |
| Tool output | `attempt` | The transcript span where the output appears — cited as `attempt://run/<worker_run.id>/transcript/<span>` |
| Human note | `pr` or `discord`, whichever archive holds the note | The archived note's row; a freeform annotation typed onto a target is a ledger `note` row, not evidence |

## Locator grammar

The grammar is closed: the resolver rejects a `locator` that does not match its `kind`'s form, and rejects a kind/scheme mismatch. The payload is the source row's primary key; `code` is the one kind with no source row — the checkout at `<revision>` is the source, which is why a `digest` of the span text is required there and nowhere else.

| Kind | Grammar | Payload resolves to |
| --- | --- | --- |
| `discord` | `discord://message/<discord_message.id>` | A `discord_message` row |
| `pr` | `pr://<pull_request.id>[/comment/<n>]` | A `pull_request` row, optionally one comment of its archived discussion |
| `wiki` | `wiki://<wiki_section.id>` | A `wiki_section` row — the section id encodes page, section, and mirror revision |
| `attempt` | `attempt://run/<worker_run.id>[/submission/<seq>][/transcript/<span>]` | A `worker_run` row, optionally one submission or transcript span |
| `code` | `code://<revision>/<path>#L<start>-L<end>` | The span text in the checkout at the revision — no source row |

## Foreign keys out

| From | To | Cardinality | Meaning |
| --- | --- | --- | --- |
| `evidence.fact_id` | `fact` | many → 1 | The owning claim; the librarian writes both in one write, an overwrite replaces the fact's evidence rows wholesale, and a clear deletes them with it |
| `evidence.kind` + `evidence.locator` | A knowledge-source row | many → 1 | Resolved by the closed grammar, not a foreign key — heterogeneous sources, one pointer mechanism; a `code` locator resolves into the checkout instead of a row |

## Foreign keys in

| From | To | Meaning |
| --- | --- | --- |
| — (none) | `evidence` | Nothing references evidence rows; a `link` carries its own inline `kind` and `locator`, and reverse lookup is an indexed query on (`kind`, `locator`) |

## Who writes

| Table | Written by | Never |
| --- | --- | --- |
| `evidence` | The librarian, in the same write as the owning fact — rows pass the resolver's grammar and resolution checks with the claim | Edited in place, or kept past the fact: an overwrite replaces the fact's rows wholesale and a clear deletes them with it |

## Related

- Fact — the owning claims, whose `rationale` argues from these citations.

- Knowledge Record — the view that resolves a fact's citations onto a subject's page at read time.

- Links — subject-to-subject joins; each carries its own inline `kind` and `locator` under the same grammar.

- Patterns — the larger-idea entities whose facts and links `wiki://` and `discord://` evidence typically grounds.

- Worker Runs — what stands behind `attempt://` locators: worker runs, submissions, transcripts, tool output.

- Knowledge Sources — the archival and operational sources behind the locators, and the standards boundary.

- Record Contracts — the tables, the foreign-key table, and the derived views.



# docs/10-system-design/40-knowledge/20-record-contracts/20-knowledge-system

KNOWLEDGE SYSTEM — Three contracts carry what the harness thinks it knows. `fact` is the atom: one row per live claim about one subject (a `target` or an `entity`), carrying a `rationale` and its own `evidence` rows, overwritten in place. The knowledge record is not a table: it is the derived view that assembles one subject's live facts, linked subjects, and cited observations into a page. `evidence` rows are fact-owned citations: each points into one knowledge source through a typed `locator` and says why that observation supports the claim; they are written with their fact and die with it. A `link` carries its own inline pointer and never references the `evidence` table; the fact's `rationale` is the argument from those observations to the claim. The librarian is the only writer on this side of the model; there is no `updated_by` anywhere in the knowledge system.

## Sections

- Fact — the `fact` table and its `evidence` rows: the six types, rationale and cited evidence, overwrite-in-place.

- Knowledge Record — the derived view: a query, never a row.

- Evidence — the `evidence` table: the fact-owned citation rows and the knowledge sources they point into.

## Related

- Record Contracts — the full table list, the foreign-key table, and the derived views.

- Targets — the report-derived subjects.

- Entities — the curated subjects.

- Links — the joins the knowledge-record view walks one hop out.



# docs/10-system-design/40-knowledge/20-record-contracts/30-target-ledger/10-worker-runs

WORKER RUN — One `worker_run` row per traced engagement by a worker on a target, with `final_outcome` saying how it ended. What it tried is its `submission` rows, one per scored try. An external PR is never a `worker_run`: it is a `pull_request` row, its own ledger entry type. Outcomes live here — on `worker_run.final_outcome` and the submission scores — never on an `event` row; a closing run inserts nothing into `event`. The `worker_run` and `submission` rows are written once, at close, by the worker summary agent, and are immutable after capture; every later reference to a run (an `event_ref` row, an `attempt://` `evidence` locator) lives in another table. A run can propose live `fact` rows for the target but never writes them. Scoring and integration are orthogonal: a run can match at 100 % and still lose the merge race — `integration` records which way the diff went, joined mechanically like the scores.

## Table `worker_run`

**worker_run**

```
id: worker_run id  # Primary key
target_id: target id  # FK → target; the one target the run worked on
goal: string  # What the run set out to do
baseline: object  # Copied from the runtime before the first submission; the summary agent never restates it
  score: number  # Fuzzy match percentage before the first submission
  validation_refs: sequence  # Refs to the runtime validation results the score came from
run_id?: string  # Runtime provenance; copied verbatim from the runtime
worker_state_id?: string  # Runtime provenance; copied verbatim from the runtime
final_outcome: match | improvement | no_change | error  # Must agree with the last submission's `score` against `baseline.score`; this is the only place an outcome is stored
error_type?: build_failure | tool_failure | timeout | worker_crash  # Why `final_outcome` is `error`; null otherwise
integration?: integrated | conflicted | null  # Whether the run's diff landed in the tree: derived deterministically at run close from run state's integration results — `conflicted` when conflict paths or failure reasons exist or the outcome was resolved or dropped, `integrated` when it applied cleanly; null when nothing was integrated. Joined mechanically like the scores — the summary agent never emits it; the attempts importer backfills it on existing runs
integration_detail?: object  # The integration record behind `integration`, derived by the same rule from the run-state `worker_output_integrations` / `integration_outcomes` rows; null when run state holds no integration result for the run
  status: string  # The run-state integration status (`applied`, `resolved`, `dropped`, …)
  disposition?: string  # The run-state disposition, when one was recorded
  conflict_paths: sequence  # Files whose hunks conflicted; the target card shows up to 10
  failure_reasons: sequence  # Why the integration failed, when it did
  resolved_at?: timestamp  # When the conflict was resolved or dropped
started_at: timestamp  # When the run began
ended_at?: timestamp  # Absent when the run ended in an `error` that left no scored submission
closed_at: timestamp  # When the run closed and the row was captured; the row is written once, here
```

```json
{
  "id": "wr-ftCo_800BFFD0-0008",
  "target_id": "tgt-ftCo_800BFFD0",
  "goal": "Push ftCo_800BFFD0 (main/melee/ft/ftcommon) from 91.2 fuzzy to a full match",
  "baseline": {
    "score": 91.2,
    "validation_refs": [
      "val_ftCo_800BFFD0_e10r12"
    ]
  },
  "run_id": "run-epoch10-2026-08-28",
  "worker_state_id": "ws_7f3a9c",
  "final_outcome": "improvement",
  "error_type": null,
  "integration": "integrated",
  "integration_detail": {
    "status": "applied",
    "disposition": null,
    "conflict_paths": [],
    "failure_reasons": [],
    "resolved_at": null
  },
  "started_at": "2026-08-28T14:02:11Z",
  "ended_at": "2026-08-28T14:31:47Z",
  "closed_at": "2026-08-28T14:31:47Z"
}
```

- Immutable after capture: written once, at close, and no field is ever updated. Every later reference (a ledger event's `event_ref`, an `attempt://` `evidence` locator) lives in another table.

- `integration` is orthogonal to `final_outcome`: a run can close at match and still lose the merge race. A `conflicted` run stays a full run object; the row carries the flag and `integration_detail` (status, disposition, conflict paths, failure reasons, resolved_at), and the target card shows a conflicted run with up to 10 of its conflict paths. No `event` row is written for it.

## Table `submission`

**submission**

```
id: submission id  # Primary key
worker_run_id: worker_run id  # FK → worker_run; the run the submission belongs to
seq: integer  # Submission order within the run, 1-based
description: string  # What this submission did and what the deterministic result showed; composed from the summarizer's approach and outcome_reasoning
hypothesis?: string  # Unused by the summarizer flow; null on every row
score: number  # The fuzzy match percentage the submission got
submitted_at: timestamp  # When the submission was scored
runtime_ref?: string  # Id of the run-state artifact holding the submission's diff and transcript; runtime, outside the store
```

```json
[
  {
    "id": "sub_01J9WMQ4T8_01",
    "worker_run_id": "wr-ftCo_800BFFD0-0008",
    "seq": 1,
    "description": "Submitted the slice untouched to confirm the baseline before changing anything",
    "score": 91.2,
    "submitted_at": "2026-08-28T14:05:03Z",
    "runtime_ref": "rs_run-epoch10_ftCo_800BFFD0_0002"
  },
  {
    "id": "sub_01J9WMQ4T8_02",
    "worker_run_id": "wr-ftCo_800BFFD0-0008",
    "seq": 2,
    "description": "Replaced the inline float compare with __fabsf and reordered the guard branches",
    "score": 94.6,
    "submitted_at": "2026-08-28T14:18:40Z",
    "runtime_ref": "rs_run-epoch10_ftCo_800BFFD0_0003"
  },
  {
    "id": "sub_01J9WMQ4T8_03",
    "worker_run_id": "wr-ftCo_800BFFD0-0008",
    "seq": 3,
    "description": "Hoisted the ftCo_800BFFD0 damage-vector load above the loop. The improved but inexact result showed load placement mattered without being the whole regalloc story.",
    "score": 93.1,
    "submitted_at": "2026-08-28T14:29:55Z",
    "runtime_ref": "rs_run-epoch10_ftCo_800BFFD0_0004"
  }
]
```

- Every submission is a real scored try: `runtime_ref` resolves to the run-state artifact of a scored submission of this run. `description` narrates what the try did and what its deterministic result showed; deterministic values live only in their own columns.

- One documented exception to written-once: rows migrated from orchestrator run state landed with a templated `description`; the historical re-narration backfill rewrites it exactly once (guarded by the run's `run_narrative` row not yet existing), after which the row is immutable again. The `hypothesis` column is unused by the summarizer flow and stays null.

## Table `run_narrative`

**run_narrative**

```
worker_run_id: worker_run id  # Primary key; FK → worker_run
summary: string  # Narrative account of the approach, changes in direction, and what the run established
notable_observations: json array  # [{observation, reusable_when}] — reusable facts, tactics, failed paths, and constraints grounded in the run's evidence
narrative: json  # The complete validated model output object, stored lossless for audit and search
produced_by: 'live' | 'backfill'  # Which writer narrated the run: the run-close job or the historical re-narration backfill
created_at: timestamp  # When the narrative row was written
```

```json
{
  "worker_run_id": "wr-ftCo_800BFFD0-0008",
  "summary": "The worker isolated load placement as the likely cause of the remaining mismatch; the submitted rewrite improved the result without closing the diff, so load placement mattered but was not the whole explanation.",
  "notable_observations": [
    {
      "observation": "Load placement changed the generated register lifetime but did not resolve the complete mismatch.",
      "reusable_when": "A related target diverges around a loop-carried value and a simple hoist improves code generation without reaching exact."
    }
  ],
  "narrative": "{ ...the full validated model output object, lossless... }",
  "produced_by": "live",
  "created_at": "2026-08-28T14:32:11Z"
}
```

- The summarizer emits exactly one narrative-only JSON object: `run{summary}`, `submissions[{submission_id, approach, outcome_reasoning}]`, and `notable_observations[{observation, reusable_when}]`. The join to submission rows is by the echoed `submission_id`: each entry carries its digest submission's id verbatim, the validator requires exact set equality with the digest, and any mismatch rejects the whole output. `approach` plus `outcome_reasoning` compose `submission.description`. Scores, sequence numbers, runtime references, `final_outcome`, and `baseline` are joined mechanically after validation and are never model-emitted; `submission_id` is the one deterministic key the model echoes.

- Historical re-narration: the mechanically migrated runs predate the summarizer, so `kg2-renarrate` replays each transcript-bearing run through the summarizer as a one-time documented enrichment — rewriting the templated `submission.description` in place and inserting `run_narrative` with `produced_by = 'backfill'`. The backfill is queue-silent: it advances no watermark and enqueues no `run_closed` index task; the librarian consumes historical narratives in its own target-by-target backfill. Runs with no surviving transcript stay unnarrated.

## Enum `worker_run.final_outcome`

| `final_outcome` | Meaning (`baseline.score` to the last `submission.score`) | `error_type` |
| --- | --- | --- |
| `match` | The last submission reached the target's match goal and the hard gates pass | `null` |
| `improvement` | The last `score` is above `baseline.score`; the goal was not reached | `null` |
| `no_change` | The last `score` did not improve on `baseline.score`; a final score below the baseline is also `no_change` | `null` |
| `error` | The run could not stand on a scored submission | `build_failure` | `tool_failure` | `timeout` | `worker_crash` |

`pull_request.outcome` uses the same enum, judged from the PR's effect on the target rather than from scored submissions.

## Who writes

| Party | Reads | Writes | Never |
| --- | --- | --- | --- |
| Worker | Its task, the target card, its own submissions and tools | Code and the submissions the runtime scores | Sees the report contract; writes any row here |
| Worker summary agent | Submissions and the transcript, once at the end of the run, from a single prompt | The `worker_run` row and its `submission` rows, plus a proposal for the librarian: facts and the evidence behind them | Writes any `fact` row; edits runtime facts; inserts an `event` row — good news is never a ledger event; emits `integration` — it is joined mechanically, like the scores |
| Runtime | — | The scored submissions: `score`, `submitted_at`, `runtime_ref` artifacts, the `baseline`, `run_id`, `worker_state_id`, and the integration results that `integration` and `integration_detail` are derived from at close | Interprets; these are read-only inputs the summary cannot contradict |
| Librarian | The `worker_run` and `submission` rows, the proposal, the target's `event` rows, and the live facts' `evidence` rows | Overwrites the affected live `fact` rows in place, and replaces each fact's `evidence` rows with the new citations | Reads raw worker tool traffic; edits anything on the run; inserts an `event` row |
| Human | The target's knowledge record view and the runs its evidence cites | A `note` event in the target's ledger; anything about the facts themselves is a proposal for the librarian | Touches the run; writes a `fact` row directly |

| Summary-agent rule | Check |
| --- | --- |
| Every submission is a real scored try | `submission.runtime_ref` resolves to the run-state artifact of a scored submission of this run; a claimed try no submission scored is dropped or folded into the nearest submission |
| Outcomes agree with the scores | `final_outcome` matches the last `submission.score` against `baseline.score`; `error_type` is set exactly when `final_outcome` is `error` |
| Runtime facts are copied, not restated | `baseline`, `score`, `submitted_at`, `runtime_ref`, `run_id`, `worker_state_id` come from the runtime verbatim |
| Hypotheses stay labelled | Anything the transcript claimed but no submission tested goes in `submission.hypothesis`, not in `description` or `final_outcome` |
| Integration is joined, not judged | `integration` and `integration_detail` are derived from the run-state integration results, never from the summary prompt; a `conflicted` run stays a full run object the next worker sees on the card, with its conflict paths — no `regression` event is written |
| Proposals stay proposals | A fact the run proposes is not on the page until the librarian overwrites the fact row with it; the proposal names this `worker_run.id` so the librarian can cite it |
| Narrative fields only | The model emits `run`, `submissions`, and `notable_observations` narrative fields and nothing deterministic except the echoed `submission_id` join key; the validator requires emitted ids to equal the digest's ids exactly |
| Historical re-narration stays queue-silent | `kg2-renarrate` writes `run_narrative` and the one-time submission fill but never advances the `attempt` watermark or enqueues a `run_closed` index task |

## Example — proposed facts and the fact overwrite

```process-outline
The summary agent writes and proposes
     -> Inserts the `worker_run` row and its `submission` rows, one per scored try; `final_outcome` from the last `score` against `baseline.score`.
     > No `event` row is inserted: good news lives in `target_status` and the submissions themselves.
     -> For each reusable thing the run learned, its proposal carries a proposed `Fact` (`value`, type, a `rationale` arguing for it, and the code-span or submission evidence behind it).
     > The proposal is input for the librarian, not a row. The run is complete and immutable from here.
The librarian reads the run
     -> Reads the `worker_run` and `submission` rows, the proposal, the live `fact` rows for `worker_run.target_id`, and the target's `event` rows.
     > May add fact proposals of its own or search the code graph for subjects worth connecting with curated `link` rows; the run does not change.
     -> A failed interpretation stays on the run side: the `submission` rows record the `hypothesis` and the scores that contradicted it; it never becomes a fact.
The librarian overwrites live `fact` rows
     -> Each affected fact row is overwritten in place — Facts added, reworded, or cleared — and each fact's `evidence` rows are replaced in the same write with the new citations.
     > A run outcome never becomes a Fact by itself; only a written claim on the page does.
The card is rebuilt
     -> The derived ledger view shows first — submissions joined to their worker runs, merged with the pull requests and events, newest first; the page's Facts show under "what we think this is"; `target_status` is written by the scored report.
```

## Foreign keys out

| From | To | Cardinality | Meaning |
| --- | --- | --- | --- |
| `worker_run.target_id` | `target` | Exactly one | The target worked on |
| `submission.worker_run_id` | `worker_run` | Exactly one; one or more submissions per run | The run the submission belongs to |
| `submission.runtime_ref` | Run-state artifact (runtime, outside the store) | Zero or one | The submission's diff and transcript; read-only |
| `worker_run.run_id`, `worker_run.worker_state_id` | Runtime run and worker state | One each | Read-only provenance; never used as a join key to find ledger rows |

## Foreign keys in

| From | To | Meaning |
| --- | --- | --- |
| `event_ref.ref_id` (`ref_kind` `worker_run`) | `worker_run` | A ledger event that names this run; only `note` events are written today, so such refs are rare |
| `evidence.locator` (`attempt://` grammar) | `worker_run` | An evidence row whose locator matches `attempt://run/<worker_run.id>[/submission/<seq>][/transcript/<span>]` resolves into this run — by grammar, not a foreign key; worker runs and their submissions are the attempts knowledge source |

## Related

- Target Ledger — the three entry types and the derived ledger view these tables feed.

- Pull Requests — the reconstructed ledger entry an external PR becomes; no trace, no submissions.

- Events — the `note` rows a human may add; integration outcomes live on the run row, not on an event.

- Fact — the table proposed facts land in, and how a fact overwrite happens.

- Knowledge Record — the assembled per-subject view a written fact surfaces on.

- Evidence, Confidence, and Lifecycle — evidence resolution, contradiction, and staleness rules applied when facts are overwritten.



# docs/10-system-design/40-knowledge/20-record-contracts/30-target-ledger/20-pull-requests

PULL REQUEST — One pull_request row per external PR per subject it touched: a maintainer or contributor change, imported after the fact. The row is reconstructed — no worker trace exists — and its subject follows the attribution the archive supports: a `function` or `data` target when the CI report comment names the exact items with before/after scores, or the `translation_unit` entity when only the diff's file paths are known (every PR before the CI bot existed). There are no submission rows: scored tries belong to worker_run entries, and inventing them for a PR would fabricate a trace. Written once by the PR importer; immutable after capture.

## Table `pull_request`

**pull_request**

```
id: pull_request id  # Primary key
target_id?: target id  # The function or data target the PR is attributed to, when per-item attribution exists (CI report tables); exactly one of `target_id` and `entity_id` is set
entity_id?: entity id  # The `translation_unit` entity, when only diff-path attribution exists — the pre-CI-bot era; the subject XOR mirrors `fact`
pr_ref: string  # The PR's number or URL in the PR archive; outside the knowledge store
summary: string  # What the PR did to this target, deduced by the importer from the diff and discussion; a reconstruction, not a trace
outcome: match | improvement | no_change | error  # Same enum as `worker_run.final_outcome`, judged from the PR's effect on the target
merged_at: timestamp  # When the PR merged; orders the entry in the ledger view
```

```json
{
  "id": "pr-ftCo_800BFFD0-0003",
  "target_id": "tgt-ftCo_800BFFD0",
  "pr_ref": "melee#1482",
  "summary": "Rewrote the guard branches around the damage-vector compare using __fabsf; the diff matches the pattern the discussion calls the float-compare idiom and took the function from 74.0 to 91.2 fuzzy",
  "outcome": "improvement",
  "merged_at": "2026-07-03T19:41:22Z"
}
```

- Reconstruction, labeled: `summary` is the importer's deduction from the PR diff and discussion — the row never pretends a worker trace exists.

- No `submission` rows and no `runtime_ref`, `run_id`, or `worker_state_id`: there are no run-state artifacts to point at.

The reconstruction story: the PR importer reads the PR's diff and discussion through the summary prompt and deduces what was tried — which functions changed, what idiom the change applied, what the scored report said before and after. One deduced `summary` per target the PR touched; a PR touching several targets yields several `pull_request` rows. Discord is not imported this way: Discord material enters the system only as facts and evidence on entities, never as a ledger entry.

Enum `pull_request.outcome` is `worker_run.final_outcome`'s enum, documented in Worker Runs: `match` | `improvement` | `no_change` | `error`. It is judged from the scored report's before-and-after for the target, not from submissions.

## Who writes

| Party | Reads | Writes | Never |
| --- | --- | --- | --- |
| PR importer | The PR diff and discussion, and the scored report's before-and-after | `pull_request` rows, through the same summary prompt the worker summary agent uses | Fabricates a trace: no `submission` rows, no runtime provenance; edits a captured row |
| Librarian | `pull_request` rows and the `pr://` material they summarize | Live `fact` rows whose `evidence` rows carry `pr://` locators, when a PR taught something reusable | Writes or edits a `pull_request` row |
| Human | The ledger view | Nothing here; an annotation about a PR is a `note` event with a `pr` ref | Edits a captured row |

## Foreign keys out

| From | To | Cardinality | Meaning |
| --- | --- | --- | --- |
| pull_request.target_id / pull_request.entity_id | target / entity (kind translation_unit) | Exactly one of the two; one row per subject the PR touched | The subject the entry is attributed to; the ledger view selects target rows by target_id and folds in the unit entity's rows for context |
| pull_request.pr_ref | The PR in the PR archive (outside the store) | Exactly one | What to open to see the diff and discussion; read-only |

## Foreign keys in

| From | To | Meaning |
| --- | --- | --- |
| No table | `pull_request` | Nothing points at a `pull_request` row by id. The ledger view selects it by `target_id`; an `event_ref` with `ref_kind` `pr` names the PR outside the table, and a fact's `evidence` row points at this row through the `pr://<pull_request.id>[/comment/<n>]` locator grammar, not a foreign key |

## Related

- Target Ledger — the three entry types and the derived ledger view this table feeds.

- Worker Runs — the traced counterpart, and the `final_outcome` enum `outcome` shares.

- Events — where a human annotation about a PR lands, as a `note` with a `pr` ref.

- Evidence — the `pr://` locator grammar a fact's evidence rows use when a PR is the observation.



# docs/10-system-design/40-knowledge/20-record-contracts/30-target-ledger/30-events

EVENT — A target climbs through scored submissions; once it hits 100 % it is good. The stored event table exists for the exceptions and nothing else: one row per event, keyed to the target by `target_id`, append-only, ordered by `created_at`. Two kinds are defined — `regression`, a previously good state broken by something outside the worker's control, and `note`, a freeform human annotation — but only `note` rows are written today: the regression pathway was retired on 2026-09-02. A run whose diff failed to integrate carries that on its own `worker_run` row (`integration` `conflicted`, `integration_detail` with the conflict paths), where the next worker sees it on the card; reconciliation records nothing here. Good news is never an event: it is visible in `target_status` and the submissions themselves, and per-run echo rows do not exist. `event_ref` rows name the worker run, epoch, PR, or commit involved. Run telemetry (queue, retry, claim, heartbeat, epoch open and close) stays in run state; it is not part of the knowledge system and never becomes a row here.

## Table `event`

**event**

```
id: event id  # Primary key
target_id: target id  # FK → target; whose ledger
kind: regression | note  # What happened; see the enum table below — only `note` is written today
cause?: merge_conflict | upstream_change  # Why the regression; present exactly when `kind` is `regression`, absent on a `note`; see the enum table below
summary: string  # One line addressed to the next worker, templated from the event's refs — never model-written; shown highlighted in the derived ledger view
created_at: timestamp  # Ledger order; the derived view sorts newest first
```

```json
[
  {
    "id": "evt-000358",
    "target_id": "tgt-ftCo_800BFFD0",
    "kind": "regression",
    "cause": "merge_conflict",
    "summary": "you got 100 % in wr-ftCo_800BFFD0-0007, then the epoch-9 boundary merge conflicted on ftcommon.c and undid it; blend that run's code back into the current tree",
    "created_at": "2026-08-14T09:02:11Z"
  },
  {
    "id": "evt-000420",
    "target_id": "tgt-ftCo_800BFFD0",
    "kind": "note",
    "summary": "the guard order here mirrors ftCo_800C0F44; check that function's submissions before reworking the branches",
    "created_at": "2026-08-19T16:44:07Z"
  }
]
```

- `regression`: defined for a break outside the worker's control, its summary templated from the event's refs and addressed to the next worker. Retired 2026-09-02: nothing writes it; the example row above shows what such a row looked like, and a conflicted integration now lives on `worker_run.integration_detail`.

- No good-news rows: the 100 % match itself was never an event — it is visible in `target_status` and in the run's `submission` rows. Only the break, and human notes, are stored.

- `cause` `merge_conflict`: in the illustrative row, the epoch-9 boundary merge undid the run; an `upstream_change` regression carried a `commit` ref instead. The `note` row has no `cause`.

## Table `event_ref`

**event_ref**

```
event_id: event id  # FK → event; the event the ref hangs off
ref_kind: worker_run | epoch | pr | commit  # What `ref_id` names; see the enum table below
ref_id: id  # FK → worker_run when `ref_kind` is `worker_run`; otherwise an epoch, PR, or commit id outside the knowledge store
```

```json
[
  {
    "event_id": "evt-000358",
    "ref_kind": "worker_run",
    "ref_id": "wr-ftCo_800BFFD0-0007"
  },
  {
    "event_id": "evt-000358",
    "ref_kind": "epoch",
    "ref_id": "epoch-9"
  }
]
```

- `ref_kind` `worker_run` is the one real foreign key: `ref_id` names the run the event is about; the worker follows it into the `worker_run` and `submission` rows for the working code and its scored tries.

- `epoch-9`: lives in run state, outside the knowledge store; the ref is what to open to see the boundary, never how the target is found.

## Enum `event.kind`

| `kind` | What happened | `event_ref` rows | The next worker learns |
| --- | --- | --- | --- |
| `regression` | A previously good state was broken by something outside the worker's control: a boundary merge conflict undid the code, or an upstream change broke the match — `cause` records which; the target is requeued for the next epoch. Retired 2026-09-02: no writer inserts it — a failed integration is `worker_run.integration_detail`, and an upstream break shows in `target_status` and the drift gate | A `worker_run` ref, plus an `epoch` ref for a boundary conflict or a `commit` ref for an upstream break | Nothing from this table any more: the conflicted run on the card carries the conflict paths, and the worker blends that run's code back in instead of re-deriving the match |
| `note` | A human wrote something down | Whatever the human cited | Whatever the human wanted the next worker to know |

## Enum `event.cause`

| `cause` | The break | Inserted by | Ref alongside the `worker_run` ref |
| --- | --- | --- | --- |
| `merge_conflict` | The run's diff failed to integrate: upstream moved, or another worker's merge landed first on the file | Nothing today; formerly the run-loop at integration failure — now `worker_run.integration_detail` | An `epoch` ref |
| `upstream_change` | An upstream change broke a formerly matched target | Nothing today; formerly checkout reconciliation — reconciliation records nothing in `event` | A `commit` ref |

An enum, not prose: both former writers were deterministic — no model sat in the failure path — so the cause was known mechanically at insert and the templated summary restated it. Neither writer inserts rows any more.

## Enum `event_ref.ref_kind`

| `ref_kind` | `ref_id` names | In the knowledge store |
| --- | --- | --- |
| `worker_run` | A `worker_run` row | Yes; a real foreign key |
| `epoch` | The epoch or boundary in run state | No |
| `pr` | A PR in the PR archive | No |
| `commit` | An upstream commit | No |

## Who appends

| Party | Inserts | When | Never |
| --- | --- | --- | --- |
| Run-loop | Nothing | — | A `regression` row (retired 2026-09-02); a conflicted integration lands on `worker_run.integration` and `integration_detail` instead |
| Checkout reconciliation | Nothing | — | A `regression` row (retired 2026-09-02); guesses a mapping; enqueues a task |
| Human | `note` | Any time | Removes or rewrites a row; the table is append-only |
| Worker summary agent | Nothing | — | A per-run echo row; the `worker_run` and `submission` rows are its whole write |
| Librarian | Nothing | — | Writes to the `event` table; it reads it and writes live `fact` rows instead |

The ledger a worker reads is a derived view, never rows: `submission` rows joined to their `worker_run` rows, merged with the `pull_request` rows and the `event` rows, newest first, conflicted runs highlighted with their conflict paths (up to 10). The target card shows this view FIRST. An event is one line — `created_at`, `kind`, `summary`, and its `event_ref` ids — and the worker follows an event's `worker_run` ref into the `worker_run` and `submission` rows when it needs the scored tries. Storing an event does not make it knowledge: what a break taught becomes a live `fact` row for the target — the librarian overwrites the row in place, and the fact's `evidence` rows carry the citations: `attempt://` and `pr://` locators into the runs and PRs, never the event row itself.

## Example — 100 % match, then a conflicted integration at the boundary

```process-outline
The run closes at 100 % match
     -> The summary agent inserts `worker_run` A for target X and its `submission` rows; `final_outcome` `match`.
     > No `event` row: the good news is visible in `target_status` and in A's submissions.
The boundary merge conflicts on X's file
     -> The run-closed writer records the result on A itself: `integration` `conflicted` and `integration_detail` { `status` `resolved`, `disposition`, `conflict_paths` ["src/melee/ft/ftcommon.c"], `failure_reasons` [], `resolved_at` }, derived from run state's integration rows. No `event` row is inserted; the run-loop requeues X for the next epoch.
     > No agent attempts an in-flight fix. The conflicted hunks, the queue state, and the requeue are run state, not rows here.
The next scored report upserts `target_status` for X; the ledger view still shows A as the latest run.
The next worker reads X's derived ledger first
     > Newest entry: A, shown conflicted with its conflict paths. It follows A's `submission` rows, takes the working code, and blends it into the current tree instead of re-deriving it.
The librarian reads A (its `integration_detail` is in the run_closed digest) and X's `note` rows; if the break revealed reusable knowledge, it overwrites the affected live `fact` rows for X in place. A confident claim about why the match was fragile is a `state_behavior` or `purpose` fact with a rationale and evidence citations.
```

## Foreign keys out

| From | To | Cardinality | Meaning |
| --- | --- | --- | --- |
| `event.target_id` | `target` | Exactly one; zero or more events per target | Whose ledger; the derived view selects the events by this column |
| `event_ref.event_id` | `event` | Exactly one; zero or more refs per event | The event the ref hangs off |
| `event_ref.ref_id` | `worker_run` when `ref_kind` is `worker_run`; an epoch, PR, or commit id outside the store otherwise | Exactly one | What to open to see the whole story; never used to find the target |

## Foreign keys in

| From | To | Meaning |
| --- | --- | --- |
| `event_ref.event_id` | `event` | The refs hanging off this event |
| No other table | `event` | Nothing points at an event by id, and an event is never cited as evidence directly. The events are read through the derived ledger view; a fact's `evidence` rows point at the refs behind the event — `attempt://` and `pr://` locators into the worker run or PR its `event_ref` rows name |

## Related

- Target Ledger — the three entry types and the derived ledger view the events feed.

- Worker Runs — the `worker_run` and `submission` rows an event's `worker_run` ref opens, and where integration outcomes live (`integration`, `integration_detail`).

- Targets — the identity changes checkout reconciliation detects, and the `target_status` row good news shows up in.

- Record Contracts — the full table list, the foreign-key table, and the derived views.



# docs/10-system-design/40-knowledge/20-record-contracts/30-target-ledger

TARGET LEDGER — Everything that has happened on a target. A target climbs through scored submissions; once it hits 100 % it is good. The agent reads the whole ledger before touching the target: every traced run, every imported PR, every exception. Three stored entry types feed it — `worker_run` (a traced engagement by a worker, with its `submission` rows one per scored try and its integration outcome — `integration`, `integration_detail` — on the same row), `pull_request` (an external PR that touched the target, reconstructed by the importer), and `event` (the exception record: human `note` rows; the `regression` kind is defined but retired 2026-09-02, and nothing writes it). There is no shared parent table and no origin enum: each entry type is its own table, and the word "attempt" survives only as informal prose. Good news is never an event row: it is visible in `target_status` and in the runs and PRs themselves.

| Entry type | What it records | Written by | Trace |
| --- | --- | --- | --- |
| `worker_run` + `submission` | A harness worker's engagement with the target: goal, baseline, one row per scored try, final outcome, and the integration outcome (integrated or conflicted, with conflict paths) | The worker summary agent, once at close; immutable | Full: run-state artifacts, transcript, scored submissions |
| `pull_request` | An external PR that touched the target: one deduced summary and an outcome, honestly labeled as reconstruction | The PR importer; immutable | None: no worker trace exists, so no `submission` rows |
| `event` + `event_ref` | The exceptions: a human `note`; the `regression` kind is retired (2026-09-02) and nothing writes it | A human (notes); append-only | Refs: `event_ref` rows name the worker run, epoch, PR, or commit involved |

The ledger a worker reads is a derived view, never rows: the union of the three entry types for one target, chronological, newest first, conflicted runs highlighted with their conflict paths — `submission` rows joined to their `worker_run` rows, merged with the `pull_request` rows and the `event` rows. Nothing stores the union. The target card shows this view first, and it is where the card reads the target's latest activity — `target_status` carries no last-run pointer. Per-run echo rows do not exist; the `event` table holds only what the climb cannot tell on its own.

Discord is never a ledger entry. Discord material enters the system only as facts and evidence on entities — mostly patterns and game concepts — via the importer; it never becomes a `worker_run`, `pull_request`, or `event` row.

> **decision: Invariant — operational, not knowledge** — Everything in this section is the operational world: what happened to the target, when, and how it scored. Storing a ledger entry does not make it knowledge. Becoming knowledge means the librarian writes a live `fact` row with a `rationale` and cited evidence — the fact's `evidence` rows. Worker runs, submissions, and pull requests can be cited through `attempt://` and `pr://` locators but never speak as facts; an event is never cited directly — a citation points at the run, PR, or commit its `event_ref` rows name.

## Sections

- Worker Runs — the `worker_run` and `submission` tables: traced runs, scored tries, outcomes, and the summary-agent capture rules.

- Pull Requests — the `pull_request` table and the reconstruction story: what the importer deduces when no trace exists.

- Events — the `event` and `event_ref` tables: human notes, and the retired `regression` kind.

## Related

- Record Contracts — the full table list, the foreign-key table, and the derived views.

- Targets — the subject every ledger entry hangs off, and the `target_status` row good news shows up in.

- Fact — where what a run taught lands when the librarian writes it down.



# docs/10-system-design/40-knowledge/20-record-contracts

A `target` is one real thing from the game build report: one workable item — a function or a scored data section, exactly as `build/GALE01/report.json` lists it. An `entity` is one curated non-report subject: a file, a struct, a struct field, a game concept, a parameter, or a pattern. What we think a subject is lives in `fact` rows — one row per live claim, each carrying the rationale and evidence behind it — and its knowledge record is not a table: it is the assembled view of those facts. Everything else (links, worker runs, submissions, pull requests, events, evidence) is a row in its own table, linked around the subjects by ids and resolved by joins. This is a linked database, not a set of nested records: no table embeds a list of another table's rows, every cross-reference is a foreign key or a typed locator into a knowledge source, and every claim is a `fact` row, not a string in a list. Each page in this section reads like a schema reference: one state-shape block per table, its enums, its foreign keys out and in, and who writes it.

## What each table group is

| Table group | In one sentence | Owner doc |
| --- | --- | --- |
| target, target_status | target rows are the workable items of the GALE01 build report (build/GALE01/report.json): every function item and every scored data section (except .text) is exactly one row, and there is no row that is not a report item. target.kind is function | data; a translation unit is never a target — workers match function by function. The set of rows changes only with report_revision; every column is mechanically derived by reconciliation; no LLM writes one. target_status is the latest scored report's match %, linked flag, size, and content hash for that row, 1:1, overwritten each report; per-unit match % is the derived unit view. | Targets |
| entity | One row per non-workable subject. Mechanical kinds (translation_unit | struct | struct_field | parameter) are auto-generated from the report and checkout; curated kinds (game_concept | pattern) are librarian-admitted. Pure identity, pinned by locator; everything debatable — the display name included — is a fact on it. Two entities found to be the same thing merge: the loser stays as a tombstone whose merged_into_id names the winner. | Entities |
| `link` | The one generic subject-to-subject join: exactly one from-subject and one to-subject (each a `target` or an `entity`), a short free-text `role`, a one-line `why`, and its own evidence pointer — a `kind` + `locator` into a knowledge source — that showed it. Curated by the librarian, never written from the report; observed containment stays a derived view. | Links |
| `fact`, `evidence` | One `fact` row per live claim about exactly one target or entity: `type`, `value`, `confidence`, `rationale`, with citations as its own `evidence` rows — one per pointer into a knowledge source, each a `kind` + `locator` with a per-pointer `why`. Overwritten in place; the same write replaces the fact's evidence rows wholesale. | Fact, Evidence |
| `worker_run`, `submission` | One `worker_run` row per traced engagement by a worker on a target, immutable after capture; its `submission` rows are the scored tries, one per real score, written once with the run. Discord material never becomes a ledger entry; it enters the system only as facts and evidence on entities. | Worker Runs |
| `pull_request` | One reconstructed ledger entry per external PR per target it touched: no worker trace exists, so the PR importer deduces what the PR did from its diff and discussion — one `summary` and an `outcome`, honestly labeled as reconstruction; no `submission` rows. | Pull Requests |
| `event`, `event_ref` | The exception record: one `event` row per human `note`. The `regression` kind — something outside the worker's control broke a formerly good state — is retired 2026-09-02 and nothing writes it; a failed integration is `worker_run.integration` and `integration_detail`. Good news is never an event. `event_ref` rows point at the worker run, epoch, PR, or commit involved. Append-only. | Events |

## Tables

| Table | Purpose | Owner doc |
| --- | --- | --- |
| `target` | One row per GALE01 report item; identity only, no status, no meaning | Targets |
| `target_status` | Match %, linked, size, content hash for one target; written only by the latest scored report; the only edited-in-place table | Targets |
| `entity` | One row per non-workable subject (`translation_unit` | `struct` | `struct_field` | `game_concept` | `parameter` | `pattern`): pure identity, pinned by locator. The mechanical kinds are extracted from the report and checkout; the larger-idea kinds are curated. Everything debatable about it — including its display name — is a fact on it. Two entities found to be the same thing merge: the loser stays as a tombstone whose merged_into_id names the winner. | Entities |
| `link` | The one generic join: subject to subject with a `role`, a `why`, and an inline `kind` + `locator` evidence pointer (formerly the specialized `entity_target` and `related_target` tables) | Links |
| `fact` | One live claim about exactly one subject: `type`, `value`, `confidence`, `rationale`, cited through its `evidence` rows; overwritten in place | Fact |
| `evidence` | One fact-owned citation: a `kind` + `locator` pointer into a knowledge source (`pr` | `discord` | `attempt` | `wiki` | `code`) with a per-pointer `why`; written in the same write as its fact, replaced wholesale on overwrite, deleted with it; reverse lookup is an indexed query on (`kind`, `locator`) | Evidence |
| `worker_run` | One traced worker run on one target, and how it ended; immutable | Worker Runs |
| `submission` | One scored try within a worker run: description, hypothesis, score; written once with the run | Worker Runs |
| `run_narrative` | The narrative half of one worker run: summary, notable observations, the full narrative JSON; one row per run, produced_by live at run close or backfill by renarration | Worker Runs |
| `pull_request` | One reconstructed external PR entry per target or translation-unit entity it touched: deduced summary and outcome, no trace; immutable | Pull Requests |
| `event` | One exception in the target's ledger: a human note (the regression kind is retired; nothing writes it); append-only | Events |
| `event_ref` | Join from an event to the worker run, epoch, PR, or commit it is about | Events |

## Linkage map

<!-- canvas: ./assets/canvases/record-linkage-map.canvas.json title="Record linkage map" -->

## Foreign keys

| From | To | Cardinality | Meaning |
| --- | --- | --- | --- |
| `target.unit_entity_id` | `entity` (kind `translation_unit`) | Exactly one on every row | The translation_unit entity the item belongs to; through it, the source file |
| `target_status.target_id` | `target` | Exactly one; PK, one row per target (1:1) | The target the status row describes |
| `entity.parent_entity_id` | `entity` | Zero or one; containment, e.g. `struct_field` → `struct` | The entity that contains this one |
| `entity.merged_into_id` | `entity` | Zero or one; set exactly when `identity_status` is `merged` | The surviving entity; old references resolve through the tombstone |
| `fact.target_id` / `fact.entity_id` | `target` / `entity` | Exactly one of the two is set | The subject of the claim |
| `evidence.fact_id` | `fact` | Exactly one; one or more rows per live fact, replaced wholesale on overwrite | The claim the citation belongs to; rows are deleted with their fact |
| `evidence.kind` + `evidence.locator` | A knowledge-source row, by the kind's closed locator grammar — not a foreign key | Exactly one store row per locator | The pointed-at material the claim's rationale argues from; `digest` pins the span when `kind` is `code` |
| `link.from_target_id` / `link.from_entity_id` | `target` / `entity` | Exactly one of the two is set | The subject the link hangs off |
| `link.to_target_id` / `link.to_entity_id` | `target` / `entity` | Exactly one of the two is set | The subject it points at |
| `link.kind` + `link.locator` | A knowledge-source row, by the kind's closed locator grammar — not a foreign key | Exactly one | What showed the connection; a link carries its own pointer and never references the evidence table |
| `worker_run.target_id` | `target` | Exactly one; zero or more runs per target | The target the run worked on |
| `submission.worker_run_id` | `worker_run` | Exactly one; one or more submissions per run | The worker run the scored try belongs to |
| run_narrative.worker_run_id | worker_run | Exactly one; PK, at most one narrative per run (1:1) | The run the narrative explains |
| pull_request.target_id / pull_request.entity_id | target / entity | Exactly one of the two is set; zero or more entries per subject | The target, or the translation-unit entity, the reconstructed PR entry is about |
| `event.target_id` | `target` | Exactly one; zero or more entries per target | Whose ledger the entry is in |
| `event_ref.event_id` | `event` | Exactly one; zero or more refs per entry | The entry the ref hangs off |
| `event_ref.ref_id` | `worker_run` when `ref_kind` is `worker_run`; an epoch, PR, or commit id outside the store otherwise | Exactly one | What to open to see the whole story |

## Derived views

These are queries, never rows. Nothing below is stored, and anything that looks like one of them in a table is a bug.

| View | Query | Used for |
| --- | --- | --- |
| Unit view | target GROUP BY unit_entity_id joined to the translation_unit entity, aggregating each member's target_status | Per-unit match % and editability. Neither file nor unit is a target kind, and neither stores a status row |
| Knowledge record | All live `fact` rows for one subject (`target` or `entity`), grouped by `type`; linked subjects one hop out via `link` with their own live facts; each fact's `evidence` rows joined through `evidence.fact_id`, their locators resolved into the knowledge sources at read time | The assembled page for a subject; a subject “has a knowledge record” when facts exist for it |
| Target ledger (worker-facing) | `submission` ⋈ `worker_run` for the target, merged with its `pull_request` rows and its `event` rows (`event_ref` resolved), newest first, conflicted runs highlighted with their conflict paths | The chronological story a worker reads; nothing stores the union, and no per-run echo rows exist |
| Target card (worker-facing) | `target` + `target_status` + every `link` row touching it + the linked entities + all live `fact` rows for the target and those entities (with confidence, evidence resolved) + the target-ledger view above, newest first with conflicted runs highlighted with their conflict paths + pattern entities one hop out via `link` | What a worker reads before touching the target; ledger first, latest activity included |
| Search chunks, rankings, dashboards | Rebuilt from the tables above | Retrieval; never canonical |

## Who writes what

| Table | Written by | Checked by |
| --- | --- | --- |
| `target` | Build-report reconciliation: one row per report item, diffed against the stored rows on each new `report_revision`; rebuildable from scratch byte-for-byte, and never an LLM | Not applicable; identity is observed, not reviewed |
| `target_status` | The latest scored report; overwritten each time | Not applicable |
| `fact`, `evidence` | Librarian only, folding in a worker summary agent's proposal; a fact is overwritten in place, and its `evidence` rows are written in the same write, never independently — replaced wholesale on overwrite, deleted with a clear | No gate. The resolver checks every cited locator against its kind's closed grammar and store row, and the `digest` for `code` spans; a wrong fact is overwritten on the next pass. Standards gate PR merges, not knowledge |
| `entity`, `link` | Librarian; curated, never the report, never reconciliation. Pattern entities are proposed by the mismatch-patterns and opseq-similarity builders and admitted by the librarian | No gate; a bad merge leaves a tombstone that still resolves |
| `worker_run`, `submission` | Worker summary agent, once, at run close | Not applicable; immutable after capture |
| `pull_request` | The PR importer, deducing what the PR did from its diff and discussion through the same summary prompt; one row per target the PR touched | Not applicable; immutable after capture |
| `event`, `event_ref` | `note` rows by a human; nothing writes `regression` rows (retired 2026-09-02) | Not applicable; append-only, a row is never edited or removed |
| Code graph (not a table) | Graph builders call-graph-edges, ghidra-xrefs, opseq-similarity, siblings; rebuilt from the checkout | Not applicable; a search surface, never stored here |

## Worked example — 100 % match, then a merge conflict

```process-outline
Worker run closes
     -> The worker summary agent inserts one `worker_run` row A (`target_id` X, `baseline.score` 71, `final_outcome` `match`) and three `submission` rows, one per scored try, each with its `seq`, `score`, and `runtime_ref`.
     > Nothing lands in `event`: the run went well, and good news is never a ledger row — the climb is already visible in `target_status` and the submissions themselves.
     -> Its proposal for the librarian: an updated `purpose` fact for X ("clears the hitbox table on state entry", a `rationale` arguing from the final submission's diff, citing that submission as `evidence`). The proposal is not a row; A is complete and immutable.
Boundary merge conflicts
     -> The run-closed writer records the result on A itself: `integration` `conflicted` and `integration_detail` { `status` `resolved`, `conflict_paths` ["src/melee/ft/ftcommon.c"], `failure_reasons` [], `resolved_at` }, derived from run state's integration rows; no `event` row is inserted.
     > The conflicted hunks and the boundary's queue, retry, and claim state stay in run state; no table here holds them.
Status row updates
     -> The scored report upserts `target_status` for X: `match_pct` 100, `linked` false, `report_revision` and `updated_at` set; the latest run on X is read from the ledger view, not from a status column.
Next worker loads X's card
     -> The target-ledger view merges A's `submission` rows with X's events, newest first: A on top, shown conflicted with its conflict paths. Then `target_status` and X's live `fact` rows grouped by `type`. The worker blends A's working code into the current tree instead of re-deriving it.
Librarian overwrites the facts
     -> Reads A, its submissions, the proposal, and R; never the raw worker tool traffic.
     -> Overwrites X's live `purpose` fact in place (`value` as proposed, `confidence` 0.85, the `rationale` as proposed); the same write replaces its `evidence` rows, now pointing at the matched submission through an `attempt://` locator. A confident `state_behavior` fact records why the match was fragile: two files own halves of one table, so the boundary merge conflicted. R is not touched; A is not written to.
```

```json
{
  "fact": {
    "id": "fact-x-purpose-01",
    "target_id": "tgt-ftCo_800BFFD0",
    "entity_id": null,
    "type": "purpose",
    "value": "clears the hitbox table on state entry",
    "confidence": 0.85,
    "rationale": "the matched submission's diff zeroes the hitbox table in the state-entry block, and the score held at 100 % only once that loop ran before the dispatch",
    "updated_at": "2026-08-29T21:14:07Z"
  },
  "evidence": [
    {
      "id": "ev-000912",
      "fact_id": "fact-x-purpose-01",
      "kind": "attempt",
      "locator": "attempt://run/wr-000441/submission/3",
      "why": "the matched submission whose diff zeroes the hitbox table in the state-entry block",
      "captured_at": "2026-08-29T21:14:07Z"
    }
  ],
  "worker_run": {
    "id": "wr-000441",
    "target_id": "tgt-ftCo_800BFFD0",
    "final_outcome": "match",
    "integration": "conflicted",
    "integration_detail": {
      "status": "resolved",
      "disposition": null,
      "conflict_paths": ["src/melee/ft/ftcommon.c"],
      "failure_reasons": [],
      "resolved_at": "2026-08-29T20:41:52Z"
    }
  }
}
```
> **L13-20 (same write):** The citation row was written by the same write as its fact and is replaced wholesale on overwrite; nothing edits it separately, and it is deleted with the fact.

> **decision: Invariant — record separation** — A score improvement, regression, boundary invalidation, or worker completion is not a fact. It lives in a `worker_run`, `pull_request`, or `event` row and can be cited through `attempt://` and `pr://` locators — an event through the refs it names, never by its own id. Becoming part of what we think requires a `fact` row on the subject, written by the librarian, whose `rationale` argues from the sources its `evidence` rows point at — and a changed claim overwrites its row in place.

## Rules

| Rule | Meaning |
| --- | --- |
| Every locator matches its kind's closed grammar | An `evidence` row's or `link`'s `locator` matches its `kind`'s closed grammar and resolves to a knowledge-source row; the resolver rejects anything else. `digest` pins `code` spans only — the archival sources and attempts are immutable and cannot drift. Two facts citing the same material carry two evidence rows; the source row is the shared thing |
| Nothing from the code graph is stored | Calls, xrefs, references_data, contains, opseq analogs, and siblings are rebuilt from the checkout by the builders in `apps/server/src/core/knowledge/graph/builders` and searched on demand. A result that proved useful becomes a curated `link` row with a `role`, a `why`, and an inline `kind` + `locator` pointer; the rest stays in the graph |
| Ledger entries are immutable | `worker_run`, `submission`, and `pull_request` are written once at capture. Every later reference to a run (an `event_ref` row, an `attempt://` `evidence` locator) lives in another table |
| Facts overwrite in place | A `fact` is overwritten in place, and a clear deletes the row; nothing in this section revisions forward through a supersedes chain |
| Standards are a gate, not a table | The maintainers' merge rules gate PRs at review and ship time; they are not knowledge and are never searched per target |
| Judgment never writes identity | Every `target` column is derived from the build report by reconciliation; no librarian, worker, or summary agent writes one. Judgment lives only on the knowledge side: `fact`, `entity`, `link` |
| Run telemetry stays out | Queue, retry, claim, heartbeat, epoch open and close live in run state. Only what changes a target's story becomes an `event` row |

## Sections

- Core Objects — the anchors: `target` and `target_status` exactly as the build report enumerates them, curated `entity` subjects, and the one generic `link` join.

- Knowledge System — the claims: `fact` and its fact-owned `evidence` citation rows, the knowledge record as a derived view, and the closed locator grammar into the knowledge sources.

- Target Ledger — everything that has happened on a target: `worker_run` and `submission`, the reconstructed `pull_request` entry, the exception `event` rows (`note`; the `regression` kind is retired), and the derived ledger view a worker reads.

## Related

- Evidence, Confidence, and Lifecycle — acceptance, contradiction, staleness, and provenance rules.



# docs/10-system-design/40-knowledge/30-evidence-confidence-and-lifecycle

Confidence is a judgment about a specific claim, not a substitute for evidence. A claim is a `fact` row: `value` is the claim, `rationale` is the librarian's argument for it, `confidence` (0..1) says how sure we are, and the fact's `evidence` rows carry the citations the argument stands on — each a pointer into a knowledge source with a `why`. The librarian is the only writer of facts and evidence; a changed claim overwrites its live row in place, replacing its evidence rows wholesale. This page covers how confidence is assigned and revised, the gates every fact write passes, and what happens to facts and evidence as the target underneath them drifts, is reconciled, or fails to integrate.

## Evidence Resolution

An evidence row is a fact-owned citation — a typed `locator` into one of the knowledge sources, a `why` saying how the pointed-at record supports the claim, and — for `code` only — a `digest` of the span text. No content is snapshotted on the row; display resolves the locator into the source at read time. A row claims nothing itself, and citing a record does not mean it states the claim: the connection from observation to claim is the owning fact's `rationale`. The resolver checks every evidence row when the fact is written — the locator must match its `kind`'s closed grammar and resolve to a source row, and a `code` row's digest must match the span — and the drift flagger re-resolves `code://` locators later; the other sources are immutable and cannot drift.

| Source | Class | Locator resolves to |
| --- | --- | --- |
| `code://<revision>/<path>#L<start>-L<end>` | Operational | The span text in the checkout at the revision — no source row; the required `digest` pins the span text |
| `wiki://<wiki_section.id>` | Archival | A `wiki_section` row — the id encodes page, section, and mirror revision |
| `pr://<pull_request.id>[/comment/<n>]` | Archival | A `pull_request` row, optionally one comment of its archived discussion |
| `discord://message/<discord_message.id>` | Archival | A `discord_message` row |
| `attempt://run/<worker_run.id>[/submission/<seq>][/transcript/<span>]` | Operational | A `worker_run` row, optionally one submission or transcript span |

## Confidence Contract

Every fact is AI-inferred; the game is not decompiled, so nothing here is ground truth and there is no observed-versus-inferred category on a claim (formerly the `basis` column). `confidence` alone carries how sure we are. The number is a judgment, and everything it should be weighed against stays visible on the record itself rather than being folded into the number.

| Signal | Where it lives | Why it matters |
| --- | --- | --- |
| Claim confidence | `fact.confidence`, a 0..1 librarian judgment | Communicates belief strength; the `rationale` says where it comes from |
| Evidence count | The count of the fact's `evidence` rows | More citations give the reader more to check; count alone is not corroboration |
| Evidence diversity | Distinct `evidence.kind` values across the cited rows | Distinguishes corroboration from duplication; two rows resolving to the same (`kind`, `locator`) are one observation |
| Source profile | The mix of knowledge sources behind the citations: `code` and `attempt` versus `wiki`, `pr`, `discord` | Shows whether confidence stands on code or on interpretation |

## Fact Lifecycle

```process-outline
Derived
     -> The librarian derives a claim while indexing new material — a closed worker run, an imported PR, wiki or Discord material — and drafts `value`, `rationale`, `confidence`, and the evidence rows — each a locator into a knowledge source plus a `why`
Written
     -> The resolver checks every drafted evidence row — locator grammar, source-row existence, and the digest for `code` — and the claim becomes a live `fact` row under one subject and `type`, with its `evidence` rows written in the same write
Revised
     -> A changed claim overwrites the live row in place, replacing its `evidence` rows wholesale
Cleared
     -> A claim no longer believed is cleared: a plain row DELETE that removes the `fact` row and its `evidence` rows in the same write
```

There is no candidate queue, no dispute state, and no refuted record: a claim either is a live fact or it is gone. A tested interpretation that did not work never becomes a fact — it lives on the ledger side, in `worker_run` and `submission` hypothesis and outcome columns, and can be cited as `attempt://` evidence when a later claim leans on it.

## Write Gates

| Gate | Required behavior |
| --- | --- |
| Shape | All required fields and enumerated values validate; exactly one of `target_id` and `entity_id` is set |
| Anchor | The subject row exists; a claim is never reattached to a guessed replacement for a drifted target |
| Evidence | Every `evidence` row's locator matches its `kind`'s closed grammar and resolves to a source row — and a `code` row's digest matches the span; a citation that fails resolution blocks the write |
| Support | Each evidence row's `why` says what its record shows; the `rationale` must argue from those observations to the `value` |
| Deduplication | A changed claim overwrites its row rather than adding a neighbour; at most one live row per subject and `type` is enforced |
| Naming policy | An `inferred_name` fact is a guess and every worker-facing projection shows it as one, with its confidence; the `symbol` column on `target` stays the only name a worker may write into source |

## Drift, Reconciliation, and Integration Outcomes

Facts hang off subjects, and the report-derived subjects move. Reconciliation diffs each new report revision against the stored `target` rows by `stable_key` and `address`, and moves `identity_status` only through explicit rules — `current`, `moved`, `unresolved`, `retired`. A rename within a unit — one vanished key and one new key at the same address and kind, paired 1:1 — is continuity, not loss: the old row becomes `moved` with `moved_to_id` naming the successor, and its facts, evidence, and links are re-pointed at the successor in the same transaction. A vanished item is never deleted and never reattached to a guessed symbol. A changed `target_status.content_hash` alone is status, not identity: it never moves `identity_status`.

Code drift is caught by the deterministic flagger, not by reconciliation: at the checkout head it re-resolves each `code://` citation's path and span, recomputes the digest, and classifies it unchanged, drifted, or unresolvable — read-only, no model involved. Archival sources and attempt rows are immutable once ingested, so their locators cannot drift. The flagger runs inside the librarian's `pr_imported` and `run_closed` contexts, which carry per touched subject the compact drift report and `renamed_from` — the stable keys of rows whose `moved_to_id` points at it, so a fact re-pointed by rename continuity keeps its lineage. The consumer gate then re-runs the flagger after apply: clean completes the pass; drift left on the first attempt releases the task for one bounded retry; drift left after the retry completes with the warning recorded in the pass artifact — see Drift Gate. The flag never silently edits a fact — a drop or a re-cite is an ordinary librarian overwrite (which replaces the fact's evidence rows wholesale) or a clear (which deletes the fact and its evidence rows together). Drift itself never deletes knowledge: facts on a retired or unresolved target stay stored.

Integration outcomes live on the run row, not in knowledge. When a run's diff fails to integrate at the boundary, the run-closed writer records `integration` `conflicted` and `integration_detail` (status, disposition, conflict paths, failure reasons, resolved_at) on the `worker_run` row, derived deterministically from run state; the next worker sees the conflicted run, with its conflict paths, on the card. No `event` row is written — the `regression` kind is retired — and reconciliation records nothing in the ledger. The facts on the target do not change because the score did — the librarian revises a fact only when the claim about meaning changes. A later fact leans on a failed integration by citing the run through an `attempt://` locator; the outcome never speaks as a fact.

## Related

- Fact — the claim shape: value, rationale, confidence, and its evidence rows.

- Evidence — the fact-owned citation rows and the locator grammar into the knowledge sources.

- Knowledge Record — the derived view that assembles one subject's live facts.

- Targets — identity, drift, and the reconciliation rules this page follows.

- Target Ledger — where worker runs (with their integration outcomes) and imported PRs live.



# docs/10-system-design/40-knowledge/40-librarian-pathways/10-sync/10-pull-requests

PR IMPORTED — The pr pathway (`index_task.pathway` `pr_imported`). Fires when the PR importer — a small preprocessing agent — imports an external pull request. The importer archives the raw PR and its discussion into the `pr://` source and reconstructs the `pull_request` ledger row — touched files and targets, outcome, summary — through the same summary prompt the worker summary agent uses; no worker trace exists, so the row is a deduction from diff and discussion, never a fabricated trace. Pure enrichment: the librarian starts from what the PR touched, and the importer never writes facts. The librarian maps the diff to the targets and files it touched and updates their facts, citing `pr://`.

## Agents called

| Order | Agent | Does |
| --- | --- | --- |
| 1 | PR importer | A small preprocessing agent: archives the PR and its discussion as archival source rows; reconstructs the `pull_request` ledger row — touched files and targets, outcome, summary — through the same summary prompt the worker summary agent uses; advances the `pr` watermark; enqueues the index task. A deterministic pipeline around that one prompt; pure enrichment, never a fact writer |
| 2 | Librarian | Consumes the task: maps the diff to touched targets and files, reads the archived discussion, overwrites the affected live `fact` rows citing `pr://` |

## Librarian operation

The librarian reads the `pull_request` ledger row and the archived PR behind it. The subjects are the targets the diff touched, plus the `translation_unit` and `struct` entities the change reaches — mechanical rows the entity extractor has already inserted. Search: the structured PR surface (touched file/target, author) scopes the read, keyword over title, body, and archived discussion plus vector over discussion chunks surface what the discussion argued, and the code graph confirms what the diff changed in the checkout. The discussion is where PR knowledge concentrates — a maintainer explaining why an idiom matches is worth more than the diff alone.

Every write goes through the resolver. The affected live `fact` rows are overwritten in place, `evidence` rows replaced wholesale — `pr://<pull_request.id>[/comment/<n>]` locators into the row and the specific comments each claim stands on, with code-graph corroboration cited as `code://` where the checkout shows it. A discussion that connects subjects can add curated `link` rows. The `pull_request` row itself is immutable after capture; the librarian never edits it.

## Coverage

The PR importer advances the `pr` row of `source_watermark` — `position` is the imported PR number — and inserts one `index_task` with `pathway` `pr_imported` and a `payload` naming the `pull_request` row. The librarian claims and completes the task by its timestamps and stamps `subject_index_state` for each touched target and entity it passed over. PRs archived but not yet consumed are exactly the `pr_imported` tasks without `done_at`.

## Related

- Librarian Pathways — the pathway table, the agent roster, and the `indexing_state` shapes this pathway writes through.

- Sync — the between-runs phase this pathway belongs to.

- Pull Requests — the reconstructed `pull_request` ledger row and the summary-prompt reconstruction story.

- Pull Requests — the archival source: what `pr://` comment indices mean and the surface searched here.

- Fact — the claim shape the librarian overwrites.

- Evidence — the fact-owned citation rows replaced wholesale on every overwrite.



# docs/10-system-design/40-knowledge/40-librarian-pathways/10-sync/20-discord

DISCORD SYNC — The Discord half of the sync phase (`index_task.pathway` `archival_ingest`; the enum value is shared with the wiki sync, and the task payload names the source). Fires when the Discord importer appends `discord_message` rows past its watermark — a new chat export. Bulk and lower priority: no single target's ledger is waiting on it. The librarian searches the new messages and attaches facts to the subjects they mention, citing `discord://`.

## Agents called

| Order | Agent | Does |
| --- | --- | --- |
| 1 | Discord importer | Appends `discord_message` rows past the watermark — existing rows never change; advances the `discord` source watermark; enqueues the index task. A deterministic pipeline; source rows only, never facts |
| 2 | Librarian | Consumes the task: searches the appended messages, attaches `fact` rows to the subjects they mention, admits a curated `game_concept` where the material warrants one |

## Librarian operation

The librarian searches the new messages with keyword and vector retrieval — BM25 over message content, structured filters narrowing by channel, author, time range, and thread, and embeddings of messages with thread-window context, so fragments of slang retrieve — and reads outward from the hits: the thread around a message. Subjects are whatever the messages mention: targets by symbol, and the mechanical entity kinds — `translation_unit`, `struct`, `struct_field`, `parameter` — whose rows the entity extractor has already inserted from the checkout. A subject with no row is not silently invented: where the material warrants it, the librarian may admit a `game_concept` entity — curated, librarian-written, like `pattern` — and attach the facts there. Locals and returns are not entities and get no rows.

Every write goes through the resolver. Fact rows are added or overwritten under the mentioned subjects, `evidence` rows replaced wholesale — `discord://message/<discord_message.id>` locators into the appended rows, corroborated against the code graph where the checkout can confirm what the community said. Material that connects subjects can add curated `link` rows. Message rows are frozen once ingested, so these citations can never drift and carry no digest.

## Coverage

The Discord importer advances the `discord` row of `source_watermark` — `position` is the last ingested message id or timestamp; no other agent parses it — and enqueues `index_task` rows with `pathway` `archival_ingest` whose payloads name the appended slice of messages — the payload, not the enum value, distinguishes this pathway from the wiki sync. These tasks queue behind the per-target pathways. Completion is by the task timestamps, and the pass stamps `subject_index_state` for each subject it covered — and a subject whose `indexed_at` predates the new material still needs a pass even when no queue row names it.

## Related

- Librarian Pathways — the pathway table, the agent roster, and the `indexing_state` shapes this pathway writes through.

- Sync — the between-runs phase this pathway belongs to.

- Wiki Sync — the other pathway enqueuing `archival_ingest` tasks.

- Discord — the `discord_message` archive: draft shape, importer contract, locator parsing, search surface.

- Entities — the mechanical and curated entity kinds facts attach to here.

- Fact — the claim shape the librarian writes under the mentioned subjects.

- Evidence — the fact-owned citation rows and the archival locator grammar.



# docs/10-system-design/40-knowledge/40-librarian-pathways/10-sync/30-wiki

WIKI SYNC — The wiki half of the sync phase (`index_task.pathway` `archival_ingest`; the enum value is shared with the Discord sync, and the task payload names the source). Opt-in: fires only on an explicit kg2-ingest --lane wiki (--reset-source wiki requires it), never implicitly — the wiki lane is in neither the default sync set (reconcile, prs, discord, attempts) nor all, because the mirror rarely changes and its import is slow. The importer inserts `wiki_section` rows at a new mirror revision — a mirror re-sync. Bulk and lower priority: no single target's ledger is waiting on it. The librarian searches the new sections and attaches facts to the subjects they mention, citing `wiki://`.

## Agents called

| Order | Agent | Does |
| --- | --- | --- |
| 1 | Wiki importer | On --lane wiki only: inserts `wiki_section` rows at a new `mirror_revision` — existing rows never change; advances the `wiki` source watermark; enqueues the index task. A deterministic pipeline; source rows only, never facts |
| 2 | Librarian | Consumes the task: searches the new sections, attaches `fact` rows to the subjects they mention, admits a curated `game_concept` where the material warrants one |

## Librarian operation

The librarian searches the new sections with keyword and vector retrieval — BM25 over section content, structured filters narrowing by page and `mirror_revision` with the latest revision the default, and embeddings of sections, the wiki's primary surface: conceptual queries land here — and reads outward from the hits: the page around a section. Subjects are whatever the sections mention: targets by symbol, and the mechanical entity kinds — `translation_unit`, `struct`, `struct_field`, `parameter` — whose rows the entity extractor has already inserted from the checkout. A subject with no row is not silently invented: where the material warrants it, the librarian may admit a `game_concept` entity — curated, librarian-written, like `pattern` — and wiki material is where game concepts are most often seeded. Locals and returns are not entities and get no rows.

Every write goes through the resolver. Fact rows are added or overwritten under the mentioned subjects, `evidence` rows replaced wholesale — `wiki://<wiki_section.id>` locators into the new rows, each id naming one (page, section, mirror revision) triple, corroborated against the code graph where the checkout can confirm what the wiki said. Material that connects subjects can add curated `link` rows. Section rows are frozen once mirrored — a re-sync inserts new rows at a new revision — so these citations can never drift and carry no digest.

## Coverage

The wiki importer — run by hand, never as part of the sync or all lanes — advances the `wiki` row of `source_watermark` — `position` is the mirror revision; no other agent parses it — and enqueues `index_task` rows with `pathway` `archival_ingest` whose payloads name the newly mirrored sections — the payload, not the enum value, distinguishes this pathway from the Discord sync. These tasks queue behind the per-target pathways. Completion is by the task timestamps, and the pass stamps `subject_index_state` for each subject it covered — and a subject whose `indexed_at` predates the new material still needs a pass even when no queue row names it.

## Related

- Librarian Pathways — the pathway table, the agent roster, and the `indexing_state` shapes this pathway writes through.

- Sync — the between-runs phase this pathway belongs to.

- Discord Sync — the other pathway enqueuing `archival_ingest` tasks.

- Wiki — the `wiki_section` mirror: draft shape, the re-sync contract, search surface.

- Entities — the mechanical and curated entity kinds facts attach to here.

- Fact — the claim shape the librarian writes under the mentioned subjects.

- Evidence — the fact-owned citation rows and the archival locator grammar.



# docs/10-system-design/40-knowledge/40-librarian-pathways/10-sync

SYNC — The between-runs phase: material flowing in from outside the run loop. Three pathways carry it — pull requests, Discord exports, wiki mirror syncs — each fired by its importer landing new source rows. kg2-ingest runs its lanes in a fixed order — reconcile first (rename continuity at the new checkout head), then prs, then discord, then attempts. The wiki lane is opt-in: it is in neither the default sync set nor all and fires only on an explicit --lane wiki, because the mirror rarely changes and its import is slow. Every importer writes source rows only, advances its `source_watermark` row, and enqueues index tasks: the PR importer enqueues `pr_imported`, and the Discord and wiki importers both enqueue `archival_ingest` tasks whose payload names the source. Boundary sync's hand-off to kg2-ingest is still a manual step. Nothing here waits on a run boundary.

<!-- sequence: ./assets/sequences/sync-ingest.sequence.json title="Sync: sources in, facts follow" -->

## Related

- PR Imported — the pr pathway: an external pull request is archived, reconstructed into the ledger, and indexed.

- Discord Sync — new chat-export messages, searched and attached to the subjects they mention.

- Wiki Sync — newly mirrored wiki sections, opt-in via --lane wiki; the usual seed for curated game concepts.

- Librarian Pathways — the pathway table, the agent roster, and the indexing-state shapes.



# docs/10-system-design/40-knowledge/40-librarian-pathways/20-run/10-run-closed

RUN CLOSED — The attempt pathway (`index_task.pathway` `run_closed`). Fires when a worker run closes. The worker summary agent runs once, from a single prompt, and writes the run object — the `worker_run` row and its `submission` rows: hypothesis, scored tries, outcomes — then enqueues an attempt index task. It summarizes and proposes; it never writes a fact — the librarian decides whether anything the run learned changes what is on the page.

## Agents called

| Order | Agent | Does |
| --- | --- | --- |
| 1 | Worker summary agent | At run close, from a single prompt: writes the `worker_run` row and its `submission` rows plus a fact proposal, advances the `attempt` watermark, enqueues the index task. Never writes facts |
| 2 | Librarian | Consumes the task: reads the run object and the proposal, decides per touched target or entity whether the facts change, searches the sources for corroboration, overwrites live `fact` rows with `attempt://` citations |

After close, integration either lands — `worker_run.integration` `integrated` — or conflicts: upstream moved, or another worker's merge landed first on the file. No agent resolves the conflict: the run-loop records it deterministically on the run row — `integration` `conflicted`, `integration_detail` `{ status, disposition, conflict_paths[], failure_reasons[], resolved_at }` derived from run state's integration rows — and re-queues the target for the next epoch; the next worker sees the conflicted run with its conflict paths (capped at 10) on its card. The summary agent runs in both cases — the knowledge is not wasted — and the integration record feeds its narrative input. There is no regression event and no extra pathway; what the run learned reaches the graph through this pass.

The `run_closed` context carries, per touched subject, `renamed_from` — the stable keys of rows whose `moved_to_id` points at it, written by report reconciliation when the checkout head moved — and the flagger's compact drift report over its `code://` citations (unchanged | drifted | unresolvable). The pass is drift-gated: after apply the flagger re-runs on the touched subjects — clean completes; drift left releases the task once for a retry; drift left again completes with the warning recorded in the pass artifact. See Drift Gate.

## Librarian operation

The librarian reads the `worker_run` row, its `submission` rows, and the proposal, alongside the live `fact` rows for `worker_run.target_id`. The run's target is the subject first; a submission that leaned on a struct, a field, or a neighbouring function puts that entity's facts in scope too. Search runs against the source surfaces — the librarian is the only agent that does: the structured attempts query (target, outcome, score trajectory) is the first query, keyword over hypotheses and transcripts follows, the code graph checks a claim against the checkout, and archival keyword and vector search corroborate when the run's claims echo something Discord, a PR, or the wiki already said.

Every write goes through the resolver. The affected live `fact` rows are overwritten in place, each fact's `evidence` rows replaced wholesale — `attempt://run/<worker_run.id>[/submission/<seq>]` locators into the run and its scored tries, plus whatever corroboration the search returned. A run outcome never becomes a fact by itself, and a tested hypothesis that failed stays on the ledger side, citable later as `attempt://` evidence. A resolution move that keeps recurring across runs may be filed as a `pattern` fact — the `pattern` entity is curated, and the librarian is its only writer.

## Coverage

The summary agent advances the `attempt` row of `source_watermark` — `position` is the closed run's id — and inserts one `index_task` with `pathway` `run_closed` and a `payload` naming the `worker_run` row. The librarian claims the task (`started_at`) and completes it (`done_at`) — status is derived from the timestamps, there is no status column — and stamps `subject_index_state` with a fresh `indexed_at` for the run's target and any entity the pass covered. A run whose task has no `done_at` is unprocessed by definition; nothing else tracks it.

## Related

- Librarian Pathways — the pathway table, the agent roster, and the `indexing_state` shapes this pathway writes through.

- Worker Runs — the `worker_run` and `submission` shapes, the summary-agent rules, and the proposal contract.

- Attempts — the search surface queried here and the `attempt://` locators the new facts cite.

- Drift Gate — rename continuity, the citation flagger, and the bounded definition of done this pass runs under.

- Fact — the claim shape the librarian overwrites.

- Evidence — the fact-owned citation rows replaced wholesale on every overwrite.



# docs/10-system-design/40-knowledge/40-librarian-pathways/20-run

RUN — The run-close phase: fires when a worker run closes. One pathway carries it. The worker summary agent writes the run object — the `worker_run` row and its `submission` rows — advances the `attempt` watermark, and enqueues a `run_closed` index task; the librarian decides, per touched target and entity, whether facts change, citing `attempt://`. During the run itself only workers act, and an integration failure never invokes an agent: at run close the run-loop records the outcome deterministically on the `worker_run` row — `integration` `integrated | conflicted`, `integration_detail` with the conflict paths — re-queues the target, and the next worker sees the conflicted run and its paths on its card; no event row, no extra pathway. The summary agent still runs, so the knowledge is not wasted. The `run_closed` context carries, per touched subject, `renamed_from` and the drift report, and the pass is drift-gated — see Drift Gate.

<!-- sequence: ./assets/sequences/run-closed.sequence.json title="Run closed: summarize, then index" -->

## Related

- Run Closed — the attempt pathway: summary agent writes the run object, librarian decides what facts change.

- Drift Gate — rename continuity, the flagger, and the gate every run_closed pass runs under.

- Librarian Pathways — the pathway table, the agent roster, and the indexing-state shapes.



# docs/10-system-design/40-knowledge/40-librarian-pathways/30-epoch-boundary/10-regression

REGRESSION — Retired 2026-09-02. There is no regression pathway and no regression event. The run loop records each integration outcome deterministically on the run row at close — `worker_run.integration` `integrated | conflicted | null` and `worker_run.integration_detail` `{ status, disposition, conflict_paths[], failure_reasons[], resolved_at }` — derived from run state's integration rows (conflicted when conflict paths or failure reasons exist or the status is resolved or dropped; integrated when applied cleanly). The attempts importer stamps existing runs the same way (backfilled on the melee store: 1677 integrated, 47 conflicted). The next worker sees a conflicted run with its conflict paths on its card; no librarian pass is involved, nothing enqueues a `regression` index task, and the `event` table remains for `note` events only. Facts are still never auto-invalidated: what a conflicted run learned reaches the graph through the ordinary run_closed pass.

## Related

- Librarian Pathways — the pathway table, the agent roster, and the `indexing_state` shapes this pathway writes through.

- Run Closed — the replacement: the integration record on the run row and the pass that indexes the run.

- Events — the `event` and `event_ref` shapes, who appends, and why nothing cites an event.

- Worker Runs — the `worker_run` row that now carries `integration` and `integration_detail`, and the `attempt://` grammar into it.

- Fact — the claim shape the librarian overwrites or clears.

- Evidence, Confidence, and Lifecycle — regressions as ledger entries, not knowledge, and the rule that events are never citable.



# docs/10-system-design/40-knowledge/40-librarian-pathways/30-epoch-boundary/20-drift-recheck

DRIFT RECHECK — Retired 2026-09-02 as an epoch-boundary pathway. Drift now lives inside the pr_imported and run_closed passes: report reconciliation carries renames forward whenever the checkout head moves (`identity_status` `moved`, `target.moved_to_id`, rows re-pointed in one transaction) and enqueues nothing; the flagger re-resolves each `code://` citation at the current head and classifies it `unchanged | drifted | unresolvable`; the context carries `renamed_from` and the drift report per touched subject; and the consumer's drift gate re-runs the flagger after apply — clean completes, one release for a retry, a second miss completes with a recorded warning. The `drift_recheck` pathway value survives only for the manual job kg2-drift-scan, which flags the whole store and enqueues one `drift_recheck` task per unit listing the drifted subjects, deduplicated against pending tasks — for use after a large upstream jump. Only code drifts; archival and attempt citations never do.

## Related

- Librarian Pathways — the pathway table, the agent roster, and the `indexing_state` shapes this pathway writes through.

- Drift Gate — the replacement: rename continuity, the flagger, the gated pathways, and the kg2-drift-scan job.

- Code — the checkout as source: the only drifting one, the digest requirement.

- Targets — identity, `identity_status`, and the reconciliation rules that run before the librarian.

- Evidence, Confidence, and Lifecycle — the drift, reconciliation, and flag rules this pathway executes.

- Fact — the claim shape re-cited, rewritten, or cleared here.

- Evidence — the citation rows whose `code` digests the recheck re-resolves.



# docs/10-system-design/40-knowledge/40-librarian-pathways/30-epoch-boundary

EPOCH BOUNDARY — Retired 2026-09-02. The boundary phase no longer exists as a librarian phase. Its `regression` pathway was replaced by the deterministic integration record on the run row (`worker_run.integration` and `integration_detail`, with conflict paths, shown to the next worker on its card — no event row, no task). Its `drift_recheck` pathway was replaced by the Drift Gate inside the pr_imported and run_closed passes: report reconciliation still runs whenever the checkout head moves — rename continuity via `target.moved_to_id` — and enqueues nothing; the flagger's report rides in the pass context; the consumer's gate allows one retry. The manual job kg2-drift-scan is the only remaining producer of `drift_recheck` tasks, one per unit.

## Related

- Drift Gate — the replacement: rename continuity, the flagger, and the gate inside the PR and run passes.

- Run Closed — where a conflicted integration now surfaces: the deterministic record on the run row.

- Regression — retired; replaced by the integration record on the run row.

- Drift Recheck — retired as a boundary pathway; survives only as the manual kg2-drift-scan job.

- Librarian Pathways — the pathway table, the agent roster, and the indexing-state shapes.



# docs/10-system-design/40-knowledge/40-librarian-pathways/40-backfill

The backfill librarian is the librarian role with a target-driven entry point: 

- given one subject and its assembled current record

- pass every search surface and propose the writes that complete that subject's record. 

The unit of work is one pass over one target. Passes run in parallel lanes; each pass may write only inside its own scope — the target plus its linked mechanical entities — and curated `game_concept`/`pattern` writes serialize through one shared gate, so parallel passes cannot clobber each other. Measured cost: about 3.5 minutes of model time per pass at 130 concurrent lanes (about 1 minute when a single lane runs alone); one runner process is CPU-bound near 30 passes a minute, so throughput scales by sharding across processes.

## One pass, end to end

```process-outline
Select — the runner takes the next target off the knowledge-first funnel (never-indexed, then 100% matched, then linked, then real-named symbol, then unit named-density, then direct material, then inherited material) and skips anything already stamped in subject_index_state. Every target is covered in that order — there is no direct-material filter and no cut.
Assemble the given context — mechanical, no model:
     -> the target row, its target_status, and its funnel columns;
     -> its full ledger: every worker_run with submissions, every pull_request row attributed to it;
     -> its translation unit: the unit entity, the unit view aggregate, the 15 most recent unit-attributed PR rows with the total count, and the member target list;
     -> the current knowledge record for the target and each linked mechanical entity (empty on pass 1);
     -> the write scope the apply layer will enforce: the target plus those linked entities.
Spawn the backfill librarian — one prompt, the librarian_pass_v1 output contract inlined, and eight read-only search tools live: structured record tools first (attempt search, subject record, unit context, entity lookup), then keyword/vector text search over Discord, wiki, and PRs, with resolve_locator required before citing anything not already read in full. Search snippets are never evidence.
     > The prompt's write discipline: proposal-only; one live fact per (subject, type); rationale argues from cited evidence; 0.99 maximum confidence; closed locator grammar only; events never citable; inferred_name is always a guess; only game_concept and pattern may be admitted; outcomes and scores never become facts.
     > Sparseness: a fact type with nothing supportable is omitted, never filled with a placeholder — absence is correct output.
     > Definition of done: every fill-out subject — each directly linked entity first, then the target — got its own research across all the resources and was considered; every supportable claim is proposed with citations read in full; the reply is one machine-processable JSON object.
Propose — the model returns exactly one machine-processable JSON object: facts (op write | clear, each with evidence citations and a rationale), links, curated-entity admissions, merges. Subjects are referenced by stable_key or locator, never database ids. No summary or narration fields — the object is the entire reply, and the model writes nothing.
Apply — the mechanical layer validates every item and performs the writes:
     -> shape and enums; subject resolution (never a guessed subject); scope enforcement (out-of-scope rejected, curated entities routed through the shared gate);
     -> every citation parsed under the closed grammar and resolved against a real store row — code:// spans read from the checkout with the digest computed here, never model-supplied;
     -> confidence above 0.99 is clamped to 0.99 and noted on the report item;
     -> one failed item is rejected with a reason and the pass continues; writes go through the same helpers as everything else.
Stamp and record — subject_index_state gets a fresh indexed_at for the target and each entity written; a pass artifact (assembled context, proposal, per-item apply report, timings) is persisted for audit; the run log gets one line.
> A dry-run pass executes every step, including the model and the full validation, then discards the transaction — nothing written, nothing stamped, artifact still produced.
```

> **note: Runner flags** — Everyday: `--run-id`, `--limit`, `--concurrency`, `--dry-run`, `--stop`, `--status`. Optional: `--min-direct-score` (a cut on direct material; off by default, so the runner covers every target), `--shard i/n` (split one run across processes — every shard must start from the same snapshot), `--max-consecutive-failures` (default 5).

## Worked example — one pass on ftCo_800BFFD0

Every value below is a stub; every shape is the real one. The target is the section's running example — the hitstun decay helper at 100% match whose symbol is still the address-bodied `ftCo_800BFFD0`. The pass runs on pass-1 state: the store holds the raw material but the subject's knowledge record is empty.

**backfill_pass_context**

```
task: object  # The pass descriptor: run id, the target's stable_key, and the loop instruction
fill_out_subjects: array  # The ordered loop — linked entities first, the target last. Each entry: order, kind, its locator or stable_key, its current knowledge record, and its material
fill_out_subjects[].material (translation unit): object  # The unit view aggregate, the member target list with match and named flags, and the 15 most recent unit-attributed PR rows with the total count
fill_out_subjects[].material (target): object  # source: the function's definition span from the checkout as a code:// locator plus text (null with a reason when the symbol cannot be located confidently); analogs: opseq-similar functions, callers, and callees, each with match % and a has_facts flag; ledger: runs grouped with their submissions (header once, attempt:// locator per submission), pull_request rows, events
supporting_subjects: array  # Connected game concepts and patterns with their records: context to read, not owed facts
decomp_standards: object  # Accepted standards projected to id, title, summary — recognition only, never knowledge
scope: object  # The write territory the apply layer enforces: the target plus its linked mechanical entities
```

```json
{
  "task": {
    "run_id": "backfill-01",
    "target_stable_key": "main/melee/ft/ftcommon:ftCo_800BFFD0"
  },
  "fill_out_subjects": [
    {
      "order": 1,
      "kind": "entity",
      "entity_kind": "translation_unit",
      "entity_locator": "src/melee/ft/ftcommon.c",
      "record": {
        "facts": {},
        "links": []
      },
      "material": {
        "members": [
          {
            "stable_key": "main/melee/ft/ftcommon:ftCo_800BFFD0",
            "match_pct": 100,
            "named": false
          },
          "…108 more"
        ],
        "pull_requests": [
          "…15 most recent"
        ],
        "total_pr_count": 99
      }
    },
    {
      "order": 2,
      "kind": "target",
      "target_stable_key": "main/melee/ft/ftcommon:ftCo_800BFFD0",
      "detail": {
        "address": "0x800BFFD0",
        "match_pct": 100,
        "linked": true,
        "named_symbol": false,
        "unit_named_ratio": 0.62
      },
      "record": {
        "facts": {},
        "links": []
      },
      "material": {
        "source": {
          "locator": "code://1e28b420/src/melee/ft/ftcommon.c#L210-L242",
          "text": "void ftCo_800BFFD0(Fighter* fp) { … }",
          "truncated": false
        },
        "analogs": [
          {
            "stable_key": "main/melee/ft/ftcommon:ftCo_800C0210",
            "relation": "opseq_analog",
            "score": 0.52,
            "match_pct": 100,
            "has_facts": true
          },
          {
            "stable_key": "main/melee/ft/ft_0877:ftCommon_800C0F44",
            "relation": "caller",
            "match_pct": 100,
            "has_facts": false
          }
        ],
        "ledger": {
          "runs": [
            {
              "id": "run:7f3a…",
              "final_outcome": "match",
              "integration": "integrated",
              "submissions": [
                {
                  "seq": 1,
                  "score": 91.2,
                  "locator": "attempt://run/run:7f3a…/submission/1"
                },
                {
                  "seq": 2,
                  "score": 100,
                  "locator": "attempt://run/run:7f3a…/submission/2"
                }
              ]
            }
          ],
          "pull_requests": [],
          "events": []
        }
      }
    }
  ],
  "supporting_subjects": [],
  "decomp_standards": {
    "standards": [
      {
        "id": "global_standard:natural-loops",
        "title": "Natural loops are required",
        "summary": [
          "…"
        ]
      }
    ]
  },
  "scope": {
    "targetStableKeys": [
      "main/melee/ft/ftcommon:ftCo_800BFFD0"
    ],
    "entityLocators": [
      "src/melee/ft/ftcommon.c"
    ]
  }
}
```

### The agent's search loop

| Step | Tool call | What came back |
| --- | --- | --- |
| 1 | (no call — read the material) | The target arrived with its source span, its analogs (one already carries facts), and its grouped ledger: two scored submissions, 91.2 then 100.0, integrated. The source is read first. |
| 2 | discord_search { query: "800BFFD0" } | One hit: discord://message/1123581321 — "pretty sure 800BFFD0 is the hitstun decay helper" |
| 3 | resolve_locator { locator: discord://message/1123581321 } | The full message with its thread window — the author matched the function and names its role; snippets are never citable, so this read is required before citing |
| 4 | wiki_search { query: "hitstun", mode: "vector" } | wiki://hitstun~formula@r2026-08-15 — the hitstun frame formula section |
| 5 | entity_lookup { kind: "game_concept", locator_prefix: "concept:hitstun" } | No existing entity — safe to admit one instead of duplicating |
| 6 | knowledge_record { entity_locator: "src/melee/ft/ftcommon.c" } | The unit entity's record: empty — the definition of done still requires it to be searched and considered; with nothing supportable, its correct output is simply no facts |

### The proposal the model returns

```json
{
  "facts": [
    { "subject": { "target_stable_key": "main/melee/ft/ftcommon:ftCo_800BFFD0" },
      "type": "purpose", "op": "write",
      "value": "Applies knockback decay to the fighter's velocity each frame while in hitstun.",
      "rationale": "A decomp regular identifies this address as the hitstun decay helper after matching it, and the matched submission's scores held only once the decay loop ran.",
      "confidence": 0.8,
      "evidence": [
        { "kind": "discord", "locator": "discord://message/1123581321", "why": "The author identifies 800BFFD0 as the hitstun decay helper" },
        { "kind": "attempt", "locator": "attempt://run/run:7f3a…/submission/2", "why": "The submission that reached 100% with the decay loop in place" } ] },
    { "subject": { "target_stable_key": "main/melee/ft/ftcommon:ftCo_800BFFD0" },
      "type": "inferred_name", "op": "write",
      "value": "ftCommon_ApplyKnockbackDecay",
      "rationale": "Named for the decay behaviour the thread describes; a guess, never a rename instruction.",
      "confidence": 0.6,
      "evidence": [ { "kind": "discord", "locator": "discord://message/1123581321", "why": "Community name for the behaviour" } ] },
    { "subject": { "target_stable_key": "main/melee/ft/ftcommon:ftCo_800BFFD0" },
      "type": "game_mapping", "op": "write",
      "value": "Implements the hitstun decay step of the knockback formula.",
      "rationale": "The wiki formula section describes the per-frame decay this function performs.",
      "confidence": 0.75,
      "evidence": [ { "kind": "wiki", "locator": "wiki://hitstun~formula@r2026-08-15", "why": "The hitstun formula the behaviour matches" } ] }
  ],
  "links": [
    { "from": { "target_stable_key": "main/melee/ft/ftcommon:ftCo_800BFFD0" },
      "to": { "entity_locator": "concept:hitstun" },
      "role": "implements", "why": "Realizes the decay step of the hitstun mechanic",
      "kind": "wiki", "locator": "wiki://hitstun~formula@r2026-08-15" }
  ],
  "entities": [
    { "kind": "game_concept", "locator": "concept:hitstun", "note": "Needed as the subject of the game mapping; no existing entity found" }
  ],
  "merges": []
}
```
> **L1-2 (directly processable):** The reply is exactly this JSON object — no prose wrapper, no summary fields; the apply layer consumes it as-is. A fact type with nothing supportable (data_flow here) is simply absent.
> **L3-8 (proposal only):** The model cites what it read and argues from it; it never writes rows, never supplies digests, never uses database ids. Confidence tops out at 0.99 by rule; the apply layer clamps anything higher.

### What the apply layer did with it

| Item | Action | Effect |
| --- | --- | --- |
| entity concept:hitstun | applied | Admitted through the shared curated-entity gate (all parallel lanes serialize here); one entity row inserted |
| fact purpose | applied | Both locators parsed and resolved to real rows; one fact row + two evidence rows written in one transaction |
| fact inferred_name | applied | Stored as a guess; every worker-facing surface must render it with its confidence, never as the canonical name |
| fact game_mapping | applied | The wiki locator resolved against the mirrored section; the fact can cite it forever — archival rows never drift |
| link implements | applied | XOR-checked subject pair; inline citation carried on the row itself |
| (counter-example) fact on another target | rejected: out_of_scope | A pass may write only inside its scope; a claim about a neighbouring function belongs to that target's own pass |
| (counter-example) confidence 1.0 | applied + note: confidence_clamped_to_0.99 | Nothing here is ground truth; the lint clamps and flags rather than trusting certainty |

```json
// what the store holds after the pass (and the artifact records all three stages)
{
  "fact":   { "id": "fact-01j9x2", "target_id": "target:function:main/melee/ft/ftcommon:ftCo_800BFFD0",
              "type": "purpose", "confidence": 0.8, "updated_at": "2026-09-01T…" },
  "evidence": [ { "fact_id": "fact-01j9x2", "kind": "discord", "locator": "discord://message/1123581321" },
                { "fact_id": "fact-01j9x2", "kind": "attempt", "locator": "attempt://run/run:7f3a…/submission/2" } ],
  "subject_index_state": { "target_id": "target:function:main/melee/ft/ftcommon:ftCo_800BFFD0",
                           "indexed_at": "2026-09-01T…" }
}
```

> **note: Dry run** — A `--dry-run` pass executes every step above — the model, the search loop, the full validation — then discards the transaction: nothing written, nothing stamped, and the artifact still captures the context, the proposal, and every per-item verdict.

> **note: Phase 3 completed 2026-09-02** — Run backfill-01-20260901 stamped 22237/22237 targets and 1070 unit entities. Store: 119611 facts, 264410 evidence, 30574 links, 8297 entities (1872 game_concept, 109 pattern admitted by the librarian). 22158 targets carry facts; 79 were stamped with empty or fully rejected proposals. 22592 passes, 272 failed (241 relay outages, 11 malformed envelopes, 5 timeouts, 2 garbled outputs, 2 kernel-lock collisions), all retried to completion.

## Related

- Librarian Pathways — the agent roster, the one-writer discipline, and the indexing-state shapes a pass reads and stamps.

- Migration, Pruning, and Rebuild — the initial-build phases this pass executed phase 3 of (completed 2026-09-02), and the prioritized target order.

- Fact — the claim shape every proposal converges on; the librarian is its only writer.

- Evidence — the fact-owned citation rows the apply layer resolves before any write.



# docs/10-system-design/40-knowledge/40-librarian-pathways/50-drift-gate

The drift gate is the librarian's counterpart of the worker quality gate — a pass over a subject is not done until every code citation the flagger marked drifted or unresolvable has been re-cited, rewritten, or cleared.

## Where it runs

- Rename continuity in report reconciliation — `apps/server/src/core/knowledge-v2/ingest/reconcile.ts`. It runs whenever the checkout head moves: boundary sync pulls upstream PRs, or an epoch boundary integrates our own worker outputs. Within a unit, it pairs one newly unresolved symbol with one newly inserted symbol at the same address. Pairing is 1:1 and requires the same kind. It marks the old row moved with `target.moved_to_id` from migration 005, then re-points facts, evidence, links, worker runs, pull requests, events, and the index stamp. Ambiguous addresses appear in the reconcile result and remain unchanged. Reconciliation never enqueues tasks.

- The flagger — `apps/server/src/core/knowledge-v2/drift/flagger.ts` `flagCodeDrift`. It re-resolves each `code://` citation's path and span at the current head, recomputes the digest, and classifies the citation as unchanged, drifted, or unresolvable. The operation is deterministic and read-only.

- Context assembly — `apps/server/src/core/knowledge-v2/librarian/context.ts`. The `pr_imported` and `run_closed` contexts carry two fields per touched subject: `renamed_from`, containing stable keys of rows whose `moved_to_id` points at it, and the compact drift report. These are the two live pathways. They do not create a separate drift task.

- The gate — apps/server/src/core/knowledge-v2/librarian/consumer.ts. It runs only when the context carried drift inputs (the builder sets drift_gate for pr_imported, run_closed, and drift_recheck); Discord archival passes and backfill passes skip it and complete as before, because no code changed. When gated: after applyLibrarianPass it runs the flagger again on the touched subjects. A clean result completes the task. Drift left on the first attempt releases the task with drift_attempts=1 so the queue re-claims it once. Drift left on the second attempt completes the task anyway and logs 'drift left unresolved after retry' in the pass artifact. The artifact records drift_gate as skipped, clean, released, or warned.

- The rejection gate — the same file, before the drift gate. The proposal is applied in dry run; rejections (out-of-scope subjects, unresolvable code citations, malformed envelopes, follow-ups on in-scope subjects) go back to the model once with a reason and a fix-it message, and the corrected proposal is what gets applied. The artifact records validation_gate as clean, retried, or warned. Two exceptions to the pr_imported comment-citation rule let the audit write when the discussion never names the subject: a fact on a subject with a non-empty renamed_from, and a fact whose type carries a drifted or unresolvable entry in the subject's drift report, may cite code at head_revision instead (ApplyOptions.renamedSubjects / driftedFacts).

- The manual scan — `kg2-drift-scan` in `apps/server/src/core/knowledge-v2/drift/cli.ts`. Use it after a large upstream jump. It flags the whole store and enqueues one `drift_recheck` task per unit, deduplicated against pending tasks. `drift_recheck` is the only pathway this job uses.

<!-- sequence: ./assets/sequences/drift-gate.sequence.json title="Drift gate: head moves, pass re-cites, gate verifies" -->

## Why it cannot loop

1. Reconciliation never enqueues tasks.

2. The gate retries exactly once. It stores drift_attempts in the task payload and checks it before release.

3. A second miss completes the task, so a PR whose citations can never resolve, such as one that deleted the cited file, cannot pin the queue.

4. The manual scan deduplicates tasks per unit.

5. The warning line tells the operator to inspect the subject.

## Relation to the worker quality gate

The shape is the same: a mechanical check after the agent's output, a bounded retry, and explicit completion with a warning. The subject differs: citations instead of a build.

## Open

- Surfacing 'drift left unresolved' and 'validation warned' counts together on the dashboard Explorer summary: the drift count is built, the validation count is not.

## Related

- Librarian Pathways

- Run

- Sync

- Evidence



# docs/10-system-design/40-knowledge/40-librarian-pathways

LIBRARIAN PATHWAYS — New material reaches the knowledge graph along inbound pathways grouped into three phases: sync — pull requests, Discord exports, wiki mirror syncs, material flowing in between runs; run — a worker run closes; and manual — the operator runs kg2-drift-scan after a large upstream jump. Each pathway names the agents that run and in what order, and each ends the same way: an `index_task` on the queue, claimed by the librarian. The librarian role — the event-driven librarian and its target-driven backfill counterpart — is the only writer of `fact`, `evidence`, `link`, and curated entity rows. Everything upstream writes source or ledger rows and enqueues; nothing upstream touches the graph.

## Pathways by phase

| Phase | Pathway | Trigger | Agents called | Librarian writes |
| --- | --- | --- | --- | --- |
| Sync | `pr_imported` | A pull request lands in the checkout: the harness knowledge intake (knowledge-v2/ingest/harness-intake.ts runKnowledgeIntake) runs after every operator-sync publication and after every epoch boundary's report recompute — it fetches the merged PRs' dumps into the canonical past_prs archive (postmortems off), then runs the kg2-ingest sync lane (reconcile → prs → discord → attempts) against the active cycle worktree and its report | PR importer, then the librarian | Fact updates on the targets and files the diff touches, citing `pr://` |
| Sync | `archival_ingest` | The Discord importer appends rows past its watermark — one enum value, two pathways; the task payload names the source. The wiki importer enqueues the same task only on an explicit --lane wiki; it never fires implicitly | Discord importer (or the wiki importer, --lane wiki only), then the librarian | Facts attached to the subjects the new material mentions; a curated `game_concept` may be admitted when the material warrants it |
| Run | `run_closed` | A worker run closes | Worker summary agent, then the librarian | Fact overwrites on the touched targets and entities, citing `attempt://`; pattern facts for recurring resolution moves; drift-gated — the context carries renamed_from and the drift report per touched subject |
| Manual | `drift_recheck` | The operator runs kg2-drift-scan after a large upstream jump: the flagger runs over the whole store and one task per unit lists the drifted subjects, deduplicated against pending tasks | kg2-drift-scan (deterministic flagger), then the librarian | Re-cited or rewritten facts whose `code://` evidence drifted or no longer resolves; drift-gated |

> **note: Regression retired; drift moved into the passes** — As of 2026-09-02 regression is no longer a pathway: the run loop records each integration outcome deterministically on the `worker_run` row (`integration` and `integration_detail` with the conflict paths), the next worker sees it on its card, and no event row or index task is produced. Drift moved into the pr_imported and run_closed passes: report reconciliation carries renames forward (`target.moved_to_id`) and enqueues nothing, the flagger's report rides in the pass context, and the consumer's drift gate bounds the librarian to one retry. drift_recheck survives only as the manual kg2-drift-scan job.

## Agent roster

The importers — Discord, wiki, PR — run on new exports, mirror syncs, and PRs. They write source rows only, advance their source watermark, and enqueue index tasks. They are deterministic pipelines, not fact writers. The PR importer is a small preprocessing agent: it archives the raw PR and its discussion into the `pr://` source and reconstructs the `pull_request` ledger row — touched files and targets, outcome, summary — through the same summary prompt the worker summary agent uses. Pure enrichment, so the librarian starts from what the PR touched; it never writes facts. Both seams call the same intake: the operator sync at publish, the epoch boundary after recompute_report (plan step knowledge_intake). The legacy sync knowledge stage — staged postmortems, knowledge-N revisions, sync_knowledge_jobs — was deleted on 2026-09-03; nothing feeds the graph except this intake and the librarian. Every V2 command resolves one checkout (knowledge-v2/checkout.ts resolveKnowledgeCheckout): explicit flags, else the active cycle worktree from the orchestrator state, else games/<game>/checkout with a warning; report_revision on targets is that checkout's git head.

The worker summary agent runs once at run close, from a single prompt. It writes the `worker_run` row and its `submission` rows — the run object: hypothesis, checkpoints and scored tries, outcomes — and enqueues an attempt index task. It never writes facts; it summarizes and proposes, and the librarian decides.

The run-loop records the integration outcome on the `worker_run` row at run close — `integration` `integrated | conflicted | null` and `integration_detail` with the conflict paths — derived deterministically from run state; no event row and no index task. There is no integration-resolver in this model: a conflict is a deterministic record plus a re-queue for the next epoch, never an agent — the legacy integration-resolver retires with the migration. Report reconciliation runs whenever the checkout head moves, writes `target` and `target_status`, carries renames forward (`identity_status` `moved`, `target.moved_to_id`) and enqueues nothing; it is never an LLM. The `event` table remains for `note` events only.

The entity extractor is deterministic extraction from the checkout at a revision — the legitimate writer for the four mechanical entity kinds `translation_unit`, `struct`, `struct_field`, `parameter`, the same role report reconciliation plays for targets. It runs with reconciliation on a new revision, inserts missing entity rows, and never edits or retires existing ones on its own. `game_concept` and `pattern` entities stay curated — librarian-written. Locals and returns remain not entities.

The librarian role — the event-driven librarian and the target-driven backfill librarian — is the only writer of `fact`, `evidence`, `link`, and curated entity rows, and the only role that searches the knowledge sources. The event-driven librarian consumes the index queue: a new object arrives — PR, run, sync batch, drift flag — and it updates the graph from that object. Every write goes through the resolver — grammar, store-row existence, code digests.

The backfill librarian is the librarian role with a different entry point: target-driven rather than event-driven. Given one subject, it sweeps every knowledge source — all search surfaces — for everything related and builds or completes that subject's record, under the same write gates, the same resolver, and the same only-writer discipline. It runs on the migration's initial build and for on-demand deep passes, consuming a prioritized target list from a deterministic query — targets ranked by available material across the sources, richest first.

## Who runs where

| Agent | Runs on | Writes | Enqueues |
| --- | --- | --- | --- |
| Importers (Discord, wiki, PR) | New export, mirror sync, or imported PR | Source rows; their `source_watermark` row; the PR importer also the `pull_request` ledger row | `pr_imported` and `archival_ingest` index tasks |
| Worker summary agent | Run close | `worker_run` and `submission` rows; the `attempt` watermark | `run_closed` index tasks |
| Run-loop | Run close | `worker_run.integration` and `integration_detail` (deterministic, from run state); `note` event rows | — |
| Report reconciliation | Whenever the checkout head moves (boundary sync, epoch boundary) | `target`, `target_status`; rename continuity — `identity_status` `moved` and `target.moved_to_id`, with facts, evidence, links, and ledger rows re-pointed | — |
| kg2-drift-scan (manual) | Operator, after a large upstream jump | — (runs the flagger over the whole store) | `drift_recheck` index tasks, one per unit, deduplicated against pending tasks |
| Entity extractor | New report revision, with reconciliation | Missing `translation_unit`, `struct`, `struct_field`, `parameter` entity rows | — |
| Librarian | The index queue | `fact`, `evidence`, `link`, curated entities; `subject_index_state` at pass completion | — (claims and completes tasks; the drift gate on pr_imported, run_closed, and drift_recheck releases a pass with drift left once, then completes it with a warning) |
| Backfill librarian | Migration initial build and on-demand deep passes | Same as the librarian — `fact`, `evidence`, `link`, curated entities; `subject_index_state` at pass completion | — (consumes a prioritized target list) |

## Indexing state

Coverage is tracked in three tables: `source_watermark` records how far each source has been ingested, `index_task` is the queue between the enqueuing agents and the librarian, and `subject_index_state` is the per-subject cursor. What still needs processing is derivable: queue rows without `done_at`, plus subjects whose `indexed_at` predates relevant new material.

**source_watermark** — apps/server/src/core/knowledge-v2/storage/ddl.ts

```
source: enum: pr | discord | wiki | attempt  # Primary key; one row per source
position: string  # Opaque to everything but the writing agent: last message id or timestamp, PR number, mirror revision, run id
updated_at: timestamp  # When the watermark last advanced
```

```json
{
  "source": "discord",
  "position": "1123581321",
  "updated_at": "2026-08-11T03:00:00Z"
}
```

- `position`: here the last ingested `discord_message.id` — the Discord importer compares its next export against this and appends only rows past it. No other agent parses the value.

**index_task** — apps/server/src/core/knowledge-v2/storage/ddl.ts

```
id: task id  # Primary key
pathway: enum: run_closed | pr_imported | regression (retired 2026-09-02 — still in the DDL check, nothing produces it) | archival_ingest | drift_recheck  # Which pathway the task belongs to
payload: string  # A locator or subject id naming what to index
enqueued_at: timestamp  # Set by the enqueuing agent at insert
started_at?: timestamp  # Set when the librarian claims the task
done_at?: timestamp  # Set when the librarian completes the task
```

```json
{
  "id": "task-000482",
  "pathway": "run_closed",
  "payload": "attempt://run/rn-20260830-0114",
  "enqueued_at": "2026-08-30T01:14:22Z",
  "started_at": "2026-08-30T01:15:03Z",
  "done_at": null
}
```

- `started_at` set, `done_at` null: the librarian has claimed the task and is mid-pass. Both null would mean queued; both set, completed — status is read off the timestamps.

- `payload`: `attempt://run/rn-20260830-0114` names the run object the summary agent just wrote — the librarian reads it plus its submissions and decides, per touched target and entity, whether facts change.

**subject_index_state** — apps/server/src/core/knowledge-v2/storage/ddl.ts

```
target_id?: target id  # Set when the subject is a target; exclusive with `entity_id`
entity_id?: entity id  # Set when the subject is an entity; exclusive with `target_id`
indexed_at: timestamp  # When the librarian last completed a pass over this subject
```

```json
{
  "target_id": "main/melee/ft/ftcommon:ftCo_800BFFD0",
  "entity_id": null,
  "indexed_at": "2026-08-30T01:16:40Z"
}
```

- `target_id` XOR `entity_id`: this row is a target cursor, so `entity_id` is null; a row with both set or both null is rejected.

- `indexed_at`: any material about `main/melee/ft/ftcommon:ftCo_800BFFD0` that lands after this instant leaves the subject due for another pass, whether or not a queue row names it directly.

## The queue consumer

The event-driven librarian is a consumer over `index_task`: every producer seam — importers, the worker summarizer, the manual drift scan — enqueues; the run-loop and reconciliation write rows and enqueue nothing; one consumer drains. A pass is one task; parallel lanes share the same curated-entity gate as the backfill, and the same apply layer validates every write.

```process-outline
Claim — the next queued task by pathway priority: run_closed first (a target's ledger is waiting), then pr_imported, then archival_ingest, then drift_recheck; FIFO within a pathway; claiming sets started_at.
> Bound the slice — an archival_ingest task larger than 40 messages or 20 wiki sections, and a pr_imported task with more than 24 attributed rows (a sweeping PR: melee#3178 had 97 units, #3304 585 rows), is split at claim time into child tasks that inherit the parent's queue position — PR children keep a unit's rows with its targets; the parent completes with a split note and never runs a model pass.
Assemble — the pathway's context: a <pass> block naming the pathway and head_revision (the checkout head, the only revision a code:// citation may carry), the triggering object (run with its narrative, PR with its discussion and CI rows, source slice with a mechanical mention map, the drift scan's flagged subjects with the flagger's verdicts; on pr_imported and run_closed, renamed_from and the drift report per touched subject) plus the touched subjects — entities first, targets last — each with its record and material (source span, analogs, grouped ledger). The touched subjects are the writable scope; everything else is read-only context.
Propose — librarian-v2 runs the rename and drift audit first, then decides per touched subject: new, confirmed (propose nothing), or nothing; returns one JSON object with exactly five keys — facts, links, entities, merges, follow_ups.
Validate — the rejection gate: the proposal is applied in dry run first; every rejected item and every unknown envelope key comes back with a reason and a fix-it message (apply/index.ts REJECTION_MESSAGES). Rejections trigger exactly one retry turn: the model receives its previous proposal and the rejections in a <retry> block and answers with the full corrected proposal. The artifact records validation_gate as clean (no rejections first time) | retried (retry applied clean) | warned (rejections remained; they are dropped and logged).
Apply — the same validation and write gates as the backfill pass; subjects written are stamped in subject_index_state; the task's done_at is set.
Gate — on pr_imported, run_closed, and drift_recheck the flagger re-runs on the touched subjects after apply: clean completes; drift left releases the task once (drift_attempts=1); drift left again completes with the warning 'drift left unresolved after retry' in the pass artifact. The artifact records drift_gate as skipped | clean | released | warned.
Follow-ups — accepted follow_ups (at most 10 per pass, each a subject outside the writable scope) enqueue one drift_recheck task per subject with payload reason 'follow_up: <why>' and requested_by_task, deduplicated against pending drift_recheck tasks on the same subject; the artifact lists follow_ups_enqueued (follow_ups_projected in dry run).
> A failed pass or a dry run releases the claim (started_at back to null) so the task is retried later; more than five consecutive failures abort the run; a stop file halts new claims and lets in-flight passes finish.
```

## Related

- Sync — the between-runs phase: pull requests, Discord exports, wiki mirror syncs.

- PR Imported — the pr pathway: diff mapped to touched targets and files, discussion read, facts cite `pr://`.

- Discord Sync — new chat-export messages: bulk, lower priority, facts attached to the subjects they mention.

- Wiki Sync — newly mirrored wiki sections: bulk, lower priority, the usual seed for curated game concepts.

- Run — the run-close phase: fires when a worker run closes.

- Run Closed — the attempt pathway: summary agent writes the run object, librarian decides what facts change.

- Epoch Boundary — retired 2026-09-02; the page records what replaced the boundary phase.

- Regression — retired 2026-09-02; integration outcomes now live on the run row.

- Drift Recheck — retired as an epoch-boundary pathway 2026-09-02; survives only as the manual kg2-drift-scan job.

- Backfill Pass — one pass over one target, end to end: the funnel, the given context, the tooled agent, the apply gates, coverage stamping, and the parallel-isolation model.

- Drift Gate — rename continuity, the citation flagger, and the librarian's bounded definition of done.

- Knowledge Sources — the five sources these pathways ingest and the librarian searches; the locator grammar and search surfaces.

- Fact — the rows every pathway ultimately converges on; the librarian is their only writer.

- Evidence — the fact-owned rows the resolver checks on every librarian write.



# docs/10-system-design/40-knowledge/50-search-and-cards/10-knowledge-index

The knowledge index is a second SQLite file beside the store, `knowledge-index.sqlite`, holding full-text and vector indexes over the archival and attempt sources. The librarian tools search it; workers never touch it. It is derived from `knowledge.sqlite` and the past-PRs archive, so it can be deleted and regenerated. Code: apps/server/src/core/knowledge-v2/index.

## Tables

| Table | Columns | Source rows |
| --- | --- | --- |
| discord_fts | id (unindexed locator), content | discord_message; content is the message text |
| wiki_fts | id, content | wiki_section, latest mirror revision per (page, section) unless --all-wiki-revisions |
| pr_fts | id, title, body, discussion | pull_request plus the archived PR discussion |
| attempt_fts | id, hypotheses, transcript | worker_run and submission; the transcript column is written empty until run-state artifacts join the store |
| embedding_chunk | kind, locator, chunk_seq, text, text_hash, model, dim, vector; primary key (kind, locator, chunk_seq, model) | discord, wiki, and pr chunks; attempts are never embedded |

The id column of every FTS table holds a formatted locator, not a row id, so a search hit is already citable once the librarian resolves it.

## Chunking

| Source | Chunk |
| --- | --- |
| discord | One chunk per message whose text is the message plus five messages either side in the same thread (or channel when there is no thread). Sequence is always 0. |
| wiki | Sections over 6,000 characters split on the last newline, else the last space, else a hard cut. No overlap. Sequence increments. |
| pr | One body chunk (title and body, or summary) at sequence 0, then discussion chunks: a comment of 200 characters or more stands alone, shorter comments accumulate until the buffer reaches 200. Each discussion chunk carries a pr://<id>/comment/<i> locator. |

## Embeddings

The provider is an interface with two implementations. The OpenAI provider uses text-embedding-3-small, batches of 64, eight concurrent requests, five retries with jittered backoff capped at eight seconds, and reads its key from OPENAI_API_KEY or local.env. The fake provider returns deterministic hashed unit vectors and is what the tests use. Indexing is incremental by text hash: a chunk whose hash matches the stored row is skipped. Vector search is a brute-force cosine scan over every row for a kind and model, in process.

When no provider is available the librarian tools fall back to keyword search and report degraded: embedding_provider_unavailable in the search coverage they return.

## Rebuild

Every FTS build starts by deleting its table, so an FTS build is always a full replacement. An embedding rebuild clears the chunks for a kind before re-chunking; an incremental build leaves stale locators in place until the next rebuild.

```process-outline
kg2-index --all rebuilds FTS for every source and embeds discord, wiki, and pr incrementally
kg2-index --source <discord|wiki|pr|attempt> limits the build to one source; --fts or --embeddings limits it to one index kind
kg2-index --rebuild clears embedding chunks per kind before re-chunking; FTS is replaced either way
--no-embeddings, --all-wiki-revisions, --embedding-model, and --knowledge-root adjust the run; the result JSON reports per-source FTS counts and embedded, skipped, and skippedEmpty chunk counts
```

## Snapshot

On 2026-09-01 the index held 110,860 embedding chunks and one FTS table per source over 76,452 Discord messages, 12,995 wiki sections, and 22,275 pull-request rows.

## Related

- Knowledge Sources: the search surface each source exposes through the kv2 tools.

- Librarian Pathways: the passes that call the search tools.



# docs/10-system-design/40-knowledge/50-search-and-cards/20-target-card

The target card is the knowledge a worker gets at boot: the target's ledger, its live facts by type, and its links, built from V2 records by card.ts and appended to the worker prompt as a `<target_knowledge_card_v2>` block. It is read-only, built per boot, and never stored.

## Shape

**V2TargetCard** — apps/server/src/core/knowledge-v2/card.ts#V2TargetCard

```
stable_key: string  # unit:symbol, or the bare unit for a data target
target: object  # kind, unit, symbol, source_path, identity_status
  kind: function | data
  unit: string
  symbol: string
  source_path: string
  identity_status: current | moved | unresolved | retired
context_budget: full | compact | minimal  # The worker prompt budget the card was built for
ledger: object  # regression_count, runs collapsed to final_outcome, integration, submission_count, best_score, and the newest ledger entries
  regression_count?: integer
  runs: RunSummary[]
  entries: LedgerEntry[]  # event, submission, or pull_request entries, newest first
status?: object  # match_pct, linked, size from target_status
facts: object  # Keyed by fact type; inferred_name values render as guess: <value> (confidence <n>)
links: Link[]  # role, why, the other subject, and up to linkedFacts facts on that subject
```

## Budgets

| Budget | Ledger entries | Links | Facts per link | When |
| --- | --- | --- | --- | --- |
| full | 20 | 8 | 3 | The normal worker context budget |
| compact | 8 | 4 | 1 | The retry after a context-window rejection |
| minimal | 3 | 2 | 0 | The retry after repeated context-window rejections |

The naming note on every card reads: the target.symbol column is the only name a worker may write into source; inferred_name facts are guesses, not canonical names.

## Gates

There is no feature flag. The card is present when the data is present, and absent otherwise.

```process-outline
The packet target has a unit; otherwise no card
knowledge.sqlite exists for the game; otherwise no card
A target row with identity_status current matches the stable key, and its unit row exists
The target has at least one ledger entry or one fact; an empty record yields no card
```

## Who Reads It

| Reader | How |
| --- | --- |
| Worker prompt | workerTargetKnowledgeCardV2Xml appends the card after the packet context and the legacy graph file card, registered as the kernel input target-knowledge-card-v2 only when non-empty |
| Worker cycle | buildWorkerKnowledgeContext embeds the raw object as knowledge_card_v2 at the full budget |

## Related

- Worker Knowledge Surfaces: where the card sits in the worker's boot context and which tools it pairs with.

- Knowledge Record: the view the facts and links come from.



# docs/10-system-design/40-knowledge/50-search-and-cards

The derived layer of the knowledge system: everything here is computed from the store and can be deleted and rebuilt. The knowledge index gives the librarians full-text and vector search over the sources. The target card is the projection a worker receives at boot. Neither is ever the source of truth; that is the store described in Record Contracts.

## Pages

- Knowledge Index: knowledge-index.sqlite, one FTS5 table per source, the embedding chunk table, and the kg2-index job that rebuilds them.

- Target Card: the card built from V2 records and injected into the worker prompt, with its three budgets.

## Related

- Worker Knowledge Surfaces: the kv2 tools that read the store and the kept legacy code graph tools, the other derived store workers still read.



# docs/10-system-design/40-knowledge/60-worker-surfaces

A worker receives a bounded projection of the knowledge system at boot, queries deeper evidence through its tool profile only when the task needs it, and never writes knowledge. Its feedback reaches the store after the run closes, through the summarizer job and the librarian. Code: worker/context.ts assembles the boot context; profiles/defaults.ts names the tools.

## Boot Context

Worker boot context contains the canonical target identity and source reading excerpt, first-diff evidence, the V2 target card, and decompilation standards. Related functions and file editability arrive inside the target block. Tool definitions are supplied separately by the runtime.

| Block | Contents | Source |
| --- | --- | --- |
| Target | Canonical identity, approved source path, related functions, file editability, and a bounded source excerpt | Claimed target packet and current sandbox source |
| First diff | Bounded baseline instruction differences or an unavailable reason | Claim-time compiler comparison |
| Target knowledge | Prior runs and submissions, facts, and linked records | V2 target card |
| Decomp standards | Accepted worker-facing standards at the selected budget | Harness standards |

**Context budgets**

| Budget | Inline source limit | Standards | Target card |
| --- | --- | --- | --- |
| full | 32,000 characters, including the reading-view symbol footer | Every accepted worker-facing standard | 20 ledger entries, 8 links, 3 facts per link |
| compact | 12,000 characters, including the reading-view symbol footer | Five-rule condensation | 8 entries, 4 links, 1 fact per link |
| minimal | 3,000 characters, including the reading-view symbol footer | Two-rule condensation | 3 entries, 2 links, no facts per link |

The target card is the bounded V2 record view. When a source excerpt has usable proposed names, the proposed-name reading view replaces the raw inline excerpt. With no usable substitutions, the worker receives the canonical excerpt. Long reading views start near the target definition and provide continuation lines.

`renamed_from` and the drift report are librarian-context fields, carried by the `pr_imported` and `run_closed` contexts, not worker-card fields: the worker sees a rename only as the target it was handed, and drift only through the facts the librarian re-cited. See Drift Gate.

## Proposed-Name File Context

Workers and both librarians use proposed-name code to inspect the surrounding control flow, notice missing operations or asymmetric cleanup, and test whether an interpretation fits the file. Guessed names remain hypotheses. Agents verify claims against canonical code and compiler or archival evidence, and use original symbols in edits, tool arguments, subjects, and citations. A name is never evidence for its own meaning.

Both the event-driven and backfill librarians receive deduplicated file excerpts beside their canonical subject evidence. The context derives file paths from mechanical translation-unit identities and source locators. It includes at most four files, with up to 8,000 characters and 240 original lines per file. Large files start near the target definition. Canonical source spans remain in the subject records; the reading views are separately marked read-only. Missing files or knowledge produce an explicit fallback, and further files can be read on demand.

The renderer substitutes unambiguous function declarations, calls, and references using current direct inferred_name values. It preserves original line boundaries and reports canonical-to-proposed mappings with confidence and stable subject identities. Fields, parameters, data-section labels, comments, strings, preprocessor directives, and qualified C++ names remain unchanged. Ambiguous identities, local bindings, spelling collisions, and regions with syntax errors are skipped. This is a syntax-based reading view, not compiler name resolution.

knowledge_render_file accepts a checkout-relative source/header path, an optional start_line, and an optional max_lines. Each call reads current file contents, using the worker sandbox when present or the checkout selected for the librarian pass, including an explicit checkout override. The default is 240 lines within 32,000 rendered characters; max_lines can be raised to 2,000. The result carries the original source SHA-256 and next_line. Files over 2 MB and paths outside the checkout are rejected. If one line and its mapping cannot fit, read that region from canonical source. Refresh after edits because earlier views and hashes describe earlier contents.

## Tools

Workers share seven read-only knowledge tools with librarians. Librarians also have entity_lookup, unit_context, code_graph_search, and graph_related_functions. Source reading views do not write files or knowledge facts.

| Tool | Reads | Status |
| --- | --- | --- |
| knowledge_render_file | Current source/header with proposed function names, original line numbers, source hash, symbol mappings, and continuation | Worker sandbox or active librarian checkout; read-only KB |
| knowledge_record | The assembled V2 record for another target or entity | Live, V2 store |
| pr_search | Archived pull request summaries and discussion | Live, V2 store |
| discord_search | Archived Discord messages by text, channel, author, or time range | Live, V2 store |
| wiki_search | The latest mirrored wiki revision | Live, V2 store |
| attempt_search | Structured prior worker attempts, narrowed by hypothesis text | Live, V2 store |
| resolve_locator | The exact source material behind a Discord, wiki, PR, attempt, or code locator | Live, V2 store |

## Ship Gate

Standards are enforced, not consulted, at the gate. The deterministic layer is the review_lint diff scan: every finding cites the standard it violates, the scan fails closed when the scanner cannot run, and the QA verdict is combined into the handoff verdict. The worker-side check and the regression-check gate both go through the same scanner. Code: scan-diff.ts, qa-gate.ts.

<!-- sequence: ./assets/sequences/worker-knowledge-loop.sequence.json title="Worker boot, ship gate, and the feedback path" -->

## Feedback

The worker leaves no knowledge behind by itself. What it did becomes knowledge in three steps after the run closes.

```process-outline
The runner closes the worker state; with --worker-summary on, a worker_summary job is enqueued for it (default off; a catch-up pass enqueues any closed state that lacks one)
The summarizer turns the transcript and checkpoint digest into a worker_run, its submissions, and a run_narrative, then enqueues a run_closed index task
The librarian consumes the task and decides, per touched target and entity, whether any fact changes; the apply layer writes
```

## Related

- Worker: the agent page: context inputs, tools, when it runs.

- Standards: what the gate enforces.

- Run Closed: the pathway the feedback takes.



# docs/10-system-design/40-knowledge/70-standards

Standards are QA-owned, deliberately authored rules about how shipped source must look. They are part of the knowledge system but outside the knowledge graph: injected into the worker prompt at boot, enforced by the review_lint scan at the ship gate, shown to the librarians for recognition only, and never citable as evidence. Code: standards.ts, standards-files.ts, decomp-context.ts.

## Record

**Standard** — apps/server/src/core/knowledge/standards.ts#StandardsFileRecord

```
schema_version: string  # global_standard_v1
id: string  # global_standard:<slug>, lowercase letters, digits, hyphens
kind: string  # global_standard
status: enum  # accepted, proposed, superseded, merged, workflow_only
title: string
summary: string | string[]
do: string[]  # Preferred shapes; rendered to the worker as preferred prompt signals
do_not: string[]  # Rejected shapes; rendered as rejected prompt signals
evidence_refs: string[]
family?: string  # The slice directory the record lives in
severity?: string  # For example required
qa_enforcement?: string  # How the gate enforces it, for example partial_hard_lint_plus_repair_hints
qa_rule_ids?: string[]  # The review_lint rule ids that cite this standard
worker_facing?: boolean  # false hides the standard from the worker prompt
disposition, retired_into, example_policy, preferred_repairs, superseded_by, curator_update_policy?: optional
```

**StandardExample** — apps/server/src/core/knowledge/standards.ts#StandardExampleFileRecord

```
schema_version: string
id: string
standard_id: string
qa_rule_id?: string
severity: string
bad_pattern: string
preferred_shape: string
description?: string[]  # The legacy why field folds into this
evidence_ref?: string
```

## Enum status

| Value | Meaning |
| --- | --- |
| accepted | In force: injected to workers, enforced at the gate, shown to librarians |
| proposed | Awaiting QA review; not injected |
| superseded | Replaced by another standard named in superseded_by |
| merged | Folded into another standard |
| workflow_only | Governs the pipeline, not authored source; never worker-facing |

## Files

Standards live as per-family vertical slices under the decomp_standards source. order.json at the slices root fixes record order across families; consumers rely on it.

```
games/
└── melee/
    └── knowledge/
        └── sources/
            └── injectable/
                └── decomp_standards/
                    └── standards/  # Slices root, resolved through sources/registry.json
                        ├── <family>/
                        │   ├── examples.jsonl  # One example per line
                        │   └── standards.jsonl  # One standard per line
                        └── order.json  # families, standards, examples order
```

Seven families exist: literals_data_and_externs, asserts_reports_and_header_inlines, typed_access_and_pointer_math, codegen_tactics, names_defines_headers_and_prototypes, authored_source_shape, pipeline_owned_verification.

```process-outline
Rank family directories by order.json families; unlisted families sort last, alphabetically
Concatenate every slice's standards.jsonl (or examples.jsonl), then re-emit records in order.json sequence and append anything unlisted in family-then-file order
First record wins on a duplicate id
An edit through POST /api/standards rewrites the family slice and refreshes order.json
```

## Who Reads It

| Consumer | Form | Where |
| --- | --- | --- |
| Worker boot | The <decomp_standards> prompt block: accepted, worker-facing standards with their do and do_not signals; condensed to five rules at the compact budget and two at minimal | worker/context.ts |
| Ship gate | Enforced, not injected: review_lint findings carry the violated standard_id; the scan fails closed | validation/qa/scan-diff.ts, validation/jobs/qa-gate.ts |
| Librarians | Recognition only: id, title, summary of accepted standards, so a standard-mandated code shape is not mistaken for a developer convention | librarianStandardsView in backfill/runner.ts |
| Operator | GET /api/standards returns records, examples, the effective XML, context, inventory, and warnings; POST applies one validated edit | api/routes/knowledge.ts |

## Rules

> **decision: Not knowledge** — A standard is never a fact and never evidence. The librarian prompt says so in its rules, and the apply layer has no fact type or evidence kind a standard could occupy. A recurring tactic or a successful patch never publishes or changes a standard on its own; a person edits the slice.

## Related

- Worker Knowledge Surfaces: where the standards block sits in the boot context and how the gate uses it.

- Knowledge Sources: the five citable sources, which standards are not among.



# docs/10-system-design/40-knowledge/80-migration-and-rebuild

The migration uses an archive-first replacement, not an in-place cleanup. The current ledger remains available as historical input. New canonical stores begin empty, receive only records that pass typed classification and evidence gates, and become the inputs to a clean graph and search rebuild.

## Recommended Strategy

> **decision: Decision — selective canonical migration with deterministic projection wipe** — Always wipe and rebuild derived graph, FTS, target-card, ranking, and dashboard projections. Do not wipe raw source corpora, run-state attempts, PR archives, Discord archives, or the original ledger snapshot. Populate the new semantic store only from safe imports and fresh curation. If the audit classifier cannot separate semantic content reliably, import no legacy semantic assertions and rebuild expert memory from freshly cited evidence.

## Legacy Record Routing

| Legacy material | Destination | Rule | Outcome, 2026-09-02 |
| --- | --- | --- | --- |
| Purpose, field, type, state, data-flow, or game-meaning claim | Semantic candidate | Import only with a current anchor and resolvable evidence | 481 semantic candidates (166 symbol-scoped, all on targets V2 re-derived with code citations; 61 on retired symbols; 254 area, file, or general notes with no V2 subject): none imported |
| Scored submission (formerly checkpoint), score change, mismatch, failure, or negative result | Attempt memory | Join to the observed worker, PR, or QA attempt; do not rewrite as a belief | 19,975 attempt records: superseded by the run-state migration and the 4,592 summarizer narratives; not imported from the ledger |
| Boundary deferral, run state, queue state, retry, or lifecycle message | Operational event or archive only | Never import into semantic or attempt search by default | 487 operational records: never imported |
| Duplicate, superseded, or corroboration wrapper | Lineage link | Merge evidence and preserve evidence ids without copying the statement | 1,171 lineage records: never imported |
| Unanchored, ambiguous, unsupported, or unresolvable record | Quarantine | Retain for review; exclude from worker retrieval and graph projection | 0 quarantined; the classifier separated every record |

Outcome: the read-only classification of the 22,114 V1 records ran on 2026-09-02 and the full semantic reset was chosen. Nothing was imported from the ledger. The V1 ledger (learnings.jsonl and learnings-fts.sqlite) is frozen at games/melee/knowledge/deprecated/ledger-v1/ with a README; legacy readers point there until the Legacy graph and ledger exit item retires them.

## Migration Phases

```process-outline
Freeze an immutable migration snapshot
     -> Record ledger, FTS, graph, source-corpus, run-state, and code revisions plus hashes
Classify every legacy record
     -> Assign semantic, attempt, operational, lineage-only, or quarantine with a reason and classifier version
Resolve and validate import candidates
     -> Verify anchors, evidence locators against their kind's closed grammar, code-span digests, duplicate groups, and inferred-name policy
Write fresh canonical stores
     -> Import accepted attempts and semantic assertions; preserve original ids in provenance
Delete and rebuild every derived projection
     -> Recreate graph, FTS, target cards, rankings, and dashboard read models from one accepted revision
```

## Migration Gates

| Gate | Pass condition |
| --- | --- |
| Coverage | Every legacy record has a destination or quarantine reason |
| Semantic purity | Zero operational records and zero score-only claims enter semantic memory |
| Evidence | Every imported assertion resolves all required evidence and its current anchor |
| Attempt linkage | Every imported outcome joins to an observed attempt or is quarantined |
| Projection parity | Each search index and graph table matches the accepted canonical revision and record counts |
| Rollback | The original snapshot can restore the previous read path without mutating archived bytes |

## Initial Build

The initial build stands the new stores up in four phases. Phases 0 to 2 are independent of each other where their inputs allow; phase 3 requires all of them. Phase 3 is queue-driven: coverage is tracked in subject_index_state until every subject's cursor covers the corpus.

```process-outline
Phase 0 — ingest the sources
     -> Run the Discord scrape, PR import, and wiki mirror into their source tables; migrate attempts from the old ledger
     -> The old ledger is preserved as an immutable audit source; records classify into the new families or quarantine
Phase 1 — build targets
     -> Report reconciliation runs over the current report revision and writes the target rows and their statuses; on every later revision it also carries rename continuity — one newly unresolved and one newly inserted symbol in the same unit at the same address and kind are paired 1:1, the old row becomes identity_status moved with target.moved_to_id, and its facts, evidence, links, ledger rows, and index stamp are re-pointed in one transaction
Phase 2 — extract mechanical entities
     -> The entity extractor runs over the checkout at the same revision and inserts translation_unit, struct, and struct_field rows; parameter extraction is deferred
Phase 3 — backfill librarian
     -> The sync ingest pathways ran over the corpus: Discord through kg2-ingest; the wiki importer runs only on an explicit --lane wiki and never implicitly
     -> The backfill librarian makes a per-target pass over every target, against the current library and codebase state — never from scratch
     -> Target order comes from a deterministic prioritization query: targets ranked by available material across the sources, richest first
     -> The queue drains until every subject's cursor covers the corpus
```

**Build status, 2026-09-02**

| Phase | Status | Evidence in the store |
| --- | --- | --- |
| 0. Ingest the sources | Executed 2026-08-30 on the restructured schema | 76,452 discord_message; 12,995 wiki_section; 22,275 pull_request rows across the target/entity subject XOR; 5,378 worker_run and 14,791 submission rows migrated from the old ledger |
| 1. Build targets | Executed | 22,237 target rows: 19,828 function, 2,409 data; 22,210 target_status rows |
| 2. Extract mechanical entities | Executed | 6,316 entity rows: 1,075 translation_unit, 628 struct, 4,613 struct_field |
| Search index | Executed | FTS per source and 110,860 embedding chunks in knowledge-index.sqlite |
| 3. Backfill librarian | Complete 2026-09-02 (run backfill-01-20260901) | 22,237/22,237 targets and 1,070 unit entities stamped in subject_index_state; 119,611 fact, 264,410 evidence, 30,574 link, 8,297 entity rows (1,872 game_concept and 109 pattern admitted by the librarian); 22,158 targets carry facts, 79 stamped with empty or fully rejected proposals; 22,592 passes, 272 failed and retried to completion |

## The Full Semantic Reset

The reset was chosen on 2026-09-02. The rule was: choose it when legacy records cannot be classified reproducibly, evidence references cannot be resolved at useful rates, subject anchors cannot be mapped without guessing, or an evaluation sample shows unsafe semantic imports. The classification did separate the records (19,975 attempt, 1,171 lineage, 487 operational, 481 semantic candidates, 0 quarantine), but every symbol-scoped semantic candidate had already been re-derived by the backfill with code citations, and the rest had no V2 subject, so no legacy record was imported. The raw ledger and source archives are preserved: the V1 ledger lives at games/melee/knowledge/deprecated/ledger-v1/, attempt history came from run state through the migration and the summarizer, and semantic memory was rebuilt by the backfill pass over every target.

## Related

- Librarian Pathways — the agent roster, the phase-grouped inbound pathways, and the indexing-state shapes that drive phase 3.

- Knowledge Sources — the archival and operational corpora phase 0 ingests.



# docs/10-system-design/40-knowledge/85-dashboard-and-operator-controls

The dashboard presents the Knowledge System by record family and truth status. It does not label a flat statement list as the whole of what the system knows. The default view answers what the system currently believes about code, how that belief is supported, and where review is needed.

> **note: Build status, 2026-09-02** — The Knowledge tab's V2 Explorer shipped on 2026-09-02 as the default sub-view, backed by read-only routes under /api/knowledge/v2: summary, tree (the nested unit tree with target and fact counts), units/:unit/targets, record (facts by type with confidence, evidence, links in and out, and the ledger), entities (concepts and patterns with link counts), and search. The left pane holds the collapsible unit tree, target lists, search, and the concept and pattern lists; the right pane shows the selected subject's record. The legacy flat ledger view moved to /knowledge/legacy. The tables below carry a status per view and control; the worklist tracks what is still open, including the count of passes whose drift gate ended warned on the summary strip.

## Primary Views

| View | Default question | Required content | Status |
| --- | --- | --- | --- |
| Expert memory | What do we understand about this target? | Entity card, claims by type, aliases, confidence, status, relations, and game mappings | Built: the Explorer record pane |
| Attempts | What has been tried and what happened? | Goals, submissions, mismatch effects, failures, successes, and evidence | Built in part: the ledger on the record pane |
| Evidence | Can this claim be inspected? | Resolver status, exact locator, the material resolved from its knowledge source at read time, the digest for code spans, and the owning fact | Built in part: evidence rows on the record; resolver status and read-time material not shown |
| Review queue | What needs a decision? | Candidates, disputes, stale anchors, weak evidence, duplicates, and inferred-name warnings | Designed |
| System health | Are canonical stores and projections coherent? | Revision parity, index counts, unresolved evidence, stale anchors, and ingestion failures | Designed; the Explorer summary strip is the start |

## Target Detail

A file or function page starts with current identity and observed behavior. Likely meaning and inferred names are visually distinct from observed facts. Competing interpretations appear together. Attempts are ranked by target relevance, not ledger id. Every row opens the complete evidence chain and revision history.

## Operator Controls

| Control | Safety contract | Status |
| --- | --- | --- |
| Accept, dispute, refute, or mark stale | Writes an assertion revision with actor, reason, and evidence context | Designed |
| Resolve or remap an anchor | Shows old and new identity; never guesses or rewrites source | Designed; rename continuity in reconciliation now writes moved_to_id without an operator |
| Dry-run legacy classification | Produces counts, samples, and reasons without writing canonical stores | Closed: the classification ran read-only and closed 2026-09-02; no control needed |
| Run selective migration | Requires a frozen snapshot and all migration gates | Closed: not needed, the full semantic reset was chosen 2026-09-02 |
| Rebuild projections | Targets a named accepted revision and reports per-store parity | Designed |
| Start full semantic reset | Requires explicit confirmation of the archived snapshot and affects only replaceable semantic stores and projections | Closed: chosen 2026-09-02, V1 ledger frozen at games/melee/knowledge/deprecated/ledger-v1/ |

## Health Measures

| Measure | Signal |
| --- | --- |
| Semantic density | Accepted semantic claims per active file and function, split by claim type |
| Evidence resolution | Resolvable, missing, ambiguous, and superseded evidence counts |
| Anchor freshness | Current, moved, unresolved, and retired entity counts |
| Projection coherence | Canonical revision versus graph, FTS, card, and dashboard revision |
| Retrieval usefulness | Worker retrieval, evidence chase, adoption, contradiction, and rejection outcomes |

> **decision: Default ordering** — The first dashboard page sorts accepted and disputed semantic assertions by target relevance and review need. Operational events never occupy the default knowledge view. Attempt-only records appear only in the Attempts view or as evidence behind a semantic claim.



# docs/10-system-design/40-knowledge/90-record/10-implementation-record/10-agent-runs

This execution record captures the librarian configuration, the completed fan-out, and the measured backfill results. Pre-run estimates remain visible beside actuals so later operators can calibrate similar runs.

> **note: Historical, 2026-08** — This page records the pre-V2 librarian and backfill as they ran in August 2026. The agent, the doors, the ledger it wrote, and the CLI it used are retired. Kept for the run evidence and the source dispositions.

## Librarian configuration

The Kernel Agent Viewer (`GET /api/kernel/agents`) is the review surface for the librarian’s model, tools, and hydrated prompts. The catalog exposes one librarian with condense, curation, and PR-indexing doors; deterministic extraction and graph construction remain code.

**LibrarianKernelConfig**

```
name: "librarian"
model: string  # Judgment-capable configured model; CLI overrides must be intentional.
thinking: string  # Medium for intake; higher reasoning may be selected for corroboration.
doors: array
  kind: "condense" | "curation" | "pr_indexing"
tools: array  # Includes code graph, past PRs, SmashWiki, ledger search, and ledger write surfaces.
runInBackground: boolean
```

```json
{
  "name": "librarian",
  "thinking": "medium",
  "doors": [
    {
      "kind": "condense"
    },
    {
      "kind": "curation"
    },
    {
      "kind": "pr_indexing"
    }
  ],
  "runInBackground": true
}
```

## Execution contract

**Fan-out and safety**

| Concern | As-built behavior |
| --- | --- |
| Batching | PR, worker-target, and Discord ranges are independent manifest items. |
| Writes | Workers return proposals; controlled apply waves persist ledger changes. |
| Corroboration | A separate resumable pass deduplicates and judges merged proposals. |
| Recovery | Content-keyed manifests skip completed batches and retry transient failures. |
| Concurrency | The run ramped from 16 to 32 to 64 jobs and settled at 64. |

## Plan versus actual

**Backfill execution**

| Source | Pre-run estimate | Executed batches | Outcome |
| --- | --- | --- | --- |
| Past PRs | 600–1,400 calls | 1,168 | Complete |
| Worker history | 800–1,200 calls | 836 | Complete; 3,460 checkpoint-bearing workers across 836 targets |
| Discord | Range-dependent | 1 | Available synced-month range complete |
| Total | 2,400–4,900 calls and 8–17 hours including uncertain ranges | 2,005 planned batches | Complete in under two hours, excluding the separate corroboration manifest |

## Recorded output snapshot

**Ledger snapshot (2026-08-11)**

| Measure | Count |
| --- | --- |
| Latest records | 8,688 |
| AI-inferred / human-extracted | 8,279 / 409 |
| Corroborated / proposed / refuted | 1,327 / 6,625 / 736 |
| Corroboration manifest at write time | 66 / 187 |

All transient websocket failures recovered through manifest retry. A session interruption during corroboration led to per-wave manifest and apply crash safety; the snapshot does not imply that an unfinished historical manifest is still active.



# docs/10-system-design/40-knowledge/90-record/10-implementation-record/20-migration-map

The migration map records each legacy source’s final disposition and its route into the knowledge system. The table is canonical; the canvas and outline describe the one backfill pipeline shared by every retained input.

> **note: Historical, 2026-08** — This page records the pre-V2 librarian and backfill as they ran in August 2026. The agent, the doors, the ledger it wrote, and the CLI it used are retired. Kept for the run evidence and the source dispositions.

**Final source dispositions**

| Source | Final disposition | Destination or treatment |
| --- | --- | --- |
| decomp_standards | Keep | Authored standards remain authoritative; rejected patterns become linked examples. |
| banned_patterns | Retire | Records become standard examples or tombstones; the standalone source is removed. |
| path_facts | Retire | Evidence-backed facts become learnings; path resolution moves to the crosswalk. |
| tree_guide | Docs only | No seed import because its blurbs lack durable evidence references. |
| smashwiki | Keep | The file mirror remains directly searchable; crosswalk pointers locate relevant titles. |
| past_prs | Restructure | Typed PR intake feeds attempts and learnings through the librarian. |
| opseq_similarity | Keep | Epoch-derived index follows the shared extractor-to-JSONL-to-graph pattern. |
| code_graph | Extend | Adds asm-derived CALLS and REFERENCES_DATA plus other per-target edges. |
| Discord | Re-pull | Raw timestamped messages are primary input; the markdown distillate is a cross-check corpus. |
| Data sheet and external mirrors | Retire | Remain parked and unavailable to workers. |
| knowledge-curator and pr-indexer | Retire roles | One librarian absorbs their duties as typed doors. |
| powerpc_docs | Retire | Unused worker corpus is removed from active surfaces. |

## Canonical backfill flow

Backfill and live intake use the same librarian and publication rules. Backfill changes only the source range: each statement is anchored against the current checkout before chronology resolves supersession.

<!-- canvas: ./assets/canvases/backfill-process.canvas.json title="Knowledge intake — backfill vs live" -->

**Two ranges, one pipeline**

| Mode | Trigger | Anchor | Conflict handling |
| --- | --- | --- | --- |
| Backfill | One bulk range per source | Current checkout before filing | Evidence timestamps resolve supersession; failed anchors become historical context or are dropped. |
| Live | Worker completion, new PR, or Discord sync | Current checkout at intake time | New evidence corroborates or refutes existing learnings. |

```process-outline
pull typed source items with stable evidence and timestamps
extract candidate attempts and learnings through the librarian
validate content hashes and symbol anchors against the current checkout
publish anchored records; retain useful historical context for failed anchors
resolve contradictions by evidence and timestamp while retaining refuted evidence
> rebuild search and target links after the apply wave
```



# docs/10-system-design/40-knowledge/90-record/10-implementation-record

The knowledge rollout is complete. This record captures the shipped phases, their verification evidence, and the execution outcomes that resolved the former backfill questions.

> **note: Historical, 2026-08** — This record covers the rollout of the knowledge system that preceded V2: the learnings ledger, the three-door librarian, and the source backfills that fed them. The stores it describes are retired or deprecated. The V2 build is tracked in Validation and Rollout and the Worklist.

**As-built rollout**

| Phase | Shipped result | Verification |
| --- | --- | --- |
| Pre-flight | Core sibling dependencies replaced the retired agent-kernel symlink; transcript paths were repaired for condensation. | Kernel spawn and sampled session files resolved. |
| Prune | Unused sources and worker-facing wrappers were retired while durable product state remained intact. | Graph rebuild, worker boot, and smoke tests passed. |
| Indexes | Asm-derived calls/data references, Ghidra xrefs, sibling rules, and slim target cards landed. | Epoch rebuild emitted the new edge families and worker boot resolved pointers. |
| Ledger and librarian | The searchable ledger, checkpoint-derived attempts, and one librarian with condense, curation, and PR-indexing doors landed. | Agent Viewer review and real-data smoke covered all three doors. |
| Backfill | Past PRs, checkpoint-grounded worker history, and the available Discord range completed through resumable manifests. | 2,005 of 2,005 planned batches completed; retries recovered transient failures. |

## Resolved execution questions

**Questions closed by the run**

| Question | Executed contract | Evidence |
| --- | --- | --- |
| PR batching | Manifest planned and completed 1,168 past-PR batches. | Agent runs |
| Worker-history scope | Checkpoint-grounded grouping covered 3,460 of 3,987 workers in 836 target batches; transcripts remained an escalation source. | Agent runs |
| Discord source and tool | The landed puller uses discord-cli as primary and the direct API as fallback; the available synced-month range completed as one batch. | Migration map |
| Concurrency and recovery | The run ramped through 16, 32, and 64 jobs; batch manifests retried transient failures and corroboration gained crash-safe apply waves. | Agent runs |

Evidence for the rows above: Agent runs for batching, worker-history scope, and concurrency; Migration map for the Discord source and tool.

Detailed source dispositions and the single canonical backfill flow live in the migration map. Run estimates, configuration, and measured results live in Agent runs.



# docs/10-system-design/40-knowledge/90-record/20-decision-log

Current decisions lead this record. Superseded contracts stay only in the history table, each with what replaced it, so a reader can recognize an old name without mistaking it for active design.

**Current decisions**

| Topic | Current decision | Date |
| --- | --- | --- |
| Record separation | A score change, regression, boundary invalidation, or worker completion is never a fact. Facts carry meaning; worker_run and submission carry attempts; event carries operational history. | 2026-08-28 |
| One writer | Only librarian-v2 and backfill-librarian propose facts, evidence, links, and curated entities, and only the apply layer writes them after resolving every locator. Humans do not edit facts; a wrong fact is overwritten on the next pass. | 2026-08-30 |
| Knowledge record is a view | There is no stored knowledge_record row. The record for a subject is assembled at read time from facts, links, and the target ledger. | 2026-08-28 |
| Targets are workable items | target.kind is function or data. Translation units are entities; a target points at its unit through unit_entity_id. The file entity kind is gone. | 2026-08-29 |
| Archival sources are frozen | Discord, PR, and wiki rows never change after ingest; new material appends past a watermark. Archival locators carry no digest. | 2026-08-28 |
| Drift Gate | Code is the only drifting source. Reconciliation pairs renames within a unit (identity_status moved, target.moved_to_id) and re-points rows; a deterministic flagger re-digests code:// citations at head and feeds renamed_from and drift into the pr_imported and run_closed contexts; the consumer re-flags after apply, releases once for a retry, and completes with a warning on the second miss. Nothing auto-invalidates. drift_recheck is the manual kg2-drift-scan only. | 2026-09-02 |
| Closed locator grammar | Evidence cites through pr://, attempt://, code://, discord://, and wiki:// only, each with a fixed path shape the resolver checks on every write. | 2026-08-28 |
| Queue, not leases | Producers enqueue index_task rows; one consumer claims by pathway priority (run_closed first). Status is read off started_at and done_at. There is no job lease or fencing token. | 2026-08-30 |
| Summarizer writes the run object | The worker-summarizer writes worker_run, submission, and run_narrative rows at run close and never facts; the librarian decides what facts change. | 2026-08-30 |
| Integration outcomes are on the run | worker_run.integration (integrated | conflicted | null) and integration_detail are derived deterministically at run close from run-state integration results. No regression event, no index task, no librarian pass; the next worker sees the conflicted run and its conflict paths on its card. No agent resolves integrations. | 2026-09-02 |
| Full semantic reset | The V1 ledger is retired at games/melee/knowledge/deprecated/ledger-v1/ (frozen 2026-08-31). Classification closed as the full semantic reset: attempts were superseded by the run-state migration and the summarizer narratives; no semantic, lineage, or operational record was imported. Derived projections are wiped and rebuilt. | 2026-09-02 |
| Projections are disposable | The knowledge index (FTS and embeddings), target cards, and the legacy code graph rebuild wholesale from canonical inputs and are never the source of truth. | 2026-08-28 |
| Standards sit outside the graph | Standards are QA-authored rules injected at boot and enforced at the ship gate. They are not evidence and not facts. | 2026-08-28 |
| Inferred names stay internal | Likely names and roles are facts of type name marked as guesses; AI workers never write them into source or upstream PRs. | 2026-08-10 |
| Boot context | Workers receive one target card built from V2 records: ledger view first, facts by type with confidence, inferred names marked as guesses. Injected additively and only when V2 data exists for the target. | 2026-08-30 |
| Transcript retention | Full transcripts remain available after summarization and may be pruned later. | 2026-08-10 |
| Legacy graph is deprecated | The code graph, its builders, and the kg-* jobs keep running for the worker tools until those tools read from V2. The pages live under Deprecated; the ledger_search tool is the documented legacy exception. | 2026-09-01 |
| Backfill covers every target | The backfill runner covers every target in funnel order; there is no direct-material cut. Run backfill-01-20260901 stamped all 22,237 targets and 1,070 unit entities. | 2026-09-02 |
| Wiki ingest is opt-in | The kg2-ingest sync and all lanes never run the wiki importer; it runs only with an explicit --lane wiki, because the mirror rarely changes and the import is slow. | 2026-09-02 |
| Two doc tiers stay | 10-system-design and 20-implementation both remain; the implementation tier is neither folded into trailing pages nor salvaged into decision entries. | 2026-09-02 |

## History

**Decision record history**

| Date | Change | Superseded by |
| --- | --- | --- |
| 2026-09-02 | The backfill cut was dropped; the regression pathway and its event rows were retired for a deterministic integration record on worker_run; the drift_recheck epoch pathway became the Drift Gate; the selective migration closed as the full semantic reset. | Backfill covers every target; Integration outcomes are on the run; Drift Gate; Full semantic reset |
| 2026-09-01 | The V2 docs merged into this chapter; the legacy knowledge pages were deleted or moved under Deprecated; the agents got their own chapter. | This tree |
| 2026-08-30 | V2 cut-over: the three-door librarian, its five jobs, the Discord staging, and the smashwiki and decomp_standards worker wrappers were removed; librarian-v2, backfill-librarian, and worker-summarizer registered. | One writer; Summarizer writes the run object |
| 2026-08-29 | Units became entities and the file kind was removed; the store was rebuilt from scratch with the target/entity subject XOR on pull_request. | Targets are workable items |
| 2026-08-29 | The integration-resolver agent was removed in favor of a deterministic regression event and requeue. | Integration conflicts are events |
| 2026-08-28 | The V2 audit found the ledger behaving as run history; the contracts for fact, evidence, link, and the target ledger were fixed. | Record separation; Selective migration |
| 2026-08-11 | Backfill execution closed the source-batching, worker-scope, Discord-tool, and concurrency questions of the pre-V2 system. | Historical: Implementation record |
| 2026-08-10 | One librarian with condense, curation, and PR-indexing doors replaced the curator and PR-indexer roles; knowledge jobs used queued, waiting, claimed, running, succeeded, failed, cancelled with fenced leases. | One writer; Queue, not leases |
| 2026-08-10 | The librarian judged corroboration without a fixed count; every attempted tactic got a failed, partial, or success outcome; worker_checkpoints were the attempt authority. | Record separation (confidence on the fact; submission outcomes) |
| 2026-08-10 | Mechanical wiki crosswalks covered the ft, gr, and it families; asm-derived call edges replaced heuristic edges with Ghidra xrefs as a cross-check; sibling rules lived as game configuration. | Legacy graph is deprecated; wiki_section as an archival source |
| 2026-08-10 | An append-only learnings log with a searchable FTS index was the ledger; worker completion triggered incremental maintenance and epoch boundaries triggered full rebuilds. | Knowledge record is a view; Projections are disposable |
| 2026-07-02 | The model converged on evidence-backed learnings, graded attempts, target-anchored stores, and a searchable ledger. | The V2 contracts |



# docs/10-system-design/40-knowledge/90-record/30-open-questions

What is still undecided in the knowledge system as of 2026-09-02. Resolved items leave this page; their decisions land in the decision log.

| Question | Where it bites | Status |
| --- | --- | --- |
| The allowed identity_status transition graph, where the moved and retired successor mapping lives (a successor_id column or a reconciliation table), and who approves a mapping. | Targets, drift recheck | Closed 2026-09-02: the successor mapping is target.moved_to_id, written by reconciliation (one unresolved and one inserted symbol per unit, address, and kind; ambiguous addresses are reported and left alone). No approval step. |
| Whether a future report that enumerates individual data symbols should split a data section row into per-symbol rows, and how those reconcile against the section rows already stored. | Targets | Open |
| Parameter entities: the extractor writes translation_unit, struct, and struct_field; parameter extraction is deferred. | Entities | Deferred |
| The backfill cut: which ranked targets the first pass covers, and when phase 3 starts. | Migration and rebuild, Backfill pass | Closed 2026-09-02: no cut; every target in funnel order. Run backfill-01-20260901 covered all 22,237. |
| When the worker profile's graph tools and ledger_search move onto the V2 store and knowledge index, so the legacy code graph and learnings ledger can retire. | Deprecated, Worker surfaces | Open |
| The dashboard: the designed views, controls, and health measures are not built; the operator page still shows the legacy ledger. | Dashboard and operator controls | Open |
| Whether docs/20-implementation survives as a tier, becomes a trailing page per system-design chapter, or is salvaged into decision entries. | Docs | Closed 2026-09-02: keep both tiers. |
| Record contract pages sit four levels deep under this chapter where the structure standard wants three. | Docs | Open |



# docs/10-system-design/40-knowledge/90-record/40-v2-audit

The current Knowledge System combines a durable learning ledger, an independently derived code graph, multiple source corpora, attempt views, a librarian pipeline, worker search tools, and a flat dashboard. The code graph provides strong structural orientation. The learning ledger has become a mixed record sink dominated by attempt summaries and operational outcomes, so its name and presentation overstate how much semantic code understanding it contains.

> **note: Historical, 2026-08-28** — This audit describes the legacy knowledge system as it stood before the V2 rebuild: the learnings ledger, its FTS sidecar, the old librarian pipeline, and the flat dashboard. Every surface it names is retired or deprecated. It is kept as the record of why the rebuild happened and what the numbers were.

## Ledger Snapshot — 2026-08-28

| Measure | Count | Interpretation |
| --- | --- | --- |
| Ledger records | 20,189 | All valid JSONL records accepted by the current broad LearningRecord shape |
| Worker/live-history | 12,408 | Most volume describes activity or outcomes rather than stable code meaning |
| Past PR | 5,574 | Historical lessons are useful but frequently duplicate attempt-oriented material |
| Discord + corroboration + boundary | 2,178 | Human context, repeated records, and operational boundary findings share one surface |
| Proposed status | 13,282 | The majority has not moved through a meaningful review lifecycle |
| Attempt-only evidence | 17,370 | Most records lack independent code, graph, human, or external grounding |
| Actual SmashWiki sections | 11 | Game-mechanics grounding is effectively absent from the ledger |

## Current Storage and Projection Topology

| Surface | Current role | Audit result |
| --- | --- | --- |
| learnings.jsonl | Canonical LearningRecord file | Mixes beliefs, attempts, findings, and operational events under one statement field |
| learnings-fts.sqlite | Independent full-text index | Contains 14,128 rows versus 20,189 ledger records and is not transactionally refreshed |
| Knowledge graph SQLite | Rebuilt entities, facts, edges, chunks, and source versions | Sound derived-store model, but ledger projection inherits ledger noise |
| Attempt view | Observed worker and checkpoint summary built from run-state tables | Separates raw outcomes conceptually but does not retain librarian tactic overlays |
| SmashWiki mirror | Raw searchable external corpus | Available to librarians, absent from the worker tool profile |
| Knowledge dashboard | Flat ledger collection and detail view | Shows the mixed ledger rather than the full graph, attempts, corpus, or health state |

## What Already Works

Workers actively use shared retrieval. In the latest 500 sessions, 495 used ledger search, 490 used related-functions lookup, 488 searched past PRs, and 458 used graph search. The target-first code graph, call and data-reference edges, opseq analogs, siblings, PR history, and current match metadata already provide a useful structural base. The redesign should preserve these surfaces and change what semantic content they project.

## Primary Failure Modes

| Failure | Observed behavior | Required correction |
| --- | --- | --- |
| Semantic collapse | One free-form statement type represents meanings, tactics, score changes, failures, and lifecycle notes | Typed record families and claim types |
| Operational contamination | Epoch-boundary deferrals are written as human_extracted, corroborated, confidence 1 learnings | Route them to operational events or admission findings |
| Lossy publication | The librarian returns summary, attempt_overlays, verdicts, and rejected material; condensation persists only learnings | Persist every governed output in its owning store |
| Weak evidence gate | Validation checks non-empty strings and numeric ranges, not evidence resolution or claim support | Resolver-backed validation and review rules |
| Retrieval distortion | Alphabetical IDs put boundary records at the front, and boot-card reduction omits detailed learning statements and relations | Use target relevance, status, evidence quality, and uncertainty-aware cards |

> **status: Audit conclusion** — The Knowledge System is operating, workers rely on it, and the derived graph is valuable. The ledger currently behaves mainly as searchable run and PR memory. It does not yet provide a trustworthy expert model of what decompiled code likely means. Rebuilding only the graph would reproduce the same problem; the canonical record model and publication paths must change first.



# docs/10-system-design/40-knowledge/90-record/50-retired-concepts

Every concept the knowledge docs once described and no longer do, with what replaced it. A concept lands here when its code is gone or when it survives only as a legacy exception with a named exit. Current contract pages do not mention these names.

## Retired With V2

| Concept | What it was | Replaced by | Retired |
| --- | --- | --- | --- |
| Learnings ledger | learnings.jsonl plus learnings-fts.sqlite: one free-form LearningRecord per statement, mixing beliefs, attempts, findings, and boundary events | fact and evidence rows, the knowledge-record view, worker_run and submission rows, event rows. ledger_search left the worker profile on 2026-09-03; workers read the V2 store through the knowledge tools | 2026-08-30 |
| knowledge_record revisioning | A stored table with one revisioned row per subject, edited by humans and the librarian | A query that assembles facts, links, and the ledger for a subject at read time. Nothing is stored; a wrong fact is overwritten on the next pass | 2026-08-28 |
| Librarian doors | One librarian agent with three entry doors (condense, curation, pr_indexing) and the librarian_v1 contract | librarian-v2 over the index_task queue and backfill-librarian over one target, both emitting librarian_pass_v1 into the apply layer | 2026-08-30 |
| related_target and entity_target tables | Join tables that attached targets and entities to each other | The link table, and the unit_entity_id foreign key from target to its translation_unit entity | 2026-08-29 |
| file entity kind | An entity row per source file | The translation_unit entity, one per report unit, with the source path as its locator | 2026-08-29 |
| unit targets | target.kind = unit rows for translation units | Targets are workable items only, function or data. Units are entities | 2026-08-29 |
| Attempt ledger and attempt view | A ledger of attempts derived from run-state tables with librarian tactic overlays | worker_run, submission, and run_narrative rows written by the summarizer job, read through the target-ledger view | 2026-08-30 |
| background_knowledge_jobs | Durable knowledge jobs with fenced, expiring leases, a serialized materializer, and a manual knowledge.process drain | The index_task queue: producers enqueue, the librarian consumer claims by pathway priority, status is read off started_at and done_at | 2026-08-30 |
| knowledge_absorption job | The job the worker close enqueued so the librarian could condense the transcript | The worker_summary job and the run_closed index task | 2026-08-30 |
| Corroboration records | Separate ledger records counting agreeing evidence | The confidence and rationale on a fact, judged by the librarian against the evidence it cites | 2026-08-30 |
| Integration resolver | An agent that hand-merged worker-output conflicts in the cycle checkout | A deterministic re-queue for the next epoch; the outcome is recorded on worker_run.integration (the regression event it first used was retired 2026-09-02) | 2026-08-29 |
| Crosswalk index | Mechanical wiki-title mappings for the ft, gr, and it families | wiki_section rows as an archival source, and game-concept entities the librarian curates from them | 2026-08-30 |
| Connection map canvas | A hand-drawn map of graph edges and query paths | The record-linkage canvas on Record Contracts, generated from the DDL | 2026-09-01 |
| kg-librarian-backfill | The CLI that ran librarian doors over source batches | kg2-backfill, kg2-librarian, kg2-ingest, kg2-index, kg2-prioritize, kg2-renarrate | 2026-08-30 |
| Regression pathway | An index_task pathway plus event rows written when a worker's output failed integration, claimed by the librarian ahead of other work | worker_run.integration and integration_detail, derived deterministically at run close from run-state integration results and shown on the V2 card; the event table keeps note events only | 2026-09-02 |
| drift_recheck epoch pathway | An epoch-boundary pathway that flagged facts whose code span digest no longer matched and enqueued a recheck per subject | The Drift Gate: rename continuity in reconciliation, the deterministic flagger feeding the pr_imported and run_closed contexts, and the consumer's one-retry gate. drift_recheck survives only as the manual kg2-drift-scan | 2026-09-02 |
| V1 ledger | learnings.jsonl (22,114 records) and learnings-fts.sqlite at the game knowledge root, read by ledger.ts, the learnings graph builder, and the dashboard | Nothing: the full semantic reset. Frozen 2026-08-31 at games/melee/knowledge/deprecated/ledger-v1/ with a README; the last legacy readers (ledger.ts, the learnings graph builder, the classification lane, the legacy learnings API and dashboard view) were deleted 2026-09-03 by the Legacy graph and ledger exit | 2026-09-02 |

## Retired Before V2

Inputs the earlier design already kept outside the worker-facing graph. They have no rows in the V2 store and no search surface.

| Source | Former role | Reason |
| --- | --- | --- |
| Tree guide | Human-authored semantic guide to source areas | Its blurbs carry no evidence references |
| Path facts | Path-matched prompt snippets | Ownerless authored facts drift; durable claims are facts with evidence |
| PowerPC docs | ISA reference corpus | Not a useful worker retrieval surface |
| Parked archives | Deprecated source collections | No extraction or worker-access contract |

```
games/
└── melee/
    └── knowledge/
        ├── sources/
        │   ├── deprecated/
        │   │   ├── external_mirrors/  # Parked archive
        │   │   ├── legacy_index_roots/  # Parked archive
        │   │   └── ssbm_data_sheet/  # Parked archive
        │   ├── injectable/
        │   │   └── path_facts/  # Retired path-matched facts
        │   └── rag_search/
        │       └── powerpc_docs/  # Retired ISA corpus
        └── tree_guide/  # Human documentation only
```

## Related

- Decision log: the decisions behind each retirement, dated.



# docs/10-system-design/40-knowledge/90-record/60-validation-and-rollout

Rollout begins with a measured target set, not a bulk migration. The feature must prove that workers receive more accurate code meaning, repeat fewer failed approaches, and can inspect the evidence behind each claim without inferred names leaking into source.

> **note: Rollout plan, written 2026-08** — This is the validation plan the V2 build was rolled out against. The evaluation set, acceptance tests, and definition of done are still the bar. A table of implementation seams that once sat on this page was removed on 2026-09-01: every row pointed at a file the rebuild retired.

## Evaluation Set

Create an operator-reviewed set of representative files and functions across characters, engine systems, data-heavy code, state machines, matched and unmatched targets, and targets with known human interpretations. For each target, record expected purpose, known mappings, acceptable hypotheses, known false interpretations, useful prior attempts, and the evidence needed to support them.

## Acceptance Tests

| Area | Required test |
| --- | --- |
| Record separation | Operational and score-only fixtures cannot validate as semantic assertions |
| Evidence | Broken, ambiguous, stale, or unrelated locators block acceptance and identify the failing field |
| Lifecycle | Candidate, dispute, refutation, staleness, supersession, and graduation preserve revision history |
| Retrieval | Golden target queries return expert claims before unrelated attempt or event text |
| Worker output | Attempt overlays, verdicts, rejections, and semantic candidates all reach their governed destinations |
| Naming safety | Prompt previews, patch gates, and review lint prove inferred aliases cannot become AI-authored source identifiers or comments |
| Rebuild | Two builds from identical canonical inputs produce identical graph, FTS, target-card, and dashboard digests |

## Rollout Order

```process-outline
Lock the contracts and evaluation set
Implement canonical stores, resolvers, lifecycle, and deterministic projection builders
Pilot expert cards and contribution outputs on the evaluation targets
Dry-run the legacy classifier, review samples, and choose selective import or empty semantic reset
Cut over retrieval and dashboard reads only after migration and projection gates pass
```

## Definition of Done

| Condition | Proof |
| --- | --- |
| Expert memory is real | Reviewed target queries answer what code does and likely means with anchored evidence |
| History is separated | Attempts remain useful while operational events do not appear as beliefs |
| Names are safe | Internal aliases are useful in reasoning and absent from AI-authored source changes |
| Migration is accountable | Every legacy record has a destination or quarantine reason and the original snapshot is retained |
| Projections are disposable | Graph, FTS, cards, rankings, and dashboard state reproduce deterministically from a named canonical revision |



# docs/10-system-design/40-knowledge/90-record/70-worklist

This is the working plan for the Knowledge System V2 build-out, organized into six workstreams. The contracts themselves live in the sibling sections; this doc tracks the work — dependencies ride in the notes — and is pruned as items land.

## Schema and Storage

| Item | Status | Notes |
| --- | --- | --- |
| V2 schema DDL: core objects, knowledge system, target ledger tables | done | Restructured per operator direction: targets are workable items only (function | data, 22237 rows); translation units are entities (unit_entity_id FK); pull_request carries a target XOR entity subject; store rebuilt from scratch, all constraints tested |
| Source tables: discord_message, wiki_section | done | discord_message and wiki_section landed with the schema; shapes per the source docs |
| indexing_state tables: source_watermark, index_task, subject_index_state | done | source_watermark, index_task (status derived from timestamps), subject_index_state (subject XOR) landed with the schema |
| Old-ledger classification: migrate attempts, quarantine the rest | done | Closed 2026-09-02 as the full semantic reset: read-only classification of the 22,114 V1 records gave 19,975 attempt (superseded by the run-state migration + 4,592 summarizer narratives), 1,171 lineage and 487 operational (never imported), 0 quarantine, 481 semantic candidates (166 map to targets V2 re-derived with code citations, 61 to retired symbols, 254 area/file notes with no V2 subject) — none imported. V1 ledger moved to games/melee/knowledge/deprecated/ledger-v1/ with a README; legacy readers repointed until the Legacy exit item retires them. |
| Search indexes: FTS per source + embedding index | done | knowledge-index.sqlite: FTS5 per source + text-embedding-3-small indexer (concurrent requests, fake provider in tests); rebuildable wholesale; code has no index |

## Ingestion and Sync

| Item | Status | Notes |
| --- | --- | --- |
| Discord importer → V2 rows + watermark + enqueue | done | knowledge-v2/ingest/discord.ts over the raw JSONL export files; watermark + archival_ingest tasks; kg2-ingest CLI |
| Wiki importer → wiki_section rows per mirror revision | done | knowledge-v2/ingest/wiki.ts; one row per (page, section, revid), re-sync inserts at new revision |
| PR importer: archive + mechanical enrichment (touched targets from diff) | done | Unit-attributed rows key on the translation_unit entity; CI-table rows attribute functions (8052) and data sections (1270); 97 section rows unresolvable; deterministic throughout |
| Entity extractor: translation_unit, struct, struct_field, parameter from the report and checkout | done | translation_unit (from report.units[], locator = source path), struct, struct_field from headers; file kind removed; parameter deferred |
| Harness knowledge intake: sync publish + epoch boundary feed V2 | done | 2026-09-03: the boundary's ingestMergedUpstream hook was a no-op and the operator sync staged PR postmortems only the deleted legacy path read, so the store sat at the Aug 11 checkout (242 PRs behind). runKnowledgeIntake (harness-intake.ts) now fetches merged-PR dumps into the canonical archive and runs the kg2-ingest sync lane at both seams; legacy sync knowledge tables dropped by orchestrator migration 005; operator sync merges upstream with the boundary's policy merge instead of rebasing (phases/running/epochs/policy-merge.ts shared) |
| Reconcile: cross-unit rename continuity | done | 2026-09-03: pairing was per unit, so a file move (melee#3304 moved 516 units holding 10,071 targets / 51,781 facts) would have stranded them. Second pass pairs by (kind, address) across units when unique on both sides, and a unit whose targets all land in one new unit merges its translation_unit entity into the new one (facts, links, PR rows, index stamps re-pointed; reported as renames.moved_units) |
| Knowledge checkout: one resolver | done | 2026-09-03: kg2-ingest, kg2-librarian, drift, backfill, and the kv2 tools resolve the checkout through knowledge-v2/checkout.ts (explicit flag → active cycle worktree → legacy games/melee/checkout with a warning); kg2-librarian no longer defaults to process.cwd(); target.report_revision is the git head, report_digest kept for logs |
| PR archive backlog 2823–3266 | open | The canonical past_prs archive stops at PR 2822 (the old watermark). The intake only fetches PRs merged in the sync/boundary it runs for; the gap between 2822 and the first wired sync must be fetched once by hand (fetch_recent_pr_dump.py --postmortem-mode off) and drained as pr_imported tasks |

## Agents

| Item | Status | Notes |
| --- | --- | --- |
| Librarian design: context strategy, output contract, write gates | in flight | librarian-v2 fully built: prompt reworked (touched/supporting split, standards, per-pathway new/confirmed/nothing criteria), per-pathway context assembler with mention map and slice re-chunking, queue consumer (claim priority, kill switch, dry-run releases its claim, dry-run projects the archival split without enqueueing, --task selector) with kg2-librarian CLI. pr_imported contract settled over three pilots on pr-2130 itbox.c: lv2-02 cited code only; lv2-03 satisfied a pr:// gate with CI rows; lv2-04 (final) requires a discussion-comment citation whose body or attached diff hunk names the subject (apply gate missing_pr_citation / irrelevant_pr_citation; discussion records now carry path/line/diff_hunk) — 11 facts + 2 links, all comment-cited, 0 rejected, subjects without discussion contribute nothing. Store proven unchanged every run. Residual: comments are cited via their hunks, so semantic discussion content is unproven on this style-only PR; check on the first drained PR with real discussion. Gate-1 NOT signed off: the queue consumer does not run in the backfill step; sign-off deferred to the drain |
| Backfill librarian design: per-target sweep across all search surfaces | done | Audited against a real rendered pass: context split into fill-out/supporting, standards trimmed to recognition fields, target entries now carry source span + analogs (has_facts) + grouped ledger with attempt:// locators; prompt gained thinking (source trust order, per-type quality guide, link roles) and a for-each workflow; dashboard preview renders a real pass; gate-1 signed off by the operator 2026-09-01 |
| Summarizer job + run-close seam wiring | done | worker_summary job kind + consumer wired behind --worker-summary, default off; now writes the `run_narrative` sidecar, composes `submission.description` from approach + outcome_reasoning, joins by echoed `submission_id` with strict set equality, and condenses transcripts (tool results stubbed to 300 chars, 400KB budget) |
| Librarian consumer run-loop lane (--librarian-consumer) | done | Mirrors the summarizer lane: flag default off, librarian_consumer_flag_recorded event, startLibrarianConsumerLane (knowledge-v2/librarian/lane.ts) polls the queue continuously, drains by priority, pauses on sync, idles when empty, stops in the run-loop finally; zero-footprint-when-off test |
| Worker summarizer definition registered in the agents view | done | — |
| Integration-resolver removal | done | Deterministic requeue + regression event replaced it |
| Worker summarizer prompt rework + historical re-narration backfill | done | Prompt rebuilt to the house standard (purpose/goal/context_contract/workflow/rules/definition_of_done, singleOutput), output shape settled interactively: `run{summary}` + `submissions[{submission_id, approach, outcome_reasoning}]` + `notable_observations`; no librarian framing, no hypothesis/dead_ends fields. `kg2-renarrate` (knowledge-v2/renarrate) backfilled history queue-silent in funnel order at 16→32→64→128 lanes: 4,592 of 5,378 runs narrated, 784 skipped no_transcript, 2 failed twice on mangled ids (re-runnable). Docs: Worker Runs page carries the `run_narrative` shape and enrichment exception. |
| Post-build validation: librarian prompt audit, sync batch, new cycle | done | Closed 2026-09-04 on cycle c66a1559 (base a3ee42bb). Sync-down: reconcile paired 10,943 renames (206 same-unit, 10,737 across units from melee#3304) with 0 ambiguous, merged 514 moved unit entities, carried 119,611 facts; 242 PR dumps fetched and imported (3,467 unit-attributed rows, 202 pr_imported tasks), Discord refresh pulled 422 messages (11 archival tasks), attempts lane 166 rows. Drain validation-01: 364 real passes — pr_imported 323 (33 sweeping PRs split into 119 children; 1 failure context_length_exceeded before the split landed), archival_ingest 11, drift_recheck 30 (follow-ups). Gates: validation clean 320 / retried 10 / warned 0 (13 first-pass rejections: 10 irrelevant_pr_citation, 3 missing_pr_citation); drift clean 329 / released 1 / warned 0; Explorer drift warnings 0. Writes: 6,979 items applied, 0 final rejections; facts by type purpose 1,447 / data_flow 1,447 / game_mapping 1,349 / state_behavior 1,295 / inferred_type 1,058 / inferred_name 353; 28 links (all target→entity), 2 curated entities, 22 follow-ups → drift_recheck. Store after: 119,604 facts, 258,521 evidence rows (231,378 code), 30,602 links; 1,470 subjects re-stamped. Prompt-audit round one landed the same day (no target→target links, confirmed = propose nothing, inferred_name rule, head_revision + locator grammar, rejection gate, follow_ups, rename/drift audit). Round-two evidence in the next row. — Cleanup 2026-09-04: per-character target-test concepts merged into game_concept:target-test (602 links). Second sync on the cycle (5 PRs 3250/3305–3309, 36 Discord messages) published through the wired path after a baseline-cache gap was fixed (fresh cycles now seed build/GALE01/baseline.json). Drift backlog: the drift tooling had four scale bugs (git spawn per citation, cache thrash, evidence query plan, unindexed entity.merged_into_id, quadratic block search) — all fixed; kg2-drift-scan now 33 s, kg2-drift-reanchor 2 min. Re-anchor rewrote 153,556 citations mechanically (39,913 same path, 14,160 moved path, 99,483 shifted); 73,128 changed-content and 5,238 gone-path spans went to the librarian as 1,020 unit rechecks (split into ≤12-subject children). Residual drain (validation-01 + 01b–01j, 8→64→32 concurrent; provider latency, not the host, was the ceiling): 2,102 passes completed (296 pr_imported, 12 archival, 1,799 drift_recheck), 399 splits, validation 2,064 clean / 43 retried / 0 warned, drift 2,090 clean / 5 released / 0 warned, 68,034 items applied (facts purpose 12,853 / data_flow 11,840 / game_mapping 10,819 / inferred_type 10,803 / state_behavior 10,176 / inferred_name 6,065; links 5,475; entities 3; follow-ups 110), 13 failures (11 provider upstream_unavailable on two oversized gmtou children before the per-task failure cap landed, 1 timeout, 1 pre-split context overflow), 0 abandoned. Final scan: 23,206 subjects, 0 drifted, 0 unresolvable; all 213,619 code citations at head 3c0e6117; Explorer drift warnings 0. Store: 119,335 facts, 232,815 evidence rows, 36,046 links. Attempt FTS rebuilt (4,633 of 5,425 rows with text, was 0). — Second live sync 2026-09-04 (sync-008ed5bd): 7 upstream PRs (3308, 3310, 3311, 3312, 3317, 3318 + one more commit), 104 Discord messages; head 3c0e6117 → cc248b79. melee#3317 renamed ~206 fighter-kind units: reconcile paired 3,567 targets / 203 units with 0 ambiguous; validation first blocked on 4,774 false regressions (evaluator keyed by unit name) → rename-aware regression evaluation landed (functions paired by address across units, moved_units reported; the boundary breakage gate shares it), then on upstream's own bookkeeping (2+2) → adopt-upstream when the cycle has only merge commits since the base; then on upstream_moved_after_validation → resumed and published. Residual drain (validation-02/03/04, 32 concurrent, provider incidents: 502 'previous response owner unavailable' on rejection-gate retry turns, a full no-accounts outage, then one LB account returning 403 on every request): 938 passes completed (919 unit rechecks, 17 PR, 3 Discord), 137 splits, validation 931 clean / 8 retried / 0 warned, drift 935 clean / 1 released / 0 warned, 17,604 items applied (facts inferred_type 3,604 / purpose 3,587 / data_flow 2,973 / game_mapping 2,755 / state_behavior 2,315 / inferred_name 1,657; links 713; follow-ups 30), 64 provider failures, 8 abandons (re-queued by the scan and finished in the mop-up). Final scan: 0 drifted, 0 unresolvable, 213,383 citations at head cc248b79; Explorer drift warnings 0. Store: 119,323 facts, 232,108 evidence rows, 36,759 links. |
| Fact re-cite without rewrite (op: recite) | open | Backfill finding: 22,542 unit-entity fact writes for 4,140 entity/type pairs because 'confirmed → re-cite' had only op write, and apply does not dedupe a same-value write. Prompt-side fix landed 2026-09-03 (confirmed = propose nothing). Mechanical fix still open: an op that attaches new evidence to the standing fact row without replacing it, in schema.json and apply/index.ts |
| Librarian prompt audit round 2: evidence from validation-01 | open | 1) pr_imported learned almost nothing from discussion: 6,856 of 6,865 facts were drift re-cites of standing facts (4,157 on unit entities, 2,690 on targets), 9 were new material; the drift audit dominates the pass on match-style PRs whose comments are CI reports. Decide whether drift re-cites belong in pr_imported at all or should route to drift_recheck, and whether unit-entity facts should re-cite on every member change. 2) inferred_name: 353 proposals; on real-symbol targets 41, of which the clears of landed guesses (rename audit, e.g. gmvsmode:onExitVs) are correct, but two 3304 passes proposed 'original module stem' names on already-named unit files (itdkinoko.c, itfflowerflame.c) — the better-name rule needs a stronger bar for units. 3) Links: only 28 in 364 passes (25 implements), entities 2 — the concept test may now be too strict; check concept coverage of new material in the follow-up passes, which produced all 93 new-material facts. 4) archival_ingest: 11 Discord passes, 0 facts, touched subjects 0–25 after the mention-map fix (was ~60); mention map quality still worth a look (one slice touched 25, another 15). 5) Sweeping PRs: 33 tasks split into 119 children; child passes still re-cite every drifted fact per unit — cost ~3 min/pass. Consider a cheaper mechanical re-cite for unchanged spans (digest match at head) before the model sees them. 6) Explorer target total counts moved rows (33,280 vs 22,332 current); record view has no rename lineage (renamed_from) yet. 7) PR archive raw/ and extracted/ are git-ignored and the new dumps have no tracked metadata (counts.json); the V2 importer no longer needs it, but the archive is local-only. |
| Drift tooling at scale | done | 2026-09-04: code-file cache in the citation resolver (per pass / per scan, worktree reads at head, 4,096-file LRU), evidence queries driven from the fact index, entity.merged_into_id index, unit-ordered scan with progress and cache stats, unit-less entities enqueued singly, kg2-drift-reanchor (mechanical re-cite at head: same path, merged-unit path map, indexed block search; wired into the intake after reconcile), batched drift_recheck split at claim (≤12 subjects), per-task failure cap (split after two failures, else abandon with a warning; passesAbandoned in summaries) |
| Librarian drain robustness (provider incidents) | open | Seen 2026-09-04 evening: (a) rejection-gate retry turns continue the previous model response and the Codex LB can route the continuation to another backend account → 502 'Previous response owner account is unavailable'; send the retry as a fresh request (full context, no previous_response_id) or pin the account per pass. (b) Four drains opening the store at the same instant → 'database is locked' at startup; the schema check needs a busy retry. (c) A provider outage burns failure counters and abandons tasks; the consumer should treat 5xx/403/no_accounts as provider errors that neither count toward the per-task cap nor abort the run, and back off instead. (d) One LB account answered 403 on every request; the LB should evict an account after N consecutive 403s. (e) Explorer target total still counts moved rows (36,883 vs 22,329 current). |

## Migration Job

| Item | Status | Notes |
| --- | --- | --- |
| Target prioritization query: rank targets by material across sources | done | kg2-prioritize, read-only; after function-level PR attribution 7584 of 20903 targets carry material (was 2743); ranking re-measured |
| Backfill run plan: batches, coverage via subject_index_state, stop condition | done | Executed as run backfill-01-20260901 (2026-09-01/02) over ALL 22237 targets in funnel order, no direct-material cut (operator decision: completeness order over the whole report population); medium thinking via codex-lb; concurrency ramped 32 -> 64 -> 128, then 5 shard processes x 26 lanes after the runner proved single-thread CPU-bound. Plan assumptions superseded: batches/index_task rows unused (runner claims in-process), coverage = subject_index_state stamp. |
| Initial-build execution: phases 0–2 then backfill | done | Phase 3 complete: 22237/22237 targets stamped, 1070 unit entities stamped; store holds 119611 facts, 264410 evidence rows, 30574 links, 8297 entities (1872 game_concept, 109 pattern admitted); 22158 targets carry facts, 79 stamped with empty envelopes or rejected-only proposals. 22592 passes, 272 failed (241 relay 403/502/503 outage, 11 malformed envelopes, 5 timeouts, 2 kernel-lock collisions before the busy_timeout fix), all retried to completion by two sweeps. Fixes landed during the run (uncommitted): runner covers zero-direct-material targets; --shard i/n; --max-consecutive-failures; kernel DB busy_timeout; evidence(fact_id) index + migration 003. Prompt evidence collected for the operator: out-of-scope callee links (4531), unit-entity fact churn, inferred_name on already-named symbols, build/ and stale-revision code citations, envelope key drift. |

## Worker Surfaces and Tooling

| Item | Status | Notes |
| --- | --- | --- |
| Target card / knowledge-record card rebuilt on V2 records | done | knowledge-v2/card.ts on V2 records: ledger view first, facts by type with confidence, inferred names always marked as guesses; injected additively and gated on V2 data presence |
| Worker knowledge tooling audit | done | smashwiki_search/get_page + decomp_standards_proposals closed to workers (librarian-only); ledger_search left as the documented legacy exception until migration |
| Retire kgLibrarianCondense + the template-only pr-indexer | done | Legacy librarian fully removed: condense + pr-indexer door + curation door, the five legacy jobs, Discord librarian staging (raw sync preserved), the agent itself (catalog 5 to 4), and orphaned tools (smashwiki_*, decomp_standards_* wrappers); worker-facing legacy tools retained until worker surfaces migrate |

## Docs and Hygiene

| Item | Status | Notes |
| --- | --- | --- |
| Record-linkage canvas regeneration | done | Regenerated 2026-09-01 from storage/ddl.ts: every table through migration 003, every foreign key, the locator kinds as dashed edges. Validates against the canvas schema. |
| Style and prose audit across the section | done | 2026-09-01: draft-for-review language removed from every state-shape; proposal-era pages (audit, validation) moved to the record with dated callouts; retired concepts appear only as 'former' references or in the retired-concepts page; migration phases carry executed/pending status. |
| Entities doc: extractor-as-writer carve-out for the mechanical kinds | done | Entities "Who writes" now names reconciliation (translation_unit) and the extractor (struct, struct_field, parameter) as insert-if-missing mechanical writers, the librarian for curated kinds; landed with the units-to-entities restructure |
| Commit the V2 docs + agent code | done | Baseline commit landed: docs rename + contracts/sources/pathways/worklist, integration-resolver removal, worker-summarizer scaffold |
| Done this round: fact/evidence/link contracts, knowledge sources + search surfaces, pathways + diagrams, conflict requeue, summarizer registered, resolver removed | done | Details in the section docs |
| Docs merged into system design | done | 2026-09-01: the V2 tree moved under 10-system-design/40-knowledge; legacy knowledge pages deleted or moved to 90-record/80-deprecated (that section deleted 2026-09-03 with the legacy exit); agents got 10-system-design/45-agents; 20-implementation/10-agents collapsed to the runtime page and 30-knowledge rewritten as a module map. Plan and disposition table in objectives/knowledge-system-v2/docs-merge-plan.md |
| Code/contract gap: regression and drift_recheck producers | done | Redesigned and closed 2026-09-02. Regression: no pathway — worker_run.integration/integration_detail are set deterministically at run close from run-state integration results (conflicted with paths + failure reasons), shown on the V2 card; backfilled 1677 integrated / 47 conflicted. Drift: reconciliation pairs renames by unit+address (moved + moved_to_id, migration 005) and re-points rows; a deterministic flagger re-digests code citations at head and feeds renamed_from + drift into the pr_imported and run_closed contexts; the consumer re-flags after apply and releases once for retry when drift remains (definition of done). drift_recheck survives only for the manual kg2-drift-scan (one task per unit). Prompt instruction for the librarian to fix flagged drift is the operator's. |
| Code/contract gap: librarian disable list is a no-op | done | Closed 2026-09-03 (commit 86c24ce5): the no-op toolProfile.disable lists were removed from both librarian runners; the librarian profile is the allow-list and a test asserts it holds no legacy search or lint tools. |
| Code/contract gap: drizzle schema lags the DDL | done | Done 2026-09-03 (18167651): storage/schema.ts models run_narrative, schema_migrations, target.moved_to_id, and evidence_fact_id; schema.test.ts introspects a fresh store against drizzle so parity is tested. ddl.ts stays the schema of record |
| Code/contract gap: parameter entities | done | Done 2026-09-03 (18167651): the entity extractor writes parameter entities with locator <function stable_key>#<ABI slot>, no parent entity, insert-if-missing; declarations it cannot read with certainty are skipped and counted |
| Docs: worker-summarizer registry role | done | Done 2026-09-03 (18167651): registered under its own tool-free 'summarizer' role and profile, grouped under knowledge in the kernel catalog; agent page and agents index updated |
| Docs: implementation tier future | done | Keep both tiers, decided 2026-09-02: 10-system-design and 20-implementation both stay |
| Explorer summary: count of passes whose drift gate ended warned | done | Done 2026-09-03 (18167651): the final drift-gate outcome is persisted on the task; /api/knowledge/v2/summary reports warned and released counts, /api/knowledge/v2/drift-warnings lists the warned passes, and the Explorer summary strip shows the count with a clickable list |
| Legacy graph and ledger exit | done | Done 2026-09-03 (9fa6a39b): the V1 ledger is a frozen archive under games/melee/knowledge/deprecated/ledger-v1/; the learnings graph builder, the ledger classification lane, the legacy learnings API, the legacy dashboard view, and core/knowledge/ledger.ts are deleted; boundary notes are V2 events (kind note, cause upstream_change, migration 006); the worker profile replaced ledger_search with knowledge_record, pr_search, discord_search, wiki_search, attempt_search, resolve_locator. The code-graph tools are kept. 90-record/80-deprecated deleted from the docs |

## Related

- Knowledge Sources — the source docs whose draft shapes await review.

- Record Contracts — the settled fact, entity, and requeue contracts the open items build on.

- Librarian Pathways — the agent roster, backfill librarian included, and the indexing-state drafts awaiting review.

- Migration, Pruning, and Rebuild — the initial-build order and the backfill phase the migration items execute.



# docs/10-system-design/40-knowledge/90-record

Record is the knowledge chapter's appendix. It holds history, reports, and retired concepts. Nothing here is a current contract; the contracts live in the chapters above.

## Pages

- Implementation record: the pre-V2 rollout phases, executed backfills, and run evidence. Historical.

- Decision log: current decisions first, then the history of superseded contracts.

- Open questions: what is still undecided, and where resolved items point.

- V2 audit: the 2026-08-28 audit of the legacy ledger that motivated the rebuild.

- Retired concepts: every retired concept and what replaced it.

- Validation and rollout: the acceptance tests and rollout order for V2.

- Worklist: the live checklist of V2 work, pruned as items land.



# docs/10-system-design/40-knowledge

The Knowledge System is the harness's expert memory for the codebase. It records what functions, data, translation units, structs, fields, and game concepts mean, how strongly each interpretation is supported, and what has already been tried. Beliefs, attempt history, operational events, the raw knowledge sources, and derived projections live in separate tables so each is searched and maintained by its own truth model.

Raw material lives in five knowledge sources, in two classes. Archival sources (Discord, pull requests, wiki) are frozen once ingested: new material appends rows and gets them indexed, existing rows never change. Operational sources (attempts and code) grow with the run itself; code is the only source that drifts. Every claim in the graph cites into a source through a typed locator. Standards are part of the knowledge system but outside the knowledge graph: QA-owned authored rules, injected at worker boot and enforced at the ship gate, never citable as evidence.

The store is one SQLite file per game, games/melee/knowledge/knowledge.sqlite, with a rebuildable search index beside it. The code is apps/server/src/core/knowledge-v2; the agents that write to it are in Agents.

## Five Domains

| Domain | Canonical contents | Default worker use |
| --- | --- | --- |
| Semantic memory | Evidence-backed beliefs about code and game meaning: fact rows on targets and entities | Target-first expert context |
| Attempt memory | Observed goals, submissions, outcomes, and negative results: worker_run and submission rows | Avoid repeated work and adapt successful moves |
| Operational history | Integration outcomes recorded on worker runs at run close (integration and integration_detail), and note events | Excluded unless diagnosing orchestration |
| Knowledge sources | Raw Discord, PR, wiki, attempt, and code material | Resolved on demand behind evidence locators |
| Derived projections | FTS and embedding index, target cards, the legacy code graph | Fast retrieval; never canonical truth |

## Reading Order

Read the chapters in this order. Each one uses the vocabulary the one before it establishes.

- Knowledge Sources: the five sources every claim cites into, the closed locator grammar, and the search surface over each.

- Record Contracts: the tables. Core objects (target, entity, link), the knowledge system (fact, evidence, the assembled knowledge record), and the target ledger (worker runs, pull requests, events).

- Evidence, Confidence, and Lifecycle: how evidence resolves, what confidence means, and how a fact goes stale, gets re-cited, or is overwritten.

- Librarian Pathways: the inbound pathways by phase, the queue between producers and the librarian, and the backfill pass over one target.

- Search and Cards: the derived layer. The knowledge index the librarians search and the target card the worker receives.

- Worker Knowledge Surfaces: the boot card, the worker tool profile, and the ship gate.

- Standards: the QA-owned rules that sit outside the graph.

- Migration and Rebuild: the initial build from the legacy ledger and the rebuild order for projections.

- Dashboard and Operator Controls: the views and controls the design calls for. The Knowledge tab's V2 Explorer is built (2026-09-02); the review queue, health measures, and write controls are still designed only.

- Record: history, reports, retired concepts, and the deprecated legacy code graph pages.

## Working Memory Loop

```process-outline
Resolve the worker target against the build report and load its linked entities: translation unit, structs, fields, game concepts, patterns
Load the target card: live facts with confidence and rationale, linked entities, and the full target ledger, newest first
Chase code, assembly, graph, PR, worker-run, or wiki evidence only when the task needs detail
Record the run outcome as a worker_run with its submissions, separate from knowledge
The librarian indexes the run into facts, entities, links, and evidence; rebuild affected projections for later workers
```

## Store Snapshot

Row counts from the live store on 2026-09-02, after run backfill-01-20260901 stamped every target and unit entity.

| Table | Rows |
| --- | --- |
| target | 22,237 (function 19,828; data 2,409) |
| entity | 8,297 (struct_field 4,613; game_concept 1,872; translation_unit 1,075; struct 628; pattern 109) |
| pull_request | 22,275 |
| worker_run | 5,378 |
| submission | 14,791 |
| run_narrative | 4,592 |
| discord_message | 76,452 |
| wiki_section | 12,995 |
| index_task | 1,869 |
| source_watermark | 4 |
| fact | 119,611 |
| evidence | 264,410 |
| link | 30,574 |
| subject_index_state | 23,307 (22,237 targets; 1,070 entities) |
| event | 0 (note events only; nothing writes regression events) |



# docs/10-system-design/45-agents/10-worker

The worker executes one claimed Melee decomp target (`unit::symbol`) toward a 100% objdiff match inside its own detached git worktree; a turn may end short of a full match, and runner-checkable progress is a valid outcome. It edits only its approved write set (initially just the target file) and ends by emitting a free-form `runner_validation_handoff` JSON note, which may carry an evidence-backed `write_set_widening_request`. The runner owns checkpoints, validation, and lifecycle.

Sources: apps/server/src/core/agent-catalog/agents/running/worker.

## Context Inputs

The context budget (full, compact, or minimal), the claimed target packet with the source inlined at the budget's limit, baseline evidence, a repair request when one exists, decomp standards, canonical tool paths, the available-tools listing, the legacy graph file card, and the V2 target card when the store holds knowledge for the target. The card and the budgets are described in Worker Knowledge Surfaces.

## Tools

The largest core-tool profile (31 tools): graph and knowledge search (`code_graph_file_card`, `code_graph_search`, `knowledge_graph_search`, `graph_related_functions`, `past_prs_search`, `knowledge_record`, `pr_search`, `discord_search`, `wiki_search`, `attempt_search`, `resolve_locator`), compile-and-diff (`checkdiff_run`, `checkdiff_summary`, `direct_compile_tu`, `objdiff_score_candidate`), MWCC debugging (`mwcc_debug_lookup`, `mwcc_debug_dump_function`, `mwcc_debug_diagnose_stack`, `mwcc_debug_diagnose_regflow`, `mwcc_debug_diagnose_inlines`, `mwcc_alloc_snapshot`, `mwcc_alloc_compare`), permutation and mutation (`source_permuter_run`, `source_permuter_replay`, `source_mutation_preview`), decomp aids (`type_oracle_lookup`, `m2c_decompile`, `asm_window_search`, `type_layout_lookup`), and lint (`review_lint_scan`, `review_lint_sdata2_order_helper`). File-editing builtins are injected at spawn and scoped by the per-claim worktree.

## When It Runs

Dispatched by the run scheduler loop during the running phase: one session per claimed target, working in a per-claim detached worktree, with the context budget degrading across retries. On finish, its best checkpoint is enqueued into the worker-output integration queue, and with --worker-summary on, a worker_summary job narrates the run for the knowledge system.

## Governed By

- Worker lifecycle — checkpoint, continuation, and closure behavior.

- Worker write safety — the write-set and widening model.



# docs/10-system-design/45-agents/20-librarian-v2

The event-driven librarian. It consumes one index_task, judges every touched subject against the material the task carries, and returns one librarian_pass_v1 proposal. It never writes the store: the apply layer validates every item and performs the writes. Model codex-lb/gpt-5.6-sol, thinking medium, runs in the background, no subagents.

Sources: apps/server/src/core/agent-catalog/agents/knowledge/librarian-v2, apps/server/src/core/knowledge-v2/librarian, apps/server/src/core/knowledge-v2/apply.

## Context Inputs

The rendered packet has six sections in this order. The consumer assembles them per pathway from the store; the prompt template only names the slots.

| Section | Contents |
| --- | --- |
| task | The index_task id, pathway, payload, and a per-pathway instruction |
| object | The triggering object: the run, the PR, the archival slice, the event, or the drifted subject |
| touched_subjects | The subjects owed a decision, linked entities first and targets last, each with its knowledge record and, where the pathway grants it, material |
| supporting_subjects | Game concepts and patterns linked to the touched targets: context to read, not owed facts |
| decomp_standards | Recognition only: id, title, summary of accepted standards |
| output_contract | schema.json inlined |

**Object by pathway**

| Pathway | Object | Caps |
| --- | --- | --- |
| run_closed | worker_run header, submissions with attempt:// locators, the run narrative, integration | None |
| pr_imported | pr_ref, number, title, body, discussion, CI rows with before/after/delta, unit rows | 40 comments kept (the PR body always, then longest first); each diff hunk tail-truncated to 1,500 chars; 12 targets by absolute delta, overflow reported as omitted |
| archival_ingest | The slice's records, a truncated flag, and the mention map from symbol, unit basename, and hex-address tokens | 40 Discord messages or 20 wiki sections per slice (larger slices split into children); 12 targets by mention count; material only for subjects mentioned twice or more |
| regression | The event and its resolved refs (worker runs, pull requests) | None. No producer enqueues this pathway yet |
| drift_recheck | The subject and its flagged facts, each evidence item with the resolver's verdict | None. No producer enqueues this pathway yet |

## Tools

The librarian profile: code_graph_search, graph_related_functions, and the eight kv2 tools (discord, wiki, pr, and attempt search; subject_record, entity_lookup, resolve_locator, unit_context). The prompt requires resolve_locator on every locator before it is cited; search snippets are never evidence.

## Output

```json
{
  "facts": [{
    "subject": {"target_stable_key": "main/melee/ft/ftcommon:ftCo_800BFFD0"},
    "type": "purpose", "op": "write",
    "value": "...", "rationale": "...",
    "confidence": 0.7,
    "evidence": [{"kind": "pr", "locator": "pr://1234/comment/2", "why": "..."}]
  }],
  "links": [{"from": {}, "to": {}, "role": "...", "why": "...", "kind": "code", "locator": "code://<rev>/<path>#L10-L20"}],
  "entities": [{"kind": "game_concept", "locator": "...", "note": "..."}],
  "merges": [{"loser_locator": "...", "winner_locator": "...", "why": "..."}]
}
```
> **L2 (facts):** One item per (subject, type). op write overwrites the live fact and replaces its evidence set; op clear removes it.
> **L4 (subject):** Exactly one of target_stable_key or entity_locator.
> **L8 (confidence):** 0 to 1 as a judgment; the apply layer clamps anything above 0.99.
> **L9 (evidence):** Every item resolves through the locator grammar before the fact is written; a code:// item gets its digest here.
> **L11 (links):** Rejected as duplicate when an identical (from, to, role, locator) row exists.
> **L12 (entities):** Only game_concept and pattern may be admitted; the mechanical kinds come from the extractor.
> **L13 (merges):** Both sides must be curated kinds; a mechanical merge is rejected.

The prompt frames every task as new, confirmed, or nothing: new material writes or overwrites facts; confirmed material re-cites the standing fact; nothing means no facts, and the task still completes. Run outcomes and scores never become facts; events are never cited; inferred_name facts are guesses, never rename instructions.

## When It Runs

```process-outline
A consumer lane claims the next queued index_task by pathway rank: run_closed and regression first, then pr_imported, archival_ingest, drift_recheck; FIFO within a rank; 64 candidates per scan
The context is built for the pathway; a builder failure fails the pass and releases the claim
For pr_imported the apply layer requires a pr://<n>/comment/<i> citation on every item, and the cited comment must mention the subject
The model returns the envelope within the timeout (900 s by default); a malformed envelope fails the pass
applyLibrarianPass runs entities, then facts, then links, then merges; every touched target is stamped in subject_index_state, a touched entity only when a fact or link landed on it; the task's done_at is set
The artifact goes to <stateDir>/knowledge_v2/librarian/<runId>/<task>.json and a line to run-log.jsonl
```

| Entry point | Behavior |
| --- | --- |
| kg2-librarian --run-id <id> | Drains the queue with --concurrency (default 4), optional --pathway, --task, --limit, --dry-run, --knowledge-root; --stop writes the stop file; --status reports queue and pass counts |
| --librarian-consumer on the run loop | A long-lived lane polling every 5 s at concurrency 4, paused while a sync workflow is active. Default off |
| Stop and safety | A stop file at <stateDir>/knowledge_v2/librarian/<runId>.stop, an abort signal, and a circuit breaker after five consecutive failures |
| Dry run | The model runs and the apply layer simulates; the claim is released, nothing is stamped, the artifact records dry_run: true |

## Writes

| Row | Through | Rule |
| --- | --- | --- |
| fact and its evidence | apply layer | One live fact per subject and type; overwrite replaces the evidence set; curated subjects skip when a newer fact landed during the pass |
| link | apply layer | Both ends in scope; duplicates skipped |
| entity (game_concept, pattern) | apply layer under the shared gate | Admit if missing; mechanical kinds rejected |
| entity merge | apply layer under the shared gate | Curated kinds only |
| subject_index_state | consumer | Stamped at pass completion with the pass timestamp |
| index_task | consumer | started_at at claim, done_at at completion, released on failure or dry run |

## Governed By

- Librarian Pathways: the pathways and the queue.

- Fact and Evidence: the rows a proposal becomes.

- Evidence, Confidence, and Lifecycle: the write gates the apply layer enforces.

## Decisions

**Decision**: the agent proposes and never writes. Every item passes shape validation, subject resolution, scope, citation resolution, and the pathway's citation rule before a row changes. **Why**: the legacy librarian wrote the ledger directly from model output and the ledger filled with run history; one mechanical gate makes every knowledge path parseable and auditable. **Applies to**: this agent, the backfill librarian, and any future knowledge writer.

**Decision**: a librarian pass is scoped to the subjects its context named; a fact on a subject outside scope is rejected as out_of_scope, except on curated entities, which are always in scope under the shared gate. **Why**: parallel lanes partition the store by scope; without it two passes could clobber each other's facts. **Applies to**: the consumer's lanes and the backfill runner's lanes.

**Decision**: the two librarian agents share one schema shape, duplicated in two schema.json files. **Why**: the apply layer is the only consumer and validates by field, not by file; the duplication is tolerated, and a drift between the two files is a worklist item, not a design choice. **Applies to**: both schema files.



# docs/10-system-design/45-agents/30-backfill-librarian

The target-driven librarian. Given one target, it works an ordered fill-out loop, linked entities first and the target last, researching each subject across every search surface and returning one librarian_pass_v1 proposal against the current record, never from scratch. Same model, same tools, same apply layer as the event-driven librarian; a different entry point.

Sources: apps/server/src/core/agent-catalog/agents/knowledge/backfill-librarian, apps/server/src/core/knowledge-v2/backfill, apps/server/src/core/knowledge-v2/migration/prioritize.ts.

## Context Inputs

| Section | Contents |
| --- | --- |
| task | run_id, target_stable_key, and the instruction to work the fill-out subjects in order |
| fill_out_subjects | Every linked mechanical entity (unit first, then structs and fields), then the target, each numbered and carrying its knowledge record. The unit entry carries unit context: members with match percentages, up to 15 recent PRs. The target entry carries its detail, its grouped ledger with attempt:// and pr:// locators (events carry none), and material |
| supporting_subjects | Game concepts and patterns linked to the target: context, not owed facts |
| decomp_standards | Recognition only: id, title, summary of accepted standards, so a standard-mandated shape is not read as a developer convention |
| output_contract | schema.json inlined |

| Target material | What | Limit |
| --- | --- | --- |
| source | The function body located in the unit file at the checkout revision, comment-sanitized, as a code:// span plus text | 200 lines; fail-soft reasons such as symbol not found or ambiguous symbol match |
| analogs | opseq analogs, callers, and callees from the legacy graph, each with match_pct and whether it already has facts | 8 |

## Tools

The librarian profile. The prompt's per-subject loop is: attempt_search, pr_search, discord_search, wiki_search for text; graph_related_functions for analogs, then knowledge_record on them; entity_lookup before admitting any entity; resolve_locator in full before citing.

## Output

```json
{
  "facts": [{
    "subject": {"target_stable_key": "main/melee/ft/ftcommon:ftCo_800BFFD0"},
    "type": "purpose", "op": "write",
    "value": "...", "rationale": "...",
    "confidence": 0.7,
    "evidence": [{"kind": "pr", "locator": "pr://1234/comment/2", "why": "..."}]
  }],
  "links": [{"from": {}, "to": {}, "role": "...", "why": "...", "kind": "code", "locator": "code://<rev>/<path>#L10-L20"}],
  "entities": [{"kind": "game_concept", "locator": "...", "note": "..."}],
  "merges": [{"loser_locator": "...", "winner_locator": "...", "why": "..."}]
}
```
> **L2 (facts):** One item per (subject, type). op write overwrites the live fact and replaces its evidence set; op clear removes it.
> **L4 (subject):** Exactly one of target_stable_key or entity_locator.
> **L8 (confidence):** 0 to 1 as a judgment; the apply layer clamps anything above 0.99.
> **L9 (evidence):** Every item resolves through the locator grammar before the fact is written; a code:// item gets its digest here.
> **L11 (links):** Rejected as duplicate when an identical (from, to, role, locator) row exists.
> **L12 (entities):** Only game_concept and pattern may be admitted; the mechanical kinds come from the extractor.
> **L13 (merges):** Both sides must be curated kinds; a mechanical merge is rejected.

The goal is stated against the live record: preserve supported knowledge and fill its gaps, revise changed claims, clear claims the evidence no longer supports. A subject with nothing supportable contributes no facts. Sibling functions are research material, never fill-out subjects.

## When It Runs

```process-outline
kg2-prioritize ranks every target: direct score = runs x3 + submissions x1 + PRs x4 + Discord mentions x5 + events x2; inherited score from the unit's PRs and mentions breaks ties only
The runner takes targets never indexed, above --min-direct-score when set, up to --limit, striped by --shard i/n
Lanes (default 4) claim targets from a shared cursor, polling the stop file <stateDir>/knowledge_v2/backfill/<runId>.stop on every claim
Per target: build the pass context, run the model (900 s timeout), apply without a required citation, stamp the target always and each linked entity only when a fact or link landed on it
The artifact goes to <stateDir>/knowledge_v2/backfill/<runId>/<target>.json with context, proposal, apply report, and timings; a run-log line and a summary JSON follow
Five consecutive failures abort the run; --dry-run runs the model and simulates the apply without stamping
```

Sort order after the never-indexed filter: match rank (100 percent first), linked, named symbol, higher unit named ratio, direct score, inherited score, stable key. Symbols like lbl_, fn_, unk_, and bare hex chunks do not count as named.

## Writes

Identical to the event-driven librarian: fact, evidence, link, curated entities, and merges through the apply layer; subject_index_state stamped by the runner. There is no index_task; the target list is the queue.

## Governed By

- Librarian Pathways: the pathways and the queue.

- Fact and Evidence: the rows a proposal becomes.

- Evidence, Confidence, and Lifecycle: the write gates the apply layer enforces.

- Migration and Rebuild: phase 3, the pass this agent executes.

- Backfill Pass: one pass end to end with a worked example.

## Decisions

**Decision**: backfill is a different entry point on the same contract, not a different agent contract. It reuses the envelope, the apply layer, the shared gate, and the stamping rule. **Why**: two write paths would mean two validators drifting apart; the only differences a target-driven pass needs are its context and its population. **Applies to**: the backfill runner and any future bulk pass.

**Decision**: the population is ranked by material, richest first, and coverage is recorded per subject, so a run can stop and resume at any point and never re-processes a stamped target. **Why**: the store has 22,237 targets and most have no material; ranking makes the first batches worth reviewing and stamping makes the run idempotent. **Applies to**: kg2-prioritize, kg2-backfill, and the --shard striping.



# docs/10-system-design/45-agents/40-worker-summarizer

The run-close agent. From one closed worker's transcript and its deterministic checkpoint digest it writes the narrative half of the run object: a run summary, one approach and outcome reasoning per submission, and reusable observations. It never writes facts. A single prompt with no tools; model codex-lb/gpt-5.6-sol, thinking medium, background.

Sources: apps/server/src/core/agent-catalog/agents/knowledge/worker-summarizer, apps/server/src/core/knowledge-v2/summarizer-job, apps/server/src/core/knowledge-v2/renarrate.

## Context Inputs

| Section | Contents |
| --- | --- |
| task | Summarize this closed worker run from its digest and transcript |
| target_reference | The V2 target id and stable key |
| checkpoint_submission_digest | The scored checkpoints and the mechanical submissions; renarration adds the existing worker_run row |
| worker_transcript | The condensed transcript: 400,000 bytes total, tool results cut to 300 chars, user text and custom messages to 2,000, elisions marked inline |
| output_contract | schema.json inlined |

## Tools

None. The registry binds it to its own summarizer role, whose tool profile is empty, and the kernel catalog groups it under knowledge with phase worker-summary, beside the two librarians. Its source lives under agents/knowledge because its output is knowledge-system rows.

## Output

**worker_summary** — apps/server/src/core/agent-catalog/agents/knowledge/worker-summarizer/schema.json

```
run: object
  summary: string
submissions: object[]  # Exactly one per digest submission, joined by submission_id
  submission_id: string  # Echoed verbatim; the only runtime field allowed
  approach: string
  outcome_reasoning: string
notable_observations: object[]
  observation: string
  reusable_when: string
```

Rules the prompt enforces: narrative fields only, no scores or runtime references; when the worker's claim and the checkpoint verdict disagree, the checkpoint verdict wins; an empty submissions array is correct for a run that closed without one; a failed path is recorded only when a scored checkpoint shows it failed.

## When It Runs

```process-outline
The run loop starts the worker_summary processor only with --worker-summary; default off. At start it enqueues a job for every closed worker state that lacks one
A job runs inline at concurrency 16 with a 60 s lease and five attempts; it skips when a worker_run already exists, when the target has no current V2 row, or when there is neither a scored checkpoint nor an error signal
The digest and condensed transcript go to the model; the response is validated
In one transaction: worker_run and submission rows (description = approach plus outcome reasoning), the run_narrative sidecar with produced_by live, the attempt watermark, and a run_closed index task with payload attempt://run/<id>
kg2-renarrate re-runs the same prompt over historical worker_run rows that have no narrative, match outcomes first, writing run_narrative with produced_by backfill and updating submission descriptions; it enqueues nothing
```

## Writes

| Row | Through | Rule |
| --- | --- | --- |
| worker_run, submission | summarizer job | Once per worker state; the digest is mechanical, the narrative is the model's |
| run_narrative | summarizer job or renarrate | One per run; renarration loses a race to a live narrative |
| source_watermark attempt | summarizer job | last_worker_state_id |
| index_task run_closed | summarizer job | Deduplicated by payload; renarration never enqueues |

## Governed By

- Worker Runs: the rows it writes.

- Run Closed: the pathway it opens for the librarian.

- Worker lifecycle: when a worker state closes.

## Decisions

**Decision**: the summarizer narrates; it does not judge. Outcomes, scores, and sequence numbers come from the checkpoint digest, and the narrative may only explain them. **Why**: the legacy condense door let the model restate outcomes and the ledger filled with claims no checkpoint supported. **Applies to**: this agent, renarration, and any future run-close summary.

**Decision**: the summary lane is opt-in per run through --worker-summary. **Why**: the seam is new and its cost is one model call per closed worker; the operator turns it on for a run deliberately. **Applies to**: the run loop's start-up wiring.



# docs/10-system-design/45-agents

Four prompted agents are registered in the agent catalog. Each is one directory under apps/server/src/core/agent-catalog/agents carrying its own agent.ts, prompt.ts, context.ts, and output schema, and each is registered in registry.ts. This chapter says what each agent reads, what it may write, and when it runs. The kernel that spawns them is implementation, recorded under Agent Runtime.

## Roster

- Worker: executes one claimed Melee decomp target toward an exact match inside its own worktree. The only agent that edits game source.

- Librarian V2: curates evidence-grounded knowledge proposals from one event-driven index task. Proposal only; the apply layer writes.

- Backfill Librarian: fills out the knowledge records of one target and its directly linked entities by researching every source, subject by subject. Same proposal envelope and write gate as the librarian.

- Worker Summarizer: turns one worker transcript and its deterministic run digest into narrative run and submission reasoning at run close. Writes the run object, never facts.

Every agent page has the same shape: sources, context inputs, tools, output, when it runs, governed by, decisions. The three knowledge agents add a Writes table because which rows an agent may touch is the contract that matters for them.

## Tool Profiles

Tools are attached by named profile in profiles/defaults.ts. An agent never declares private tools.

| Profile | Tools | Used by |
| --- | --- | --- |
| worker | 31 tools: code_graph_file_card, code_graph_search, knowledge_graph_search, graph_related_functions, past_prs_search, knowledge_record, pr_search, discord_search, wiki_search, attempt_search, resolve_locator, compile-and-diff, MWCC debugging, type oracle, permuter, include fixer, review lint, struct inference | worker |
| librarian | code_graph_search, graph_related_functions, discord_search, wiki_search, pr_search, attempt_search, knowledge_record, entity_lookup, resolve_locator, unit_context | librarian-v2, backfill-librarian |
| summarizer | Empty profile: single prompt, no tool calls | worker-summarizer |

## Rules

> **decision: One writer** — Only the two librarians propose facts, evidence, links, and curated entities, and only the apply layer writes them after validating every locator. The worker never writes knowledge. The summarizer writes worker_run and submission rows through the summarizer job and nothing else.

## Governed By

- Knowledge System: the tables the knowledge agents read and propose against.

- Librarian Pathways: which pathway calls which agent, and the queue between them.

- Run Loop: worker admission and dispatch.

- Worker lifecycle: checkpoint, continuation, and closure.

## Decisions

**Decision**: board-level target selection is deterministic scheduler code, not an agent; a worker session receives exactly one already-claimed epoch target. **Why**: a director agent with a board-level prompt was rejected; deterministic ranking is auditable and spends no model calls on routing. **Applies to**: the worker and any future run-phase agent, which must also receive claimed work rather than choose it.

**Decision**: the worker stays inside its target claim and category-typed write set; widening happens only through an evidence-backed checkpoint-note request that the runner decides, and validation state is runner-owned. **Why**: agent self-widening and agent-owned validation were rejected; write safety and durable evidence stay with deterministic code. **Applies to**: the worker and any future agent that edits game source.

**Decision**: an integration conflict is a deterministic regression event plus a re-queue for the next epoch, never an agent. The integration-resolver agent that once hand-merged conflicts in the cycle checkout was removed. **Why**: a hand-merged tree that the runner then commits was a second write path into game source with weaker validation than the worker's; the regression event keeps the conflict visible to the librarian and the next worker instead. **Applies to**: the running phase scheduler and every future conflict outcome.

**Decision**: the single three-door librarian (condense, curation, pr_indexing) with the librarian_v1 contract is retired. Two agents share one envelope: librarian-v2 consumes the index_task queue and backfill-librarian fills out one target; both emit the proposal-only librarian_pass_v1 object that a mechanical apply layer validates and writes. **Why**: doors multiplied prompts inside one agent while every path still wrote the old ledger directly. Separating entry points but keeping one output contract and one write gate keeps every knowledge path parseable and validated by the same code. **Applies to**: every current and future knowledge agent.



# docs/10-system-design/50-workflows/10-sync/10-sync-state

SyncState is the durable state for one Sync workflow inside HarnessState. It carries observed intake, isolated staging progress, PR-series reconciliation, blockers, lineage, and the accepted publication boundary without duplicating the process algorithm.

## State Shape

**SyncState**

```
sync_id: SyncId
game_id: GameId
cycle_id: CycleId  # Owning cycle container.
revision: integer
status: SyncStatus
intake: SyncIntake  # What this sync ingests. Captured when the operator starts sync.
  upstream_from: SourceRevision  # Cycle head's upstream anchor before sync.
  upstream_to: SourceRevision  # Observed upstream target. Equals upstream_from on a knowledge-only pass.
  merged_pr_ids: UpstreamPrId[]
  corpus_batch_ids: CorpusBatchId[]  # Staged corpora awaiting publication. Discord ids use discord-<hash> identities planned incrementally and frozen during observation.
  knowledge_only: boolean  # True when upstream did not move; reconciliation is skipped and only the knowledge revision advances.
staging: StagingProgress | null  # Isolated workspace where all reconciliation happens; null on a knowledge-only pass. Carries commits_behind, merge_in_progress, merge_policy, last_durable_stage (workspace_created | cycle_merged | pr_series_reconciled | validated), conflicting_paths.
  workspace_id: WorkspaceId
  epochs_total: integer
  epochs_applied: integer
  minor_conflicts_resolved: integer
  conflicts_awaiting_operator: integer
pr_reconciliation: PrBranchReconciliation[]  # One entry per open PR series merged alongside the cycle (policy merge, same as the epoch boundary).
  series_id: PrSeriesId
  result: "clean" | "auto_resolved" | "needs_operator"
  pushed: boolean  # True once the reconciled branch is pushed to its upstream PR at publish.
publication: PublicationRecord | null  # Set by the atomic publish step; null until then. Carries prior_head, new_head, and knowledge_intake — the result of the V2 knowledge intake run against the published cycle worktree.
  remote_application_id?: RemoteApplicationId  # Boundary recorded in the cycle timeline; absent on a knowledge-only pass.
  prior_head: SourceRevision
  new_head: SourceRevision
  knowledge_revision: KnowledgeRevision
  invalidated_ids: string[]  # Targets, checkpoints, and PR snapshots explicitly invalidated by the boundary.
created_at: timestamp
latest_event_sequence: integer
trace_id: TraceId
blockers: Blocker[]
```

```json
{
  "sync_id": "sync-2026-08-11-02",
  "game_id": "melee",
  "cycle_id": "cycle-7",
  "revision": 41,
  "status": "reconciling",
  "intake": {
    "upstream_from": "upstream-9ac4",
    "upstream_to": "upstream-9ba1",
    "merged_pr_ids": [
      "pr-2849",
      "pr-2851"
    ],
    "corpus_batch_ids": [
      "discord-a41f09c2"
    ],
    "knowledge_only": false
  },
  "staging": {
    "workspace_id": "staging-sync-02",
    "commits_behind": 19,
    "merge_in_progress": false,
    "merge_policy": "score",
    "last_durable_stage": "cycle_merged",
    "minor_conflicts_resolved": 3,
    "conflicts_awaiting_operator": 1
  },
  "pr_reconciliation": [
    {
      "series_id": "series-20",
      "result": "auto_resolved",
      "pushed": false
    }
  ],
  "publication": null,
  "created_at": "2026-08-11T19:02:00Z",
  "latest_event_sequence": 92830,
  "trace_id": "trace-sync-2026-08-11-02",
  "blockers": [
    {
      "code": "conflict_needs_operator",
      "message": "Upstream restructured a header epoch-9 matches depend on.",
      "source_kind": "sync",
      "source_id": "sync-2026-08-11-02",
      "recoverable": true
    }
  ]
}
```

The shape keeps recovery decisions explicit: staging and per-series outcomes identify resumable work, blockers explain required intervention, and publication identifies the irreversible accepted boundary. A knowledge-only pass has no staging workspace; publication still runs the knowledge intake (reconcile, PR, Discord, attempt lanes) against the cycle worktree without moving the cycle head. Since 2026-09-03 the sync merges upstream with the boundary's per-function policy merge instead of rebasing cycle history, and the legacy staged-knowledge stage (postmortem jobs, knowledge-N revisions) is gone.

## Statuses

**Sync status semantics**

| Status | Meaning | Stable invariant |
| --- | --- | --- |
| requested | Intake is observed but not started. | No lease is held and no protected state changes. |
| ingesting | Sync stages source and knowledge inputs. | Canonical source and knowledge truth remain unchanged. |
| reconciling | Staging merges upstream into the cycle branch with the policy merge and reconciles open PR series the same way. | Cycle current remains untouched. |
| validating | Staged state produces publication evidence. | Publication cannot start without successful evidence. |
| validated | Evidence is complete and awaits confirmation. | Later upstream movement requires revalidation. |
| publishing | Confirmed records and branch updates are being committed. | Cancellation is unavailable; recovery moves forward. |
| published | The boundary and required pushes are durable; the knowledge intake has run against the new cycle head. | Sync is terminal and releases authority. |
| blocked | Intervention or retry is required. | Lease and recoverable state are preserved when active. |
| cancelled | The operator abandoned pre-publication work. | Staging is discarded and cycle current is unchanged. |

Status, staging, blockers, and publication must agree. validated is the operator gate; publishing permits only forward recovery; published requires a publication record; cancelled proves the canonical cycle remained untouched.



# docs/10-system-design/50-workflows/10-sync/20-process

Sync prepares one comparison point, performs all mutable work in staging, and crosses the canonical boundary only after successful validation and operator confirmation. The same process covers upstream-changing and knowledge-only requests.

## Preparation Through Handoff

```process-outline
Prepare and record the baseline comparison point
     -> Fetch the configured remote and discover prior and observed revisions plus merged PR identities
     -> Record the sync request immediately with merged PR ids and any operator-supplied corpus batch ids
     -> Confirm the cycle tree is clean at the recorded prior head
Stage the requested inputs
     -> Request a best-effort Discord mirror refresh, then continue against the on-disk archive whether the pull succeeds or fails
     -> Plan incremental Discord batches of at most 400 messages from watermarks in the shared backfill manifest, reusing failed batch ids
     -> Freeze each planned Discord batch as a staged artifact and refresh intake with its discord-<hash> identity
     -> Pull merged-PR evidence into staging
     > Skip the source workspace when knowledge_only=true
Reconcile the staged result — merge upstream into the staging copy of the cycle branch with the per-function policy merge (score by default, theirs as the escape hatch), then reconcile open PR series the same way; conflicts that the trivial-marker resolver cannot settle block on conflict_needs_operator for sync.resolve_conflict
     -> Apply source epochs against the requested upstream baseline
     -> Reconcile every open PR series against staged history
     -> Resolve bounded mechanical conflicts and block on operator decisions
Validate the complete staged result
     -> Build source and knowledge projections
     -> Record successful evidence and enter validated
     > Refresh and revalidate if upstream observation changed
Operator confirms publication
     -> Recheck upstream identity and the clean prior cycle head
     -> Enter the non-cancellable publishing state
Publish or recover forward
     -> Repoint the cycle tree for a source-changing sync
     -> Atomically record the head, upstream anchor, remote application, invalidations, PR-push intents, and monotonic knowledge revision
     -> Complete reconciled PR-branch pushes and pin boundary evidence
     -> On transaction or push failure, preserve durable recovery state and remain blocked
Release dispatch authority and run the knowledge intake against the published cycle worktree (knowledge-v2/ingest/harness-intake.ts): merged-PR dumps into the canonical past_prs archive (oversized diffs rebuilt from the local merge commit), then reconcile → prs → discord → attempts, which enqueues the librarian tasks; the result is recorded on publication.knowledge_intake
     > Accepted external inputs enter the standing Knowledge Processing pipeline
```

Discord refresh is best effort. A failed mirror pull is recorded as observation evidence, but it does not stop Sync from planning against the archive already on disk. The planner reads the same backfill manifest as the standalone backfill command, so completed ranges stay skipped and failed batches retain their identities. Freezing each planned payload during observation gives later knowledge jobs one stable input even if the archive changes before ingestion. An empty refresh still records the refresh, staging, and observation-refresh sequence with zero counts.

## Boundary Semantics

validated separates preparation from mutation. Cancellation before that gate discards staging and proves the cycle stayed unchanged; interruption after publishing begins resumes from durable publication and push evidence rather than rolling back canonical history.

A knowledge-only publication advances the monotonic knowledge revision without moving the cycle head, recording a remote application, creating source invalidations, or pushing PR branches.

Librarian Pathways ingests the accepted Discord exports and merged PRs after this workflow hands them off: the importers write source rows and enqueue index tasks, and the librarian turns them into facts.



# docs/10-system-design/50-workflows/10-sync

Sync reconciles observed upstream and knowledge intake in isolation, then publishes a validated baseline only after operator confirmation. Its durable state stays in the workflow slice; canonical cycle and knowledge state remain unchanged before publication.

## Inputs

**Sync intake**

| Input | Evidence captured | Effect before start |
| --- | --- | --- |
| Upstream movement | Prior and observed upstream revisions | Observation only |
| Merged PRs | Complete merged PR identity set | Observation only |
| External corpora | Incremental Discord batch identities planned and staged during observation, plus other classified corpus batches | Observation only |
| Knowledge-only refresh | Equal upstream revisions plus knowledge_only=true | Observation only |

Observation refreshes intake evidence without acquiring dispatch authority. The operator action sync.start either activates Sync under a free lease or queues it behind the active workflow.

## Process Overview

<!-- canvas: ./assets/canvases/sync-process.canvas.json title="Sync process" -->

Sync Process prepares the baseline, pulls Discord and merged-PR inputs into staging, reconciles source and PR series, validates the result, publishes on confirmation, and hands accepted external inputs to knowledge processing.

## Dispatch Authority

```process-outline
Observe or refresh sync intake
     > No lease; canonical source and knowledge state do not change
Operator starts Sync
     -> Acquire a free dispatch lease
     -> Otherwise queue behind the active workflow
Execute staged reconciliation and validation
Operator confirms publication
Publish or preserve durable recovery state, then release the lease
```

Dispatch Authority requires the current holder to stop, settle active work, record the handoff, and release before Sync begins.

## Authority Boundaries

**Sync authority**

| Actor or state | Responsibility | Write scope |
| --- | --- | --- |
| Operator | Start Sync, confirm publication, and resolve escalated blockers. | Operator decisions and confirmations |
| HarnessState | Record workflow slot, lease holder, blockers, and allowed actions. | Per-game coordination state |
| Sync workflow | Stage, reconcile, validate, recover, and publish while leased. | Sync staging and publication records |
| Cycle tree | Remain the canonical source boundary. | Unchanged until confirmed publication |
| Knowledge stores and PR branches | Accept published revisions and reconciled branch pushes. | Confirmed publication only |

## Detailed Contracts

Sync State defines the durable shape, example, statuses, and invariants.

Sync Process defines preparation, staged reconciliation, validation, publication, recovery, and the knowledge handoff.



# docs/10-system-design/50-workflows/20-run/10-run-state

`RunState` is the durable control object for one autonomous scheduling effort. It lives in Harness State and keeps immutable activation inputs, the moving cycle-head mirror, scheduler position, progress, and subordinate run records under one `run_id`. Pause, recovery, and upstream application preserve that identity and its evidence timeline.

## Run Shape

**RunState**

```
run_id: RunId
game_id: GameId
cycle_id: CycleId  # Owning cycle container.
revision: integer
inputs: RunInputs
  base_revision: SourceRevision  # Original baseline. Immutable — upstream arrives as remote-application boundaries, never by rewriting this.
  policy_revision: PolicyRevision  # Immutable after activation.
  starting_knowledge_revision: KnowledgeRevision
  configuration_snapshot: RunConfiguration
head_revision: SourceRevision  # Mirror of the owning cycle's head, which the scheduler plans against. The cycle owns head lineage; equals base_revision until a remote-application boundary advances it.
control: RunControl
  status: "draft" | "ready" | "active" | "paused" | "completed" | "failed" | "cancelled"
  stop_request?: { mode: "hard_stop"; reason: string } | null
  terminal_reason?: string
scheduling: RunScheduling
  desired_workers: integer
  scheduler_condition: "idle" | "planning" | "dispatching" | "waiting" | "boundary" | "blocked"
progress: RunProgress
  baseline_score: number
  confirmed_score: number
  tentative_changes: integer
  confirmed_changes: integer
  regressed_changes: integer
job_ids: JobId[]  # Worker and integration dispatch records associated with this run.
integration_outcome_ids: IntegrationOutcomeId[]  # Domain outcomes referenced by settled integration jobs.
epoch_ids: EpochId[]
remote_application_ids: RemoteApplicationId[]  # Remote-application boundaries in timeline order, each recording prior head, applied upstream revision, resolved conflicts, and score delta.
worker_state_ids: WorkerStateId[]
checkpoint_ids: CheckpointId[]
active_operation_ids: OperationId[]
latest_event_sequence: integer
blockers: Blocker[]
```

```json
{
  "run_id": "run-2026-08-11-01",
  "game_id": "melee",
  "cycle_id": "cycle-7",
  "revision": 288,
  "inputs": {
    "base_revision": "upstream-9ac4",
    "policy_revision": "policy-42",
    "starting_knowledge_revision": "knowledge-375",
    "configuration_snapshot": {
      "desired_workers": 64
    }
  },
  "head_revision": "upstream-9ba1",
  "control": {
    "status": "active",
    "stop_request": null
  },
  "scheduling": {
    "desired_workers": 64,
    "scheduler_condition": "boundary"
  },
  "progress": {
    "baseline_score": 72.642,
    "confirmed_score": 73.147,
    "tentative_changes": 2,
    "confirmed_changes": 31,
    "regressed_changes": 1
  },
  "job_ids": [
    "job-worker-501",
    "job-integration-88"
  ],
  "integration_outcome_ids": [
    "integration-outcome-88"
  ],
  "epoch_ids": [
    "epoch-18",
    "epoch-19"
  ],
  "remote_application_ids": [
    "remote-application-3"
  ],
  "worker_state_ids": [
    "worker-state-501",
    "worker-state-502"
  ],
  "checkpoint_ids": [
    "checkpoint-88"
  ],
  "active_operation_ids": [],
  "latest_event_sequence": 92811,
  "blockers": []
}
```

Activation freezes `base_revision`, `policy_revision`, `starting_knowledge_revision` (the cycle worktree's git head at activation, the same head the knowledge V2 store reconciled against), and the configuration snapshot. `head_revision` remains mutable because it mirrors the owning cycle head used for later planning; applying upstream work advances that mirror without rewriting the original baseline.

## Control Status

Control status is the only run lifecycle vocabulary. Scheduler activity, process liveness, validation state, and progress events describe different concerns and never substitute for a status edge.

| Status | Meaning | Stable invariant |
| --- | --- | --- |
| `draft` | Required inputs or configuration are incomplete. | No scheduler or worker starts. |
| `ready` | Readiness gates pass and activation may be requested. | Activation does not alter frozen inputs. |
| `active` | Autonomous scheduling authority is enabled. | The run occupies the workflow slot and holds the dispatch lease. |
| `paused` | The run is stopped but remains resumable after stop, recovery, or workflow handoff. | Claims and dispatch authority have settled before a later resume. |
| `completed` | Autonomous work closed normally. | The run is terminal. |
| `failed` | The runner cannot continue safely. | Recovery returns the same run to paused. |
| `cancelled` | The operator abandoned the effort. | The run is terminal and its evidence remains readable. |

## Scheduler Condition

`scheduler_condition` is an observability mirror inside control state. It reports what the Run Loop is doing without granting dispatch authority or creating another lifecycle.

| Condition | Observed activity |
| --- | --- |
| `idle` | No scheduler operation is executing. |
| `planning` | The scheduler is opening an epoch from the eligible board or refreshing target state. |
| `dispatching` | Epoch work is being assigned to available workers. |
| `waiting` | The active run is sleeping for a durable wake signal. |
| `boundary` | Confirmation, integration, report refresh, or save-point work is executing. |
| `blocked` | Progress requires recovery or operator action. |

## Run Record Families

RunState indexes durable evidence instead of embedding every subordinate row. Dispatch status answers whether queued work can execute; the record families below answer what was admitted, attempted, validated, integrated, or recovered.

**Run-domain records**

| Family | Scope | Authority and evidence |
| --- | --- | --- |
| `runs` | One autonomous effort keyed by run_id. | Frozen inputs, seven-status control, cycle-head mirror, scheduler observability, blockers, and progress. |
| `targets` | Candidate functions or units. | Priority, rationale, and durable target identity independent of any one epoch. |
| `epochs` | One deterministic scheduling wave. | Full eligible-board membership, completion counts, and boundary-routing summary. |
| `epoch_targets` | A target admitted to one epoch. | Position such as admitted, claimed, or finished plus the priority consumed by queue realization. |
| `target_claims` | Worker ownership of one epoch target. | Lease fence, category-typed write set, widening decisions, worktree, and open or closed ownership. |
| `worker_states` | Runner-owned lifecycle ledger for one claim. | Attempt outcome, session lineage, facts, blockers, and best validated result. |
| `worker_checkpoints` | One runner validation attempt. | Failed and passing validations, write-set snapshot, artifacts, and tentative, confirmed, or regressed state. |
| `integration_outcomes` | Application or conflict result for one selected checkpoint. | Patch, conflict, resolver, scoped-check, validation, and result_ref evidence for the serial integration lane. |

## Run Lifecycle

```process-outline
Run lifecycle
     -> Admit work
          -> Activate a `ready` run under the expected aggregate revision and dispatch lease
          -> Plan against `head_revision` and record the knowledge revision consumed
          -> Admit the full eligible board once at epoch open
     -> Execute epochs
          -> Claim jobs and epoch targets atomically, composing target claims and worker states
          -> Append runner-owned checkpoints under ClaimToken authority
          -> Integrate selectable work tentatively and classify it at the boundary
          -> Close the epoch and advance cycle and run head mirrors together after integration
     -> Stop and recover
          -> Request a managed stop with a 30-second grace
          -> Cancel remaining work and reconcile leases after grace
          -> Settle the same run as `paused` before resume
     -> Reconcile pending integration
          -> Inspect pending rows before dispatch acquisition or epoch open
          -> Finish or reject the interrupted Git/state boundary from durable evidence
     -> Close the run
          -> Settle the active epoch, jobs, claims, operations, and integration lane
          -> Run required boundary confirmation and capture the save point
          -> Commit terminal status and release dispatch authority
          -> Retain terminal RunState for lineage after the active workflow slot clears
```

## Claims and Checkpoints

A target claim is the ownership boundary for one worker state. Write Safety owns the widening, fencing, and reset rules; this procedure shows how those records compose and settle.

```process-outline
Claim and checkpoint procedure
     -> Claim one worker job and epoch target atomically
     -> Create one target claim, one worker state, a lease, and a target-source write set
     -> Record each runner validation attempt as a ClaimToken-fenced checkpoint
     -> Keep failed and neutral checkpoints as evidence; bank only hard-gate-passing improvements as tentative
     -> At the epoch boundary, confirm clean items or attribute, revert, and mark the guilty item regressed
     -> Close the target claim and settle the worker job from the closed worker-state row
```

## Pending Integration

Pending integration closes the crash window between Git history and the durable epoch-close transaction. The exchange below is the sole commit-and-reconciliation protocol, and recovery completes it before dispatch authority is acquired or new work is admitted.

<!-- sequence: ./assets/sequences/pending-integration.sequence.json title="Pending integration and recovery" -->



# docs/10-system-design/50-workflows/20-run/20-run-loop

The Run Loop is the deterministic host loop for board admission, durable worker consumption, settlement, serial integration, lease recovery, and epoch boundaries. It reads one durable control surface and writes reproducible decisions; target-local research and source edits stay with workers.

The loop ranks through Board Prioritization, realizes admitted targets as `worker` jobs, and settles them from durable worker-state evidence. Every decision and worker packet records the knowledge revision it consumed, so replay binds an outcome to the same evidence snapshot.

## Canonical Loop

```process-outline
Run Loop
     -> Wake for the highest-priority relevant unhandled signal or maintenance cadence
     -> Read RunState, dispatch authority, active claims, epoch targets, worker states, checkpoints, and the ranked board
     -> Reconcile pending integration and reap expired job leases and target claims before admitting or claiming work
     -> Maintain the active epoch
          -> Admit every eligible board target at epoch open
          -> Refresh priorities only for admitted-but-unclaimed targets
          -> Create one deduplicated worker job per epoch target with stable board priority
     -> Let the hosted consumer claim a worker job and its epoch target atomically while run status and dispatch lease permit work
     -> Heartbeat valid leases while child executors run; classify settled jobs from closed worker-state rows
     -> Queue knowledge processing for every closed worker state, including errors and non-improvements
     -> Drain integration jobs in single flight, applying and committing each accepted checkpoint to the cycle repo and advancing the worker base revision
     -> Launch integration resolvers promptly for recorded conflicts, path-disjoint and capped by `integrationResolverConcurrency`
     -> At an epoch boundary
          -> Wait for open integration resolvers; unresolved integrations block the boundary
          -> Pause intake and rebuild authoritative report truth
          -> Run full knowledge maintenance
          -> Confirm the clean tentative window or attribute, revert, and route regressions
          -> Record progress and admit the next epoch from the refreshed board
     -> Store the scheduler result, mark handled signals, expose the condition, and sleep
```

A closed worker state always produces the handoff to Librarian Pathways, whether the attempt succeeded, timed out, failed, or was cancelled. The summarizer writes the run object and the librarian decides what facts change; the Run Loop owns the durable enqueue trigger.

## Runtime Capacity Inputs

An epoch admits every eligible target from the ranked board once, when the epoch opens. Eligible targets are not yet exact, remain editable, and have a valid source path; the epoch deduplicates them by target identity. Its membership then stays fixed. Board Prioritization defines job priority. Runtime concurrency uses the inputs below.

| Input | Run Loop action |
| --- | --- |
| Worker pool size | Claim eligible worker jobs until the desired active count is reached. |
| Tool/build slots | Wait for the appropriate slot before compile-heavy validation or a Pi tool operation. |

## Run-Owned Wake Policy

Wake requests are durable queue signals rather than accepted game facts. The Run Loop selects the signal below before other unhandled events.

**Run-owned signal policy**

| Signal | Run meaning | Queue or refresh policy |
| --- | --- | --- |
| `pool_below_target` | The worker pool has fallen below its desired active count. | Select first, then refresh active-epoch availability and unclaimed priorities. |

## Worker Delegation

A worker job, its atomically acquired epoch target, and the resulting target claim form one bounded delegation contract. The child receives a target-local TaskSpec and ClaimToken; it never claims queue work or receives the dispatch lease.

Provisioning pins each attempt's base revision at claim time: a worker job captures `baseRev` exactly once when it claims, and its sandbox provisions from that commit for the whole attempt. The loop advances `baseRev` on every integration commit and on every resolver resolution commit, and the epoch boundary advances it with a compare-and-set that never rolls back a newer integration commit. Every newly provisioned worker therefore starts from the newest committed tree and builds on accepted work instead of the epoch-start tree.

<!-- sequence: ./assets/sequences/worker-delegation.sequence.json title="Worker delegation" -->

## Checkpoint Settlement View

The loop consumes a compact checkpoint projection for deterministic selection and boundary routing. Worker Lifecycle owns the complete validation checkpoint.

**CheckpointSettlementView**

```
checkpoint_id: CheckpointId  # Validated attempt identity.
worker_state_id: WorkerStateId  # Worker ledger that owns the checkpoint.
validation_state: "tentative" | "confirmed" | "regressed"  # Boundary classification.
selectable: boolean  # True only for a hard-gate-passing improvement.
exact_match: boolean  # Whether target comparison is exact.
score_after: number  # Validated target score.
validated_at: Timestamp  # Tie-break timestamp; earlier wins after exactness and score.
integration_outcome_id?: IntegrationOutcomeId  # Serial-application evidence when selected.
```

```json
{
  "checkpoint_id": "checkpoint-88",
  "worker_state_id": "worker-state-501",
  "validation_state": "tentative",
  "selectable": true,
  "exact_match": false,
  "score_after": 99.73,
  "validated_at": "2026-08-18T15:42:00Z",
  "integration_outcome_id": "integration-outcome-88"
}
```

Selection is deterministic: exact checkpoints win over non-exact checkpoints, then higher score wins, then earlier validation time. Only confirmed integrations can enter PR preparation; failed and neutral checkpoints remain durable evidence for later ranking and knowledge processing.



# docs/10-system-design/50-workflows/20-run/30-board-prioritization

Board prioritization produces a deterministic full ranking. The Run Loop admits every eligible target once at epoch open and carries board priority into job-queue order.

Ranking is graph-first: information gain, readiness, and reusable evidence outrank local closeness alone. A bounded closeness lane keeps targets ordered when graph evidence is unavailable or carries no useful information signal.

## Snapshot and Ranking

`loadBoardSnapshot` reads the current `build/GALE01/report.json` and `objdiff.json`. Snapshotting does not run either build pipeline; regenerated artifacts become visible on the next read.

```process-outline
Produce the ranked board
     -> Read the current comparison artifacts
          -> Read `build/GALE01/report.json`
          -> Read `objdiff.json`
          > Snapshotting does not run the build or objdiff pipeline.
     -> Build one candidate for each imperfect function
     -> Add resource-graph evidence when available
          -> Exclude `read_only_complete`, `locked`, and `blocked` targets
          -> Measure information gain, unlock potential, completion readiness, context quality, risk, and analog evidence
     -> Compute deterministic priority
          -> Use graph-first priority when information signals exist
          -> Use bounded closeness ordering when graph evidence is unavailable or carries no information signal
     -> Sort candidates and return the ranked board
```

## Candidate Prior

```text
candidate_prior =
  information_priority_score
  + high_accuracy_bonus
  + accuracy_readiness_bonus
  + closeness_fallback_score
  + opseq_rerank_bonus
```

| Component | Inputs | Scheduling effect |
| --- | --- | --- |
| `information_priority_score` | Information gain, unlock potential, completion readiness, context quality, and risk. | Supplies the graph-first priority. |
| `high_accuracy_bonus` | Capped log-compressed local closeness. | Adds a bounded finishability bonus; without graph data it carries the local closeness score. |
| `accuracy_readiness_bonus` | Closeness combined with readiness and information gain, capped at 18. | Promotes nearly exact targets only when actionable evidence exists. |
| `closeness_fallback_score` | Raw closeness, fuzzy gap, and size, capped at 3. | Spreads the low-priority lane when graph data has no information signal. |
| `opseq_rerank_bonus` | Matched analog score and counts, capped at 48. | Adds the opseq hot-lane board-scoring bonus. |

A context-poor 99.x% target does not outrank a lower-fuzzy target likely to add reusable knowledge.

## Ranking Signals

| Signal | Why it matters |
| --- | --- |
| Matched duplicate ref | A matched source shape can be adapted across unrelated files when assembly shape supports it. |
| Matched opseq analog | A strong already-matched assembly analog can place a target in the configured opseq hot lane. |
| Graph degree | A target connected to many similar functions can propagate more facts if solved or partially improved. |
| Linked incomplete functions | Sibling or connected imperfect functions can benefit from evidence discovered for this target. |
| Worker context quality | Nearby matched siblings, graph edges, or reducer facts make deep research more grounded. |
| Recent stalls | Repeated no-delta attempts cool a target unless new facts arrive. |
| Data/rodata risk | Header, static, section-order, split, and relocation-sensitive work needs slower validation and fewer parallel edits. |

## Scheduler Boundary

At epoch open, the Run Loop admits every eligible target once. Board priority sets job-queue order; durable claims and the hard gate control edit authority.



# docs/10-system-design/50-workflows/20-run/40-workers/10-lifecycle

A worker is one bounded decompilation attempt represented by a durable worker job and one epoch target claim. The host owns atomic claim, provisioning, executor submission, lease heartbeat, settlement, and recovery; the runner owns attempt feedback, validation, checkpoint selection, and lifecycle close.

Admission uses the epoch-target id as the job dedupe key and the board rank as job priority. The claimed TaskSpec carries compact target context and the current ClaimToken, so the child can work within a precise authority boundary without claiming queue work.

## Lifecycle

```process-outline
Worker lifecycle
     -> Claim
          -> Admit one worker slot job for the epoch target, using the epoch-target id as the dedupe key and board rank as priority
          -> Atomically claim the worker job and epoch target
          > Creates the active target claim, running worker state, lease, and current `ClaimToken`
     -> Provision
          -> Provision an isolated worker worktree from the claim-time base revision — the newest committed integration tree, captured once at job claim
          -> Write `TaskSpec` with target identity, compact context, resources, approved write set, and claim authority
          -> Submit `job-runner worker-task --task-file …` through `WorkerExecutor`
     -> Attempt
          -> Collect target evidence and choose capabilities for one grounded hypothesis
          -> Edit only paths authorized by the current claim
          -> Return a checkpoint note or reach a turn boundary for runner validation
          > An out-of-set need is handed to Write Safety; widening is not decided here
     -> Validate
          -> Diff the touched set against the pre-worker source snapshot
          -> Run target and scope-following compile checks, objdiff, QA lint, post-return checks, and baseline comparison
          -> Record the checkpoint and deterministically select the best eligible checkpoint
          > An exact score that fails a hard gate is repair evidence, not a selectable exact result
     -> Continue or close
          -> Close immediately when an exact checkpoint passes every hard gate
          -> Return repair or continuation feedback to the same worker session while its attempt budget remains
          > A banked improvement does not close the worker; the checkpoint is durable and each strictly new best extends the budget
          -> On budget exhaustion or claim deadline, preserve the best prior selectable checkpoint or the baseline
          -> On provider, infrastructure, tool, build, parse, or session failure, close as error while preserving prior selectable evidence
     -> Settle or recover
          -> Close the worker state and target claim, finish the target, enqueue worker knowledge processing, and enqueue one integration job (dedupe key: the checkpoint id) for any selected checkpoint
          -> Settle the worker job and wake the Run Loop
          -> If a claim is interrupted, host recovery closes it as error and re-admits only when no selectable checkpoint can settle the target
```

Worker Capabilities defines the tactics chosen during an attempt. Write Safety owns ClaimToken verification, write-set widening, reset, worktree isolation, and serial integration.

## Checkpoint Evidence

Runner validation is the source of truth for progress. It captures every attempt, including failed and neutral checks, while selectable and selected flags make the best durable integration candidate explicit.

**WorkerCheckpointRecord** — apps/server/src/core/cycle-runtime/run-state/worker-state.ts#WorkerCheckpointRecord

```
id: string
workerStateId: string
runId: string
epochId: string
epochTargetId: string
targetClaimId: string
attemptIndex: number
validationTime: ISO timestamp
oldScore: number | null
newScore: number | null
delta: number | null
exactMatch: boolean
hardGatesPassed: boolean
improvedOverBaseline: boolean
selectable: boolean
selected: boolean
buildStatus?: string | null
qaStatus?: string | null
objdiffStatus?: string | null
validationStatus: string
artifactPath?: string | null
patchPath?: string | null
diffPath?: string | null
writeSet: string[]
validationState: "tentative" | "confirmed" | "regressed"
failureReasons?: string[]
metadata?: object
```

```json
{
  "id": "checkpoint-88",
  "workerStateId": "worker-state-501",
  "runId": "run-2026-08-11-01",
  "epochId": "epoch-19",
  "epochTargetId": "epoch-target-501",
  "targetClaimId": "claim-501",
  "attemptIndex": 3,
  "validationTime": "2026-08-18T15:42:00Z",
  "oldScore": 97.1,
  "newScore": 99.73,
  "delta": 2.63,
  "exactMatch": false,
  "hardGatesPassed": true,
  "improvedOverBaseline": true,
  "selectable": true,
  "selected": true,
  "buildStatus": "passed",
  "qaStatus": "passed",
  "objdiffStatus": "passed",
  "validationStatus": "passed",
  "patchPath": "artifacts/checkpoint-88.patch",
  "diffPath": "artifacts/checkpoint-88.diff",
  "writeSet": [
    "src/melee/example.c"
  ],
  "validationState": "tentative",
  "metadata": {}
}
```

## Touched-Set Validation

| Category | Validation scope | Comparison |
| --- | --- | --- |
| `target-source` | Target translation unit. | Compile plus target and unit objdiff. |
| `config-metadata` | Address-range-affected units. | Section measures. |
| `owning-header` | Canonical owner and direct includers. | Strict object, function, and section checks. |
| `foreign-source` | Edited owner unit after the target TU passes. | Strict object, function, and section checks. |
| `other / out-of-set` | No bankable validation scope. | Repair reason and telemetry; never bank. |

## Selection and Continuation

Continuation runs one unified attempt budget (`attempt_budget_v3`, `WORKER_ATTEMPT_BUDGET_POLICY` in `worker-cycle.ts`). A worker gets 5 base submissions, and a submission that sets a strictly new best qualifying score grants +2 budget. A qualifying score is a selectable checkpoint — hard gates passed and improved over baseline — with a finite score, or any exact match, including one that failed hard gates. Repeated gate-failed exacts grant only once, and a score below the running best grants nothing. After each attempt `workerContinuationDecision` replays the checkpoint history and applies the checks below in order.

A banked improvement no longer closes the worker: the checkpoint is durable in SQLite the moment it is recorded, so the worker keeps pushing toward exact, and each new best extends the budget by two attempts. A gate-failed 100% spends its remaining budget trying to become gate-clean; if it never does, the worker closes normally and the best selectable checkpoint — or the baseline — is selected. Budget extends attempts only, never time: the claim TTL is stamped at claim time as `agent_timeout_seconds` plus a 600-second grace, each attempt's Pi session gets `agent_timeout_seconds`, and the job process is killed at the TTL.

| Check (in order) | Decision | Reason |
| --- | --- | --- |
| A selectable exact checkpoint passed every hard gate | Stop; the accepted exact checkpoint is selected. | `accepted_exact` |
| Dry run | Stop after the single probe attempt. | `dry_run` |
| Claim deadline reached | Stop regardless of pending repair reasons; keep the best selectable checkpoint. | `claim_deadline` |
| Attempts used reached the attempt budget | Stop; the only exhaustion reason. | `attempt_budget_exhausted` |
| Budget remains | Continue the same worker with a continuation request. | `attempt_budget_available` |

<!-- sequence: ./assets/sequences/attempt-budget.sequence.json title="Attempt budget continuation" -->

Continuation feedback returns to the same worker session and names the validation failure, QA finding, non-exact score, categorized out-of-set paths, and continuation reason. The worker refines the same evidence context instead of self-classifying its durable outcome.

Worker summaries report the policy configuration as `base_attempts` and `bonus_attempts_per_improvement`, replacing the retired `max_cold_attempts` and `follow_up_attempts_*` keys. The stop reasons `improvement_banked`, `cold_attempt_budget_exhausted`, `improvement_followup_budget_exhausted`, `gate_failed_exact_followup_budget_exhausted`, and `accepted_or_no_repair_reasons` are no longer produced and appear only in historical worker records; the dashboard read-model and worker reports carry the new fields additively.

## Worker Outcomes

| Lifecycle status | Meaning | Preserved result |
| --- | --- | --- |
| `exact` | Runner validation selected an exact checkpoint that passed every hard gate. | The accepted exact checkpoint. |
| `timeout` | The runner-controlled attempt budget ended. | The best prior selectable checkpoint, or baseline when none improved. |
| `error` | Provider, infrastructure, tool, build, parse, or session failure blocked trustworthy evaluation. | Any prior selectable checkpoint and all failure evidence. |
| `cancelled` | An operator or process-control path stopped the attempt. | Recorded checkpoints and lifecycle evidence under the control path. |

The host settles the durable worker job from the closed worker-state row and wakes the Run Loop. Recovery uses the same records to close interrupted ownership, preserve evidence, and decide whether the target can finish or must be admitted again.



# docs/10-system-design/50-workflows/20-run/40-workers/20-capabilities

Worker capabilities are tactics a child chooses after researching one claimed target.

Each capability defines the evidence it emits and the guardrail that keeps the attempt bounded. Capabilities do not create job kinds or worker types: the host controls assignment and budgets through the claimed `worker` job and `TaskSpec`, while the child chooses tactics inside its approved write set. When the canonical fix requires another path, a capability can emit an evidence-backed widening request; Write Safety owns its authorization and fencing.

## Capability Table

| Capability | When a worker uses it | Evidence it emits | Guardrail |
| --- | --- | --- | --- |
| Context packaging | Every worker turns the target packet into a compact read set. | Target assembly, current C, TU preamble, siblings, header snippets, and provenance. | Keep context focused; do not dump the whole repo. |
| Type and symbol resolution | Unknown types, callbacks, globals, r13/r2 references, or labels appear. | Accepted type/symbol facts, missing-context requests, and evidence paths. | Request exact missing facts instead of inventing fields or labels. |
| Scratch and history reconnaissance | Public decomp.me work, prior PR discussion, or previous attempts may exist. | Scratch status, URL or owner, prior-attempt summary, and reusable hints. | Treat public scratches as approximate and provenance-tagged. |
| Isolated check loop | A candidate source shape is ready to test without promotion. | Compile log, symbol/unit objdiff, score delta, first mismatch key, and best-attempt history. | Prefer narrow checks first. |
| Duplicate adaptation | Duplicate groups or similar assembly-shape edges point to a matched reference. | Adapted patch, objdiff result, and reusable duplicate-shape facts. | Verify against the target, not only the reference. |
| Focused source editing | Research supports a small set of grounded source-shape hypotheses. | Natural source improvement, mismatch notes, validation commands, and stop/continue recommendation. | Stop when the next move becomes guesswork. |
| Fact research | A field, naming convention, data owner, or compiler-shape question blocks progress. | Accepted fact, rejected hypothesis, or graph edge. | Facts need evidence paths. |
| Evidence-backed write-set widening | In-slice typing cannot express a canonical config, header, or owner fix. | Category, requested paths, owner evidence, measured objdiff result, and lower-rung failures. | Follow the necessity ladder; unrequested edits never authorize themselves. |
| Experimental search | A bounded source-shape matrix can be defined from measured evidence. | Result shards, Pareto frontier, learned patterns, and negative-result rows. | Workers write shards; reducers merge shared artifacts. |
| Permuter handoff | A finalist is close, reviewable, and mechanically narrow. | Permuter artifacts, candidate patch, and provenance notes. | Do not substitute permuter output for understandable source. |
| Review and cleanup | A byte improvement needs quality, type, or regression review before integration. | Debt report, safer rewrite, validation transcript, or rejection. | Prevent fake matches from entering the baseline. |

## Deterministic QA Lint

| Rule | Deterministic coverage |
| --- | --- |
| `define_alias` | Rejects identifier aliases and function-like macro shims that redirect a canonical symbol or signature. |
| `bare_local_prototype` | Rejects non-static, non-extern file-scope prototypes in .c files that shadow the owning interface. |
| `numeric_literal_to_symbol` | Consults symbols.txt section and type; mutable-data and function symbols do not produce literal-promotion findings. |

These rules turn shims and bare local prototypes into repair feedback before an improvement can bank. Section and type gating keep the literal rule from steering workers away from valid mutable-data and function-symbol uses.

## melee-assist Reference Map

| Reference | Supported capability | Why it matters |
| --- | --- | --- |
| `assembly/parser.py` | Read report.json as offline function and unit truth. | Provides target names, paths, units, sizes, addresses, and fuzzy match without assembly-folder scraping. |
| `loop/context_pack.py` | Extract the target function, TU preamble, siblings, and referenced types. | Keeps prompts focused while preserving local declarations and conventions. |
| `resolver/symbols.py` | Resolve symbols.txt, including r13/r2 small-data references. | Turns raw global loads into named facts that can propagate. |
| `resolver/structs.py` | Look up module headers and member-offset hints. | Moves research from pointer guesses to evidence-backed field hypotheses. |
| `api/decomp_me.py` | Check public decomp.me scratches for target status and attempts. | Lets workers reuse public progress while preserving provenance. |
| `loop/orchestrator.py` | Run isolated compile/check loops and preserve attempt history. | Records improving, regressing, failed, and mismatched hypotheses. |
| `llm/prompts.py` | Use explicit missing-context requests such as NEED_TYPE and NEED_SYMBOL. | Provides a disciplined route to facts instead of guessing. |

Worker Lifecycle places these tactics inside the claimed attempt and decides when to continue or settle. Worker Knowledge Surfaces supplies the target context, evidence queries, and feedback path those tactics use.



# docs/10-system-design/50-workflows/20-run/40-workers/30-write-safety

Write safety fences every durable worker mutation, limits source changes to an approved category-typed write set, isolates attempts in host-provisioned worktrees, and serializes selected output into cycle ancestry.

The target claim is the live authorization record. Lease expiry, cancellation, or reaping invalidates the ClaimToken inside the same transaction that would mutate worker evidence, while explicit host markers reserve recovery and settlement operations to named host paths.

## Fenced Mutations

The host creates the claim, worker state, lease, target-source write set, and ClaimToken atomically with the worker-job claim. The six mutation operations below accept that current authority and reject stale children before durable state changes.

**ClaimToken-fenced worker mutations**

```
recordWorkerCheckpoint(input: WorkerCheckpointInput) -> WorkerCheckpointRecord  # Validate authority and append one runner-owned checkpoint.
  input: WorkerCheckpointInput  # Includes authority: WorkerWriteAuthority and checkpoint evidence.
closeWorkerState(input: WorkerStateCloseInput) -> void  # Validate authority and close the worker lifecycle ledger.
  input: WorkerStateCloseInput  # Includes authority: WorkerWriteAuthority and the runner-owned terminal outcome.
widenClaimWriteSet(claimId: string, entries: WriteSetEntry[], authority: WorkerWriteAuthority) -> { writeSet: string[]; entries: WriteSetEntry[] }  # Apply an approved write-set decision to the live claim.
  authority: WorkerWriteAuthority  # Verifies ClaimToken { jobId, kind, leaseId } or an explicit { host: string } marker in the same transaction.
setClaimWorktreePath(claimId: string, workerStateId: string, worktreePath: string, authority: WorkerWriteAuthority) -> void  # Attach the host-provisioned worktree to the claim.
  authority: WorkerWriteAuthority  # Verifies ClaimToken { jobId, kind, leaseId } or an explicit { host: string } marker in the same transaction.
appendWorkerSessionId(workerStateId: string, sessionId: string, authority: WorkerWriteAuthority) -> void  # Append an executor session identity to the worker ledger.
  authority: WorkerWriteAuthority  # Verifies ClaimToken { jobId, kind, leaseId } or an explicit { host: string } marker in the same transaction.
updateWorkerStateBaselineScore(workerStateId: string, score: number | null, authority: WorkerWriteAuthority) -> void  # Record the runner-owned baseline used to test improvement.
  authority: WorkerWriteAuthority  # Verifies ClaimToken { jobId, kind, leaseId } or an explicit { host: string } marker in the same transaction.
```

## Widening and Reset

| Rung | Category | Scope | Required evidence | Decision |
| --- | --- | --- | --- | --- |
| 1 | `target-source` | Target .c file. | Target compile and objdiff evidence. | The initial claim grants it. |
| 2 | `config-metadata` | Relevant symbols or splits file. | Rung-1 failure, symbol or range owner, and before/after objdiff. | Runner may approve. |
| 3 | `owning-header` | Exactly one canonical declaring header. | Rung-1 and rung-2 failures, expected owner, and declaration evidence. | Runner approves in header mode, the default. |
| 4 | `foreign-source` | Definition-owner .c file. | Every lower-rung failure plus definition owner and consumer scope. | Always routed_cross_module; never auto-granted. |

A request names one category, exact paths, the mismatched declaration or symbol, expected owner, measured comparison evidence, and every lower-rung failure. The durable decision vocabulary is `approved` | `denied` | `routed_cross_module`.

**Write-set widening modes; default: off**

| Mode | Runtime effect |
| --- | --- |
| `off` | Keep claims target-only and do not evaluate widening requests. |
| `shadow` | Record decisions but expose or apply no grant. |
| `config` | Apply approved config-metadata grants. |
| `header` | Apply approved config-metadata and owning-header grants. |

The mode is a run-loop flag, `--write-set-widening <off|shadow|config|header>`, read by `writeSetWideningArg` in `apps/server/src/core/game-registry/runtime-options.ts`. Omitting it selects `header`. The run loop passes the effective mode on every worker command and records it once per run as a `write_set_integration_flags` event, so the policy a run ran under is auditable. A recorded mode other than `off` also activates confirmed-only PR eligibility in the run checkpoint: tentative checkpoints become deferred patches until the boundary confirms them.

**WideningRequest** — apps/server/src/core/cycle-runtime/run-state/write-set-categories.ts#WideningRequest

```
schema_version: "write_set_widening_request_v1"
paths: string[]  # Repo-relative paths, all from one category. Rung 3 accepts exactly one header.
category: "config-metadata" | "owning-header" | "foreign-source"
rung: 2 | 3 | 4  # Must match the category: 2 config-metadata, 3 owning-header, 4 foreign-source.
evidence.mismatched_declaration: { symbol, current, required, expected_owner }  # expected_owner must be one of the requested paths.
evidence.objdiff: { unit, score_without, score_with | null, artifact_path? }  # score_without is the measured score at the lower rung; score_with may be null when it could not be measured.
evidence.ladder_evidence: { rung1_in_slice, rung2_config?, rung3_header? }  # Each lower rung's failure. Rung 3 requires rung2_config; rung 4 requires rung3_header.
```

Runner policy (`decideWidening`) denies a request whose paths span categories, whose rung and category disagree, whose evidence is incomplete, or whose expected owner is not among the requested paths. Rung 2 is approved on complete evidence. Rung 3 additionally requires one header that textually declares the evidence symbol and a mode that allows owning headers (`header` applies the grant, `shadow` only records it). Rung 4 is always `routed_cross_module` and emits a `widening_routed_cross_module` event for the operator. A denial or routing comes back to the worker as a repair reason prefixed `widening_denied` or `widening_routed_cross_module`; the worker then records `exact requires cross-file edit to <path>` in its blockers and returns the best gate-clean version inside its write set. In `config` or `header` mode, an unrequested edit outside the write set is not banked: the runner drafts a request from the surfaced paths and returns `widening_request_required` so the worker either justifies or reverts it.

An approved grant widens the live claim through `widenClaimWriteSet` and switches the attempt to scope-following checks (`validateWidenedChange`). For an owning header the runner resolves the owner unit and every direct includer from the Ninja dependency map, falling back to an include grep, and runs strict object checks on each; an explicit `maxConsumers` ceiling rejects a hot header instead of escalating to a full build. For config metadata it measures the sections of every unit whose address ranges the hunks touch. A passing scoped check is bankable but `tentative` until the epoch boundary's global build confirms it; no per-attempt full build is permitted.

An expired, cancelled, or reaped token loses authority. A later claim mints a new token and starts again at target-source; old requests and decisions remain telemetry rather than authorization.

## Workspaces and Shared Writers

Worker worktrees isolate simultaneous attempts and keep unfinished changes out of the main checkout, which remains the canonical integration surface. Epoch-scoped Ninja slots and tool-specific pools cap shared machine pressure without weakening per-claim path authority.

| Risk | Control |
| --- | --- |
| Same-file or shared-support edits | Run concurrently only in isolated worktrees; apply selected checkpoints serially; route collisions through resolver or operator. |
| Unrequested out-of-set edits | Categorize paths, record telemetry, and return a repair reason; bank only after authorization or revert. |
| Stale patch base | Check base_rev; rebase and revalidate or reject. |
| Shared build/tool pressure | Use epoch-scoped Ninja slots and tool-specific pools; every command still runs in the claim worktree. |
| Shared CSV/artifact writes | Workers write shards; reducers alone write merged summaries, charts, and artifacts. |
| Bad integration | Record scoped passes as tentative; the boundary confirms, or attributes and reverts the guilty change and marks it regressed. |

## Serial Integration

Integration is apply-on-accept. Accepting a worker checkpoint enqueues one integration job keyed by the checkpoint id; the Run Loop drains those jobs in single flight, and each patch is applied and committed to the live cycle repo immediately (`commitAppliedPatch` in apps/server/src/core/cycle-runtime/phases/running/integration/worker-output-queue.ts, commit message `worker-integration(<id8>): <targetKey> [checkpoint <id8>]`). Nothing pools for the epoch boundary: its snapshot commit is residual, usually empty, and tolerated as a no-op.

Every integration commit advances the base revision that newly provisioned sandbox workers start from, so a worker spawned mid-epoch builds on accepted work instead of the epoch-start tree and the conflict window shrinks to genuinely concurrent attempts. A patch that still collides — two workers started from the same base, the first landed, and the second's `git apply --check` fails against the moved tree — records a conflict outcome for the integration resolver. A `resolved` outcome is terminal: the harness commits the resolver's hand-merged tree and never re-applies the original patch.

## Integration Outcome

**integration_outcomes row** — apps/server/src/core/orchestrator-state/storage/schema.ts#integrationOutcomes

```
id: string
run_id: string
epoch_id: string
epoch_target_id: string
target_claim_id: string
worker_state_id: string
worker_checkpoint_id: string
status: "applied" | "conflict" | "skipped" | "failed" | "resolved" | "needs_rework" | "blocked" | "rejected" | "resolver_failed"
disposition?: string
target_key?: string
patch_path?: string
diff_path?: string
item_path?: string
summary_path?: string
check_stdout_path?: string
check_stderr_path?: string
apply_stdout_path?: string
apply_stderr_path?: string
write_set_json: string[]
conflict_paths_json: string[]
failure_reasons_json: string[]
metadata_json: object
created_at: ISO timestamp
updated_at: ISO timestamp
resolved_at?: ISO timestamp
```

```json
{
  "id": "integration-outcome-88",
  "run_id": "run-2026-08-11-01",
  "epoch_id": "epoch-19",
  "epoch_target_id": "epoch-target-501",
  "target_claim_id": "claim-501",
  "worker_state_id": "worker-state-501",
  "worker_checkpoint_id": "checkpoint-88",
  "status": "applied",
  "patch_path": "artifacts/checkpoint-88.patch",
  "write_set_json": [
    "src/melee/example.c"
  ],
  "conflict_paths_json": [],
  "failure_reasons_json": [],
  "metadata_json": {},
  "created_at": "2026-08-18T15:45:00Z",
  "updated_at": "2026-08-18T15:45:00Z"
}
```

<!-- sequence: ./assets/sequences/serial-integration.sequence.json title="Serial worker integration" -->

Scoped passes remain tentative until the epoch boundary runs the global build and zero-regression report. Confirmed outcomes can proceed to Score Gate and Handoff; regression attribution reverts the guilty change, marks its outcome regressed through checkpoint evidence, and confirms the clean remainder.



# docs/10-system-design/50-workflows/20-run/40-workers

Run workers execute durable `worker` jobs for epoch targets in host-provisioned worktrees. They sit beneath the Run Loop: the host atomically claims each slot job with its epoch target, writes `task_spec.json`, and submits `worker-task` through `WorkerExecutor`; the child applies tactics and reports fenced worker state with its `ClaimToken`. Keeping queue claims, dispatch, admission, settlement, recovery, and epoch control on the host prevents children from extending their own authority.

## Worker Areas

```
10-lifecycle/  # Claim, provision, attempt, settle, and recover.
20-capabilities/  # Tactics, evidence, QA lint, and guardrails.
30-write-safety/  # Fencing, write sets, and serial integration.
```



# docs/10-system-design/50-workflows/20-run/50-process-lifecycle

The managed-process controller starts `run-loop` directly for a run that holds the dispatch lease. The command carries the required `--lease-id`, so process execution remains bound to the authority acquired for that run without an intermediate supervisor.

## Observation and Signals

The controller tees the process streams into append-only files at `<stateDir>/ui-processes/<name>.stdout.log` and `<stateDir>/ui-processes/<name>.stderr.log`. Process status exposes both paths. On `SIGINT` or `SIGTERM`, the run loop requests a graceful stop and reaches its normal exit path.

## Exit Settlement

The run loop's top-level `finally` calls `settleRunOnExit`. Settlement parks the run in `paused` through `settleStoppedRun`, releases the dispatch lease, and activates an acquired sync or PR successor. Settlement events retain the actor string `guardian` as a compatibility contract even though the run loop emits them itself.

## Operator Recovery

The operator watches process status and the exposed stream logs. The controller does not restart a failed process, create incident files, or recover claims automatically. After `SIGKILL` or a crash that bypasses the top-level `finally`, the operator runs the manual `recover-claims` job before resuming work.



# docs/10-system-design/50-workflows/20-run

The run workflow is the autonomous execution stage for one game cycle. It occupies the Harness State workflow slot and dispatch lease while durable Run State binds scheduling, worker evidence, and integration to one run identity. The workflow turns ranked targets into isolated attempts, serial integration, and boundary-confirmed progress.

<!-- canvas: ./assets/canvases/run-process.canvas.json title="Run process" -->

## How an Epoch Turns

```process-outline
Run workflow
     -> Wake the Run Loop from the highest-priority relevant durable signal or maintenance cadence
     -> Read run state, active claims, epoch records, checkpoints, and the current ranked board
     -> Rank the full board and admit every eligible target once
     -> Enqueue one deduplicated `worker` job for each admitted epoch target
     -> Claim the job and epoch target atomically, then provision an isolated worktree and ClaimToken
     -> Execute and validate bounded worker attempts; settle every outcome from durable worker evidence
     -> Queue knowledge processing for every closed worker outcome, whether it succeeded or failed
     -> Apply and commit each accepted checkpoint to the cycle repo through the single-flight integration lane
     -> At the epoch boundary, rebuild report truth, confirm or revert tentative work, and record a save point
     -> Repeat from the refreshed board, or stop, complete, fail, or cancel
```

Worker completion hands the closed run to Librarian Pathways; the run records only that handoff and continues from the refreshed board. Process Lifecycle binds direct process execution, observation, and exit settlement to the run's dispatch authority.

## Where the Details Live

**Run workflow map**

| Area | Owned contract | Destination |
| --- | --- | --- |
| Run state | Identity, control, record families, and crash reconciliation | Run State |
| Run loop | Durable wakes, epoch orchestration, delegation, and settlement | Run Loop |
| Board | Candidate evidence and ranking signals | Board Prioritization |
| Workers | Bounded claims, isolated execution, validation, and write safety | Run Workers |
| Process lifecycle | Direct execution, stream logs, graceful settlement, and manual crash recovery | Process Lifecycle |



# docs/10-system-design/50-workflows

A game moves through sync and run as two active workflow slices. The cycle retains a thin `pr` phase so it can cross the parked PR boundary and close, while HarnessState preserves one active workflow slot and one dispatch authority boundary per game.

## Workflow Model

**Workflow ownership**

| Workflow | Slot | Owned work | Lease behavior |
| --- | --- | --- | --- |
| Sync | sync | Observe intake, stage reconciliation, validate, and publish a new baseline. | Observation is lease-free; staging and publication require the dispatch lease. |
| Run | run | Prioritize the board, schedule target work, integrate evidence, and stop at a handoff boundary. | Worker admission and protected checkout mutation require the dispatch lease. |

Harness State defines the workflow slot and the one-slot invariant. A queued workflow may record intent, but only the active lease holder dispatches workers or mutates protected state.

Librarian Pathways is a standing queue, not a fourth workflow phase. Sync and Run end by enqueuing index tasks that the librarian consumes.

## Workflow Slices

**Workflow catalog**

| Workflow | Question answered | Destination |
| --- | --- | --- |
| Sync | How does observed upstream and knowledge intake become a confirmed baseline? | [Sync](./10-sync) |
| Run | How does the harness select, execute, and settle autonomous target work? | [Run](./20-run) |



# docs/10-system-design/60-tracing/10-envelope-and-lineage

# Game Event Envelope and Lineage

Every game event is one durable, game-scoped fact with workflow identity, immediate causation, accountable authorship, and trace lineage. Consumers reconstruct accepted history from events while durable state remains authoritative for the current snapshot.

## Envelope

**GameEventEnvelope**

```
event_id: EventId
sequence: integer  # Monotonic within one game event log.
event_type: registered string
schema_version: positive integer
game_id: GameId
subject_kind: registered string
subject_id: string
correlation_id: CorrelationId
causation_id: CommandId | EventId
trace_id: TraceId
span_id: SpanId
parent_span_id: SpanId | null
actor: operator | runner | agent | guardian | external_observer
occurred_at: timestamp
payload: registered closed object
```

## State Envelope Provenance

<!-- sequence: b-guardian-successor-sequence-diagram title="Guardian settlement and successor acquisition" -->

**StateEnvelope**

```
revision: integer  # Advances exactly once for each accepted revision.
updated_at: timestamp
caused_by_event_id: EventId  # The single accepted game event that produced this revision.
```

Creation is an accepted transition, so caused_by_event_id is non-null after creation. The state write, event append, and outgoing spool records commit together under the expected revision; rejection commits none of them. Event payloads contain only the registered transition facts, not another state snapshot.

## Correlation, Causation, and Spans

correlation_id identifies one user-visible workflow and remains stable across retries and derived work. causation_id names the command accepted directly or the preceding same-game event. trace_id remains workflow-local, span_id names the accepted operation, and parent_span_id is either the distinct parent span or null for a root.

## Accountable Actors

**Actor credit**

| Actor | Credited accepted action |
| --- | --- |
| operator | An authenticated operator command. |
| runner | Deterministic controller or scheduler work. |
| agent | The identified agent action that produced the fact. |
| guardian | Recovery or liveness settlement. |
| external_observer | Observation without authoritative mutation. |

## Settlement and Successor Acquisition

```process-outline
Guardian settles the outgoing workflow
     -> Append game.dispatch_released and run.paused under the settlement command and root span.
Successor acquires authority
     -> Append game.dispatch_acquired under the queued operator workflow lineage.
     -> Append sync.ingesting with operator credit; guardian is not an allowed ingestion actor.
```

Recovery topology and PR subject topology belong to Run state and PR state. The envelope keeps the cross-domain rule: one accepted durable revision has exactly one causing event.



# docs/10-system-design/60-tracing/20-registry-and-catalog

# Game Event Registry and Catalog

The registry is the only insertion authority for accepted game events. Its closed vocabulary makes reconstruction deterministic: a stored event has a known version, classification, subject, actor set, and exhaustive payload contract.

## Registry Invariants

Every live entry has schema_version = 1, at least one subject kind and allowed actor, one classification, and extras = forbid. Unknown events, versions, subject combinations, actors, fields, and value types are rejected; any contract change requires a new immutable schema version.

status_transition payloads contain distinct, required from_status and to_status strings. progress records accepted work without claiming that the subject entered a new status.

## Live v1 Catalog

The payload column is exhaustive. Sync observation belongs with the reconstruction rules in Sync and knowledge events.

**Dispatch and run**

| Event | Classification | Subject kinds | Allowed actors | Closed payload fields |
| --- | --- | --- | --- | --- |
| game.dispatch_requested | coordination | game | operator, runner | requested_kind: string — required, non-null
workflow_id: string — required, non-null
current_lease_holder: object — required, nullable
reason: string — required, non-null |
| game.dispatch_acquired | coordination | game | operator, runner, guardian | kind: string — required, non-null
workflow_id: string — required, non-null
lease_id: string — required, non-null
handoff_snapshot_id: string — optional, nullable
handoff_snapshot_content_hash: string — optional, nullable
state_revision: integer — required, non-null
handoff_from_lease_id: string — optional, non-null
handoff_release_event_id: string — optional, non-null |
| game.dispatch_blocked | coordination | run, sync_workflow, pr_campaign | operator, runner, guardian | lease_id: string — optional, non-null
blocker_codes: string[] — required, non-null
source_identities: object[] — required, non-null
recovery_choices: string[] — required, non-null |
| game.dispatch_released | coordination | game | operator, runner, guardian | old_lease_holder: object — required, non-null
handoff_snapshot_id: string — required, nullable
handoff_snapshot_content_hash: string — required, nullable
terminal_revision: integer — required, non-null
requested_handoff: object — optional, nullable
handoff_result: string — optional, non-null
recovery: boolean — optional, non-null
recovery_reason: string — optional, non-null
cancelled_subject_ids: string[] — optional, non-null |
| game.dispatch_request_cancelled | coordination | run, sync_workflow, pr_campaign | operator | kind: string — required, non-null
workflow_id: string — required, non-null
reason: string — required, non-null
cleared_handoff: boolean — required, non-null |
| run.drafted | lifecycle | run | operator, runner | desired_workers: integer — required, non-null
goal_kind: string — required, non-null
goal_value: number — required, non-null |
| run.readied | status_transition | run | operator, runner | from_status: string — required, non-null
to_status: string — required, non-null
base_revision: string — required, non-null
policy_revision: string — required, non-null
starting_knowledge_revision: string — required, non-null |
| run.activated | status_transition | run | operator, runner | from_status: string — required, non-null
to_status: string — required, non-null
lease_id: string — required, non-null |
| run.paused | status_transition | run | operator, runner, guardian | from_status: string — required, non-null
to_status: string — required, non-null
recovery_id: string — optional, non-null
recovery_reason: string — optional, non-null
cancelled_claim_ids: string[] — optional, non-null
cancelled_operation_ids: string[] — optional, non-null
queued_work: array — optional, non-null |
| run.completed | status_transition | run | operator, runner | from_status: string — required, non-null
to_status: string — required, non-null |
| run.failed | status_transition | run | operator, runner, guardian | from_status: string — required, non-null
to_status: string — required, non-null
terminal_reason: string — optional, non-null |
| run.cancelled | status_transition | run | operator | from_status: string — required, non-null
to_status: string — required, non-null
cancellation_reason: string — required, non-null |
| run.recovered | recovery | run | operator | recovery_id: string — optional, non-null
recovery_reason: string — required, non-null
cancelled_claim_ids: string[] — required, non-null
cancelled_operation_ids: string[] — required, non-null
queued_work: array — optional, non-null
resulting_status: string — required, non-null |
| run.epoch_integrated | progress | run | runner, agent | epoch_id: string — required, non-null
integration_commit: string — required, non-null
score_delta: number — required, nullable
new_head: string — required, non-null |
| run.remote_applied | progress | run | operator, runner | remote_application_id: string — required, non-null
prior_head: string — required, non-null
new_head: string — required, non-null
resolved_conflicts: string[] — required, non-null
score_delta: number — required, nullable |
| run.desired_workers_changed | progress | run | operator, runner | previous_desired_workers: integer — required, non-null
desired_workers: integer — required, non-null |

**Sync and knowledge**

| Event | Classification | Subject kinds | Allowed actors | Closed payload fields |
| --- | --- | --- | --- | --- |
| sync.requested | lifecycle | sync_workflow | operator, runner, external_observer | upstream_from: string — required, non-null
upstream_to: string — required, non-null
merged_pr_ids: string[] — required, non-null
corpus_batch_ids: string[] — required, non-null
knowledge_only: boolean — required, non-null |
| sync.discord_refresh_requested | progress | sync_workflow | operator, runner | — |
| sync.discord_refresh_completed | progress | sync_workflow | operator, runner | ok: boolean — required, non-null
detail: string — required, non-null
duration_ms: integer — required, non-null
messages_pulled: integer — required, nullable |
| sync.observation_refreshed | progress | sync_workflow | operator, runner, external_observer | prior_upstream_revision, observed_upstream_revision: string — required, non-null
merged_pr_ids, corpus_batch_ids: string[] — required, non-null
knowledge_only: boolean — required, non-null |
| sync.ingesting | status_transition | sync_workflow | operator, runner | from_status: string — required, non-null
to_status: string — required, non-null |
| sync.reconciling | status_transition | sync_workflow | operator, runner | from_status: string — required, non-null
to_status: string — required, non-null |
| sync.validating | status_transition | sync_workflow | operator, runner | from_status: string — required, non-null
to_status: string — required, non-null |
| sync.validated | status_transition | sync_workflow | operator, runner | from_status: string — required, non-null
to_status: string — required, non-null
validation_evidence: object — required, non-null |
| sync.publishing | status_transition | sync_workflow | operator, runner | from_status: string — required, non-null
to_status: string — required, non-null |
| sync.published | status_transition | sync_workflow | operator, runner | from_status: string — required, non-null
to_status: string — required, non-null |
| sync.blocked | status_transition | sync_workflow | operator, runner, guardian | from_status: string — required, non-null
to_status: string — required, non-null
blocker_codes: string[] — required, non-null
source_identities: object[] — required, non-null
recovery_choices: string[] — required, non-null |
| sync.staging_progressed | progress | sync_workflow | operator, runner | staging_workspace_id: string — required, non-null
durable_stage: string — required, non-null
epochs_total: integer — required, non-null
epochs_applied: integer — required, non-null
minor_conflicts_resolved: integer — required, non-null
conflicts_awaiting_operator: integer — required, non-null
pr_series_reconciliation_summary: object — required, non-null
state_revision: integer — required, non-null
progress_kind: string — required, non-null |
| sync.reconciliation_blocked | status_transition | sync_workflow | operator, runner, guardian | from_status: string — required, non-null
to_status: string — required, non-null
conflict_identities: string[] — required, non-null
conflicts_awaiting_operator: integer — required, non-null |
| sync.recovered | recovery | sync_workflow | operator | from_status: string — required, non-null
to_status: string — required, non-null
staging_preserved: boolean — required, non-null
staging_discarded: boolean — required, non-null
resume_stage: string — required, nullable
recovery_reason: string — required, non-null |
| sync.cancelled | status_transition | sync_workflow | operator | from_status: string — required, non-null
to_status: string — required, non-null
discarded_staging_workspace_id: string — required, nullable
untouched_session_head: string — required, non-null
untouched_submodule_heads: object[] — required, non-null |
| sync.boundary_published | coordination | sync_workflow | operator, runner | upstream_revision: string — required, non-null
knowledge_intake: object — required, non-null (fetched_prs, repaired_prs, ingest per lane)
invalidations: string[] — required, non-null
validation_evidence: object — required, non-null |
| sync.pr_push_started | status_transition | sync_push | operator, runner | from_status: string — required, non-null
to_status: string — required, non-null
series_id: string — required, non-null
branch: string — required, non-null
remote_name: string — required, non-null
new_head: string — required, non-null
attempt: integer — required, non-null |
| sync.pr_push_succeeded | status_transition | sync_push | operator, runner | from_status: string — required, non-null
to_status: string — required, non-null
series_id: string — required, non-null
branch: string — required, non-null
remote_name: string — required, non-null
new_head: string — required, non-null
attempt: integer — required, non-null |
| sync.pr_push_failed | status_transition | sync_push | operator, runner | from_status: string — required, non-null
to_status: string — required, non-null
series_id: string — required, non-null
branch: string — required, non-null
remote_name: string — required, non-null
new_head: string — required, non-null
attempt: integer — required, non-null
error: string — required, non-null |
| knowledge.job_enqueued | lifecycle (historical: the legacy sync knowledge stage was removed 2026-09-03; no producer remains, the type stays registered so old events replay) | knowledge_job | operator, runner | source_class: string — required, non-null
provenance: object — required, non-null
execution_class: string — required, non-null |
| knowledge.job_processing | status_transition (historical: the legacy sync knowledge stage was removed 2026-09-03; no producer remains, the type stays registered so old events replay) | knowledge_job | operator, runner | from_status: string — required, non-null
to_status: string — required, non-null
sync_id: string — required, nullable
execution_class: string — required, non-null
source_class: string — required, non-null
provenance: object — required, non-null
source_kind: string — required, non-null
source_id: string — required, non-null |
| knowledge.job_waiting | status_transition (historical: the legacy sync knowledge stage was removed 2026-09-03; no producer remains, the type stays registered so old events replay) | knowledge_job | operator, runner | from_status: string — required, non-null
to_status: string — required, non-null
sync_id: string — required, nullable
execution_class: string — required, non-null
source_class: string — required, non-null
provenance: object — required, non-null
source_kind: string — required, non-null
source_id: string — required, non-null
reason: string — required, non-null |
| knowledge.job_succeeded | status_transition (historical: the legacy sync knowledge stage was removed 2026-09-03; no producer remains, the type stays registered so old events replay) | knowledge_job | operator, runner | from_status: string — required, non-null
to_status: string — required, non-null
sync_id: string — required, nullable
execution_class: string — required, non-null
source_class: string — required, non-null
provenance: object — required, non-null
source_kind: string — required, non-null
source_id: string — required, non-null
staged_digest: string — required, non-null |
| knowledge.job_failed | status_transition (historical: the legacy sync knowledge stage was removed 2026-09-03; no producer remains, the type stays registered so old events replay) | knowledge_job | operator, runner | from_status: string — required, non-null
to_status: string — required, non-null
sync_id: string — required, nullable
execution_class: string — required, non-null
source_class: string — required, non-null
provenance: object — required, non-null
source_kind: string — required, non-null
source_id: string — required, non-null
error: string — required, non-null |
| knowledge.job_cancelled | status_transition (historical: the legacy sync knowledge stage was removed 2026-09-03; no producer remains, the type stays registered so old events replay) | knowledge_job | operator, runner | from_status: string — required, non-null
to_status: string — required, non-null
sync_id: string — required, nullable
execution_class: string — required, non-null
source_class: string — required, non-null
provenance: object — required, non-null
source_kind: string — required, non-null
source_id: string — required, non-null
reason: string — required, non-null |
| knowledge.revision_advanced | coordination (historical: the legacy sync knowledge stage was removed 2026-09-03; no producer remains, the type stays registered so old events replay) | game_knowledge | operator, runner | old_revision: string — required, non-null
new_revision: string — required, non-null
accepted_job_ids: string[] — required, non-null |

**PR**

| Event | Classification | Subject kinds | Allowed actors | Closed payload fields |
| --- | --- | --- | --- | --- |
| pr.campaign_opened | lifecycle | pr_campaign | operator | source_anchor: object — required, non-null
series_count: integer — required, non-null
publication_batch_size: integer — required, non-null
from_status: string — required, nullable
to_status: string — required, non-null |
| pr.campaign_in_review | status_transition | pr_campaign | operator | from_status: string — required, non-null
to_status: string — required, non-null |
| pr.campaign_working | status_transition | pr_campaign | operator | from_status: string — required, non-null
to_status: string — required, non-null |
| pr.batch_published | progress | pr_campaign | operator | batch_index: integer — required, non-null
series_ids: string[] — required, non-null
operator: string — required, non-null
from_status: string — required, non-null
to_status: string — required, non-null |
| pr.campaign_recovered | recovery | pr_campaign | operator | recovery_reason: string — required, non-null
cancelled_subject_ids: string[] — required, non-null
resulting_status: string — required, non-null
from_status: string — required, non-null
to_status: string — required, non-null |
| pr.campaign_closed | lifecycle | pr_campaign | operator | outcome: string — required, non-null
per_series_terminal_summary: object — required, non-null
from_status: string — required, non-null
to_status: string — required, non-null |
| pr.series_prepared | lifecycle | pr_series | operator | from_status: string — required, nullable
to_status: string — required, non-null
branch: string — required, non-null
batch_index: integer — required, non-null
adoption: string — optional, non-null |
| pr.series_published | status_transition | pr_series | operator | upstream_pr_number: integer — required, non-null
branch: string — required, non-null
batch_index: integer — required, non-null
adoption: string — optional, non-null
from_status: string — required, non-null
to_status: string — required, non-null |
| pr.series_changes_requested | status_transition | pr_series | operator, external_observer | from_status: string — required, non-null
to_status: string — required, non-null
approval_source_identity: string — optional, non-null
review_decision: string — optional, non-null
upstream_pr_number: integer — optional, non-null
adoption: string — optional, non-null
branch: string — optional, non-null
batch_index: integer — optional, non-null |
| pr.series_revising | status_transition | pr_series | operator, runner, agent | from_status: string — required, non-null
to_status: string — required, non-null |
| pr.series_approved | status_transition | pr_series | operator, external_observer | from_status: string — required, non-null
to_status: string — required, non-null
approval_source_identity: string — required, non-null
approved_revision: string — required, non-null
approving_actor: string — required, non-null
adoption: string — optional, non-null
branch: string — optional, non-null
batch_index: integer — optional, non-null
upstream_pr_number: integer — optional, non-null |
| pr.series_merged | lifecycle | pr_series | operator, external_observer | upstream_pr_number: integer — required, non-null
merged_upstream_revision: string — required, non-null
adoption: string — optional, non-null
branch: string — optional, non-null
batch_index: integer — optional, non-null
from_status: string — required, non-null
to_status: string — required, non-null |
| pr.series_closed | lifecycle | pr_series | operator, external_observer | close_reason: string — required, non-null
closing_actor: string — required, non-null
adoption: string — optional, non-null
branch: string — optional, non-null
batch_index: integer — optional, non-null
from_status: string — required, non-null
to_status: string — required, non-null |
| pr.feedback_ingested | progress | pr_series | external_observer | work_item_ids: string[] — required, non-null
review_source_identities: string[] — required, non-null
ingesting_actor: string — required, non-null
from_status: string — required, non-null
to_status: string — required, non-null |
| pr.series_revised | status_transition | pr_series | operator, runner, agent | resolved_work_item_ids: string[] — required, non-null
pushed_revision: string — required, non-null
from_status: string — required, non-null
to_status: string — required, non-null |
| pr.work_items_claimed | progress | pr_series | operator, runner, agent | claimed_work_item_ids: string[] — required, non-null
lease_id: string — required, non-null
from_status: string — required, non-null
to_status: string — required, non-null |
| pr.work_items_resolved | progress | pr_series | operator, runner, agent | resolved_work_item_ids: string[] — required, non-null
lease_id: string — required, non-null
resolution: string — required, non-null
from_status: string — required, non-null
to_status: string — required, non-null |
| pr.work_items_declined | progress | pr_series | operator, runner, agent | declined_work_item_ids: string[] — required, non-null
decline_reason: string — required, non-null
lease_id: string — required, non-null
from_status: string — required, non-null
to_status: string — required, non-null |

**Cycle**

| Event | Classification | Subject kinds | Allowed actors | Closed payload fields |
| --- | --- | --- | --- | --- |
| cycle.opened | lifecycle | cycle | operator, runner | baseline_revision: string — required, nullable
initial_head_revision: string — required, nullable
worktree_identity: string — required, non-null
opening_sync_id: string — required, nullable
state_revision: integer — required, non-null |
| cycle.updated | progress | cycle | operator, runner, guardian | prior_head: string — required, nullable
new_head: string — required, nullable
timeline_entry_kind: string — required, non-null
timeline_entry_id: string — required, non-null
workflow_ids_added: string[] — required, non-null
workflow_ids_removed: string[] — required, non-null
current_status: string — required, non-null
state_revision: integer — required, non-null |
| cycle.closing | status_transition | cycle | operator | from_status: string — required, non-null
to_status: string — required, non-null |
| cycle.blocked | status_transition | cycle | operator, runner, guardian | from_status: string — required, non-null
to_status: string — required, non-null
prior_status: string — required, non-null
blocker_codes: string[] — required, non-null
source_identities: object[] — required, non-null
recovery_choices: string[] — required, non-null
state_revision: integer — required, non-null |
| cycle.blockers_updated | progress | cycle | operator, runner, guardian | added_blocker_codes: string[] — required, non-null
removed_blocker_codes: string[] — required, non-null
blocker_codes: string[] — required, non-null
source_identities: object[] — required, non-null
recovery_choices: string[] — required, non-null
state_revision: integer — required, non-null |
| cycle.complete | status_transition | cycle | operator, runner, guardian | from_status: string — required, non-null
to_status: string — required, non-null |
| cycle.closed | lifecycle | cycle | operator | final_head: string — required, nullable
shipped_and_unshipped_work_summary: object — required, non-null
final_save_point_id: string — required, nullable
closing_operator: string — required, non-null
state_revision: integer — required, non-null |
| cycle.save_point_recorded | progress | cycle | operator, runner, guardian | anchored_commit: string — required, non-null
trigger_kind: string — required, non-null
headline_score: number — required, nullable
artifact_paths: string[] — required, non-null
replay_key: string — required, non-null
replayed_failure_event_id: string — required, nullable |
| cycle.save_point_failed | progress | cycle | operator, runner, guardian | anchored_commit: string — required, non-null
trigger_kind: string — required, non-null
failed_or_missing_artifact_classes: string[] — required, non-null
blocker_code: string — required, non-null
staleness_flag_raised: boolean — required, non-null
replay_key: string — required, non-null
replayed_from_spool: boolean — optional, non-null |
| cycle.preparing_subphase_updated | progress | cycle | operator, runner, guardian | previous_phase: string — required, non-null
previous_status: string — required, non-null
phase: string — required, non-null
status: string — required, non-null
subphase: string — required, non-null |
| cycle.preparing_completed | progress | cycle | operator, runner, guardian | previous_phase: string — required, non-null
previous_status: string — required, non-null
phase: string — required, non-null
status: string — required, non-null |
| cycle.running_started | progress | cycle | operator, runner, guardian | previous_phase: string — required, non-null
previous_status: string — required, non-null
phase: string — required, non-null
status: string — required, non-null |
| cycle.running_subphase_updated | progress | cycle | operator, runner, guardian | previous_phase: string — required, non-null
previous_status: string — required, non-null
phase: string — required, non-null
status: string — required, non-null
subphase: string — required, non-null |
| cycle.running_stopped | progress | cycle | operator, runner, guardian | previous_phase: string — required, non-null
previous_status: string — required, non-null
phase: string — required, non-null
status: string — required, non-null
stop_reason: string — required, non-null |
| cycle.running_unblocked | status_transition | cycle | operator, runner, guardian | from_status: string — required, non-null
to_status: string — required, non-null |
| cycle.pr_entered | progress | cycle | operator, runner, guardian | previous_phase: string — required, non-null
previous_status: string — required, non-null
phase: string — required, non-null
status: string — required, non-null
forced: boolean — required, non-null |
| cycle.pr_final_build_completed | progress | cycle | operator, runner, guardian | previous_phase: string — required, non-null
previous_status: string — required, non-null
phase: string — required, non-null
status: string — required, non-null |
| cycle.pr_subphase_updated | progress | cycle | operator, runner, guardian | previous_phase: string — required, non-null
previous_status: string — required, non-null
phase: string — required, non-null
status: string — required, non-null
subphase: string — required, non-null |
| cycle.pr_completed | progress | cycle | operator, runner, guardian | previous_phase: string — required, non-null
previous_status: string — required, non-null
phase: string — required, non-null
status: string — required, non-null |



# docs/10-system-design/60-tracing/30-dispatch-cycle-and-replay

# Dispatch, Cycle, and Replay Events

Dispatch and cycle events preserve the accepted boundaries around workflow authority, handoff evidence, cycle closure, and recoverable evidence delivery. Their ordering and replay identities prevent retries from manufacturing a second accepted fact. See the event handshake for scheduler wake-queue semantics and transactional framing.

An occupied lease follows this accepted event order:

```text
game.dispatch_requested
  -> game.dispatch_released
  -> game.dispatch_acquired
```

When the lease is free, acquisition follows the request without a release. A blocker discovered during handoff produces `game.dispatch_blocked`, and acquisition waits. A queued request may be cleared by `game.dispatch_request_cancelled` without pretending that authority transferred.

<!-- sequence: b-dispatch-handoff-sequence-diagram title="Dispatch handoff" -->

Release creates one immutable handoff snapshot. `game.dispatch_released` carries its `handoff_snapshot_id` and `handoff_snapshot_content_hash`; the successor `game.dispatch_acquired` carries the same pair plus the new lease and accepted state revision. The snapshot persists the release event identity and zero or one acquisition identity. Consumers join the pair by snapshot identity and hash, not by timestamps, correlation, or trace.

The release stays in the outgoing workflow's `correlation_id` and `trace_id`. Acquisition and ingestion stay in the successor workflow's original correlation and trace. Their causation remains `game.dispatch_released` to `game.dispatch_acquired` to `sync.ingesting`, so the release-to-acquire link is the durable bridge across workflow-local lineage. Stable snapshot content yields a stable hash and snapshot identity; snapshot, release, and acquisition writes roll back together on failure.

Settlement by the exiting run-loop process and successor acquisition are two accepted actions. The exiting run-loop emits `game.dispatch_released` and `run.paused` under the settlement command and settlement root span, with `guardian` as actor for event compatibility. The successor action emits `game.dispatch_acquired` and `sync.ingesting` under the original queued operator `sync.start` command and root span, with `operator` as actor. Immediate `sync.start` uses the same operator provenance. `sync.ingesting` accepts only `operator` or `runner`, never `guardian`.

## Transport replay

```process-outline
Commit the accepted event and deterministic delivery identities together
Deliver at least once
     -> A consumer commits the delivery identity with its effect.
Acknowledge durable acceptance
     -> Duplicate delivery is an acknowledged no-op.
```

Each accepted game-event transaction creates its outgoing spool deliveries in the same commit. A delivery identity is deterministic from `event_id` and destination. Delivery is at least once: a crash before acknowledgement redelivers the same identity, the consumer commits the identity with its effect, and a duplicate is an acknowledged no-op. A spool entry clears only after durable acceptance, and replay never appends another game event or reapplies an accepted fact.

## Save-point failure replay

A failed save point records `cycle.save_point_failed`, raises the matching blocker and stale flag, and uses a deterministic `replay_key` derived from cycle, anchored commit, and trigger. If game storage was unavailable, the failure spool retains command, correlation, actor, span, and diagnostics; the next successful open replays the closed event payload transactionally. Concurrent or repeated opens deduplicate the same replay identity.

A successful retry writes `cycle.save_point_recorded` against the original anchor and includes `replayed_failure_event_id` when applicable. The artifact set and timeline entry are written at most once. The matching blocker and stale flag clear only after the evidence is durable.

The entire failure spool validates before replay begins. A malformed final `*.json` spool file or invalid spool schema fails loudly with an error naming the path; the corrupt file is retained and no partial event is emitted. A missing spool directory is an empty spool.

## Cycle lifecycle

`cycle.closing` is the status-transition fact accepted when an operator starts a permitted close. A close blocked by lease ownership, unshipped work, stale evidence, dirty worktree evidence, or failed capture does not emit `cycle.closed`. Entry into blocked status emits `cycle.blocked` once with `prior_status = from_status`, complete blocker/source/recovery facts, and the accepted state revision.

## Dispatch Handoff

```process-outline
Request authority
     -> Append game.dispatch_requested.
Settle the occupied lease
     -> Stamp the requested handoff on the holder and stop it.
     -> Append game.dispatch_released with the immutable handoff snapshot.
Acquire authority
     -> Append game.dispatch_acquired with the same snapshot identity and hash.
```

While a cycle remains blocked, membership changes emit `cycle.blockers_updated` with added, removed, and complete current blocker-code sets; the event is progress, not another blocked-status entry. After the close gates and final save point succeed, `cycle.closed` records the final head, shipped and unshipped work summary, final save-point identity, closing operator, and state revision. `cycle.complete` is the separate status-transition fact for entering the complete cycle phase.



# docs/10-system-design/60-tracing/40-sync-and-knowledge-events

# Sync and Knowledge Events

Sync and knowledge events reconstruct observed inputs, staged work, blocking evidence, recovery, cancellation proof, and publication. The Sync Workflow worker owns its staged state copy; this page owns only the accepted facts needed to replay and explain that work.

## Ingestion Authority

```process-outline
Guardian settles the outgoing lease
     -> Append game.dispatch_released and run.paused under settlement lineage.
Successor acquires the lease
     -> Append game.dispatch_acquired under the queued workflow lineage.
Operator or runner begins ingestion
     -> Append sync.ingesting; guardian is not an allowed actor.
```

## Observation and Staged Progress

<!-- sequence: b-sync-ingestion-sequence-diagram title="Sync ingestion authority" -->

**Discord observation facts**

| Event | When it fires | Durable facts | Authority |
| --- | --- | --- | --- |
| sync.discord_refresh_requested | Immediately after sync.requested and before the best-effort mirror pull begins. | No event-specific facts; the sync_workflow subject and envelope lineage bind the request to its observation. | operator, runner |
| sync.discord_refresh_completed | After the mirror pull returns or fails, before incremental archive staging proceeds. | ok, detail, duration_ms, and nullable messages_pulled derived from per-channel pull-state deltas. | operator, runner |
| sync.discord_staged | After watermark planning freezes the incremental batches for this observation, including when no new content exists. | batches, messages, days (distinct UTC dates), channels, and nullable first_message_at and last_message_at bounds. | operator, runner |

**sync.observation_refreshed payload**

```
prior_upstream_revision: string
observed_upstream_revision: string
merged_pr_ids: string[]
corpus_batch_ids: string[]
knowledge_only: boolean
observation_source_identity: string
state_revision: integer
```

**Progress facts**

| Event | Reconstruction evidence | Allowed actors |
| --- | --- | --- |
| sync.observation_refreshed | Complete observed revisions plus PR and corpus identity sets. | operator, runner, external_observer |
| sync.staging_progressed | Workspace, durable stage, epoch/conflict counts, PR reconciliation summary, revision, and progress kind. | operator, runner |
| sync.boundary_published | Upstream and knowledge revisions, validation evidence, and invalidated identities. | operator, runner |

## Blocking, Recovery, and Cancellation

**Reconstruction outcomes**

| Event | Evidence | Authority |
| --- | --- | --- |
| sync.reconciliation_blocked | Conflict identities and conflicts awaiting operator. | operator, runner, guardian |
| sync.blocked | Blocker codes, deduplicated source identities, and recovery choices. | operator, runner, guardian |
| sync.recovered | From/to status, staging preservation or discard, resume stage, and reason. | operator |
| sync.cancelled | Discarded staging identity and proof that canonical heads were untouched. | operator |

## Knowledge Jobs

**Knowledge event reconstruction**

| Event family | Evidence | Authority |
| --- | --- | --- |
| knowledge.job_enqueued | Source class, provenance, and execution class. | operator, runner |
| knowledge job transitions | Status change, sync binding, execution/source class, provenance, source identity, and outcome-specific reason, digest, or error. | operator, runner |
| knowledge.revision_advanced | Old/new knowledge revisions and the complete accepted job-id set. | operator, runner |

The staged workflow shape and status meanings live in Sync state.



# docs/10-system-design/60-tracing/50-read-api-and-reconstruction

# Game Event Read API and Reconstruction

Trace inspection starts with bounded, game-scoped summaries and correlation reconstruction. The HTTP boundary exposes the same ordered query and safe projection without raw payloads or caller-controlled storage paths.

## Trace Inspection

**Event query filters**

| Parameter | Constraint | Behavior |
| --- | --- | --- |
| correlation_id | Nonblank. | Select one workflow lineage. |
| subject_kind + subject_id | Both present; registered kind and nonblank identity. | Select one subject stream. |
| event_type_prefix | Nonblank literal. | Select registered event families by prefix. |
| from_sequence + to_sequence | Inclusive safe integers; from ≤ to. | Bound a sequence range. |
| after_sequence | Nonnegative safe integer. | Continue after the prior page. |
| limit | 1–200; default 50. | Return at most limit events; never clamp. |

**EventPage**

```
events: SafeEventSummary[]
has_more: boolean
next_after_sequence: integer | null
```

```json
{
  "events": [],
  "has_more": false,
  "next_after_sequence": null
}
```

Queries are game-scoped and ordered by sequence ascending. The reader fetches limit + 1 rows, returns at most limit, and exposes the last returned sequence only when another row exists.

## Safe Summary Projection

**SafeEventSummary**

```
event_id: EventId
sequence: integer
event_type: string
subject: SubjectIdentity
correlation_id: CorrelationId
causation_id: CommandId | EventId
trace: TraceLineage
actor: Actor
occurred_at: timestamp
payload_summary: redacted object
```

Credential-shaped values and filesystem fields are redacted. Projection is capped at depth 4, 64 entries, 256 characters per string, and 4096 serialized bytes; capped summaries carry _truncated: true.

## Correlation Reconstruction

**caused_by**

```
event: { kind: event, event_id, sequence, event_type, correlation_id, subject_kind, subject_id }
command: { kind: command, command_id }
```

Reconstruction requires correlation_id, preserves ascending order, and returns zero, one, or many kernel links. Empty history is a successful empty page, not a missing-resource response.

## HTTP Boundary

**Exact response outcomes**

| Outcome | Status | Body or behavior |
| --- | --- | --- |
| Valid query or empty reconstruction | 200 | Bounded projection; empty events and traces are valid. |
| Invalid context, filter, cursor, or unsafe override | 400 | Sanitized specific validation error. |
| Recognized route with non-GET method | 405 | method not allowed plus Allow: GET. |
| Unknown path | outer router | No route-local 404. |
| Storage, payload, linkage, or reconstruction failure | 500 | Game event read failed; no internal detail. |



# docs/10-system-design/60-tracing/60-kernel-trace-linkage

# Kernel Trace Linkage

Kernel trace linkage joins accepted game events to runtime spans through protected metadata and a persisted cycle cursor. Optional telemetry may be absent, but a runtime event that was emitted must receive its durable join.

## Validated Submission

<!-- sequence: b-kernel-submission-sequence title="Event-to-kernel validated submission" -->

```process-outline
Load the durable game event by game and event identity
Validate correlation and the resolved same-game cause
Overwrite caller-supplied protected metadata
Upsert deterministic container lineage
Emit the deterministic kernel event
Persist the game-cycle linkage cursor
```

## Persisted Cursor and Failures

**last_linkage_cursor**

```
game_event_id: EventId
kernel_event_id: KernelEventId
correlation_id: CorrelationId
caused_by_event_id: EventId | null
linked_at: timestamp
```

**Failure modes**

| Condition | Disposition |
| --- | --- |
| Optional runtime absent | Return no trace result. |
| Optional submission fails before kernel emission | Return no trace result. |
| Required runtime fails | Surface the failure. |
| Cursor persistence fails after kernel emission | Fail in every mode; retry the deterministic kernel event identity. |

## Both-Direction Joins

**Join keys**

| Direction | Required keys | Exclusions |
| --- | --- | --- |
| Game to kernel | Assigned application session, protected game, game_event_id. | Cross-game collisions and unrequested identities. |
| Kernel to game | game_event_id, game, correlation, cause metadata, and last_linkage_cursor. | Incomplete or mismatched protected metadata. |

**KernelTraceLink**

```
event_id: EventId
app_session_id: AppSessionId
container_id: ContainerId
kernel_event_id: KernelEventId
href: string
```

The join uses protected JSON metadata already stored on kernel trace events and the cycle trace cursor; it adds no kernel table or column.



# docs/10-system-design/60-tracing/70-operator-timeline

# Operator Timeline

The operator timeline presents server-authoritative accepted-event history by workflow correlation. It combines bounded discovery, chronological reconstruction, safe cause navigation, and validated kernel links without inventing trace identity in the client.

## Workflow Selection

**Workflow identity**

| Workflow kind | Subject evidence |
| --- | --- |
| run | run subjects and recognized dispatch payloads. |
| sync | sync_workflow subjects and recognized dispatch payloads. |
| campaign | pr_campaign subjects and recognized dispatch payloads. |
| cycle | cycle subjects. |

Events deduplicate by event_id and group by correlation. A correlation with conflicting workflow identities is discarded; options sort by newest last sequence and otherwise select the newest workflow.

## Bounded Continuation

```process-outline
Load one bounded discovery page and one bounded reconstruction page
Merge by event identity and restore ascending sequence order
Expose Load next only when has_more and the cursor advances
Repeat one page at a time until the selected event appears or absence is proven
```

## Trace-Link Safety

The persisted server href is the sole trace-identity source. A renderable link is root-relative or same-origin HTTP(S), uses /workspace/trace, carries no credentials or traversal form, and passes validation again when clicked.

## Visible State, Message, and Action

**Operator timeline states**

| State | Message | Action |
| --- | --- | --- |
| unselected | No workflow selected or no accepted events. | Select the newest valid workflow when available. |
| awaiting-reconstruction | Loading linked workflow or first lifecycle page. | Wait or retry the failed request. |
| continuation-available | Selected event is beyond the loaded page. | Load one bounded next page. |
| loaded | Chronological accepted events with safe cause and trace links. | Select an event or follow a validated link. |
| missing | Selected event is absent after bounded reconstruction proves it. | Choose another event or workflow. |

Loading, empty, and failure copy identifies whether discovery, reconstruction, or continuation is active. URL hydration preserves unrelated game, cycle, trace, and container identity; correlation changes invalidate stale reconstruction.



# docs/10-system-design/60-tracing/80-event-handshake

# Signal-to-Trace Event Handshake

Scheduler wake events are durable work-queue signals between workers, the runner, and a sleeping scheduler. They become traceable game history only when the runner accepts a state transition and appends its registered game event.

## Signal-to-Trace Boundary

**Signal and fact boundary**

| Record | Purpose | Durable meaning |
| --- | --- | --- |
| Wake event | Prompt the runner to reconsider work. | A handled queue signal; not an accepted game fact. |
| Game event | Explain an accepted durable transition. | Immutable registered fact joined to one state revision. |
| Scheduler condition | Expose current scheduling observations. | Observability only; outside the accepted-fact transaction. |

When a signal causes an accepted run transition, the game event and state revision commit atomically under the expected revision. Run workflow policy, including epoch refresh and queue priority, lives in Run state.

<!-- sequence: b-handshake-sequence-diagram title="Worker, runner, and scheduler handshake" -->

## Wake Event Vocabulary

**Structured wake events**

| Event | Producer | Consumer | Policy owner |
| --- | --- | --- | --- |
| run_started | run controller | runner | run workflow |
| worker_finished | worker | runner | run workflow |
| worker_error | worker | runner | run workflow |
| pool_below_target | scheduler observation | runner | run workflow |
| epoch_admitted | epoch controller | runner | run workflow |
| epoch_full_refresh_started / finished | knowledge refresh worker | runner | run workflow |
| epoch_regression_pause | epoch validator | runner | run workflow |
| epoch_cycle_error | epoch controller | runner | run workflow |

## Handshake Exchange

```process-outline
Producer stores a wake request
     -> Include payload and provenance.
Runner claims an unhandled relevant signal
     -> Ask the scheduler for a decision.
Runner stores the result
     -> Commit any accepted transition and game event before marking the wake request handled.
```

## Dispatch and Replay

Dispatch snapshots, accepted-event spooling, acknowledgement, and replay identities are specified once in Dispatch, cycle, and replay events.



# docs/10-system-design/60-tracing

# Tracing

Tracing is the epilogue of system execution: durable events explain how accepted state came to be, scheduler signals explain why sleeping work resumed, and trace links connect those facts to runtime spans. Durable workflow state remains authoritative for the current snapshot.

**Tracing contract map**

| Area | What it traces |
| --- | --- |
| Envelope and lineage | Identity, causation, correlation, actor credit, and one-event/one-revision provenance. |
| Registry and catalog | The closed vocabulary accepted by the event store, grouped by workflow domain. |
| Dispatch, cycle, and replay | Authority transfer, cycle facts, transactional spooling, and idempotent replay. |
| Sync and knowledge | Observation, staged progress, recovery evidence, publication, and knowledge jobs. |
| Read and reconstruction | Bounded inspection, safe projections, cause resolution, and pagination. |
| Kernel and operator traces | Runtime-span joins and the operator timeline. |
| Event handshake | The boundary between scheduler wake signals and accepted game facts. |



# docs/10-system-design

System design explains how the orchestrator turns a configured game into durable, coordinated progress. Read the chapters in order: each establishes the concepts used by the next, and tracing closes the path by showing how the complete system is reconstructed.

## Reading Path

**System design chapters**

| Chapter | Question answered | Destination |
| --- | --- | --- |
| Architecture | What is the machine, and how do bounded workers create coherent progress? | Architecture |
| Game | What identifies a game, and how does its configuration enter the system? | Game |
| Harness | What durable wrapper surrounds a registered game and drives its end-to-end process? | Harness |
| Knowledge System | What evidence surrounds a target, and how is that evidence processed and published? | Knowledge System |
| Workflows | How do Sync, Run, and PR advance their own state and hand work across boundaries? | Workflows |
| Tracing | How are events, lineage, and operator history recorded and reconstructed? | Tracing |



# docs/20-implementation/10-agents

The shared invocation path for every agent: Pi/kernel spawning, prompt rendering, artifact writing, and JSON salvage. What each agent reads and writes is design and lives under Agents; this page records only how the runtime and the catalog are structured.

Sources: apps/server/src/infrastructure/agent-runtime, apps/server/src/infrastructure/kernel/bridge, apps/server/src/core/agent-catalog.

## Governed By

- Architecture: where the kernel boundary sits.

- Kernel Trace Linkage: how spawned sessions attach to harness state and traces.

- Agents: the roster and each agent's contract.

## Decisions

**Decision**: every agent is a vertical-slice directory under agents/<area>/<name> (areas: running, knowledge) carrying its own agent.ts, prompt.ts, context.ts, and output schema, registered in registry.ts. The kernel catalog lists them in a fixed order for the dashboard. **Why**: scattering prompt builders across phase runtimes was rejected; keeping prompt, schema, context, and tools adjacent keeps live runs, dry runs, artifacts, and previews in step. **Applies to**: apps/server/src/core/agent-catalog and every future agent.

**Decision**: trigger and guardian process actors are not agents; they live with the phase that owns the workflow action, not in the catalog. **Why**: they are deterministic orchestration, not prompted work. **Applies to**: apps/server/src/core/cycle-runtime/phases.

**Decision**: the runtime is role-neutral: prompt building and output parsing belong to the owning agent slice, and generic JSON salvage is the only parsing the runtime performs. **Why**: role-specific branches in shared runtime code couple every agent to every other agent's changes. **Applies to**: apps/server/src/infrastructure/agent-runtime, including any future runtime helper.

**Decision**: dry-run and live mode share the same prompt builders, and every rendered prompt and context packet persists as an artifact beside agent output. **Why**: a separate preview path drifts from what agents receive; that drift is a regression class this rule removes. **Applies to**: apps/server/src/infrastructure/agent-runtime/runtime and every invocation path.

**Decision**: live DB-backed spawns go through the server kernel bridge with a kernel context resolver; paths that cannot inject kernel context compose the same rendered context packet into the prompt instead. **Why**: audit artifacts, previews, and live sessions must expose the same injected input. **Applies to**: apps/server/src/infrastructure/kernel/bridge, apps/server/src/infrastructure/agent-runtime/kernel-pi-runner.ts.



# docs/20-implementation/20-server-jobs

Operator job surface for the orchestrator: one command dispatcher that parses global game/runtime options and hands each command to the domain slice that owns its workflow. Behavior lives in the design workflow docs; this page records only how job code is organized.

Sources: apps/server/src/application/jobs.

## Governed by

- Workflows — owns the sync, run, and PR Workflow behavior that jobs invoke.

- Librarian Pathways — owns the queue and pathway contract the kg2 jobs serve.

## Decisions

**Decision**: `application/jobs` owns only the command dispatcher; every job's implementation lives with its owning domain slice — running-phase jobs under the running phase, PR jobs under the PR phase, knowledge jobs under `core/knowledge-v2/*/cli.ts (the kg2 jobs) or core/knowledge/jobs (the deprecated kg jobs)`, validation jobs under `core/validation/jobs`.

**Why**: the rejected alternative was a standalone command app carrying job business logic in the application layer. Jobs are debuggable entrypoints over phase-owned workflow code, so workflow behavior stays with the phase that owns it and the dispatcher stays a thin routing table.

**Applies to**: apps/server/src/application/jobs, apps/server/src/core/cycle-runtime/phases, apps/server/src/core/knowledge/jobs, apps/server/src/core/knowledge-v2, apps/server/src/core/validation/jobs — including every future job: register the command in the dispatcher, implement it in the owning slice.



# docs/20-implementation/30-knowledge

How the knowledge code is organized. The V2 store and everything that reads or writes it live in one slice, apps/server/src/core/knowledge-v2; the legacy code graph and learnings ledger remain in apps/server/src/core/knowledge until their readers move. Game-owned data lives under games/melee/knowledge.

## Governed By

- Knowledge System: the tables, sources, pathways, and worker surfaces this code implements.

- Record Contracts: the load-bearing schema.

- Agents: the three knowledge agents the librarian and summarizer modules invoke.

## Modules

| Module | Owns | Entry points |
| --- | --- | --- |
| storage | DDL, ordered migrations, the store handle, immediate transactions with busy retry | openKnowledgeStore, runKnowledgeStorageMigrations |
| records | Insert and update helpers per table; writeFactWithEvidence, insertLink, admitCuratedEntity, mergeEntities, claim and complete for index_task, stampSubjectIndexed | records/index.ts |
| views | knowledgeRecord, targetLedger, unitView as TypeScript queries | views/index.ts |
| locator | parseLocator and formatLocator for the five schemes | locator.ts |
| ingest | Importers, report reconciliation, entity extraction, legacy-ledger classification | kg2-ingest --lane |
| index | knowledge-index.sqlite: FTS builders, chunker, embedding provider and indexer, rebuild | kg2-index |
| migration/prioritize | The backfill ranking | kg2-prioritize |
| apply | applyLibrarianPass and resolveCitation: the only write path for facts, evidence, links, curated entities | apply/index.ts |
| librarian | Queue consumer, lanes, per-pathway context, the run-loop lane | kg2-librarian, --librarian-consumer |
| backfill | Target-driven runner and its context | kg2-backfill |
| summarizer-job, renarrate | The worker_summary job, transcript condensing, historical renarration | --worker-summary, kg2-renarrate |
| card | The worker target card | loadV2TargetCard |
| tools | The eight kv2 tools, wrapped in core/tools/wrappers/knowledge-v2.ts | tools.ts |

## Decisions

**Decision**: storage/ddl.ts is the schema of record and migrations are ordered and validated against the applied bookkeeping at open; the drizzle mirror in storage/schema.ts is a typed convenience and may lag. **Why**: a hand-written DDL with CHECK constraints (XOR subjects, digest-with-code, one live fact per subject and type) carries invariants the ORM cannot express. **Applies to**: every future table or index: add it to the DDL and a numbered migration first.

**Decision**: apply is the only module that writes fact, evidence, link, or curated entity rows, and it takes a proposal envelope, never an open handle to the model. **Why**: one validator, one place for scope, citation, and overwrite rules; the legacy system had several. **Applies to**: librarian, backfill, and any future knowledge writer.

**Decision**: the index database is derived and disposable; nothing reads it as truth and every build is a full replacement per table. **Why**: search quality changes with chunking and models; a rebuild must be free. **Applies to**: index/*.

**Decision**: knowledge jobs are CLIs inside their owning module, dispatched by the application job runner as kg2-*. **Why**: the dispatcher stays a routing table and each job's flags live beside the code they drive. **Applies to**: every future knowledge job.

**Decision**: the legacy slice keeps only what still has readers: the code graph and its builders (worker and librarian graph tools, kg-* jobs), the learnings ledger (ledger_search, the summarizer's transcript loader, the dashboard route), and standards. Nothing new is added there. **Why**: the worker profile has not moved yet; deleting the graph would take four worker tools with it. **Applies to**: apps/server/src/core/knowledge; its exit is tracked in the knowledge worklist.



# docs/20-implementation/40-state

State persistence code for the harness. The state model — composition, authority, records, events — is owned outright by design; this area records only structural decisions about where state code lives and who may write it.

Sources: apps/server/src/core/harness-state, apps/server/src/core/orchestrator-state, apps/server/src/infrastructure/persistence.

## Governed by

- Harness — owns the state model: composition, dispatch authority, Operator Actions, Durable Records, game events, and the event handshake.

## Decisions

One authority path governs state writes: canonical orchestrator state and server-owned action authority project into one `HarnessStateView`, and nothing outside that authority path may write state.

**Decision**: `HarnessStateView` is assembled in one server-side builder from the canonical stores at one coherent game revision, returning summaries rather than storage rows; API routes return that DTO without composing state themselves.

**Why**: the rejected alternative was routes or clients assembling views from raw tables, which would spread the read model across handlers and let authority drift into route code.

**Applies to**: apps/server/src/application/dashboard/read-model.ts — including every future state surface: new state joins the builder, not a route handler.

**Decision**: every operator action is projected server-side against the design `ActionProjection` contract, and routes re-evaluate guards against current state at execution time — a stale client projection can never authorize a transition.

**Why**: the rejected alternative was trusting the projection the client last fetched, which turns a read-model snapshot into write authority.

**Applies to**: apps/server/src/application/dashboard and every route that executes an action — including every future action added to the contract.

**Decision**: cycle and knowledge routes implement the design dispatch-authority contract instead of creating parallel authority — guarded dispatch and checkout-mutation commands carry the current lease fencing token, and state plus accepted events persist before the view changes. Background-safe worker evidence through the knowledge sink is the one exempt path because it neither dispatches a worker nor mutates checkout state.

**Why**: the rejected alternative was route-local dispatch checks, which would fork authority per route and let two workflows mutate the same checkout.

**Applies to**: apps/server/src/core/cycle-runtime/dispatch-guard.ts, apps/server/src/core/harness-state — including every future execution class, which follows its sync or PR authority boundary and enters knowledge work through Librarian Pathways.



# docs/20-implementation/50-tools/10-checkdiff

Compiles the target's translation unit with the exact MWCC rule from `build.ninja` and runs a focused checkdiff for one or more functions, returning bounded JSON evidence. It is the primary proof surface for whether a source-edit attempt improved or regressed a match, and it blocks on failure.

- **Inputs** — a target function (and its translation unit) in the current game checkout.

- **Outputs** — compile status, PASS/FAIL checkdiff summary, first mismatch, and match percent, with command and stderr preserved.

Workers reach for it as part of attempt evaluation, when a concrete source edit needs compile and checkdiff feedback — not as a mandatory step after every small edit.

Source: toolpacks/gamecube-decomp/validation/checkdiff.



# docs/20-implementation/50-tools/15-objdiff-score

Scores an already-built candidate object against the target object for one function using objdiff's own score breakdown. It complements Checkdiff when direct MWCC compilation, permutation, or a custom build has already produced a `.o` file.

- **Inputs** — the path to an existing candidate object plus the target function.

- **Outputs** — candidate score, percent diff, and a mismatch breakdown.

Workers reach for it when a candidate object already exists and a focused score decides whether to keep or discard a source-shape hypothesis. For normal source-edit validation, checkdiff comes first.

Source: toolpacks/gamecube-decomp/validation/objdiff_score.



# docs/20-implementation/50-tools/20-ghidra

Ghidra-derived cross-reference evidence generator. A headless Ghidra project exports symbol, address, and reference rows from the game binary as a maintenance input to the knowledge graph — it is not a separate worker lookup surface.

- **Inputs** — the game binary, analyzed through a headless Ghidra project during a maintenance refresh.

- **Outputs** — xref rows plus graph call and data-reference edges, ingested into the knowledge graph on rebuild.

Evidence is refreshed as maintenance when a binary-derived clue needs independent corroboration; workers consume the results through `knowledge_graph_search`, `graph_related_functions`, and `code_graph_file_card`.

Source: toolpacks/gamecube-decomp/research/ghidra.



# docs/20-implementation/50-tools/25-opseq

Opcode-sequence evidence generator that links similar matched and unmatched functions. It extracts one normalized opcode fingerprint per function from the build's assembly and persists fingerprints plus top-K neighbor evidence, so an already-matched analog can explain the source shape of an unmatched function.

- **Inputs** — per-function assembly from the game build tree, parsed during a maintenance refresh.

- **Outputs** — analog edges, opcode fingerprints, and function-shape rows for the knowledge graph.

Evidence is refreshed as maintenance when a local analog could explain source shape or the matching strategy is unclear; workers retrieve analogs through `graph_related_functions`, `knowledge_graph_search`, and `code_graph_file_card`.

Source: toolpacks/gamecube-decomp/research/opseq.



# docs/20-implementation/50-tools/30-mismatch-db

Objdiff evidence generator for graph-owned mismatch patterns, source-shape fixes, and last-mile matching tactics. It picks imperfect functions from the build report, diffs them with `objdiff-cli`, and records what the mismatch symptoms look like and which tactics resolve them.

- **Inputs** — imperfect functions from the build's match report, diffed during a maintenance refresh.

- **Outputs** — mismatch patterns, source-shape tactics, and known negative evidence for the knowledge graph.

Evidence is refreshed as maintenance when the first mismatch is known but the fix is unclear; workers retrieve patterns through `knowledge_graph_search` and linked file evidence through `code_graph_file_card`.

Source: toolpacks/gamecube-decomp/research/mismatch_db.



# docs/20-implementation/50-tools/35-callgraph

Extracts binary-ground-truth caller/callee and data-reference relationships from the build's assembly, joining each caller to unit, source path, address, and fuzzy-match metadata from the build report. The result is deterministic JSONL evidence for knowledge-graph ingestion.

- **Inputs** — the game build's assembly plus its match report, parsed during a maintenance refresh.

- **Outputs** — call edges and data-reference edges (classified as function pointer or data), each with call counts and first assembly evidence.

Evidence is refreshed as maintenance when callers, callees, or data xrefs are needed or a function's role is unknown; workers query the ingested relationships through `graph_related_functions` and `code_graph_file_card`.

Source: toolpacks/gamecube-decomp/research/callgraph.



# docs/20-implementation/50-tools/40-m2c-decomp

Generates a rough C scaffold for a function's assembly through the vendored m2c fork. The scaffold is a reading aid for control flow, temporaries, and data movement — never pasted into reviewable code; names, types, fields, and structure are recovered from local source evidence instead.

- **Inputs** — one function's assembly from the current game checkout.

- **Outputs** — an m2c scaffold and a control-flow reference.

Workers reach for it on demand when function logic is unknown, asm control flow is hard to read, or an initial C scaffold would help — always naturalizing and validating before anything lands in source.

Source: toolpacks/gamecube-decomp/research/m2c_decomp.



# docs/20-implementation/50-tools/45-mwcc-debug

Probes the MWCC compiler itself for pass-level evidence: a function-filtered pcdump plus diagnose modes that explain stack/frame mismatches, register-only mismatch windows, and inline extraction boundaries. It runs an instrumented `mwcceppc_debug.exe` against a current game build tree.

- **Inputs** — a target function in a current game build tree, plus a diagnose mode (stack, regflow, inlines, or raw).

- **Outputs** — pcdump output and stack, register-flow, and inline-boundary diagnoses.

Workers reach for it when validation points to compiler-shape behavior — stack, register-flow, or inline-boundary mismatch — that local source inspection cannot explain.

Source: toolpacks/gamecube-decomp/compiler/mwcc_debug.



# docs/20-implementation/50-tools/50-type-oracle

A libclang type oracle: it parses a source file with the real `compile_commands.json` flags and maps main-file expression byte spans to clang type spellings. The oracle is source-state-specific and is rebuilt after the file changes.

- **Inputs** — a source file in the current checkout plus the expression span to resolve.

- **Outputs** — the expression's C type, its byte span, and the compile-command context used.

Workers reach for it before extracting a temporary, splitting an expression, or rewriting a pointer/value access — whenever the C type of a subexpression matters to the edit.

Source: toolpacks/gamecube-decomp/compiler/type_oracle.



# docs/20-implementation/50-tools/55-source-permuter

Bounded source-shape search over the real C translation unit: it compiles candidate permutations with the same MWCC rule as the game build and scores them through objdiff, with replay of saved recipes and compile-free mutation previews. Defaults are conservative — candidates are not applied to source, and busy permuter slots fail fast with `queue_busy` instead of blocking.

- **Inputs** — the current translation unit and target function; optionally a saved recipe to replay or mutation steps to preview.

- **Outputs** — the best candidate diff, its score delta, and a replay recipe.

Workers reach for it when a near match is stuck and a mechanical candidate search may reveal the shape. The result is a hypothesis: apply a small understood edit by hand, then verify with Checkdiff or objdiff.

Source: toolpacks/gamecube-decomp/source_editing/source_permuter.



# docs/20-implementation/50-tools/60-include-fixer

Non-mutating missing-include preview: it runs a clang syntax-only check, extracts undeclared-identifier diagnostics, searches headers for the missing declarations, and returns proposed include lines plus a unified diff. The upstream tool writes to files; this suite previews only, so workers apply the minimum justified edit themselves.

- **Inputs** — a source file in the current checkout that produced undeclared-identifier or missing-prototype diagnostics.

- **Outputs** — include candidates, the clang diagnostics, and matching header declarations.

Workers reach for it after a compile diagnostic suggests a missing declaration, reviewing the proposed headers before editing.

Source: toolpacks/gamecube-decomp/source_editing/include_fixer.



# docs/20-implementation/50-tools/65-review-lint

Decomp-specific review guardrail: it scans a file, text snippet, or the added lines of a unified diff for maintainer-rejected patterns — type-erasing pointer casts, `M2C_FIELD` residue, and multi-`Item*`/`Fighter*` helper smells. The diff-aware scan is the deterministic layer of the QA Ship Gate, with per-surface severities for worker and PR-gate scans.

- **Inputs** — a file, snippet, or unified diff, optionally with a worker or PR-gate surface selector.

- **Outputs** — review findings and risk patterns, plus an sdata2 float/double order-helper preview that mutates source only with an explicit apply flag.

Workers reach for it during attempt evaluation and before returning source edits; PR gates run the same rules pre-ship. It blocks on failure.

Source: toolpacks/gamecube-decomp/source_editing/review_lint.



# docs/20-implementation/50-tools/70-struct-infer

Traces one pointer register through a function's generated assembly and records every load and store by offset, access size, and kind, then emits a candidate C struct skeleton. The output is layout evidence, not naming proof.

- **Inputs** — a target function plus the pointer register to trace.

- **Outputs** — field offsets, access sizes, and a candidate struct skeleton, with optional verbose trace.

Workers reach for it when asm or register evidence identifies a pointer register but field offsets are unknown — a suspected missing struct field or wrong pointer type — and offsets need grounding before source edits.

Source: toolpacks/gamecube-decomp/data_conversion/struct_infer.



# docs/20-implementation/50-tools/75-item-state-table

Previews conversion of an assembly `ItemStateTable` into a C definition: it finds the owning source file from `splits.txt`, parses the assembly table, formats the C table, and reports whether an insertion point exists. The full helper can write into source; this suite previews only.

- **Inputs** — an assembly item-state-table data label in the current checkout.

- **Outputs** — a C table preview and the asm-label mapping, plus insertion-point status.

Workers reach for it when an item state table data label needs conversion to C — applying the change only after data ownership and section placement are verified.

Source: toolpacks/gamecube-decomp/data_conversion/item_state_table.



# docs/20-implementation/50-tools

Callable decomp tool capabilities and the server runtime that resolves them: reusable tool implementations in a toolpack, per-game bindings, and agent-facing wrappers that call tools by stable id.

Sources: toolpacks/gamecube-decomp, apps/server/src/core/tools, games/melee/tool-bindings.

## Governed by

- Worker Capabilities — owns which capabilities workers get and how they are used.

## Decisions

**Decision**: tool implementations — contracts, default APIs, runners, registry, shared helpers — live in a game-agnostic toolpack (`toolpacks/gamecube-decomp`, ids registered in its `registry.json`). A game opts in via `games/<id>/game.json` and owns its bindings and generated tool data. `apps/server/src/core/tools` owns only the resolver, runtime, profiles, and agent-facing wrappers — never tool implementations or a mirrored server-local resource tree. Wrappers call tools by stable id, never by physical script path.

**Why**: the rejected alternative was server-owned tool resources and game-specific helpers inside the pack; those paths are retired and the boundary is enforced by apps/server/src/core/tools/tooling-layout.test.ts. The split keeps the pack reusable across GameCube games and keeps the server game-agnostic.

**Applies to**: toolpacks (every future toolpack keeps this shape), apps/server/src/core/tools, games/melee/tool-bindings — a future tool registers an id in the toolpack registry and gains an id-based wrapper; game-specific data goes to the game's bindings and tool-data roots, never into the pack.

## Roster

Fourteen registered tool suites (`registry.json`), grouped by category — validation, research, compiler, source editing, data conversion:

- checkdiff — validation: compile the translation unit under the exact MWCC rule and run a focused checkdiff; the primary attempt-evaluation proof.

- objdiff_score — validation: score an already-built candidate object against the target with objdiff's breakdown.

- ghidra — research: headless Ghidra xref export feeding graph call and data-reference edges.

- opseq — research: opcode fingerprints linking similar matched and unmatched functions as analog evidence.

- mismatch_db — research: objdiff mismatch symptoms with source-shape tactics and known negative evidence.

- callgraph — research: binary-ground-truth call and data-reference edges extracted from build assembly.

- m2c_decomp — research: m2c scaffold generation as a control-flow reading aid, never final source.

- mwcc_debug — compiler: pcdump plus stack, register-flow, and inline-boundary diagnosis from the instrumented MWCC.

- type_oracle — compiler: libclang expression-type lookup for source spans before temporary extraction or rewrites.

- source_permuter — source editing: bounded source-shape search with objdiff scoring; non-mutating by default.

- include_fixer — source editing: missing-include proposal preview after undeclared-identifier diagnostics.

- review_lint — source editing: decomp anti-pattern scan over files, snippets, or added diff lines; the deterministic QA ship-gate layer.

- struct_infer — data conversion: pointer-register trace producing field offsets and a candidate struct skeleton.

- item_state_table — data conversion: preview of asm ItemStateTable labels as C table definitions.



# docs/20-implementation/60-ui

Structural decisions about the operator dashboard frontend — how the React app and its workspace surfaces are organized and why — so UI additions conform instead of restructuring. Behavior, state models, and operator contracts live in design.

Sources: apps/frontend.

## Governed By

- Operator Actions — owns the HarnessStateView projection, the operator action inventory, and the confirmation rules every operator surface renders.

- Workflows — owns the sync, run, and PR behavior the dashboard drives.

## Decisions

The harness state workspace hydrates the server-owned HarnessStateView and renders current authority, freshness, and operator controls without re-deriving state.

### DTO and Client Model

**Decision** — The workspace hydrates HarnessStateView as the canonical typed client snapshot — game_revision, nullable summaries, queue order, blockers, freshness, operations, recent accepted events, and action projections — and refresh replaces the snapshot coherently as one unit.

**Why** — Rejected: client types inferring action authority or lease ownership from process flags. A revision-coherent snapshot keeps the server the only source of authority.

**Applies to** — apps/frontend/src/pages/workspace/_lib, including future client-state modules added to the workspace.

### State Summary and Freshness

**Decision** — Summary surfaces render the dispatch-lease holder, queued handoffs, workflow status, blockers, active operations, recent accepted events, and knowledge-publication freshness together from the snapshot; a free lease renders as an explicit state, and a stale snapshot triggers refresh.

**Why** — Rejected: inferring a free lease from missing process data, and locally reconciling stale snapshots — both re-derive authority in the client.

**Applies to** — summary and freshness components under apps/frontend/src/pages/workspace, including future summary surfaces.

**Action controls and confirmation** — operator behavior (projected guards, expected transitions, the confirmation rule), owned by Operator Actions.

**Compatibility actions** — operator behavior (the available_actions / compatibility_actions split, canonical-only endpoint contract), owned by Operator Actions.



# docs/20-implementation/99-appendix/10-current-repo-mechanics

Current Melee repo mechanics that the orchestrator indexes or wraps.

Sources: toolpacks, apps/server/src/core/cycle-runtime/phases/running/board, apps/server/src/infrastructure/shell.

The orchestrator should index and drive the existing Melee progress pipeline. It
should not fork the compiler, report, objdiff, or progress machinery.

## Artifacts And Commands

| Artifact Or Command | Current Role | Orchestrator Use |
| --- | --- | --- |
| `config/GALE01/config.yml` | Input to DTK's DOL split; points at the original DOL, symbols, and splits. | Read-only provenance for object/unit boundaries and target addresses. |
| `python configure.py` | Generates `build.ninja`, `objdiff.json`, and compile commands. | Run during workspace/bootstrap and after source/config changes that require regeneration. |
| `python3 configure.py --require-protos --wrapper <state>/tools/wibo` | Generates the same build graph with MWCC invocations routed through wibo. | Preferred orchestrator configure command when the game workspace's state wibo is installed. |
| `configure.py` object flags | `Object(Matching, ...)` means linked from rebuilt source; `NonMatching` means diffable but not linked. | Distinguish exact code progress from linked progress. |
| `objdiff.json` | Maps units to original objects, rebuilt objects, source paths, scratch context, and completion metadata. | Primary source for unit metadata, source paths, compiler flags, and write-set derivation. |
| `build/GALE01/report.json` | Generated report with unit/function match metrics. | Main index input for target discovery, progress targets, score deltas, and regression checks. |
| `decomp-find` | Candidate ranking helper built from `report.json`. | Internal board-scan signal, not the top-level workflow. |
| `tools/table-typer dups` | Finds normalized assembly duplicate groups with matched refs and unmatched candidates. | High-confidence graph edges and duplicate-adaptation worker evidence. |
| `decomp-runs/` | Existing experiment-bundle convention. | Per-target or per-capability artifact ledger; the orchestrator DB can point into these bundles. |

## Progress Terms

| Term | Meaning |
| --- | --- |
| `fuzzy_match_percent` | Objdiff closeness; useful diagnostic telemetry but not the v1 success target. |
| `matched_code_percent` | Exact matched code bytes/functions, including inside non-linked units. |
| `complete_code_percent` | Linked progress from units marked complete/linkable through `Matching`. |
| `metadata.complete` | Generated from the source object's `Matching`/`NonMatching` state when source exists. |

## Commands To Wrap First

```sh
python3 configure.py --require-protos --wrapper games/<id>/state/tools/wibo
ninja build/GALE01/report.json
ninja progress
bun run server:job -- --game melee kg-rank-features --limit 200
build/tools/objdiff-cli diff -p . -u <unit> <symbol>
(cd tools/table-typer && go run . dups)
```

Run game checkout commands from the selected game repo and orchestrator
commands from the platform repo. Raw `--repo-root` remains available when the
game descriptor is not the desired target.

## MWCC Runner Setup

The orchestrator prefers wibo for MWCC process execution. A game-local
install at `games/<id>/state/tools/wibo` is the stable path used by managed
run-loop configure commands, worker subprocess environments, and resolver-backed
tool APIs. When that file exists on macOS or Linux, the run loop passes
`--wrapper <state>/tools/wibo` to `configure.py` and exports `MWCC_WIBO` for
worker tool calls.

Tool helpers resolve runners in this order:

1. explicit `MWCC_WIBO`;

2. `ORCH_GAME_STATE_DIR/tools/wibo` or the state wibo inferred from the

   worktree path;

1. checkout-local `build/tools/wibo` or `wibo` on `PATH`;

2. Wine as a compatibility fallback.

The runner choice should not change generated code: it only changes how the
Windows MWCC executables are launched. `build.ninja`, DTK, objdiff, compiler
flags, and target objects remain the source of truth.



# docs/20-implementation/99-appendix/20-implementation-roadmap

Original implementation plan, current status, and v1 defaults.

This document preserves the implementation plan and v1 defaults from the design
artifact while naming the current package status.

## Roadmap

| Phase | Deliverable | Current Status |
| --- | --- | --- |
| 0 | Design doc and repo survey | Preserved in the markdown docs (the original HTML design artifact has been retired). |
| 1 | Top-level orchestrator scaffold | Present under `decomp-orchestrator/`. |
| 2 | Pi agent runtime bridge | Present for dry-run and live worker/review/curation agent sessions. |
| 3 | State substrate | Present for runs, targets, epochs, target claims, worker states, checkpoints, events, cycles, and integrations. |
| 4 | Read-only indexer | Present for `report.json` and `objdiff.json` fixture/live loading; richer graph edges are future work. |
| 5 | Scheduler tick dry run | Present through deterministic `tick` and run-loop activation. |
| 6 | Prompt builder and capability templates | Present under `apps/server/src/core/agent-catalog/agents/{run,knowledge,pr}` plus agent context manifest routes. |
| 7 | One claimed worker | Present through target claims, worker state rows, and run-loop subprocess workers. |
| 8 | Score integration dry run | Represented by `regression-check`, PR promotion reports, serial worker-output integration (apply-on-accept commits; an optional merge-on-finish mode existed earlier and was removed), conflict resolution, and boundary confirmation. |
| 9 | Event-driven epoch admission loop | Present through `run-loop`; legacy scheduler aliases are removed. |
| 9.5 | Managed process lifecycle | Present through direct `run-loop` execution under the managed-process controller, with graceful signal settlement and no automatic restart. |
| 10 | Fact-aware loop | Facts are represented in state, worker-state summaries, and checkpoint evidence; reducer/fact promotion is future work. |
| 11 | Human dashboard | Present as the Bun/React UI for progress, work tables, process controls, collapsible rails, checkpointing, and PR handoff controls. |
| 12 | Run summary artifact | Partially present through checkpoint artifacts, carry-forward ledgers, regression reports, PR split plans, and smoke summary artifacts. |

## V1 Defaults

- The orchestrator lives as the platform repo, with configured games under

  `games/<id>/`.

- It is not a Codex plugin and is not hidden under `tools/` as a side utility.

- The primary objective is global `matched_code_percent`; each run's

  `goal_value` is a checkpoint/pause threshold inside the long-term movement
  toward `100%`.

- Runs are the progress boundary; epoch targets, target claims, worker states,

  and checkpoints are work units, not PR units.

- Central SQLite target claims and category-typed write sets are the worker ownership

  model.

- Worker worktrees are the normal execution path, so same-file targets can run

  concurrently while validation and integration use approved write sets.

- Write-set widening follows the necessity ladder from in-slice typing through

  config metadata, owning headers, and routed foreign-source work. Each rung
  requires evidence that the lower rung failed; recycled targets re-earn access.

- Active workers keep going after score integration; new facts/signals affect

  future target packets.

- Per-attempt compile checks follow the touched set and its immediate compile

  blast. Full build/report generation stays at the serialized epoch-boundary
  confirmation pass.

- PR handoff is operator-controlled through dashboard actions that pause intake,

  checkpoint the run, run PR QA, and build a split plan. The dashboard prepares
  artifacts but does not publish GitHub PRs.

- Crash recovery is restart-from-state: selected game checkout plus

  game-scoped SQLite and artifacts. After a hard kill prevents run-loop
  settlement, an operator runs `recover-claims` manually. Worker Pi agent
  sessions are not resumed in v1.

- Worker prompting is standardized through shared system prompts plus

  target-specific initial user context.

- Score integration is serial and evidence-producing. 

  An early --merge-on-finish flag gated immediate serial application and
  defaulted off; apply-on-accept later became the only integration model and
  the flag was removed. The epoch boundary still confirms tentative work.

- The end-of-run artifact is a PR-description-style summary, not an automatic

  PR.



# docs/20-implementation/99-appendix

This appendix preserves material that supports the implementation docs but is
not part of the live source description: the mechanics of the wrapped Melee
repo and the original phased roadmap.

## Contents

- Current repo mechanics: Melee

  report/objdiff/configure/progress surfaces that the orchestrator wraps.

- Implementation roadmap: original phases,

  current status, and v1 defaults.



# docs/20-implementation

Structural decisions about the current D-Comp Orchestrator code: how the source is organized and why, so agents adding code conform to the standardized Architecture instead of quietly restructuring it.

## Source Areas

- apps/frontend — the React/Vite operator dashboard; decisions live under UI.

- apps/server/src/core — domain logic: agent catalog, cycle runtime, knowledge, state, tools, and validation; decisions live under Agents, Knowledge, State, and Tools.

- apps/server/src/api — the HTTP route surface the dashboard and operator tooling call.

- apps/server/src/application — operator jobs and dashboard application services; decisions live under Server jobs.

- apps/server/src/infrastructure — shared mechanics: agent runtime, kernel bridge, and platform helpers; decisions live under Agent runtime.

- toolpacks/gamecube-decomp — the reusable GameCube decomp toolpack, kept separate from server-owned tool bindings; decisions live under Tools.

- games/ — game descriptors and game-local runtime workspaces at the repository root.

## Tier Contract

This tier records structural decisions so additions conform. Design owns behavior, state models, and load-bearing schemas; the code owns file-local detail; reports do not belong in the docs tree at all.

**Inclusion test**: an entry states a rule that governs code that doesn't exist yet.

Agents adding code either conform to the decisions recorded here or file a proposal to change them — never silently deviate.

The canonical implementation-layer standard lives in the docs-system repo's doc-standards section (10-system-design/10-doc-standards/60-implementation-layer in that repo).



# docs/40-new-features/10-daytona-sandbox-execution/10-execution-boundary

The sandbox is where a worker's commands run and its files live; the worker process on the orchestrator host is where the worker thinks. Every shell command, file edit, incremental build, and score executes inside the claim's sandbox, while the Pi agent session, model access, knowledge tools, and telemetry never leave the host. The routing rule is one sentence: work that needs the build tree runs in the sandbox; work that needs a knowledge corpus runs on the host.

> **decision: Decision (2026-08-13) — worker workspaces materialize inside sandboxes** — A worker workspace materializes inside the claim's sandbox from the game image plus the claim's base-revision seed, superseding the per-worker `git worktree` branched from cycle current. The isolation contract — one worker, one claim, one bounded source space — is unchanged; only the mechanism moves.

> **decision: Decision (2026-08-13) — the agent process stays host-side** — Sandboxes execute commands and hold files; the agent loop, model calls, and dispatch authority remain in the host worker process. Relocating the whole worker process into the VM is rejected for v1.

> **decision: Historical ruling (2026-08-18; superseded 2026-08-19) — run-scoped execution class** — On 2026-08-18, execution-class selection was ruled run-scoped: every worker job in a run would execute locally or every worker job would use a sandbox, with per-job mixing rejected. That ruling was superseded on 2026-08-19 by sandbox-only workers. The local worker execution class and the run-level selector are removed outright with no compatibility shim; `FakeSandboxProvider` remains the dry-run test and development surface.

### Why the Workspace Leaves the Cycle Checkout

The write-safety workspace rule already states that worker workspaces are the normal execution surface and the main checkout is the canonical integration surface; sandboxes strengthen that boundary rather than bend it:

- A sandbox-resident workspace shares nothing with the cycle checkout — no parent object database, no symlinked toolchain, no shared filesystem — so the classes of cross-worker interference the write-set machinery guards against cannot occur at the filesystem layer at all.

- The cycle operating flow container model names the kernel container as the traceable execution envelope and allows an OS container for process isolation without requiring one; the sandbox is that OS container, realized.

- The category-typed write set, the necessity ladder, and widening decisions still bound what a worker may edit; the runner enforces them against the patch the sandbox returns, exactly as it enforces them against a worktree diff.

## What Runs Where

**Host-side (unchanged by this feature)**

| Component | Why it stays |
| --- | --- |
| Run director loop, admission, epoch cycle, dispatch authority | Scheduling and the dispatch lease are harness-state concerns; a sandbox is capacity, not an actor |
| Pi agent session and model calls | codex-lb is a loopback service; moving the agent session means exposing the proxy and shipping secrets into every VM |
| Prompt assembly and corpus-backed knowledge tools (code_graph_*, past_prs_search, opseq, ghidra, mismatch_db, type_oracle, mwcc_debug_lookup) | Backed by the 1.5 GB graph store and 592 MB shared tool-data on host disk; in-process closures keep tool telemetry interception intact |
| Runner validation records, checkpoints, worker states, facts | Durable state records are runner-owned; the sandbox only executes their commands |
| Serial integration, confirmation, head lineage, save points | The cycle owns head lineage; integration commits and the epoch-close transaction never leave the host |

**Sandbox-side**

| Component | Notes |
| --- | --- |
| The worker workspace: source tree, toolchain, build state | Materialized from the game image; see Sandbox Contents |
| All bash and edit activity from the model | Routed through the exec and file APIs |
| Runner validation commands: incremental unit build and objdiff scoring | The records stay host-owned; only the command execution is remote |
| Build-coupled Python tools: checkdiff, direct compile, score candidate, source permuter, mutation preview, review lint, mwcc_debug diagnostics | Co-located with the build tree; toolpack scripts ship in the image |
| Corpus tools that also read workspace files (m2c_decompile notably) | Run sandbox-side or fetch the file first; audited per tool |

## The Bash Operations Seam

The model's `bash` tool is constructed with an injectable operations object, and that injection point is the entire integration surface for agent-driven execution:

```typescript
// kernel-pi-runner.ts — the seam
pi.registerTool(createBashToolDefinition(options.cwd, { operations: sandboxBashOperations(claim) }))
```

- A Daytona-backed `{ exec(command, cwd, options) }` implementation routes every agent shell command into the claim's sandbox with zero changes to the agent, prompt, or scheduler; the model sees identical tool semantics.

- The wrapper stays in-process on the host, so per-call tool telemetry and abort/timeout handling work exactly as they do for local execution.

- Host-side validation and configure commands funnel through the shell chokepoint (`runCommand`); the worker-scoped call sites route through the same sandbox exec path.

## File Tools Against a Remote Workspace

The sandbox holds the only copy of the workspace, so every file-touching tool crosses the wire, each call one HTTPS round trip against multi-second model turns:

| Tool | Sandbox-backed implementation |
| --- | --- |
| bash | operations.exec into the claim's sandbox exec session |
| read | file download from the workspace path |
| edit | download, exact-string replace host-side, upload — or a one-round-trip edit-applier script shipped in the image |
| grep / glob | ripgrep and find executed inside the sandbox |
| write | disabled for workers; stays disabled |

Built-ins that cannot be redirected are excluded (`excludeBuiltinTools`, the mechanism that disables `write` for workers) and replaced by sandbox-backed registrations under the same tool names. A host-side read cache invalidated on any write or exec is the escape hatch if read-heavy loops dominate latency traces.

> **proposal: Named deviation — whole-worker relocation, rejected for v1** — Running the worker process itself inside the VM would require kernel database reachability, a routable model proxy, plaintext secrets in every sandbox, vendoring the out-of-tree agent-kernel packages, and would sever in-process tool telemetry. It remains a possible later phase, not a v1 option.



# docs/40-new-features/10-daytona-sandbox-execution/20-sandbox-contents

A sandbox's contents come in three layers: the game image baked once and shared by every sandbox, a per-claim seed pushed during worker-task construction, and the command and artifact traffic of the run itself. This is also a data boundary: no model access, knowledge corpora such as ai_docs, secrets, or orchestrator state enter the image, seed, or run traffic.

> **status: Image authority and accepted build** — The acceptance manifest at `toolpacks/gamecube-decomp/_impl/gamecube/sandbox-image/MANIFEST.md` governs image contents. The bundle builder sources repository assets under `games/melee/...`, and `build_image_bundle.sh` installs the Linux musl score server from `games/melee/state/tools/objdiff-cli-3.6.1-score/objdiff-cli-linux-x86_64`; the committed score-server patch is stored beside that binary.

## Layer 1 — the Game Image

```
image-tools/  # MWCC cache installer and shim copied from the build-coupled GameCube toolpack
melee/  # depth-1 shallow clone at the baked revision with real commit SHAs; full history stays on the host
├── build/
│   ├── GALE01/  # fully built Linux tree: build.ninja, every object, report.json — 125 MB
│   ├── binutils/  # Linux gc-wii-binutils, 51 MB
│   ├── compilers/  # MWCC, 166 MB, real files
│   ├── mwcc-objcache/  # baked-warm MWCC cache on sandbox-local disk; this directory lives and dies with the sandbox
│   └── tools/  # Linux dtk, the patched objdiff-cli 3.6.1 musl score-server build, sjiswrap.exe, and optimized wibo 1.2.0-opt1 static i686 — never the configure.py 0.7.0 download
├── config/  # 3.8 MB
└── src/  # source tree, 21 MB
provenance/  # baked-revision record plus wibo and objdiff build provenance, patch documentation, and Linux artifact
```

The image is configured and fully built at bake time — MANIFEST.md requires the Linux tree built through `ninja build/GALE01/report.json` and the all-object target before the snapshot is accepted — so a worker's first unit build is incremental rather than a cold configure. That full build also pre-populates `MWCC_CACHE_DIR` on sandbox-local disk; the persistent-volume plan is excluded because S3-FUSE latency is unacceptable on the compile hot path. The bundle builder omits `ai_docs/`, harness build debris, `.venv/`, and `.cache/`, reducing the measured payload from 5.39 GiB to 0.70 GiB. Repository-side image inputs use `games/melee/...`; the objdiff activation README names `ORCH_GAME_STATE_DIR` as the state-root override.

## Layer 2 — the Per-Claim Seed

Worker-task provisioning pushes the claim's revision delta and report artifacts after the synchronous claim transaction has returned. The accepted image repository is a depth-1 shallow clone at the baked revision with real SHAs, so the validated seed path is:

```process-outline
Upload the base-revision delta: a git bundle of commits between the image's baked revision and the claim's base revision
     > the image clone's real baked SHA accepts this fetch cleanly; the baked-rev..claim-base-rev path was validated
Fetch the bundle into the image's shallow repository and check out the claim base revision detached inside the workspace
Seed report artifacts: report.json (3.4 MB), baseline.json (3.4 MB), report_changes.json (4 KB)
Apply per-session environment: canonical tool paths and PATH, carried by exec sessions rather than baked
```

## Layer 3 — Run Traffic

- Inbound, every agent tool call and runner validation command arrives as an exec or file-API call; the prompt and the model never touch the sandbox.

- Outbound, command output streams back per call, objdiff verdicts return per attempt, and claim settlement downloads the selected checkpoint's patch and validation artifacts; the workspace itself is never copied out.



# docs/40-new-features/10-daytona-sandbox-execution/30-lease-claims-and-lifecycle

Authority reaches a sandbox through the same two-level structure the Dispatch Authority and Handoffs defines: the dispatch lease grants the Run Workflow the right to dispatch worker agents and mutate its allowed checkout surfaces. Within that authority, the unified queue's `ClaimToken` leases the worker job execution while the target claim owns the target. The sandbox binds to both records but adds no authority of its own: it is capacity driven by the host actor through the same job fence used for every guarded write.

> **decision: Decision (2026-08-18) — provisioning follows transactional claim creation** — Queue-job acquisition, target-claim creation or recycling, worker-state creation, and job-payload attachment run synchronously inside one immediateTransaction, which cannot perform remote provisioning. After that transaction returns a current ClaimToken, buildWorkerTask provisions the sandbox, stamps its bindings, seeds the workspace, persists sandbox_id on the job payload, and only then launches the local worker child. The sandbox remains logically one-to-one with that claimed worker execution even though creation is deliberately outside the claim transaction.

> **decision: Decision 7 (2026-08-18) — always-run v1, no warm pool** — Sandboxes are provisioned on demand in buildWorkerTask and remain started for the claim's lifetime in v1. Platform inactivity auto-stop is disabled and the wall-clock TTL remains the abandonment backstop. Warm pools are rejected because their claim restrictions exclude per-claim configuration; stop-while-thinking is a named follow-up backed by the measured wake latency, not part of the shipped lifecycle.

### How the Lease Reaches Sandbox Execution

The lease is enforced by fencing, not trust. Every guarded job mutation presents the current `ClaimToken`, whose job id, kind, and lease id must still match a jobs row with an unexpired lease. Sandbox orphan classification reuses that exact predicate rather than maintaining a second interpretation of liveness:

- The host worker process is the presenting actor — it carries the job ClaimToken, owns the target claim, and drives the sandbox as its execution surface; the sandbox itself never issues commands against Harness State.

- Provisioning stamps all eight durable identifiers as labels: game_id, run_id, claim_id, job_id, job_lease_id, dispatch_lease_id, worker_state_id, and trace_id. Reconciliation can therefore recover every authority and trace binding without consulting process memory.

- The authoritative orphan test is the labeled job_lease_id matched against the jobs row's current unexpired lease. core/job-queue/kernel.ts exports isCurrentClaimToken as the shared write-fence predicate, and sandbox-lifecycle.ts reuses it; a mismatch, missing job, or expired lease makes the sandbox an orphan.

**SandboxLabels**

```
game_id: GameId
run_id: RunId  # Owning run workflow.
claim_id: ClaimId  # The target claim this sandbox executes for; exactly one sandbox per active claim.
job_id: JobId  # Worker job whose claimed execution owns the sandbox.
job_lease_id: LeaseId  # ClaimToken leaseId; it must match the jobs row's current unexpired lease.
dispatch_lease_id: LeaseId  # Run dispatch lease used as a secondary startup-reconciliation check.
worker_state_id: WorkerStateId
trace_id: TraceId  # Root trace of the worker state; ties sandbox operations into the tracing fabric.
```

```json
{
  "game_id": "melee",
  "run_id": "run-91",
  "claim_id": "claim-4c21",
  "job_id": "job-2d19",
  "job_lease_id": "job-lease-7f3a",
  "dispatch_lease_id": "dispatch-lease-81ce",
  "worker_state_id": "ws-88d0",
  "trace_id": "trace-2b41"
}
```

### Teardown at Settlement, Queue Reap, and Startup

Sandbox deletion rides three shipped lifecycle paths so normal completion, expired queue ownership, and process restart all converge on the same cleanup invariant:

- Settlement resolves the completed or cancelled job's persisted `sandbox_id` and deletes that sandbox with reason settlement.

- The queue reap lane in reapWorkerJobs deletes the persisted sandbox for every expired worker-job lease with reason reap, then recovers the corresponding active target claim.

- Startup reconciliation lists sandboxes by game label and retains one only when the shared ClaimToken predicate passes, the job payload points back to that sandbox and claim, the run dispatch lease is active, and the target claim is active. Everything else is deleted with reason reconciliation; the platform TTL remains the backstop below all three paths.

> **status: Shipped and live-verified (2026-08-18) — all three teardown paths** — Settlement, reapWorkerJobs, and startup reconciliation are shipped and live-verified through the provider seam. The PoC specifically observed settlement deletion and then swept a real orphan from a failed provisioning run at the next run-loop startup, leaving the remote sandbox list empty.

### Always-Run v1 and Deferred Idling

The shipped v1 lifecycle keeps a provisioned sandbox started while its claim is active. This favors the simplest failure and TTL semantics for the first live path; the host worker still knows when a model turn begins and when the next tool call needs execution, so idling remains a contained future optimization.

```process-outline
buildWorkerTask provisions and starts the sandbox after transactional claim creation
Model turns and tool-call bursts run against the same started sandbox for the whole active claim
     > platform inactivity auto-stop remains disabled, so a silent model turn cannot interrupt a build
Settlement, queue reap, or startup reconciliation deletes the sandbox; wall-clock TTL backstops abandonment
```

- Phase 1 measured 0.78–0.86 seconds from start request to the first successful exec across three stop/start trials on a real runner. That cost is low enough to justify a stop-while-thinking objective, but the measurement does not alter the always-run v1 contract.

- The follow-up owns the transition points — stop when a model turn starts and start before the next tool call — together with in-flight command safety, claim TTL interaction, and the provider's stopped-versus-running billing semantics.

- Warm pooling remains out of scope: workspace state is claim-specific, and the measured sub-second wake makes preserving each claim's own stopped sandbox the relevant optimization.



# docs/40-new-features/10-daytona-sandbox-execution/40-evidence-and-integration

Everything a sandbox produces is immutable result evidence; canonical state advances only on the host. Worker results follow two paths, both unchanged by where execution happens: checkpoints enter host-side serial integration toward the cycle's head lineage, and completed worker evidence flows into the knowledge queue as the one always-on background input. No sandbox mounts, clones from, or writes to the cycle worktree at any point.

## The Checkpoint Path

Runner validation keeps its authority and moves only its command execution:

- Each attempt's unit build and objdiff score run inside the sandbox, but the checkpoint row, its validation state, and best-checkpoint selection are runner-owned records in durable state, exactly as the worker lifecycle defines them.

- Claim settlement downloads the selected checkpoint's patch and validation artifacts; the patch is the only form in which sandbox work approaches source truth.

- Serial integration applies and commits that patch host-side into current cycle ancestry immediately on acceptance, as a tentative change — with conflicts routed to the integration-resolver agent and confirmation reserved for the epoch boundary's global comparison, per the Run Loop.

- The pending-integration protocol (run state) is untouched: the Git commit boundary and the epoch-close transaction it protects never leave the host, so sandbox execution adds no new crash window to it.

The write-set contract survives the wire: edited paths in the returned patch must stay inside the claim's category-typed write set, and out-of-write-set paths carry categorized repair reasons — the runner enforces this against the patch as it does against a local diff.

## The Knowledge Path

Completed worker evidence is the only always-on knowledge input, and sandboxes change nothing about its class:

- Worker-result evidence enters the knowledge queue background-safe — it consumes immutable evidence, never dispatches workers, and never touches the checkout — so ingestion continues regardless of which workflow holds the dispatch lease.

- A serialized materializer publishes provenance-tagged knowledge; the worker packet's recorded knowledge revision, which scheduler decisions and packets already carry, is unaffected by execution location.

- Every other knowledge source still stages for the operator-initiated sync; sandbox outputs never ride that path.



# docs/40-new-features/10-daytona-sandbox-execution/50-events-and-tracing

Sandbox activity lands in the same tracing fabric as everything else because it introduces no new identity: sandbox operations run under the worker's existing trace anchor, and durable facts keep flowing through the events the Tracing already defines. Durable lifecycle facts are recorded as sandbox.created and sandbox.deleted game events beside the job.* family, while individual remote operations remain spans under the worker trace. A kernel container remains the traceable execution envelope around the prompt, tools, agent session, and artifacts; the sandbox is the OS container inside that envelope, not a second trace subject.

## Durable Lifecycle Events and Operation Spans

Decision 8, operator-locked on 2026-08-18, replaces the earlier no-new-event-kinds ruling with two durable sandbox lifecycle events. They use the existing game-event envelope and trace identity rather than inventing a parallel event system:

- Every exec or file transfer executes under the owning worker job's `trace_id` with its own span. Per-operation exec and file-transfer latency therefore remains trace data, preserving the timing and failure attribution model used by other tools; lifecycle durability comes from the created/deleted events.

- `correlation_id` follows the durable caller: provisioning uses the worker job, settlement and reap prefer the owning run, and reconciliation recovers the run from labels or state. `causation_id` names the job or event that caused the lifecycle action. The sandbox contributes no process-local lineage of its own.

- `sandbox.created` records the provisioned sandbox and resource class; `sandbox.deleted` records deletion with exactly one reason — `settlement | reap | reconciliation | provision_failure`. Provisioning also persists `sandbox_id` on the owning job payload through `attachJobPayload`, giving settlement and recovery a durable lookup even when process memory is gone.

> **decision: Decision 8 (operator-locked 2026-08-18) — mint sandbox lifecycle events** — sandbox.created and sandbox.deleted are durable game events with sandbox subjects, emitted beside the job.* family because remote capacity must remain reconstructable after a process crash. Exec and file-transfer timings remain operation spans; event durability is reserved for the created/deleted lifecycle boundary.



# docs/40-new-features/10-daytona-sandbox-execution/60-scale-and-cost

The run director's three capacity controls — worker pool, epoch ready queue, and tool/build slots — survive sandboxes intact; what changes is the mechanism behind the third and the resource the first is bounded by. Worker pool size remains the claim target and becomes a platform quota question, and compile pressure moves from shared-filesystem slot directories to orchestrator-owned admission plus per-sandbox vCPU.

> **decision: Decision (2026-08-13) — compile admission is orchestrator-owned** — Fleet-wide compile and tool admission is enforced by the orchestrator's global jobserver behind `ORCH_GLOBAL_COMPILE_SLOTS`, sized to sandbox vCPU. Per-epoch filesystem slot directories retire with the shared filesystem: on per-VM disks they are silently per-sandbox and enforce nothing fleet-wide.

## Sizing for 64 Concurrent Workers

| Per-sandbox | 64 sandboxes | Tier |
| --- | --- | --- |
| 1 vCPU / 2 GiB / 4 GiB disk | 64 vCPU / 128 GiB / 256 GiB | Tier 2 (100 vCPU) — fits but thin |
| 2 vCPU / 4 GiB / 5 GiB disk — recommended | 128 vCPU / 256 GiB / 320 GiB | Tier 3 (250 vCPU); Tier 2 suffices with stop-while-thinking, since only running sandboxes hold vCPU quota |
| 4 vCPU / 8 GiB / 8 GiB disk | 256 vCPU / 512 GiB / 512 GiB | Tier 4 or bring-your-own-compute |

- Two vCPU per sandbox matches the hot path — single-unit incremental compiles — with only the permuter wanting more cores; creation rate limits are a non-issue at 64, and bring-your-own-compute removes the quota ceiling past roughly 120.

- Stopped sandboxes hold disk quota until archived: 64 at 5 GiB is 320 GiB, just over Tier 2's 300 GiB, so either 4 GiB per sandbox or Tier 3.

## Idle Economics

At roughly a quarter active duty cycle — minutes of model reasoning between tool-call bursts — the lifecycle strategy dominates the bill:

| Strategy | Compute billed | Added latency | Verdict |
| --- | --- | --- | --- |
| Always running for the claim's lifetime | 128 vCPU continuously | none | pays roughly fourfold for idle |
| Stop while thinking | ~32 vCPU effective | a wake of seconds after each long think | adopted; see Lease, Claims, and Lifecycle |
| Fresh sandbox per tool call | low idle, high churn | boot, seed, and patch replay on every call | rejected; loses workspace and incremental build state |

## Host Footprint

| Per worker | Worktree-based execution | Sandbox-based execution |
| --- | --- | --- |
| Workspace and build output | gigabytes each; the worktrees directory totals 592 GB | zero host bytes; lives and dies in the VM |
| Tool caches and permuter scratch | inside worktrees and a 190 GB state directory | zero host bytes |
| Patch, validation artifacts, logs, transcripts | megabytes | the same megabytes; evidence is all that returns |

The host retains durable shared state only: the cycle repo and control clone, the knowledge stores, and the orchestrator database. Worker-count changes stop moving host disk or CPU at all, and claim cleanup is a sandbox deletion rather than worktree hygiene.



# docs/40-new-features/10-daytona-sandbox-execution/70-proof-of-concept

The platform experiment and live-worker proof both passed on 2026-08-18. The experiment retired the runner-compatibility falsification, measured image headroom and remote-call latency, and established the wake cost; the later live claim confirmed that those platform results carry through the shipped worker, evidence, integration, and teardown seams.

## Measured Answers

1. Image headroom: 5,868,625,900 bytes uncompressed (5.87 GB), or 54.7% of the 10 GiB container cap. The accepted PoC snapshot used a configurable 10 GiB disk.

2. MWCC-under-wibo compatibility: rebuilt objects were byte-identical on real Daytona amd64 runners, including a fresh-cache translation unit. The foreign-kernel falsification is retired.

3. Exec round-trip latency: 49.5 / 69.7 / 83.3 ms minimum, p50, and maximum across 20 echo calls, low enough for the chatty worker-tool surface.

4. Stop-to-start wake: 0.86, 0.78, and 0.85 seconds from start request to first successful exec across three trials, a 0.78–0.86 second observed range.

```process-outline
Build and register the MANIFEST-governed snapshot with the Linux musl objdiff score server
     > the registered image measured 5.87 GB uncompressed and remained below the 10 GiB cap
Run the platform round trip: create, seed by git bundle, rebuild under MWCC/wibo, score, download evidence, stop/start, and delete
     > object identity, exec RTT, and three wake trials all passed on a real runner
Run a real sandbox-class worker claim through validation, repair, checkpoint selection, integration, knowledge jobs, and settlement
Exercise startup reconciliation and mid-claim sandbox loss, then assert the provider's labeled sandbox list is empty
```

## Resolved Questions and Runbook Boundaries

1. Canonical tool verification runs in-sandbox during provisioning and is shipped. Host-side stat checks do not decide whether a remote tool path is usable.

2. m2c_decompile is shipped as fetch-first: symbol discovery runs in-sandbox, then only the matched object, corresponding assembly, and generated build/ctx.c cross into a host temporary mirror for the corpus-backed tool.

3. Snapshot runbook: Daytona snapshots deactivate after two weeks without use. melee-sandbox-poc-20260818 is ACTIVE as of 2026-08-18; before phase-3-style use after more than two idle weeks, confirm its state and reactivate or re-push it.

4. Epoch-boundary full-report generation remains host-side unchanged. Moving that report build into a larger sandbox is outside the worker-path implementation.

5. Stale-lease semantics are inherited unchanged: a stale ClaimToken remains fatal at the existing job write fence, and the sandbox layer adds no retry or alternate authority protocol.



# docs/40-new-features/10-daytona-sandbox-execution

Worker execution moves into per-worker Daytona micro-VM sandboxes: every shell command, file edit, build, and score a worker performs runs inside a sandbox bound to its target claim, while the agent loop, knowledge tools, telemetry, and all dispatch authority stay on the orchestrator host. The sandbox is the OS-container realization of the worker's execution envelope that the cycle operating flow container model anticipates; authority, integration, and head lineage follow the Harness contract unchanged.

> **status: Status — phases 0–3 passed and live-verified on 2026-08-18** — Decisions are dated callouts in the child pages; image contents are governed by the acceptance manifest at `toolpacks/gamecube-decomp/_impl/gamecube/sandbox-image/MANIFEST.md`. The accepted image includes the Linux musl objdiff score server, the platform experiment passed all four measurements, and a real sandbox-class worker claim completed through evidence, integration, and teardown.

## Feature Scope

**Goals**

| Goal | Why |
| --- | --- |
| Isolate worker execution in disposable micro-VMs, one sandbox per target claim | Removes 592 GB of per-claim worktree debris and all shared-filesystem coupling from the host; scaling to 64 workers becomes a platform quota question |
| Keep every authority, integration, and evidence contract host-side and unchanged | The dispatch lease, target claims, serial integration, and the knowledge queue already define the boundaries a remote executor needs |
| Specify sandbox lifecycle in the state contract's own vocabulary | Claims, leases, events, and traces must have one definition; the sandbox binds to them rather than duplicating them |

**Non-goals**

| Non-goal | Boundary |
| --- | --- |
| Move the agent loop, model access, or knowledge corpora into sandboxes | The worker process on the host keeps the Pi session, codex-lb, graph and corpus tools, and telemetry; relocation is a named deviation, rejected in Execution Boundary |
| Change the isolation contract's semantics | One worker, one claim, one bounded source space holds; only the mechanism that materializes the workspace changes |
| Ship stop-while-thinking in v1 | Decision 7 keeps sandboxes always running for the active claim; measured sub-second wake latency feeds a named follow-up objective |

## Execution Model

```process-outline
The queue atomically acquires the worker job, creates or recycles its target claim and worker state, and returns a fenced ClaimToken; buildWorkerTask then provisions the sandbox
     > all eight job, claim, dispatch, worker-state, run, game, and trace identifiers are stamped as labels
The workspace materializes inside the sandbox from the game image plus the claim's base-revision seed (under 10 MB)
Agent turns execute in the sandbox: bash, edits, incremental builds, scoring; the host worker process carries the current job ClaimToken across every guarded mutation
The v1 sandbox remains started while its claim is active; platform inactivity auto-stop is disabled and the wall-clock TTL backstops abandonment
     > stop-while-thinking is a future objective supported by the measured 0.78–0.86 second start-to-first-exec latency
Checkpoint evidence returns to the host: runner validation records, the selected patch, facts; serial integration and the epoch boundary proceed unchanged
Settlement, the reapWorkerJobs queue lane, and startup reconciliation delete sandboxes and emit sandbox.deleted with the path-specific reason
```

## Contract Pages

Reading order:

- Execution boundary

  - What runs in the sandbox versus on the host, the bash-operations seam, file tools against a remote workspace, and the rejected whole-worker relocation.

- Sandbox contents

  - The three layers: the baked image under MANIFEST.md authority, the per-claim seed, and what flows during a run.

- Lease, claims, and lifecycle

  - How the dispatch lease, target claim, and job ClaimToken reach sandbox execution; the shared orphan predicate; three teardown paths; and always-run v1.

- Evidence and integration

  - Sandbox outputs as immutable evidence: the checkpoint path into host-side serial integration and the background knowledge path.

Continue in this order:

- Events and tracing

  - Durable sandbox.created and sandbox.deleted game events beside the job.* family, with per-operation exec and file-transfer latency retained as spans.

- Scale and cost

  - The three capacity controls under sandboxes, 64-concurrency sizing, idle economics, and the host footprint.

- Proof of concept

  - The four measured platform answers, the executed live-worker proof, resolved integration questions, and the snapshot reactivation runbook.

## Decisions

- Resolved 2026-08-13 — worker workspaces materialize inside sandboxes from the game image, superseding per-worker worktrees of the cycle checkout; see the workspace decision callout in Execution Boundary.

- Resolved 2026-08-13 — the agent process stays host-side; sandboxes execute commands and hold files only; see the boundary decision callout in Execution Boundary.

- Resolved 2026-08-18 — sandbox lifetime binds to the target claim and the worker job's fenced ClaimToken; provisioning runs in buildWorkerTask after synchronous claim acquisition; see Lease, Claims, and Lifecycle.

- Resolved 2026-08-18 — sandboxes are provisioned on demand and remain started for the active claim in v1; no warm pool; stop-while-thinking is deferred to its measured follow-up objective.

- Resolved 2026-08-13 — fleet-wide compile admission is orchestrator-owned via the global jobserver; per-epoch filesystem slot directories retire with the shared filesystem; see the admission decision callout in Scale and Cost.



# docs/40-new-features/20-stop-while-thinking

The sandbox worker fleet has one definitive runtime placement: the host-side worker agent thinks, while an isolated 2-vCPU sandbox holds the claim workspace and executes every worker command. The 2026-08-19 scale sweep reached 32 concurrent workers without provider, quota, or compile contention and measured model turns at about 90% of worker-session time. Stop-while-thinking removes active compute during that dominant idle interval; killing the sandbox at worker-state close removes the settlement tail that left finished sandboxes alive behind knowledge processing.

> **decision: Operator ruling (2026-08-19) — definitive sandbox worker placement** — Sandbox-only execution, close-time sandbox deletion, and a decoupled host-side knowledge/librarian lane form one placement contract. Stop and start govern the middle of a worker claim during model turns; host-observed worker-state close and immediate kill govern the end.

## Boundary-Owned Idling

The host-agent/remote-exec boundary owns every running-state transition. The host knows when it hands control to a model turn, and every later exec or file operation returns through its sandbox adapter under the same claim and lease lifecycle. Idling therefore belongs in the host's remote-operation gate, where one controller serializes stop, start, exec, file I/O, evidence transfer, and terminal close without giving the sandbox authority of its own.

```process-outline
A model turn begins after the preceding remote operation releases the sandbox; the host marks the sandbox idle-eligible and arms a short stop debounce
     > all exec and file surfaces share one quiescence barrier, and background processes are prohibited by design
If no remote operation arrives during the debounce, the host waits for the active-operation count to reach zero and stops the sandbox
The next exec, workspace file operation, or evidence transfer cancels a pending stop or starts a stopped sandbox and waits until it is ready
     > the measured roughly 0.85-second wake is absorbed inside normal tool-call latency
The operation runs in the same workspace under the same ClaimToken and trace identity; its result starts the next model-turn idle decision
After required per-attempt evidence is downloaded, the worker closes its worker state; the host observes close and immediately kills the sandbox
     > job settlement and knowledge processing continue on host-side lanes without retaining the sandbox
```

One serialized state controller owns the started, stopping, stopped, and starting transitions until worker-state close. The implementation wraps the five-method SandboxHandle in a serialized idle-debounce controller at its single acquisition point in the worker child, and arms stop when active operations reach zero. Rapid tool chains cancel the pending stop during the debounce window, so short model turns do not bounce the sandbox; a tool that arrives after stopping begins waits for that transition and shares the single subsequent start. Close is terminal: it transitions the controller to deleting/deleted, rejects later remote operations, and cannot race an active exec, upload, download, or workspace-file operation.

## Lifecycle and Failure Boundaries

Wake readiness and command execution use separate timeout budgets. The outer tool deadline spans both stages, while the explicit exec timeout begins only after the sandbox reports ready, so a normal wake cannot consume a command's execution allowance. Cancellation or timeout at either stage must leave the controller recoverable and close-aware rather than allowing a late start or exec to escape the claim fence.

> **decision: Decision (2026-08-19) — kill the sandbox at worker-state close** — The host kills the claim sandbox the moment the worker closes its worker state, not when the job later settles. In the 32-worker sweep, finished workers retained sandboxes while settlement queued behind knowledge processing; one librarian LLM call hung for more than 25 minutes and two completed workers' sandboxes survived until the TTL backstop.

Deletion authority remains host-consumer-side. The preferred path is for the child to signal or persist worker-state close, then for the host consumer to observe that close and immediately delete the labeled sandbox. A narrowly scoped child-initiated delete is an admissible alternative, but host-observes-close is preferred because it preserves the existing authority boundary and keeps provider deletion credentials out of the child path.

Locked Decision 6 already requires per-attempt evidence download before worker close, so nothing inside the sandbox is needed after the worker state closes. In-flight evidence remains part of the quiescence barrier and delays close until transfer completes. Queue reap and startup reconciliation continue to remove labeled sandboxes missed by the normal close observer, while the wall-clock TTL remains the abandonment and cost backstop; stopped time still advances the TTL, claim deadline, and job lease.

> **decision: Invariant — stop is live; worker-state close is terminal** — A stopped sandbox remains the live, labeled execution surface for its claim and must be retained by reconciliation until the worker state closes. At close it must be killed immediately. Unexpected disappearance or a failed wake before close follows the existing sandbox-loss and fail-safe requeue semantics; expected stopped state never satisfies the sandbox-death drill.

## Decoupled Host-Side Knowledge Lane

> **decision: Decision (2026-08-19) — librarian work never gates settlement or teardown** — Librarian condensation and knowledge absorption run in their own host-side queue/agent. They never gate worker job settlement and never retain or delay sandbox teardown.

This lane already belongs on the host and needs no sandbox tools: its capabilities are graph and ledger queries plus file writes. It may parallelize independently of worker settlement, and every librarian LLM call has a bounded timeout so a hung call cannot stall the run loop as the sweep's greater-than-25-minute call did.

## Billing Contract

| Sandbox state | vCPU and RAM | Workspace disk |
| --- | --- | --- |
| Started | billed for reserved compute | persisted and billed |
| Starting or stopping | billed as started until the transition completes | persisted and billed |
| Stopped | not billed | persists and remains billed |

Daytona's billing and persistence contract supports the optimization: reaching stopped state removes CPU and RAM billing without discarding the claim's source tree, installed tools, or incremental build state. The measured model-turn share is about 90% of worker-session time, so the saving is primarily compute during the claim's middle; close-time kill then ends both compute and workspace retention. Saved sandbox-hours count only completed stopped time and exclude stop/start transition time.

> **decision: Decision (2026-08-19) — worker execution is sandbox-only** — Sandbox execution is the only supported worker runtime. The local worker execution class is removed outright under the repository's zero-backward-compatibility convention, not deprecated and not retained behind a shim. With one execution class, the run-level selector question is void. `FakeSandboxProvider` remains the dry-run test and development surface.

Worker isolation and build capacity are per-sandbox concerns. The host-era worker mechanisms below retire from the worker path rather than surviving as alternate execution paths:

- Per-epoch `.worker-ninja-slots` directories retire entirely; there is no host-local worker slot pool to provision or clean up.

- The host compile-jobserver wrapper around worker builds retires. Each sandbox is an isolated 2-vCPU island; the jobserver remains only for host-side builds such as the epoch-boundary report build.

- `provisionWorkerWorktree` retires from the worker path; the worker workspace materializes only inside its sandbox from the image and claim seed.

- `ORCH_WORKER_TOOL_CONCURRENCY`-style knobs, orchestration-level worker tool-concurrency limits, tool-slot mechanisms such as the `.worker-tool-slots` directory scheme, and the dashboard/settings UI for per-worker tool limits are removed from the worker path. Every worker agent has its own isolated sandbox runtime, so cross-agent tool contention does not exist; inside one sandbox the agent self-governs its 2 vCPU, including ninja parallelism. Only model-side capacity through `codex-lb` and host-side lanes through the epoch-boundary build's jobserver retain shared-resource governance.

## Definitive Runtime Placement

| Placement | Lane or surface | Definitive responsibility |
| --- | --- | --- |
| Sandbox | Worker command execution + workspace only | Claim-local source tree, toolchain, and build state; every worker shell, file, edit, build, score, and workspace-coupled tool operation. |
| Host | Worker agent process | Agent/model loop, prompt and tool orchestration, telemetry, worker state, and sandbox lifecycle controller. |
| Host | Knowledge/librarian lane | Independent queue/agent for graph and ledger queries, condensation/absorption, and file writes; no sandbox tools. |
| Host | Integration | Serial evidence and patch integration, confirmation, save points, and head lineage. |
| Host | Epoch-boundary report build | The existing host-side build remains; an own-sandbox variant remains future work under Daytona sandbox-execution bundle 70. |
| Host | QA/PR lanes | Review, quality gates, pull-request preparation, and publication orchestration. |
| Host | Dashboard | Operator UI, fleet status, and control surfaces. |

## Open Questions

1. Stop debounce policy — Resolved 2026-08-19: use a 250 ms idle debounce at the SandboxHandle operation gate. A recorded-session replay of 53 sweep sessions, parameterized by a live stop/start bench (stop approximately 1.01 seconds; wake-to-first-exec approximately 1.02 seconds median), showed that inter-burst gaps never undercut 1.97 seconds. The debounce protects sequential SandboxHandle calls within one tool operation. The measured fleet result was 70.0% sandbox-cost savings at approximately 8% added wall time.

2. Measurement contract — Each worker writes per-claim sandbox_sleep_stats.json at close with stopCount, startCount, stoppedMs, and failures. Live close-to-delete measured 2–7 seconds. Validation artifacts live under objectives/sandbox-runtime-consolidation/examples/phase4 and objectives/sandbox-runtime-consolidation/examples/phase5.

3. Wake failure details — A failed start receives one bounded retry after a 25 ms delay. If that retry fails, the operation rejects and the existing fail-safe failure and requeue path handles the claim. There is no local-execution fallback.



# docs/40-new-features/30-global-flow-map/10-standing-infrastructure

Working process flow for this band of the global flow. Confirmed detail from the walkthrough accumulates here before mapping to the owning chapter.

Confirmed dispositions: server boot gets a small outline in a new server-and-global-infrastructure doc. The global compile jobserver gets an outline but no trace containers. The kernel trace tailer is outlined beside the kernel-trace-linkage doc. The managed process controller gets a full outline. The job-queue consumer gets one shared outline referenced by both run and knowledge docs. Dashboard SSE is a one-line mention, the UI hot-reload watcher is skipped, and the cycle process mirror becomes a note inside the process-controller outline.

```process-outline
> Nothing in this band emits kernel trace events of its own. The trace tailer writes trace rows for other processes' sessions, and the compile jobserver gets no trace containers at all.
Boot the server through three startup jobs in order
     -> Configure the global compile jobserver first
          > Nothing can spawn a build until this job finishes.
          -> Resolve the slot budget, or leave the jobserver off
          -> Require `ninja` 1.13 or newer for FIFO jobserver support
          -> Install the wrapper bin and bring the daemon up
          -> Merge the jobserver env into the server's own env
               > That env carries `MAKEFLAGS`, the FIFO and state paths, the real Ninja path, and a PATH with the wrapper bin in front. Every child the server spawns inherits it.
     -> Reconcile a `Sync` caught mid-`publishing`
          > The reconcile runs under a fresh startup command id, before the HTTP surface opens, so nothing else can act on the Sync first.
     -> Open the HTTP surface and stay resident
          -> Route kernel reads, then `/api/*`, then static dashboard files
          -> Start the kernel trace tailer in the background
               > A failed tailer never takes the server down.
Ration compile parallelism across every build on the machine
     > The global compile jobserver owns this rationing, machine-wide rather than per build.
     -> Run one detached daemon that owns the token FIFO
          -> Create the FIFO, write one token per slot, record `state.json`
               > Each wrapper's token also covers Ninja's implicit job slot.
          -> Serialize starters on `start.lock` so only one daemon spawns
          -> Replace a stale state file: dead pid or missing FIFO
          -> Error out when a live daemon holds a different slot count
               > The daemon is not restarted, because builds may be in flight against it.
          -> Clean up the FIFO and state file on shutdown
     -> Route every `ninja` invocation through the wrapper
          > The wrapper bin leads PATH, so every invocation lands on the wrapper.
          -> Wait on the FIFO for a token, aborting if the daemon dies
          -> Spawn the real Ninja with `MAKEFLAGS`, a clean PATH, and no `-jN`
               > The child then sees the jobserver rather than the wrapper, and honors it instead of its own parallelism. Serial `-j1` survives.
          -> Return the token and exit with the child's code
Stream Pi session transcripts into the kernel trace database
     > The kernel trace tailer owns this ingest path.
     -> Start the tailer with its cursors, timers, and directory watcher
     -> Tail every `.jsonl` under the Pi sessions directory
          -> Open each reader at its snapshot offset and read the backlog
          -> Create readers for new files, re-read known ones on their events
     -> For each event a reader emits, run that file's mapper
          -> Map Pi events into kernel trace events
          -> Fold each event into the file's accumulated state
               > State binds Pi session uuid, Container, phase, agent name, parent run, and run number, and accumulates token counters and a cost estimate.
          -> Move status on lifecycle markers, and record subagent links
          -> Stamp mapped events with Container id, Agent Run id, and session uuid
     -> Buffer mapped events and flush them in batches
          -> Upsert the batch's Pi sessions, Containers, and Agent Runs first
          -> Pause the watcher at max buffer, resume below half
          -> Retry a failing insert, then split the batch to isolate the bad event
               > Backoff is exponential and capped. Once the retry budget is spent the batch halves until one event isolates, and that event is logged and dropped.
     -> Write the cursor snapshot atomically on the timer and at shutdown
          > A restart resumes each file where ingest stopped instead of re-reading it.
Manage the Run Loop child process
     > The managed process controller starts, stops, and reaps this child.
     -> `POST /api/process/start` launches the Run Loop
          -> Return blockers when the Run, its inputs, or the options conflict
          -> Run startup repair: pending integrations, Run status versus lease
          -> Activate a ready or active Run under a dispatch lease
          -> Spawn the child detached with the lease id on its argv
          -> Record pid, process group, and kill command in a pid file
               > The exit handler writes exit code, signal, and end time back into that pid file.
          -> Mark the Run failed and release the lease when the spawn throws
     -> `POST /api/process/stop` tears the Run Loop down
          -> Send `SIGTERM` to the process group, `SIGKILL` after 35 seconds
               > An orphan pid file from an earlier server life goes the same way. Liveness comes from probing the saved process group, not an in-memory child handle.
          -> Report `not_running` and skip recovery when the process group is already gone
          -> Run `recover-claims` once the process is down, unless opted out
               > Job claims held by dead `Worker` processes release back to the queue.
     -> Rescan the pid-file directory on every status read
          > Probing every recorded process group means a dead process surfaces as not-alive, so no separate reaper loop is needed.
     > Every one of these transitions also lands on CycleState. The cycle process mirror resolves the game's active cycle, creates it on first spawn, advances a preparing cycle through to running, and stores the process snapshot on the cycle record.
Claim and execute queued jobs under leases
     > The job-queue consumer owns this loop. `Run Loop` runs one for `Worker` jobs and `Knowledge background service` one for knowledge jobs, the same machinery under different descriptors.
     -> Repeat a tick every second until the consumer stops
          > Ticks never overlap; one runs at a time.
          -> Skip the tick when the claim gate says no
               > The `Worker` consumer gates on the iteration limit, a blocked dispatch lease, and a paused Epoch.
          -> While under the concurrency limit, claim jobs until none are eligible
          -> Run inline jobs through their handler and settle on the result
               > A completion write whose claim is gone reports as a failure.
          -> Send dispatched jobs out to an executor
               -> Build and submit the task, then mark the job running
               -> Repeat the poll cycle until the task reports exited
                    > Each cycle polls the executor, runs the descriptor's poll hook, heartbeats the claim to renew its lease, then waits an interval.
               -> Stop tracking a job whose heartbeat no longer owns the claim
               -> Complete on exit code 0, fail on anything else with backoff
     -> Stop the consumer: clear the timer, drain the tick, let jobs finish
          -> `cancelAll` cancels every dispatched task first
```



# docs/40-new-features/30-global-flow-map/20-registration-and-cycle

Working process flow for this band of the global flow. Confirmed detail from the walkthrough accumulates here before mapping to the owning chapter.

```process-outline
Register a game
     > Registration is descriptor resolution. `resolveGame` reads files and returns a value; nothing is activated and nothing is written.
     -> Resolve the game id from the argument, `defaultGame`, or the sole directory
     -> Fail when several candidates exist with no default
     -> Read `games/<id>/game.json`, requiring its `id` to match the directory
     -> Layer `local.game.json`, then explicit path overrides
     -> Resolve `repoRoot`, `stateDir`, `graphDb`, and `localEnv` against the game directory
     -> Fill the validation, dashboard, PR, knowledge, and sandbox blocks
     -> Warn for each missing path, then return the descriptor anyway
     -> `For each` descriptor under `games/`, return a `listGames` summary
     > The documented four-stage activation process does not exist in code; registration is pure descriptor resolution, and a missing checkout surfaces as a warning rather than a blocker (bug catalog)
Open a Cycle
     -> `Operator` posts `POST /api/cycle/new`
     -> Answer 409 with the existing Cycle when one is live
     > Live means status `active`, `blocked`, or `closing`. A second open never creates a Cycle.
     -> `createNewCycle` writes the record and its opening event atomically
     -> Start `active` and `preparing` at revision 0, head from base sha
     => Emit `cycle.opened` with baseline, head, worktree, and Sync id
     -> Write the event id back as `caused_by_event_id`
     -> `ensureCycle` hands back the existing Cycle instead of a second
     > Documented open-gate semantics: every prior Cycle is closed, the canonical worktree is provisioned, and the immutable baseline and `head_revision` name the same source boundary.
Prepare the Cycle
     => Open the `Prepare` container under the Cycle container
     => Hold phase `preparing`, stepping subphases `config`, `sync_intake`, `processing_prs`, `knowledge_refresh`, `baseline`, `ready`
     > Every subphase update is status-preserving.
     -> Provision the `upstream_current` and cycle-branch worktrees at the cycle sha
     -> Stop the subphase when a registered path is not a usable worktree
     -> Record a step per git invocation, revalidating the dispatch lease between them
     -> Link game assets into each worktree, returning counts and paths
     -> Survey PR-index debt into a newest-first pending PR list
     > A failed debt read returns status `error` instead of throwing. Intake counts tally pending, running, complete, failed, retryable, and total.
     -> Refresh knowledge with `kg-maintain` against the game's graph database
     => Flip to subphase `baseline` once intake and knowledge read complete
     > Baseline is single-flight, runs in the prepared main worktree rather than the game checkout, and without intake stops with "Run PR intake before calculating the baseline".
     => Reset the report baseline
     => Report against the new baseline
     -> Copy each run's artifacts into dashboard records
     => Close the baseline completed or failed
     > The legacy prepare paths for git sync and PR intake now hard-throw and point at the operator `sync.start` action, so observation, lease acquisition, staged validation, and confirm-gated publication stay inside SyncState (bug catalog)
Move the Cycle through its phases
     -> Route every transition through `handleCycleCommand`
     > One door for every transition, and one route path per command. `/api/cycle/force-pr` is `enter-pr` with force; `/api/cycle/complete` routes to `close`.
     -> Pin `correlation_id` to the Cycle UUID and reject any disagreement
     => Complete preparing and pin the active run id
     => `start-running` moves the phase with status still `active`
     => Step running subphases `candidate_list`, `graph_rebuild`, `epoch_build`, `workers`, `checkpoint`, `other`
     => `stop-running` records a stop reason and manual stop mode
     => Flip to `blocked` when the stop produces blockers
     => Unblock to clear blockers and restore the stopped running state
     => `enter-pr` requires status `active`, or `blocked` plus force
     -> Chain the forced unblock as causation for the PR entry
     => Record the final build, then step PR subphases toward `publish`
     > PR subphases run `final_build`, `qa`, `qa_fixes`, `split`, `prepare_prs`, `publish`, `review`, `intake`, and `publish-pr` jumps straight to `publish`.
     => `mark-pr-complete` records completion without closing the Cycle
     > `markCycleComplete` is the terminal status transition, carrying who completed it, the reason, the final save point, and settled PR counts. Nothing in the command switch reaches it.
Reconcile merged results
     => Open the `Intake` container under Prepare
     > `Sync Intake` is its sibling, covering the source side of the same reconciliation.
     => `For each` merged PR, open a `PR #<n> intake` item
     => Open its postmortem child in phase `postmortem`
     => Open its knowledge intake child in phase `knowledge-intake`
     > Both children carry the PR id, so the trace tree reads PR by PR instead of as one flat intake.
     -> Keep the `PR index` container as a Prepare child, beside per-PR intake
Record save points
     => Write a save point with the `save-point` CLI job
     > Requires `--cycle-uuid` and exactly one trigger: `manual`, `init`, `pause`, `checkpoint`, `qa`, `ship`, `sync`, `fresh`, or `epoch`.
     -> Read the dirty list, minus excluded paths and the state dir
     -> Resolve HEAD, base sha, and commits ahead; fail when HEAD will not resolve
     -> Copy `report.json` into a timestamped `save_points/` artifact directory
     > It falls back to `baseline.json`, so the save point still records a real repo position.
     -> `boundarySavePoint` wraps the job, counting a missing id as failure
     => Record durable evidence and raise a blocker on failure
     > When even that record fails the error only reaches stderr, so the caller never learns no blocker was raised.
     -> Spool database-unreachable failures to disk, `wx` then rename
     => `For each` unreplayed spool record, replay inside one transaction
     -> Match exactly one Cycle, requiring game, correlation, and actor agreement
     -> Anchor at `head_revision`, keyed on Cycle, commit, and trigger
     > Replaying twice therefore does not double-write.
     -> Rewrite the record with `replayed_at` and the replay event id
Close the Cycle explicitly
     -> `Operator` posts `POST /api/cycle/close`
     > `/api/cycle/complete` routes to the same command. Any other actor throws, as does an already-closed Cycle.
     -> Run the close gate, collecting blockers rather than throwing
     -> Raise `dispatch_lease_held` or `unshipped_work` per unmet obligation
     > Unshipped work covers a worktree dirty beyond head, stale save-point evidence, unresolved save-point failures, a latest save point not anchored at `head_revision`, or no named save point at head. The message names which one.
     => With blockers, move the Cycle to `blocked` or update its blocker set
     > An unchanged blocker set writes nothing.
     => With a clean gate, move `active` into `closing`
     => Move to `closed` on the final evidence boundary, clearing the HarnessState slot
     > The closed Cycle stays readable afterwards. No workflow transition closes a Cycle on its own.
```



# docs/40-new-features/30-global-flow-map/30-sync

Working process flow for this band of the global flow. Confirmed detail from the walkthrough accumulates here before mapping to the owning chapter.

```process-outline
=> Observe upstream and request the `Sync`
     -> Fetch the configured remote
     -> Anchor the prior revision, take the observed tip as target
     -> Record the merged PR ids and requested corpus batches
     > A `Sync` whose observed tip already equals its anchor is `knowledge_only`.
=> Take the dispatch lease and activate the `Sync`
     => While a `Run` holds the lease, stay queued until it hands over
          => Stamp this `Sync` as the `Run`'s requested handoff, then stop the `Run`
     -> Block the start outright if a non-`Run` holds the lease
     > Every staging step revalidates the lease. Losing it stops the `Sync` where it stands.
Stage the requested inputs into sync staging
     => Enqueue one durable job per merged PR and per corpus batch
     => For each queued job, run its processor until the queue drains
          -> Curate the PR dump or read the corpus batch into a staging artifact
     => Block on `knowledge_stage_failed` once a job fails terminally
     -> Seal the succeeded artifacts into one digested manifest
     > A `knowledge_only` Sync skips the source workspace and rests at validated on that manifest alone.
=> Reconcile the staged result onto the upstream tip
     -> Create a detached staging worktree at the canonical cycle head
     => Fetch upstream again and record the observed tip
     => Rebase the staged cycle history onto the target tip
     => For each open PR series, rebase it onto the same tip
          -> Record the staged head, auto-resolved paths, conflicting paths
     => Block on `conflict_needs_operator` if a conflicting path survives
     => Repeat operator resolution and rebase until no conflicts remain
          -> `Operator` edits the staged files in place
          > Each pass resumes from the last durable stage: workspace created, cycle rebased, or series reconciled.
=> Validate the complete staged result
     -> Confirm every worktree is clean and submodules sit at expected heads
     -> Force a report run against the staged tree
     => Block on `validation_failed` for regressions or broken matches
     => Record the evidence and rest the `Sync` at validated
     => While upstream moves past the validated tip, revalidate until the tips match
          -> Rebase staging and the surviving PR worktrees onto the new tip
          => Block on `upstream_moved_after_validation`
=> `Operator` confirms publication
     -> Require explicit confirmation, validated status, recorded evidence
     => Observe upstream one last time and block if the tip moved
     -> Write the recursive repoint intent on the move into publishing
     > Publishing is not cancellable. From here the `Sync` goes forward to published or blocks for recovery.
Publish across the canonical boundary
     -> Repoint the cycle worktree at the staged head, refusing any unexpected tree
     => Commit one boundary transaction carrying the head, anchor, invalidations, push rows
     => For each pending push row, force-with-lease until every row resolves
          => Block on `pr_push_failed` if a remote branch moved
     => Transition to published
     > A `knowledge_only` publication advances the knowledge revision without moving the cycle head or pushing branches.
Release the lease and finalize the `Sync`
     => Release the lease, delete the publication intent, record published
     > Finalization does all three in one transaction.
     -> Hand the accepted inputs to `Knowledge Processing`
     > The new knowledge revision is the generation later Runs and queries read.
=> Cancel a `Sync` before publication
     -> Require explicit confirmation, refuse once publication has started
     => Cancel every live knowledge job and discard the staging worktrees
     -> Prove the cycle head and its recursive submodule pointers never moved
     => Release the lease, or cancel the still-queued dispatch request
Recover a blocked `Sync`
     -> Require explicit confirmation and a choice of resume or discard
     => Choose discard to abandon the `Sync`, exactly like a cancel
     => Choose resume to re-enter at the durable origin of the block
          => A crash-left ingest requeues its jobs once the lease is proven stale
          -> A failed knowledge stage requeues the failed jobs and resumes ingesting
          -> Durable staging resumes at reconciling or validating
          -> A committed boundary resumes at publishing and continues the pushes
     > Staged reconciliation conflicts do not recover this way. They route back through conflict resolution.
Reconcile any `Sync` left in publishing at boot
     => A committed boundary continues its remaining pushes and finalizes
     => A raw publishing state resets the cycle worktree to the recorded prior heads, parent first, and blocks on `publication_interrupted`
     > A publishing state with no durable intent blocks without touching any worktree.
```



# docs/40-new-features/30-global-flow-map/40-run

Working process flow for this band of the global flow. Confirmed detail from the walkthrough accumulates here before mapping to the owning chapter.

```process-outline
`Run Loop` turns the ranked board into landed work
     > The loop lands work one `Epoch` at a time.
     -> Take a dispatch lease and reconcile sandboxes at startup
          -> Refuse to start without a `--lease-id` and a schedulable run
          -> Clamp `Worker` capacity down to the run's `desiredWorkers`, never up
     -> Repeat each `Epoch` until the run stops or hits its budget
          => Open the `Epoch`
          -> Load the full ranked board
          => Admit targets from the board once, at `Epoch` open
          -> Queue one deduplicated `Worker` job per eligible target
          -> For each eligible target
               => `Worker` claims the job and its target atomically
               -> Provision an isolated sandbox at the claim's `base_rev`
                    > The claim-time `base_rev` is authoritative for the whole job. Re-reading the loop's current value after a multi-minute provision could name a commit the sandbox never fetched.
               => `Agent` attempts the target against the sandbox
                    -> Repeat run, diff, validate, checkpoint until no repairs remain or the deadline passes
                    -> Record a checkpoint on every attempt, passed or not
               => Gate what leaves the `Worker`
                    > The hard gate is exactly that conjunction: runner validation passed and review lint did not fail. Nothing else feeds it.
                    -> Enqueue only the best checkpoint for integration
               => Integrate the accepted checkpoint into the cycle worktree
                    -> Apply single-flight, commit accepted paths, reverse-apply a failed commit
                    -> Advance the base revision on every accept
                         > New `Worker`s branch off the latest integration commit, while in-flight `Worker`s keep the base they were provisioned at.
               => Fan conflicts out into path-disjoint resolvers
                    -> Hold resolvers and the `Epoch` boundary against each other
          => Close the `Epoch` at the boundary once its queue empties
               > Boundary detail lives in the linked `Epoch Boundary` doc.
          => Admit the next `Epoch` from the refreshed board
               -> Base new `Worker` worktrees on the boundary commit, compare-and-set
               -> Sleep at idle cadence, then wake and repeat
`Run control` steers the loop from outside while it runs
     -> Start the run and acquire its dispatch lease
     -> Stop the run gracefully
     -> Recover claims and return the run to paused
     -> Cancel a settled run with the operator's reason
`Shutdown` settles work before the loop exits
     => Give in-flight `Worker`s a 30-second grace, then cancel them
          > `Worker`s ignore `SIGTERM`, so a stopped pool would otherwise wedge for hours waiting on TTLs.
     -> Return every interrupted active target to admitted state
     -> Flush integration once before exiting
     -> Await `Epoch` work, resolvers, and knowledge maintenance
     -> Set the stop reason from whatever tripped first
```



# docs/40-new-features/30-global-flow-map/45-epoch-boundary

The epoch boundary is the serialized truth-rebuild, gate, publish, and re-admission pass that runs when an epoch's queue empties. It is agentless by design. It is currently the most failure-prone seam in the run loop.

## Trigger and Retry

The scheduler enters the boundary when the epoch queue is empty. An empty epoch still reaches the boundary after no targets, claims, workers, or resolvers remain.

A FAILED boundary retries snapshot, configure, and build in a tight loop. The retry path has no backoff and no attempt limit.

The reconciliation shortcut in `apps/server/src/core/cycle/pending-integrations.ts` declares the boundary done when the integration commit already exists on the branch. It skips report rebuild, QA, the breakage gate, CI parity, draft-PR publication, and the `pr_sync` save point. Full knowledge maintenance still runs before admission. Known gross-bug candidate: this exact path left the confirmed tier and PR stale while admitting a new epoch.

## The Step Sequence

`runEpochCycle` executes one ordered pass. Each named step consumes the evidence produced by the step before it, while gate failures decide whether the run pauses or only whether the PR moves.

```process-outline
Run the epoch boundary in serialized order
     -> integration_drain
          -> Drain accepted checkpoint evidence through the single-flight integration lane.
     -> snapshot_commit
          -> Commit the boundary snapshot while excluding paths locked by workers. Boundary snapshot commits use `--no-verify` by design.
     -> worktree_prepare
          > Recreate `state/epoch_worktree`. Untracked `build/` and `build-ci/` directories survive recreation, and stale objects in them have defeated Ninja mtime checks.
     -> configure
          -> Run `python3 configure.py --require-protos`. Add `--wrapper build/tools/wibo` when the boundary seeded a local Wibo binary.
     -> report_build
          -> Force an incremental objdiff report build.
     -> report_read
          -> Summarize regressions against the rolling baseline, which is the previous save point. Sync fallout therefore re-surfaces as regressions exactly once.
     -> qa_scan
          -> Run repository lint. A failure records errors but does not block the boundary.
     -> report_publish
          -> Copy `report.json` and `report_changes.json` back to the cycle worktree. A copy failure records a warning and does not block the boundary.
     -> regression_repair planning
          -> Twelve regressed rows is the pause threshold. At or above 12, the planner halts repairs and latches the run. Below 12, it requeues failures into a fixed-size repair epoch and admits that epoch immediately.
          > Ford directive 2026-08-27: remove boundary repair epochs. Failures get a Librarian note and defer to next-epoch admission.
     -> save_point
          -> Record a typed `epoch_finish` save point with measures and gate payloads.
     -> boundary sync
          -> Merge upstream with upstream as gospel. Displaced targets receive ledger notes and defer to next-epoch admission; sync never mutates current-epoch rows.
          > Semantic merge breaks are possible and require manual repair. No build-repair lane exists.
     -> master breakage gate
          -> Compare this report with the upstream-master CI report artifact at the anchor. Any function or data/BSS section moving from 100% to below 100% pauses the run.
          > Cross-TU EXACT rematches are exempt as moved. Scoring uses `functionRelocDiffs=data_value`; ad hoc objdiff runs without that flag report false regressions.
     -> ci-parity gate
          -> Parse the game repository's `.github/workflows/build.yml` for the link and test configure arms. Run both in per-mode `build-ci/` directories, then run the Ninja diff scan, `check_complete`, and `pre-commit --all-files`.
          > A failure blocks only the PR push. The boundary continues.
     -> draft-PR publish
          -> Publish the draft PR only when every push gate passes.
     -> full knowledge maintenance
          -> Run the 10-source registry against the boundary worktree.
     -> typed close via closeSchedulerEpochWithEvidence
          -> Record `run.epoch_integrated` with `correlationId` equal to the run ID and registered payload facts `ordinal`, `boundary_status`, and `save_point_id`.
          > The epoch update, event record, and cycle/run envelope updates share one transaction. A throw inside that transaction rolls them all back and strands the epoch in error. This happened twice before the 2026-08-27 fixes. Deferred save-point evidence records after the transaction.
     -> admission of the next epoch from the recomputed board
          -> Recompute the board from published truth and admit the next epoch.
```

## Failure Catalog (prune candidates)

These failure modes have occurred in live runs. Open rows remain prune or guard candidates; the two 2026-08-27 fixes are present in the worktree but uncommitted.

**Failure Catalog (prune candidates)**

| Failure | Mechanism | Status |
| --- | --- | --- |
| Reconcile shortcut skips gates, PR, and pr_sync | An existing integration commit skips truth rebuild and publication, runs full knowledge maintenance, then proceeds to admission. | open |
| Board admission uses a missing or stale report | Admission treats the board as current and admits everything. One run admitted 1,081 targets: 700 were already 100% and 258 were absent from the report. | open; needs a fresh-report guard |
| Boundary repair epochs | Regression planning creates and immediately admits a fixed-size repair epoch below the 12-row pause threshold. | open; Ford directive to remove |
| Failed-boundary retry has no backoff or limit | Snapshot, configure, and build retry in a tight loop after failure. | open |
| Graceful stop holds the dispatch lease | Recover or resume waits for the held lease to become stale after 15 minutes. | open |
| Stale build-ci objects survive worktree recreation | Untracked per-mode objects survive in the recreated epoch worktree and can defeat Ninja mtime checks. | open; mitigated by deleting build-ci |
| Event correlation_id differs from the run ID | The typed close must correlate `run.epoch_integrated` to the run container. | fixed 2026-08-27; uncommitted |
| run.epoch_integrated payload facts are unregistered | The event registry must accept `ordinal`, `boundary_status`, and `save_point_id`. | fixed 2026-08-27; uncommitted |
| QA address_named_static_data false positives | The QA rule flags intentional byte-exact data restorations. | open; needs an exception mechanism |
| Attempt-retry sandbox leak | Re-provision overwrites `payload.sandbox_id` and orphans the first sandbox until its 90-minute auto-destroy. | open |



# docs/40-new-features/30-global-flow-map/50-pr

# PR Band

Working process flow for this band of the global flow. Confirmed detail from the walkthrough accumulates here before mapping to the owning chapter.

```process-outline
PR band parked
     -> Campaign machinery stays removed until the core loop is proven
     > Recover prior machinery from git history and save/complex-run-loop when the band resumes
     -> Keep the thin `pr` cycle phase so the cycle can pass through and close
     -> Keep merged-PR intake, save points, and checkpoints live
```



# docs/40-new-features/30-global-flow-map/60-knowledge

Working process flow for this band of the global flow. Confirmed detail from the walkthrough accumulates here before mapping to the owning chapter.

> **note: Superseded by Knowledge System V2** — This lane was walked against the legacy knowledge pipeline (knowledge_absorption jobs, the three-door librarian, the learnings ledger). Since 2026-08-30 a closed run enqueues a run_closed index task that the librarian consumes; the current flow is on Librarian Pathways.

```process-outline
Enqueue a typed knowledge job from a source event
     -> `Worker` closure enqueues a `knowledge_absorption` job
          > The row commits in the same transaction that ends the `Worker`, keyed on the worker state id, so a replayed closure returns the existing job.
          -> Catch up at startup on worker states that predate the queue
     -> `Sync` ingest derives one `sync_publication` job per merged PR or frozen Discord batch
          > The job id digests the sync id, source kind, and source id; matching provenance skips, an identity collision refuses. Discord source ids name incremental batches frozen during observation.
     > Operator backfill, corroboration, and curation never enter this queue.
Run claimed jobs inline in the background `Processor`
     -> Repeat on a one-second tick until the run loop stops
          -> Claim the highest-priority job under a sixty-second lease
               > The lease is a visibility timeout, not a fence token; the row revision is the monotonic value guarding writes, so a stale claim fails rather than overwrites.
          -> Run the handler for the job's kind
          -> Complete the job with the publication digest as result reference
          -> On failure, move to failed, then straight back to waiting
     > Waiting is only ever re-entry, from retry backoff or a lapsed lease.
     -> Wait fifteen seconds at shutdown, abandoning the rest to lease expiry
     > No attempt ceiling and no dead letter: a failing job retries until an operator cancels it.
For each job kind, materialize staged evidence in its handler
     -> `Condense` turns one closed `Worker` into ledger learnings
          -> Load the checkpoints, the attempt view, and every transcript span
          => `Librarian` reads that batch and returns a report
          -> On a ten-minute timeout, publish a timeout digest and no learnings
          -> Append surviving learnings to the ledger
     -> `Intake` turns a merged PR postmortem into curated records
          -> Append deterministic records and their proposals before any agent runs
          => `Librarian`'s curation door proposes further source updates
          > Every proposal is marked `proposal_only`.
     -> `Discord intake` turns one staged message batch into ledger learnings
          => `Librarian` reads the frozen batch and returns a report
          -> Append validated learnings and record the batch outcome in the manifest shared with operator backfill
     -> `Index` builds the PR postmortem library from the raw dump
          > A missing dump index skips the stage rather than failing it.
     => `Corroborate` replays overlapping learnings through the curation door
          -> Group the ledger by scope and anchor, keeping subjects with two or more live learnings
          -> Anchor each group against the current checkout
          -> Confirm, refute, or accept a merged replacement
Validate which records may become evidence
     -> Accept a librarian report only as `librarian_v1`
          > A valid report carries a statement, a known scope and origin, confidence between zero and one, and at least one typed evidence reference.
     -> Drop rejected learnings one by one and record them in the job summary
     -> Canonicalize, hash, and rename staged `Sync` artifacts into place
          > The manifest digest covers source kind, source id, provenance, and artifact digest, so it names content rather than location.
     > Ledger and curator appends dedupe by record id, so replaying the same evidence rewrites the same row.
Advance the knowledge revision on acceptance
     -> Publish inside the `Sync` boundary transaction
          > Publication runs only while the `Sync` is publishing.
          -> Require every accepted job succeeded and a tuple-for-tuple manifest match
          -> Pick the next revision, writing the revision-advanced event first
               > That event id becomes the cause recorded on the new row.
     -> Return the existing revision when the digest repeats
     -> Stamp each new `Run` with its game's latest published revision
     > Later `Workers` search a graph and ledger index built from that published state.
Rebuild the derived views in maintenance
     -> While idle, repeat on the configured interval until work arrives
     -> Run the fast lane when new reports landed since the last refresh
          -> Reload the board and re-open targets that became available
     -> Run the full lane at every `Epoch` boundary
     -> For each lane, run the stages in the same order
          -> Index PR postmortems first
          -> Run the tool runners in parallel
               > The runners are ghidra xrefs, opcode sequences, mismatch analysis, and compiler probes.
          -> Abort the lane on a blocking runner failure, otherwise record and continue
          -> Curate worker and PR lessons into enrichment records
          => Review those records through the `Librarian` in batches when asked
          -> Reset the graph and re-ingest all eleven sources
               > Opseq analogs and siblings skip rather than fail when their indexes or rules are missing.
     -> `Feature ranking` scores next-`Epoch` board candidates from the rebuilt graph
Run backfill when the operator starts it
     -> For each source, let the planner shape its own batches
     -> Repeat wave by wave until the pending list is empty
          => Run each batch's `Librarian` pass up to the concurrency limit
          -> Append learnings from the whole wave at once
          -> Record each batch in the manifest as done or failed
     -> On a rerun, reload the manifest and skip batches already marked done
          > An interrupted backfill resumes where it stopped.
Run curation when the operator starts it
     -> Read recent worker states and their PR postmortems together
     -> Write worker lessons, PR lessons, and proposals as one sorted, id-deduped enrichment file
     -> Preserve records an earlier curator agent produced across the rewrite
     => Hand the enrichment file to the curator `Librarian` when asked
     > Every proposal is `proposal_only`; nothing in this lane edits a registered source directly.
> The background lane never holds the game dispatch lease; the `sync_stage` jobs are the exception, running inside the `Sync` under its lease.
> Only the marked `Librarian` runs reach the kernel trace. The queue itself emits nothing: enqueue, claim, lease lapse, retry, completion, and revision publication have no container, and the bridge's `Knowledge refresh` container is defined but never spawned.
```



# docs/40-new-features/30-global-flow-map/70-validation-sandbox-tracing

Working process flow for this band of the global flow. Confirmed detail from the walkthrough accumulates here before mapping to the owning chapter.

```process-outline
Answer a request for report truth
     -> Accept a report request from the dashboard, the `report-run` job, or a Cycle
     -> Configure the worktree when `build.ninja` is missing
     -> Compute the reuse key over HEAD, `build.ninja`, and `config.yml`
     -> Reuse `report.json` when reuse is on and the stored key matches
     -> On a miss, delete the report and run `ninja build/GALE01/report.json`
     -> Write the fresh reuse key beside the report
     => With `--reset-baseline`, copy the fresh report over `baseline.json`
          > Every later comparison starts from this baseline.
     => Diff the report against the baseline with `ninja changes_all`
     -> Load `report_changes.json` as the trusted report
     -> Return empty counts as `missing` or `parse_error` when it will not parse
     -> Write the `report_run`, `board_snapshot`, and `trusted_report` rows
     > Concurrent requests do not dedupe. No single-flight guard exists: each caller runs its own `ninja` in the same `build/GALE01`, clears `report_changes.json` on entry, and can delete `report.json` out from under a run already in flight (bug catalog).
Check a candidate against the production baseline
     => Rebuild the production baseline in a detached worktree
     -> Build the candidate end to end with `ninja changes_all`
     -> Record `build_failed` and stop without reading a report when the build fails
     -> Require `report_changes.json` newer than the build start, or fail closed
     -> Diff the candidate report against the production baseline
          -> Fail the regression gate on broken matches or fuzzy and metric regressions
          -> Weigh new matches and improvements at the promotion gate
     -> Evaluate PR promotion against the policy floors
          > The floors are minimum new matches, matched code bytes, matched data bytes, and unmatched improvement bytes.
          -> Return `pr_ready`, `local_only`, or blocked
     -> Write `pr_report.md` and `summary.json` beside the captured build output
Gate the QA sweep
     -> Sweep the candidate files with `scan_diff.py --gate` at the `pr_gate` surface
          > Exit code is the contract: 0 clean, 1 hard-fail findings, 2 warnings only, anything else a tool failure.
          -> Block handoff when the scanner cannot run or its output will not parse
     -> Group the findings by candidate file
          > The candidate files are the set of paths the checkpoint's proofs claim.
          -> For each candidate file carrying errors, queue one repair item
          -> Queue one for each warning-only file, unless repair-warnings is off
          > `llm_review` warnings stay advisory and never become mandatory repair targets.
          -> Retain outside findings with reason `outside_candidate_set`
     -> Conjoin three gates into the handoff verdict
          > Handoff needs the regression gate clean, promotion not blocked, and the QA gate clean; any miss reports `failed`.
Run the attempt in a sandbox
     -> Provision from the game image plus the claim's base-revision seed
          -> Create the sandbox from the snapshot, autostop off, TTL budget plus thirty minutes
          -> Emit `sandbox.created` onto the game event log
          -> Bundle and fetch the gap when the baked revision trails the base revision
          -> Force a detached checkout at the base revision
               > The claim's identity is that revision, not whatever the baked workspace left dirty.
          -> Upload each seeded report artifact into the workspace
          -> Verify `wibo-real`, `objdiff-cli`, and `dtk` are present and executable
          -> On any throw, delete the sandbox as `provision_failure` and rethrow
     -> Reach Daytona through one provider client
          > One client built from `DAYTONA_API_KEY` serves create, get, list-by-labels, and delete; a sandbox already gone reads as absent, not as an error.
     -> Sleep while the model thinks
          -> Route every exec, upload, download, read, and write through the sleep controller
          -> While the sandbox sits at zero operations, run the stop timer down until it fires
          -> For each new operation, cancel the pending stop and wake the sandbox first
     -> Reconcile the fleet
          -> Delete the sandbox of a settled or reaped job and append `sandbox.deleted`
          -> For each sandbox labelled with this game, check liveness end to end
               > Live means the current claim token, a live job lease, a matching game and run, a payload still naming this sandbox and claim, an active dispatch lease held by this run, and an active claim.
          -> Delete anything failing a check as `reconciliation`, and count the rest live
          > A sandbox already carrying a `sandbox.deleted` event is skipped instead of deleted twice.
Trace it as it happens
     -> Submit every workflow event through one path
          -> Build the container lineage from the event's kind, stamping the terminal status
               > Session sits at the root, then prepare, then the child; intake nests session, prepare, intake, item, then the event, and a PR publication hangs off a `pr` container.
          -> Upsert the whole lineage first, so every parent exists before the event
          => Emit `melee:<phase>_<status>` onto the kernel trace
               > The event carries the phase, operation, app session, container id, `correlation_id`, `game_event_id`, and `caused_by_event_id`.
          > The kernel event id derives from that same identity, so resubmitting one event is idempotent.
     -> Read the linkage cursor back
          -> Join kernel trace events to their containers over the app-session ids
          -> Return each game event with its `/workspace/trace` deep links, rejecting other shapes
     -> Hand work off through the event log
          > Nothing calls the `Run Loop` directly; the producer stores a wake request as an event on the run.
          -> Repeat: `Run Loop` claims the next unhandled signal, until none remain
               -> Claim `pool_below_target` ahead of the queue, oldest first otherwise
               -> Act on the event, mark it handled, and store the result as a new event
     -> Hold the game's one dispatch lease
          -> Acquire when no holder is active, appending `game.dispatch_requested` then `game.dispatch_acquired`
          -> While another workflow holds the lease, queue the request until it releases
          -> Move the holder to `blocked` when blockers stay open at release
          -> Otherwise append `game.dispatch_released`, clear the slot, and acquire into the successor
          > Every write compare-and-swaps on the harness revision; a stale revision throws instead of overwriting.
```



# docs/40-new-features/30-global-flow-map/90-known-bugs

Bugs and code-versus-docs mismatches found while aligning process outlines with traces. We walk this list together; each row gets a disposition (fix inline, rewrite doc, or spin off a thread) and its status updates here.

**Bug catalog**

| Severity | Where | Bug | Status |
| --- | --- | --- | --- |
| high | apps/frontend trace page | The harness trace viewer passes no containers to buildTraceSpans (pages/workspace/trace/index.tsx:307-310) and the server emits no phase or container events, so traces render as a flat list instead of the process hierarchy. | fixed (53e4ebce) |
| medium | kernel bridge session-mapping.ts:380-389 | pr-qa and pr-handoff container kinds hit the default branch of describeMeleeContainer (bare-string labels, re-parented to root; only pr-publication gets the pr parent injected at workflow-trace.ts:214). Confirmed but LATENT: no production code emits either kind today. | resolved-by-removal (pr cleanout) |
| medium | docs 10-system-design/20-game/20-registration-and-setup | Outlines a four-stage registration and activation process that has no implementation; registration is pure descriptor resolution (game-registry/resolver.ts:444). | docs-corrected |
| medium | docs 10-system-design/40-knowledge/.../40-crosswalk | Documents wiki-mirror refresh and crosswalk generation that do not exist in code; only the smashwiki search tools exist. | docs-corrected |
| medium | phases/preparing/runtime.ts:317,324 vs docs | Legacy git-intake and PR-intake prep subphases hard-throw as disabled while the docs still imply they run during prepare. | docs-corrected (flow-map + c5cee894) |
| low | docs 50-workflows/20-run/20-run-loop | Run Loop outline is missing the provider health-probe and pause lane, the force-finish-epoch signal, and shutdown and drain semantics. | resolved (condense rewrite + eeb1226f) |
| medium | core/cycle-runtime/index.ts (command switch) + api/cycle/routes.ts | markCycleComplete is unreachable: /api/cycle/complete routes to the close command and nothing in the command switch reaches the terminal complete transition. | resolved-by-removal (d8af23c8) |
| medium | phases/preparing/runtime.ts (runPrIndexForPrepare) | The prepare-phase PR-index executor hard-throws like the legacy git-intake/PR-intake paths; only the PR-index debt survey is live during prepare. | resolved-by-removal (67c55671) |
| high | core/validation/report/run.ts:264 (forceReportRun) | No single-flight guard on report runs: the reuse key is a cache check with no lock, run entry unconditionally clears report_changes.json and deletes report.json, so concurrent callers race the same build/GALE01 dir and can destroy each other's outputs mid-build. Reached unguarded from validation routes, runtime, report-run job, and baseline prep. | fixed (d8af23c8 — per-root serialization) |
| low | docs 40-knowledge/40-processing/20-job-lifecycle-and-leasing vs core/job-queue/kernel.ts:435 | Docs say jobs are claimed under a fenced lease; the lease is a visibility timeout (lease-UUID + expiry), and the monotonic guard is the row revision used as optimistic CAS. Docs also insert waiting between queued and claimed; waiting is only re-entry from backoff or a lapsed lease. | docs-corrected |
| low | core/job-queue kernel + background knowledge processor | No attempt ceiling and no dead letter for knowledge jobs: a persistently failing job retries on backoff forever until an operator cancels it. | fixed (e3118dae — 5-attempt cap, terminal failed) |
| medium | phases/pr/jobs/verify-ship-set.ts (check-issues lint) | A missing Docker daemon makes the check-issues lint report unavailable, and unavailable PASSES the ship-set gate — lint issues then only surface in upstream CI. | fixed (ba526630 — unavailable now fails the clean check; ship-gate job itself removed in cleanout) |
| low | phases/pr/jobs/pr-cycle-review.ts (exit code) | Cycle review exit code reflects only agent errors and regression-command infrastructure failures; ledger findings never make the run exit nonzero. | resolved-by-removal |
| medium | knowledge lane (core/knowledge/**) vs kernel bridge | The knowledge queue and publication path emit no workflow trace events at all — enqueue, claim, lease lapse, retry, completion, and revision publication are trace-invisible; only Librarian agent spawns appear (as Knowledge curation containers). | fixed (7b805315 — claim/settle emission behind never-fail guards) |
| medium | bridge/session-mapping.ts:334-342 + preparing/knowledge-refresh subphase | The knowledge-refresh container kind is defined in the bridge but never spawned; refreshKnowledgeForPrepare shells kg-maintain with no kernel context, so the prepare-phase knowledge refresh never appears in traces. | resolved-by-removal (67c55671) |
| medium | bridge/session-mapping.ts sync-intake + workflow-trace.ts syncProjectIntake | The sync-intake kernel container path has zero production callers (test fixture only, flagged inert in project-state-slice-3); Sync never appears as a container in kernel traces — its real emissions are sync.*/knowledge.*/game.dispatch_* game events. | fixed (977bca8a — nine sync milestones now emit) |
| low | phases/sync/types.ts:19-33 (SYNC_WORKFLOW_EVENT_TYPES) | sync.pr_push_started/succeeded/failed are emitted in production and registered in harness-state/event-registry.ts:308-329 but missing from SYNC_WORKFLOW_EVENT_TYPES. | accepted-by-design (documented: pr_push lives under sync_push subject kind) |
| medium | session-mapping.ts pr-index kind + preparing/subphases/knowledge-refresh.ts:22 | The pr-index container kind is defined but never constructed (the PR indexer agent spawns as postmortem/intake-postmortem instead), and refreshKnowledgeForPrepare has zero callers — dead code; prepare-phase PR-index and knowledge-refresh never appear in traces. | resolved-by-removal (67c55671) |
| high | core/knowledge/background/index.ts:21 vs jobs/attempt-record.ts:90 | Knowledge job lease is 60s but the librarian defaults to a 600s timeout and inline execution never heartbeats — the lease expires mid-flight, claimNextJob steals the row, duplicate concurrent librarian runs process the same worker state, and the original completion is silently dropped as a stale token. | fixed (e3118dae — inline heartbeat) |
| medium | jobs/attempt-record.ts:402-416 | A librarian timeout returns a synthetic digest (timeout:<id>) that SUCCEEDS the job while the agent session may remain active — timeouts are masked as successes. | fixed (e3118dae — timeouts fail the job) |
| medium | bridge/spawn-context.ts:131-133 + librarian spawn sessionIds | knowledge-curation containers reuse the run container id (no dedicated id) and librarian runs derive separate app sessions (runId/batch ids), so they render as orphan Game session roots outside the cycle tree; corroboration fragments one session per batch. | fixed forward (245417ad — historical rows stay orphaned) |
| medium | core/knowledge/** vs cycle-runtime/dispatch-guard.ts | Knowledge jobs read the repo checkout with no dispatch-lease mutual exclusion (no knowledge file imports the dispatch guard); they run concurrently with lease-holding workflows. Only the sync knowledge lane fences properly. | fixed (e3118dae — claims gated while sync holds the lease) |
| low | core/agent-catalog/kernel-catalog.ts:317 (pr-fixer) | The pr-fixer agent is registered in the kernel catalog but has zero runtime call sites — no container is ever created for it. | resolved-by-removal (step 1) |
| low | bun test (repo root) | bun test run from the repo root crawls games/ and ai_docs/ during discovery (~23k open dirs) and dies on fd exhaustion; run from apps/server | open (workaround documented) |



# docs/40-new-features/30-global-flow-map

A working visualization of the entire harness as one system. The master outline below shows everything end to end; each band has its own doc in this folder where the walkthrough happens and confirmed detail accumulates. Known bugs found along the way live in their own doc here too.

## The Whole System

```process-outline
Melee harness global flow
     -> Run standing infrastructure beside every cycle
          -> Boot the server, reconcile orphaned `Sync`, serve HTTP/UI
          -> Hand FIFO build tokens to every build from `Compile jobserver`
          -> Drive the Run Loop child from `Process controller`
          -> Claim, dispatch, heartbeat, and settle jobs in `Job-queue consumer`
          -> Flush mapped kernel events behind a cursor via `Trace tailer`
     -> Register a game
          -> Resolve the descriptor from `games/<id>/game.json` and list it available
          > Registration only resolves the descriptor: files are read and a value is returned, with nothing activated and nothing written. The documented four-stage activation does not exist in code, and a missing checkout only warns (bug catalog)
     => Open a cycle as a `Cycle` container
          -> Require every prior cycle closed, then provision the canonical worktree
          -> Capture the immutable baseline with its matching `head_revision`
     => Prepare the cycle
          -> Provision worktrees for the cycle
          -> Survey PR-index debt
          -> Refresh knowledge
          => Calculate the baseline in the prepared worktree
          > Legacy git-intake and PR-intake prep subphases hard-throw and point the operator at `sync.start`, and the prepare-phase PR-index executor throws the same way, so only the debt survey runs here (bug catalog)
     => Run a `Sync` when the operator starts one
          -> Observe upstream and stage the requested inputs
          -> Reconcile staging against the observed tip, then validate it
          -> Publish across the canonical boundary once `Operator` confirms
          -> Release dispatch authority and hand inputs to knowledge processing
          > Sync holds the game dispatch lease, so a Run holding it is stopped first. A failed step blocks for recovery rather than rolling back, and publication is not cancellable.
     => Run autonomous work through the `Run Loop`
          -> Start under a dispatch lease and clear stale state
          -> Repeat from the refreshed board until the run stops, idles out, or spends its budget
               => Open an `Epoch` and admit the full eligible board
               > Naive admission: every Epoch admits the full eligible board, once, at Epoch open.
               => Claim a queued job and run the attempt sandboxed
               => Drain accepted checkpoint evidence into integration, single flight
               -> Launch conflict resolvers path-disjoint and capped
               -> Close the boundary once the Epoch's queue empties
               -> Rebuild report truth, then record a save point
               > The boundary confirmation pass is opt-in: where enabled, a clean global comparison confirms the tentative window and a dirty one reverts the widened candidates.
          -> Drain `Worker`s for a 30-second grace, then integrate once more
     -> Break confirmed work into PR slices
          > PR band parked: campaign machinery is removed pending completion of the core loop
     => Reconcile merged results
          => Open one intake item per merged PR
          => Run a postmortem and a knowledge intake beneath it
     -> Close the cycle explicitly
          -> Settle obligations, record the final evidence boundary, clear the slot
          -> Block the cycle instead when the gate finds unshipped work
     => Process knowledge beside the workflow story
          -> Claim typed jobs under leases in `Knowledge processor`
          -> Publish anchored records, validate evidence, advance the knowledge revision
     -> Answer validation requests on demand
          -> Build trusted `objdiff` report truth behind a reuse key
          -> Guard every boundary and handoff with regression checks and QA
     -> Host every `Worker` attempt in a sandbox
          -> Provision from the game image plus a base-revision seed
          -> Sleep while the model thinks, wake on activity
          -> Reap settled and orphaned sandboxes on reconciliation
```

**Band docs**

| Band | Doc |
| --- | --- |
| Standing Infrastructure | Standing Infrastructure |
| Registration and Cycle Lifecycle | Registration and Cycle Lifecycle |
| Sync | Sync |
| Run | Run |
| Epoch Boundary | Epoch Boundary |
| PR | PR |
| Knowledge Lane | Knowledge Lane |
| Validation, Sandbox, and Tracing | Validation, Sandbox, and Tracing |
| Known Bugs | Known Bugs |



# docs/40-new-features

Design docs for features that are explored and decided but not yet implemented. Each doc here captures the architecture decision, the trade-offs already settled, and the open questions a proof of concept must answer. When a feature ships, its doc graduates into System design and Implementation.

Current entries:

- Daytona sandbox execution — move worker shell/build execution into per-worker micro-VM sandboxes while the agent process, knowledge system, and orchestration stay on the host.

- Stop while thinking — stop claim-local sandboxes during model turns, wake them at the next remote operation, and preserve the shipped lease, evidence, and teardown contracts.



# docs

These docs describe `decomp-orchestrator/` only. They are intentionally
package-local docs, not the top-level Melee repository documentation. The
markdown docs are the living, navigable version of the original design,
organized with the three-layer documentation framework:

## Start Here

- Foundation overview explains what the

  orchestrator is for and what it should avoid becoming.

- System design overview provides the reading path from architecture through games, the process overview, harness state, sync/run/PR workflows, and knowledge. The Sudoku core idea that motivates the whole system now lives in the Foundation overview.

- Games covers what the system operates on: game registration and setup, canonical worktrees, cycles, and save points.

- Implementation overview maps the current

  TypeScript source tree and package-owned knowledge layout.

- New features holds decided-but-unbuilt designs,

  starting with Daytona sandbox execution for workers.

## Documentation Rules

- Keep system design docs implementation-agnostic: describe behavior, state,

  contracts, and lifecycle without source paths.

- Put TypeScript files, package scripts, schemas, and directory layout in

  implementation docs.

- The operating documentation system is `../docs-system`; read structural standards from the doc-standards corpus inside that package rather than duplicating them in this tree.

- Use the current knowledge terms: references, workflows, tools, decomp

  resources, and past PRs. "Packs" are legacy language.

- Treat experimental search as an opt-in worker capability, not the default

  worker posture.

- Treat trigger actors and guardian processes as evented runtime actors, not

  board-scheduling Pi agents.



