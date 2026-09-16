## Old Yoshi stage controller

The unit registers Gr_Kind_OldYoshi, /GrOy.dat, six Ground-component callback rows and lifecycle/query hooks. Initialization caches the external yakumono parameter pointer before configuring components in order 0, 1, 4, 5, 2, 3. A missing GObj produces a diagnostic without stopping later component initialization. Shared callback setup handles callback3, on_init and gobj_proc, not callback1. Supported existing structural names and explanations are retained rather than cosmetically rewritten.

Components 0 and 1 initialize archive-backed animation; component 1 also applies two material flags and mode 2. Components 4 and 5 use common JObj/animation setup and mode 1; component 4 additionally sets x10_flags.b5 and refreshes map collision before updating the shared transient dynamics/effect list. Cross-file ownership of activity, recycling and teardown is not transferred to this unit. Empty callbacks and constant-false predicates remain inert.

## Three disappearing clouds

Component 2 maps collision joints 0, 1, 2 to model joints 1, 5, 9. It clears state, contact latch, counter, displacement and velocity, captures baseline Y and registers Ground payload userdata. Collision classification must equal 1 and the joint ID must match before the callback sets a latch.

State 0 integrates velocity toward configured depressed displacement when contacted, or zero otherwise; it applies branch-specific displacement bounds and resets the counter without contact. Disappearance requires the old postincrement counter to be strictly greater than the contact threshold. State 1 removes collision at counter equality and again on animation completion, then hides the model and enters state 2. State 2 waits until the old postincrement counter exceeds the hidden threshold, then starts return animation. State 3 reveals at counter zero, adds collision at restoration-threshold equality and returns to state 0 on animation completion, without a separate fallback collision add. Every iteration writes baseline Y minus displacement and clears the contact latch; map collision is refreshed afterward. Counter representation, runtime tuning and scheduling prevent unconditional exact-duration claims.

The velocity helper estimates stopping distance, brakes when moving toward the target within it, otherwise accelerates toward the target, and checks the upper bound before the lower. It neither validates acceleration/bounds nor clamps braking at zero nor zeroes velocity at target equality. Smooth motion is intended, not a guarantee against reversal or overshoot.

## Background guests and queries

Component 3 hides its hierarchy, initializes randomized delay and uses -1 as inactive selection. Every inactive update decrements the signed delay; only a previously negative delay selects an ID from the fixed table 1..5. Animation reset and randomized root Y happen on every inactive update. Active updates resolve and reveal the selected child; missing lookup returns without resetting selection. Completion hides the child, reseeds delay and restores -1. Parameters supply delay endpoints and height scale, not child selection. Existing character associations remain baseline context without species assignments for individual IDs.

The start hook invokes the shared generator constructor with a null descriptor and ignores its nullable result. Inherited cross-file research records success publication and cleanup after GObj creation failure; no further lifetime guarantee is asserted. The collision-line hook returns a null DynamicsDesc pointer. The shadow query tests fighter Y strictly above reference origin Y minus five. Its integer argument is unused; delegated origin lookup can refresh a parented matrix and requires a valid reference joint.

## Review scope and uncertainties

Inherited research establishes complete canonical/rendered coverage and enumeration. Independent lead checks reviewed all proposed citation ranges and upstream contradiction evidence. Corrections concern clouds versus rotating blocks, void-return terminology, callback1 installation, delegated initialization, guest guard placement and data provenance, velocity guarantees/preconditions and query purity. No additional name changes are warranted. Source switches and literals do not prove compiled section placement, dispatch-table extent or literal-pool identity; these claims remain deferred. Inherited header shadowed_binding reports remain renderer limitations.

Status: synthesized; independent review and live promotion pending.
