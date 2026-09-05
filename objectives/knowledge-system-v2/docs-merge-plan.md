# Knowledge docs merge plan

Status: executed 2026-09-01. Sections 1 to 8 are the plan as agreed; section 10 records what actually moved where. Not committed.

Decisions already taken in the interview (2026-09-01):

- V2 moves into `docs/10-system-design/40-knowledge/`. The old tree is pruned and rewritten, not kept as an overview.
- `docs/40-new-features/40-knowledge-system-v2/` goes away after the move.
- The record-linkage canvas gets regenerated as a canvas, not replaced by an inline block.
- The legacy code graph and search-index pages move to a deprecated section. They are not a current chapter.
- Reports (worklist, V2 audit, validation-and-rollout) go under `90-record`.
- Retired pages are deleted. The record keeps the decision and a retired-concepts table.
- Open: whether `docs/20-implementation` survives as a section at all. See section 8.

## 1. What the code says today

The docs have to describe this, so the tree is shaped around it.

### Knowledge V2 (`apps/server/src/core/knowledge-v2/`)

| Module | Files | What it owns |
|---|---|---|
| `storage` | ddl, schema, store, transaction, migrations 001-002 | The V2 SQLite store `games/melee/knowledge/knowledge.sqlite`, its DDL, and ordered migrations |
| `records` | records/index.ts (707 lines) | Row contracts and insert/update helpers for target, entity, link, fact, evidence, worker_run, submission, pull_request, event |
| `views` | knowledge-record, target-ledger, unit-view | The assembled read views. `knowledge-record` is a query, never a row |
| `locator` | locator.ts | The closed locator grammar (`pr://`, `attempt://`, `code://`, `discord://`, `wiki://`) and its parser |
| `ingest` | discord, wiki, prs, attempts, entities, reconcile, ledger-classification, cli | Importers, report reconciliation (targets), entity extractor, legacy-ledger classifier, `kg2-ingest` |
| `index` | fts, embeddings/{chunker,indexer,provider}, pr-archive, job, rebuild, db | `knowledge-index.sqlite`: FTS5 per source plus an embedding index, rebuildable wholesale, `kg2-index` |
| `migration/prioritize` | prioritize.ts | The backfill funnel ranking, `kg2-prioritize` |
| `apply` | index.ts, resolver.ts | The write gate: validates a librarian proposal, resolves every evidence locator, writes fact/evidence/link/curated entities |
| `librarian` | consumer, lane, context, cli | The event-driven queue consumer over `index_task`, per-pathway context assembly, parallel lanes, `kg2-librarian` |
| `backfill` | runner, context, cli | The target-driven backfill runner and its context assembler, `kg2-backfill` |
| `summarizer-job` | index, transcript | The `worker_summary` job at run close: transcript digest, worker_run and submission rows, `run_narrative` sidecar |
| `renarrate` | runner, cli | Historical re-narration of past runs, `kg2-renarrate` |
| `card` | card.ts | The worker boot card built from V2 records |
| `tools` | tools.ts | The eight `kv2_*` librarian tools |

Agents (`apps/server/src/core/agent-catalog/agents/knowledge/`), all on `codex-lb/gpt-5.6-sol`, registered in `registry.ts` next to `worker`:

| Agent | Description in code | Tool profile |
|---|---|---|
| `librarian-v2` | Curate evidence-grounded knowledge proposals from one event-driven index task without writing store state directly | `defaultLibrarianToolProfile` |
| `backfill-librarian` | Fill out the knowledge records of one target and its directly linked entities by researching every available source, subject by subject | `defaultLibrarianToolProfile` |
| `worker-summarizer` | Turn one worker transcript and its deterministic run digest into narrative run and submission reasoning | none (single prompt) |

`defaultLibrarianToolProfile` is `code_graph_search`, `graph_related_functions`, and the eight `kv2_*` tools (discord, wiki, pr, attempt search; subject_record, entity_lookup, resolve_locator, unit_context). The worker profile still carries the legacy `code_graph_file_card`, `code_graph_search`, `knowledge_graph_search`, `graph_related_functions`, `past_prs_search`, `ledger_search`.

### Legacy code that is still live

Not everything under `apps/server/src/core/knowledge/` retired. These are still wired and need current pages, not historical ones:

