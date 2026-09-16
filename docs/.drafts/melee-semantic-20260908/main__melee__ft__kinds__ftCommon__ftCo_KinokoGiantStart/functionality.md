## Super Mushroom application and giant startup

This TU implements fighter-side Super Mushroom application, paired grounded/airborne giant-start states, their animation and collision callbacks, and a shared finalizer. The header declares the public entry points and callbacks; fn_800D17FC has a static forward declaration in the C file. Rendered names were reviewed as hypotheses, not independent evidence.

### Application and exceptional paths

Fighter_SuperMushroomApply first checks ftCo_800D27C4. That helper rejects DamageIce and numeric x2070.x2071_b0_3 values 12 and 13; those numbers are not assigned additional semantic names here. After eligibility succeeds, an existing motion within the inclusive mushroom transformation family invokes mv.co.mushroom.x4 before flags are examined. The callback can therefore change the subsequent branch outcome. With x2220_b5 set, application resets x2008 to common parameter x688 and returns false despite this mutation. With x2220_b6 set, it dispatches to ftCo_800D2490 or ftCo_800D2600 with argument 1. Otherwise it enters grounded or airborne giant startup and returns true. [Application](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_KinokoGiantStart.c#L21-L50), [eligibility](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_0D27.c#L36-L48).

### Entry and cross-file state lifetime

ftCo_800D170C and ftCo_800D18CC capture the previous motion ID before cleanup and enter their respective states at frame 0, speed 1, with flags 0x90. Shared setup saves movement, selects an airborne continuation from the old motion, and computes an endpoint using current scale.y multiplied by x67C when scale.x > 1, otherwise x678. No concrete multiplier values are established. It initializes auxiliary animation index 0, requests sound and common feedback, and installs ftCo_800D15D0 in both the mushroom completion slot and take_dmg_cb. [Entries and setup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_KinokoGiantStart.c#L76-L138).

The shared continuation selector distinguishes FallAerial, FallSpecial/ItemParasolFallSpecial, and the default Fall path, with an exceptional Peach motion 0x172 branch whose numeric state is deliberately left unresolved. Entry cleanup also handles a non-null captured victim differently according to x221B_b5. The auxiliary joint x2184 is allocated only if absent, then reused; scale endpoints occupy walk-named move-union fields. Movement values occupy common move storage until restoration, with terrain transitions updating selected saved components. This TU does not establish the joint's destruction lifetime. [Shared helpers](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_0D27.c#L70-L205).

### Animation, terrain continuity and finalization

Both animation callbacks invoke fn_800D2A3C and finalize when it returns false. The helper advances the auxiliary joint, applies interpolated scale, and then checks flag 0x40000000 in the same invocation; completion need not wait for a later frame. Ground collision failure routes through fn_800D19BC to the air state; air collision success routes through fn_800D17FC to the grounded state. Both preserve current animation frame and speed using flags 0xC4C5080 and reinstall the damage finalizer rather than reinitializing growth. [Callbacks](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_KinokoGiantStart.c#L106-L161), [animation updater](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_0D27.c#L136-L151), [ground guard](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L1035-L1041), [air guard](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L548-L556).

ftCo_800D15D0 serves normal completion, damage interruption and current-transformation reconciliation. It restores saved movement, sets x2220_b5, initializes x2008 to x688, and adds damage above x68C capped at x690 only when damage exceeds the threshold. It applies the saved endpoint scale, calls common movement cleanup, and selects ft_8008A324 or the stored mushroom x0 continuation using current ground_or_air. Restoration before cleanup does not guarantee that outgoing velocities equal their original saved values. [Finalizer](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_KinokoGiantStart.c#L52-L74).

### Review outcome

The ledger retains 58 facts and all 20 links, marks three compiled-section claims unresolved, and supersedes one animation timing/exit claim. Inferred Enter, Finish and terrain-transition names remain hypotheses. Source literals do not establish .sdata2 placement, contents or runtime access properties.

Status: synthesized; independent review and live promotion pending.
