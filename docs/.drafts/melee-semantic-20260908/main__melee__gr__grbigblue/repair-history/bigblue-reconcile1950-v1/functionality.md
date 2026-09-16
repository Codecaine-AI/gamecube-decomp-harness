# Disjoint Librarian Research

### shard-main__melee__gr__grbigblue-000
Reviewed canonical and rendered `src/melee/gr/grbigblue.c` lines 1–480 only.

This range defines Big Blue's stage descriptor, sparse object-callback table, joint table, and supporting constants. The descriptor explicitly associates `Gr_Kind_BigBlue` with `/GrBb.dat`. Initialization caches the yakumono parameters, changes two stage flags, sets up objects 31, 0, 1, 2, 34, 33, 32, 35, and 36, and hides the joint trees of objects 32 and 36. It also invokes ground helpers, calls `mpLib_80058044` for IDs 33–65, and passes a negative-X direction and fixed bounds to `lb_80011A50`.

The shared object setup routine clears two ground callbacks, installs a graphics link, conditionally installs callback3, invokes on_init, and registers the object process at priority 4. A missing object is reported and returned as NULL; initialization directly dereferences the results for the two hidden objects.

The visible object initializers include parameter-driven root translation and uniform scaling with child/grandchild translations reset; setting a Big Blue state bit and passing a bit-clearing callback to a ground helper; material-helper calls and ground flag changes; and collecting six joint-helper results for another ground helper. Several callback bodies are empty or return false. The object-34 process delegates to three helpers in a fixed order. The range ends at the opening of another static array, not at the end of the translation unit.

### shard-main__melee__gr__grbigblue-001
Reviewed canonical and rendered src/melee/gr/grbigblue.c lines 481–960 only.

- `grBigBlue_801E6364` allocates collision-joint and rank storage for 30 entries, obtains joint references, reparents 30 model nodes onto those joints, applies rotation and scale adjustments (including a special child translation for index 9), calls additional setup helpers, and initializes `spawn_timer` using two parameter endpoints. `grBigBlue_801E687C` returns false; `grBigBlue_801E6884` delegates to two helpers; `grBigBlue_801E68B8` frees and nulls both allocations.
- `grBigBlue_801E6904` initializes three indexed joint/state records, scales the joints, resets an external slot through a helper, and installs the same callback for joint indices 0–2. `grBigBlue_801E6C58` returns false. The inline speed helper selects a vector component and multiplies it by `Ground_801C0498()`.
- The assigned prefix of `grBigBlue_801E6C60` processes three records. States 0–2 implement activation gating, randomized delays, candidate placement at opposite horizontal bounds, direction selection from sampled heights, and bounded upward retries with a camera-top fallback. Successful placement stores position and directional motion data, unhides the joint, enters state 3, and updates a shared counter and helper-managed slots. Waiting records can have their delay cleared based on the other records' states and positions.
- The visible start of state 3 derives an orientation from a sampled normal, constructs forward/backward probe positions using the indexed speed, and begins adjusting joint Z rotation toward the derived angle. The remainder of this function is outside the assigned range.

### shard-main__melee__gr__grbigblue-002
Reviewed canonical and rendered grbigblue.c lines 961–1440 only.

- The update fragment converts accumulated side-dependent contributions into vertical movement and Z rotation, uses timed substates for return motion, and applies rotation limits. It then derives a target height from spatial queries and approaches it with separately capped upward/downward increments. Horizontal movement is applied to the joint; per-update contributions are cleared. Crossing direction-dependent horizontal bounds hides and resets the joint and installs a randomized delay.
- `fn_801E8560` accepts collision flag values 1 or 3, computes XY distance from a selected joint, and, beyond distance 2, accumulates distance weighted by an upper-capped input into one of two side-specific fields and increments a count.
- `grBigBlue_801E8794` checks three non-excluded entries with state value 3 for strict X/Y proximity. Its optional secondary condition can return true independently of proximity when an eligible entry has `x2 == -1`.
- `grBigBlue_801E8978` stores indexed event data and replaces shared extra data only for a non-null argument; `grBigBlue_801E89DC` retrieves indexed event data.
- `grBigBlue_801E8A1C` filters five item-kind candidates through a predicate, randomly selects an accepted candidate, prepares a descriptor above the selected joint, and stores the creation call's result. Kind value 4 receives an 8-unit Y offset; other selected values receive 5.
- Two forwarding wrappers precede the beginning of `grBigBlue_801E8B84`, whose visible portion accumulates maximum Y under strict rectangular bounds while excluding state value 1. Its pointer-stepping layout and remaining body are not established by this shard. `grBigBlue_801E855C` is empty.

