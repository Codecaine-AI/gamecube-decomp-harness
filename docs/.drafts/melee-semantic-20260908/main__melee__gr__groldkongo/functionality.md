## Old Kongo stage controller

Registers `Gr_Kind_OldKongo` with `/GrOk.dat`, two joint records and four ground-object callback suites. Initialization caches the yakumono parameter pointer, clears stage flag b4, sets b5, and installs objects in order 0, 3, 1, 2. Missing object lookups produce diagnostics but do not stop subsequent initialization. The local installer invokes on-init, schedules the process and stores callback3; its current implementation does not consume callback1 or the callback-record flags.

Object 0 starts map-specific animation and otherwise has inactive callbacks. Object 3 performs shared model/animation setup, sets Ground flag b5 and runs two delegated operations each frame; its precise visible component remains unidentified. Stage demo/load hooks are empty, the Boolean stage query returns false, and the dynamics-pointer hook returns null.

### Barrel

Object 1 maintains three independent selectors: rotation `xC4`, movement-animation rate `xC8`, and occupancy/firing `xC6`. Rotation accelerates in a random direction, selects a weighted target orientation and uses states 2/3 to determine when to return to state 0 for braking. Movement separately accelerates, holds, decelerates and pauses. Joint 1 supplies the barrel position, and the controller publishes the active object, position and angle through the ground subsystem.

Admission requires occupancy state 0 and strict three-dimensional radius containment. It stores the candidate fighter, chooses an s16 firing delay, enters state 1 and starts presentation/feedback. It does not itself change the fighter's motion state. Fighter-side BarrelWait code follows the published barrel position; A/B input dispatches through Ground to the stage's guarded 1-to-2 firing request.

Occupancy states 1 and 2 fall through into firing setup and state 3. Importantly, state 1 with `keep == NULL` writes state 0 but still falls through, so this is not safe cancellation. State 3 tests the old value of `hit_timer++ > 10`, then dereferences the retained object and launches only when `p_link == 8`. It requests sound 0x12A and enters state 4 even when that link test prevents launch. State 4 resets the selector without clearing `keep`. The separate cleanup helper acts only in state 1, asserts a retained pointer and clears state/pointer/material when retained-object byte 2 equals 8; that number alone does not establish invalidation.

The weighted selector returns one of eight target angles. Zero total skips the random call but still traverses the buckets; all-zero weights reach the assertion. Actual launch direction uses current rotation plus pi/2, not necessarily a settled eight-way target.

### Bird and shadow

Object 2 begins hidden with a randomized wait. A positive countdown reaching zero starts animation, sets z=-200 and randomized y around 70, and reveals subtree 3 at x=max(right,200) or subtree 1 at x=min(left,-200). These are absolute clamps, not 200-unit offsets beyond camera boundaries. Animation completion hides the object and schedules another wait. A nonpositive timer enters the completion-check branch rather than directly spawning a bird.

The shadow hook compares supplied position Y strictly against the reference joint origin Y. It has no local gameplay-state transition, but the origin helper may set up the joint matrix.

### Review outcome

Existing descriptive names remain useful and are retained; no cosmetic renaming is proposed. Corrections address bird placement, occupancy fallthrough, fighter-state ownership, field width, callback installation and helper side effects. Compiled section/table/literal-pool claims remain unresolved without compiled evidence. The header exports the request and cleanup helpers plus StageData. The documentation attributes parameter field names to SSBU, but its `grOldKongo_Yaku` struct reference differs from the C declaration `grOldKongo_YakumonoParam`.

Status: synthesized; independent review and live promotion pending.
