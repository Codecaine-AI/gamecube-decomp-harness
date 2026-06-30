---
covers: Project-owned Melee knowledge sources, server runtime knowledge code, toolpack boundaries, agent context routing, resource graph, and past PR library
concepts: [knowledge, agent-context, sources, tools, resource-graph, past-prs]
code-ref: projects/melee/knowledge, toolpacks/gamecube-decomp, projects/melee/tool-bindings, apps/server/src/core/knowledge, apps/server/src/core/tools/resolver.ts, apps/server/src/core/agent-catalog/context.ts
---

# Knowledge: Overview

Melee knowledge is project-owned. `projects/melee/knowledge` owns source
descriptors, source API code, registry metadata, graph schemas, graph commands,
accumulated corpora, generated indexes, source-local data, and graph-owned
enrichment files. The server owns runtime code under
`apps/server/src/core/knowledge`; it resolves and executes project knowledge but
does not own the knowledge tree. The active graph database lives at
`projects/melee/graph/graph.sqlite`.

Tools are callable operations, not knowledge sources. Reusable GameCube decomp
tool definitions live in `toolpacks/gamecube-decomp`; Melee selects that pack
from `projects/melee/project.json`, configures it in
`projects/melee/tool-bindings`, stores stable tool data in
`projects/melee/shared/tool-data`, and scopes mutable tool output under
`projects/melee/worktrees/<worktree_id>/tool-cache`.

The selected project supplies the checkout root and graph database path used for
project-derived graph data such as `code_graph`, rank features, file cards, and
agent-state enrichment. Agent role behavior and prompt context live in the
catalog under `apps/server/src/core/agent-catalog/` and are selected through
`apps/server/src/core/agent-catalog/context/manifest.json`.

This keeps evidence infrastructure separate from worker and scheduler behavior:
sources can be indexed and refreshed without moving prompts, and prompt context
can change without pretending it is a knowledge source. Resource descriptors are
sectioned by access pattern: injected context, RAG-style searchable sources, and
code-connected evidence.

## File Tree

```text
projects/melee/knowledge/
+-- README.md
+-- sources/
|   +-- README.md
|   +-- registry.json       # active sections, source paths, access modes
|   +-- injectable/
|   |   +-- <source_id>/
|   +-- rag_search/
|   |   +-- <source_id>/
|   +-- code_context/
|       +-- <source_id>/
|           +-- source.json
|           +-- api/
|           +-- commands/
|           +-- tests/
|           +-- data/
|           +-- indexes/
+-- resource_graph/
    +-- README.md
    +-- commands/
    +-- schemas/
    +-- enrichments/
```

```text
projects/melee/graph/
+-- graph.sqlite
+-- graph.sqlite-shm
+-- graph.sqlite-wal
```

```text
toolpacks/gamecube-decomp/
+-- toolpack.json
+-- registry.json
+-- operations/
+-- research/
+-- compiler/
+-- validation/
+-- source_editing/
+-- data_conversion/
+-- recipes/
+-- _shared/
+-- _impl/
```

```text
projects/melee/
+-- tool-bindings/
|   +-- <tool_id>.json
+-- shared/tool-data/
|   +-- <tool_id>/
+-- worktrees/<worktree_id>/tool-cache/
    +-- <tool_id>/
```

```text
apps/server/src/core/agent-catalog/
+-- context.ts
+-- context/
|   +-- manifest.json
+-- agents/
|   +-- running/worker/
|   +-- pr/
|   +-- knowledge/
+-- kernel-catalog.ts
+-- kernel-preview.ts
```

```text
apps/server/src/core/knowledge/
+-- board.ts
+-- curator.ts
+-- decomp-context.ts
+-- graph/
|   +-- builders/          # graph record builders and rebuild orchestration
|   +-- queries/           # read models such as file cards and rank features
|   +-- registry/          # source/tool registry descriptor loading
|   +-- storage/           # Drizzle schema, store, ingestion, search, stats
|   +-- db.ts              # compatibility facade for graph storage exports
|   +-- index.ts           # public graph API exports
+-- index.ts
+-- paths.ts
+-- resources.ts
```

Historical workflow notes and legacy prompt mirrors live under `docs/archive/`.
They are not runtime prompt routes.

## Agent Context Contract

`apps/server/src/core/agent-catalog/context/manifest.json` contains:

- `role_defaults`: role context defaults. Worker system guidance is embedded in
  the worker prompt module rather than routed through guide files.
- `capability_routes`: optional routed context selections. The active worker
  route does not use secondary guide files.
- `references`: known role-context files with purpose metadata.
- `scripts`: helper scripts exposed to prompt builders and operators.

