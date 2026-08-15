# Docs Tree — Target Structure (living agreement)

Source of truth for the docs-tree-audit interview. Nothing is edited in `docs/`
that is not agreed here first. Each section records: current child order,
proposed order, rationale, Ford's decision (dated), and open questions.

Baseline: commit f60ef61b, 2026-08-14. Audit: 0 errors / 14 W4 warnings
(no opening paragraph). Links: 0 stale.

## Interview Sections

The per-section interview collapsed into one whole-tree agreement (draft v3,
locked round 5) and was APPLIED as a batch on 2026-08-14. See "Apply Record".

## Apply Record (2026-08-14)

- M1 (codex xhigh): all moves from move_map.md executed with plain mv; 170 link
  retargets across 58 doc.json files; links 0 stale after.
- Waves A1–A4, B1–B4, C1–C5 (13 docs-writer kernel agents, headless pi,
  gpt-5.6-sol:low): every task completed, docs_check-verified, no out-of-scope
  edits. New docs created: 20-architecture, 30-projects/10-project-model,
  50-workflows index, 60-knowledge/90-record index. Merges: state-view →
  30-operator-actions; run-state-and-recovery → 20-run/10-run-state. All 14 W4
  opener warnings fixed. Root + spine indexes rewritten as the reading path;
  root Documentation Rules now points at the packages/docs-framework
  doc-standards corpus as the operating standard.
- M2 (codex low): 3 TEMP merge folders deleted; 6 more doc.json link
  retargets; final gate green.
- Final verification (independently re-run): docs audit 0 errors / 0 warnings
  (was 0/14 with 2 mid-migration errors); links 0 stale; spot renders of the
  spine index and 20-architecture read as the agreed narrative.
- Frozen files honored: docs/20-implementation/30-knowledge/doc.json untouched
  by writers (M1 link retargets only, stays uncommitted);
  docs/40-new-features Daytona doc.json files edited for links only, stay
  uncommitted. Nothing was ever staged.
- NOT YET COMMITTED: awaiting Ford's "done" per the completion contract
  (stage only objective files + agreed doc changes, one commit, no push).

## Section 7 — State Composition Vertical Slice (Ford, 2026-08-14, round 6)

Ford: state composition is missing its breakdown. Required order: (1) canonical
project state, (2) workflow slot state — the base object all workflow states
extend, (3) one page per workflow detailing that workflow's state (e.g. PR
state structure and all its pieces). This existed before (the retired
40-new-features/20-project-state-and-events bundle had 20-project-session,
30-run, 40-pr-campaign, 50-sync, 60-knowledge) and was lost in absorption —
recover from history. Each per-workflow page follows the vertical-slice
template: 1. Base class → 2. Structure → 3. What it does → 4. Flows.

Target subtree (40-project-state/10-state-composition/ becomes a section):

```
10-state-composition/
├── doc.json            # index: composition model, reading order
├── 10-project-state    # canonical ProjectState
├── 20-workflow-slot    # base envelope every workflow state extends
├── 30-session-state    # per-workflow pages, template: base class /
├── 40-sync-state       #   structure / what it does / flows
├── 50-run-state
├── 60-pr-state
└── 70-knowledge-state  # history had it; framed per canonical contracts
```

