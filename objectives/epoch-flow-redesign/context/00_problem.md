# Problem

Ford stopped the 2026-08-26 32-wide run and froze further running until the epoch
flow is redesigned. The trigger was the workspace score view after a mid-cycle
restage (screenshot, 09:16 local): the chart drew a flat 91.08 → 91.08 line with
no history, Confirmed and Tentative both showed (0) with placeholder text
("saved report was generated before the current run" / "No completed worker
matches waiting for the next baseline"), while Current Epoch showed 39 active
claims. Roughly 20 confirmed matches and improvements from the previous run were
invisible — they exist only as worker-integration commits on the cycle branch,
not upstream, and nothing in the UI distinguishes those states.

The underlying complaints, in Ford's terms:

1. **The score display blends states that mean different things.** What he wants
   to see is the baseline (whatever the remote / cycle start actually is), then
   each epoch as a step on top of it, with confirmed matches/improvements that
   are in our branch shown explicitly against what is in the remote. Tentative
   (current epoch, not yet through a full report) is a third, separate thing.
2. **Local wins never reconcile against upstream during the cycle.** Upstream
   intake happens only through the heavyweight operator sync. Between syncs the
   cycle branch drifts; nothing checks per epoch whether upstream already
   matched a function we are about to spend workers on, and nothing keeps the
   branch continuously rebased/merge-ready. Merged-upstream work must be treated
   as ground truth, overridden only by measurable improvement.
3. **No draft PR.** Ford expects a draft PR to be opened as part of the epoch
   process, carrying the confirmed wins, so the branch is always one click from
   review and its contents are visible outside the harness.

## Canonical flow (Ford, 2026-08-26, verbatim intent)

This is the flow the system — and the system-design docs — must describe:

> You start a run or a cycle, and it syncs everything down. It computes the
> baseline: here is the cycle-start baseline.
> 1. Run the epoch.
> 2. Everything found while running goes into **tentative**.
> 3. Once the epoch is finished, do the re-baselining. Everything that is
>    confirmed goes in there.
> 4. Sync again to see if there are new PRs that need to be ingested — rebase
>    whatever work is there. Not a full rebase: just make it able to be merged
>    into the sync.
> 5. On the graph you see **baseline**, **epoch finish**, and **PR sync**. If
>    the sync changed anything: recompute, do the full knowledge-graph rebuild,
>    and requeue anything that is no longer matched.
> 6. Run it again.
> 7. Once we have a stable state, push it up to the draft-PR branch.

Each pass through the computations, the Confirmed pane (and Improvements) shows
the state of our worktree compared to what is in the actual melee branch.

Additional evidence from the same session that the current layering is fragile:

- Restaging a run resets the visible history because Confirmed/Tentative panes
  are keyed to the current run's report lineage, not the cycle's.
- The run board is computed from the last built `report.json`; after per-accept
  integration commits it goes stale, so a restaged run re-admits functions the
  cycle already matched (caught manually via `report-run` this session).
- The per-accept commits (apply-on-accept) are safe and survive restages — the
  gap is purely in reconciliation, scoring, and visibility layers above them.
