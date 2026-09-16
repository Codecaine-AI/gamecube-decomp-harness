## HeavyWait1 and HeavyLanding

The source defines five `void(HSD_GObj*)` routines; the header declares all five. Both canonical and rendered owned files were read completely. Rendered substitutions are hypotheses, not independent evidence.

- **IASA:** `ftCo_80094EA4` has priority. Only a false result invokes `ftCo_KneeBend_Check_ShortHop`. Canonical helper code confirms directional HeavyThrow selection, including C-stick selection without an A/B press, and false returns for no held item or unchanged motion. The fallback conditionally latches an existing jump preparation as a short hop; it does not initiate a jump.
- **Physics:** delegates unchanged to `ft_80084F3C`. That helper applies ground friction, scaling it when absolute ground velocity exceeds walk maximum, then applies ground movement.
- **Collision:** delegates unchanged to `ftDk_HeavyWait0_Coll`, whose implementation calls `ft_8008403C` with `ftDk_MS_345_800E0294`. This unit adds no collision guard.
- **Landing entry:** `ftDk_MS_346_800E05E4` copies `cargo_hold.x28_LANDING_LAG` into `mv.dk.unk8.x4`, reacquires the special attributes, and calls common landing entry with `motion_state + 8`, true, no motion flags, frame zero and speed one. It then requests animation rate zero. The inferred name `ftDk_HeavyLanding_Enter` is supported by this behavior and its paired callback, not by the rendered substitution. The expression base + 8 is established; a fixed numeric state is not established by the legacy symbol name.
- **Recovery:** `ftDk_HeavyLanding_Anim` tests the timer before decrementing. A nonpositive value calls `ftDk_MS_341_800DF980`, which grounds an airborne fighter if needed and enters the attribute-base motion. The decrement still executes after that call. A positive integral timer reaches zero on one update and triggers recovery on the next, assuming uninterrupted execution. The post-transition write must not be described as occurring before recovery or as necessarily decrementing an untouched old-state value.

Common landing entry performs the motion transition and stores the interrupt-policy argument; this does not alone establish which interrupt callbacks run for the derived motion. Animation rate zero is applied to the animation objects and frame-speed field normally, but is only cached in `x8A0_unk` when `x2223_b0` is set. Therefore an unconditional immediate-freeze claim needs that qualification.

Source literals establish argument values, not compiled `.sdata2` size, ordering, representation, or ownership. No compiled artifact was supplied. Historical link records remain unchanged; current canonical evidence supports the retained conceptual associations.

Status: synthesized; independent review and live promotion pending.
