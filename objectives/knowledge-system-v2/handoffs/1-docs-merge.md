# Thread 1 — Knowledge docs rewrite: make V2 the canonical knowledge documentation

Repo: `~/Github Repos/Codecaine/gamecube-decomp-harness`. Read `AGENTS.md` first. Other threads are
active in this repo (a backfill run, a validation pass) — `git status` before you start, coordinate
around files you didn't create, and never commit without my explicit go.

## Where things stand
The Knowledge System V2 is built and on `main` (commit `b1c08852`). Its docs live under
`docs/40-new-features/40-knowledge-system-v2/` and are current with the code: record contracts,
knowledge sources, librarian pathways (including the new `40-backfill` page and the queue-consumer
outline), migration, worklist. They were written as a feature proposal; they are now the truth.

Three doc homes now disagree about what the knowledge system is:
1. `docs/40-new-features/40-knowledge-system-v2/` — current, V2, the truth.
2. `docs/10-system-design/40-knowledge/` — describes the OLD system (learnings ledger, graph facts,
   the retired librarian doors, knowledge_record revisioning).
3. `docs/20-implementation/10-agents/…` — implementation pages; the legacy `30-librarian` page was
   retired in place with a callout but not rewritten; the worker-summarizer, librarian-v2, and
   backfill-librarian have no implementation pages of their own.

## Step 1 — interview me before writing anything
Use structured questions. Align on, at minimum: (a) the target structure — does V2 REPLACE
`10-system-design/40-knowledge` wholesale, get blended into it, or does the system-design tree
become a short conceptual overview that links into the V2 contract pages; (b) what happens to
`40-new-features/40-knowledge-system-v2` afterwards — stays as the contract home, or moves under
system-design (moving changes every cross-reference; `docs:links` must stay at 0 stale); (c) which
implementation pages to write (per agent? per module — store, ingest, indexes, apply, backfill
runner, queue consumer?); (d) the record-linkage canvas
(`30-record-contracts/assets/canvases/record-linkage-map.canvas.json` still diagrams the pre-V2
tables) — regenerate, or replace with an inline diagram block; (e) prose/style standards for the
audit pass (the section's existing pages are the style reference: one state-shape per table,
enums as tables, "who writes" tables, process-outlines for flows, worked examples with real ids).

## Step 2 — do the rewrite
- All `doc.json` edits are made BY YOU DIRECTLY, never through codex — codex strips the rich-text
  format. Use the custom components already in use in the section: `state-shape`, `process-outline`,
  `structured-table`, `callout`, `code` (with annotations), `sequence`/`canvas` assets. Copy block
  shapes from existing pages rather than inventing new ones.
- Ground every page in the code as it is: the modules under `apps/server/src/core/knowledge-v2/`
  (`storage`, `records`, `views`, `locator`, `ingest`, `index`, `migration/prioritize`, `apply`,
  `backfill`, `librarian`, `summarizer-job`, `renarrate`, `card`), the agents under
  `apps/server/src/core/agent-catalog/agents/knowledge/`, and the tool profiles under
  `apps/server/src/core/tools/`. Real numbers are available read-only from
  `games/melee/knowledge/knowledge.sqlite` (22,237 targets, 6,316 entities, etc.).
- Keep `docs/40-new-features/40-knowledge-system-v2/90-worklist/doc.json` updated as items land
  (rows: canvas regeneration, style and prose audit).
- No code changes in this thread. If a doc reveals a code/contract mismatch, record it in the
  worklist rather than fixing code.

## Definition of done
`bun run docs:links` → 0 stale references; `bun run docs:audit` → 0 findings under the knowledge
sections you touched (the tree has 11 pre-existing E6 findings elsewhere — leave those); every
retired concept (learnings ledger, knowledge_record revisioning, librarian doors, related_target /
entity_target tables, `file` entity kind, unit targets) is either gone or explicitly marked
historical; a one-page reading order exists for a newcomer; and a summary of what moved where.
Commit only when I say.
