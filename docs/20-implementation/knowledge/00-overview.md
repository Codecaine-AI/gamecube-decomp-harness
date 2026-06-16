---
covers: Package-owned knowledge layout, agent context routing, helper scripts, resources, and past PR library
concepts: [knowledge, agent-context, sources, tools, resource-graph, past-prs]
code-ref: decomp-orchestrator/knowledge, decomp-orchestrator/packages/knowledge/src, decomp-orchestrator/packages/agents/src/context.ts
---

# Knowledge: Overview

`knowledge/` is the runtime evidence surface. It owns global source corpora,
source/tool registries, access-mode metadata, and graph-owned enrichment files.
The selected project supplies the checkout root and graph database path used for
project-derived graph data such as `code_graph`, rank features, file cards, and
agent-state enrichment. Agent role behavior and prompt context live beside the
agents under `packages/agents/src/*/context/` and are selected through
`packages/agents/src/context/manifest.json`.

This keeps evidence infrastructure separate from worker and scheduler behavior:
sources can be indexed and refreshed without moving prompts, and prompt context
can change without pretending it is a knowledge source. Within `knowledge/`,
sources are sectioned by access pattern: injected context, RAG-style searchable
sources, and code-connected evidence.

## File Tree

```text
knowledge/
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
|           +-- data/
|           +-- indexes/
|           +-- tests/
+-- resource_graph/
    +-- README.md
    +-- graph.sqlite          # compatibility/default graph DB when no project is selected
    +-- commands/
    +-- enrichments/
    +-- indexes/
    +-- schemas/
```

```text
tools/
+-- README.md
+-- registry.json
+-- operations/
+-- research/
+-- compiler/
+-- validation/
+-- source_editing/
+-- data_conversion/
+-- recipes/
```

```text
packages/agents/src/
+-- context.ts
+-- context/
|   +-- manifest.json
+-- worker/
    +-- templates/
        +-- system.md
        +-- initial_user.md
+-- tools/
    +-- profile-data.ts
```

```text
packages/knowledge/src/
+-- board.ts
+-- curator.ts
+-- decomp-context.ts
+-- graph/
+-- index.ts
+-- paths.ts
+-- resources.ts
```

Historical workflow notes and legacy prompt mirrors live under `docs/archive/`.
They are not runtime prompt routes.

## Agent Context Contract

`packages/agents/src/context/manifest.json` contains:

- `role_defaults`: role context defaults. Worker prompt guidance is embedded in
  the worker templates rather than routed through guide files.
- `capability_routes`: optional routed context selections. The active worker
  route does not use secondary guide files.
- `references`: known role-context files with purpose metadata.
- `scripts`: helper scripts exposed to prompt builders and operators.

`packages/agents/src/context.ts` reads the manifest, resolves paths relative to the
package root, deduplicates any selected context references, and exposes script
metadata. Scheduler policy is deterministic runtime code, not prompt context.
Worker policy is embedded in `worker/templates/system.md`, while
`worker/templates/initial_user.md` receives target state, standards, target file
content, and a generated `<available_tools>` block derived from the resolved
worker tool profile. Targeted iteration is owned by the worker system prompt.
Detailed historical worker and sweep docs are archived.

## Knowledge Code Path

`packages/knowledge/src/resources.ts` builds the resource map that agents see in rendered
prompts. It points agents at roots, progress inputs, local context, PR evidence,
data-sheet resources, graph commands, source sections, and helper scripts. It
includes the agent context summary but does not own prompt-context selection.

`packages/knowledge/src/graph/` implements the v1 resource graph. It indexes
the selected project's current code graph, the global past-PR corpus, registered
global sources, and graph-owned enrichments into SQLite. In project mode,
commands default to the selected project's
`graphDbPath`; without a project, they use the compatibility graph at
`knowledge/resource_graph/graph.sqlite`. The graph API exposes file cards,
graph search, source/tool registries, graph-derived rank features, and internal
graph enrichments. External sources and tools are registered as optional slices
until their usage justifies deeper indexing.