### shard-main__melee__gr__grbigblue-003
Reviewed canonical and rendered grbigblue.c lines 1441–1920 only. The camera-bound wrapper forwards offsets in top, bottom, left, right order. grBigBlue_801E8D64 initializes a scaled object, selects its initial height with a sentinel fallback, sets state 2 and a countdown, and offsets four stage joints by its inverse-scaled translation. grBigBlue_801E93D8 implements a four-state movement controller: wait for a manager flag and at most one occupied entry; appear left of the blast zone; advance until passing x=0; wait on a countdown; then depart right and hide while updating manager fields. Active movement adjusts rotation toward a queried normal and height toward a selected target, with separate upward/downward rates and caps. The range also contains false-returning and empty callbacks, a zero-safe random wrapper, another object's initialization, and the beginning of grBigBlue_801EA05C, which constructs rotated sample positions and starts a manager-triggered state sequence.

### shard-main__melee__gr__grbigblue-004
Reviewed canonical and rendered lines 1921–2400 only.

- The opening update fragment chooses a placement side from two queried heights, adds a randomized height offset, checks placement constraints, and unhides the object on entering state 2. That state adjusts Y toward a queried target with separate upward/downward divisors and speed limits. Independent timers randomize horizontal movement and additional vertical drift. Crossing direction-dependent X limits hides the object and resets state and motion fields.
- `grBigBlue_801EAB4C` is empty. `grBigBlue_801EAB50` tests strict X/Y proximity to map object 32 when its state is 2; a nonzero flag and direction -1 override distance failure.
- `grBigBlue_801EACE8` excludes a supplied joint and examines three state-filtered joints from map object 32 plus the state-2 joint of map object 36. It uses strict endpoint-based horizontal tests, returns 1 with an in-band Y, otherwise 2 with the highest qualifying Y below the point, otherwise 0 without writing the output. Its in-band selection compares absolute distance against an accumulator that stores Y, so it is not reliably a nearest-height query.
- A twelve-entry joint-index table precedes `grBigBlue_801EB004`. The reviewed initializer prefix hides the root, sets scales, obtains endpoint positions and stores their differences for each entry, then initializes lane and road-motion fields. Its remaining body is outside this shard.

### shard-main__melee__gr__grbigblue-005
Reviewed canonical and rendered src/melee/gr/grbigblue.c lines 2401–2880 only.

- The opening fragment unhides and positions the current and next track-entry joints, separating them by the current entry's delta.
- grBigBlue_801EB4AC advances previous/current entry indices, hides the outgoing joint, captures the incoming joint's X/Z position and zeroes its X/Z translation. It updates a direction state using vertical thresholds, then randomly selects among 12 entries subject to exclusion, direction, height and flag constraints. It unhides and positions the selected next entry, performs entry-specific mpLib calls, and finishes with mpLib_80058560.
- The reviewed portion of grBigBlue_801EBAF8 triggers advancement when the endpoint passes a scaled negative-X threshold while rotation is near zero. Entry 11 has additional flag handling and a staged joint-list sequence controlled by rotation thresholds.
- The update obtains a target height and normal through grBigBlue_801EC58C with one of two search arguments. Accepted results are clamped; otherwise a latched drift branch initializes and updates lateral drift. It computes a nonpositive angular step, rotates the position relative to the target, updates and wraps rotation, and subtracts scaled longitudinal displacement. The shard ends during calculation of a lateral adjustment.
- The range also declares an eight-field byte bitfield type and a four-element u32 array; their uses are not established here.