`apps/server/src/core/agent-catalog/context.ts` reads the manifest, resolves paths relative to the
package root, deduplicates any selected context references, and exposes script
metadata. Scheduler policy is deterministic runtime code, not prompt context.
Agent policy is embedded in each role's `prompt.ts` as stable system guidance.
Runtime state, standards, target or PR/QA/reconcile evidence, output schemas,
and generated `<available_tools>` blocks are assembled by the matching
`context.ts` into role-specific context packets. Targeted iteration remains
owned by the role system prompt.
Detailed historical worker and sweep docs are archived.

## Knowledge Code Path

`apps/server/src/core/knowledge/resources.ts` builds the resource map that agents see in rendered
prompts. It points agents at roots, progress inputs, local context, PR evidence,
data-sheet resources, graph commands, source sections, and helper scripts. It
includes the agent context summary but does not own prompt-context selection.

`apps/server/src/core/knowledge/graph/` implements the v1 resource graph. It
indexes the selected project's current code graph, the global past-PR corpus,
registered global sources, and graph-owned enrichments into SQLite. In project
mode, commands default to the selected project's `graphDbPath`, which is
`projects/melee/graph/graph.sqlite` for the tracked Melee project. The graph
API exposes file cards, graph search, source/tool registries, graph-derived rank
features, and internal graph enrichments. External sources and tools are
registered as optional slices until their usage justifies deeper indexing.

The graph runtime is organized as vertical slices under
`apps/server/src/core/knowledge/graph/`:

| Slice | Responsibility |
| --- | --- |
| `builders/` | Converts code graph reports, past PRs, source slices, curator records, and imported lessons into `GraphRecords`. |
| `queries/` | Builds read models over the graph, including file cards and scheduler rank features. |
| `registry/` | Loads project source and tool registry descriptors. |
| `storage/` | Owns the SQLite connection, Drizzle schema, graph ingestion, graph search, and stats. |

`storage/schema.ts` is the typed Drizzle schema for the persisted graph tables:
sources, tools, resource versions, entities, facts, edges, search chunks,
worker graph updates, and merged PR updates. `storage/store.ts` opens the Bun
SQLite database and exposes both the raw `Database` handle and the typed Drizzle
ORM on `KnowledgeGraphStore`. Write paths in `storage/ingest.ts` use Drizzle
transactions and typed JSON columns for graph payloads. Query paths in
`queries/` use Drizzle selects for graph facts, edges, chunks, and aggregate
counts.

Raw SQL remains part of the storage boundary for SQLite features that Drizzle
does not model directly: connection pragmas, bootstrap DDL, and the
`search_chunks_fts` FTS5 virtual table. Search uses FTS5 when available and
falls back to LIKE scanning over `search_chunks` when FTS is unavailable.

The resource map rendered into worker and boundary-agent prompts carries the
runtime boundaries: source definitions/data under `projects/melee/knowledge`,
tool definitions under the enabled toolpack, project tool bindings/data under
`projects/melee`, and project fields such as `project_id`, `project_kind`,
`board_repo_root`, `state_dir`, and `graph_db`. This prevents prompts and
knowledge commands from guessing a parent checkout when a project has already
been resolved.

The source slices are shallow on purpose. Actual corpora live under each slice's
project-owned `data/` folder, while
`projects/melee/knowledge/sources/registry.json` declares active section
and access-mode metadata:

| Section | Active sources | Access model |
| --- | --- | --- |
| `injectable` | `decomp_standards`, `path_facts`, `banned_patterns` | Worker bootstrap/context selection; source APIs exist for focused lookup and proposals. |
| `rag_search` | `powerpc_docs` | Independently searchable knowledge bases. |
| `code_context` | `code_graph`, `past_prs` | Evidence that links to files, symbols, PRs, graph cards, and rank features. |
| `deprecated` | `discord_knowledge`, `ssbm_data_sheet`, `external_mirrors` | Archived lookup slices retained for manual use or explicit profile overrides, but inactive by default. |

Actual corpus paths:

| Source | Actual corpus path |
| --- | --- |
| `decomp_standards` | `projects/melee/knowledge/sources/injectable/decomp_standards/data` |
| `path_facts` | `projects/melee/knowledge/sources/injectable/path_facts/data` |
| `banned_patterns` | `projects/melee/knowledge/sources/injectable/banned_patterns/data` |
| `past_prs` | `projects/melee/knowledge/sources/code_context/past_prs/data` |
| `powerpc_docs` | `projects/melee/knowledge/sources/rag_search/powerpc_docs/data` |

Deprecated corpus paths:

| Source | Deprecated corpus path |
| --- | --- |
| `discord_knowledge` | `projects/melee/knowledge/sources/deprecated/discord_knowledge/data/docs` |
| `ssbm_data_sheet` | `projects/melee/knowledge/sources/deprecated/ssbm_data_sheet/data` |
| `external_mirrors` | `projects/melee/knowledge/sources/deprecated/external_mirrors/data` |

