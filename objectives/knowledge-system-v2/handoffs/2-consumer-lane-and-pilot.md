# Thread 2 — Prerequisites: librarian consumer run-loop lane + librarian-v2 quality pilot

Repo: `~/Github Repos/Codecaine/gamecube-decomp-harness`. Read `AGENTS.md` first. Other threads are
active — `git status` first, coordinate around files you didn't create, never commit without my go.
Run `bun test` from `apps/server`, NEVER from the repo root (it exhausts file descriptors).

Implementation rules: implement via `codex exec -m gpt-5.6-sol -c model_reasoning_effort="low"
--enable fast_mode "<inline prompt>" < /dev/null` (prompt inline, always `< /dev/null` — codex hangs
on inherited stdin; `xhigh` only for genuinely interlocking work). If codex stalls (0% CPU, no
session-log growth for ~10 minutes, relay at `http://127.0.0.1:2455` still answering), kill it and
implement directly with a Fable subagent instead — I have authorized that fallback.

## Where things stand
Everything is on `main` (`b1c08852`). The librarian-v2 queue consumer exists as a CLI only:
`bun apps/server/src/application/jobs/job-runner.ts kg2-librarian --run-id <id> [--limit N]
[--concurrency N] [--dry-run] [--pathway P] [--stop] [--status]` (module
`apps/server/src/core/knowledge-v2/librarian/`). The worker-summarizer already has the pattern to
copy: `startWorkerSummaryIfEnabled` in
`apps/server/src/core/cycle-runtime/phases/running/scheduler/run-loop.ts`, gated by
`--worker-summary` (`workerSummaryFlag` in `core/game-registry/runtime-options.ts`), recording a
`worker_summary_flag_recorded` event, with a test proving zero footprint when off (a throwing-Proxy
store). The queue holds 1,836 `pr_imported` + 33 `archival_ingest` tasks, none consumed.

## Three small items, in order
1. **Consumer run-loop lane.** Add `--librarian-consumer` (default OFF) mirroring the summarizer
   flag exactly: parse in runtime-options, record a `librarian_consumer_flag_recorded` event (add the
   type next to the summarizer's in `core/shared/types/state.ts`), start `runLibrarianConsumer`
   beside the summarizer processor with the same sync-pause `shouldClaim`, stop it in the same
   `finally`, and prove zero footprint when off with the same throwing-store test. The lane runs
   continuously while the run loop is up: poll the queue, drain by priority, idle when empty.
2. **Dry-run slice split.** In `librarian/consumer.ts`, a `--dry-run` claim on an oversized
   `archival_ingest` slice currently skips `splitOversizedSlice` and feeds the whole slice to the
   model. Make dry-run split the same way real mode does but WITHOUT enqueueing children (log the
   would-be split), so a dry run on the whole-corpus Discord task (76,452 messages) behaves sanely.
   Test it.
3. **Quality pilot.** The one dry-run so far (`pilot-lv2-01`, on 2020-era `pr-199` with one comment
   and no CI rows) returned an EMPTY envelope — sanctioned for thin material, but it doesn't tell us
   whether the librarian judges well. Run exactly ONE more real-model dry-run on a rich PR: pick a
   queued `pr_imported` task for a PR ≥ #1500 that has both discussion records
   (`games/melee/knowledge/sources/code_context/past_prs/data/prs/pr-<n>/extracted/text_corpus.jsonl`)
   and `[ci]` function rows in `pull_request` (query the store read-only to find one; the CLI has no
   task selector, so add `--task <id>` to `kg2-librarian` if needed). Prove the store unchanged
   (`PRAGMA data_version`, table counts, the task's `started_at` back to NULL) and show me the full
   proposal envelope, the apply report, and timings verbatim.

## Definition of done
Tests green from `apps/server` (`src/core/knowledge-v2/`, `src/core/cycle-runtime/`; document the
pre-existing failures you didn't cause: the epochs order-flake, cycle-API worktree-root, orchestrator
verify-mode, graph query-parity ×2); typecheck no new errors (baseline 4: change-validation ×3,
worker-cycle); the pilot artifact presented for my review; worklist updated by hand (never codex).
Nothing written to the knowledge store by this thread. Commit only when I say.
