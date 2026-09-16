## Peach shared declarations

`src/melee/ft/kinds/ftPeach/forward.h` defines compositional motion-transition flag constants and separate motion-state and submotion enums; it contains no executable functions.

- The base mask combines `Ft_MF_SkipItemVis` and `Ft_MF_FreezeState`. Float-attack masks add differing combinations of parasol, hit-status, fast-fall, graphics, and model flags. These are literal mask relationships, not proof of their consumers' runtime behavior. [Canonical declarations](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPeach/forward.h#L7-L25)
- Forward-smash and special-move masks have distinct compositions. Air neutral, up, and side special masks add `Ft_MF_SkipParasol` to their corresponding masks. The parasol-open mask is defined independently of `ftPe_MF_Base`; parasol special-fall adds `Ft_MF_Unk19`. Unknown flag meanings remain unresolved. [Mask definitions](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPeach/forward.h#L27-L59)
- `ftPeach_MotionState` extends `ftCo_MS_Count` with float, five float aerial attacks, three named forward-smash weapon variants, special-move states, and item-parasol states. Separate air-side-special end entries remain distinct. Its self-count subtracts the common-state base. [Motion-state enum](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPeach/forward.h#L61-L94)
- `ftPe_Submotion` independently extends `ftCo_SM_Count`. Its list differs from the motion-state enum: it does not separately enumerate float aerial attacks, air down special, or air side-special jump, and its forward-smash entries retain numeric suffixes. The header does not establish a one-to-one state/submotion mapping. [Submotion enum](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPeach/forward.h#L96-L122)

## Review outcome

All 125 canonical and rendered lines were reviewed. The rendered view reports zero substitutions and zero parse errors; it supplies no independent semantic evidence. Subject and link enumeration both returned empty results, so there are no baseline facts or links to disposition. No supported correction or sufficiently grounded rename was identified. The proposal is intentionally empty; no compiled layout, runtime transition, or cross-file lifetime claims are made.

Status: synthesized; independent review and live promotion pending.
