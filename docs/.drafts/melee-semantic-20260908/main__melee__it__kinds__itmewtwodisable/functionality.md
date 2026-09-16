## Mewtwo Disable item

The unit implements the projectile created by Mewtwo's down special. Its header declares the lifecycle functions and state table consistently with the implementation.

### Construction and ownership
The spawner builds an `It_Kind_Mewtwo_Disable` request, copies the supplied emission position into `prev_pos`, obtains `pos` separately through `it_8026BB68`, sets both parent references to the fighter, and initializes request velocity and damage to zero. Creation failure returns NULL without accessing an Item. Success captures `item->owner` in the separate Disable-specific retained-owner field, initializes motion and lifetime, invokes additional item/debug setup, and sets `xDCC_flag.b3`.

The fighter caller computes the supplied emission point from `FtPart_L3rdNb` and Disable offsets, stores the nullable return in `x222C_disableGObj`, and consumes the emission command. Fighter animation completion, damage, and death paths remove a retained projectile. Item destruction conditionally clears the fighter registration and always clears its retained owner. Reference removal clears that owner only on pointer equality, then unconditionally delegates generic reference cleanup; consequently later destruction skips fighter cleanup after the retained owner has been removed.

### Setup and state 0
Horizontal velocity is `attrs->x_vel * item->facing_dir * ftLib_80086A0C(owner)`; Y/Z velocity is zero. The initializer installs the attribute lifetime and calls the state-entry helper. That helper requests numeric state 0 with `ITEM_ANIM_UPDATE`, then passes the owner-derived scale to `it_802755C0`.

Importantly, canonical `it_802755C0` multiplies the scale of each non-disabled hitcapsule among four slots. This is not model or visual scaling, nor assignment of the item's overall scale. Several baseline explanations require correction on this point.

The sole table entry installs a lifetime-ticking animation callback, an empty local physics callback, and environmental collision processing. Empty local physics does not imply absence of engine-level movement. Collision runs shared processing, then ORs wall and ceiling reports. The wall helper returns 8 for left-wall contact or 4 for right-wall contact, with right-wall precedence if both are present; the ceiling helper contributes 2. These helpers also update the contact index, with ceiling processing last. The callback therefore preserves an integer collision result rather than merely a Boolean.

### Combat and rendering review
Damage-dealt, clank, shield-hit, absorbed, and shield-bounced callbacks ignore their argument and return true. Reflection instead forwards the item to `it_80273030` and propagates its result. The reviewed local bodies do not establish dispatcher-side termination semantics or reachability of every interaction hook.

The rendered `Spawned` and `RemoveReference` hypotheses fit the canonical successful-construction and reference-removal behavior independently of their substitutions. Existing supported names and explanations are retained. Both rendered files were read completely; neither reported parse errors. The header reports a `shadowed_binding` for the unchanged multiline spawn declaration, without loss of readable source.

No compiled artifact was supplied. Source zero literals do not establish `.sdata2` pooling, section size, or padding.

Status: synthesized; independent review and live promotion pending.
