## Bob-omb lifecycle
The thirteen source dispatch rows use resource indices -1,-1,0,0,6,4,4,1,4,2,5,3,-1. States 7/8 share held callbacks with NULL collision; 9/10 share thrown callbacks. Numeric state IDs are not animation-resource indices. Spawn initializes lifecycle fields and enters state 1; the explicit constructor additionally enters armed-ground state 5 only after successful creation.

State 0 waits, checking xDD4 before decrement, and updates bone 0xB translation Y/rotation X. State 3 applies a timed facing-signed Y quarter-turn before state 2 walks. State 4 pauses and reverses facing; independent animation and timer guards can select state 2 then state 5 in the same invocation. State-2 expiry and animation refresh are likewise independent. State 1 applies falling physics and chooses ordinary landing to state 0 or the saved-velocity landing handler by xDE4.

States 5/6 initialize the final pulse/fuse only while xDE0 is clear, preserving existing xDF0 and global item lifetime on re-entry. Held and thrown callbacks continue the active fuse. Pulse scaling is additive on all root axes, with xDD8 reversed when xDD4 expires; xDF0 expiry requests detonation. The generic xD44 life timer is distinct: detonation setup calls it_8027518C, which loads common xF8; state-11 animation delegates to it_802751D8 to decrement and report expiration.

Collision callbacks save live velocity in xE0C before generic resolution. Strict per-axis greater-than comparisons read thresholds directly from attributes. Soft armed-fall landing enters state 5; the thrown/state-1 handler enters walking state 2 without setting xDE0. Shared terrain helpers perform grounding, position updates, and exceptional wall/ceiling or supported-contact handling outside this TU.

Detonation setup is unconditional once called, hides the model and sets xDDC before selecting state 11; x13 only controls its auxiliary zero-vector call. The exported explosion wrapper requires both clear x13 and xDDC, while the internal wrapper requires only clear xDDC. Damage handlers exclude exactly state 7, not both held states; shield handlers require exactly state 9, not both thrown states. Clanked tests only xDDC. Reflection and unknown-event hooks delegate unchanged. State 12 preserves bone components and delegates terrain recovery.

Canonical and rendered evidence agree on the supported semantic names, with original names remaining conjectural. The public spawn prototype has a renderer shadowed-binding omission. No compiled section-layout conclusions are drawn.

Status: synthesized; independent review and live promotion pending.
