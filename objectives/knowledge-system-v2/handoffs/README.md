# Knowledge System V2 — thread handoffs

Paste-ready messages, one per thread, for finishing the V2 rollout after commit `b1c08852`.
Each is self-contained: repo rules, current state, the interview to run first, and the definition
of done. Suggested order:

1. `2-consumer-lane-and-pilot.md` — first; small; unblocks the other two (consumer run-loop lane,
   dry-run slice split, librarian-v2 quality pilot on a CI-era PR).
2. `3-backfill-run.md` — the real backfill: bounded first batch for review, then the full cut,
   babysat with fixes as they appear. Writes are live to workers immediately.
3. `1-docs-merge.md` — parallel, long-running: make the V2 docs the canonical knowledge docs.
4. `4-epoch-validation.md` — after 2 and 3: run the whole loop as an epoch, exercise every call
   site, retire the last legacy worker surfaces.

The docs source of truth is `docs/40-new-features/40-knowledge-system-v2/`; its worklist page
tracks status.
