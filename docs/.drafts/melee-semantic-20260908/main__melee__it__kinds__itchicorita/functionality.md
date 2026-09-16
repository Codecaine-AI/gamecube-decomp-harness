## Chikorita and Chikorita Leaf

The implementation owns a three-state Chikorita actor and a separate one-state leaf projectile. The header declares their callbacks and tables; both canonical and rendered files were reviewed completely. Rendered substitutions are function-name hypotheses, not independent behavioral evidence.

### Parent lifecycle

Initialization sets the attack-cycle counter `x60` to -1, clears the leaf-emission command flag, configures appearance scale, zeros the custom vertical accumulator `x64`, and enters numeric state 2. State 2 has animation ID -1; state index and animation ID must not be conflated. Its animation callback delegates appearance scaling, its physics callback discards the shared appearance-timer completion result, and its collision callback supplies a landing continuation. The shared floor-contact path marks the actor grounded, invokes that continuation, then restores model scale. The continuation resets velocity and enters state 0.

State-0 entry loads the configured cycle count only when `x60 == -1`, changes state, then installs the accessory callback. The animation callback extracts child-bone root motion and checks animation activity. At a completed animation boundary it either clamps an exhausted counter to zero and enters state 1, or decrements the counter and restarts state 0. The redundant post-decrement -1 check remains present; it should not be silently removed from explanations of the canonical branch structure. State 1 reports completion when its ending animation is inactive. The generic item dispatcher interprets a true animation result as a destruction request.

The shared state changer clears `on_accessory`, explaining why state-0 entry and restart reinstall it after changing state and why entry into state 1 stops this accessory path. States 0 and 1 use identical ground/air collision dispatch with the empty local callback. The rendered `Destroyed` name for that empty callback remains uncertain without lifecycle registration evidence.

### Movement

States 0 and 1 first apply animation-derived velocity. While airborne, their shared physics helper subtracts configured fall acceleration from `x64` if the accumulator and acceleration have the same sign, or if their signs differ and the accumulator magnitude is below the configured maximum. It then copies `x64` to vertical velocity. This is a pre-step conditional limit, not a clamp, and a step can overshoot the maximum. Grounded processing resets only `x64`; animation-derived vertical velocity is not explicitly zeroed there.

### Leaf emission and lifetime

The accessory callback consumes command flag x0: a set flag causes one leaf-creation attempt and is cleared afterward even if allocation fails. The constructor preserves distinct `prev_pos` and `pos` inputs, applies facing-scaled offsets to the former, obtains the latter from the parent ECB helper, supplies the parent's owner and the Chikorita object as separate parent references, and initializes horizontal velocity with zero Y/Z velocity. Its follow-up call occurs only on successful creation.

Leaf spawn initialization copies the configured timer before running four ordered setup calls, including entry into leaf state 0. The leaf animation callback checks for a nonpositive timer before decrementing; reaching zero through a decrement does not return true until a subsequent invocation. Its physics callback is empty and its collision callback directly propagates a shared collision result. Shield contact returns false without local processing. Reflection delegates planar velocity reversal/scaling, facing reversal, and replacement of the remaining timer with `xD48_halfLifeTimer`; this helper does not establish how that stored timer was initialized. Both two-object event adapters delegate reference cleanup.

### Semantic assessment

Most existing names and explanations fit the canonical behavior and were explicitly retained. Corrections address an unidentified leaf event whose delegated semantics are available, overly strong gravity/capping and grounded-motion descriptions, and the misuse of “non-returning” for an ordinary void callback. Compiled data-section extent, contiguity, and constant-pool claims remain unresolved because source declarations and arithmetic do not prove compiled placement or contents.

Status: synthesized; independent review and live promotion pending.
