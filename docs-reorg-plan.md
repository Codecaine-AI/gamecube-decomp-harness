# Docs Reorg Plan — target tree + per-file changes

Source: full audit of all 122 `doc.json` bundles (2026-08-17). Target flow:
architecture → registration/setup → process overview → state diagram → state objects → workflows (each: overview / state / detailed flows).

Legend: **NEW** = author from scratch · **REWRITE** = restructure existing content · **EDIT** = targeted changes · **MOVE** = content relocates · **FIX** = hygiene repair only.

---

## Target file tree

```
docs/
├── doc.json                                        FIX
├── 00-foundation/doc.json                          EDIT
├── 10-system-design/
│   ├── doc.json                                    EDIT   (reading path gains 35-process-overview)
│   ├── 20-architecture/doc.json                    EDIT   (+ system-flow canvas)
│   ├── 30-games/
│   │   ├── doc.json                                EDIT
│   │   ├── 10-game-model/doc.json                  EDIT
│   │   ├── 20-registration-and-setup/doc.json      NEW    ★ biggest authoring gap
│   │   ├── 30-cycles/doc.json                      EDIT   (renumber from 20-)
│   │   └── 40-save-points/doc.json                 REWRITE (renumber from 30-; sync content moves out)
│   ├── 35-process-overview/doc.json                NEW    ★ promoted Game Phase Walk + knowledge lane
│   ├── 40-harness-state/
│   │   ├── doc.json                                EDIT
│   │   ├── 10-state-composition/
│   │   │   ├── doc.json                            EDIT   (+ state composition tree canvas ★)
│   │   │   ├── 10-harness-state/doc.json           EDIT
│   │   │   ├── 20-workflow-slot/doc.json           FIX
│   │   │   ├── 30-cycle-state/doc.json             EDIT
│   │   │   ├── 40-sync-state/doc.json              FIX
│   │   │   ├── 50-run-state/doc.json               EDIT
│   │   │   ├── 60-pr-state/doc.json                EDIT
│   │   │   └── 70-knowledge-state/doc.json         EDIT
│   │   ├── 20-dispatch-authority/doc.json          FIX
│   │   ├── 30-operator-actions/doc.json            EDIT   (+ cycle.open / registration actions?)
│   │   ├── 40-durable-records/doc.json             EDIT
│   │   ├── 50-game-events/  (all 8 bundles)        FIX    (links; 3 pages flagged for later move)
│   │   └── 60-event-handshake/doc.json             FIX
│   ├── 50-workflows/
│   │   ├── doc.json                                REWRITE (phase model stays; phase walk moves to 35)
│   │   ├── 10-sync/
│   │   │   ├── doc.json                            REWRITE → overview + diagram
│   │   │   ├── 10-sync-state/doc.json              NEW    (statuses move here; links canonical shape)
│   │   │   └── 20-reconciliation-and-publication/  MOVE   (detailed flows split out of the monolith)
│   │   ├── 20-run/
│   │   │   ├── doc.json                            REWRITE → overview + diagram
│   │   │   ├── 10-run-state/doc.json               REWRITE (dedupe vs canonical; keep status tables)
│   │   │   ├── 20-director-loop/doc.json           (keep)
│   │   │   ├── 30-board-prioritization/doc.json    (keep)
│   │   │   ├── 40-workers/…                        (keep, 4 bundles)
│   │   │   └── 50-process-guardians/doc.json       FIX
│   │   └── 30-pr/
│   │       ├── doc.json                            REWRITE → overview + diagram + links
│   │       ├── 10-pr-state/doc.json                NEW    (statuses + progress tables move here)
│   │       ├── 20-score-gate-and-handoff/doc.json  REWRITE (split; run-side gates stay)
│   │       ├── 30-qa-ship-gate/doc.json            MOVE   (split out of 20-)
│   │       └── 40-campaign-and-tracking/doc.json   REWRITE (state shapes move to 10-pr-state)
│   └── 60-knowledge/
│       ├── doc.json                                EDIT   (+ pointer to new process spine)
│       ├── 05-process-overview/doc.json            NEW    (Enqueue→Claim→Materialize→Publish spine)
│       ├── 10-principles/ … 90-record/             FIX    (26 broken blocks, 3 orphaned canvases)
│       └── (rest unchanged structurally)
├── 20-implementation/                              (no structural change; link fixes only)
└── 40-new-features/                                (no change; stale …/00-overview.md link fixes)
```

