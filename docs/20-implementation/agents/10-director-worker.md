---
covers: Director and worker prompt builders, packets, and output contracts
concepts: [director-agent, worker-agent, target-packet, prompts, output]
code-ref: decomp-orchestrator/src/agents/director, decomp-orchestrator/src/agents/worker
---

# Director And Worker Agents

The director and worker slices are the core run agents. They share the runtime
invocation path but keep role-specific prompts and output contracts separate.

## Director Slice

The director slice builds prompts for one board-level decision cycle. It renders
the director system prompt, current state, candidate targets, selected
knowledge, and wake event context. The director output parser extracts
structured scheduling decisions from the Pi response.

| File | Purpose |
| --- | --- |
| `src/agents/director/prompt.ts` | Builds the director prompt inputs and rendered prompt pair. |
| `src/agents/director/output.ts` | Parses director output into target-packet style decisions. |
| `src/agents/director/templates/system.md` | Defines director authority and scheduling role. |
| `src/agents/director/templates/initial_user.md` | Carries run state, board summary, wake event, and knowledge. |

## Worker Slice

The worker slice builds prompts for one leased target. It carries the target
packet, write-set rule, local regression requirements, selected knowledge,
resource map, and output contract. The worker parser handles durable report
data for the runner.

| File | Purpose |
| --- | --- |
| `src/agents/worker/packet.ts` | Defines the target-packet shape passed into worker prompts. |
| `src/agents/worker/prompt.ts` | Builds worker prompt inputs and rendered prompt pair. |
| `src/agents/worker/output.ts` | Parses worker output/report content. |
| `src/agents/worker/templates/system.md` | Defines worker authority, write safety, and validation rules. |
| `src/agents/worker/templates/initial_user.md` | Carries the target packet, selected knowledge, resources, and report contract. |

## Key Rules

- The director does not perform source research or edits.
- The worker must stay inside its lease and write set.
- Rendered prompts are artifacts and are written beside Pi output.
- Dry-run prompts and live Pi prompts use the same builders.
- Knowledge is selected by role defaults and capability routes before prompt
  rendering.

## Related

- [Run director loop](../../10-system-design/10-run-director-loop.md)
- [Worker lifecycle](../../10-system-design/40-worker-lifecycle.md)
- [Agent runtime](30-runtime.md)
