## Articuno actor controller

`itfreezer` implements the actor registered as **Freezer (Articuno)**, not the throwable Freezie item. The registry supplies its state table, spawn callback and reference-invalidation callback ([registry](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/it_279C.c#L217-L234)). The three state-table rows dispatch separate animation, physics and collision callbacks ([table](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itfreezer.c#L14-L21)).

### Initialization and appearance: state 0

Spawn clears facing and both command variables, enters the common airborne state, then calls attribute-`x0` setup. The delegated inline selects state 0, installs effect pause/resume hitlag callbacks and initializes descriptor 0 ([initializer](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itfreezer.c#L23-L32), [inline](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/inlines.h#L100-L108)).

State-0 animation delegates shared scale presentation and returns false. Physics calls the shared appearance update every invocation; a zero result prevents the local transition but does not imply an absence of shared physics or countdown changes. A nonzero result runs common setup, initializes the Freezer effect timer to -1, selects state 1, installs its accessory callback and sets `xDD1_flag.b1` ([local sequence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itfreezer.c#L146-L175), [shared appearance update](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/it_279C.c#L1077-L1120)).

State-0 collision delegates through a false-returning wrapper to shared terrain processing. Floor handling invokes an empty Freezer callback and restores configured model scale; it does not select state 1 ([wrapper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/it_279C.c#L1126-L1130), [terrain path](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/itgroundcoll.c#L583-L613)).

### Middle phase: state 1

Physics is empty. Animation selects state 2 when `it_80272C6C` returns zero, returning false either way. Collision delegates to shared contact handling with the same empty landing event; its floor-event dispatch has additional guards ([callbacks](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itfreezer.c#L34-L55), [guards](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/itgroundcoll.c#L459-L479)).

The accessory callback independently handles two effects. Nonzero `xDB0_itcmd_var1` gates effect `0x462` on dynamic bone 5 and is then cleared; the flag is not an effect-call argument. A nonpositive `freezer.x60` reloads from attribute `xC` and requests root-joint effect `0x461`; otherwise the timer decreases by one. Both effects can be requested on the same invocation, and both use scale 1.4. Reload returns without decrementing: a positive integer reload N produces N decrement-only invocations before the next request; a nonpositive reload requests the effect every invocation ([accessory](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itfreezer.c#L57-L73)).

### Later phase: state 2

Entry selects state 2, installs effect hitlag handlers and the recurring-only accessory callback, and clears `xDB0_itcmd_var1`. Animation completion repeats that setup before independently testing whether `pos.y` is strictly above the top blast-zone boundary. Equality does not request termination ([entry and animation](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itfreezer.c#L75-L103)).

Physics consumes nonzero `xDAC_itcmd_var0` by assigning attribute `x4` to vertical velocity, clearing the trigger and enabling `xDB0_itcmd_var1`. Its separate second branch adds attribute `x8` immediately on that invocation and on subsequent invocations while enabled. Repeated triggers reseed velocity. Acceleration is not unconditionally permanent: animation restart clears its gate. The intended upward-departure interpretation does not prove the signs of unexamined attribute values ([physics](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itfreezer.c#L105-L120)).

State-2 collision simply returns false. Its accessory callback retains the root-effect countdown behavior without the bone-effect branch. Local entry/restart code does not explicitly reset that countdown, so it should not be described as freshly initialized on every state-2 entry ([collision and accessory](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itfreezer.c#L122-L139)).

### Lifetime and semantic review

Reference invalidation forwards both objects to shared cleanup and discards its owner-match result. The callee conditionally clears matching owner/interaction references and resets source-player metadata when the fighter reference matches. The surrounding framework can subsequently remove an item using its previously captured owner and a separate flag; that removal is not performed by the Freezer wrapper itself ([lifetime path](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/it_26B1.c#L475-L525)).

Existing rendered spawn, landing, reference-cleanup, state-2-entry and air-entry names fit canonical behavior. Numeric motion names are retained rather than asserting recovered historical phase names. Two currently unnamed accessory functions have useful supported semantic names proposed below. Header and implementation were reviewed in canonical and rendered form; rendering reported no parse errors. The header spells the state-2 entry parameter `Item_GObj*`, while its definition spells it `HSD_GObj*`; this review preserves that distinction rather than inferring an ABI mismatch.

The review retains 95 facts and 35 links, supersedes two factual explanations, leaves two compiled-layout claims unresolved, and rejects three stale Freezie links. Existing Icy Wind associations are retained as actor/presentation context, not proof that these routines directly implement fighter damage or freezing. No compiled section size, placement or layout conclusion is made.

Status: synthesized; independent review and live promotion pending.
