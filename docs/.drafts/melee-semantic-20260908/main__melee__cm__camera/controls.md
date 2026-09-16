# Camera Controls Review

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. Canonical and rendered camera.c lines 1087 through 2352 are fully reviewed. The frozen source SHA-256 is `283fe477b13d4c9234038db6b6d1350cc203cec962e1e65bd26bf16a69c30b73`.

## Behavior and State

The gameplay update calculates primary and copied transforms, caches unzoomed distance, smooths both, and invokes quake helpers on the primary transform. Interactive controls maintain a selected subject, focal offset, eye offset and up vector. Their transform update resolves the subject, applies constraints before smoothing, then calls quake helpers.

Input selector 5 disables input and selector 4 combines analog sources. Subject selector 10 uses the stage-position provider; 11 is invalid for normal resolution and a preserve-state sentinel in camera_cddc_select. These selector domains must stay separate.

## Function Review

### `Camera_8002A768`

Computes four target-view corner rays, projects valid rays onto z=0, compares them with camera bounds when arg1 is zero or blast-zone bounds otherwise, and translates target position and interest by the same XY correction. Opposing violations are averaged, so this is a best-effort correction rather than a guarantee that an oversized view fits.

Inputs: target_fov, target_interest, target_position, cm_803BCB64.aspect, cm_WorldForward, arg1 and stage boundary accessors.

Writes transform target_position and target_interest only if a violation mask is nonzero; ignores rays with z >= -0.001.

No exact-fit guarantee; the branch comment says arg1 is always zero, but that is not proof about every caller.

Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L1087-L1339`.

### `Camera_8002AF68`

Installs transform FOV, XY-translated interest, and XY-translated eye position on an HSD_CObj. Before setting the eye, clamps its Y against a lower bound returned by one of six stage-specific functions selected by stage_info.grkind.

Inputs: cobj, transform fov/interest/position, game_camera.translation.x/y and stage_info.grkind.

Calls HSD_CObjSetFov, HSD_CObjSetInterest and HSD_CObjSetEyePosition; leaves the input transform unchanged.

Foreign stage callees are only known here as providers of the compared Y bound; their rendered pause/floor names are not proof.

Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L1341-L1386`.

### `Camera_8002B0E0`

Updates game_camera.x2BC from slot-0 player controller vertical substick input when gm_8016B41C() is nonzero and x2C0 is positive. Uses a 0.85 threshold, x2BA reload/countdown and configured fallback increment, then clamps x2BC between xDC and xD8.

Inputs: gm_8016B41C(), x2C0, Player_GetPlayerId(0), HSD_PadCopyStatus, cm_803BCCA0 xD4/xD8/xDC/xE0/xE4.

Writes x2BA and x2BC; strong input reloads x2BA, neutral input waits for countdown before using xE4.

Single-player meaning of gm_8016B41C remains a foreign-family question.

Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L1388-L1422`.

### `Camera_8002B1F8`

Applies zoom multiplier m=game_camera.x2BC to a supplied target transform around the accepted slot-0 camera subject, with a slot-1 Sandbag fallback. Sets interest to subject+(old_interest-subject)*m*m and eye to new_interest+normalize(old_eye-new_interest)*(x2C0*m).

Inputs: transform, x2BC/x2C0, player entities and camera subjects, eligibility/bounds results and ftLib_8008732C.

No change when m is exactly one or neither candidate qualifies; otherwise replaces both target vectors.

The normalized direction uses the newly changed interest, not the original eye-to-interest direction. Exact ftLib predicates require family review.

Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L1424-L1468`.

### `Camera_8002B3D4`

Updates primary and copied gameplay camera transforms through bounds/FOV calculations, conditionally recalculates and bounds-corrects target vectors, caches unzoomed target distance, applies zoom and stage tracking smoothing, invokes quake updates on the primary transform, and updates average stage camera width.

