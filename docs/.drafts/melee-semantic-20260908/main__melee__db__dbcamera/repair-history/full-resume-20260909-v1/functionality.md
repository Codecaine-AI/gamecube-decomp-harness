# Developer camera and stage controls

Pinned `c302741689bd67c361cd7faadb221df3193992c3`; full owned C1-627 read in canonical/rendered form. No owned header. Snapshots: `games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__db__dbcamera/pages/`.

## `.bss`

Provides the fixed zero-initialized backing buffer used to create the developer camera-information text panel.

The buffer begins as zero-initialized BSS storage. When a developer-text GObj exists and no camera-information display has yet been allocated, the camera helper passes the buffer to `DevText_Create`; the resulting `DevText*` is retained separately in `db_CameraInfoDisplay` and is subsequently configured, erased, and populated with the active camera's `EYE`, `INT`, `FOV`, and `ANG` readout.



A 192-byte zero-initialized character buffer, source-level type `char[0xC0]`.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcamera.c#L30-L30, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcamera.c#L181-L199, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcamera.c#L201-L276, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L72-L96, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L163-L175, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L221-L255.

## `.data`

Stores the three formatted camera-information row strings used by DevText_Printf: eye coordinates, interest coordinates, and FOV plus vertical angle.

The overlay updater passes the EYE and INT formats with six bounded-magnitude integer-converted coordinates and the FOV/ANG format with integer-converted field of view and atan2-derived vertical angle. Existing object contents identify these strings rather than the stage-preset switch.



Existing source .data is 47 bytes and target .data is 48. The contents are NUL-terminated formats EYE %d,%d,%d at offset 0, INT %d,%d,%d at 16, and FOV %d  ANG %d at 32, with alignment padding. These snapshots contain neither palette objects nor switch-dispatch data. Build provenance against the pinned revision is unverified.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcamera.c#L239-L261, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcamera.c#L201-L276, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L72-L96, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L163-L175, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L221-L255.

## `.rodata`

Stores the world-up vector initializer for debug-camera orbit calculations.

fn_802279E8 initializes up_vec to {0,1,0}, computes pitch from its dot product with the eye vector, forms the pitch axis with a cross product, and uses world up as the yaw axis. The palette bytes used by DevText are in .sdata2 in existing objects.



Existing source .rodata contains one 12-byte Vec3 {0,1,0}; target extent is 16 bytes with four trailing zeros. This is the world-up initializer used by orbiting. The two GXColor objects are instead at the beginning of .sdata2 in both snapshots. Build provenance is unverified.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcamera.c#L400-L420, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcamera.c#L388-L422, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L72-L96, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L163-L175, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L221-L255.

## `.sbss`

Stores the zero-initialized persistent state for this unit's stage-visual selector and developer camera-information overlay.

`fn_SetupMiscStageVisuals` initializes `MiscStageVisualsStatus` to zero, and `fn_CheckMiscStageEffects` increments and reads it to select one of seven stage-rendering configurations. `fn_SetupCameraInfo` clears the display pointer, timer, and show flag; later camera handling lazily assigns the pointer, toggles or clears the show flag, reloads the timer to 60 during free-camera updates, and decrements it while formatting camera values into the associated developer-text object.

R plus a pressed D-pad down advances shared status through 1-6 then resets it to 0 after applying the default preset. Setup merely clears local selector/display state. B toggles show only in debug-free camera with unsigned status 3 or 4. Every free-camera input-handler call reloads timer=60 even with no movement. The overlay updater decrements only when both camera and show are present and timer is positive; other disabled conditions hide it without decrement. This is per invocation, not a fixed 60-frame timeout.

Existing source .sbss has 14 bytes and target has 16: eight-byte db structure with u32 status plus unused u32, four-byte DevText pointer, one-byte timer and one-byte show flag. Two target trailing bytes are padding. Build provenance is unverified.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcamera.c#L33-L40, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcamera.c#L45-L144, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcamera.c#L174-L199, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcamera.c#L264-L315, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcamera.c#L364-L386, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L72-L96, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L163-L175, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L221-L255.

## `.sdata2`

