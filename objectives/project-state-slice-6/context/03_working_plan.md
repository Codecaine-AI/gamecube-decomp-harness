# Working Plan — phase-gated

## Phase 0 — scaffolding (orchestrator)
- Objective bundle + lane specs written; pre-existing dirty snapshot at
  /tmp/slice6-preexisting-dirty.txt (also copied to context/preexisting_dirty.txt).
- Gate: lane specs complete, contracts rendered and read.

## Phase 1 — Wave 1 (parallel codex lanes, disjoint directories)
- Lane 1: apps/server core knowledge queue + migration 017 (lane1_spec.md).
- Lane 3: apps/frontend projection + controls (lane3_spec.md).
- Lane 4: docs structure + absorption (lane4_spec.md).
- Process: one fresh `codex exec` per lane, background, logs under /tmp/slice6-lane*.log,
  report at context/lane*_report.md.
- Gate: each lane's focused tests + TypeScript pass; reports written; no out-of-scope file
  touched (checked against ownership lists + dirty snapshot).
- Failure handling: one bounded follow-up `codex exec` per lane with a tightened spec;
  no expanding repair rounds.

## Phase 2 — Wave 2 (Lane 2, after Lane 1)
- Lane 2: getProjectStateView + 21-action authority + knowledge.process route
  (lane2_spec.md), consuming Lane 1's exported seam.
- Gate: focused read-model/route tests + server TypeScript pass.

## Phase 3 — integration review (orchestrator)
- Diff review of all lane changes; DTO alignment check between read-model output and
  frontend types; ownership/scope audit; re-run cross-lane focused tests once.
- Gate: no cross-lane drift; all focused matrices green.

## Phase 4 — migration-copy validation (orchestrator)
- Back up live schema-16 DB to ~/backups/ (timestamped, hashed).
- Run migration 017 twice on a temp copy; verify integrity_check, foreign_key_check,
  table counts/fingerprints unchanged for pre-existing tables, new schema objects present,
  idempotency (second run is a no-op).
- Gate: PASS twice. Then STOP — ask the user before applying live.

## Phase 5 — close-out (orchestrator)
- Update current_state.md; stage only Slice 6-owned paths; verify staged set against the
  pre-existing dirty snapshot; single commit; no push; final report.
