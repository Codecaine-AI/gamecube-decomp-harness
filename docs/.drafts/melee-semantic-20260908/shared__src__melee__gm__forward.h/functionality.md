## Shared game-mode declarations

`src/melee/gm/forward.h` is a declaration-only header supplying game-mode constants, enums, opaque structure declarations, and a callback typedef. It contains no executable branches or object-lifetime implementation.

- Constants define six player slots, five teams, nametag sentinel 120, FPS constant 60, and game-mode-state termination value `0xFF`. The header explicitly relates `GM_MAX_PLAYERS` to `Gm_Player_NumMax` for array declarations. [Canonical lines 6–14](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/forward.h#L6-L14)
- `GameModeKind` and `GameSceneKind` are separate enumerations, each ending with count value `0x2D`; their matching numeric ranges do not make their entries interchangeable. Scene comments preserve uncertainty about `GS_0x6`, `GS_UNK10`, `GS_INTRO_ALLSTAR`, and the meaning of `REG`. These comments are not independent verification of scene-table contents or runtime use. [Canonical lines 16–117](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/forward.h#L16-L117)
- `MatchOutcome` defines values 0–9. Its comments distinguish value 0 as either an ongoing match or no match since boot, and explicitly extend value 3 beyond team battles to certain single-player victories. Values 5 and 6 retain their uncertain names and documented horde-victory versus bonus-stage-end distinctions. `OUTCOME_TERMINATED` is 9, not the separate `0xFF` game-mode-state sentinel. These are declaration/comment-level descriptions, not a demonstrated runtime transition model. [Canonical lines 119–140](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/forward.h#L119-L140)
- Opaque game, match, menu, results, and mode-specific types are forward-declared; their fields, ownership, and cross-file lifetimes cannot be established here. `GmRouteCallback` takes an `int` and returns `bool`; argument interpretation and callback scheduling are not specified. [Canonical lines 142–178](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/forward.h#L142-L178)
- `Gm_Player` defines slots 0–5 and aliases both `Gm_Player_NumMax` and `Gm_Player_Other` to 6. The assertion provenance is recorded in comments, not independently checked by this header. `MatchKind` enumerates Time, Stock, Coin, and Bonus in order, with implicit values 0–3. [Canonical lines 180–199](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/forward.h#L180-L199)

## Review result

Read all 202 canonical and rendered lines and exhausted the subjects and links listings. The rendered view reports zero substitutions and zero parse errors; there are no rendered naming differences to assess. The frozen baseline contains no subjects, facts, or links, so no retention IDs or exception dispositions are required. No supported semantic correction warrants a proposal. No compiled layout, section placement, or runtime lifetime claims are made.

Status: researched; no-change lead bypass; independent review and live promotion pending.
