# Thread 4 — Librarian prompt audit, validation sync, new cycle

Repo: `~/Github Repos/Codecaine/gamecube-decomp-harness`. Read `AGENTS.md` first. Other threads
may be active — `git status` first, coordinate around files you didn't create, never commit without
my go. Run `bun test` from `apps/server`, never from the repo root. Code changes go through
`codex exec -m gpt-5.6-sol -c model_reasoning_effort="low" --enable fast_mode "<prompt>" < /dev/null`;
docs are edited by hand. Never run a mutating `kg2-*` command against the real store from a test.

## Where things stand
Everything is on `main` (`15259ff7` and later). Backfill `backfill-01-20260901` stamped all 22,237
targets; the index queue is empty (the 1,869 phase-0 tasks were closed 2026-09-03 as covered by the
backfill). The librarian now receives, per touched subject in `pr_imported` and `run_closed`
contexts, `renamed_from` (rename continuity from reconciliation) and a `drift` report (code citations
re-digested at the checkout head), and its pass is drift-gated: after apply the consumer re-flags the
subjects, releases once for retry, then completes with a warning. Integration outcomes are recorded
on the run row (`worker_run.integration`, `integration_detail`), not by the librarian. Read:
`docs/10-system-design/40-knowledge/40-librarian-pathways/50-drift-gate/doc.json`,
`.../40-librarian-pathways/doc.json`, `.../90-record/70-worklist/doc.json` (one open row).

## Part 1 — Prompt audit (interview me, don't edit until I say so)
The prompts: `apps/server/src/core/agent-catalog/agents/knowledge/librarian-v2/prompt.ts` (+ `context.ts`,
`schema.json`) and `.../backfill-librarian/prompt.ts`. Walk me through them section by section in
chat. For each section: what it asks the model to do, what context fields it names, and whether it
covers these findings from the backfill (the model got these wrong systematically):
1. Proposed 4,531 `related` links to callee functions outside the pass scope (only the target and its
   unit entity are writable) — the prompt must say so, or tell it where callee relationships belong.
2. Rewrote the unit entity's facts on ~every pass (22,542 writes for 4,140 distinct entity/type pairs).
3. Proposed `inferred_name` on 936 targets that already carry a real symbol; 18 restated the symbol.
4. Cited generated `build/GALE01/asm/*.s` files, used the report content hash (`891a1c1aaa30`) as a git
   revision, and cited non-resolving spans (181 rejections).
5. Invented envelope keys (`fact_writes`, `curated_entities`, `proposals`) in 11 passes.
6. Admitted a `target-test` game concept with 581 links that looks like an artifact.
Then the new fields: does the prompt tell the librarian what `renamed_from` means (audit facts that
mention the old name, rewrite, re-cite), what a `drift.evidence` entry with status `drifted` /
`unresolvable` requires (re-cite at head, or rewrite/clear the fact), and that the pass is not done
until none remain? Does the `pr_imported` instruction still make sense now that integration outcomes
are on the run row? Ask me one question at a time; collect my decisions into a numbered change list;
apply it through codex with prompt tests (kernel preview alignment per AGENTS.md); show me the diff
before committing.

## Part 2 — New cycle, prepared but NOT started (the live test)
We are not starting a worker run: the worker still needs its overhaul. The goal is to get the
knowledge side up to date and prove it operational end to end on real new material.
1. Create the cycle through the dashboard-managed process (see `run-operator` skill §2 and the cycle
   API: `POST /api/cycle/new`, then the preparing phase). Let the preparing phase run its boundary
   sync (`boundary-sync` job; check its flags, `--sync-merge-policy` exists). Report the PRs it
   discovered and the Discord refresh result. Do not call `start-running`.
2. `bun apps/server/src/application/jobs/job-runner.ts --game melee kg2-ingest --lane sync`
   (reconcile → prs → discord → attempts; wiki stays out). Report the reconcile result's `renames`
   (pairs and ambiguous) — I want to see real rename pairs from the new PRs — and the tasks enqueued.
3. Drain with `kg2-librarian --run-id validation-01 --concurrency 8`. First `--dry-run --limit 3`
   and show me one full context + proposal + gate outcome for a `pr_imported` task that carries a
   `renamed_from` or a non-empty `drift` report. Then the real drain. Report per pathway: passes,
   gate outcomes (clean / released / warned), facts by type, rejection reasons, and the Explorer's
   drift-warnings count. Stop on any repeated failure class; fix through codex, tests first; resume
   with the same run id.
4. Mark the cycle's preparing phase complete (`POST /api/cycle/preparing/complete`) and leave it
   there. Confirm in the Explorer that the new PRs' facts and any renamed targets show correctly, and
   that a sample V2 card renders the new facts and the integration outcomes on prior runs.

## Part 3 — Close out
Update the worklist row "Post-build validation" by hand with the numbers. List what the librarian
still got wrong on the new material as prompt evidence for a second audit round. The worker overhaul
is the next thread; nothing starts running before it. Nothing committed without my go.
