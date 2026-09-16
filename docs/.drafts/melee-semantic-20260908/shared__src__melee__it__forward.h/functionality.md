## Item forward declarations and identifiers

`src/melee/it/forward.h` supplies item-system forward declarations, a command callback type, state-change flag constants, classification enums, and the shared `ItemKind` enumeration. It contains no executable implementations.

- Forward declarations cover item instances, articles, spawning, models, dynamics, and state descriptions. Under `M2C`, `Item_GObj` is a dedicated struct with typed item data and callback pointers; otherwise it aliases `HSD_GObj`. These declarations do not establish runtime ownership, destruction order, or compiled layout. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/forward.h#L7-L58)
- `Item_StateChangeFlags` defines bits 0–8. `Item_UnkKinds` and `Item_HoldKinds` remain distinct enums; their possible combination is only a source comment. Hold-category comments preserve exceptions for food, stage projectiles, Octarock stones, coins, and unknown items. Flag names alone do not prove consumer behavior. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/forward.h#L60-L99)
- `ItemKind` groups common items, related effects, monsters, character items and Kirby copies, Pokémon, Pokémon-related items, and stage-specific objects. The common-boundary macros name `It_Kind_Capsule` and `It_Kind_L_Gun_Ray`; this header alone does not prove how callers test those boundaries. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/forward.h#L106-L290)
- Pokémon boundaries deliberately share values: `It_PKind_Tosakinto = It_PKind_Start`, and `It_Kind_Chicorita_Leaf = It_PKind_Terminate`. Unknown and source-labeled invalid entries remain in the enumeration. `It_Kind_None` explicitly equals `-999`. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/forward.h#L291-L392)

## Semantic assessment

All 395 canonical and rendered lines were reviewed. The rendered view reports zero substitutions and zero parse errors; it introduces no alternative names to validate. Subject and link enumeration both returned empty terminal pages, matching the empty frozen baseline. No knowledge changes are proposed.

Status: synthesized; independent review and live promotion pending.
