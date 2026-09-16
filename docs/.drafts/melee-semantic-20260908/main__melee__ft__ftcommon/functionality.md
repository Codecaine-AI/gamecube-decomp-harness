# Disjoint Librarian Research

### shard-main__melee__ft__ftcommon-000
Reviewed canonical and rendered `src/melee/ft/ftcommon.c` lines 1–480 only. This range implements shared movement arithmetic: ground acceleration with friction or direct target limiting; stick-threshold input conversion; floor-tangent projection of acceleration and velocity; symmetric velocity clamps; scalar knockback decay and conditional ground-knockback initialization. Aerial helpers write horizontal acceleration, select friction according to speed thresholds, and derive drift from stick input and fighter attributes. Separate helpers directly clamp horizontal velocity, subtract gravity with a terminal-speed bound, or assign fast-fall velocity. Two accessors assert the Sandbag kind and return float elements 0 and 1 of `dat_attrs`; their physical meanings are not established here.

### shard-main__melee__ft__ftcommon-001
Reviewed canonical and rendered ftcommon.c lines 481–960 only.

- Vertical-motion helpers cap upward velocity, accelerate with a ceiling, and enable fall-fast when downward velocity, stick threshold, and tilt-timer conditions agree.
- Air/ground helpers update velocity fields, jump usage, and collision-box locks. Grounding resets jump and wall-jump counts and checks a ground predicate. Airborne bookkeeping conditionally clears knockback magnitude and calls a player helper.
- Input utilities calculate folded or full stick angles and update facing, optionally gated by a horizontal deadzone. Hitlag calculation uses staged integer truncation and an additional multiplier for a two-ID motion interval.
- Effect/callback helpers clear an effect flag, destroy effects, and invoke two helpers followed by optional damage and death callbacks.
- Grab initialization stores timer and mash state. Mash processing can subtract the supplied amount twice per call: once for qualifying button presses and once for a changed stick-direction latch. It optionally advances a wrapping shake counter and reports the result.
- Nudge routines detect horizontal overlap on identical or adjacent floor lines, accumulate horizontal/depth nudges, and handle a player-entity-specific variant. The update routine resets nudges, gates processing on fighter flags and grounded state, recenters depth when appropriate, and bounds depth movement.
- Remaining complete helpers project a scalar shield-knockback velocity onto the floor tangent, install grab callbacks and scalar fields, zero several acceleration/velocity families, and cache a mapped joint's translation. The final function is only partially included.

### shard-main__melee__ft__ftcommon-002
Reviewed canonical and rendered ftcommon.c lines 961–1440, with limited boundary context; this is not complete TU coverage.

- Model helpers interpolate a cached joint translation, align root Z rotation to the floor normal while grounded, load an accessory joint, and attach/request its animation at frame zero.
- Item helpers dispatch optional fighter-kind drop/pickup callbacks, clear item references, map the two explicit parasol kinds' motion IDs to shared status indices, and dispatch table-selected item functions with a fighter-speed-derived scalar.
- A gated damage helper derives a position, angle, and magnitude from damage state or fallback values, calls it_802E5F8C, and adds its return value to a source-player counter except for sentinel 6. Other wrappers gate controller-associated calls, broadcast over fighters, remove rumble IDs, and derive integer parameters from common-data coefficients. Sword-kind wrappers forward arguments, including a 1/256 conversion.
- ftCommon_8007EFC8 transfers extensive state to the same player's entity at index 1: it swaps identity bits, initializes the destination, copies position, damage, movement, input, counters and flags, conditionally transfers additional effects and item references, invokes synchronization helpers, and finally calls the supplied destination callback. Notably, its condition assigns src->x198C = 2 rather than comparing it.
- Visibility dispatch occurs only when an item exists and the visibility bit changes, but the bit is always written. Remaining helpers compute effective or inverse model scale, orient horizontal velocities with or against facing, and return x44_mtx only when scale.z differs from one.

### shard-main__melee__ft__ftcommon-003
Reviewed canonical and rendered ftcommon.c lines 1441–1793 only.

- Dispatches optional fighter-kind callbacks and computes cur_pos + xD4_unk_vel. Two additional callback paths run when either x197C or x1980 is null.
- Manages object references x197C and x1980 and associated parameters. The x197C path distinguishes refreshing an existing reference's parameter from initializing a new reference. The x1980 path accumulates a capped integer quantity, updates x2024, or requests a new object; initialization and clearing also invoke auxiliary routines.
- Computes x1980-related offset and scale arguments from a capped linear expression in x2024; updates both referenced objects' scale arguments when present.
- Reduces x2018 for selected newly pressed buttons and for changes in remembered stick directions. Neutral stick input preserves those directions; button and stick changes can each cause a subtraction in one call.
- Tests the explicit POPO/NANA kind and costume-index predicate, sums up to three two-dimensional contributions into damage fields, and records threshold-qualified stick/trigger activity with counter markers.
- Provides small helpers for flag assignment, conditional timer initialization, friction-adjusted ground acceleration, a scaled scalar result, and grounded-only damage-field assignments.

