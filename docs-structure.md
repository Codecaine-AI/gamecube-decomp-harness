# System Design Docs — Target Structure

Working doc for the docs reorg. Top half: the target reading order and what each
chapter is *for*. Bottom half: per-doc audit notes (what moves, what merges, what
gets cleaned up). Iterating on the top half first; audit fills in once the
skeleton is locked.

## Principles

- **Vertical slices, not horizontal layers.** A workflow chapter owns its own
  state doc and its own process outline. No "all states first, all processes
  later." The old `40-harness-state/10-state-composition` per-workflow state
  docs merge into their workflow chapters.
- **Narrative before mechanics.** The reader gets the story of what happens
  before the state machinery that makes it happen.
- **Tracing is the epilogue.** Game events are the record of everything the
  earlier chapters did. They read last, reframed as tracing/tracking.
- **Knowledge reads target-outward.** The target is the center — the worker's
  unit of work — and the knowledge chapter starts there and expands outward to
  indexes, stores, and finally the input pipeline. Not inputs-first.
- **Blocks used properly.** Process outlines for processes, tables for
  enumerable facts, prose for the what/where/why. Flat over nested.

## Reading order

### 1. Foundation *(exists: `00-foundation`, unchanged)*

### 2. Architecture *(exists: `10-system-design/20-architecture`)*

The core overarching shape of the system. One chapter, read first.

### 3. Game *(from `30-games`, slimmed)*

What a game **is** and how it enters the system.

- Game model
- Registration and setup — add the game, configure its syncing toolkits

Cycles and save points move OUT of this chapter — they are harness concepts
that run *on* a game, not properties of the game itself.

### 4. Harness *(merge of `35-process-overview` + the global parts of `40-harness-state` + cycles/save points from `30-games`)*

The harness is placed around a registered game. This chapter merges what were
three separate chapters (registration → process overview → harness state) into
one arc: here is the wrapper, here is what it holds, here is the full process
it drives.

- Harness state — the global envelope; one workflow slot per game, only one
  workflow runs on a game at a time
- Cycles
- Save points / campaign — the harness's persistent progress
- Process overview — the end-to-end story on a registered game: initial sync →
  initial knowledge build → start a run (worker blurb) → break into PRs → PR
  process
- Dispatch authority, operator actions
- Durable records, slimmed to the global parts: the jobs table, the
  one-revision-one-causing-event rule, and a link table to where each record
  family is documented (run tables → Run, facts → Knowledge,
  StateEnvelope/provenance → Tracing)
- Closes by positioning the knowledge system as part of the harness, linking
  forward to chapter 5

DECIDED: story first — the process overview opens the chapter; every
mechanics doc after it is motivated by a beat in the story.
DECIDED: durable records splits by slice; only the global remainder stays
here.

### 5. Knowledge System *(from `60-knowledge`, reframed target-first)*

The knowledge system is a core part of the harness — it reads directly after
it, and before Workflows, so the reader knows what the knowledge base *is*
before Sync processes into it and before Run's workers crawl it.
DECIDED: sibling chapter after Harness (not nested) — purely for size; the
Harness chapter carries the "knowledge is part of the harness" positioning
statement.

Reframed around the target, inside-out:

