# Decomp Orchestrator Knowledge

This directory owns the Melee knowledge vertical slice for the orchestrator.
Source descriptors, source APIs, source-local commands, accumulated corpora,
generated indexes, and graph enrichment artifacts live together under
`projects/melee/knowledge`. `projects/melee/knowledge/sources/registry.json`
maps stable source IDs to sectioned source paths such as
`sources/code_context/past_prs`.

The server runtime under `apps/server/src/core/knowledge` resolves and executes
these project-owned sources, but it does not own the knowledge content tree.
Callable tool definitions live in `toolpacks/gamecube-decomp`, while
Melee-specific tool bindings and generated tool data live under
`projects/melee`.

## Access Sections

| Section | Sources | Access model |
| --- | --- | --- |
| Injected context | `decomp_standards`, `path_facts`, `banned_patterns` | Compact context selected for worker boot plus QA guardrail records. Standards are global; path facts resolve only for the target path or directory. |
| Searchable knowledge bases | `powerpc_docs` | Standalone RAG-style lookup through source-local APIs and graph search. |
| Code-connected evidence | `code_graph`, `past_prs` | Evidence that links to source paths, symbols, file cards, PR history, graph hits, and rank features. |
| Deprecated sources | `discord_knowledge`, `ssbm_data_sheet`, `external_mirrors` | Archived lookup slices retained for manual investigation or explicit profile overrides, but inactive by default. |

Graph-owned mutable state is separate from source slices:

- `projects/melee/knowledge/resource_graph/enrichments/agent_shared_state_lessons.jsonl`
  contains durable lessons imported from the legacy shared agent-state DB.
- `projects/melee/knowledge/resource_graph/enrichments/knowledge_curator_updates.jsonl`
  contains generated worker/PR lessons plus proposal-only source updates.
- `mismatch_patterns` is a graph-owned derived source built during graph
  rebuild. It turns accepted curator records and imported historical lessons
  into linked pattern entities for recurring stack, register, inline,
  control-flow, literal/data-layout, type, split, loop, struct-layout, and
  negative-evidence mismatch knowledge.

These enrichment files are ingestion artifacts for the resource graph. Workers
do not search them as ordinary source corpora; they use `kg:file-card` and
`kg:search -- --source mismatch_patterns` for graph-connected mismatch
knowledge.

## Worker Flow

At worker start, the orchestrator can attach compact context: global decomp
standards, path facts for the target path, and graph/file-card evidence such as
editability, PR history, resource hits, and ranking signals. During research,
the worker should use source-specific tools for concrete questions:

- `code_graph_file_card` or `kg:file-card` for source-path context.
- `past_prs_search` for historical PR tactics, review risks, and file edges.
- `powerpc_docs_search` or `powerpc_instruction_lookup` for ABI and instruction
  documentation.
- `kg:search -- --source mismatch_patterns` for durable mismatch-pattern
  lessons linked into the graph.
- First-class tool APIs such as `ghidra_lookup`, `opseq_similar_functions`,
  `mismatch_db_search`, and `mwcc_debug_lookup` for tool-local cache or runner
  evidence.

Path facts are injected into the worker packet as target-scoped context. The
default worker profile does not expose `path_facts_resolve`, `discord_knowledge_*`,
`ssbm_data_sheet_*`, or `external_mirrors_*` tools.

Current source, headers, symbols, splits, assembly, objdiff/checkdiff, and
regression output outrank all historical or external knowledge.

## Physical Layout

```text
projects/melee/knowledge/
+-- README.md
+-- sources/
|   +-- registry.json       # active sections, source paths, access modes
|   +-- injectable/
|   |   +-- <source_id>/
|   +-- rag_search/
|   |   +-- <source_id>/
|   +-- code_context/
|   |   +-- <source_id>/
|   +-- deprecated/
|       +-- <source_id>/
|           +-- source.json
|           +-- README.md
|           +-- api/
|           +-- commands/
|           +-- tests/
+-- resource_graph/
    +-- README.md
    +-- commands/
    +-- schemas/
```

Project-owned storage uses the same source paths:

```text
projects/melee/knowledge/
+-- sources/
|   +-- <section>/<source_id>/
|       +-- data/
|       +-- indexes/
+-- resource_graph/
    +-- enrichments/
```

