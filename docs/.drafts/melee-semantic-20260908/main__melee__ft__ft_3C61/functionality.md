## Scope, identity, and review reconciliation
This data-only TU defines eleven mutable, externally linked `ftCo_803C6594_t` objects (`list0_0` through `list0_4` and `list1_0` through `list1_5`) and the mutable pointer array `ftCo_803C6594[Gr_Kind_Count]`. There are no functions, executable initialization routines, allocations, or callbacks. The C file includes local `types.h` and forward-declares the nine non-head nodes with a declaration-cleanup TODO. The guarded header includes `melee/ft/forward.h` and exposes only the array. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_3C61.c#L1-L252 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_3C61.h#L1-L9.

The librarian's initialization inventory and principal consumer interpretation were independently verified. Both complete owned files were read in canonical and rendered form; rendered pages report zero substitutions and zero parse errors. Canonical symbol names remain authoritative. “Stage-indexed CPU target-redirection rules” is a functional description, not an original-name recovery. No baseline facts or outgoing links exist. The prior open questions about consumer sites at lines 1860 and 3918 were narrowed by reading their surrounding paths; the broader lifecycle questions remain open.

## Source organization and conventions
The initialized chains are `list0_0 -> list0_1 -> list0_2 -> list0_3 -> list0_4 -> NULL` and `list1_0 -> list1_1 -> list1_2 -> list1_3 -> list1_4 -> list1_5 -> NULL`. Array index 6 points to `list1_0` and index 7 to `list0_0`; the first six entries are explicitly null and remaining declared entries are implicitly null-initialized. Active consumers use stage-kind indices, but no named-stage identity is inferred from these numeric indices. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_3C61.c#L7-L251 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_0A01.c#L1033-L1058.

The source struct consists of `Vec3 x0`, fourteen `f32` fields from `xC` through `x40`, `u8 x44`, `f32 x48`, `f32 x4C`, and a `next` pointer. These declarations establish source field order and types, not compiled padding, alignment, size, or section placement. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/types.h#L1925-L1945.

## Complete initializer inventory
The table below uses consumer-derived labels: probe = `x0`; U = `(xC,x10)` enabled by `x14 >= 0`; D = `(x18,x1C)` enabled by `x20 >= 0`; P = `(x24,x28)` enabled by `x2C >= 0`; N = `(x30,x34)` enabled by `x38 >= 0`. P and N identify positive-facing and remaining-facing branches, not proven travel directions. Every probe z is zero. Every disabled slot is `(0,0,-1)` and every enabled slot has enable scalar zero. Default `(x3C,x40)` thresholds are `(0.7853982,-0.7853982)`. Intervals apply only when `x44 != 0`; ungated nodes have `x44=x48=x4C=0`.

| Node | Probe x,y | U | D | P | N | Open x interval | Threshold exception |
|---|---|---|---|---|---|---|---|
| list0_0 | 37,-143.5 | 5.5,-111 | 5.5,-111 | disabled | 5.5,-111 | none | none |
| list0_1 | 30,-16 | -3.5,24 | -60,-86 | disabled | -3.5,24 | none | x40=-0.2617994 |
| list0_2 | -60,-86 | -131,-26.8 | disabled | disabled | disabled | (-1000,-95) | none |
| list0_3 | -60,-86 | -16,-46 | disabled | disabled | disabled | (-95,-25) | x3C=0.2617994 |
| list0_4 | -60,-86 | -60,-86 | disabled | disabled | -60,-86 | (-25,1000) | none |
| list1_0 | -130,6 | -130,6 | disabled | -130,6 | disabled | (-120,1000) | none |
| list1_1 | -130,6 | -100,34 | disabled | -100,34 | disabled | none | none |
| list1_2 | -10,6 | -10,6 | disabled | disabled | -10,6 | (-1000,-20) | none |
| list1_3 | -10,6 | -30,34 | disabled | disabled | -30,34 | none | none |
| list1_4 | -100,34 | disabled | -10,6 | disabled | disabled | (-50,0) | none |
| list1_5 | -100,34 | disabled | -130,6 | disabled | disabled | (-200,-80) | none |

