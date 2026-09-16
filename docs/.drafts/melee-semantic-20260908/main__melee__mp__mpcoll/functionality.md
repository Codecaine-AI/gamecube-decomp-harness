# Disjoint Librarian Research

### shard-main__melee__mp__mpcoll-000
Reviewed canonical and rendered `src/melee/mp/mpcoll.c` lines 1–480 only.

- Resets shared callback/context state; `mpCollPrev` clears callback/context pointers, debug-checks current X/Y coordinates against strict ±45000 bounds, and copies the current position to `x28_vec`.
- Computes a bounding rectangle enclosing current and previous positioned ECB extents, optionally enlarges it using ledge-snap parameters, and passes it to `mpBoundingCheck`.
- Initializes collision state, position histories, contact indices/flags/normals, filtering identifiers, snap parameters, and ECB storage. Joint-based and fixed-source setters record their inputs and conditionally seed ECB histories with the same default four-point shape.
- `mpColl_80042384` repairs desired-ECB coordinates: clamps top and horizontal extents, corrects inverted vertical ordering, and recenters side heights when outside or too close to vertical endpoints.
- `mpColl_LoadECB_JObj` optionally clears the current ECB, snapshots it, accumulates relative X/Y bounds from six joint-derived vectors, applies padding and flag-dependent coordinate constraints, writes the desired ECB with a configurable side-height offset, and clears `x34_flags.b0`. Its threshold branches do not generally enlarge dimensions to their thresholds: the horizontal branch recenters the existing width, while the vertical branch reconstructs the existing span.
- Local helpers implement scalar clamps and conditional minimum/maximum updates.

### shard-main__melee__mp__mpcoll-001
Reviewed canonical and rendered `src/melee/mp/mpcoll.c` lines 481–960 only.

- Fixed-source ECB loading consumes a pending clear flag, snapshots the current ECB, selects horizontal extents using facing direction, optionally derives bounds from rotated points, enforces minimum width and height of 3, and writes the desired ECB with vertically centered side points. The collision-box loader instead copies supplied coordinates. Both reset `x34_flags.b0`.
- ECB-loading wrappers select joint-object or fixed sources, preserve the desired bottom point when locked, and call `mpColl_80042384`. Interpolation snapshots the current ECB, optionally replaces its starting value from `x64_ecb`, interpolates all four points toward the desired ECB without clamping the interpolation parameter, and asserts on NaN coordinates.
- Wall-list helpers suppress entries that equal or are reported connected to an existing line, assert capacity, and append otherwise.
- Callback dispatch resolves a line's joint and invokes an available joint callback. The first callback receives selector 1 or 2 according to a boolean; the second receives 0. `mpCollEnd` conditionally refreshes the low byte of floor flags, dispatches callbacks using vertical position displacement and contact conditions, and performs debug position-range diagnostics. Explicit line dispatch handles floor and ceiling kinds with zero displacement.
- Small setters request deferred ECB clearing, synchronize current/previous/last positions, set facing direction, or set fixed-source rotation. Rotation adjusts by at most one full turn; unsupported source rotation reports an error and loops indefinitely.
- The assigned prefix of `mpColl_80043754` computes position displacement magnitudes and ECB extent changes; its remaining algorithm is outside this shard.

### shard-main__melee__mp__mpcoll-002
Reviewed canonical and rendered `src/melee/mp/mpcoll.c` lines 961–1440 only.

- The opening loop fragment divides movement into steps when the computed maximum exceeds 6, interpolates the ECB, advances position, brackets each collision callback with bounding checks, and permits early termination through `x34_flags.b5`.
- `mpColl_800439FC` and `mpColl_80043ADC` perform mirrored ceiling/wall corner corrections: probe from an ECB side using the ceiling normal, derive a candidate horizontal position from contact, and update position only after a successful ceiling query.
- `mpColl_80043BBC` and `mpColl_80043E90` test bottom-to-side ECB segments against walls and report hits only when the wall differs from the adjacent non-floor line. `mpColl_80043C6C` and `mpColl_80043F40` perform mirrored floor/wall corrections, including wall-top fallback probes; `ignore_bottom` selects whether floor queries use origin height or ECB-bottom height.
- `mpColl_80044164` and `mpColl_800443C4` test rightward and leftward ledge candidates using swept snap rectangles. They require endpoint proximity and bottom-point placement, conditionally perform obstruction checks allowing same-joint intersections, optionally return a line ID, and restore bounding-check state when they established it. These routines test eligibility rather than committing a grab state.
- The closing fragment of `mpColl_80044628_Floor` sweeps the previous/current ECB bottom, selects ordinary versus remapped floor checking from `x38`, and sets floor-push/floor-hug flags for an accepted hit. It then begins a wall-adjacent-line fallback whose body lies beyond this shard.

### shard-main__melee__mp__mpcoll-003
Reviewed canonical and rendered src/melee/mp/mpcoll.c lines 1441–1920 only.

