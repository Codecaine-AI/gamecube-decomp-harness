## Multi-Man Melee selection screen

`mnhyaku.c` implements selection of 10-Man, 100-Man, 3-Minute, 15-Minute, Endless, and Cruel, in cursor order. It does not implement gameplay rules.

### Entry and construction
`mnHyaku_8024CD64` sets cooldown to 5, records the previous menu, sets current menu to 33 (0x21), and clears hovered selection independently of the supplied cursor. It performs audio setup, loads four `MenMainConKm_Top` resources from the retained archive, constructs the visual selector, and registers a separate input GObj. [Entry](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mn/mnhyaku.c#L202-L228).

`mnHyaku_8024CB94` publishes the visual GObj globally, attaches its model and animations, allocates Menu user data with HSD_Free cleanup, applies the incoming cursor, installs the entrance process, and creates centered text. Cursor indexing is unchecked; valid selection requires 0–5. [Construction](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mn/mnhyaku.c#L166-L200).

### Input and presentation
`mnHyaku_8024C68C` ignores its argument and retrieves the visual Menu through the global pointer. Nonzero cooldown prevents polling, decrements the timer, and clears two shared fields. Priority is Back, Confirm, Left, Right. Back clears entering_menu and requests `(9, 2, 3)`; Confirm performs bookkeeping and dispatches the selected mode. An invalid confirmed cursor has no switch case and does not fall through to navigation. Navigation wraps valid selections between 0 and 5 and updates animation and text. [Input](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mn/mnhyaku.c#L53-L118), [shared helpers](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mn/inlines.h#L31-L41).

Presentation temporarily evaluates cursor-indexed frames 0–5, restores the saved frame, invokes the material-animation helper with 0xFF, and evaluates again. Text lookup uses IDs 0xAB–0xB0; the trailing zero bytes have no demonstrated sentinel role. [Presentation](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mn/mnhyaku.c#L21-L51).

### Visual lifecycle
`mnHyaku_8024CAC8` handles entrance. Departure from menu 0x21 takes precedence: it replaces the process with the exit callback and releases text. Otherwise entrance evaluation switches to `mnHyaku_8024CA50` only when the returned frame equals 19 exactly. That active callback does nothing while the menu remains 0x21; departure installs exit and releases text. `mnHyaku_8024C9F0` requests visual GObj destruction at returned frame >=29. [Lifecycle](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mn/mnhyaku.c#L120-L164).

The inherited engine analysis establishes that process removal and GObj destruction may be deferred during callbacks. This file neither clears its visual pointer nor explicitly destroys its independent input GObj on departure. Safe cross-menu lifetime therefore depends on surrounding orchestration; no defect is established. [Process removal](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobjproc.c#L148-L175), [destruction](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobjplink.c#L103-L127).

### Semantic assessment
Retain supported existing behavioral knowledge and the HandleUserInput, ExitAnimProc, Create, and Init names. Adopt ActiveMenuProc instead of the overly broad Think and add EnterAnimProc for the entrance callback. Canonical control flow independently supports both proposals; rendered substitutions are hypotheses, not proof. Inherited coverage reports both owned rendered files complete and parse-error-free. Compiled section membership, exact payload sizes, constant-pool layout, and alignment remain unverified.

Status: synthesized; independent review and live promotion pending.
