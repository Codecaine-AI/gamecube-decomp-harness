## BackAirplane1

This unit defines Crazy Hand's BackAirplane1 initializer and four `void(HSD_GObj*)` callbacks; the header declares all five. Canonical and rendered versions of both owned files were reviewed completely. Rendered substitutions are naming hypotheses, not independent evidence.

### Entry and lifetime

`ftCh_Init_801592D4` clears `cmd_vars[1]`, enters numeric motion state `0x16F` with floating arguments `0.0f, 1.0f, 0.0f`, invokes animation initialization, sets `x2222_b2`, calls the two common helpers, passes the stored victim to `ftCh_GrabUnk1_8015B670`, and stores destination `(da->xCC_pos.y, da->xD4, 0)` in `mv.ch.unk0.xC`. There is no local victim-null guard or explicit assignment to `x18` or the continuation selector. Evidence: [entry](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandbackairplane1.c#L21-L35).

FingerGun2 calls this entry after animation exhaustion when `mv.ch.unk0.x20 == 1`; this selector is distinct from BackAirplane1's later `u.mh.x2250` test. The victim helper enters numeric state `0x151`, makes the victim invisible, and installs an accessory callback. Its animation callback also has a grab-timer escape branch, so normal throw completion is not the only cross-file path. Evidence: [incoming transition](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandfingergun2.c#L41-L62), [victim setup and escape](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandcapturedamagecrazyhand.c#L15-L37).

### Animation and input

A nonzero `cmd_vars[1]` invokes `ftBossLib_8015C5F8` and is then cleared. Independently, exhausted animation dispatches to `ftCh_Init_801594D4` when `u.mh.x2250 == 0x170`, otherwise to `ftCh_Init_80159670`. Cue processing and transition can occur in the same update; the cue may recur if another producer sets it again. The IASA callback calls `ftBossLib_8015BD20` only for `Gm_PKind_Human`; all other classifications do nothing locally. Evidence: [animation and IASA](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandbackairplane1.c#L37-L62).

### Movement and stopping

Physics first calls `ft_80085134`, which derives x/y velocity from animation translation, then calls `ftBossLib_8015BE40` with the stored destination, `&x18`, threshold `da->x14`, and scale `da->x10`. The second helper overwrites—not adds to—the first helper's x/y velocity. It writes zero to `x18` when distance is strictly below the threshold; otherwise it writes distance and scales normalized displacement. Even below threshold it writes the unscaled displacement to x/y velocity. Collision subsequently clears all three velocity components exactly when `x18 == 0`; nonzero values leave velocity unchanged. Neither callback directly changes motion state. Evidence: [physics/collision](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandbackairplane1.c#L64-L79), [root velocity](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_084E.c#L120-L125), [movement helper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftbosslib.c#L57-L80).

### Continuations and interpretation

The two destinations enter `0x170` and `0x171`. Each resets command slot 0 and later services a victim-release cue. Both call the victim helper before checking the stored victim pointer; subsequent common throw handling is conditional on that pointer remaining non-null. Variant 2 explicitly reverses the victim's damage-facing direction; variant 3 does not. Both clear `x20` after the cue and independently invoke tag-cancel handling when animation ends. These bodies support the captured-opponent reverse-throw interpretation, not the historical Jetstream link. The public move name remains an interpretation rather than a recovered source symbol. Evidence: [variant 2](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandbackairplane2.c#L20-L48), [variant 3](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandbackairplane3.c#L20-L46).

No compiled section size, layout, or literal provenance is established by this source review.

Status: synthesized; independent review and live promotion pending.
