---
concepts: [project-session, full-flow, agent-kernel, kernel-containers, trace-events, run-mode, epoch-flow, worker-worktrees, pr-mode, adversarial-review, smart-prs]
status: target-flow
depends-on: [docs/10-system-design/10-run-director-loop.md, docs/10-system-design/40-worker-lifecycle.md, docs/10-system-design/50-knowledge-model.md, docs/10-system-design/60-score-and-pr-handoff.md, docs/10-system-design/65-operator-flow-and-pr-tracking.md, docs/10-system-design/75-project-session-architecture.md]
---

# Session Operating Flow

Target high-level Melee decomp harness flow from project session startup through autonomous epochs, PR preparation, review, kernel-backed tracing, and next-session sync/intake.

This is the first-read flow for the Melee decomp harness. It describes the
system the harness should become, not the exact current implementation.

Everything centers on a project session. A session captures one upstream
baseline, runs autonomous worker epochs against that baseline, then turns the
surviving work into reviewable PRs. The same session owns the whole path from
sync to PR review; a new autonomous session starts only after the current PR
work has been resolved and the next session boundary has synchronized the
merged upstream work into local state and knowledge.

The target runtime uses `agent-kernel` as the agent execution and
observability substrate. The harness still owns Melee-specific workflow
semantics: scheduling, target claims, scoring, validation, PR lanes, standards, and
knowledge. The kernel owns reusable agent runtime concerns: cataloged agent
definitions, context assembly, Pi session lifecycle, subagent lineage, trace
events, token accounting, read APIs, and viewer primitives.

## Full Session Shape

```text
Project session
  -> New session started
       -> Register or resume the kernel app session root

  -> Prepare
       -> Pull down all remote commits and check the upstream head
       -> Update isolated upstream-current and session-current worktrees to the session base
       -> Discover newly merged upstream PRs from the local-to-upstream range
       -> Index newly merged and missing PR records and postmortems
       -> Refresh the knowledge graph
       -> Reset and build the session baseline
       -> Treat this as the fixed starting point for the session

  -> Choose run config
       -> worker count
       -> thinking level
       -> epoch size
       -> batch rebuild size
       -> worker timeout
       -> worker pool and candidate-window policy

  -> Start run mode
       -> Repeat epoch loop until a run bound or manual stop
       -> Emit scheduler, worker, validation, and knowledge trace events

  -> Enter PR mode
       -> Stop autonomous worker scheduling
       -> Review, fix, validate, split, and publish draft PRs
       -> Emit PR split, review, repair, and publication trace events

  -> Complete session
       -> Verify PR work is merged, closed, or explicitly carried forward
       -> Preserve carry-forward work
       -> Clear the active session gate
       -> Close the kernel session container tree
```

The important guarantee is that the baseline stays stable while workers are
creating evidence. Pulling upstream, merged-PR intake, and baseline movement are
session-boundary actions, not background events inside an active run.

The New Session operator action creates the canonical project session at the
start of the boundary and opens that session's Prepare page immediately. The
Prepare page exposes the boundary as explicit operator gates. Git Sync checks
the upstream head, fetches the configured remote, updates the canonical
project `worktrees/upstream-current` source tree to the latest upstream SHA,
creates the session integration worktree at
`worktrees/sessions/<sessionUuid>/current` from that same SHA, and discovers
merged PRs before any baseline reset begins. A repeat sync is idempotent: it
reuses a clean session branch worktree that is already checked out for the
session, including a legacy `sessions/<sessionUuid>/source` location, and only
fast-forwards that session branch when the existing head is an ancestor of the
requested baseline. The completed gate remains
repeatable as an explicit resync action and shows the upstream head, whether the
head moved, the newly discovered merged-PR count, and the upstream-current and
session-current locations. It also records a separate PR-index debt snapshot so
an unchanged repository can still show that merged PR postmortems are behind
agent indexing. Sync Intake trace events record the start of Git Sync, the
upstream/worktree result, the PR-index debt snapshot, and final completion or
failure under the session's Prepare tree. It must not rebase PR branches or
mutate the control checkout during New Session preparation. PR Intake then
indexes newly merged upstream PRs
plus missing local PR records/postmortems, and its gate shows how many merged
PRs still need agent indexing before the baseline can move. Knowledge refresh
runs after that intake so graph facts include the new PR artifacts. Baseline
calculation resets and reports from `upstream-current`,
which is the canonical upstream comparison point for the session. Only after
the baseline is ready does the operator choose worker configuration and start
run mode from the session current worktree.

