# Round 3 Camera and PauseMenu2 Audit

## Scope and Method

Read the final round-2 REPORT/current_state, prior rejection records, AGENTS.md, and matching tips.
Owned seven Camera units and GC2D/PauseMenu2.
No working source edits or builds were performed by this sub-agent.
All proposals are independent unified diffs against the starting round-3 tree, using unchanged existing bodies except deletion of a redundant explicit assignment operator.
Every proposal passed git apply --check before parent integration.
They remain compiler hypotheses until the parent accepts strict and full matching results.
No previously rejected inline trial is repeated unchanged.

## Ready Proposals

### Cube Constructor Structure

Patch: round3-camera-cube-constructor.patch.
Move the existing initializer body directly into the u8 constructor and remove the fabricated helper declaration and definition.
The helper has one caller and is marked fabricated in the header; its name is absent from the original map.
Original constructor assembly inlines TCubeGeneralInfo construction, then makes three calls to JGeometry set<float> inside that construction.
Current object instead calls the TCubeGeneralInfo constructor, while set<float> appears before the parent constructor rather than after it in map order.
The extra inline level introduced by initializer is a source-level explanation for both differences.
Original constructor is 0x1ac bytes, current match 56.6 percent.
The full original/current diff is round3-camera-cube-constructor.diff.txt.
This trial is useful even though the name-based isInCube overload remains absent.
Do not add a guessed name lookup body merely to clear the remaining missing error.

### PauseMenu2 Weak Methods

Patch: round3-camera-pause-weak.patch.
Move unchanged appearWindow and disappearWindow bodies into TPauseMenu2.
Map closure lines 35323 and 35354 explicitly mark both weak.
Original sizes are 0x3b8 and 0x42c, current matches 99.7 and 99.2 percent.
The caller perform currently matches 99.3 percent.
The bodies require complete J2DPicture and JPAEmitterManager declarations, added as ordinary includes in the game header, and the already-existing gpEmitterManager4D2 extern declaration.
No middleware source/header is modified.
Direct header consumers are src/GC2D/PauseMenu2.cpp, GC2D/CardSave.cpp, System/MarDirectorDirect.cpp, System/MarDirectorSetup2.cpp, and System/MarNameRefGen.cpp.
The latter has fragile initializer/include order and must be checked.
Both full method diffs are saved as round3-camera-pause-appear.diff.txt and round3-camera-pause-disappear.diff.txt.
The set<float> ordering discrepancy must be measured after actual emission; no arbitrary template steering is proposed.

### Cameragc Weak Methods

Independent patches: round3-camera-ctrl-weak.patch and round3-camera-slope-weak.patch.
Move the unchanged ctrlGameCamera_ and calcSlopeAngleX_ bodies into CPolarSubCamera in Camera.hpp.
Map closure lines 33375 and 33454 explicitly mark weak; original sizes 0x468 and 0x2f8.
Current function matching is 99.9 and 94.8 percent respectively.
The original caller assembly has direct calls at cameragc.s lines 160 and 1299.
These call boundaries must be preserved.
The ctrl body needs only System/MarDirector.hpp beyond the already-complete Camera.hpp dependencies.
The slope body needs Camera/camerasave.hpp, Map/Map.hpp, and Map/MapData.hpp.
A dependency inspection found no immediate include cycle for these additions.
Camera.hpp is widely shared, so every consumer must rebuild and all-scope matching/strict regression checks are mandatory.
These are first trials of these particular bodies, considerably larger than the rejected sun helper.
No claim is made that size alone ensures the correct inline decision.
Full diffs are round3-camera-ctrl.diff.txt and round3-camera-slope.diff.txt.

### CameraChange Implicit Assignment

Patch: round3-camera-target-assignment.patch.
Remove the handwritten TTargetCamera::operator= and let the compiler synthesize its ordinary memberwise assignment.
This is semantically equivalent for all existing members; no bases, ownership, or custom conversion behavior exists.
Original weak assignment at CameraChange.s lines 1552-1582 performs exactly the three vector assignments and every scalar member copy, skipping padding.
Its 0x74 bytes consist of integer copies for vector members, signed short loads/stores, and float copies.
At the chained assignment in changeCamModeSub_, original assembly at line 1336 calls the inner assignment and inlines the outer assignment.
Current handwritten in-class operator is entirely inlined and no symbol remains.
A synthesized special member can have distinct compiler inlining treatment, making this a plausible source-structure hypothesis with a small reviewable deletion.
This trial is not an instruction to force a standalone copy or change compiler options.
The caller currently matches 88.8 percent; full diff is round3-camera-change-caller.diff.txt.
The separate missing MsClamp<float> body already exists in MathUtil.hpp and remains an inlining-context question.