Callable tool definitions live in `toolpacks/gamecube-decomp`. Melee selects
that pack in `projects/melee/project.json`, configures tools under
`projects/melee/tool-bindings`, stores stable tool data in
`projects/melee/shared/tool-data/<tool_id>`, and scopes mutable output under
`projects/melee/worktrees/<worktree_id>/tool-cache/<tool_id>`. Agent role
behavior and prompt context live beside the agents under
`apps/server/src/core/agent-catalog/*/context/`. Historical role/workflow docs
live under `docs/archive/`, not here.

## Corpus Locations

| Source | Primary data |
| --- | --- |
| `decomp_standards` | `projects/melee/knowledge/sources/injectable/decomp_standards/data` |
| `path_facts` | `projects/melee/knowledge/sources/injectable/path_facts/data` |
| `past_prs` | `projects/melee/knowledge/sources/code_context/past_prs/data/current`, `projects/melee/knowledge/sources/code_context/past_prs/data/prs` |
| `powerpc_docs` | `projects/melee/knowledge/sources/rag_search/powerpc_docs/data` |

Deprecated corpora remain available under:

| Source | Deprecated data |
| --- | --- |
| `discord_knowledge` | `projects/melee/knowledge/sources/deprecated/discord_knowledge/data/docs` |
| `ssbm_data_sheet` | `projects/melee/knowledge/sources/deprecated/ssbm_data_sheet/data` |
| `external_mirrors` | `projects/melee/knowledge/sources/deprecated/external_mirrors/data` |

Generated tool caches and indexes live under the project tool-data roots
resolved by the tool runtime. Stable rows belong in
`projects/melee/shared/tool-data/<tool_id>/{cache,indexes}`; mutable validation
or editing output belongs in
`projects/melee/worktrees/<worktree_id>/tool-cache/<tool_id>`. Tool data is not
a registered knowledge source. Durable generalized mismatch patterns are graph
records under the `mismatch_patterns` source id.

## Command Surface

- `bun run kg:sources` lists active source sections and registered tools.
- `bun run kg:rebuild -- --repo-root <repo_root>` rebuilds the graph from active
  default sources and graph-owned enrichments.
- `bun run kg:smoke -- --strict` verifies active registered sources and tool APIs.
- `bun run kg:file-card -- --repo-root <repo_root> --source <source_path>`
  returns graph-connected context for a source file.
- `bun run kg:search -- --repo-root <repo_root> --source past_prs --query <term>`
  searches graph chunks for one active source.
- `bun run kg:search -- --repo-root <repo_root> --source mismatch_patterns
  --query <term>` searches durable graph-owned mismatch-pattern knowledge.
- `python3 projects/melee/knowledge/sources/<section>/<source_id>/api/status.py --json`
  checks source-local readiness.
- `python3 projects/melee/knowledge/sources/<section>/<source_id>/api/search.py --query <term> --json`
  searches a source-local generated JSONL index when that source exposes search.
- `python3 projects/melee/knowledge/sources/rag_search/<source_id>/commands/vectorize.py --json`
  embeds a RAG source's generated chunks into `indexes/vector.sqlite`.
- `python3 projects/melee/knowledge/sources/rag_search/<source_id>/api/semantic_search.py --query <question> --json`
  performs hybrid semantic lookup over a vectorized RAG source.
- Tool APIs are normally invoked through first-class Pi tools or
  resolver-backed server helpers. Operator maintenance commands use the
  toolpack paths, for example
  `python3 toolpacks/gamecube-decomp/research/ghidra/api/status.py --repo-root <repo_root> --json`.

Routine knowledge maintenance is server-backed:

- `bun run kg:maintain -- --project melee`
- `bun run kg:maintain -- --project melee --run-pr-agent --pr-jobs 16`

Full PR-corpus refresh remains a source-local maintenance operation:

- `python3 projects/melee/knowledge/sources/code_context/past_prs/commands/fetch_recent_pr_dump.py --all-prs --fetch-jobs 16 --postmortem-mode pi --postmortem-jobs 16 --postmortem-scope all`
- `python3 projects/melee/knowledge/sources/code_context/past_prs/commands/sync_repo_and_pr_library.py --all-prs --fetch-jobs 16 --postmortem-jobs 16`
