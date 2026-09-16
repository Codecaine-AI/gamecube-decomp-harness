# Figure-pon Trophy Lottery

The translation unit implements localized scene construction, wager input, animated coin spending, timed machine operation, trophy-result presentation, controller-driven cameras, and exit preparation. The header exposes the numeric trophy predicate and the scene entry/frame callbacks. Both owned files were reviewed completely in canonical and rendered form, together with all 48 subjects, 142 facts, and 33 links.

## Presentation and input

`_tyFigupon_80314AA8` resolves three independently optional animation-resource names, attaches their descriptors, and requests frame zero without evaluating animation. `_tyFigupon_803153EC` extracts least-significant-first decimal digits and updates consecutive JObjs. Mode 1 maps nonzero digits to `50 - 5 * digit`; zero always requests frame zero. Its fifth argument is unused even where a caller passes a cast pointer. The four-slot digit buffer has no general input-width validation.

Scene entry allocates shared state, selects `TyMnFigp.dat` or `TyMnFigp.usd`, constructs cameras, localized text, panel components, lighting and a hidden new-trophy object, and initializes wager and percentage displays. Panel construction explicitly panics for a missing archive or main-panel export. Most other allocation and resource failures are not handled equivalently: coin-flight, panel-animation and trophy-drop initialization can dereference a failed allocation, whereas coin-debit initialization remains inside its successful-allocation guard.

Idle input is gated by `x5C == 0`. Exit and minimum-wager handling precede the input cooldown. Wagers are normally bounded to one through the lesser of available whole coins and 20. Confirmation saves the wager in `x5D`, installs coin-debit and panel-animation callbacks, adds the lottery update callback, and enters state 1. The existing input callback remains installed but is gated while the draw is active.

## Draw and result lifetime

Each deposited coin consumes ten raw balance units and decrements the remaining wager. Deposits occur at even post-decrement countdown values. Individual coin objects follow randomized marker-based trajectories and publish their flight lifetime through `x56`. Coin-debit completion sets `x58 = x56 + 14` and enters state 2.

States 2 through 6 coordinate machine animations, delays, audio and controller feedback. At the state-6 deadline, the pending-result flag determines whether a trophy is selected or the process skips to restoration. Selection uses the filtered owned-pool count and `x54`, plus five percentage points per wager coin after the first, with an upper substitution of 99.9%. Display calculations explicitly return zero when `x54 == 0`; the state-6 selection calculation lacks that guard. A zero denominator is not explicitly protected there.

The selected trophy is passed to `_tyFigupon_80316420`, which constructs its result model, starts the drop callback, handles the pre-award zero-count presentation, records acquisition, and refreshes result text and panel state. Acquisition storage saturates at 255. The drop callback tests the predicted height before applying the next acceleration step, snaps to Y = -7.2 on impact, performs feedback, removes its motion data, and removes its own process—not the scene process and not merely a suspension.

State 8 waits 120 updates before releasing the temporary result archive and GObj and restoring result presentation. State 9 resets the wager to one only if whole-coin credit remains, refreshes the percentage, clears timers, removes the completed draw process and returns to idle. The separate notice timer starts at 300 when the mode condition requests it; hiding occurs on the invocation entered with zero, not on the decrement from one to zero.

## Cameras and exit

The primary camera callback conditionally activates its camera, performs the configured clear, dispatches selected GX groups with mask 7, installs null fog and finalizes drawing. The canonical dispatcher confirms the ordered-group behavior independently of its rendered name.

The orbit callback selects the first controller whose C-stick pair is not strictly inside the ±0.4 square. Exact endpoints can win controller selection while mapping to zero rotation. Each invocation resets from the primary archived descriptor rather than accumulating orientation; this is also true for the callback installed on the secondary camera. Vertical angles beyond ±10 degrees switch paired trophy hierarchies, while intermediate angles preserve their visibility.

Exit preparation clears many retained handles without destroying their referents. It removes all processes from the primary camera GObj, destroys the new-trophy presentation GObj, and stops streamed audio. It does not free the entry-state allocations or act as a complete scene-resource destructor. The central normal-exit request uses state 1, allowing the current render/presentation path before the scene loop returns. Scene entry also clears the shared ED4 block after initially storing a lighting handle there; that overwrite is not a destruction operation.

## Semantic assessment

Most existing names and explanations fit and are explicitly retained in the checkpoint ledger. Supported corrections distinguish the filtered owned-pool count, identify the trophy-result drop, correct process removal versus suspension, and clarify input and cleanup ordering. The unnamed panel-animation callback has a supported role-based name proposal.

`_tyFigupon_8031638C` has a clear numeric rule, but its rendered Lottery-eligibility name remains unresolved: no canonical caller was found, and its accepted categories differ from the owned-pool counter. Category 7 tests the selected trophy's active low byte above 250, not the total collection count. No undocumented category meanings are assigned.

Compiled section sizes, contiguity, padding and placement are not established by source address comments or MUST_MATCH order hacks. Those layout facts remain unresolved. The renderer reports no parse errors; `Toy_80308250` remains unchanged because of its local MUST_MATCH declaration (`shadowed_binding`).

Status: synthesized; independent review and live promotion pending.
