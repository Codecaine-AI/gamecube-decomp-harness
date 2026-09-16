## Kirby copied Needle Storm

The unit implements grounded and aerial Start, Loop, Cancel and End callbacks, charge accessors, interruption cleanup and per-shot projectile creation.

- Entry clears transient command and move-local fields, preserves nonzero needle stock and changes zero stock to one. It installs Kirby's damage/death callbacks and starts animation processing.
- Startup completion attempts to create the held-needle item attached at part 39, stores its nullable result and enters the corresponding charging Loop regardless of creation success.
- Charging increments stock at animation frame zero and clamps an attempted increment beyond six. A separate counter gates charging sound; saturation sets it to 100 and requests color animation 87 without leaving the loop.
- Loop input prioritizes B release over shield input. Release enters End and installs the firing accessory callback; LR press while B remains held enters Cancel.
- End animation raises shot requests at update-counter values 2, 5, 8, 11, 14 and 17. The accessory callback consumes a request even with empty stock. With positive stock it attempts one projectile, consumes one needle and emits effect/sound even if construction fails. Ground and air use distinct offsets, with doubled random vertical variation in air.
- Cancel clears the held-item reference without locally consuming stock. Held-item code independently queries that reference for lifetime and the stock accessor for visibility of six needle models; owner-null and owner-mismatch branches remain significant.
- Interruption cleanup invalidates the held reference and attempts mode-1 dropped-item creation for each stock unit. This differs from normal mode-0 firing. Its nonzero decrement loop assumes normal nonnegative stock; malformed negative stock is not safely covered by a universal termination claim.
- Physics delegates to common ground friction/movement or airborne gravity/friction. Start and Loop collision callbacks preserve their phase across ground/air transitions. End collision exits clear remaining stock and pending shot; aerial Cancel/End use basic landing, whose helper includes a hammer exception.
- Nonzero `specialn_sk_freefall_toggle` is forwarded as landing lag to the common special-fall helper. That helper has an early `x2224_b2` diversion and separate grounded-conversion versus airborne jump-consumption branches.

## Semantic assessment

The existing inferred names fit canonical behavior and independently read native analogs. `CheckAndDestroyNeedles` describes charge disposal rather than a direct item-destruction call. No equivalent-wording renames are proposed. Rendering completed without parse errors; its function-only substitutions are hypotheses, not independent proof.

Seven factual corrections address obsolete input-field names, collision-query side effects, overbroad special-fall jump-consumption claims, unsupported null tolerance and cleanup-loop termination. The checkpoint explicitly accounts for all 213 facts and 84 links. Four `.sdata2` facts and two related links remain unresolved because source literals do not prove compiled section membership or pool payload.

Collision enum names remain ambiguous evidence: grounded callbacks literally test `ft_80082708(...) == GA_Ground`, whereas the helper returns `fall_off_ledge ? GA_Air : GA_Ground`. Aerial callbacks use `!= GA_Ground` or a nonzero test. These tests are preserved without silently normalizing their polarity. Both accessors also evaluate `GET_FIGHTER` before their explicit null guards; compiled null behavior has not been established.

Status: synthesized; independent review and live promotion pending.
