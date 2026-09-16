## Peach Turnip item implementation

The module implements weighted turnip-face selection, nullable item creation and attachment, five item-state entries, released-item lifetime and physics, collision responses, and cross-object owner bookkeeping. The header declares the public callbacks and state table.

### Creation and persistent configuration
`it_802BD32C` sums variant weights, draws with `HSD_Randi`, and selects an index using cumulative thresholds. The constructor caches that index and its associated damage. The selector assumes valid attributes: it retains a `-1` fallback, reads entry zero regardless of length, and advances the cumulative weight using entry `i + 1` even after finding a match. The constructor does not validate the returned index before indexing damage.

`it_802BD4AC` accepts an already selected item kind; it does not choose between ordinary turnips and alternate pulls. Creation failure returns NULL without initialization or attachment. Turnips receive lifetime, face, damage, pickup history and a cached original owner before attachment. Sword skips the additional post-attachment setup. BombHei caches scale in `xDE8_scl`; Dosei and Peach Turnip use `xDE0_scl`. Other kinds have no explicit scale-cache assignment.

### State behavior
State-table indices 0–4 have motion identifiers `1, -1, 2, 2, -1`; those identifiers must not be confused with state indices. First pickup selects state 0 and performs extra setup, while subsequent pickups select state 4. Both use a constant-false animation callback and empty physics callback, so these callbacks neither consume lifetime nor end the held state.

State 1 decrements lifetime and applies attribute-based falling physics, with no collision callback. It is not established as grounded: both qualifying terrain contact and damage dealt can enter it. Throwing selects state 2, reapplies the face and explicitly configures cached damage and scale. Dropping selects state 3 and reapplies the face without those additional writes. States 2 and 3 share lifetime, falling physics and terrain collision callbacks.

Terrain collision tests `0xE` first: matching results invoke the map response and select state 1, returning false. Only otherwise does `0x3` produce true. The masks overlap, making branch precedence significant; specific surface labels are not inferred here. Damage dealt bounces and explicitly selects state 1. Clank and shield hit bounce without a local state selection. Shield bounce uses its separate shield helper. Reflection delegates to its helper but returns false independently of the helper result.

### Cross-file lifetime
The fighter-side Vegetable setup stores the created object as both held item and tracked vegetable. Its cleanup invokes the destruction wrapper only when the tracked object is still the held Peach Turnip. Generic destruction invokes the item-specific destroyed callback before clearing current ownership and unlinking the item. The turnip callback conditionally clears the cached owner's vegetable tracker. Reference removal separately clears the cached owner on pointer equality, then unconditionally invokes generic reference cleanup. Cached original ownership and current item ownership are therefore distinct lifetimes.

### Semantic review
Retained 117 supported facts and all 46 links. Two facts receive supported corrections: remove unproven compiled byte-layout claims from the state-table type explanation, and replace the misleading `Grounded_Anim` hypothesis with a conservative state-index name. Three `.sdata2` facts remain unresolved because source casts and literals do not prove compiled pool contents, offsets or references. Existing held, spawn, destroy, face-selection and reference-removal names fit canonical behavior. Existing thrown callback names remain acceptable with their recorded dropped-state sharing.

Both owned files were read completely in canonical and rendered forms. Rendering reports no parse errors, but the header suppresses the proposed spawn name as `shadowed_binding` while the C definition is substituted. This rendering discrepancy is not evidence against the constructor's semantic role.

Status: synthesized; independent review and live promotion pending.
