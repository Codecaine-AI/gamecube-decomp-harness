# Yoshi victim capture setup

Draft at `c302741689bd67c361cd7faadb221df3193992c3`.

`ftCo_800BBB8C` takes the captured fighter first and capturing fighter second. Yoshi grounded and aerial neutral-special setup register it as grabbed_cb. It invokes common cleanup (including existing damage/death callbacks), heavy-item handling and prior grab/throw cleanup before overwriting the victim relationship. It stores the attacker in both x1A5C and victim_gobj, clears x221B_b5/b7, and sets facing opposite the attacker.

The capture helper attaches the victim XRotN joint to attacker TransN2 only when its constraint flag is clear. Entry then requests CaptureYoshi with flags zero, frame zero, speed one and zero blend. It installs ftCo_800DB464 as accessory1_cb, makes the victim airborne, stores 0x1FF in x1A6A, advances common animation/action setup and zeros movement/knockback vectors. The accessory callback updates cur_pos from the constrained joint plus scale/facing-adjusted offsets, forcing Z to zero. No null or fighter-kind validation occurs locally.

The common state table maps CaptureYoshi to the CapturePulledLw animation and the four canonical callbacks. Anim, IASA, Phys and Coll are all empty: they perform no local input checks, animation-completion transition, physics or collision correction. This does not mean the fighter has no ongoing behavior: attachment runs through accessory1_cb, and Yoshi attacker animation commands call ftCo_800BBED4 to enter the linked victim into YoshiEgg. Egg Anim later reduces grab_timer normally and through mash input, then exits when the timer expires. The packet does not establish a global no-mash theorem for every capture-phase subsystem.

Header types match all five definitions; historical address comments and include guard are stale relative to canonical symbol identities. Existing canonical callback names are preserved, and the entry alias remains an inference. The .sdata2 object bytes and frozen report corroborate float zero and one for entry arguments; no build ran.

All 11 historical outgoing Egg Lay links are individually retained with fresh canonical evidence. Repeated links are not treated as distinct game mechanisms and no deduplication is proposed.

## Evidence

- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_CaptureYoshi.c#L13-L41
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcommon.c#L657-L668
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcommon.c#L906-L939
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcommon.c#L515-L525
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcommon.c#L895-L904
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Lift.c#L201-L211
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Throw.c#L57-L70
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_CapturePulled.c#L334-L367
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L380-L386
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftmotionstates.c#L3170-L3191
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftYoshi/ftyoshispecialn.c#L129-L163
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftYoshi/ftyoshispecialn.c#L355-L450
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_YoshiEgg.c#L33-L38
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_YoshiEgg.c#L91-L156
