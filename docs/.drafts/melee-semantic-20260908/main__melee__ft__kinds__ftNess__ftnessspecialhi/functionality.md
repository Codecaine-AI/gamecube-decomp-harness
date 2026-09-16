# Disjoint Librarian Research

### shard-main__melee__ft__kinds__ftNess__ftnessspecialhi-000
Reviewed canonical and rendered lines 1–480 only. This range implements Ness special-hi effect/reference cleanup, a hold-state predicate, a proximity-triggered collision latch, wall-relative velocity redirection, and grounded/aerial startup initialization.

The proximity test uses strict x/y bounds of approximately 8.3333 and 12.3333 around the fighter position offset upward by 5 × vertical scale; z is ignored. With an item reference present, collision state 1 becomes 0 only after leaving those bounds; state 0 becomes 2 upon entering them, stores two item-supplied positions, and returns true. Startup initializes that state to 1.

Cleanup distinguishes clearing the stored item reference from first calling `it_802AB9C0` on it. Both cleanup variants clear death/damage callbacks and reset part-0 X rotation regardless of motion state, while effect destruction is restricted to the enumerated special-hi states. A separate helper clears the reference only when it matches its argument.

The wall helper chooses a tangent direction from a wall normal and the stored movement angle, rotates self velocity about Z, and recomputes the angle with atan2. Startup selects the corresponding ground/air motion state, resets command variables and working state, copies attribute values into timers, and initializes an angle from facing direction. Aerial startup additionally zeroes vertical self velocity. Both routines repeatedly clear only the x components of the two stored collision positions—not all vector components. The range ends inside `ftNs_SpecialHi_Enter`; its complete behavior is not assessed.

### shard-main__melee__ft__kinds__ftNess__ftnessspecialhi-001
Reviewed canonical and rendered lines 481–960 only. This range covers launch-direction setup and ground/air startup and hold animation logic for Ness's special-hi states. The visible ground-launch branch compares a displacement vector with the floor normal, selects a ground motion and signed momentum within an attribute-controlled angular interval, or follows alternate launch/cleanup paths. The aerial launch helper derives an angle from the displacement between the fighter's vertically offset position and collPos1, then assigns attribute-scaled cosine/sine velocity. Aerial launch entry sets the motion, copies an attribute into unkVar, aligns part rotation, clears damage/death callbacks, and marks all jumps used.

Both startup callbacks enter their hold states when animation frames run out. If the stored item pointer is null, they obtain a joint-based position, zero its z component, call it_802AB58C, store its result, and install damage/death callbacks on success. They also mark jumps used and request effect 1262. Hold callbacks decrement the first timer while positive and the second only while the item pointer is null. With no item and both timers expired, they enter the corresponding end state and clear effects. With an item, they compare it_802AB568's result against the fighter: equality permits the collision check and launch path; inequality clears the pointer and enters the end state. The ground launch animation requests effect 1263 when its incremented counter equals one and enters the end state on animation completion. The ground end callback calls ft_8008A2BC when its animation finishes.

### shard-main__melee__ft__kinds__ftNess__ftnessspecialhi-002
Reviewed canonical and rendered lines 961–1440 of `ftnessspecialhi.c`, not the complete translation unit.

- Animation completion selects `ftCo_Fall_Enter` when the configured landing-lag value is zero; otherwise it calls `ftCo_800969D8` with landing-lag and animation-blend attributes. The aerial launch animation initializes an effect when its incremented effect counter equals one and finishes with vertical velocity set to `-abs(fallAccel)`.
- All nine displayed IASA callbacks are no-ops. Grounded startup decrements a nonzero gravity-delay counter before delegating physics; grounded hold/end simply delegate. Aerial startup/hold/end decrement the delay or call fall physics when it was already zero, and always apply aerial friction. Rebound physics uses common gravity, terminal velocity, and aerial friction.
- Grounded launch physics subtracts facing-scaled deceleration from ground speed but restores the old speed when the result reaches the directional epsilon threshold. It saves self velocity, applies ground movement, and updates part rotation from velocity. Its vertical-velocity assignments merely restore the unchanged saved value.
- Aerial launch physics reduces XY speed unless the result is at or below epsilon, reconstructs velocity using the stored angle, updates rotation, and saves velocity. When command variable zero equals one, it decreases and lower-bounds `fallAccel`, then adds that value directly to vertical position rather than to vertical velocity.
- Grounded startup/hold/end collision callbacks switch to their corresponding aerial states at the current animation frame when `ft_80082708` returns false. The displayed launch collision branches either reset move-local fields and callbacks and enter aerial end on wall contact, or continue in aerial launch. When the collision test returns true and ceiling/wall flags are present, they stop ground speed, conditionally destroy effects, reset rotation, and call `ftCo_80097D40`.

