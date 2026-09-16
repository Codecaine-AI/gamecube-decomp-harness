## Mew item implementation

The unit defines a three-entry `ItemStateTable` and Mew's spawn, event-adapter, state-entry and per-state callbacks. The header exposes the spawn callback, two-object event wrapper and state table.

Spawn sets facing to zero, invokes airborne initialization, then forwards special attribute `x0` to shared setup. The delegated inline selects motion 0 with animation updates, installs persistent effect pause/resume hitlag callbacks and invokes descriptor setup with `(0, 0.0F)`.

Motion 0 delegates animation upkeep and collision processing. Its physics callback conditionally performs the motion-1 entry sequence; its collision callback supplies `it_802D3B8C` as a continuation and returns the shared helper's result unchanged. These are distinct routes: the physics path duplicates the transition rather than calling the wrapper. Entry requests effect `0x46B` with `2.8F`, selects motion 1, installs effect hitlag callbacks and requests sound `0x2729` with arguments `0x7F, 0x40`. A false physics guard skips the local transition but does not establish that the guard helper has no side effects.

Motion 1 has empty physics and constant-false collision callbacks. Its animation callback invokes motion-2 setup when `it_80272C6C` returns false; either branch returns false. Motion-2 setup selects state 2, installs effect hitlag callbacks, assigns horizontal velocity to `x4` for a nonzero random result or `-x4` otherwise, and assigns vertical velocity from `x8`. Each subsequent physics invocation adds `xC` to vertical velocity without a clamp or local transition. The animation callback returns true only when position Y is strictly greater than `Stage_GetBlastZoneTopOffset()`; equality does not complete it. Actual object destruction is outside this callback. Motion-2 collision is inert.

The two-object event adapter forwards both pointers unchanged to `it_8026B894`; its local body does not identify a specific visible event or establish downstream reference lifetime semantics.

Existing local rendered names accurately distinguish the event adapter, motion-1 wrapper/core entry, motion-2 initializer and airborne wrapper. They remain hypotheses rather than recovered original identifiers. No naming rewrite is warranted. Shared rendered aliases are not independent evidence of their implementations. Existing gameplay interpretations are retained, while numeric attribute signs, exact visual subphases and compiled constant-pool layout remain distinct uncertainties. No source or KB changes are proposed.

Status: synthesized; independent review and live promotion pending.
