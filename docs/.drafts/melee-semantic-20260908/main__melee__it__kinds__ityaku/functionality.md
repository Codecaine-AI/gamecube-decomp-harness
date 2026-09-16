## Yaku stage-object item proxy

The module defines custom mutable item attributes, twenty state-table entries (0–19) sharing one physics callback, a nullable Ground-facing constructor, and damage/touch/reference-removal adapters. The header declares the public constructor, event handlers and state table.

Construction prefers a supplied joint over an explicit position and returns NULL if neither exists. It initializes zero facing and velocity and null generic parent pointers, installs its custom attributes into the selected item descriptor before allocation, and therefore does not roll that descriptor write back on allocation failure. Successful allocation retains the Ground context and three callbacks, sets unit model scale, enters the caller-selected state with ITEM_ANIM_UPDATE, registers touch handling and writes collision flags. The private arg1 selector, arg2 item state and placement mode are distinct domains.

Placement mode 1 updates Item.pos from the retained joint's world origin and copies scale and rotation directly from that joint to the item model; this is not a demonstrated world-SRT decomposition. Mode 2 performs no writes in this physics callback, rather than enforcing immobility against external updates. Other modes report a diagnostic with literal line argument 215 and loop forever. The shared callback is not specific to state 19 despite its provisional symbol.

Damage-dealt and touched handlers forward to retained callbacks only when both callback and Ground context exist. Toucher is forwarded without a separate null guard. Damage-received always clears xC9C and computes a local knockback-derived vector before checking callback availability; the helper also changes facing_dir. All three handlers return false. Reference removal delegates to shared common-item cleanup, which independently clears all matching interaction references and resets the source-player slot to 6 on a primary-fighter match; it does not clear the private Yaku Ground or joint references.

The retained joint and Ground pointers are used after construction, whereas explicit position is copied. Their external lifetimes are not managed here. The damage callback receives a stack-local vector and must copy it if needed beyond the call.

Existing inferred constructor, damage-dealt and touched names fit canonical behavior and are retained as hypotheses, not recovered symbols. Rendering has no parse errors; the header constructor remains canonical because its binding is reported shadowed. Source supports the constants and their consumers but cannot establish compiled section extents or literal pooling.

Status: synthesized; independent review and live promotion pending.