### shard-main__melee__ft__kinds__ftNess__ftnessspecialhi-003
Reviewed canonical and rendered lines 1441–1768 only.

- The opening function tail computes `aerialVel` from the floor-normal angle with a facing-dependent ±π/2 offset; the offset also depends on the sign of the normal's Y component.
- The aerial start, hold, and end collision callbacks conditionally invoke the corresponding ground-state transition after `ft_80081D0C` succeeds.
- `ftNs_SpecialAirHi_Coll` restores `self_vel` from `unkVector1` before collision processing. A successful ground/ledge test compares velocity against the floor normal using a threshold of `(90 + x64_PK_THUNDER_2_WALLHUG_ANGLE)` degrees. Above that threshold it zeros velocity, conditionally destroys effects and clears `pkthunder_gfx`, resets part rotation, and calls `ftCo_80097D40`; otherwise it transitions to `ftNs_MS_SpecialHi`. A subsequent successful cliff check delegates to `ftCliffCommon_80081370` and returns.
- Remaining collision processing prioritizes ceiling, then left wall, then right wall. Above the same angle threshold, each surface branch mirrors velocity about its normal, halves X/Y, clamps horizontal velocity, chooses facing from horizontal velocity, stops special-hi graphics, enters `ftNs_MS_SpecialAirHiRebound`, and spawns effect 1030 with an X angle derived from the surface normal. Below-threshold wall contacts call `ftNs_SpecialAirHi_CollisionModVel`; below-threshold ceiling contact does not. Ceiling presence suppresses wall processing, and left-wall handling returns before right-wall handling.
- The rebound collision callback zeros velocity and performs the same effect cleanup, rotation reset, and `ftCo_80097D40` delegation when its ground/ledge test succeeds. Otherwise it conditionally delegates to the cliff helper.

### shard-main__melee__ft__kinds__ftNess__ftnessspecialhi-004
### Assigned header interface
Reviewed canonical and rendered `ftnessspecialhi.h`, lines 1–60. The header identifies itself as the PK Thunder (SpecialHi) callback interface. It declares helper functions, four entry functions, and parallel `Anim`, `IASA`, `Phys`, and `Coll` callback families for the `SpecialHi` and `SpecialAirHi` variants, including Start, Hold, End, and aerial Rebound names. All callbacks accept an `HSD_GObj*` and return `void`; two helper declarations return `bool`, and the ownership-check-named helper accepts a second `HSD_GObj*`. This is a declaration-only interface, not evidence of runtime transitions or helper side effects.

### shard-main__melee__ft__kinds__ftNess__ftnessspecialhi-005
The assigned airborne hold callback advances projectile-loss timers, selects the ending state when the projectile disappears or changes ownership, and selects the separate self-launch state on self-contact. The airborne ending callbacks wait for animation completion, consume jumps and dispatch to a fall helper, provide no IASA transitions, apply delayed falling plus continuous aerial friction, and transfer to the grounded ending state on collision. SpecialAirHiEnd is the projectile-phase ending, not the separate SpecialAirHi self-launch animation. Source records an ordered scalar-literal list, but does not establish the compiled .sdata2 layout.

