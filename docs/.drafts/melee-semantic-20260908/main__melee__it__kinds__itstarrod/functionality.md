## Physical Star Rod runtime

The owned C file defines the physical rod's attributes, six-state callback table, lifecycle callbacks, ammunition bookkeeping and interface to the separate star-projectile module. The header declares these functions and the table. Both canonical and rendered files were reviewed completely; rendered names were treated as hypotheses rather than independent evidence.

### State dispatch

- **0 — grounded:** setup calls shared item processing, resets velocity and selects state 0. Animation returns false and physics does nothing. Collision maintains floor support through `it_8026D62C`, selecting state 1 when support is lost. The shared helper also contains a supported-floor branch calling `Item_8026ADC0` when its predicate succeeds and `xDCD_flag.b3` is clear; the local false return does not eliminate that side effect.
- **1 — ordinary falling:** entered at spawn and through support-loss recovery. Physics forwards the configured fall-speed and maximum fields to the shared helper. Collision uses `it_8026E15C` with state-0 setup. A floor contact alone does not guarantee transition: the shared helper applies contact response and additional landing predicates before invoking setup.
- **2 — held:** entered on pickup. Animation and physics are inert; its collision slot is null.
- **3 — thrown; 4 — dropped:** explicit lifecycle callbacks establish these identities. Both use the same falling-physics callback and animation callback, but distinct collision functions with identical bodies. Nonzero `xD4C`, including negative values, selects full collision handling and a qualified state-0 transition. Exactly zero selects `it_8026DF34`, which updates collision-derived position/floor information and returns its floor-contact result rather than requesting the grounded transition.
- **5 — entered-air recovery:** animation and physics are inert. Collision supplies state-0 and state-1 setup callbacks to `it_8026E8C4`. No floor selects state 1. Supported terrain selects state 0 only when the shared flag/counter guard permits it; otherwise state 5 can persist.

The callback named `itStarrod_UnkMotion4_Anim` actually serves states 1, 3 and 4. Likewise, `itStarrod_UnkMotion4_Phys` serves both thrown and dropped states. Numeric suffixes must not be interpreted as exclusive registration.

### Ammunition and projectile boundary

Spawn copies `StarRodAttributes.x0` into the per-instance `Item.xD4C`. The offset accessor copies the complete `x4` vector into caller storage. Canonical fighter code transforms that local vector through a joint and uses the resulting position for the firing effect and rod-side emission request.

`it_802923BC` decrements `xD4C` only when positive, then unconditionally calls the companion constructor with owner, position, variant and facing direction. Zero and negative values remain unchanged locally; this helper does not itself suppress construction at exhaustion. The fighter caller separately gates the firing path. The companion constructor creates a distinct `It_Kind_StarRod_Star` object and conditionally initializes it when allocation succeeds. Because accounting occurs before that call and there is no refund path, a failed construction attempt still consumes a positive charge. The projectile has its own lifetime and collision/event behavior, separate from the physical rod.

### Combat events

Damage-dealt, clank and shield-hit callbacks call `itColl_BounceOffVictim` only in states 3 or 4 and always return false. Reflection delegates to the shared routine that reverses/scales X and Y velocity, reverses facing, restores the half-life timer and returns false. Shield bounce instead delegates to velocity mirroring and facing/collision-direction maintenance. `EvtUnk` forwards two object pointers unchanged; its precise event trigger remains unspecified.

### Semantic assessment

Most existing descriptions and inferred names fit canonical behavior and are explicitly retained in the checkpoint ledger. Corrections identify the directly proven thrown/dropped states, expose shared callback registrations, make the shared physics name cover both released states, and include dropped-state callers in the grounded-reset explanation. No compiled section-size or constant-placement claim is made. The literal sixteen-shot capacity remains documentary rather than established by the available article data.

Status: synthesized; independent review and live promotion pending.