### shard-main__melee__ft__ftcommon-004
Reviewed the complete assigned header, `src/melee/ft/ftcommon.h:1–127`, in canonical and rendered form. This guarded header imports fighter, item, and baselib forward declarations and exposes function prototypes; it contains no implementations or data-layout definitions. Its canonical interface includes named ground/air movement and fall helpers, stick-angle and facing helpers, hitlag calculation, grab initialization/mashing, accessory attachment, parasol-status querying, and model-scale querying, alongside numerous address-named functions. Signatures distinguish `Fighter*`, fighter/item game objects, joint and animation pointers, vectors, matrices, and callbacks. These declarations establish interface types, not runtime effects or the correctness of proposed descriptive names. Coverage is limited to this header shard, not the complete translation unit.

### shard-main__melee__ft__ftcommon-005
### Assigned documentation surface
Read canonical and rendered `src/melee/ft/ftcommon.dox`, lines 1–138. This file is a guarded declaration/documentation surface, not an implementation: it contains includes, function prototypes, and a few comments, with no function bodies or state updates. The signatures expose operations accepting fighter pointers, fighter-object pointers, scalar arguments, vectors, joints, matrices, and callbacks. Canonical declarations include movement-related interfaces, stick-angle queries, hitlag calculation, grab interfaces, accessory setup, parasol-status retrieval, and model-scale retrieval. These establish interface names and types only, not verified runtime behavior.

Three comments attach behavioral or naming hypotheses to address-named functions: an airborne/jump/ECB description for `ftCommon_8007D5D4`, velocity clearing for `ftCommon_8007E2FC`, and a return-expression description for `ftCommon_800804EC`. A separate TODO suggests making `ftCommon_8007FE84` static. None is an implementation proof. Coverage is limited to this assigned documentation file, not the full translation unit.

### shard-main__melee__ft__ftcommon-006-retry180539-retry185219-retry185815
Reviewed the six assigned subjects, not the complete translation unit. Both stick-angle queries return atan2f(current Y, absolute current X), separating vertical direction from horizontal side. Their callers use angular thresholds for aerial, side-tilt, and side-smash selection while handling horizontal direction separately. Source also defines four seven-entry Parasol dispatch/motion tables and a constant zero Vec3 copied during attachment setup. Source-level behavior is visible, but the assigned compiled data-section identities, extents, and contents cannot be authenticated from these declarations alone.

### shard-main__melee__ft__ftcommon-007
Reviewed the six assigned helpers and all 36 baseline facts. These helpers prepare target-directed ground acceleration, derive steering from thresholded horizontal stick input, decay grounded knockback, initialize capped floor-tangent knockback, and perform pure scalar decay used by component-wise airborne knockback processing. Ground acceleration and knockback are subsequently consumed by common movement and fighter integration. The friction-aware acceleration helper applies maximum-speed checks only inside its target-crossing correction branches, not universally. This review does not establish complete TU coverage.

### shard-main__melee__ft__ftcommon-008
Reviewed the six assigned helpers, not the entire TU. The paired Sandbag accessors return attribute floats used independently for airborne X/Y knockback decay. The grounded attacker-shield helper updates a signed scalar with zero-crossing clamps. The three aerial-friction helpers write horizontal animation-velocity contributions rather than directly changing self-velocity; two select between character friction and a common-data correction according to an incoming-speed threshold and return that comparison. Captain's SpecialHi caller uses the caller-threshold variant to gate subsequent drift processing.

### shard-main__melee__ft__ftcommon-009
The six assigned helpers calculate horizontal movement contributions in `x74_anim_vel.x`. The shared drift solver accepts explicit velocity and movement parameters, preserves opposing acceleration, and conditionally substitutes friction and target/speed-limit corrections. Its zero-target path uses actual `self_vel.x`, not the explicit velocity argument. Wrappers supply current velocity, ordinary stick-derived drift attributes, or thresholded caller-specific coefficients. The separate target-limited helper cancels horizontal self-velocity for a zero target and does not use friction. These helpers do not themselves transition action states or update timers. Review is limited to the assigned subjects and inspected dependencies.