Inputs: Unused arg0; both singleton transforms, camera tuning, stage smoothing/bounds and fighter-depth guard.

Helpers update x2C0 only when x2BC==1, smooth both transforms, apply quake calls only to primary, and restart the width accumulator after count>1000.

The depth guard skips Camera_80029CF8 and Camera_8002A768, not the preceding bounds/FOV/depth calculations.

Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L1558-L1571`.

### `Camera_8002B694`

Fills CameraInputs from a selected controller. Selector 5 clears all fields; selector 4 independently chooses the first main stick and substick whose absolute axis exceeds 0.85, or zeros each pair when none qualifies; ordinary selectors copy one pad. Buttons come from gm_GetButtonsPressed/Triggered with the selected source.

Inputs: Output CameraInputs pointer, slot, copied pad states and processed button accessors.

Writes all six fields without modifying pad state. Aggregate stick pairs can come from different controllers.

The OR semantics of gm button aggregation require its owner; this body demonstrates argument 4, not the implementation of the accessor.

Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L1588-L1693`.

### `Camera_8002BA00`

Steps the camera subject selector by a signed increment, using sentinel 10 between player slots 5 and 0 and recursively skipping slots whose Player_GetEntity result is NULL. Returns sentinel 10 without an entity lookup.

Inputs: slot and arg1 signed step; Player_GetEntity.

Returns next selector; no singleton writes. Sentinel 10 moves to 0 for a positive step and 5 for a negative step.

Normal +/-1 usage is shown in controls; a zero step at an empty ordinary slot recurses without progress.

Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L1695-L1718`.

### `Camera_8002BAA8`

Changes pause_eye_distance by zoom_amt times a length-dependent configured rate, clamps it to x2D0.unk28/unk2C, and rebuilds pause_eye_offset at that distance. An offset shorter than one substitutes a direction and starts stored distance at ten.

Inputs: zoom_amt, pause_eye_offset/distance, x9C/xA0 and x2D0 depth limits.

Writes pause_eye_distance and pause_eye_offset, including normalization/clamping for a zero input.

Camera_PauseZoom is attested in the immediately preceding canonical comment; renderer reports name_collision.

Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L1721-L1761`.

### `Camera_8002BC78`

Rebuilds right and up basis vectors. When forward.y exceeds 0.999 or is below -0.999, snaps forward to the corresponding vertical axis, restores up from pause_up, and returns +1 or -1; otherwise returns zero.

Inputs: Mutable forward/up/right Vec3 pointers and retained pause_up.

Always computes normalized right=up cross forward and normalized up=forward cross right; mutates forward only at a pole.

Assumes usable input basis; no explicit zero-cross-product recovery is present.

Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L1771-L1794`.

### `Camera_8002BD88`

Moves pause_eye_offset along input-scaled camera-up and negative-right directions, then normalizes it to pause_eye_distance. Builds and stores pause_up, and suppresses horizontal input plus outward vertical input when the pole helper returns a nonzero sign.

Inputs: x/y orbit inputs, pause_eye_offset/distance/up, world-up and xBC/xC0 rate coefficients.

Writes pause_up and pause_eye_offset; short starting offset resets stored distance to ten and substitutes forward basis.

Camera_PauseRotate is attested in the preceding canonical comment; short-offset handling does not replace pos, so no unconditional nondegeneracy guarantee.

Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L1797-L1860`.

### `Camera_8002C010`

Pans game_camera.x314 in the camera-relative up and negative-right directions using each input times eye_distance*xB4+xB8. Derives the basis from negated pause_eye_offset and the pole helper.

Inputs: farg0 horizontal, farg1 vertical, pause_eye_offset, cm_803B73DC, xB4/xB8.

Adds only nonzero-axis movements to x314; short offset substitutes forward, effective distance one, and stored pause_eye_distance one.

