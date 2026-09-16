# Camera Transitions

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. Canonical and rendered lines 2353–3377 are reviewed. The cluster contains 18 indexed functions, four canonical inline helpers and 108 inherited facts. The cluster also owns 19 parameter entities, all reviewed and empty of inherited facts. No headers or global entities belong to this cluster.

Fact decisions: {'supersede': 38, 'retain': 63, 'unresolved': 7}. Proposed writes: 38. No new names, clears, entities, links, merges or follow-up writes. Detailed IDs, versions and immutable read receipts are in `transitions.findings.json`.

## State and Callback Flow

Pause and selected-subject callbacks update the primary transform directly when their distinct eligibility guards succeed. Rejected subjects run the dual-transform framing fallback. Fixed mode smooths both transform records toward stage targets, then updates quake effects on the primary transform.

Boss-intro setters tag source unions, seed the mode on first entry and configure targets. The update callback samples successful providers, interpolates three channels under one progress schedule, advances progress and stores completion computed before that advance. The immediate commit uses schedule 0 and snaps FOV, but does not update the completion bit itself.

## Function Inventory

| Canonical Symbol | Lines | Behavior | Inherited Name |
|---|---:|---|---|
| `Camera_8002CB0C` | 2353–2453 | Processes pause-camera input from game_camera.x2C5 unless that slot is 5. Triggered R/L cycle eligible player subjects; held X/Y pass signed zoom requests; stick axes pass rotation requests only beyond absolute 0.125. A subject change resets focal offset, eye offset, up vector and stage-derived eye distance before zoom and rotation calls. The CameraBounds pointer is unused. | `Camera_UpdatePauseCameraInput` retained as hypothesis |
| `Camera_8002CDDC` | 2455–2497 | Updates the pause camera by refreshing bounds, selecting a subject and applying pause input. An active eligible subject in bounds with abs(bone_pos.z) < 30 and slot other than 10/11 takes track_subject and FOV smoothing. All other cases update both transforms through the general bounds and zoom pipeline. | `Camera_UpdatePause` retained as hypothesis |
| `Camera_8002D318` | 2528–2630 | Updates the training-menu camera around the selected fighter. The specialized path requires a present fighter passing ftLib_8008701C == false, a subject passing Camera_8002928C, in-bounds position and abs(z) < 10. It offsets target interest by half ext.v.z along yaw, smooths interest/FOV/eye and uses a subject-scaled orbit distance. Failed guards run the general dual-transform framing pipeline. | `Camera_UpdateTrainingMenu` retained as hypothesis |
| `Camera_8002D85C` | 2632–2738 | Updates the clear camera around the selected player subject when its position is in bounds and abs(z) < 30. It targets bone_pos, smooths interest and FOV, clamps pitch/yaw to stage limits, and smooths the orbit eye position. It does not repeat the training path fighter-state or Camera_8002928C tests. Failed guards run general dual-transform framing. | `Camera_UpdateClear` retained as hypothesis |
| `Camera_8002DDC4` | 2767–2845 | Smooths both retained transforms toward stage-supplied fixed-camera interest, position and FOV using x74, x78 and x7C. It derives bounds.z_pos from the target interest-to-eye distance, calls Camera_UpdateQuakes, and applies quake effects to the primary transform with Camera_ApplyQuake. | `Camera_UpdateFixed` retained as hypothesis |
| `Camera_8002DFE4` | 2847–2886 | Writes a Vec3 endpoint or interpolation into transform->interest using shared immediate, integer-count or floating-progress scheduling and returns completion. Camera_8002E234 also reuses this helper for position by passing a CameraTransformState pointer cast from transform.position, whose first field overlays the destination Vec3. | `Camera_InterpolateInterest` retained as hypothesis |
| `Camera_8002E158` | 2888–2923 | Writes a scalar endpoint or start + progress * (end - start) through the output pointer and returns completion. Shared mode 0 completes immediately; mode 1 completes when integer counters are equal and otherwise uses their ratio; mode 2 completes at floating progress >= 1. This helper does not advance progress. | `Camera_InterpolateScalar` retained as hypothesis |
| `Camera_8002E234` | 2925–2984 | Updates current eye position under the shared transition schedule. Position sources 0/1/3 use Cartesian interpolation from x368 to target_position. Source 2 conditionally interpolates enabled elevation, yaw and signed-16-bit radius values, rotates a forward vector, scales it and adds current interest to construct target and current position. The canonical body unconditionally consumes all three interpolation locals after conditional initialization, so partial component masks do not establish safe current-position output. | `Camera_UpdatePositionTransition` retained as hypothesis |
| `Camera_8002E490` | 2986–3067 | Updates the boss-intro transition. Interest sources select retained target, player bone_pos, stored vector or a successful callback; eye sources select retained target, vector, spherical reconstruction or successful callback. It interpolates interest, eye and FOV, combines their completion, then advances integer or floating progress and stores the pre-advance completion in x341_b7. | `Camera_UpdateBossIntroTransition` retained as hypothesis |
| `Camera_8002E6FC` | 3069–3104 | Ensures boss-intro mode, selects player-backed interest source 1 and stores the player slot. A present player entity with a CmSubject supplies bone_pos to target_interest immediately; failed lookup leaves the seeded or prior target unchanged. | `Camera_SetBossIntroInterestPlayer` retained as hypothesis |
| `Camera_8002E818` | 3106–3141 | Ensures boss-intro mode and selects fixed-vector interest source 2. It copies the caller vector into x344.vec and immediately into target_interest; it does not retain the input pointer. | `Camera_SetTargetInterest` retained as hypothesis |
| `Camera_8002E948` | 3143–3178 | Ensures boss-intro mode, selects callback interest source 3 and stores the supplied provider. It immediately calls a non-null provider with a temporary Vec3 output and copies that vector into target_interest only on a true result. A null provider or false result preserves the seeded or prior target. | `Camera_SetTargetInterestCallback` retained as hypothesis |
| `Camera_8002EA64` | 3180–3202 | Ensures boss-intro mode and selects fixed-vector eye-position source 1. It copies the supplied vector into x35C.vec and immediately into target_position, without retaining or modifying the caller vector. | `Camera_SetTargetPosition` retained as hypothesis |
| `Camera_8002EB5C` | 3204–3235 | Ensures boss-intro mode and selects spherical eye source 2. On changing source it clears radius and yaw enable bits, then stores the elevation parameter in x35C.vec.y and enables b1. Existing spherical mode preserves sibling components. Eye vectors are reconstructed later. | `Camera_SetBossIntroPositionElevation` retained as hypothesis |
| `Camera_8002EC7C` | 3237–3268 | Ensures boss-intro mode and selects spherical eye source 2. On changing source it clears radius and elevation enable bits, then stores the yaw parameter in x35C.vec.z and enables b2. Existing spherical mode preserves sibling components. Eye vectors are reconstructed later. | `Camera_SetTargetPositionYaw` retained as hypothesis |
| `Camera_8002ED9C` | 3270–3301 | Ensures boss-intro mode and selects spherical eye source 2. On changing source it clears both angular enable bits, then converts the float radius parameter into signed-16-bit x35C.bits.x2 and enables b0. Existing spherical mode preserves angular components. Eye vectors are reconstructed later. | `Camera_SetBossIntroDistance` retained as hypothesis |
| `Camera_8002EEC8` | 3303–3309 | Ensures boss-intro mode and writes the supplied fov to transform.target_fov. It does not directly assign current fov or configure a transition duration. Entering from another mode seeds current interest, position and FOV through Camera_8002FE38; an already-active boss-intro mode skips that initialization. | `Camera_SetBossIntroFov` retained as hypothesis |
| `Camera_8002EF14` | 3311–3376 | Ensures boss-intro mode, selects immediate schedule 0, refreshes configured interest and eye sources, runs the interest and position helpers, and copies target_fov to current fov. Missing player/subject or failed/null callback leaves the corresponding stored target unchanged. This function does not set the completion flag x341_b7. | `Camera_ApplyBossIntroTargets` retained as hypothesis |

