---
covers: Runtime knowledge sources, tools, resource graph, agent context, and PR evidence
concepts: [knowledge, sources, tools, resource-graph, agent-context, past-prs]
---

# Knowledge Model

Runtime knowledge is platform-owned evidence selected or searched by agents. It
is not a Codex skill. The model separates access modes: injected context,
independently searchable knowledge bases, code-connected evidence,
graph-owned mutable state, callable operations, and role behavior. Knowledge
sources provide facts and corpora. Toolpacks provide reusable operations. The
selected project owns checkout-derived graph facts, tool bindings, tool data,
and run evidence, while agent system prompts plus routed worker context own
role behavior.

## Knowledge Types

| Type | Purpose |
| --- | --- |
| Injected context | Compact source slices selected before or during worker boot: global `decomp_standards`, path-scoped `path_facts`, and the maintainer-rejection record `banned_patterns` |
| Searchable knowledge bases | RAG-style corpora that agents query on demand, such as `powerpc_docs`; these support lexical JSONL lookup and source-local semantic vector lookup after vectorization |
| Code-connected evidence | Source slices that link to files, symbols, PRs, file cards, graph hits, or rank features |
| Deprecated knowledge slices | Archived lookup slices such as `discord_knowledge`, `ssbm_data_sheet`, and `external_mirrors`; these are retained for manual investigation or explicit profile overrides, not default worker browsing |
| Tools | Toolpack-defined callable operations for lookup, validation, compiler diagnosis, source editing, data conversion, and operator maintenance; project bindings choose implementation overrides, shared data roots, and worktree cache roots |
| Code graph | Current-checkout facts about files, object units, functions, match status, and editability |
| Resource graph | Project-selected SQLite graph state linking the code graph with global PR history, source hits, durable lessons, mismatch patterns, editability, and rank features |
| Agent context | Compact worker guidance selected by `apps/server/src/core/agent-catalog/context/manifest.json`; scheduler policy lives in deterministic runtime code |
| Graph enrichments | Durable learned facts, such as imported legacy shared-agent lessons, curator-produced worker/PR lessons, and derived mismatch-pattern entities, stored as graph-owned artifacts |

## Selection

The scheduler gets ranking inputs from the graph and applies explicit epoch
policy. Workers get one compact operating guide by default. Capability hints add focused lookup,
matching, or last-resort sweep context only when the packet needs it. The
one-symbol targeted iteration loop is part of the worker system prompt, not a
separate knowledge workflow.

This keeps the default worker posture careful and evidence-backed. Broader
experimental search and permuter handoff enter only when a packet or capability
route asks for compact last-resort sweep context.

## Naming-Guided Search

Worker search is thoughtful, not random. A worker should use the target symbol,
source path, nearby matched code, headers, splits, symbols, PR history, and
resource tables to infer likely names the original developer would have used:
struct fields, callbacks, states, helper functions, data owners, and sibling
files. Each new fact should narrow the next search query or suggest another
specific file to inspect.

When those evidence-backed names and paths run out, the worker should stop
before hard guessing. The next useful move is to identify what missing fact
would make the search grounded again, queue fact research, or move the worker
slot to a more constrained target.

## Resource Contract

Knowledge material should make agents better at choosing grounded next moves.
It should not swamp prompts with the whole repository or encourage random
sweeps. Useful knowledge names exact sources, explains when it applies, and
preserves provenance so facts can be checked later.

## Maintenance

When adding evidence, decide whether it is injected context, a searchable source,
code-connected evidence, a tool, graph enrichment, durable mismatch-pattern
knowledge, or a past-PR artifact. Raw run output remains evidence until it is
curated into a durable graph record. When
adding behavior, put it beside the agent as context and route it through
`apps/server/src/core/agent-catalog/context/manifest.json`.

PR and worker learning enters through a maintenance pipeline:

1. PR refresh/sync updates
   `projects/melee/knowledge/sources/code_context/past_prs/data`.
   Full corpus refresh uses the source-local
   `projects/melee/knowledge/sources/code_context/past_prs/commands/fetch_recent_pr_dump.py`
   helper with `--all-prs`; routine postmortem indexing runs through
   `bun run kg:maintain`.
2. The PR indexer pass creates missing per-PR postmortems under
   `projects/melee/knowledge/sources/code_context/past_prs/data/prs/pr-NNNN/postmortem`.
3. Source indexers generate source-local `indexes/*.jsonl` files for active
   injected context, searchable documents, PDF page text, and code-connected
   graph slices.
4. RAG source vectorizers embed generated document chunks into source-local
   `indexes/vector.sqlite` stores and record the embedding provider, model,
   dimensions, source fingerprint, and chunking policy in
   `indexes/vector_manifest.json`.
5. `kg:maintain` runs toolpack runners and generates local JSONL indexes for
   callable tool APIs. Stable project rows live under project shared tool data,
   mutable validation or editing output lives under the active worktree cache,
   and older `knowledge/tools` rows are compatibility input until regenerated
   through the owning tool.
6. Workers persist worker states, checkpoints, and artifact files after runner
   validation.
7. The knowledge curator reduces worker states, selected checkpoints, and PR postmortems into
   `projects/melee/knowledge/resource_graph/enrichments/knowledge_curator_updates.jsonl`.
8. Graph rebuild ingests selected project code data, active registered sources,
   legacy/curator enrichments, and derived mismatch-pattern records into the
   selected graph database.
9. `kg:smoke -- --strict` verifies every source has graph chunks and every
   registered tool API is ready.

Workers and PR agents do not directly mutate the canonical graph. They produce
evidence. The curator converts evidence into accepted lessons or proposal-only
source updates, and deterministic graph ingestion owns the final write.

## Banned Patterns

`projects/melee/knowledge/sources/injectable/banned_patterns` is the executable record of
maintainer rejections — the QA ship gate's L4 feedback loop (see
[score and PR handoff](60-score-and-pr-handoff.md)). Once a maintainer rejects
a pattern, the record blocks it mechanically instead of relying on an LLM
remembering:

- `data/banned.jsonl` holds one record per maintainer finding. Each record's
  `detector` is either `agent_exhibit` (fed to the pre-ship review prompt as a
  retrieval exhibit) or `regex` (loaded by `review_lint` at startup as an
  additional deterministic gate rule). New `regex` detectors always require
  human approval before landing — a bad regex blocking all ships is the
  failure mode to avoid.
- `data/tombstones.jsonl` holds fuzzy fingerprints of rejected hunks:
  normalized 4-token shingles compared by Jaccard similarity against each
  hunk's added lines (threshold 0.7 per record, with a 12-token minimum so
  trivial hunks never match). The diff scanner hard-fails any new hunk above
  the threshold, citing the original rejection comment URL, so a rejected
  change can never be resubmitted.
- New candidates enter through `build_pr_postmortems.py
  --extract-banned-patterns`, which writes `disposition: "proposed"` records
  into `data/proposals/`; promotion into `banned.jsonl` is a deliberate
  human/curator action.

Field shapes, loader contracts, and matching constraints live in the source's
`data/schema.md`.

## Worker Packet Evidence

Before a worker starts editing, the runner attaches `knowledge_context` to the
target packet. This precomputed context includes the file card, editability
state, graph resource hits, linked mismatch patterns, PR history, scheduling
signals, and the direct server jobs the worker can call for follow-up lookup.
Workers may still search individual sources or tools when the packet exposes a
concrete question, but they do not start from a cold prompt.