Supplies the overlay translucent-black background and white foreground colors plus numeric text, deadzone, activation, orbit, dolly and pan constants.

The first two four-byte values are copied into local GXColor values and passed to DevText background/text color setters. Following floating constants configure text scale, display conversion threshold, stick thresholds, degree/radian conversion, orbit pitch limits, dolly factor and perspective-scaled panning. The pool is not exclusively scalar floating-point data.



A 64-byte existing constant pool: GXColor g_bg={0,0,0,128} and g_fg={255,255,255,255} at offsets 0 and 4, followed by f32 constants 12,16,57.29578,0,99999,0.6,0.2,2,179,1,0.017453292,0.05,0.03,0.5. Both source and target extents are 64; build provenance is unverified.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcamera.c#L42-L43, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcamera.c#L181-L196, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcamera.c#L215-L261, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcamera.c#L281-L283, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcamera.c#L331-L336, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcamera.c#L388-L626, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L72-L96, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L163-L175, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L221-L255.

## `fn_802270C4`

Enables or suppresses fighter shadows for the stage-visual debug presets by updating a shadow-suppression flag on every fighter that owns shadow state and immediately recomputing each shadow object's active status.

A stage-visual preset supplies a Boolean-like enabled value. The function traverses `HSD_GObj_Entities->fighters`, obtains each `Fighter`, skips null fighter data or absent shadow objects, stores `!enabled` in the fighter shadow state's `x0_b5` suppression bit, and passes the fighter GObj to `lbShadow_8000EEE0`. That updater ORs `x0_b5` with the other shadow-suppression bits and sends the resulting visibility decision to `HSD_ShadowSetActive`.

The function applies its requested state independently to every currently registered fighter with allocated shadow data. Passing 0 sets the debug suppression bit and therefore forces each affected shadow inactive. Passing 1 clears only this debug suppression bit; a shadow becomes active only if the five other suppression bits are also clear and the fighter passes the shadow updater's eligibility check. Fighters without shadow data are left unchanged.

Global fighter-shadow setter with signature `static void fn_802270C4(int enabled)`. The integer parameter has a Boolean domain: zero requests shadow suppression and nonzero requests that this debug suppression be cleared; the function returns no value and communicates through fighter shadow state and HSD shadow activation side effects.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcamera.c#L146-L159, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbshadow.c#L154-L171, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcamera.c#L50-L128, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L72-L96, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L163-L175, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L221-L255.

## `fn_8022713C`

Bulk-applies one Boolean component of the developer stage-visual configuration to every live object in the `HSD_GObj_Entities->x14` list that has `Ground` user data.

Receives a Boolean-valued integer from `fn_CheckMiscStageEffects`, reads `HSD_GObj_Entities->x14` as a linked-list head, follows each `HSD_GObj.next` pointer, reads each object's `user_data`, and, when that pointer is non-null, writes the value into bit 7 of `Ground.x10_flags`. It produces no return value or separate global-state write.

Each call idempotently forces the selected bit on all currently listed ground objects to one common state, skipping objects with null user data. In the seven-position stage-visual cycle, the bit is cleared for the normal/reset configuration and presets 1 and 2, then set for presets 3 through 6; it changes only when the R-held, newly pressed D-pad-down guard advances and reapplies the preset.

Signature: `static void fn_8022713C(int enabled)`. The integer parameter has a Boolean domain in practice: every call supplies 0 or 1, and the value is stored into a one-bit field.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcamera.c#L161-L172, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcamera.c#L50-L128, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L72-L96, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L163-L175, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L221-L255.

## `fn_80227188`

Refreshes and manages the developer camera-information panel: while camera information is enabled, it samples the active camera, formats its eye position, interest point, field of view, and vertical viewing angle, and displays those values; it hides the panel when the display interval expires or the required camera state is unavailable.

Obtains the active camera GObj from `Camera_80030A50`, treats its `hsd_obj` as an `HSD_CObj`, and reads the eye position, interest point, and field of view. It derives a vertical viewing angle in degrees with `MTXRadToDeg(atan2f(interest.y - eye.y, -(interest.z - eye.z)))`. Eye and interest components are converted to integers for display, except components whose absolute value exceeds 99999 are represented as -1. The values flow into the developer-text rows `EYE`, `INT`, and `FOV ... ANG`, after which the panel is shown and the display timer is decremented.

