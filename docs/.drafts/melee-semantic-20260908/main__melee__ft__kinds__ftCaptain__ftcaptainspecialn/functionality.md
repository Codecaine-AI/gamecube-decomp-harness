## Shared neutral-special punch lifecycle

This unit provides paired ground/air Enter, Anim, IASA, Phys and Coll callbacks for Falcon/Warlock Punch. Supported existing names, explanations and mappings are retained through the inherited ledger; rendered helper names are hypotheses rather than independent semantic evidence.

### Entry and animation
Both entries clear cmd_vars[1], cmd_vars[0] and throw_flags, enter their respective SpecialN motion state at frame 0 with playback rate 1, install effect-hitlag callbacks and call ftAnim_8006EBA4. These explicit resets do not prove universal transient-state cleanup. Both animation callbacks invoke the wind helper before checking completion. Grounded completion calls ft_8008A2BC; aerial completion enters Fall. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCaptain/ftcaptainspecialn.c#L86-L124.

The wind helper immediately returns for Captain. For Ganondorf, it converts the animation frame to int and emits only on odd frames within inclusive windows 16–50 and 51–68, passing (2,2,2,0) and (2,4,4,0), respectively, to lb_800119DC. Other kinds do nothing. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCaptain/ftcaptainspecialn.c#L33-L55.

### Aerial launch
Ground IASA is empty. Air IASA consumes any nonzero cmd_vars[0], clears it, and replaces horizontal and vertical self velocity. The angle helper transforms vertical-stick input using configured thresholds, restores its sign and scales by specialn_angle_diff into radians. The resulting velocity uses specialn_vel_x times sine vertically and facing-relative cosine horizontally. There is no local equal-threshold guard or motion-state transition. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCaptain/ftcaptainspecialn.c#L57-L84 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCaptain/ftcaptainspecialn.c#L126-L140.

### Effects and physics
Both physics callbacks process throw_flags_b1 first. If absent, the shared helper performs no effect work. If present, it consumes the flag. With x2219_b0 unset, Captain spawns effect 1167 using TopN and part 57, while Ganondorf spawns 1291 using TopN and part 78. The latch is set even for an unrecognized kind that spawned nothing. With the latch already set, the event calls ftCommon_8007DB24; its rendered ClearGfx name does not independently establish cleanup semantics. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCaptain/ftcaptainspecialn.c#L142-L172.

Ground physics then calls ft_80084FA8. Inherited contextual research establishes friction scaling above the walk-speed threshold, selection between root-offset-derived acceleration and ground friction, and application of ground movement. The multiplier's name does not establish its configured value. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCaptain/ftcaptainspecialn.c#L174-L179 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_084E.c#L55-L88.

Air physics dispatches on numeric cmd_vars[1]: 0 calls ft_80084EEC for falling and aerial friction; 1 multiplies both velocity components by specialn_vel_mul; 2 calls ft_80084DB0 for fast-fall-aware aerial physics. Other values skip movement processing but not the preceding effect-event work. Script timing, configured multipliers and a closed three-value enum are not established. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCaptain/ftcaptainspecialn.c#L181-L204; inherited contextual evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_084E.c#L33-L40 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L1363-L1375.

### Collision continuity and evidence limits
Failure of ft_800827A0 converts ground SpecialN to SpecialAirN, reinstalls effect-hitlag callbacks and clamps air drift. Success of ft_80081D0C converts aerial SpecialN to grounded SpecialN and reinstalls callbacks without that clamp. Both use the same transition mask, including KeepGfx, UpdateCmd and unknown bits. Neither locally repeats fresh-entry resets; precise preservation and cleanup depend on common state-change helpers. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCaptain/ftcaptainspecialn.c#L206-L231.

Full owned-file coverage is inherited from the hash-bound research. The lead independently inspected canonical and rendered C lines 24–232, including all upstream contradiction evidence. No compiled artifacts establish .sdata2 layout, size, contents or use-site attribution; the MUST_MATCH literal-order helper is insufficient. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCaptain/ftcaptainspecialn.c#L24-L31.

Status: synthesized; independent review and live promotion pending.
