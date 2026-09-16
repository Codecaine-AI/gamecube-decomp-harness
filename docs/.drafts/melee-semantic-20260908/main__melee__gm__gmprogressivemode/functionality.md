## Progressive-scan mode wrapper

`gm_Mode_ProgScan_States` defines one active state: ID `0`, preload selector `lbDvdPreload_2`, flags `0`, scene `GS_PROG_SCAN`, and state-level entry/exit callbacks. The final initializer is `{ -1 }`. Two file-static `UNK_T` objects supply persistent entry and exit payload storage by address. The header exports only the state table. These are source-level observations, not compiled section or layout claims. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmprogressivemode.c#L5-L24) · [Header](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmprogressivemode.h#L1-L9)

### Entry and payload lifetime

`gm_801BF8F8(GameModeState*)` retrieves the entry payload and writes integer `1`, with no guard or alternate behavior. The dispatcher calls state entry before forwarding that same payload to scene entry. The progressive scene reads the integer into `x10`, passes it to `gm_801AD254`, and sets `x14` to `0` for input `1` (otherwise `2`). Thus the wrapper initializes a numeric scene state; it does not itself enable progressive output. Storage persists across callbacks rather than belonging to a callback stack frame. [Entry](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmprogressivemode.c#L26-L30) · [Dispatch and accessors](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1A3F.c#L139-L200) · [Scene consumer](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmprogressive.c#L175-L199)

### Exit and deferred boot handoff

`gm_801BF920(GameModeState*)` retrieves but discards the exit-data pointer, then calls `gm_ChangeGameModeAfterCurrentScene(GM_BOOT)`. The scene exports `x14` through the exit payload and releases its archive; this wrapper does not inspect that result or choose different destinations. The transition helper writes the pending mode and sets the mode-change flag, which the enclosing mode loop observes before returning its successor. [Exit](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmprogressivemode.c#L32-L36) · [Scene export](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmprogressive.c#L194-L199) · [Deferred routing](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1A3F.c#L234-L325)

The callback is unconditional **when invoked**. Reset processing skips normal scene and state exit callbacks and has a separate boot request. Startup selects progressive-scan mode only under the displayed DTV/button/saved-setting condition; otherwise it starts boot directly. [Reset exception](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1A3F.c#L153-L189) · [Startup selection](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1A3F.c#L344-L359)

### Rendered-name review

The rendered C view substitutes `gm_Mode_ProgScan_OnExit` for `gm_801BF920`; canonical registration and the `GameModeState` field declarations independently support that inferred role. It remains a proposed name, not evidence of an original symbol. Both owned rendered views were complete and reported no parsing issues. [Callback fields](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/types.h#L63-L76)

Status: synthesized; independent review and live promotion pending.
