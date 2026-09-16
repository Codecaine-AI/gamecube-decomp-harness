# DamageIce Review

Revision `c302741689bd67c361cd7faadb221df3193992c3`. Complete canonical and rendered C1-515/H1-22 read with four receipts. Citation bounds stop at C514/H21. Foreign dependencies are bounded canonical reads; listed DamageFall dependency excerpts reuse prior reads in this same session.

Init transfers knockback to self velocity in air or ground velocity when grounded. It positions the skeleton, resets dynamics, initializes grab duration, builds the custom ice ECB and first hurtbox, makes normal capsules intangible, chooses random spin, spawns effect 0x415, installs hit callbacks and plays 0x122. Repeated-hit entry preserves the confinement timer and skips initial skeletal placement and sound while rebuilding geometry and callbacks. OnHit only clears x2227_b6. OnHit2 reduces the timer and zeroes it for fire; it does not transition directly.

Animation rotates XRotN only in air, gates passive decay on x2224_b2, always checks mash input and dispatches nonpositive duration. Frozen IASA is empty but frozen fighters still move. Air physics supplies friction and scaled gravity with normal terminal velocity. Ground physics delegates friction/movement. Custom airborne collision uses the early probe through frame three, prioritizes right-wall, left-wall, then ceiling response with direction markers 1/2/3. Markers are written after impact handling, including after an exit, and do not identify individual stage lines. Kirby's helper spawns a Kirby-only effect using the supplied offset.

Impact emits effect 0x406, quake, rumble and sound. Full XYZ speed strictly above threshold clears the frozen flag and enters the DamageFall/parasol dispatcher. Otherwise lbVector_Mirror and subsequent scaling affect only X/Y. The duplicated RightWallHug test is preserved. Ground contact can settle the fighter without changing the DamageIce action.

Timer release checks Hammer first. Ordinary breakout changes DamageIceJump at frame zero and animation speed zero, spawns effect 1091 using the second zero vector and assigns stick-derived X and configured Y velocity. The float timer decrements only while positive, transitioning to Fall when that subtraction produces zero or below. Empty IASA coexists with normal airborne physics and collision dispatch, including platform input predicate, landing, wall-jump and ledge checks.

The ground-impact helper attempts directional tech, neutral tech and DownBound in order. External upper-KO and frozen DeadUpFall entry/phase paths reuse the ice effect spawner. Existing inferred names remain hypotheses; colliding foreign ground-check aliases were not substituted for canonical names.

.rodata contains the two twelve-byte zero Vec3 constants in both objects. .sdata contains jobj.h and jobj diagnostic strings, with source13/split16 bytes. .sdata2 is source48/split32; split literals are float zero/one/three and double half/three. Source .sdata2 is writable ELF storage. No runtime memory protection inferred. Report hash matches the frozen manifest; no build ran.

All 109 fact versions and 66 exact link records have individual dispositions. Two .sdata links require coordinator rejection or reassignment. Two rebound rationales require X/Y precision. No shared KB or source writes.
