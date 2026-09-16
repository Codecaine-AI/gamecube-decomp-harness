# Camera Mode Scene Flow

Root independently reviewed and promoted 58 facts to the live KB. Canonical source names and source code remain unchanged.

Review of `main/melee/gm/gmcameramode` at `c302741689bd67c361cd7faadb221df3193992c3`. The unit configures camera mode as a sequence of game scenes and transports its saved VS configuration between those scenes. It installs camera callbacks into VS start rules. The camera-control implementation lives in the callback dependencies.

## Entry Points and Scene Table

`gm_Mode_Camera_States` contains four entries followed by a `-1` sentinel. IDs 0, 1, 2 and 3 bind `GS_CAMERA_VS`, `GS_CSS`, `GS_SSS` and `GS_VS` respectively. Every entry uses `lbDvdPreload_3`. Entry 0 shares the address of a static `s64` for enter/exit data. CSS and SSS reuse their corresponding VS scene records, while the match uses separate start and exit records. See [scene table](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmcameramode.c#L20-L80).

`gm_801B23F0` registers three resource entries. ID 2006 uses a rounded texture buffer size for 640 by 480 with format argument 4. IDs 2007 and 2008 use sizes from the two snapshot helpers. The camera scene preparation callback establishes camera-mode cache state, allocates card work storage, and passes archives 2007/2008 to snapshot initialization. Its exit callback requests `GM_MENU` only for exit values 1 or 2. See [resource and scene initialization](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmcameramode.c#L82-L111).

## Selection and Persistent Configuration

CSS entry copies `modes.vs_camera` to the scene record, installs KO counts, sets match type 1 and prepares the camera preload cache. CSS exit value 2 requests the menu and returns before saving configuration or audio calls. Other exits save the CSS VS record, combine audio-helper results for six character slots and issue the subsequent audio calls.

SSS entry copies saved camera VS data and calls the shared stage-selection setup helper. A nonzero `start_game` exit saves the SSS configuration and issues stage audio calls. A zero exit explicitly selects state 1, returning to CSS. These branches do not establish any general default scene-advance policy on their own. See [selection callbacks](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmcameramode.c#L113-L187).

## Match Setup and Return

`gm_PrepCameraModeVSScene` calls the shared VS rule helper, copies saved rules into the start record, then changes match-kind and several flags. The chained assignment at line 202 sets `start->rules.timer_enabled` and persistent `vs->start.rules.x4_4` to false. It does not directly clear the copied start record's `x4_4` field. That distinction matters because the rule copy occurs earlier.

The function installs pause, unpause and pauser callbacks, plus camera match-start/frame-start/frame-end callbacks. It allows pausing, copies player records, sets each copied player `xD_b3`, and invokes subcolor, rumble, announcer, card and snapshot setup. This unit shows callback wiring; callee names alone do not prove UI or camera behavior. See [match preparation](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmcameramode.c#L189-L233).

The match-exit callback processes the global match-end record through shared helpers, updates KO counts, and explicitly selects CSS state 1. It ignores its callback argument. `gm_Mode_Camera_OnInit` initializes only the persistent camera VS configuration through `gm_InitVsMode`. See [match return and mode initialization](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmcameramode.c#L235-L249).

## Boundaries

The paired header exports resource preload, mode initialization and the state table. Callback declarations and bodies remain local to this TU. Shared `GameModeState`, selection/start record layouts, preload meanings and snapshot buffer internals belong to their manifest owners. No source name, record layout, or shared KB change is part of this draft.

Live promotion receipt: [receipt.json](</Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/promotions/6af2df456979626559b3a01adb7f51185a0e20f369b20ca20f92389caaeb0ec5/2026-09-08T14-38-03.736Z-62a0b319-19bf-42f5-9a97-421d33238380.receipt.json>).

## Reviewed final render

Root promoted 58 reviewed facts to the live KB. [Final-render receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__gm__gmcameramode/final-render.json) records the exact reviewed rendered pages; [staged completion](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__gm__gmcameramode/staged-completion.json) and [live promotion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/promotions/6af2df456979626559b3a01adb7f51185a0e20f369b20ca20f92389caaeb0ec5/2026-09-08T14-38-03.736Z-62a0b319-19bf-42f5-9a97-421d33238380.receipt.json) establish application. Final-render SHA256: `196b1712029fccb12620580b35dab43030c99a020bea65d94c4c009c40db45a4`. Canonical source remains unchanged.
