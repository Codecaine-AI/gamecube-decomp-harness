## Shared Fox/Falco type declarations

`src/melee/ft/kinds/ftFox/types.h` declares fighter-specific storage, motion-specific storage, and special-move data attributes; it contains no executable behavior.

- `ftFox_FighterVars` contains a blaster object pointer. Separate motion structs declare the blaster-repeat flag; side-special gravity delay, position/blend arrays and ghost object pointer; up-special delay, rotation/travel fields and unknown integers; Reflector release/turn/gravity fields; and side-appeal facing and animation-count fields. `ftFox_MotionVars` combines these five alternatives in a union. These declarations do not establish object ownership or transition-time initialization/cleanup. [Canonical declarations](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftFox/types.h#L13-L74).
- `ftFox_DatAttrs` groups Blaster, Illusion/Phantasm, Firefox/Firebird and Reflector parameters. It includes floating-point parameters, two `ItemKind` fields, integer bounce/gravity fields, and a `ReflectDesc`. Float-valued duration/delay attributes must not be conflated with the integer counters declared in motion storage. [Canonical attributes](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftFox/types.h#L76-L149).

## Semantic assessment

The rendered view matches the canonical declarations, with zero name substitutions and zero parse errors. Existing comments explicitly leave several meanings uncertain, including ghost position/blend data, model rotation and unknown attributes. Those uncertainties are preserved rather than promoted into behavioral facts. Commented offsets are source annotations, not independently verified compiled-layout evidence. With no frozen subjects, facts or links, and no supported factual correction or meaningfully better name established by this header, the proposal is empty.

Status: synthesized; independent review and live promotion pending.
