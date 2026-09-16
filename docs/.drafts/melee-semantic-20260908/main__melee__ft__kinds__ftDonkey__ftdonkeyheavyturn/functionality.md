## HeavyTurn translation unit

The source defines four `void(HSD_GObj*)` HeavyTurn callbacks and the separate entry helper `ftDk_MS_345_800E0294`. The header declares all five functions. Canonical callback registration identifies HeavyTurn separately from HeavyFall and HeavyJump; rendered replacement names were treated as hypotheses, not evidence.

### Animation and interrupts

`ftDk_HeavyTurn_Anim` first calls `ftCo_Turn_Anim_Inner`, then calls `ftDk_MS_341_800DF980` when no animation frames remain. The shared turn helper decrements a positive countdown and returns; on a subsequent eligible update it sets the turn flags and reverses facing once. Animation completion is an independent condition, not a test that turning has completed. The destination helper selects the configured heavy-state base and handles an airborne-to-grounded conversion if necessary.

`ftDk_HeavyTurn_IASA` reads `fp->mv.dk.unk5.x0`. A clear value skips both interrupt checks. When set, `ftCo_80094EA4` receives first priority; only a false result permits `ftDk_MS_347_800E0378`. Canonical callees establish heavy-item throw selection and jump-input recognition respectively. The throw selector returns false without an item or without a changed motion selection. The jump helper transitions only when jump input is present. This unit does not initialize or clear the interrupt gate.

### Physics and collision

`ftDk_HeavyTurn_Phys` forwards the object to `ft_80084F3C`, which applies character ground friction, multiplied by the common above-walk-speed factor only when absolute ground velocity strictly exceeds maximum walking speed, then advances grounded movement.

`ftDk_HeavyTurn_Coll` forwards the object unchanged to `ftDk_HeavyWait0_Coll`. That function passes `ftDk_MS_345_800E0294` as the callback to `ft_8008403C`; the collision policy is shared rather than implemented locally.

### Airborne entry and cross-file lifetime

`ftDk_MS_345_800E0294` obtains the Fighter and Donkey attributes, calls `Fighter_ChangeMotionState(gobj, motion_state + 6, 1, 0, 1, 0, NULL)`, requests animation rate zero, and calls `ftCommon_8007D5D4` only if the fighter is grounded after those calls. The common helper sets GA_Air, clears ground velocity and several positional/animation components, sets jumps-used to one, and establishes a ten-count ECB lock. Already-airborne entry skips these additional resets.

The animation-rate setter normally updates both skeleton rates and `frame_speed_mul`; its exceptional `x2223_b0` branch stores the requested rate in `x8A0_unk` instead. Thus the local operation is precisely a zero-rate request, rather than an unconditional direct skeleton write.

HeavyWait2 also selects this entry when its damage-state completion gate clears while airborne, otherwise selecting HeavyWait0. The entry is therefore shared across collision and damage-recovery paths. Its `HeavyFall_Enter` inferred name remains plausible from canonical state registration and callers, but is not an original identifier. The runtime destination is attribute-relative `motion_state + 6`; the `345` embedded in the canonical symbol is not proof of the destination ID. HeavyFall's own IASA checks throwing only; the jump-recognition helper merely resides in the same source file.

### Evidence and limits

Primary implementation: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftDonkey/ftdonkeyheavyturn.c#L16-L54. Declarations: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftDonkey/ftdonkeyheavyturn.h#L1-L13. State registration: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftDonkey/ftdonkey.c#L85-L128. Cross-file recovery: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftDonkey/ftdonkeyheavylanding.c#L64-L92. Rate-setter exception: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L490-L513.

No compiled artifacts were supplied. Source zero/unit arguments do not prove `.sdata2` extent, layout, representation, or relocation-level consumers. Its three baseline facts remain unresolved. Thirty other facts and all seventeen links are explicitly retained in the checkpoint ledger.

Status: synthesized; independent review and live promotion pending.
