## Item-system shared types

`src/melee/it/types.h` defines shared data structures rather than executable routines. `ItemAttr`, animation/model/dynamics descriptors, hurt-bone descriptors and `Article` describe item resources. `Article` references those resources through pointers; these declarations alone do not establish allocation ownership or resource lifetimes. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/types.h#L67-L196)

`Item` combines identity and state IDs, movement, resource references, collision data, four hitboxes, two hurt capsules, owner and interaction references, animation/physics/collision callbacks, hitlag and grab callbacks, timers, counters, command variables, flags and a union of kind-specific variables. The source declares size assertions, but no compiled layout was inspected. Callback ordering, predicate return meanings, destruction branches and pointer invalidation cannot be inferred from these declarations. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/types.h#L213-L669)

Supporting structures include a rendering callback wrapper, an article-pointer table, `BobOmbRain`, creation inputs in `SpawnItem`, common item parameters and resource tables, and fighter ECB/position tracking. Names such as `sdata_ItemGXLink` and `r13_ItemTable` do not independently prove compiled section placement. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/types.h#L671-L834)

`ItemPickTable` declares an entry count, item-value pointer, total weight and threshold pointer. `RandomItemSpawner` embeds that table alongside countdown and mask fields. `DamageLogEntry` stores a discriminator, object pointer and hit/hurt capsule pointers. Their comments describe algorithms, cross-file producers/consumers and numeric discriminator meanings; those behavioral details are not independently verified by this header. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/types.h#L836-L903)

## Semantic assessment

All 906 canonical and rendered lines were reviewed. The renderer performed no substitutions and reported nine parse errors, so it supplies no independently validated naming hypotheses. Subject and link enumeration returned no records; there are no baseline facts to retain or correct and no writable subjects. An empty proposal is appropriate.

Status: synthesized; independent review and live promotion pending.