## Inline Helpers

`compute_orbit_distance`, lines 2502–2518: Returns 2*subject.ext.v.z/tan(degrees-to-radians(target_fov)) for an ordinary slot 0..5 with player and subject; otherwise 1000. Does not mutate camera state.

`get_subject_x1C`, lines 2523–2526: Returns the address of subject.bone_pos. The nearby canonical TODO questions whether this reconstructed inline helper existed originally.

`set_bounds_z`, lines 2740–2747: Writes bounds.z_pos to the length of interest minus position. Inputs are read, bounds is written.

`smooth_fixed_camera_interest`, lines 2749–2765: Gets the stage interest into the passed transform_copy target and smooths cam.transform_copy.interest toward it with globals.x74. Correct use depends on the pointer identifying the same transform copy, as at the reviewed call site.

## Uncertainty and Family Work

1. Spherical mode uses three locals after conditional initialization. Partial masks need source/assembly and caller review. The proposal records this limit.
2. Radius input is float but storage is s16. Fractional precision is discarded; caller range enforcement is unreviewed.
3. Seven Hand-specific game mappings remain unresolved. Their prior citations and versions are preserved for family review.
4. Foreign camera headers and lbvector rotation were read only for enum, layout and angle context. They remain outside ownership.

Canonical behavior evidence and exact `code://` locators are attached per function and per fact in the findings and proposal. Render names are reading aids only. No source edits, shared KB writes, matching, publication or UI startup occurred.