All explicitly initialized floats are finite. Thresholds resemble approximate pi/4 and pi/12 magnitudes, but literal source values control comparisons. Evidence for the complete inventory: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_3C61.c#L7-L115 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_3C61.c#L117-L247.

## Active behavior and dependencies
`ftCo_800A1CC4` processes a chain only if its head is non-null, `cpu.x60 == 0`, `cpu.xC != 0`, `ground_or_air != GA_Air`, and `ftCo_800A21FC` is false. It also requires a non-null floor-island lookup from `mpIsland_8005AB54`. `ftCo_800A21FC` tests whether a probe built from target x, target y plus 5, and z zero resolves to the current floor island through `mpIsland_8005AC14(...,-10)`. Each rule similarly requires its own probe to resolve to that island; a nonzero `x44` additionally requires fighter x strictly between `x48` and `x4C`. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_0A01.c#L948-L965, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_0A01.c#L977-L1019 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_0A01.c#L1131-L1152.

The consumer computes `angle = lb_8000D008(target.y-position.y, ABS(target.x-position.x))`. Per matching node, it selects U if `angle > x3C`, D if `angle < x40`, otherwise P if `facing_dir > 0`, otherwise N. A disabled selected slot does not fall back to another slot in the same node; processing proceeds to the next node. The first enabled selected slot sets `cpu.x60=0x12C`, saves old target x/y to `cpu.x64`, replaces `cpu.x54.x/y`, sets `cpu.x38=5.0`, and returns. Neither z component is modified by that helper. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_0A01.c#L967-L1019.

`ftCo_800A1F3C` writes requested target coordinates and `x38` only while `x60==0`, then applies the current-stage entry. `ftCo_ApplyStageEntry` and `ftCo_800A75DC_set_target` supply another indexed path. None of these shown table lookups locally checks array bounds. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_0A01.c#L1033-L1058.

The additional direct consumer in `ftCo_800A3554` requires a non-air fighter, a true target-island test, and distance strictly less than `cpu.x38 + arg1`. If `x60` is nonzero, it clears that field, restores target x/y from `x64`, reapplies the stage rule chain, and returns false. This verifies a restoration path and a distance-threshold use of `x38`, but not the complete lifecycle or timer units. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_0A01.c#L1844-L1867.

`ftCo_800A8210_inline0` copies an output position's x/y into the target, sets `x38=5`, and applies the stage entry only when `x60==0`. Its enclosing caller has optional stage-dependent geometry-helper branches and a general helper branch; successful branches call this setter. This is not evidence that any branch's named stage corresponds to array index 6 or 7. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_0A01.c#L3909-L4003.

## Boundaries, lifetime, and uncertainty
All interval endpoints are excluded. In particular, -95 and -25 match neither adjacent gated list0 interval, although earlier ungated nodes can still match. The limits -1000 and 1000 are finite, not unbounded sentinels. Equality at either initialized angle threshold reaches a facing branch. Zero and negative zero satisfy enable tests. Under ordinary unordered floating comparisons, NaN fighter x fails gated intervals, NaN enable scalars fail `>=0`, NaN angle falls to facing selection, and NaN or zero facing selects N. Infinite fighter x cannot pass any initialized finite interval. These are local comparison observations, not end-to-end guarantees about angle/collision helpers or compiled exceptional-float behavior.

All objects have static storage duration and lack `const`; the initializer graph is finite and acyclic, but permanent runtime immutability is not established. No allocation, destruction, ownership transfer, or callback lifetime exists in the owned TU. The inspected rule processor traverses node pointers and copies coordinates rather than storing a node pointer in the fighter. Valid stage indices and valid fighter pointers are consumer-side preconditions, not protections provided by the data definition. Detailed collision geometry, full CPU-field lifecycles, and named-stage mappings remain unresolved. The owned `.data` identity and source address comments are not compiled evidence of section extent, object order, addresses, alignment, or layout.

Status: synthesized; independent review and live promotion pending.
