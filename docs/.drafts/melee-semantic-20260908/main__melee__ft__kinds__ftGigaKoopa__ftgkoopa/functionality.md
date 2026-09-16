## Giga Koopa initialization and shared behavior

This unit defines Giga Bowser's character resources, motion descriptors, lifecycle callbacks, item and knockback adapters, and demo selection functions. The header declares the corresponding public interfaces and resource objects. Source declarations do not establish compiled section membership, byte layout, or final-link order.

### Motion and resource definitions

The primary table contains 23 entries labeled as states 341–363: six ground/air neutral-special phases, twelve side-special phases, two up-special states, and three down-special states. It reuses Koopa animation, IASA, physics, and collision callbacks and supplies `ftCamera_UpdateCameraBox` throughout. Side-special start and forward/backward end entries, and all down-special entries, have NULL IASA callbacks. The two side-special wait entries use `ftCo_SM_None`; notably, the aerial wait entry uses `ftKp_MF_SpecialS`, not `ftKp_MF_SpecialAirS`. These differences must not be normalized away. A separate descriptor uses the `ftCo_SM_RunBrake` submotion identifier and only the physics callback `ftCo_800C74AC`; this does not independently establish its runtime motion-state identity or prove the rendered RebirthWait name. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftGigaKoopa/ftgkoopa.c#L22-L289.

Resources include `PlGk.dat`, `ftDataGkoopa`, `PlGkNr.dat`, model/material-animation joint strings, `PlGkAJ.dat`, a zero-initialized demo-string structure, one special demo-motion label, one costume descriptor, and a one-element costume-list declaration. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftGigaKoopa/ftgkoopa.c#L20-L22 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftGigaKoopa/ftgkoopa.c#L291-L304.

### Load, death, and shared runtime values

`ftGk_Init_OnLoad` obtains the Fighter from `gobj->user_data`, captures the fighter-data item array, invokes Koopa's Giga-specific attribute helper, registers `items[0]` as `It_Kind_Koopa_Flame`, and sets `x2226_b1` and `x222A_b0`. The registration helper stores the article pointer in a global table; it does not spawn a projectile, copy the article, or establish ownership transfer. No local guard guarantees one-time invocation. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftGigaKoopa/ftgkoopa.c#L324-L335; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKoopa/ftkoopa.c#L333-L349; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/it_26B1.c#L204-L208.

`ftGk_Init_OnDeath` requests part selection zero and restores `dmg.armor0`, `u.gk.x222C`, and `u.gk.x2230` from attributes `x0`, `x10`, and `x18`. The parts helper writes the pending `prev` selection and marks a flag; another routine transfers pending selections to `idx`. Thus this callback does not itself immediately rebuild the visible model. The armor assignment does not prove a literal value of 20 or the downstream subtractive-knockback calculation. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftGigaKoopa/ftgkoopa.c#L306-L317; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftparts.c#L555-L577.

`ftGk_Init_UnkMotionStates3` forwards to Koopa's corresponding hook, which calls `ftKp_SpecialLw_80134D78` in the neutral-special source. That helper updates two persistent Koopa runtime values only when `motion_id < 0x155` or `motion_id >= 0x15B`: it adds attributes `x8` and `xC` and upper-clamps to `x10` and `x18`. Neutral-special IASA code separately decrements these values and lower-clamps them. This establishes a shared runtime replenishment path rather than a 'third initialization operation'; the numeric suffix is not semantic proof. The Giga death callback and shared helper use different union member spellings, so no additional compiled-layout claim is made. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftGigaKoopa/ftgkoopa.c#L319-L322; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKoopa/ftkoopa.c#L328-L331; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKoopa/ftkoopaspecialn.c#L100-L114 and #L238-L315.

### Event adapters

Pickup and drop forward the incoming object and boolean with two additional `true` arguments. Item visibility and knockback entry/exit forward the object with one `true` argument. Special-attribute loading forwards unchanged to Koopa's loader. These wrappers contain no local guards, timers, or independent state machines; effects belong to their callees. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftGigaKoopa/ftgkoopa.c#L337-L370.

### Demo branches and invalid inputs

`ftGk_Init_UnkDemoCallbacks0` writes 14 through `arg2`, then through `arg1`, only for selector 15. Other selectors leave both locations untouched. Output roles beyond mutable integer selections remain unknown, and the matching branch assumes valid pointers. `ftGk_Init_GetMotionFileString` maps selector 15 to index zero of the single-entry table containing `ftDemoVi1201V2MotionFileGkoopa`. Other selectors leave `offset` uninitialized and cause undefined behavior; there is no NULL-return fallback. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftGigaKoopa/ftgkoopa.c#L300-L304 and #L372-L391.

### Rendered-name review

All owned canonical and rendered pages were reviewed. The renderer reported no parse errors. Its substitutions were treated as hypotheses: the parts-selection and article-registration interpretations were checked against canonical helper bodies, and the shared runtime-update interpretation was checked through the Koopa callee chain. `ftGk_Init_DemoCallback0` remains a conservative proposed name, not a recovered original name. The header reports a shadowed binding for `ftGk_Init_GetMotionFileString`; its canonical declaration remains clear.

Status: synthesized; independent review and live promotion pending.