### shard-main__melee__ft__ftcommon-010
Reviewed the six assigned subjects and all 35 baseline facts. These helpers schedule stick-dependent horizontal acceleration, initialize airborne bookkeeping with different jump counts and ECB locks, establish grounded bookkeeping, and perform crowd/player-record side effects during ledge recovery or grounding. A material correction is required: grounded initialization clamps the old `gr_vel`, then overwrites it with `self_vel.x`; it does not clamp horizontal self-velocity. Crowd reaction return propagation and the colliding proposed grounding names remain unresolved. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__ft__ftcommon-011
Reviewed the six assigned helpers and their baseline facts. They dispatch environment-dependent state entry, calculate a signed stick heading, conditionally update facing, destroy fighter-owned effects, run audio/callback cleanup, and accumulate grounded overlap corrections. The jostling baseline oversimplifies two tie-breaking branches; those claims are explicitly deferred. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__ft__ftcommon-012
Reviewed the six assigned functions and all 33 baseline facts. The code computes grounded overlap nudges with a player-linked special case, projects a shield-knockback scalar onto the floor tangent, installs capture callbacks, sets a shared 16-bit field, and resets explicitly listed movement channels. The nudge vector's second component is processed against projected Z, not world-space vertical Y. Gameplay-specific attribution and claims extending beyond the inspected bodies remain deferred where necessary. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__ft__ftcommon-013
Reviewed the six assigned helpers and their supporting source: caching and weighted updating of a mapped joint translation during thrown animation; floor-normal-derived model rotation; accessory animation attachment and frame-zero requests; extended item-release cleanup; and nullable per-kind ordinary item-drop callback dispatch. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__ft__ftcommon-014
Reviewed the six assigned functions and their 36 baseline facts, not the complete translation unit. The functions dispatch fighter-kind pickup callbacks, clear a separately tracked item reference, translate normalized Parasol statuses into article transitions with scaled animation speed, prepare a rule-gated item burst and source-player accounting update, and submit rumble requests for one fighter or the current fighter list. Rumble eligibility does not guarantee scheduler admission. The Parasol setter checks article recognition but does not validate the requested table index or guard null transition entries.

### shard-main__melee__ft__ftcommon-015
Reviewed six assigned fighter-common helpers. They cancel tagged controller-rumble requests, clear queued rumble and enable direct rumble, derive positive integer rumble durations from damage inputs, and dispatch held-Sword scale interpolation or reset after object validation. Hit-processing and throw callers distinguish received-hit feedback from attacker feedback. Sword action commands establish script-controlled scaling, but the specific attack-dependent gameplay mapping remains deferred.

### shard-main__melee__ft__ftcommon-016
Reviewed the six assigned helpers, not the complete translation unit. They overwrite x209A, transfer live fighter state to an alternate entity before invoking a continuation, dispatch and cache held-item visibility, apply reciprocal model scale to a designated joint, and align horizontal velocity with facing direction. The transformation body also assigns src->x198C = 2 inside a condition; that is an assignment, not a comparison.

### shard-main__melee__ft__ftcommon-017
Reviewed the six assigned helpers, their declarations, and selected collision, Rebirth-physics, character-callback, and attachment-removal code. The helpers normalize horizontal velocities opposite facing, expose a stored matrix for non-unit Z scale, dispatch optional per-kind enter/exit hooks, compute cur_pos + xD4_unk_vel, and dispatch an attachment-removal hook unless both attachment slots are occupied. Specific gameplay timing and head-item presentation interpretations remain deferred where the inspected code does not establish them.

### shard-main__melee__ft__ftcommon-018-retry180539-retry185219
Reviewed the six assigned attachment helpers and their 36 baseline facts. RabbitC pickup either refreshes the recorded item value or installs an attachment and fits its joints; removal clears the reference and refreshes fighter attributes and collision dimensions. Flower application creates or updates an attached article, while its presentation helper computes an upper-bounded factor and reciprocal offset. Important qualifications are integer conversion during flower accumulation, collision scaling rather than fighter-model scaling, and unverified attribute-layout and callback-purpose claims. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__ft__ftcommon-019
Reviewed the six assigned functions and their relevant supporting code. They initialize and clear fighter-owned attachment state, reduce its duration from button and stick activity, classify Popo/Nana costume IDs for sound remapping, refresh two optional attachment scales, and rebuild an additive two-component model displacement before the camera callback. Corrections distinguish feedback setup from accessory enabling and attached-object scaling from an unsupported flame-stream interpretation. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__ft__ftcommon-020-retry180539
Reviewed the six assigned helpers and relevant consumers/producers. They count qualified left-stick and trigger inputs, force or restore a shared fighter flag used by metal setup/teardown, start smash-hitbox bookkeeping on a sentinel transition, conditionally scale a secondary ground-motion value by friction, and return a scaled horizontal offset used in entry and revival placement. Current input code uses `triggers[0]`, not the baseline's `input.x650` spelling. Coverage is limited to this bounded subject shard.

