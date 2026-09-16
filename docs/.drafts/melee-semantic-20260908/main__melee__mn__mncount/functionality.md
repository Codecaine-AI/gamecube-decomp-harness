## Misc. Records screen

`mncount.c` implements Data / Melee Records / Misc. Records. The header defines 30 logical rows and a ten-row viewport. Scroll positions 0 through 20 select the visible window. Five rows display elapsed time, ten display character record-holders, and the remainder display numeric statistics. Labels use SIS identifiers 0xC9 through 0xE6. Numeric values come from game-manager accessors, unlock counts, trophies and saved names; character metrics come from persistent fighter records and diagram helpers.

### Ranking

Both ranking routines stably order primary statistics descending and first reject the result if every selectable character has zero recorded play time. The basic routine returns `SELKIND_COUNT` for unavailable or tied selections. Its rank-skipping branches mutate the array index while consuming ties; they should not be described as a simple distinct-value ranking abstraction. Shortest Time additionally requires at least three unlocked characters.

The second routine delegates selected primary ties to `mnCount_8025072C`. Its rendered name, `mnCount_ResolveCharacterRankingTie`, remains useful, but existing explanations overstated the algorithm. The helper has no unlock checks. Updating `best_idx` before testing KO equality causes a self-comparison and an early break. Its fall pass compares candidate KOs against `start_idx`, not necessarily the current best. Consequently, it is not a reliable lexicographic global-extremum selector, and the outer routine's unlock filtering does not guarantee an unlocked delegated result. Mode reverses secondary KO/fall comparisons only; primary ordering remains descending. See code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mn/mncount.c#L119-L420.

### Presentation and input

Each row rebuild replaces its label and value text objects. Time output uses hours and minutes; character output delegates to a string-rendering helper, not a fighter icon; unavailable character results use the literal marker. Numeric values saturate at 999999999 and time values at 3599999940. The source contains a 359940 time-default branch, but the current classifier's five time rows all have explicit switch cases, so that default is unreachable. The `buf - 4` time-formatting expression remains a source-level anomaly, not a proven stack-layout reconstruction.

The separate input GObj callback ignores its argument and accesses the display through `menu_gobj`. Cooldown suppresses input, then Back takes priority over Up and Down. Accepted movement refreshes all ten visible rows; rejected boundary movement produces neither movement sound nor refresh. Arrow children 2 and 1 reflect the upper and lower scroll bounds without modifying scroll state. See code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mn/mncount.c#L427-L628.

### Lifetime

The parent Records dispatcher launches `mnCount_Create`. Creation sets the shared menu state, loads four model resources, publishes the display GObj, attaches allocated userdata with `HSD_Free`, creates the title, and starts separate activation and input callbacks. The activation callback performs ten decrement-and-return invocations before a subsequent zero-entry invocation constructs rows and the model and installs the steady-state update. Departure overrides the countdown and triggers text cleanup plus a destruction callback. Baselib destruction itself can defer cleanup under its scheduler guard.

The initializer clears row slots but does not initialize `title`, although creation subsequently tests it. This pass does not assume allocator zeroing. Text cleanup does not null the title, and the local teardown path does not clear `menu_gobj` or explicitly destroy the separate input object; broader transition lifetime guarantees remain outside the established evidence. See code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mn/mncount.c#L635-L840 and code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobjplink.c#L103-L127.

### Review outcome

All owned canonical and rendered pages, all 52 subjects, all 128 facts and all 29 links were reviewed. Supported knowledge and existing descriptive names are explicitly retained in the checkpoint ledger. Corrections address exceptional ranking behavior, deferred destruction, character text output, primary-versus-secondary ordering, unsupported contestant averaging, unreachable fallback behavior and the interpretation of input argument 4. No compiled section-layout conclusions are established. Rendered function substitutions were checked against canonical behavior rather than used as proof.

Status: synthesized; independent review and live promotion pending.
