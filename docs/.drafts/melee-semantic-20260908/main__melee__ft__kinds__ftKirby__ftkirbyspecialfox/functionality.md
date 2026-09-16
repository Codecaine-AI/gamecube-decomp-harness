## Scope and review
The recovery lead independently read all 763 canonical and rendered lines of `ftkirbyspecialfox.c`, enumerated all 84 frozen subjects and all 88 frozen links, and reconciled their IDs with the inherited 221-fact/88-link ledger. The final coverage check reports no missing file ranges, subject offsets or link offsets. All 41 parameter subjects have no frozen facts. Supported existing names, callback roles, move mappings and data flows are retained; rendered names are hypotheses, not independent proof. The empty proposal agrees with the functionality document and explicit deferrals.

## Copied Fox/Falco Blaster
The unit implements parallel grounded and aerial Start, Loop, and End phases. Entry selects the copied character's startup motion and held-Blaster item, clears command variables and the repeat latch, stores the created item in `u.kb.xB0`, and installs callbacks on success. Ground entry explicitly clears ground and self velocity; aerial entry does not. Creation failure reports a warning and asserts. Unsupported copy kinds are not a safe fallback: motion selectors default to Fox, but the item-ID local is left uninitialized.

Start advances to Loop at animation completion. Loop either repeats and clears the repeat latch or advances to End. Repetition installs `ftKb_SpecialNFx_OnChangeAction` and preserves the specified attack-count/model/graphics flags. The action hook calls `ft_800892A0` before `ft_80089824`; canonical evidence confirms stale attack-instance renewal, while stronger statistics/trick-record explanations are deferred.

The shot routine consumes nonzero `cmd_vars[2]` before copy-kind dispatch. It transforms the muzzle offset, flattens world Z, selects Fox/Falco projectile attributes, reflects the angle when facing is not +1, attempts projectile creation, notifies the held Blaster, and selects directional audio. Unsupported kinds consume the request without spawning. Its initial Fighter dereference means the routine is not generally null-safe despite a later guarded position calculation.

Start/Loop IASA callbacks invoke a shared command-gated B-press latch. Canonical `pressed_buttons` is derived from input edges, with an accumulation branch under `x2219_b5`; legacy continuous-held-B explanations are explicitly deferred, including explanatory wording in otherwise supported callback-type facts. End IASA callbacks are empty, which does not establish global uninterruptibility.

End services script-driven item operations and clears the fighter's Blaster reference when animation completes. Aerial End selects ordinary fall for a zero recovery attribute and the common special-fall entry otherwise. Unsupported copy kinds leave that recovery local uninitialized. Physics and collision callbacks delegate to common handlers. Aerial collision retains the contact/suppression guards and velocity-dependent landing selection. Ground collision's exact `GA_Ground` comparison leading to Fall is preserved without silently interpreting or changing its polarity.

## Item lifetimes and rendered names
The paired position helpers supply forward and near-hand points used by the item-side muzzle effect; inherited native/Kirby dispatch research supports their existing rendered names. The action classifier recognizes the six copy-specific Blaster phases and three throws, using sentinel 9 otherwise. The reference and action predicates have distinct roles and true fallback paths.

`ClearBlaster` only clears `xB0`. `RemoveBlaster` invokes item teardown, which clears ownership, destroys effects, and destroys the held item, then clears `xB0`. Item-side reciprocal clearing is guarded by owner equality. The separate action-predicate removal branch also destroys the item and effects; it must not be interpreted as merely non-destructive detachment.

## Copied Ness PK Flash tail helpers
The hold query requires a retained flash object and either copied-Ness Hold0 motion. Item callbacks consume it under ownership guards for release and steering. The simple cleanup helper clears only Kirby's reference. The stronger helper clears item ownership and association state, then Kirby's reference, without directly destroying the projectile. Unlike the native Ness counterparts, these Kirby helpers do not reset death/damage callbacks. Existing parallel names remain supported with that distinction.

## Deferred claims
No compiled section placement, size, alignment, padding, or literal-pool composition is asserted. Source diagnostic literals, sound arrays, geometry constants, and their consumers are independently visible, but their compiled-section associations remain unresolved. Short-hop technique extensions, PK Flash full-charge detonation causality, detailed attack/trick bookkeeping, ground-contact polarity, and legacy held-B wording remain explicitly deferred. Retained concept links establish associations, not endorsement of their legacy held-input rationales. No cosmetic rewrites or unsupported fact proposals are submitted.

Status: synthesized; independent review and live promotion pending.