★ = requires new diagram authoring. Canvas embed pattern to copy:
`{"type":"canvas","props":{"src":"./assets/canvases/<name>.canvas.json","title":"…"}}`
(sole working example: `60-knowledge/40-knowledge-stores/20-knowledge-intake`).

Open decision: does knowledge become `50-workflows/40-knowledge`? Default here is **no** —
`70-knowledge-state` explicitly says it is "not a classic workflow slot" — it stays a separate
section but gets the same overview → state → flows internal shape.

---

## Per-file changes

### Top layer

#### `docs/doc.json` — FIX
- Replace the degraded `[file-tree block]` quote with a real `file-tree` block (or delete it).
- Fix dangling reference: "reading path from the Sudoku core idea…" — `10-core-idea` was
  deleted and merged into `00-foundation`; repoint the sentence.
- Add `30-games` to the Start Here links (currently unlinked from the root).

#### `docs/00-foundation/doc.json` — EDIT
- Repair merge-seam corruption: a paragraph begins mid-word ("les, prompts, and reports…").
- Smooth the tone break at "Core Idea" — H3/H4 sections are raw meeting-notes prose
  ("EX, humans will copy and paste code…") inconsistent with the H2 sections above.
- Add outbound links (currently zero): "guardian" → process-guardians, "selected game" → 30-games.
- Resolve or remove the stray open annotation in `annotations.json` (body: "test").

#### `10-system-design/doc.json` — EDIT
- Insert `35-process-overview` into the Reading Path between Games and Harness State.
- Add a link back to `00-foundation` and forward to `20-implementation`.

---

### 1. Architecture

#### `20-architecture/doc.json` — EDIT
- Keep the static "Machine at Altitude" ASCII + component sections as-is.
- Add a short "How a game flows" paragraph + **NEW system-flow canvas**: registration → cycle
  open → sync baseline → run epochs → PR campaign → back through sync, with knowledge jobs as
  a parallel lane. This is the "how the system flows" piece the page currently lacks.
- Link to `35-process-overview` as the full walkthrough, and to `30-games` (currently unlinked
  despite sharing the board/game boundary).

---

### 2. Games, registration, worktrees, cycles

#### `30-games/doc.json` — EDIT
- Add the new `20-registration-and-setup` child to the Section Map; renumber links.
- Move the terminology-migration changelog note out of the index (drop it or move to 90-record).
- Fix stale id (`10-intake-and-cycles-00-overview`).

#### `30-games/10-game-model/doc.json` — EDIT
- Keep as the definitional/invariants page (game boundary, canonical worktree, baseline/head).
- Add links: → registration-and-setup, → `40-harness-state/.../30-cycle-state`, → sync
  Baseline Preparation (currently exactly one outbound link).

#### `30-games/20-registration-and-setup/doc.json` — **NEW** (the genuine gap)
Nothing like this exists anywhere; assemble from three fragments the schema already implies:
- **Game registration**: what configuration a game supplies (source repo, tools, policy
  defaults, knowledge inputs — the shape is asserted in game-model but never proceduralized).
  Who registers, what is validated, where the game descriptor lives.
- **Worktree provisioning**: who clones the canonical worktree, where it lives, first-open
  validation. Source: `cycle.opened` event payload already carries `worktree_identity`.
