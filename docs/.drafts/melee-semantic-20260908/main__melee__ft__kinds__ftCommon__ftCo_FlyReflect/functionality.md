## FlyReflect semantic review

This unit implements wall and ceiling rebounds during knockback. Both owned files were read completely in canonical and rendered form. The rendered CheckWall, Check, and Enter names fit the canonical behavior and are retained as hypotheses, not recovered original names.

### Detection
- `ftCo_800C15F4` checks negative horizontal knockback against the right-facing wall contact first, then positive horizontal knockback against the left-facing wall contact. Each branch requires a strict speed-threshold comparison and rejects the corresponding previously recorded surface. Success supplies ECB contact geometry to the shared initializer, records the wall, and returns true.
- `ftCo_800C1718` performs the analogous upward-knockback ceiling check. The inline copy has the same behavior. `ftCo_800C17CC` gives wall rebound priority and then performs its own ceiling check.
- Contact helpers call `ftKb_SpecialN_800F1F1C`; independent canonical inspection shows this requests an additional effect only for Kirby. It is not established as a contact-coordinate transformation.

### Shared response
`ftCo_800C18A8` computes the impact position from fighter position plus offset, requests an oriented effect and small camera quake, adds knockback x/y to a copy of self velocity, mirrors that vector using the supplied normal, and scales x and y by common-data x1BC. It stores the result as knockback, clears all self-velocity components, and selects facing from the sign of horizontal knockback, with zero taking the positive-facing branch. It enters the requested motion state with explicit preservation flags. FlyReflectWall receives horizontal alignment and wall-oriented collision setup; every other supplied motion ID takes the vertical-alignment branch, without validation that it is FlyReflectCeil. The routine initializes damage.x18 from x1C0 and delegates additional feedback, including an impact-audio call using planar speed times weight.

### Callbacks and lifetimes
Animation decrements damage.x18 when nonzero, then always delegates to DamageFly animation. IASA delegates unchanged to DamageFly IASA; physics delegates unchanged to ft_80084DB0.

Collision ordering is asymmetric. In FlyReflectWall, general terrain handling precedes ceiling tech and an inline ceiling rebound attempt. Only the subsequent wall-tech and further wall/ceiling rebound checks are gated by damage.x18 being zero. In the non-wall branch, general terrain handling precedes wall tech and wall rebound without that timer guard. Successful handlers stop further processing. Independent PassiveWall and PassiveCeil source confirms the tech transitions, including PassiveWallJump selection.

The surface marker is written after shared state entry, whereas the timer is initialized inside entry and consumed by animation/collision. These are distinct guards: timer expiry does not itself reset the last-surface marker. External DamageFly processing can affect the broader state lifetime; this review does not infer a complete reset lifecycle from local writes.

### Assessment
Retain 45 supported facts and all 44 links explicitly through the checkpoint ledger. Correct the initializer's inaccurate 'horizontal components' wording to x/y components and replace the animation fact's stronger positive/saturating claim with the actual nonzero guard. Add a descriptive ceiling-check name for the otherwise address-named helper. Three .sdata2 facts remain unresolved because source literals do not prove compiled section membership, storage layout, or pool data flow. No compiled artifacts were supplied.

Status: synthesized; independent review and live promotion pending.