### shard-main__melee__ft__ftcommon-021
Reviewed the six assigned subjects and all 29 baseline facts. The helpers reset grounded damage attribution, prepare horizontal friction contributions, project ground acceleration and speed onto the floor tangent with or without friction scaling, and add upper-clamped vertical velocity. Friction descriptions assume ordinary nonnegative friction inputs; the implementations do not normalize negative inputs. Three broader gameplay claims remain unresolved. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__ft__ftcommon-022
Reviewed the six assigned helpers, not the complete translation unit. The velocity helpers conditionally clamp horizontal self-velocity, ground velocity, or an upper vertical-velocity bound; ClampAirDrift supplies the fighter's configured horizontal bound. CheckFallFast latches a mode after descending/input-window checks and plays a sound; AirCatch separately applies the resulting vertical velocity. CalcHitlag truncates its affine damage term before multiplying, truncates again after multiplication, and conditionally applies another truncated common-data factor.

### shard-main__melee__ft__ftcommon-023
Reviewed the six assigned helpers, not the entire translation unit. Falling helpers subtract gravity with a downward-speed bound, select standard fighter attributes, or directly assign fast-fall velocity. Grab initialization seeds the countdown and directional bookkeeping; mash processing independently awards one button decrement and one combined stick-change decrement, reports activity, and optionally advances a wrapping counter. Capture callers perform expiration transitions. The model-scale getter returns the product of runtime Y scale and the common model factor; the Rescue setup uses that product for a vertical placement offset.

### shard-main__melee__ft__ftcommon-024
Reviewed the six assigned subjects and their 28 baseline facts, not the entire translation unit. The helpers instantiate an accessory hierarchy, clear ECB locking, select facing from current horizontal input, exhaust jump bookkeeping, and normalize ordinary/Peach Parasol motions for fighter consumers. The assigned unit-level facts are supported by grounded acceleration, rumble forwarding, item-visibility dispatch, and knockback callback code. Two facts need corrections: the Bowser example calls an airborne initializer rather than a ground conversion, and current stick access uses lstick[0].

### shard-main__melee__ft__ftcommon-025
The assigned subjects have no baseline facts. The two stick-angle functions accept a Fighter pointer and return atan2f of the respective current stick Y component and absolute X component. ftCommon_8007C98C accepts a Fighter pointer and three floats: acceleration, target velocity, and friction. It writes ground acceleration, delegates to ground friction for a zero target, and conditionally adjusts acceleration using the target and horizontal velocity limit. This review covers only the assigned parameter subjects, not the complete translation unit.

### shard-main__melee__ft__ftcommon-026
`ftCommon_8007CA80` computes and stores ground acceleration: a zero target cancels current ground velocity; otherwise, when acceleration is not opposed to current velocity, it limits the step against the target. Its fourth source parameter is unused. `ftCommon_8007CADC` derives acceleration and target velocity from horizontal left-stick input when its magnitude meets a threshold, otherwise supplies zero values, and calls `ftCommon_8007CA80`. All six assigned parameter subjects have empty baseline fact lists; there are no baseline facts to disposition.

### shard-main__melee__ft__ftcommon-027
The assigned subjects have no baseline facts. Their canonical functions calculate ground acceleration from thresholded horizontal stick input, adjust ground knockback toward zero for a positive decrement, initialize and project ground knockback along the floor tangent, and adjust a scalar toward zero for a positive decrement. Source-level behavior is established; register-labelled parameter identities are not independently established.

### shard-main__melee__ft__ftcommon-028
The assigned subjects have no baseline facts. Their containing functions implement signed scalar adjustment with zero-crossing clamps, two attribute-array reads guarded by a Sandbag-kind assertion, adjustment of the ground attacker shield-knockback velocity, and calculation of an aerial-friction contribution written to x74_anim_vel.x. This review covers only the assigned subjects, not the entire translation unit.

### shard-main__melee__ft__ftcommon-029
The assigned subjects have no baseline facts. Canonical bodies show that ftCommon_8007CF58 and ftCommon_8007D050 read a Fighter's horizontal self velocity and write a friction-like adjustment to x74_anim_vel.x. They select the common x1FC value when speed exceeds, respectively, air_drift_max or an explicit max_vel; otherwise they use aerial_friction, returning whether the threshold was exceeded. ftCommon_8007D140 forwards the Fighter, its current horizontal velocity, and explicit acceleration, target velocity, and friction to ftCommon_8007D174. The latter computes the horizontal adjustment, using friction for a zero target and conditional target/maximum-velocity bounds otherwise. These are source-level observations, not verified register-slot mappings.

### shard-main__melee__ft__ftcommon-030
ftCommon_8007D140 forwards the fighter's horizontal self velocity and three supplied movement parameters to ftCommon_8007D174. The latter delegates zero-target handling to the air-friction helper; otherwise it conditionally adjusts acceleration using friction, target velocity, and the fighter's horizontal velocity limit, then writes x74_anim_vel.x. Nearby callers derive these inputs from horizontal stick input and fighter attributes. All six assigned subjects have empty baseline fact lists.

