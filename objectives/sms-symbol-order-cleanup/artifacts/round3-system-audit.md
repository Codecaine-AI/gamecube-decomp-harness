# Round 3 System and Strategic audit

No shared source changes or builds performed by this agent.
Parent owns serial trial compilation and acceptance.

| Unit | Finding | Disposition |
|---|---|---|
| System/Application | Missing weak TMarioGamePad destructor, declaration only; target 100-byte body contains only base destructor, vtable write, conditional delete | Proposed `round3-system-gamepad.patch`; m2c output saved; define empty in-class destructor and measure every header consumer |
| System/Application | crTimeAry exists inline in game TimeRec header but original Application gameLoop has an out-of-line call at 800F99E8 | Emission/call-depth mismatch; current startTimerTwice is fabricated; do not force emission or alter shared header without caller proof |
| System/EventWatcher | Missing TVec3::set(const Vec&) is explicitly called at 800DD424 inside evWarpFrontToMario, after rotation computed in stack Vec | Rejected `round3-system-eventwatcher.patch`: strict passes, but parent measured evWarpFrontToMario falling from 84.14893% to 82.489365%; parent reverted and restored exact previous report |
| System/MSoundMainSide | Missing JGadget TVector<void*>::begin; real original calls at 8010ECD4 and 8010F19C, current game code uses typed begin already | Original versus current middleware wrapper inline depth differs; forbidden middleware modification, no artificial references; defer until original game call structure can explain emission |
| System/MarDirector | Two UNUSED middleware destructors (TVector_pointer<TBaseNPC>, TSingleLink<TPerformLink,0>) | No recoverable standalone bodies in DOL; declaration types present; compiler-generated/dead-stripped emission versus middleware structure unresolved; no forced instantiations |
| System/MarDirectorDirect | TFlagT copy constructor present in middleware header but absent object; original two calls in decideNextStage at 800ECCF8 and 800ECD80 | Existing game function explicitly notes inline mismatch; complex game-helper/copy depth investigation required, no middleware edits or forced reference |
| System/MarioGamePad | Three absent UNUSED methods keepRumble (0x48), rumble (0x38), considerMarioStick (0x90), including undeclared TType enum | No callers/bodies anywhere in current source; no standalone DOL assembly; signatures and sizes cannot establish enum values or algorithms; defer for evidence |
| Strategic/liveactor | getJointTransByName (0xec), calcVelocityToJumpToXZ (0x50), both UNUSED and only declarations | No callers, emitted bodies or retained original assembly; return type of latter currently void is not established by mangling; no speculative reconstruction |
| Strategic/objmanager | initObjArray(int), UNUSED 0x3c, declaration only | load has a plausible inlined allocation sequence, but not enough evidence to establish body/reset semantics; do not invent allocation wrapper solely to satisfy validator |

All eight cohort units accounted for, with two independent patch candidates.
Remaining findings are preserved as raw strict errors, not reclassified as passes.

## Evidence

Original `mario.MAP` closure line 1830 identifies TMarioGamePad destructor as weak.
Map text line 62278 gives size 0x64.
`build/GMSJ01/asm/System/Application.s` lines 2479–2506 contain the complete original destructor.
The m2c tool used was the existing harness toolpack m2c.py, read-only.

`build/GMSJ01/asm/System/EventWatcher.s` lines 980–1094 show source Vec rotation, explicit set(Vec), subsequent add(TVec3), and assignment to actor position.
`include/JSystem/JGeometry/JGVec3.hpp` already provides TVec3(const Vec&) -> set(Vec); no middleware changes are proposed.
The rotateY helper remains explicitly marked fabricated; the candidate does not claim its name came from the map.

Read-only source search confirms no definition/caller for the six UNUSED liveactor/objmanager/MarioGamePad methods beyond the three Strategic header declarations.
`round3-system-gamepad.patch` and `round3-system-eventwatcher.patch` are scratch proposals, not accepted source changes.

## Parent trial update

EventWatcher trial rejected: strict pass did not justify reduced caller matching (84.14893% to 82.489365%).
Original source/report restored by parent; retained scratch patch is rejected evidence only.
