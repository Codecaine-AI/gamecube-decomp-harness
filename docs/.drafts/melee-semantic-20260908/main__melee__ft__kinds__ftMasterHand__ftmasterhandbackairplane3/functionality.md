## Scope and evidence
Inherited research covers all 77 canonical and rendered implementation lines, all 18 header lines, 18 subjects, 43 facts, and 14 links. Its dispositions remain unchanged: 30 retained facts, 13 unresolved facts, two retained links, and 12 unresolved links. The lead independently read the implementation and contextual contradiction evidence, reconciled both artifacts, and found no correction requiring an override. The final proposal is empty.

## BackAirplane3 callbacks
`ftMh_BackAirplane3_Anim` invokes `ftMh_MS_389_80151018` only after animation exhaustion, with no direct Fighter mutation. Its IASA callback calls `ftBossLib_8015BD20` only when the numeric player-slot type equals zero; that shared hook immediately returns. The rendered CrazyHand IASA name is not evidence of input processing. Physics forwards the object unchanged to `ft_80085134`; collision is empty.

Evidence: [callback bodies](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandbackairplane3.c#L13-L33), [empty hook](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftbosslib.c#L31-L34).

## BackPunch entry and lifetime
`ftMh_MS_369_80153B90` calls `Fighter_ChangeMotionState(gobj, ftMh_MS_BackPunch, 0, 0, 1, 0, 0)`, then `ftAnim_8006EBA4`. It copies attribute `x6C` into `mv.mh.unk0.x0`, obtains a selected fighter's position, assigns that position's x to Master Hand and attribute `x68` to y, and clears all three self-velocity components. Position z is not assigned locally. The numeric-looking entry symbol is not treated as proof of a numeric state identifier.

`ftMh_BackPunch_Phys` pre-decrements the counter each invocation. A strictly positive result calls `ftBossLib_8015BF74(gobj, da->x58)`; otherwise only horizontal self-velocity is cleared. There is no local counter clamp or direct state transition. The shared helper adds target-relative horizontal displacement to existing horizontal velocity, using a signed parameter-sized increment in its large-displacement branch rather than assigning constant speed. Configured duration and extreme counter behavior remain unspecified.

`ftMh_BackPunch_Anim` clears horizontal self-velocity and invokes the shared completion routine only after animation exhaustion. Its IASA callback has the same numeric-zero gate and empty shared hook as BackAirplane3.

Evidence: [entry and callbacks](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandbackairplane3.c#L35-L76), [velocity accumulation](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftbosslib.c#L82-L98).

## Cross-file dependencies and exceptional paths
The selector compares squared x/y distances using positions obtained through `ftLib_800866DC`, skips same-player candidates through a helper, and excludes flagged candidates and applicable teammates. Its result starts as NULL and can remain NULL. The position-helper chain subsequently copies the selected fighter's `cur_pos` without a local null guard. Successful selection is therefore a precondition for normal entry and steering, not an established universal invariant.

Evidence: [selection](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftlib.c#L113-L160), [helper chain](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftbosslib.c#L146-L156), [position copy](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftlib.c#L299-L303).

Completion clears `mv.mh.unk0.x20`, constructs a return position from attribute `x30_pos2` with z zero, writes Wait2_1 bookkeeping, then tests that bookkeeping against Wait2_0. The else path calls `ftMh_MS_389_80150C8C`, which enters Wait1_2. Writing Wait2_1 is not equivalent to entering that state. Completion then stores `ftMh_MS_341_8014FFDC` in `mv.mh.unk0.x4` and copies the return position into `xC`; neither depends on the local position variable remaining alive. Wait physics consumes `xC`; when `x18 == 0`, wait collision clears all self-velocity components and invokes the stored callback if non-null.

Evidence: [completion](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandwait12.c#L115-L138), [Wait1_2 entry](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandwait12.c#L19-L32), [later consumers](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandwait12.c#L93-L113).

## Header, rendering, and limits
Inherited header review establishes eight `void(HSD_GObj*)` declarations. Address comments and the `19 Ram` annotation do not independently prove compiled layout or player-facing move names. Inherited rendering reports zero parse errors, five implementation function-name substitutions, and no header substitutions. Rendered hypotheses remain separate from canonical evidence. No compiled evidence supports section-content or layout claims for `.sdata2`. Jetstream/okuhikouki, Flying Punch/okupunch, debug controls, and visual background interpretations remain deferred rather than inferred from names or unread wiki citations.

Evidence: [header](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandbackairplane3.h#L1-L18).

Status: synthesized; independent review and live promotion pending.
