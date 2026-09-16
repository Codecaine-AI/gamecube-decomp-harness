## Shared trophy/toy type declarations

`src/melee/ty/types.h` defines data representations rather than executable functions. It contains trophy metadata and lookup entries, animation and mode state, trophy-list nodes and UI state, display-grid/configuration records, archive/name tables, and partial camera, lighting, transition and figupon records.

- Trophy/list declarations include `ToyEntry`'s byte/integer union, `ToyAnimState`'s object references, linked `ToyListEntry` records, and `Toy26B8`'s trophy flags, selection fields and animation/pointer union. Their declarations do not establish union discriminants, numeric state meanings or resource ownership. [Canonical declarations](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ty/types.h#L14-L212)
- Display declarations provide 301-element sorting and position arrays, configuration fields, and 43-element archive and name tables. Camera/light records remain partially described through padding and unnamed fields; no allocation or cleanup behavior is defined here. [Display and supporting records](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ty/types.h#L214-L478)
- Later declarations include the 12-entry trophy-list state, archive-related views, a nine-value parameter editor, a nine-entry lookup table, and six-element symbol/value arrays. Source assertions express intended sizes and offsets, not independently verified compiled layouts. [Remaining declarations](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ty/types.h#L480-L647)

## Semantic assessment

All canonical and rendered pages were reviewed in the inherited research; the lead independently checked the cited contradiction evidence. The renderer made no substitutions, so there are no proposed function names to validate. Existing descriptive fields are compatible with their declared types, but this header alone cannot verify consumer behavior or justify more specific names for opaque fields. Conflicting size comments and tentative type-equivalence TODOs remain unresolved rather than being promoted into facts.

The frozen baseline contains no subjects, facts or links. Consequently, there are no retention IDs or exceptions, and no supported in-scope knowledge edits are proposed.

Status: synthesized; independent review and live promotion pending.