The sign of rate coefficients is not established here, so speed increasing with distance is not unconditional.

Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L1862-L1904`.

### `Camera_8002C1A8`

Decodes the selected controller into subject cycling, zoom, pan and orbit operations. Triggered R/L changes x304 and resets offsets/up/distance; D-pad pans, X/Y or main-stick Y zooms, A redirects the main stick to pan, and substick input orbits.

Inputs: x305 input selector, x304 subject selector, CameraInputs, x32C and tuning coefficients.

Returns immediately for x305==5. Uses strict 0.125 analog dead zones. Subject 10 gets triple initial distance and world-X/Y movement; other subjects use camera-relative panning.

The special movement helper sets distance to one only when eye-offset length is below one; it does not generally clamp existing distance.

Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L1913-L2034`.

### `Camera_8002C5B4`

Calls an optional constraint-record callback, clamps x308 to XYZ bounds, clamps x308+x314 to the same bounds and reconstructs x314, then conditionally rotates pause_eye_offset to correct pitch and yaw limit violations.

Inputs: Camera_x2D0 pointer, optional callback, XYZ min/max, angle_up/down/left/right, x308/x314 and pause basis.

Callback runs before constraints. Pitch correction precedes yaw calculation; rotation axes are computed before either rotation. No mode or timer assignment appears in this body.

Do not promise independently exact final pitch/yaw: the second rotation uses the precomputed cross2 axis. Callback side effects are not bounded by this body.

Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L2042-L2159`.

### `Camera_8002C908`

Updates a subject-relative controllable camera: processes controls, retries subject resolution, clamps base/offset/orbit state, forms target interest and eye, approaches current vectors using x84 and FOV using x88 toward x32C, then invokes Camera_UpdateQuakes and Camera_ApplyQuake.

Inputs: Unused arg0; x304/x308/x314, pause_eye_offset, transform, x32C, x84/x88 and subject-resolution helpers.

Constraints run before target construction and smoothing. Final calls are quake helpers, not a second geometric bounds correction.

CAMERA_FREE table registration and player-facing mode descriptions need TU lead or foreign-header evidence.

Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L2287-L2350`.

## Coverage and Dispositions

14 function targets, 16 inline helpers, 20 parameter entities and 84 inherited facts reviewed. All 20 parameter entities have zero inherited facts. Register suffixes are not enough to assign canonical parameter names, so entity writes remain deferred.

33 draft fact writes. Exact fact IDs, updated_at version stamps, content hashes and retain/supersede/unresolved decisions are in controls.findings.json. The proposal has empty entities, merges, links and follow_ups arrays.

Six successful page receipts cover all 1,266 assigned lines in both views; no empty or failed render occurred. Page artifacts retain render metadata and substitution/collision reporting. No headers were assigned to this cluster.

## Pending Family Evidence

The 1P and Free qualifiers need gate/table evidence outside this range. PauseZoom and PauseRotate are attested in local comments but reported as renderer collisions. Foreign fighter predicates, stage functions and game-manager button aggregation remain family questions.

The draft corrects inherited claims that target views always fit, that zoom preserves the original eye direction, that depth gating skips all bounds computation, and that the final free-camera calls are bounds correction. It also removes unconditional stable-basis and degenerate-offset guarantees.

## Final Validation and Collision Check

Dry-run validation accepted all 33 writes with zero rejections. No shared KB writes occurred.

Pinned cm source search found Camera_PauseZoom and Camera_PauseRotate only in the comments directly preceding their canonical functions. The renderer checks all source words, so those comments trigger name_collision without a duplicate function binding. Retain the comment-attested aliases and defer the renderer behavior as a tool issue.

Supplementary canonical and rendered reads cover camera.c57 through 67 and 3682 through 3739. The table registers Camera_8002C908 at slot 5, and setup assigns CAMERA_FREE while initializing the same control state. Numeric enum identity and player-facing mode descriptions remain with the TU or family review. No unresolved 1P name is promoted.
