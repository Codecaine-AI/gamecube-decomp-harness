---
concepts: [operator-flow, pipeline-rail, pr-tracking, pr-board, pr-kanban, session-lifecycle, epoch-qa]
---

# Operator Flow And PR Tracking

The operator lifecycle as one flow, the pipeline-rail sidebar design, and PR tracking as first-class state.

Sources: [apps/frontend/src/pages/workspace/_components/WorkspaceSidebar.tsx](/apps/frontend/src/pages/workspace/_components/WorkspaceSidebar.tsx), [apps/server/src/server.ts](/apps/server/src/server.ts).

The dashboard's left rail should read as the lifecycle itself: every control
belongs to a numbered stage, the current stage is obvious, and PRs are
first-class tracked objects rather than a markdown artifact the operator goes
hunting for. This doc records the canonical flow and the agreed UI direction
(pipeline rail, 2026-06-11); the PR tracker is design-direction until built.

## The Canonical Lifecycle

One session, start to finish:

1. **Start a run** — sync everything down (pull upstream, intake merged PRs,
   rebuild knowledge), rebuild the report so the baseline and progress
   numbers are current.
2. **Run workers** — workers claim admitted epoch targets with whatever
   pool/thinking configuration was chosen.
3. **Epoch boundary** — when the admitted scheduler epoch completes, the epoch
   cycle commits, rebuilds the report, and the confirmed set updates.
   Confirmation happens *here*, continuously, not only at the end.
4. **Salvage, don't discard** — tentative items that didn't survive are
   wiped from the board; regressions and QA failures become improvements or
   needs_rework and are readmitted at repair priority. Nothing verified is
   thrown away; it is re-aimed.
5. **Accumulate** — the loop continues, building confirmed and tentative
   items until the operator decides there is enough to ship.
6. **Prepare handoff** — stop intake (drain or force stop) and run the ship
   pipeline. This is the **hard save point that ends the session**: it does
   everything itself — checkpoint (there is no manual checkpoint button;
   checkpoints happen at epoch drains and here), QA, plan, ship-set
   verification, one automatic reconcile fix loop if the ship set is
   blocked, the post-survivor replan, seeding the PR board, and a `ship`
   save point. Because the epoch cycle already validated continuously, the
   end-of-run QA is a *confirmation* pass, not the place correctness is
   established: everything it sees as confirmed is already known to work.
   (Direction: keep moving robustness into the epoch/checkpoint loop so
   prepare stays cheap.)
7. **Plan PRs** — the deterministic or splitter-shaped plan becomes a visible
   PR list: which PRs exist, what files each carries, dependency order, and
   which are ready to open.
8. **Open and track PRs** — branches pushed, PRs opened, and from then on
   the system tracks each PR's status (draft / open / changes requested /
   merged / closed), whether it is ours, comment and CI state, and its file
   manifest.
9. **New session** — restart the baseline. Unshipped improvements stay on
   the local branch (only confirmed matches ever ship); the next session
   measures against the new baseline with that carry-forward intact.

## Pipeline Rail (chosen sidebar layout)

```
┌ DECOMP ORCHESTRATOR ──────────────┐
│ matched 72.642%  ·  run +0.505    │
├───────────────────────────────────┤
│ 1 SYNC               up to date ✓ │
│   baseline 0b15e713 · current     │
│   branch codex/split-up/mn ·dirty │
│   [ Sync Merged PRs ]             │
├───────────────────────────────────┤
│ 2 RUN          paused · 0 claims  │
│   admitted 0 · workers stopped    │
│   31 confirmed · 0 tentative      │
│   [► Start]  [‖ Pause]  [Resume]  │
│   ▸ run setup (size, thinking)    │
├───────────────────────────────────┤
│ 3 SHIP               pr_ready ✓   │
│   27 matches · 0 regressions      │
│   QA: blocked (rework only, ok)   │
│   [★ Prepare Handoff ]            │
│   ▸ steps: checkpoint · QA · plan │
├───────────────────────────────────┤
│ 4 PRS              7 to open      │
│ ┌───────────────────────────────┐ │
│ │ sysdolphin 4f  ● not opened   │ │
│ │ ft         4f  ● not opened   │ │
│ │ gr         5f  ◐ draft #2661  │ │
│ │ mn         3f  ✓ merged #2655 │ │
│ └───────────────────────────────┘ │
│   click a PR → files + status in  │
│   the details rail                │
├───────────────────────────────────┤
│ 5 NEW SESSION   [ Restart base ]  │
│   keeps unshipped improvements    │
└───────────────────────────────────┘
```

