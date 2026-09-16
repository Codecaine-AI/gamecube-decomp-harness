## Nana SpecialHi / Belay

This unit implements Nana's partner-side attachment, launch and follow-up callbacks. The header declares `ftNn_Init_8012300C` and `ftNn_Init_8012309C`, whose implementations are in `ftnana.c`, not this C file.

### Entry and attachment
`ftNn_Init_801232A4` copies Popo's facing when available, prepares airborne movement with all jumps consumed, enters motion `0x169`, clears `cmd_vars[0]`, and sets `x2222_b2`. The canonical Nana callback table identifies `0x169` (361) as **SpecialHi_0**, not SpecialHi_1; source adjacency was misleading in two baseline facts.

`ftNn_Init_801230D0` accepts an existing Popo only in motion IDs 347–352. It synchronizes Nana's facing, positions her XRotN joint relative to Popo's R4thNb joint, and pauses or matches her animation rate according to Popo's flag and rate. An existing out-of-range Popo returns false before synchronization; the physics caller then moves Nana backward eight units and enters ordinary Fall. **Missing Popo returns true without synchronization**, so disappearance alone does not trigger this fallback.

### Partner-coordinate callback and launch
`fn_80123218` publishes Nana's L4thNb world position into Popo's `u.pp.x2240`, with an existence guard but no motion-range guard or missing-partner clearing write. It is installed after initial entry, both terrain transitions, and launch—not exclusively during the initial phase. Its ultimate clearing and the lifetime of the receiving vector depend on external engine/Popo code.

SpecialHi_0 animation completion invokes `ftNn_Init_801237F8`. Only the pairwise `ft_800849EC` call requires Popo. Launch itself is unconditional: X velocity is facing times `x13C*cos(x140)`, Y velocity is `x13C*sin(x140)`, and position is offset by facing-scaled 4 and vertical 7, both multiplied by vertical model scale. It enters motion 365 at frame zero and reinstalls the accessory callback.

### Follow-up phases
The callback table maps 362 to SpecialHi_1 and 365 to SpecialHi_4. Grounded collision failure enters 365 at the current animation frame with flags `0x0C4C508A`. The reverse helper selects 362 using `ftCommon_AirToGroundStateChange`; both reinstall the accessory callback.

Grounded physics delegates to the independently inspected ground-friction routine, including its strict above-walking-speed friction multiplier. Aerial physics first applies falling with `x144`/`x148`; horizontal stick magnitude strictly above `x138` selects drift scaled by `xB0`/`xB4`. Otherwise, only negative vertical velocity selects the fallback helper.

Aerial collision first tests the literal condition `ft_80081D0C(gobj) != GA_Ground` and dispatches the ground transition. The helper's enum-valued return is not a straightforward statement of the fighter's movement classification. Remaining branches rebound on left-wall-mask contact with positive X velocity or right-wall-mask contact with negative X velocity, scale X velocity by `-x14C`, reverse facing, update rotation, and return before ceiling processing. If reached, ceiling contact sets Y velocity to zero without an ascent guard.

SpecialHi_1 animation exhaustion requests the common action-ending dispatcher, whose exceptional hand/neutral-state branches precede ordinary Wait. SpecialHi_4 exhaustion requests common FallSpecial with `x130` mobility and `x134` landing lag; the inspected callee can instead redirect when `x2224_b2` is set. All four IASA callbacks, all SpecialHi_3 callbacks, and SpecialHi_0 collision are empty; this establishes callback-local inactivity, not immunity to external transitions.

### Evidence boundaries
Canonical and rendered owned pages were reviewed completely. Rendered names remain hypotheses; actual callback tables and inspected callees independently support the retained role interpretations. No compiled artifact was supplied, so `.sdata2` extent, membership and read-only placement remain unresolved rather than inferred from C literals.

Status: synthesized; independent review and live promotion pending.
