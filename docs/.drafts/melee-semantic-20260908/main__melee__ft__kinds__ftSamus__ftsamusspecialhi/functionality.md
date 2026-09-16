## Samus up-special lifecycle

This unit exports ten `void(HSD_GObj*)` callbacks: paired grounded-start and aerial-start entry, animation, IASA, physics and collision routines. The header declares all ten; the C file also contains a private effect-cleanup helper. Screw Attack is retained as the baseline gameplay mapping.

### Startup and persistent state

Ground entry selects numeric motion state **353**, aerial entry **354**, both with arguments `(0, 0.0f, 1.0f, 0.0f, NULL)` following the state ID. Both install damage/death and effect-hitlag callbacks, clear all four command variables and `mv.ss.unk5.x0`, process animation, spawn effect **1154** on `FtPart_YRotN`, and set `u.ss.x2244 = 1`. Aerial entry additionally assigns `self_vel.y = x44` and clamps horizontal velocity using `x40`. These motion IDs are not interchangeable with `ground_or_air`: the grounded-start callback suite can subsequently process an airborne fighter. [Startup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftSamus/ftsamusspecialhi.c#L26-L65).

The shared airborne helper sets `GA_Air`, clears ground velocity and vertical animation velocity, exhausts jumps and locks the ECB for five ticks; it is more than generic cleanup. [Helper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcommon.c#L527-L539).

### Reversal

Both IASA callbacks require `cmd_vars[1] == 0` and `mv.ss.unk5.x0 == 0`. They accept only horizontal stick magnitude **strictly greater than** `x4C`, with stick sign opposite an exact facing value of +1 or -1. Success sets both guards before updating facing and rotating part 0 by `M_PI_2 * facing_dir`. Failure makes no local writes. This is one-shot until another writer resets the guards, not an unconditional action-state transition. [IASA](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftSamus/ftsamusspecialhi.c#L112-L166).

### Physics asymmetry

Ground-start physics consumes nonzero `cmd_vars[0]`, calls the airborne helper, clears the command and sets horizontal velocity to `x38 * facing_dir`. It then tests current `ground_or_air == 1`. That branch calls `ft_800851C0`, then move-parameterized `ftCommon_8007D344`, then generic drift `ftCommon_8007D268`; otherwise it calls `ft_80084F3C`. The generic drift calculation comes last and can overwrite the preceding horizontal animation acceleration. Launch assignment can repeat only if another writer sets the command again. [Ground-start physics](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftSamus/ftsamusspecialhi.c#L168-L185), [horizontal solvers](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcommon.c#L336-L428).

Aerial-start physics reverses that effective control order: `ft_80084DB0` checks fast-fall activation, applies fast-fall velocity or gravity bounded by terminal velocity, and computes generic drift; the subsequent `ftCommon_8007D344(fp, 0, x3C, x40)` computes move-specific stick acceleration and target velocity with common aerial friction. Centered input follows the zero-target friction branch. [Aerial callback](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftSamus/ftsamusspecialhi.c#L187-L196), [common aerial physics](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L1363-L1375), [vertical policies and activation guards](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcommon.c#L462-L507).

### Completion and contact exceptions

Both animation callbacks do nothing locally while frames remain. At completion they destroy all effects attached through `efLib_DestroyAll`, clear `x2244`, invoke the airborne helper, and select ordinary Fall when `x50 == 0.0f`; otherwise they call `ftCo_80096900(gobj, 1, 1, 0, x48, x50)`. The zero-valued exception must not be collapsed into unconditional helplessness. [Completion and cleanup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftSamus/ftsamusspecialhi.c#L67-L110).

Both collision callbacks first test `GA_Air`. Nonnegative vertical velocity calls `ft_80081D0C` and returns without local effect cleanup or descending-contact checks. Otherwise direction is +1 only for facing exactly +1, and -1 for every other value. Successful `ft_CheckGroundAndLedge` causes cleanup and `LandingFallSpecial(false, x50)`, then returns. Only failure reaches the cliff test; successful cliff detection causes cleanup before cliff entry. Failed tests have no explicit local transition. The non-air branch delegates to `ft_80084104`. Landing does not repeat the animation callback's zero-x50 ordinary-Fall exception. [Collision](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftSamus/ftsamusspecialhi.c#L198-L262).

### Cross-file lifetime and evidence boundaries

Entry installs `ftSs_Init_80128428` for both damage and death callbacks. That function delegates to neutral-special, side-special and common cleanup routines; the reviewed body does not directly clear `x2244`. Therefore local normal-exit cleanup is established, but complete interrupted-exit lifetime is not. The private helper's spelling contains `x2444`, while its actual field write is `x2244`. [Installation](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftSamus/inlines.h#L17-L22), [delegation](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftSamus/ftsamus.c#L287-L292).

Canonical and rendered views were reviewed completely. Rendering reported no parse errors; substituted names were treated as hypotheses, with physics semantics checked against canonical callees. Source literals do not establish compiled `.sdata2` size, membership, representation, alignment or load provenance. All four section facts and its mechanic link remain unresolved rather than being promoted from source-level expressions.

Status: synthesized; independent review and live promotion pending.
