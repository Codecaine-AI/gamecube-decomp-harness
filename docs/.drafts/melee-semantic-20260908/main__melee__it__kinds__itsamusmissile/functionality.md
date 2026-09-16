## Samus Missile lifecycle

This module constructs `It_Kind_Samus_Missile` and implements two travel variants plus their terminal states. The fighter-side launch callback increments a launch counter, derives a muzzle position, and supplies the variant flag. Construction can fail and return NULL; missile-specific initialization occurs only after successful allocation. The supplied position is copied into `SpawnItem.prev_pos` with Z zeroed, while `spawn.pos` is obtained separately. The item retains a separate owner pointer and, when nonnull, snapshots that owner's launch counter.

### State dispatch
- **State 0 — ordinary/Homing Missile:** initializes facing-relative speed, lifetime, command variables and accumulated turn, then attaches effect `0x485`. Physics performs target-seeking steering while command variable 0 is nonzero; otherwise it multiplies planar velocity by an attribute-defined factor when squared speed exceeds a threshold. This is not a hard minimum-speed clamp.
- **State 1 — smash-input/Super Missile:** initializes horizontal velocity, lifetime and effect `1156`. Command variable 1 enables horizontal acceleration; excess horizontal speed is replaced by the configured cap with the facing direction's sign. The physics callback does not modify vertical velocity.
- **States 2 and 3 — variant terminal phases:** separate setup routines perform common cleanup and terminal-lifetime initialization, destroy projectile-parented effects, invoke different finalization helpers, and select state 2 or 3. Both states have the same animation callback and null physics/collision callbacks. The shared timer helper decrements first and returns true when the updated lifetime is at most zero.

### Timing and ownership
Both travel animation callbacks run shared lifetime processing and then the owner-counter retirement check, returning false themselves. The scheduler sets steering command variable 0 from `lifeTimer > attrs->x4 - attrs->x8`; ordinary effects are destroyed only at exact equality. It latches command variable 1 when `lifeTimer <= attrs->x24 - attrs->x28`. Travel expiration is tested before decrement, so a timer of 1 becomes 0 and expires on the next invocation. The initializer's zero steering flag does not establish a scheduled damping-before-homing phase.

Owner-counter retirement requires command variable 3 to be zero, a nonnull saved owner, and the counter difference to satisfy `>= 2U`; the unsigned comparison must not be replaced by an unconditional signed-monotonic interpretation. Reflection sets variable 3, disabling this check. The reference-invalidation callback invokes common cleanup and clears the separate saved owner only when it matches the invalidated object.

### Steering and interactions
The turn utility first attempts one targeting helper, then a fallback object lookup. Missing targets, a zero planar aim coordinate, or angular separation below the configured threshold leave the stored turn unchanged. The normalized direction difference is compared against **positive `0.001f` in both branches**: greater subtracts a turn step, less adds one, and equality skips the step while still reaching the clamp. This is not a symmetric ±epsilon dead zone. The physics caller still reconstructs velocity and applies model rotation when the utility returns without changing turn.

Terrain callbacks delegate to the shared collision helper with the appropriate terminal event. Damage, clank and ordinary shield-hit callbacks guard against re-entering the corresponding terminal state. Shield bounce is different: only the smash variant invokes the bounce helper and realigns the child model; the ordinary variant performs no mutation. Reflection operates in place, resets smash horizontal speed, corrects negative vertical velocity, rotates the root model and replaces variant effects without an explicit motion-state transition.

### Semantic review
Existing rendered names—including `Spawn`, `AdjustTurn`, `Homing_Phys`, `Homing_Coll`, `SSmash_Coll`, `SuperMissile_Init`, `Reflected` and `ShieldBounced`—fit canonical behavior and are retained as semantic hypotheses, not recovered historical spellings. Two explanations warrant correction: state-1 animation's formerly unresolved variant mapping, and the ordinary initializer's claimed damping-before-homing chronology. Small-data pool placement, sizes and alignment remain unresolved without revision-matched compiled evidence.

Canonical grounding: `src/melee/it/kinds/itsamusmissile.c` lines 16–453; `src/melee/ft/kinds/ftSamus/ftsamusspecialn.c` lines 413–443; `src/melee/it/itgroundcoll.c` lines 685–705; `src/melee/it/it_2725.c` lines 1429–1450; and `src/melee/ef/eflib.c` lines 244–283, all at revision `c302741689bd67c361cd7faadb221df3193992c3`.

Status: synthesized; independent review and live promotion pending.
