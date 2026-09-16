## Shared map-collision declarations

`src/melee/mp/forward.h` supplies forward declarations, callback signatures, enum values, and collision flag constants; it contains no executable routines or complete structure definitions.

- Forward-declares collision joints, lines, vertices, map data, collision boxes, and island/palette types. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mp/forward.h#L8-L19)
- Defines terrain identifiers with implicit consecutive values 0–19 and a separate three-value ground enum with values 0–2. Unknown labels remain unknown; the stage-use comments do not establish their meanings. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mp/forward.h#L21-L48)
- Declares a void joint-collision callback accepting user data, joint ID, collision data, an integer `coll_x50`, ground kind, and vertical delta; a second callback returns `bool` and accepts `CollData*` and `u32`. These signatures do not establish invocation timing, pointer ownership, or argument lifetimes. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mp/forward.h#L50-L54)
- Assigns the four low bits to floor, ceiling, right-wall, and left-wall line kinds. Separately defines line flags, `MPCOLL_WALLID_MAX` as 9, collision-data flags, and joint flags. Flag labels alone do not prove runtime state transitions. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mp/forward.h#L56-L85)
- Defines environment collision constants for wall, ceiling, floor, edge, ledge-grab, and ledge-slip conditions. The wall masks include more bits than the named push/hug bits, whereas ceiling and floor masks explicitly combine their push/hug constants. `Collide_Edge` is a separate bit, not the union of the left/right edge bits. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mp/forward.h#L87-L112)

## Review outcome

All 115 canonical and rendered lines were reviewed. The renderer reports zero parse errors and zero substitutions; no rendered naming hypothesis differs from canonical source. Subject and link enumeration both returned empty results, so there are no baseline facts or links requiring retention or correction. No semantic change is proposed. Runtime branch behavior, cross-file lifetimes, and compiled layout are not established by this header.

Status: synthesized; independent review and live promotion pending.