### shard-main__melee__gr__grbigblue-006
Reviewed canonical and rendered grbigblue.c lines 2881–3360 only.

- The opening fragment applies road translation and rotation, projects a vector onto the rotated local Y axis, applies that vector and rotation to map objects 1 and 2 when present, and stores the previous position.
- `grBigBlue_801EC58C` checks a vertical segment against 32 collision IDs, returns the greatest hit Y, and optionally copies that hit's normal. With no hit it returns -3.4028235e38f and leaves the normal output untouched.
- `grBigBlue_801EC6C0` registers callbacks and hides 30 collision joints, randomly initializes their rank bytes to 0 or 2, and initializes up to four lane records with distinct collision slots. Its helper sets parameter-scaled positions and targets, clears motion fields, randomizes rotation and threshold, unhides and positions the selected joint, and marks its rank 1. Selected records receive state 4; other records receive state 1.
- `grBigBlue_FindClosestCar` scans four raw-offset records. State 10 or an eligible absolute distance at most 60 terminates the search with a blocking flag; otherwise it selects the smallest absolute distance above 60, excluding states 1, 7, and 8.
- The reviewed prefix of `grBigBlue_801ECB50` balances rank-0/rank-2 availability, counts records outside states 1/7/8, and decrements the spawn timer an extra time when that count is one. The closest-record branch contains MUST_MATCH-only bit insertions for states 10 and 4. A subsequent timer decrement tests the prior value for negativity and finds the first state-1 record; the continuation lies outside this shard.

### shard-main__melee__gr__grbigblue-007
Reviewed canonical and rendered grbigblue.c lines 3361–3840 only.

- The opening scheduling tail counts lane states 7 and 8, selects between rank entries valued 0 or 2, requests state 5 or 6, and resets spawn_timer from parameters x10/x14 only when that request succeeds.
- grBigBlue_801ED694 requests a state transition, then gates further work on grBigBlue_801EEF00. It selects a joint from packed lane data, spaces ordinary lanes according to relative X positions, approaches the spacing target by at most 0.5 per update, integrates and clamps velocity, and derives X from target plus accumulated displacement.
- The same routine updates a bounded height offset and sinusoidal oscillation, queries a surface reference, either follows that reference or integrates Y motion with a map-object adjustment, smooths Z rotation, and writes the joint translation and rotation.
- The opening of grBigBlue_801EDF44 selects transition results using alpha, expanded left/right blast-zone boundaries, and a post-decremented threshold. Its random-selection branch continues beyond this shard.

### shard-main__melee__gr__grbigblue-008
Reviewed canonical and rendered grbigblue.c lines 3841–4320 only. The opening decision tail chooses numeric states using other lanes' relative X positions and states, applies overrides for states 7/8, and forces result 1 below Y = -2000. grBigBlue_801EE398 applies a requested lane state: state 1 hides the associated joint hierarchy and updates slot availability; states 2–4, 7–8, and 10 set thresholds; states 5/6 attempt initialization beyond the right/left blast boundary, requiring a non-sentinel height result and an available slot among 30 entries. Successful initialization resets motion fields, randomizes rotation and threshold, reserves and reveals the selected joint, and assigns its translation. The wrapper returns 1 for these completed operations, but state 9 changes state while leaving its return value zero. The reviewed beginning of grBigBlue_801EEF00 extracts a six-bit selector from a raw byte and assigns signed acceleration using position, normalized absolute velocity, thresholds, and camera boundaries.

### shard-main__melee__gr__grbigblue-009
Reviewed canonical and rendered lines 4321–4598 only.