- The opening floor-check tail accepts a positive floor correction subject to platform-skip and callback checks, then sets FloorPush.
- mpColl_80044838_Floor adjusts vertical position using the stored floor, or clamps the ECB bottom to a selected floor endpoint; it always returns true. mpColl_80044948_Floor also adjusts to a floor, but its endpoint fallback clamps horizontal position only when the adjacent line has the corresponding wall kind. Its return value indicates either successful floor adjustment or that wall condition, not exclusively a wall hit.
- mpColl_80044AD8_Ceiling checks movement of the ECB top using ordinary or remapped queries and joint filters. A direct hit sets CeilingPush and CeilingHug; a qualifying wall-adjacent ceiling correction sets only CeilingPush. mpColl_80044C74_Ceiling adjusts vertical position against the stored ceiling, with endpoint and adjacent-wall fallback, and always returns true.
- mpColl_80044E10_RightWall resets the candidate count and tests motion of the ECB left, bottom, and top points, current bottom-to-left and top-to-left segments, and additional previous/current edge queries when the ECB is not tiny. Successful queries pass line IDs to the right-wall helper. The left-point motion hit sets RightWallHug; any hit sets RightWallPush.
- The reviewed prefix of mpColl_800454A4_RightWall iterates stored right-wall candidates and tracks the greatest candidate horizontal position together with line ID, flags, and normal. It considers wall endpoints outside the ECB vertical span, offsets queried at ECB bottom/left/top points, and a ceiling-connected wall extension with a 0.5-unit bias. The range ends during further connected-wall vertex processing.

### shard-main__melee__mp__mpcoll-004
Reviewed canonical and rendered mpColl source lines 1921–2400 only. The opening fragment finishes a right-facing-wall correction by increasing current X and recording the selected contact. `mpColl_80045B74_LeftWall` tests previous-to-current ECB right, bottom, and top points, current right-side edges, and additional edge-motion checks when the ECB is not tiny. It dispatches hit line IDs to collection helpers, sets LeftWallHug for the right-point sweep and LeftWallPush for any hit, and returns whether a hit occurred. Its sweep wrapper selects remapped versus ordinary checks by comparing `coll->x38` with a global and passes both joint filters. `mpColl_80046224_LeftWall` consumes the shared left-wall candidates, minimizes an X constraint using point queries and connected-wall vertices interpolated against the ECB's right-side edges, then decreases current X and writes left-facing-wall contact metadata only when correction is necessary. Ceiling and floor inline helpers conditionally dispatch paired wall-handling routines. The final fragment initializes `mpColl_80046904` and shows left-wall detection preceding correction; the remainder is outside this shard.

### shard-main__melee__mp__mpcoll-005
Reviewed canonical and rendered src/melee/mp/mpcoll.c lines 2401–2880 only.

- The opening collision-resolution tail repeats wall checks, records corrected coordinates, and invokes horizontal squeeze handling when both wall bits are present. It resolves ceiling/floor interactions, distinguishes staying airborne from accepting floor contact, and repeats until the tracked flag and squeeze state stabilize. Eligible descending objects without floor contact or existing edge flags receive facing-dependent ledge checks. Wall environment masks are cleared if the corresponding contact was absent throughout the loop.
- `mpColl_80046F78` checks movement from previous to current XY, selecting `mpCheckAllRemap` versus `mpCheckAll` by an epoch-like equality comparison whose broader meaning is unverified. It dispatches on explicit collision-line kinds, obtains surface flags/normal and an offset, updates the matching surface index and corrected XYZ, sets the matching push flag, and returns success. Failed checks or invalid returned line IDs return false; unexpected kinds assert.
- Inline dispatch helpers preserve previous environment flags, clear current flags, compute `mpColl_IsEcbTiny` using two Y-coordinate differences below 6, run a selected callback through `mpColl_80043754`, and finalize via `mpCollEnd`. `inline1` additionally installs a floor callback and object in globals.
- Public wrappers select ECB-loading paths and literal dispatch options. Some accept an explicit collision box; others select joint-derived versus fixed ECB loading and call `mpColl_80042384`. Numeric options are recorded as implementation choices, not assigned gameplay meanings. The final wrapper begins at the shard boundary and is not fully covered.

### shard-main__melee__mp__mpcoll-006
Reviewed canonical and rendered mpColl.c lines 2881–3360 only.

- ECB entry wrappers call mpCollPrev, select ECB-loading paths, and delegate to inline0 with differing numeric arguments or to inline4. No gameplay meaning is assigned to those arguments.
- mpColl_800488F4 checks the stored floor, queries using the world-space ECB bottom, and on success adjusts position Y and updates the floor index. On failure, it examines floor endpoints and adjacent non-floor lines: a qualifying wall causes position to be replaced with the endpoint; otherwise it sets the corresponding ledge-slip flag.
- mpColl_80048AB0_RightWall tests movement of the left, bottom, and top ECB points and the current/swept left-side edges. Bottom-related tests exclude two floor-derived line IDs. Swept-edge tests are skipped for a tiny ECB. A left-point hit sets RightWallHug; any accepted hit sets RightWallPush.
- mpColl_800491C8_RightWall computes a maximum admissible X from recorded right-wall candidates, point queries, and connected wall vertices interpolated against the ECB's left-side edges. It moves the object only when current X is smaller, then stores the selected right-facing wall index, flags, and normal.
- The assigned beginning of mpColl_80049778_LeftWall shows corresponding right-side ECB tests, floor-derived exclusions, and LeftWallHug updates; its remaining behavior lies outside this shard.

### shard-main__melee__mp__mpcoll-007
Reviewed canonical and rendered src/melee/mp/mpcoll.c lines 3361–3840 only.

