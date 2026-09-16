# Results-player semantic review

This unit implements the Results screen's player-marker presentation, manual and unattended statistics navigation, timed presentation controller, and winner-layout queries. It also declares shared character/configuration tables used by the split `gm_1798` companion. Rendered names were reviewed as hypotheses, not used as independent evidence.

## Presentation flow

`gm_80177724` clears a complete caller-supplied `ResultsMatchInfo`. `fn_80179350` updates six available statistics anchors and runs the presentation controller before advancing `x8`, except at its unsigned `-1` sentinel. Before phase 1, presentation begins on exact counter equality `0xA0`, or on a connected human's Start trigger when the match was canceled. Audio milestones occur at counters 2, `0x9A`, and `0xA2`, with outcome-dependent branches. Phase 1 reveals markers at animation frame >=10 and pauses at >=40; phase 2 accepts human-prioritized controller input, falling back to any connected controller only when no connected human exists. Phase 3 handles statistics; phase 4 counts down before requesting scene exit. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmresultplayer.c#L1197-L1313)

Marker setup visits four non-NA slots. Canceled matches select frame 4; individual results use frame 5 when `is_small_loser` is zero, otherwise `is_big_loser`; team results use frame 5 for `x6`, otherwise the team's loser field. The team branch explicitly handles only values 0 and 1. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmresultplayer.c#L438-L517)

## Navigation and completion

Manual navigation prioritizes B/left, then A/right, then vertical analog scrolling. The strict deadzone is `abs(Y) < 0.3`; scrolling scales magnitude by 0.2. Page changes reset scrolling. Disconnected automatic navigation uses 0.05 increments, page-0 postincrement comparison >180, page-1 comparison >1000, and page-2 scrolling while its timer is below 1000. Its Boolean is not an exact mutation detector: an overshooting step can clamp the offset while returning false. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmresultplayer.c#L521-L697)

At animation frame >=50, statistics setup computes whether any type-0 slot exists and chooses a later delay of 10 or 20. Type-0 slots support reversible Start toggles and finish on controller error. Type-1 slots delegate to controller-sensitive navigation; with no type-0 participants, connected type-1 or type-3 ports can request completion. Type 2 has a distinct initialization no-op and must not be silently treated as type 3. Indicator visibility and the four-slot completion reduction are separate operations. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmresultplayer.c#L699-L919)

## Setup and cross-file state

Mode display setup selects subtree 0xC, 0x11, 0x10, or 0x15 for match kinds 2, 1, 3, or other values, respectively. It removes animation from alternatives and evaluates the selected subtree at the absolute signed-byte `xC` frame before resetting controllers. Presentation startup initializes six records, applies canceled/team texture branches, optionally emits a positive aggregate-count effect, and enters phase 1. Local names such as rank and taunt do not independently establish authored asset semantics. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmresultplayer.c#L921-L1195)

Winner queries read the companion's copied `lbl_8046E3AC.match_end`, not merely the active record used by UI routines. They count qualifying participants separately even in teams. Layout mode is count-minus-one with zero fallback; ordinal returns the total qualifying count when the argument is not a qualifying slot. The companion consumes these as score-table row/column and camera-depth inputs. Its initialization copies the active match and rewrites loser flags for `OUTCOME_NO_CONTEST`, so the copy's lifetime and mutations matter. [Queries](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmresultplayer.c#L1315-L1367), [consumer](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1798.c#L317-L365), [copy](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1798.c#L596-L639).

Source declarations establish configuration contents, but not compiled section extent, constant-pool duplication, or cross-symbol contiguity. The companion's `CameraKindData` reinterpretation is an observed source operation, not proof that the linker realizes that layout.

Status: synthesized; independent review and live promotion pending.
