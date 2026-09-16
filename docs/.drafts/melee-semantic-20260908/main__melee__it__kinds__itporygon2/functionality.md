## Porygon2 runtime

The unit defines two ItemStateTable entries, numbered 0 and 1, and their animation, physics and collision callbacks. Spawn forwards the item's scale to shared setup, calls Item_8026AE84 with 0x273E/0x7F/0x40, and enters state 0. Both state-entry helpers request ITEM_ANIM_UPDATE and install effect-hitlag callbacks; entry to state 1 additionally calls Item_8026AE84 with 0x273F/0x7F/0x40.

State 0's animation callback enters state 1 when it_80272C6C returns false, then still processes dynamic bone 1 and returns false. State 1 instead returns true immediately when that predicate fails, skipping bone processing. Both physics callbacks delegate to it_8027A344. Only state 0 delegates environmental collision processing; state 1's collision callback is a side-effect-free false return. These distinctions are explicit in [the canonical runtime](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itporygon2.c#L10-L87).

The shared movement producer scales bone translation, zeroes components whose magnitude is below 0.001, subtracts cached translation into pokemon_spawn.x4, updates the cache, and resets the bone translation. A null bone leaves those stored vectors unchanged. Physics consumes stored displacement as velocity X = displacement Z × facing direction and velocity Y = displacement Y; it does not refresh velocity Z. Consequently, stored displacement is not unconditionally a fresh sample. See [shared movement implementation](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/it_279C.c#L1145-L1200).

The final wrapper forwards two objects to reference cleanup and discards its Boolean result. The helper independently clears matching owner, reflector, absorber, fighter, unknown-fighter and toucher pointers; clearing the fighter pointer also sets source-player metadata to 6. The surrounding traversal caches the owner before invoking the callback and can separately remove an item afterward. This wrapper therefore performs reference invalidation, not direct attack termination. See [wrapper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itporygon2.c#L89-L92) and [cross-file lifetime handling](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/it_26B1.c#L475-L525).

## Semantic review

Existing lifecycle, gameplay-context and callback explanations are retained except for three corrections. The state-1 entry helper's derived Item is used for both hitlag setup and the final ID-based call, not solely for hitlag setup. Rendered Tackle_Coll and Tackle_Phys obscure that they belong to different numeric states; numeric names avoid implying a single proven Tackle state. Other existing inferred names remain useful hypotheses rather than recovered original identifiers. The header declarations agree with the implementation. No compiled section size or layout is inferred from the .data subject.

Status: synthesized; independent review and live promotion pending.