If an active or blocked canonical project session already exists, the session
gate owns the next action. The overview opens the existing session and exposes
the blocking reasons instead of presenting a new-session start path. A
duplicate New Session request is refused with the active session identity so
the operator lands on the current preparing, running, or PR state rather than
silently creating or reusing a session under a new label. Starting another
session requires completing or explicitly resolving the active session gate.

The Prepare page is the setup and readiness view for that boundary. It shows
Git Sync, PR Intake, Baseline, Worker Config, and Start Run gates for the
session. PR handoff packaging belongs to the PR Queue phase after run work
exists; it is not part of session preparation.

## Canonical State Row

The server persists the active workflow answer in SQLite `project_sessions`.
That row is the canonical project-session state root. Existing run rows, PR
records, save points, process files, and kernel traces still own their detailed
facts, but `project_sessions` owns the session lifecycle, phase/subphase,
operator gates, blockers, process recovery identity, and trace root pointers.

During the migration from legacy runs to canonical project sessions, the
dashboard can still show a legacy `runs` row as the active session when no
`project_sessions` row exists. A settled legacy run is closed by recording a
save point, marking `runs.status = complete`, and then starting a new canonical
project session. This closeout is not merged-PR intake; merged upstream work is
intaken during the next session's sync/start phase.

Legacy closeout may override stale ship-set, QA, or PR-record blockers after
the operator confirms that the session's PR work is merged, closed, or
intentionally carried forward. Live workers and active claims remain hard
blockers; those must be drained or recovered before closeout.

Once a legacy run is complete, its handoff files, ship-set status, QA reports,
and historical PR records are inert session history. The dashboard may present
them as artifacts, but they do not create PR Mode and do not block the next
session gate. A new session is blocked only by an active canonical session,
live workers, active claims, a dirty campaign head, or unresolved current PR
work.

The stable columns are:

```text
project_sessions
  id
  project_id
  session_uuid
  status
  phase
  active_run_id
  base_ref
  base_sha
  preparing_state_json
  running_state_json
  pr_state_json
  complete_state_json
  process_state_json
  kernel_trace_json
  created_at
  updated_at
  completed_at
```

At most one row with `status in ('active', 'blocked')` may exist per project.
The stored `subphase` lives inside the active phase JSON object, never as a
top-level canonical column. API and dashboard payloads may expose a derived
`activeSubphase` for rendering.

Each phase JSON object carries the common lifecycle envelope:

```text
status
subphase
subphase_detail
started_at
completed_at
blockers
```

`running_state_json` also records stop reasons:
`hit_100_percent`, `manual_stop`, `error`, or `other`, plus
`manual_stop_mode` of `finish_epoch` or `hard_stop` when relevant. A hard stop
or error can be forced into PR mode, but every PR entry still starts at
`pr_state_json.subphase = final_build` so QA does not review stale or unbuilt
work.

## Kernel Runtime Boundary

The kernel is a runtime and observability layer, not the decomp strategy layer.
The harness gives the kernel an app session id, container id, agent definition,
rendered prompt bundle, working directory, and abort policy. The kernel returns
a typed agent result plus trace identity. The harness then validates, routes,
and persists decomp-specific consequences.

```text
Harness-owned
  -> project sessions and phase semantics
  -> run config, scheduler policy, target claims, write sets
  -> target packets, board state, score gates, validation
  -> knowledge ingestion and PR handoff decisions
  -> dashboard workflow pages and app-specific viewer panels

Kernel-owned
  -> agent catalog and spawn pipeline
  -> prompt/context/tool lifecycle
  -> Pi session identity and parent-child linkage
  -> agent runs, subagent lineage, token accounting
  -> trace events, read APIs, and reusable viewer primitives
```

This split keeps the kernel portable. It can render and inspect the harness
without learning why a target is high priority, what `matched_code_percent`
means, or which PR slice is safe to publish.

### Prompt And Context Contract

The Melee server bridge's kernel boundary is the rendered prompt bundle plus explicit
kernel context metadata. Existing prompt builders assemble the role-specific
context that the scheduler, PR gates, QA repair lane, and knowledge pipeline
depend on, then expose that context as named loader inputs on the same bundle.

