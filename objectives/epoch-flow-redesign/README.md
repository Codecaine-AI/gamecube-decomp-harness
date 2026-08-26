# Epoch Flow Redesign

Redesign of the run/epoch lifecycle so each epoch boundary reconciles the cycle
branch against upstream (upstream is ground truth, overridden only by measured
improvement), scores render in three explicit tiers (baseline / epoch-confirmed
/ tentative), and a draft PR is opened/refreshed per epoch so the branch stays
merge-ready and its wins are visible outside the harness.

Created 2026-08-26 after the ramp session exposed blended scores, restage
display wipes, and cycle-long upstream drift. Start with `goal.md`, then
`context/00_problem.md` → `04_validation_and_handoff.md`. Phase 0 in
`context/03_working_plan.md` needs Ford's decisions before any implementation.
