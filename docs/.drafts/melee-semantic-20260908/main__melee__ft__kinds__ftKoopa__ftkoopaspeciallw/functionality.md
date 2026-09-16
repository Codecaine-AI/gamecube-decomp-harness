## Bowser down-special callback module

The C file implements ground-start, aerial, effect, collision and landing callbacks for Bowser's SpecialLw/Bowser Bomb. The header declares all thirteen public functions with `void(Fighter_GObj*)` signatures; the two effect callbacks and shared initializer are private. Rendered substitutions were reviewed as hypotheses, not evidence of recovered original names.

### Entry and phase progression

Ground-start entry clears horizontal and vertical self velocity, calls `ftCommon_8007D5D4`, enters numeric motion state `0x169` at frame 0/rate 1, initializes animation and resets shared controls. The common helper explicitly sets `GA_Air`, clears selected movement fields, marks one jump used and locks the ECB for 10 ticks: a grounded-named motion does not imply grounded fighter handling. Aerial entry instead multiplies horizontal and vertical velocity by attributes `x80` and `x84`, then enters numeric state `0x16A`. Multiplication alone does not prove attenuation. Both entries clear command slots 0 and 1, the throw flag and vertical translation offset, and set `x2223_b4`.

Evidence: [entry and initializer](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKoopa/ftkoopaspeciallw.c#L39-L70); [airborne helper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcommon.c#L515-L525).

Ground-start animation exhaustion invokes `ftKp_SpecialLw_80134988`, whose sole operation enters the explicitly named `ftKp_MS_SpecialAirLw` at frame 30, rate 1, with mask `0x0C4C5088`. Numeric entry states are not silently equated with enum values; the mask's exact cross-transition preservation semantics remain unverified. Aerial animation exhaustion does not change motion state: it writes integer 1 to command slot 1.

### Physics and effects

Startup physics obtains translation-derived velocity through `ft_80085134`, then replaces only negative vertical velocity with zero. Aerial physics applies fall using `x8C/x90` and air friction using `x88`. It sets vertical velocity to `x94` if the current value is numerically below `x94` or command slot 1 is nonzero. With that command active it also zeros horizontal velocity and, while the shared effect latch is clear, schedules `fn_80134590`.

`fn_80134590` conditionally spawns effect `0x4DF` using `fp->parts->joint`; landing's `fn_80134518` conditionally spawns `0x4D8` at `fp->cur_pos`. Both set `x2219_b0` after spawning, and both install effect-hitlag callbacks and clear `accessory4_cb` even when spawning was skipped. These are self-retiring callbacks, not proof of hitbox creation. Neither local entry explicitly resets the effect latch. The common destroy-effects helper clears it, but the precise transition-time destruction/rearming lifecycle was not established.

Evidence: [animation and physics](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKoopa/ftkoopaspeciallw.c#L72-L113); [effect callbacks](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKoopa/ftkoopaspeciallw.c#L16-L37); [translation velocity](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_084E.c#L120-L125); [effect destruction](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcommon.c#L650-L655).

### Collision and landing

The ground-start collision callback forwards unchanged to the aerially named resolver. A successful facing-sensitive ground/ledge test enters the impact helper only if command slot 0 is nonzero and vertical velocity is nonpositive. Otherwise it calls the airborne-reset helper and unlocks the ECB—not an ordinary air-to-ground conversion. Only when the first test fails does command slot 0 gate the cliff-check/entry path. The local module resets slot 0 but does not show its activation producer.

Impact entry first writes zero to ground velocity, calls `ftCommon_8007D7FC`, enters numeric state `0x16B` at frame 0/rate 1 with zero flags and schedules the positional effect. Common grounding includes conditional bookkeeping, sets ground velocity from horizontal self velocity, resets jump counters, unlocks the ECB and checks ground validity. Consequently the initial ground-velocity zero is not independently a guaranteed final value.

Landing physics delegates to speed-conditioned ground friction followed by ground movement. The multiplier's magnitude is not established. Animation exhaustion invokes `ft_8008A2BC`: its general implementation has special hand-boss dispatch; ordinary fighters reach a neutral-state helper with exceptional early exits before its usual Wait transition.

Landing collision must be recorded literally: `ft_80082708(gobj) == GA_Ground` triggers `ftCo_Fall_Enter`. The helper maps its `fall_off_ledge` boolean to `GA_Air` when true and `GA_Ground` otherwise. This mismatch prevents confidently normalizing the local branch to 'lost ground support'; no source correction is proposed.

Evidence: [collision and landing](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKoopa/ftkoopaspeciallw.c#L115-L168); [common grounding](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcommon.c#L546-L594); [landing physics helper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_084E.c#L42-L53); [ending helper exceptions](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_08A1.c#L53-L109); [collision return mapping](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L393-L404).

### Evidence limits

Source consumers establish uses of 0.0f, 1.0f and 30.0f, not their compiled placement, pool payload or layout in `.sdata2`. No compiled artifacts were supplied. Proposed GFX, phase-transition and landing-entry names remain semantic hypotheses. Historical duplicate links remain separately accounted for without merging their IDs.

Status: synthesized; independent review and live promotion pending.