- The opening state-handler fragment selects signed acceleration using target position, velocity, and a predicted stopping position. Cases 5/6 increase an alpha value by 1/60 with an upper clamp of 1; case 9 decreases alpha with a lower clamp of 0. Each forwards alpha to Ground_801C5630. Cases 7/8 select opposite acceleration signs.
- grBigBlue_801EF424 calls an object helper and four indexed helpers, then performs at most ten pairwise separation passes over four records. It excludes records whose extracted state equals 1. When the compared coordinates are too close, it splits a signed correction equally between the pair, updating both offsets 0xDC and 0xE0.
- fn_801EF60C accepts only collision flag value 1 and ground-kind value 1, maps the joint through a 30-entry table, asserts a match, and writes -coll->x50 * params->x44 to offset 0xF4 of each matching record.
- grBigBlue_801EF7D8 returns (-10, 0, 0) when map object 34 and its user data exist, otherwise the zero vector. grBigBlue_801EF844 recognizes lines on the explicitly tested stage whose mapped joint is 33 or 35–65.
- fn_801EFB9C conditionally suppresses its display call when any of three query results is nonzero. grBigBlue_801EFC0C always returns NULL. grBigBlue_801EFC14 compares the input y coordinate against the y coordinate obtained through lb_8000B1CC.

### shard-main__melee__gr__grbigblue-010
Reviewed canonical and rendered `src/melee/gr/grbigblue.h` lines 1–80 only. This guarded declaration header exposes the translation unit's function signatures and external `StageData grBb_StageData`. Its interface includes numerous routines taking `Ground_GObj*`, scalar and boolean-returning routines, and functions accepting vectors, joint objects, opaque pointers, and integer arguments. It declares an `HSD_GObj*`-returning function and a `DynamicsDesc*`-returning function. The assigned header contains no function bodies, callback tables, state definitions, or executable behavior; gameplay roles suggested by rendered names are not established by these declarations.

### shard-main__melee__gr__grbigblue-011
Reviewed canonical and rendered `src/melee/gr/grbigblue.static.h` lines 1–102 only. This guarded header declares three data structures, not executable behavior: `grBb_LineIds` contains 32 `s32` elements; `grBb_TrackEntry` contains four `s16` members and a `Vec3`; and `grBb_YakumonoParam` contains a predominantly `f32` parameter sequence interspersed with `s32` members and explicit byte-padding arrays, ending with `Vec3 x134_translate` and `f32 x140_scale`. Field names and offset comments alone do not establish runtime meaning or verified compiled layout.

### shard-main__melee__gr__grbigblue-012
The reviewed subjects cover stage-registration metadata, immutable aggregate constants, cached stage parameters, and a deferred initialization callback. The object factory installs callbacks by map ID; initialization caches parameters later applied to root-JObj translation and scale. The item routine filters five candidates and places a selected spawn above an indexed JObj. `fn_801E6124` clears the flag set by its initializer, through a Ground queue drained after stage startup. Compiled section membership, jump-table layout, and detailed visible-game mappings remain unverified. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__gr__grbigblue-013
Reviewed the six assigned subjects, not the complete translation unit. The platform collision callback collects distance-weighted side loads consumed by the platform rocking update. The car collision callback resolves a joint through a 30-entry table and conditionally writes four raw records; identifying those writes with typed gravity fields remains deferred. The display wrapper suppresses delegated Ground rendering for two status flags or free-camera mode. Big Blue registers empty demo-init and load hooks, while its initializer installs nine object callbacks, hides two models, initializes boundaries, deactivates collision islands, and submits a leftward field descriptor.

### shard-main__melee__gr__grbigblue-014
Reviewed the six assigned functions and their callback registrations. Big Blue's start callback unconditionally constructs the shared generator with a null descriptor and ignores its result. Its stage predicate always returns false. The indexed Ground-object setup helper installs rendering, optional callbacks, synchronous initialization, and a priority-4 process. Entry 0 initializes archive animation set 0, has a constant-false callback1, and schedules an empty process callback. Specific racer, Falcon Flyer, and hovering-platform mappings are not established by these bounded bodies.