### shard-main__melee__ft__ftcommon-031
The assigned subjects concern three horizontal-movement helpers. `ftCommon_8007D268` forwards the fighter and its current horizontal self velocity to `ftCommon_8007D28C`. That helper derives acceleration and target velocity from horizontal stick input and fighter attributes, then forwards them with the supplied velocity and aerial friction to `ftCommon_8007D174`. `ftCommon_8007D2E8` writes a computed acceleration to `x74_anim_vel.x`: a zero target cancels current horizontal self velocity; otherwise acceleration is limited against the target when it does not oppose current velocity. Its final float parameter is unused. All six assigned parameter subjects have empty baseline fact arrays; there are no baseline facts to disposition.

### shard-main__melee__ft__ftcommon-032
The assigned subjects have no baseline facts. The relevant canonical functions compute horizontal acceleration from thresholded stick input. ftCommon_8007D344 scales input into acceleration and target velocity, then delegates with the fighter's aerial friction. ftCommon_8007D3A8 performs the same input scaling but delegates to ftCommon_8007D2E8 with a zero fourth argument. That callee ignores its fourth float parameter, writes x74_anim_vel.x, cancels current horizontal velocity when the target is zero, and otherwise limits acceleration against target overshoot when acceleration does not oppose current velocity.

### shard-main__melee__ft__ftcommon-033
The six assigned parameter subjects have no baseline facts. Canonical ftCommon_8007D3A8 applies a horizontal-stick magnitude threshold and scales acceleration and target velocity before calling ftCommon_8007D2E8, which writes an animation-velocity adjustment. ftCommon_8007D5D4 and ftCommon_8007D60C mutate a Fighter into airborne state with different jump-count and collision-lock settings. ftCommon_8007D6A4 establishes grounded state, resets jump counters, unlocks collision bounds, and asserts a ground-validation condition. This review covers only the assigned subjects, not the entire translation unit.

### shard-main__melee__ft__ftcommon-034
The six assigned parameter subjects have no baseline facts. Their canonical function bodies use either a Fighter pointer directly or an HSD_GObj whose user_data supplies the Fighter. The reviewed routines perform airborne-conditioned calls and conditional knockback clearing, additionally transition to grounded state, dispatch according to ground/air state, compute atan2f of left-stick Y and X, update facing only beyond the horizontal deadzone, or clear x2219_b0 and call efLib_DestroyAll. This review covers only the assigned subjects, not the full translation unit.

### shard-main__melee__ft__ftcommon-035
The six assigned parameter subjects have no baseline facts to disposition. Their canonical function bodies use an HSD_GObj pointer to access fighter state. ftCommon_8007DB58 calls two fighter helpers and then the non-null take_dmg_cb and death1_cb callbacks. ftCommon_8007DD7C reads a supplied Vec3 and accumulates fighter nudge velocities after filtering other fighters and testing horizontal overlap on the same or adjacent floor segments. ftCommon_8007DFD0 adds a conditional nudge adjustment relative to Player_GetEntity's result, then delegates to ftCommon_8007DD7C with the same arguments. ftCommon_8007E0E4 resets nudge velocities, conditionally invokes these routines, and applies depth-directed correction and limits.

### shard-main__melee__ft__ftcommon-036
The six assigned parameter subjects have no baseline facts. Their current function bodies perform three operations: ftCommon_8007E2A4 obtains Fighter data from its object argument, calculates the x/y attacker-shield velocity components using the floor normal and ground scalar, and returns the same object; ftCommon_8007E2D0 sets a flag and stores a signed 16-bit argument and three callbacks on the Fighter; ftCommon_8007E2F4 stores its signed 16-bit value in Fighter.x1A6A. Review is limited to this bounded subject shard.

### shard-main__melee__ft__ftcommon-037
The six assigned parameter subjects have no baseline facts. Their canonical function bodies implement: storing an s16 value into x1A6A; clearing selected fighter acceleration and velocity fields through an HSD_GObj's user_data; caching the translation of the joint selected by bone index 4; conditionally interpolating that cached translation using x1A6C when the joint matrix is dirty; setting part 0's Z rotation from the floor normal with a grounded-state assertion; and adding accessory animation and requesting frame zero when an accessory exists. This review covers only the assigned subjects, not the entire translation unit.

### shard-main__melee__ft__ftcommon-038
The assigned subjects have no baseline facts. The corresponding canonical bodies show accessory-animation attachment with an initial frame request of zero; conditional clearing of an item reference, callback dispatch and held-item clearing; and a separate kind-indexed callback dispatcher that forwards its integer argument unchanged. This review covers only the assigned subjects, not the complete translation unit.

### shard-main__melee__ft__ftcommon-039
The assigned subjects have no baseline facts. Their enclosing canonical functions conditionally forward an object and integer argument to the fighter-kind item-pickup callback, clear the fighter's held-item-special pointer, and dispatch a table-selected held-item operation with a computed rate. The latter uses frame_speed_mul directly when div is zero; otherwise it scales that multiplier by an item-specific query result divided by div. This review covers only the bounded subjects, not the complete translation unit.