- The opening wall-detection fragment tests current ECB edges and, unless the ECB is tiny, previous-to-current geometry; a detected hit sets Collide_LeftWallPush.
- mpColl_80049EAC_LeftWall computes a minimum allowed horizontal position from collected left-facing walls, ECB sample points, and connected wall vertices. It clamps cur_pos.x only when necessary and records the selected wall index, flags, and normal.
- mpColl_8004A45C_Floor snaps the ECB bottom to a floor endpoint when the position lies beyond that endpoint and the corresponding wall test permits it, setting a side-specific edge flag and floor metadata.
- mpColl_8004A678_Floor adds wall-mask, facing-direction, and stick-threshold gates to endpoint snapping. It conditionally applies the floor query's vertical offset and sets Collide_Edge on success.
- mpColl_8004A908_Floor performs up to two floor sweeps toward the current ECB bottom: first from the previous bottom, then from the previous vertical midpoint. It accepts only a valid floor distinct from, and not connected to, the supplied line, updating floor metadata without moving the position.
- The final, partial mpColl_8004AB80 body applies a ceiling-query vertical correction when available; otherwise it aligns height to a ceiling endpoint and checks adjacent non-ceiling lines for wall connectivity.

### shard-main__melee__mp__mpcoll-008
Reviewed canonical and rendered src/melee/mp/mpcoll.c lines 3841–4320 only.

- `mpColl_8004ACE4` coordinates repeated left/right wall checks, ceiling and floor handling, and horizontal/vertical squeeze calls. It repeats while `x34_flags.b6` changes. Its floor fallback distinguishes flag bits 1 and 2 and temporarily excludes the existing floor during another check. A final floor check can establish contact; reported contact sets `Collide_FloorPush` and determines the return value.
- Six wrappers call `mpCollPrev`, prepare collision-box state through either `mpColl_LoadECB_inline` or `mpColl_80042C58`, and return `inline2` with argument 0, 2, or 1. The numeric modes are not assigned gameplay meanings here.
- `mpColl_8004B6D8` validates the current ceiling, attempts a ceiling query using the world-space ECB top, and applies the returned vertical adjustment and ceiling index on success. Otherwise it examines ceiling endpoints and neighboring line kinds: an appropriate wall permits assigning the endpoint to `cur_pos`; otherwise the corresponding ledge-slip flag is set.
- `mpColl_8004B894_RightWall` and `mpColl_8004BDD4_LeftWall` test previous-to-current ECB side, bottom, and top coordinates, followed by current bottom-to-side and top-to-side segments. Top tests exclude two ceiling-derived line IDs. Successful side sweeps set the respective wall-hug flag; any accepted hit sets the respective wall-push flag and returns true. The routines reset separate globals and pass accepted line IDs to wall helpers.
- The assigned beginning of `mpColl_8004C328_Ceiling` validates a ceiling line and begins a left-endpoint branch, using ECB-relative coordinates and a left-wall obstruction test. Its remaining behavior is outside this shard.

### shard-main__melee__mp__mpcoll-009
Reviewed canonical and rendered mpcoll.c lines 4321–4592 only.

- The opening ceiling-edge continuation commits the edge position and ceiling contact metadata on success. `mpColl_8004C534` sequences wall checks/corrections and ceiling handling, uses flag bits 1 and 2 to gate fallback handling, and sets `Collide_CeilingPush` when returning a ceiling hit. `mpColl_8004C750` calls previous-state handling, ECB loading with argument 5, and `inline3` with argument 2.
- Horizontal and vertical squeeze helpers preserve the original ECB when b6 was clear, set b6, adjust position and ECB dimensions, synchronize affected desired-ECB coordinates, and clear b5. Horizontal squeezing does not use its `airborne` parameter; vertical squeezing distinguishes height below 3, non-airborne, and airborne cases.
- `mpColl_8004CA6C` returns 1.0 without a floor index, otherwise delegates using floor flags. Four contact-speed wrappers pass the respective contact index and ECB top coordinates with z=0 to `mpGetSpeed`. Other helpers test the floor's platform flag and set/reset the skipped floor index.
- `mpCopyCollData` explicitly copies selected collision state and contact records. Its initial conditional ECB copies are repeated unconditionally later, so `arg2` does not gate those copies in the shown source.
- `mpColl_8004D024` constructs local collision data, configures a fixed ECB with four 10.0 arguments, seeds positions from the input with last-position y offset by −3, runs collision helpers, and returns whether b6 is set.

### shard-main__melee__mp__mpcoll-010
### Collision interface declarations
Reviewed canonical and rendered `src/melee/mp/mpcoll.h` lines 1–129, the entire assigned range. This header declares a `CollData*`-centered interface, including ECB source configuration through joint objects or fixed float parameters, ECB loading and interpolation, and facing-direction configuration. It exposes numerous boolean-returning entry points, some accepting collision boxes, line identifiers, or fighter callbacks. Additional declarations cover horizontal/vertical squeezing, surface-speed queries accepting `Vec3*`, platform and floor-skip operations, and collision-data copying. The header also declares a vector-only boolean query, a two-integer `s32` function, and an external integer. These are interface observations, not verification of implementation behavior or complete TU coverage.

### shard-main__melee__mp__mpcoll-011
Reviewed the complete assigned canonical and rendered range, `src/melee/mp/mpcoll.dox:1–86`. Despite its extension, this file contains a guarded C declaration surface, not function implementations. It declares predominantly `CollData*` interfaces, including explicitly named ECB source/loading/interpolation, facing-direction, bounding-check, and floor-skip interfaces. Additional signatures expose a callback-taking routine, Boolean queries with integer output pointers, and four external integer globals. These declarations establish interface shapes, not runtime collision behavior, mutation order, geometric direction conventions, or gameplay mappings. Coverage is limited to this declaration file.

