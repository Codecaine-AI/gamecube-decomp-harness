---
name: director-scheduling
description: "Target selection and scheduling policy for the D-Comp Orchestrator director. Use when choosing the next Melee function, source file, object/TU, near-match, or fuzzy function to work on from objdiff/progress reports."
---

# Director Scheduling

## Overview

Use this reference before scheduling a Melee decomp target when the goal is
project ROI, not just clearing the current near-match. The director starts from
`build/GALE01/report.json`, `objdiff.json`, worker reports, and wake events,
then applies judgment around reviewability, function size, fuzzy score,
subsystem context, and linked-unit blockers.

The ranking script is a tool, not an agent memory pack. Use it for first-pass
ordering, then queue bounded worker packets that can make source-backed,
verified progress.

## Workflow

1. Ensure `build/GALE01/report.json` exists. In a live orchestrator worker,
   read the existing report only; do not run build/report refresh commands.
   If stale or missing data blocks scheduling, report that blocker so the
   operator/orchestrator can refresh progress after workers are idle.
2. Optionally run the ranking tool:

```bash
python decomp-orchestrator/knowledge/tools/rank_decomp_candidates.py --limit 30
```

3. Treat `function_candidates` as the primary list for exact-match/code progress.
4. Treat `linked_blocker_units` as a secondary list. Fully linked progress matters, but it is lumpy; do not let one tiny pathological blocker dominate unless it unlocks meaningful linked progress or teaches a reusable pattern.
5. For the top few candidates, inspect local source, sibling functions, headers, object diffs, and prior attempts before committing to a target.
6. Hand the selected target to a worker as targeted iteration by default.
   Enable experimental search only when worker evidence shows a broader source
   shape search is worth the extra artifact overhead.

## Candidate Heuristics

Prioritize:

- exact-match opportunity: unmatched/fuzzy functions with enough byte size to matter
- high fuzzy, medium-size functions that look tractable
- larger fuzzy functions where natural C progress would clarify logic even if not immediately perfect
- units with one to three remaining blockers only as a tie-breaker
- subsystems with nearby matched siblings, clear type context, and low data/rodata risk

Deprioritize:

- very small near-matches that are likely one-instruction register-allocation grinds
- targets blocked mostly by data, section ordering, statics, headers, or split changes unless that is the intended work
- functions whose fuzzy score is low because the current source shape is speculative and lacks local context
- fully linked blockers that do not also offer useful code progress or reusable compiler evidence

## Script Output

`rank_decomp_candidates.py` prints:

- `function_candidates`: ranked fuzzy functions with unit, size, fuzzy percent, estimated unmatched bytes, linked-blocker count, and reason flags
- `linked_blocker_units`: units with few remaining fuzzy functions that may unlock fully linked progress
- `summary`: report-level fuzzy, matched, and linked percentages

Use `--json` when another script or artifact needs machine-readable output.

Useful options:

```bash
python decomp-orchestrator/knowledge/tools/rank_decomp_candidates.py --limit 50 --min-size 64
python decomp-orchestrator/knowledge/tools/rank_decomp_candidates.py --mode units
python decomp-orchestrator/knowledge/tools/rank_decomp_candidates.py --json > /tmp/decomp-candidates.json
```
