## Pichu initialization and registration

The unit defines Pichu's special-state dispatch table, character and animation resource strings, four costume resource triplets, demo strings, four-element costume storage, and nine fighter callbacks. The header declares these public interfaces. Source declarations do not establish compiled section sizes or boundaries.

### Special-state registration

The table contains 26 descriptors, annotated with motion-state numbers 341–366. All use Pikachu-family move callbacks and `ftCamera_UpdateCameraBox`. Neutral special has ground/air entries; side special retains distinct Start, Hold, S1, End and S0 entries for ground and air; up special retains Start0, Start1 and End for each; down special retains Start, Loop0, Loop1 and End for each. Every down-special IASA slot is NULL. Notably, SpecialAirS1 uses `ftPk_SM_SpecialS1`, while SpecialAirS0 uses `ftPk_SM_SpecialS`. These submotion assignments must not be normalized into motion-state identities. This table registers callbacks rather than defining a transition graph; burst, warp and hit-phase interpretations remain unverified here. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPichu/ftpichu.c#L21-L308)

### Loading and shared attributes

`ftPc_Init_OnLoad` obtains the Fighter and its article list, enables `can_walljump`, calls the shared Pichu attribute initializer, then submits article indices 0, 1 and 2 with attribute fields xDC, x14 and x18 respectively. The item helper stores each pointer at `it_804D6D38[kind - It_Kind_Kuriboh]`; registration does not spawn an item or transfer demonstrated ownership. Resource validity, table bounds and eventual cleanup are not checked in this wrapper. [Load](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPichu/ftpichu.c#L340-L354), [registration](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/it_26B1.c#L204-L208).

`ftPc_Init_LoadSpecialAttrs` forwards the same object to Pikachu's loader. That downstream loader copies Pikachu-format attributes and, when vertical scale differs from 1.0, multiplies its height-attribute array by that scale. The absence of local branches does not imply absence of downstream conditional behavior. [Wrapper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPichu/ftpichu.c#L408-L411), [shared loader](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPikachu/ftpikachu.c#L403-L415).

### Costume reset and deferred presentation

On death, part 0 receives selector 0. For parts (1,2,3), costume IDs 0–3 select respectively (-1,-1,-1), (0,-1,-1), (-1,0,-1), and (-1,-1,0). There is no default case: other costume IDs only update part 0. The called helper writes the pending `prev` selector and a dirty flag, rather than immediately rendering the accessory; separate model processing copies selectors into `idx` and applies visibility. [Callback](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPichu/ftpichu.c#L356-L386), [model selection lifecycle](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftparts.c#L555-L627).

### Item and knockback adapters

Pickup and drop forward their object and boolean with two additional zeros. The shared pickup path skips heavy items; hold-kind values 1,2,3,4 map to animation selector values 1,0,2,3, with other values leaving that selection unchanged. The pickup boolean independently gates the subsequent visible-animation call within the non-heavy branch. Drop always requests selector -1 and conditionally invokes the invisible-animation routine; unlike pickup, it has no heavy-item guard. Visibility callbacks use flag zero and both skip heavy items. These numeric selectors are not fighter action-state IDs. [Wrappers](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPichu/ftpichu.c#L388-L406), [shared branches](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/inlines.h#L142-L193).

Knockback entry and exit forward literal 1. The shared routines invoke `ftAnim_800704F0` for indices 1 and 0, using 3.0 on entry and 0.0 on exit. These wrappers contain no local timers or action-state transitions. [Wrappers](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPichu/ftpichu.c#L413-L421), [shared routines](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/inlines.h#L195-L205).

### Rendered-name review

Both owned files were read completely in canonical and rendered form. The renderer reported no parse errors. `ftPc_Init_RestoreHeldItem` remains only a moderate-confidence semantic alias for canonical `ftPc_Init_OnItemVisible`, not a recovered original name. The rendered article-registration and pending-model-selection hypotheses were checked against canonical helper bodies rather than accepted as self-proving names.

Status: synthesized; independent review and live promotion pending.
