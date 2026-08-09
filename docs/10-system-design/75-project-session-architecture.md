---
concepts: [project, session, run-mode, pr-mode, active-session, dashboard, review-loop]
---

# Project Session Architecture Mockup

Project-scoped session architecture, single active session rule, run-to-PR lifecycle, and multi-page dashboard model.

This is the target architecture sketch for moving the orchestrator from a
single live dashboard into a project-centered system. The project owns durable
standards, knowledge, tools, and access inventory. A session owns one baseline
and the work performed against it: first autonomous run mode, then PR mode.

## Top-Level Shape

```text
Orchestrator
+-- Projects
|   +-- Project
|   |   +-- identity
|   |   |   +-- name
|   |   |   +-- upstream repository
|   |   |   +-- local checkout
|   |   |   +-- state location
|   |   +-- standards
|   |   |   +-- coding rules
|   |   |   +-- decomp constraints
|   |   |   +-- PR review rules
|   |   |   +-- banned patterns
|   |   +-- knowledge
|   |   |   +-- source facts
|   |   |   +-- past PR lessons
|   |   |   +-- mismatch patterns
|   |   |   +-- review exhibits
|   |   +-- tools
|   |   |   +-- build commands
|   |   |   +-- objdiff/report commands
|   |   |   +-- validation commands
|   |   |   +-- PR commands
|   |   +-- dashboard inventory
|   |   |   +-- what can be run
|   |   |   +-- what is configured
|   |   |   +-- what is missing
|   |   |   +-- what currently has authority
|   |   +-- active session pointer
|   |   +-- session ledger
|   |       +-- historical sessions
|   |       +-- archived artifacts
|   |       +-- merged PR intake records
```

The project is the stable object an operator opens. It answers "what do we
have access to?" before it answers "what is running?". A project can have many
past sessions, but at most one active session.

## Session Shape

```text
Project
+-- Active Session
|   +-- baseline
|   |   +-- upstream ref
|   |   +-- upstream commit
|   |   +-- local branch root
|   |   +-- starting report
|   +-- run mode
|   |   +-- run branch
|   |   +-- bounds
|   |   |   +-- manual stop
|   |   |   +-- epoch limit
|   |   |   +-- time limit
|   |   |   +-- score/progress goal
|   |   +-- epochs
|   |   |   +-- epoch
|   |   |       +-- admitted target set
    |   |   |       +-- workers
    |   |   |       |   +-- target claims
    |   |   |       |   +-- worker states
    |   |   |       |   +-- checkpoints
    |   |   |       |   +-- artifacts
|   |   |       +-- boundary checkpoint
|   |   |       +-- repair routing
|   |   +-- run summary
|   +-- PR mode
|   |   +-- ship set
|   |   +-- split plan
|   |   |   +-- PR slices
|   |   |   +-- dependencies
|   |   |   +-- file manifests
|   |   +-- QA rounds
|   |   |   +-- deterministic checks
|   |   |   +-- reviewer checks
|   |   |   +-- fixer attempts
|   |   |   +-- final dispositions
|   |   +-- local PR workspace
|   |   |   +-- PR objects
|   |   |   +-- local branches
|   |   |   +-- persistent worktrees
|   |   |   +-- validation summaries
|   |   |   +-- publication batches
|   |   +-- draft PRs
|   |   |   +-- branches
|   |   |   +-- draft URLs
|   |   |   +-- CI state
|   |   |   +-- review state
|   |   +-- human review loop
|   |       +-- requested changes
|   |       +-- AI fix rounds
|   |       +-- re-verify
|   |       +-- ready for maintainer
|   +-- completion
|       +-- merged PR intake
|       +-- carry-forward ledger
|       +-- next baseline recommendation
```

The session is the operator-facing unit of work. A run is not a top-level
project object in this model; it is the autonomous work phase inside the
session. PR mode is the second half of the same session, not a separate
afterthought.

## Implemented Canonical State

The active session is represented by the SQLite `project_sessions` table. This
table is the canonical workflow state root for a project session; it does not
replace detailed run, PR, save-point, process, or kernel trace records.