### shard-main__melee__ft__ftcommon-040
The six assigned parameter subjects have no baseline facts to assess. Their current enclosing bodies show that ftCommon_8007EA90 derives a position, angle and magnitude from fighter damage state or defaults, forwards its integer argument to it_802E5F8C, and conditionally accumulates the returned value in player state. ftCommon_8007EBAC conditionally forwards a fighter player identifier and two unsigned arguments to lb_80014574, using the first unsigned argument both directly and offset by two. ftCommon_8007EC30 walks the fighter-object list and forwards its two unsigned arguments to ftCommon_8007EBAC for each fighter. These are source-level observations, not verified register mappings or gameplay interpretations.

### shard-main__melee__ft__ftcommon-041
The assigned parameters belong to four small wrappers. ftCommon_8007EC30 forwards its two unsigned arguments to ftCommon_8007EBAC for every fighter in the entity list. ftCommon_8007ECD4 conditionally removes a rumble ID computed as its signed argument plus two, using the fighter's x618_player_id. ftCommon_8007ED2C passes that same fighter field to lb_800145C0. ftCommon_8007ED50 scales and offsets its signed argument using common-data fields x138 and x13C, converts the result to s32, and calls ftCommon_8007EBAC with selector 5 only when the converted value is at least one.

### shard-main__melee__ft__ftcommon-042
The assigned subjects have no baseline facts. Their enclosing canonical functions were read: `ftCommon_8007EE0C` scales and offsets its integer argument using common-data fields, truncates the result, and calls `ftCommon_8007EBAC(fp, 10, result)` only when the truncated value is positive. `ftCommon_8007EEC8` forwards its second argument and its third argument scaled by 1/256 to an item helper, conditional on a non-null held object with item classifier and kind `It_Kind_Sword`. `ftCommon_8007EF5C` uses the same guard before forwarding the held object and integer argument to another helper. No gameplay interpretation or compiled-register mapping is asserted.

### shard-main__melee__ft__ftcommon-043
The six assigned parameter subjects have no baseline facts. Their current function bodies forward an integer to an item helper after item-class and sword-kind checks; assign a supplied value to Fighter.x209A; transfer source fighter state to another player entity and invoke a destination callback; and dispatch item-visibility callbacks using fighter user data. The visibility setter dispatches only when an item exists and the requested flag differs, but always stores the requested flag. This review covers only the assigned subjects, not the entire translation unit.

### shard-main__melee__ft__ftcommon-044
The assigned subjects have no baseline facts. Their containing functions update an item-visibility flag and conditionally invoke visibility callbacks; apply uniform inverse model scaling to a supplied joint; set ground and horizontal self velocity signs with or against facing direction; and return a fighter matrix only when its Z scale differs from one. These observations describe source-level behavior, not verified register bindings.

### shard-main__melee__ft__ftcommon-045
The assigned subjects concern parameters of five functions. ftCommon_8007F824 and ftCommon_8007F86C obtain Fighter data from an HSD_GObj and conditionally dispatch the corresponding per-kind knockback callback with that same object. ftCommon_8007F8B4 writes a Vec3 containing the componentwise sum of cur_pos and xD4_unk_vel. ftCommon_8007F8E8 conditionally dispatches ftData_UnkMotionStates2 when either x197C or x1980 is null. ftCommon_8007F948 stores its additional arguments into the object's Fighter fields x197C and x2014, then invokes a helper that conditionally dispatches ftData_UnkMotionStates1 under the same either-null test. All six assigned subjects have empty baseline fact arrays; there are no baseline fact IDs to disposition.

### shard-main__melee__ft__ftcommon-046
The six assigned parameter subjects contain no baseline facts. Their canonical function bodies manage the object reference in Fighter.x197C and associated x2014 state. ftCommon_8007F948 stores its second and third arguments in those fields; ftCommon_8007F9B4 clears the reference and invokes two update routines. ftCommon_8007FA00 passes the referenced object and fighter-derived vectors/scaling to item routines. ftCommon_8007FA58 branches on whether x197C is already populated: it either updates x2014 from the incoming item and returns after additional calls, or processes and registers that item and invokes fighter and item updates. This review covers only the assigned subjects, not the entire translation unit.

### shard-main__melee__ft__ftcommon-047
The assigned subjects have no baseline facts to disposition. The reviewed bodies manipulate a fighter-associated object in x1980: ftCommon_8007FC7C extends existing counters or creates an object and initializes its state; ftCommon_8007FDA0 updates its offset and scale using a capped expression derived from x2024; ftCommon_8007FE84 stores the object and initial values, resets two input-state bytes, and invokes shared callbacks. These observations do not establish physical-register parameter bindings.

