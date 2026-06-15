---
covers: Score integration gate, global regression protection, and PR handoff boundary
concepts: [score-integration, regression-gate, qa-ship-gate, preship-review, baseline, pr-handoff, pr-split-plan, review, dashboard]
---

# Score Integration And PR Handoff

The worker loop can create evidence and candidate patches, but the run baseline
changes only through the score integration gate. This keeps verified progress
separate from exploratory attempts.

## Sessions And The Local Change Ledger

A run session is one grouping of changes measured against one frozen baseline.
Shipping moves a subset of that grouping upstream; syncing closes the session
and opens the next one against the updated baseline. The local change ledger —
carry-forward patches, facts, lessons, and rejected hypotheses — persists
across sessions: only shipped PR candidates ever leave the system.

Because the orchestrator works alongside other contributors in an open-source
upstream, the sync boundary is a hard lock, not advice. Sync and merged-PR
intake are rejected while a run is active, because pulling upstream would
invalidate the baseline all worker evidence is measured against. Once a sync
starts, the old session is closed; there is no path back to the old baseline.
The visual map of this cycle lives in
[../sidebar-flow-design.html](../sidebar-flow-design.html).

## Integration Gate

A candidate should pass through these checks before it affects the board
baseline:

- The worker still owns the lease and write set for the candidate.
- The worker report's local-regression block passed the runner acceptance gate:
  target regression is false, neighbor regressions are empty, validation
  artifacts exist on disk, and edited paths stay inside the write set.
- The worker post-return repair gate is clean: no unaccepted write-set diff is
  retained, configured runner-owned post-return checks passed, and any
  `repair_request` loop has resolved rather than exhausted.
- Local validation is preserved and unresolved local regressions are not kept.
- The source remains reviewable and understandable.
- The branch-level build/report refresh confirms the score movement.
- The integration record captures the old and new progress signal.

After integration, the board can publish new facts and metrics. Active workers
do not need to be canceled just because the board changed; future target
packets can use the updated evidence.

## End-Of-Run Output

The run should summarize accepted improvements, facts, rejected hypotheses,
stalls, score movement, validation transcripts, and review risks. That summary
is the bridge from autonomous work to human review.

**Only exact matches ship.** Everything else — improvements of any size, fact
requests, stalls — is the local branch's delta over upstream until the work
becomes a match. The checkpoint writes that bridge as durable state with a
three-way classification:

- **Match candidates** (`pr_candidate`): runner-validated exact matches. These
  are the only items that go into PRs; a byte-identical match is
  self-evidently correct and cheap to review, so a PR made only of survived
  matches asks almost nothing of the maintainer.
- **Notable improvements** (`improvement_candidate`): runner-validated
  non-exact improvements that clear both promotion floors — a minimum gain in
  match-percent points and a minimum estimated matched-byte delta (function
  size × gain), from the project's `pr` config (`improvementMinGainPoints`,
  default 2.0; `improvementMinMatchedBytes`, default 64). They do **not**
  ship: the floors exist so the carry-forward ledger names the work closest to
  matching, which makes them the best next targets. The promotion evaluation
  is recorded in each item's evidence.
- **Carry-forward** (everything else): sub-floor improvements, fact requests,
  stalls, and errors stay local evidence and inform the next run.

After the match PRs merge upstream and `sync-merge` intake runs, the rebase
naturally drops the now-upstream match changes from the local branch — what
remains on the branch is exactly the unshipped non-match work, measured
against the new baseline. That is the steady state: local delta = improvements
not yet matched.

The configured run goal is the pause threshold for this summary. Reaching a
`matched_code_percent` checkpoint should mark the run handoff-ready only after
score integration and regression checks confirm the movement. It does not mean
the whole decompilation effort is complete; it means this batch has reached the
point where the system should stop, report what happened, and let the next
allocation decision happen outside the worker loop.

## Handoff Pause

PR preparation begins by preventing new worker edits from entering the checkout.
The handoff pause is a run-level scheduling state, not a deletion or reset: the
current reports, leases, checkpoints, and artifacts remain durable, but
director/worker scheduling refuses to start while the run status is not
`active`.

