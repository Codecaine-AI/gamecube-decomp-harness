# Task: Worker-audit Phase 3 — deep transcript read, pair {PAIR_ID}

Two AI decomp workers worked on similar-difficulty targets in epoch {EPOCH} (goal: make C source byte-match GameCube PowerPC asm; score = match %). One reached an EXACT 100% match; the other stalled as a NEAR-MISS (>=99.5%). Your job: figure out what the exact worker did differently, at the level of process and technique — not luck of the target.

EXACT worker  — target {EXACT_TARGET}, baseline {EXACT_BASE}%, final 100%.
Condensed transcript: {EXACT_FILE}
NEAR-MISS worker — target {CTRL_TARGET}, baseline {CTRL_BASE}%, final {CTRL_BEST}%.
Condensed transcript: {CTRL_FILE}

Condensed transcripts contain the worker's reasoning/messages verbatim, `TOOL <name> <params>` lines for each tool call, and truncated tool results. Read BOTH fully.

Write exactly one file, `{OUT_FILE}`, markdown, <=90 lines, with these sections:

## Verdict
One paragraph: the single most important process difference between the two (or "no meaningful process difference — outcome driven by target difficulty/luck" if that is the honest read).

## Exact worker: how the gap was closed
- Diff-reading style: did it reason about specific instructions/registers from the diff output, or guess-and-check source variants? Quote 1-2 short verbatim lines that show this.
- The decisive move: what actually flipped it to 100%, and what chain of observations led there.
- Tool rhythm: rough loop shape (e.g. edit -> build -> checkdiff, N iterations), plus any tools used at pivotal moments (permuter, past PR search, graph lookups, knowledge search).

## Near-miss worker: why it stalled
- Where it got stuck (instruction/issue), what it tried, and what it NEVER tried that the exact worker's playbook suggests.
- Was the stall diagnosable from its own diff output? Did it misread or ignore evidence? Quote 1 short line if telling.
- Loop quality: systematic / mixed / shotgun.

## Transferable technique
2-4 bullet points, each a concrete, generalizable tactic phrased as an instruction one could put in a worker prompt (e.g. "When one instruction differs only in source register, enumerate equivalent source expressions that permute register allocation: temp vs inline, signedness, float literal form"). Only tactics actually evidenced in these transcripts.

## Flags
- exact_loop: systematic|mixed|shotgun
- control_loop: systematic|mixed|shotgun
- outcome_explained_by_process: yes|partial|no
- techniques: comma-separated slugs (reuse: asm-diff-instruction-level, register-allocation-reasoning, permuter, past-pr-lookup, type-shape-experiments, float-literal-tricks, loop-restructure, checkpoint-restore, inline-hypothesis, stack-frame-reasoning, scheduling-reasoning; invent sparingly)

Base every claim on the transcripts. Do not modify any other file. Print DONE when finished.