- **Cycle open**: pull the three opening bullets buried in `30-cycle-state` ("allocates the
  envelope identity and captures baseline outside the active slot…"), the `cycle.opened`
  payload (`baseline_revision`, `initial_head_revision`, `opening_sync_id`), and sync's
  "Baseline Preparation" role. Contrast with close (which already has 4 documented
  preconditions); give open the same treatment, including the first-cycle/bootstrap case.
- Flag for decision: the operator action surface has no `game.create`/`cycle.open` action —
  either document the actual entry path or add the actions to `30-operator-actions`.

#### `30-games/30-cycles/doc.json` (was 20-) — EDIT
- Keep Durable Container / Single Active Cycle / Timeline / Workflow Authority / Invariants.
- Replace the weak one-clause "cycle opens on a captured baseline" with a link to
  registration-and-setup.
- Slim "Run-to-PR Lifecycle" to a pointer at `35-process-overview` (it duplicates the Game
  Phase Walk in weaker form).
- Link the things it names but never links: Run, PR, sync, dispatch authority, save points,
  epochs. Fix stale id (`75-cycle-architecture`).

#### `30-games/40-save-points/doc.json` (was 30-) — REWRITE
- **MOVE out**: the first ~third is sync staging→validate→confirm→publish semantics under a
  save-points title; relocate to `50-workflows/10-sync` (its reconciliation/publication child).
- Keep: timeline responsibilities table, save-point structure table, capture/failure
  semantics, close gate, where-we-are contract.
- Fix: no H1; H3 appears before any H2; "Related" list is unlinked plain text (link all
  three targets); stale id (`70-save-points`).

---

### 3. Process overview

#### `35-process-overview/doc.json` — **NEW** (mostly by promotion, not authoring)
- **MOVE in**: the "Game Phase Walk" and "Handoffs" sections from `50-workflows/doc.json` —
  the only end-to-end narrative in the tree, currently buried where nobody top-level links it.
- Extend the walk with the knowledge lane (currently excluded entirely: "not a fourth game
  phase" and then never shown) and the registration/cycle-open front edge from #2.
- **NEW canvas**: one lifecycle diagram — the same picture as the architecture flow sketch
  but with each phase's key data artifacts (baseline, epochs/integration commits, ship set,
  campaign, knowledge jobs) shown flowing between phases.
- Link every phase name to its workflow bundle and every state name to its composition page.

---

### 4 + 5. Harness state (diagram + object representations)

#### `40-harness-state/10-state-composition/doc.json` — EDIT
- **NEW canvas**: the state composition tree — HarnessState → {cycle, sync, run, pr,
  active_workflow (DispatchLease), queued_dispatch_requests, knowledge, trace} and one level
  deeper (RunState → epochs → target claims → worker states → checkpoints; PrCampaign →
  series → work items; SyncState → intake/staging/reconciliation/publication). Sources: the
  HarnessState JSON example, the `HarnessStateView` code tree in 30-operator-actions, and the
  record inventory in 40-durable-records. This is target-flow item 4 and exists nowhere today.
- Add headings (page is currently one paragraph + 7 bullets); fix badly stale hashed id.

#### `10-harness-state/doc.json` — EDIT
- Keep the shape + revision contract (strong). Add links down to its 6 sibling child-state
  pages (tree edges currently live only in the parent index).

#### `20-workflow-slot/doc.json` — FIX
- Prose references an `authority` field ("its authority field remains null") that the
  StateEnvelope shape does not declare — add the field or fix the prose.

#### `30-cycle-state/doc.json` — EDIT
- Dedupe: "Container slot" / "Single-active rule" prose restates `30-games/30-cycles`; keep
  the typed shape + flows, link the behavior page instead of restating it.
- The opening-mechanics bullets MOVE (copy) into `20-registration-and-setup`; keep a short
  version here with a link.
- Reconcile `status: active|closing|closed` with the event catalog's wider cycle-phase
  family (`cycle.complete`, `cycle.pr_*`, `cycle.running_*`).

#### `40-sync-state/doc.json` — FIX
- Text corruption: "the durable shape those behaviors **game**." (find-replace glitch).
- Already the best-linked state page; after `10-sync-state` exists (see workflows), point the
  Flows section at it rather than restating event-level rules.

#### `50-run-state/doc.json` — EDIT
- Stays canonical for the RunState shape (it is the only typed source).
- Dedupe against `50-workflows/20-run/10-run-state` (see that entry): this page keeps shape,
  composition, and Admit/Execute/Close flows; drops the duplicated RunInputs semantics,
  pause/recovery narrative, and pending-integration protocol in favor of links.

#### `60-pr-state/doc.json` — EDIT
- Stays canonical for `PrCampaignState` + `PrSeriesState` (currently specified in **4 places**).
- Absorb the "PR Projection Contracts" field rules from `50-game-events/20-registry-and-catalog`
  (state-object contracts don't belong in the event catalog); the partial same-named shapes in
  campaign-and-tracking and envelope-and-lineage become links.

#### `70-knowledge-state/doc.json` — EDIT
- Promote the ~22 per-job fields that exist only in the JSON example into the typed `fields`
  list.
- After `60-knowledge/05-process-overview` exists, link it (the Flows here are the de-facto
  knowledge process spine today).

#### `20-dispatch-authority` / `30-operator-actions` / `40-durable-records` / `60-event-handshake` — FIX/EDIT
- All four have **zero outbound links**; add them (each names HarnessState, handoff events,
  workflows repeatedly).
- `30-operator-actions`: decide whether `game.create` / `cycle.open` join the 21-action
  surface (see registration entry above).
- `40-durable-records`: its record inventory feeds the composition-tree canvas; add links to
  the state pages each record belongs to.
- `60-event-handshake` vs `50-game-events/30-dispatch-cycle-and-replay`: the handoff-snapshot
  and spool-replay rules are stated twice with no cross-reference — pick one owner, link from
  the other.

#### `50-game-events/*` — FIX (defer any moves)
- Index lists its 7 children as **unlinked plain text**; link them. All 7 children have zero
  outbound links; add the obvious ones (sync events ↔ sync-state, PR contracts ↔ pr-state).
- Flag for a later pass (out of scope for this reorg): `50-read-api-and-reconstruction`
  (HTTP contract), `70-operator-trace-timeline` (UI copy spec), `60-kernel-trace-linkage`
  (telemetry) sit oddly under "harness state" and could move to `20-implementation`.

---

### 6. Workflows — each becomes: overview (w/ diagram) → state → detailed flows

#### `50-workflows/doc.json` — REWRITE
- Keep: Phase Model (slot composition + dispatch lease rules).
- **MOVE out**: Game Phase Walk + Handoffs → `35-process-overview` (leave a pointer).
- State explicitly that each child follows the same three-part shape.

#### Sync — `10-sync/` (currently one 26KB monolith, no children)
- `doc.json` — REWRITE into the overview: what sync is, inputs, authority boundaries, and a
  **NEW process-overview canvas** (observe → stage → reconcile → validate → confirm →
  atomic publish, with the data each step touches). Fix stale id
  (`01-cycle-operating-flow`). Link `40-sync-state` (currently no link to its own state).
- `10-sync-state/doc.json` — **NEW** (thin): the 9-status table + status invariants MOVE here
  from the monolith; links the canonical `40-sync-state` shape instead of duplicating it.
- `20-reconciliation-and-publication/doc.json` — MOVE: Baseline Preparation, Staged
  Reconciliation, Confirmed Publication sections from the monolith, **plus** the sync
  staging/publication content moving out of `30-games/40-save-points`. Add a
  `process-outline` block (sync currently has none anywhere).

#### Run — `20-run/`
- `doc.json` — REWRITE from a 5-bullet index into a real overview: scheduler/epoch/worker
  narrative + **NEW process-overview canvas** (wake event → board snapshot → epoch admission
  → worker attempts → integration → boundary), linking each child as the detail page.
- `10-run-state/doc.json` — REWRITE (the worst duplication in the tree, ~60–70% overlap with
  canonical `50-run-state`):
  - Keep (unique, high-value): the 8-status control table, the 6-value `scheduler_condition`
    table, the `Epoch-Integration:` trailer literal + `pending_integrations` row detail.
  - Drop in favor of links: RunInputs field semantics, pause/recovery narrative, sync
    continuity, the rest of the pending-integration protocol.
  - **Fix the contradiction**: this page says activation freezes `head_revision` inside
    RunInputs; the canonical page (and this page's own prose) model it as a mutable mirror
    with `configuration_snapshot` in inputs instead. Canonical page wins.
  - Add outbound links (currently zero).
- `20-director-loop`, `30-board-prioritization`, `40-workers/*` — keep as the detailed-flow
  pages (the strongest section in the tree). Minor: link director-loop → board-prioritization.
- `50-process-guardians/doc.json` — FIX: zero outbound links; add them.

#### PR — `30-pr/`
- `doc.json` — REWRITE: keep the Phase Boundary narrative, add a **NEW process-overview
  canvas** (ship set → promotion gate → QA gate → split plan → campaign → series →
  review/repair cycles → merge/close), and add links — the page currently has **zero**,
  its children are referenced as plain text.
- `10-pr-state/doc.json` — **NEW** (thin): Campaign Progress + Series Progress status tables
  and the work-item outcomes table MOVE here from campaign-and-tracking; links canonical
  `60-pr-state` instead of embedding partial same-named shapes.
- `20-score-gate-and-handoff/doc.json` — REWRITE/split (58KB merging four concerns):
  - Keep here: change ledger, integration gate, end-of-run classification, promotion gate,
    and the 14-step Prepare Handoff pipeline.
  - **MOVE out** → `30-qa-ship-gate/doc.json`: the L1–L4 QA layers, the 2026-06-11
    maintainer-review incident, failure asymmetry, QA repair lane.
- `40-campaign-and-tracking/doc.json` (was 20-) — REWRITE: becomes the detailed-flow page
  (authority/entry, operational lifecycle, activations, bounded publication, observation,
  legacy adoption, closure). The two truncated `PrCampaignState`/`PrSeriesState` state-shape
  blocks MOVE to `10-pr-state` as links to canonical. Add outbound links (currently zero).

---

### Knowledge — `60-knowledge/` (same three-part shape, stays its own section)

#### `05-process-overview/doc.json` — **NEW**
- The knowledge process spine: worker close → enqueue → claim/lease → materialize → publish →
  revision advance → worker surfaces. Content largely exists in `70-knowledge-state`'s Flows
  and `20-implementation/30-knowledge` (which currently documents this better than the design
  tier); write the design-altitude version here and link both.
- Cross-link `70-knowledge-state` (the section currently emits **zero** cross-tree links).

#### Broken-block repair — FIX (all 26 degraded placeholders live here)
- `20-connection-map`: re-link the orphaned `connection-map.canvas.json` +
  `connection-map.svg` (the only whole-system knowledge picture; both visuals currently dead
  `[canvas block]`/`[image block]` quotes).
- `40-knowledge-stores/10-knowledge-ledger`: restore 4 lost blocks (`[state-shape]`,
  `[interaction-surface]`, `[structured-table]`, `[process-outline]`).
- `60-worker-surfaces`: effectively an empty stub — its whole payload is a
  `[structured-table block]` placeholder; rebuild the surfaces table.
- `90-record/*`: 16 placeholder blocks + 1 orphaned canvas asset; restore or delete.
- `50-inputs/{10-past-prs,20-discord}`: restore 2 `[process-outline]` blocks.

---

### Cross-cutting passes (one sweep each, after the moves)

1. **Links**: adopt one link style (relative `./`/`../`), make workflow ↔ state-page links
   reciprocal, fix stale `…/00-overview.md` paths in `40-new-features`.
2. **Bundle ids**: renormalize ~10 stale ids (`03-state-and-events-*`,
   `75-cycle-architecture`, `01-cycle-operating-flow`, bare `index`, …) to match paths.
3. **Diagrams**: 5 new canvases total — system flow (architecture), lifecycle
   (process-overview), state composition tree (state-composition), sync overview, run
   overview, PR overview (the last three can share a visual language). Plus the 3 orphaned
   canvas re-links in knowledge.

## Sequencing

1. Hygiene fixes + link sweep (no structural risk, shrinks the diff for review).
2. New pages by promotion/move: 35-process-overview, 10-sync-state, 10-pr-state, splits.
3. Deduplication edits (run-state, pr-state, cycle-state, event overlaps).
4. New authoring: registration-and-setup, knowledge process overview, worker-surfaces rebuild.
5. Canvases last (need the settled structure to point links at).
