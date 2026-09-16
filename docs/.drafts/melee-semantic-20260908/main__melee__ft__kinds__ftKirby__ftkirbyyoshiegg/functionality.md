## Kirby copied-Egg-Lay victim state

This translation unit implements the captured opponent's `KirbyYoshiEgg` state, not specifically Kirby being captured by Yoshi. Grounded and aerial copied-Yoshi captor callbacks pass their victim first and Kirby second to `ftKb_SpecialNYs_8010AC78`; the neighboring item-production path is distinct. [Captor handoff](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKirby/ftkirbyspecialyoshi.c#L560-L658).

### Entry and representation

Entry converts an initially grounded victim to airborne bookkeeping, changes its motion state, hides its fighter model, attaches and scales an accessory, saves the captor reference and original root scale, initializes grab timing, and installs primary damage, secondary damage and accessory callbacks. The hurtbox sequence first requests mass intangibility, then initializes an **enabled, ungrabbable** replacement capsule at TransN; it does not leave that replacement intangible. [Entry](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKirby/ftkirbyyoshiegg.c#L56-L108), [capsule initialization](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L3278-L3290).

Initial velocity, facing, damage multiplier, scale factor, growth time and base duration come from the supplied captor or its attributes. Later timer, mash, release and damage-coefficient accessors use global Kirby `ext_attr`. The accessory getter ignores its argument and literally returns `hats[FTKIND_SAMUS]->hat_dynamics[0]`; this index must not be silently renamed to Yoshi. [Accessor implementations](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKirby/ftkirbyspecialyoshi.c#L35-L124).

### Scaling and damage

`fn_8010AA64` checks the remaining growth count before decrementing. Its active path computes `(1 - xC) + ((x10 - x14) / x10) * xC` after subtracting one from `x14`, then applies the factor to saved fighter and accessory scales. Progress is not clamped. A later invocation finding a nonpositive count restores effective root scale and clears `accessory4_cb`; that terminal branch does not explicitly rescale the accessory. [Scale callback](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKirby/ftkirbyyoshiegg.c#L25-L54).

`fn_8010B1D4` unconditionally delegates to `Fighter_UpdateModelScale`, which supports an X-axis override. `fn_8010B16C` subtracts temporary damage times the global attribute ratio from `grab_timer`, forces zero when `x18CC == 3` and the bury predicate accepts `x18D0`, and always writes numeric `4` to `x1828`. The numeric values are not assigned invented semantic enum names. [Damage callbacks](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKirby/ftkirbyyoshiegg.c#L185-L198), [root scale](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/fighter.c#L213-L230), [accepted bury cases](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Bury.c#L210-L219).

### Updates, terrain and release

Animation processing subtracts the elapsed-time coefficient and invokes grab-mash processing before checking expiry. Expiry plays sound `0x44618`, spawns effect `0x4CF`, sets release velocity, establishes airborne bookkeeping, requests release collision protection, and invokes the specialized Kirby Yoshi-Egg Fall endpoint. Otherwise, a nonzero mash cooldown decrements; expiry without current mash restores rate 1, while mash with nonpositive cooldown reloads the cooldown and selects the alternate rate. [Animation](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKirby/ftkirbyyoshiegg.c#L114-L146).

IASA is empty. Physics and collision distinguish exactly `GA_Ground` from every other value. Collision supplies complementary wrappers around common grounding and airborne initialization without locally replacing the confinement motion state. Grounding includes conditional airborne bookkeeping and a supporting-floor assertion; airborne initialization records one jump used and locks the ECB for 10 ticks. [Local callbacks](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKirby/ftkirbyyoshiegg.c#L151-L183), [common bookkeeping](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcommon.c#L515-L594).

The specialized release endpoint forwards to the Yoshi-Egg Fall routine. Its shared guard may redirect through `ftCo_80090780` or `ftCo_800C5D34`; ordinary Fall is therefore not guaranteed. On the ordinary branch it changes to Fall with `Ft_MF_Unk06` and initializes Fall motion variables. Accessory destruction, visibility restoration and complete callback teardown are not explicit in this TU and are not claimed here. [Release endpoint](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Fall.c#L31-L88).

Both owned files were read completely in canonical and rendered form. Rendered names are semantic hypotheses, not independent proof. No compiled artifacts were available to establish `.sdata` or `.sdata2` contents, sizes, padding or references.

Status: synthesized; independent review and live promotion pending.
