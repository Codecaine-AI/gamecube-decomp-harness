## Regend ending THP scene

This unit defines three 26-entry `char*` filename tables and the Congratulations scene entry/frame callbacks. Simple, Adventure, and Allstar tables use the same character ordering; entries 18 and 19 share the Zeldaseak filename in every table. Table indexing has no local bounds check. [Tables](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1A9B.c#L33-L79)

### Entry
`gm_Scene_Congrats_OnEnter(UNK_T unused)` ignores its argument, initializes two persistent byte timers to 30 and zero, creates presentation objects, performs audio/background setup, and registers `lbMthp8001F928` as a GX callback. The selected filename is passed to `lbMthp8001FAA0` with dimensions 560×416; the object returned by `lbMthp8001F890` receives x10=320, x14=240 and x40 OR 2 after a 640×480 setup call. No allocation failure checks or destruction path appear here. [Entry](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1A9B.c#L81-L124)

Movie selection uses `gm_801BEFB0()` as the array index. Debug game-over substitutes `gm_801BF050()` before the movie-mode switch: Classic selects Simple, Adventure selects Adventure, and every other value selects Allstar. Crucially, sound selection queries the raw current mode again, without debug substitution. It calls `gm_8017DFF4` with 1 for Classic, 0 for Adventure, or 2 otherwise; return value 4 selects sound 0x9C45, all other values select 0x9C41, both with arguments 0x7F and 0x40. The numeric result is not independently established here as a named difficulty or progress state. [Selection branches](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1A9B.c#L104-L140)

### Frame and departure
The frame callback has mutually exclusive branches: decrement a nonzero input-delay timer; otherwise decrement a nonzero exit timer and request departure upon reaching zero; otherwise test newly triggered A/Start from `gm_GetButtonsTriggered(gm_801BF010())`. Thus the frame that drains the initial delay does not also accept input. Accepted input calls `lbBgFlash_8002063C(60)`, sets the exit timer to 60, calls `lbAudioAx_80023694()`, then `sfxForward()`. Departure depends on the countdown, not movie completion or an effect-completion query. [Frame](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1A9B.c#L143-L166)

Countdown expiry calls `gm_801A6630(6)` for debug game-over, otherwise `(1)`. That cross-file helper writes the argument to the current scene exit-data byte and calls `gm_801A4B60`; this does not establish literal scene destinations 6 and 1. No local latch prevents subsequent input if the callback continues to run after the exit request. [Exit-data consumer](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmregtyfall.c#L107-L112)

### Evidence limits
Canonical and rendered source were read completely. Rendered substitutions are naming hypotheses, not independent proof of callee semantics. The source ownership comment describes historical compiled anchors, but no compiled artifacts were supplied to verify section size, literal placement, adjacency, or object layout. The parameter records with old and current function names remain distinct; this pass proposes no identity merge.

Status: synthesized; independent review and live promotion pending.
