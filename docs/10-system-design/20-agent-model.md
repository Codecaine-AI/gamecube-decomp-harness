---
concepts: [agents, scheduler, worker-agent, integration-resolver, pr-indexer, pr-splitter, pr-reviewer, pr-fixer, runtime, run-loop, guardians]
---

# Agent Model

Centralized agent catalog, runtime role boundaries, and non-agent run-loop/guardian actors.

The orchestrator has a small set of named agents with explicit boundaries. New
agents should be added to the central catalog and given a colocated prompt,
input builder, runtime integration, and output contract when the agent owns a
structured result.

The package also has evented process actors such as the deterministic run loop
and the guardian process. They make rule-based
decisions and sleep between events, but they are not Pi agents. They own process
and state-machine mechanics, including target admission and worker-slot
realization.

## Roles

| Agent | Owns | Does Not Own |
| --- | --- | --- |
| Worker | One claimed target packet, research, edits, local validation readiness, and checkpoint note evidence | Board strategy, cross-worker coordination, edits outside the claim write set |
| Integration resolver | Running-phase worker-output conflict queue items: failed checkpoint patch applies, conflict groups, explicit write-set merges, worker-output dispositions, and validation evidence before PR handoff | Board scheduling, ordinary clean checkpoint integration, PR QA repair, PR comments, upstream-sync reconcile policy |
| PR indexer | PR postmortem indexing and reusable review knowledge | Live decomp worker execution, scheduler admission, preship findings |
| PR splitter | Review-sized PR series planning from deterministic handoff evidence: slice grouping, order, titles, dependencies, and PR-body focus | Deciding which files ship, source edits, GitHub publication, scheduler admission |
| PR reviewer | Planned/opened PR slice review and maintainer-risk findings | Knowledge curation, source repairs, scheduler admission |
| PR fixer | Opened-PR feedback repair: maintainer comments, review-thread findings, focused source edits, validation evidence, and manual-review notes | Bundle-wide regression recovery, deterministic QA queue ownership, GitHub thread mutation |
| Knowledge-curator | Reducing worker/PR evidence into graph-safe lessons and proposal-only source updates | Direct graph mutation, scheduling, decomp attempts |
| Reconcile | Making a bundle safe at run-cycle boundaries: fixing QA regressions before PR handoff (`ship-validate`) and resolving merge conflicts, duplicate work, and build errors after an upstream sync (`sync-merge`) | Board scheduling, claim-scoped worker tactics, knowledge graph mutation, publishing PRs |

The integration resolver is a rare running-phase agent. Normal clean worker
checkpoint applies do not need it; the runner uses it only when a completed
worker output queue item cannot be applied cleanly or a conflict group needs
source-level reconciliation before the epoch can accept or reject the output.
It stays pre-PR: it does not own PR review comments, deterministic PR QA queue
items, or upstream sync repair.

The reconcile agent is deliberately not a worker capability. It needs
whole-checkout authority - merging, rebuilding, multi-file regression fixes -
that the claim/write-set model denies workers, and it only runs while
worker scheduling is locked (run paused or no session active). When
upstream already matched a function held locally, upstream wins; the local
attempt is preserved as lesson evidence for the curator pipeline, not as code.

## Process Actors

| Actor | Owns | Does Not Own |
| --- | --- | --- |
| Trigger actor | Durable wake-event reaction, deterministic scheduler ticks, epoch admission, worker-slot realization, sleep between board events | Source edits, model-driven board strategy, process crash repair |
| Guardian process | Decomp system process health, incident capture, failed/expired claim recovery, restart policy | Target selection, worker tactics, hidden always-on agent memory |

## Runtime Boundary

The non-agent runner owns process control, state transitions, scheduler epochs,
target claims, explicit write sets, artifact paths, and Pi session invocation.
Agents own target-local or boundary-specific reasoning and structured outputs. This split keeps
coordination deterministic while still letting agents make high-context
decisions where they are useful. The guardian may decide that a process incident
needs recovery, but the runtime materializes that intent as claim recovery
commands and process restarts.

## Prompt Shape

Each agent receives:

- A system prompt that defines authority, role boundaries, safety rules, and
  any structured output contract the role owns.
- An initial user prompt that contains the current run state or assigned target
  packet, selected context, available resources/tools, and required output path.

Rendered prompts are artifacts. They are part of the audit trail and should be
preserved beside agent output.

## Adding Agents

A new agent should enter through the same catalog as the worker, integration
resolver, PR indexer, PR splitter, PR reviewer, PR fixer, knowledge-curator,
reconcile, and QA repair agents. It should not create a side-channel prompt tree or hidden runtime path. The package should have one
obvious place to discover every agent role and its contract.
