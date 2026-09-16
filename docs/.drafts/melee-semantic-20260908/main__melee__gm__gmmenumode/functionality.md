## Menu game-mode lifecycle

`gmmenumode.c` defines Debug Menu and ordinary Menu state tables. Each contains an active state 0 using `lbDvdPreload_2`, a zero third field, and a `{ -1 }` terminator. Debug Menu registers `onEnterDebug`, `GS_DEBUG_MENU`, and `&debug_enter_data`, with no exit callback. Menu registers `onEnter`, `onExit`, `GS_MENU`, and the addresses of the static entry/exit pointer slots. The header exports both arrays. These are source-level observations, not verification of compiled section placement or size. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmmenumode.c#L17-L59), [header](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmmenumode.h#L1-L10).

### Debug entry

`onEnterDebug` obtains the entry payload through `gm_GetGameModeStateEnterData`, stores a cast of `&un_803F9FA4` in `x0`, clears `x4`, calls `un_802FF7DC`, then calls `un_802FF884("/audio")` without using its result. The independently read canonical callee loads archive symbols and distributes selected symbol entries; `un_802FF884` ignores its argument and returns false. Thus the latter call is not evidence of directory scanning or effective interface initialization. The meaning of the zeroed `x4` remains unspecified. [Caller](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmmenumode.c#L61-L70), [callees](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/if/soundtest.c#L764-L781).

### Ordinary menu entry

`onEnter` uses `scene->info.enter_data` as `MenuEnterData`. Before routing, it allocates card work, loads card archive 0, passes two separately allocated buffers to `lbSnap_8001E218`, allocates each `mnSnap_804A0B90` element, and calls three DVD routines and `mnGallery_80258940`. No allocation-failure handling or rollback appears locally. The order of evaluation of the two allocation arguments is not specified by this source expression. Rendered names for snapshot, DVD and gallery callees were treated as hypotheses, not independent proof of their internal behavior. [Setup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmmenumode.c#L72-L94).

A nonzero `force_main_menu` is cleared after setup, selects Main/1-P, sets `load_assets=1`, and returns before previous-mode lookup. Otherwise `load_assets` is also set to 1. Challenger Approach replaces the previous mode with one call to `gm_801737D8`; this is not a recursive normalization loop.

The switch routes Classic, Adventure and All-Star, including their game-over variants, to their Regular Match selections; Event to the Event menu with literal selection 0; Target Test and Home-Run Contest to Stadium; all six listed Multi-Man variants to their corresponding Multi-Man selections; Training to 1-P/Training; VS and Tournament to their VS entries; Camera Mode, Stamina, Super Sudden Death, Giant, Tiny, Invisible, Slo-Mo, Lightning, Fixed Camera and Single Button to their respective Special selections; trophy Gallery, Lottery and Collection to Toy selections; and `GM_MENU` specifically to Settings/Language. Every unlisted mode falls back to Main/1-P. No additional meaning is assigned to Event's numeric selection 0. [Complete routing](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmmenumode.c#L94-L241).

### Exit and lifetime boundary

`onExit` reads `MenuExitData` through `info.exit_data`, forwards `pending_mode` unchanged to `gm_SetPendingGameMode`, and calls `gm_SetNewGameModePending`. It neither validates the destination nor frees the entry allocations. The static payload-slot addresses registered in the tables must not be confused with separately allocated payload objects. Allocation ownership, eventual release, and dispatcher/menu-side payload interpretation remain cross-file responsibilities not established by this TU. [Exit](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmmenumode.c#L243-L249).

### Baseline review

Reviewed all 28 facts and seven links: 25 facts retained, three compiled-layout facts unresolved, and all seven conceptual links retained. Conceptual retention does not validate compiled section membership. No new names, entities, links or merges are proposed.

Status: synthesized; independent review and live promotion pending.