### shard-main__melee__ft__ftcommon-048
The assigned subjects have no baseline facts. Their canonical functions initialize or clear fighter-associated object state, subtract an input-dependent amount from x2018, test a fighter-kind/costume condition, and pass calculated scale values to associated-object helpers. The input routine can subtract twice per call: once for selected pressed buttons and once for a change in stored stick direction. No register-to-source-parameter mapping or gameplay interpretation is proposed.

### shard-main__melee__ft__ftcommon-049
The six assigned parameter subjects have no baseline facts. Canonical bodies show that ftCommon_8008021C and ftCommon_8008031C receive an HSD_GObj pointer and access its Fighter user_data: the former resets and accumulates two damage-state shift components, while the latter conditionally calls Player_UpdateJoystickCountByIndex and marks input counters 0xFE. The remaining four functions receive Fighter pointers directly: ftCommon_80080460 sets x2225_b6, ftCommon_80080474 copies x2225_b5 into it, ftCommon_80080484 changes x2138_smashSinceHitbox from -1 to zero, and ftCommon_800804A0 writes xE8_ground_accel_2 after conditionally multiplying its float argument by a helper result below one.

### shard-main__melee__ft__ftcommon-050
The six assigned parameter subjects have no baseline facts to disposition. Their canonical functions operate on Fighter data: ground friction writes xE4_ground_accel_1 using gr_vel; air friction writes x74_anim_vel.x using self_vel.x. ftCommon_800804A0 stores its float argument in xE8_ground_accel_2 after multiplying by the ground-friction multiplier only when that multiplier is below one. ftCommon_800804EC returns x40 times x34_scale.x. ftCommon_800804FC writes damage-source fields to 6 and -1 only when ground_or_air equals GA_Ground. Register-labelled parameter identities are not established by these C bodies.

### shard-main__melee__ft__ftcommon-051
The six assigned parameter subjects contain no baseline facts. Canonical implementations show that ground friction computes a ground-acceleration contribution with zero-crossing protection; both ground-movement helpers project scalar acceleration and velocity along the floor tangent, with only ApplyGroundMovement applying a friction multiplier below one. ApplyGroundMovementNoSlide returns its input object. Ascend adds an acceleration to vertical self velocity and clamps the result to an upper bound. These source-level roles do not establish the register-based parameter identities.

### shard-main__melee__ft__ftcommon-052
The assigned subjects have no baseline facts. The inspected functions calculate a truncated, scaled hitlag value with an additional motion-ID-conditioned scale; clamp horizontal self-velocity using the fighter's air-drift limit; cap vertical self-velocity at a supplied value; and enable fast fall when descending with qualifying stick input and tilt timing. Review is limited to this bounded shard.

### shard-main__melee__ft__ftcommon-053
The assigned parameter subjects belong to four velocity helpers. ClampGrVel and ClampSelfVelX bound their respective velocity components using ±max. Fall subtracts gravity from vertical self velocity and enforces a lower bound of -terminal_vel. ClampFallSpeed instead enforces an upper bound of val on vertical self velocity. All six assigned subjects have empty baseline fact arrays; there are no baseline facts to disposition.

### shard-main__melee__ft__ftcommon-054
The complete bundle assigns six parameter subjects, all with empty baseline fact arrays. There are no baseline fact IDs to retain, supersede, reject, or mark unresolved. No parameter semantics or register-to-source mappings are proposed.

### shard-main__melee__ft__ftcommon-055
The six assigned parameter subjects contain no baseline facts. Current source shows that `ftCommon_InitGrab` stores a timer, resets two stick-direction trackers, and conditionally initializes additional tracking state. `ftCommon_GrabMash` subtracts its float argument for qualifying button presses and stick-direction changes, updates optional tracking state, reports whether input qualified, and returns that result. `ftCommon_SetAccessory` checks for an existing accessory and stores the result of loading the supplied joint descriptor. This review covers only the assigned subjects, not the entire translation unit.

### shard-main__melee__ft__ftcommon-056
This bounded subjects shard contains four parameter identities, each with an empty baseline fact list. There are no baseline facts to retain, supersede, reject, or mark unresolved. No new parameter semantics or register-to-source mappings are proposed.

### shard-main__melee__ft__ftcommon-057-retry180539
The reviewed helpers initialize input-driven grab-timer reduction, calculate horizontal airborne corrections, clamp vertical velocity, smooth a mapped joint's translation, dispatch held-item visibility callbacks, and maintain attached-object transforms and state. Character-, item-, and scoring-specific mappings requiring external consumers remain deferred; this is not complete TU coverage.

### shard-main__melee__ft__ftcommon-058
The reviewed helpers prepare bounded ground and aerial acceleration, project attacker shield knockback along the floor, toggle ECB locking, exhaust the jump counter, and destroy fighter-associated effects. Other reviewed bodies dispatch parasol callbacks, transform a scalar into a controller request, generate damage-dependent item requests, and compute capped accessory scaling. Compiled-section attribution and several cross-unit gameplay interpretations remain unverified. This review covers only the assigned links, not the complete translation unit.

