## src/melee/vi/types.h

This shared header includes platform types and exports the VI forward declarations. It declares `ViCharaDesc` with four `u8` fields named for player-one/player-two character and costume indices, followed by integer fields `spawn_count` and `unk`. These are source-level declarations, not independently verified runtime semantics; the header does not establish valid index ranges, spawn-count behavior, or the meaning of `unk`. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/vi/types.h#L4-L15.

`un_804D7004_t` contains only `char pad_0[0xC]`; a source comment and `ASSERT_SIZE` specify a size of `0xC`. No compiled layout verification, internal meaning, or lifetime follows from this declaration alone. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/vi/types.h#L17-L20.

The complete canonical and rendered views agree, with no name substitutions. There are no functions, branches, baseline subjects, facts, or links to assess. No supported correction or useful naming change is warranted within this assignment.

Status: synthesized; independent review and live promotion pending.
