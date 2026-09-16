# Main-menu orchestration and shared presentation helpers

## Scope and naming assessment

The inherited hash-bound research establishes canonical/rendered coverage of `mnmain.c`, `mnmain.h`, all assigned subjects and baseline links. This lead independently restored targeted canonical evidence for the remaining proposal and upstream contradictions. All supported inherited retain rows remain retained verbatim; no equivalent wording changes or speculative renames are proposed. Rendered names are reading hypotheses, not recovered symbols or evidence of external callee behavior. Header shadowed bindings and the two animation-helper name collisions remain renderer limitations.

## State, input and routing

The TU maintains shared input and menu-flow state and a 34-entry configuration registry supplying animation settings, description indices, selection counts and callbacks. Controller helpers select the first confirming port and translate input under a cooldown. Internal navigation updates previous/current menu and selection, constructs presentation state and installs a non-null table callback. Scene-routing branches write `pending_mode` before calling the scene-exit helper.

Handlers prioritize confirmation, cancellation and directional navigation. Confirmation either changes menu state, invokes a dedicated screen entry point or writes a pending scene mode. Back restores a parent highlight or requests `GM_TITLE`. Records and VS wrap directly; several other menus wrap and repeat until the selection predicate accepts an entry. Data confirmation explicitly sets cooldown in its Records-transition branch rather than uniformly across all destinations. These are local routing findings, not certification of all player-visible labels, destination contents or save persistence.

`mn_80229938` delegates two conditions, rejects three specific selections and otherwise returns true. Counting and construction callers treat true as availability, despite the opposite wording of its canonical comment. Dense visible indices count accepted selections strictly before a supplied logical index. Navigation assumes an accepted entry exists; this review does not establish all caller preconditions.

## Entry and resource lifetime

`mnMain_Scene_OnEnter` initializes input and navigation from `MenuEnterData`, resets camera handles and conditionally loads archive/SIS resources under `load_assets`. Shared light, fog, camera and animated-object construction follows outside that guard, allowing previously bound resources to be reused. Specialized entry branches handle two menu kinds; the default installs the configured callback or falls back to `mn_8022DB10` and constructs the menu presentation.

Source declarations establish resource and state roles, not compiled section membership, addresses, aggregate sizes, padding or adjacency. The separate palette declarations do not resolve overlapping historical .data/.sdata inventories. The unusual inline camera stack expression is not treated as evidence of a valid compiled stack layout.

## Animated presentation and descriptions

Animated scene-layer constructors attach joint resources, render/update callbacks and, where needed, typed user data. Visual identity as a background or a screen-side panel remains dependent on resource or rendering evidence. The panel callback tracks menu changes: numeric states 0 and 1 use entry/exit intervals and settle into state 2. These states are not silently identified with the main presentation's state values.

Menu construction snapshots flow, initializes a 42-joint lookup and description reference, constructs cursor objects only for accepted selections and applies selected/unselected animation setup. Hover/unhover helpers remap frames and effect visibility; recurring cursor updates advance animation and move, shrink and hide selected effects. Preview maintenance hides its subtree for FROM transitions and otherwise chooses a menu/selection interval with two predicate-dependent fallbacks. Specific unlock persistence and fallback artwork identities remain deferred.

`fn_8022AFEC` detects a menu mismatch, starts an outgoing transition and installs `fn_8022AF10`. Its local completion block is guarded by incoming TO states and settles those states into idle; nested FROM destruction cases are guard-excluded and are not reachable local teardown evidence. The departure callback performs the outgoing endpoint removal request. FROM processing releases and clears descriptions; idle processing refreshes on selection change and exposes the description. The idle non-null assumption, special numeric state 5 and external destruction semantics remain qualified.

## Camera, fog and lighting

Fog construction loads a descriptor and registers a callback that installs the attached fog. The primary camera constructor assigns `gxlink_prios = 0x7F`, registers the camera update and installs a camera-scoped renderer. After successfully making the camera current, that renderer erases using menu fog color and calls `HSD_GObj_80390ED0(gobj, 7)`. The callee interprets 7 as render passes 0–2; it independently obtains GX links from `gxlink_prios`, initially enabling links 0–6. It does not mean GX link 7.

Both cameras use a descriptor-relative sub-stick update. It examines four ports, selects the first input outside the strict ±0.4 dead-zone test, remaps each active axis and rotates the eye vector around the interest point. The scale reaches 30 degrees at normalized axis magnitude 1, but the code contains no explicit clamp. Camera mask suppression does not remove update procedures. Gallery movie confirmation clears the two masks, and playback exit restores 0x7F/0x80. Exact movie titles remain unverified.

Menu/selection values select one of five palette pointers. Light initialization assigns RGB to the first point light. Updates animate lights, detect a changed target pointer, start a countdown and interpolate RGB, snapping when the divisor reaches zero. Alpha is not modified. Color mapping has no unsupported-input fallback, and point-light traversal assumes a matching light exists. Complete gameplay parentage is not inferred from switch grouping alone.

## Shared numeric and lifecycle helpers

`mn_IsFighterUnlocked` converts a selectable-character identifier before delegating the unlock query. `mn_8022E978` chooses OR versus AND-with-complement using the unchecked expression `1 << item_idx`. This expresses set/clear intent but does not prove one-bit preservation for every byte index: the expression is signed-int, while the related reader uses a u64 mask and `1LL`. Boundary shifts and widening require target-level validation. Item Switch commit callers iterate menu states, but their order table is accessed through an aggregate cast over separately declared objects; compiled adjacency and the effective index domain remain unverified.

The two text writers emit digit characters right-to-left and append a NUL, using either computed or supplied width. They receive u32 values but call s32 digit helpers. Full-range unsigned conversion, signed formatting, arbitrary widths and overflow-safe powers of ten are not established. Width zero writes a terminator at index zero; a negative supplied width writes the terminator before the buffer. No capacity check is present. Digit counting special-cases zero and caps iteration at eleven, which is not an overflow guarantee.

Other adapters animate an attached joint object or forward user data to `HSD_Free`. `mn_8022EBDC` delegates indices 1–8 to `mn_8022F0F0`; detailed bucket traversal and destruction guarantees belong to that helper's owning review. Likewise, the scene-frame shortcut's exact trigger and forced-return effects remain dependent on external helpers.

## Proposal reconciliation

The final proposal contains only the supported camera state-behavior correction. Original parameter additions 1–5 are omitted because source argument position does not authenticate register-labelled subject identity; the mask enable wording also required signed-shift qualification. Their useful source observations are preserved above without attaching unsupported parameter facts. Independent proposal checks are indexed against this final one-fact proposal and therefore contain exactly index 0.


Status: synthesized; independent review and live promotion pending.