- The code graph (`core/knowledge/graph/`): builders for call-graph edges, ghidra xrefs, opseq similarity, siblings, past PRs, mismatch patterns, decomp standards, and the old learnings ledger; queries `file-card` and `related-functions`; the `kg-*` jobs. It feeds the worker tools above and the librarian's two graph tools.
- The learnings ledger (`core/knowledge/ledger.ts`): still read by `ledger_search` (the worklist calls it "the documented legacy exception until migration"), by `summarizer-job`, `renarrate`, and `epoch-boundary`, and served by `api/routes/knowledge-learnings.ts` to the dashboard.
- Standards (`core/knowledge/standards.ts`): served by the HTTP server; V2 sources page says standards sit outside the graph, QA-owned.
- The knowledge dashboard (`apps/frontend/src/pages/workspace/knowledge/index.tsx`) is still the flat legacy ledger view. The V2 dashboard page is a design that is not built.

Gone from code (grep of non-test source): `related_target`, `entity_target`, `knowledge_record` as a table, `background_knowledge_jobs`, `kg-librarian-backfill`, `tacticLookup`, the condense/curation/pr-indexer doors, the `integration-resolver` agent. `HAS_LEARNING` and `SIBLING_OF` survive only inside the legacy graph builder.

### The store, read-only, 2026-09-01

| Table | Rows |
|---|---:|
| target | 22,237 (function 19,828, data 2,409) |
| target_status | 22,210 |
| entity | 6,316 (struct_field 4,613, translation_unit 1,075, struct 628) |
| pull_request | 22,275 |
| worker_run | 5,378 |
| submission | 14,791 |
| run_narrative | 4,592 |
| discord_message | 76,452 |
| wiki_section | 12,995 |
| index_task | 1,869 |
| source_watermark | 4 |
| fact, evidence, link, event, event_ref, subject_index_state | 0 (backfill phase 3 has not written yet) |

There is no `unit` target kind and no `file` entity kind. The backfill run plan in this folder still says "1,075 unit targets"; that is another thread's file and it is stale on this point.

## 2. Proposed tree for `docs/10-system-design/40-knowledge/`

Ordered as a newcomer should read it. The index page is the reading order.

```
40-knowledge/                                  Knowledge System (index = reading order + the five domains table)
├── 10-knowledge-sources/                      <- V2 20-knowledge-sources, moved
│   ├── 10-archival/
│   │   ├── 10-discord
│   │   ├── 20-pull-requests
│   │   └── 30-wiki
│   └── 20-operational/
│       ├── 10-attempts
│       └── 20-code
├── 20-record-contracts/                       <- V2 30-record-contracts, moved; canvas regenerated
│   ├── 10-core-objects/
│   │   ├── 10-targets
│   │   ├── 20-entities/
│   │   │   ├── 10-game-concepts
│   │   │   └── 20-patterns
│   │   └── 30-links
│   ├── 20-knowledge-system/
│   │   ├── 10-fact
│   │   ├── 20-knowledge-record
│   │   └── 30-evidence
│   ├── 30-target-ledger/
│   │   ├── 10-worker-runs
│   │   ├── 20-pull-requests
│   │   └── 30-events
│   └── assets/canvases/record-linkage-map.canvas.json
├── 30-evidence-confidence-and-lifecycle       <- V2 40, moved
├── 40-librarian-pathways/                     <- V2 50, moved
│   ├── 10-sync/
│   │   ├── 10-pull-requests
│   │   ├── 20-discord
│   │   ├── 30-wiki
│   │   └── assets/sequences/sync-ingest.sequence.json
│   ├── 20-run/
│   │   ├── 10-run-closed
│   │   └── assets/sequences/run-closed.sequence.json
│   ├── 30-epoch-boundary/
│   │   ├── 10-regression
│   │   ├── 20-drift-recheck
│   │   └── assets/sequences/epoch-boundary.sequence.json
│   └── 40-backfill
├── 50-search-and-cards/                       NEW: the V2 derived layer, rebuildable, never canonical
│   ├── 10-knowledge-index                     knowledge-index.sqlite, FTS per source, embeddings, kg2-index
│   └── 20-target-card                         card.ts, what the worker sees at boot
├── 60-worker-surfaces                         <- old 50-worker-surfaces, rewritten: boot card, tool profile, ship gate
├── 70-standards                               <- old 20-knowledge-stores/30-standards, verified against standards.ts
├── 80-migration-and-rebuild                   <- V2 60, moved; phases marked executed or pending
├── 85-dashboard-and-operator-controls         <- V2 70, moved, "designed, not built" callout
└── 90-record/                                 appendix: history, reports, deprecated
    ├── 10-implementation-record/              <- old, kept
    │   ├── 10-agent-runs                      marked historical (legacy librarian runs)
    │   └── 20-migration-map                   marked historical, keeps its backfill canvas
    ├── 20-decision-log                        <- old, kept; V2 decisions appended
    ├── 30-open-questions                      <- old, refreshed
    ├── 40-v2-audit                            <- V2 10-current-state-audit, dated 2026-08-28
    ├── 50-retired-concepts                    NEW: one table, every retired concept and what replaced it
    ├── 60-validation-and-rollout              <- V2 80, stale seams table pruned
    ├── 70-worklist                            <- V2 90, stays live
    └── 80-deprecated/                         live legacy code, kept until it retires; Deprecated callout on each
        ├── 10-code-graph                      <- old 10-per-target/10-code-graph
        ├── 20-opseq-analogs                   <- old 20-search-indexes/10-opseq-analogs
        ├── 30-ghidra-xrefs                    <- old 20-search-indexes/20-ghidra
        └── 40-siblings                        <- old 20-search-indexes/30-siblings
```