### shard-main__melee__mp__mpcoll-012
The reviewed subjects cover reusable wall-candidate and selected-contact storage, shared ECB/callback/revision state, diagnostic and numeric literals, and floor-exclusion reset. Directional checks collect deduplicated wall IDs; resolvers select opposite extreme horizontal boundaries and commit contact metadata only when correcting position. Collision wrappers classify the ECB, optionally install a floor callback, and select remapped queries on revision mismatch. `mpClearFloorSkip` writes -1 and returns normally. Source supports these behaviors but does not establish complete compiled section layouts or literal placement. This is bounded subject review, not complete TU coverage.

### shard-main__melee__mp__mpcoll-013
Reviewed six assigned functions and their relevant collision-pass and item-response context. mpCollCheckBounding submits bounds spanning successive ECB placements, with capability-gated ledge-snap expansion. mpCollEnd refreshes floor attributes, dispatches guarded stage-joint callbacks, and performs debug coordinate validation. The four surface-motion wrappers select their respective recorded contact line but all sample ECB top coordinates without adding object position. They delegate to mpGetSpeed, which returns planar remapping displacement; item collision response accumulates that displacement separately from reflected velocity. This review does not establish complete TU coverage.

### shard-main__melee__mp__mpcoll-014
Reviewed the six assigned subjects and all 28 baseline facts, not the complete translation unit. The routines reset shared callback context, perform debug position validation and position bookkeeping, store collision-facing direction, interpolate ECB geometry per collision substep, and reshape horizontal or vertical ECB coordinates after opposing contacts. Squeeze operations preserve one backup while b6 remains set; interpolation consumes that backup. Some baseline descriptions overstate frame timing, flag meaning, or gameplay conclusions.

### shard-main__melee__mp__mpcoll-015-retry180539
Reviewed the six assigned subjects, not the complete translation unit. They initialize CollData, repair desired ECB coordinates, prepare caller-supplied collision boxes, dispatch guarded floor/ceiling joint callbacks, and request deferred ECB clearing. The pending-clear setter does not move the object or immediately change geometry; ECB preparation consumes its request. Callback event numbers are reported without assigning undocumented gameplay meanings.

### shard-main__melee__mp__mpcoll-016
Reviewed the six assigned functions and their 35 baseline facts. They synchronize collision-position history, set fixed-ECB rotation, run callback-driven movement/ECB substeps, resolve mirrored ceiling/wall corners, and detect an additional left wall along the lower-right ECB edge during floor processing. Position commits in the corner helpers require both wall and ceiling queries to succeed; contact and query metadata are not transactional. This review does not establish complete TU coverage.

### shard-main__melee__mp__mpcoll-017
Reviewed the six assigned function subjects, not the complete translation unit. The corner helpers reconcile opposite ECB sides with wall geometry and revalidate the existing floor before changing position. The right-wall query excludes the current floor's next non-floor neighbor. The paired ledge probes construct swept directional bounds, validate floor endpoints, conditionally test intervening geometry, and preserve caller-owned bounding state. Floor acquisition sweeps the ECB bottom, excludes the designated platform, and can recover a wall-adjacent floor; direct and fallback acceptance set different environment flags.

### shard-main__melee__mp__mpcoll-018-retry180539
Reviewed the six assigned collision helpers and their relevant airborne-driver call sites. The floor helpers reconcile a tracked floor, either clamping to endpoints or allowing open-edge passage. Ceiling processing separates swept/adjacent-line detection from position correction. Right-wall processing separates candidate collection from maximum-rightward pushout and contact-record updates. The driver combines these results for squeeze handling and floor-dependent ledge processing. One floor helper uses the object origin, rather than the ECB bottom, when the bottom offset is positive; two baseline records are corrected accordingly. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__mp__mpcoll-019
Reviewed the six assigned collision functions and relevant shared processing and callers. Left-wall detection collects candidates from ECB trajectories, edges, and optional swept areas; resolution selects a minimum x boundary and conditionally installs the wall contact. The airborne coordinator iterates surface and squeeze resolution, returns accepted floor contact, and optionally records facing-sensitive descending ledge candidates. The point-sweep callback resolves one contacted surface. The two public wrappers prepare ordinary or supplied ECB geometry and run the zero-option airborne pass through shared interpolation and finalization. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__mp__mpcoll-020-retry180539
Reviewed the six assigned collision wrappers and their shared ECB-loading, movement-subdivision, and airborne-resolution paths, with selected fighter, throw, rebirth, and item callers. The first three wrappers enable facing-sensitive ledge discovery while returning accepted landing separately. mpColl_800476B4 enables callback-filtered stay-airborne processing; mpColl_800477E0 and mpColl_800478F4 use stay-airborne processing without that callback flag. The latter uses joint ECB construction with a zero-height bottom, subject to locked-bottom restoration. The tiny-ECB test uses top.y-bottom.y and right.y-left.y, not horizontal width. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__mp__mpcoll-021
Reviewed the six assigned collision wrappers and their shared preparation paths. They snapshot position, install explicit or source-derived ECB geometry, roll environment flags, run the shared collision driver, and finalize its result. The callback-aware variants publish a fighter/callback pair and select processing mode 2 or 6. Fighter callers select variants using cooldown/restriction guards and copy corrected positions back. The tiny-ECB predicate tests two y-coordinate differences, not horizontal width. This review does not establish complete translation-unit coverage.

### shard-main__melee__mp__mpcoll-022
Reviewed the six assigned collision wrappers and their shared ECB preparation, interpolation, airborne resolver, finalization, and fighter callers. All mutate CollData and forward the resolver result. The lock-preserving wrappers use ECB flags 0xA; the direct source wrappers use joint flags 0x12 or fixed geometry. Crucially, collision flag 1 means StayAirborne, not CanGrabLedge: mpColl_80048388 does not request ledge detection. Flags 4 and 6 enable ledge detection; flag 6 additionally enables the platform callback.

