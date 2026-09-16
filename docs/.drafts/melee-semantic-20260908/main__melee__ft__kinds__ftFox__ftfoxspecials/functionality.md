## Functionality

This unit implements the shared Fox Illusion/Falco Phantasm startup, dash and ending state families, with grounded and aerial variants. The header declares the public callbacks and indexed accessors consistently with their definitions.

### Startup and movement
Startup clears command variable 2 and the stored ghost-object pointer, initializes gravityDelay, and divides carried horizontal velocity by the configured attribute. Aerial entry additionally clears vertical velocity and marks all jumps used. Startup animation exhaustion enters the matching dash state; startup IASA callbacks do nothing. Grounded startup decrements any nonzero delay and runs ordinary grounded friction/movement. Aerial startup skips falling while decrementing a nonzero delay, including the tick that reaches zero, and always applies air friction. The code does not establish safe saturation for arbitrary negative delay values or guarantee that division by arbitrary attribute values reduces speed.

Startup and dash collision conversions preserve phase; explicit ground-to-air transitions preserve the current animation frame. Dash conversions also clear command variable 2. Aerial collision callbacks prioritize ground contact before common cliff handling. [Startup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftFox/ftfoxspecials.c#L85-L245), [dash conversion](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftFox/ftfoxspecials.c#L369-L418).

### Dash, effects and cross-file lifetime
Both dash IASA callbacks test pressed_buttons for B, not held input, and choose the ending state using actual ground_or_air. Dash animation completion enters End before invoking the ghost-creation helper. That helper consumes command value 1 before attempting allocation; allocation failure leaves the stored pointer unassigned. Its character test is Fox versus every non-Fox kind, with the latter selecting the Falco item kind.

Dash entry initializes four position and model-X-rotation samples and schedules the accessory graphics callback. Dash and ending physics advance those histories. The accessory callback separately spawns effect 0x48D when its latch is clear, then always installs effect hitlag callbacks and clears accessory4_cb. Its precise visual appearance is not established by the numeric effect identifier.

The item consumer uses history slot 1 for its primary model and slot 3 for its secondary ghost. Command value 2 creates the secondary model only when an owner exists and no secondary model is installed. CheckGhostRemove is a side-effect-free inclusive motion-state-range predicate, not a guarantee of item survival: missing owners and the item's independent ending timer also terminate it. Destruction removes the secondary JObj and clears the item owner. No fighter-side deletion is implied merely by resetting ghostGObj. [Producer and dash control](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftFox/ftfoxspecials.c#L247-L462), [item lifecycle and consumers](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itfoxillusion.c#L93-L244).

### Ending exceptions
Ending entry replaces horizontal speed and initializes gravityDelay from x44_FOX_ILLUSION_FALL_ACCEL; aerial entry also clears vertical speed. Despite attribute naming, aerial ending physics passes x48_FOX_ILLUSION_TERMINAL_VELOCITY as the first falling-helper scalar and the common terminal_velocity as the second. Ending IASA callbacks are inert.

Ending collision does not preserve the move phase: grounded End enters ordinary Fall on lost ground, while aerial End enters LandingFallSpecial on ground contact and otherwise tries cliff handling. Grounded animation completion delegates to ft_8008A2BC. Aerial animation completion requests ftCo_80096900 with the move's mobility and landing-lag attributes. The independently read common entry normally installs FallSpecial, but its x2224_b2 branch delegates to ftCo_80090780 and returns before that transition. [Ending callbacks](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftFox/ftfoxspecials.c#L464-L607), [common entry exception](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_FallSpecial.c#L28-L59).

### Semantic assessment
Retain the existing GetGhostRotationIndexed hypothesis: canonical writers store model X rotation, and independent item consumers pass the returned values to X-rotation setters. The unchanged blendFrames field name does not overturn this evidence. Public callback names and declarations fit their implementations. Both rendered files have no reported parse errors; rendering substitutes function names only and cannot establish parameter names or compiled data layout.

The saved ledger explicitly retains 195 facts and 58 links, supersedes three facts, and leaves four facts and two links unresolved. Corrections address pressed versus held input, nonexclusive ghost lifetime control, and ending-phase collision exceptions. No compiled .sdata2 size, pooling or placement claim is adopted from source literals alone.

Status: synthesized; independent review and live promotion pending.
