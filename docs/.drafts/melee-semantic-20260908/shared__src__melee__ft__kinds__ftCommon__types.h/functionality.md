## Common fighter type declarations

This header defines `ftCollisionBox` (top/bottom bounds and left/right vectors) and `ftHurtboxInit` (bone, height, grabbability, endpoint offsets and scale): code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/types.h#L16-L30.

`ftCommon_MotionVars` is a union of named records for common fighter motions and interactions, including locomotion, attacks, damage, guarding, throws, captures, ledges, items and entry/death-related states. Its alternatives declare timers, flags, animation parameters, vectors, collision boxes, object pointers and callbacks alongside many unidentified fields. These are overlapping union alternatives, not independent persistent records. The declarations alone do not establish transition behavior, numeric state meanings, initialization requirements, exceptional branches or pointer/callback lifetimes: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/types.h#L32-L442.

`SmallerHitCapsule` declares selected hit-related fields and padding, but its TODO explicitly calls it fake and leaves the real `HitCapsule` size unresolved. `TetherAttributes` declares padding followed by three floats, two named position fields: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/types.h#L444-L465.

## Semantic assessment

Both canonical and rendered pages were reviewed completely. The renderer applies no substitutions and only supports function-name replacement; it supplies no independent validation of field names. No frozen subjects, facts or links exist for this assignment, so there are no retention IDs or supported baseline corrections to emit. Existing unknown names and tentative comments remain unchanged. Source offset annotations are not treated as compiled layout evidence.

Status: synthesized; independent review and live promotion pending.
