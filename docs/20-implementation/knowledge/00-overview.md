---
covers: Package-owned knowledge layout, agent context routing, helper scripts, resources, and past PR library
concepts: [knowledge, agent-context, sources, tools, resource-graph, past-prs]
code-ref: decomp-orchestrator/knowledge, decomp-orchestrator/src/knowledge, decomp-orchestrator/src/agents/context.ts
---

# Knowledge: Overview

`knowledge/` is the runtime evidence surface. It owns source corpora, callable
tools, and the shared resource graph. Agent role behavior and prompt context
live beside the agents under `src/agents/*/context/` and are selected through
`src/agents/context/manifest.json`.

This keeps evidence infrastructure separate from worker/director behavior:
sources can be indexed and refreshed without moving prompts, and prompt context
can change without pretending it is a knowledge source.

## File Tree

```text
knowledge/
+-- README.md
+-- sources/
|   +-- README.md
|   +-- registry.json
|   +-- <source_id>/
|       +-- source.json
|       +-- api/
|       +-- commands/
|       +-- data/
|       +-- indexes/
|       +-- tests/
+-- tools/
|   +-- README.md
|   +-- registry.json
|   +-- decomp_context_lookup.py
|   +-- rank_decomp_candidates.py
|   +-- sweeps/
|   +-- ghidra/
|   +-- opseq/
|   +-- mismatch_db/
|   +-- mwcc_debug/
+-- resource_graph/
    +-- README.md
    +-- graph.sqlite
    +-- commands/
    +-- enrichments/
    +-- indexes/
    +-- schemas/
```

```text
src/agents/
+-- context.ts
+-- context/
|   +-- manifest.json
+-- director/
|   +-- templates/
|       +-- system.md
+-- worker/
    +-- context/
        +-- operating-guide.md
        +-- lookup-guide.md
        +-- matching-guide.md
        +-- last-resort-sweeps.md
```

```text
src/knowledge/
+-- graph/
+-- index.ts
+-- paths.ts
+-- resources.ts
```

Historical workflow notes and legacy prompt mirrors live under `docs/archive/`.
They are not runtime prompt routes.

## Agent Context Contract

`src/agents/context/manifest.json` contains:

- `role_defaults`: context files included for director or worker by default.
- `capability_routes`: additional context selected when a capability is
  enabled.
- `references`: known role-context files with purpose metadata.
- `scripts`: helper scripts exposed to prompt builders and operators.

`src/agents/context.ts` reads the manifest, resolves paths relative to the
package root, deduplicates selected context references, and exposes script
metadata. The worker prompt builder renders selected worker context as
`selected_agent_context_references`.

Director scheduling policy is embedded in the director system prompt, not a
separate routed context file. The default worker route includes only the compact
`operating-guide.md`. Capability routes add `lookup-guide.md`,
`matching-guide.md`, or `last-resort-sweeps.md` only when the packet asks for
that kind of work. Targeted iteration is owned by the worker system prompt.
Detailed historical worker and sweep docs are archived.

## Knowledge Code Path

`src/knowledge/resources.ts` builds the resource map that agents see in rendered
prompts. It points agents at roots, progress inputs, local context, PR evidence,
data-sheet resources, graph commands, and helper scripts. It includes the agent
context summary but does not own prompt-context selection.

`src/knowledge/graph/` implements the v1 resource graph. It indexes the current
checkout code graph, the past-PR corpus, and graph-owned enrichments into
SQLite, exposes file cards, graph search, source/tool registries,
graph-derived rank features, and internal graph enrichments. External sources
and tools are registered as optional slices until their usage justifies deeper
indexing.

The source slices are shallow on purpose. Actual corpora live under each slice's
`data/` folder:

| Source | Actual corpus path |
| --- | --- |
| `past_prs` | `knowledge/sources/past_prs/data/current`, `knowledge/sources/past_prs/data/prs` |
| `discord_knowledge` | `knowledge/sources/discord_knowledge/data/docs` |
| `ssbm_data_sheet` | `knowledge/sources/ssbm_data_sheet/data` |
| `powerpc_docs` | `knowledge/sources/powerpc_docs/data` |
| `external_mirrors` | `knowledge/sources/external_mirrors/data` |
| `resource_guides` | `knowledge/sources/resource_guides/data` |
| `reference_docs` | `knowledge/sources/reference_docs/data` |
| `tool_outputs` | `knowledge/sources/tool_outputs/data` and `knowledge/tools/<tool_id>/cache` |

Every registered source also has a source-local CLI API under
`knowledge/sources/<source_id>/api/`:

- `status.py --json` reports index readiness, generated index files, record
  counts, and declared data paths.
- `search.py --query <term> --limit <n> --json` searches the source's generated
  JSONL indexes and returns citations, snippets, evidence refs, and payloads.
- Source-specific aliases are thin query wrappers, such as
  `ssbm_data_sheet/api/lookup_address.py`,
  `powerpc_docs/api/lookup_instruction.py`,
  `external_mirrors/api/lookup_external_symbol.py`, and
  `discord_knowledge/api/topics_for_terms.py`.

