---
covers: Worker prompt builders, integration conflict resolver, claimed target packets, checkpoint notes, and runner validation ownership
concepts: [worker-agent, integration-resolver, scheduler, target-packet, target-claim, checkpoint-note, prompts, output]
code-ref: decomp-orchestrator/apps/server/src/core/agent-catalog/agents/running
---

# Worker Agents And Scheduler Delegation

The worker slice is the primary live run agent surface. Board-level target
admission and wake-event handling are deterministic scheduler responsibilities;
worker Pi sessions receive one claimed epoch target and work toward an exact
match while the runner records durable evidence. The running phase also owns the
`integration-resolver` agent, which is reserved for rare worker-output queue
items where a selected checkpoint patch cannot be applied cleanly before PR
handoff.

## Scheduler Delegation

The scheduler chooses epoch targets from durable state and graph-ranked board
features. It does not render a board-level prompt. The worker prompt receives
the target-local packet that was already admitted into the active epoch and
claimed by the runtime.

## Worker Slice

The worker slice builds prompts for one claimed epoch target. It carries the
target packet, write-set rule, local regression requirements, selected worker
context, resource map, optional repair request, and checkpoint-note guidance.
The worker return path lets the runner validate the current worktree, record a
`worker_checkpoints` row, and either continue the same worker session under the
bounded attempt-tail policy or close the paired `worker_state`.

| File | Purpose |
| --- | --- |
| `apps/server/src/core/agent-catalog/agents/running/integration-resolver/` | Defines the pre-PR worker-output integration conflict agent, prompt, schema, context loaders, and tool metadata. |
| `apps/server/src/core/agent-catalog/agents/running/worker/packet.ts` | Defines the target-packet shape passed into worker prompts. |
| `apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts` | Defines the stable PromptKit system prompt and builds the final prompt bundle. |
| `apps/server/src/core/agent-catalog/agents/running/worker/context.ts` | Declares worker context loaders and builds the injected worker context packet. |
| `apps/server/src/core/agent-catalog/agents/running/worker/checkpoint-note.ts` | Parses optional compact worker checkpoint-note metadata. |
| `apps/server/src/core/agent-catalog/agents/running/worker/review-lint.ts` | Evaluates runner-side review lint over the worker write-set diff. |
| `apps/server/src/core/agent-catalog/agents/running/worker/runner-validation.ts` | Defines the runner-owned validation summary type used by worker change validation. |
| `apps/server/src/core/agent-catalog/agents/running/worker/agent.ts` | Defines kernel metadata and wires the worker prompt, context, and tools. |
| `apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts` | Owns the PromptKit system prompt and checkpoint-note guidance. |
| `apps/server/src/core/agent-catalog/agents/running/worker/context.ts` | Owns the target packet, selected worker context, resources, repair requests, standards, available tools, and graph file card context. |

## Integration Resolver

The integration resolver runs after worker completion and before PR mode. It
receives an explicit integration conflict queue item, not a PR review item. The
item contains failed apply evidence, selected worker checkpoint metadata, patch
paths, conflict paths, and write sets. The agent resolves only that conflict
group, returns `melee_integration_resolver_result_v1`, and records how each
worker output was applied, partially applied, dropped, or superseded.

```text
worker_state closes
  -> selected worker_checkpoint
       -> integration queue item
            |
            +-- clean apply
            |     -> current epoch/session root
            |     -> runner records applied disposition
            |
            +-- failed apply or conflict group
                  -> integration-resolve job
                       -> integration-resolver agent
                       -> resolved source in current root
                       -> runner records dispositions and validation evidence
```

`apps/server/src/core/session-runtime/phases/running/integration/` exposes the
`integration-resolve` job for this runtime path. The job records Pi sessions as
role `integration-resolver` and uses kernel spawn kind `worker-integration` so
Trace places the session under the running epoch. The runner remains the owner
of queue mutation, epoch acceptance, and full validation after the agent returns.

## Key Rules

- The scheduler owns target admission, epoch ordering, worker-slot pressure, and routing.
- The worker must stay inside its target claim and explicit write set.
- The integration resolver must stay inside the supplied conflict group and
  explicit write sets.
- Rendered prompts are artifacts and are written beside Pi output.
- Dry-run prompts and live Pi prompts use the same builders.
- Worker context is selected by role defaults and capability routes before
  prompt rendering.
- Unsafe or non-exact worker returns can be bounced back with `repair_request`
  before the worker state is closed, but continuation is bounded by the runner.
- A selectable improvement is saved immediately, then the worker receives at
  most three follow-up checkpoints unless it finds a higher best or exact.
- A 100% target score that fails hard gates is not selectable exact; it becomes
  a bounded gate-repair continuation with at most three follow-up checkpoints.

## Related

- [Run scheduler loop](../../10-system-design/10-run-director-loop.md)
- [Worker lifecycle](../../10-system-design/40-worker-lifecycle.md)
- [Agent runtime](30-runtime.md)
