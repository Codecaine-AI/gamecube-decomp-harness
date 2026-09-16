## Warp Star item controller

The owned implementation defines six item-state rows with motion indices **0, -1, -1, 2, -1, 1**. State numbers and motion indices are distinct. Spawn clears `xDCE_flag.b7`, initializes `wstar.xDD4` and `xDD8` to 1, and unconditionally enters **state 1**, not a terrain-selected initial state.

- **State 0:** grounded loose-item behavior. Entry resets velocity and performs common setup. Animation returns false; physics calculates and applies model rotation. Collision delegates to `it_8026D62C`, selecting state 1 when support is lost. The helper also has a supported-floor branch calling `Item_8026ADC0` when `it_80277544` is nonzero and `xDCD_flag.b3` is clear; floor support alone does not prove unconditional persistence.
- **State 1:** ordinary loose-item falling behavior, also selected by drop. Animation returns false, physics forwards the generic fall-speed attributes, and collision invokes the state-0 initializer only after the common landing checks succeed.
- **States 2 and 3:** share the constant-false animation callback and have null physics/collision slots. Pickup selects state 2 with flags 2 and requests effect `0x43d` on joint 3. Descent activation selects state 3 with flags 2, reapplies the stored model and hitbox factors, and initializes attack bookkeeping with `0x0044005F` and attack identity `0x5E`. These are not sound identifiers.
- **State 4:** selected by EnteredAir. Animation returns false and physics is empty. Collision updates terrain information and selects state 1 immediately when no floor is found, or state 0 when the supported-terrain guard permits. The state-0 initializer is therefore not restricted to callers in state 1.
- **State 5:** hidden post-impact state. Entry resets velocity and the script flag, selects state 5, preserves `xD90`, `xD94`, `xD9C`, `xDA4_word`, and `xDA8_short` across release/setup, then positions and hides the root model, initializes a timer, destroys existing effects, and performs positional effect and hitbox setup. The saved fields are attack-attribution/bookkeeping data, not terrain-collision data. Animation consumes a nonzero script flag by multiplying enabled hitbox scales by `xDD8` and clearing the flag, then unconditionally ticks the lifetime. Physics is empty and collision returns false.

## Rider configuration and cross-file lifetimes

`it_80294364` builds up to seven candidate indices excluding the previous global selection, randomly selects one, stores it globally and in `wstar.xDDC`, plays its paired sound, and returns its animation joint. The canonical fighter controller applies that joint to the rider during WarpStarJump setup. There is no local guard for an empty candidate set or candidate-array overflow; safe operation requires a nonempty set fitting the local array.

`it_80294430` computes `attr->x8 * (rider_extent / attr->x4) * item_scale`, stores it in `xDD4`, applies it to the **configured attachment joint**, and stores the supplied hitbox multiplier in `xDD8`. The local variable named `speed` represents a scale here. There is no local zero-denominator check. `it_802944AC` multiplies six collision-box coordinates by `xDD4`; the fighter stores that output before WarpStarFall and uses it during descent terrain collision. The factors survive ascent and are reused during descent and impact. Attachment-joint lookup does not guarantee the root joint.

The fighter controller supplies ride movement and descent collision, invokes item descent activation on entry to WarpStarFall, and calls item impact initialization at terrain impact while transitioning the rider to JumpB. Damage/death callbacks use a separate release path. Drop selects state 1 with flags 6 and synchronously cleans item-owned effects. During impact release, the common helper can conditionally transfer `x51C` into `owner` and clear `x51C`; the local save/restore does not undo all release-side mutations.

## Semantic and rendered-name assessment

Retained names such as `SelectRiderAnim`, `GetCollisionBox`, `EnterResting`, `BeginDescent`, `Impact_Anim`, and the falling callback names fit canonical behavior. The conservative state-1 setter name remains accurate; capitalization and equivalent wording do not justify changes. The two-object event wrapper remains accurately described as unchanged forwarding to a common handler without relying on its rendered callee name.

Both owned canonical files and all rendered pages were reviewed. Rendering reports no parse errors, but the header leaves `it_80294364` unchanged with `shadowed_binding` while its definition renders as `itWStar_SelectRiderAnim`. This is a renderer discrepancy, not evidence against the semantic name.

Compiled `.sdata`/`.sdata2` membership and the collision-box fact's exact compiled size/offset claims remain unverified. Source literals and member assignments do not establish those claims. The positional helper's `0x78` argument is preserved numerically without asserting that it is an effect identifier.

Status: synthesized; independent review and live promotion pending.
