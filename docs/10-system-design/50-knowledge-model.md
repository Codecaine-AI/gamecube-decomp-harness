---
covers: Runtime knowledge references, workflows, tools, resources, and PR evidence
concepts: [knowledge, references, workflows, tools, resources, past-prs]
---

# Knowledge Model

Runtime knowledge is package-owned material selected into agent prompts. It is
not a Codex skill and it is not a generic pack system. The current model
separates knowledge into references, workflows, tools, decomp resources, and
past PR evidence.

## Knowledge Types

| Type | Purpose |
| --- | --- |
| References | Durable guidance about scheduling, Melee decomp workflow, matching tactics, resources, and review standards |
| Workflows | Procedure-level playbooks such as targeted iteration or opt-in experimental search |
| Tools | Scripts that rank targets, gather context, refresh PR data, or analyze experiment output |
| Decomp resources | Local indexes, CSV exports, external reference notes, and acquisition manifests |
| Past PRs | Searchable PR dumps and postmortem records used as evidence for workers and PR-review agents |

## Selection

The director gets scheduling policy by default. Workers get Melee overview,
targeted iteration, resource-guided research, matching tactics, and review
standards by default. Capability hints add focused references or workflows.

This keeps the default worker posture careful and evidence-backed. Broader
experimental search and permuter handoff enter only when a packet or capability
route asks for them.

## Resource Contract

Knowledge material should make agents better at choosing grounded next moves.
It should not swamp prompts with the whole repository or encourage random
sweeps. Useful knowledge names exact sources, explains when it applies, and
preserves provenance so facts can be checked later.

## Maintenance

When adding knowledge, decide whether it is a reference, workflow, tool,
resource, or past-PR artifact. Add it through the manifest and keep archived
legacy material out of default prompt routes.