### shard-main__melee__mp__mpcoll-023
Reviewed the six assigned collision functions and their shared driver, geometry loaders, resolvers, and relevant callers. The first two wrappers rebuild ECB geometry and run the same floor-result surface resolver without optional collision flags. The point wrapper instead resolves a position trajectory against directional surfaces without rebuilding the ECB. The floor-maintenance helper follows support or handles floor endpoints. The right-wall pair collects contacts using the ECB's left boundary and then applies the greatest required rightward position correction. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__mp__mpcoll-024
Reviewed the six assigned collision helpers and their coordinator: swept left-wall candidate detection, minimum-x wall resolution, two floor-endpoint retention variants, a two-stage search excluding the existing/connected floor, and tracked-ceiling projection with endpoint fallback. The input-sensitive endpoint variant emits Collide_Edge, which fighter code consumes to enter Ottotto and zero movement. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__mp__mpcoll-025
Reviewed six assigned collision functions, not the entire TU. mpColl_8004ACE4 reconciles lateral, ceiling, floor, and opposing-surface contacts until b6 stabilizes, then performs final floor recovery and returns accumulated floor contact. Five wrappers prepare configured or caller-supplied ECB geometry and select resolver flags 0, 2, or 1 through the shared substepped driver. Fighter and item callers apply corrected positions and use the result for support-dependent control flow. The flags-1 edge branch initially records edge contact without floor contact; later floor recovery can still change the final result.

### shard-main__melee__mp__mpcoll-026
Reviewed the six assigned collision functions, not the complete translation unit. The wrapper prepares an ECB and returns shared collision processing to fighter logic. The ceiling-continuation routine corrects vertical contact or handles endpoint departure. Mirrored wall detectors accumulate swept-point and current-edge contacts, recording hug/push flags. The ceiling-edge fallback checks wall obstruction before committing endpoint position and ceiling metadata. The coordinating pass processes both walls before ceiling continuation and optional endpoint recovery; its return reports ceiling success only.

### shard-main__melee__mp__mpcoll-027
Reviewed the six assigned subjects and their 32 baseline facts. They cover ceiling-oriented collision updates used by Like Like, floor-property and platform predicates, a random-item spawn clearance probe, and desired-ECB construction from joint or fixed sources. Fixed geometry incorporates facing and rotation; loading preserves a locked bottom and normalizes geometry before interpolation. The fixed-loader-specific ledgedash mapping remains unverified. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__mp__mpcoll-028-retry180539
Reviewed the six assigned functions and relevant fighter initialization and Pass callers. The source setters install joint-backed or fixed ECB descriptors and optionally synchronize five ECB copies. The joint loader reduces six joint positions into relative bounds, applies flag-dependent adjustments, and writes desired geometry. The ledge setter stores three scalars directly. The copy helper transfers selected collision fields, including redundant conditional ECB copies. The floor-skip helper records the current floor index. Gameplay consequences beyond the verified data transfers are explicitly deferred where consumer evidence is missing.

### shard-main__melee__mp__mpcoll-029
The reviewed collision driver subdivides position and selected ECB-coordinate changes, interpolates geometry, and invokes a collision callback within map-query bounds. Update wrappers preserve and clear environment flags, classify small ECBs, and finalize collision results. Finalization dispatches floor/ceiling map-joint callbacks and performs debug coordinate checks; interpolation rejects NaN geometry. Surface handling projects positions onto floors or ceilings and records edge and wall outcomes. This is a bounded baseline review, not complete translation-unit coverage.

### shard-main__melee__mp__mpcoll-030
This bounded subjects shard contains six parameter identities associated with mpCollEnd, mpCollGetSpeedCeiling, mpCollGetSpeedFloor, and mpCollGetSpeedLeftWall. All six have empty baseline fact arrays. There are therefore no baseline facts to retain, supersede, reject, or mark unresolved. No parameter semantics or register-to-source mappings are asserted.

### shard-main__melee__mp__mpcoll-031-retry180539
The assigned subjects have no baseline facts. Canonical source shows that the wall-speed wrappers pass the corresponding stored wall index, ECB top coordinates with z set to zero, and the supplied speed pointer to mpGetSpeed. mpCollInterpolateECB snapshots the current ECB, optionally restores a saved ECB and clears its flag, then interpolates all four vertices toward the desired ECB using a float factor and asserts against NaNs. mpCollPrev clears two callback globals, performs debug position validation, and copies cur_pos into x28_vec. These are source-level observations, not verified compiled-register parameter mappings.

### shard-main__melee__mp__mpcoll-032
The six assigned parameter subjects contain no baseline facts. Current source shows that `mpCollSetFacingDir` directly assigns its integer argument to `coll->facing_dir`. `mpCollSqueezeHorizontal` computes half-width from its two float arguments and existing ECB horizontal extents, saves the existing ECB when flag b6 is clear, sets b6, updates horizontal position and symmetric ECB extents, copies those extents into the desired ECB, and clears b5. Its `airborne` parameter is unused. This review covers only these assigned subjects, not the entire translation unit.

### shard-main__melee__mp__mpcoll-033
The assigned subjects have no baseline facts. Their canonical functions initialize a CollData object's collision state, constrain its desired ECB geometry, and reshape its vertical ECB while updating position and desired geometry. Vertical squeezing preserves the original ECB on the first squeeze and branches on computed height and the airborne argument. This review is limited to the assigned parameter subjects, not the entire translation unit.

