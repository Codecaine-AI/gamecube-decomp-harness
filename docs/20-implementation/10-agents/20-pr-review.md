---
concepts: [pr-indexer, pr-splitter, pr-reviewer, pr-knowledge, pr-planning, preship-review, draft-pr-qa, qa-ship-gate, pr-fixer]
---

# PR Indexer, Splitter, Reviewer, And Fixer Agents

PR indexer, PR splitter, and PR reviewer agent slices.

Sources: [apps/server/src/core/agent-catalog/agents/knowledge/pr-indexer](/apps/server/src/core/agent-catalog/agents/knowledge/pr-indexer), [apps/server/src/core/agent-catalog/agents/pr/splitter](/apps/server/src/core/agent-catalog/agents/pr/splitter), [apps/server/src/core/agent-catalog/agents/pr/reviewer](/apps/server/src/core/agent-catalog/agents/pr/reviewer), [apps/server/src/core/agent-catalog/agents/pr/fixer](/apps/server/src/core/agent-catalog/agents/pr/fixer), [projects/melee/knowledge/sources/code_context/past_prs](/projects/melee/knowledge/sources/code_context/past_prs).

PR work is split between knowledge-oriented indexing, handoff planning, and
PR-oriented review. The source layout separates those responsibilities and
gives each role its own runtime identity:

- `apps/server/src/core/agent-catalog/agents/knowledge/pr-indexer/` turns one raw PR slice
  into a compact postmortem record for knowledge-curator handoff.
- `apps/server/src/core/agent-catalog/agents/pr/splitter/` turns deterministic handoff
  evidence into a semantic, ordered PR series while preserving runner-owned
  file/lane facts.
- `apps/server/src/core/agent-catalog/agents/pr/reviewer/` reviews planned or opened PR
  slices for known maintainer issues and emits findings for repair routing.
- `apps/server/src/core/agent-catalog/agents/pr/fixer/` resolves opened-PR maintainer
  comments and reviewer findings, then returns dispositions and manual-review notes.

## Files

| File | Purpose |
| --- | --- |
| `apps/server/src/core/agent-catalog/agents/knowledge/pr-indexer/index.ts` | Exposes the PR indexer agent definition. |
| `apps/server/src/core/agent-catalog/agents/knowledge/pr-indexer/agent.ts` | Kernel metadata plus indexing role wiring for prompt, context, and tools. |
| `apps/server/src/core/agent-catalog/agents/knowledge/pr-indexer/prompt.ts` | Defines the stable PR indexing system prompt and bundle entrypoint. |
| `apps/server/src/core/agent-catalog/agents/knowledge/pr-indexer/context.ts` | Builds the injected PR evidence packet, loaded files, standards, tools, and schema. |
| `apps/server/src/core/agent-catalog/agents/knowledge/pr-indexer/schema.json` | Defines the PR indexing structured output contract. |
| `apps/server/src/core/agent-catalog/agents/pr/splitter/index.ts` | Exposes the PR splitter agent definition. |
| `apps/server/src/core/agent-catalog/agents/pr/splitter/agent.ts` | Kernel metadata plus planner role wiring for prompt, context, and tools. |
| `apps/server/src/core/agent-catalog/agents/pr/splitter/prompt.ts` | Defines the stable splitter system prompt and validates `melee_pr_splitter_plan_v1` output. |
| `apps/server/src/core/agent-catalog/agents/pr/splitter/context.ts` | Builds the injected split-planning evidence packet, standards, tools, and schema. |
| `apps/server/src/core/agent-catalog/agents/pr/splitter/schema.json` | Defines the splitter structured output contract. |
| `apps/server/src/core/agent-catalog/agents/pr/fixer/agent.ts` | Kernel metadata plus PR feedback fixer role wiring for prompt, context, and tools. |
| `apps/server/src/core/agent-catalog/agents/pr/fixer/prompt.ts` | Defines the stable PR feedback fixer system prompt and validates `melee_pr_fixer_result_v1` output. |
| `apps/server/src/core/agent-catalog/agents/pr/fixer/context.ts` | Builds the injected PR feedback packet, standards, targeted examples, tools, and schema. |
| `apps/server/src/core/agent-catalog/agents/pr/fixer/schema.json` | Defines the PR fixer structured output contract. |
| `apps/server/src/core/agent-catalog/agents/pr/qa-repair/agent.ts` | Kernel metadata plus deterministic QA repair queue role wiring for prompt, context, and tools. |
| `apps/server/src/core/agent-catalog/agents/pr/qa-repair/context.ts` | Builds the injected QA repair item, queue summary, standards/examples, tools, and schema. |
| `apps/server/src/core/agent-catalog/agents/pr/reviewer/prompt.ts` | Defines the stable adversarial pre-ship reviewer system prompt. |
| `apps/server/src/core/agent-catalog/agents/pr/reviewer/context.ts` | Builds the injected slice diff, lint findings, standards, exhibits, examples, and schema. |
| `apps/server/src/core/agent-catalog/agents/pr/reviewer/preship.ts` | Loads/render exhibits and validates the preship output contract. |
| `apps/server/src/core/agent-catalog/agents/pr/reviewer/agent.ts` | Kernel metadata plus adversarial pre-ship reviewer role wiring for prompt, context, and tools. |
| `apps/server/src/core/agent-catalog/agents/pr/reviewer/schema.json` | Pre-ship structured output contract (`melee_pr_preship_review_v1`). |
| `apps/server/src/core/agent-catalog/agents/pr/reviewer/exhibits/preship_exhibits.json` | Curated maintainer-rejection exhibits from doldecomp/melee PRs #2655-#2659. |