### shard-main__melee__gr__grbigblue-015-retry192431
The assigned callbacks cover object 0's empty fourth hook, object 31's model initialization and inert lifecycle hooks, and object 34's initialization. Object 31 receives configured root translation and uniform scale, zeroed child/grandchild translations, and a guarded renderer. Object 34 installs animation index 0, associates collision joints, initializes twelve section records and the visible section pair 4/0, and sets a bit cleared by a deferred post-start callback. This review covers only the assigned subjects and their necessary supporting source.

### shard-main__melee__gr__grbigblue-016
Reviewed the six assigned callback subjects, not the complete translation unit. Object 34 has a constant-false predicate, an empty fourth callback, and a process callback that updates route-relative transforms, maintains shared transient records, then requests map-ID collision refresh. Object 2 initializes animation, material masks, and Ground flags; its predicate always returns false and its process callback is empty. The delegated object-34 controller also updates objects 1 and 2, so an empty object-2 process does not imply that its model never moves.

### shard-main__melee__gr__grbigblue-017
Reviewed the six assigned subjects, not the entire translation unit. Component 2's callback3 is empty. Component 1 initializes animation set 0, registers six joint-derived fog reference vectors, and sets x11_flags.b012 to 2; its predicate always returns false and its process and callback3 handlers are empty. The car initializer allocates state, collects 30 joints, requests a 30-model group, reparents and transforms its members, applies a special tenth-member offset, performs follow-up setup, and initializes a randomized signed-16-bit timer.

### shard-main__melee__gr__grbigblue-018-retry192951
The assigned callbacks cover car-group predicates, update dispatch and array cleanup, plus initialization and recurring management of three collision-integrated platforms. Both predicates always return false. Car processing precedes collision refresh, but its ten-pass separation solver does not guarantee convergence. The platform manager initializes three records and models, coordinates activation, adjusts movement and tilt, and hides and recycles exiting models. Failed placement probes can fall back to a position above the camera rather than rejecting activation. This review covers only the assigned subjects and supporting source ranges.

### shard-main__melee__gr__grbigblue-019
Reviewed the six assigned subjects and their 35 baseline facts. The code provides an empty platform-manager callback, a three-entry proximity query with an optional secondary success condition, indexed coordination-data accessors, a filtered random item-spawn helper, and a bounded maximum-Y query. Caller excerpts establish platform activation, placement rejection, and coordination-slot usage. Exact visual identities, item-configuration semantics, and the maximum-Y routine's rebased compiled layout remain partially unverified; this is not complete TU coverage.

### shard-main__melee__gr__grbigblue-020
Reviewed the six assigned subjects. The camera wrapper passes top, bottom, left, and right bounds to a strict maximum-Y query. The FFlyer callback group initializes a scaled object, updates its gated appearance, horizontal movement, height and rotation, and supplies constant-false and empty auxiliary callbacks. The adjacent initializer resets another object's local state and manager activation latch. The FFlyer initializer's offset 0xD8 is horizontal motion, not vertical motion. Raw record-stride assumptions and stronger gameplay interpretations remain deferred.

### shard-main__melee__gr__grbigblue-021
Reviewed the six assigned functions, not the complete translation unit. Map object 36 has a constant-false predicate, an empty final callback, and a three-state route-platform update controlling placement, visibility, height adjustment, randomized drift, and exit reset. A separate read-only predicate checks map object 32's state and proximity. The height query examines three registered models and the route platform, prioritizing an in-range Y over a below-point fallback. Track initialization measures twelve segment displacements and places the initial pair.

