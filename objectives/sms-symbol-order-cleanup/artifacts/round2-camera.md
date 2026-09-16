# Camera audit, round 2

## Scope and status

Read AGENTS.md and docs/AGENT_MATCHING_TIPS.md.
Inspected original map, compiled symbols, source references, and objdiff output for three Camera units.
No working source edits or builds performed.
The patches are proposals awaiting parent compilation, strict validation, and changes_all review.
Do not count their expected effects as fixed cases before that review.

## Proposed batches

### 1. CubeManagerBase existing helper emission

Patch: round2-camera-cube.patch, one line.
Remove explicit inline from the existing cpp definition of TCubeManagerFast::isInOtherCube.
The original map at line 72446 lists this UNUSED symbol, size 0xa4, directly after SMS_IsInOtherFastCube.
Its current definition is already in the correct reverse source position.
The header declares an ordinary member without a definition.
Only the three calls inside SMS_IsInOtherFastCube use it in this tree.
Current compiler fully inlines it and emits no standalone copy, explaining the strict missing finding without a missing implementation.
An ordinary definition in the cpp is plausible original structure and avoids emission pragmas or fake calls.
UNUSED map entries do not establish binding, so this proposal is an emission hypothesis, not proven original linkage.
The current caller matches 99.9 percent and must not regress.
Check emitted size against 0xa4 and compare caller code before acceptance.
Expected reduction if accepted: one missing symbol, with the TU still failing.

The other absent function, isInCube(Vec const&, char const*) const, has only a header declaration and map UNUSED size 0x9c at line 72449.
Its intended name lookup semantics are not established by signature and size alone.
No proposed body.
The order error is compiler-emitted JGeometry::TVec3<float>::set<float> between the two constructors versus before both in the compiled reverse order.
Initializer is a fabricated helper and TCubeGeneralInfo constructor emission affects this position.
No ordinary game function is misordered, so do not reorder constructors to hide this discrepancy or edit JGeometry.

### 2. SunModel map-confirmed weak member

Patch: round2-camera-sun.patch.
Move the unchanged calcDispRatioAndScreenPos_ body into its class definition in SunModel.hpp.
Add Camera.hpp after existing header includes to provide the complete CPolarSubCamera and gpCamera declarations used by the moved body.
Remove the old cpp definition and its TODO about inline status.
The original map closure at line 34884 explicitly calls this function weak.
Current nm reports global T, size 0x204; original layout at line 72435 reports size 0x124.
This follows AGENTS.md preference for in-class weak member definitions.
Direct callers occur only in sunmodel.cpp perform, but four sources include the changed header: sunmodel.cpp, sunmgr.cpp, lensglow.cpp, lensflare.cpp.
All consumers must rebuild and be checked.
The header currently also defines initialized extern volume-name variables; this preexisting issue is untouched.

The one missing sunmodel symbol, CLBScreenFPosToSPos, already has an inline definition in cameralib.hpp.
Original closure line 34888 reports weak, layout line 72436 gives 0x114 bytes.
Full disassembly comparison establishes that original calcDispRatioAndScreenPos_ calls it, while current code has inlined its coordinate conversion operations into that member and instead calls CLBRoundf<short>.
The weak-member relocation may change inlining context, but no improvement in this missing symbol is guaranteed.
No pragma, artificial address-taking, or duplicate helper is proposed.
Current matching baselines: calcDispRatioAndScreenPos_ 14.2 percent, perform 92.2 percent, ctor 64.4 percent, load 99.9 percent.
Destructor, getZBufValue, calcOtherFPosFromCenterAndRadius_, TVec2<short> ctor, set<float>, and destructor thunk match completely and must remain so.
Expected minimum if accepted: one binding mismatch resolved; strict full pass is not assumed.

## Deferred cameragc findings

Map closure lines 33375 and 33454 prove ctrlGameCamera_ and calcSlopeAngleX_ weak; compiled definitions are ordinary global members.
Their large bodies rely on global Mario and director objects, map interfaces, camera save parameters, and helper definitions outside Camera.hpp.
Moving them into Camera.hpp would require expanding widely shared header dependencies and may introduce include cycles or change many caller units.
The source already flags ctrlGameCamera_ as needing weak/inline status.
No source-only inline patch is proposed because AGENTS.md requests in-class header definitions for weak members.
A separate header dependency and caller-codegen audit is needed.
The remaining order error concerns compiler-emitted JGeometry set<float>, not misordered ordinary definitions.
Missing MsClamp<float>, TUtil<float>::one, MsSqrtf, and TMario::checkStatusType require examining call-site/inlining context and are not evidence of absent source bodies by themselves.
Do not manufacture explicit references solely to emit these symbols.
