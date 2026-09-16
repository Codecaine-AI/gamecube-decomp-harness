# ItemParasolDamageFall

Revision `c302741689bd67c361cd7faadb221df3193992c3`. Complete canonical/rendered coverage: C38 and H13, five functions, six targets and six entities. The header declares every function as void(Fighter_GObj*) at lines 6-10.

| Function | Behavior |
|---|---|
| ftCo_800CF4DC | Selects ItemParasolDamageFall with KeepFastFall, start0/speed1/blend0/NULL, then clamps horizontal self-velocity to air_drift_max. |
| Anim | Empty body; no local animation-triggered transition. |
| IASA | Forwards unchanged to DamageFall IASA. |
| Phys | Forwards unchanged to ft_80084DB0. |
| Coll | Calls ft_8008370C with ftCo_80090984. |

Entry is unguarded locally. The observed DamageFall caller first makes a grounded fighter airborne, then selects this entry when ftGetParasolStatus != -1. That status helper recognizes ordinary Parasol and Peach Parasol item motion IDs. Normal fighter setup installs ftData_MotionStateList with threshold 0x155; common state147 binds this exact Anim/IASA/Phys/Coll suite and camera update. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_DamageFall.c#L95-L109, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcommon.c#L1087-L1121, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/fighter.c#L731-L734, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftmotionstates.c#L1751-L1761. The active table remains the runtime authority.

KeepFastFall prevents Fighter_ChangeMotionState from clearing fall_fast. The local executor does not itself mark the fighter airborne. The clamp bounds self_vel.x to +/-air_drift_max. Later physics tests fast-fall, applies fast-fall speed or gravity/terminal velocity, then invokes common horizontal movement. It uses ordinary Fall's physics helper, while normal ItemParasolFall uses a different Parasol-specific helper.

IASA inherits seven guarded action checks and the horizontal-stick magnitude/timer route into Fall, followed by two checks outside the initial guard. Early returns still apply; the trailing checks are not guaranteed after an earlier accepted action. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_DamageFall.c#L113-L133.

Collision copies position into and out of CollData, selects a query based on facing/ledge cooldown/x2224_b2, and consults ft_80081A00. A true suppression result forces the inline helper false even if the stage query succeeded. Only a true combined result invokes ftCo_80090984 and returns. Every false combined result reaches the wall-jump check, then ledge check unless wall jump returns true. This remains true after a suppression helper state side effect. The landing callback tries ftCo_80098928, ftCo_8009872C, then ftCo_80097D40. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L806-L848, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_0819.c#L68-L92, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_DamageIce.c#L53-L58.

The literal section supplies zero start/blend and unit speed. Archived assembly/report corroborate its two f32 values and 8-byte extent. They are not a new build or match. All five #r3 entities are gobj parameters; Anim ignores its parameter and others use or forward it. No shared type or field ownership is claimed.

Thirty-four facts were reviewed. Twenty-nine are retained; two unresolved; three collision claims are corrected for the suppression gate and outer fallback. Names stay canonical except the already-established entry hypothesis, which remains supported and unique.

Independent review defers two inherited Anim gameplay/purpose claims: an empty local callback does not exclude engine-wide animation work. Three-operation proposal unchanged.
