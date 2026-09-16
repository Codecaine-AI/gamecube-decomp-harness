# DamageFall semantic review

Reviewed all canonical and rendered lines of the C file and header, all 26 frozen subjects, all 55 facts, and all 12 links. Existing useful names are retained; rendered substitutions were treated as hypotheses rather than independent evidence.

## Damage-reaction utilities

- `ftCo_80090574` unconditionally forwards its fighter object to `ft_80081DD4`, discarding the boolean result. Ceiling-tech and wall-reaction callers use it after repositioning. The callee synchronizes fighter and collision positions. Its ordinary collision branch conditionally writes JObj-based ledge-snap height using attribute × scale × common multiplier, then resets it to attribute × scale; it does not restore a saved arbitrary previous value.
- `ftCo_80090594` initializes model-shift duration and sequence state, not an action state. Cape, Disable, Nap, Sleep, and an already-active DamageIce state leave existing shift state untouched. Electric mode 2 takes priority over aerial mode 0 and grounded mode 1. Grounded initialization captures the floor normal. The duration passes through the `u16` return of `calcShift`; no saturation or broader numeric-domain guarantee is established here.
- `ftCo_80090690` is a non-advancing nullable getter. Active output mirrors table X by facing; mode 1 additionally transforms that contribution along the saved floor tangent. Inactive output leaves the caller's vector untouched. `ftCommon_8008021C` adds the output to displacement accumulators. Separate fighter processing decrements the remaining count, increments the sequence index, and wraps it at `x18FD`.
- `ftCo_80090718` independently dispatches a direct SFX ID when it is not exactly `-1` and a random-array request when non-NULL, clearing each slot after its call. Scheduling belongs to fighter processing: `!bool1` dispatches immediately; positive computed hitlag and `bool2` establish the deferred flag. Expiry dispatch requires that flag. A nonzero `bool1` with nonpositive computed hitlag is not an immediate-dispatch branch in the inspected code.

## Entry and callbacks

`ftCo_80090780` converts grounded bookkeeping to airborne first. Recognized Parasol status selects ItemParasolDamageFall, including recognized Peach Parasol item states; mere attachment does not suffice. Otherwise it changes motion to numeric `0x26` with flags `0x18001`, frame 0, rate 1, and blend 0, clamps air drift, and passes the Fighter pointer to the conditional feedback hook with 8 and 0. The motion table independently associates state 38 with the DamageFall callback suite. The specialized Parasol branch preserves fast-fall and also clamps drift.

Animation is an exact no-op. IASA checks normal aerial options only when the fighter does not hold a Hammer. Calls short-circuit in source order, followed by the magnitude-at-least-`x210` and tilt-timer-below-`x214` Fall cancellation test. Only paths without an earlier return reach `ftCo_800C5DDC`, then `ftCo_800C5CD4`. These trailing helpers are distinct: the first can release the item and enter Fall under its input/timer gates; the second checks Hammer possession and A/B input before HammerFall entry. A successful predicate need not itself change motion: `ftCo_800D705C` sets `x209C` and returns true.

Physics delegates once to shared aerial physics. Collision delegates to `ft_8008370C` with `ftCo_80090984`. The shared routine invokes the supplied callback on its accepted contact path; otherwise it tries wall-jump and cliff handling. The callback tries directional PassiveStand, then neutral Passive, then `ftCo_80097D40`. The latter resets downspot state, but does not guarantee DownBoundU/D: `x2228_b2` selects an orientation-sensitive route that can instead call `ft_8008A2BC` or `ftSb_Init_8014FBA4`.

## Rendering and evidence limits

The C rendering has no parse errors, but the two trailing Hammer helpers collide on the proposed name `ftCo_HammerFall_CheckInput`. The header reports `shadowed_binding` for the model-shift getter. The rendered DamageIce-prefixed landing callback name must not be interpreted as requiring the DamageIce state.

The restored compiled-evidence artifact records an eight-byte `.sdata2` with bytes `000000003f800000` in both objects. Its assembly finding also records zero use in the IASA absolute-value comparison, so entry is not the sole consumer. The objects have different writable flags; final runtime read-only protection is not established. Source literals alone are not section-layout evidence.

The checkpoint ledger explicitly covers every baseline ID: 46 retained facts, eight superseded facts, one unresolved fact, 11 retained links, and one unresolved link.

Status: researched; no-change lead bypass; independent review and live promotion pending.
