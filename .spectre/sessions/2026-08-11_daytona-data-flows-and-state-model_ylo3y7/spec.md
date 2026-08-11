# Spec

## Overview

Clarify the orchestrator's system-design documentation before Daytona execution is implemented. The work is interview-driven and proceeds one design document or tightly coupled design slice at a time. It distinguishes the current implementation, the intended near-term architecture, and unresolved choices.

## Problem Statement

The system-design docs do not yet define phase state, workflow transitions, and cross-component data movement precisely enough to guide a Daytona implementation with complete tracing. They may also preserve assumptions from an older process. In particular, incoming pull requests, synchronization with the upstream project, rebasing, agent handoffs, and failure/recovery behavior are not represented as a coherent first-class workflow.

## Goals

### High-Level Goals

- Produce an implementation-ready architectural blueprint for Daytona-backed orchestration.
- Make every important state transition and data handoff traceable.

### Mid-Level Goals

- Define the conceptual state structures owned by each runtime phase.
- Define primary, retry, recovery, and operator-intervention workflows.
- Make incoming PR discovery, synchronization, rebase, review, repair, and handoff first-class flows.
- Reconcile outdated documentation with the intended process without confusing current and target behavior.

### Detailed Goals

- Review the system-design layer in a dependency-aware order.
- Confirm decisions through short interview rounds before updating canonical docs.
- Record inputs, outputs, ownership, invariants, transition triggers, correlation identifiers, and trace boundaries for each flow.
- Make the state model directly usable by an operator UI that explains current state, available actions, and why unavailable actions are blocked.

## Non-Goals

- Implement Daytona during this interview.
- Treat implementation-specific types or modules as the architecture.
- Rewrite unrelated knowledge-system documentation unless a dependency requires it.

## Success Criteria

- [ ] Each runtime phase has a clear conceptual state shape and ownership boundary.
- [ ] Primary workflows have explicit triggers, transitions, inputs, outputs, and terminal outcomes.
- [ ] Incoming PR and rebase workflows are first-class and cover conflicts, retries, and operator decisions.
- [ ] Trace and correlation requirements can be derived from the documented flows without guessing.
- [ ] System-design documents use consistent terms and do not contradict each other.
- [ ] Current behavior, target Daytona behavior, and unresolved decisions are visibly distinct.

## Context & Background

Many changes are landing concurrently, including changes in runtime phases, PR handling, workers, validation, knowledge, tools, and UI tracing. Existing system-design docs are also modified in the working tree, so edits must preserve concurrent work and be made only after decisions are confirmed.

## Design

### Interview method and design order

The interview starts by expanding the cross-cutting state-and-events document into a state-machine section for the whole project. The first object to define is the autonomous running object. Once that is stable, the interview follows its subordinate epoch/worker state and its handoff into PR state. Daytona is treated as an execution boundary that must receive an explicit work packet and return durable evidence, rather than as the source of orchestration truth.

Merged-PR discovery and intake are not assumed to be a top-level lifecycle phase. Incoming material is processed into project knowledge. The likely design is a refresh/reconciliation workflow with explicit readiness evidence, whose outputs are snapshotted or referenced by a run, rather than an `intake` phase that owns the session.

The project itself should not be modeled as one exclusive lifecycle. Run control, worker execution, knowledge ingestion, and PR review have different responsibilities and may operate concurrently. Each uses a domain-specific status vocabulary inside a shared identity/version/tracing envelope. Cross-process invariants and immutable snapshot references coordinate them.

The first run-state proposal separates durable run status from scheduler condition. Long-running transition work is represented as operations rather than adding transient statuses such as `starting` or `completing`. Available UI actions are derived from canonical state plus structured blockers.

For every slice, the interview captures:

1. Owned state and identifiers.
2. Entry trigger and admission conditions.
3. Data handed to agents or external execution.
4. Events, artifacts, and state transitions returned.
5. Retry, cancellation, stale-input, and operator-intervention behavior.

## Notes

- User specifically called out outdated phase state and missing first-class new-PR/rebase handling.
- User wants the current `03-state-and-events` document expanded into a folder that defines whole-project state, concrete state objects, events, allowed actions, and UI projections.
- The state machine must support a viewing UI that can answer: what state is active, what actions are allowed, and why other actions are blocked.
- First interview target: the actual autonomous running object and its state transitions.
- Intake is becoming lightweight because its durable result belongs in the knowledge base; it should not automatically remain a first-class session phase.
- The user clarified that knowledge sinks operate continuously in the background: Discord pipelines and completed worker results are processed while run and PR work may also be active.
- The working direction is therefore a project aggregate of concurrent state machines rather than one global phase enum.
- An iterative design report now lives at `docs/.drafts/design.interview.md` with proposed state values, action gates, and open questions.
- Canonical docs use structured `doc.json` documents rather than plain Markdown.
- No canonical design docs should be changed until the corresponding interview decision is confirmed.
