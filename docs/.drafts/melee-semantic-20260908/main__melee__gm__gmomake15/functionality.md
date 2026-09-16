## Omake15 scene

The unit implements entry and frame callbacks for playback of `MvOmake15.mth`. The standing Special Movie identification is retained with its frozen documentary support; the canonical source itself establishes the Omake15 asset identity, not its duration or regional menu availability. The header declares both callbacks and contains no additional behavior.

### Entry

`gm_Scene_Omake15_OnEnter(void* unused)` performs a linear, unguarded setup. It creates a GObj with `(0x13, 0x14, 0)`, passes it to `gm_801A9DD0` with `(640, 480, 8, 0)`, and assigns GX-link mask `0x800`. Independently read helper code confirms an orthographic camera with full-width projection for the zero final argument. A second GObj, created with `(0xE, 0xF, 0)`, is stored in the file-local `gm_804D6858`; subsequent setup uses the local pointer. The callback attaches the SObj library, registers `lbMthp_8001F67C` at link 11, creates a 448×336 SObj, and assigns `x10=96.0f`, `x14=72.0f`. Those values yield centered geometry within 640×480. Audio calls occur in the exact sequence `lbAudioAx_80023F28(0x52)`, `lbAudioAx_80024E50(1)`, movie startup, then `lbAudioAx_80024E50(0)`. No allocation checks or local recovery branches appear. Finally, it publishes `fn_801AA0E8` through `gm_804D6724`.

Evidence: [entry](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmomake15.c#L16-L37), [camera helper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmopening.c#L44-L90), [surface and renderer](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbmthp.c#L594-L634).

### Frame behavior

The frame callback calls `lbMthp_8001F578` and discards the result of `lbMthp_8001F5C4`. Their implementations respectively snapshot player fields under interrupt protection and return `MoviePlayer.unk_84`; this does not establish synchronous decoding advancement. `lbMthp_8001F604` returns `MoviePlayer.unk_144`, so its rendered name `IsFinished` must not erase numeric-status uncertainty.

A local flag becomes true when `gmMainLib_8046B0F0.xC` is nonzero and a status read returns zero. Termination handling is entered on a subsequent nonzero status read, Start/A triggers, or that local flag. It calls `lbAudioAx_800236DC`, chooses `gm_801A4B74` for the local-flag path or `gm_801A4B60` otherwise, and calls `gmMainLib_8015DB0C(0)`. The two scene helpers write scene-loop state 2 and 1 respectively; they are not immediate object destructors.

The inner branch queries Start/A again. Input or the local flag requests pending `GM_TITLE` and marks the new mode pending. `sfxForward()` runs only when this inner branch is taken without the local flag. Thus the global-condition path suppresses sound even with simultaneous input, and nonzero status alone does not directly schedule title. Status and input calls are repeated rather than cached, which should be preserved in any equivalent description.

Evidence: [frame](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmomake15.c#L39-L72), [player getters](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbmthp.c#L548-L582), [scene-state setters](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1A45.c#L170-L178).

### Cross-file lifetime and evidence boundaries

The stored GObj handle is neither read back nor cleared in this unit. Movie teardown and GObj destruction are not implemented here. The shared published hook registers a callback that constructs movie-related performance label lines; the scene framework invokes it when creating a diagnostic display and clears the shared hook during framework initialization. It is not a movie teardown callback. The MTHP subsystem separately provides alarm cancellation and allocated-buffer freeing, but this unit does not call that teardown function directly.

Evidence: [hook implementation](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmopening.c#L103-L137), [hook consumer](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1A45.c#L107-L132), [framework reset](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1A45.c#L214-L241), [MTHP teardown](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbmthp.c#L637-L653).

The filename contains 12 characters, hence 13 bytes including its terminating NUL—not the baseline's 14 bytes. No compiled artifacts were supplied, so section extent, literal-pool order, padding, and exact section payload placement remain unproven. Rendered substitutions were reviewed as hypotheses, not independent evidence. Both parameter identities were enumerated; neither has baseline facts, and no identity merge is proposed.

Status: synthesized; independent review and live promotion pending.