Workers can use these source-local APIs for quick lookups, then use
`bun run kg:search` or `bun run kg:file-card` when they need graph-level edges,
rank signals, or cross-source evidence.

Internal graph enrichments are graph-owned artifacts rather than source slices.
`knowledge/resource_graph/enrichments/agent_shared_state_lessons.jsonl` is
generated from a legacy `agent_state-shared.db` by
`bun run kg:import-agent-state -- --input agent_state-shared.db`. The importer
keeps historical tool issues and nontrivial function hints, skips stale
operational tables such as claims/scratches/audit log, and lets the raw DB be
removed after import.

`knowledge/resource_graph/enrichments/knowledge_curator_updates.jsonl` is an
internal ingestion artifact generated by `bun run kg:curate`. It is not a
source slice and is not worker-facing search material. It reduces durable
worker reports and past-PR postmortems into accepted or proposal graph records.
Clean worker/PR-backed lessons can become accepted graph facts. More complex
updates, such as data-sheet or tool-output changes, stay as
`source_update_proposal` records until a source-specific updater validates and
applies them.

Package scripts expose the CLI-first graph surface:

- `bun run kg:sources`
- `bun run kg:status`
- `bun run kg:import-agent-state`
- `bun run kg:curate`
- `bun run kg:maintain`
- `bun run kg:rebuild`
- `bun run kg:search`
- `bun run kg:file-card`
- `bun run kg:rank-features`
- `bun run kg:tool-runner:ghidra`
- `bun run kg:tool-runner:opseq`
- `bun run kg:tool-runner:mismatch-db`
- `bun run kg:tool-runner:mwcc-debug`

## Tool Runner Contract

Registered tools are live-ready only when `api/status.py --json` reports
`operation_mode: live_runner_v1`, `runner_available: true`, and
`runner_smoke_passed: true`. The smoke proof is `cache/runner_status.json`;
generated runner rows under `knowledge/tools/<tool_id>/indexes/*.jsonl` are
then normalized into the `tool_outputs` source during graph rebuild.

The current live runner paths are:

| Tool | Runner evidence |
| --- | --- |
| `ghidra` | Homebrew Ghidra/OpenJDK `analyzeHeadless` imports `build/GALE01/main.elf` and writes `ghidra_headless_probe.jsonl`. |
| `opseq` | Generated assembly under `build/GALE01/asm` is parsed into opcode fingerprints. |
| `mismatch_db` | `build/tools/objdiff-cli diff` runs against an imperfect function and writes an objdiff mismatch summary. |
| `mwcc_debug` | Wine runs `GC/1.2.5n/mwcceppc.exe -version` and the runner records MWCC build-rule snippets. |

Generated fallback rows such as symbol lookup, function shapes, mismatch-note
chunks, and compiler-note chunks remain useful search evidence, but they do not
alone satisfy strict live tool readiness.

`kg-maintain` is the maintenance loop entry point. It uses pending-only PR
postmortem indexing, runs live tool runners unless `--no-tool-runners` is set,
rewrites tool lookup indexes, rewrites the curator enrichment, optionally runs
the knowledge-curator agent for proposal review, and rebuilds the graph. The
`trigger-agent` loop can run this in the background on
`--knowledge-maintenance-interval-ms`; live runs default to five minutes and
dry runs default to disabled. Live trigger maintenance queues pending PRs to
the PR-review agent by default, bounded by `--pr-limit` with a background
default of eight.

## Past PR Library

`knowledge/sources/past_prs/data/` contains the stable PR dump and searchable
per-PR postmortem records. `knowledge/sources/past_prs/commands/` contains the
refresh, postmortem, and sync commands so this evidence library travels with
the orchestrator package.

The PR postmortem builder supports `--pending-only`, so maintenance can scan
the current PR dump and only queue PRs whose `postmortem.json` is missing.
`--run-pr-agent` enables model-reviewed PR records; without it, deterministic
scaffold records still keep the graph indexable.

Current bootstrap status, 2026-06-07:

- `2503 / 2503` discovered PRs have complete raw slices and model-reviewed
  `agent_completed` postmortems.
- Active PR postmortems have zero missing, unreadable, validation-issue, or
  `agent_failed_scaffold_written` records.
- Source-local API smoke, live tool runner smoke, graph rebuild, strict graph
  smoke, TypeScript checks, and Python compile checks pass against the current
  data layer when the validation ladder is run from the orchestrator layout.

## Archive Boundary

`docs/archive/` contains historical workflow docs and legacy prompt mirrors.
Archived files can inform future implementation work, but they should not enter
default prompt routes unless they are reviewed, condensed, and promoted into
agent context, a source slice, a tool, or graph-owned enrichment.

## Related

- [Knowledge model](../../10-system-design/50-knowledge-model.md)
- [PR-review agent](../agents/20-pr-review.md)
