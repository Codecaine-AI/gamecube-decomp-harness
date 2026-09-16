# Marth side-special semantic review

The owned C implementation and header define the four-stage ground/air side-special sequence associated with Dancing Blade. All canonical and rendered pages, all 62 subjects, and all 47 links were examined. Rendered names were treated as hypotheses, not independent evidence.

## Entry and continuation

Both initial entry routines clear `cmd_vars[0]`, `cmd_vars[1]`, and `mv.ms.specials.x0`, choose state **349 grounded / 358 otherwise**, and call `ftAnim_8006EBA4`. Ordinary entry zeroes vertical velocity. Aerial entry first divides horizontal velocity by attribute `x14`; if fighter-kind field `u.ms.x222C` is zero, it sets that field to one and assigns vertical velocity from `x1C`, otherwise it assigns zero. This is an assignment, not an additive impulse. The attribute's sign and complete external reset lifetime are not established here. [Entry](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMars/ftmarsspecials.c#L20-L82)

Stages 1–3 inspect **pressed** A/B buttons. With `cmd_vars[0]` nonzero, continuation requires `cmd_vars[1]` to remain zero. A press while `cmd_vars[0]` is zero sets the blocking latch; it is not a buffered successful continuation. Stage 4 IASA is empty. Animation callbacks exit on exhausted frames through grounded `ft_8008A2BC` or airborne `ftCo_Fall_Enter`.

Later entries reset both command variables and select these numeric pairs:

| Stage | Above positive threshold | Below negative threshold | Fallback |
|---|---|---|---|
| 2 | 350 / 359 | 351 / 360 | 351 / 360 |
| 3 | 352 / 361 | 354 / 363 | 353 / 362 |
| 4 | 355 / 364 | 357 / 366 | 356 / 365 |

Pairs are ground / air. Comparisons are strict; equality follows the remaining branches. These labels describe the actual selector comparisons rather than substituting an unread state enumeration. [Stage 2](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMars/ftmarsspecials.c#L285-L308), [Stage 3](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMars/ftmarsspecials.c#L425-L457), [Stage 4](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMars/ftmarsspecials.c#L560-L591).

## Shared callback and cross-file lifetime

`ftMs_SpecialS_80137A68` is installed into `x21EC` by **all three later-stage entries**, not only stage two. It calls `ft_80089824` followed by `ft_800892A0`. The former resets/repopulates attack bookkeeping and obtains an attack sequence value; the latter refreshes the stale attack instance for the current attack ID. The wrapper itself does not enqueue a connected hit.

The earlier provisional uncertainty about callback consumption is resolved: fighter motion-state processing calls and clears `x21EC` after selecting the new move metadata, before the ordinary attack-count path. The later-stage entries use `Ft_MF_SkipAttackCount`. This is a synchronous transition callback, not a recurring stage-two callback. [Wrapper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMars/ftmarsspecials.c#L279-L308), [consumer](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/fighter.c#L1195-L1218), [record reset](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_0892.c#L84-L122), [record sequencing](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_0892.c#L191-L199), [stale-instance refresh](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_0881.c#L317-L394).

## Physics and terrain transfers

Stages 1–2 use grounded friction/movement or airborne falling with `x20`/`x24` and air friction with `x18`. Stages 3–4 instead use the ground helper that conditionally derives acceleration from animation translation when `x594_b0` is set, otherwise applies friction; airborne processing applies falling and then overwrites horizontal velocity from animation translation and facing. [Ground and animation movement helpers](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_084E.c#L42-L159), [falling clamp](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcommon.c#L462-L468).

Collision callbacks dispatch ground-loss and landing conversions. Later-stage converters map the supported numeric pairs above and pass `cur_anim_frame` as the destination start frame with shared transition flags. Every landing converter clears `u.ms.x222C`; that fighter-kind storage must not be conflated with move-local `mv.ms.specials.x0`. The switches contain no default and leave `msid` uninitialized for unexpected motion IDs. There is no local BUGFIX default assertion. Common grounded setup does have a separate support assertion, so absence of a local default assertion does not mean the entire conversion path cannot assert. [Common situation setup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcommon.c#L515-L594).

## Evidence limits

The header supplies matching `void(HSD_GObj*)` declarations, not compiled layout evidence. No compiled artifacts were supplied; source uses of zero and one cannot establish `.sdata2` size, contents, or load provenance. The ledger preserves those claims as unresolved. Descriptive transition names remain inferred, and the shared callback's stage-two-specific name is superseded.

Status: synthesized; independent review and live promotion pending.
