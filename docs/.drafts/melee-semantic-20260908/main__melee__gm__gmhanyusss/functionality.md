## Hanyu Stage Select setup

`gmhanyusss.c` defines `gm_Mode_HanyuSss_States`, a table containing local state ID `0` followed by `{ -1 }`. The populated state specifies preload kind `lbDvdPreload_2`, zero flags, entry callback `gm_801BEE58`, no exit callback, scene kind `GS_SSS`, enter-data address `&gm_8049C030`, and null exit data. The preload field is a kind value, not a callback. The state ID is local to this mode; the `-1` initializer is the sentinel spelling, while the declared ID field is unsigned. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmhanyusss.c#L7-L24), [field definitions](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/types.h#L63-L76).

`gm_801BEE58` takes `GameModeState*`, obtains enter data using `gm_GetGameModeStateEnterData`, interprets the result as `SSSData*`, and unconditionally copies `gmMainLib_804D3EE0->modes.vs_melee` into its `vs` member. Its complete body contains no null check, timer, stage-choice processing, transition request, or exceptional branch. It replaces this member on each invocation rather than initializing the entire payload. [Callback](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmhanyusss.c#L26-L30).

The backing object is explicitly declared `static CSSData`, despite the callback's `SSSData*` interpretation. Its static storage outlives an individual invocation; the table passes its address across the game-mode/scene boundary. This source-level type discrepancy is preserved, not treated as proof of compatible layouts or a crash cause. The global configuration's initialization and the downstream scene's accesses are outside this unit. No compiled section placement, allocation size, or layout compatibility is established here.

The shared mode registry binds `GM_HANYU_SSS` to this table. The header exposes only the table declaration and retains its existing `MELEE_GM_GMTESTHANYU_H` guard. [Registry](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmscdata.c#L448-L455), [header](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmhanyusss.h#L1-L8).

The rendered name `gmHanyuSss_EnterSss` is a plausible role-based hypothesis supported independently by the canonical table and body, not a recovered original symbol. Specific SELECT STAGE menu routing and the baseline's documented-crash claim remain unverified.

Status: synthesized; independent review and live promotion pending.
