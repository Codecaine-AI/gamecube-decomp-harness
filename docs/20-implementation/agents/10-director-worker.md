---
covers: Worker prompt builders, target packets, and output contracts
concepts: [worker-agent, scheduler, target-packet, prompts, output]
code-ref: decomp-orchestrator/packages/agents/src/worker
---

# Worker Agents And Scheduler Delegation

The worker slice is the live run agent surface. Board-level target admission and
wake-event handling are deterministic scheduler responsibilities; worker Pi
sessions receive one leased target and return durable evidence.

## Scheduler Delegation

The scheduler chooses queue rows from durable state and graph-ranked board
features. It does not render a board-level prompt. The worker prompt receives
the target-local packet that was already selected, leased, and locked by the
runtime.

## Worker Slice

The worker slice builds prompts for one leased target. It carries the target
packet, write-set rule, local regression requirements, selected worker context,
resource map, optional repair request, and output contract. The worker return
path gates durable report data through the post-return repair loop before the
runner releases the lease.

| File | Purpose |
| --- | --- |
| `packages/agents/src/worker/packet.ts` | Defines the target-packet shape passed into worker prompts. |
| `packages/agents/src/worker/prompt.ts` | Builds worker prompt inputs and rendered prompt pair. |
| `packages/agents/src/worker/output.ts` | Parses worker output/report content and evaluates return-gate repair reasons. |
| `packages/agents/src/worker/templates/system.md` | Defines worker authority, write safety, and validation rules. |
| `packages/agents/src/worker/templates/initial_user.md` | Carries the target packet, selected worker context, resources, repair requests, and report contract. |

## Key Rules

- The scheduler owns target admission, queue ordering, refill, and routing.
- The worker must stay inside its lease and write set.
- Rendered prompts are artifacts and are written beside Pi output.
- Dry-run prompts and live Pi prompts use the same builders.
- Worker context is selected by role defaults and capability routes before
  prompt rendering.
- Unsafe worker returns can be bounced back with `repair_request` before the
  lease is released.

## Related

- [Run scheduler loop](../../10-system-design/10-run-director-loop.md)
- [Worker lifecycle](../../10-system-design/40-worker-lifecycle.md)
- [Agent runtime](30-runtime.md)
