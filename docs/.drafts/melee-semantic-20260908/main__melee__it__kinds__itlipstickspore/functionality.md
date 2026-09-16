## Lip's Stick spore subsystem

This unit implements two constructors, two motion states and projectile interaction callbacks. Inherited full-file research coverage is adopted. Independent lead inspection of the canonical implementation and its rendered view supports retaining the existing constructor and initializer names as descriptive hypotheses, not recovered original symbols. The 96 retained facts and all 39 retained links remain unchanged; three factual corrections and six compiled-section deferrals are accepted.

### Construction and ownership

Both constructors build zero-velocity, zero-damage spawn records, copy the emission point into `prev_pos` with Z forced to zero, derive `pos` through `it_8026BB68`, and provide the owner in both parent references. Allocation failure skips selector storage, initialization, debug setup and effect creation. Successful fighter-owned construction selects state 0 and effect `0x440`; generic-owner construction selects state 1 and effect `0x441`. Effects receive the supplied position rather than the Z-normalized copy. [Construction](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itlipstickspore.c#L39-L92)

The inherited caller analysis remains applicable: fighter emission forwards `cmd_vars[1]`; the parent helper decrements positive supply before requesting construction without an allocation-failure refund. The thrown path requires nonzero supply, qualifying collision conditions and a pending request; it clears that request after construction is attempted and does not decrement supply in that branch. [Fighter caller](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftlipstickswing.c#L43-L74), [parent helper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itlipstick.c#L43-L50), [thrown path](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itlipstick.c#L135-L161).

### States and selectors

State 0 is selected before the numeric-selector switch. Selector 0 uses lifetime `attr->x10`, velocity `facing_dir * (attr->x0 * attr->x8)`, braking `ABS(velocity / attr->x10)` and hitbox setting `attr->x18`. Selector 1 uses lifetime `attr->xC`, multiplier `attr->x4` and hitbox setting `attr->x14`. Selector 2 shares selector 1's lifetime and hitbox setting but sets horizontal velocity and braking to zero. No default branch or zero-duration guard validates these inputs. Specific attack names remain unproven. [Initialization](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itlipstickspore.c#L94-L127)

State-0 physics returns for zero horizontal velocity or zero braking, otherwise applies a sign-dependent step and then clears the result when its absolute magnitude is strictly smaller than the braking magnitude. This is a post-step clamp. Its collision callback delegates to the environment helper. State 1 instead starts with lifetime `5.0` and transition argument `2`, ignores the stored selector, clears all three `x40_vel` components and returns false from its terrain callback. It is distinct from state-0 selector 2; velocity clearing does not establish that all other displacement mechanisms are disabled. [Callbacks](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itlipstickspore.c#L129-L198), [velocity reset](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/inlines.h#L21-L24).

### Lifetime and interactions

Both animation callbacks use the shared decrement-before-test countdown. Reflection reverses/scales X and Y velocity, reverses facing and replaces the active countdown with `xD48_halfLifeTimer`; the local callback then sets model Z rotation from `atan2f(vy, vx)` and returns false. Five counts therefore describes the initial unmodified state-1 lifetime, not an invariant lifetime. The numerical multiplier used to initialize the stored replacement lifetime remains unestablished. [Shared helpers](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/it_2725.c#L418-L468), [timer initialization](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/it_2725.c#L1414-L1421).

Damage dealt, clank, ordinary shield hit and absorption return true without local cleanup. Shield bounce is separate: its shared helper mirrors velocity, conditionally updates facing and sets collision-facing; the local callback returns false. The unknown event forwards two pointers unchanged to `it_8026B894`; its exact trigger remains unresolved. Flower application and absorber rewards are not implemented by these local callbacks. [Interactions](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itlipstickspore.c#L200-L239).

### Evidence limits

Source establishes the two-entry state table and literal uses, not compiled section sizes, padding, exclusive contents or literal placement. The six section assertions remain unresolved rather than being silently retained as proven or replaced with unsupported layout claims. Rendered external helper names are not independent evidence.

Status: synthesized; independent review and live promotion pending.
