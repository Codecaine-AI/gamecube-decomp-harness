## BackCrush continuation prelude

`ftCh_Init_801597F0` obtains the fighter, calls `Fighter_ChangeMotionState(gobj, 0x173, 0, 0.0f, 1.0f, 0.0f, NULL)`, calls `ftAnim_8006EBA4`, and only then stores the caller's event in `fp->mv.ch.unk0.x4`. The proposed name `ftCh_BackCrush_Enter` is consistent with this canonical implementation, rather than established by its rendered substitution. The numeric state remains explicitly `0x173`; this review does not independently establish a state-table enum mapping. [Entry and completion](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandbackcrush.c#L15-L29).

`ftCh_BackCrush_Anim` performs no completion action while frames remain. After exhaustion it reads and invokes the stored event with the original object. It neither checks for null nor clears the event. Consequently, this callback alone does not guarantee one-shot dispatch or a transition: callers must install a valid event, and the event or surrounding dispatcher must arrange subsequent behavior.

`ftCh_BackCrush_IASA` queries the fighter's player-slot type and calls `ftBossLib_8015BD20` only for `Gm_PKind_Human`; other classifications have no handler branch. `ftCh_BackCrush_Phys` unconditionally delegates to `ft_80085134`; independent canonical inspection confirms replacement of `self_vel.x` by `x6A4_transNOffset.z * facing_dir` and `self_vel.y` by `x6A4_transNOffset.y`, leaving Z untouched. `ftCh_BackCrush_Coll` is empty. [Callbacks](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandbackcrush.c#L30-L43), [physics helper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_084E.c#L120-L125).

## Cross-file lifetime and selection

The Wait1_0 selector supplies `fn_80159908` for `ftMh_MS_BackDisappear` and `fn_80159AA4` for `ftMh_MS_Wait1_1`. A separate ordered controller chain reads `HSD_PadMasterStatus[3].button` and supplies those same events for A+Up and A+Right respectively. Earlier branches have priority; these combinations are not unconditional selections. The continuation survives entry until animation completion through move-local storage. [Selector](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandwait10.c#L284-L289), [controller](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandwait10.c#L343-L408).

The inspected `fn_80159908` continuation enters numeric state `0x174`, initializes animation, installs an attribute-derived timer, repositions the fighter and zeros all velocity components. This verifies a concrete downstream transition, but not both complete public move-name mappings. [Continuation](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandbackdisappear.c#L17-L29).

## Interfaces and evidence limits

The header declares the continuation-taking entry and four `void(HSD_GObj*)` lifecycle callbacks. Both owned canonical and rendered files were reviewed completely. Rendered helper names are hypotheses; physics semantics were independently checked in canonical source. The `cb` shadowed-binding diagnostic did not cause substitution. Source literals establish the transition arguments, not `.sdata2` size, ordering, placement or compiled ownership. No compiled artifacts were supplied. [Header](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandbackcrush.h#L1-L13).

The checkpoint ledger covers all 32 baseline facts and 14 links: 27 facts and nine links retained, five facts and five links unresolved. Historical duplicate link identities are preserved without merging.

Status: synthesized; independent review and live promotion pending.