### shard-main__melee__mp__mpcoll-034
`mpColl_80042C58` updates collision state from an explicit collision box: it conditionally clears the current ECB, snapshots it, copies the supplied bounds into the desired ECB, and clears a flag. `mpColl_80043268` resolves a line's joint and invokes its first collision callback when available, forwarding collision state and vertical displacement with a selector of 2 or 1 according to its Boolean argument. The inspected `mpCollEnd` caller supplies the floor line and current-minus-last vertical position. All six assigned parameter subjects have empty baseline fact lists; there are no baseline facts to disposition.

### shard-main__melee__mp__mpcoll-035
The assigned parameters belong to four collision-data helpers. `mpColl_80043558` uses a line ID to select floor or ceiling joint callbacks, passing the collision-data pointer when a valid joint and callback exist. `mpColl_80043670` sets the clear flag. `mpColl_80043680` copies an input vector into current, previous, and last position and sets that flag. `mpColl_800436E4` updates the fixed ECB source angle, adjusting by at most one full turn; other source kinds report an error and loop indefinitely. All six assigned subjects have empty baseline fact arrays, so there are no baseline fact IDs to disposition.

### shard-main__melee__mp__mpcoll-036
The assigned subjects have no baseline facts. Their containing functions set a fixed ECB source's angle with a single ±tau adjustment; subdivide position/ECB changes and invoke a callback with collision data and flags each step; and perform mirrored wall checks followed by ceiling queries, updating position only when both queries succeed. This review covers only the bounded subjects, not the entire translation unit.

### shard-main__melee__mp__mpcoll-037
The assigned subjects have no baseline facts. Their canonical function bodies cover two wall probes and a position-adjustment routine. mpColl_80043BBC probes from the world-space ECB bottom to right point, returning a detected left-wall ID only when it differs from mpLinePrevNonFloor's result. mpColl_80043E90 performs the corresponding bottom-to-left right-wall probe, excluding mpLineNextNonFloor's result. mpColl_80043C6C uses the supplied line ID, ECB geometry and floor normal to attempt a contact-based position correction; ignore_bottom selects whether the subsequent floor query includes the ECB bottom Y offset. Position updates occur only after a successful floor query.

### shard-main__melee__mp__mpcoll-038
The six assigned parameter subjects contain no baseline facts to disposition. The associated canonical bodies check for a right-wall intersection distinct from the floor's next non-floor line, adjust collision position using wall/floor queries with optional bottom-offset exclusion, and test a bounded floor-edge candidate with an optional successful-result ID output. No register-to-source-parameter mapping or compiled layout is asserted.

### shard-main__melee__mp__mpcoll-039
The assigned subjects have no baseline facts. Their current function bodies implement a leftward-region ledge eligibility check with an optional successful line-ID output; a bottom-point floor sweep with callback context and bit-selected wall-adjacent fallback checks; and floor-position correction with endpoint fallback. Collision state supplies positions, ECB geometry and line filters and receives contact, floor metadata, flags or corrected position as appropriate. This review covers only the assigned subjects, not the entire translation unit.

### shard-main__melee__mp__mpcoll-040
The assigned subjects concern parameters of floor adjustment, ceiling detection/adjustment, and right-wall detection routines. The floor routines update position and floor metadata, with differing endpoint handling. The ceiling detector sweeps the ECB top and optionally checks ceiling lines adjacent to walls; the ceiling adjustment routine updates position against the stored ceiling. Right-wall detection tests moving ECB points and connecting segments and sets collision flags. All six assigned subjects have empty baseline fact arrays; there are no baseline fact IDs to disposition.

### shard-main__melee__mp__mpcoll-041
The fully read bundle assigns six parameter subjects, all with empty baseline fact arrays. There are no baseline facts to retain, supersede, reject, or mark unresolved. No new parameter semantics or register-to-source mappings are asserted.

### shard-main__melee__mp__mpcoll-042
The assigned subjects have no baseline facts. In the reviewed canonical bodies, mpColl_80046F78 leaves its second u32 argument unused while resolving a detected contact according to the collision-line kind. The four reviewed wrapper functions accept CollData pointers, prepare collision state, and dispatch through inline0. mpColl_8004730C additionally forwards its ftCollisionBox pointer to mpColl_80042C58. The wrappers differ in literal preparation and dispatch arguments; no gameplay meaning is assigned to those numbers.

### shard-main__melee__mp__mpcoll-043
The assigned subjects concern parameters of four collision-update wrappers. Each wrapper passes its CollData pointer through mpCollPrev, an ECB-loading call, and a shared update helper. mpColl_800475F4 additionally forwards an ftCollisionBox pointer to mpColl_80042C58. mpColl_800476B4 forwards a callback and Fighter_GObj pointer through inline1, which stores them in globals before invoking the shared collision runner. mpColl_800477E0 and mpColl_800478F4 use the same update-helper arguments but different numeric ECB-loading arguments. No gameplay interpretation of those numeric arguments is asserted. All six assigned subjects have empty baseline fact arrays; there are no baseline fact IDs to disposition.

### shard-main__melee__mp__mpcoll-044
The assigned subjects belong to three collision-update wrappers. mpColl_80047A08 forwards its CollData and ftCollisionBox pointers to preparation helpers before returning inline0(coll, 1, true). mpColl_80047AC8 and mpColl_80047BF4 prepare CollData with different ECB-load arguments (6 and 0xA), then forward their callback and Fighter_GObj pointer to inline1 with argument 2. inline1 saves and clears environment flags, computes the small-ECB predicate, stores the callback and object in globals, runs mpColl_80043754, and finalizes through mpCollEnd. All six assigned subjects have empty baseline fact lists; there are no baseline fact IDs to disposition.