The resource map rendered into worker and boundary-agent prompts carries both
boundaries: global knowledge roots under `knowledge/`, and project fields such
as `project_id`, `project_kind`, `board_repo_root`, `state_dir`, and
`graph_db`. This prevents prompts and knowledge commands from guessing a parent
checkout when a project has already been resolved.

The source slices are shallow on purpose. Actual corpora live under each slice's
`data/` folder, while `knowledge/sources/registry.json` declares active section
and access-mode metadata:

| Section | Active sources | Access model |
| --- | --- | --- |
| `injectable` | `decomp_standards`, `path_facts`, `banned_patterns` | Worker bootstrap/context selection; source APIs exist for focused lookup and proposals. |
| `rag_search` | `discord_knowledge`, `powerpc_docs` | Independently searchable knowledge bases. |
| `code_context` | `code_graph`, `past_prs`, `ssbm_data_sheet`, `external_mirrors` | Evidence that links to files, symbols, PRs, data rows, mirrors, or graph cards. |

Actual corpus paths:

| Source | Actual corpus path |
| --- | --- |
| `decomp_standards` | `knowledge/sources/injectable/decomp_standards/data` |
| `path_facts` | `knowledge/sources/injectable/path_facts/data` |
| `banned_patterns` | `knowledge/sources/injectable/banned_patterns/data` |
| `past_prs` | `knowledge/sources/code_context/past_prs/data` |
| `discord_knowledge` | `knowledge/sources/rag_search/discord_knowledge/data/docs` |
| `ssbm_data_sheet` | `knowledge/sources/code_context/ssbm_data_sheet/data` |
| `powerpc_docs` | `knowledge/sources/rag_search/powerpc_docs/data` |
| `external_mirrors` | `knowledge/sources/code_context/external_mirrors/data` |

Every active registered source also has a source-local CLI API under its
registry path, such as
`knowledge/sources/code_context/past_prs/api/`:

- `status.py --json` reports index readiness, generated index files, record
  counts, and declared data paths.
- `search.py --query <term> --limit <n> --json` searches the source's generated
  JSONL indexes and returns citations, snippets, evidence refs, and payloads.
- RAG sources expose `commands/vectorize.py --json` to embed generated chunks
  into `indexes/vector.sqlite`, plus `api/semantic_search.py --query <question>
  --json` for hybrid semantic lookup over normalized vectors.
- Source-specific aliases are thin query wrappers, such as
  `ssbm_data_sheet/api/lookup_address.py`,
  `powerpc_docs/api/lookup_instruction.py`,
  `external_mirrors/api/lookup_external_symbol.py`, and
  `discord_knowledge/api/topics_for_terms.py`.

