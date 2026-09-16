# itlucky semantic sweep — reconciled functionality

## Scope and evidence
Inherited research establishes canonical/rendered coverage of `itlucky.c` and `itlucky.h`, including all baseline subjects and links. This lead repair independently checked the proposed changes and contradiction evidence using restored canonical reads; it is not a new independent audit of every retained row. Supported inherited facts and links remain unchanged. Rendered names remain hypotheses, not identity evidence.

## Separate callback tables
`it_803F8190` has seven entries. The canonical registry explicitly labels its entry Lucky (Chansey) and references `it_802D5050`, `it_802D5648`, and `it_802D56F0`. That evidence does not establish the named move Softboiled or every bundled gameplay claim.

`it_803F8200` has five entries. This document does not identify it as an egg-side table: registration connecting it and the Logic44 callbacks to `It_Kind_Lucky_Egg` remains deferred. The local constructor's explicit kind assignment is separate evidence and does not itself bind the neighboring table to that kind.

## Phase progression and emission
Initialization sets phase 2 and a randomized repetition counter before initial-state setup. Animation-query-gated progression advances 2→3, decrements the counter in phase 3, selects phase 4 when the counter reaches zero, and returns true in phase 4. The counter is not a demonstrated per-frame duration. Other phase values follow the source's default path without that decrement or terminal result.

Phase entry selects the current phase, clears the command latch, and restores effect-hitlag and accessory callbacks after common state change clears transient callbacks. The accessory attempts emission when the command latch is nonzero and consumes the latch regardless of construction success. Launch position comes from bone slot 32; horizontal velocity is randomized, vertical velocity is attribute-derived, and Z is zeroed. A cached condition gates the random branch selecting between two constructors. Only a non-NULL construction result triggers the success follow-up. The alternate constructor's regular-Egg identity, random-distribution guarantees, audio meanings, script producer, and exactly-once scheduling remain deferred.

`it_802D5710` returns NULL for a NULL input object. Otherwise it constructs an `It_Kind_Lucky_Egg` request with supplied position, velocity and facing, preserves the input object's owner as one parent reference and the input object as the immediate-parent reference, and forwards the construction result. This establishes descriptor flow, not complete gameplay identity or lifetime registration.

## State callbacks and shared helpers
In `it_803F8190`, entries 1 and 5 share animation, physics and collision callbacks; entries 2–4 share another tuple. Entry 6 has no state collision callback. The threshold handler conditionally selects state 6 and always returns false. This does not independently establish KO semantics, the exact numeric event identifier, or engine-wide non-collision.

In `it_803F8200`, entries 1 and 3 share `itLucky_UnkMotion3_Anim`, `itLucky_UnkMotion3_Phys`, and `itLucky_UnkMotion3_Coll`. The physics callback obtains `xCC_item_attr` and forwards the unchanged object with `x10_fall_speed` and `x14_fall_speed_max` to `it_80272860`. That helper conditionally subtracts its acceleration argument according to velocity direction and magnitude; it does not clamp velocity to an exact terminal speed.

The shared lifetime predicate subtracts 1.0 from `xD44_lifeTimer`, then returns whether it is nonpositive. Entries 0, 1, 3 and 4 use it directly or through wrappers. Entry 2's animation callback returns false, its physics callback is empty, and its collision slot is NULL. This is callback-level inactivity, not absence of common engine processing. The named Spawned hook initializes timers and always requests state 1; the named PickedUp, Dropped and EnteredAir hooks request states 2, 3 and 4 respectively. Their event/kind bindings remain deferred. Expiration is a callback result, not a separately demonstrated expiry state.

State-0 collision delegates to `it_8026D62C`, whose failed floor test invokes the supplied state-1 transition. Its supported-contact branch can additionally call `Item_8026ADC0`; unconditional state retention is therefore not established. The shared entries-1/3 collision callback supplies the velocity-resetting state-0 transition to `it_8026E15C`, which has multiple additional gates. Entry 4 supplies both state-0 and state-1 transitions to another helper, so state-1 entry origins are not limited to initialization and state-0 collision.

The common animation dispatcher calls destruction on a gated true animation result. Common physics dispatch accepts NULL callbacks and performs additional movement processing. These observations narrow prior gaps but do not prove exactly-once invocation, all state-specific runtime conditions, or engine-wide inactivity.

Both two-object wrappers forward their arguments to `it_8026B894`, which clears matching interaction references. That establishes cleanup behavior, not the precise event provenance. The timer initializer writes the life timer and a scaled half-life timer; it does not resolve the separate TODO-marked `M2C_FIELD(attr, s32*, 4)` assignment.

## Naming, layout and accepted deferrals
The renderer reports colliding state-0 callback candidates across the tables, a proposed `itLucky_UnkMotion2_Anim` collision with a distinct existing canonical function, and parse uncertainty around the spawn configuration assignment. No new names are proposed. Distinct table-qualified terminology avoids unsupported ownership assertions.

All inherited compound gameplay, registration, compiled layout/ABI, naming, helper-predicate and scheduling deferrals remain explicit and accepted. In particular, no compiled section extent, entry stride, contiguity, literal-pool storage, padding, attribute layout or register-parameter mapping is established by this C-source review. Chansey registry, cleanup, timer, acceleration and common dispatch evidence resolve narrower observations without validating the complete deferred compound claims.

Status: synthesized; independent review and live promotion pending.