- **The target is the center** — the worker gets a target and searches outward
  from it: code graph, search indexes (opseq analogs, ghidra, siblings,
  crosswalk), attempt ledger. (Existing `30-per-target` — "everything hangs
  off a target" — leads the chapter.)
- **Stores searched across** — knowledge ledger, SmashWiki corpus, standards
- **Inputs → processing** — no build step; a standing job pipeline: inputs
  (past PRs, Discord — the melee sources are all we have today) →
  classification → librarian intake → publication with provenance. Two
  triggers: sync completion feeds external sources in; worker completion feeds
  attempt results in. Documented once, here — the workflows only show their
  hand-off points.
- **Worker surfaces** — how the worker actually touches all of the above; the
  payoff of the chapter
- Principles and connection map fold in as supporting material, not openers

`90-record` (decision log, open questions, implementation record) is working
record, not design — likely stays but as an explicit appendix.

### 6. Workflows *(from `50-workflows`, each slice absorbs its state doc)*

Three slices. Each workflow is a vertical slice: **its state, then its process
outline.** Knowledge processing is NOT a fourth slice — the pipeline lives in
chapter 5; Sync and Run just point at their hand-offs to it.

- **Sync** — sync state (merged from `40-harness-state/.../40-sync-state` +
  `50-workflows/10-sync/10-sync-state`); process outline: pull Discord, pull
  PRs, run the processing agent on each; ends with the hand-off into knowledge
  processing; reconciliation and publication
- **Run** — run state (merged, same pattern); the run loop (not a director
  loop): board prioritization → build the queue → worker grabs a sandbox and
  works → on completion (success or not) queue a knowledge process (hand-off
  to chapter 5); workers (lifecycle, capabilities, write safety); process
  guardians
- **PR** — PR state (merged); score gate and handoff; QA ship gate; campaign
  and tracking

### 7. Tracing *(from `40-harness-state/50-game-events` + `60-event-handshake`)*

Last chapter: how everything above is traced and tracked. Game events reframed
as the tracing story.

- Event envelope and lineage
- Registry and catalog
- Per-domain events (dispatch/cycle/replay, sync/knowledge)
- Read API and reconstruction
- Kernel trace linkage
- Operator timeline
- Event handshake

## Target doc surface (edit-as-we-go)

The full target tree. Edited alongside the reading-order section above; the
two must agree. `←` notes mark merges, moves, and open questions.

```
docs/
├── 00-foundation/                            (unchanged)
├── 10-system-design/
│   ├── 10-architecture/                      ← was 20-architecture
│   ├── 20-game/                              ← was 30-games, slimmed
│   │   ├── 10-game-model/
│   │   └── 20-registration-and-setup/
│   ├── 30-harness/                           ← merge: 35-process-overview + global 40-harness-state + cycles/save-points from 30-games
│   │   ├── 10-process-overview/              ← the story; opens the chapter (DECIDED)
│   │   ├── 20-harness-state/                 ← canonical harness state + workflow slot merged in
│   │   ├── 30-cycles/                        ← from 30-games; absorbs state-composition/30-cycle-state
│   │   ├── 40-save-points/                   ← from 30-games/40-save-points
│   │   ├── 50-dispatch-authority/
│   │   ├── 60-operator-actions/
│   │   └── 70-durable-records/               ← slimmed to global parts (DECIDED: split by slice):
│   │                                            jobs table + revision/causation rule + link table;
│   │                                            run tables → 50-workflows/20-run/10-run-state,
│   │                                            facts → 40-knowledge, StateEnvelope/provenance → 60-tracing
│   ├── 40-knowledge/                         ← was 60-knowledge; part of the harness, sibling for size (DECIDED)
│   │   ├── 10-per-target/                    ← leads: "everything hangs off a target"
│   │   │   ├── 10-code-graph/
│   │   │   ├── 20-search-indexes/            (opseq-analogs, ghidra, siblings, crosswalk)
│   │   │   └── 30-attempt-ledger/            (tactics)
│   │   ├── 20-knowledge-stores/              (knowledge-ledger, smashwiki-corpus, standards)
│   │   ├── 30-inputs/                        (past-prs, discord, retired)
│   │   ├── 40-processing/                    ← was 70-background-jobs + librarian intake; absorbs state-composition/70-knowledge-state
│   │   │   ├── 10-source-classification/
│   │   │   ├── 20-job-lifecycle-and-leasing/
│   │   │   └── 30-publication-and-provenance/
│   │   ├── 50-worker-surfaces/               ← the payoff
│   │   ├── 60-principles/                    ← demoted from opener to supporting
│   │   ├── 70-connection-map/
│   │   └── 90-record/                        ← appendix: decision log, open questions, impl record
│   ├── 50-workflows/
│   │   ├── 10-sync/
│   │   │   ├── 10-sync-state/                ← merge: state-composition/40-sync-state + existing 10-sync-state
│   │   │   └── 20-process/                   ← outline: pull discord/PRs → process each → reconcile/publish → hand off to 40-knowledge/40-processing
│   │   ├── 20-run/
│   │   │   ├── 10-run-state/                 ← merge: state-composition/50-run-state + existing 10-run-state
│   │   │   │                                    + run-domain tables from durable-records (runs, targets, epochs,
│   │   │   │                                    claims, worker states, checkpoints, integration outcomes)
│   │   │   ├── 20-run-loop/                  ← rename from 20-director-loop ("Run Scheduler Loop")
│   │   │   ├── 30-board-prioritization/
│   │   │   ├── 40-workers/                   (lifecycle, capabilities, write-safety)
│   │   │   └── 50-process-guardians/
│   │   └── 30-pr/
│   │       ├── 10-pr-state/                  ← merge: state-composition/60-pr-state + existing 10-pr-state
│   │       ├── 20-score-gate-and-handoff/
│   │       ├── 30-qa-ship-gate/
│   │       └── 40-campaign-and-tracking/
│   └── 60-tracing/                           ← was 40-harness-state/50-game-events + 60-event-handshake
│       ├── 10-envelope-and-lineage/          ← absorbs StateEnvelope/provenance contract from durable-records
│       ├── 20-registry-and-catalog/
│       ├── 30-dispatch-cycle-and-replay/
│       ├── 40-sync-and-knowledge-events/
│       ├── 50-read-api-and-reconstruction/
│       ├── 60-kernel-trace-linkage/
│       ├── 70-operator-timeline/
│       └── 80-event-handshake/
├── 20-implementation/                        (unchanged for now)
└── 40-new-features/                          (unchanged)
```

Dissolved entirely: `40-harness-state/10-state-composition/` (every child merges
into its vertical slice), `35-process-overview` (into 30-harness),
`50-workflows/doc.json` intro absorbs the one-slot rule pointer,
`60-knowledge/05-process-overview` (splits across the 40-processing children),
`60-knowledge/40-knowledge-stores/20-knowledge-intake` (splits across the three
40-processing children — it is processing, not a store),
`60-knowledge/30-per-target/30-attempt-ledger/10-tactics` (merges into
attempt-ledger).

## Per-doc audit

Audit criteria (from the 2026-08-18 pass; Codex fleet, brief at
`/tmp/docs-audit/brief.md`):

- **Component underuse** — the docs are paragraph/list-item walls. Available
  palette: structured-table, file-tree, state-shape, process-outline,
  sequence, interaction-surface, canvas. Current system-design usage: 0
  file-tree, 0 sequence, 19 state-shape, 27 process-outline, 31
  structured-table across ~1,900 blocks.
- **Style guide adherence** — what/where/why narrative prose punctuated by
  components; no atomized bullet walls.
- **Nesting to flatten**; **duplication to resolve** per the merge notes in
  the target tree above.

Verdicts: `rewrite` (shape is wrong) / `restructure` (content fine, blocks
wrong) / `light-touch` / `ok`.

### Reading Path (top doc)

| Doc | Destination | Verdict | Top fixes |
| --- | --- | --- | --- |
| doc.json | doc.json (rewritten) | rewrite | Replace obsolete nested map with the new chapter order; chapter catalog → `structured-table` (chapter, question answered, destination); remove change-history "Design Source" voice |

### Architecture

| Doc | Destination | Verdict | Top fixes |
| --- | --- | --- | --- |
| 20-architecture | 10-architecture | restructure | "How the Swarm Flows" → `sequence`; "Worker Types and Toolboxes" → `structured-table`; "System Boundary" bullet wall → `structured-table` + short rationale prose; keep existing canvas; retarget links |

### Game

| Doc | Destination | Verdict | Top fixes |
| --- | --- | --- | --- |
| 30-games/doc.json | 20-game/doc.json (slimmed) | restructure | Remove cycles/save-points framing; "Section Map" → 2-row `structured-table`; opener is meta-preamble — rewrite around game identity + configuration |
| 30-games/10-game-model | 20-game/10-game-model | restructure | Move "Baseline and Head", active-cycle exclusivity, head-advance events, workflow authority → Harness/Cycles; "Game Boundary" 2-level bullet trees → prose + `structured-table`; responsibilities catalog → `structured-table` |
| 30-games/20-registration-and-setup | 20-game/20-registration-and-setup | restructure | Move "Cycle Open" + "Baseline Preparation and Opening Sync" → Harness (leave handoff link); worktree 5-field prose → `state-shape`; prepare→verify→activate→emit → `process-outline`; operator/sync exchanges → `sequence`; consolidate duplicate open-surface callouts |
| 30-games/30-cycles | 30-harness/30-cycles (merged) | restructure | Merge state-composition/30-cycle-state as one `state-shape`; dedupe container/single-active/timeline-writer/head-advance/close-policy explanations; "Ordered Timeline" → `structured-table` (writer, purpose, head effect, failure rule); contract fact walls → tables + short why prose |
| 30-games/40-save-points | 30-harness/40-save-points | restructure | "Capture and Failure Semantics" → `sequence` (operator → sync staging → durable publication → capture) + failure prose; 9 trigger kinds + "Where-We-Are Contract" → `structured-table`s; split runs/ledger relationship into two ownership paragraphs; existing tables are fine |

### Harness

| Doc | Destination | Verdict | Top fixes |
| --- | --- | --- | --- |
| 35-process-overview | 30-harness/10-process-overview (chapter opener) | restructure | Delete "Game Phase Walk" (duplicates the top `process-outline` — absorb its phase outcomes there); "Handoffs" → `sequence` (sync → run → PR → sync incl. interrupted-phase recovery); "Knowledge Lane" → compact `process-outline` or reduce to handoff + link to 40-knowledge/40-processing; drop duplicated registration/cycle contracts (link instead); fix dissolved state-composition links; open with the story, not "this page" |
| 40-harness-state/doc.json | 30-harness (merged into chapter opener) | rewrite | "Section Map" 2-level bullet wall goes invalid post-reorg → short framing + concern/destination `structured-table`; opener duplicates aggregate/jobs/authority framing from children and competes with the story-first opener |
| 10-state-composition/doc.json | 30-harness/20-harness-state (partial; container dissolves) | restructure | Keep "Composition at a Glance" + canvas; "The Layers" 7 nested link pairs → `structured-table` (state, authority, destination); move ClaimToken/WorkerExecutor mechanics to owning docs; aggregate/jobs/result_ref prose duplicates child |
| 10-harness-state | 30-harness/20-harness-state (merged) | restructure | `state-shape` already right; "Consumer Reads" 5-step procedure → `process-outline`; keep aggregate/jobs/result_ref explanation once; Harness State owns the one-slot invariant — others link here |
| 20-workflow-slot | 30-harness/20-harness-state (merged) | restructure | Keep StateEnvelope `state-shape`; "What It Does" nested fact bullets → `structured-table` (concern, fields, authority, consumer); Create/Transition/Supersede procedures → `process-outline`s; rename — envelope also covers CycleState |
| 30-cycle-state | 30-harness/30-cycles (merged) | restructure | Keep CycleState `state-shape` (drop duplicate label); partner already covers container/single-active/lineage/close-guards — dedupe; 4 timeline entry kinds → `structured-table` (writer, evidence, head-advance); "Close Explicitly" → `process-outline` |
| 20-dispatch-authority | 30-harness/50-dispatch-authority | restructure | Keep DispatchLease `state-shape` + status table; delete lifecycle paragraph repeating table rows; `requestDispatch`/`beginDrain`/`releaseDispatch`/`recoverDispatch` semicolon prose → `interaction-surface`; acquire→drain→release→successor → `sequence`; drop "proposal"/"obsolete aliases removed" voice |
| 30-operator-actions | 30-harness/60-operator-actions | restructure | "State" text fence → `state-shape` (HarnessStateView, ActionProjection); 21-action bullet inventory across 5 sections → one `structured-table` (action, subject, transition, confirmation, owner); resolve or move the "Open decision"; fix dissolved links |
| 40-durable-records | 30-harness/70-durable-records (slimmed) + splits | rewrite | 11-item record wall → `structured-table` (family, authority, purpose, destination); only jobs table + one-revision/one-event rule stay; run tables → Run state; "Claims and Checkpoints" procedure → `process-outline` in Run; "Facts" duplicates Knowledge Ledger — one reconciled taxonomy; "Artifacts" → table if kept |

Per-workflow state-composition children (40/50/60/70-\*-state) are audited with
their destination slices below.

### Knowledge System — per-target, stores, framing docs

| Doc | Destination | Verdict | Top fixes |
| --- | --- | --- | --- |
| 60-knowledge/doc.json | 40-knowledge/doc.json | rewrite | Open target-first (current opener leads with the maintenance-regime taxonomy, conflicts with locked framing); "Reading Order" 9 nested link pairs → transitions or `structured-table`; v14-recovery/backfill callout → 90-record |
| 05-process-overview | **dissolved into 40-processing children** | restructure | "Claim and Lease" → 20-job-lifecycle; publication/revision → 30-publication-and-provenance; enqueue triggers → processing opener; its `process-outline` renders 7 independent roots — needs one named root; worker→queue→processor→authority handoffs → `sequence`; fix link to dissolved 70-knowledge-state |
| 10-principles | 40-knowledge/60-principles | restructure | Nearly all a 3-level bullet wall: 5 regimes → `structured-table` (regime, contents, truth owner, drift model); learning fields → `state-shape`; fix opaque "See §3"; rewrite opener as supporting material |
| 20-connection-map | 40-knowledge/70-connection-map | light-touch | Canvas is right; edge legend/traversal bullets → `structured-table`; remove superseded SVG + change-log prose; fix vague link names |
| 30-per-target/doc.json | 40-knowledge/10-per-target (chapter opener) | rewrite | Recast as the chapter opener: target → outward walk as compact `process-outline`; move "As built"/attachments/rebuild guarantees into code-graph child; resolve proposed-vs-live edge contradictions (CALLS, data-ref, siblings); "Files" bullet index → narrative links |
| 10-code-graph | …/10-code-graph | light-touch | Components already sound; split overloaded opener into what/where/why prose; name the process root; absorb parent's graph mechanics; drop "decided/deferred" history voice |
| 20-search-indexes/doc.json | …/20-search-indexes | restructure | Opening catalog + "Index build matrix" duplicate each other → one comparative table; "Multi-hop inference" → `process-outline`; clarify code-graph vs ghidra edge ownership; flatten orphaned drift bullets |
| 10-opseq-analogs | …/10-opseq-analogs | light-touch | Components right; drop "Exists today: yes; verdict unchanged" voice; name outline root |
| 20-ghidra | …/20-ghidra | restructure | Drop proposal-log voice ("This document defines"); outputs/access/status → `structured-table`; reconcile candidate-vs-approved contradiction; justify placement under search indexes |
| 30-siblings | …/30-siblings | light-touch | Split opener into what/where/why; drop "per the decision"/"proposed"; name outline root |
| 40-crosswalk | …/40-crosswalk | light-touch | Included/excluded families → `structured-table`; one consistent present-or-planned contract; name outline root |
| 30-attempt-ledger | …/30-attempt-ledger (absorbs tactics) | restructure | Lead with what a worker retrieves for one target; JSONC sketch conflicts with `AttemptRecord` → one canonical `state-shape` + one example; intake kinds → `structured-table`; merge tactics schema + lookup here |
| 30-attempt-ledger/10-tactics | merged into parent | restructure | Preserve `Tactic` state-shape + `tacticLookup` interaction-surface + current-code caveat; drop repeated derived-view claims and 10-category vocabulary; combine outlines |
| 40-knowledge-stores/doc.json | 40-knowledge/20-knowledge-stores | light-touch | Remove intake from the store catalog (it's processing, not a store); delete redundant "Files" list; fix broken ledger-origin table row |
| 10-knowledge-ledger | …/10-knowledge-ledger | rewrite | "Exists today: no" contradicts the live ledger/API/FTS/dashboard described later — rewrite to one present-state contract; 4 schema variants (JSONC, state-shape, JSON, TS) → one `state-shape` + one example; drift controls → `structured-table`; resolve `graduated` contradiction |
| 20-knowledge-intake | **split across 40-processing children** | rewrite | "Three doors"/typed batches/Discord classification → 10-source-classification; scheduling/retries/leases → 20-job-lifecycle; anchoring/corroboration/validation/supersession → 30-publication-and-provenance; "Live flow" → `process-outline`; 8 batch kinds → `structured-table`; backfill counts/timing history → implementation record |
| 30-smashwiki-corpus | …/20-smashwiki-corpus | light-touch | Drop migration voice; corpus ops (`searchCorpus`, `fetchSection`, `resolveCrosswalk`) → `interaction-surface` |
| 40-standards | …/30-standards | light-touch | Components fit; drop "exists today"/dated-decision voice; state human publication boundary directly; `HARDENS_INTO` must not imply auto-publication |

### Knowledge System — inputs, processing, worker surfaces, record

| Doc | Destination | Verdict | Top fixes |
| --- | --- | --- | --- |
| 50-inputs/doc.json | 40-knowledge/30-inputs | restructure | "Input inventory" table is right, but "Files" repeats its rows as bullets — delete; split overloaded opener; move daily-cron/upstream-PR mechanics → 40-processing |
| 50-inputs/10-past-prs | …/10-past-prs | restructure | Mirror layout (`data/prs/pr-NNNN/{raw,extracted,postmortem}`, `aggregate/`, `library/`) in dense prose → `file-tree`; its outline renders 4 disconnected roots → one "PR intake" root; drop "Verdict: restructure" migration voice |
| 50-inputs/20-discord | …/20-discord | rewrite | Oversized callout mixes schedule/extraction/evidence/access/migration history — split; archive fields → `state-shape` or table; outline renders as 4 peer roots; cron/extraction lifecycle → 40-processing; "Access" duplicates the callout |
| 50-inputs/90-retired | …/90-retired | restructure | Three H3 mini-sections share the same fields → one `structured-table`; parked paths → `file-tree`; historical "supersedes/previously decided" rationale → 90-record |
| 70-background-jobs/doc.json | 40-knowledge/40-processing | restructure | "Reading Order" bullets → narrative of the standing pipeline (input → classification → leased processing → publication); absorb knowledge-state's dispatch-truth vs domain-evidence distinction |
| 10-source-classification | …/10-source-classification | light-touch | "Proposed class" → "Class"; tighten opener; publication rules duplicate Acceptance Boundaries — keep classification here, execution in the publication child |
| 20-job-lifecycle-and-leasing | …/20-job-lifecycle-and-leasing | restructure | **Status vocabulary conflict**: this doc says `processing`, KnowledgeState.jobs says `claimed`/`running` — pick one canon; absorb lease/retry/fencing state; add queued→claimed→terminal `process-outline` |
| 30-processing-publication-and-provenance | …/30-publication-and-provenance | restructure | Acceptance rules → `structured-table` (source class, staging, authority, timing); stage→materialize→validate→accept→provenance → `process-outline`; drop classification prose repeated from sibling |
| state-composition/70-knowledge-state | 40-knowledge/40-processing (merged, dissolved) | rewrite | Duplicates every processing child; keep `KnowledgeState` `state-shape` trimmed to operator-facing projection; job/lease semantics → 20-job-lifecycle; publication lineage → 30-publication; three flows → `process-outline`s; preserve the "worker hook implemented but disabled by default" qualification; fix stale 05-process-overview link |
| 60-worker-surfaces | 40-knowledge/50-worker-surfaces | restructure | 4-row overview table hides structures in middle-dot cells: boot injection's 7 payload groups → `state-shape`; on-symptom/on-demand ops → `interaction-surface`; ship gate → prose + worker→QA→ledgers `sequence`; add chapter-payoff prose tying the layers together |
| 90-record/doc.json | 40-knowledge/90-record (appendix) | light-touch | Appendix framing already fits; flatten "Reading Order" pairs; state that history may contain superseded contracts |
| 90-record/10-implementation-record | unchanged path | light-touch | Openers contradict (four-phase rollout vs "every phase landed"); label planned vs as-built; Phase 0 outline references retired symlink |
| 10-implementation-record/10-agent-runs | unchanged path | restructure | Kernel config TS fence → `state-shape`; split pre-run plan (estimates, open decisions, blockers) from executed record (2,005 batches, <2h); resolve stale blockers |
| 10-implementation-record/20-migration-map | unchanged path | restructure | Opening matrix contradicted by later amendments — final dispositions in the table, history in a note; 5-quote amendment wall → prune; keep canvas + mode table + ONE canonical backfill flow |
| 90-record/20-decision-log | unchanged path | rewrite | 17 repeated question→quote→amendment sections → `structured-table` (topic, current decision, date, history ref); lead with current decisions; duplicate "lane 1" H3; 14-item History wall → date/change table |
| 90-record/30-open-questions | unchanged path | rewrite | Every "open" question was already resolved by the recorded execution — move to implementation record; keep only genuinely open items in a question/owner/status table |

### Workflows

| Doc | Destination | Verdict | Top fixes |
| --- | --- | --- | --- |
| 50-workflows/doc.json | 50-workflows | restructure | "Phase Model" text diagram → `structured-table` (workflow, slot, owned work, lease behavior); keep only the one-slot pointer + link to 30-harness/20-harness-state (don't pull StateEnvelope in); child index → narrative links; retarget stale links |
| 10-sync/doc.json | 50-workflows/10-sync | restructure | "Inputs" 4 intake kinds → `structured-table`; "Dispatch Authority" text fence → `process-outline`; "Authority Boundaries" actor bullet wall → table; operator→sync→staging→knowledge/PR exchange → `sequence` if canvas doesn't cover it |
| 10-sync/10-sync-state | merged sync-state doc | light-touch | Merge partner's `SyncState` `state-shape` + example ahead of the (good) 9-row status table; state each invariant once; collapse partner's "What It Does"/"Flows" bullet walls into narrative; reconcile partner's recovery-evidence claims vs shape fields |
| 10-sync/20-reconciliation-and-publication | 10-sync/20-process | restructure | Four sections repeat one process → single nested `process-outline` (prepare → stage/ingest/reconcile → validate → operator gate → publish/recover); publication → `sequence` (operator confirm, cycle repoint, durable txn, PR pushes, knowledge revision, lease release); end at 40-knowledge/40-processing handoff |
| 20-run/doc.json | 50-workflows/20-run | restructure | "How an Epoch Turns" → `process-outline`; "Where the Details Live" → `structured-table`; rename Director Loop → Run Loop throughout |
| 20-run/10-run-state | merged run-state doc | restructure | Merge partner's canonical `RunState` `state-shape`; paragraph-encoded status/activity tables → real `structured-table`s; "Pending Integration" → `sequence` (found/missing branches); remove circular "owned by the other page" language; absorb run-domain tables from durable-records |
| 20-run/20-director-loop | 20-run/20-run-loop | restructure | Five sections repeat the same loop → one canonical `process-outline`; "Three sizes"/capacity controls → `structured-table`; "Worker Delegation" → `sequence`; checkpoint contract → `state-shape`; flatten whitespace-simulated nesting |
| 20-run/30-board-prioritization | unchanged path | restructure | Snapshot+ranking → `process-outline`; limits/priors/signals → `structured-table`s; capacity definitions duplicated with run-loop — canonical here, link from loop |
| 20-run/40-workers/doc.json | unchanged path | light-touch | "Children" enumeration → `file-tree`; split overloaded opener into what/where/why |
| 40-workers/10-lifecycle | unchanged path | restructure | Malformed repeated-number list → one `process-outline` (claim → provision → attempt → validate → continue/close → settle/recover); checkpoint fields → `state-shape`; outcomes/touched-set → tables; write-set widening duplicates Write Safety — keep only the handoff |
| 40-workers/20-capabilities | unchanged path | light-touch | Tables already right; fix fragmentary opener; fold orphaned Related bullets into prose |
| 40-workers/30-write-safety | unchanged path | restructure | Six ClaimToken mutations → `interaction-surface`; ASCII integration diagram → `sequence` (worker → serial integrator → resolver/operator → boundary); `integration_outcomes` → `state-shape`; owns widening/fencing/reset contracts |
| 20-run/50-process-guardians | unchanged path | restructure | "Wake Semantics" mixes guardian incidents with scheduler wakeups → split into `structured-table` (event, producer, consumer, policy owner); recovery steps → `process-outline`; boundary rules → table |
| 30-pr/doc.json | 50-workflows/30-pr | restructure | "Phase Boundary" nested bullets → `process-outline`; "Queue Workers" → table (worker, responsibility, authority, write scope); flatten "In This Section"; retarget cycles link to 30-harness/30-cycles |
| 30-pr/10-pr-state | merged pr-state doc | restructure | Merge partner's `PrCampaignState`/`PrSeriesState` `state-shape`s ahead of status tables (every enum currently duplicated); partner's 4-level "Flows" event wall → `process-outline`; legacy adoption as separate compat note |
| 30-pr/20-score-gate-and-handoff | unchanged path | restructure | 8-item integration gate → table or named gate process; classifications/verdicts → tables; oversized "PR Boundary" prose → lane + slice-disposition tables + splitter→validator→campaign `sequence`; keep 14-stage Prepare Handoff outline; drop "now has its own page" change-log voice |
| 30-pr/30-qa-ship-gate | unchanged path | restructure | "Gate Layers" 7-bullet pipeline → table (layer, trigger, detector, failure mode, disposition); L1/L2 asymmetry → comparison table; final sweep→repair→ship paragraph → `process-outline` |
| 30-pr/40-campaign-and-tracking | unchanged path | restructure | Lifecycle 5-step list → `process-outline`; repeated fact walls → tables; operator→lease→worker→upstream-PR→observer → `sequence`; status meanings duplicate 10-pr-state — keep mechanics, link the state table; drop migration voice |
| state-composition/40-sync-state (source) | dissolves into 10-sync/10-sync-state | light-touch | `SyncState` `state-shape` leads the merged doc (drop duplicate component title); status meanings live only in the partner's table; no extra process component needed |
| state-composition/50-run-state (source) | dissolves into 20-run/10-run-state | rewrite | Five procedural flows (Admit/Execute/Pause/Reconcile/Close) → `process-outline`; "What It Does" bullet wall → prose; keep its concrete commit/trailer protocol once; status + scheduler-condition tables sit beside the shape |
| state-composition/60-pr-state (source) | dissolves into 30-pr/10-pr-state | restructure | Keep both `state-shape`s; Cut→Open→Review/Repair→Merge/Close → `process-outline`; dispatch/review/repair/release exchanges → `sequence`; `pr.adopt_legacy` → compat callout |

### Tracing (was game-events + event-handshake)

| Doc | Destination | Verdict | Top fixes |
| --- | --- | --- | --- |
| 50-game-events/doc.json | 60-tracing/doc.json | light-touch | Reframe opener as the tracing epilogue (currently a Harness State adjunct); "Contract map" 7-link bullet wall → prose or Area/What-it-traces `structured-table` |
| 10-envelope-and-lineage | 60-tracing/10 (absorbs StateEnvelope from durable-records) | restructure | "Envelope" text fence → `state-shape`; 5 accountable actors → `structured-table`; guardian settlement/successor acquisition → `sequence`; split oversized decision callout (keep one-event/one-revision rule, push recovery/PR topology to domain pages); drop migration-016 change-log voice |
| 20-registry-and-catalog | 60-tracing/20 | restructure | Split the single cross-domain catalog table into dispatch/run, sync/knowledge, PR, cycle tables; move `sync.observation_refreshed` → 40-sync-and-knowledge-events; add why-closed-registry rationale |
| 30-dispatch-cycle-and-replay | 60-tracing/30 | restructure | "Dispatch handoff" → `sequence` (kill the text pseudo-diagram); transport + save-point replay → `process-outline`s; cycle.\* events → `structured-table`; wake-queue mechanics stay in 80-event-handshake |
| 40-sync-and-knowledge-events | 60-tracing/40 | restructure | Ingestion authority → `sequence`; observation field fences → `state-shape` + tables; blocking/recovery + knowledge jobs → `structured-table`s; SyncState component moves to 50-workflows/10-sync/10-sync-state (keep only event-reconstruction here); typo "events game their" |
| 50-read-api-and-reconstruction | 60-tracing/50 | restructure | Query filters → parameter/constraint/behavior `structured-table`; pagination + projections + caused_by variants → `state-shape`s; response outcomes → table; drop "hosted … for now" callout; lead with trace inspection, then HTTP |
| 60-kernel-trace-linkage | 60-tracing/60 | restructure | Validated submission → `sequence`; cursor + link fields → `state-shape`; failure modes + both-direction join keys → `structured-table`s; drop stale relocation callout |
| 70-operator-trace-timeline | 60-tracing/70-operator-timeline | restructure | Pick one name ("operator timeline") and stick to it; workflow-kind→subject table; bounded continuation → `process-outline`; 7 dense visible-state paragraphs → one state/message/action table; drop stale callout |
| 60-event-handshake | 60-tracing/80-event-handshake | rewrite | Missing H1/title; reframe around the signal-to-trace boundary (durable scheduler signals vs accepted game facts); epoch-refresh/queue-priority detail → Run slice; 14-item wake-event wall → `structured-table`; worker→runner→scheduler → `sequence`; dispatch/spool sections duplicate 30-dispatch-cycle-and-replay → reduce to links |

