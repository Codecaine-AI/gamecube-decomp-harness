## Scope and outcome
Inherited complete research coverage of both owned files, 37 subjects, 96 facts, and 40 links. Independently checked every proposed fact's canonical citation ranges and all upstream contradiction evidence. Adopt 85 retained facts, four supersessions, seven unresolved facts, and 40 retained links without disposition overrides. Rendered names remain hypotheses; no compiled-layout claims are adopted.

## Scale and eligibility
`ftCo_800D2770` sets scale, rebuilds fighter parameters, refreshes the camera subject, and updates collision data using current Y scale. The interpolation updater calls only the lower-level scale setter. The application predicate rejects DamageIce and modes 12/13. The end predicate unconditionally rejects DamageIce and the inclusive KinokoGiantStart–KinokoSmallEndAir interval; afterward modes 0/5 pass without `x2071_b4`, while other modes require it. The bit never overrides those motion guards. Numeric mode meanings remain unresolved. Source: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_0D27.c#L27-L68.

## Continuations and capture cleanup
`fn_800D2890` stores, rather than invokes, a continuation: Peach motion 0x172, FallSpecial, and ItemParasolFallSpecial select `ftCo_800968C8`; FallAerial selects its aerial entry; other motions select Fall. Finalizers use the callback only airborne. Capture cleanup performs outgoing cleanup and heavy-item handling before obtaining the partner. A null partner ends processing. With `x221B_b5`, the partner enters CaptureCut; otherwise the supplied fighter enters CaptureCut and the saved partner receives `ftCo_800DA698(..., false)`. Both non-null paths subsequently clean up that partner. Source: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_0D27.c#L70-L110.

## Auxiliary animation and sound
`fn_800D299C` lazily loads and reuses `x2184`, stores two scale endpoints in walk-named union fields, attaches the selected animation, requests frame zero, and evaluates it. The updater advances the helper and applies `mid + (fast-mid)*animated_scale_x` before testing AObj flag 0x40000000; even the completion tick applies scale. No local clamp or null recovery exists. Source: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_0D27.c#L112-L151.

Preserve the inherited cross-file lifetime: fighter initialization clears x2184, transitions reuse it, and Fighter removal unreferences it. Kinoko animation indices select assets rather than a universal growth/shrink enum; SmallStart and SmallEnd both use index 0, whereas GiantEnd uses 1.

Sound wrappers pass 0x7F/0x40. GiantStart and SmallEnd use `fn_800D2AD8`; SmallStart and GiantEnd use `fn_800D2B04`. Their motion-enum-spelled sound arguments do not request capture transitions. `ft_PlaySFX` maps the ID, stores the playback handle, and applies subsequent adjustment. Exact shrinking sound-test identity remains deferred. Sources: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_0D27.c#L153-L161 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_0877.c#L453-L468.

## Movement and exceptional finalization
The snapshot helper copies ten movement channels into common move storage and resets live movement. Its inverse restores without a guard. Landing updates saved ground velocity from saved self-velocity X; leaving ground clears saved ground velocity and saved animation-velocity Y, separately from live ground/air bookkeeping. Source: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_0D27.c#L163-L205.

Restoration does not guarantee resumed momentum: both startup finalizers restore, commit scale, then reset unconditionally; both ending finalizers reset only when mushroom.x8 is nonzero. Grounded continuation is separate from the stored airborne callback. Animation completion and damage callbacks reach shared finalizers. Terrain transitions preserve animation frame/rate and reinstall the damage callback without restarting the helper animation. Sources: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_KinokoGiantStart.c#L52-L161 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_KinokoSmallEnd.c#L34-L140.

## Held item and declarations
`ft_800D2D0C` short-circuits on a non-null held item of kind ScBall; it does not test whether an ItemScrew action is active. Inherited jump-consumer research establishes its ItemScrew selection role. Source: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_0D27.c#L207-L214.

The header declares fourteen helpers. Preserve the updater's Fighter_GObj*/HSD_GObj* declaration-definition spelling difference without asserting ABI incompatibility. Frozen register locators do not independently prove argument allocation. Compiled section membership, pooling, byte sizes, and padding remain unresolved.

Status: synthesized; independent review and live promotion pending.