The dashboard's `Pause Intake` action requests a process drain and marks the run
`paused`. Draining stops the supervisor from introducing more workers while
allowing the operator to recover or finish existing leases intentionally. The
matching `Resume` action marks the same run `active` again if the operator
decides to keep working before or after PR packaging.

## PR Promotion Gate

Score movement and PR readiness are separate decisions. The saved-baseline
regression report classifies the branch with a PR promotion gate after the
regression checks run:

- `pr_ready`: no regressions remain, and the report contains reviewer-worthy
  evidence such as an exact new match or matched code/data byte movement.
- `local_only`: the run is clean enough to keep as local evidence, but the
  report only shows fuzzy movement or otherwise fails to meet the promotion
  policy.
- `blocked`: broken matches, fuzzy regressions, or metric regressions remain.

This gate treats match-percent movement as diagnostic telemetry. Fuzzy
improvements still matter to the local system because they preserve
hypotheses, target history, and future search hints, but they never become
maintainer-facing PRs — only exact matches do. Final handoff should run
`regression-check` with `--require-pr-promotion` so a clean local-only win
fails the PR gate rather than consuming reviewer attention; the dashboard QA
action keeps the default policy (an exact new match or matched-byte movement
is required for `pr_ready`).

When the gate is `blocked`, the reconcile agent (`reconcile --mode
ship-validate`) walks the regression report, fixes regressions inside a bounded
attempt budget, and re-runs validation until the gate is clean or it escalates
to the operator. The same agent's `sync-merge` mode owns the other boundary:
after an upstream pull and merged-PR intake, it replays carry-forward work onto
the new master, resolves conflicts and duplicate matches (upstream wins; local
attempts become lessons), and fixes build errors before the next session's
baseline is captured.

## QA Ship Gate

Score gates cannot catch score-inflating hacks. The 2026-06-11 maintainer
review of PRs #2655–#2659 flagged a batch of them — data-ordering externs,
hand-packed string blobs, open-coded asserts, and one resubmission of a
previously rejected change — all explicitly prohibited by the QA standards,
yet waved through because every gate measured objdiff score and the violation
is what inflates the score. The QA ship gate makes "maintainer-rejected
pattern" a machine-detected, ship-blocking condition in four layers (rationale
and rollout in
[the plan](../30-plans/2026-06-11-qa-ship-gate-and-pr-review-wiring.md)):

- **L1 — worker attempt lint.** A violating attempt is rejected at attempt
  time inside the worker post-return gate, with the findings fed back as
  repair feedback (see [worker lifecycle](40-worker-lifecycle.md)).
- **L2 — regression-check hard gate.** `regression-check` runs the
  deterministic `review_lint` diff scan against the upstream base by default;
  the only bypass is an explicit `--skip-qa-gate`. The summary gains
  `qaGateExitCode`, `qaGateSkipped`, `qaFindings`, `qaCounts`, and
  `qaScanPath`, and the verdict folds the gate in:
  `passed = regressionGatePassed && !promotionBlocked && qaGatePassed`. A
  failure hint lists the violating rules at `file:line`, and each finding
  cites the standard it violates.
- **L3 — pre-ship adversarial review.** `pr-preship-review` runs the
  pr-review agent in adversarial mode over every shipping slice between
  regression-check and PR body drafting; any `reject` finding — or any
  infrastructure failure — exits 1 and blocks the handoff (see
  [PR-review agent](../20-implementation/agents/20-pr-review.md)).
- **L4 — feedback loop.** Every new maintainer rejection is ingested into the
  `banned_patterns` source as regex rules, review exhibits, and resubmission
  tombstones, so a rejected change is mechanically blocked from ever being
  resubmitted (see [knowledge model](50-knowledge-model.md)).

The failure asymmetry between L1 and L2 is deliberate. L2 fails **closed**: a
scanner that cannot run blocks the handoff, because the patterns it detects
are exactly the ones that inflate the score metric every other gate trusts.
L1 fails **open** on scanner infrastructure errors, so an environment hiccup
does not mass-reject worker attempts; the blind spot is recorded in the
attempt artifacts.

