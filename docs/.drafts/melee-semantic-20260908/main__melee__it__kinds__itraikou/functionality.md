## Raikou summoned-item lifecycle

The unit defines a two-entry `ItemStateTable`, spawn and reference-invalidation hooks, state-entry helpers, and animation, physics, collision, and accessory callbacks. The central Pokémon registry associates the table and hooks with Raikou. The header declares the corresponding interface.

### Appearance and landing

Spawn clears command variables 0, 1, and 2, performs shared Pokémon setup using special attribute `x0`, and enters airborne state **index 1**. That entry's animation selector is **-1**, not 1. Its animation callback delegates appearance scaling and always returns false. Its physics callback delegates falling and appearance-timer processing, ignoring the helper's completion result. The shared physics helper tests timer expiration before decrementing; crossing zero therefore does not restore final scale until a subsequent call.

State-1 collision forwards the landing response to shared terrain processing. The shared wrapper returns false after terrain handling. The landing response requests `QuakeKind_Large`, plays sound 9, resets velocity, and initializes state **index 0**, whose animation selector is **0**.

### Active state and effect lifetime

State-0 entry enables animation updates, installs effect-hitlag callbacks and `it_802CFAFC` as the accessory callback, and initializes the recurring-sound timer from Pokémon attributes. Entry does not itself spawn the effect.

The accessory consumes nonzero command variable 0, clears it, enables variable 2, spawns effect `0x46D` with the item, root JObj, and the address of a local `f32` initialized to `1.0f`, then plays sound `0x2745`. This is one activation per consumed command, not necessarily one activation for the entire state. The source does not establish whether the effect API copies that scalar or retains any reference to it.

The animation callback first handles command variable 1: it clears variables 1 and 2 and destroys attached effects. It then returns true if the shared animation check returns false. Otherwise, variable 2 gates a predecremented timer; only an exactly-zero result triggers a random sound from `0x2746`–`0x2748` and reloads the interval. No positive-interval validation appears locally, so zero or negative starting values must not be described as immediately triggering playback.

Active physics applies configured falling behavior only for `GA_Air`. Collision selects an airborne helper for `GA_Air` and a different helper for every other value, supplying the same no-op response in both cases and always returning false.

### Object lifetime and semantic review

The event hook delegates matching ownership/interaction-reference cleanup to `it_8026B894`, discarding its owner-match result. The shared routine also resets source-player metadata to 6 when clearing the matching fighter reference. This is object-lifetime housekeeping, not Spark damage processing.

The rendered Spark/Attack and Spawn/Appear labels fit the respective active and appearance roles. Their mixed terminology does not justify cosmetic renaming; exact historical identifiers remain inferred. The baseline Spark mechanics mapping is retained without treating rendered names as independent proof. The no-op purpose and landing preparation explanations warrant clarification, as does the accessory's pointer argument. No compiled section placement or extent is established by this source review.

Status: synthesized; independent review and live promotion pending.