The catalog conversion reads each role's typed `agent.ts` definition, uses the
rendered PromptKit system prompt as the system prompt, and produces an
`AgentContextResolver` from the named context inputs. Live agent spawns load
that resolver through the kernel spawn pipeline. The kernel resolves the
declared inputs, emits context build and input resolution events, injects the
assembled context into the Pi session, and runs a short first-turn prompt that
tells the agent to use the injected context.

The rendered context packet remains the audit and preview artifact. Dry-run or
direct fallback execution composes that packet with the short first-turn prompt
when it cannot create a kernel-injected context message. This keeps one context
builder source of truth while still letting the kernel own live context
injection, lifecycle events, trace rows, and viewer summaries.

## Container Model

The project session maps to the kernel `appSessionId` and a root session
container. Containers are the portable grouping primitive the kernel viewer can
navigate without understanding Melee-specific state.

The durable `session_uuid` in `project_sessions` is the trace root identity.
The Melee kernel bridge derives a stable kernel app session id and root
container from `(project_id, session_uuid)`, and the dashboard stores the
returned trace pointers in `kernel_trace_json`. This keeps trace lineage stable
across display-name, branch, dashboard, or process restarts.

When the kernel runtime is available to the server process, creating a project
session writes the root session container and a `New session started` event
before setup work begins. Preparation then writes a `prepare` container below
the session root. Upstream sync/intake, missing PR indexing, knowledge refresh,
and baseline events are children of that prepare container, so the trace tree
shows the session boundary before the setup work it owns. Later session-boundary
workflow events, including Start Run, and agent runs write into that same trace
lineage.
Dashboard-owned workflow events that do not name an explicit session prefer
the active canonical project session UUID before falling back to legacy run
identity. Successful workflow trace events refresh
`kernel_trace_json.app_session_id`, `root_container_id`,
`active_container_id`, and `trace_url` on the project session row. The
dashboard uses `ORCH_AGENT_KERNEL_DATABASE_URL` or
`AGENT_KERNEL_DATABASE_URL` when set, otherwise it uses the local default
kernel database at
`postgres://agent_kernel:agent_kernel@127.0.0.1:55432/agent_kernel`.
`ORCH_AGENT_KERNEL_DISABLED=1` opts out. If the kernel runtime is disabled or
cannot initialize, the session row, operation log, and phase gates remain
authoritative, but the Trace page has no kernel rows to display.

Operator-facing trace views are session scoped. The trace workspace lists
durable project sessions for the selected project, selects the active session
by default, and then filters kernel rows to the selected session UUID.
Validation fixtures, synthetic kernel-flow sessions, and older raw kernel rows
may remain in the kernel database, but they are not peers of durable project
sessions in the workspace trace view. A session with no kernel rows remains
selectable; it is displayed as an empty trace tree rather than falling back to
unrelated raw kernel rows.

```text
project session container
  -> prepare
       -> sync-intake
            -> upstream head check
            -> newly merged upstream PR discovery
       -> pr-index
            -> newly merged PR intake
            -> missing PR record sync
            -> missing postmortem generation
       -> knowledge-refresh
            -> graph rebuild
       -> baseline
            -> baseline worktree
            -> full build

  -> run
       -> epoch-0001
            -> worker claim A
            -> worker claim B
            -> postmortem A
       -> epoch-0002
            -> ...

  -> pr
       -> handoff checkpoint
       -> QA
       -> split plan
       -> review and repair agents
       -> draft publication
```

The source isolation contract remains worktree-based. A worker container does
not replace the worker worktree; it names the traceable execution envelope
around that worktree, its prompt, tools, events, validation, and returned
artifacts.

## Project Worktrees

The project keeps one canonical upstream worktree and each session gets its own
current integration worktree. The upstream worktree is the stable baseline
source of truth: it answers "what is upstream now?" for baseline builds and
later comparisons. The session current worktree answers "what has this session
accepted so far?" and becomes the branch point for epochs, workers, and PR
handoff.

```text
projects/melee/
  checkout/
    -> control clone and object database
    -> fetches origin
    -> not rebased during New Session preparation

  worktrees/
    upstream-current/
      -> detached at latest origin/master
      -> canonical upstream baseline source
      -> baseline report/build artifacts

    sessions/
      <session-uuid>/
        current/
          -> session branch from the current upstream SHA
          -> accepted session work accumulates here

        session.json
          -> base SHA, active epoch, trace pointers, selected run config

        baseline/
          -> baseline reports and build logs for the session start

        epochs/
          0001/
            epoch.json
              -> start SHA, worker config, status, summary pointers

            start/
              -> report artifacts before workers mutate session current

            workers/
              <claim-or-worker-state-id>/
                source/
                  -> per-worker worktree branched from session current
                logs/
                artifacts/
                result.json

            integration/
              -> accepted, rejected, conflict, and queue artifacts

            end/
              -> post-epoch report artifacts after accepted merges

          0002/
            -> next epoch from the updated session current worktree

        pr/
          -> PR-slice worktrees and validation artifacts when handoff begins
```

