## Zebes Route semantic review

The unit publishes the `Gr_Kind_ZebesRoute` descriptor for `/GrNZr.dat`, three populated Ground-component callback records and a zero terminator. Existing structural lifecycle/component names fit the canonical registration and bodies; cosmetic naming inconsistencies do not justify rewrites.

### Lifecycle and shared state
Initialization caches the two-integer Yakumono parameter block before configuring components 0, 1 and 2, clears stage-info `b4`, sets `b5`, then invokes shared camera-range and dead-range initialization. The component helper indexes the callback table without a local bounds check, applies callbacks only after a non-null Ground-object lookup, reports failure and returns the lookup result. Its callers do not branch on failure.

Start unconditionally attempts shared Zako-manager creation with a NULL descriptor. A zero randomization bound bypasses RNG and takes the optional-entry setup branch; a nonzero bound is passed to `HSD_Randi`, and setup occurs only for result zero. Manager creation is not guaranteed: the constructor can free its allocated data and return NULL, which this caller ignores. The later entry routine depends on shared manager state. Negative bounds have no local validation and are not assigned a probability interpretation here.

### Components and camera effects
Components 0 and 2 initialize archived animation set 0 using their map IDs. Their process callbacks are empty. All three component predicates return false, and all callback3 handlers are empty.

Component 1 additionally clears two Ground callback pointers, registers `fn_8020B4D8` on map joint 1 with its Ground payload as userdata, and seeds `u.zebes2.xC4` from `camera_timer`. Its recurring update follows P1 only when a fighter exists, clamps Y to at least -50, forces X to zero and writes the stage-camera offset. Without a fighter it does not submit the initial local position as a fallback offset. Independently, a positive timer decrements; a timer already zero or negative causes `Camera_RequestQuake(QuakeKind_Loop, NULL)` on every invocation. Thus a decrement from one to zero does not request the quake until the next update. `lb_800115F4` is called after either timer branch. The delayed effect is a looping-quake request, not a camera-mode transition or termination of player following.

The joint callback requires `coll->x34_flags.b1234 == 1`, P1 object identity and `ground_kind == 1`, then ORs `0x10` into `stage_info.flags`. It does not locally clear the bit or modify collision/Ground data. Numeric guards are preserved without interpreting them as collision direction or proving route completion.

### Lighting and terminal hooks
The load hook delegates to configuration of existing lights from render-link slot 4. The routine asserts the GObj exists, skips the head light and visits at most three successors, stopping earlier at list end. Every visited light must supply a position. Spotlights receive the spotlight configuration; point lights are classified by their original, unscaled Y using strict comparisons against 500. Equality and unsupported types receive no configuration writes. The loop does not enforce one light of each role.

Positions, spotlight interest and reference distances are scaled by `Ground_801C0498()`. Spotlight settings include RGBA FFFFCCFF, a 45-degree cone and distance 600×scale; upper and lower point configurations use FDFDBFFF/1000×scale and 0000F7FF/400×scale respectively. These source values do not establish compiled section placement or padding.

The touch-line hook returns a null `DynamicsDesc*`; the shadow-render eligibility hook always returns true. The demo hook is empty, and stage callback4 always returns false.

### Review outcome
The saved ledger explicitly covers 149 facts and 40 links: 133 facts retained, eight unresolved and eight superseded; 39 links retained and one unresolved. Eight factual replacements below correct stale camera-mode explanations and preserve the generator-construction failure branch. No naming-only changes are proposed. Both owned canonical and rendered files were read completely. Rendered names were checked against canonical registration, bodies and shared callback types, not treated as proof of themselves.

Status: synthesized; independent review and live promotion pending.
