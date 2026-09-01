# Task: Worker-audit Phase 2 — self-summary sweep, batch {BATCH}

You are auditing AI decomp workers (they try to make C source byte-match GameCube asm; score = match %). Your batch file is:
`{BATCH_FILE}`
Tab-separated columns: ws_id, cohort, epoch, target_key, baseline_score, best_score, artifact_dir.
Cohorts: exact (reached 100%), near_miss (>=99.5 but not exact), progressed, no_progress.

For EACH row, read the worker's self-summary files: every file matching `worker_*.txt` directly inside artifact_dir (each ~4KB JSON-ish text; there may be 1-3; a missing dir or no files -> note it and move on). These summaries describe what the worker tried and why it stalled or succeeded.

Use sub-agents / parallel execution wherever the work can be split — optimize for wall-clock speed.

Produce exactly two output files:

1. `{OUT_DIR}/batch_{BATCH}.json` — array with one record per worker:
   {"ws_id", "cohort", "epoch", "target_key",
    "techniques": [short slugs of concrete techniques the worker described using, e.g. "asm-diff-instruction-level", "register-allocation-reasoning", "permuter", "past-pr-lookup", "type-shape-experiments", "float-literal-tricks", "loop-restructure", "checkpoint-restore", "inline-hypothesis" — invent slugs as needed but keep them consistent and reusable],
    "stall_reason": one short phrase or null (e.g. "single fcmpo register mismatch", "stack frame layout", "regalloc churn", "instruction scheduling"),
    "success_factor": one short phrase or null — for exact workers, what per their own account closed the gap,
    "loop_quality": one of "systematic" (each edit driven by reading the diff), "mixed", "shotgun" (variant spam without diagnosis), "unknown",
    "notable": one sentence if anything unusual, else null}
2. `{OUT_DIR}/batch_{BATCH}.md` — <=60 lines: counts of techniques by cohort within this batch, the 3 most interesting exact-worker accounts (2 sentences each, with ws_id), the most common stall_reason per cohort, and anything that surprised you.

Be evidence-based: only record techniques the summary actually describes, don't infer from the score. Read files with stdlib scripting if that is faster than opening each one. Do not modify anything outside {OUT_DIR}. Print DONE plus record count when finished.
