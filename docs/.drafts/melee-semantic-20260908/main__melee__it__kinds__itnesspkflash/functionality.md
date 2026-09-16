## PK Flash orb implementation

This unit implements the traveling PK Flash orb shared by Ness and copied-Ness Kirby, rather than the separate explosion article. Its three-entry `ItemStateTable` associates numeric states 0, 1 and 2 with animation, physics and collision callbacks.

### Creation and ownership

`it_802AA8C0` builds a spawn record with the supplied kind and facing, copies the supplied position into `prev_pos` while clearing its Z component, and obtains `spawn.pos` through a separate helper. It initializes command variables and private state only when creation succeeds, retains the originating fighter in `xDE0_PKFlash_Owner`, and calls `it_802AAA80`. That initializer selects state 0, initializes lifetime and charge/reflection fields, computes facing-dependent planar launch velocity using sine/cosine, and initializes collision-debug display state.

Ness and Kirby callers retain the returned item and install interruption callbacks only on successful creation. Their animation callbacks compare `it_802AA7E4`'s current-owner result with the fighter and clear stale handles on mismatch. `it_802AA7F0` tests exactly `msid == 2`; it does not detect all terminal states or normal detonation.

Destruction resets hitboxes and clears x13. Fighter notification requires a non-null retained owner equal to the current owner and dispatches only for the two recognized PK Flash kinds. The retained owner is discarded even after an ownership mismatch. `it_802AAA50` instead performs null-tolerant detachment: it clears both owner pointers and x13 without destroying the item. Ness's caller then clears its reciprocal item handle and interruption callbacks.

### Numeric state behavior

- **State 0 — charging flight:** animation restarts state 0 when its animation helper reports completion. With the reflection latch clear, charge increases by one and saturates at the configured cap. A matching retained owner can trigger state 1 through the Ness/Kirby hold predicate; lifetime expiry independently selects state 1. Both paths initialize the delay and clear the elapsed command counter. Scaling interpolates uniformly from stored charge and graphic-size attributes.
- **State-0 physics:** horizontal steering requires the reflection/ownership/hold guards and `ABS(stick_x) > 0.2f`. X velocity is clamped only inside that input branch. Gravity, downward-speed clamping and Z clearing run unconditionally.
- **State-0 collision:** after common collision processing, positive Y selects ceiling flags and non-positive Y selects floor flags; positive X selects left-wall flags and non-positive X selects right-wall flags. Either qualifying axis selects state 2, initializes its delay and invokes collision-feedback helpers. Zero velocity is therefore not excluded from contact detection.
- **State 1 — guarded delayed handoff:** each animation call increments the elapsed counter. The early-return branch requires an unset reflection latch, a non-null retained owner equal to the current owner, and a counter at least `((s32) FLASH_EXPLOSION_DELAY) - 2`. Recognized kinds call the corresponding explosion constructor with owner, orb, position, facing and stored charge. The constructor result is not checked. The branch returns true even for an unsupported kind whose switch default makes no constructor call. Otherwise it reapplies scale and returns the lifetime helper's result.
- **State 2 — non-exploding timeout:** animation only reapplies scale and returns lifetime expiry. The lifetime helper decrements first and returns true for a resulting timer less than or equal to zero, not only exactly zero.
- States 1 and 2 reset velocity in physics and have inert, false-returning collision callbacks.

### Interactions and exceptional paths

Reflection sets `xDDC_PKFlash` to one, reverses facing and XY velocity, updates model Y rotation, clears Z velocity and returns false without changing motion. Its latch suppresses further charge accumulation, owner release/steering and normal explosion creation, but does not suppress common gravity, scaling, lifetime or state-0 terrain processing. Clank and absorption callbacks ignore their argument and return true without local side effects. The miscellaneous event callback forwards both arguments unchanged to `it_8026B894`.

The state-0 animation and physics switches leave the local `holding` variable uninitialized for unsupported kinds. The shown fighter callers supply the recognized Ness/Kirby variants; no defined fallback behavior should be inferred for other kinds. The scale formula also has no local guard against a zero charge-cap denominator.

### Semantic and rendered-name assessment

Existing `GetOwner`, `Spawn`, `CheckTravelCollision`, `Charge_Anim`, `Charge_Phys` and destruction names fit canonical behavior and are retained. `Logic102_Spawned` remains a plausible post-creation semantic name, not evidence of an original symbol or engine callback registration. Numeric later-state names are not rewritten merely for stylistic consistency.

Both canonical and rendered owned files were read completely. The C rendering reports no parse errors. The header reports `shadowed_binding` for `it_802AA7E4` and `it_802AA8C0`, leaving those declarations unrenamed despite substitutions in C; this is a rendering issue, not a behavioral contradiction. Rendered external helper names were not used as self-proving evidence.

Source establishes the state table and arithmetic, but does not establish compiled section extents, literal-pool membership or assertion-string placement. Those baseline claims remain explicitly unresolved.

Status: synthesized; independent review and live promotion pending.
