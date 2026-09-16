## Chef neutral-special subsystem

The owned C file implements Mr. Game & Watch's paired grounded and aerial Chef entry, animation, input, physics, collision, and repeat handlers, plus a deferred sausage-creation callback. The header declares this family and identifies it as Neutral Special — Chef. Header address comments disagree with several definition comments and are not compiled-address evidence.

### Entry and repetition
Both entry handlers zero vertical self-velocity, enter the corresponding SpecialN state with arguments `0, 0.0f, 1.0f, 0.0f, NULL`, call `ftAnim_8006EBA4`, clear command slots 0–2, reset the per-use count and loop-disable latch, and arm `accessory4_cb`.

Animation processing consumes nonzero command slot 2 even when repetition is blocked. It repeats only below the configured Chef maximum and while the disable latch is false, then tests animation completion. Ground completion calls `ft_8008A2BC`; aerial completion enters Fall. IASA independently latches absence of held B and tests command slot 1 plus pressed B and the count limit. The input-driven repeat does not test the disable latch. Repeat helpers restart at `anim_frame - 1.0f`, call the animation helper, clear slots 1/2, clear the disable latch, and rearm projectile creation. They do not locally reset the count or command slot 0. B release therefore is not irreversible for the entire move.

### Deferred emission and lifetime
With command slot 0 zero, the accessory callback remains inert and installed. With a nonzero request, it consumes the request immediately. Below the configured maximum it increments the count, transforms `(2.5f, 6.5f, 0.0f)` through the left-thumb joint, selects from indices 0–4 excluding both stored history values, shifts history, and calls `it_802C837C` with the fighter, position, Chef item kind, selected index, and facing direction. Count and history advance before that call; its result is not checked. The count therefore tracks attempted emissions rather than proven successful allocations or live items. The callback is cleared after every consumed request, including a request blocked by the cap.

The five-value selection domain is separate from the attribute-driven emission maximum. Candidate count is not necessarily three unless both history values are distinct members of the domain. Neither entry nor repeat locally resets those history fields. Their initialization and persistence outside this unit remain a cross-file question. Item lifetime and allocation-failure behavior also belong to the item implementation.

### Physics and form changes
Ground physics delegates to `ft_80084F3C`; the canonical helper applies ground friction, including its above-walk-speed multiplier, then ground movement. Air physics delegates to `ft_80084EEC`, which applies common gravity/terminal velocity and aerial friction.

Ground collision dispatches GroundToAir when `ft_800827A0` returns false. Aerial collision dispatches AirToGround when `ft_80081D0C` is non-false. The latter helper returns a `GroundOrAir` value, includes an exceptional `ft_80081A00` branch, and must not be interpreted solely from the rendered hypothesis `ft_CheckGround`. Both form-change handlers select the opposite Chef state through common helpers and reinstall the accessory callback afterward. Their shared flags include `Ft_MF_UpdateCmd`, skip/keep flags, and unknown bits 19/27; exact preservation of every state component is not established by flag names alone.

### Evidence boundaries
Canonical and rendered views were read completely for both owned files; all 34 subjects, 82 facts, and 31 links were enumerated. Rendered substitutions had no reported parse errors but were treated as hypotheses. No compiled artifacts were supplied, so `.sdata2` membership, layout, and constant-pool claims remain unresolved.

Status: synthesized; independent review and live promotion pending.
