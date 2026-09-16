## Progressive-scan query scene

`gmprogressive.c` implements resource setup, presentation, per-frame selection and delayed completion, and outcome export. The header declares the three public callbacks with `void*` entry/exit arguments. Canonical source, rather than rendered proposed names, supports these roles.

### Resources and presentation
`gm_801AD088` loads `NtProge.dat` / `ScNtcProgressive_scene_data`, constructs the first camera and model, registers rendering callbacks, and retains the archive, root JObj, text object and SIS context identifier. Saved US language selects `SdProge.usd`; otherwise it selects `SdProge.dat`. Text uses 640×480 bounds and unit font scale; the model initially evaluates animation frame zero. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmprogressive.c#L20-L69)

`gm_801AD254` maps display inputs 0, 1, 2, 4, 5 to SIS indices 6, 2, 3, 5, 4 respectively. Their animation frames are 0, 1, 2, 0, 0. Input 0 translates the model to Y=-15; the others use Y=0. Each handled case unhides text and model. Unhandled values, including 3, still execute the final animation evaluation without case-specific changes. Actual message wording is not available here. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmprogressive.c#L71-L114)

### State machine and exceptional paths
Entry constructs resources, applies the incoming integer presentation, and stores that integer in `x10`. It initializes result/interaction guard `x14` to zero only for incoming 1, otherwise to 2; both counters and the timeout latch are cleared. No incoming-state validation is present. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmprogressive.c#L175-L192)

The first frame only increments `x1C` from zero to one and returns. Thereafter state `x10==3` exclusively advances the enable sequence: at counter 11 it sets the main-library progressive flag, calls `gmMainLib_8015F500`, and calls `OSSetProgressiveMode(1)`; at 110 it sets result 1, applies display 4, and stores state 4. The counter does not advance while waiting for interactive selection and is not reset on confirmation. These are exact counter comparisons, not hardware-success checks.

Outside state 3, left changes 2→1 and right changes 1→2 only while `x14==0`. These are sequential independent tests, followed by confirmation, not mutually exclusive branches. Confirming 1 stores state 3 and hides the presentation. Confirming 2 sets result 2, applies display 5, and calls `OSSetProgressiveMode(0)` **without changing stored state 2 or explicitly clearing the main-library progressive flag**.

Only outside state 3, state 0 or a nonzero result increments `x18` and sets `x20`; a latched timer at least 300 calls `gm_801A4B60`. Consequently incoming state 3, despite initially receiving result 2, runs the enable sequence rather than immediately taking the ordinary timed-exit path. Incoming state 2 is not equivalent to reaching choice 2 interactively: entry locks it with result 2. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmprogressive.c#L116-L173)

### Lifetime and evidence limits
Exit unconditionally writes `x14` through an integer pointer and passes the retained archive to `lbArchive_80016EFC`. It does not itself validate completion, clear retained pointers, or explicitly destroy the text, model and camera. Caller-owned transition storage and subsystem cleanup lifetimes therefore remain cross-file concerns. No allocation-failure handling is visible in setup. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmprogressive.c#L194-L199)

Rendered helper names are reasonable descriptive hypotheses, not recovered original spellings. Source supports field declarations and literal uses, but does not establish compiled section extents, byte ordering, alignment padding or diagnostic-string placement. The review retains 39 facts and all 9 semantic links, with 9 fact exceptions recorded as unresolved.

Status: synthesized; independent review and live promotion pending.
