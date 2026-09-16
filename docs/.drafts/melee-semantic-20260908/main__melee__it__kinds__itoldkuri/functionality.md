## Old Kuri state machine

The canonical and rendered implementation contains twelve item-state dispatch entries. State indices are distinct from the table's animation identifiers: states 7/8 use animation identifier 2, and states 9–11 use identifier 3. The rendered declarations agree with the canonical header; rendered names were treated as hypotheses rather than independent evidence.

State 0 waits on xDF8. Every nonzero value takes the decrement branch; a value already equal to zero selects state 2 for facing_dir == +1 and state 1 otherwise. Directional entry computes horizontal velocity using the incoming facing value before assigning the destination facing. States 1/2 use xDFC and shared condition/collision queries for guarded handoffs. The shared tangent-velocity helper has an exceptional zero-facing path that clears velocity.

States 3/4 implement directional falling behavior. Their collision callbacks reload xDF8 from (s32) attr->xC before every collision-helper invocation, not only after landing is established. Their shared landing callback re-enters state 0 and is therefore reusable wait-state entry, not exclusively spawn initialization. Shared ground-support handling also has an exceptional supported-floor branch calling Item_8026ADC0; floor preservation alone does not prove that all downstream state remains unchanged.

Pickup enters held state 5, which has empty physics and no collision slot. Drop selects falling state 4 for positive facing and state 3 otherwise. Throw clears xDF8 and enters state 6. Its collision callback supplies NULL to it_8027C824: qualifying environment contact calls it_8027CC88, notifies the zako generator through it_8027CE44, and returns true; no contact returns false.

Damage adds the shared damage increment to xC9C. The terminal guard is xC9C > *attr->x0 OR msid == 6; equality alone is not terminal. The terminal branch requests a small camera quake and randomly selects state 10 or 11. Otherwise, the ordinary reaction enters state 9, including its guarded minimum upward-velocity adjustment. State 9 applies gravity only while airborne and uses separate ground/air recovery paths.

The jumped_on handler selects stationary state 7 or airborne state 8 according to ground_or_air, then issues item- and fighter-side feedback calls. State 7 calls it_8027CC88 before returning true when its animation query clears; state 8 returns true without that call. State 7's physics and delegated collision handling are inert. State 8 multiplies horizontal velocity by attr->x8; no local bound establishes attenuation. State 10 has empty physics but active shared collision handling. State 11 subtracts fall acceleration without a local clamp. The common falling helper gates acceleration using the maximum-speed argument rather than clamping an overshoot.

The state wrapper forwards caller-selected state and flags, invokes it_80274CAC, and then reinstalls jumped_on. Direct state changes elsewhere do not necessarily share that wrapper's callback lifetime. Both two-object event adapters forward their arguments unchanged to it_8026B894; their exact visible trigger remains unspecified.

Supported existing names and explanations are explicitly retained in the checkpoint ledger. Corrections address state/animation confusion, numeric guards, ordered velocity calculations, falling versus grounded drop states, stale camera symbols, reusable wait entry, inert collision handling, and unrestricted velocity scaling. Qualified OLD-KURI prototype knowledge is preserved. Unqualified final-Goomba mappings remain unresolved, and the Polar Bear/Topi links are rejected as misattributed context. No compiled section-size or placement claim is made.

Status: synthesized; independent review and live promotion pending.
