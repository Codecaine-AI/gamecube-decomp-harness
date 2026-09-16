## Master Hand Poke lifecycle

`ftMh_MS_358_80152880` enters the symbolic state `ftMh_MS_Poke1`, calls `ftAnim_8006EBA4`, initializes `mv.mh.unk13.x0 = x94 + HSD_Randi(x90 - x94)`, and clears movement gate `x4`. `ftMh_Poke1_StartAction` is a reasonable descriptive hypothesis, not a recovered original name. The numeric-looking original function name does not establish the numeric value of the requested state.

`ftMh_Poke1_Anim` does nothing while frames remain. Otherwise it sets `x4`, pre-decrements `x0`, and transitions only if the result is negative. That branch clears the gate and self-velocity X/Y, enters Poke2, calls the animation helper, and plays SFX 320007 with arguments 127 and 64. A nonnegative result leaves Poke1 active; this callback contains no explicit animation restart. Neither branch explicitly clears self-velocity Z. [Canonical lifecycle](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandpoke.c#L20-L52).

`ftMh_Poke1_IASA` forwards the original object to `ftBossLib_8015BD20` only for `Gm_PKind_Human`; all other slot kinds skip that call. The rendered CrazyHand-specific helper name does not establish its implementation or justify changing this Master Hand callback's affiliation. [Canonical IASA](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandpoke.c#L61-L67).

## Steering and numerical branches

Physics always calls `ft_80085134` first. With `x4` nonzero, it obtains a position through `ftBossLib_8015C208`, adds attribute offsets x98/x9C, forces destination Z to zero, and subtracts the fighter's current position. Length includes all three displacement components: forcing destination Z to zero does not establish zero displacement Z. When `len < x2C`, displacement X/Y directly replace self-velocity X/Y. Equality and the remaining comparison outcomes take the normalization-and-scaling branch, using `len * x28`; only X/Y are ultimately stored. With the gate clear, this callback performs no steering writes after the unconditional helper. No local validation establishes positive thresholds, valid random bounds, or zero-distance normalization safety.

The local square-root helper uses reciprocal-square-root estimation and three double-precision refinement steps for positive inputs, then rounds through a volatile float. Inputs failing `x > 0` are returned unchanged. Source literals do not establish their compiled section placement. [Canonical numerical implementation](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandpoke.c#L69-L135).

## Completion across the file boundary

`ftMh_Poke2_Anim` forwards its object to `ftMh_MS_389_80151018` only after animation exhaustion. The callee clears `mv.mh.unk0.x20`, constructs a destination from attribute x30_pos2 X/Y with Z zero, sets `u.mh.x2258` to Wait2_1, and then tests it against Wait2_0. That immediate test takes the other branch, invoking the Wait1_2 initializer. It stores `ftMh_MS_341_8014FFDC` as the arrival callback and copies the stack-local destination into move-local storage; no pointer to that local escapes. Wait physics consumes the stored destination, and wait collision clears all three velocity components and invokes the stored callback when x18 is zero. This is a cross-file move-variable lifetime change, not merely a return from the Poke callback. [Poke completion](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandpoke.c#L54-L59), [Wait entry](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandwait12.c#L19-L32), [stored destination and arrival handling](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandwait12.c#L93-L138).

## Adjacent callback and interface

`ftMh_PaperCrush_Coll` is entirely empty, despite residing in the Poke unit. The header declares all six exported void(HSD_GObj*) functions; the two inline numerical helpers remain implementation-local. [Empty callback](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandpoke.c#L18-L18), [header interface](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandpoke.h#L1-L14).

All owned canonical and rendered lines and all baseline subjects and links were reviewed. Rendered substitutions were treated as hypotheses. The ledger retains 30 facts and 21 links, with nine facts unresolved; conceptual Poke links preserve existing affiliation without independently confirming external gameplay particulars.

Status: synthesized; independent review and live promotion pending.
