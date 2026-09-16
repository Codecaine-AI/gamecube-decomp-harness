## Crazy Hand Walk family

The owned C file defines three entry helpers and animation, IASA, physics and collision callbacks for WalkLoop, WalkWait and WalkShoot. The header declares all fifteen functions with `void(HSD_GObj*)` signatures. Both canonical and rendered files were read completely; rendered substitutions were treated as hypotheses rather than evidence.

### Entry and animation progression

`fn_801578E8` enters `ftMh_MS_WalkLoop` and calls `ftAnim_8006EBA4`. On animation exhaustion, `ftCh_WalkLoop_Anim` obtains the fighter and attributes, enters WalkWait through `ftCh_Init_801579F4`, and only afterward copies attribute `x64` into `mv.ch.unk0.x8`. Thus the countdown initialization belongs to the caller, not the WalkWait entry helper. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandwalk.c#L18-L55)

WalkWait predecrements `x8` and calls the WalkShoot initializer when the result is zero. It then independently queries remaining animation frames: there is no `else` or early return. If that query reports exhaustion, it enters literal state `0x160` and calls `ftAnim_8006EBA4`. The query therefore observes the object after any preceding Shoot transition. A zero initial countdown is not an immediate zero-trigger: it is decremented first. This pass preserves `0x160` explicitly rather than treating it as a separately proven exit or restart identity. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandwalk.c#L57-L67)

WalkShoot entry clears only `self_vel.x`, changes to `ftMh_MS_WalkShoot`, and performs the animation follow-up. Shoot animation exhaustion calls `ftCh_GrabUnk1_8015BC88`. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandwalk.c#L89-L102)

### Input and movement

Each IASA callback forwards to `ftBossLib_8015BD20` only for `Gm_PKind_Human`; other slot kinds do not dispatch through these callbacks. All three collision callbacks are empty. This establishes local no-op collision behavior, not absence of collision processing throughout the engine. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandwalk.c#L35-L117)

Loop and Shoot physics delegate solely to `ft_80085134`, whose canonical body assigns horizontal velocity from translation-offset Z times facing direction and vertical velocity from translation-offset Y. WalkWait invokes that helper, then `ftBossLib_8015C010(gobj, da->x68)`, then `ftBossLib_8015C190`. The second operation replaces horizontal velocity with target displacement capped by its argument under the usual nonnegative-cap assumption; vertical velocity survives. The last operation corrects current X position outside floor 0's endpoints and clears horizontal velocity there. It does not predict the next position or enforce arbitrary stage geometry. [Caller](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandwalk.c#L77-L85), [translation velocity](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_084E.c#L120-L125), [tracking and bounds](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftbosslib.c#L100-L156).

Target selection minimizes squared XY distance using `ftLib_800866DC` positions, excluding same-player candidates, flagged candidates and teammates when applicable; the selected target's current position is then fetched. Selection may return NULL, but this call chain has no explicit no-target guard before the position accessor. [Selection](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftlib.c#L113-L160), [accessor](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftlib.c#L299-L303).

### Cross-file exit lifetime

The Shoot completion helper clears `mv.ch.unk0.x20`, constructs a destination from attributes `x18` and `x1C`, writes `u.mh.x2258 = 0x184`, then tests that field against `0x156`. In the shown sequential source the preceding assignment selects the non-`0x156` branch. It subsequently stores `ftCh_Init_80156198` in `mv.ch.unk0.x4` and copies the local destination vector into `xC`; no pointer to that stack vector is retained. TagCancel physics consumes the stored destination, and its collision callback invokes the stored callback when `x18 == 0`, after clearing velocity. The rendered exit name alone does not explain this deferred return path. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandtagcancel.c#L89-L133)

### Evidence limits

Source literals do not prove `.sdata2` size, layout or relocation ownership. The visible Spider Walk/finger-crawling correspondence and debug-mode interpretation remain unverified rather than rejected. No compiled layout claims are made.

Status: synthesized; independent review and live promotion pending.
