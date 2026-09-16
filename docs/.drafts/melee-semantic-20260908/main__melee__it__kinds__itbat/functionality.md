## Home-Run Bat item behavior

This unit implements the Bat item object rather than fighter swing animations. Its five-entry `ItemStateTable` uses state slots 0–4; these indices must not be confused with each entry's motion identifier. Slots 1 and 3 share animation, physics and collision callbacks, but slot 3 has motion identifier 0 while the other slots have -1. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itbat.c#L14-L24)

### Creation and lifecycle

The direct spawn helper mutates the caller's position by clearing z, constructs an `It_Kind_Bat` descriptor, and returns the generic creator's result. Only a non-NULL result receives the local state-0 initializer. Separately, `Spawned` invokes shared setup, assigns velocity `(0, xC_vel, 0)` from special attributes, and enters state 1. The actual numeric value/sign of that attribute is not established here. State-0 initialization resets velocity and landing count before selecting state 0; state-1 initialization selects state 1 and then resets landing count without a local velocity assignment. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itbat.c#L26-L85)

Pickup reveals the child model hierarchy, selects held state 2 and resets landing count. Dropped and Thrown perform identical setup and model-reveal operations, selecting state 3 with `ITEM_ANIM_UPDATE | ITEM_DROP_UPDATE`. EnteredAir selects state 4, not state 1. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itbat.c#L106-L154)

### Per-state processing and exceptional branches

Animation callbacks all return false. States 0, 2 and 4 have inert physics callbacks; held state 2 also has inert collision processing. Slots 1 and 3 share the falling-physics callback, which forwards fall-speed attributes to one helper and the global x68 parameter to another. The latter computes signed spin speed, not air resistance. Its sign depends on facing, horizontal velocity and an item flag. [Bat callbacks](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itbat.c#L64-L170), [spin helper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/it_2725.c#L1063-L1095)

State-0 collision delegates to `it_8026D62C`: loss of floor contact performs leave-ground setup and invokes the state-1 initializer. With floor contact, the helper updates floor metadata and can additionally call `Item_8026ADC0` when `it_80277544(gobj) != 0 && !xDCD_flag.b3`. Thus the wrapper's false result does not prove absence of downstream event processing. [Helper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/itgroundcoll.c#L44-L70)

Shared airborne collision supplies the state-0 initializer to `it_8026E15C`. That helper processes contact flags and invokes the initializer only after its floor/contact checks succeed; not every contact immediately settles the Bat. [Helper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/itgroundcoll.c#L459-L479)

State-4 collision supplies both entry helpers to `it_8026E8C4`. No floor invokes state 1 after leave-ground setup. Supported terrain invokes state 0 only when the x1F/xD5C guard permits it; the helper may first clear xD5C after another collision test. [Helper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/itgroundcoll.c#L750-L778)

### Combat and object references

DamageDealt calls `itColl_BounceOffVictim` only for `msid == 3`; other states skip it. Clanked and HitShield call that helper unconditionally. These wrappers return false. Reflected and ShieldBounced instead propagate their shared helper results. Reflection reverses/scales x/y velocity, reverses facing and copies the half-life timer into the remaining-life timer. Shield bounce mirrors velocity and updates facing/collision facing, with an explicit near-zero-horizontal-speed guard; its helper returns false. [Wrappers](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itbat.c#L172-L203), [shared effects](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/it_2725.c#L418-L456)

EvtUnk forwards both object pointers unchanged to `it_8026B894`. Its exact event trigger and downstream reference lifetime are not established by the rendered callee name. The definition spells the second parameter `HSD_GObj*`, while the header spells it `Item_GObj*`; no incompatible-type claim is made without resolving aliases. [Definition](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itbat.c#L205-L208), [header](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itbat.h#L35-L36)

### Semantic assessment

Retain the supported existing descriptions and names explicitly recorded in the checkpoint ledger. `itBat_Spawn`, `itBat_Held_Coll`, `itBat_Fall_Coll` and the conservative state-0 SetStatus name fit canonical behavior. Replace `itBat_Thrown_Phys` with `itBat_Fall_Phys` because the rendered table otherwise suggests a throw-only role despite use by ordinary airborne state 1. Correct the air-resistance explanation and preserve the exceptional supported-floor branch. The header renderer reports `shadowed_binding` for the spawn declaration, leaving it unsubstituted despite substitution in the C file. No compiled section-size or literal-pool layout is established by this review.

Status: synthesized; independent review and live promotion pending.