The shape should stay clear:

- one canonical upstream baseline worktree for the project;
- one session current integration worktree for the active session;
- isolated worker worktrees under the epoch that spawned them;
- isolated PR worktrees when review slices are prepared.

## Run Configuration

The operator chooses the run shape before starting worker scheduling.

```text
Run config
  -> How much parallel work?
       -> number of workers

  -> How much model effort per worker?
       -> thinking level
       -> timeout, such as 50 minutes

  -> How large is one scheduling wave?
       -> epoch size, such as 256
       -> worker-slot target
       -> candidate window

  -> How often should the map refresh during the wave?
       -> batch rebuild size, such as every 32 completed workers
       -> fast graph refresh cadence

  -> What happens at epoch end?
       -> full build
       -> full graph update
       -> routing and save point
```

Epoch size, worker-slot target, candidate window, and batch rebuild size are
different knobs. They can share defaults, but the operator model should keep
their meanings separate.

## Run Loop

```text
Run mode
  -> Get epoch-size candidates from the ranked worker system
       -> Example: admit 256 candidates
       -> Exclude locked, cooled-down, or unschedulable work
       -> Keep enough ready work to feed the worker pool

  -> Drain the epoch with workers
       -> Spawn workers through the kernel until the epoch is drained
       -> Each worker gets its own isolated worktree
       -> Each worker gets a child container under the epoch container
       -> Each worker runs until timeout, exact completion, or runner stop
       -> Each worker returns work, artifacts, and a report

  -> Post-process worker returns
       -> Validate what came back
       -> Accept only work that survives the runner gates
       -> Queue a postmortem agent for reusable lessons
       -> Stage graph updates from facts, blockers, failures, and progress

  -> Refresh while the epoch is still running
       -> After batch rebuild size completions, do a quick graph refresh
       -> Keep the ranked queue current enough for the remaining epoch work
       -> Do not treat this as full compiled truth

  -> Finish the epoch
       -> Drain or recover active workers
       -> Run the full build
       -> Rebuild full report truth
       -> Rebuild Ghidra, opseq, mismatch, and graph evidence as needed
       -> Move every item to its authoritative lane
       -> Save the boundary

  -> Continue
       -> Pull the next epoch from the refreshed board
       -> Repeat until the operator stops or the run bound is reached
```

This keeps the shape simple: workers produce tentative evidence; post-processing
classifies it; epoch boundaries make the session's map authoritative again.

## Worker Worktree Shape

```text
epoch-0001/
  admitted-targets
    -> target A
    -> target B
    -> target C
    -> ...

  workers/
    <claim-a>/
      -> worktree for target A
      -> local validation artifacts
      -> worker-state checkpoint

    <claim-b>/
      -> worktree for target B
      -> local validation artifacts
      -> worker-state checkpoint

    <claim-c>/
      -> worktree for target C
      -> local validation artifacts
      -> worker-state checkpoint
```

Workers can be wrapped in containers when that is useful, but the source
isolation contract is the worktree: one worker, one claim, one bounded source
space.

Kernel containers are different from OS containers. A worker's kernel container
is the trace grouping around its prompt, context, tools, Pi session, subagents,
token spend, validation events, and worker-state summary. An OS container can still be
used later for process isolation, but it is not required for the kernel trace
model.

The desired completion posture is time-boxed. A worker may finish early for an
exact match or a runner decision, but durable classifications such as exact,
timeout, error, selected improvement, and rework routing should come from
runner validation and boundary routing rather than from an unverified model
claim alone.

## Postmortem And Graph Intake

```text
Worker returns
  -> Runner validates
       -> Did the work build locally?
       -> Did the target improve or match?
       -> Did neighbors regress?
      -> Did the worker stay inside the claim write set?
       -> Did QA rules flag anything?

  -> Postmortem agent summarizes
       -> useful facts
       -> failed hypotheses
       -> missing facts or tools
       -> review risks
       -> reusable source-shape lessons

  -> Knowledge system ingests
       -> graph facts
       -> blockers
       -> negative evidence
       -> target ranking signals
       -> future worker context
```