Dry-run validation passed: 38 accepted operations, zero rejections. Proposal hash `57d06d6aaad92ecbda7ea4c827a5a2a744a3d1a29ea7ab7e3f9c63d942faea6f`. Research elapsed 202 seconds from first page receipt. Independent review and TU reconciliation remain pending.

## Parameter Entity Reconciliation

All 37 owned subjects are accounted for: 18 function targets and 19 active parameter entities. Each parameter entity has an explicit `reviewed_empty` record with its full locator and canonical evidence in the findings. The proposal is unchanged. All 18 inherited inferred-name aliases remain supported hypotheses.

| Entity Locator | Fact Count | Disposition |
|---|---:|---|
| `main/melee/cm/camera:Camera_8002CB0C#r3` | 0 | reviewed_empty |
| `main/melee/cm/camera:Camera_8002CDDC#r3` | 0 | reviewed_empty |
| `main/melee/cm/camera:Camera_8002D318#r3` | 0 | reviewed_empty |
| `main/melee/cm/camera:Camera_8002D85C#r3` | 0 | reviewed_empty |
| `main/melee/cm/camera:Camera_8002DDC4#r3` | 0 | reviewed_empty |
| `main/melee/cm/camera:Camera_8002DFE4#r3` | 0 | reviewed_empty |
| `main/melee/cm/camera:Camera_8002DFE4#r4` | 0 | reviewed_empty |
| `main/melee/cm/camera:Camera_8002DFE4#r5` | 0 | reviewed_empty |
| `main/melee/cm/camera:Camera_8002E158#r3` | 0 | reviewed_empty |
| `main/melee/cm/camera:Camera_8002E158#r4` | 0 | reviewed_empty |
| `main/melee/cm/camera:Camera_8002E158#r5` | 0 | reviewed_empty |
| `main/melee/cm/camera:Camera_8002E490#r3` | 0 | reviewed_empty |
| `main/melee/cm/camera:Camera_8002E6FC#r3` | 0 | reviewed_empty |
| `main/melee/cm/camera:Camera_8002E818#r3` | 0 | reviewed_empty |
| `main/melee/cm/camera:Camera_8002EA64#r3` | 0 | reviewed_empty |
| `main/melee/cm/camera:Camera_8002EB5C#r3` | 0 | reviewed_empty |
| `main/melee/cm/camera:Camera_8002EC7C#r3` | 0 | reviewed_empty |
| `main/melee/cm/camera:Camera_8002ED9C#r3` | 0 | reviewed_empty |
| `main/melee/cm/camera:Camera_8002EEC8#r3` | 0 | reviewed_empty |
