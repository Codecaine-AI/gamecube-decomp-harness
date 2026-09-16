## Peach FloatFall

This unit implements directional FloatFall motion selection and its animation, IASA, physics, and collision callbacks. The header declares all five public functions with `void (HSD_GObj*)` signatures.

### Direction and initialization
`getFloatDir` compares `input.lstick[0].x * facing_dir` strictly against `-p_ftCommonData->x78`. A greater result selects `ftPe_MS_FloatFallF`; otherwise, including equality, it selects `ftPe_MS_FloatFallB`. This tests facing-relative stick input, not velocity. No numeric motion-state values or threshold value are established here.

`ftPe_UpdateFloatDir` reads Peach's attributes, selects the corresponding `floatfallf_anim_start` or `floatfallb_anim_start`, subtracts `floatfall_anim_start_offset`, and calls `Fighter_ChangeMotionState` with `Ft_MF_KeepGfx`, the adjusted frame, `1.0f`, `0.0f`, and `NULL`. It does not test whether the selected state is already active, clamp the computed frame, or read the current animation frame. Thus animation alignment is attribute-based initialization, not demonstrated preservation of current progress.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPeach/ftpeachfloatfall.c#L15-L33

### Callback behavior and boundaries
- `ftPe_FloatFall_Anim` calls `ftCo_FallAerial_Enter` only when `ftAnim_IsFramesRemaining` is false. Otherwise it performs no local action.
- `ftPe_FloatFall_IASA` is empty. It supplies no local input interrupts; this does not establish global uninterruptibility.
- `ftPe_FloatFall_Phys` unconditionally forwards the object to `ftCo_JumpAerial_Phys_Cb`; no movement calculations are implemented locally.
- `ftPe_FloatFall_Coll` forwards the object and the function designators `ftCo_80096CC8` and `ft_80082B1C` to `ft_800831CC`. Collision decisions and resulting transitions are delegated, not implemented in this wrapper.

The owned source neither allocates resources nor explicitly stores callbacks for later use. Downstream state/resource lifetimes and exceptional collision branches cannot be inferred from these wrappers alone.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPeach/ftpeachfloatfall.c#L35-L52

Header evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPeach/ftpeachfloatfall.h#L1-L13

### Rendered-view review
Both owned files were read completely in canonical and rendered form. Rendering reported no parse errors. The C view substitutes proposed names for `ftCo_80096CC8` and `ft_80082B1C`; those names are not independent proof of landing tests or landing/wait transition behavior. The header has no substitutions.

### Baseline outcome
The saved ledger explicitly retains 29 facts and all 10 links. Three `.sdata2` facts remain unresolved because source literals do not prove compiled pool membership, size, order, or storage purpose. No entity, link, or merge proposals are made.

Status: synthesized; independent review and live promotion pending.