The routine does nothing until the developer-text panel has been created. With both an active camera and `db_ShowCameraInfo` enabled, timer values above 1 refresh and show the panel, then decrement the timer; timer value 1 hides the panel and decrements to 0; timer value 0 returns without further work. If the camera is absent or the enable flag is clear, it hides the panel without decrementing the timer.

A file-local, side-effect-only update routine with signature `static void (void)`. It takes no explicit arguments and communicates through the active camera object and the unit's camera-information display, enable flag, and countdown timer.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcamera.c#L201-L276, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L72-L96, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L163-L175, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L221-L255.

## `fn_802277E8`

Updates the player-following developer camera from one controller's C-stick input, dispatching to orbit, dolly, or screen-relative pan operations while keeping the camera's follow offsets anchored to the tracked camera reference point.

Reads raw master-pad buttons and normalized C-stick values using port & 255. Axes strictly inside0.2 become0. Camera_8003019C obtains bone_pos from the globally selected follow-player slot, not this input port; its source does not null-check the entity/subject chain. Left selects dolly, else right selects negated-axis pan, else orbit. Those helpers have nullable-anchor fallback branches, but this getter is not a proven safe way to return NULL when a followed player is missing.

Each invocation independently applies a 0.2 deadzone to both normalized C-stick axes and then uses a priority-ordered held-button dispatch: button bit 0 takes precedence and selects vertical dolly, button bit 1 selects two-axis pan only when bit 0 is clear, and neither bit selects two-axis orbit. The routine does not transition camera modes itself; its caller runs it only while the player-focused camera state is active.

A side-effect-only camera input handler with signature `static void (HSD_GObj* camera, int port)`. The first argument is a camera game object used as an `HSD_CObj` by downstream operations; the second is a controller-port index that the function truncates to eight bits before indexing `HSD_PadMasterStatus`.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcamera.c#L331-L362, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcamera.c#L433-L508, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcamera.c#L584-L626, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L3940-L3943, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L72-L96, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L163-L175, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L221-L255.

## `fn_80227904`

Updates the active free debug camera from one controller's C-stick input, selecting rotation, dolly or zoom, or pan behavior according to the held D-pad modifier and refreshing the camera-information overlay timeout after every update.

The active free-camera object and player index arrive from `fn_CheckCameraInfo`. The function rereads that player's normalized C-stick axes and held-button mask from `HSD_PadMasterStatus`, independently suppresses axis magnitudes below 0.2, and routes the resulting values to the dolly helper, pan helper with both axes negated, or rotation helper. Its outputs are the selected helper's camera-state mutation and a write of `0x3C` to `db_CameraInfoDisplayTimer`.

Uses low eight bits of port without validating against controller count. Each axis with absolute value strictly below0.2 becomes0; exactly0.2 survives. Raw button bit0 (D-pad left) takes priority for dolly, then bit1 for pan with axes negated, else orbit. Reloads timer=60 on every invocation even if no vector changes. db_RunEveryFrame calls camera handling for four indices, so this is not one timeout reset per movement or frame.

A side-effect-only free-camera input handler with signature `static void (HSD_GObj* camera, int port)`. `camera` is the active camera game object, while only the low eight bits of `port` are used to index `HSD_PadMasterStatus`.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcamera.c#L364-L386, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcamera.c#L278-L316, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L72-L96, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L163-L175, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L221-L255.

## `fn_802279E8`

Orbits a debug camera's eye position around a fixed interest point in response to horizontal and vertical C-stick input, preserving the current eye-to-interest distance while constraining pitch away from the vertical poles.

The routine obtains the active HSD camera's normalized eye-to-interest vector and eye distance. Vertical stick input becomes a pitch delta around the normalized cross product of world up and the forward vector; horizontal input becomes a yaw delta around world up. After both rotations, the direction is restored to the original eye distance and subtracted from the supplied interest point, writing the resulting eye position through `camera_pos`. Callers route that output into either the persistent free-camera vectors or the player-following camera's offset vectors and derived world positions.

