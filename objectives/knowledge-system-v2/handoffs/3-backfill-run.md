# Thread 3 — Run the knowledge backfill, monitor it, fix what breaks

Repo: `~/Github Repos/Codecaine/gamecube-decomp-harness`. Read `AGENTS.md` first. Other threads are
active — `git status` first, coordinate around files you didn't create, never commit without my go.
Run `bun test` from `apps/server`, NEVER from the repo root. Implementation fixes go through
`codex exec … "<inline prompt>" < /dev/null` (low effort; `< /dev/null` mandatory); if codex stalls
(0% CPU, no session-log growth ~10 min), kill it and fix directly with a Fable subagent instead.

## Where things stand
Everything is on `main` (`b1c08852`). The backfill runner is built and pilot-proven:
`bun apps/server/src/application/jobs/job-runner.ts kg2-backfill --run-id <id> --limit N
--concurrency N [--min-direct-score N] [--dry-run] [--stop] [--status]`
(module `apps/server/src/core/knowledge-v2/backfill/`). One pass ≈ 60–70 s of model time. Passes
write only inside their own scope (target + linked entities); curated game_concept/pattern writes
serialize through a shared gate. Artifacts land under `<stateDir>/knowledge_v2/backfill/<run_id>/`
(per-pass JSON: assembled context, proposal, per-item apply report, timings; plus `run-log.jsonl`).
Ordering is the knowledge-first funnel (`kg2-prioritize --limit 20 --json` shows it): 100% matched →
linked → real-named symbol → unit named-density → direct material. Population: 7,373 targets with
their own material; recommended first cut `--min-direct-score 6` ≈ 847 targets.

Read before starting: `docs/40-new-features/40-knowledge-system-v2/50-librarian-pathways/40-backfill/doc.json`
(the pass contract with a worked example) and the run plan
`objectives/knowledge-system-v2/backfill-run-plan.md`
(its ADDENDUM section has the current numbers).

## Confirm with me at the start (one structured question set)
The cut (`--min-direct-score`), the concurrency (the run shares the `codex-lb` relay with live
`melee-live` workers — size against them), the run id, and whether I want the first batch paused
for review before the run opens up (I do, by default).

## Run it
1. Back up the store first: copy `games/melee/knowledge/knowledge.sqlite` (and `-wal`/`-shm` if
   present) to your scratchpad with a timestamp. Never delete or recreate the store.
2. First batch, bounded: `--limit 50 --concurrency 4`. When it finishes, show me a review sample:
   5 written knowledge records (facts by type with confidence and citations, links, admitted
   entities) chosen across the batch, plus the batch stats — passes applied/failed, items
   applied/rejected/skipped with rejection reasons, empty envelopes, confidence distribution, mean
   pass time. I approve, then open the run to the full cut.
3. Babysit the full run: tail `run-log.jsonl`; on any failure class that repeats (model failures,
   malformed envelopes, apply rejections by reason, context assembly errors, timeouts), stop the
   run (`--stop`), diagnose from the artifacts, fix (tests first), and resume with the same run id
   — the runner skips already-stamped subjects. Consecutive failures abort automatically after 5.
4. Watch the live side: the moment a target has facts, workers in `melee-live` see a V2 card for it
   (injection is data-gated). If a worker-visible defect appears (bad guess marked as a name,
   confidence missing, card too large), treat it as a P1 and stop the run.

## Report as you go
Every ~100 passes: coverage (subject_index_state count vs the cut), facts by type, rejection
reasons, average pass time, any fixes you made (with which codex/Fable invocation produced them).
Final: the full run summary, the store's fact/evidence/link/entity counts, the list of fixes, and
anything the librarian systematically got wrong that the prompt should address (do NOT edit the
prompts yourself — collect the evidence and hand it to me).

## Definition of done
The cut is fully stamped; tests green from `apps/server` for anything you changed; typecheck no
new errors; worklist rows "Initial-build execution" and "Backfill run plan" updated by hand (never
codex); nothing committed without my go.