## Deferred Cases

### CameraMultiPlayer

removePlayer already exists and its caller removeMultiPlayer matches 100 percent.
Round 2 removal of explicit inline produced the UNUSED symbol but changed that caller to a real call and 14.4 percent match.
There is no evidence justifying added calls, address taking, or compiler pragmas.
Keep this as a compiler/body-structure uncertainty.

### CameraNormal

Map closure proves weak calcTowerCenterPos_ and weak function-local sPositionNameTable.
Map table has five pointer entries, while current source declares six slots with five initializers.
The current body has an explicit TODO recording that marking inline loses the intended original noninlined call boundary.
Original helper is 0x128 bytes, current is 0x10c, with helper/caller scores 83.9 and 98.1 percent.
The extra table slot is independently wrong, but deleting that slot does not explain the required call boundary or solve strict linkage.
Do not repeat inline relocation blindly.
A future body audit must account for weak table addressing and stack shape while retaining the original call.

### Cameralib

CLBCalcNearFourPos and CLBCalcNearClipAngle are declared in cameralib.hpp but have no definitions.
Original map gives only UNUSED sizes 0x104 and 0x154.
The existing NinePos implementation contains mathematically related calculations and comments speculating about the helper boundaries.
A plausible geometric implementation is insufficient evidence for original argument layout, ordering, and inline boundaries.
Their reconstruction is real matching work rather than emitting existing bodies.
No body or stub proposed.

### Sunmodel

Prior relocation of calcDispRatioAndScreenPos_ into the class was rejected correctly.
The conversion helper CLBScreenFPosToSPos appeared at 96.304344 percent, but the moved member disappeared and perform regressed 92.2 to 67.7 percent.
Original member calls conversion helper; current global member embeds its conversion operations and calls CLBRoundf<short>.
This establishes a wrong inline structure, but no new evidence identifies the missing nested source structure that will preserve both call boundaries.
Repeating weak relocation or adding noinline pragmas would not be a justified cleanup.

## Disposition Record

round3-camera-dispositions.json records all eight owned units as trial-fixable, uncertain existing-body/emission, or absent-body.
These categories are audit conclusions, not strict exemptions.
The parent must append measured acceptance/rejection outcomes to the final report and preserve raw strict counts.

## Header Self-Containment Review

Repeated dependency audit at parent request.
fakeTan is already defined inline at cameralib.hpp:183, and Camera.hpp includes that header; it is not TU-local.
The same include provides MathUtil declarations for MsVECNormalize, MsClamp, and matan.
Existing MarioAccess.hpp supplies Mario globals and SMS_GetMarioGrLevel/SMS_GetMarioPos.
Slope additions provide complete TCamSaveEx, TMap, and TBGCheckData definitions.
Ctrl additions provide complete TMarDirector; Camera.hpp already has complete TCameraKindParam, TCameraMarioData and TCameraInbetween definitions.
The TCamSaveKindParam dereference is passed by reference without accessing fields, so its forward declaration suffices for ctrl.
All added include dependency trees were traversed for cycles back to their destination header; none were found.
Pause bodies use complete J2DPicture and JPAEmitterManager supplied by patch additions.
No scratch-patch correction was needed.
This is static dependency review; MWCC consumer builds remain the authority.

Recommended parent serial order is cube-constructor, pause-weak, target-assignment, ctrl-weak, slope-weak.
Run direct strict checks respectively for Camera/CubeManagerBase, GC2D/PauseMenu2, Camera/CameraChange, and Camera/cameragc for the last two.
Each trial also requires all consumer rebuilds and changes_all; accepted Camera.hpp edits can affect later candidate baselines.
Ctrl and slope patches independently add headers at the same anchor, so accepted earlier changes may require mechanical patch rebase rather than blind application.
The include graph consumer inventory is round3-camera-header-consumers.json.

Static include traversal finds 126 Camera.hpp, 23 CubeManagerBase.hpp, and five PauseMenu2.hpp source consumers, all outside restricted source directories.
