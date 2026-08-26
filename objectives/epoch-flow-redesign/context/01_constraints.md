# Constraints

**Ground-truth precedence (decided).** Whatever is merged into the melee
checkout remote is gospel: at the boundary, upstream always wins the merge.
Local work it displaces is not silently lost — the target is requeued with a
librarian knowledge entry recording the history ("this was matched/changed
locally, upstream landed and overrode it, requeued"), so the next worker
attempt starts from the upstream version, sees what happened, and tries to
improve on it. Keeping a local version at boundary time happens only through
that requeue-and-re-win path, never by rejecting upstream during the merge.

**No agents at the boundary.** The boundary itself runs no worker or resolver
agents. Merge conflicts resolve mechanically in upstream's favor + librarian
note + requeue. This keeps the boundary bounded and cheap; judgment work stays
in the normal worker lane where the knowledge base carries the context.

**Rebase timing.** A rebase of the cycle branch invalidates every in-flight
claim's base revision. Reconciliation may only run inside the epoch boundary,
after claims drain and before next-epoch admission. The boundary already
captures `baseRevAtBoundaryStart` and does a compare-and-set when advancing
worker base revisions — that CAS is the insertion point and the guard: if the
branch moved under the boundary, the boundary must re-check, not clobber.

**Sync lease discipline.** The operator sync (sync.start) takes the game
dispatch lease and must not be running concurrently with a run's boundary
reconciliation. The lite lane runs UNDER the run's existing dispatch lease as a
boundary step — it must never request a second lease or enqueue a sync
dispatch request (a queued sync request stalls run dispatch by design).

**Mergeability, not full rebase.** Ford's explicit call: the boundary sync's
bar is that our branch can be merged into the freshly synced upstream — not
that history is rewritten onto it. Prefer a merge/mergeability check; a full
rebase is out unless design review finds merge unworkable for the PR phase.

**Boundary sync scope.** The boundary sync DOES include upstream PR ingestion
and, when the sync changed inputs, the full knowledge-graph rebuild followed by
requeueing any target that is no longer matched (Ford's step 5). It does NOT
include the operator sync's publication gating or confirm steps. Merge
conflicts never pause the epoch for judgment: upstream wins mechanically, the
displaced target gets its librarian note + requeue, and the boundary proceeds.
The only loud-blocker case is infrastructure failure (fetch/merge/build/report
itself breaking), which must surface visibly — never a silent stall (June
`resolver_failed` incident is the anti-pattern).

**Run-input immutability.** desired_workers and the configuration snapshot stay
immutable per run. Reconciliation advances the cycle branch and the board, not
the run's identity. Runs staged before a boundary reconcile must either be
re-staged or the stale_baseline blocker will (correctly) stop them — that
blocker plus createRun-at-head (fixed 2026-08-26) is the consistency mechanism,
keep it.

**Draft PR is draft only.** Open/refresh via gh as draft against upstream;
never mark ready, never merge. Title/body carry the epoch number, confirmed
match/improvement lists, and tier scores. Respect the existing PR-phase
machinery for actual shipping; the epoch draft PR is a visibility artifact and
merge-readiness probe (its CI results are signal, not gate, for now). Note the
`cycleDraftPrEnabled` flag already threaded through run-loop config — audit
what it currently does before adding a second mechanism.

**Score tier definitions are contracts.** Baseline = the upstream anchor the
cycle branch currently sits on (advances only at reconciliation, recorded as a
save point). Epoch-confirmed = delta of the cycle branch's last
boundary-validated report over baseline. Tentative = checkpoint-level wins in
the open epoch, pre-report. The read-model must compute each from its own
source (anchor record, boundary save points, checkpoints) — never from the
staged run's board snapshot, which is what made restages wipe the display.

**Operational.** Migrations edited while a server/scheduler runs cause
mixed-version wedges (seen live 2026-08-26: child processes migrate the DB, the
old in-memory process rejects the bookkeeping and silently stops dispatching).
Any schema change here ships with the rule: restart server + scheduler after
deploy. Postgres kernel DB and Daytona quotas are not touched by this
objective.
