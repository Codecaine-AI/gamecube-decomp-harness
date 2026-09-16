## Oil Panic

This unit implements Mr. Game & Watch's fighter-side Oil Panic lifecycle: paired grounded/aerial holding, catch/fill and release phases; bucket presentation; stored absorption resources; and Panic article setup, cleanup and hitlag forwarding. The header declares the public callbacks; its address comments are not compiled-layout evidence.

### Holding and input
Entry with charge at or above `ftGw_Panic_Full` immediately delegates to release, bypassing ordinary holding initialization. Otherwise entry clears vertical velocity and move controls; aerial entry additionally divides horizontal velocity by its character attribute. At exactly animation frame 38, an unlatched release flag permits restart with argument 5; the restart helper passes `anim_frame - 1` to the motion-state change. IASA decrements positive turn cooldowns; all nonpositive values reach the stick/facing branch. Releasing B independently latches `isRelease`, which these callbacks never clear.

Command-state handling differs deliberately: ordinary updates promote 1 to 2 and create absorption, or clear `x2218_b6` at 0; collision restoration creates absorption only at 2; action restoration promotes any value >=1 to 2. Nonzero command state refreshes the bucket model. Ground/air transitions retain the phase through explicit transition masks, not a wholesale reinitialization.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftGameWatch/ftgamewatchspeciallw.c#L139-L446

### Absorption and release
Absorption adds reported hit count and damage without clamping, invokes the full-charge response when appropriate, selects grounded or aerial Catch from `ground_or_air`, and refreshes the bucket. Catch completion exits when full; otherwise it resumes holding at frame 4 with command-dependent restoration. Catch and release IASA callbacks are empty, which proves no local interruption processing—not global immunity.

Release changes to Shoot, initializes animation, and performs multiplication and addition through two distinct assignments to `cmd_vars[1]`. It then clears persistent charge/damage, updates the bucket and schedules accessory setup. Release animation forwards that stored damage to enabled capsules among four slots before testing animation exhaustion. Aerial completion enters Fall; grounded completion invokes common neutral handling, which has exceptional branches rather than invariably entering Wait.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftGameWatch/ftgamewatchspeciallw.c#L448-L728 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_08A1.c#L53-L109

### Article lifetime and presentation
Setup attempts creation only with a null tracked pointer. Damage/death hooks install only when an article exists, whereas paired hitlag hooks install and `accessory4_cb` clears even after creation failure. Cleanup requests hitlag exit before clearing the tracked pointer and damage/death hooks; it does not clear the hitlag hooks.

Cross-file removal first invokes the item's destruction callback, which can clean the owner before item-system removal; the subsequent fighter-side cleanup can consequently repeat with a null pointer. Item animation also terminates when ownerless, or when the owner's interval predicate permits removal. That predicate tests the inclusive Shoot-to-AirShoot motion-ID interval, not two equality tests. Bucket display maps Empty/Low/Mid to zero/one/two segments; Full and every default value display all three segments.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftGameWatch/ftgamewatchspeciallw.c#L24-L137 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itgamewatchpanic.c#L17-L91

### Evidence boundaries
All owned canonical and rendered pages, all 92 frozen subjects and all 78 frozen links were delivered and examined in the inherited research. The lead retains supported existing knowledge and unchanged research dispositions, with independent restoration and review of the contradiction evidence. Rendered substitutions remain hypotheses, not independent proof. Compiled constant-pool claims remain unresolved. GroundOrAir-returning collision helpers versus caller truthiness tests retain numeric-state ambiguity. Detailed collision-helper semantics, global frame-numbering conventions, attribute-sign invariants and normalized damage arithmetic are not asserted beyond inspected evidence. The reconciled proposal is empty; no equivalent wording changes or unsupported replacements are requested.

Status: synthesized; independent review and live promotion pending.
