# Problem

## Data matching is invisible to the scheduler

Upstream melee contributors want data matched ASAP (see doldecomp/melee PR #3210,
"Add broad data matching pass") because matched data unblocks text matching:

- Jump tables in .data let switch-heavy functions match.
- .sdata2 float/double pool ordering shifts constant-pool addressing in every
  function of the TU; wrong data layout makes otherwise-correct code mismatch.
- Writing initializers pins down struct layouts, which makes functions easier.
- A unit only becomes linkable at code 100% AND data 100%
  (apps/server/src/core/cycle-runtime/phases/running/epochs/link-complete-units.ts:40).

Today the harness matches data only *incidentally* — workers define data when a
function needs it, and the section-parity gate protects it afterward. But no
work item is ever generated for leftover data. A unit at 100% code with broken
.data sits permanently un-linkable with nothing scheduled to fix it. Worse, the
knowledge graph marks such files `read_only_complete` and the board splices out
any candidate on them.

Data work is cheap relative to code work: transcribe disassembled bytes into C
initializers (.bss is declarations only — zero-init, nothing to transcribe).
Section rows (unit + section name + fuzzy percent) already appear in
report.json and in the boundary new-matches feed; they are scored end to end,
just never targeted.

## Priority/ranking layer no longer earns its complexity

Board candidates carry a computed priority (closenessPriority: size x
near-exact boost x completeness^4 / gap-to-100) plus ~22 graph rank features
(opseq analogs, edge degrees, unlock scores, dataRiskPenalty -6 on data paths).
The epoch flow now handles pacing; scoring adds churn (frozen priorities in
epoch_targets, refreshEpochTargetPriorities), blocks data targets in three
places, and is not load-bearing. Decision (Ford, 2026-08-30): remove it fully.
Admission = pipe everything open through each layer in report order, with an
optional cap flag; default is admit-all.
