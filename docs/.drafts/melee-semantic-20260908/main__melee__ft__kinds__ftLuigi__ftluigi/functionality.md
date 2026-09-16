## Luigi initialization and integration

This translation unit supplies Luigi's motion dispatch, resource metadata, and fighter lifecycle adapters; it does not implement the special-move callback bodies.

### Dispatch and resources

The primary table contains 18 records, annotated as motion states 341–358, covering grounded/aerial neutral, side, up, and down specials. Each supplies animation, IASA, physics, collision, and camera callbacks. Side-special startup, hold, S2, end, normal, and misfire records remain distinct. In particular, the aerial S2 record uses `ftLg_SM_SpecialS2` with aerial flags and callbacks: motion-state annotations must not be conflated with submotion IDs. Two auxiliary records use RunBrake and Kneebend submotions with only physics callbacks populated. Their downstream purpose is not established by the rendered name proposed for `ftCo_800C7200`. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftLuigi/ftluigi.c#L22-L244)

Resource declarations include base fighter data, animation data, four costume resource triples, general demo strings, and two additional demo-motion labels. The four-element costume storage declaration is visible, but source declarations and address comments do not establish compiled section boundaries or layout. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftLuigi/ftluigi.c#L246-L279)

### Loading and death

`OnLoad` obtains the Fighter and its item-resource array, applies `PUSH_ATTRS`, then passes item resource 0 and `It_Kind_Luigi_Fire` to `it_8026B3F8`. The canonical macro copies external Luigi attributes into existing fighter backup storage and makes that storage active; it does not allocate it. `LoadSpecialAttrs` subsequently copies external attributes into the existing active destination. Thus the active-storage setup and later refresh have distinct roles. [Callbacks](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftLuigi/ftluigi.c#L288-L321) [Macros](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/inlines.h#L21-L40)

`OnDeath` calls `ftParts_80074A4C(gobj, 0, false)` and unconditionally clears `fp->u.lg.x2234`. This establishes neither a move-specific meaning nor global non-use of that field. The rendered parts-helper name is not independent proof of its downstream effects. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftLuigi/ftluigi.c#L281-L286)

### Item and knockback adapters

Pickup/drop forward their object and event boolean with both additional options enabled. In the shared pickup implementation, heavy items skip processing; hold kinds 1, 2, 3, and 4 select numeric animation-helper values 1, 0, 2, and 3 respectively. Other hold kinds skip that selection, but the event boolean can still enable the subsequent helper call for non-heavy items. Drop always invokes the selection helper with -1 and conditionally invokes the invisible-side helper. Visible/invisible handling excludes heavy held items and calls the respective animation helper. These are shared-handler branches, not local Luigi guards. [Wrappers](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftLuigi/ftluigi.c#L298-L316) [Shared implementations](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/inlines.h#L142-L193)

Knockback entry/exit forward selector 1. Shared handling calls `ftAnim_800704F0` for selectors 1 and 0 with 3.0f on entry and 0.0f on exit. These adapters do not calculate launch magnitude or trajectory. [Wrappers](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftLuigi/ftluigi.c#L323-L331) [Shared implementations](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/inlines.h#L195-L205)

### Demo-selector contracts

`UnkDemoCallbacks0` maps selector 9 to 14/14 and selector 10 to 15/15, writing through the third parameter before the second. All other selectors leave both destinations unchanged. The companion string lookup returns `ftDemoVi0102MotionFileLuigi` for 9 and `ftDemoVi1101MotionFileLuigi` for 10. Unlike the output callback, its unsupported-selector path uses an uninitialized offset and has undefined behavior. No specific on-screen pose is established for either selector. [Resources](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftLuigi/ftluigi.c#L262-L272) [Callbacks](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftLuigi/ftluigi.c#L333-L360)

The header agrees with the callback signatures and exported declarations. All owned canonical and rendered pages, all 30 subjects, all 60 facts, and all 25 links were reviewed. The saved ledger retains 58 facts and 25 links, with two facts unresolved.

Status: synthesized; independent review and live promotion pending.