Every active registered source also has a source-local script API under its
registry path, such as
`projects/melee/knowledge/sources/code_context/past_prs/api/`:

- `status.py --json` reports index readiness, generated index files, record
  counts, and declared data paths.
- `search.py --query <term> --limit <n> --json` searches the source's generated
  JSONL indexes and returns citations, snippets, evidence refs, and payloads.
- RAG sources expose `commands/vectorize.py --json` to embed generated chunks
  into `indexes/vector.sqlite`, plus `api/semantic_search.py --query <question>
  --json` for hybrid semantic lookup over normalized vectors.
- Source-specific aliases are thin query wrappers, such as
  `powerpc_docs/api/lookup_instruction.py`. Deprecated sources retain their
  source-local aliases under `projects/melee/knowledge/sources/deprecated/`.

Workers receive `path_facts` through `knowledge_context.path_facts` and the
compact target graph file card. The default worker profile does not expose
`path_facts_resolve`, `discord_knowledge_*`, `ssbm_data_sheet_*`, or
`external_mirrors_*` tools.

`banned_patterns` is the QA ship gate's executable record of maintainer
rejections:
`projects/melee/knowledge/sources/injectable/banned_patterns/data/banned.jsonl`
(one record per rejection; `agent_exhibit` detectors feed the pre-ship review
prompt, human-approved `regex` detectors become extra `review_lint` rules) and
`projects/melee/knowledge/sources/injectable/banned_patterns/data/tombstones.jsonl`
(fuzzy token-shingle fingerprints that block resubmission of rejected hunks).
Loader contracts and field shapes live in the source's `data/schema.md`;
candidate records arrive via `build_pr_postmortems.py --extract-banned-patterns`
into `data/proposals/` (see the
[knowledge model](../../10-system-design/50-knowledge-model.md)).

Workers can use active source-local APIs for quick lookups, then use
`bun run kg:search` or `bun run kg:file-card` when they need graph-level edges,
rank signals, or cross-source evidence. Injected sources are primarily selected
by the prompt/packet builder; their search APIs are for focused follow-up and
curation.

RAG vector indexes are source-local generated caches. They are built from the
same citation-preserving JSONL chunks that graph ingestion uses, default to
OpenAI `text-embedding-3-small` embeddings, store L2-normalized vectors in
SQLite, and keep the provider/model/dimensions/source fingerprint in a manifest
so stale or mixed embeddings are visible in `status.py --json`.

Internal graph enrichments are graph-owned artifacts rather than source slices.
`projects/melee/knowledge/resource_graph/enrichments/agent_shared_state_lessons.jsonl` is
generated from a legacy `agent_state-shared.db` by
`bun run kg:import-agent-state -- --input agent_state-shared.db`. The importer
keeps historical tool issues and nontrivial function hints, skips stale legacy
operational tables, and lets the raw DB be removed after import.

`projects/melee/knowledge/resource_graph/enrichments/knowledge_curator_updates.jsonl` is an
internal ingestion artifact generated by `bun run kg:curate`. It is not a
source slice and is not worker-facing search material. It reduces persisted
worker states, selected checkpoints, and past-PR postmortems into accepted or
proposal graph records.
Clean worker/PR-backed lessons can become accepted graph facts. More complex
updates, such as data-sheet changes, stay as
`source_update_proposal` records until a source-specific updater validates and
applies them.

`mismatch_patterns` is a graph-owned derived source built during graph rebuild
from accepted curator records and imported historical lessons. It stores
generalized mismatch-pattern entities and evidence entities, then links them to
the current code graph through file, function, and PR edges. Raw objdiff and
checkdiff rows remain tool/run evidence; durable pattern knowledge enters the
resource graph only after it appears in accepted or imported lessons.

Package scripts expose the script-backed graph surface:

- `bun run kg:sources`
- `bun run kg:status -- --project melee`
- `bun run kg:import-agent-state`
- `bun run kg:curate`
- `bun run kg:maintain`
- `bun run kg:rebuild -- --project melee`
- `bun run kg:search`
- `bun run kg:file-card`
- `bun run kg:rank-features`

## Tool Runner Contract

Registered tools are live-ready only when `api/status.py --repo-root <repo_root>
--json` reports `operation_mode: live_runner_v1`, `runner_available: true`,
`runner_smoke_passed: true`, and a matching cache repo root. The smoke proof is
`cache/runner_status.json`. Generated runner rows and lookup indexes resolve
under `projects/<id>/shared/tool-data/<tool_id>/{cache,indexes}`.

The current live runner paths are:

