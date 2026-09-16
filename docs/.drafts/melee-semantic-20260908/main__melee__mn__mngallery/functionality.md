## Gallery movie-selection scene

The unit implements a two-entry movie selector backed by `MvOmake15.mth` and `MvHowTo.mth`. Entry loads the Gallery panel and cursor resource descriptors, constructs one parent model and two indexed cursor objects, registers an independent input process, creates selection text, and retains a 640×480 movie camera. It sets menu ID `0x1A`, input cooldown 5, and initial selection zero. [Initialization](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mn/mngallery.c#L399-L517)

### State and input behavior

- State 0 increments the entrance frame while below 19; the following update enters state 1 without incrementing it again.
- State 1 accepts bounded two-entry navigation and confirmation. Up precedes Down, which precedes A/Start in the ordered branch chain.
- State 3 delegates movie servicing and suppresses parent-model animation.
- State 2 ignores input and advances the exit frame while below 29; the following update writes state 4 and requests parent/cursor destruction.
- Cooldown suppresses all input-process work, including movie servicing. After the state-3 and state-2 early returns, Back is checked before the state-1 navigation guard, so Back is also accepted during entrance.

The parent animation callback reapplies the stored frame on every non-playback update, including after its teardown request. [Input and transition callbacks](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mn/mngallery.c#L234-L346)

### Playback and rendering

`mnGallery_80258940` unconditionally allocates `0x271000` bytes into `rate_table`; it does not check for an existing allocation or free an old one. Startup reuses this workspace for either movie. Mode 0 creates a 448×336 surface positioned at 96,72 and uses audio selector `0x52`; mode 1 creates a 640×480 surface positioned at zero and uses selector `0x24`, with `gm_801ACC94()` supplying the second movie-start argument. Startup rejects an already-active session or a mode outside 0..1, but does not inspect a movie-start result before setting the active latch. [Allocation and offsets](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mn/mngallery.c#L21-L61) · [Startup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mn/mngallery.c#L123-L168)

Playback servicing ORs trigger inputs from all four controllers and masks them with `0x1300`. Each nonzero movie-status sample increments the byte counter; a zero sample does not reset it. Exit occurs on masked input, a counter greater than 50, or a nonzero `gmMainLib_8046B0F0.xC` combined with a zero movie-status result. It writes state 1 and invokes the menu-camera restoration helper; active-session cleanup stops playback, restores audio, clears the active flag and counter, and destroys/nulls the movie-rendering GObj. Only input-triggered termination plays the Back sound. These numeric tests should not be replaced by an unqualified claim of consecutive timeout samples or a newly inferred movie-status enum. [Playback servicing](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mn/mngallery.c#L194-L232)

The camera is orthographic, with viewport/scissor matching the supplied dimensions, horizontal bounds 0..width, vertical bounds 0..−height, and near/far values 0 and 2. Its callback runs only in state 3. Successful preliminary camera activation produces an opaque-black color clear; failure skips that clear but does not skip SObj display delegation. The delegated routine performs its own activation attempt and render-group dispatch. [Gallery camera](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mn/mngallery.c#L63-L121) · [Delegated display](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/sobjlib.c#L543-L565)

### Cursor and ownership behavior

Each cursor copies translation from its indexed parent joint when that joint exists, selects material frame 1 or 0 according to selection equality, and independently selects texture frame equal to its index. The callback has no state-3 guard or separate timer. Parent and cursor userdata are attached with `HSD_Free` destructors. The movie workspace is distinct from per-session rendering objects; no workspace release is present in this unit. [Cursor callback](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mn/mngallery.c#L348-L393) · [Object construction](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mn/mngallery.c#L418-L469)

Exit teardown requests parent destruction before reading and clearing its child slots, then continues to access the parent userdata and model. This is not sufficient evidence of a use-after-free: `HSD_GObjPLink_80390228` explicitly defers destruction when its current-process guard matches. Immediate destruction follows the other branch. Scheduler context remains important to this cross-file lifetime contract. [Teardown order](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mn/mngallery.c#L305-L346) · [Deferred destruction branch](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobjplink.c#L103-L126)

### Semantic review outcome

Existing inferred names fit their canonical implementations and are retained. Three unnamed callbacks admit useful role-specific names. One playback-purpose explanation is corrected to distinguish accumulated status samples from consecutive persistence. Six compiled-layout/type claims remain unresolved: declarations and literal uses do not establish section sizes, membership, adjacency, or pooling. Other retained section-subject knowledge is supported for its source-level roles, not as fresh compiled-layout proof.

All owned canonical and rendered pages were reviewed. The C renderer reported seven parse errors and zero substitutions; its name annotations were treated as hypotheses. The header rendered five substitutions without parse errors. Neither rendered view was used to prove its own proposed names.

Status: synthesized; independent review and live promotion pending.
