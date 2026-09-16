# Developer camera and stage presentation

## Scope and assessment
Reviewed all 627 canonical and rendered lines of `src/melee/db/dbcamera.c`, all 64 frozen subjects, all 122 facts, and all 26 links. Restored evidence was delivered and independently assessed; previous packets were not treated as proof. The saved ledger explicitly retains 104 facts and 23 links, supersedes eight state explanations, and leaves ten section facts and three links unresolved.

Existing function names generally fit canonical behavior. No naming changes are proposed merely to avoid renderer collisions. The rendered view reports no parse errors, but six owned names are withheld for collisions; it substitutes function names only, not parameters or fields. External rendered names were not used to establish their own meanings.

## Stage controls
`fn_SetupMiscStageVisuals` only assigns selector zero; it does not reapply default rendering settings. R held with newly pressed D-pad Down increments the unsigned selector and applies six explicit presets, with the default branch applying the reset tuple and returning the selector to zero. Zero-valued setter arguments are recorded numerically, not universally interpreted as disabled visuals. The independent X-plus-Down branch reads, but does not advance, `db_MiscVisualEffectsStatus`: states 0/1 restore the stage background and show the stage; other values hide it. Both chord branches can execute in one call.

`fn_802270C4` traverses fighters with non-null fighter and shadow data, writes `!arg0` to the debug suppression bit, and delegates activity refresh. The callee has additional eligibility and pointer guards; clearing suppression permits rather than forces visibility, and setting suppression does not guarantee an immediate activation write when those guards fail. `fn_8022713C` assigns `Ground.x10_flags.b7` across non-null user data in the x14 list. Its participation in presets is established; its independent visible effect is not.

Evidence: [stage controls and helpers](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcamera.c#L45-L172), [shadow refresh guards](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbshadow.c#L154-L171).

## Camera input and cross-file state
`fn_CheckCameraInfo` conditionally requests camera transitions when `gm_8018841C() == 0` and the current game mode is not `GM_CAMERA_MODE`. With neither debug-camera predicate active, an axis magnitude strictly above 0.6 takes precedence over D-pad Up and requests free mode. Otherwise newly pressed Up attempts lazy panel creation and, without Y/X/L/R, requests free-to-follow, follow-to-saved-mode, or other-to-free transitions. Follow entry can fail when the player or camera subject is unavailable; restoration uses the saved mode rather than necessarily the ordinary camera mode. Movement dispatch remains outside the transition guard.

The free/follow input dispatchers mask the port to eight bits, reread master-pad state, and zero axis magnitudes strictly below 0.2. Exactly +/-0.2 passes through; the comparison does not filter NaNs. Button mask 1 takes priority for dolly, mask 2 selects pan with both axes negated, and neither selects orbit. The low-byte mask is not an array bounds check.

The follow reference getter returns a borrowed `bone_pos` address through player and camera-subject lookups without local null checks. The movement helpers accept a null anchor, but that fallback does not prove that disappearance of a followed player safely produces null at the getter. No ownership transfer or anchor mutation is shown.

`db_RunEveryFrame` first updates miscellaneous effects for four slots, then invokes the camera handler four times, and invokes the stage handler later. Input-state refresh can cover only two slots when a boss hand is present while these later loops still cover four. Shared selector, overlay, and camera state therefore must not be modeled as independent per-player state or as one camera update per frame.

Evidence: [camera handler and dispatchers](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcamera.c#L278-L386), [camera transitions and borrowed reference](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L3835-L3943), [debug dispatcher order](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L163-L249).

## Overlay allocation, visibility, and timer
Setup clears the retained display pointer, timer, and show flag; it neither frees nor hides a previously created object. Lazy creation requires an available developer-text GObj and a null retained pointer. Successful creation uses the static 0xC0-byte buffer, translucent black background, white text, and 12-by-16 scale, then initially hides background and text. Failed creation leaves the pointer null for a later attempt.

The updater obtains the camera GObj before testing the panel pointer. With panel, camera, and show flag available, timer values above one refresh and show three rows; one hides the panel and decrements to zero; zero returns. Missing camera or a cleared show flag hides an existing panel without decrementing. Every free-camera dispatcher call reloads 60, even with zero filtered input, so this is not an inactivity timeout measured in frames. Under ordinary eligible free-mode processing the subsequent updater changes 60 to 59, and the next free update reloads it again.

B toggles visibility only in free mode with unsigned stage selector 3 or 4; other states clear the show flag. The panel prints eye and interest coordinates, FOV, and `degrees(atan2(interest.y-eye.y, -(interest.z-eye.z)))`. Coordinates with absolute magnitude strictly greater than 99999 become -1; the boundary values enter conversion. NaNs are not rejected by that comparison, and exact exceptional float-to-integer outcomes are not established here. FOV and ANG conversions have no corresponding magnitude guard.

Evidence: [setup, creation, and updater](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcamera.c#L174-L276), [visibility and timer reload](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcamera.c#L304-L386).

## Movement math and literal destinations
Orbit reads the active camera's forward vector and distance, adjusts requested polar-angle change using comparisons against 1 and 179 degrees, applies pitch and world-up yaw, rescales by distance, and writes only the supplied eye output as interest minus displacement. It does not modify the supplied interest vector. The comparisons express the intended ordinary-input constraint, not complete pole or nonfinite protection: the acos argument is unclamped, a pole can produce a zero cross-product axis, normalization is unchecked, and the eye-vector accessor's failure return is ignored.

Dolly reconstructs an eye displacement using `distance * (1 - 0.05 * input)` and leaves its interest anchor unchanged. Its normal-input interpretation is movement toward or away from the anchor, not FOV zoom. No explicit distance clamp is present. Pan computes `0.03 * 2 * distance * tan(FOV_radians / 2)` and applies equal left-axis and negative-up-axis displacement to both endpoints. Separation preservation and increasing perspective scale are ordinary valid-geometry interpretations, not guarantees for nonfinite, degenerate, aliased, or arbitrary-FOV inputs. Camera basis accessors can return fallback vectors; these callers do not inspect their status.

All three anchored wrappers refresh world-position fields even at zero input. Preserve the assignments literally: `follow_eye_pos = follow_int_offset + anchor`, and `follow_int_pos = follow_eye_offset + anchor`. Do not silently reverse them to fit field names. Null anchors use free-camera paths, which are guarded against zero input. The generic pan helper itself computes its scale before its individual axis guards, unlike its guarded wrapper.

Evidence: [orbit and rotation wrappers](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcamera.c#L389-L454), [dolly](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcamera.c#L456-L508), [pan and anchor reconstruction](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcamera.c#L510-L626), [camera vector accessors](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L575-L755).

## Section evidence limits
Delivered archived `object-obj.txt` and `object-src.txt` disagree with baseline palette/dispatch placement: their .data bytes contain the three diagnostic format strings; .rodata contains a world-up vector; .sdata2 begins with the color bytes and then scalar constants. Reference/source extents differ for .rodata, .data, and .sbss. These observations identify defects in the baseline reasoning, but the artifacts do not establish a revision-attested current build with symbol/relocation ownership. No replacement compiled-layout claim is proposed. Source-level palette, buffer, persistent-state, and arithmetic roles remain documented independently of exact section placement.

Status: researched; no-change lead bypass; independent review and live promotion pending.