### shard-main__melee__gr__grbigblue-022
Reviewed the six assigned function bodies and relevant inline helpers. They recycle track segments, transform surface-following ground, select the highest intersected floor, initialize up to four racer records against 30 model slots, schedule replacement racers, and integrate individual racer motion. The scheduler contains MUST_MATCH-only packed-state writes; several baseline layout and gameplay interpretations require qualification. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__gr__grbigblue-023
Reviewed the six assigned subjects. The car update pipeline selects a replacement state, applies transition initialization, then computes acceleration and sound-fade control before integration. The aggregate updater advances four lanes and performs up to ten pair-separation passes. Separate queries supply a guarded fixed horizontal displacement and classify selected Big Blue collision joints for floor-query exclusion. The below-stage retirement check is restricted to states 2–6 and 10, not every state.

### shard-main__melee__gr__grbigblue-024
The assigned descriptor callback always returns NULL. The shadow callback compares the supplied fighter Y coordinate strictly against the reference joint's transformed origin. The reviewed module sections register indexed Ground callbacks, retain stage parameters, initialize three joint/state slots, and implement parameter-driven placement, visibility, timers, and movement. This is a bounded subject review, not complete TU coverage.

### shard-main__melee__gr__grbigblue-025
The entire bundle was read. All six assigned parameter subjects have empty baseline fact lists, so there are no baseline facts to retain, supersede, reject, or mark unresolved. No parameter semantics or compiled-layout mappings are asserted, and no new facts or links are proposed.

### shard-main__melee__gr__grbigblue-026
The assigned subjects contain no baseline facts. In the current source, fn_801EF60C filters collision callbacks by coll->x34_flags.b1234 and ground_kind, finds joint_id in a 30-entry table, and updates matching records with -coll->x50 * yakumono_param->x44. Its coll_x50 and delta_y parameters are unused. fn_801EFB9C conditionally forwards gobj and pass unchanged to grDisplay_801C5DB0 unless one of three queried conditions is nonzero. Register-labelled subject identities are not treated as proven source-parameter mappings.

### shard-main__melee__gr__grbigblue-027
The six assigned parameter subjects have no baseline facts. In the current source, grBigBlue_801E57BC ignores its bool argument. grBigBlue_801E59F8 uses its s32 argument both to index the stage callback table and to retrieve the corresponding stage object, then configures rendering and available callbacks. grBigBlue_801E5AE4 forwards its Ground_GObj pointer and associated map_id to grAnime_801C8138 with a final argument of zero. grBigBlue_801E5B10 ignores its object argument and returns false; grBigBlue_801E5B18 and grBigBlue_801E5B1C ignore their object arguments and do nothing. Review is limited to these subjects, not the entire translation unit.

### shard-main__melee__gr__grbigblue-028
The six assigned parameter subjects have no baseline facts to disposition. Their current functions take Ground_GObj pointers. grBigBlue_801E5B20 uses its object to replace the render callback, apply configured root translation and scale, and zero translations on up to two successive children. grBigBlue_801E613C obtains the object's Ground and joint, passes them to initialization helpers, sets u.bigblue.x0_b1, and passes the object and a flag-clearing callback to Ground_801C10B8. The parameters of grBigBlue_801E6114 and grBigBlue_801E61BC are unused in constant-false functions; grBigBlue_801E611C and grBigBlue_801E6120 are empty.

### shard-main__melee__gr__grbigblue-029
The six assigned parameter subjects have no baseline facts. Their current function definitions each take a Ground_GObj pointer. grBigBlue_801E61C4 forwards its object to grBigBlue_801EBAF8 and Ground_801C2FE0, with a call to lb_800115F4 between them. grBigBlue_801E6200 obtains the object's Ground data and joint, passes the object and map_id to grAnime_801C8138, invokes two material helpers on the joint, clears x10_flags.b2, and sets x11_flags.b012 to 1. grBigBlue_801E6288 ignores its parameter and returns false; grBigBlue_801E61FC, grBigBlue_801E6290, and grBigBlue_801E6294 have empty bodies.

