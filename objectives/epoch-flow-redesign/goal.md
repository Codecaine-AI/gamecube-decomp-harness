<goal>
- Make the epoch lifecycle follow Ford's canonical loop: cycle sync + baseline, then per epoch — run (wins accrue as tentative), re-baseline at epoch finish (tentative -> confirmed), PR-sync against upstream with mergeability (not full rebase), recompute + KG rebuild + requeue on change, run again, and push stable states to the draft PR branch.
- Score/UI contract: baseline / epoch-confirmed / tentative as separate tiers; Confirmed + Improvements always mean "state of our worktree vs the actual melee branch"; the graph steps through baseline, epoch-finish, and PR-sync markers.
- Owned surface: run-loop epoch boundary, boundary sync lane, KG rebuild + requeue hook, dashboard read-model score projection, frontend score/epoch panes, draft-PR push, and the system-design docs chapter for this flow.
</goal>

<context_refresh>
- Reread objectives/epoch-flow-redesign/goal.md.
- Reread objectives/epoch-flow-redesign/current_state.md.
- Reread objectives/epoch-flow-redesign/context/00_problem.md through 04_validation_and_handoff.md (canonical flow lives in 00_problem.md).
</context_refresh>

<working_strategy>
- Canonical loop (Ford, 2026-08-26): (0) cycle start syncs everything down and computes the cycle-start baseline; (1) run the epoch; (2) in-flight wins are tentative; (3) at epoch finish, re-baseline — confirmed absorbs validated tentative; (4) sync again: ingest newly merged upstream PRs, and make our branch mergeable into that sync — no full rebase required, mergeability is the bar; (5) if the sync changed anything: recompute the report, rebuild the knowledge graph, requeue every target no longer matched; (6) run the next epoch; (7) at each stable point, push to the draft PR branch.
- Upstream is ground truth: merged work is authoritative, overridden only by strict measured improvement (zero-epsilon rule from sync conflict handling).
- Tiers come from their own sources — baseline from the upstream anchor + save point, confirmed from boundary reports, tentative from open-epoch checkpoints — never from a staged run's board snapshot, so restages cannot blank the display.
- Boundary sync runs under the run's dispatch lease inside the drained boundary; it must never take or queue a second dispatch (that stalls run dispatch by design).
- Design first, phase-gated; all implementation through codex exec per repo convention.
</working_strategy>

<success_metrics>
- Graph shows baseline, epoch-finish, and PR-sync markers stepping per epoch, surviving run restages.
- Confirmed/Improvements panes list symbols with their vs-upstream state; the "saved report was generated before the current run" dead-end is gone.
- After each boundary sync the branch is verifiably mergeable into latest upstream; newly merged upstream PRs are ingested and already-matched targets are never re-run unless we can improve them.
- KG rebuild + requeue fires exactly when the sync changed inputs; draft PR branch updates at each stable point.
</success_metrics>

<non_goals>
- Do not automate publication/confirm gates of the operator sync; shipping stays with the PR phase.
- Do not change worker validation, claim mechanics, or the job queue beyond the boundary sequence.
- Do not auto-mark the draft PR ready or merge it.
</non_goals>

<completion_criteria>
- Boundary loop implemented behind a config flag and exercised for two-plus epochs on a real cycle with upstream drift, hitting every step including a KG rebuild + requeue.
- Three-tier scores and the three graph markers live in read-model + frontend.
- Draft PR branch pushed and refreshed at stable points, verified on the real remote.
- Flow documented in the system-design docs; current_state.md holds validation evidence.
</completion_criteria>
