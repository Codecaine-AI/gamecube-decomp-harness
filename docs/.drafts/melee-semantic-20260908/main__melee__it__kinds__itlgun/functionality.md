## Ray Gun controller

`itlgun.c` implements the physical Ray Gun item, separately from its `itlgunray` projectile. The header exposes lifecycle/event callbacks, the state table, offset retrieval, ray emission, and timed shooting-state entry. Both owned canonical and rendered files were read completely; the renderer reported no parsing issues. The rendered names were checked against canonical behavior rather than used as evidence.

### State machine

The six table indices are distinct from their animation selectors, which are `-1, -1, -1, 0, +1, -1` respectively.

- **0 — resting/grounded:** entry resets velocity, calls shared setup, and selects state 0. Animation returns false and physics is empty. Collision delegates support checking with the state-1 entry callback. The shared helper updates position/floor metadata, invokes the falling transition when support fails, and has an additional guarded supported-floor helper call; the wrapper's false return does not imply the helper has no other effects.
- **1 — ordinary falling:** selected at spawn and through collision recovery. Physics forwards the common fall-speed and maximum-fall-speed attributes. Animation and collision callbacks are shared with state 4.
- **2 — held:** selected on pickup and after the timed state expires. Animation returns false, physics is empty, and the collision slot is NULL.
- **3 — timed shooting/recovery:** entry writes 40 to the item-local timer. Animation decrements first, then selects state 2 when the result is zero or negative; it always returns false. Physics is empty and collision is NULL. Fighter-side grounded and aerial shooting entries initialize this state for both loaded and empty attempts. This timer is not itself a projectile lifetime or a proven firing-rate limit.
- **4 — dropped/thrown:** both lifecycle callbacks select state 4 with mask 6, canonically `ITEM_ANIM_UPDATE | ITEM_DROP_UPDATE`. Physics calls `Item_ApplyFallingPhysics`.
- **5 — EnteredAir event state:** animation and physics are inert. Collision supplies resting and ordinary falling destinations to `it_8026E8C4`. No floor causes the falling transition; supported terrain causes the resting transition only when the helper's contact guard permits it. State 5 is not interchangeable with state 1.

The shared state-1/state-4 collision callback tests **`xD4C != 0`**, not positivity. Nonzero values, including negative values if supplied, take `it_8026E15C` with the resting callback and return false. That helper invokes the resting callback only after its contact and landing guards pass. Exactly zero takes `it_8026DF34` and propagates its floor-test result. The existing rendered name `ThrownOrDropped_Coll` obscures state-1 use; an ammunition-dependent collision name better expresses the shared behavior.

### Ammunition, firing, and cross-file lifetime

Spawn loads `ItLGunAttr.max_ammo` into `Item.xD4C`, clears the timer, and enters state 1. The source does not establish a literal maximum of 16.

`it_8028E774` copies all three components of the configured position offset into caller-owned storage. The fighter accessory callback transforms that vector, checks its firing flag and item predicate, and invokes `it_8028E79C` only on the firing branch; the alternate branch uses empty-gun effects and sound.

`it_8028E79C` decrements ammunition only when positive, but calls the ray constructor regardless of the count. It forwards the gun's owner, supplied position, and facing direction. The companion constructor creates a separate item, initializes its horizontal launch and attribute-backed lifetime, and guards initialization against allocation failure. Because ammunition is decremented before that void constructor call, a failed allocation has no refund or failure result in this path. The fighter then continues its firing-effect path. The gun's timer and ammunition therefore remain separate from the created projectile's lifetime and reflection state.

### Interaction callbacks and naming assessment

Damage-dealt, clanked, and shield-hit callbacks call the **void** victim-bounce helper and independently return false. Reflection and shield-bounce callbacks instead propagate their respective helper results. Gun-body reflection is separate from the ray's reflection implementation. `EvtUnk` remains a two-object forwarding adapter; this wrapper alone does not establish its triggering event.

Supported names and explanations are explicitly retained in the checkpoint ledger, including Held, EnteredAir, EnterResting, GetShootPositionOffset, SpawnRay, and EnterShootState. `Thrown_Phys` remains an acceptable conventional label because its explanation already preserves dropped use. Two naming changes are proposed: identify the shared collision callback by its ammunition-dependent behavior, and replace `EnterUnkMotion1` with `EnterFalling` while preserving the numeric state distinction.

### Review outcome

All 172 baseline facts and 52 links are accounted for: **160 facts retained, 8 superseded, 4 unresolved; all 52 links retained individually**. No parameter subjects had baseline facts. The unresolved facts concern three compiled `.sdata2` claims and the literal 16-shot configuration. No compiled section size, placement, constant-pool contents, or opcode equivalence is asserted from source alone.

Status: synthesized; independent review and live promotion pending.
