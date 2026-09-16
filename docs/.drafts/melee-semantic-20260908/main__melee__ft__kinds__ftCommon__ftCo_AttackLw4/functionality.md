# Common AttackLw4 semantic review

## Coverage and disposition

The hash-bound research establishes complete canonical/rendered coverage of both owned files, all 14 subjects, 38 baseline facts and 15 links. This distinct lead independently reconciled the proposal and functionality document against the complete owned C source and rendered view, including every proposed-fact citation and the source evidence for all five non-retain dispositions. No same-role ancestor cache was exposed by context. Retain the inherited 33 supported facts and all 15 links verbatim; accept four compiled-section deferrals and one ownership-related type correction. The six parameter subjects have no baseline facts. No additional naming change, merge or relationship edit is warranted.

## Recognition and dispatch

`ftCo_AttackLw4_CheckInput` is a state-changing boolean predicate. Its left-stick route requires newly pressed A, current left-stick Y at or below `p_ftCommonData->xD4`, and the vertical tilt timer strictly below `xD8`. The alternative helper recognizes a downward C-stick crossing. The outer alternatives short-circuit and the outer C-stick route does not itself apply C-stick permission.

Once recognition succeeds, held-item handling precedes fighter-kind dispatch. The inherited helper review supports the new-A/item predicate route and the permission-gated C-stick route; the permission helper's actual OR expression must not be replaced by its stricter comment. Successful item substitution enters `ftCo_MS_LightThrowLw4`. Otherwise Ness takes its dedicated entry and other fighter kinds take `doEnter`. Accepted paths return true; failed outer recognition returns false. There is no local ground/air guard.

Direct evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_AttackLw4.c#L22-L52.

## Entry and callback behavior

The static declaration gives `doEnter` internal linkage. It obtains the associated Fighter, clears `allow_interrupt`, requests common AttackLw4 with `Ft_MF_None` and source arguments 0, 1, 0, and invokes `ftAnim_8006EBA4`. Lookup, mutation and forwarding do not establish allocation/destruction ownership. The sole proposed fact corrects that unsupported assertion without changing the supported signature.

Animation delegates completion to `ft_8008A2BC` only when `ftAnim_IsFramesRemaining` is false. Inherited cross-file findings remain supported: the animation query examines eligible part animations, while the ending helper includes Hand-boss and other exceptional paths rather than an unconditional Wait transition.

IASA delegates to the ordered Wait input dispatcher only when `allow_interrupt` is set. A script command can set that flag, but neither an exact opening frame nor an exclusive writer is established. Downstream entry processing also prevents interpreting the initial clear as a guaranteed postcondition after all helpers return.

Physics and collision unconditionally call their shared helpers. The inherited helper review identifies ground-friction/movement processing and conditional Fall entry when the ground check fails. These wrappers have no local motion transitions.

Direct evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_AttackLw4.c#L54-L85.

## Cross-file lifetimes and rendered names

Retain the inherited distinction between common AttackLw4, Ness's yo-yo state/callback lifecycle, and item-throw command/accessory-callback initialization. Ness and item substitution do not share a single established teardown lifetime. This review is not a complete allocation, destruction or callback-teardown audit. Common, Ness and LightThrowLw4 remain separate symbolic state domains; similar names do not establish equal numeric identifiers.

The rendered C view has six foreign-helper substitutions and no parse errors. Inherited canonical helper research supports the downward-crossing, item-input, light-throw-entry, grounded-physics and conditional-Fall readings. `ftAnim_Advance` is only a coarse reading aid, not proof of a pure frame increment. No owned name needs cosmetic replacement, and rendered hypotheses do not prove themselves.

## Exceptional comparisons

Under ordinary nontrapping floating-point comparison semantics, unordered operands make source `<`, `<=` and `>` comparisons false. A NaN in an evaluated left-stick comparison or timer limit therefore rejects that left-stick route; another route may still succeed. The inherited C-stick and physics analyses carry the same ordered-comparison qualification. In particular, failure of a strict physics `>` guard does not prove that its operands are ordered and at or below the threshold. Finite-value descriptions do not establish malformed-friction behavior.

The handoff separately reports a timer `fcmpo` at `0x8008CBA8` followed by `bge` encoded `4080000C`. Conditional on that transcript, LT-clear branches to rejection on unordered comparison if execution continues; this is not equivalent to the C predicate `timer >= limit` on NaN. It also reports an explicit LT/EQ combination for the stick comparison. These are inherited transcript interpretations, not independently verified compiled evidence in this lead review: `data-corroboration.json` was unavailable in the lead inputs. FPSCR exception/trap settings, signaling-NaN behavior and runtime reachability remain unvalidated.

## Compiled-data limits

All four `.sdata2` facts remain unresolved. The handoff reports a conversion double and differing object flags that conflict with legacy padding and exclusive-entry-consumer interpretations, but the reported corroboration is not available here as independently inspected immutable compiled evidence. C literals and input definitions cannot prove section bytes, offsets, flags, permissions or assembly loads. Consequently none of the four rejected compiled writes is resubmitted. Source-level arguments and comparisons remain supported independently of those deferred compiled claims.

Status: synthesized; independent review and live promotion pending.
