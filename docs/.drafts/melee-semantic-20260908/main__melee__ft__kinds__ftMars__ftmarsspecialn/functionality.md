## Neutral-special state machine

`ftmarsspecialn.c` implements paired grounded and aerial Start, Loop, and End callbacks for Marth's chargeable neutral special, conventionally Shield Breaker. The header declares all 36 public functions; `ftmars.c` registers their animation, IASA, physics, and collision roles, sharing each End callback family between End0 and End1.

### Entry and startup

Both entry functions install `ftMs_SpecialN_80136730` in `x21EC`, divide inherited horizontal velocity by `specialn_friction`, enter the appropriate Start state at frame 0/rate 1, and call `ftAnim_8006EBA4`. Division establishes rescaling, not unconditional slowing without an attribute-range assumption. Aerial entry clears nonpositive vertical velocity but preserves upward velocity. The published setup callback, defined in `ftmars.c`, clears `cmd_vars[0]` and the charge-frame counter; its assignment is not itself a direct invocation.

Startup animation exhaustion calls the corresponding Loop-entry helper before invoking `ftCo_800BFFD0` with profile 99 for `FTKIND_MARS`, or 100 for every other kind. The else branch is not restricted to copy users. Loop entry uses `Ft_MF_KeepSfx | Ft_MF_SkipColAnim`, frame 0, and rate 1. Start IASA callbacks are empty. Ground startup applies move-specific friction followed by ground movement; aerial startup applies basic falling followed by move-specific air friction.

### Charge and release

The shared Loop animation helper checks the existing charge counter modulo 30 before incrementing it. On divisible values it samples HipN and calls `lb_800119DC` with parameters 10, 0.5, 0.05, and 60 degrees converted to radians. It then increments the counter and automatically releases only when the incremented value is strictly greater than `MarsAttributes.x0 * 30`, setting `cmd_vars[0]` true first.

The separate Loop IASA helper reads `input.held_buttons[0]`. Absence of `HSD_PAD_B` clears `cmd_vars[0]` and releases; held B causes no action in that callback. End-entry helpers map zero to End0 and nonzero to End1, enter at frame 1/rate 1 with no preservation flags, then publish distinct grounded/aerial `accessory4_cb` functions.

Those accessory callbacks live in `ftmars.c`. When the effect flag is clear, they select effects for numeric fighter kinds 18 and 26; other kinds execute no spawn branch but still set the flag. Both install effect-hitlag callbacks and clear their own accessory slot. This one-shot publication/consumption lifetime must not be confused with the separate periodic and frame-9 calls in this unit.

### Ending and movement

The shared End animation helper refreshes enabled hit capsules only when `cmd_vars[0] == 0`, passing `x4 + (cur_frame / 30) * x8` to `ftColl_8007ABD0`. Preserve the C division expression; the familiar floor interpretation assumes the ordinary nonnegative charge path. Full-charge End1 skips this refresh rather than receiving the same calculation. Exactly at animation frame 9, independently of that flag, the helper samples HipN and calls `lb_800119DC` with 120, 0.9, 0.02, and the converted 60-degree angle. A skipped frame 9 is not compensated by a threshold test.

Animation exhaustion dispatches grounded endings through `ft_8008A2BC` and aerial endings through `ftCo_Fall_Enter`. Wait and Fall are ordinary outcomes, not universal guarantees: the downstream routines contain hand-kind and special-condition routing. End IASA callbacks are empty. Loop and End physics delegate to common grounded friction/movement or ordinary falling/air friction. Ground friction includes a multiplier above maximum walking speed. Air friction writes `x74_anim_vel.x`; it is not a direct subtraction from horizontal self velocity.

### Terrain continuity and evidence limits

Start, Loop, and End have paired ground/air transition helpers with phase-specific masks. End transitions select the matching End0/End1 variant from the existing command flag and reinstall effect-hitlag callbacks only when `x2219_b0 == true`.

Keep collision guards literal: grounded Start uses `!ft_80082708(gobj)` and aerial Start uses a nonzero `ft_80081D0C(gobj)` result; grounded Loop/End compare their result equal to `GA_Ground`, while aerial Loop/End compare unequal to `GA_Ground`. The collision helpers synchronize collision and fighter positions, and their return labels must not be treated as direct assertions of the fighter's current situation. Physical landing/departure terminology describes the intended handoff and does not resolve the numeric-domain ambiguity.

All owned canonical and rendered pages were examined in the inherited research. Rendered names were treated as hypotheses, with transition-name support taken from canonical callers, destinations, and bodies. The independent lead review checked the upstream contradiction citations and supporting color-animation handling. No compiled artifacts were supplied; source literals do not prove `.sdata2` placement, layout, or references.

Primary evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMars/ftmarsspecialn.c#L30-L380`; callback registration and cross-file lifetime: `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMars/ftmars.c#L20-L108` and `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMars/ftmars.c#L489-L542`. Detailed evidence is recorded in the inherited disposition groups and independent checks.

Status: synthesized; independent review and live promotion pending.
