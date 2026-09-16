## Poison Mushroom movement and lifecycle

The unit defines two motion-state callback triples. State index **0** implements grounded sliding; index **1** implements airborne movement. Both table entries use animation identifier **0**, so animation identifiers must not be confused with motion-state indices.

Spawn selects facing -1 for positive world X and +1 otherwise, clears `xD5C` and the stored Kinoko speed, initializes the surface vector to `(0,1,0)`, and enters state 1 with `ITEM_ANIM_UPDATE`. The separate entered-air helper selects the same state with `ITEM_UNK_0x1 | ITEM_HIT_PRESERVE`.

Ground physics refreshes stored speed from `KinokoAttrs.x0 * facing_dir` and multiplies it by the cached surface normal's Y component for horizontal velocity. Ground collision runs common collision processing before testing whether the item remains non-airborne. Floor contact refreshes the surface vector; absent floor contact clears only its X component. Either wall mask triggers one reversal of facing and stored speed, followed by horizontal-velocity recomputation.

Air physics forwards fall-speed and terminal-speed attributes to the common helper, then applies the special horizontal drag value. The threshold is strictly `abs(vx) < drag`; otherwise positive velocity is decremented, followed by a separate negative-velocity test. Describing this as deceleration assumes a nonnegative configured drag value. No attribute-range validation occurs here.

Air collision supplies the grounded setup callback to common collision processing. Ground setup restores horizontal velocity from the persistent stored speed—not from the airborne-damped velocity—zeros Y/Z velocity, invokes shared setup and the `0x107` event call, and selects state 0 with preservation flags. The collision callback then refreshes the normal only when non-airborne with floor contact.

Both animation callbacks and both collision callbacks return false. The damage-dealt callback simply returns true; it does not locally implement shrinking or another effect. The interaction callback forwards both objects to `it_8026B894`, discarding its result. That helper clears matching interaction references and resets source-player index to 6 when clearing the fighter reference.

The rendered Ground/Fall/EnteredAir and ClearGObjReferences names fit canonical behavior as descriptive hypotheses. No equivalent wording changes are proposed. The header and implementation preserve different spellings for the cleanup callback's second pointer type (`Item_GObj*` versus `HSD_GObj*`); this review does not infer an ABI defect from that alone. Source literals establish their gameplay uses, but do not establish compiled `.sdata2` composition or placement.

Status: synthesized; independent review and live promotion pending.