Historical sources extracted to /tmp/docs-history/*.json (raw doc.json from
f60ef61b^). Applied via 6 parallel docs-writer agents (S1 index+10+20,
S2–S6 per-workflow pages). S4 (run-state) needed one retry after a codex-lb
upstream timeout that wrote nothing; retry succeeded.

Status: APPLIED 2026-08-14. All 7 pages + rewritten section index on disk,
docs_check green per writer; corpus gate re-verified: audit 0 errors /
0 warnings, links 0 stale. Renders confirm the vertical-slice template
(Base Class / Structure state-shape / What It Does / Flows) on the per-workflow
pages and the canonical→envelope→per-workflow reading order in the index.

### Round 7 (Ford, 2026-08-14): full JSON state objects missing

Ford: the pages still lack the state structure object we used to show — the
full JSON. Diagnosis: the S-wave writers rendered structure as FENCED
```state-shape``` code blocks, not the real state-shape component (props:
description, fields tree, example = full concrete JSON). History's blocks had
both fields and example; only 20-dispatch-authority (Lane 4) uses the real
block today; two project-events shapes have fields but no example.
Historical shape props extracted to /tmp/docs-history/shapes/*.json (7 shapes:
envelope, activity-controller, session, run, pr-campaign, pr-series, sync).
Fix wave T1–T4 launched: T1 workflow-slot + composed project-state, T2
session + sync, T3 run + pr (both shapes), T4 knowledge (composed) +
the two project-events examples. Writers instructed: real block type only,
report validation errors rather than falling back to fenced code.

T-wave outcome: ALL FOUR refused cleanly without touching the corpus — the
docs-writer TOOLING cannot author rich blocks: docs_write accepts markdown
only (a state-shape fence is silently classified as a code block) and
docs_read renders existing state-shape blocks as lossy placeholders. This is
why the S wave fell back to fenced pseudo-code, and why Slice 6 Lane 4 used
the docs-model API instead. Escalation launched: single codex xhigh task
installing real state-shape blocks in all 9 docs programmatically via
@codecaine/docs-model validateDocDocument/serializeDocDocument (surgical
block replacement, other block ids preserved), with 20-dispatch-authority's
live block as the schema reference. Gate: validation + audit 0/0 + links 0 +
component-rendering check per doc.

Round 7 outcome: APPLIED AND VERIFIED 2026-08-14. All 9 docs carry real
state-shape components with typed field trees + full JSON examples
(independently scanned: project-state 11 fields/2.2KB example, envelope 10/294B,
session 12/636B, sync 13/1.1KB, run 17/1.3KB, pr 14+13 fields/two examples,
knowledge 10/1.5KB, plus the two project-events examples added id-stable).
Zero fenced pseudo-blocks remain. Audit 0/0, links 0 stale. Renders show
component output with annotated field trees and concrete JSON.

---

## Section 1 — docs root + 10-system-design spine

### Current

```
docs/
├── 00-foundation
├── 10-system-design
│   ├── 01-core-idea            # Sudoku metaphor; starts with H2, no opener (W4)
│   ├── 03-state-and-events     # durable state contract + Slice 6 authority subtree
│   ├── 10-intake-and-sessions  # slice: how work enters/leaves
│   ├── 20-running              # slice: scheduler
│   ├── 30-workers              # slice: worker under a claim
│   ├── 40-knowledge            # slice: what workers may consult
│   └── 50-ship-and-pr          # slice: run output → human review
├── 20-implementation
├── 30-runbooks
└── 40-new-features
```

### Findings

1. Top-level root order (00/10/20/30/40) reads correctly; no change proposed.
2. `10-system-design` index "Core Concepts" section is stale: it names
   "Core principles" (bundle is now 01-core-idea; 01-core-principles and
   02-agent-model were deleted), lists none of 03-state-and-events' five
   children (incl. Slice 6's 05-project-state-and-authority), and lists
   "Knowledge model" / "Knowledge graph redesign" — neither exists; 40-knowledge
   actually has 10 children.
3. `01-core-idea` opens with `## Think Like Sudoku` — W4 warning; needs a 2–4
   sentence opener per writingstyle.
4. Numbering: 01/03 vs decade slices is a deliberate contracts-vs-slices signal
   per the index prose ("five gated slices plus two cross-cutting contracts"),
   but with 02-agent-model gone the pattern is thinner.
5. `docs/10-system-design/10-doc-standards/` does not exist in this corpus.
   The docs-framework skill (and external references) point there; the actual
   doc-standards corpus lives only inside the packages/docs-framework submodule
   (`packages/docs-framework/docs/10-system-design/10-doc-standards`). If it
   were adopted here at 10-, it would collide with 10-intake-and-sessions.

### Proposed

- Keep root order as-is.
- Rewrite the 10-system-design index "Core Concepts" map to match the real tree
  (option A: full child map with one-liners; option B: top-level children only).
- Give 01-core-idea a proper opener (clears 1 of 14 warnings).
- Numbering: options in Q1 below.

### Decision (Ford, 2026-08-14)

- Doc-standards: use the standards that exist in the packages/docs-framework
  package. The corpus links the package as the operating doc system; when
  implementing, read the actual standard from the package. Do NOT copy the
  standards corpus into docs/.
- Numbers get cleaned up — no keeping the 01/03 irregular band.
- Bigger reframe: 10-system-design gets a crafted narrative reading order, not
  just index hygiene. The arc: (1) core idea, (2) high-level design — many
  workers talking to the system, the sandbox as a toolkit, a shared knowledge
  base, (3) how we do a project — any game is a project, (4) how a project is
  structured, (5) walking through it bit by bit. Reading top to bottom should
  build the system model. Current tree reads "thrown at the wall"; fix that.

### Proposed Target Spine (draft v1, 2026-08-14 — awaiting Ford)

```
10-system-design/
├── 10-core-idea            # Sudoku framing (from 01-core-idea, + opener)
├── 20-architecture         # NEW: the machine at altitude — many workers ↔ one
│                           # system; sandbox toolkit; shared knowledge base
│                           # (seeded from current index architecture map)
├── 30-projects             # any game is a project: project model, worktree,
│                           # baseline, sessions (seed: project-session-architecture)
├── 40-state-and-events     # how a project is structured (from 03-…)
├── 50-intake-and-sessions  # walkthrough: work enters and leaves
├── 60-running              # walkthrough: scheduler
├── 70-workers              # walkthrough: worker under a claim
├── 80-knowledge            # walkthrough: the shared knowledge base in depth
└── 90-ship-and-pr          # walkthrough: out to upstream review
```

Index rewritten as the reading path (narrative order with one-liners), not the
current stale "Core Concepts" listing.

### Decision (Ford, 2026-08-14, round 2)

- Draft v1 flow approved in principle ("generally a lot better"); wants the
  full folder/nesting structure under it before sign-off.
- Named sub-pieces: Projects; the project stage structure; each workflow phase
  (sync, running, PR); the knowledge side. Each of these can have queue
  workers. Nesting should read like discovering how the system works.

### Proposed Target Spine (draft v2, 2026-08-14 — full nesting, awaiting Ford)

Six sections instead of nine: running, workers, and ship-and-pr fold into a
workflows section; intake splits between projects and the sync phase.

```
10-system-design/
├── 10-core-idea                  # Sudoku framing (from 01-core-idea + opener)
├── 20-architecture               # NEW: many workers ↔ one system; sandbox as the
│                                 #   worker toolkit; one shared knowledge base;
│                                 #   dispatch authority as the connective rule
├── 30-projects                   # any game is a project
│   ├── 10-project-model          # project, canonical worktree, baseline, head lineage
│   ├── 20-sessions               # ProjectSession: single active session, timeline
│   │                             #   (both from 10-intake…/20-project-session-architecture)
│   └── 30-save-points            # from 10-intake…/30-save-points
├── 40-project-state              # the stage structure: what a project is made of
│   ├── 10-state-composition      # from 03/05/10 (envelope + ProjectState slots)
│   ├── 20-dispatch-authority     # from 03/05/20 (the lease, handoffs)
│   ├── 30-operator-actions       # from 03/05/30 + 03/05/40 (21 actions + view) — or keep split
│   ├── 40-durable-records        # from 03/10 (epochs, claims, checkpoints…)
│   ├── 50-project-events         # from 03/40, subtree intact (7 children)
│   └── 60-event-handshake        # from 03/30 (wake signals vs accepted events)
├── 50-workflows                  # the phases; each holds a ProjectState slot, can
│   │                             #   hold the lease, can run queue workers
│   ├── 10-sync                   # from 10-intake…/10-session-operating-flow (re-scoped)
│   ├── 20-run                    # from 20-running + 30-workers
│   │   ├── 10-run-state          # from 20-running/05 (+ merge 03/20-run-state-and-recovery?)
│   │   ├── 20-director-loop      # from 20-running/10
│   │   ├── 30-board-prioritization # from 20-running/20
│   │   ├── 40-workers            # from 30-workers, subtree intact
│   │   │   ├── 10-lifecycle
│   │   │   ├── 20-capabilities
│   │   │   └── 30-write-safety
│   │   └── 50-process-guardians  # from 20-running/30
│   └── 30-pr                     # from 50-ship-and-pr
│       ├── 10-score-gate-and-handoff
│       └── 20-campaign-and-tracking
└── 60-knowledge                  # from 40-knowledge, internal order = Section 4
```

Standing assumptions: 20-architecture describes the target architecture
(sandbox toolkit) with a status callout linking the Daytona feature spec;
implementation docs keep mirroring source structure (only their inbound design
links retarget).

Known merge candidates surfaced by v2: 03/20-run-state-and-recovery vs
20-running/05-run-state (duplicated RunState coverage); 03/05/30 + 03/05/40
(action contract + view are two halves of one operator surface).

### Round 3 (2026-08-14)

Ford asked to see the entire corpus flow before answering. Draft v3 below fills
every level. Open questions Q1–Q4 (round 3) remain, plus Q5–Q6 added.

### Proposed Full Corpus (draft v3, 2026-08-14 — awaiting Ford)

```
docs/
├── 00-foundation                       # unchanged (manifesto/purpose)
├── 10-system-design                    # narrative spine, 6 sections
│   ├── 10-core-idea
│   ├── 20-architecture                 # NEW
│   ├── 30-projects
│   │   ├── 10-project-model
│   │   ├── 20-sessions
│   │   └── 30-save-points
│   ├── 40-project-state
│   │   ├── 10-state-composition
│   │   ├── 20-dispatch-authority
│   │   ├── 30-operator-actions        # merge candidate (contract + view)
│   │   ├── 40-durable-records
│   │   ├── 50-project-events
│   │   │   ├── 10-envelope-and-lineage
│   │   │   ├── 20-registry-and-catalog
│   │   │   ├── 30-dispatch-session-and-replay
│   │   │   ├── 40-sync-and-knowledge-events
│   │   │   ├── 50-read-api-and-reconstruction
│   │   │   ├── 60-kernel-trace-linkage
│   │   │   └── 70-operator-trace-timeline
│   │   └── 60-event-handshake
│   ├── 50-workflows
│   │   ├── 10-sync                     # from session-operating-flow, re-scoped
│   │   ├── 20-run
│   │   │   ├── 10-run-state            # merge candidate (+03/20-run-state-and-recovery)
│   │   │   ├── 20-director-loop
│   │   │   ├── 30-board-prioritization
│   │   │   ├── 40-workers
│   │   │   │   ├── 10-lifecycle
│   │   │   │   ├── 20-capabilities
│   │   │   │   └── 30-write-safety
│   │   │   └── 50-process-guardians
│   │   └── 30-pr
│   │       ├── 10-score-gate-and-handoff
│   │       └── 20-campaign-and-tracking
│   └── 60-knowledge
│       ├── 10-principles               # from 05
│       ├── 20-connection-map           # from 10
│       ├── 30-per-target               # from 20, children unchanged
│       │   ├── 10-code-graph
│       │   ├── 20-search-indexes {10-opseq-analogs, 20-ghidra, 30-siblings, 40-crosswalk}
│       │   └── 30-attempt-ledger {10-tactics}
│       ├── 40-knowledge-stores         # from 30
│       │   ├── 10-knowledge-ledger
│       │   ├── 20-knowledge-intake     # from 15
│       │   ├── 30-smashwiki-corpus     # from 20
│       │   └── 40-standards            # from 30
│       ├── 50-inputs                   # from 40 {10-past-prs, 20-discord, 90-retired}
│       ├── 60-worker-surfaces          # from 50
│       ├── 70-background-jobs          # from 70-execution-classes-and-jobs (renamed)
│       │   ├── 10-source-classification
│       │   ├── 20-job-lifecycle-and-leasing
│       │   └── 30-processing-publication-and-provenance
│       └── 90-record                   # NEW grouping (Q5)
│           ├── 10-implementation-record {10-agent-runs, 20-migration-map}
│           ├── 20-decision-log         # from 85
│           └── 30-open-questions       # from 80
├── 20-implementation                   # mirrors source; light touch only
│   ├── 10-agents
│   │   ├── 10-director-worker
│   │   ├── 20-pr-review
│   │   ├── 30-knowledge-curator        # from 25
│   │   └── 40-runtime                  # from 30
│   ├── 20-server-jobs
│   ├── 30-knowledge                    # FROZEN this audit: parent doc.json is
│   │   │                               #   pre-dirty/uncommitted; renumbering children
│   │   │                               #   would entangle it further (children incl.
│   │   │                               #   21-qa-coverage-audit stay as-is for now)
│   ├── 40-state {10-project-state-and-authority {3}}
│   ├── 50-tools
│   ├── 60-ui {10-operator-runbook, 20-project-state-workspace {4}}
│   └── 99-appendix {20,30,40,50}       # unchanged
├── 30-runbooks                         # unchanged
└── 40-new-features                     # unchanged; Daytona doc.json stays uncommitted
```

Cross-cutting: docs root index "Documentation Rules" gains the link to the
packages/docs-framework doc-standards corpus (the operating doc system).
Implementation docs' inbound links to design paths retarget mechanically.

### Open Questions (rounds 3–4)

- Q1 workers nested under run (a) vs spine-level (b).
- Q2 session-operating-flow → workflows index (a) vs child 05 (b).
- Q3 merges: run-state pair; action-contract + state-view. (a both / b neither / c one)
- Q4 names: workflows|phases, sync|intake, pr|ship-and-pr.
- Q5 knowledge tail: group implementation-record + decision-log + open-questions
  under 90-record (shown) vs keep three top-level entries.
- Q6 implementation/10-agents renumber (25→30, 30→40) OK given 30-knowledge is
  frozen this audit.

### Decision (Ford, 2026-08-14, round 5) — TREE LOCKED

- Q1–Q6 delegated to my judgment → defaults locked: workers nested under run;
  session-operating-flow content becomes the 50-workflows index; BOTH merges
  (run-state pair; action-contract + state-view); names workflows/sync/pr;
  90-record grouping; 10-agents renumber 25→30, 30→40.
- Draft v3 is now the target tree. Apply approved as a batch.
- Apply mechanism per Ford: docs-writer kernel agents, fanned out and
  monitored. Found at /Users/Ford/Github Repos/Codecaine/Core/agent-kernel/
  catalog/docs-writer/ (generic catalog layer of the kernel TUI extension at
  packages/tui/src/extension.ts). Headless invocation proven:
  `PI_CODING_AGENT_DIR=.pi-agent bunx --bun @earendil-works/pi-coding-agent
   -e <extension.ts> --provider codex-lb --model "gpt-5.6-sol:low"
   --no-session -p "/kernel docs-writer" "<task>"`.
  Smoke test 2026-08-14: booted in this repo, docs_tree read OK, no writes.
  Bonus finding: 01-core-idea title is still "Core Principles" — fix in W-A1.
- Execution plan: M1 mechanical moves+link retargets (codex xhigh, plain `mv`,
  NO git index operations — unrelated dirty files must never be staged) →
  docs-writer content waves A/B/C (disjoint scopes, parallel, monitored) →
  M2 cleanup (delete TEMP merge leftovers, final link pass) → verify
  (audit + links + renders) → before/after to Ford. Move map:
  objectives/docs-tree-audit/move_map.md.

### Round 4 (2026-08-14)

- Ford: draft v3 "looks pretty good". Q1–Q6 answers still pending.
- Ford asked to apply via a pi kernel "Docs Writer" agent, fanned out and
  monitored. FINDING: no such agent exists in this repo. Agent catalog =
  running {worker, integration-resolver, conflict-resolver}, pr {reviewer,
  fixer, reconcile, qa-repair, splitter}, knowledge {librarian}. .pi-agent/
  holds only model providers (codex-lb). Closest match is `synthesis-writer`
  in packages/agent-kernel/examples/simple-research-kernel — a demo report
  writer, not wired into this repo and not a docs agent. Awaiting Ford: point
  at the real agent if it lives elsewhere, or apply via parallel scoped codex
  workers (existing plan).

---

## Section 2 — 03-state-and-events

Current children: 05-project-state-and-authority (Slice 6, 4 children),
10-durable-state-records, 20-run-state-and-recovery, 30-event-handshake,
40-project-events (7 children).

Findings/proposal: to be presented. Candidate question: 05 (authority
composition layer) reads before 10 (the base records it composes) — intended?
Overlap check: 20-run-state-and-recovery vs 20-running/05-run-state.

### Decision (Ford)

- PENDING.

---

## Section 3 — 10-intake-and-sessions, 20-running, 30-workers, 50-ship-and-pr

Current children (per slice): intake {10-session-operating-flow,
20-project-session-architecture, 30-save-points}; running {05-run-state,
10-run-director-loop, 20-board-prioritization, 30-process-guardians}; workers
{10-lifecycle, 20-capabilities, 30-write-safety}; ship {10-score-and-pr-handoff,
20-operator-flow-and-pr-tracking}.

Findings/proposal: to be presented. Known follow-up from the project-state
interview: re-point 10-intake-and-sessions at the new canonical subtrees.

### Decision (Ford)

- PENDING.

---

## Section 4 — 40-knowledge

Current children: 05-principles, 10-connection-map, 20-per-target (3 subtrees),
30-knowledge-stores (4), 40-inputs (3), 50-worker-surfaces,
60-implementation-record (2), 70-execution-classes-and-jobs (Slice 6, 3),
80-open-questions, 85-decision-log.

Holds 12 of 14 W4 warnings. Several docs read as imported design-record shape
(H2-first, table-first, callout-first). Parent index leads with
"Design record — recovered v14".

### Decision (Ford)

- PENDING.

---

## Section 5 — 20-implementation

Current children: 10-agents (4), 20-server-jobs, 30-knowledge (4 incl. Slice 6
30-background-processing), 40-state (Slice 6 subtree, 3), 50-tools, 60-ui
(Slice 6 20-project-state-workspace, 4), 99-appendix (4).

Known: 30-knowledge/21-… is a sibling-suffix number; 30-knowledge/doc.json is
uncommitted and MUST STAY uncommitted (entangled with unrelated rework);
10-job-storage-and-migration opens with a state-shape block (W4).

### Decision (Ford)

- PENDING.

---

## Section 6 — 30-runbooks, 40-new-features, wrap-up

Current: runbooks {10-gate-exact-repair-playbook, 20-gate-exact-tail-repair};
new-features {10-daytona-sandbox-execution (7 children, doc.json files must
stay uncommitted)}.

### Decision (Ford)

- PENDING.