Disposition is consistent with the promotion policy: symbols blocked by the
gate become `needs_rework` and requeue at repair priority; a slice ships
without them or not at all. MATCHES-only shipping is unchanged — the gate
narrows what a match is allowed to contain.

The QA repair lane extends this disposition before split planning: a
candidate-file sweep converts deterministic QA findings into a repair queue,
a resolver-style agent attempts minimal source fixes, and each file is routed
as clean with preserved proof, clean with lower score, or `needs_rework`.
Its ship-filter artifact feeds split planning so queued, blocked, false
positive, or clean-lower-score files are not silently included in match PRs.
The flow and implementation details live in
[the QA repair lane plan](../30-plans/2026-06-13-qa-repair-lane.md).

## PR Boundary

The orchestrator does not create one PR per file, worker, symbol, or lease, and
it does not publish GitHub PRs automatically. Human-facing PR packaging is a
separate step after the run produces a coherent improvement bundle.

For review-sized handoff, the packaging step can ask the orchestrator for a
directory-scoped split plan. `pr-split-plan` inspects the branch/worktree
against the selected base ref, groups changed files by Melee subsystem
directories such as `melee/it`, `melee/gm`, and `melee/cm`, and emits suggested
slice branches, titles, pathspecs, and patch commands. Shared or support
directories become separate slices so cross-cutting changes can be reviewed or
stacked intentionally.

When given the latest checkpoint (`--checkpoint checkpoint.json`; the
dashboard passes it automatically), the planner splits slices into two lanes:

- **Match PRs** (`lane: match`) carry exact-match candidates plus any
  supporting files (headers, declarations) the matches need to build. These
  are the only slices that become PRs.
- **Local-only slices** (`lane: local`, `local-<subsystem>` ids) carry
  everything else: fuzzy improvements and unassigned support files. They do
  not ship — they stay on the local branch until the work becomes an exact
  match, and the plan lists them so the operator can see exactly what the
  branch keeps.

A file with both matched and improved functions rides the match lane and the
slice warns about it so the PR body can call it out. `--max-files-per-pr` is a
hard ceiling, not a packing target: the operator (or agent) shaping the final
PRs should aim for the fewest comfortable PRs, not the fullest ones.

Subsystem grouping is a starting proposal, not the PR boundary. Match-lane
subsystem slices smaller than `--min-files-per-pr` (default 4) pack together
into combined slices (e.g. `IF + MN + TY`), first-fit decreasing under the
max ceiling, so a one-file subsystem never becomes its own PR. Shared and
support slices never merge — their risk class is the reason they are
separate. Set `--min-files-per-pr 1` to disable merging.

Directory grouping is a proposal, not proof of independence. Each slice carries
an unverified disposition: `independent`, `shared-prep`, `stacked`, or
`needs-merge`. A slice becomes truly independent only after it is applied to a
fresh worktree based on the current base ref and passes the configured
configure/build/regression check by itself. If a subsystem slice only passes
after a shared slice is present, the PRs should be stacked or merged rather than
presented as independent.

The PR-review agent can help analyze review patterns and PR knowledge, but
final branch creation, presentation, reviewer coordination, and merge readiness
stay operator-owned outside the worker lease loop. Once opened, PRs become
tracked state — slice, branch, number, draft/open/merged status, comments,
CI — per [operator flow and PR tracking](65-operator-flow-and-pr-tracking.md).

## Prepare Handoff Pipeline

`Prepare Handoff` is the full ship pipeline. Every stage is a named step in
the dashboard's operation tracker, so the activity card and the Logs tab show
which stage is running, its detail, and where a failure happened:

