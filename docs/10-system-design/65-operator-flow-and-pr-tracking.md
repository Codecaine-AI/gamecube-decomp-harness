---
covers: The operator lifecycle as one flow, the pipeline-rail sidebar design, and PR tracking as first-class state
concepts: [operator-flow, pipeline-rail, pr-tracking, pr-board, session-lifecycle, epoch-qa]
code-ref: apps/dashboard/src/components/Sidebar.tsx, apps/dashboard-server/src/server.ts
---

# Operator Flow And PR Tracking

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
2. **Queue runs** — workers lease targets with whatever pool/thinking
   configuration was chosen.
3. **Epoch boundary** — when the admitted scheduler epoch completes, the epoch
   cycle commits, rebuilds the report, and the confirmed set updates.
   Confirmation happens *here*, continuously, not only at the end.
4. **Salvage, don't discard** — tentative items that didn't survive are
   wiped from the board; regressions and QA failures become improvements or
   needs_rework and are requeued at repair priority. Nothing verified is
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
7. **Plan PRs** — the split plan becomes a visible PR list: which PRs exist,
   what files each carries, which are ready to open.
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
│ 2 RUN              paused · 0 ls  │
│   queue 0 · workers stopped       │
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
  `changes_requested` → `merged` / `closed`. Planned slices come from the
  latest ship-filtered split plan; everything after comes from `gh`.
- **GitHub state**: PR number/URL, ours vs upstream-author, review decision,
  unresolved comment count, CI verdict, base/head SHAs.
- **Persistence**: records live in orchestrator state (not just the plan
  artifact) so a PR opened in one session is still tracked in the next, and
  `Sync Merged PRs` can mark records merged and trigger intake.

Each board row expands to its branch, GitHub link, and file manifest. A
`planned` row carries the **Open draft PR** button (`/api/prs/open`): the
slice is re-verified alone against the cached baseline worktree (apply →
incremental build → regression report → upstream `check-issues` lint →
reset), then a branch is cut from the base SHA, the slice's subset of
`ship_set.patch` is committed, pushed to the `fork` remote, and opened as a
**draft** on upstream with a generated body (summary, file list,
verification). Draft means nothing pings maintainers until the operator
reviews the body and un-drafts. A slice that regresses in isolation fails
with a stacking hint instead of publishing; a slice that fails the lint
(the same `ghcr.io/doldecomp/melee/check-issues` container CI runs, so
things like `-Wself-assign` permuter slop or conflicting prototypes) fails
before pushing instead of failing on the PR. Ship-set verification runs the
same lint each survivor round and drops offending files to rework. If
docker is unavailable the lint is skipped with a warning and CI remains the
backstop.
**Open All Drafts** (`/api/prs/open-all`) runs the same pipeline for every
planned slice sequentially — support/shared slices first, since subsystem
slices may only build on top of them — and a failed slice is recorded and
skipped rather than stranding the rest. Upstream PRs by other authors appear
as a count, because they gate when a sync is worthwhile.

## Related

- [Score and PR handoff](60-score-and-pr-handoff.md) — the prepare pipeline
  this flow drives (steps, gates, replan-after-survivors).
- [UI operator runbook](../20-implementation/ui/10-operator-runbook.md) —
  today's panel-by-panel controls until the rail lands.
- [Save points](70-save-points.md) — the epoch anchors stage 2 commits to.