Obtains the CObj pointer before testing input. Zero axes cause no vector writes. Otherwise reads the eye vector, ignores its status, computes acos(dot(world_up,forward)) without clamping the dot, and adjusts pitch change toward1..179 degrees. Cross(world_up,forward) is normalized without a local pole/zero-axis check. Yaw is unconstrained. For valid finite nondegenerate input, reconstructs eye=anchor-rotated_direction*current_CObj_distance; malformed input does not have a guaranteed pitch bound or preserved radius.

Signature: `void (HSD_GObj* camera, Vec3* camera_pos, Vec3* camera_interest, f32 cstick_x, f32 cstick_y)`. `camera` must wrap an `HSD_CObj`; `camera_interest` is a semantically read-only orbit anchor, `camera_pos` is the eye-position output, and the C-stick parameters are normalized dimensionless inputs converted to two degrees of yaw or pitch per input unit.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcamera.c#L388-L422, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L575-L610, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L72-L96, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L163-L175, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L221-L255.

## `fn_80227B64`

Applies unmodified C-stick input to the DEVELOP-mode free camera by orbiting the stored free-camera eye position around its interest point.

The free-camera updater reads normalized sub-stick X and Y from the selected controller port, replaces values inside a 0.2 deadzone with zero, and sends the axes here when neither zoom nor pan modifier is held. If either axis remains nonzero, this function forwards the camera GObj and the persistent free-eye and free-interest vectors to the orbit routine. That routine reads the active HSD_CObj's eye direction and eye distance, rotates the direction from the stick axes, and writes the resulting eye position back to the persistent free-eye vector while retaining the supplied interest point.

Does nothing when both deadzoned C-stick axes are zero. Otherwise it updates the free-camera orbit: vertical input changes pitch but is clamped so the resulting angle from world-up remains between 1 and 179 degrees, horizontal input rotates around world-up, and the eye is repositioned at the camera's existing eye distance from the unchanged interest point.

Internal camera-control helper with signature void(HSD_GObj* camera, f32 cstick_x, f32 cstick_y). The first parameter is a camera GObj, and the floating-point inputs are deadzoned normalized C-stick axes.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcamera.c#L424-L431, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcamera.c#L388-L422, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L72-L96, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L163-L175, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L221-L255.

## `fn_80227BA8`

Updates the rotational component of the developer camera's player-following view. It orbits the stored follow-camera offset pair from C-stick input and rebuilds the corresponding world-space positions around the followed position; when no followed position is available, it instead applies the rotation to the free-camera position pair.

The player-following camera updater supplies the active camera object, a nullable followed-position vector, and thresholded C-stick X/Y values. With a non-null anchor, this function lets `fn_802279E8` rotate `follow_eye_offset` and `follow_int_offset`, computes `follow_int_offset + anchor` into `follow_eye_pos`, and computes `follow_eye_offset + anchor` into `follow_int_pos`. With a null anchor and nonzero stick input, it instead lets the helper update `free_eye_pos` and `free_int_pos`; a null anchor with zero input produces no writes.

Behavior is selected by availability of the followed-position anchor. A non-null anchor always enters the follow-camera branch, invokes the orbit helper, refreshes both translated follow positions, and returns. A null anchor enters the fallback branch only when either stick component is nonzero; otherwise the function is a no-op. The orbit helper itself ignores zero input and clamps the resulting vertical camera pitch to the range from 1 through 179 degrees.

Signature: `void fn_80227BA8(HSD_GObj* camera, Vec3* follow_position, f32 cstick_x, f32 cstick_y)`. The first parameter is the camera game object, the second is a nullable world-space anchor for the followed subject, and the two floats are horizontal and vertical C-stick rotation inputs.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcamera.c#L433-L454, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcamera.c#L388-L422, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L1075-L1083, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L72-L96, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L163-L175, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L221-L255.

## `fn_80227CAC`

Dollies the DEVELOP-mode free camera toward or away from its fixed interest point by changing the eye-to-interest distance in response to vertical C-stick input.

