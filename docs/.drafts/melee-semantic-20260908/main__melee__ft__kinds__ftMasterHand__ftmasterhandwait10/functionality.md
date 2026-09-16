# Master Hand waiting controller

## Startup and wait continuity
`ftMh_MS_341_8014FE10` dispatches Master Hand's initial behavior using the internal `StKind`: 251 takes `ifStage251`; every other value calls `ftMh_MS_343_801510B0`. The special helper sets the private marker to Wait1_0, temporarily assigns the Entry motion ID, changes only current X/Y from `x30_pos2`, caches the resulting complete position, and enters Wait1_0 at frame zero. Its apparent frame-preservation alternative is unreachable after the marker assignment. Unlike normal Entry setup, it does not explicitly zero Z or install the Entry camera callback. No public stage name is assigned to 251.

`ftMh_MS_341_8014FE5C` enters Wait1_0; `ftMh_MS_341_8014FF1C` enters Wait2_0. Both restore `x2240_pos` when the current motion is either base wait motion and otherwise establish a new anchor from `cur_pos`. They retain the current animation frame only for their respective Wait1_2 or Wait2_1 private continuation marker. `ftMh_MS_341_8014FFDC` selects Wait2_0 only for a Wait2_1 marker; all other markers select Wait1_0, with frame preservation only for Wait1_2. Thus it does not preserve an arbitrary current Wait2 motion merely because that motion is active.

Evidence: [startup and wait helpers](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandwait10.c#L39-L146), [construction dispatch](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/fighter.c#L914-L930), [normal Entry setup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandentry.c#L22-L80), [internal stage accessor](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/stage.c#L334-L337).

## Per-frame scheduling
`ftMh_Wait1_0_Anim` separates slot type zero from all other slot types. The zero path calls the held-button dispatcher first, then checks animation completion and the resulting current motion. The nonzero path decrements `x223C`; only a negative result reloads the delay and attempts attack selection. A nonnegative result instead permits animation-completion processing. The expiration path does not also execute that completion fallback when no attack is dispatched.

The delay helper computes `((arg3 / arg0) + HSD_Randi(arg4 - arg5) + arg5) / arg2`. Here its inputs are CPU level, `x2238`, and attributes `x18`, `x20`, `x1C`. The helper contains no local protection against invalid divisors or random bounds; this pass does not establish their runtime validity.

The ordinary AI path selects an attack category from the prior `x224C` row, except that exact equality of `x2254` and attribute `x24` forces category 2. Selecting category 2 resets the counter; another category increments it. The aggregate supplies fourteen states, an index array, category start/count pairs, and six five-byte rows. Operative ranges are 0–2, 3–6, 7–9, 10–11, and 12–13. Row zero is `[1,2,3,4,0]`, so category zero can repeat. Rows one through four exclude their own category and contain zero twice. The sixth row and range are zero-filled; their presence does not establish a sixth normal attack family or safe handling of arbitrary category indices.

Selection writes `x224C` and `x2250` before checking `x221D_b4`. Suppression replaces only the local dispatch value with Wait1_0, for which the switch has no case; it neither erases the stored selection nor explicitly changes motion to Wait1_0. Both ordinary Throw and Slam selections call the same grab-approach initializer.

Evidence: [aggregate](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandwait10.c#L148-L169), [controller](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandwait10.c#L171-L354), [delay calculation](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftbosslib.c#L36-L40).

## Combination selection and deferred lifetimes
The AI combination guard queries Crazy Hand's current motion, but `ftBossLib_8015C4C4` separately returns Crazy Hand's stored `x2250`, or zero if no matching fighter exists. These are distinct state channels. The `ftMh_MS_*` spellings used to compare Crazy Hand values must not be interpreted as proof that they describe Crazy Hand's corresponding animation names.

For the selected values spelled Squeezing1, Squeeze and Throw, the controller supplies destinations from `x124_pos`, `x12C_pos` and `x134_pos` and callbacks `ftMh_MS_380_80155194`, `ftMh_MS_382_801552F8` and `ftMh_MS_383_80155484`. The Slam case merely fills a local vector from `x13C_pos`; it calls no setup routine. Unmatched values also dispatch nothing. The manual Y+Up branch has the same exception and does not repeat the AI current-motion guard.

`ftMh_MS_389_80150DC4` does not immediately call the supplied attack callback. It enters a continuation wait phase, stores the callback in `mv.mh.unk0.x4`, and copies the destination by value into `mv.mh.unk0.xC`. Consequently the caller's stack vector need not survive the call. Continuation physics updates the approach distance; continuation collision processing stops velocity and invokes a non-null stored callback when `x18 == 0`. That collision body does not itself clear the callback. Return-to-wait setup also stores `ftMh_MS_341_8014FFDC` as a later callback.

Evidence: [combination dispatch](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandwait10.c#L222-L248), [selection accessor](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftbosslib.c#L247-L258), [deferred destination and callback lifetime](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandwait12.c#L51-L138).

## Human input and remaining callbacks
`ftMh_MS_341_80150894` reads held buttons from fixed controller index 2, not from the fighter's player ID and not from an edge-triggered press field. Its single else-if ladder gives priority to L+Up/Right/Down, R+Up/Right/Down/Left, A+Up/Right/Down, B+Up/Right, Z+Up/Right, then Y+Up. Only the first matching chord branch executes. The Z branches store Throw or Slam before invoking the common grab approach. Beam destinations use independent random X/Y samples around the configured center. No matching chord causes no local transition.

IASA queries slot type and calls `ftBossLib_8015BD20` only for zero; the parallel Crazy Hand callback names its corresponding classification Human. The shared callee is empty at this revision. Physics unconditionally delegates to `ft_80085134`, which replaces X velocity with translated Z times facing direction and Y velocity with translated Y; it leaves Z velocity untouched. `ftMh_Wait1_0_Coll` and `ftMh_MS_341_8014FE58` are empty. The header declares the nine public routines; the local entry helpers remain static.

Evidence: [input and callbacks](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandwait10.c#L356-L477), [empty hook](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftbosslib.c#L31-L34), [physics callee](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_084E.c#L120-L125), [public declarations](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandwait10.h#L1-L17).

## Evidence boundaries
Canonical and rendered views were read through both owned files. Rendered substitutions were treated as hypotheses, not proof. The Init-style names have canonical Crazy Hand analogues but are not recovered original spellings. The rendered Crazy Hand action-state accessor name obscures its actual stored-selection read. Source aggregate semantics are retained without asserting compiled section extent. No supplied artifact establishes the claimed .sdata2 size, contents, literal encoding, padding or runtime write properties.

Status: synthesized; independent review and live promotion pending.
