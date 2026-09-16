## HammerFall semantic review

The hash-bound research coverage and unchanged baseline dispositions are adopted verbatim. The lead independently checked all proposed fact citations against canonical HammerFall, HammerWait, DamageFall and Fall source, and confirmed the rendered entry/exit name collision.

### Entry and continuity
`ftCo_800C5CD4` checks Hammer possession before testing newly pressed A/B, invokes `ftCo_800C5D34` on success, and returns whether entry occurred. DamageFall calls the release checker before this entry checker and bypasses its ordinary aerial-action block when carrying a Hammer. Retain the existing entry-check name.

`ftCo_800C5D34` itself has no input guard. It enters `ftCo_MS_HammerFall`, obtains preservation flags and starting frame from shared Hammer helpers, conditionally converts a grounded fighter to airborne processing, and performs shared Hammer setup. The helpers preserve the current frame and selected flags only for the inclusive HammerWait–HammerLanding motion range; otherwise they return frame zero and no flags. Retain `ftCo_HammerFall_Enter`. Hammer initialization and Fall routing also reach this initializer without requiring A/B.

### Callbacks and release
Animation forwards the object once to `ftCo_800C4F64`. Its shared implementation distinguishes `x2338.x != 0` from an animation-start window. Physics delegates to `ft_80084DB0`. Collision delegates to `ft_80082C74` with `ftCo_HammerLanding_Enter` as its callback; retain the inherited conditional-landing interpretation, without claiming that failed nested collision processing cannot change state.

`ftCo_800C5DDC` requires nonzero `x2338.y`, newly pressed A, held L/R, and `x683 >= p_ftCommonData->x1C`. Success constructs a zero vector and calls, in order, `Item_8026ABD8(item_gobj, &pos, 1)`, `ftCo_Fall_Enter`, `ftCo_800C544C`, and `pl_8003FDF4(player_id, x221F_b4)`, then returns true. Failure returns false without executing this sequence. HammerFall IASA ignores the result; DamageFall consumes it.

Ordinary Fall is the normal release destination, but `ftCo_Fall_Enter` has boss, `x2224_b2`, and held-Hammer routes. Retained Fall explanations and links carry this qualification. Item handling precedes Fall dispatch; cleanup follows it.

### Names and evidence boundaries
Rename the shared exit predicate to `ftCo_Hammer_CheckReleaseInput`, distinguishing it from the entry predicate and resolving the rendered collision. Rendered helper names are not independent proof.

`x2338.y` is initialized to zero, assigned `p_ftCommonData->x6B8` by `ftCo_800C554C`, and decremented by shared maintenance outside LightGet. Its triggering event, configured duration and the interpretation of `x683` remain unresolved. Cleanup conditionally operates on numeric identifier 106; no semantic enum interpretation is added.

Source establishes unity/zero arguments and construction of the zero vector, but not compiled constant-pool size, ordering, placement or provenance. Retain unresolved dispositions for all four `.sdata2` facts and its link pending compiled evidence.

Status: synthesized; independent review and live promotion pending.
