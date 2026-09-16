## Crazy Hand initialization and dispatch

This unit defines a one-entry `UnkCostumeStruct` array, the `MotionState[ftCh_MS_SelfCount]` dispatch table, Crazy Hand resource strings and costume descriptors, and three `void(HSD_GObj*)` lifecycle callbacks. The header exports these interfaces. Source declarations do not establish compiled section extents or ordering.

### Dispatch and resources

The table pairs `ftMh_SM_*` submotion identifiers with Crazy Hand callbacks. Its comments label states 341 through 389; these comments are not independent verification of enum values or runtime transition behavior. Each initializer uses `Ft_MF_None`, `FtMoveId_Default << 24`, and `ftCamera_UpdateCameraBox`. The repertoire covers waits, entry, damage, sweep/walk, drill/crush, poke, finger-projectile phases, backward attacks, grabs and follow-ups, and Tag phases.

Callback sharing is significant: Wait2_0 uses Wait1_0 callbacks; Walk2 uses Slap collision; RockCrushWait shares RockCrushUp IASA/physics/collision; FingerGun3 uses FingerGun2 callbacks; TagSqueeze shares TagGrab IASA/physics/collision. TagCancel and Wait1_2 share animation/physics/collision and have NULL IASA slots. The table is dispatch metadata, not proof of transitions between these states.

Resources are `PlCh.dat`, `ftDataCrazyhand`, `PlChNr.dat`, `PlyCrazyhand_Share_joint`, and `PlChAJ.dat`. The single costume descriptor references the normal model archive and shared joint string, with a NULL third field. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhand.c#L48-L600.

### Lifecycle and attribute storage

`ftCh_Init_OnDeath` is empty. This proves only that this hook performs no cleanup, not that the fighter or its resources require no cleanup elsewhere.

`ftCh_Init_OnLoad` obtains Fighter data, external attributes, and item-resource pointers. `PUSH_ATTRS` copies the typed external attributes into existing backup storage and installs that storage as `dat_attrs`. The local `ftData_attr` continues to refer to the external attributes. The callback calls `ftBossLib_ReportGObjSlotType`, then supplies items 0, 1, and 2 to `it_8026B3F8` with Crazy Hand laser, bullet, and bomb kinds respectively.

It sets six flags, including `no_normal_motion` and `no_kb`; initializes x/y from attribute offsets x18/x1C and z to zero; clears private slots x28/x2C/x30/x34, x1C, and x20; and assigns -1 to x38/x3C/x40. It stores `ftBossLib_8015C244(gobj, &fp->cur_pos)` into `u.ch.x222C`, sets x2238 to 1.0, clears x224C and x2254, stores `ftMh_MS_Damage2` in x2250, and sets CPU level to 1. The final helper receives that level, `&fp->u.mh.x223C`, x2238, and external attributes x0/x8/x4. The stored damage-state identifier is not an immediate motion-state transition. The Master Hand union-member spelling in the final call must be preserved rather than silently normalized.

There are no explicit guards or branches in this callback; helper-internal failure paths and subsequent pointer lifetimes are not established here. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhand.c#L602-L648 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/inlines.h#L21-L40.

`ftCh_Init_LoadSpecialAttrs` copies from `fp->ft_data->ext_attr` into existing `fp->dat_attrs`, using `ftCrazyHand_DatAttrs` as a C type—not as a static attribute descriptor. It does not itself allocate storage or reinstall the active pointer. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhand.c#L650-L653 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/inlines.h#L31-L40.

### Rendered-name review

All owned canonical and rendered pages were read in the inherited research. Rendering reported no parse errors. The lead independently checked the lifecycle/resource excerpt and attribute macro definitions. The substituted FingerBombStart physics name and boss/item helper names remain hypotheses: their appearance in the rendered caller does not validate their semantics. Canonical names are preserved in this review.

Status: synthesized; independent review and live promotion pending.
