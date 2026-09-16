# Kirby copied-Mewtwo neutral special

The inherited librarian coverage is retained. This lead pass reconciles the small proposal with canonical behavior and the rendered reading view; rendered descriptive names are not independent evidence.

## Startup and charging

Grounded and aerial entry initialize their respective Start states, command variables, move-local counters and charge-dependent entry delay without a local stored-charge reset. Ground entry zeroes vertical velocity; aerial entry halves it.

Both Start animation callbacks **attempt** creation of `It_Kind_Kirby_MewtwoShadowBall` when `cmd_vars[3] == 1` and `u.kb.x98` is null. They store the returned handle. A null result leaves the handle null, permitting another attempt on a later eligible invocation; creation is neither guaranteed nor an unconditional one-time operation. The charging-loop helper uses the same retry-permitting guard after the entry delay expires.

At animation completion, grounded Start selects End for `specialhi.x0 == 1` or exact equality between stored charge and the configured maximum, otherwise Loop. Aerial Start writes `x0 = 0` before the animation check and analogous selector. This reset-before-test asymmetry is preserved literally, without assigning a broader full-charge or release-request meaning to `x0`.

Charging decrements `xC`, advances the secondary counter after the delay, increments stored charge when that counter strictly exceeds its configured threshold, and clamps charge while entering LoopFull. Grounded LoopFull writes `x8.i = 1`; aerial LoopFull writes `x8.i = 0`. Both restore charge to the configured maximum. Charge-audio selection uses initialization and strictly exceeded normalized thresholds. Numeric feedback identities and intended explanations for unusual flag behavior remain deferred.

## Input, release and cleanup

The current input member is `input.pressed_buttons`; historical `input.x668` offset equivalence is not asserted. Ordinary loops gate A/B End selection on `xC <= 0`. B suppresses the high-bit cancellation branch even when its timer guard blocks End selection. Full loops omit the timer guard. Grounded loops first test `ftCo_8009917C`. The cancellation mask remains `0x80000000`, without a physical shield/L/R mapping.

Cancel paths invoke item cleanup for a nonnull handle, clear the reference, destroy fighter effects and clear `xA0`, with no local charge reset. Reference-only cleanup, full charge-reset cleanup and cleanup preserving exact maximum charge remain distinct. In `ftKb_SpecialNMt_80107130`, `xA0` is written rather than read; conditional visual cleanup forwards `&fp->x488` through `ftCo_800BFFAC` to `lb_80014498`.

End callbacks service the command/non-null-gated item operation. It changes the command from 1 to 2, passes position, direction and charge to the item subsystem, applies charge-scaled horizontal velocity, resets charge, clears transient references/effects and restores `item_gobj`. The release-sound equality test follows the charge reset; its intent is not inferred.

## Completion, movement and collision

Grounded Cancel and End completion call `ft_8008A2BC`; this summary does not assert unconditional Wait. Aerial Cancel calls `ftCo_Fall_Enter`. Aerial End calls Fall when `specialn_mt_freefall_toggle` is zero, otherwise `ftCo_80096900`. The alternate helper first redirects to `ftCo_80090780` when `x2224_b2` is set. Otherwise it enters `ftCo_MS_FallSpecial` and stores the supplied landing-lag argument. The exceptional redirect must not be erased by describing the nonzero branch as unconditional special fall.

Five grounded physics callbacks forward to `ft_80084F3C`; five aerial callbacks forward to `ft_80084EEC`. Ground friction is multiplied by a data-driven factor above walking speed; the inspected arithmetic does not establish that the factor increases friction. Aerial physics delegates falling and aerial friction. Start, Cancel and End IASA bodies are empty.

Collision callbacks conditionally request the corresponding ground/air phase and reinstall callbacks, with distinct loop flags. The query executes even when the conditional body is skipped. Complete collision-query side effects and lifetime preservation are not inferred from the rendered names or enum comparisons.

## Evidence boundaries

Supported existing research and unchanged ledger rows are retained. Upstream unresolved rows are accepted as bounded evidence limitations, not findings that retained sibling research is false. Registration, physical cancellation-mask mapping, feedback identities, complete lifetime guarantees, compiled section membership/layout, register/field mappings and pinned wiki/PR provenance remain deferred. Source declarations and expressions cannot authenticate compiled layout or historical provenance. Item predicate consumers corroborate local owner-guarded continuation checks, but do not by themselves prove every global lifetime guarantee. The header establishes declarations, not executable behavior or compiled register bindings.


Status: synthesized; independent review and live promotion pending.
