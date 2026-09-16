## Shared fighter declarations
`src/melee/ft/forward.h` supplies fighter-related forward declarations, callback signatures, constants and enumerations rather than executable behavior. It defines `FIGHTERVARS_SIZE` as `0xF8`, `FtMotionId` as `enum_t`, and `MotionFlags` as `u32`. Under `M2C`, it declares a fighter-typed object structure; otherwise `Fighter_GObj` aliases `HSD_GObj`. These declarations do not prove compiled layout or callback/resource lifetimes. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/forward.h#L13-L87)

`FighterKind` and `CharacterKind` are distinct numeric domains with different ordering and Ice Climbers representation. Their none/max aliases are preserved, as are the original `CHKIND_*` spellings and the `CKIND_MASTERH = CKIND_PLAYABLE_COUNT` alias. They should not be treated as interchangeable identifiers. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/forward.h#L89-L166)

Motion flags cover bit positions 0–31 plus zero. Several names and comments explicitly remain uncertain; declarations alone cannot validate their runtime effects. Ledge-grab macros encode both/left/right as 0/-1/1. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/forward.h#L168-L253)

The remaining declarations enumerate fighter parts, walk types, move IDs, smash states, unknown bury types, entity kinds and ground/air states, with `Ft_Dynamics_NumMax = 10`. Explicit part values 56 and 109 and unknown move entries remain uninterpreted; move IDs are not established here as motion-state IDs. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/forward.h#L255-L445)

## Review outcome
All canonical and rendered lines were reviewed. Both rendered pages report zero substitutions and zero parse errors; no rendered naming discrepancy was found. Subject and link enumeration returned empty terminal pages, matching the frozen baseline's zero subjects, facts and links. No supported correction or scoped knowledge write is proposed.

Status: synthesized; independent review and live promotion pending.