The system should value failed but grounded attempts. A clean "this did not
work, and here is why" is useful if it prevents the next worker from spending
the same budget again.

## Trace Event Contract

The trace stream is the durable explanation of what happened during a session.
Every event should carry enough identity to be rendered without reconstructing
state from timestamps or process logs.

```text
Trace identity
  -> appSessionId: project session id
  -> containerId: session, phase, epoch, worker, or PR child container
  -> spanId and parentSpanId when the event belongs inside a nested operation
  -> agentRunId when emitted by or for a kernel agent run
  -> claim, worker-state, target, PR slice, or artifact ids in event data when relevant
```

Kernel events cover the reusable execution path:

- agent and Pi lifecycle;
- prompt and context build lifecycle;
- tool calls and tool results;
- subagent spawn lineage;
- token usage and model metadata;
- warnings, errors, aborts, and stop semantics.

Harness events cover decomp-specific decisions:

- scheduler admission, claim, cooldown, and routing decisions;
- worktree creation, patch return, and write-safety checks;
- local build, objdiff, score, neighbor-regression, and QA validation;
- postmortem fact extraction and knowledge graph intake;
- epoch boundary routing and save points;
- PR checkpoint, QA, split, review, repair, publication, and next-session sync.

The dashboard should prefer trace reads over derived process logs for any view
that asks "what happened?" Logs remain useful for raw operation output, but
kernel traces are the source of lineage, attribution, and token accounting.

## Agent Migration

An agent is migrated when its canonical `agent.ts`, `prompt.ts`, `context.ts`,
and `tools.ts` files, output schema, validation contract, runtime spawn path,
artifacts, traces, and dashboard preview all resolve from the same agent-catalog
bundle. Listing loader kinds only in the dashboard is not a complete migration;
those loader kinds must become resolver inputs that the kernel can resolve,
inject, and trace during a live spawn.

The server bridge owns app-specific concerns: session and container identity,
trace writer plumbing, tool factories, Pi session binding, runtime config,
timeout handling, and artifact persistence. It is not a second agent definition
surface. Agent behavior lives in the catalog and prompt builders; the bridge
carries that definition into the kernel spawn pipeline.

Prompt preview migration is part of agent migration. When a prompt template,
placeholder, context injector, or kernel agent definition changes, the Agent
Viewer preview path must change with it so the UI never renders raw
`{{PLACEHOLDER}}` text or diverges from the real prompt builder.

## Dashboard Viewer Contract

The dashboard navigation should make the kernel transition visible without
changing the operator's run/PR control flow. The project rail carries the
stable workspace entries:

```text
Project workspace
  -> Overview
  -> Standards
  -> Knowledge
  -> Sessions
       -> Summary / Prepare setup / Run / PR Queue / Review / Artifacts
  -> Agents
  -> Trace
  -> Settings
```

`Agents` is the operator-facing prompt and agent-catalog surface. It shows the
kernel agent definitions, default models, tool profiles, rendered prompt
previews, loaded context summaries, and recent run identity for the selected
agent.

`Trace` is the operator-facing session trace surface. It should mount the
kernel trace viewer shell filtered to the selected project session container,
anchored by a session list that defaults to the active session UUID and
phase/subphase, with app-specific panels for targets, claims, score movement,
PR slices,
validation artifacts, and knowledge facts. The reusable viewer should render
the generic tree/detail span model; the harness should provide the Melee-aware
metadata around it.

## Epoch Boundary Routing

At the end of an epoch, the system turns tentative worker output into durable
lanes.

```text
Epoch boundary
  -> Full build and report refresh
  -> Full knowledge graph refresh
  -> Compare session branch against baseline

  -> Move exact matches
       -> ship candidates
       -> remove from future scheduling

  -> Move non-exact improvements
       -> carry-forward evidence
       -> high-value future targets

  -> Move regressions
       -> repair priority
       -> fix before shipping or route out of ship set

  -> Move fact needs
       -> knowledge, tool, or research lanes

  -> Move stalls
       -> cooldown unless new evidence appears

  -> Move rejected work
       -> negative evidence
       -> standards or QA lessons when relevant

  -> Admit next epoch
```

The epoch boundary is the point where "maybe" becomes "known enough to schedule
from." Before that, worker output is evidence. After that, the refreshed board
and graph decide what the next wave sees.