### shard-main__melee__ft__ftcommon-059
Reviewed the twelve assigned links against current canonical function bodies and available callers. The bounded excerpts support stick-to-movement conversion, analog-input counting, thrown-joint translation caching, ledge-entry bookkeeping, knockback callback dispatch, and controller-rumble management. Three item-specific mappings require additional callee evidence; their local data flow alone does not establish the claimed gameplay identity.

### shard-main__melee__ft__ftcommon-060
This bounded review verifies shared ground acceleration, grounded knockback friction, Sandbag-specific parameter access, stick-driven aerial acceleration, stick-angle calculation, facing selection, and costume filtering. Item-facing routines dispatch held-sword operations and initialize or rescale attached objects; two specific item-to-gameplay mappings remain unverified.

### shard-main__melee__ft__ftcommon-061
Reviewed the twelve assigned links against current canonical source. The inspected routines implement horizontal aerial corrections and clamping, fast-fall activation, airborne jump bookkeeping, item-pickup callback dispatch, feedback routing, alternate-fighter state transfer, attached-article bookkeeping and scaling, and same-player overlap handling. Several specific gameplay mappings remain unverified; this is not complete translation-unit coverage.

### shard-main__melee__ft__ftcommon-062
Reviewed the 12 assigned concept links against current shared fighter helpers and available callers. Confirmed input-driven aerial correction, horizontal clamping, running acceleration, stick-angle attack selection, fast-fall input processing, and grounded overlap nudging. Character-specific move and article mappings, plus the rumble-reset callee semantics, remain explicitly deferred. This is bounded link review, not complete TU coverage.

### shard-main__melee__ft__ftcommon-063
Reviewed the twelve assigned links against current common-function bodies and available supporting source. The inspected code implements floor-relative movement, bounded horizontal deceleration, capped ascent, jump exhaustion and ECB locking, parasol dispatch, character-specific knockback callbacks, accessory attachment management, and flag restoration during Metal removal. Character-move mappings, the Bunny Hood identity, and the complete damage-to-rumble path remain deferred where supporting canonical source was unavailable or insufficient. This is bounded link review, not complete TU coverage.

### shard-main__melee__ft__ftcommon-064
Reviewed the 12 assigned links against current canonical helpers and relevant call paths. They cover controller rumble, held-item visibility and dropping, knockback callbacks, folded stick-angle processing, scale-dependent geometry access, grounded knockback initialization during directional floor recovery, revival-platform positioning, and fast-fall velocity. All assigned relationships remain supported; citations below use current paths and line numbers. This is bounded link coverage, not complete translation-unit coverage.

### shard-main__melee__ft__ftcommon-065
Reviewed the twelve assigned concept links, not the complete translation unit. Current code supports shared rumble scheduling, dead-zone-filtered facing changes, knockback initialization and decay, grounded overlap correction, traction, grab-mash timer reduction, and aerial speed/friction corrections. The attached-item accumulation and mash-reduction mechanics are visible, but the flower gameplay identity remains deferred.

### shard-main__melee__ft__ftcommon-066
Reviewed the twelve assigned links only. Current code supports aerial velocity correction, grounded initialization and ECB control, componentwise knockback decay, grounded attacker shield recoil decay, metal activation support, and overlap-based fighter separation. Alternate-fighter state transfer and attached-item status management are visible, but some gameplay mappings require additional canonical caller/callee verification.

### shard-main__melee__ft__ftcommon-067-retry180539-retry185219
The reviewed helpers apply terminal-speed-bounded gravity, enter Fall when airborne, dispatch fighter-kind knockback and item-visibility callbacks, calculate horizontal acceleration, load accessory joints, and manipulate an attachment pointer. Direct falling and callback-dispatch relationships are supported. Character-move and Bunny Hood mappings require additional canonical caller or item evidence.

### shard-main__melee__ft__ftcommon-068
Reviewed the twelve assigned links against current ftcommon bodies. These implement item-motion classification, horizontal input-derived acceleration, friction scaling, jump-budget exhaustion, damage-based hitlag calculation, accessory animation initialization, wearable attachment/refresh, and optional fighter-kind callback dispatch. Caller-dependent gameplay mappings and compiled-section attribution remain explicitly deferred; this is not complete TU coverage.

### shard-main__melee__ft__ftcommon-069
Reviewed seven assigned relationships. Current code supports floor-tangent movement, grounded-entry state reset, accessory animation initialization, fighter-entry accessory alignment, and registration of the explicitly spawned F_Flower_Flame article. The Bunny Hood teardown mapping and immediate-pickup dispatcher relationship remain deferred because their necessary caller evidence was not established.

Status: researched; no-change lead bypass; independent review and live promotion pending.
