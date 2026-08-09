---
concepts: [campaign, save-points, session-branch, baseline, staleness, ledger]
---

# Campaign And Save Points

Canonical campaign, save-point structure, and the where-we-are contract.

The orchestrator's durable position is one canonical campaign per project, not
a pile of disconnected runs. Runs remain internal work segments; the campaign
owns the timeline. A save point is the unit of that timeline: a commit in the
checkout's history plus the evidence needed to know where the effort stood at
that commit.

## Why

Reports used to be anchored to whichever run was newest, so opening the
dashboard after a fresh run showed 0% until a rebuild. Save points anchor every
report to a specific commit, so opening the dashboard always answers "where are
we, and what hasn't been merged upstream yet" from durable state.

## Canonical Save-Point Structure

A save point records:

| Field | Meaning |
| --- | --- |
| `commit_sha` / `branch` | The exact checkout position. If the worktree was dirty, the save-point commit captures it first. |
| `base_ref` / `base_sha` | The upstream anchor (default `origin/master`) the position is measured against. |
| `trigger_kind` | What boundary produced it: `manual`, `init`, `pause`, `checkpoint`, `qa`, `ship`, `sync`, or `fresh`. |
| `matched_code_percent` | The headline progress measure at this commit. |
| `report_path` / `report_changes_path` | Copies of `report.json` / `report_changes.json` under `state_dir/save_points/<timestamp>/`. |
| `board_snapshot_path` | Measures + position summary written beside the reports. |
| `worktree_dirty` / `committed` | Whether uncommitted work remained, and whether this save point created a commit. |
| `payload` | Ahead-of-base count, dirty paths, commit warnings, and full measures. |

Save-point commits never stage the nested `decomp-orchestrator/` repository or
the state directory. The commit message is `savepoint(<trigger>): <label>`.

## Save Points And The Cycle

Save points are created automatically at every phase boundary — init, pause,
checkpoint, QA, sync, and fresh run — and manually through server jobs
(`save-point`) or the dashboard's `Save Point` action. The boundary hooks are
best-effort: a failed save point logs a warning but never blocks the boundary
action itself.

## Where-We-Are Contract

On open, the dashboard answers from the last save point instantly — no build is
triggered. The `campaign` block of the dashboard payload carries:

- The latest save point (commit, trigger, matched percent, artifacts).
- The current head (sha, branch, dirty paths, filtered the same way commits
  are).
- `aheadOfBase`: how many commits have not been merged into the base ref — the
  durable answer to "what hasn't shipped yet".
- `stale`: true when the head moved past the save point or uncommitted changes
  exist. The UI shows a staleness banner with refresh/save actions instead of
  silently showing old numbers.

## Relationship To Runs And The Ledger

Runs, target claims, worker states, checkpoints, and report artifacts continue
to key off the active run internally; each save point records the run that was
active when it was taken. The local change ledger (carry-forward patches, facts,
lessons) flows across save points the same way it flows across sessions: only
shipped PR candidates leave the system. Reverting to a save point is git-native
— the commit, its reports, and the board state in the same state directory
travel together.

## Related

- [Score integration and PR handoff](60-score-and-pr-handoff.md)
- [State implementation](../20-implementation/40-state/00-overview.md)
- [UI implementation](../20-implementation/60-ui/00-overview.md)
