## Master Hand initialization package

This unit defines Master Hand's motion-state dispatch table, resource identifiers, costume metadata, and three lifecycle callbacks. The header exports the table, public resource arrays, costume records, and callbacks. The source also declares `ftMh_CostumeList[1]`; source declarations do not establish compiled section placement.

### Dispatch and resources

The table contains 50 records, annotated with motion-state numbers 341–390, from Wait1_0 through Wait2_1. Entries contain submotion identifiers, `Ft_MF_None`, `FtMoveId_Default << 24`, callback slots, and `ftCamera_UpdateCameraBox`. These are dispatch bindings, not implementations of the attacks or proof of transitions between them. Numeric motion-state annotations must not be conflated with the submotion identifiers stored in the records.

Important sharing and exceptions: Wait2_0 reuses Wait1_0 callbacks; Damage2 uses canonical `ftMh_MS_345_Anim` with the shared damage IASA/physics/collision callbacks; Poke2 shares Poke1's non-animation callbacks; both Squeezing records share callbacks; the final Wait1_2 and Wait2_1 records share callbacks and have NULL IASA slots. The table covers waiting, entry, damage, individual attack phases, grabs/throws, failure/cancel phases, and Tag-prefixed actions. Resource arrays identify `PlMh.dat`, `ftDataMasterhand`, `PlMhNr.dat`, `PlyMasterhand_Share_joint`, and `PlMhAJ.dat`; the single costume-string record has a NULL third field. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhand.c#L43-L606.

### Load callback

`ftMh_Init_OnLoad` obtains the Fighter from `gobj->user_data` and reads its external attributes and item-resource array. `PUSH_ATTRS` copies the typed external block into `dat_attrs_backup` and points `dat_attrs` at that storage. The callback calls `ftBossLib_ReportGObjSlotType`, then passes items[0] and items[1] to `it_8026B3F8` with the Master Hand laser and bullet kinds respectively.

It sets `no_normal_motion`, `no_kb`, and four unnamed flags; initializes x/y from external `x30_pos2` and z to zero; clears move slots x34/x38/x3C/x40/x1C/x20; and sets x28/x2C/x30 to -1. It stores `ftBossLib_8015C244(gobj, &fp->cur_pos)` in x222C, sets x2238 to 1, clears x224C and x2254, stores `ftMh_MS_SweepLoop` in x2250, and sets CPU level to 1. The final helper receives level, the address of x223C, x2238, and attributes x18/x20/x1C in that order. Storing SweepLoop is not itself a motion-state transition. The body contains no explicit input guards or conditional branches; helper failure behavior is not established here. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhand.c#L610-L650 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/inlines.h#L21-L28.

### Attribute refresh and death

`ftMh_Init_LoadSpecialAttrs` uses `COPY_ATTRS`, which copies external attributes into the existing `dat_attrs` destination. Unlike `PUSH_ATTRS`, it neither selects backup storage nor assigns the active pointer. This distinction preserves the cross-file initialization/refresh lifetime. `ftMh_Init_OnDeath` is empty: it provides no local cleanup, state mutation, or transition, without implying that the wider fighter system performs no cleanup. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhand.c#L608-L655 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/inlines.h#L21-L40.

### Rendered-name review

Both owned files were read completely in canonical and rendered form. Rendering reported no parse errors. Damage2_Anim, AssertValidPlayerSlotType, itRegisterArticle, FindClosestFighter, and SetActionDelay are rendered hypotheses; they are not independent evidence of callee semantics. Canonical symbols are preserved in this review. No compiled section sizes, ordering, literal-pool bytes, or boundaries are asserted.

Status: synthesized; independent review and live promotion pending.