## PR Splitter Mode

The PR splitter is the intelligent planning layer between end-of-run handoff
and PR review. `pr-split-plan` still collects deterministic facts: changed
files, checkpoint lanes, ship-status filtering, base/head refs, size limits,
seed slices, and validation commands. With `--strategy agent` or project
`pr.splitStrategy: "agent"`, that deterministic plan becomes the splitter
context.

The splitter returns `melee_pr_splitter_plan_v1`: ordered slices with
sanitized ids, display names, titles, lanes, scopes, exact file lists,
dependencies, independence hypotheses, review focus, PR-body summaries, risks,
validation notes, warnings, rationale, and confidence. The server job validates the
proposal before use: every changed file must appear exactly once, files must
stay in their deterministic lanes, lanes cannot mix inside one slice,
dependencies must point to emitted slice ids, and the max-files-per-PR ceiling
must hold. Invalid or unparseable output keeps the deterministic plan and adds
a warning plus splitter artifacts for inspection.

Splitter prompt artifacts are written under the command's agent output
directory. The dashboard passes the run id to `pr-split-plan`, so live splitter
sessions are recorded as `pr-splitter` Pi sessions and appear in the run
details rail.

## Pre-Ship Review Mode

The PR reviewer is the adversarial pre-ship review layer in the QA ship gate
(see [score and PR handoff](../../10-system-design/60-score-and-pr-handoff.md)).
The reviewer judges the slice diff plus loaded evidence injected by
`context.ts`: global decomp standards, deterministic L1/L2 lint findings for
the slice, targeted examples, the output schema, and curated maintainer-rejection
exhibits. An unavailable scanner becomes a context note that increases
suspicion; it is not approval.

Output follows `melee_pr_preship_review_v1`: per-finding `{file, line,
standard_id, verdict: "reject"|"warn", rationale, suggested_fix}` plus a
top-level `slice_verdict: "approve"|"reject"`, `summary`, and `confidence`.
Invalid or unparseable output is an infrastructure error, not approval.

Invocation is the `pr-preship-review` server job, one agent call per planned
PR slice at handoff time. Per-slice artifacts land under
`state_dir/preship_reviews/<run-id>/<slice-id>/`. The command fails closed:
any `reject` finding, any `reject` slice verdict, or any infrastructure
failure exits 1 and blocks the handoff.

`pr-draft-qa` embeds the same preship mode inside the opened draft PR
lifecycle. Scanner findings plus file-backed preship findings are routed
through the deterministic QA repair lane (`qa-repair`) when `--run-agents` is
set. Human maintainer comments and review-thread feedback belong to the
opened-PR fixer (`pr-fixer`), which returns edit evidence or manual-review
notes. Findings that cannot be automatically cleared become commentable
manual-review items after repair attempts.

Worker-output integration conflicts before PR handoff are not handled here.
Those belong to the running-phase `integration-resolver` agent, which processes
completed worker checkpoint conflict queue items before any PR slice exists.

## Knowledge Relationship

The PR indexer is the knowledge-facing PR agent. Historical PR data lives under
`projects/melee/knowledge/sources/code_context/past_prs/data/`; the indexer
turns raw slices from that corpus into postmortem records that the knowledge
curator can reduce into graph-safe lessons and proposal-only source updates.

The postmortem builder supports pending-only discovery. `kg-maintain` calls the
builder with `--pending-only`, so newly fetched PRs are auto-discovered from
the active PR corpus and only missing `postmortem/postmortem.json` records are
queued. Direct `kg-maintain` enables model-reviewed postmortems with
`--run-pr-agent`; otherwise deterministic scaffold records keep the corpus
indexable.

The default live indexing runtime is provider `codex-lb`, model `gpt-5.5`, and
thinking `medium`. Root `local.env` remains supported, and selected projects
can load their configured ignored `localEnv` file so PR indexing can be
attributed separately from other projects.

## Key Rules

- PR indexing, splitting, reviewing, and opened-PR feedback repair are separate
  slices with separate runtime ids: `pr-indexer`, `pr-splitter`,
  `pr-reviewer`, and `pr-fixer`.
- Prompt/schema changes should happen in the owning vertical slice.
- Import indexing code from `@server/core/agent-catalog/agents/knowledge/pr-indexer`.
- Import splitter code from
  `@server/core/agent-catalog/agents/pr/splitter`.
- Import review code from
  `@server/core/agent-catalog/agents/pr/reviewer`.
- Import opened-PR feedback fixer code from
  `@server/core/agent-catalog/agents/pr/fixer`.
- PR splitter output should shape the handoff plan but never decide ship-set
  membership; PR reviewer findings should feed the PR fixer or manual-review
  lifecycle; PR indexing output should feed graph ingestion/curation.

## Related

- [Knowledge implementation](../30-knowledge/00-overview.md)
- [Agent model](../../10-system-design/20-agent-model.md)
