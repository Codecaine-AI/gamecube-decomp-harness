## Crazy Hand waiting and action selection

This unit defines the authored action-selection aggregate, stage-dependent startup routing, paired base-wait entry helpers, the wait animation/IASA/physics/collision callbacks, and a held-controller-button action dispatcher. The header declares seven public functions; the remaining entry/input helpers are static. All owned canonical and rendered pages were reviewed, together with all 25 subjects, 71 facts, and 21 links. The checkpoint ledger explicitly accounts for 55 retained facts, 16 unresolved facts, 20 retained links, and one unresolved link.

### Startup and anchored waiting

`ftCh_Init_80155FCC` routes stage-query result `0xFB` to `ftCh_Init_80156310`; every other result delegates to `ftCh_GrabUnk1_8015B174`. Fighter startup selects this dispatcher for `FTKIND_CREZYH`. The special helper clears `cmd_vars[1]`, seeds the remembered wait state, temporarily assigns motion `0x183`, and loads only current X/Y from attributes `x18`/`x1C`. It then enters Wait1_0 at frame zero and caches the resulting position, including the existing Z. The alternate initializer explicitly zeros Z, enters motion `0x183`, installs its camera callback, initializes its phase, and performs additional sound/facing setup. Its TagFail animation subsequently stages a return toward waiting. Stage 251's public stage/mode identity remains unresolved.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/fighter.c#L914-L930; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandwait10.c#L67-L134; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandgrabunk1b174.c#L25-L159.

The two base-entry helpers independently control spatial and animation continuity. Entry from either base wait restores `x2240_pos`; other motions establish a new anchor. The first helper enters `ftMh_MS_Wait1_0`, preserving the current frame only for remembered marker `0x184`. The second enters literal `0x156`, preserving the frame only for marker `0x185`. Both record their destination afterward. `ftCh_Init_80156198` first clears `cmd_vars[1]` and chooses the second helper only for `0x185`. These numeric continuation markers must not be silently renamed using Master Hand analogy. The renderer's proposed `ftCh_Wait1_0_Enter` collides between the first helper and the two-way wrapper; the C view suppresses both substitutions while the header substitutes the wrapper.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandwait10.c#L78-L162; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandtagcancel.c#L22-L75.

### Timed selection and exceptional branches

The aggregate contains 18 state selectors, a 20-byte index array, six start/count pairs with counts 4/4/3/2/2/3, and a 32-byte transition array. Normal category selection indexes a five-entry row using the previous category. Those rows omit the previous category. A boss-library condition restricts selection to the first four entries; category 5 is consequently unavailable on that path. The condition queries Master Hand's motion against numeric `0x158`/`0x159`. Equality of `x2254` with attribute `xC` instead forces category 2 and resets the counter, bypassing the normal nonrepeat choice. Otherwise category 2 resets the counter and other categories increment it.

`ftCh_Wait1_0_Anim` consumes a nonzero command signal once. Slot type zero invokes the held-button dispatcher, then checks animation completion against the current motion. Other slot types decrement the floating wait countdown `x223C`; a negative result reloads the delay and selects an action. The shared delay helper computes `((arg3 / arg0) + HSD_Randi(arg4 - arg5) + arg5) / arg2`. This is not a CPU-only equality guard: every nonzero slot type follows this branch.

The selected category and state are written to `x224C` and `x2250` before suppression. `x221D_b4` replaces only the local dispatch value with Wait1_0, which has no switch arm; the stored choice and refreshed timer remain. The callback does not explicitly read `x2250`. When the countdown has not expired, completed base animations run the paired wait-loop helpers. The expired-timer branch does not also execute that idle-completion branch.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandwait10.c#L42-L65; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandwait10.c#L164-L326; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftbosslib.c#L36-L40; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftbosslib.c#L177-L185; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/types.h#L12-L23.

Dispatch either calls a direct initializer or constructs a destination and passes a continuation callback. Destinations come from the stage-left floor coordinate with overridden Y, fixed attribute coordinates, or two independent random offsets around an attribute center. BackAirplane2 and BackAirplane3 share one initializer. Squeezing1, Squeeze, and Throw share `fn_8015AAC8` but use different destinations. The exceptional Slam arm only constructs a vector and breaks: it does not stage the continuation, and Slam is absent from the 18-element selection table. Internal selector names are not independent proof of public move names.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandwait10.c#L220-L316.

### Human input and cross-file lifetimes

`ftCh_Init_80156AD8` reads held buttons from `HSD_PadMasterStatus[3]`, not the fighter's dynamically chosen controller index. Its ordered else-if ladder selects at most one chord per invocation. L, R, B, Z, A, and Y chord families route into the corresponding canonical setup calls. One branch remains expressed as bit 5 plus bit 0. Z branches record BackAirplane2/3 before their shared initializer. All four Y branches record their distinct selector and stage `fn_8015AAC8`, including Slam—unlike the CPU switch's vector-only Slam arm. Unrecognized input has no local effect. Historical debug/test intent and the complete public move-name mapping remain unresolved.

Destination pointers passed to `ftCh_GrabUnk1_8015BA34` refer to local vectors, but the callee copies `*pos` into `fp->mv.ch.unk0.xC` and stores the callback separately in `x4`; it does not retain the stack pointer. Later physics moves toward the copied destination. Collision processing stops velocity and invokes the saved callback when the distance field reaches zero. The return-to-wait path stores `ftCh_Init_80156198` as that continuation. TagRockPaper's continuation enters numeric state `0x180`; its animation checks Master Hand conditions and can stage return to waiting. The broader meaning of every selected-state consumer is not inferred from this local dispatch alone.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandwait10.c#L343-L436; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandtagcancel.c#L50-L132; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandtagrockpaper.c#L14-L30.

### Remaining callbacks and evidence limits

IASA gates `ftBossLib_8015BD20` on Human slot classification; the canonical callee immediately returns. Physics unconditionally delegates to `ft_80085134`, which assigns X self-velocity from animation translation Z times facing direction and Y from animation translation Y, leaving Z velocity untouched. Collision and `ftCh_Init_80156014` are empty.

No compiled artifacts were supplied. C declarations and literal expressions establish source-level roles, not `.sdata2` contents, compiled aggregate size, switch-table placement, or the remainder of `.data`. Those baseline layout claims remain unresolved.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandwait10.c#L76-L76; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandwait10.c#L328-L341; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftbosslib.c#L31-L34; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_084E.c#L120-L125.

Status: synthesized; independent review and live promotion pending.
