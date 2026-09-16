## Hinoarashi / Cyndaquil

This unit defines a three-state summoned actor and a separate one-state Hinoarashi Flame table. The flame callbacks are implemented in `itmaril.c`; their physical location does not make them Marill actor behavior. The header declares the public routines and both tables; the passive state-2 animation callback is local to the C file.

### Actor lifecycle
- Initialization clears both command variables, the start/stop latches and the floating-point timer, performs common setup, and enters actor state 0.
- State 0 delegates appearance scaling and movement to shared Pokémon helpers. Its collision path supplies the state-1 entry callback to the terrain helper, which invokes it on floor contact.
- State 1 installs the accessory callback. Command 0 starts attached effect `0x473` once and attempts one child-flame spawn from dynamic bone 2 on every event. Command 1 destroys actor-owned effects and latches the stop flag. The independent branches run in that order and clear their commands. The stop latch does not guard subsequent command-0 emission attempts.
- The state-1 animation callback returns true immediately when its shared animation test fails. Otherwise, while the start latch is set and the stop latch is clear, an exactly-zero timer reloads from attribute `x8` and selects a sound from `0x2735`–`0x2737`; the timer then decrements. Bone 1 supplies animation-derived movement to the paired physics callback. Reloading depends on exact floating-point zero, not a nonpositive test.
- Damage at or above attribute `x4` invokes three item helpers, destroys actor effects, selects state 2, and samples descriptor 0 at frame 0. State index 2 and descriptor index 0 are different domains. State 2 has a constant-false animation callback, falling physics, and no collision callback. The gravity helper gates subtraction using current velocity; it does not hard-clamp the result to terminal speed.

### Flame creation and updates
The constructor preserves distinct parent-owner and parent-actor references. The supplied bone position becomes flattened `prev_pos`, whereas `pos` comes from the parent's ECB center. Creation failure is handled internally without reporting success to the accessory callback. Successful creation initializes randomized angle and speed, planar velocity, a runtime flag, state 0 and one of four effects (`0x44E`–`0x451`). The four-way range is established by the caller, not checked in the setup helper.

The cross-file flame animation callback checks lifetime and destroys its effects on expiry. Physics adds attribute-driven vertical acceleration and normalizes a copy of velocity into private storage. Collision combines terrain-query results, then computes a normalized sum of selected surface normals and adjusts stored angle `x78`. The angle helper preserves the no-contact, zero-difference and two correction-strength branches. It does not directly rewrite velocity; the inspected physics callback does not consume the corrected angle. Zero or cancelling contact normals are not locally guarded.

The reference-invalidation adapter clears matching stored object references through a shared helper. Neither actor effect cleanup nor reference invalidation proves immediate destruction of all previously emitted flame objects.

### Semantic assessment
Existing rendered function names remain useful and supported; no naming churn is proposed. Corrections distinguish randomized audio from a fixed visual effect, speed gating from hard clamping, command-driven spawn attempts from guaranteed emission, and stored-angle updates from demonstrated trajectory feedback. Source declarations do not establish compiled `.data` extent/contiguity or `.sdata2` membership. The saved ledger covers all 120 facts and 36 links: 105 retained facts, 9 superseded facts, 6 unresolved facts, 35 retained links and one rejected Marill gameplay attribution.

Status: synthesized; independent review and live promotion pending.
