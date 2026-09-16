## Detached Hammer Head lifecycle

This unit creates and manages the independent `It_Kind_Hammer_Head`. The Hammer caller supplies its owner, a head-joint position, and a normalized joint-derived launch direction; the parent argument must not be interpreted as necessarily carrying an Item payload. The constructor records the supplied position as `prev_pos` with Z cleared, obtains the actual spawn position through a shared helper, initializes the descriptor, and requests creation. Only a non-null result receives state-0 initialization and final launch velocity: X is scaled by `initial_velocity` and facing, while Y is scaled and receives a `0.5f` offset. [Constructor](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/ithammerhead.c#L44-L90), [Hammer caller](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/ithammer.c#L79-L112).

### State dispatch

The four table indices are distinct from their motion identifiers:

| Index | Entry path | Motion identifier | Behavior |
|---|---|---|---|
| 0 | Initial activation | -1 | Shared free-item lifetime, falling physics, and terrain collision |
| 1 | Pickup | -1 | False-returning animation, empty physics, no collision callback |
| 2 | Drop or throw | 0 | Same callbacks as index 0 |
| 3 | Landing callback chain | -1 | Lifetime countdown, empty physics, support monitoring |

Initial activation and throwing conditionally perform airborne preparation, then common setup. Drop delegates to throw. Landing clears X and Y velocity and selects index 3 with literal flag `1`; this is `ITEM_UNK_0x1`, **not** `ITEM_ANIM_UPDATE`, whose value is `2`. [Table and transitions](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/ithammerhead.c#L17-L169), [flag definitions](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/forward.h#L60-L70).

### Lifetime and shared behavior

Spawned and pickup callbacks initialize `xD44_lifeTimer` from special attribute `x4`; the shared helper also sets `xD48_halfLifeTimer` to that value multiplied by the global `x4C_float`. Pickup therefore refreshes the stored timers before entering the passive held state. Free and resting animation callbacks decrement the remaining timer first, return true immediately at a nonpositive result, and otherwise invoke `it_802728C8` whenever the updated timer is at or below global `x34`. Held callbacks do not advance this countdown. Reflection negates and scales X/Y velocity by `xC70`, reverses facing, and replaces remaining lifetime with the stored half-life timer; replacement need not increase the timer. [Local lifetime callbacks](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/ithammerhead.c#L75-L184), [timer initialization](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/it_2725.c#L1414-L1421), [reflection](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/it_2725.c#L418-L428).

Airborne collision delegates to `it_8026E15C`; the landing callback is gated by the shared collision tests, not invoked on every contact. Grounded collision delegates to `it_8026D62C`, which copies collision position, records valid floor information, and converts to air before invoking the thrown callback when support fails. Its supported-floor path also has a conditional call to `Item_8026ADC0`, so the wrapper's false return is not a guarantee against all shared-engine effects. [Airborne helper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/itgroundcoll.c#L459-L479), [grounded helper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/itgroundcoll.c#L44-L70).

Damage-dealt, clank, shield-hit, and damage-received hooks are side-effect-free false returns. Reflection delegates and then returns false. `EvtUnk` forwards both arguments unchanged; its precise trigger is not established by the local wrapper. [Event hooks](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/ithammerhead.c#L194-L223).

### Semantic review

The existing Spawn, Held, Fall, Grounded_Coll, and EnterResting names fit canonical behavior and remain useful hypotheses. Rendered external helper names were not treated as independent proof. Corrections address the resting-entry flag, pickup's delegated timer writes, shared initial/released lifetime processing, and the constructor's parent-object description. Source table structure is confirmed, but compiled table byte layout and `.sdata2` allocation remain unverified.

Status: synthesized; independent review and live promotion pending.
