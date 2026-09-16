## Zero-HP defeat
`ftCo_800C8C84` initiates defeat only when presentation has not started, `x2225_b7` is set, `dmg.x18F0` is zero, and indexed remaining HP is zero. Its true result means initialization was invoked, not merely that HP is exhausted. `fn_800C8E74` dispatches Master Hand and Crazy Hand directly to their specialized handlers and game notification, bypassing ordinary pending processing. Other fighters receive `x2224_b3`; existing knockback causes immediate presentation, otherwise presentation is deferred. Pending alone does not block repeated initiation.

`ftCo_800C8D00` consumes the pending request. It starts presentation only if necessary, resets input, selects color animation 0x7A, plays character SFX entry xC, sets presentation flags, flashes the background, and reports defeat. The sound helper ignores its supplied FtSFX pointer and reloads the table through Fighter data. Cleanup releases heavy items and resolves capture relationships according to `x221B_b5`. Airborne routing uses the DamageFall helper, including its Parasol substitute; every non-air value selects DownSpot. The pending flag is then cleared.

## Material and temporary lifetime
`ftCo_800C8F6C` loads a shared joint asset, caches its MObj in `ft_804D6588`, and conditionally writes material diffuse color from common data. It runs during fighter-subsystem startup. The missing-DObj branch selects null but does not protect the subsequent MObj dereference; a valid MObj is an asset invariant. This cache is distinct from the analogous `ft_804D6580` cache.

`ftCo_800C8FC4` conditionally initializes `x2034`, `x2038`, and `x2227_b3` from player configuration and common data, then configures rendering. These fields are not metal timer, metal health, or the metal flag. Damage accounting decreases `x2038` when `x2034` is nonzero. Per-frame processing, under `x2227_b3` and nonzero `x2034`, decrements the counter and invokes `ftCo_800C9034` when it reaches zero or health is nonpositive. An initially zero counter bypasses that entire test. The wrapper selects effectless death cleanup and inert Sleep entry; the delegated inactive guard makes repeated deactivation harmless.

## Semantic review
Supported baseline knowledge is explicitly retained through the inherited research dispositions. The rendered views expose a duplicate `ftCo_StaminaDeath_Enter` hypothesis and an incorrect `ftCo_InitMetalFromPlayer` hypothesis. The proposals distinguish initiation from pending completion and replace the unsupported metal interpretation without guessing a specific gameplay identity. No compiled section payload or layout conclusion is established by the authored source.

Status: synthesized; independent review and live promotion pending.
