## Documentation scope
`src/melee/mn/mn_2295.dox` contains eight function declarations, with brief comments for five; it contains no implementations.

- `mn_802295AC` is tentatively described as detecting analogue movement and returning the originating controller port. `mn_80229624` is documented as returning a MenuEvent input bitfield ([source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mn/mn_2295.dox#L1-L3)).
- `mn_8022EA08` is documented as writing an integer's string representation into its first argument. `mn_8022EB24` has a decimal-shift/ones-digit description whose precise arithmetic meaning cannot be established without its implementation ([source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mn/mn_2295.dox#L4-L8)).
- Three uncommented declarations expose opaque-object/type-mask, joint/vector, and three-integer interfaces. They do not establish animation stopping, animation looping, or menu-transition behavior ([source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mn/mn_2295.dox#L10-L13)).
- `mn_8022EB78` is documented as returning a number's digit count; zero and negative-input handling are unspecified ([source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mn/mn_2295.dox#L15-L16)).

## Semantic assessment
The rendered view has six substitutions and no parse errors. `Menu_GetInput` and `mn_IntToStr` agree with the documented roles. `mn_GetConfirmingControllerPort` is not established by the tentative analogue-movement comment. The rendered animation and transition names remain unverified hypotheses in this declaration-only scope. No supported factual correction or materially better name can be proposed from this file alone. The frozen assignment contains no subjects, facts, or links requiring retention or correction.

Status: synthesized; independent review and live promotion pending.
