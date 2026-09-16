## SquatRv lifecycle

This unit implements common-fighter crouch release: eligibility detection, internal state entry, animation completion, interrupt selection, physics and collision. The header declares the five public callbacks; Enter has a static forward declaration in the C file. All six functions receive Fighter_GObj pointers; only CheckInput returns a boolean.

### Entry
CheckInput reads `fp->input.lstick[0].y` and tests strict `> -p_ftCommonData->x94`. Success forwards the same object to Enter and returns true; equality or a lower value returns false without a local transition. Enter unconditionally calls `Fighter_ChangeMotionState(gobj, ftCo_MS_SquatRv, Ft_MF_None, 0.0F, 1.0F, 0.0F, NULL)`. The stand-up interpretation follows the release guard and state family; no expansion of Rv or numeric motion-state ID is asserted. [Canonical entry](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_SquatRv.c#L29-L46).

### Completion and interrupts
Anim does nothing locally while frames remain and calls `ft_8008A2BC` when they expire. That shared dispatcher has dedicated Master Hand and Crazy Hand branches. Its ordinary route checks DownSpot and another exceptional neutral route before Wait, may ground an airborne fighter, handles Peach's held parasol, and performs subsequent character/common cleanup. Thus completion is not an unconditional Wait transition. [Callback](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_SquatRv.c#L48-L53); [cross-file completion](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_08A1.c#L53-L109).

IASA forwards the same object through an ordered early-return chain: `ftCo_800D68C0`, `ftCo_Attack100_CheckInput`, AttackS4, AttackHi4, AttackLw4, AttackS3, AttackHi3, AttackLw3, Attack1, `ftCo_80091A4C`, `ftCo_800DE9D8`, Jump and Walk. The first true result prevents later checks. Independently inspected canonical bodies show that the first two dispatch SpecialLw and SpecialHi respectively, contingent on non-null character callbacks and zero-valued x687/x686 fields. The second is not rapid jab despite its canonical name. These bodies do not themselves establish the upstream lifetime or meaning of those input-state fields. [Priority chain](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_SquatRv.c#L55-L70); [special dispatch evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Attack100.c#L67-L101).

### Physics and collision
Phys delegates once to `ft_80084F3C`, which selects character ground friction, scales it only when absolute ground velocity exceeds maximum walking speed, applies ground friction, then advances grounded movement. [Physics delegate](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_084E.c#L42-L53).

Coll delegates once to `ft_80083F88`. Its query preserves the prior collision position, seeds processing from fighter position, invokes map collision, and copies the processed position back. The query returns `fall_off_ledge ? GA_Air : GA_Ground`, while the caller enters Fall on `== GA_Ground`. This exact coded condition is preserved rather than normalized into a conventional loss-of-ground description. [Position flow](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L393-L404); [Fall condition](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L1027-L1033).

The owned unit introduces no allocation, ownership transfer or persistent local storage; its callbacks operate on the supplied fighter through shared systems. Source literals do not prove compiled .sdata2 contents, extent or layout.

Status: synthesized; independent review and live promotion pending.