### shard-main__melee__ft__kinds__ftNess__ftnessspecialhi-006
Reviewed the six assigned airborne hold/rebound callbacks. Hold collision conditionally transfers to grounded hold; hold physics counts down gravityDelay, applies falling only when the callback starts with zero delay, and always applies air friction. Both assigned IASA callbacks return without processing input or changing state. Rebound animation completion selects ordinary fall or a configured alternate fall entry. Rebound collision prioritizes grounding, zeroes velocity, conditionally destroys effects and clears the graphics flag, resets part rotation, and otherwise permits the cliff-transition path. This is bounded callback coverage, not complete TU coverage.

### shard-main__melee__ft__kinds__ftNess__ftnessspecialhi-007
Reviewed the six assigned subjects, not the complete translation unit. Aerial PK Thunder entry initializes timers, transient state, heading, and vertical velocity. Startup animation completion enters hold, conditionally creates the projectile and installs callbacks, exhausts jumps, and replaces effects. Startup IASA is inert; physics delays falling while always applying aerial friction; collision transfers startup to its grounded counterpart. Rebound physics applies common gravity and friction after collision handling redirects and damps velocity.

### shard-main__melee__ft__kinds__ftNess__ftnessspecialhi-008
Reviewed the six assigned aerial SpecialHi subjects. Entry computes a launch heading from position offsets, initializes velocity and model rotation, clears two callbacks, and exhausts jumps. Physics reconstructs directional velocity with guarded deceleration, saves it for collision processing, and conditionally applies bounded vertical displacement. Animation initializes an effect once and selects an exit when frames end; IASA does nothing. Collision handling distinguishes ground, cliff, ceiling, and wall paths, with steep-impact rebound and shallow-wall tangent redirection. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__ft__kinds__ftNess__ftnessspecialhi-009-retry192951
The assigned grounded PK Thunder callbacks implement hold-phase timer and projectile checks, animation-gated ending, an empty ending IASA slot, shared grounded friction and movement, and frame-preserving transitions from grounded hold/end to their airborne counterparts. The motion-state table registers these callbacks in the corresponding slots. This review covers only the six assigned subjects, not the complete translation unit.

### shard-main__melee__ft__kinds__ftNess__ftnessspecialhi-010
Reviewed the six assigned subjects. Grounded PK Thunder entry initializes timers, command variables, transient state and orientation. Startup animation completion enters Hold, conditionally attempts projectile creation, installs damage callbacks on success, consumes jumps and activates graphics. Startup collision failure switches to aerial startup while preserving the animation frame. Startup and Hold IASA callbacks immediately return. Hold physics delegates to shared speed-dependent ground friction and ground movement. This review does not establish complete TU coverage.

### shard-main__melee__ft__kinds__ftNess__ftnessspecialhi-011
Reviewed the six assigned subjects and their 30 baseline facts. Grounded startup physics decrements a nonzero gravity-delay counter before shared grounded friction and movement. Visual cleanup is restricted to nine SpecialHi-family states; launch animation creates a hip-attached effect when its counter reaches one and cleans up on animation completion. The hold predicate recognizes exactly two control-loop states. Grounded self-contact entry selects grounded launch, aerial launch, or down-bound handling from platform status and floor-relative trajectory. Grounded launch collision selects aerial continuation or ending, handles obstructions, and otherwise updates the stored floor-tangent angle. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__ft__kinds__ftNess__ftnessspecialhi-012
Reviewed the six assigned subjects and all 30 baseline facts. The grounded launch IASA body is a no-op. Grounded launch physics applies guarded ground-speed deceleration, snapshots self velocity, applies ground movement, and updates model rotation. Projectile helpers implement identity-sensitive reference clearing, gated self-contact detection with captured positions, and fighter-side cleanup. Damage cleanup detaches the fighter reference and calls an item-side ownership cleanup helper; immediate projectile destruction is not established by that callee.

### shard-main__melee__ft__kinds__ftNess__ftnessspecialhi-013
The reviewed callbacks coordinate Ness's PK Thunder projectile reference, hold timers, self-contact detection, motion changes, and effects. Ground and aerial hold enter their ending states after projectile absence and expiration of both timers; a failed projectile-owner comparison ends hold immediately. Self-contact enters PK Thunder 2. Aerial physics provides delayed gravity during ordinary phases and directional velocity updates during the self-hit launch. This assessment is bounded to the assigned baseline facts, not complete TU coverage.