The free-camera input dispatcher supplies deadzone-filtered vertical C-stick input and the active camera GObj. The routine derives the camera's normalized forward vector and current eye-to-interest distance, computes a new distance as `distance * (1 - 0.05 * cstick_y)`, and writes `cm_80453004.free_eye_pos` as `free_int_pos - forward * new_distance`. The stored free-camera interest position is not changed.

A zero vertical C-stick value leaves the free-camera state unchanged. For nonzero input, positive values multiply the current eye distance by a factor below one and move the eye toward the interest point, while negative values multiply it by a factor above one and move the eye away. The operation preserves the current viewing direction and interest point.

Signature: `static void fn_80227CAC(HSD_GObj* camera, f32 cstick_y)`. `camera` is a camera GObj whose payload is an `HSD_CObj`; `cstick_y` is normalized vertical C-stick input, with zero meaning no update.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcamera.c#L456-L472, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L575-L610, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L72-L96, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L163-L175, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L221-L255.

## `fn_80227D38`

Updates the debug camera's dolly distance while preserving its viewing direction. For a camera following a reference position, it adjusts the stored eye offset and regenerates the absolute follow-camera eye and interest positions; without a reference position, it moves the free-camera eye relative to its fixed interest point.

The debug-camera controller supplies the active camera GObj, a nullable follow reference from `Camera_8003019C`, and deadzone-filtered C-stick Y. On nonzero vertical input, the function reads the active CObj's normalized forward vector and eye-to-interest distance and replaces the applicable eye displacement with `distance * (1 - 0.05 * cstick_y)`. In follow mode it writes the resulting eye offset and then adds the reference position to both stored offsets to refresh the absolute follow-camera positions; in targetless mode it writes only `free_eye_pos`, leaving `free_int_pos` fixed.

With a non-null reference position, the function always refreshes the two absolute follow-camera positions from their offsets, but changes the eye-to-interest separation only when C-stick Y is nonzero. With a null reference, it performs no update for zero input and otherwise changes only the free-camera eye position. Positive C-stick Y multiplies the current distance by a factor below one, moving the eye toward the interest point; negative input uses a factor above one, moving it away.

Signature: `void fn_80227D38(HSD_GObj* camera, Vec3* reference_pos, f32 cstick_y)`. `camera` owns the active `HSD_CObj`; `reference_pos` is a nullable world-space origin used to convert follow-camera offsets into absolute positions; and `cstick_y` is the normalized vertical C-stick value after a 0.2 deadzone.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcamera.c#L474-L508, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L575-L610, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L1075-L1083, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L72-L96, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L163-L175, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L221-L255.

## `fn_80227EB0`

Pans a camera view in camera-local screen directions by translating its eye and interest positions together. Horizontal input moves both points along the camera's left axis, while vertical input moves them along the negated up axis; the displacement is scaled to the camera's current eye distance and field of view so that panning speed tracks the visible view span.

Receives an HSD camera GObj, mutable eye and interest vectors, and horizontal/vertical pan inputs. It reads the camera object's eye distance, field of view, left vector, and up vector; computes a movement scale equal to 3% of the full view span at the current eye distance; scales the left axis by the horizontal input and the up axis by the negated vertical input; and accumulates each resulting displacement into both output vectors. Its caller routes the results directly into the debug camera's persistent free-eye and free-interest positions.



Signature and parameter roles: `static void (HSD_GObj* camera, Vec3* eye_position, Vec3* interest_position, f32 horizontal_pan, f32 vertical_pan)`. The first argument owns an HSD_CObj; the next two arguments are mutable camera-position vectors, and the final two arguments are signed camera-local pan amounts.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcamera.c#L510-L534, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcamera.c#L576-L626, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L72-L96, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L163-L175, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L221-L255.

## `fn_80227FE0`

Pans the free debug camera within its current view plane by translating both the camera eye and interest positions along the camera-relative left and up axes, preserving the camera's viewing direction and eye-to-interest distance.