Rules the rail must keep:

- Every stage is always visible with a one-line verdict; nothing important
  hides behind the current phase.
- Each stage owns its buttons. A button never appears outside its stage, and
  the single recommended next action is highlighted (same recommendation
  logic the Actions panel uses today).
- Stage detail rows reuse the grouped Status semantics (Run / Sync / PR
  readiness) that already exist; the rail is a reorganization, not a new
  data source — except stage 4.
- Secondary controls (run sizing, stepwise handoff buttons, process panel)
  collapse into per-stage disclosures.

## PR Tracking Model (stage 4)

A PR record marries a split-plan slice to a GitHub PR and outlives both:

- **Identity**: slice id (`ft`, `gm`, …), branch name, title, file manifest
  (pathspecs from the surviving match lane).
- **Lifecycle status**: `planned` → `branch_pushed` → `draft` → `open` →
  `changes_requested` → `merged` / `closed`. Planned slices can come from the
  latest ship-filtered split plan or from discovered local split-series
  branches; published/review state comes from `gh`.
- **GitHub state**: PR number/URL, ours vs upstream-author, review decision,
  unresolved comment count, CI verdict, base/head SHAs.
- **Local workspace state**: owning session/run id, base SHA, local branch,
  persistent worktree path, local commit SHA, validation verdict, batch state,
  and any local repair/blocker error. `local.status` adds an in-flight
  `preparing` value (set at the start of local preparation and cleared to
  `ready`/`blocked` on completion) plus `local.prepStartedAt` so the board can
  show the slice currently being verified. Stale `preparing` stamps
  self-heal: every dashboard poll rewrites them back to `not_prepared` unless
  a prepare-local operation is actually running.
- **QA-repair derivation** (view-only): the board view layers a
  `validation.status: "repairing"` + `validation.repairNote` onto planned,
  not-yet-verified slices whose files overlap the latest QA-repair pending
  set (`qa_repairs/`, `qa-repair-campaign/qa_repairs/`, or
  `qa-repair-lane/qa_repairs/`). It never overrides a locally-verified
  validation and is never persisted — persisted validation comes only from
  local slice verification.
- **Review substate**: `review.subState` (`awaiting` | `new_comments` |
  `changes_requested` | `fixing`) plus `review.lastSeenComments`. Derived on
  GitHub hydrate from `reviewDecision` and the comment-count delta since the
  last operator ack; settable manually via `/api/prs/review-state` (Ack /
  Fixing). A manual `fixing` persists across syncs until superseded by fresh
  reviewer activity.
- **Persistence**: records live in orchestrator state (not just the plan
  artifact) so a PR opened in one session is still tracked in the next, and
  `Sync Merged PRs` can mark records merged and trigger intake.

Each board row expands to its branch, GitHub link, and file manifest. A sync
pass joins three inputs into the same session board: current split-plan
match slices when present, existing GitHub PRs whose heads match the session's
split branch series, and local split-series branches/worktrees that have not
been published yet. Imported GitHub rows keep the reviewer-facing PR file list,
while local-only rows use the local branch diff as the manifest.

A `planned` row first carries local preparation controls: **Prepare Local**
(`/api/prs/prepare-local`) and **Prepare Next 3**
(`/api/prs/prepare-local-batch`). Preparation re-verifies the slice alone
against the cached baseline worktree (apply → incremental build → regression
report → upstream `check-issues` lint → reset), then cuts a persistent local
worktree branch from the base SHA, applies that slice's subset of
`ship_set.patch`, commits it locally, and records the worktree/commit on the PR
object. Nothing is pushed or opened during local preparation.

When a small set is local-ready, **Open Ready 3** (`/api/prs/open-batch`) opens
only the next bounded batch as GitHub drafts. Local-ready publication uses the
persistent worktree's committed diff, re-verifies that exact diff against the
cached production baseline, and pushes the local worktree branch. Operator
repair commits made in the local worktree are therefore the state that ships.
The legacy **Open All Drafts** (`/api/prs/open-all`) remains available as an
escape hatch, but the intended reviewer-friendly flow is private local
preparation followed by explicit small publication batches. Draft means nothing
pings maintainers until the operator reviews the body and un-drafts. A slice
that regresses in isolation fails with a stacking hint instead of publishing; a
slice that fails the lint (the same `ghcr.io/doldecomp/melee/check-issues`
container CI runs, so things like `-Wself-assign` permuter slop or conflicting
prototypes) fails before pushing instead of failing on the PR. Ship-set
verification runs the same lint each survivor round and drops offending files to
rework. If docker is unavailable the lint is skipped with a warning and CI
remains the backstop. Upstream PRs by other authors appear as a count, because
they gate when a sync is worthwhile.

