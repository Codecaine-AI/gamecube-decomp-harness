## Functionality
`gmmenu.c` defines four parameterless `void` scene-load callbacks, declared in `gmmenu.h`.

The three game-over callbacks transfer persistent fighter selection into shared configuration:

| Callback | Canonical input | Value sent to `gm_801BF020` |
|---|---|---|
| `gm_Mode_ClassicGOver_OnLoad` | `gm_GetAllStarData()` | 1 |
| `gm_Mode_AdventureGOver_OnLoad` | `gm_GetAdventureData()` | 0 |
| `gm_Mode_AllstarGOver_OnLoad` | `&gm_80473A18` | 2 |

Each uses `CKIND_SEAK` only when the stored kind equals `CKIND_ZELDA` and `x0.xC.x12 != 0`; otherwise it preserves the stored kind. The effective kind is held in a `u8` and passed with `& 0xFF` to `gm_801BEFA4`. The callbacks then pass color, slot and nametag to `gm_801BEFC0`, `gm_801BF000` and `gm_801BEFE0`, respectively, before supplying the mode-specific literal. They do not rewrite the source record's character kind. No null checks, allocation, cleanup or alternate failure paths appear in these bodies. [Canonical callbacks](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmmenu.c#L9-L62).

Canonical callee bodies confirm that these calls write shared `gm_8049C178` storage, rather than merely suggesting this through rendered setter names. Slot, nametag and discriminator setters take `s8`; their getters read unsigned bytes. This establishes a cross-file persistent configuration handoff, not a complete account of its later consumption or reset lifetime. [Setters and getters](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmgover.c#L127-L174).

`gm_Mode_Opening_OnLoad` passes the result of `gm_801BF718()` directly to `gm_SetGameModeStateId`, with no local validation or branching. The getter returns the stored `gm_8049E548.unk_E` byte; its companion setter accepts `s8`. Restoration here means forwarding this stored value, not restoring an entire scene snapshot. [Opening callback](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmmenu.c#L64-L67); [stored-byte interface](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmopeningmode.c#L565-L573).

The header contains only its include guard and the four callback declarations with address comments. Those comments are not compiled-layout evidence. [Header](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmmenu.h#L1-L10).

## Rendered-name review
Both owned files were read completely in canonical and rendered form. The C renderer reports 13 substitutions and no parse errors; the header reports zero substitutions and no parse errors. The rendered `gm_GetClassicData` replaces canonical `gm_GetAllStarData`; the callback's Classic context does not independently prove the accessor's full identity. Rendered configuration-setter names are consistent with caller fields and independently inspected canonical storage writes. The literals 0, 1 and 2 are established callback-specific values, not proof of a globally valid mode enumeration.

Status: synthesized; independent review and live promotion pending.
