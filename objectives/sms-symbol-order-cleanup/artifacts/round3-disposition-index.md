# Round 3 Disposition Index

## Read the Counts Correctly

A strict failing file has at least one missing-symbol, ordering, or linkage diagnostic.
It can contain one issue or dozens, and its source may already compile and partially match.
A missing symbol can mean absent game code, an existing function under the wrong signature, or a helper the compiler inlined instead of emitting.
Strict pass does not prove complete implementation: pre-existing empty bodies and advisory UNUSED-size mismatches can coexist with a pass.

The round-2 starting inventory was 452 passes, 269 failing files, and 15 validation coverage errors across 736 units.
The 269 failures comprised 136 restricted-library files, 59 empty game files, and 74 nonempty game files.
These are starting counts, not a current round-3 result.
Parent verification and final full inventory remain authoritative.

## Provisional Integration Snapshot

At index creation, [round3-decisions.json](round3-decisions.json) contains 11 accepted trials and 4 rejected-and-reverted trials.
Trial counts are not counts of newly passing files.
The parent is still testing candidates; this index does not freeze or replace the decision ledger.

Accepted case identifiers: `effectobj`, `coaster-sinit`, `boss-sinit`, `cube-constructor`, `draw-ctor`, `npccolor`, `jump-area`, `tooldata`, `mapobjhide`, `animalmanager`, `mew`.

Rejected and reverted identifiers: `npcwalk`, `braking`, `eventwatcher`, `emario`.

Each decision links a saved verification result.
Cohort reports describe proposals and may predate an acceptance or rejection; resolve that difference using the decision ledger and final verification artifacts.
The final accepted combined patch excludes rejected trials.

## Audit Reports by Cohort

| Cohort | Main report | Supporting reports |
|---|---|---|
| Camera and PauseMenu2 | [Camera audit](round3-camera-audit.md) | [Machine-readable dispositions](round3-camera-dispositions.json) |
| Enemy and Animal | [Enemy/Animal audit](round3-enemy-audit.md) | [Rejected EMario follow-up](round3-enemy-emario-followup.md), [symbol audit](round3-enemy-symbol-audit.json) |
| Map and MoveBG | [Map audit](round3-map-report.md) | [MapObjHide, MapObjLib, and MapObjCorona follow-up](round3-movebg-audit.md) |
| NPC and UI | [NPC/UI audit](round3-npc-ui-audit.md) | Includes NpcWalkTurn regression evidence |
| Player | [Player audit](round3-player-audit.md) | [Proposal evidence](round3-player-proposals.md), [symbol audit](round3-player-symbol-audit.json) |
| System and Strategic | [System/Strategic audit](round3-system-audit.md) | Includes EventWatcher rejection and absent-method evidence |
| Name-reference factories | [Factory dispositions](round3-nameref-disposition.md) | [Template structure trial](round3-nameref-template-structure.md), [OilBall](round3-nameref-oilball.md), [Mew](round3-nameref-mew.md) |
| MarioUtil and LodAnm | [Utility audit](round3-util-audit.md) | ToolData map and full caller comparisons linked there |

## What Can Be Corrected Without Inventing Behavior

Existing-body name/signature recovery, verified helper extraction, constructor declaration correction, and original initializer recovery have produced accepted changes.
Examples in the current ledger include ToolData helpers, WoodBox killNearWoodBox, NpcColor dispatch helpers, AnimalManager parameter loading, MarioJump attack-area helper, and sound-list initializers.
These changes have original map constraints and caller/object evidence.
The parent accepts them only after compilation, strict comparison, and matching regression checks.
A plausible patch file by itself is not a verified result.

## Actual Missing Source

Some nonempty files contain only fragments or stubs of the original TU.
Examples include MapObjCorona grip classes, MapObjDolpic Weathercock, MapObjSample, Player/Atom, MarioRecord recording logic, and several nozzle classes in WaterGun.
Some helpers have only UNUSED names and sizes, with no retained standalone assembly or identified inline caller.
Examples include MarioInit stageSetting, MarioUtil ModelUtil dump, and several ToolData overloads.
Writing empty bodies or plausible algorithms would make strict counts look better without establishing original behavior.
These cases need decompilation and class/layout reconstruction, with original callers and assembly where available.

## Compiler Emission and Ordering Uncertainty

Other findings concern code that already exists but compiles under a different boundary or template context.
Examples include CameraMultiPlayer removePlayer, camera and pause weak methods, MapMirror set/scaleAdd, MapObjLib matrix at/set, MarioCollision vector helpers, and CardLoad stream construction.
The original binary may call a helper that current MWCC output inlines, or current source may emit weak where the original emitted global.
The source structure must explain both emission and matching caller instructions.
Restoring a symbol while reducing matching is rejected, as observed in the braking and EventWatcher trials.
The name-reference factory has a separate template-interface issue involving restricted middleware; game-only pointer substitutions can change the represented types and are not safe textual fixes.

## Confirmed Validator Limitations

ShadowUtil's twelve missing reports correspond to existing weak local-class methods with different compiler-generated numeric names.
The code is present; literal-name comparison cannot identify those counterparts automatically.
This remains counted in raw strict results with no normalization, exemption, or source hack.

The fifteen coverage errors are separate from failing files.
The checker resolves map units through the .text layout, which cannot resolve the verified data-only game files MarioUtil/RumbleData and Camera/CamShakeDefine by that procedure.
These are not passes and do not establish missing function implementations.
See [the main report](../REPORT.md) and existing generated-name/map-resolution artifacts for details.

## Restricted and Empty Scope

The 136 restricted-library failures are SDK, JSystem, runtime, MetroTRK, or THPPlayer scope protected by SMS AGENTS.md.
They remain measured and untouched.
The 59 empty game files account for 3,321 missing symbols in the starting inventory and are actual decompilation backlog.
Both groups are separate from the nonempty game-source cleanup audited in this round.
The [736-file ledger](case-ledger.csv) is the exhaustive file inventory; this index groups audit explanations rather than assigning every symbol a mutually exclusive category.

No source files, builds, runtime state, or live checkouts were changed to prepare this index.
