## Furafura semantic review

This unit implements entry and four callbacks for the post-shield-break dazed state. ShieldBreakStand forwards the fighter object to `ftCo_80099010` after its animation finishes. The retained rendered name `ftCo_Furafura_Enter` accurately describes the canonical unconditional transition to `ftCo_MS_Furafura`.

Entry uses frame 0, rate 1, zero blend, `Ft_MF_SkipModel | Ft_MF_SkipMatAnim`, and a null callback argument. It restores shield health from common data and initializes the fighter-owned countdown to `max(x2F8 - damage, 0) + x2FC`. Only the damage-derived contribution is clamped. `ftCommon_InitGrab` resets stick-mash history and disables extended mash bookkeeping for this call. Entry then calls `ftCommon_8007EBAC(fp, 25, 0)` and `ft_800885A8(fp, 95, 127, 64)`; their complete effects are not established by the owned source.

Each animation update restores shield health, subtracts `x300`, invokes mash processing with `x304`, and only then tests `grab_timer <= 0` to dispatch `ft_8008A2BC`. The shared mash helper consumes button presses and changes in remembered stick direction, allowing separate reductions from both categories. The countdown and mash history persist in the Fighter across callbacks; no local allocation or cleanup lifetime is introduced. The exact destination and exceptional behavior of the terminal helper are not asserted here.

IASA is empty: it neither handles input nor initiates transitions. This does not imply immunity to collision-driven or external state changes. Physics forwards the object unchanged to `ft_80084F3C`, whose canonical implementation applies ground friction, scaling it when absolute ground velocity exceeds walk speed, then applies ground movement. That implementation independently supports the rendered physics-helper hypothesis.

Collision forwards unchanged to `ft_80083F88`. Its query synchronizes collision and fighter positions and maps the result of `mpColl_8004B108` to `GA_Air` or `GA_Ground`. The consumer explicitly enters Fall when the query equals `GA_Ground`. This literal guard is preserved rather than normalized into an assumed physical ground-loss condition; the existing collision purpose needs that narrow correction.

Both owned files were read completely in canonical and rendered form. The header declares all five functions consistently. Neither rendered view reported parse errors. Function-only rendering leaves parameter and field hypotheses untested, and the rendered rumble name is not independent proof of the foreign helper's behavior. No compiled evidence was supplied to establish `.sdata2` size, representation, ordering, or literal attribution.

Status: synthesized; independent review and live promotion pending.