```text
project_sessions
  id
  project_id
  session_uuid
  status                  idle | active | blocked | complete
  phase                   preparing | running | pr | complete
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

A partial unique index enforces one active or blocked project session per
project. Completed sessions remain as history and can be superseded by the next
active row.

Each phase JSON object stores the same small envelope:

```text
status
subphase
subphase_detail
started_at
completed_at
blockers
```

The active phase selects the active phase object. `activeSubphase` in API/UI
payloads is derived from `phase` plus the phase JSON object; it is not a second
stored truth source. Known subphase vocabularies remain phase-local and include
an `other` escape hatch with `subphase_detail`.

`running_state_json` records stop reasons and manual stop modes. The accepted
stop reasons are `hit_100_percent`, `manual_stop`, `error`, and `other`; manual
stops can be `finish_epoch` or `hard_stop`. A hard stop or error can be forced
into PR, but PR always starts at `final_build`. QA and later PR subphases are
guarded until the final build is recorded complete.

`process_state_json` stores enough `melee-live` identity to reconnect a
detached process after the UI/server restarts: process name, project id,
session uuid, status, pid/process group, process file path, command, repo root,
state dir, graph DB path, and timestamps. `kernel_trace_json` stores the
session UUID, derived app session id, and container pointers.

The server exposes this state through a `projectSession` dashboard payload and
`/api/project-session/*` operator gates. The dashboard renders phase,
subphase, gates, blockers, process recovery, and trace identity from that
server-owned projection instead of inferring workflow state from scattered
run/process/PR evidence.

The implemented source ownership is role-based and uses three server roots:

- `apps/server/src/core/project-session/`: state vocabulary, defaults,
  normalization, gates, blockers, projection, durable store, stable identifiers,
  and process-state shaping.
- `apps/server/src/core/session-runtime/`: the thin phase dispatcher and
  phase-owned runtime modules for `preparing`, `running`, `pr`, and
  `complete`.
- `apps/server/src/core/knowledge/`, `apps/server/src/core/tools/`, and
  `apps/server/src/core/agent-catalog/`: domain knowledge, tool profiles, prompt
  registry contracts, and role definitions.
- `apps/server/src/core/project-registry/`: project descriptors, resolved
  project defaults, and project-aware job option parsing.
- `apps/server/src/application/dashboard/`: dashboard read models and
  operation/process status projections.
- `apps/server/src/application/jobs/`: server job dispatch entrypoint.
- `apps/server/src/infrastructure/`: raw adapters for shell execution, SQLite,
  env loading, kernel/Pi runtime, managed process control, HTTP, and saved
  process files.
- `apps/server/src/api/project-session/`: HTTP route boundary for canonical
  session reads and operator gates.
- `apps/server/src/api/routes/`: dashboard, run, process-control, PR handoff,
  kernel, knowledge, and validation HTTP route boundaries.

## Branch Shape

```text
upstream baseline
    |
    +-- session branch
            |
            +-- run mode accumulates verified worker changes
            |
            +-- PR mode derives draft PR branches from verified slices
                    |
                    +-- draft PR branch A
                    +-- draft PR branch B
                    +-- draft PR branch C
```

The session branch is the workbench for the whole session. Run mode writes
there under epoch, claim, and score-gate rules. PR mode does not keep adding
new autonomous run work; it packages the verified part of that branch into
reviewable local PR worktrees first. Only an explicit bounded publication batch
pushes local-ready PR objects as GitHub drafts; the remaining local PRs stay
private and keep their validation/repair state until the operator chooses the
next batch. Draft branches then stay aligned during QA and human review.

## Lifecycle

```text
project ready
    |
    v
session opened
    |
    v
baseline captured
    |
    v
run mode active
    |
    +-- epoch admitted
    |       |
    |       v
    |   workers run target claims
    |       |
    |       v
    |   epoch checkpoint and refresh
    |       |
    |       +-- continue running while bounds allow
    |
    +-- manual stop or bound reached
            |
            v
run complete
    |
    v
PR mode active
    |
	    +-- split ship set into PR slices
	    +-- run QA and preship review
	    +-- fix or drop blocked items
	    +-- prepare local PR worktrees
	    +-- open bounded draft batches
	    +-- run human/AI review loop
    |
    v
PRs merged, closed, or abandoned
    |
    v
merged PR intake and rebase
    |
    v
session completed
```

Run completion can be operator-driven or policy-driven. The important boundary
is that completing run mode stops new autonomous source changes from entering
the checkout. From there, the system packages, verifies, fixes, and presents
the session's work.

## Single Active Session Rule

A project may have only one active session. "Active" includes both run mode and
PR mode. A new session can begin only after the previous session has fully
resolved its PR work and the project has captured a fresh baseline.

The rule exists because the baseline is a shared truth source. While PRs are
open, upstream can merge related work, maintainers can request changes, slices
can be dropped, and local carry-forward work can change shape. Continuing a
new autonomous run during that period would generate evidence against a moving
target and force the system to explain which branch, PR slice, and baseline
each fact belongs to.

The project gate should block a new session when any of these are true:

- The active session is still running workers or has active claims.
- The active session is in PR mode with planned, draft, open, or
  changes-requested PRs.
- The active session has merged PRs that have not been intaken and reconciled.
- The local branch contains carry-forward work that has not been measured
  against the next baseline.

The project can still show historical sessions, artifacts, PR status, and
knowledge while the gate is closed. The restriction is on starting another
autonomous run, not on inspecting or repairing the active session.

## Dashboard Pages

```text
Dashboard
+-- Projects
|   +-- project cards
|   +-- active session summary
|   +-- access/configuration warnings
|
+-- Project Home
|   +-- current baseline and branch
|   +-- active session gate
|   +-- recommended next action
|   +-- standards summary
|   +-- knowledge summary
|   +-- tools summary
|
+-- Project Access
|   +-- standards browser
|   +-- knowledge browser
|   +-- tool inventory
|   +-- missing capability checks
|
+-- Active Session
|   +-- session timeline
|   +-- mode switch: run mode or PR mode
|   +-- save points and artifacts
|
+-- Run Mode
|   +-- bounds and run setup
|   +-- epoch table
|   +-- worker table
|   +-- admitted targets and claims
|   +-- run logs
|
+-- PR Mode
|   +-- ship set
|   +-- split plan tree
|   +-- QA rounds
|   +-- draft PR board
|   +-- human review loop
|
+-- Session History
    +-- completed sessions
    +-- PR intake history
    +-- carry-forward ledger
    +-- archived artifacts
```

The project home replaces the current "everything on one page" pressure with
an inventory-first landing point. The active session page can still feel like a
control room, but the project-level pages make standards, knowledge, tools,
and history browseable without competing with live worker telemetry.

## Mode-Specific UI

Run mode should optimize for live control and observability:

- Is the run allowed to continue?
- Which epoch is active?
- Which workers hold claims?
- What did the last boundary checkpoint prove?
- What bound will stop the run?

PR mode should optimize for review readiness:

- Which files are in the ship set?
- How were they split?
- Which QA round or reviewer finding blocks a slice?
- Which drafts exist and what is their remote state?
- What human feedback needs an AI fix round?

The same session timeline should remain visible in both modes. The UI changes
the work surface, not the identity of the session.

## State Invariants

- Project policy is snapshotted into the session at baseline capture so later
  project-default edits do not rewrite what an old run meant.
- Epochs belong to run mode and cannot be added after the session enters PR
  mode.
- PR slices belong to PR mode and are derived from the completed run summary.
- Draft PR records outlive the local split-plan artifact because review,
  comments, CI, and merge state happen outside the local checkout.
- Carry-forward work belongs to the project ledger after session completion,
  but each item keeps provenance back to the session that produced it.
- Merged PR intake closes the loop by updating project knowledge before the
  next session baseline is captured.

## Open Decisions

- Whether the project dashboard should show all configured tools equally or
  separate "available now" from "known but unavailable".
- Whether a session may be abandoned while PRs are open, and what explicit
  cleanup state that requires.
- Whether the human review loop should be per PR slice, session-wide, or both.
- Whether PR mode should allow limited repair workers under PR-slice claims, or
  only named fixer/reviewer agents.
