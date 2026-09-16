## Young Link AppealS callback suite

The owned C file defines four `void(HSD_GObj*)` callbacks; the header declares exactly those four functions. Both AppealSR and AppealSL motion-table entries use this suite. These are the milk-taunt callbacks; the `S` naming does not establish a separate player-selectable side taunt. Registration evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCLink/ftclink.c#L46-L67. Header evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCLink/ftclinkappeals.h#L1-L12.

### Animation and prop lifetime

`ftCl_AppealS_Anim` aliases the same fighter through `fp0` and `fp1`. When `cmd_vars[1] == 1` and `u.lk.x18` is null, it calls `it_802C8B28` with the fighter object, current position, left-thumb bone index and facing direction, then stores the returned object. Only a non-null result installs `ftLk_800EAF58` in both `death2_cb` and `take_dmg_cb`. Failed creation leaves the tracked pointer null and does not modify those callbacks, so another invocation can retry while command 1 persists. An existing tracked object suppresses creation. Command 2 invokes `ftCl_Init_80149268`; other command values do neither operation. This callback does not clear the command variable.

Independently of the command branch, animation exhaustion invokes `checkFighter2244` and then `ft_8008A2BC`. Consequently, creation and completion cleanup can occur during the same invocation. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCLink/ftclinkappeals.c#L20-L46.

The command-2 helper also calls `checkFighter2244`. That inline helper guards null object/user data and a missing tracked item, calls `it_802C8C34` on a present item, and clears `u.lk.x18`. It does not explicitly clear the fighter callback slots. A separate helper, `ftCl_Init_801492C4`, clears the tracked pointer without calling the item cleanup routine. The neighboring validity helper checks literal motion IDs 342/343 and item presence; the command accessor returns `cmd_vars[1]` through a bool return type, which must not be confused with the animation callback's exact comparisons against 1 and 2. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCLink/inlines.h#L13-L30 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCLink/ftclink.c#L433-L492.

### Shared action phases

IASA forwards the unchanged object to `ftCo_AppealS_IASA`; physics forwards it to `ft_80084F3C`; collision forwards it to `ft_80084280`. None of these wrappers introduces local guards or transitions. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCLink/ftclinkappeals.c#L48-L61.

The canonical physics callee applies ground friction, multiplying it by the common high-speed factor only when absolute ground velocity strictly exceeds maximum walk velocity, then applies ground movement. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_084E.c#L42-L53.

The canonical collision callee selects an alternate test when horizontal player-nudge velocity opposes facing; otherwise it updates collision inputs and runs its inline collision test. It returns on collision success, then gives `ftCo_8009A3C8` an opportunity to handle the situation, and enters Fall only if neither succeeds. Thus unconditional wrapper delegation does not mean unconditional falling. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L1062-L1099.

### Evidence boundaries

Both owned canonical and rendered files were read completely. The renderer reported no parse errors; rendered callee names were treated as hypotheses, not proof. Canonical helper bodies independently support cleanup, friction and collision semantics. No compiled layout, section placement or register-allocation conclusions are made from declarations, address comments, padding arrays or parameter identity labels.

Status: synthesized; independent review and live promotion pending.