### shard-main__melee__ft__kinds__ftNess__ftnessspecialhi-014
This bounded shard contains six parameter subjects associated with aerial hold and rebound callbacks. All six have empty baseline fact arrays, so there are no assigned fact IDs to assess. No new semantic claims or proposals are made; this review does not claim complete translation-unit coverage.

### shard-main__melee__ft__kinds__ftNess__ftnessspecialhi-015
The six assigned parameter subjects belong to aerial-start and rebound callbacks. Their canonical signatures take `HSD_GObj* gobj`; the start IASA callback does not use it. Start entry initializes motion-local state and clears vertical velocity. Start animation completion switches to hold, conditionally creates the associated item, installs damage callbacks on successful creation, exhausts available jumps, and replaces effects. Start physics delays falling while applying aerial friction; rebound physics uses common gravity, terminal velocity, and aerial friction. Start collision conditionally requests the corresponding ground-state transition.

### shard-main__melee__ft__kinds__ftNess__ftnessspecialhi-016
This bounded shard assigns six parameter subjects: r3 of ftNs_SpecialAirHi_Anim, ftNs_SpecialAirHi_Coll, ftNs_SpecialAirHi_Enter, and ftNs_SpecialAirHi_IASA, plus r3 and r4 of ftNs_SpecialAirHi_CollisionModVel. All six subjects have empty baseline fact arrays. Consequently, there are no baseline fact IDs to retain, correct, reject, or defer. No new parameter semantics or compiled register mappings are asserted.

### shard-main__melee__ft__kinds__ftNess__ftnessspecialhi-017
The six assigned parameter subjects belong to callbacks taking `HSD_GObj* gobj`. The aerial launch physics callback updates fighter velocity, orientation, and conditional downward displacement. The grounded end callbacks check animation completion, delegate physics, perform a conditional transition to the aerial end state while preserving the animation frame, or do nothing (IASA). The grounded hold animation callback updates timers and selects end or launch transitions using item presence and collision checks. All six subjects have empty baseline fact lists; no fact dispositions or new proposals are needed.

### shard-main__melee__ft__kinds__ftNess__ftnessspecialhi-018
The six assigned parameter subjects have no baseline facts to disposition. In the inspected source, the callbacks accept an HSD_GObj pointer: startup initializes fighter state, startup animation advances to hold and conditionally creates the associated item, and startup/hold collision handling changes to the corresponding aerial state while preserving the animation frame. Hold physics forwards the object to ft_80084F3C; hold IASA immediately returns without using it. These observations describe source parameters, not verified compiled-register identities.

### shard-main__melee__ft__kinds__ftNess__ftnessspecialhi-019
The complete bundle contains six parameter subjects, each with an empty baseline facts array; consequently there are no baseline fact IDs to assess. The inspected canonical ftNs_SpecialHiStopGFX body obtains fighter data from its object parameter and, for the explicitly listed special-hi motion states, destroys attached effects and clears pkthunder_gfx. No parameter-register mapping or broader translation-unit coverage is asserted.

### shard-main__melee__ft__kinds__ftNess__ftnessspecialhi-020
All six assigned parameter subjects have empty baseline fact lists, so there are no fact dispositions. The inspected helper bodies access fighter data through a game-object argument: the collision helper tests position proximity and updates collision state; the removal helper clears the stored item reference and callbacks, conditionally destroys effects, and resets rotation; the ownership-check helper clears the stored reference only when it matches the supplied non-null item object. This is a bounded helper review, not complete translation-unit coverage.

### shard-main__melee__ft__kinds__ftNess__ftnessspecialhi-021
Both assigned subjects have empty baseline fact lists. The reviewed functions each accept an `HSD_GObj* gobj` and access fighter data through it. `ftNs_SpecialHi_Phys` adjusts ground velocity with a directional threshold guard, saves self velocity, applies ground movement, and updates part rotation. `ftNs_SpecialHi_TakeDamage` passes a non-null stored item object to `it_802AB9C0`, clears the reference, conditionally destroys effects for the listed motion states, and clears callbacks and resets part rotation. This review covers only the assigned subjects, not the complete translation unit.

