# Training Mode support

This revision's `gm_1884.c` implements Training Mode's in-match settings, statistics and presentation. It does not contain the historical Classic encounter table or All-Star result callback. `CssSubStruct` reuse does not make its GmTrain presentation a character-selection screen.

## State and lifetimes

`gm_80189CDC` modifies incoming match rules, copies four player records into training state and `gm_80473814.saved_players`, derives `mode` from player 0's slot minus one, sets opponent count to one, and clears 27 character records. Numeric rule fields are preserved without assigning unsupported meanings. `fn_8018A000` separately clears the result cache and constructs presentation resources. The Reset command does not clear either character records or the result cache. [Initialization](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1884.c#L880-L943)

`fn_8018846C` maintains a character-indexed maximum and a separate sticky nonzero hit count; `gm_80188454` reads the maximum without bounds checking. `fn_801884F8` retains the last nonzero accumulated-damage integer. Their underlying player getters distinguish latest event damage, accumulated opponent damage, and interaction count. The upstream count excludes several numeric event categories even where damage still accumulates. Training Mode exit narrows the session maximum to `u16` before passing it to a per-character maximum updater. [Local producers](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1884.c#L111-L152) · [Player statistics](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/pl/pl_040D.c#L29-L159) · [Exit consumer](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmtrainingmode.c#L256-L267) · [Record updater](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1601.c#L1811-L1830)

## Opponents and reset

`fn_80188550` reconciles requested opponent count with slots 1–3, leaving slot 0 untouched. Equal counts do nothing. Increasing skips represented slots and requests activation; decreasing uses `j` when the old count is three, otherwise `to_remove + 1`. The observed menu domain is 1–3, but this function validates neither the request nor helper success before committing it. Spawn/removal helpers can fail under their own runtime guards. `fn_80188644` restores player 0's facing, HUD damage, position and status, removes previously counted opponents, conditionally recreates slot 1, and sets menu values to `{2,0,0,0,0,0,0}`. Participation `slot_type=1` must not be confused with CPU behavior type 1. [Roster and reset](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1884.c#L154-L251) · [Conditional helpers](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_16AE.c#L2172-L2224)

## Digits and visual refresh

`fn_80188738`, `fn_80188910`, and `fn_80188B3C` update latest-damage, hit-count, and accumulated-damage digit chains, respectively. The argument is the ones JObj, followed by tens and hundreds siblings. They test an upper limit of 999, but their non-saturated paths can sample again; they provide no lower clamp. `fn_80188D3C` instead receives the parent of the CPU-damage digit chain and relies on the menu handler for its 0–999 domain. Leading-place suppression requests frame 10; an interior zero tens digit remains frame 0. Literal blank appearance requires asset confirmation. [Digit routines](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1884.c#L253-L413)

`fn_80188EE8` is an unused-argument visual process, not the GX draw callback. It updates visibility, bounded animation counters, text position, four numeric displays, option frames and cursor presentation. It preserves the US item-index-19 text exception and the cursor remap from 2 to 3 when `mode==3`. Its initial text selection of `0x1E` is followed by an item-text selection in the same invocation. [Visual process](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1884.c#L415-L507)

## Input and option application

`fn_801891F4` polls using the slot-derived `mode` and uses `x01` as a transition latch around `gm_801A45E8(2)`. Navigation wraps rows 0–8 and skips row 5, although a row-5 switch branch remains. Rows control speed, item selection/spawning, opponent count, CPU behavior, damage, a skipped binary option, camera selection, Reset and exit. Item navigation covers indices 0–29; the table additionally contains an `It_Kind_None` entry. Spawning uses player 0's position plus 10 on Y. Many branches return immediately, preserving input precedence.

On the first closed invocation, it applies the selected timing interval, opponent count, CPU behavior, damage and camera selection, then clears the latch. The six speed multipliers are `{2,1.5,1,0.666,0.5,0.25}`. HUD damage is applied to counted opponents, whereas `fn_8016B388` is called for every slot 1–3 with the full-width menu integer. Damage repeat-delay calls occur when decrement reaches 0 or increment reaches 999, not on wrapping. Row 6 dispatches camera helpers, separately from row 3's CPU behavior; its final branch preserves the `mode==3` argument exception. [Input and transitions](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1884.c#L522-L836) · [Camera family](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1601.c#L2529-L2581)

## Presentation construction and evidence limits

`fn_80189B88` creates separate input and visual GObjs, attaches the loaded model, registers a distinct GX callback, caches 39 JObjs, seeds counters 22 and 1 to 30, and initializes menu defaults. `fn_8018A000` loads GmTrain, selects `SdTrain.usd` or `SdTrain.dat` using saved language, creates the retained text, sets scale fields to 0.7/0.6, fitting to 1 and alignment to 2, and returns that same text pointer. Teardown ownership and repeated-initialization safety are not established here. [Construction](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1884.c#L841-L943)

All owned canonical and rendered pages were reviewed. Rendered names remain hypotheses. The C renderer reports one parse error affecting the final initializer; the header reports a shadowed binding for that initializer. The header retains placeholder parameters/return for `fn_801891F4`, while its definition is `void(void)`. No compiled section placement, binary layout, or matching claim is made.

Status: synthesized; independent review and live promotion pending.
