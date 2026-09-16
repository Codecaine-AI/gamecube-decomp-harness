# Camera Modes, Rendering, and Queries

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. Canonical and rendered camera.c lines 3378–4632 were read completely in six pages. The source hash and immutable page hashes are in modes.findings.json. The earlier 2353–2592 read is context only after assignment changed. No empty or failed pages.

## Behavior

Mode entrypoints initialize the shared camera or replace its mode selector. Pause and free initialization install stage bounds and orbit state. Boss-intro commands capture fixed or counted transform baselines. Debug entrypoints save eligible prior modes and snapshot the HSD view.

The main render callback prepares camera, refraction and shadow state before activation, then composes ordered GX-link phases under successful CObj activation. Overlay bits gate collision, zone and special-point calls. Helper masks distinguish the caller-supplied group bits from built-in groups. The two-phase helper drops caller priorities for its second phase; the three-phase helper restores them in its final phase.

Projection queries distinguish world-point/scissor tests, subject-center tests and the expanded subject test. Screen coordinates are written before the scissor rejection. The ground-view query projects onto z=0 and uses signed sentinels for unusable directions.

Quake requests refresh per-kind timers and fill every empty current-bank slot. Loop requests reuse the retained GObj. Unsupported kinds have no safe default timer initialization. The inherited Camera_StartQuake name is rejected in favor of authoritative Camera_RequestQuake. Old [2][8] layout assertions are superseded locally; shared header ownership remains a family task.

## Review Boundaries

Canonical names win over inherited guesses, including Camera_Create and redundant color/stop names. Duplicate scaled-bounds aliases and the subject-screen alias collide and are cleared pending distinct naming. Camera_RefreshSecondaryCObj is proposed because Camera_Create constructs the secondary CObj separately from the attached main camera.

Foreign caller/game-specific claims remain unresolved unless local code alone establishes them. This is explicit in every fact disposition, not acceptance of old evidence. The geometry, control and transition clusters should reconcile x2B0, x2BC, x40, x399_b2 and x341_b7. Ground, mplib, fighter/item and baselib consumer interpretations remain family review.

## Target Coverage

