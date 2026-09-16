## Opening-movie scene

`gmopening.c` owns opening presentation setup, a timeline-driven frame callback, a shared orthographic movie-camera helper, and optional MTHP diagnostic labels. The header declares these functions and exports the opening timeline and sprite-descriptor pointer. Rendered names were treated as hypotheses, not evidence.

### Camera and entry

`gm_801A9DD0` allocates an orthographic CObj, attaches it to the supplied GObj, and installs `HSD_SObjLib_803A54EC`. Width and height determine the full viewport/scissor. Projection bounds normally span `(0, 0)` to `(width, -height)`; nonzero final argument changes only horizontal projection bounds to a centered 584-unit interval, using signed integer division. Eye is `(0,0,1)`, interest `(0,0,0)`, roll/near zero and far 2. No allocation-failure handling is present. Canonical callers independently confirm reuse by opening, How-To, Omake15 and ending movies. [Camera](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmopening.c#L44-L90)

Entry clears the timeline, one-shot guards and temporary-object slots, calls title/audio setup, creates two 640×480 cameras and the MTHP display object, and starts `MvOpen.mth` with `{1250,2,394,1,65536,2}`. Camera helper priorities are 8 and 11; `gxlink_prios` masks are separately `0x800` and `0x20000`. Entry publishes `fn_801AA0E8` through `gm_804D6724` after movie startup—it does not directly invoke registration. [Entry](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmopening.c#L139-L188)

### Timeline and exceptional branches

Each frame calls `lbMthp_8001F578` and reads `lbMthp_8001F5C4`. If the previous stored timeline exceeds 5400 it increments locally; otherwise it receives the getter result cast to `u32`. Thus this is not an unconditional movie-frame copy, and exact physical time units are not established here.

US language settings trigger sound `0x4E21` once at ≥5034. Other settings trigger `0x4E22` at ≥4980 and `0x4E23` at ≥5100. A separate guard invokes `gmMainLib_8015F500` at ≥4980. The sprite slot is created only within `[454,514)` and deleted at ≥514; its coordinates are 82 and 290. The title-helper slot is created only within `[950,974)` and deleted at ≥974. A jump past either creation window does not retroactively create its object. [Early timeline](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmopening.c#L197-L245)

At ≥5130, a one-shot title helper runs and records a `u32` deadline using `600.0f + (400.0f + timeline)`. Nonzero `lbMthp_8001F604`, together with title activation, triggers `gm_PreloadTitleDemo` once. Exit branches then have strict precedence:

1. Activated title plus exact deadline equality calls `lbAudioAx_800236DC` and `gm_801A4B60`, without explicitly selecting `GM_TITLE`.
2. Otherwise, `gmMainLib_8046B0F0.xC` with zero MTHP status performs its distinct cleanup, calls `gm_801A4B74`, and selects `GM_TITLE`.
3. Otherwise, timeline >5500 accepts Start only, performs additional helper calls, and selects `GM_MENU` only when `gm_80173754(GM_MENU,0)` returns false; it marks a pending mode either way.
4. At timeline ≤5500, Start or A selects `GM_TITLE` with the early-skip cleanup sequence.

Neither deadline equality nor the exceptional status branch should be normalized to a generic completion test. [Late timeline](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmopening.c#L246-L290)

### Diagnostics and cross-file lifetimes

`fn_801A9FCC` refreshes three records of a static `PerfLabelLine[4]`: two integer readings and a third divided by ticks per millisecond, formatted with `\\cffff00` prefixes. It clears auxiliary fields and returns the array base. The assignment linking record two to record three is immediately overwritten with NULL, leaving only three reachable records. `fn_801AA0E8` forwards the producer to `hsd_80392528`; canonical HSD code supplies priority `0x80` and later invokes producers to render their returned items. [Producer](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmopening.c#L103-L137) [Registry](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3924.c#L24-L64) [Consumer](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3924.c#L158-L195)

The shared scene debug path invokes the published hook when enabling its diagnostic object. Scene initialization resets both the registry and callback slot; gmopening does not locally own their entire lifetime. The sprite descriptor is exported and populated from `TitleMark_sobjdesc` by title loading, not reset by opening entry. The deadline is likewise assigned on title activation rather than cleared at entry. Camera/movie objects have no local teardown in this TU; temporary overlay objects do. [Debug hook](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1A45.c#L107-L131) [Shared reset](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1A45.c#L214-L238) [Descriptor](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmtitle.c#L239-L252)

### Evidence limits

Source verifies declarations, constants and their consumers, but does not establish compiled section sizes, padding, literal placement or exclusive pool representation. No compiled artifacts were supplied. Descriptive inferred names remain hypotheses. The header renderer reports `fn_801A9FCC` as `shadowed_binding`, leaving its declaration unsubstituted despite substituting the implementation.

Status: synthesized; independent review and live promotion pending.
