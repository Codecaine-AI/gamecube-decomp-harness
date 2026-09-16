## Shared neutral-special implementation

The C file implements parallel grounded and aerial Mario/Dr. Mario neutral-special callbacks, a shared projectile-release accessory callback, and a reusable Megavitamin selector. The header declares all fourteen public functions; it adds no behavior. Full canonical/rendered coverage is inherited from the hash-bound research handoff. The lead independently inspected the canonical evidence for all upstream non-retain claims. Rendered substitutions are hypotheses, not independent evidence.

### Entry, interruption, and completion

Both fresh entries clear `cmd_vars[0]` and `throw_flags`, select their respective SpecialN motion with arguments `0, 0, 1, 0, NULL`, call `ftAnim_8006EBA4`, and install `ftMr_SpecialN_ItemFireSpawn` in `accessory4_cb`. Projectile creation is deferred. Grounded IASA delegates to `ftCo_Wait_IASA` only when command variable 0 is nonzero; aerial IASA similarly delegates to `ftCo_Fall_IASA_Inner`. The owned code does not establish when that gate opens relative to projectile release.

Animation exhaustion invokes `ft_8008A2BC` on the ground and `ftCo_Fall_Enter` in the air. The grounded helper is not an unconditional Wait entry: the inherited canonical research identifies boss-specific branches and a common resolver with DownSpot and other exceptional checks before ordinary Wait handling.

### Physics and situation changes

Ground physics forwards to `ft_80084F3C`; inherited canonical research identifies ground friction, scaling above maximum walk speed, and ground movement. Air physics forwards to `ft_80084DB0`, whose researched body checks fast fall, applies fast-fall or gravity/terminal-velocity processing, and calls `ftCommon_8007D268`.

Ground collision dispatches GroundToAir when `ft_80082708(gobj) == false`; air collision dispatches AirToGround when `ft_80081D0C(gobj)` is nonzero. Both transition handlers use `Ft_MF_SkipColAnim | Ft_MF_UpdateCmd` and reinstall the projectile callback. The researched common inline helpers carry `cur_anim_frame` into the new motion state at rate 1 and blend 0. Callback restoration does not itself raise a projectile request or prove preservation of a pending request through external state machinery.

The aerial collision helper returns a `GroundOrAir` value and has an exceptional `ft_80081A00` branch. Its enum labels must not be substituted for the caller's numeric truth test without resolving that convention. Accordingly, the intended landing interpretation is distinguished from the directly proven nonzero dispatch.

### Projectile release and selection history

The accessory callback consumes `throw_flags_b0` before doing spawn work. A clear bit produces no spawn call. A set bit obtains coordinates from the `FtPart_L1stNb` joint. Mario calls `it_8029B6F8` with `It_Kind_Mario_Fire` and additionally requests effect 1146. Every non-Mario kind takes the alternative branch, selecting a vitamin index and calling `itDrMarioPill_Spawn`; there is no explicit Dr. Mario kind check. One constructor invocation is proven per consumed request, not guaranteed successful item creation. There is no local retry or callback-retirement assignment.

The selector scans indices 0–8, excludes the two stored history values, randomly indexes the remaining array, shifts current to previous, and stores the result as current. Seven candidates remain only when both exclusions are distinct valid indices; otherwise eight or nine can remain. History advances before the caller's item-construction result is known. Inherited canonical external-consumer research confirms shared use by the side taunt, Sleep, and two sequential DeadRight pill constructions, so this is selection history rather than a history limited to successful neutral-special projectiles. The taunt separately stores its pill pointer and manages damage/death callbacks and animation-end cleanup.

### Evidence boundaries

Primary implementation: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMario/ftmariospecialn.c#L25-L186. Public declarations: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMario/ftmariospecialn.h#L6-L19. Independently inspected collision helper: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L105-L123. No compiled artifacts were supplied; `.sdata2` size, ordering, representation, and literal-load attribution remain unproved. The empty proposal is consistent with these accepted deferrals; no fact or link disposition correction is warranted.

Status: synthesized; independent review and live promotion pending.
