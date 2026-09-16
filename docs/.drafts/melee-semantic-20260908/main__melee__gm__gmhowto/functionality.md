## How to Play movie scene

`gmhowto.c` owns the tutorial movie's static timing table, a table accessor, a stored display-GObj pointer, and entry/frame callbacks. The header declares all three functions; the entry context is unused. Both complete canonical files and their rendered views were reviewed. Rendered substitutions are semantic hypotheses, not independent naming evidence.

### Timing data and lifetime

`gm_803DD2C0` contains 74 `u32` values: 37 consecutive `(frame_count, ticks_per_frame)` pairs ending in `(65536, 1)`. `gm_801ACC94` returns `&gm_803DD2C0` without allocation, copying, mutation or validation. Its canonical signature remains `UNK_T (void)`; `u32*` describes consumer semantics rather than the literal return expression's type. The dedicated scene passes the table directly for `MvHowto.mth`; gallery mode 1 obtains it through the accessor for `MvHowTo.mth`. These string spellings are preserved, not normalized. [Definition and entry](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmhowto.c#L14-L48), [gallery consumer](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mn/mngallery.c#L123-L168).

The movie player retains the pointer, rather than copying the table. Its periodic 60 Hz callback maps a playback counter through successive pairs, advancing the counter when the decoded frame has caught up. The final pair is a large finite tail, not a terminator checked by the parser. Static storage supports this asynchronous lifetime. [Timing consumer and startup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbmthp.c#L449-L546).

### Entry and shared callback

Entry creates camera and display GObjs, uses 640×480 dimensions, selects GX link 11, attaches the SObj marker, and installs `lbMthp_8001F67C`. It stores the second GObj in `gm_804D6850`, but all subsequent local setup uses `gobj`; this complete unit never reads the stored slot back. Audio calls select argument `0x24` and bracket movie startup with `lbAudioAx_80024E50(1)` and `(0)`. Startup supplies null buffer, zero heap size and zero loop arguments. There are no local allocation-failure branches. [Entry](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmhowto.c#L27-L48).

The assignment `gm_804D6724 = fn_801AA0E8` installs a shared diagnostic registration callback, not movie teardown. Its implementation registers a producer of movie performance-label lines; a game-manager diagnostic-display path invokes the shared pointer, and manager initialization resets it. [Callback implementation](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmopening.c#L103-L137), [invocation](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1A45.c#L110-L131), [reset](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1A45.c#L214-L240).

### Frame processing and exceptional branches

Each frame snapshots playback state through `lbMthp_8001F578` and calls `lbMthp_8001F5C4`, discarding its returned counter. A local flag becomes true when `gmMainLib_8046B0F0.xC` is set and the first queried movie status is zero. The exit block is entered for a subsequent nonzero status, newly triggered Start/A across controllers, or that local flag. Status and input are queried separately, so this is not a single cached-state test.

The exit block calls both audio shutdown helpers, then calls `gm_801A4B74` for the local-flag case or `gm_801A4B60` otherwise. Those helpers write manager exit codes 2 and 1; they do not themselves destroy movie objects. A fresh Start/A query has routing priority: it plays `sfxForward`, queues `GM_TITLE`, and marks a new mode pending. Without that input, the callback increments the value returned by `gmMainLib_8015DB00` and requests state ID 0 only when that value is not 5. At value 5, the exit request still occurs but neither advancement call runs. The getter/incrementer operate on `gmMainLib_804D3EE0->unk_1`; no stronger interpretation of 5 or xC is established here. [Complete frame callback](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmhowto.c#L50-L83), [exit-code setters](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1A45.c#L170-L178), [sequence accessors](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmmain_lib.c#L719-L732).

This unit contains no direct movie-player stop, object destructor, or stored-slot reset. The gallery has its own explicit stop/destruction paths; those must not be attributed to the dedicated scene. Player shutdown cancels the alarm and frees an internally allocated buffer when present. [Gallery teardown](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mn/mngallery.c#L174-L188), [player teardown](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbmthp.c#L637-L653).

No compiled section placement, extent, padding or layout is claimed from the source or frozen `.data`/`.sbss` target names.

Status: synthesized; independent review and live promotion pending.
