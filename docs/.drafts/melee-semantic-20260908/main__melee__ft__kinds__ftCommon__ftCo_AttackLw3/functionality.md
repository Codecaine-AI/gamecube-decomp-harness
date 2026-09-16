# Common down tilt: independent semantic review

The hash-bound research establishes complete canonical/rendered coverage of both owned files and enumeration of all 18 subjects, 46 facts and 18 links. This distinct lead independently inspected every proposed fact's canonical citation ranges and all upstream contradiction evidence. Context exposed no resumed attempt or selectable same-role ancestor cache. Supported retained facts and links are adopted unchanged; no cosmetic renaming or additional disposition overrides are needed.

## Input and entry

`ftCo_AttackLw3_CheckInput` requires newly pressed A, left-stick Y at or below `xB0`, and stick angle strictly below negative `x20_radians`. An eligible held item selects `ftCo_MS_LightThrowLw`; otherwise the function dispatches an entry request by fighter kind. Its true result means an entry path was invoked, not that AttackLw3 necessarily became the resulting state. Numeric threshold values are not established here.

`decideFighter` selects Mr. Game & Watch's dedicated entry or common `doEnter`. Both entry routines give item pickup precedence. Common setup occurs only when pickup does not consume the request: clear command variable 0, disable interruption, clear the repeat latch, install `callUnk` in `x21EC`, change to AttackLw3 with `Ft_MF_SkipAttackCount`, then invoke `ftAnim_8006EBA4`. The literal motion arguments are frame 0, rate 1, and blend/default argument 0. Zero here does not guarantee zero effective blending: where blending is initialized, `Fighter_ChangeMotionState` substitutes the animation metadata default. No compiled literal-pool attribution follows from these C arguments.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_AttackLw3.c#L42-L91; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftGameWatch/ftgamewatchattacklw3.c#L140-L151; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/fighter.c#L1288-L1294.

## Repeat and interruption

The animation callback prioritizes the conjunction of command gate and buffered-repeat latch. It dispatches an entry request and returns without testing animation completion; pickup remains a possible result. Otherwise, exhausted animation enters SquatWait. `checkPadA` requests entry immediately when A is newly pressed and the gate is open. With the gate closed it sets the latch and returns false, allowing later eligible checks to continue. This is not a repeat timer, and no exact script opening frame is established.

IASA first checks forward/up/down smash and forward/up tilt when interruption is enabled. It then checks the specialized A path independently of that flag. Its second interrupt-enabled group checks the downward input/item path, neutral attack, jump, dash, squat, turn and walk. First success terminates processing. Consequently, the specialized A path can preempt the later item-throw check.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_AttackLw3.c#L93-L162; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_SquatWait.c#L50-L86.

## Cross-file lifetime and shared callbacks

`callUnk` forwards the same object to stale-instance refresh and attack-record/trick bookkeeping, in that order. `Fighter_ChangeMotionState` invokes the installed `x21EC` hook and clears it; this is not a persistent per-frame callback. The retained research distinguishes wrapping stale and player-attack identifiers from indefinitely unique values, and later deduplicated stale-queue insertion from the callback's occurrence bookkeeping.

Game & Watch's successful attack entry instead installs Manhole accessory setup. The inherited cross-file review preserves its saved held-item pointer, Manhole creation, hitlag callbacks and item restoration on removal. Those lifetimes are not common down-tilt initialization.

Physics delegates to character ground friction, conditionally scaled above maximum walking speed, followed by grounded movement. The multiplier's numeric value was not established, so stronger deceleration is not asserted. Collision delegates to `ft_80084104`; the retained shared-helper review identifies Fall entry when its collision test returns false.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/fighter.c#L1198-L1218; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_0881.c#L317-L394; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_0892.c#L84-L199; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/pl/plstale.c#L29-L65; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/pl/plattack.c#L65-L73; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftGameWatch/ftgamewatchattacklw3.c#L39-L151; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_084E.c#L42-L53; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L1043-L1050.

## Names and evidence limits

The rendered views reported no parse errors. External helper substitutions remain hypotheses, not independent evidence. The retained canonical helper research supports stale refresh, SquatWait entry, grounded friction/movement and collision-to-Fall descriptions. The item predicate remains input-dependent rather than merely an item-property test. `ftAnim_Advance` must not imply only a frame increment: its canonical helper performs animation, command and other updates. Source explicitly marks `wrapper` as fake, so it is not promoted to a separate gameplay abstraction.

All three `.sdata2` facts remain explicitly unresolved. Exact section layout and pool consumption require independently verifiable compiled evidence with source/build provenance. The rejected compiled-layout proposal is not carried forward. Two historical animation links retain valid implements relationships, but their unconditional re-entry explanations are deferred for repair because pickup can consume the request and this pass prohibits link writes.


Status: synthesized; independent review and live promotion pending.
