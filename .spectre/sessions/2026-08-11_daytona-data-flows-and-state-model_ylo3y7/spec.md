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

The interview starts with the cross-cutting state-and-events contract, then follows the runtime lifecycle: intake and sessions, running, workers, and ship/PR. Daytona is treated as an execution boundary that must receive an explicit work packet and return durable evidence, rather than as the source of orchestration truth.

For every slice, the interview captures:

1. Owned state and identifiers.
2. Entry trigger and admission conditions.
3. Data handed to agents or external execution.
4. Events, artifacts, and state transitions returned.
5. Retry, cancellation, stale-input, and operator-intervention behavior.

## Notes

- User specifically called out outdated phase state and missing first-class new-PR/rebase handling.
- Canonical docs use structured `doc.json` documents rather than plain Markdown.
- No canonical design docs should be changed until the corresponding interview decision is confirmed.
