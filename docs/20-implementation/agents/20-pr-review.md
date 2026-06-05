---
covers: PR-review agent slice and relationship to package-owned PR knowledge
concepts: [pr-review-agent, pr-knowledge, schema, prompts, postmortems]
code-ref: decomp-orchestrator/src/agents/pr-review, decomp-orchestrator/knowledge/past_prs
---

# PR-Review Agent

The PR-review agent is the centralized agent surface for PR analysis and
postmortem-style review knowledge. It lives beside the director and worker
agents so future PR review behavior has one canonical agent slice.

## Files

| File | Purpose |
| --- | --- |
| `src/agents/pr-review/index.ts` | Exposes the PR-review agent definition to the registry. |
| `src/agents/pr-review/prompt.ts` | Builds PR-review prompt inputs. |
| `src/agents/pr-review/schema.json` | Defines the structured output contract. |
| `src/agents/pr-review/templates/system.md` | Defines review role, standards, and output expectations. |
| `src/agents/pr-review/templates/initial_user.md` | Carries the PR-specific user prompt. |

## Knowledge Relationship

The package still owns historical PR data under `knowledge/past_prs/`. That
directory contains current dumps, searchable postmortem records, and refresh
utilities. Legacy mirrored PR-agent prompt material can remain there as source
data, but the canonical live PR-review agent definition is in `src/agents/pr-review/`.

## Key Rules

- PR-review is a named agent in the same registry as director and worker.
- PR-review prompt/schema changes should happen in the agent slice, not in
  scattered scripts.
- PR knowledge refresh utilities update the evidence library; they do not
  replace the centralized agent definition.

## Related

- [Knowledge implementation](../knowledge/00-overview.md)
- [Agent model](../../10-system-design/20-agent-model.md)
