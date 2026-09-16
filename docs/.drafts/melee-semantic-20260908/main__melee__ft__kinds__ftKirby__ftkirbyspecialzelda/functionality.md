## Kirby copied-Zelda neutral special

This unit implements paired grounded and airborne copied-Zelda SpecialN states, conventionally mapped to copied Nayru's Love. It contains two entry routines, two deferred effect callbacks, paired animation/IASA/physics/collision callbacks, and two terrain-transition helpers. The header declares the two entries and eight ordinary state callbacks. Canonical and rendered views were read completely; proposed names were evaluated against canonical bodies rather than treated as evidence.

### Entry and effects

`ftKb_SpecialNZd_80105B2C` enters `ftKb_MS_ZdSpecialN`; `ftKb_SpecialNZd_80105BA8` enters `ftKb_MS_ZdSpecialAirN`. Both pass motion arguments `0.0f, 1.0f, 0.0f`, call `ftAnim_8006EBA4`, clear command slot 0, initialize `mv.zd.specialn.x0` from `specialn_zd_frames_before_gravity`, and schedule their respective accessory callback. Aerial entry additionally zeros vertical self-velocity and divides horizontal self-velocity by `specialn_zd_horizontal_momentum_preservation`. This is unchecked division: attenuation and a nonzero divisor are not established by the source alone. [Entry evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKirby/ftkirbyspecialzelda.c#L31-L94)

`fn_80105A34` and `fn_80105AB0` conditionally spawn effects `0x4B6` and `0x4B7`, respectively, attached to fighter part 1's joint. A clear `x2219_b0` permits spawning and is then set true. Regardless of that guard, both install effect-hitlag callbacks and clear `accessory4_cb`. They therefore retire once per installation even when spawning is skipped. Their effect lifetime is not the same as their callback lifetime: these bodies do not destroy effects or reset the latch. The specific visual appearance of `0x4B7` remains unverified. [Effect evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKirby/ftkirbyspecialzelda.c#L42-L65)

### Animation and reflection

Both animation callbacks consume command-slot value 1 by writing 2 before calling `ftColl_CreateReflectHit` with `specialn_zd_reflectdesc` and `fn_80105FEC`. Value 0 clears `reflecting`; other values receive no additional interpretation here. Completion is tested independently after this processing: grounded completion calls `ft_8008A2BC`, while airborne completion calls `ftCo_Fall_Enter`. The grounded destination should not be inferred solely from this local call. [Animation evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKirby/ftkirbyspecialzelda.c#L96-L145)

The registered reflector response callback is defined in the neighboring Sheik-copy source and has an empty body; it adds no local response behavior. Its cross-file location does not change the Zelda ownership of these reflector-creation sites. [Response callback](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKirby/ftkirbyspecialseak.c#L33-L33)

Both IASA callbacks are empty. This proves absence of move-specific processing in those callbacks, not global immunity to interruption. [IASA evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKirby/ftkirbyspecialzelda.c#L147-L149)

### Physics

Ground physics calls `ft_80084F3C` and then `ftColl_8007AEF8`. The first helper applies ground friction and ground movement, multiplying friction by `friction_when_above_walk_speed` only when absolute ground velocity exceeds maximum walking velocity. [Wrapper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKirby/ftkirbyspecialzelda.c#L151-L155) [Delegated implementation](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_084E.c#L42-L53)

Air physics decrements the signed delay counter whenever it is nonzero. Only a counter already equal to zero selects `ftCommon_Fall` with the copied move's acceleration and common terminal velocity. Thus a tick changing 1 to 0 still skips that falling call; negative values also take the decrement branch, with no local saturation or convergence guarantee. `ftCommon_8007CF58` and `ftColl_8007AEF8` execute in either branch. The counter is initialized by either entry and is not explicitly reinitialized by terrain-transition helpers. [Air physics](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKirby/ftkirbyspecialzelda.c#L157-L178)

### Terrain continuation

Preserve the comparisons exactly: grounded collision dispatches `ftKb_SpecialNSk_80105E8C` when `ft_80082708(gobj) == GA_Ground`; airborne collision dispatches `ftKb_SpecialNSk_80105F3C` when `ft_80081D0C(gobj) != GA_Ground`. Enum spelling must not be substituted for the helpers' result semantics. The inspected airborne query synchronizes collision/fighter positions and can return `GA_Ground` through an early suppression branch. [Dispatch](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKirby/ftkirbyspecialzelda.c#L180-L192) [Air query](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L105-L123)

Despite their canonical `SpecialNSk` prefixes, the two helpers explicitly target Zelda-copy air and ground states. They pass `ftZd_MF_SpecialN_Coll` through common conversion helpers, which reuse the current animation frame. After conversion, each reacquires the Fighter and attributes, restores effect-hitlag callbacks only when the effect latch is true, and recreates reflection only when command slot 0 equals 2. These independent guards preserve active subsystems without running fresh-entry velocity, timer, or accessory initialization. [Transition bodies](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKirby/ftkirbyspecialzelda.c#L194-L230) [Common conversions](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/inlines.h#L71-L89)

### Review outcome

The checkpoint ledger explicitly covers 84 baseline facts: 76 retained and 8 unresolved. All 65 baseline links are explicitly retained, including distinct historical records describing the same relationship; none are merged. The six local inferred function names remain defensible hypotheses from canonical scheduling and destination behavior. No compiled evidence was supplied, so the three `.sdata2` facts remain unresolved rather than inferring section size, contents, or provenance from floating-point literals.

Status: synthesized; independent review and live promotion pending.
