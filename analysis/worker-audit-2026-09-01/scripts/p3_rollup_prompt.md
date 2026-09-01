# Task: Worker-audit Phase 3 rollup — aggregate 44 deep-read pair reports

AUDIT_DIR = `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/analysis/worker-audit-2026-09-01`

Read ALL 44 files in `AUDIT_DIR/phase3_notes/pair_*.md`. Each compares an EXACT-match decomp worker against a NEAR-MISS control from the same epoch, with sections: Verdict, Exact worker, Near-miss worker, Transferable technique, Flags (exact_loop, control_loop, outcome_explained_by_process, techniques).

Use sub-agents / parallel execution wherever the work can be split — optimize for wall-clock speed.

Write exactly one file: `AUDIT_DIR/rollups/phase3_rollup.md`, with:

## Scoreboard
Parse every Flags block. Table: counts of exact_loop and control_loop values (systematic/mixed/shotgun) for exact vs control workers; counts of outcome_explained_by_process (yes/partial/no); technique-slug frequency table.

## Consistent differentiators
The 5-8 process behaviors that most consistently separate exact from near-miss workers across the 44 verdicts. For each: how many pair reports support it (cite pair ids), 1-2 best verbatim quotes lifted from the reports, and a counter-example if one exists. Rank by evidence strength. Merge near-duplicates.

## Failure modes of near-misses
The recurring stall patterns (e.g. permuter/variant spam without diagnosis, correctly-diagnosed-but-out-of-write-set fixes, misread diff evidence, giving up on a diagnosable register swap). For each: frequency, cited pair ids, and whether the stall was diagnosable from the worker's own diff output.

## System/harness findings
Anything that is NOT worker technique: write-set scope blocks, tooling gaps, timeout artifacts, target-difficulty confounds. Cite pair ids. Count how many near-miss stalls were out-of-scope/system-bound rather than process failures.

## Candidate prompt rules
10-15 candidate instructions for the worker prompt, each derived from the Transferable technique sections, deduplicated and phrased as imperative rules. Tag each with the number of supporting pair reports. Mark the top 5 by support.

Keep the whole file under 250 lines. Be faithful to the reports — do not invent evidence; every claim cites pair ids. Print DONE when finished.