### shard-main__melee__gr__grbigblue-030
The six assigned parameter subjects have no baseline facts to disposition. Their current function definitions all declare a Ground_GObj* argument. grBigBlue_801E6298 uses that object to obtain Ground data, invoke animation setup, collect six joints for Ground_801C4E70, and set x11_flags.b012 to 2. grBigBlue_801E6364 uses its object to allocate and populate joint/rank storage, reparent and scale 30 model subtrees, invoke state initialization, and set a randomized timer. grBigBlue_801E6354 and grBigBlue_801E687C ignore their arguments and return false; grBigBlue_801E635C and grBigBlue_801E6360 have empty bodies. This review covers only the assigned subjects, not the complete translation unit.

### shard-main__melee__gr__grbigblue-031
The complete assigned bundle contains six parameter subjects, all with empty baseline fact arrays. There are therefore no baseline facts to retain, supersede, reject, or mark unresolved. No new semantic facts or links are proposed; this result does not claim complete translation-unit coverage.

### shard-main__melee__gr__grbigblue-032
The six assigned parameter subjects contain no baseline facts. The current body of grBigBlue_801E8794 scans three entries, skips the excluded joint and entries whose state is not 3, and returns true for strict X/Y proximity or an enabled secondary condition (x2 == -1). grBigBlue_801E8978 writes data to an indexed manager slot and updates the extra pointer only when non-null. No gameplay interpretation or compiled register-to-parameter mapping is asserted.

### shard-main__melee__gr__grbigblue-033
The assigned subjects have no baseline facts. Their current functions store an indexed event-data pointer and optionally replace an extra pointer, retrieve indexed event data, select an allowed item candidate and spawn it relative to an indexed joint, and query the maximum qualifying y coordinate within strict coordinate bounds. The bounds-query caller supplies camera top, bottom, left, and right bounds in that order. No parameter-register mapping or compiled-layout claim is proposed.

### shard-main__melee__gr__grbigblue-034
The fully read bundle assigns six parameter subjects, all with empty baseline fact arrays. There are no baseline facts to retain, supersede, reject, or mark unresolved. No new semantic claims are proposed; the assigned parameter roles were not established from their current function bodies.

### shard-main__melee__gr__grbigblue-035
The six assigned parameter subjects contain no baseline facts, so there are no fact IDs to disposition. Canonical source shows object parameters used for initialization and state-driven translation updates, an unused argument in a constant-false callback, and an unused argument in an empty callback. The proximity helper reads the input position's X/Y coordinates and uses its integer flag to permit a true result when the checked object's state is 2 and its signed direction field is -1. No register-to-source parameter mapping or gameplay identity is asserted.

### shard-main__melee__gr__grbigblue-036
The assigned subjects contain no baseline facts. Their enclosing functions implement a state-gated XY proximity test with an optional override, and a bounded Y-coordinate query that excludes a specified joint and writes an output only when a candidate is found. No register-to-source-parameter mappings are proposed.

### shard-main__melee__gr__grbigblue-037
The complete bundle contains six parameter subjects, each with an empty baseline fact list. There are therefore no baseline fact IDs to retain, supersede, reject, or mark unresolved. No new semantic facts are proposed; register-labelled parameter identities are not treated as established source-parameter mappings.

### shard-main__melee__gr__grbigblue-038
This bounded subjects shard contains six parameter identities, all with empty baseline fact arrays. There are no baseline facts to retain, supersede, reject, or mark unresolved. No parameter semantics or compiled register-to-parameter mappings are asserted.

### shard-main__melee__gr__grbigblue-039
The assigned subjects have no baseline facts. The reviewed source passes an object and lane index through state selection, conditional state application, and per-state control. grBigBlue_801EDF44 examines the indexed lane and returns a transition code; grBigBlue_801EE398 forwards object user data, lane index, and requested state to an inline state handler; grBigBlue_801EEF00 updates indexed acceleration or alpha and returns false for state 1, otherwise true. These are source-level observations, not verification of register bindings or compiled structure layout.

### shard-main__melee__gr__grbigblue-040
The six assigned parameter subjects have no baseline facts to disposition. Their current function bodies use a ground object for update calls and bounded pairwise separation adjustments; write a supplied vector according to map-object availability; test a supplied collision-line ID against a stage-gated joint set; return NULL without using the supplied enum argument; and compare a supplied vector's y component against a helper-produced vector while ignoring the second integer argument. This review covers only the assigned subjects, not the entire translation unit.