```
1. pause intake                 drain workers; run status -> paused
2. pull upstream & rebase       git fetch; ff-pull master or rebase the
                                working branch onto the base ref; newly
                                merged PR numbers are discovered here
3. PR intake agents             when new merged PRs were pulled, fetch their
   + knowledge graph rebuild    dumps, run postmortem agents, and rebuild the
                                knowledge graph (same path as Sync Merged
                                PRs); skipped when nothing new landed
4. rebuild production baseline  detached worktree at the base SHA runs
                                configure + `ninja baseline` (cached per SHA
                                under /tmp/melee-baseline-<sha>, shared with
                                the melee-pr-workflow skill); baseline.json
                                is copied into the checkout. This is the
                                "upstream as merged, without local work"
                                reference everything is compared against.
5. QA build & regression gate   `ninja changes_all` on the rebased branch,
                                regression + promotion gates vs the new
                                baseline. Informational: branch regressions
                                are rework to requeue, not PR blockers,
                                because the branch carries local-only work
                                that never ships
6. checkpoint                   classify worker reports: matches ship,
                                notable improvements and the rest carry
                                forward; any symbol that broke an exact match
                                or regressed against the new baseline is
                                forced to `needs_rework`. The checkpoint
                                lands even when the QA gate fails, so the
                                rework ledger survives.
7. requeue rework               regressed symbols go back into the queue at
                                repair priority (same machinery as the epoch
                                cycle), so the next working session fixes
                                them first instead of leaving them parked
8. QA repair lane               candidate files from the checkpoint are
                                scanned with the deterministic QA rules,
                                error findings become per-file repair queue
                                items, and the bounded qa-repair lane writes
                                queue/report/ship-filter artifacts. Only
                                clean survivors continue to split planning.
9. plan PR slices               match slices ship, local-only slices stay;
                                lanes merge the checkpoint items with the
                                regression report (every new exact match in
                                report_changes.json joins the match lane via
                                its unit source path), so matches from
                                earlier sessions ship even without a worker
                                report in this run
10. verify ship set             THE PR GATE. The match-lane diff (worktree vs
                                the base SHA, so uncommitted work counts) is
                                applied onto the cached baseline worktree,
                                rebuilt incrementally, and regression-checked
                                there, then linted with upstream CI's
                                check-issues container (clang semantic issues
                                like -Wself-assign permuter slop or
                                conflicting prototypes that the MWCC match
                                build never reports). Files with lint issues
                                drop to rework through the same survivor loop
                                as regressions. pr_ready means: exactly what
                                the PRs will contain produces new matches,
                                zero regressions against the production
                                baseline, and zero CI lint issues, regardless
                                of how messy the local branch is. The
                                worktree is reset afterwards so the per-SHA
                                cache stays valid.
11. reconcile & re-verify       only when the ship set is blocked: the
                                reconcile agent (`reconcile --mode
                                ship-validate`) gets one fix loop, then the
                                ship set re-verifies. Prepare fails only if
                                regressions persist after that.
12. replan PR slices            when the survivor loop dropped files, the
                                split plan regenerates against the verified
                                verdict (`pr-split-plan --ship-status`):
                                match slices keep only files that survived
                                ship-set verification, and dropped files ride
                                the local lane with their drop reasons. The
                                plan the operator ships from never needs
                                manual subtraction.
13. sync PR records             the PR board seeds from the final plan
                                (state/pr_handoff/pr_records.json), so
                                stage 4 lists exactly what to open.
14. save point                  a hard `ship` save point anchors the
                                session: prepare *is* the end of the run.
                                The next session starts from here; PR
                                comment fixes can ride the next run.
```

Prepare fails only when the ship set itself is dirty (the match files cause
regressions — fix with Reconcile or drop the offending slice) or when there is
nothing to ship. A blocked branch QA by itself does not stop the pipeline:
those regressions are recorded as needs_rework and requeued at repair
priority. Rebase conflicts fail step 2 with git's message; resolve them in
the checkout (or via `reconcile --mode sync-merge`) and re-run.

The dashboard also exposes each stage as an individual control (`Pause
Intake`, `Checkpoint`, `Run QA`, `Reconcile`, `Plan PRs`) for stepwise
operation. None of these publish GitHub PRs: they prepare artifacts that make
a maintainer-facing PR series easy to open while preserving unfinished local
evidence for future sessions.

## Related

- [CLI overview](../20-implementation/cli/00-overview.md)
- [State implementation](../20-implementation/state/00-overview.md)
- [UI implementation](../20-implementation/ui/00-overview.md)
