# Audit Status

1. Complete: worktree delta `aea424cd..ade6f2d4` read across all 187 changed files by six verifiers (Enemy; MoveBG; GC2D/System/Player/MSound; Map/Camera/NPC/Animal/MarioUtil; all 66 section targets; cross-cutting integrity).
2. Complete: harness root-cause analysis for the inert QA layer, reproduced with synthetic and real patches (`evidence/probe.diff`, `evidence/gate-probe.ts`).
3. Complete: REPORT.md with Part 1 (new issues), Part 2 (consolidated audit including PR-era status), Part 3 (harness causes), Part 4 (standards and lint proposals with Global or SMS scope per item).

Not done, by design: no build, objdiff, or symbol-order validator run on this machine; no Daytona sandbox created. The eight "exact versus worker note" section rows and the four MapObjCorona symbol-order disagreements need a sandbox-backed check. No game source, runtime state, worker, standards record, or lint rule was modified.

The live tree kept integrating during the audit. One verifier read `964fc1a6`, two commits past the audited `ade6f2d4`; its line numbers are from that tree.

Read REPORT.md. Harness owners start at Part 3; SMS branch owners start at Part 1.1.
