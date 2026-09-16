## DamageScrew reaction

The owned C file defines a boolean eligibility/dispatch routine, a separately callable initializer, and four fighter callbacks. The header declares all six functions. Both canonical and rendered views were read completely; rendered names are hypotheses, not independent evidence.

### Eligibility and entry
`ftCo_800D2FA4` accepts only `HitElement_Scball`, rejects packed values `x2070.x2071_b0_3 == 11` or `12`, and otherwise calls `ftCo_800D3004` and returns true. The excluded values remain numeric. The initializer itself does not repeat these checks. In the central damage caller, this check is short-circuited by `ftCo_800C44CC`; success skips the subsequent conditional damage block, but not the shared final `ret0` processing. [Gate](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_DamageScrew.c#L19-L34) · [Caller](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Damage.c#L851-L965)

Entry calls `ftCommon_8007DB58`, `ftCo_8009750C`, and `ftCo_800DD168` in order, then clears `cmd_vars[0]`. Grounded fighters receive `ftCommon_8007D5D4` and enter `ftCo_MS_DamageScrew`; the other branch enters `ftCo_MS_DamageScrewAir`. Both motion changes use flags 0, frame 0, speed 1, blend 0, and NULL. The routine then assigns self velocity `(0, co_attrs.screw_attack_launch_velocity, 0)`. The source supplies the vertical attribute, not a numeric launch magnitude. [Entry](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_DamageScrew.c#L36-L55)

Setup is not confined to local fighter writes: `ftCommon_8007DB58` invokes optional damage/death callbacks, and `ftCo_800DD168` conditionally operates across the `victim_gobj` relationship, with different argument ordering and helpers depending on `x221B_b5`. These indirect effects must not be erased by a shorthand description of entry as merely changing velocity. [Common callbacks](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcommon.c#L657-L668) · [Victim-dependent setup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Throw.c#L57-L70)

### Callback lifetime
- **Anim:** while frames remain, performs no transition. On exhaustion, calls `ftCo_800968C8`. Its delegated initializer normally enters FallSpecial, but `x2224_b2` diverts to `ftCo_80090780` and returns before normal initialization. Normal initialization sets mobility, landing lag, interrupt permission and other state fields; its grounded branch differs from its airborne jump-consumption branch.
- **IASA:** empty. It grants no input-driven transition locally; this does not establish immunity to every external interruption.
- **Phys:** forwards the object once to `ft_80084DB0`. That helper checks fast fall, applies fast-fall or gravity/terminal-velocity handling, and calls `ftCommon_8007D268`.
- **Coll:** reads `cmd_vars[0]`. Nonzero calls `ftCo_AirCatchHit_Coll` and returns; zero calls `ft_80083B68`. It does not write or time the flag. Entry resets it, but a subsequent nonzero producer and its timing are not established here.

[Callbacks](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_DamageScrew.c#L57-L80) · [Recovery branches](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_FallSpecial.c#L22-L58) · [Shared physics](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L1363-L1375)

### Evidence boundaries
The canonical Scball, DamageScrew and screw-attack attribute names support the baseline victim-side Screw Attack mapping. `Check` and `Enter` remain plausible inferred names, not recovered originals. The rendered recovery-helper name conceals an exceptional branch and must not imply unconditional FallSpecial. C literals establish source-level zero/one uses, not the size, contents or placement of a compiled `.sdata2` pool. No compiled artifacts were supplied.

Status: synthesized; independent review and live promotion pending.
