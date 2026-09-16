# Round 3 Player Cohort Audit

## Scope and Proposals

All 11 remaining nonempty Player failures were audited, covering 85 missing symbols.
There are no remaining Player ordering or linkage diagnostics in the round-2 inventory.
The two accepted Player definition-order corrections remain untouched.
No shared source edits, builds, live checkout access, or runtime actions were performed by this agent.

Five independent proposals were handed to the parent for serial compilation and strict/matching review.
They are documented in `round3-player-proposals.md` and saved as `round3-player-*.patch`.
They address one candidate each in MarioDraw, MarioRun, ModelWaterManager, MarioJump, and WaterGun.
None is counted as fixed by this audit.
The strongest declaration evidence is the MarioDraw default-argument constructor wrapper.
The helper extraction in MarioJump has two original-instruction-supported copies and must preserve boardJumping's complete match.
The three other proposals are bounded existing-body/emission experiments requiring zero caller regressions.

## Every Owned Unit

| Unit | Missing | Disposition |
| --- | ---: | --- |
| Atom | 9 | Incomplete unused/debug code. TAtom, TDeformedTerrain and TRopeManager do not have definitions in this tree. The nonempty TU contains a static vector and dummy function only. No guessed classes or stubs proposed. |
| MarioAccess | 11 | Existing header declarations have no bodies. No-argument SMS_GetMarioSpeedY and SMS_IsMarioTouchGround4cm are distinct overloads, not valid substitutes for THitActor-pointer signatures. Map explicitly lists the pointer and no-argument functions separately. Names such as status predicates suggest intent but do not recover exact logic. |
| MarioCollision | 2 | TVec3 copy constructor and scalar operator*= exist in JGeometry, yet do not emit here. Map explicitly marks both weak and original damageExec calls both at 80121de4/80121df0/80121dfc. Their size constraints are 0x1c and 0x28. This is a caller/inlining reconstruction issue, not a missing library implementation. No library edits or forced references proposed. |
| MarioDraw | 14 | One supported declaration/wrapper proposal. Two JGeometry helpers already exist but need original caller emission context. Eleven UNUSED methods have no bodies; declarations alone do not recover their behavior. CheckMarioFootPosCtrl has no located implementation. |
| MarioInit | 1 | stageSetting has declaration only and original UNUSED size 4. An empty release/debug hook is plausible but there is no original opcode or caller evidence proving that body; no empty definition added. |
| MarioJump | 3 | setJumpingAttackArea extraction proposed using repeated current bodies and original caller instructions. doSpinJumping and doSlipJumping lack implementations; no reconstruction from names/sizes alone. |
| MarioParticle | 8 | Declarations exist with no definitions. emitSweatSometimes(s16) is original UNUSED size 0xe4, while existing no-argument overload is separately linked at 0x34. Renaming the current overload would erase a real method and cannot recover the missing behavior. |
| MarioRecord | 11 | Input recording implementation is absent. Only playback/replay and get/reset template bodies exist. TMarioInputRecord versus TMarioInputReplay are distinct original classes. record and recordReset operations do not exist in the current template. No method renaming or invented recording algorithms proposed. |
| MarioRun | 1 | braking already has a complete cpp body marked inline; bounded removal trial proposed, with 0x158 and zero matching regression required. |
| ModelWaterManager | 1 | Existing implicit TWaterHitActor destructor matches all original bytes but lacks its 8-byte secondary-base thunk. Explicit in-class destructor proposal is an emission hypothesis; vtable originally belongs to BossHanachanSub, so consumer checks are essential. |
| WaterGun | 24 | Existing getModel body relocation proposed. NozzleTrigger and NozzleDeform constructors already exist in class but are not emitted standalone; original UNUSED sizes alone do not justify changing their inline context. Remaining 21 symbols concern absent algorithms/classes, including Turbo and Button nozzles, gun draw/setup helpers, and TDeParams. No duplicate classes, speculative constructors, or fabricated bodies proposed. |

## Durable Evidence

`round3-player-symbol-audit.json` records all 85 symbols with exact original-map line evidence, same-name emitted baseline candidates, and individual dispositions.
Same-name candidates are screening information only, not a claim of equivalence.
Constructor wrapper and destructor full diffs are saved separately.
The original doJumping m2c output is saved as `round3-player-doJumping-m2c.txt`.
The existing m2c tool was located in the harness toolpack and used read-only; no installation was required.

## Remaining Questions

The MarioCollision missing weak helpers are associated with original damageExec, which currently matches 93.1 percent.
Current calcDamagePos is a different nearby function and matches 99.5 percent; its vector operations must not be confused with the original damageExec call boundaries.
Restoring the proper game-level expression and inline depth requires more analysis.
JGeometry bodies and current helper layers contain prior matching work and are restricted from autonomous edits.

WaterGun's unused header constructors may originally have emitted because of different source use or compiler context.
No evidence supports artificial calls, address-taking, explicit instantiations, or pragma forcing merely to increase symbol presence.
The same applies to MarioDraw's JGeometry set and setLength functions.

Most of this cohort's remaining count is unreconstructed dead code, not a backlog of simple order fixes.
Strict progress should report the specific accepted symbol corrections and retain unresolved counts.
