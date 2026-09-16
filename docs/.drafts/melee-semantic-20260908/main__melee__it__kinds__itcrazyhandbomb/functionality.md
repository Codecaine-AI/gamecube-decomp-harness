## Crazy Hand bomb controller

The unit implements a two-state bomb item and its public declarations. Both canonical and rendered files were reviewed completely. The rendered Spawn, Fall, numeric-state Setup/Enter, and Accessory names fit the canonical roles; no naming changes are warranted. Numeric state 1 should not be renamed to imply that every entry performs an explosion or survives for a countdown.

### Creation and initial state
`it_802F0F6C` constructs a `SpawnItem`, copying the supplied positions, kind and facing, assigning both parent fields to the owner, and initializing damage and velocity to zero. It passes the allocator result directly to initialization, debug-display configuration and final shared processing, without a local allocation-failure check. The fighter-side release callback has four independent command branches. Its offset position becomes the constructor's `prev_pos`, while the unmodified joint position becomes `pos`; these must not be swapped based on their local caller names.

`it_802F10F8` selects state 0, installs the empty accessory callback and assigns special-attribute `x0` to vertical velocity. The state changer installs callbacks from the indexed table entry and clears `on_accessory`, explaining why the local assignment follows the state change. Table indices and animation IDs both happen to be 0 and 1 here, but they are distinct concepts.

### Airborne behavior
State-0 animation returns false without work. Physics calls `it_80272860` with attributes `x4` and `x8`, then chooses an axis with `HSD_Randi(3)` and adds `MTXDegToRad(10.0f * vertical_velocity)` to that rotation component. The axis is random; the increment depends on velocity. The shared vertical-motion helper uses sign and magnitude tests rather than an unconditional hard clamp.

Collision processing runs only when `ground_or_air == GA_Air`; other values skip it. The local callback always returns false. Its shared collision helper updates position, combines contact results and invokes the supplied response when the combined low contact mask is nonzero. Consequently, the response should not be described as exclusively floor-triggered.

### Distinct terminal paths and lifetime
The impact response `it_802F1030` hides the model, runs shared maintenance, initializes the common life timer, invokes effect processing and enters state 1. State-1 animation decrements `xD44_lifeTimer` and returns true at zero or below; engine animation dispatch consumes true by destroying the item. Local state-1 physics and accessory callbacks are empty, and collision returns false.

The damage-dealt path is importantly different: it calls the state-1 entry helper directly, bypassing impact preparation, and returns true. `OnGiveDamageThink` forwards this result through `processCallback`, which sets `destroy_type = 2` and calls `Item_8026A8EC`. Numeric state selection therefore does not establish a surviving timed phase after damage. This cross-file lifetime boundary motivates the factual corrections.

Reflection delegates to a helper that negates and scales X/Y velocity, reverses facing, copies the half-life timer into the life timer and returns false. Z velocity is not changed there. The unknown-event adapter delegates reference cleanup and discards its Boolean result; matching owner and interaction references are cleared conditionally.

### Evidence limits
The state-0 accessory definition is `void(void)` and is cast when assigned; the header retains `UNK_RET`/`UNK_PARAMS`. The state-1 accessory is explicitly `void(HSD_GObj*)`. These distinctions remain preserved.

Source establishes the state table, switch and literal calculations, but does not establish compiled section sizes, jump-table lowering, constant-pool ordering or padding. Seven section-specific claims remain unresolved. The table type explanation is corrected to describe source structure without claiming a compiled byte extent.

Status: synthesized; independent review and live promotion pending.
