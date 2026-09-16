## RabbitC / Bunny Hood item implementation

This unit implements the item object's lifecycle and model presentation, not the fighter-stat bonuses granted while wearing the Bunny Hood. The header exposes the lifecycle callbacks, constructor, model utilities and state table.

### Construction and states

`it_80294DC0` constructs an `It_Kind_RabbitC` spawn descriptor using the supplied position, NULL parent argument and `-1.0f`. Creation failure returns NULL without local post-creation setup. Success calls `it_80295138`, which clears all three velocity components, invokes shared setup and selects state 0. This is distinct from `itRabbitC_Logic31_Spawned`, which calls `it_802951C0` and selects state 1.

The five-entry table has animation ID `-1` in every entry:

- **0 — resting:** constant-false animation callback, empty physics callback and support-loss collision dispatch toward state 1.
- **1 — falling/dropped:** constant-false animation callback shared with state 3, attribute-driven falling physics and guarded landing dispatch to the state-0 initializer.
- **2 — held:** selected by pickup; constant-false animation callback and NULL physics/collision callbacks. Pickup hides model subtree 3.
- **3 — numeric identity retained:** falling physics and a collision callback returning the Boolean condition from `it_8026DA08`. No handler in this unit directly selects it; a narrower lifecycle name is not established.
- **4 — entered-air:** selected by the EnteredAir event; inert animation and physics callbacks, with collision dispatch to state 1 when floor support is absent or to state 0 when the supported-contact guard permits.

The common state changer's `anim_id == -1` branch removes JObj animation and sets the script pointer to NULL, then installs the selected callbacks. Thus `ITEM_ANIM_UPDATE` arguments here do not imply that animation or script data is reloaded. Dropping selects state 1 with literal mask 6 and reveals subtree 3; the mask is not normalized into unsupported flag meanings.

### Collision and lifetime boundaries

State-0 collision updates position and floor metadata. Loss of support performs leave-ground setup before invoking the state-1 callback. Its supported branch also conditionally calls `Item_8026ADC0`; the wrapper's false result is not a guarantee of object survival.

State-1 landing is conditional on the common terrain result and additional checks, not every contact. State-4 collision immediately takes the no-floor path, but supported contact can remain in state 4 when the common guard prevents the state-0 callback. State-3's helper refreshes collision data, copies position and conditionally records the floor index before returning its condition.

The shield callback directly forwards to `itColl_BounceOffShield`, whose canonical implementation mirrors velocity, updates facing under its guard and returns false. The two-object EvtUnk callback forwards its arguments unchanged; its visible trigger is not established by the local wrapper. Shared item updates contain lifetime handling outside these otherwise inert animation callbacks, and fighter-side equipment setup can consume a newly supplied item when an equipped reference already exists.

### Model presentation

`it_80294E78` uniformly sets bone 1's scale. Fighter equipment setup and later scale refresh supply wearer-dependent values. `it_80294EB0` adds independent translation deltas to joints 8 and 4, in that order; these are cumulative local model adjustments, not world-position updates. The translation inlines assert their arguments and mark matrices dirty unless the independent-SRT flag prevents it. `it_802950D4` reveals subtree 3 for true and hides it for false. Anatomical identities for these indices remain unspecified.

### Semantic and rendered review

Existing Spawn, SetScale, OffsetModelJoints, SetModelPartVisible, EnterResting, Fall, Wait_Coll, Fall_Coll, Fall_Phys, Held_Anim and EnteredAir_Anim hypotheses fit canonical behavior and are retained. No equivalent-wording renames are proposed. The header leaves `it_80294DC0` unchanged with renderer status `shadowed_binding`, despite substituting its Spawn hypothesis in the C file; this is a rendering discrepancy, not evidence against the name.

The completed ledger retains 134 facts and all 46 links, supersedes four explanations, and marks five compiled-pool assertions unresolved. Source literals and assertion-bearing inlines do not establish compiled section sizes, ordering or placement.

Status: synthesized; independent review and live promotion pending.