Why this shape and not another:

- Sources before contracts. Every fact cites a source through a locator, so the reader needs the five sources first. The V2 index already reads this way.
- The legacy code graph is live and worker-facing, but it is on its way out, so it sits under the record as deprecated rather than as a chapter a newcomer reads. The pages keep their content and gain a callout naming what replaces them and who still reads them (worker tools, the librarian's two graph tools, `kg-*` jobs).
- The search-and-cards chapter is small on purpose. Two pages, both V2 code. If the knowledge index grows a third page, the folder is already there.
- The old `10-per-target` framing ("everything hangs off a target") is still true and moves into the index page prose. It does not need a folder.
- Depth. The structure standard wants three doc levels below a chapter. `20-record-contracts/10-core-objects/20-entities/10-game-concepts` is four. V2 already has this shape and the pages are good; I am not flattening it in this pass, but it is worth a decision later.
- `60-principles` folds into the index. Its regimes table (derived, corpus, events, beliefs, authored) is the V2 domains table with old names.
- `70-connection-map` dies. The regenerated record-linkage canvas is the connection map now.
- `90-record` stays the appendix and takes the V2 pages that are reports rather than contracts: the audit, validation, the worklist. The implementation tier standard says reports do not belong in the docs tree; the record folder is the one place this tree already tolerates them.

## 3. Agents become a system-design chapter

Decided in the third interview round. An agent page is design, not implementation: it says how the agent works with the data structures (what it reads, what it may write, when it runs, what its output contract is). Swap the kernel underneath and the page still holds. The kernel itself stays implementation.

```
10-system-design/
├── 10-architecture
├── 20-game
├── 30-harness
├── 40-knowledge/                              section 2
├── 45-agents/                                 NEW chapter, mid-gap insert per the numbering standard
│   ├── doc.json                               roster (registry.ts), the one-writer rule, shared tool profiles, schema per agent
│   ├── 10-worker                              <- 20-implementation/10-agents/10-running/10-worker, moved
│   ├── 20-librarian-v2                        NEW
│   ├── 30-backfill-librarian                  NEW
│   └── 40-worker-summarizer                   NEW
├── 50-workflows
└── 60-tracing
```

Every agent page uses the worker page shape: opening paragraph, Sources line, Context Inputs, Tools, When It Runs, Governed By, Decisions. The three knowledge agents add a Writes table (which rows, through which pathway, always via the apply layer) because that is the contract that matters for them.

Why `45` and not inside `40-knowledge`: the worker is not a knowledge agent, and the operator wants agents as one folder. Reading order becomes architecture, game, harness, knowledge, agents, workflows, tracing. Agents sit after the data they act on and before the workflows that dispatch them.

### What remains under `docs/20-implementation/`

The section's future is still open (section 8). This thread makes only the changes the knowledge merge forces:

```
20-implementation/
├── 10-agents/
│   ├── doc.json                               shrinks to the kernel: what the agent runtime provides to every catalog entry
│   ├── 10-running/                            DELETE (worker page moved to 45-agents; integration-resolver removed from code)
│   ├── 30-librarian                           DELETE (decisions salvaged into the record decision log)
│   └── 40-runtime                             stays; becomes the only child, so the folder collapses to one page
├── 20-server-jobs                             one-line fix: knowledge jobs live under knowledge-v2/*/cli.ts
└── 30-knowledge                               rewritten as one page: knowledge-v2 module map with decisions, legacy graph boundary
```

`10-agents` with a single child collapses per the structure standard: `10-agents/doc.json` absorbs the runtime page and `40-runtime` goes away. I am not writing the six module pages proposed earlier; expanding a tier the operator may remove is the wrong direction. The module decisions go on the one `30-knowledge` page.

## 4. Page-by-page disposition

### Old tree `10-system-design/40-knowledge/`

| Page | Disposition |
|---|---|
| index | rewrite as reading order + domains table |
| 10-per-target (index) | delete; prose moves to index |
| 10-per-target/10-code-graph | move to 90-record/80-deprecated/10-code-graph, Deprecated callout, verify against builders |
| 10-per-target/20-search-indexes (index) | delete; its children flatten into 80-deprecated |
| .../10-opseq-analogs | move to 80-deprecated/20-opseq-analogs, verify against opseq-similarity.ts |
| .../20-ghidra | move to 80-deprecated/30-ghidra-xrefs, retitle (no longer "proposed": the builder is wired) |
| .../30-siblings | move to 80-deprecated/40-siblings, verify against siblings.ts |
| .../40-crosswalk | delete; crosswalk exists only in a smashwiki python helper, not in the graph |
| 10-per-target/30-attempt-ledger | delete; replaced by 20-record-contracts/30-target-ledger |
| 20-knowledge-stores (index) | delete |
| .../10-knowledge-ledger | delete; replaced by fact + evidence + knowledge-record; row goes in retired-concepts |
| .../20-smashwiki-corpus | delete; replaced by 10-knowledge-sources/10-archival/30-wiki |
| .../30-standards | move to 70-standards, verify |
| 30-inputs (index), 10-past-prs, 20-discord | delete; replaced by 10-knowledge-sources/10-archival |
| 30-inputs/90-retired | fold into 90-record/50-retired-concepts |
| 40-processing and its three children, canvas, sequence | delete; replaced by 40-librarian-pathways (index_task queue, consumer). Leasing/fencing rows go in retired-concepts |
| 50-worker-surfaces | move to 60-worker-surfaces, rewrite (WorkerBootContext, tacticLookup are gone) |
| 60-principles | delete; regimes table folds into index |
| 70-connection-map (+ canvas, svg) | delete; record-linkage canvas replaces it |
| 90-record and children | keep; mark agent-runs and migration-map historical; append V2 decisions |

### V2 tree `40-new-features/40-knowledge-system-v2/`

| Page | Disposition |
|---|---|
| index | merge into the new 40-knowledge index |
| 10-current-state-audit | move to 90-record/40-v2-audit |
| 20-knowledge-sources (7 pages) | move to 10-knowledge-sources |
| 30-record-contracts (15 pages + canvas) | move to 20-record-contracts; regenerate canvas |
| 40-evidence-confidence-and-lifecycle | move to 30 |
| 50-librarian-pathways (12 pages + 3 sequences) | move to 40; strip "Draft for review" from the three indexing_state shapes after checking them against ddl.ts |
| 60-migration-pruning-and-rebuild | move to 80; phases 0-2 marked executed, 3 pending |
| 70-dashboard-and-operator-controls | move to 85 with a status callout |
| 80-validation-and-rollout | move to 90-record/60; prune the "Current Implementation Seams" table (all six rows point at retired files) |
| 90-worklist | move to 90-record/70 |
| .index/backlinks.db | see move mechanics |
| `40-new-features/doc.json` | drop the V2 row from its list |

### Elsewhere

| Page | Disposition |
|---|---|
| 20-implementation/10-agents/10-running/10-worker | move to 10-system-design/45-agents/10-worker |
| 20-implementation/10-agents/30-librarian | delete; decisions salvaged into the record decision log |
| 20-implementation/10-agents/10-running/30-integration-resolver | delete; decision recorded in the record decision log |
| 20-implementation/30-knowledge | rewrite as one module-map page (its four decisions describe background_knowledge_jobs, which no longer exists) |
| 20-implementation/10-agents (index) and 40-runtime | collapse into one kernel page |
| 20-implementation/20-server-jobs | one line |
| 40-new-features/30-global-flow-map/60-knowledge | out of scope; it is a working map of the legacy knowledge_absorption flow. Add one callout pointing at the new tree, nothing more |

## 5. Cross-reference remap

Every `reference.path` that starts with `40-new-features/40-knowledge-system-v2/` is rewritten by a script (python, not codex) using this table, then `docs:links` must report 0 stale.

| Old prefix | New prefix |
|---|---|
| `40-new-features/40-knowledge-system-v2` | `10-system-design/40-knowledge` |
| `.../20-knowledge-sources` | `.../10-knowledge-sources` |
| `.../30-record-contracts` | `.../20-record-contracts` |
| `.../40-evidence-confidence-and-lifecycle` | `.../30-evidence-confidence-and-lifecycle` |
| `.../50-librarian-pathways` | `.../40-librarian-pathways` |
| `.../60-migration-pruning-and-rebuild` | `.../80-migration-and-rebuild` |
| `.../70-dashboard-and-operator-controls` | `.../85-dashboard-and-operator-controls` |
| `.../10-current-state-audit` | `.../90-record/40-v2-audit` |
| `.../80-validation-and-rollout` | `.../90-record/60-validation-and-rollout` |
| `.../90-worklist` | `.../90-record/70-worklist` |

Inbound references from outside the knowledge trees (21 found) and where they land:

| Old target | Referrers | New target |
|---|---|---|
| `10-system-design/40-knowledge` | architecture, harness, system-design index, agents index | unchanged |
| `.../30-inputs` | game index, registration-and-setup | `10-knowledge-sources` |
| `.../40-processing` | process-overview, harness-state, operator-actions, sync process, run-loop, run index, workflows index, server-jobs, state | `40-librarian-pathways` |
| `.../20-knowledge-stores/10-knowledge-ledger` | save-points, durable-records | `20-record-contracts/20-knowledge-system` |
| `.../20-knowledge-stores` | 30-librarian (deleted anyway) | `20-record-contracts` |
| `.../50-worker-surfaces` | worker capabilities | `60-worker-surfaces` |
| `20-implementation/10-agents`, `.../10-running`, `.../10-running/10-worker`, `.../30-librarian` | implementation index, agents index, running index | `10-system-design/45-agents` and its children |

The link labels on those referrers say things like "Knowledge Processing" and "Knowledge Ledger". Repointing the path is mechanical; the label and the sentence around it need a human pass so they do not promise the old concept.

## 6. Move mechanics

What the docs tooling actually does, from reading `Core/docs-system` (citations are file:line in that repo).

- A doc's address is its directory path. The `id` and `title` fields in `doc.json` are inert: `links check` resolves `reference.path` against the filesystem (`packages/docs-cli/src/index.ts:216-231`), the viewer derives the page title from the folder name (`packages/docs-viewer/src/render/doc-title.ts:42-56`), and nothing checks id uniqueness. Moved pages keep their ids.
- There is no CLI move and no redirect table. `moveDocBundle` exists behind `POST /api/move` but rewrites only references to the moved root, refuses an existing destination, and is not atomic (`packages/docs-index/src/move-doc.ts:19-33, 175-184`). So: `git mv` whole bundle directories, then a python pass over every `doc.json` and `*.canvas.json` rewriting `reference.path` strings by the table in section 5.
- Assets ride with the bundle. `./assets/canvases/x.canvas.json` resolves relative to the page directory and the resolver requires the `assets/canvases/` and `assets/sequences/` segments (`packages/docs-server/src/confine.ts:52-62, 148-158`).
- `.index/backlinks.db` is per docs root. The nested copy under the V2 tree is an artifact of someone running the CLI with that subtree as root; the root rescan skips dot-directories so nothing reads it, and `.gitignore` only matches `docs/.index/`. It gets `git rm`, and `links check` rescans the real root on every run.
- Audit codes that bite a move: E1 duplicate sibling prefix, E2 folder not `NN-`, E3 a section with two or more children and no `doc.json`, E4 a leaf without `doc.json`, E6 a block whose props fail the component schema. An orphan `assets/` folder left behind after deleting a page's `doc.json` earns E2 plus E4, so deletions remove the whole bundle.
- Audit does not check that a parent links every child, that canvas `src` files exist, or that a `heading` has children. Those are review conventions.
- Table cells cannot carry `reference` spans (`structured-table/state.ts:7-21`). Links out of a table go in prose or a list-item under it.
- `structured-table` rejects a span-array cell with no attributed span; plain text cells are strings.
- The canvas file format is the diagram-mode envelope (`schemaVersion: 1`, `objects[]`, `connections[]`, optional sections with `parentId`). The cleanest template in this repo is `docs/10-system-design/10-architecture/assets/canvases/system-flow.canvas.json`.
- The salvage rule from the implementation-layer standard applies to every page marked delete: any still-normative rule gets moved to its owning page before the page goes.

## 7. Style standards for the audit pass

The V2 contract pages are the reference. A page passes when:

1. One `state-shape` per table, named exactly as the table, fields in DDL order.
2. Every enum is a `structured-table` with value and meaning.
3. Every table page has a Who Writes table naming the writer and the pathway.
4. Every flow is a `process-outline`, and sequences over three actors get a `sequence` asset.
5. Worked examples use real ids from the store (`main/melee/ft/ftcommon:ftCo_800BFFD0`, a real `rn-` run id, a real PR number).
6. No proposal tense. "Draft for review", "proposed", "will", "should" go, unless the thing is genuinely unbuilt, in which case the page carries a callout saying so.
7. Numbers carry a date and come from the store or the code, not from an earlier doc.
8. Retired concepts appear only in `90-record/50-retired-concepts` and in dated historical pages, never in a current contract page.

## 8. Open decisions

Decided across three interview rounds: V2 moves into `40-knowledge`; the code graph goes to `90-record/80-deprecated`; reports go under `90-record`; retired pages are deleted; agents become `10-system-design/45-agents` in the worker page shape.

Still open, none blocking this thread:

1. The rest of `docs/20-implementation`. Server-jobs, state, tools, ui, and the rewritten knowledge module map stay where they are for now. Whether the tier survives, becomes trailing `80-implementation` pages per chapter, or is salvaged into decision entries and deleted, is its own pass. Recorded in the worklist.
2. Dashboard page. Kept as a design page with a "designed, not built" callout. Move it to the record if you would rather it not read as a contract.
3. Global flow map knowledge lane. One callout pointing at the new tree. Say so if you want it left alone.
4. Depth of `20-record-contracts/10-core-objects/20-entities/*`. Four levels where the standard wants three. Not flattening in this pass.

## 9. Execution order

Estimate is for me doing the doc.json edits directly; each step ends with `docs:links` and `docs:audit` clean.

1. Move the V2 tree and rewrite paths by script. Regenerate backlinks. Delete the old pages the table marks delete. Links to 0. About 1 hour.
2. Rewrite the 40-knowledge index, retired-concepts page, worker-surfaces, standards, projections chapter. About 3 hours.
3. Regenerate the record-linkage canvas from ddl.ts. About 1 hour.
4. Agents chapter: move the worker page, write the three knowledge agent pages and the roster index, collapse 10-agents to the kernel page, rewrite 30-knowledge. About 3 hours.
5. Audit pass over every moved V2 page against section 7; append V2 decisions to the decision log; refresh open questions; update the worklist rows. About 3 hours.
6. Repoint and re-word the 21 inbound references. About 1 hour.

Nothing is committed until told.

## 10. What moved where

Executed 2026-09-01. `bun run docs:links` reports 0 stale references. `bun run docs:audit` reports 7 errors, all pre-existing E6 findings outside the knowledge and agents chapters (reference spans inside table cells on architecture, game, harness, workflows, and the global flow map); the two that were inside the knowledge record are fixed. No code was changed; the store was read only.

| From | To | Note |
|---|---|---|
| `40-new-features/40-knowledge-system-v2/20-knowledge-sources` (7 pages) | `10-system-design/40-knowledge/10-knowledge-sources` | moved; discord and wiki shapes settled against the DDL |
| `.../30-record-contracts` (15 pages, canvas) | `.../20-record-contracts` | moved; canvas regenerated from ddl.ts; run_narrative added to the tables and FK lists; pull_request FK now shows the target/entity XOR |
| `.../40-evidence-confidence-and-lifecycle` | `.../30-evidence-confidence-and-lifecycle` | moved |
| `.../50-librarian-pathways` (12 pages, 3 sequences) | `.../40-librarian-pathways` | moved; indexing_state shapes settled; callout: no producer yet for regression and drift_recheck |
| new | `.../50-search-and-cards` (index, knowledge-index, target-card) | written from index/* and card.ts |
| `10-system-design/40-knowledge/50-worker-surfaces` | `.../60-worker-surfaces` | rewritten from worker/context.ts, profiles, scan-diff, qa-gate; new sequence asset replaces the legacy ship-gate one |
| `.../20-knowledge-stores/30-standards` | `.../70-standards` | rewritten from standards.ts, standards-files.ts, decomp-context.ts |
| `.../60-migration-pruning-and-rebuild` | `.../80-migration-and-rebuild` | moved; build status table added (phases 0-2 executed, 3 pending) |
| `.../70-dashboard-and-operator-controls` | `.../85-dashboard-and-operator-controls` | moved; "designed, not built" callout |
| `.../10-current-state-audit` | `.../90-record/40-v2-audit` | moved; historical callout |
| new | `.../90-record/50-retired-concepts` | 14 V2 retirements plus the pre-V2 retired inputs and parked paths |
| `.../80-validation-and-rollout` | `.../90-record/60-validation-and-rollout` | moved; seams table removed |
| `.../90-worklist` | `.../90-record/70-worklist` | moved; rows added for the merge and five code/contract gaps |
| `10-system-design/40-knowledge/10-per-target/10-code-graph`, `20-search-indexes/{10-opseq-analogs,20-ghidra,30-siblings}` | `.../90-record/80-deprecated/{10-code-graph,20-opseq-analogs,30-ghidra-xrefs,40-siblings}` | moved; Deprecated callout on each; new index page |
| `10-system-design/40-knowledge/doc.json` | rewritten | reading order, five domains, working memory loop, store snapshot |
| `.../90-record/doc.json`, `20-decision-log`, `30-open-questions` | rewritten | V2 decisions current, old ones in history with what superseded them; eight open questions |
| `.../90-record/10-implementation-record` and children | kept | historical callouts; table references moved out of cells |
| `10-system-design/40-knowledge/{10-per-target, 20-knowledge-stores, 30-inputs, 40-processing, 60-principles, 70-connection-map}` and their assets | deleted | 18 pages; rules salvaged into the index, retired-concepts, and the decision log |
| `20-implementation/10-agents/10-running/10-worker` | `10-system-design/45-agents/10-worker` | moved; context inputs and run-close line updated |
| new | `10-system-design/45-agents/{doc.json, 20-librarian-v2, 30-backfill-librarian, 40-worker-summarizer}` | written from the agent directories, consumer, runner, summarizer job, apply layer |
| `20-implementation/10-agents/{10-running, 30-librarian, 40-runtime}` | deleted | runtime content absorbed into `20-implementation/10-agents/doc.json`; running and librarian decisions salvaged into the agents chapter and the decision log |
| `20-implementation/30-knowledge` | rewritten | module map with five decisions |
| `20-implementation/20-server-jobs` | edited | knowledge jobs now named as knowledge-v2/*/cli.ts plus the deprecated kg jobs |
| 12 inbound referrers (architecture, game, harness, workflows, state) | edited | labels and sentences now name Librarian Pathways, Knowledge Sources, fact and evidence rows |
| `40-new-features/doc.json` | edited | V2 row removed |
| `40-new-features/30-global-flow-map/60-knowledge` | edited | one callout pointing at Librarian Pathways |
| `40-new-features/40-knowledge-system-v2/.index/backlinks.db` | deleted | accidentally tracked artifact |

Code/contract mismatches found while writing, recorded in the worklist and not fixed here:

1. Nothing enqueues `regression` or `drift_recheck` index tasks. The run-loop does not insert event rows at integration failures and reconciliation does not flag drifted `code://` facts.
2. Both librarian runners pass a `toolProfile.disable` list naming tools that are not in the librarian profile.
3. `storage/schema.ts` (drizzle) does not model `run_narrative` or the `evidence_fact_id` index.
4. `entity.kind` allows `parameter`, but the extractor does not write it.
5. The worker-summarizer is registered with role and tool profile `pr-reviewer` and grouped under `running` in the kernel catalog.

Also noted: the backfill run plan in this folder still says "1,075 unit targets"; the store has no unit target kind. That file belongs to the backfill thread.
