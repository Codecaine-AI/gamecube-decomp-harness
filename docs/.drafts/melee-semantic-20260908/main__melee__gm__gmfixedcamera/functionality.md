## Fixed-Camera Versus lifecycle

`gmfixedcamera.c` defines `gm_Mode_CameraVs_States`, thin scene adapters, a match-rules callback, and parameterless initialization/load callbacks. The header declares all thirteen functions with signatures matching their definitions. Canonical and rendered views were reviewed completely; rendered names are semantic hypotheses, not independent evidence.

### State descriptors

The table contains eight populated descriptors followed by `{ -1 }`: local IDs 0–4 select CSS, SSS, ordinary VS, Sudden Death, and Results; 0x80 selects Approach, 0x81 an auxiliary VS path, and 0xC0 the prize interface. Ordinary rows contain the additional numeric initializer values `3, 0`; special rows contain `2, 0`. Their meanings are not inferred here. Approach has no exit callback; Results and Prize have null exit-data pointers. The auxiliary VS row uses shared ApproachVs callbacks, not the local fixed-camera battle adapter. Source enumeration does not prove a compiled section extent or element stride. [Table](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmfixedcamera.c#L11-L109)

### Selection and persistent settings

CSS entry forwards the persistent `modes.vs_fixed_camera` record and CSS match selector 7. The shared helper copies settings into CSS data, attaches the shared KO-count buffer, and starts preload setup. CSS exit returns to the menu immediately for `CSSPendingSceneChange_2`; otherwise it persists selections and configures audio. SSS entry copies the same persistent record. SSS exit commits settings and configures stage audio when `start_game` is true; otherwise it explicitly requests local state 0, CSS. Confirmation does not explicitly select a next state in that helper. [Adapters](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmfixedcamera.c#L111-L129) · [Shared selection logic](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmvsmelee.c#L119-L169)

### Battle customization and result lifetime

Both ordinary VS and Sudden Death entry pass `fn_801B9FB8` and a null per-player callback to their common builders. The local callback unconditionally assigns `gm_80165290` to the destination rules' `on_unpause_override`; its second StartMeleeData pointer is unused. This assignment stores behavior rather than executing it. The canonical destination calls `Camera_SetModeToFixed`. Initial camera activation, invocation lifetime of the stored override, and guaranteed whole-stage framing remain outside the verified chain. [Hook and adapters](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmfixedcamera.c#L131-L151) · [Selector](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1601.c#L2573-L2576)

Common builders copy rules, invoke the whole-match callback, and then copy players. Ordinary VS additionally performs its common setup, stock/VS rule handling, and announcer loading; Sudden Death uses the retained ordinary `gmVsMelee_VsExitInfo.match_end` for tiebreak setup. Ordinary battle exit accounts for human results and selects state 4 when there are not multiple winners, including zero winners; otherwise it selects state 3. Sudden Death exit passes its result and the retained ordinary result to reconciliation without locally selecting another state. Results entry subsequently copies the retained ordinary MatchEnd into its payload. [Shared battle/result flow](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmvsmelee.c#L171-L275)

### Results exceptions and mode loading

Results exit supplies the persistent mode record and fallback ID 0. Shared processing skips two accounting/update calls for canceled matches but still updates KO counts. Special-route checks require a human participant and a following non-sentinel descriptor. Three prioritized challenger checks can select Approach; Prize is considered only if no challenger route was selected. A selected special route performs archive setup and returns before the ordinary fallback. Otherwise archive setup is followed by state 0. The opaque eligibility routines and their numeric arguments are not given stronger interpretations here. [Results finalizer](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmvsmelee.c#L277-L343)

OnInit passes the persistent Fixed-Camera record to `gm_InitVsMode`. OnLoad always calls `gmVsMelee_ResetKOCounts`. The KO array is shared static storage in gmvsmelee, cleared over its full size and later attached to CSS by pointer; it is not a separate per-mode array. [Lifecycle callbacks](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmfixedcamera.c#L169-L177) · [Shared declarations](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmvsmelee.c#L23-L29) · [Reset and attachment](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmvsmelee.c#L107-L127)

### Review outcome

All 84 baseline facts and 17 links received explicit dispositions in checkpoints: 81 facts retained, three unresolved, and all links retained. The unresolved claims concern compiled table layout and camera framing/activation details. No new semantic facts or inferred names are proposed.

Status: synthesized; independent review and live promotion pending.
