## Regular Egg implementation

`itegg.c` implements `It_Kind_Egg`, with a seven-entry state table and public lifecycle declarations in `itegg.h`. This is the regular container Egg, not Birdo's distinct `It_Kind_Kyasarin_Egg`.

### Creation and ownership

`it_80288C88` returns NULL when its parent is absent or allocation fails. It copies the supplied position while forcing its depth to zero, copies velocity and facing, records the emitting item as the secondary parent and that item's owner as the primary parent, and constructs an Egg. Successful creation clears `xDD0_flag.b6`, zeroes `xD40`, invokes `it_80279BBC`, and conditionally invokes `it_802756E0` when `b7` is clear. The independently inspected Lucky emission routine supplies joint-derived position and generated velocity and selects this factory on its regular-Egg branch.

### States and transitions

- **0:** Grounded setup resets velocity. Animation returns false and physics is empty. Collision delegates support checking; loss of support invokes state-1 entry. The shared collision helper also contains separate supported-floor handling.
- **1:** Initial falling state, selected at spawn and on loss of support. Physics forwards configured fall-speed attributes. Collision processes terrain and enters state 0 only after the shared landing guards succeed.
- **2:** Held state, selected by pickup. Animation returns false, physics is empty, and the collision slot is NULL.
- **3:** Released state, selected by throwing and by dropping through delegation to the thrown callback. Numeric mask 6 is independently confirmed as `ITEM_ANIM_UPDATE | ITEM_DROP_UPDATE`. Physics delegates to `Item_ApplyFallingPhysics`; detected terrain contact invokes the shared Egg break resolver.
- **4:** Selected by `EnteredAir`, distinct from states 1 and 3. Animation and physics are inert. Collision selects state 1 immediately when support is absent, or conditionally selects state 0 after supported-terrain processing.
- **5:** Alternate terminal break state, using animation identifier 1. Setup calls shared item helpers, clears planar velocity, sets the resolution guard and generic flags, stores 20 in the Egg-local field, and initializes a separate shared lifetime. Its animation callback decrements `xD44_lifeTimer` through `it_802751D8`; the local 20 is not that completion timer.
- **6:** Ordinary opened-remnant state. Setup hides the model, clears planar velocity, sets the resolution guard, and initializes the Egg-local counter to 40. Animation decrements that counter before testing whether it is nonpositive. Physics is empty and collision returns false. The common item dispatcher destroys an item when its animation callback returns true.

The callback named `itEgg_UnkMotion3_Anim` is shared by states **1 and 3**; its numeric suffix does not establish exclusive ownership by state 3.

### Break resolution and exceptional paths

Damage dealt, clanking, shield contact, reflection, damage received, and thrown terrain impact converge on `itEgg_Logic3_DmgDealt`. Its `egg.x0` guard suppresses repeated resolution, and every path returns false rather than directly requesting destruction.

The outcome helper returns true only when the configured random sample is zero, selecting state 5 without running the ordinary release calls. Otherwise it first invokes `it_8026F8B4`, an active mode/random-gated spawn helper that may overwrite the supplied zero vector. A true result skips fallback generation. A false result leads to `it_8026F3D4(gobj, 0, attrs->x0, 0)`: `attrs->x0` is passed as a generation count, not an item-kind identifier. That helper selects random kinds and can encounter invalid selections, restrictions, or allocation failures. The Egg ignores its return value and still follows ordinary opening: effect 1232, sound arguments `(244, 127, 64)`, and state 6. Thus ordinary opening does not prove that an item was successfully released.

`EvtUnk` forwards both object pointers unchanged to `it_8026B894`; its exact triggering event remains unspecified here.

### Semantic review

Existing inferred function names generally fit canonical behavior and are retained. Corrections address the shared animation callback's known roles, the distinction between void-returning and non-returning functions, the actual content-generation flow, and the separate state-5 lifetime. Six Birdo-Egg links are rejected as cross-family misattributions. Compiled section extent, pooling, and alignment claims remain unresolved rather than being inferred from source literals. The rendered header suppresses the proposed factory name as `shadowed_binding`; this is a renderer issue, not evidence against the supported spawn interpretation.

Status: synthesized; independent review and live promotion pending.