The free-camera dispatcher supplies dead-zone-filtered, negated C-stick X and Y values. The function reads the active `HSD_CObj`'s eye distance and field of view and computes a movement scale of `0.03 * 2 * eye_distance * tan(fov / 2)`, proportional to the visible span at the interest plane. Horizontal input scales the camera's left vector, while vertical input scales the up vector with the opposite sign; each resulting displacement is accumulated into both `cm_80453004.free_int_pos` and `cm_80453004.free_eye_pos`.

If both input axes are zero, the function leaves camera state untouched. Otherwise it calculates one perspective-dependent scale for the update and handles each nonzero axis independently: X translates the free-camera eye and interest along the camera's left axis, and Y translates both along the negative up axis. Because both endpoints receive the same displacement, panning preserves the current orientation, field of view, and eye-to-interest distance; movement magnitude increases with eye distance and field of view.

Signature: `static void fn_80227FE0(HSD_GObj* camera, f32 cstick_x, f32 cstick_y)`. `camera` must be a game object containing an `HSD_CObj`; the two floating-point inputs are normalized C-stick axis values after dead-zone filtering and caller-selected sign inversion.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcamera.c#L536-L574, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L72-L96, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L163-L175, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L221-L255.

## `fn_80228124`

Pans the developer camera parallel to its current view plane. For a camera following an anchor point, it translates both persistent follow-camera offsets and rebuilds the absolute eye and interest positions around that anchor; without an anchor, it applies the same pan to the free-camera eye and interest positions.

The locked/follow-camera controller reads normalized C-stick input, suppresses magnitudes below 0.2, and calls this function with the current follow anchor and negated axes when the panning modifier is active. The function computes a world-space movement scale equal to 3% of the camera's visible frustum height at its eye-to-interest distance, projects the horizontal and vertical inputs onto the camera's left and inverted-up vectors, and accumulates those displacements into both camera endpoints. In anchored mode it then adds the anchor to the persistent offsets and writes the resulting follow eye and interest positions; otherwise it updates the persistent free-camera positions.

With a non-null anchor, each nonzero horizontal or vertical axis independently accumulates a view-relative displacement into both follow-camera offsets, after which the function refreshes the absolute follow eye and interest positions even when both axes are zero. With a null anchor, it leaves follow state untouched and invokes the shared free-camera translation only if at least one axis is nonzero. Because each displacement is applied equally to both endpoints, this operation preserves camera orientation and eye-to-interest distance.

Signature: `void fn_80228124(HSD_GObj* camera, Vec3* anchor, f32 horizontal, f32 vertical)`. `camera` must contain an `HSD_CObj`; `anchor` is an optional world-space camera-follow point; and the two floating-point inputs are deadzone-filtered C-stick axes whose signs have already been adjusted by the caller for panning.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcamera.c#L584-L626, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L1075-L1083, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L72-L96, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L163-L175, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L221-L255.

## `fn_CheckCameraInfo`

Processes one player's developer-camera controls for the current frame: it enters or cycles debug camera views, dispatches the active view's movement handler, maintains the optional camera-information display, and synchronizes white or black diagnostic backgrounds with the selected visual-effect state.

Receives a player index, the player's normalized held-button mask, newly pressed-button mask, and normalized C-stick axes from `db_RunEveryFrame`. It compares those inputs with camera-mode predicates and global debug visual statuses, sends the player index or current camera object to mode-transition and movement routines, writes `db_ShowCameraInfo`, refreshes the camera-information display, and may write the camera background color.

Training and Camera Mode suppress only the entry/cycle block, not later movement, overlay or background handling. Outside those modes, strict |axis|>0.6 enters debug free when neither special mode is active; this branch takes priority over D-pad-up cycling. D-pad-up lazily creates the panel even when Y/X/L/R prevents the transition. Free-to-follow may do nothing if its player has no entity/subject; follow restores the saved mode. Existing follow/free modes then consume raw master-pad input. B toggles show only in debug free with unsigned status3 or4; otherwise show clears. The overlay runs per player call. X+pressed-down uses db accessors rather than supplied masks to choose white/black background for visual status2/3.