## PR Board (kanban stage model)

The PR Mode page renders tracked slices as a six-column, read-only kanban that
reads as the slice lifecycle. No drag-and-drop — columns reflect derived state,
not operator positioning. Each card carries a status lamp, a sub-status chip,
QA/CI verdicts, a single contextual action for its stage, and a collapsible
file manifest.

```
PLANNED  →  PREPARING  →  PREPARED  →  DRAFT  →  IN REVIEW  →  DONE
 ○            ◐             ○          ●/◑        ◑/○         ✓/✕
```

| Column | What it holds | Card action | Lamp |
| --- | --- | --- | --- |
| Planned | `planned`/`planned_mock`, not yet verified | Prepare (→ Preparing) | idle |
| Preparing | `local.status "preparing"` or `validation "repairing"`; blocked slices stay here red-tinted | — (in flight) | flight (pulsing) |
| Prepared | `local.ready`/`local_only` (QA-clean, draft-ready); `dirty` shown with a chip | Open Draft (→ Draft) | ready |
| Draft | `draft`/`branch_pushed`/has PR number — our manual review | View PR | neutral / attention |
| In Review | `open`/`changes_requested` — upstream review; sub-status chip names the phase | View PR + Ack/Fixing | neutral / attention |
| Done | `merged`/`closed` | — | ready (merged) / idle (closed) |

The sub-status chip disambiguates phases within a column:

- **Preparing**: `verifying` (in-flight local prep) · `QA repair` (files
  pending QA repair, from the view-only derivation) · `blocked`.
- **Prepared**: `ready` · `local branch` (discovered, not pipeline-prepared) ·
  `uncommitted changes` (dirty worktree — Open Draft is disabled until committed).
- **In Review**: `awaiting` · `new comments` · `changes requested` · `fixing`
  (the last two drive the attention lamp). `new comments`/`changes requested`
  surface an **Ack** control; **Fixing** toggles the manual flag.

### Stage derivation (`prStage`)

Stages are derived with this precedence (first match wins):

1. `merged`/`closed` → **Done**
2. `open`/`changes_requested` → **In Review**
3. `draft`/`branch_pushed`/has a PR number → **Draft**
4. `local "preparing"` or `validation "repairing"` → **Preparing**
5. `local ready`/`local_only`/`dirty` → **Prepared**
6. otherwise → **Planned**

Review substate is derived in `deriveReviewSubState` during GitHub hydrate and
refreshed only on a PR sync (GitHub is not polled on the dashboard cadence, to
stay off rate limits). `changes_requested` (from `reviewDecision`) and a
comment-count increase since `review.lastSeenComments` are detected
automatically; `fixing` and ack are operator-set via `/api/prs/review-state`.

### Endpoints

- `/api/prs/sync` — seed from the split plan, keep tracked PRs, hydrate status
  + review substate from GitHub.
- `/api/prs/prepare-local` / `/api/prs/prepare-local-batch` — verify a slice
  alone and cut a persistent local worktree; stamps `preparing` for the
  in-flight window.
- `/api/prs/open` / `/api/prs/open-batch` / `/api/prs/open-all` — publish a
  draft (re-verifies in isolation, pushes, opens as draft).
- `/api/prs/review-state` — set `review.subState` and ack the comment count
  (`{ prBranch, subState, seenComments? }`).

The dashboard's `prs` payload is assembled by `buildPrRecordsView`: normalize →
recover stale in-flight prep → layer the QA-repair derivation. The enrichment is
a view concern; only local verification and the review substate are persisted.

## Related

- [Score and PR handoff](60-score-and-pr-handoff.md) — the prepare pipeline
  this flow drives (steps, gates, replan-after-survivors).
- [UI operator runbook](../20-implementation/60-ui/10-operator-runbook.md) —
  today's panel-by-panel controls until the rail lands.
- [Save points](70-save-points.md) — the epoch anchors stage 2 commits to.
