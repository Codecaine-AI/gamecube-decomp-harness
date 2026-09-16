## Item-kind shared declarations

`src/melee/it/kinds/types.h` defines four structures, with no executable implementations.

- `ItemStateTable` declares an animation identifier, predicate callbacks named `animated` and `collided`, and an event callback named `physics_updated`. The source explicitly marks its size as unknown. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/types.h#L11-L24.
- `ItemLogicTable` declares a state-table pointer and callbacks named for item lifecycle, handling, damage, and collision-related events. It distinguishes event, predicate, and interaction callback types; the final interaction field remains `evt_unk`. These declarations alone do not establish dispatch order, predicate-result effects, pointer ownership, or callback lifetimes. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/types.h#L26-L71.
- `itSword_UnkBytes` declares two floating-point fields and nine byte fields. `itSword_UnkArticle1` declares three `UNK_T` fields, three floats, an integer, and an embedded `itSword_UnkBytes`. Their offset-based names do not establish gameplay meaning. Offset comments are source annotations, not independently verified compiled-layout evidence. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/types.h#L73-L96.

## Semantic assessment

All 99 canonical and rendered lines were reviewed. The rendered view reports zero substitutions and zero parse errors; its function-name-only coverage supplies no independent validation of field meanings. No supported naming correction or useful factual addition was identified within this declaration-only scope. Subject and link enumeration both returned empty inventories, so there are no existing facts or links requiring retention or correction.

Status: synthesized; independent review and live promotion pending.
