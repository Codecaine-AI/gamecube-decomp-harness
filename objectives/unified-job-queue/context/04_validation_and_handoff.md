# Validation and Handoff

## Standing validation commands

```bash
bun test apps/server                                   # full server suite, must stay green at every gate
bun test apps/server/src/core/job-queue                # kernel suite (phase 1+)
grep -rn "background_knowledge_jobs\|worker_output_integrations\|sync_knowledge_jobs" apps/server/src   # empty after phase 4
grep -rn "SYSTEM_ARG_ALLOWLIST\|GUARDIAN_ONLY_ARGS" apps/server/src                                     # empty after phase 2
grep -rn "leaseId: string" apps/server/src/core/cycle-runtime/run-state                                 # write-back sites gone after phase 2
```

## Kernel invariants (must have named tests)

1. Deterministic claim order: priority DESC, created_at ASC, job_id ASC.
2. Idempotent enqueue on UNIQUE(kind, dedupe_key); re-enqueue of a completed job is a no-op
   unless explicitly requeued.
3. Two concurrent consumers, one claim: no job ever double-claimed (BEGIN IMMEDIATE + CAS).
4. Lease expiry: expired claimed/running jobs are claimable again; the old ClaimToken is
   rejected on every subsequent write.
5. Kind concurrency limit and concurrency_key singleton both enforced at claim time.
6. Backoff: failed -> waiting with next_attempt_at = min(300s, 1s * 2^min(attempts,8)).
7. Every transition appends exactly one game_events row; rollback of the transaction rolls back
   the event (copy lease.test.ts's "without accepting a revision or event" assertion style).
8. onComplete chaining is transactional: successor enqueue rolls back with the completion.

## Phase-2 soak checklist (live run, coordinate with Ford)

- [ ] Run started through dashboard; epoch admitted; jobs rows appear with board priorities.
- [ ] Workers execute; claims visible as claimed/running with renewing lease_expires_at.
- [ ] kill -9 one worker mid-attempt: reap re-queues within lease window; recovery journal
      written; no orphaned target_claims; stale token writes rejected (check logs for the
      rejection, not just absence of writes).
- [ ] Epoch boundary completes via the merged (ex-epoch-run.ts) path; save point recorded;
      report truth rebuilt.
- [ ] Worker close chains a knowledge_absorption job; it completes with a published digest.
- [ ] Run pause/drain from dashboard drains consumers (no new claims, running jobs settle).
- [ ] Compare fuzzy %/exact counts against the previous run's report.json baseline — dispatch
      rework must not regress match results (per-function regression rule applies).

## Handoff rules

- Update `objectives/unified-job-queue/current_state.md` at every phase gate and before any
  compaction/handoff: status, accepted decisions, next actions, open risks, artifact paths.
- Each Codex invocation gets: the goal.md text, the relevant 02/03 sections, explicit file list,
  and the instruction to parallelize internally. Workers report which codex exec calls produced
  which changes.
- Commits at phase gates only, message prefixed `job-queue:`; never commit mid-restage. Branch
  for phase 2+ (e.g. `job-queue/phase-2`); phases 1 and 3-5 may land on main at Ford's
  discretion after gates pass.
- Live orchestrator DBs / state dirs: never recreated or migrated without Ford's explicit OK at
  cutover (product state).

## Done means

- All completion criteria in goal.md true.
- Docs bundles rewritten (phase 5) and reviewed.
- current_state.md closed with a final architecture summary and pointers to the kernel module,
  descriptor registry, and soak evidence.
