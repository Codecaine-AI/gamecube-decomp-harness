## Bowser side special: captor-side state machine

`ftkoopaspecials.c` implements grounded and airborne side-special entry, capture-hit/repeat-hit processing, captured-opponent wait, directional throw endings, movement, and terrain transitions. The header declares this family plus helpers implemented in `ftkoopa.c`; declarations and rendered names alone do not establish those helpers' behavior.

### Entry and capture
Ground and air entry select states 347 and 353 at frame zero, initialize throw/command and phase/reversal fields, advance animation setup, and register the corresponding captor and victim callbacks. The request/direction scratch fields are cleared **after** callback registration. The captor grab callbacks select initial hit states 348/354 or repeat-hit states 349/355 according to `x4`, set fighter bookkeeping, write mask 511, reset velocities, and clear the request and command. Canonical callback storage is independently verified in `ftcommon.c`.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKoopa/ftkoopaspecials.c#L49-L136; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcommon.c#L895-L939.

### Input, repeat hit, and wait
The field named `b_held` is locally a **press-latched request**, not a continuously sampled held-button condition. `pressed_buttons & HSD_PAD_B` sets it; this sampler does not clear it on release. Strict horizontal threshold crossings between the two stick samples produce -1 or +1, and the stored selection is multiplied by Bowser's facing. A zero direction result can therefore still latch B.

Hit animation callbacks process command 0 only when the phase latch permits it. At animation exhaustion, a pending request starts another hit and the matching victim damage state; otherwise Bowser enters the wait descriptor at his current frame and freezes animation. Both wait animation callbacks are empty. Hit IASA selects paired captor/victim directional endings. Wait IASA gives directional selection priority over the repeat request. The paired victim transition calls in input/repeat paths have no local null guard.

States 348 and 350 share the initial-hit submotion but have different callback suites; likewise 354 and 356. They must not be collapsed merely because their enum names contain `Hit0`. State 350/356 is the wait callback phase, while 349/355 is repeat hit.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKoopa/ftkoopaspecials.c#L31-L47; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKoopa/ftkoopaspecials.c#L315-L572; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKoopa/ftkoopa.c#L102-L222.

### Endings and cross-file victim lifetime
Forward endings handle the throw reversal flag, then process command 0 only with a present victim, then test animation completion. With no victim, the command is not consumed on that path. Backward endings delegate equivalent guarded processing to `ftKp_SpecialS_80132E30` in `ftkoopa.c`. Air completion enters Fall. Ground completion uses `ft_8008A2BC`, not an unconditional direct Wait transition: its downstream dispatcher includes DownSpot and other exceptional branches before ordinary neutral processing.

Ending landing continuations select grounded states 351/352 at Bowser's current frame and compensate facing around the transition when the reversal latch is set. A present victim receives the corresponding grounded ThrownKoopa state. The victim helper preserves **the victim's own frame**, adopts the captor's facing, and uses the captor as animation source; it does not copy Bowser's frame into the victim.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKoopa/ftkoopaspecials.c#L249-L297; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKoopa/ftkoopaspecials.c#L428-L477; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKoopa/ftkoopa.c#L437-L461; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_ThrownKoopa.c#L21-L42; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_08A1.c#L54-L109.

### Terrain and movement
Startup terrain transitions continue the corresponding startup and reinstall capture callbacks. Air hit landing selects 348; air wait landing selects 350, freezes animation, and clears request/command state. In contrast, grounded hit, wait, and ending loss paths snapshot the victim, make Bowser airborne, separate and fall a present victim, and always fall Bowser. The inferred wait `GroundToAir` name does **not** imply continuation in aerial wait. Airborne bookkeeping and capture release are separate operations. `ftCo_800DC920` clears both participants' capture links and includes conditional position/model/collision cleanup.

Ground startup/end physics use animation-derived ground velocity when enabled, otherwise friction, then movement. Ground hit/wait use speed-dependent friction and movement. Air hit/wait/end use ordinary fall and aerial friction. Air startup preserves incoming vertical velocity around animation translation, then applies gravity and terminal-speed clamping.

Collision wrappers must retain their exact predicates: `ft_8008403C` invokes its event on `!ft_80082708`, `ft_800841B8` on `!ft_800827A0`, and `ft_80082C74` on a truthy `ft_80081D0C`. The latter helpers use GroundOrAir-labelled returns in boolean contexts; the labels alone should not be used to reinterpret or invert their guards.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKoopa/ftkoopaspecials.c#L138-L247; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKoopa/ftkoopaspecials.c#L574-L676; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_084E.c#L33-L125; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcommon.c#L462-L525; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_CaptureCut.c#L84-L196; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L105-L123; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L392-L424; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L549-L556; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L1035-L1060.

### Review outcome
Inherited research covers all owned canonical and rendered pages, 96 subjects, 252 facts, and 78 links. This lead independently inspected the canonical evidence for all 12 unresolved fact exceptions and reconciled the functionality document with the empty proposal. The 240 retained facts and 78 retained links remain explicitly supported through the inherited review; no ledger overrides or fact writes are proposed. The exceptions comprise three compiled-section claims, six input descriptions, one entry-order description, and two unverified gameplay details. Inferred names remain hypotheses rather than recovered spellings. Source literals do not establish compiled `.sdata2` contents, layout, or loads.

Status: synthesized; independent review and live promotion pending.
