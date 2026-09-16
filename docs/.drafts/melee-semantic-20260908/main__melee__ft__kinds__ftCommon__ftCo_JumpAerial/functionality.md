# ftCo_JumpAerial translation unit

## Scope and naming
Provides airborne-jump eligibility, dispatch, local character entry and animation/input/physics/collision callbacks. The active JumpAerialF/B table uses ftCo_JumpAerial_Anim, ftCo_JumpAerial_IASA, ftCo_JumpAerial_Phys and ftCo_JumpAerial_Coll. Canonical symbols remain authoritative. The rendered ftCo_JumpAerial_Enter and ftCo_JumpAerial_UpdateTurn names remain reasonable descriptive hypotheses, not recovered historical names; dependency substitutions cannot prove themselves. Supported upstream names, facts and links are retained without equivalent rewrites.

## Eligibility and entry
ft_did_jump requires remaining jump capacity and either qualifying tap-stick input/timer or newly pressed X/Y, plus an optional separate x68A/common-x1C rejection. X/Y bypass tap timing, not capacity or the optional gate. Equality passes the stick threshold and optional timing boundary but fails capacity and tap-window boundaries. There is no local airborne-state check. NaN fails the tap comparison without disabling a qualifying button route.

The two wrappers reject a held Hammer and dispatch to ordinary or multijump eligibility with false/true modes. Later multijump branches do not apply that flag uniformly; the external 0x9B branch remains numerically identified. Ordinary dispatch prioritizes the held Screw Attack item before Ness/Yoshi/Peach/Mewtwo/Basic selection. ItemScrew scales the supplied vector's X/Y in place before shared entry.

The shared initializer changes motion, sets x2221_b7, synchronously copies three velocity components, optionally writes the vertical-stick timer to 0xFE, increments jumpsUsed and invokes the canonical setup/sound helpers. It neither retains nor owns the vector. Local callers pass stack vectors; multijump actively uses the false timer branch. Each of the five local entries first calls ftCommon_8007D5D4, resetting jumpsUsed to 1 before the shared increment to 2, and sets cmd_vars[0] to 1.

Basic supplies attribute-derived X/Y. Ness starts with a zero vector, installs its specialized physics and retains stick-scaled horizontal velocity. Peach and Mewtwo start with stick-scaled X and zero Y/Z and install the shared physics override. Basic/Ness/Peach/Mewtwo select F only for facing-relative input strictly greater than -common x78; equality/unordered selects B. Yoshi always selects F, installs shared physics and its animation override, assigns dmg.armor1, optionally initializes an opposite-input turn counter, and immediately advances it.

## Turn and transition lifetime
The turn helper skips a zero counter. Otherwise it decrements, rotates the root by -MTXDegToRad(180.0F / duration), and flips facing when the decremented counter equals integer duration/2. Positive matching duration/counter N with uninterrupted calls gives N steps and a flip after ceil(N/2) calls. Neither duration validity nor matching initialization is checked. Yoshi and JumpAerialF1 share this helper.

Common animation completion enters FallAerial, whose entry changes motion and writes move variables. Yoshi's callback then calls the turn helper without a transition guard. The trailing call therefore observes current state, not necessarily the old counter. Exact compiled union overlap and resulting counter values remain unresolved; callback replacement does not cancel the currently executing function.

## Interrupts and movement
IASA tests, in canonical order: ftCo_SpecialAir_CheckInput; ftCo_80095328(gobj,NULL); ftCo_800D7100; ftCo_800C3B10; ftCo_80099A58; ftCo_AttackAir_CheckItemThrowInput; ftCo_800D705C; ftPe_8011BA54; ftCo_800CB870; cmd_vars[0] && ftPe_8011BAD8; !cmd_vars[0]; ftCo_800CEE70. It stops on success. Command state is read at the tail rather than snapshotted. ItemScrewAir and JumpAerialF1 reuse it. Opaque delegate gameplay aliases remain deferred.

Ordinary table physics delegates to ft_80084DB0. The distinct character-installed ftCo_JumpAerial_Phys_Cb calls common horizontal control then ft_800851D0, assigning Y from transNOffset.y with an optional x197C-dependent scale. Peach FloatFall directly reuses this override. Ness first computes input-dependent horizontal control using init_h_vel, accumulates and clears x74_anim_vel.x, reconstructs X as transNOffset.z * facing_dir + init_h_vel, then performs the same vertical assignment. The field name does not establish exclusively animation-authored provenance.

## Collision and limits
Collision delegates to ft_800835B0 with ftCo_80096CC8 and ft_80082B1C. The query synchronizes positions and selects its collision query using facing and ledge-cooldown/flag state; ft_80081A00 can suppress contact. The floor predicate rejects line -1, accepts nonplatform lines and requires stick Y strictly greater than common x25C for platforms. Accepted contact chooses ft_8008A2BC only when self_vel.y > ftCo_800D0EC8(fp); equality/unordered goes to basic landing. Otherwise wall-jump, cliff and ftCo_8009EF68 are tried in order. The last handler's complete semantics remain unresolved.

Source literals and zero vectors do not prove .rodata/.sdata/.sdata2 allocation, sizes, padding or relocations. Exact trajectories, jump pauses, attack elongation, armor formula/lifetime, opaque delegate meanings and x68A/x1C gameplay identity remain deferred. Local code assumes valid Fighter, attributes, common data and joints rather than validating them. No unconditional turn guarantee or compiled layout claim is made.


Status: synthesized; independent review and live promotion pending.
