## Birdo Egg lifecycle

This unit implements `It_Kind_Kyasarin_Egg`, registered as Birdo's Egg. Its five-entry state table distinguishes motion-state indices from animation IDs:

| Motion state | Animation ID | Behavior |
|---|---:|---|
| 0 | 0 | Initial horizontal launch; qualifying terrain contact enters rebound state 1. |
| 1 | -1 | Falling physics and aggregate terrain-contact callback. |
| 2 | -1 | Held state with no local animation, physics, or collision callbacks. |
| 3 | 1 | Shared dropped/thrown state, with falling physics and floor-impact resolution. |
| 4 | 2 | Guarded terminal aftermath; only the animation callback is installed. |

The constructor requires a non-null Catherine argument and successful allocation. Catherine is used as a guard, not stored as the egg's owner. The caller computes a facing-relative emission position. Construction initializes facing and runtime fields, clears `kyasarinEgg.x20`, conditionally invokes `it_802756E0`, and starts state 0 with velocity `(attribute.x4 * facing_dir, 0, 0)`. Collision facing becomes -1 only when the supplied floating-point direction equals exactly -1.0f; every other value produces collision facing +1.

State-0 collision tests the aggregate result against `0xF`. Its rebound helper selects state 1, negates horizontal velocity, and assigns vertical velocity from attribute `x8`; the callback always returns false. State 1 directly returns the common terrain-contact result. Pickup selects state 2, while dropping delegates to throwing and selects state 3 with flags 6.

Damage dealt, clank, shield hit, reflection, and the damage-received callback share one resolver. A nonzero `x20` suppresses further resolution. Otherwise, every motion state other than 3 takes the rebound path and returns false. State 3 emits effect `0x4D0` and plays sound `0xF4` with pan `0x7F` and volume `0x40`. It then tests `HSD_Randi(attribute.x10)`: zero invokes terminal setup and returns false; nonzero calls `it_8026F3D4(gobj, 0, attribute.xC, 0)` and returns true. This is an item-release request, not proof that an item was successfully created. No fixed probability or positive attribute range is established here. Shield bounce is separate: it calls `itColl_BounceOffShield` only in state 3 and always returns false.

Terminal setup performs common maintenance, initializes the shared lifetime, zeros x/y velocity but not z, sets `x20`, and selects state 4. Its animation callback invokes the helper that decrements `xD44_lifeTimer` and tests for a nonpositive result, but the callback itself has no explicit return. The common animation dispatcher consumes a boolean result to destroy an item, so successful propagation of expiration must not be asserted from this source or from rendered names.

The two-object cleanup callback delegates to `it_8026B894` and discards its owner-match result. That helper clears matching owner, reflector, absorber, fighter, unknown-fighter, and toucher references; clearing the fighter reference also resets source-player metadata to 6.

## Semantic assessment

Most existing lifecycle names and explanations remain useful and are explicitly retained in the checkpoint ledger. The supported corrections are the clank explanation's sound-versus-color error, the terminal setup explanation's unsupported completion claim, and a less speculative terminal-animation name. Both rendered owned files parsed successfully and preserved canonical line correspondence. Rendered helper names were treated as hypotheses, not evidence. Source declarations establish the five-entry C table, but do not establish compiled section sizes or constant-pool layout.

Status: synthesized; independent review and live promotion pending.
