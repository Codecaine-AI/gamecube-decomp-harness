# Kirby copied Marth/Roy neutral special

This unit implements the shared grounded and airborne Start → Loop → End lifecycle for Kirby's copied Marth/Roy neutral specials. The header declares the public callback/helper interface; the reset helper has a preceding static declaration in the C file. Rendered names were reviewed as hypotheses, not evidence of historical names.

## Startup and accessory setup

`ftKb_SpecialNMs_8010B2FC` and `ftKb_SpecialNMs_8010B4A0` select `da->ms` for `FTKIND_MARS` and `da->fe` otherwise. They install `fn_8010B2E8` in `x21EC`, divide retained horizontal velocity by the selected momentum-preservation attribute, enter the corresponding Start state at frame 0, initialize animation, and configure the accessory. The airborne entry clears nonpositive vertical velocity but preserves upward velocity. The reset callback clears only `cmd_vars[0]` and `specialn_ms.cur_frame`.

Accessory setup selects the Marth or Emblem hat resource, installs its first dynamics resource, applies uniform model-derived scale, and attaches it to the mapped right-thumb joint. Division is established; numerical momentum reduction requires assumptions about attribute values. [Canonical startup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKirby/ftkirbyspecialmars.c#L51-L167).

## Charging and release

Start animation completion invokes the corresponding Loop-entry helper and then requests color-animation profile 99 or 100. Loop entry uses frame 0, rate 1 and mask `0x3200`. Its discriminator is literally `u.gw.x2238_panicCharge == 0x12`; correspondence to Kirby's hat discriminator is contextual and is not certified here as a union-layout equivalence. [Start completion](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKirby/ftkirbyspecialmars.c#L169-L201), [Loop entry](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKirby/ftkirbyspecialmars.c#L389-L415).

Loop animation increments the charge counter before testing strict `>` against the selected charge-iteration limit multiplied by 30. Ground and air expressions retain their different signed/unsigned forms. Exceeding the limit writes command flag 1; absence of held B writes 0. The input test reads `input.held_buttons[0]`, not the stale baseline spelling `held_inputs`, and does not require a release edge. Both paths invoke the corresponding End-entry helper. Start and End IASA callbacks are empty. [Charge and input](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKirby/ftkirbyspecialmars.c#L285-L335).

End entry selects Ms/Fe and zero/nonzero command variants, with the alternate variant expressed as `End0 + 1`. It enters at frame 1 with mask `0x2000` and installs `fn_8010B1F4` in `accessory4_cb`. End animation refreshes damage only when `cmd_vars[0] == 0`, traversing four capsules and updating enabled ones. The expression uses integer division by 30 followed by explicit signed-integer, floating-point and unsigned conversions; an unconditional mathematical floor formula is insufficient. [End processing](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKirby/ftkirbyspecialmars.c#L417-L485), [End entry](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKirby/ftkirbyspecialmars.c#L559-L593).

## Physics and situation continuity

Start physics uses copied-move horizontal deceleration with grounded movement or basic falling. Loop and End physics delegate to common grounded friction/movement or airborne gravity/friction. The grounded delegate conditionally multiplies friction above walking speed; the airborne helper uses current fields `gravity`, `terminal_velocity`, and `aerial_friction`. [Common delegates](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_084E.c#L33-L53).

Situation-exchange helpers retain the current animation frame and use phase-specific masks: Start `0x0C4C7084`, Loop `0x0C4C7A86`, End `0x0C4C708E`. End exchanges also retain the command-selected variant and restore effect-hitlag callbacks only when the effect latch is true. These local operations do not alone prove every cross-file preservation or cleanup lifetime.

Collision predicates must remain literal: grounded callbacks transition when `ft_80082708 == GA_Ground`; airborne callbacks transition when `ft_80081D0C != GA_Ground`. The former delegate returns `GA_Air` when its locally named `fall_off_ledge` boolean is true, while the latter has an `ft_80081A00` override returning `GA_Ground`. This leaves a family-level semantic ambiguity; rendered collision names cannot resolve it. [Ground delegate](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L392-L404), [Air delegate](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L105-L123).

## Effects and completion

The deferred effect callback selects effects `0x4B4/0x4B5` for Marth and `0x4B8/0x4B9` otherwise, using the situation at invocation time. A clear `x2219_b0` permits spawning on TopN and sets the latch. Every path installs effect-hitlag callbacks and clears `accessory4_cb`, including the already-latched path. Installation does not capture a fixed ground/air effect choice. [Effect protocol](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKirby/ftkirbyspecialmars.c#L28-L49).

Animation exhaustion dispatches grounded End through `ft_8008A2BC` and airborne End through `ftCo_Fall_Enter`. Ordinary Wait/Fall outcomes are not unconditional: the common routines retain boss, `x2224_b2`, and `ftCo_800C5240` alternatives. [Ground completion](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_08A1.c#L53-L109), [Fall completion](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Fall.c#L31-L71).

No compiled artifacts were available to establish `.sdata` or `.sdata2` contents, size, padding, layout, or relocation consumers. Those seven baseline section facts remain unresolved. The ledger explicitly covers all 213 facts and 120 links without proposing new links, entities, or merges.

Status: synthesized; independent review and live promotion pending.
