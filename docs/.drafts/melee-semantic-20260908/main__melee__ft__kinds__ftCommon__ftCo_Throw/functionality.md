# Common directional throws

## Selection and paired startup
`ftCo_800DD1E4` prioritizes horizontal left-stick input, horizontal C-stick input, upward input, then downward input. Horizontal sign is relative to facing; selected numeric motions are 219–222. Entry occurs only when the selected motion differs from the current motion. Left-stick tests are threshold crossings; the downward C-stick helper instead requires both previous and current samples to be at or below its threshold. These distinctions must not be flattened into a uniform edge-triggered input rule.

`ftCo_800DD4B0` derives victim motions 239–242 and chooses rate 1.0 for weight-independent directions, otherwise `1 / (victim_weight * x37C)`. Bowser/Giga Bowser motion 222 against Peach/Zelda substitutes victim motion 243. `ftCo_800DD398` clears command, throw flags and x4/x8, starts the thrower and victim at a shared rate, sets paired Kirby flags for numeric 221, and initializes Samus's direction-selected Grapple Beam accessory. These entry helpers assume valid participants and motion inputs rather than validating them locally.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Throw.c#L72-L189 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_0DF1.c#L162-L190.

## Scripted events and collision phases
The shared animation processor independently consumes facing-reversal and release flags, then checks the command-driven hold event. Release snapshots the victim before hit resolution clears relationship pointers, allowing subsequent victim-reaction setup. The hold event sets x4, clears the command, captures translation and requests rate zero. Victim synchronization may pause immediately or schedule a pause at the matching frame. Kirby's paired flag cleanup only reaches a victim that remains linked.

All four collision callbacks distinguish airborne x4, airborne x4-clear/x8-clear, ordinary airborne continuation, and grounded processing. The first landing continuation restores rate before advancing once; the second advances until command variable 0 becomes nonzero, without a timeout, before restoring rate. Both clear x4, set x8, resume a remaining victim and ground the thrower. Collision helpers invoke these continuations conditionally. The grounded fallback separates a remaining victim and enters Fall for that saved victim and unconditionally for the thrower.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Throw.c#L191-L492, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Thrown.c#L206-L224 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L941-L1059.

## Directional callbacks and reuse
IASA callbacks are local no-ops, not evidence of global uninterruptibility. Physics selects grounded processing, ordinary airborne processing, or facing-relative stored velocity. Forward throw reads xC.z/y; the other directions use fighterthrow velocity fields. Animation callbacks run character-specific hooks before shared events and completion checks. Forward throw has an x2222_b0-dependent completion destination; back/up/down use the common ground-or-air exit. Mewtwo's hook creates a projectile per qualifying script command; the inspected code does not establish exactly five shots. Fox/Falco's hook handles Blaster creation, firing and cleanup. Kirby/numeric-221 selects the exceptional up-throw camera path. Cargo throws reuse animation and physics components but have their own collision transitions.

## Hit resolution and relationship lifetimes
`ftCo_800DDDE4` uses the source's primary hit capsule to populate the second fighter's damage and knockback metadata. x221B_b7 swaps anchor and placement-repair roles, not the damage recipient. Source capture pointers and flags are cleared before hit processing; target pointers and b7 are cleared afterward, without an explicit target b5 clear. Placement repair requires x2226_b2. The true wrapper enables an additional scaled release offset only inside that repair branch; the false wrapper does not disable repair itself. Yoshi and copied-Yoshi callers preserve the victim across false-mode resolution before victim-side conversion.

Death cleanup and capture replacement use distinct role-aware teardown paths. The replacement path can apply the linked participant's configured capture hit before separation. A separate x380 common-data hit routine is called on a saved partner without existing knockback in one interrupted-capture damage branch; it is not the universal grab-release path.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Throw.c#L43-L70, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Throw.c#L494-L615 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Damage.c#L838-L947.

## Evidence limits
Both owned canonical and rendered files and every frozen subjects/links page were examined through restored evidence. Rendered names were treated as hypotheses, not independent proof. No compiled artifacts establish section contents or layout. The ledger accounts for all 178 facts and 66 links: 166 facts retained, 12 unresolved, and all 66 links retained with explicit evidence groups. No source or knowledge-base writes are proposed.

Status: synthesized; independent review and live promotion pending.