| Tool | Runner evidence |
| --- | --- |
| `ghidra` | Homebrew Ghidra/OpenJDK `analyzeHeadless` imports `build/GALE01/main.elf` and writes `ghidra_headless_probe.jsonl`. |
| `opseq` | Generated assembly under `build/GALE01/asm` is parsed into opcode fingerprints. |
| `mismatch_db` | `build/tools/objdiff-cli diff` runs against an imperfect function and writes tool-local objdiff mismatch summaries. Generalized pattern knowledge is surfaced through graph `mismatch_patterns`. |
| `mwcc_debug` | The MWCC runner smoke records `GC/1.2.5n/mwcceppc.exe -version` output and build-rule snippets. Runtime dump/diagnose calls prefer wibo when provisioned, with Wine as fallback. |

Generated lookup rows such as symbol lookup, function shapes, and live runner
summaries remain useful tool-local API evidence, but they do not alone satisfy
strict live tool readiness. Mutable validation and source-editing output belongs
under the resolved worktree cache, not under shared project data.

The registered tools serve two audiences. Maintenance and operator workflows run
the tool runners to build caches and indexes; workers consume the small source APIs
during evidence gathering. Worker tool discoverability is rendered in the
worker prompt as `<available_tools>`, grouped by provider and type from
wrapper-local metadata under
`apps/server/src/core/tools/wrappers`. Tool API results are
provenance-rich hypotheses, not source proof, and retained edits still need
local objdiff/checkdiff validation.

`kg-maintain` is the maintenance loop entry point. It uses pending-only PR
postmortem indexing, runs live tool runners unless `--no-tool-runners` is set,
rewrites tool lookup indexes through the toolpack resolver, rewrites the curator
enrichment, optionally runs the knowledge-curator agent for proposal review,
and rebuilds the graph. The
`run-loop` uses two lanes: fast in-epoch refresh runs
`kg-maintain --no-tool-runners` after a coalesced interval/report-count trigger,
and full boundary maintenance runs after report truth is rebuilt according to
`--full-kg-maintenance-mode`. The older background maintenance interval remains
available through `--knowledge-maintenance-interval-ms`.

## Past PR Library

`projects/melee/knowledge/sources/code_context/past_prs/data/` contains the
stable PR dump and searchable per-PR postmortem records.
`projects/melee/knowledge/sources/code_context/past_prs/commands/`
contains the missing-only fetch, postmortem, and sync commands so this evidence library
travels with the orchestrator package while its accumulated data stays with the
project.

Past-PR sync is append/gap-fill only. The fetcher reads the last successful
sync metadata, discovers the recent PR window from that high-water mark, and
fetches raw PR slices only when the local `prs/pr-NNNN` record is absent or
incomplete. Existing PR slices are not refreshed during session start; rebuilding
a stale PR record is a manual delete-and-refetch operation.

The PR postmortem builder supports `--pending-only`, so maintenance can scan
the active PR corpus and only queue PRs whose
`postmortem/postmortem.json` is missing.
`--run-pr-agent` enables model-reviewed PR records; without it, deterministic
scaffold records still keep the graph indexable.

Current validation status, 2026-06-26:

- Toolpack resolver coverage passes with `bun test
  src/core/tools/resolver.test.ts` from `apps/server`.
- TypeScript and integrated repository checks pass with `bunx tsc --noEmit
  --pretty false` and `bun run check`.
- `bun run kg:sources` lists registered tools through the enabled
  `gamecube-decomp` toolpack.
- Representative resolver-backed status calls pass for `ghidra`, `checkdiff`,
  `mwcc_debug`, and `review_lint`.
- `bun run kg:smoke -- --strict` requires project context; without
  `--project melee`, tool status checks use the package root as the effective
  repo root and fail project checkout prerequisites or stale-runner root
  checks.
- `bun run kg:smoke -- --project melee --strict` resolves tools through the
  toolpack/project binding runtime, but strict readiness still fails for
  unindexed sources (`banned_patterns`, `powerpc_docs`) and
  live-runner smoke proofs for `ghidra`, `opseq`, `mismatch_db`, and
  `mwcc_debug`.

## Archive Boundary

`docs/archive/` contains historical workflow docs and legacy prompt mirrors.
Archived files can inform future implementation work, but they should not enter
default prompt routes unless they are reviewed, condensed, and promoted into
agent context, a source slice, a tool, or graph-owned enrichment.

## Child Nodes

- [Worker tooling gap report](10-worker-tooling-doc-gap-report.md): audit trail
  for the worker-facing tool guidance promoted into active context.
- [Melee PR review QA standards](20-melee-pr-review-qa-standards.md): review
  checklist distilled from the past-PR corpus.
- [Melee PR review QA coverage audit](21-melee-pr-review-qa-coverage-audit.md):
  corpus coverage and evidence counts for the QA standards.

## Related

- [Knowledge model](../../10-system-design/50-knowledge-model.md)
- [PR indexer, splitter, and reviewer agents](../agents/20-pr-review.md)
