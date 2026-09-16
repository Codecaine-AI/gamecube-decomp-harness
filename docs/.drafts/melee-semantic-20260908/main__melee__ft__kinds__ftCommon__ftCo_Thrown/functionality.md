## Common thrown-victim handling

`ftCo_Thrown.c` owns victim-side entry, skeletal positioning, shared animation maintenance, four directional callback suites, an up-throw camera exception, damage application, and animation synchronization. The header declares the public helpers and callbacks; the shared animation helper has a static forward declaration in the C file.

### Entry and attachment
`ftCo_800DE3FC` follows the victim's `victim_gobj` to the thrower, calls capture setup, copies facing, clears `mv.co.thrown.unk_bool`, and requests the supplied motion and animation speed with the thrower as animation source. Yoshi selects numeric collision mode **2**. The grab timer is reported and cleared unless the thrower is Kirby and the unsigned motion offset from `ftCo_MS_ThrownF` is at most one. Entry installs `ftCo_800DE508` after the motion change. That accessory callback obtains the XRotN joint position, adds facing/model-scaled offsets, forces Z to zero, and writes `cur_pos`. The offset producer computes a difference between two bone positions. Cargo throw entry also uses this helper with a derived ThrownFF-family motion.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Thrown.c#L21-L59; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/fighter.c#L581-L596; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_CargoThrow.c#L91-L118.

### Animation, escape, and camera
All four directional Anim callbacks delegate to `ftCo_800DE5A4`; all twelve directional IASA/Phys/Coll callbacks are empty. With synchronization disabled, the shared helper calls `ftCommon_8007E3EC`. With synchronization enabled, that call occurs only when a **nonzero** stored frame exactly equals the current animation frame; it also requests rate zero and clears the stored frame. Independently, a nonzero grab timer receives passive decrement and mash processing. On a nonpositive result, `xC || fn_800DC044(...)` selects `fn_800DC070`; otherwise the victim enters CaptureCut. The OR short-circuits. Empty collision callbacks establish only phase-local absence of collision work, not global terrain immunity.

`ftCo_ThrownHi_Cam` selects `ftCamera_800762F4` only when the linked fighter is Kirby in `ftCo_MS_ThrowHi`; otherwise it updates the normal camera box. This proves the exceptional dispatch, not a complete offscreen trajectory.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Thrown.c#L61-L142. The common processing callee adjusts cached joint translation only when its matrix is dirty: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcommon.c#L941-L967.

### Hold and resume lifetimes
The thrower's scripted hold passes its current frame to `ftCo_800DE920` on the linked victim. This enables synchronization and either requests an immediate pause at equality or stores the target frame. A deferred target of zero is inactive, and skipping past a target does not satisfy equality. `ftCo_800DE974` clears the mode, requests rate one, and processes animation; it neither clears the stored timer nor restores an arbitrary previous speed. `ftAnim_SetAnimRate` can defer its request into `x8A0_unk` when `x2223_b0` is set. Throw collision transition callbacks resume the linked victim. The position accessory is not self-clearing, but motion-state setup clears `accessory1_cb`, so it is not an unlimited-lifetime attachment.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Thrown.c#L206-L224; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Throw.c#L191-L223; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Throw.c#L279-L390; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L505-L513; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/fighter.c#L1370-L1389.

### Damage, numeric-state correction, and attribution
`ftCo_800DE854` reads the linked thrower's capsule `xDF4[1]`, obtains the victim's XRotN position, computes knockback, copies angle/element metadata, records opposite thrower facing and hurtbox index 1, and invokes damage and hit-reporting helpers.

`ftCo_800DE7C0` optionally stores a secondary fighter and installs `fn_800DE798`, then invokes `ftCo_8008DCE0` and `ftCo_8008E5A4`. Despite the local name `calcKnockbackAngle`, its **90/-1 result is consumed as a motion-state override/automatic-selection sentinel, not a forced 90-degree knockback angle**. The damage callee computes angle separately, uses a non-sentinel override to select damage level 3, assigns the override to `msid`, and changes motion state. Existing knockback angles strictly between 90 and 270 select negated damage-facing; other angles supply positive zero, meaning no facing override in the callee. Ice handling can subsequently select another motion.

The optional callback transfers the stored fighter's object, team, and player identity into thrown-hitbox attribution. It is consumed and cleared inside motion-state setup, including the downstream damage transition; it is not necessarily deferred until a later frame. With a null secondary argument, the wrapper performs no local callback/reference assignment, but downstream setup can still consume an existing callback. Collision code separately offers owner-reference cleanup across fighters.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Thrown.c#L144-L204; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Damage.c#L319-L447; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/fighter.c#L1211-L1214; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L3391-L3410.

### Evidence boundaries
Both owned canonical files and their complete rendered views were reviewed. Rendered substitutions are naming hypotheses, not independent proof. No compiled artifact was supplied: source literal use does not establish `.sdata2` extent, ordering, pooling, or contents. Baseline overlaps were preserved as separate links rather than merged.

Status: synthesized; independent review and live promotion pending.