A side-effect-only per-player input handler with signature `void (int player, int buttons_down, int buttons_pressed, f32 cstick_x, f32 cstick_y)`. The button arguments are bit masks, and the C-stick arguments are normalized axis values.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcamera.c#L278-L329, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L3835-L3906, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L3924-L3943, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1879.c#L440-L446, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L72-L96, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L163-L175, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L221-L255.

## `fn_CheckMiscStageEffects`

Handles two developer-debug stage-presentation shortcuts for one controller slot: R plus a newly pressed D-pad Down advances through preset stage/camera debug views, while X plus a newly pressed D-pad Down reapplies or hides the rendered stage according to the current miscellaneous-visual-effects mode.

The player index flows into db_ButtonsDown and db_ButtonsPressed. An R-held/D-pad-Down-pressed event increments db.MiscStageVisualsStatus, whose resulting value selects Boolean arguments for fn_802270C4, fn_8022713C, and six Camera_* configuration setters; overflow/default processing writes the selector back to 0. Independently, an X-held/D-pad-Down-pressed event reads db_MiscVisualEffectsStatus: values 0 or 1 cause Ground_ApplyStageBackgroundColor followed by Camera_SetStageVisible(1), while every other value causes Camera_SetStageVisible(0).

db.MiscStageVisualsStatus is a cyclic selector with six explicit nonzero presets. Each R-held/D-pad-Down press advances it before dispatch: state 1 disables all eight controlled options; states 2 through 6 apply progressively different preset combinations; advancing beyond 6 takes the default path, applies the reset configuration, and returns the selector to 0. The X-held shortcut does not change db_MiscVisualEffectsStatus: it shows the stage for status 0 or 1 and hides it for any other status. If neither chord occurs, the routine leaves all state and visual settings unchanged.

Signature: `void fn_CheckMiscStageEffects(int player)`. The parameter is a debug controller/player-slot index used only to query that slot's held and newly pressed button masks; the routine returns no value and communicates entirely through global debug state and visual-system side effects.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcamera.c#L50-L144, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L72-L96, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L163-L175, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L221-L255.

## `fn_SetupCameraInfo`

Resets the local camera-overlay pointer, timer and show flag. It does not destroy, unregister or hide an existing DevText object before dropping the pointer.

The function writes `NULL` to `db_CameraInfoDisplay` and zero to `db_CameraInfoDisplayTimer` and `db_ShowCameraInfo`. Later camera handling interprets the null pointer as permission to create and configure the developer-text object, uses the show flag to gate drawing, and uses the timer as a countdown for the `EYE`, `INT`, `FOV`, and `ANG` readout; free-camera updates reload that timer to 60.

Unconditionally sets display=NULL,timer=0,show=0. Reinitialization does not remove a previously registered display and can leave that object alive. A later eligible input attempts lazy creation. Free-camera handler calls reload the timer to60 even when their deadzoned input is zero; it is not a movement-triggered frame interval.

Parameterless initialization routine with signature `void (void)`.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcamera.c#L174-L199, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L72-L96, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L163-L175, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L221-L255.

## `fn_SetupMiscStageVisuals`

Initializes the miscellaneous stage-visual debug cycle to its normal/default state before per-frame debug input handling begins.

Called by `db_Setup` when developer-debug initialization is enabled, it writes 0 to `db.MiscStageVisualsStatus`. `fn_CheckMiscStageEffects` later reads and increments that field to select stage/camera visualization presets, while `fn_CheckCameraInfo` reads states 3 and 4 to decide whether camera information may be toggled.

Sets only db.MiscStageVisualsStatus=0; it neither changes the unused field nor reapplies the normal rendering/shadow preset. The runtime handler applies the reset preset only through its default switch branch. Calling setup after other presets therefore does not itself restore those visual flags.

A parameterless, side-effect-only initialization routine with signature `void (void)`.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcamera.c#L45-L48, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcamera.c#L50-L128, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L72-L96, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L163-L175, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L221-L255.

## `TU`

Implements the developer-debug camera and stage-presentation module: it cycles diagnostic stage visuals, selects and manipulates debug camera modes, and creates a developer-text overlay for inspecting the active camera.

