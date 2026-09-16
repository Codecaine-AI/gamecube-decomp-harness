## Purin down-special lifecycle

This unit implements the grounded and aerial SpecialLw callback suite, mapped in the frozen baseline to Jigglypuff's Rest. The header declares all twelve functions; its HSD_GObj pointer declarations coexist with Fighter_GObj pointer spelling in several definitions. Neither the header address comments nor source literals establish compiled layout.

### Entry and callback lifetime

Both entry routines select the left-facing state only when facing_dir equals -1; every other value selects the right-facing state. Fresh entry uses flags 0, frame 0, rate 1, zero blend and NULL alternate animation source. After ftAnim_8006EBA4, each routine reloads the Fighter from user_data, clears cmd_vars[0], and installs ftPr_SpecialHi_8013CE7C in accessory4_cb. That foreign callback clears accessory4_cb when invoked; the installation does not establish when invocation occurs. The two situation-conversion helpers do not explicitly repeat this initialization or reinstall the callback.

Evidence: [entries](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPurin/ftpurinspeciallw.c#L18-L50), [callback cleanup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPurin/ftpurinspecialhi.c#L163-L167).

### Animation, interrupts and physics

Animation callbacks do nothing while frames remain. On exhaustion, aerial Rest enters ftCo_Fall_Enter; grounded Rest calls ft_8008A2BC. The latter is not unconditional Wait: it dispatches hand bosses separately, and its ordinary helper has DownSpot and another common-state early exit before normal Wait handling. Both IASA bodies are empty, proving only absence of move-specific IASA work, not immunity to external interruptions.

Ground physics forwards to ft_80084F3C, which conditionally multiplies friction when absolute ground speed exceeds walk_max_vel, then applies friction and ground movement. The multiplier's value was not established, so an increase is not guaranteed by this code alone. Aerial physics forwards to ft_80084EEC, which applies fall physics followed by air friction, without the neighboring helper's explicit fast-fall or stick-drift calculation.

Evidence: [callback bodies](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPurin/ftpurinspeciallw.c#L52-L78), [common exit exceptions](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_08A1.c#L53-L109), [physics implementations](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_084E.c#L8-L53).

### Ground/air continuity and unusual collision result

Ground collision calls ftPr_SpecialLw_8013D104 when ft_800827A0 returns false. The helper performs airborne conversion, then selects SpecialAirLwL or SpecialAirLwR using the same exact facing guard. Air collision calls ftPr_SpecialLw_8013D19C only when ft_80081D0C returns a value unequal to GA_Ground. This predicate must not be inverted based on enum names: the collision helper synchronizes positions, calls map collision, returns GA_Ground if ft_80081A00 succeeds, and otherwise returns GA_Air for a truthy map result and GA_Ground for a false result.

Both conversion helpers pass cur_anim_frame, mask 0x0C4C508E, rate 1, zero blend and NULL, with an early return after the left-facing branch. Their descriptive GroundToAir and AirToGround names are supported by canonical destinations and common conversion bodies, independently of rendered names. Current-frame continuity is established; blanket preservation of all move state is not. Airborne conversion changes movement bookkeeping, jumps-used and ECB locking. Ground conversion includes conditional bookkeeping, velocity handling, jump resets and an assertion if valid ground cannot be established.

Evidence: [collision and transitions](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPurin/ftpurinspeciallw.c#L80-L118), [collision return semantics](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L105-L123), [conversion side effects](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcommon.c#L515-L594).

### Evidence boundaries

Canonical and rendered views of both owned files were reviewed completely, together with all 26 subjects, 71 facts and 33 links. Rendered function substitutions are hypotheses, not independent evidence. Rest hitbox timing and recovery duration remain baseline gameplay context, not mechanics established by these callback bodies. Five .sdata2 facts and two associated links remain unresolved because no compiled evidence establishes section contents or ownership. One ground-physics fact remains unresolved because multiplication does not by itself prove upward scaling.

Status: synthesized; independent review and live promotion pending.
