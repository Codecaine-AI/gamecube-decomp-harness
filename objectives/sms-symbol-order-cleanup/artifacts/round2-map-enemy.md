# Map and enemy validation audit, round 2

Status: proposals only; no shared source was edited and no compiler/build job was run by this agent.
All input is from the independent SMS checkout and its preserved final-strict inventory.
The parent must rebuild and compare each logical patch before accepting it.

## Proposed changes

| Patch suffix | Evidence and intended result | Risks / remaining failures |
| --- | --- | --- |
| coaster | Move existing empty `TCoasterEnemy::setNormalFlyAnm` body into its class. Map line 22957 explicitly says weak; current object global; existing four-byte body matches 100%. Expected one linkage fix. | Header also included by `System/MarNameRefGen_BossEnemy.cpp`; rebuild consumers. Virtual dispatch from `setWalkAnm` must remain matching. Three existing missing symbols remain. |
| map | Move existing empty `TMap::~TMap` into its class. Map line 34164 explicitly says weak; current object global; existing 116-byte body matches 100%. Expected one linkage fix. | Widely included game header; rebuild all consumers and compare full report. Seven absent UNUSED symbols remain. |
| bath | Move four existing `TBathWaterMeshRenderer` method bodies into the TU-local class at their declarations. Original map closure explicitly weak for `makeHeightMap`, `makeNormalMap`, `calcCoord`, `clearHeightMap`. Expected four linkage fixes and removal of non-weak ordering failure caused by those same methods. | Existing bodies remain identical apart from class indentation. Constructor and `prerender` can inline these methods; caller/object matching must be checked. `clearEFB` remains absent from object; current unused inline stub does not have known original behavior. |
| corona-order | Move existing `TBathtub` definitions into reverse map order, preserving every body and Unused comment. Map lines 65831-65884 give exact original order. Expected one ordering fix. | This file is mostly stubs; no implementation progress claimed. Forty missing and one binding defect remain at this stage. |
| corona-signature | Change `TBathtub::getWaterMtx(s32)` parameter in source/header to `int`. Map has `getWaterMtx__8TBathtubFi`; current object has `getWaterMtx__8TBathtubFl`. MWCC distinguishes int and long despite both being 32-bit. Expected one missing-symbol fix. | No callers found. Existing eight-byte stub remains nonmatching against UNUSED map size 0x24; correcting signature does not recover behavior. |
| corona-destructor | Explicitly declare virtual destructor and define empty body out-of-line at end of source (first emitted under reverse order). Original map line 39014 explicitly global; current compiler-generated implicit destructor is weak but already matches target 132-byte body exactly, including base destruction and deletion path. Expected one linkage fix. | Changing implicit to explicit destructor can affect header consumers; rebuild all consumers. This is structural recovery from already-matching compiler-generated behavior, not fabricated destructor logic. |

Patch files are `.audit/round2-map-enemy-<suffix>.patch`.
Apply Corona patches sequentially: `corona-order`, `corona-signature`, `corona-destructor`.
Each Corona patch is based on the previous Corona proposal's source.
The other three patches are independent.
The combined `.audit/round2-map-enemy.patch` contains all six in that order for reference; parent should prefer per-change integration.
Scratch final text is under `.audit/round2-map-enemy-scratch/<patch-name>/`.

## Evidence

`.audit/round2-map-enemy-evidence.txt` captures original map line numbers, current `nm -S` output, and complete direct diffs for the two moved empty functions and implicit TBathtub destructor.
Strict input logs are `final-strict/mario__Enemy__coasterkiller.log`, `final-strict/mario__Map__Map.log`, `final-strict/mario__Map__BathWaterManager.log`, and `final-strict/mario__MoveBG__MapObjCorona.log`.
The first four individual patches passed `git apply --check` against the shared checkout before integration.
No strict improvement is verified yet.

## Unresolved cases

Coaster's absent parameter constructors already have inline header definitions; emitting them without reconstructing original usage would require further compiler/caller investigation.
The absent `__sinit_coasterkiller_cpp` likewise requires static initialization evidence; no arbitrary includes were added.
Map has five absent UNUSED stage initialization functions and two absent overloaded query methods; no bodies were invented.
Bath's only missing function is an existing empty, unused in-class `clearEFB`; forcing emission of an unverified stub would not establish correctness.
Corona's missing grip classes, parameter initialization, template helpers and static initialization require decompilation or compiler-context work.
The signature correction addresses one demonstrable name mismatch only.

## Acceptance checks for parent

For each patch, compile affected TU and all header consumers using the isolated Wine prefix; use existing preserved baseline, not a new baseline over modified source.
Run direct strict validator, `ninja changes_all`, and compare full per-function report.
Reject or investigate any matching regression, even if a strict error disappears.
Run final full strict inventory because header edits can affect other units.
