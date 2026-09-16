## Link Boomerang side special

The unit implements grounded and aerial startup, Empty startup, and S2 return/catch states, together with aiming, accessory processing, and fighter-side projectile bookkeeping. The header declares the public callbacks consistently with their definitions. Inherited research covers both owned files in canonical and rendered form; rendered names were treated as hypotheses, not independent evidence.

### Startup and launch

Grounded and aerial entry clear throw flags and command variable zero, install `on21EC`, and select normal or Empty startup according to `used_boomerang`. Both paths initialize animation and install `onAccessory4`. The input classifier tests horizontal-stick magnitude and timing against common dash-smash thresholds. Success sets both the Link-specific `x4` flag and `count_thrown_items`; failure clears only `x4`. The existing `ftLk_SpecialS_CheckSmashThrow` hypothesis fits this behavior. The source selects attribute `x20` or `x24` from that classification but does not establish which distance is larger.

The accessory callback has independent creation and launch branches. Creation uses the left-thumb position and stores the constructor result in both fighter item pointers, even if the result is null. Only successful creation sets `used_boomerang` and installs damage/death callbacks. Launch requires command variable zero, a tracked item, and item motion zero. Only the successful launch branch consumes command variables zero and one.

### Aim calculation

`calcAnglePos` leaves elevation zero within the vertical dead zone; otherwise it computes `atan2f(stick_y, abs(stick_x))` and clamps it using `x18 * x1C`. It writes `(facing * dist * cos(a), facing * dist * sin(a), 0)`, then separately transforms the returned heading for left facing and adds a full turn if negative. The output vector and returned heading are therefore not generally matching polar representations for nonzero left-facing aim. Both are forwarded to the item launch routine.

### State callbacks

Normal and Empty aerial startup animations exit to Fall when frames expire. Grounded startup animations invoke the common action-completion dispatcher, whose default Wait path has guarded alternatives and must not be described as an unconditional Wait transition. All ground physics callbacks delegate to common friction and ground movement; all aerial physics callbacks delegate to common gravity, terminal-velocity limiting, and air friction.

S1 collision callbacks transfer to the corresponding ground/air state with `coll_mf`. Only the normal S1 variants explicitly reinstall the accessory callback. S2 collision is different: loss of ground removes a tracked item before Fall, and landing removes a tracked item before basic landing, rather than transferring between ground and air S2.

The shared S2 animation helper consumes command-variable-one removal independently of animation completion. A null item suppresses removal but still consumes that command. Animation exhaustion alone does not directly request item removal. Grounded S2 interruption checks side, up, neutral, and down special dispatch followed by the remaining guard/jump/dash checks; the misleading `Attack100` names do not make those three special dispatchers rapid-jab checks. Transition checks execute before the tracked item pointer is tested and cleanup is requested.

### Cross-file lifetime and predicates

The returning item's proximity path enters S2 and attaches the item only when both the 1–13 predicate and `x2219_b5` getter return false. Otherwise it removes the item. The 5–13 predicate is consumed by the item motion-zero removal path, supporting the existing moderately confident `ftLk_SpecialS_ShouldRemoveBoomerang` name within that context. Individual numeric mode meanings remain unspecified; the canonical declaration does verify a four-bit unsigned field.

`RemoveBoomerang0` clears fighter bookkeeping, not the item itself. Its final existence query is read-only and returns false after the pointer clear. Reflection can call this bookkeeping routine while leaving the item alive. `RemoveBoomerang1` does nothing for a null tracked pointer; otherwise it requests item removal, clears fighter tracking, and discards the final query result. Item-side notification back to the fighter is guarded by owner identity and `xDE8 != 1`. Damage and death callbacks call the guarded fighter removal routine.

### Review outcome

Supported existing knowledge and both owned inferred names are explicitly retained through the inherited dispositions. Five factual corrections are proposed: two descriptions of the aim outputs, grounded interrupt classification, the purported existence-state refresh, and the unit-level conflation of S2 completion with removal. Independent lead review verified their canonical citation ranges and clarified interrupt-versus-collision cleanup ordering. Four `.sdata2` facts and its implementation link remain unresolved because source expressions do not establish compiled section attribution. No section placement, pool layout, entity merge, or link rewrite is proposed.

Status: synthesized; independent review and live promotion pending.
