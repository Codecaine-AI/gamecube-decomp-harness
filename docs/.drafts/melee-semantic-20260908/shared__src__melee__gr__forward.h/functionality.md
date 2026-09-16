## Ground/stage forward declarations

`src/melee/gr/forward.h` is a shared type-definition header, not executable stage logic. It forward-declares ground, stage, archive, and stage-specific structures (lines 9–20).

### Conditional object typing
Under `M2C`, `Ground_GObj` is a separately declared structure with object-list links, process/render callbacks, an `HSD_JObj*`, `Ground*` user data, and a removal callback. Otherwise it aliases `HSD_GObj`. These declarations do not establish allocation ownership, callback invocation order, or cross-file lifetimes; offset comments are not compiled-layout evidence. [Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/forward.h#L22-L46)

### Stage identifiers
The header documents `GrKind` as archive-selection numbering and `StKind` as separate stage-variant numbering mapped to `GrKind`. Their member ordering differs, so they must not be treated as interchangeable identifiers. The referenced mapping, archive lookup, and naming provenance are documentation here, not independently inspected implementations. Unknown members remain unknown. [Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/forward.h#L48-L178)

Two numeric comments conflict with explicit initializers: `Gr_Kind_Count = 221` is 0xDD despite the 0x46 comment; `St_Kind_Unk84 = 84` is 0x54 despite the 0x55 comment. `St_Kind_Heal` consequently has value 85, consistent with its own 0x55 comment. No interpretation of the unusual count or unnamed stage identities is inferred. [Count evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/forward.h#L123-L127) · [Sparse-value evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/forward.h#L174-L178)

### Additional types
The header defines `PsType_Display = 1`, Home-Run Contest parts constants 16 and 64, and callback signatures for castle operations, Ice Mountain segment lookup, touch-line dynamics lookup, and shadow-render checking. Signatures alone do not prove callback behavior or returned-pointer ownership. [Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/forward.h#L180-L196)

### Semantic review outcome
All 199 canonical and rendered lines were reviewed. The renderer reported zero substitutions and zero parse errors; no proposed names differ from canonical names. Subject and link enumeration both returned empty terminal pages, with no baseline facts or writable subjects. No knowledge changes are proposed; the numeric discrepancies are preserved as unresolved source-documentation issues.

Status: synthesized; independent review and live promotion pending.