| Symbol | Lines | Behavior |
|---|---|---|
| Camera_8002F0E4 | [3378–3423](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L3378-L3423) | Selects counted boss-intro transition state, zeros progress, stores the requested terminal count, and captures current interest, FOV, and Cartesian or spherical eye baseline. |
| Camera_8002F260 | [3425–3428](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L3425-L3428) | Returns the stored x341_b7 bit without changing camera state. Completion semantics require the transition updater. |
| Camera_8002F274 | [3430–3455](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L3430-L3455) | Enters boss-intro mode if needed, selects fixed-vector position source, and copies current eye position into retained and target positions. |
| fn_8002F360 | [3457–3462](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L3457-L3462) | Calls the current mode callback once with the supplied GObj when its table entry is non-null. |
| Camera_8002F3AC | [3464–3480](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L3464-L3480) | Runs the current mode callback if present, then snaps both transform records' eye, interest, and FOV to their targets. |
| Camera_SetModeToStandard | [3482–3485](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L3482-L3485) | Writes CAMERA_STANDARD to the mode selector. |
| Camera_SetBounds | [3487–3494](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L3487-L3494) | Writes stage top, bottom, left, and right camera offsets to output x, y, z, and w, returning 1. |
| Camera_SetUpPauseCamera | [3496–3576](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L3496-L3576) | Validates pauser selectors, enters CAMERA_PAUSE, installs stage bounds and angle/depth limits, chooses initial or minimum distance, triples it for selector 10, resets offsets and up vector, and builds target interest and eye. |
| Camera_SetUpPauseCameraWithDefaultZoom | [3578–3581](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L3578-L3581) | Forwards both byte selectors to Camera_SetUpPauseCamera with preset 0, selecting the stage initial pause distance. |
| Camera_8002F760 | [3583–3586](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L3583-L3586) | Forwards both byte selectors to Camera_SetUpPauseCamera with preset 1, selecting the stage minimum pause distance. |
| Camera_8002F784 | [3589–3596](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L3589-L3596) | Enters CAMERA_TRAINING_MENU, stores slot and second byte identifier, and zeros pitch and yaw offsets. |
| Camera_8002F7AC | [3598–3651](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L3598-L3651) | Enters CAMERA_CLEAR and stores the slot; derives random yaw from subject facing and stage angle limits with a one-in-four side reversal, or uses full-circle yaw without a subject, and randomizes pitch within approximately plus or minus pi/16. |
| Camera_SetModeToFixed | [3653–3656](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L3653-L3656) | Writes CAMERA_FIXED to the mode selector. |
| fn_8002F908 | [3658–3680](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L3658-L3680) | Returns scaled, center-preserving stage camera edges packed as horizontal ymin/ymax and vertical xmin/xmax; returns 1. Installed as the bounds callback by Camera_8002F9E4. |
| Camera_8002F9E4 | [3682–3738](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L3682-L3738) | Enters CAMERA_FREE, initializes selectors and stage/tuning bounds, installs fn_8002F908, resets offsets and world up, triples distance for selector 10, and constructs target interest and eye. |
| fn_8002FBA0 | [3740–3763](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L3740-L3763) | Computes the same scaled stage-edge values as fn_8002F908 and returns 1. Installed as the bounds callback by Camera_8002FC7C. |
| Camera_8002FC7C | [3765–3817](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L3765-L3817) | Enters CAMERA_FREE and installs stage/tuning bounds with fn_8002FBA0, initializes selectors, resets offsets and world up, triples distance for selector 10, and constructs target interest and eye. |
| Camera_8002FE38 | [3819–3833](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L3819-L3833) | Enters CAMERA_BOSS_INTRO, clears source/transition/completion selectors, and seeds retained and target interest, eye, and FOV from current values. |
| Camera_8002FEEC | [3835–3885](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L3835-L3885) | With a valid selected fighter subject and a different active mode, enters CAMERA_DEBUG_FOLLOW, conditionally saves the prior mode, stores the slot and HSD view snapshots, clears follow-interest offset, and scales the eye offset using subject extent and target FOV. |
| Camera_8003006C | [3887–3901](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L3887-L3901) | Unless already debug-free, conditionally saves a prior mode no later than CAMERA_PAUSE, enters CAMERA_DEBUG_FREE, and snapshots HSD eye, interest, and FOV into debug state. |
| Camera_800300F0 | [3903–3906](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L3903-L3906) | Restores game_camera.mode from cm_80453004.last_mode without validation. |
| Camera_8003010C | [3908–3914](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L3908-L3914) | Returns whether mode equals CAMERA_FREE. |
| Camera_80030130 | [3916–3922](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L3916-L3922) | Returns whether mode equals CAMERA_BOSS_INTRO. |
| Camera_80030154 | [3924–3930](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L3924-L3930) | Returns whether mode equals CAMERA_DEBUG_FOLLOW. |
| Camera_80030178 | [3932–3938](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L3932-L3938) | Returns whether mode equals CAMERA_DEBUG_FREE. |
| Camera_8003019C | [3940–3943](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L3940-L3943) | Returns a borrowed pointer to the selected debug-follow fighter subject's bone_pos; fighter and subject lookups are not null-checked here. |
| gxlink_prio8 | [3947–3957](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L3947-L3957) | Returns 0 when x398_b2 is set, otherwise GX-link mask 8. |
| gxlink_prio1 | [3959–3969](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L3959-L3969) | Returns 0 when x398_b4 is set, otherwise GX-link mask 1. |
| gxlink_prio80 | [3971–3981](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L3971-L3981) | Returns 0 when x398_b3 is set, otherwise GX-link mask 0x80. |
| render_gxlink_pass | [3983–3995](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L3983-L3995) | Stores the supplied stage render selector, sets mask 8 unless x398_b2 suppresses it, and dispatches the supplied callback-pass mask. |
| fn_800301D0 | [3997–4058](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L3997-L4058) | Prepares refraction, camera and shadow state; after successful CObj activation clears the view, resets lights, sequences GX-link masks and render selectors, performs refraction phases, disables fog for late passes, gates collision/zones/special-point overlays, and ends the camera. |
| Camera_800304E0 | [4060–4093](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L4060-L4093) | After successful CObj activation clears to stored RGB with alpha 1, resets lights, sequences masks 1/8 and helper passes followed by 0x70 and no-fog 0x80, and ends the camera. |
| Camera_Create | [4095–4112](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L4095-L4112) | Creates the main GObj, loads two CObjs from cm_803BCB64, attaches one and stores the other in cm_804D6464, and registers fn_800301D0 plus fn_8002F360. |
| Camera_80030730 | [4114–4117](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L4114-L4117) | Stores its float argument in tuning field cm_803BCCA0.x40 without validation. |
| Camera_SetBackgroundColor | [4119–4124](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L4119-L4124) | Replaces the three stored background RGB bytes. |
| Camera_GetBackgroundColor | [4126–4134](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L4126-L4134) | Returns stored background RGB; the local GXColor alpha member is not assigned. |
| Camera_GetTransformPosition | [4136–4139](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L4136-L4139) | Copies current transform.position into the caller's vector. |
| Camera_GetTransformInterest | [4141–4144](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L4141-L4144) | Copies current transform.interest into the caller's vector. |
| project_ground_x | [4146–4150](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L4146-L4150) | Projects an eye-origin direction to z=0 and stores its x coordinate; divides by dir_z. |
| same_side | [4152–4155](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L4152-L4155) | Returns whether the product of two z components is strictly positive. |
| Camera_800307D0 | [4157–4221](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L4157-L4221) | Projects center and horizontal FOV-edge directions to z=0 for three x outputs. Returns false with sentinel edges and zero center when forward x or z is near zero; invalid edge rays independently receive signed sentinels. |
| Camera_80030A50 | [4223–4226](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L4223-L4226) | Returns the main camera GObj pointer. |
| Camera_80030A60 | [4228–4231](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L4228-L4231) | Stores a Boolean in x399_b3, paired with Camera_80030A78. |
| Camera_80030A78 | [4233–4236](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L4233-L4236) | Returns x399_b3, which the main camera callback tests before the collision-overlay call. |
| Camera_80030A8C | [4238–4241](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L4238-L4241) | Stores the x399_b4 Boolean used by the main camera callback to gate mpLib_DrawZones. |
| Camera_SetStageVisible | [4243–4247](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L4243-L4247) | Stores arg0 == 0 in inverse visibility bit x399_b5. |
| Camera_80030AC4 | [4249–4253](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L4249-L4253) | Returns whether inverse visibility bit x399_b5 is zero; this gates the camera-owned diagnostic overlay block. |
| Camera_80030AE0 | [4255–4258](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L4255-L4258) | Stores Boolean x399_b2, paired with Camera_80030AF8; consumer semantics need the transform cluster. |
| Camera_80030AF8 | [4260–4263](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L4260-L4263) | Returns x399_b2 without mutation. |
| Camera_80030B0C | [4265–4268](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L4265-L4268) | Stores x399_b7, also supplied to lbShadow_8000F38C by the camera callback. |
| Camera_80030B24 | [4270–4273](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L4270-L4273) | Returns x399_b7 without mutation; stage shadow-override semantics require foreign consumers. |
| Camera_80030B38 | [4275–4278](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L4275-L4278) | Stores Boolean x39A_b0, paired with Camera_80030B50. |
| Camera_80030B50 | [4280–4283](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L4280-L4283) | Returns x39A_b0 without mutation; terrain classification requires foreign consumers. |
| Camera_80030B64 | [4285–4288](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L4285-L4288) | Stores Boolean x39A_b1, paired with Camera_80030B7C. |
| Camera_80030B7C | [4290–4293](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L4290-L4293) | Returns x39A_b1 without mutation; platform/ledge classification requires foreign consumers. |
| Camera_80030B90 | [4295–4298](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L4295-L4298) | Stores Boolean x39A_b2 used to enable the camera's special-point overlay. |
| Camera_80030BA8 | [4300–4303](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L4300-L4303) | Returns x39A_b2, tested before mpLib_DrawSpecialPoints under the stage-visible guard. |
| Camera_80030BBC | [4306–4339](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L4306-L4339) | Projects a world point, rejects failed projection and coordinates beyond the source float thresholds, converts coordinates to s32 and optionally stores them, then tests the half-open scissor rectangle. The rounded positive threshold and NaN comparisons do not guarantee a representable conversion. |
| Camera_80030CD8 | [4341–4344](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L4341-L4344) | Forwards a subject's bone_pos and optional screen output to Camera_80030BBC. |
| Camera_80030CFC | [4347–4374](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L4347-L4374) | Tests a subject against the eye-interest axis using extent plus tolerance; otherwise projects the expanded boundary point nearest that axis and applies the screen test. |
| Camera_80030DE4 | [4376–4380](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L4376-L4380) | Replaces camera translation x and y with the supplied floats. |
| Camera_80030DF8 | [4382–4385](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L4382-L4385) | Zeros camera translation x and y. |
| Camera_80030E10 | [4387–4393](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L4387-L4393) | Returns 10000 when x2B8 is below one, otherwise x2B0; producer determines the average-width interpretation. |
| Camera_SetQuakeScale | [4395–4398](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L4395-L4398) | Replaces game_camera.quake_scale with the supplied float. |
| Camera_RequestQuake | [4400–4449](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L4400-L4449) | Requests a typed quake through grLib_801C9CEC, reusing the retained looping GObj and refreshing its timer to 10 or refreshing finite-kind timers to 22. Fills every currently empty entry among quakes[0][0..15] with kind and supplied or zero epicenter because the loop has no break. |
| Camera_StopQuake | [4451–4454](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L4451-L4454) | Zeros the indexed quake_frames_left entry; it does not directly destroy a GObj or validate kind. |
| Camera_80031060 | [4456–4459](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L4456-L4459) | Returns render selector x398_b6_b7. |
| Camera_80031074 | [4461–4464](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L4461-L4464) | Stores the supplied byte in render selector x398_b6_b7. |
| Camera_8003108C | [4466–4469](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L4466-L4469) | Returns stage render selector x399_b0_b1. |
| Camera_800310A0 | [4471–4474](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L4471-L4474) | Stores the supplied byte in stage render selector x399_b0_b1, used before ordered camera dispatches. |
| Camera_800310B8 | [4476–4481](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L4476-L4481) | Marks cm_804D6464's matrix dirty, requests viewing-matrix setup, and returns that secondary CObj; it is distinct from the CObj attached to the main GObj at creation. |
| Camera_800310E8 | [4483–4491](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L4483-L4491) | Clears suppression/control bits x398_b0 through x398_b5, restoring associated built-in GX-link contributions and stored-background clearing behavior. |
| Camera_80031144 | [4493–4496](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L4493-L4496) | Returns x2BC without mutation; its scale semantics require producer review. |
| Camera_80031154 | [4498–4504](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L4498-L4504) | Returns whether Camera_80029124 classifies the supplied point with zero adjustment as CAM_BOUNDS_INSIDE. |
| Camera_8003118C | [4506–4512](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L4506-L4512) | Implicitly converts its float adjustment to the s32 distance parameter of Camera_80029124 and returns whether that point classification equals CAM_BOUNDS_INSIDE. |
| Camera_800311CC | [4514–4517](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L4514-L4517) | Replaces the stored farz float. |
| Camera_800311DC | [4519–4522](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L4519-L4522) | Replaces the stored nearz float. |
| inline_cam_gx_b0 | [4524–4530](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L4524-L4530) | Returns 0 when x398_b0 is set, otherwise mask 0x20. |
| inline_cam_gx_b1 | [4532–4538](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L4532-L4538) | Returns 0 when x398_b1 is set, otherwise mask 0x40. |
| inline_cam_gx_b4 | [4540–4546](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L4540-L4546) | Returns 0 when x398_b4 is set, otherwise mask 0x10. |
| Camera_800311EC | [4548–4568](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L4548-L4568) | Dispatches pass mask 3 twice: first with render selector 1 and caller mask plus enabled 0x20/0x40; then selector 0 and enabled 0x10/0x20/0x40 without caller mask. |
| Camera_80031328 | [4570–4584](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L4570-L4584) | Sets render selector 0 and dispatches pass mask 4 with caller priorities plus enabled 0x10/0x20/0x40. |
| Camera_800313E0 | [4586–4616](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L4586-L4616) | Runs the two mask-3 phases of Camera_800311EC followed by a mask-4 phase with caller priorities restored; leaves render selector 0 and the final priority mask installed. |

## Local Reconciliation

Additional canonical and rendered pages establish x2BC as a zoom multiplier, x2B0 as running average stage width, and x399_b2 as the depth guard for late target reconstruction and boundary correction. x40 directly supplies target_fov, so Camera_SetDefaultFov replaces the unsupported vertical-tilt alias. Counted setup does not reset x341_b7; the getter can expose the prior completion state until the updater recomputes it. Exact supplemental citations and fact decisions are in modes.findings.json.
