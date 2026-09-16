## Functionality

This unit defines two routines and its header declares both. `ftMh_BackCrush_Coll(HSD_GObj*)` has a completely empty body: it ignores its argument and performs no collision tests, transitions, or mutations. `ftMh_MS_371_801541C8(HSD_GObj*, HSD_GObjEvent)` obtains the Fighter, calls `Fighter_ChangeMotionState(gobj, ftMh_MS_BackDisappear, 0, 0, 1, 0, 0)`, calls `ftAnim_8006EBA4(gobj)`, and only then stores the supplied event in `fp->mv.mh.unk0.x4`. There are no local guards, timers, or callback invocations. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandbackcrush1.c#L10-L18); [declarations](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandbackcrush1.h#L1-L9).

## Continuation lifetime and attack distinction

The BackPunch/Ram and BackCrush/Crush selection branches supply `ftMh_MS_369_80153B90` and `ftMh_MS_370_80153D2C`, respectively. Debug A+Right and A+Down select these same continuations. Grab selection instead invokes `ftMh_MS_372_801542E0`. Thus this entry is a shared disappearance **prelude**, not an exit from grab-based crushing. [Action selection](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandwait10.c#L319-L343); [debug selection](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandwait10.c#L420-L444).

`ftMh_BackDisappear_Anim` invokes the retained event with the game object only when `ftAnim_IsFramesRemaining` is false. It neither checks the event for null nor clears it afterward; exactly-once execution therefore depends on subsequent state progression, rather than an explicit one-shot mechanism. The neighboring BackCrush animation exits through `ftMh_MS_389_80151018`, not this unit's entry. [Consumer](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandbackdisappear.c#L20-L26); [BackCrush exit](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandbackcrush0.c#L91-L95).

## Evidence boundaries

The rendered `ftMh_BackDisappear_Enter` is a reasonable inferred name supported by the canonical destination state, not an original symbol. The rendered `ftAnim_Advance` does not independently establish the animation helper's implementation. The numeric substring `371` in the original function name is not used to prove a state-enum value. Source literals do not establish `.sdata2` size, ordering, placement, or compiled load provenance; no compiled artifacts were provided.

Status: synthesized; independent review and live promotion pending.