### shard-main__melee__gr__grbigblue-041
The assigned subject has no baseline facts to assess. The current body of grBigBlue_801EFC14 passes its third source parameter, HSD_JObj* jobj, to lb_8000B1CC with a NULL second argument and a local vector output. It returns whether a->y is strictly greater than that output's y component; its integer parameter b is unused.

### shard-main__melee__gr__grbigblue-042
The reviewed links cover Big Blue's Ground-object callback wiring, inert hooks, car-model initialization, camera-bounded lane queries, platform coordination, and shadow eligibility. Current source supports those structural relationships. The more specific hovering-platform/Falcon Flyer interpretation of the proximity predicate remains deferred. This is a bounded link review, not complete TU coverage.

### shard-main__melee__gr__grbigblue-043
Reviewed the twelve assigned links against current canonical source. The callback table connects stage-component initialization and inactive hooks to Big Blue. Other reviewed code configures moving objects, coordinates the FFlyer object's visibility and motion, queries eligible platform heights, and initializes collision-backed car slots. This is bounded link review, not complete TU coverage.

### shard-main__melee__gr__grbigblue-044
The reviewed links cover Big Blue callback installation, model initialization, stage-element position queries, item placement, car-state selection and application, and collision classification. Current source confirms the generic initialization and stage associations. More specific fog, hovering-platform, collision-motion, and raw-layout impulse interpretations remain deferred where the inspected bodies do not independently establish the full claim. This review does not claim complete translation-unit coverage.

### shard-main__melee__gr__grbigblue-045
Reviewed the twelve assigned links against current canonical source. Big Blue registers stage lifecycle and indexed Ground callbacks, initializes twelve connected track sections, queries the highest vertical collision intersection, and supplies a conditional constant environmental-motion vector. Specific hovering-platform identity and compiled `.data` membership remain unverified. This review does not establish complete TU coverage.

### shard-main__melee__gr__grbigblue-046
The reviewed links cover Big Blue's Ground-object callback registration, model initialization, track-section replacement, car-resource cleanup, lane-position queries and car motion. StageData explicitly binds the callback table and descriptor query to Big Blue. Track replacement changes visible joints and collision configuration; car simulation integrates motion and updates model transforms. This is bounded link review, not complete TU coverage.

### shard-main__melee__gr__grbigblue-047-retry192951
The reviewed code initializes Ground components, advances a collision-associated road transform, synchronizes two associated objects, updates four car records with bounded separation correction, and queries car heights within camera bounds. Constant-false and empty lifecycle callbacks provide registration hooks rather than movement logic. This review covers only the twelve assigned links.

### shard-main__melee__gr__grbigblue-048
The reviewed Big Blue code registers stage-object callbacks, constructs a 30-model collision-backed car group, updates four car records, moves a height-following platform, recycles track geometry, collects platform collision loads, filters item-spawn candidates, and classifies collision lines by their owning joints. This is a bounded link review, not complete translation-unit coverage.

### shard-main__melee__gr__grbigblue-049
The reviewed links cover Big Blue's stage callback registration, Ground-component initialization, three collision-backed moving platforms, shared platform controls and placement checks, connected track initialization, and conditional Ground rendering. The platform controller manages activation delays, placement, visibility, translation, terrain-relative height, collision feedback, and recycling. This is a bounded link review, not complete translation-unit coverage.

### shard-main__melee__gr__grbigblue-050
`grBigBlue_801E6884` calls `grBigBlue_801EF424` followed by `Ground_801C2FE0`. The Ground operation conditionally visits collision joints associated with the object's map ID, invokes `mpLib_80055E9C`, and stamps processed joints to avoid duplicate processing of archive entries.

Status: researched; no-change lead bypass; independent review and live promotion pending.