### shard-main__melee__mp__mpcoll-045
The three reviewed wrappers accept a collision-data pointer, callback, and Fighter_GObj pointer. Each calls mpCollPrev, prepares ECB data, and forwards those arguments through inline1. mpColl_80047D20 selects JObj loading with 0x12 or fixed loading, calls mpColl_80042384, and passes 2 to inline1. mpColl_80047E14 and mpColl_80047F40 use mpColl_LoadECB_inline with 6 and 0xA respectively, then pass 6 to inline1. The shared helper preserves and clears environment flags, updates the tiny-ECB indicator, stores the callback and object pointer, invokes mpColl_80043754 with mpColl_80046904, and finalizes through mpCollEnd. All six assigned subjects have empty baseline fact lists; there are no baseline facts to disposition.

### shard-main__melee__mp__mpcoll-046
The assigned subjects have no baseline facts. Their enclosing functions pass a CollData pointer through previous-state and ECB-loading helpers, then return a shared helper's result. mpColl_80048160, mpColl_80048274, and mpColl_80048464 call inline0 with selectors 0, 1, and 4 respectively and a final true argument. mpColl_80048388 selects JObj or fixed ECB loading before calling inline0 with selector 1. mpColl_8004806C similarly selects ECB loading and forwards its callback and Fighter_GObj pointer to inline1 with selector 6. No gameplay interpretation of these selectors is asserted.

### shard-main__melee__mp__mpcoll-047
The six assigned parameter subjects have no baseline facts. Their canonical functions each take `CollData* coll`. Four functions prepare or reuse collision-box state and dispatch through `inline0` or `inline4`; those helpers preserve and clear environment flags before invoking collision processing. `mpColl_800488F4` uses floor-query results to update position and floor state, with endpoint handling that can set ledge-slip flags. `mpColl_80048AB0_RightWall` tests current and previous collision-box geometry, filters selected floor-related line IDs, and sets wall-contact flags. This review covers only the assigned subjects, not the entire translation unit.

### shard-main__melee__mp__mpcoll-048
Read the entire assigned bundle. All six parameter subjects have empty baseline fact arrays, so there are no fact IDs to assess. No source-level semantic claims or new proposals are made.

### shard-main__melee__mp__mpcoll-049
The assigned parameter subjects belong to routines that conditionally position collision data at a floor endpoint, detect a floor distinct from an excluded line and its connected lines, adjust position against a ceiling, and coordinate wall/floor/ceiling resolution. The coordinating routine uses its flags argument to select alternate floor-handling branches and returns whether it considers the object touching a floor. All six assigned subjects have empty baseline fact arrays; there are no baseline facts to retain, change, reject, or defer.

### shard-main__melee__mp__mpcoll-050
The four assigned functions are boolean wrappers taking `CollData* coll`. Each calls `mpCollPrev(coll)`, prepares collision-box data, and returns `inline2`'s result. `mpColl_8004B108` and `mpColl_8004B2DC` call `mpColl_LoadECB_inline(coll, 5)`; `mpColl_8004B21C` and `mpColl_8004B3F0` instead pass their `ftCollisionBox* arg1` to `mpColl_80042C58`. The first pair by address (`B108`, `B21C`) passes 0 to `inline2`, whereas `B2DC` and `B3F0` pass 2. No gameplay meaning is assigned to these numeric arguments.

### shard-main__melee__mp__mpcoll-051
The six assigned parameter subjects have no baseline facts. Their canonical functions take `CollData* coll` as the first source parameter. The two wrappers pass this pointer through previous-state handling, ECB loading with distinct numeric arguments, and `inline2`. The remaining functions use collision geometry and ceiling metadata to update position, contact metadata, or environment flags: ceiling continuation, paired wall checks, and ceiling-end placement gated by wall checks. This review covers only the assigned subjects, not the complete translation unit.

### shard-main__melee__mp__mpcoll-052
The assigned subjects have no baseline facts. Canonical bodies show a ceiling-edge routine accepting a collision record and line ID; a wall/ceiling routine accepting a collision record and flags controlling its fallback path; a wrapper forwarding collision data through previous-state, ECB-loading, and collision helpers; a scalar query using floor flags when a floor index exists; and a position-based test that constructs local collision data and returns its b6 flag after processing. No register-level parameter facts or gameplay mappings are proposed.

### shard-main__melee__mp__mpcoll-053
The complete bundle assigns six parameter subjects, each with an empty baseline facts array. There are therefore no baseline fact IDs to retain, supersede, reject, or mark unresolved. No new parameter semantics or register-to-source mappings are asserted.

### shard-main__melee__mp__mpcoll-054
The fixed ECB-source setter stores an owner object and four floating-point extents, selects the fixed source kind, and resets its angle. The joint-source setter stores an owner object, seven joint pointers, and a floating-point offset, and initializes two source values to 10. Both setters conditionally initialize the current and cached ECB shapes and set facing_dir to -1; the joint setter also clears x50. All six assigned subjects have empty baseline fact lists, so there are no baseline facts to retain or change.

### shard-main__melee__mp__mpcoll-055
mpColl_SetECBSource_JObj stores an owning object, seven joint pointers, and a floating-point offset in collision data, selects the joint-based ECB source, and sets two source values to 10. When x34_flags.b0 is set, it initializes the ECB and its snapshots to a shape with top (0,8), bottom (0,0), right (4,4), and left (-4,4). It finishes by setting facing_dir to -1 and x50 to zero. The joint-source loader uses the six x10C_joint entries to compute coordinate extrema relative to cur_pos and adds x124 to the desired ECB side-point heights. All six assigned subjects have empty baseline fact lists; there are no baseline fact IDs to disposition.

