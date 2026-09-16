## Scope and interface
The owned C file implements common fighter-side AirCatch/grab-aerial control for Link, Young Link and Samus. The header declares all eleven functions with one `Fighter_GObj*` parameter; the ledge and input helpers return `bool`, while entry and callback routines return `void`. Inherited research covers all 26 subjects, 72 facts and 29 links. The lead independently read both owned files and targeted canonical contradiction evidence. Rendered names were treated as hypotheses, not independent evidence.

## Eligibility and entry
`ftCo_800C3B10` rejects an already-used tether, unsupported fighter kind, occupied accessory2/death1/accessory3 callback slots, or held item. Holding LR while newly pressing A dispatches `ftCo_800C3BE8`, marks `used_tether`, and returns true. The predicate itself does not test airborne status: grounded invocation can consume eligibility although its callee does nothing. Inherited caller research identifies AttackAir IASA invocation before item throwing and a grounded motion-state reset of availability in fighter.c.

`ftCo_800C3BE8` acts only in GA_Air, clearing the AirCatch counter and animation velocity before selecting Link-family or Samus AirCatch motion with arguments 0, 1, 0 and `Ft_MF_None`, then calling `ftCommon_8007E2F4(fp, 0x1FF)`. Unsupported airborne kinds still receive the resets and final helper call, but no motion selection. `ftCo_800C3CC0` selects Link-family AirCatchHit or, unconditionally for other kinds, the Samus hit state. It preserves fast fall, clamps horizontal velocity to the common aerial maximum, initializes hit variables to 20 and 0, and invokes ground-to-air conversion when needed. Inherited item-caller research preserves numeric motion guards 0x168 and 0x165 without silently normalizing them.

## Timed article control and exceptions
`ftCo_AirCatch_Anim` increments a move-local counter once per supported-character update. Link-family thresholds xA4/xA8/xAC/xB0 govern spawning, deployment, the next article operation and removal; Samus uses xBC/xC0/xC4/xC8. Link-family spawning uses the mapped right-thumb joint and stores `u.lk.xC`; Samus uses ThrowN and stores `u.ss.x223C`. Successful spawning installs character-specific accessory and death callbacks.

Deployment checks a horizontal obstruction segment using the attachment-joint matrix, facing and scale: Link-family code uses an 8.0 offset, Samus 2.0. Both Link-kind branches contain the same expression. Temporary vector x is replaced by the article's pos_x_0 or pos_x_1, multiplied by facing, and adjusted by pos_delta.x. Inherited callee research identifies Samus deployment as copying this vector to article-link velocity, so it must not be described unconditionally as an absolute position. Link-family deployment and the next timed operation also play character-specific sounds.

Spawn failure calls `ftCo_800968C8` without an immediate return or explicit removal. Obstruction instead removes the article, calls that helper and returns. The final article threshold removes only; it does not itself end the fighter state. Unless an obstruction branch returned, animation exhaustion is tested at the end and can invoke the exit helper, including after a spawn-failure call. Exact-equality thresholds and ordered branches must not be generalized into guaranteed events for arbitrary attribute values.

## Ledge recovery and cross-file lifetime
`ftCo_800C3A14` copies collision data, adds 5 to both ledge-snap y and height, and selects a query by facing sign. Positive facing uses the stored left ledge ID/flag; the other branch uses the right. Success zeros self_vel.x and self_vel.y, not the entire vector. Item recovery callers use this result together with a separate occupancy check to choose cliff entry or a fallback, then remove the tether. This is a later ledge-acquisition step, distinct from initial wall contact; the rendered `CheckWall` name and two wall-contact link explanations remain unresolved.

Inherited callback research establishes item-owned updates and cleanup beyond this translation unit. Independently inspected item routines process input, recovery transitions, position changes and timers and write pos_delta; that field is not exclusively animation-derived. Empty fighter IASA callbacks therefore do not imply global noninterruptibility.

## Physics and collision
AirCatch physics checks fast fall first. Otherwise it applies one-fifth gravity only while the counter is below 20 and pos_delta.y is negative, using normal terminal velocity; all other ordinary cases use full gravity. It then calls `ftCommon_8007D268`. AirCatchHit physics replaces the complete self_vel vector with pos_delta and applies ordinary gravity. AirCatchHit animation and both IASA callbacks are empty.

Collision invokes `ft_80081D0C` and enters ordinary Landing only when its result differs from GA_Ground, passing false, `Ft_MF_None`, 0.0 and 1.0. Independently inspected helper code updates collision/fighter positions and encodes a collision outcome in GroundOrAir, with an exceptional GA_Ground return; its result is not simply the current fighter situation.

## Evidence limits
Source proves initializer and literal use, but not emitted .rodata/.sdata/.sdata2 contents, ordering, alignment, sizes or relocations. No compiled artifacts were supplied, so section-attribution claims remain unresolved. Empty source bodies support no-op semantics without establishing opcode sizes or compiled layout.

Status: synthesized; independent review and live promotion pending.
