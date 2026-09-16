## Fighter-side Thunder Jolt lifecycle

The owned implementation supplies paired grounded and aerial neutral-special entry, animation, IASA, physics and collision callbacks, two effect helpers, and a variable initializer. The header declares all 13 public functions. Canonical calls to `itPikachuThunderJolt_Spawn` and explicit Pikachu/Pichu audio branches establish the move mapping independently of rendered naming hypotheses.

### Entry and projectile release
Both entry wrappers call `doEnter` with their respective symbolic motion state. The helper changes state with `Ft_MF_None`, frame 0, rate 1 and zero blend, clears command variables 0–3, then invokes `ftAnim_8006EBA4`. Neither entry explicitly resets the effect latch or invokes `ftPk_SpecialN_80124DC8`.

Both animation callbacks consume command 0 only when it equals one. They clear that cue even if command 1 already prevents another release. On the first release they set command 1 before calling the item spawner; no spawn-result check or retry is present. The projectile origin uses fighter position, scale.y, facing-relative x offset and the appropriate ground/air attribute offsets, with z forced to zero. Pikachu selects sound 240076 and Pichu 230067, each with arguments 127 and 64; other kinds take the silent default branch.

Completion is tested independently of release. Grounded completion calls `ft_8008A2BC`. Aerial completion calls `ftCo_Fall_Enter` when landing lag equals 0.0f, otherwise `ftCo_80096900(gobj, 1, 0, 1, 1.0f, landing_lag)`.

Evidence: [entry and animation bodies](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPikachu/ftpikachuspecialn.c#L27-L130).

### Physics and collision
Both IASA callbacks are empty; this establishes no interrupt handling through these slots, not immunity to external interruption. Ground physics delegates to `ft_80084F3C`, whose canonical body conditionally scales friction when absolute ground speed exceeds walking speed, then applies friction and ground movement. The multiplier's actual value was not established, so scaling is supported more strongly than the baseline claim of an increase. Aerial physics delegates to `ft_80084DB0`, which checks fast fall, chooses fast-fall handling or ordinary gravity/terminal-velocity falling, then performs common aerial processing.

Ground collision calls the common ground-to-air transition helper when `ft_80082708` returns false. Air collision uses the literal test `ft_80081D0C(gobj) == GA_Air`, then calls `ftCommon_8007D7FC`, zeros vertical self-velocity and changes to grounded SpecialN at the current animation frame. The enum spelling must not be interpreted as a direct statement of the resulting fighter situation: the callee updates collision positions and maps a collision result to these labels, with an overriding `ft_80081A00` branch. Both transitions pass `ftPk_MF_SpecialN_Coll`, defined as the common ground/air collision flags plus `Ft_MF_KeepGfx`. Full command-state preservation through external transition machinery was not traced.

Evidence: [local callbacks](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPikachu/ftpikachuspecialn.c#L132-L167), [ground physics](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_084E.c#L42-L53), [air physics](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L1363-L1375), [collision result convention](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L105-L123), [collision flags](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPikachu/forward.h#L36-L37).

### Effects and setup lifetime
The effect helpers resolve HipN and spawn synchronized effect 1214 or 1215 only when `x2219_b0` is clear, then set that shared latch. Both unconditionally install effect hitlag callbacks and clear `accessory4_cb`, including the skipped-spawn path. The latch reset and callback installation sites are outside the owned implementation; no per-entry reset or visual distinction between the two effects is asserted.

`ftPk_SpecialN_80124DC8` always clears command 0. It compares a u8 copy of `x673` with attribute `x1C`; below the threshold it copies `x20` into `mv.pk.unk2.x0` and sets `count_thrown_items` to one. Otherwise it zeros only the move-local scalar, leaving the count untouched. Fighter input processing independently establishes `x673` as a horizontal-stick timing counter. This supports the conservative `ftPk_SpecialN_SetVars` hypothesis, but not a specific gameplay meaning for the scalar or its downstream lifetime.

Evidence: [effects and initializer](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPikachu/ftpikachuspecialn.c#L169-L221), [input counter producer](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/fighter.c#L1906-L1960).

### Evidence boundaries
All owned canonical and rendered lines, all 28 subjects, all 75 facts and all 26 links were reviewed. The ledger retains 67 facts and 25 links, with eight fact exceptions and one link exception marked unresolved. Source literals do not establish `.sdata2` layout, padding or constant ownership. Numeric state values 341/342 remain unvalidated; the reviewed enum identifies SpecialN as `ftCo_MS_Count` and SpecialAirN as its successor. Rendered substitutions are hypotheses, not independent proof.

Status: synthesized; independent review and live promotion pending.