The debug subsystem's per-frame dispatcher supplies each player's current and newly pressed button masks plus normalized C-stick coordinates to this unit's camera handler, and separately invokes its stage-visual handler. The unit converts those inputs into camera-mode changes, camera-position updates, stage-rendering flags, and a developer-text panel populated from the active camera object's eye position, interest point, field of view, and vertical angle.

Stage status cycles through0-6 on R+pressed-down, with two independent R and X chord branches that can both execute. Camera mode entry/cycling is suppressed in Training/Camera Mode but movement and display handling remain outside that gate. Free-camera handler calls reload timer=60 with zero input; the overlay timer decreases only for an existing camera and enabled display. All four player calls from dbinit can update shared camera state, so timer handling is per invocation, not a60-frame movement timeout. Follow world-position field names are inverted at the camera consumer: follow_eye_pos is applied as interest, follow_int_pos as eye.



Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcamera.c#L45-L626, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L72-L96, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L163-L175, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L221-L255.

## Literal stage preset table

Columns are argument values in source call order. Camera names remain canonical; visual semantics are not inferred solely from rendered aliases.

|Status|fn_802270C4|Camera_80030B0C|Camera_80030A60|Camera_80030A8C|fn_8022713C|Camera_80030B38|Camera_80030B64|Camera_80030B90|
|---|---|---|---|---|---|---|---|---|
|0/reset|1|0|0|0|0|0|0|0|
|1|0|0|0|0|0|0|0|0|
|2|1|1|0|1|0|0|0|1|
|3|0|0|0|1|1|0|0|1|
|4|0|0|1|1|1|0|0|1|
|5|0|0|1|1|1|1|0|1|
|6|0|0|1|1|0|1|1|

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcamera.c#L50-L128. Camera setters write x399_b7, x399_b3, x399_b4, x39A_b0, x39A_b1, x39A_b2 respectively: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L4228-L4302.

## Geometry and update boundaries

Follow helpers compute follow_eye_pos = follow_int_offset + anchor and follow_int_pos = follow_eye_offset + anchor. The camera consumer sets CObj interest from follow_eye_pos and CObj eye from follow_int_pos, so the apparent name swap is consistent across these files. Do not rename shared fields from local intuition.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcamera.c#L439-L447, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcamera.c#L483-L497, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcamera.c#L595-L621, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L1075-L1083.

Dolly computes distance*(1-0.05*y) without a minimum distance or generic input clamp; direction/distance preservation statements assume normalized controller input and valid geometry. Pan scales both endpoints by 3% of the perspective view span and uses the same scale for horizontal and vertical movement, with no aspect-ratio correction. The generic pan helper reads camera distance/FOV even with zero axes; its wrapper skips the call for zero input. Aliased endpoint pointers receive the displacement twice.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcamera.c#L456-L626.

The orbit helper obtains eye vector from the current CObj, not the output vectors, and ignores the getter status. CObj supplies {0,0,-1} on failure, but orbit still does not clamp the acos input or guard a parallel-up cross product. These controls write stored camera vectors; the camera apply path updates CObj positions later.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcamera.c#L388-L422, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L575-L610, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L1075-L1083.

## Objects and overlay

Object payloads source/target: .data47/48,.rodata12/16,.bss192/192,.sbss14/16,.sdata2 64/64. The palette occupies the first eight .sdata2 bytes; .rodata holds world-up; .data holds three format strings. No authored image artwork or stage-switch table appears in those section snapshots. Provenance remains unverified.

Overlay creation is lazy and requires a DevText GObj. Setup drops any prior pointer without destruction. Rendering reports integer eye/interest coordinates with -1 for magnitude greater than99999, plus FOV and a YZ-plane atan2 angle; it is not a full 3D orientation display. Timer0 leaves existing visibility untouched in the enabled-camera branch. Every free handler call reloads60, even no input; four-player dispatch prevents treating it as an elapsed frame timer.

## Review state

All64 subjects,122 facts and26 outgoing relationships have explicit records. Shared alias collisions and ground drawing details remain family items. No function rename or foreign entity proposal.
