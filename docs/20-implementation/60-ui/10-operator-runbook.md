---
covers: How an operator drives a full session cycle from the dashboard
concepts: [runbook, operator, status-panel, actions-panel, prepare-handoff, reconcile, ship]
code-ref: apps/frontend/src/components/Sidebar.tsx, apps/server/src/server.ts, apps/server/src/infrastructure/http/server.ts
---

# UI: Operator Runbook

The left rail is controls; the right rail is the view. The **Status** panel
answers "where are we", the **Actions** panel answers "what can I do", and
the Logs tab's activity card answers "what is happening right now". This
runbook walks one full session cycle through those three surfaces.

The canonical lifecycle these panels drive — and the pipeline-rail layout the
sidebar is converging on (stages with their own buttons, plus a PR board) —
is specified in
[operator flow and PR tracking](../../10-system-design/65-operator-flow-and-pr-tracking.md).

## Reading the stage rail

The left rail is five numbered lifecycle stage cards (the pipeline rail).
Each card is a vertical slice: a header with the stage's one-line verdict,
its detail rows, its own buttons, and its disclosures. The current stage has
the filled number chip and bright border; disabled buttons carry the
blocking reason in their tooltip and the one recommended next action is
highlighted.

| Stage | Detail rows | Healthy verdict | Owns |
| --- | --- | --- | --- |
| 1 Sync | Branch (dirty marker), Baseline freshness | `up to date with origin/master` | Sync Merged PRs (locked while a run is active) |
| 2 Run | Workers, claims/checkpoints, last Save point | `active · N active claims` while working, `paused · 0 active claims` before handoff | Start Working, Pause Intake, Resume, Stop, Force Stop; Setup + Process disclosures |
| 3 Ship | Checkpoint lanes, Branch QA (informational; `blocked` = rework readmitted at repair priority, never a PR gate), Ship set (THE PR gate), Plan | `pr_ready — N confirmed match(es)` | Prepare Handoff (the whole pipeline incl. auto-reconcile, PR board seed, and the hard `ship` save point — it ends the session); Manual steps (Run QA, Resolve QA Repair, Reconcile, Plan PRs — debug escape hatches; checkpointing is automatic) + Artifacts disclosure |
| 4 PRs | One row per tracked slice PR (status, #, comments, CI), upstream open count | `N open · M to open · K merged` | **Draft PR Board** — a six-column kanban (Planned → Preparing → Prepared → Draft → In Review → Done) reflecting derived per-slice state; in-flight prep and QA-repair-pending slices show in Preparing, review substate (awaiting/new comments/changes requested/fixing) drives the In Review chip + Ack/Fixing controls. Sync PR Status (gh-backed; records persist in `pr_handoff/pr_records.json`); `/api/prs/review-state` for manual review flags |
| 5 New Session | — | `restart baseline · keep local work` | New Session (checkpoints first; unshipped improvements stay local) |

Enablement is unchanged from the old Actions panel: handoff buttons need a
run with stopped workers and zero active claims (server-enforced), Reconcile
additionally needs the run paused, Sync is locked while a run is active.

## One full cycle

1. **Sync Merged PRs** (only when starting from an idle, post-merge state) —
   pulls upstream, runs PR intake agents, rebuilds knowledge.
2. **Start Working** — init run, start workers. Watch progress in the center
   column; the epoch cycle commits and re-reports as batches drain. Worker
   count controls live claims/processes, while compile-heavy validation and
   tool calls queue through their own slot pools, so "active workers" can be
   higher than simultaneous MWCC compiles.
3. **Pause Intake** when you want to ship — drains workers, pauses the run.
4. **Prepare Handoff** — the full ship pipeline and the hard save point that
   ends the session (pause → pull & rebase → PR intake for anything newly
   merged → rebuild production baseline → branch QA vs that baseline →
   checkpoint with regressed symbols forced to needs_rework → readmit rework
   at repair priority → match-only split plan → verify ship set →
   auto-reconcile if blocked → replan against the survivors → seed the PR
   board → `ship` save point). Every step shows live in the activity card.
   Only exact matches that survive the ship-set verification ship;
   everything else stays on the local branch. When the survivor loop drops
   files, the final plan regenerates with `--ship-status`, so match slices
   already exclude them — ship from the plan as written, no manual
   subtraction.
5. The gate is the **Ship set** row, not Branch QA. Branch regressions are
   readmitted as rework automatically; the pipeline only stops if the match
   files themselves regress the baseline (run **Reconcile** or drop the
   offending slice and re-run) or if there is nothing to ship yet (Resume and
   keep working).
6. When Status shows Ship set `pr_ready` and Plan `passed`: open
   `pr_split_plan.md` and ship the **match slices only** — they are the PRs.
   Local-only slices stay on the branch until they become matches. Branch
   creation, pushing, and PR bodies are manual, guided by the
   melee-pr-workflow skill.
7. After upstream merges your PRs: **Sync Merged PRs** to intake them, then
   **New Session** for the next campaign loop against the fresh baseline.

## When something looks wrong

- The activity card keeps the last operation's failed step, error, and a
  "Next" hint until the next operation starts.
- Raw command output (builds, git, agents) streams in the Logs tab below the
  card; agent transcripts live in the Agents tab.
- Handoff/QA policy (targets, grouping, max files per PR, improvement
  promotion floors) lives in `projects/<id>/project.json`, not the UI.
