## Luigi neutral special: Fireball

The owned C file implements paired grounded/aerial entry, animation, IASA, physics and collision callbacks, plus a shared accessory release callback. The header declares all eleven functions as `void(HSD_GObj*)`. Both canonical and rendered files were read completely in inherited research; rendered substitutions were treated as hypotheses, not independent evidence. Lead review independently checked all proposal citations and contradiction evidence.

### Entry and actionability
Both entry routines clear `cmd_vars[0]` and `throw_flags`, select their respective symbolic SpecialN motion states with flags 0 and floating-point arguments `0.0f, 1.0f, 0.0f`, call `ftAnim_8006EBA4`, and install `ftLg_SpecialN_FireSpawn` in `accessory4_cb`. Neither directly constructs a projectile. IASA delegates only when `cmd_vars[0] != 0U`: grounded handling invokes `ftCo_Wait_IASA`, while aerial handling invokes `ftCo_Fall_IASA_Inner`. The local callbacks do not clear this gate or establish its opening frame. The grounded common dispatcher uses ordered, first-success-return action checks.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftLuigi/ftluigispecialn.c#L27-L85 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Wait.c#L44-L67.

### Completion and movement
Animation callbacks do nothing locally while frames remain. Aerial completion enters Fall. Grounded completion calls `ft_8008A2BC`, not Wait directly: the shared dispatcher distinguishes boss fighters, and Luigi's ordinary route checks `x2224_b2` and `ftCo_800C5240` before its default Wait transition. Thus unconditional Wait is an inaccurate summary.

Ground physics delegates to `ft_80084F3C`, which scales ground friction only when absolute ground velocity strictly exceeds maximum walk velocity, then applies friction and ground movement. Air physics delegates to `ft_80084DB0`, which checks fast-fall, selects fast versus gravity/terminal-velocity descent, and then invokes common aerial control.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftLuigi/ftluigispecialn.c#L55-L97; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_08A1.c#L54-L109; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_084E.c#L42-L53; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L1363-L1375.

### Terrain continuation
Ground collision converts to SpecialAirN when `ft_80082708(gobj) == false`; aerial collision converts to SpecialN when `ft_80081D0C(gobj) != false`. Both pass `ftLg_MF_SpecialN_Coll` and reinstall the release callback afterward. The common helpers pass the current animation frame rather than restarting at zero. Callback restoration does not itself raise a release event. Numeric motion-state IDs and the transition-mask expansion are not inferred from rendered names.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftLuigi/ftluigispecialn.c#L102-L125 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/inlines.h#L71-L89.

### Release and cross-file lifetime
FireSpawn is inert when `throw_flags_b0` is clear. Otherwise it clears the flag first, extracts the `FtPart_L1stNb` joint origin, invokes `it_802C01AC` with `It_Kind_Luigi_Fire` and facing direction, and independently invokes effect 1287 on the joint. This is one constructor attempt and one effect call per consumed request, not a guarantee of a successfully allocated projectile. The item constructor explicitly tolerates NULL allocation, copies the supplied position into its spawn descriptor, and records fighter-parent references; it does not retain the caller's stack-vector pointer. Successful items receive their own velocity, lifetime and motion-state setup, with later animation/physics/collision handled in the item module. The fighter callback does not retain a spawned-item handle or retry a failed allocation.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftLuigi/ftluigispecialn.c#L129-L150; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lb_00B0.c#L105-L140; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itluigifireball.c#L28-L97.

### Evidence limits
The source proves uses of floating-point literals, not their compiled pooling, section size or relocation consumers. All four `.sdata2` facts therefore remain unresolved. No supplied compiled artifact establishes those claims. Exact release timing, the external producer of the release flag, effect-resource appearance, and full engine-level callback cleanup are not established by this pass.

Status: synthesized; independent review and live promotion pending.