## PR Mode

PR mode begins when the operator stops autonomous worker scheduling. No new run
workers enter the session branch while the system is preparing reviewable
output. This is separate from merged-PR intake: merged upstream work is pulled
and folded into knowledge at the next session's start/sync boundary, not by a
PR-mode worker-drain action.

```text
PR mode
  -> Full build to see the whole session delta
       -> report all code, data, and build changes
       -> identify known regressions

  -> Fix known regressions
       -> try to repair broken matches, data regressions, and QA failures
       -> route anything unsafe out of the ship set

  -> Adversarial review every changed file
       -> mark exact places workers or fixers need to revisit
       -> include line number
       -> include violated standard or review risk
       -> include why it was flagged

  -> Queue fixers
       -> attempt inline standards fixes
       -> try not to lose exact matches
       -> if a fix cannot be completed, record the manual-review note
       -> consider whether the finding should become knowledge

  -> Final PR-phase build
       -> prove the reviewed/fixed session state still builds
       -> make sure regressions and QA findings are resolved or routed

  -> Split into smart PRs
       -> verified ship set only
       -> review-sized groups
       -> clear dependencies
       -> local PR worktrees before publication
```

The PR phase can drop or lower a worker's score-improving change if the change
violates project standards. A change that only works because it is
unreviewable, fragile, or maintainer-rejected is not a shipping win.

## Adversarial Review Output

The review agent should leave findings in a shape that a fixer or human can
act on without rediscovering the issue.

```text
Review finding
  -> file
  -> line number
  -> standard or risk
  -> why this is flagged
  -> suggested fix
  -> fixer result
       -> fixed
       -> dropped from ship set
       -> needs human comment
       -> should become a standards example
```

If the fixer cannot safely resolve a finding, the output should become a
specific PR comment or manual-review note. It should not become a vague warning
that something somewhere in the file is suspicious.

## Smart PR Flow

```text
Smart PR preparation
  -> Start from the verified ship set
       -> exact matches and required support files
       -> no unverified improvements
       -> no unresolved regressions

  -> Create split plan
       -> group by review shape, subsystem, and dependency
       -> keep PRs manageable
       -> avoid one-file noise when it can be combined cleanly
       -> keep shared/support changes explicit

  -> Prepare local PR worktrees
       -> apply each slice independently
       -> build and validate each slice
       -> keep private until the operator chooses a batch

  -> Open drafts for first human review
       -> operator reviews first
       -> operator adds comments
       -> fix comments
       -> rebuild branch
       -> push updates

  -> Open for external review
       -> pull reviewer comments
       -> fix comments
       -> full build
       -> push
       -> track unresolved comments and CI

  -> Feed lessons back
       -> decide whether reviewer comments should become standards examples
       -> intake merged PRs
       -> update knowledge before the next session
```

The first human review is a draft phase owned by the operator. External review
starts only after the operator has had the chance to catch obvious issues and
the system has rebuilt the branch after those fixes.

## Carry-Forward Contract

Not everything from a run ships. The session should preserve useful local work
without confusing it with PR-ready work.

```text
Session delta
  -> Ships
       -> exact matches that survive PR validation

  -> Carries forward
       -> non-exact improvements
       -> partial repairs
       -> unresolved but promising findings
       -> facts and negative evidence

  -> Readmits
       -> regressions
       -> QA failures
       -> standards violations
       -> missing-fact blockers

  -> Drops
       -> unsafe patches
       -> unreviewable tactics
       -> work invalidated by upstream
```

Merged PR intake closes the loop. After PRs merge, the project fetches
upstream, advances `worktrees/upstream-current`, indexes what merged, updates
the knowledge system, makes carry-forward rebases explicit when they are
needed, and only then allows the next baseline capture.

## Open Design Questions

- Should worker timeout be the primary stop rule, with needs/stall labels
  assigned mainly by post-processing?
- Should the quick graph refresh be based on completed worker count, elapsed
  time, or both?
- Should adversarial review findings enter the knowledge graph immediately, or
  only after an operator or maintainer confirms them?
- How much accepted worker output should land in the session branch before the
  epoch boundary versus remaining patch-only until the full rebuild?
- Should the first kernel-backed tracer bullet be a worker, which proves the
  hardest lineage, or a lower-risk boundary agent such as knowledge curator or
  PR indexer?
- Which app-specific trace events should become stable protocol factories, and
  which should remain open harness events rendered generically?
