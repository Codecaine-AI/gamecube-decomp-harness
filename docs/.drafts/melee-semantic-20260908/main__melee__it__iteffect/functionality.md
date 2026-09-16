## Common resource setup
`it_8027870C` selects between two archive filename globals using `lbLang_IsSettingUS`, loads the same requested root symbol, and publishes its six fields into item-system globals. Its `s32` argument is unused. Item-side wrappers pass either an item-enabled predicate or false; neither value suppresses loading. Match and visual-scene initialization call these wrappers immediately before shared item initialization, which consumes the published resource data.

## Default effect request
`it_802787B4` unconditionally delegates to `it_80278800` with the supplied item and effect ID, bone selector 0, two zero vectors, mode 1, and trailing scalar 0. The rendered name `itEffect_SpawnSync` overstates the guarantee: mode 1 is a request honored only by families supporting both forms. `itEffect_SpawnDefault` better describes the wrapper's invariant behavior.

## Effect dispatch
`it_80278800` selects effect-specific argument forms. Early switch cases can use a joint alone, the original input vector, unit or zero scalar arguments, facing, or the fixed value `0xF25959`. These early cases return before randomized-placement processing.

The fallback copies the base vector and adds three independently sampled displacements, each computed as `2 * spread_axis * (random_sample - 0.5)`. It then transforms the resulting local point through the selected item joint. Position-based synchronous forms receive the transformed point; asynchronous forms receive the joint and local offset, together with the address of `Item.xBC0`. Unsupported fallback IDs can therefore consume random samples and perform joint/point processing before returning without spawning. The signed `ef_id < 0x250` test has no explicit nonnegative lower bound.

Where a family supports both forms, exactly `arg5 == 1` selects synchronous spawning; all other values select asynchronous spawning. Exceptions are material: `0x417–0x41A`, `0x44E–0x452`, and `0x457–0x45A` always use synchronous calls. `0x423–0x424`, `0x3F7–0x3F9`, `0x3FD`, `0x3FF`, and `0x513–0x515` always use asynchronous calls. The last three IDs use category 8 and remap their submitted IDs to 2, 3, and 4. Other asynchronous categories are 0, 2, 3, 5, 6, and 7; these categories are distinct from the caller's mode selector. Selected paths pass facing directly, a zero scalar, or an angle of pi for negative facing and zero otherwise. The trailing `f32` parameter is unused.

The initial switch takes precedence over overlapping tests in the later comparison tree. The source comment about matching does not justify discarding these cases. The animation-list decoder supplies joint, effect, offset, spread, mode 0, and the extra scalar. Local vectors and scalars are passed by address into effect APIs; this unit alone does not establish downstream copying, retention, or cleanup lifetimes.

## Review outcome
The loader and general dispatcher names fit canonical behavior. Supported baseline knowledge and all four links are explicitly retained in the inherited research ledger. Four facts receive targeted corrections concerning default-wrapper naming and mode guarantees. Six section-related facts remain unresolved: source switches and numeric literals do not prove compiled jump-table or constant-pool layout. Inherited research establishes complete canonical and rendered coverage of both owned files. Independent lead review verified every proposed fact's canonical citations, all indicated contradiction evidence, and the animation decoder call; no overrides were necessary.

Status: synthesized; independent review and live promotion pending.