`banned_patterns` is the QA ship gate's executable record of maintainer
rejections: `data/banned.jsonl` (one record per rejection; `agent_exhibit`
detectors feed the pre-ship review prompt, human-approved `regex` detectors
become extra `review_lint` rules) and `data/tombstones.jsonl` (fuzzy
token-shingle fingerprints that block resubmission of rejected hunks). Loader
contracts and field shapes live in the source's `data/schema.md`; candidate
records arrive via `build_pr_postmortems.py --extract-banned-patterns` into
`data/proposals/` (see the
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
updates, such as data-sheet changes, stay as
`source_update_proposal` records until a source-specific updater validates and
applies them.

`mismatch_patterns` is a graph-owned derived source built during graph rebuild
from accepted curator records and imported historical lessons. It stores
generalized mismatch-pattern entities and evidence entities, then links them to
the current code graph through file, function, and PR edges. Raw objdiff and
checkdiff rows remain tool/run evidence; durable pattern knowledge enters the
resource graph only after it appears in accepted or imported lessons.

Package scripts expose the CLI-first graph surface:

- `bun run kg:sources`
- `bun run kg:status -- --project melee`
- `bun run kg:import-agent-state`
- `bun run kg:curate`
- `bun run kg:maintain`
- `bun run kg:rebuild -- --project melee`
- `bun run kg:search`
- `bun run kg:file-card`
- `bun run kg:rank-features`
- `bun run kg:tool-runner:ghidra`
- `bun run kg:tool-runner:opseq`
- `bun run kg:tool-runner:mismatch-db`
- `bun run kg:tool-runner:mwcc-debug`

## Tool Runner Contract

Registered tools are live-ready only when `api/status.py --repo-root <repo_root>
--json` reports `operation_mode: live_runner_v1`, `runner_available: true`,
`runner_smoke_passed: true`, and a matching cache repo root. The smoke proof is
`cache/runner_status.json`;
generated runner rows and fallback lookup rows stay under the owning tool's
`cache/` and `indexes/` folders.

The current live runner paths are:

| Tool | Runner evidence |
| --- | --- |
| `ghidra` | Homebrew Ghidra/OpenJDK `analyzeHeadless` imports `build/GALE01/main.elf` and writes `ghidra_headless_probe.jsonl`. |
| `opseq` | Generated assembly under `build/GALE01/asm` is parsed into opcode fingerprints. |
| `mismatch_db` | `build/tools/objdiff-cli diff` runs against an imperfect function and writes tool-local objdiff mismatch summaries. Generalized pattern knowledge is surfaced through graph `mismatch_patterns`. |
| `mwcc_debug` | Wine runs `GC/1.2.5n/mwcceppc.exe -version` and the runner records MWCC build-rule snippets. |

Generated fallback rows such as symbol lookup, function shapes, and live runner
summaries remain useful tool-local API evidence, but they do not alone satisfy
strict live tool readiness.

The registered tools serve two audiences. Maintenance and operator workflows run
the tool runners to build caches and indexes; workers consume the small CLI APIs
during evidence gathering. Worker tool discoverability is rendered in the
worker prompt as `<available_tools>`, grouped by provider and type from
`packages/agents/src/tools/profile-data.ts`. Tool API results are
provenance-rich hypotheses, not source proof, and retained edits still need
local objdiff/checkdiff validation.

`kg-maintain` is the maintenance loop entry point. It uses pending-only PR
postmortem indexing, runs live tool runners unless `--no-tool-runners` is set,
rewrites tool lookup indexes, rewrites the curator enrichment, optionally runs
the knowledge-curator agent for proposal review, and rebuilds the graph. The
`run-loop` uses two lanes: fast in-epoch refresh runs
`kg-maintain --no-tool-runners` after a coalesced interval/report-count trigger,
and full boundary maintenance runs after report truth is rebuilt according to
`--full-kg-maintenance-mode`. The older background maintenance interval remains
available through `--knowledge-maintenance-interval-ms`.

## Past PR Library

`knowledge/sources/code_context/past_prs/data/` contains the stable PR dump and searchable
per-PR postmortem records. `knowledge/sources/code_context/past_prs/commands/` contains the
refresh, postmortem, and sync commands so this evidence library travels with
the orchestrator package.

The PR postmortem builder supports `--pending-only`, so maintenance can scan
the active PR corpus and only queue PRs whose
`postmortem/postmortem.json` is missing.
`--run-pr-agent` enables model-reviewed PR records; without it, deterministic
scaffold records still keep the graph indexable.

Current bootstrap status, 2026-06-09:

- `2550 / 2550` discovered PRs have complete raw slices and model-reviewed
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

## Child Nodes

- [Worker tooling gap report](10-worker-tooling-doc-gap-report.md): audit trail
  for the worker-facing tool guidance promoted into active context.
- [Melee PR review QA standards](20-melee-pr-review-qa-standards.md): review
  checklist distilled from the past-PR corpus.
- [Melee PR review QA coverage audit](21-melee-pr-review-qa-coverage-audit.md):
  corpus coverage and evidence counts for the QA standards.

## Related

- [Knowledge model](../../10-system-design/50-knowledge-model.md)
- [PR-review agent](../agents/20-pr-review.md)
