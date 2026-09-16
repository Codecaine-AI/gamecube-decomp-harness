## Dr. Mario AppealS callbacks

The unit defines four `void(HSD_GObj*)` callbacks; the header declares exactly those four functions. Animation manages the appeal vitamin, while IASA, physics and collision delegate to other units. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftDrMario/ftdrmarioappeals.c#L21-L76), [header](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftDrMario/ftdrmarioappeals.h#L1-L12).

### Animation and lifetime

`ftDr_AppealS_Anim` immediately dereferences `gobj->user_data`; its later cleanup null checks do not make the whole callback null-safe. If `cmd_vars[0] == 1` and `u.mr.x2240` is null, it obtains a joint-derived position, selects a vitamin index, and invokes `itDrMarioPill_Appeal_Spawn` with the owner, position, index, vitamin kind and facing direction. It stores the result even on failure. Only a non-null result installs `ftDr_Init_80149540` in both damage/death callback slots. There is one attempt per qualifying invocation, not a one-shot guarantee across the action: the command is not consumed here, so failure can permit another attempt. A stored object suppresses duplicate spawning. Command 2 instead invokes `ftDr_Init_801497CC`; other command values cause neither command branch to run. Independently, animation completion calls the pill cleanup routine for a stored object, clears the pointer and callbacks, then invokes `ft_8008A2BC`. Creation and completion can occur in the same invocation. [Animation body](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftDrMario/ftdrmarioappeals.c#L21-L61).

The initialization unit independently confirms that `ftDr_Init_80149540` delegates to the same command-2 cleanup helper, which clears the stored pointer and both callbacks. It also exposes a detach/reset helper, an owner-validity predicate retaining numeric motion IDs `0x155` and `0x156`, a command-variable-1 accessor, and appeal entry setting command variables 0 and 1 to 1 and 0 respectively. The numeric motion IDs are not normalized into named states here. These interfaces establish a cross-file lifetime boundary, but this pass does not claim to have traced every item-side caller. [Lifecycle helpers](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftDrMario/ftdrmario.c#L198-L323).

### Delegated updates

IASA forwards the same object to `ftCo_AppealS_IASA`. The inspected common handler first checks `allow_interrupt`, then short-circuits through side special, rapid jab, `ftCo_800D6824`, `ftCo_800D68C0`, grab, three smashes, three tilts, neutral attack, `ftCo_80099794`, and `ftCo_80091A4C`. Address-named predicates remain unidentified. [Wrapper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftDrMario/ftdrmarioappeals.c#L63-L66), [common handler](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_AppealS.c#L113-L132).

Physics and collision unconditionally forward to `ft_80084F3C` and `ft_80084280`, respectively, without local calculations, guards or transitions. Rendered friction/movement and wait/landing names are hypotheses, not independent proof of callee semantics or ledge-based taunt cancellation. [Wrappers](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftDrMario/ftdrmarioappeals.c#L68-L76).

Both owned canonical and rendered files were read completely. No compiled section, binary layout or address-placement conclusions are made.

Status: synthesized; independent review and live promotion pending.