### shard-main__melee__mp__mpcoll-056
The assigned subjects have no baseline facts. The reviewed canonical bodies show that mpColl_SetECBSource_JObj stores object and joint inputs in the collision ECB source, sets source defaults, conditionally initializes ECB snapshots, and resets facing and x50. mpColl_SetLedgeSnap directly stores three floating-point inputs in the collision object's ledge-snap fields. No register-to-source-parameter mapping is asserted.

### shard-main__melee__mp__mpcoll-057
The five assigned parameter subjects contain no baseline facts, so there are no fact dispositions. Current source shows that mpColl_SetLedgeSnap stores three float arguments into corresponding ledge-snap fields. mpUpdateFloorSkip assigns the current floor index to floor_skip. mpCopyCollData copies selected collision fields from src to dst; arg2 == 1 triggers an initial ECB copy, but the same ECB fields are also copied unconditionally afterward. This review covers only the assigned subjects, not the full translation unit.

### shard-main__melee__mp__mpcoll-058
The reviewed routines configure and refresh ECB geometry, query swept wall and ledge contacts, correct ceiling penetration, and dispatch environmental-contact resolution. Fighter collision handling consumes corrected CollData positions and contact results. This review covers only the assigned links, not the complete translation unit.

### shard-main__melee__mp__mpcoll-059
The reviewed routines resize and synchronize ECB geometry under opposing contacts, resolve ceiling and wall constraints, and coordinate directional collision checks with floor and ledge outcomes. Fighter callers exchange positions with CollData and consume collision-wrapper results. This assessment covers only the assigned links, not the entire translation unit.

### shard-main__melee__mp__mpcoll-060
The assigned links connect ECB-loading collision wrappers, floor/ceiling correction, endpoint placement, and collision-finalization callbacks to environmental collision processing. Fighter callers synchronize positions through CollData and consume collision results. The wall-speed wrapper queries the recorded contact line using ECB-top coordinates. Review is limited to these twelve links, not the entire translation unit.

### shard-main__melee__mp__mpcoll-061
Reviewed the twelve assigned concept links, not the complete translation unit. The linked routines construct or refresh ECB geometry, test its world-space edges and motion against walls and floors, record contacts, and correct positions. Fighter callers explicitly pass embedded CollData through the linked collision wrappers and copy the resulting position back.

### shard-main__melee__mp__mpcoll-062-retry180539
The reviewed functions initialize, generate, copy, and query environmental collision-box state; dispatch stage-line callbacks; and connect fighter position updates to collision processing. The airborne resolver coordinates wall, ceiling, floor, squeeze, and ledge outcomes. Floor-endpoint handling produces Collide_Edge, but its proposed teeter-state consumer remains unverified in this bounded review.

### shard-main__melee__mp__mpcoll-063
The reviewed routines configure ECB geometry, test current and previous ECB extrema against walls, correct floor-adjacent positions, and search a right-side ledge-snap region. Collision entry points load geometry and dispatch shared collision processing; fighter callers consume corrected positions and collision results. The platform predicate tests the supporting line's platform flag, but its claimed Pass integration could not be revalidated. This is bounded link review, not complete TU coverage.

### shard-main__melee__mp__mpcoll-064-retry180539
The reviewed code maintains ECB geometry and world-space query bounds, resolves directional contacts and opposing-contact squeeze conditions, and updates ceiling and wall contact placement. Fighter callers transfer positions through CollData and consume collision results for callbacks or landing handling. Random-item placement uses a temporary-ECB collision predicate to reject candidates. This assessment covers only the assigned links, not the complete translation unit.

### shard-main__melee__mp__mpcoll-065
The reviewed links cover ECB refresh and stepped collision processing, ECB-derived wall and floor-edge checks, platform exclusion, ledge-snap bounding, and fighter collision wrappers. Current fighter callers confirm position synchronization and consumption of collision results. Surface-motion internals and the cited capture-release caller remain explicitly deferred. This review covers only the assigned links, not the entire translation unit.

### shard-main__melee__mp__mpcoll-066-retry180539
The reviewed routines preserve and interpolate four-point ECB geometry, dispatch collision processing, and test world-space ECB edges and trajectories against walls. Fighter callers transfer position into CollData and consume corrected positions and contacts. The Pass action records the supporting floor as the floor to skip; common throw collision callbacks also reach the reviewed collision wrapper. This is a bounded link review, not complete TU coverage.

### shard-main__melee__mp__mpcoll-067
The reviewed links cover ECB initialization, collision-pass wrappers, floor and ceiling correction, wall-obstruction probes, ledge-candidate detection, collision finalization, and a contacted-floor speed query. These findings concern only the assigned links, not complete translation-unit coverage.

### shard-main__melee__mp__mpcoll-068
The reviewed links concern ECB loading and stepped interpolation, position-history resetting, swept floor detection, floor continuation, wall correction and contact recording, and ceiling-line motion queries. Wrapper functions select geometry and collision callbacks rather than implementing interpolation directly. This review covers only the assigned links, not the complete translation unit.

### shard-main__melee__mp__mpcoll-069
The reviewed functions connect fighter position updates to map collision processing, construct ECB geometry from fixed or joint sources, set fixed-source rotation, test current and previous ECB points against walls, and resolve ceiling-edge contacts. This review covers only the eight assigned links, not the complete translation unit.

Status: researched; no-change lead bypass; independent review and live promotion pending.
