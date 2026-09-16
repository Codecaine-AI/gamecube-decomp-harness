## Pikachu Thunder item lifecycle

This module implements Thunder as linked item segments, with a three-entry `ItemStateTable`. Item motion-state indices **0, 1, 2** are distinct from the table's animation identifiers **-1, 0, 0**. All physics callback slots are null; only state 1 has a collision callback.

### Construction and activation

`it_802B1DF8` builds a shared spawn descriptor with the supplied owner and kind, Z forced to zero, initially zero velocity and damage, and facing -1. Each successful allocation receives its attempt ordinal, owner, cumulative delay, saved velocity, terminal duration `ABS(attrs->x4 / vel->y)`, initial span, unit scale, cleared stop flag, and successor pointer. It returns the **first allocation attempt's result**, not the first successful allocation. A failed allocation clears the loop's `prev`, so linkage does not bridge failures; subsequent attempts still receive incremented delays. Nonpositive count returns NULL. There is no local guard against zero vertical speed or invalid attribute values.

State 0 initializes lifetime timers and hides the model. Its animation callback tests the delay before decrementing: a positive delay reaching zero waits until a later invocation to activate. State-1 entry restores the saved velocity, sets b3, reinitializes lifetime timers, and unhides the model. The timer helper does not configure attacks or hitboxes.

### Collision and terminal phase

State 1 decrements lifetime and reports expiry when the updated timer is nonpositive. Its collision callback treats segment ordinal zero separately: successful terrain contact invokes the offset effect helper, enters state 2, and conditionally notifies the owner. Other segments do not take this terrain-query path; they wait for nonzero x4 and arrival at or below the predecessor-provided x28.y.

`it_802B22B8` enters state 2 with hit preservation, copies x14 into the lifetime timer, sets the current x4, and, when a successor and its Item payload exist, copies the current position into the successor's x28 and sets its x4. This **arms the successor's stopping condition**, rather than activating its descent. Thus x4 is not universally equivalent to being in state 2: a trailer can be armed while still descending. `SetupStop` remains a suitable phase-entry name, without implying an explicit velocity-zero assignment in this function.

State 2 decrements lifetime before doing any scale work. While alive, it computes candidate span x10 = xC + saved vertical velocity. Only a positive candidate causes scale/span updates. Model scale x18 uses the quantized new-span/full-span ratio, with 0.01 substituted only when that computed value is nonpositive. Hitbox 0 instead receives the quantized **new-span/previous-span** multiplier; the shared helper applies it only when the hit capsule is enabled. The old span is replaced afterward. A nonpositive candidate leaves stored span and scale unchanged, and the callback still applies the stored model Y scale. The quantizer is the explicit s32 conversion of `10000*a/b + 1`, divided by 10000; it should not be generalized into an unconditional minimum-scale clamp or an exact mathematical ceiling for every input domain.

### Fighter interface and reference lifetime

The fighter creates and tracks the constructor's returned item. Its self-contact test checks move enablement, item presence, attribute-defined bounds around an adjusted bolt point, and zero x4 before calling the branch-free `it_802B1FC8` wrapper. That wrapper commits state 2. The adjusted point is the item position with Y changed by `-attrs->x8 * x18`; its existing rendered name fits this operation.

Only destruction of ordinal zero with a non-null owner and a false fighter-property predicate issues the destruction notification. The predicate accepts property values 1, 2, and 4 through 13; the setter writes move status 3, which the fighter loops consume to enter ending motion states 362 or 366. These property values, move status, and motion IDs are separate numeric domains. Canonical fighter code spells the status through `specialhi.x4`, while contact tracking uses `speciallw`; this review does not normalize those union-field names.

The reference-removal callback clears the dedicated owner x38 on pointer equality and always delegates generic interaction-reference cleanup. Neither its local body nor that generic helper clears Thunder's successor x34. Consequently this review does not claim that this callback alone guarantees successor-pointer lifetime safety.

Damage-dealt, shield-hit, clank, and absorption callbacks all ignore their argument and return false without local side effects. This does not establish immunity to generic interaction handling.

### Semantic and rendered review

Existing inferred names are retained: Spawn, OnSelfContact, GetPosWithAdjustedY, Destroyed, Init, Delay_Anim, conservative UnkMotion1, Fall_Coll, SetupStop, and RemoveReference fit canonical behavior. Corrections target substantive explanations: timer setup versus attack setup, incremental hitbox versus absolute model scale, successor stop arming versus activation, and unsupported compiled layout detail.

Both owned files were read completely in canonical and rendered form. The rendered C view reports no parse errors. The header reports `it_802B1DF8` as `shadowed_binding`, leaving its declaration unchanged even though the C definition renders as Spawn; this is a renderer issue, not evidence against the name. No compiled artifacts were supplied, so `.sdata`/`.sdata2` contents and allocation claims remain unresolved, and the table's type proposal avoids a compiled section or byte-size claim.

Status: synthesized; independent review and live promotion pending.
