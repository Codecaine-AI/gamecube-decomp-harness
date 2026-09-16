# Ground Display and Camera Pass

Coordinates Ground rendering with camera selection, fighter shadow filtering and conditional stage-fog restoration. A separate camera callback activates a CObj, installs priority mask 8 and camera group 0, dispatches mask 7 and ends that camera. Exact foreign pass dispatch and deferred-draw semantics require family evidence.

## grDisplay_801C5B90

Returns on null root. Visible instance nodes prepare matrices, compute inverse-concatenated child/instance transform, prefix the current camera view and recurse. The child is dereferenced after only a conditional dirty check, so visible instances require a child. Ordinary nodes draw when flags<<18 overlaps their flags, first setting each fighter shadow bit4 to the inverse of camera override OR stage callback result, then updating shadows and drawing. Independent flags<<28 overlap recurses across children. Only the instance path explicitly checks HIDDEN; shadow pointers and stage callback are unguarded. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grdisplay.c#L21-L70).

## grDisplay_801C5DB0

Requires Ground selector equal to Camera_8003108C. Associated-camera payload mismatch requires flag b3, camera GObj/CObj and current-CObj equality; absent association can be rejected by Ground_801C2C8C. Requires Camera_80030A78 false and Camera_80030AC4 true. Flag b2 clear disables fog, then all graphics state is invalidated. Flag b5 selects recursive shadow-aware draw with converted code; otherwise every fighter shadow bit4 is cleared and individually updated before standard JObj callback. After drawing, restores the stage fog only if b2 clear, the camera predicate still false, stage fog enabled and fog GObj/payload nonnull. It does not preserve arbitrary previous fog or restore fighter shadow flags. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grdisplay.c#L72-L142).

## grDisplay_801C5F60

Obtains the attached CObj and calls HSD_CObjSetCurrent. On success overwrites gxlink_prios with 8, calls Camera_800310A0(0), dispatches HSD_GObj_80390ED0(gobj,7) and ends the current CObj. On false does none of these subsequent operations. Incoming code is unused; priority mask and camera group are not restored locally. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grdisplay.c#L144-L153).

## Coverage

Both owned files were read canonically and rendered to EOF: 164 lines, zero parse errors. All 5 targets, 9 entities and inherited fact IDs/update markers are in findings, including 8 empty parameters. Data sections remain unresolved. No source or shared knowledge edits.
