## Spy Cloak world-item logic

This unit implements the physical Spy Cloak/Cloaking Device item's lifecycle and a five-entry `ItemStateTable`, rather than locally applying a fighter transformation. The header exposes the lifecycle callbacks and table; the C file defines the state callbacks and entry helpers.

### State selection and processing

| Index | Entry and behavior |
|---|---|
| 0 | Resting entry clears all three `x40_vel` components, calls `it_8026B390`, then selects state 0 with `ITEM_ANIM_UPDATE`. Animation returns false and physics is empty. Collision delegates support maintenance with the state-1 entry callback, then calls floor alignment and returns false. |
| 1 | Spawn selects this state through `it_80295D04`; dropping selects it directly with literal flags `6`. Physics forwards the item's fall-speed attributes to `it_80272860`. Collision supplies the resting entry to `it_8026E15C` and always returns false. |
| 2 | Pickup selects this state with `ITEM_ANIM_UPDATE`. Its animation callback returns false; physics and collision slots are NULL. |
| 3 | Alternate falling configuration with the same attribute-driven physics as state 1, but collision returns true exactly when `it_8026DA08` does. No entry request for state 3 appears in this unit; it must not be identified as the dropped state merely from its position. |
| 4 | `EnteredAir` selects this state. Animation returns false and physics is empty. Collision supplies both resting and falling entry callbacks to `it_8026E8C4`, then returns false. |

All five initializer animation IDs are zero. State indices are distinct from these animation IDs. `itSpycloak_UnkMotion3_Anim` is shared by states 1 and 3, despite its numeric suffix. [Canonical callbacks and table](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itspycloak.c#L30-L145).

### Shared behavior and exceptional paths

The common state changer indexes the live item's state table using the requested state index, obtains the animation ID separately, conditionally refreshes animation/script data, installs the selected callbacks, and clears transient callback slots. Thus an empty item-specific callback does not imply that common animation or item processing is absent. [State changer](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/item.c#L1120-L1242).

The fall helper conditionally subtracts acceleration from vertical velocity according to sign and speed threshold. It is not a strict terminal-speed clamp, and an individual step can cross the threshold. [Fall helper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/it_2725.c#L176-L204).

Resting collision's shared helper updates collision-derived position and supporting-floor identity. Lost support invokes the falling entry; retained support also has a conditional `Item_8026ADC0` branch. The wrapper's false return therefore does not establish absence of shared side effects. [Support handling](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/itgroundcoll.c#L44-L70). Floor alignment is separately guarded by `Collide_FloorMask`. [Alignment dispatch](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/itmaplib.c#L566-L573).

State-1 collision invokes resting entry only after the shared resolver's collision and additional eligibility tests; not every floor contact necessarily transitions immediately. [Resolver](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/itgroundcoll.c#L450-L479). State-3 collision's shared helper updates position and, on a successful test, the floor index before returning its result. [State-3 helper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/itgroundcoll.c#L194-L213).

State-4 resolution sends lost support to state 1. With support retained, it performs additional motion/collision work and invokes resting entry only when its flag/counter condition permits; remaining in state 4 is possible. [State-4 helper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/itgroundcoll.c#L750-L778).

`EvtUnk` forwards both object pointers unchanged to `it_8026B894`. The local wrapper does not establish the callee's reference-cleanup lifetime semantics. [Adapter](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itspycloak.c#L130-L133).

### Semantic review

The rendered resting/falling entry and callback names fit canonical behavior and are retained as inferences, not recovered historical spellings. The entered-air animation name is independently supported by state selection and table placement. Numeric names are retained where a stronger lifecycle identity is not established. Both rendered owned files were readable without parser issues. No compiled section size, layout, or constant-pool contents are asserted.

Status: synthesized; independent review and live promotion pending.