### shard-main__melee__ft__kinds__ftNess__ftnessspecialhi-022
The reviewed callbacks implement PK Thunder aerial startup and projectile creation, startup gravity-delay bookkeeping, and ground/air phase transitions. The reviewed PK Thunder 2 routines initialize the self-launch, manage its aerial animation effects and termination, and apply rebound physics and collision outcomes. This assessment covers only the twelve assigned links, not the entire translation unit.

### shard-main__melee__ft__kinds__ftNess__ftnessspecialhi-023
The reviewed callbacks implement explicitly documented PK Thunder startup, control-loop and ending behavior, projectile-reference cleanup, and PK Thunder 2 movement, visual cleanup, collision and rebound behavior. Startup initializes timers and state; startup completion enters hold and obtains a projectile object. Self-launch physics applies deceleration and orientation updates, while aerial collisions select ground transitions, surface-following or reflected rebound. This review covers the assigned links, not the entire translation unit.

### shard-main__melee__ft__kinds__ftNess__ftnessspecialhi-024
The reviewed callbacks manage PK Thunder projectile references, effects, grounded/aerial control and ending transitions, and PK Thunder 2 launch visuals. Hold and End IASA callbacks are no-ops. The aerial projectile-ending state is distinct from the aerial self-hit launch and rebound states; its empty IASA body alone does not establish PK Thunder 2 ending-lag behavior. This review covers only the assigned links, not the complete translation unit.

### shard-main__melee__ft__kinds__ftNess__ftnessspecialhi-025
The reviewed portions implement Ness's PK Thunder control-loop timing, projectile-contact detection, grounded self-hit launch entry, launch effects, ending animation, and aerial hold physics. Contact geometry feeds PK Thunder 2 entry. The three reviewed aerial IASA callbacks are empty; their bodies do not implement steering, launch, or rebound behavior.

### shard-main__melee__ft__kinds__ftNess__ftnessspecialhi-026
Reviewed the assigned links against current canonical source. The inspected code advances aerial PK Thunder startup into projectile control, transitions self-contact into the aerial self-launch state, resolves aerial ending behavior, and handles grounded PK Thunder 2 terrain collision. IASA callbacks inspected here are no-ops. Source-level constants do not establish compiled .sdata2 membership. This is bounded link review, not complete TU coverage.

### shard-main__melee__ft__kinds__ftNess__ftnessspecialhi-027
The reviewed code initializes Ness's PK Thunder startup, manages its grounded control loop, detects projectile proximity for the self-hit transition, and handles PK Thunder 2 launch effects and animation exits. Aerial end and launch callbacks select ordinary fall for zero configured landing lag or call a shared transition helper otherwise. This review covers the assigned links, not the entire translation unit.

### shard-main__melee__ft__kinds__ftNess__ftnessspecialhi-028
The reviewed code implements Ness's explicitly documented PK Thunder callback family, including projectile-control timers, self-collision handling, aerial-to-ground transitions, and empty IASA callbacks. PK Thunder 2 behavior includes launch-effect timing, animation-end fall handling, and wall-impact velocity redirection or rebound. This assessment covers the twelve assigned links, not the complete translation unit.

### shard-main__melee__ft__kinds__ftNess__ftnessspecialhi-029
The reviewed functions support Ness's PK Thunder projectile cleanup, control-state classification, grounded control physics, delayed aerial gravity, and PK Thunder 2 launch and directional deceleration. The aerial-start IASA callback is an explicitly registered no-op. StopGFX destroys effects and clears the graphics flag; it does not create replacement effects. This review assesses only the assigned links, not the entire translation unit.

### shard-main__melee__ft__kinds__ftNess__ftnessspecialhi-030
The reviewed aerial PK Thunder startup physics callback decrements a nonzero gravity-delay counter; otherwise it applies falling physics using the move-specific acceleration and fighter terminal velocity. It applies aerial friction on every invocation.

Status: researched; no-change lead bypass; independent review and live promotion pending.
