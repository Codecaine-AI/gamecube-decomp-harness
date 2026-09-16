## Normal-intro presentation

This translation unit constructs and updates the `IrNml` Normal-intro scene, releases its archive on leave, exposes its camera animation frame, and supplies a separate Training-mode predicate. The header declares nine public functions. Proposed rendered names remain descriptive hypotheses, not evidence of original names.

### Entry and resources

`gm_Scene_IntroNormal_OnEnter` consumes a payload containing a controller selector, stage-resource index and 16-bit stage kind. It initializes stage/gameplay-support systems, resets shared flags and animation states, loads `ScItrNormal_scene_data` and an indexed `mc01`–`mc12` symbol from `IrNml`, and configures audio. The audio tables contain twelve entries; BGM values are `0x1C` except indices 9 and 10 (`0x14`). The selected audio mask is ORed with the player-0 character mask. Entry constructs an animated stage camera, a scene camera, lights, a stage-selected model at `models[11 - stage_index]`, and a secondary model at `models[12]`. There is no local index bounds validation. The stage index retained in shared state is a five-bit field, whereas resource tables are indexed by the incoming byte. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1879.c#L230-L394)

### Camera

`fn_80187910` handles A-triggered camera timeline selection: it converts the eye animation frame to an integer, divides by 300, stores the result in a four-bit field, increments it, and wraps values at eight to zero. It replaces the camera animation and requests `segment * 300`. Every invocation then evaluates the camera and scales both eye and interest vectors using `Ground_801C0498()`. The familiar eight-segment interpretation assumes the normal authored frame range; the bitfield conversion should not be erased from exceptional-range reasoning. The A branch assumes an eye animation exists. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1879.c#L78-L113)

### Coordinated model states

`fn_80187AB4` uses numeric states 0–2. State 0 waits until the hierarchy predicate is false, changes to 1, attempts clip setup and writes `x34 = 0x960`. State 1 latches flash from active; flash changes the state to 2, sets done and calls `lbBgFlash_8002063C(1)`. Its subsequent completion test may load the newly selected clip 2, not necessarily clip 1. State 2 sets done and requests GObj destruction when the predicate is false. The helper guards both the animation-table pointer and selected clip. Successful helper setup evaluates the hierarchy, and the callback also evaluates it unconditionally afterward. Thus evaluation is not uniformly once per invocation. No countdown use of `x34` is present in the owned source. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1879.c#L62-L157)

`fn_80187CF4` sequences slot-12 animations through states 0→1→2. Only state 2 accepts Start: it plays the forward sound, writes active, changes to 3 and attempts clip 3 setup. Without Start, exhausted clip 2 is replayed. State 3 requests destruction after the hierarchy predicate becomes false. Null clips suppress setup without reversing transitions; the animation-table pointer itself is not guarded. Setup can evaluate internally before the unconditional trailing evaluation. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1879.c#L166-L228)

The completion predicate checks enabled JObj animation objects along its traversal; it is not a general assertion that every material or texture animation has completed. Destruction can be deferred for the currently executing GObj, explaining why the callbacks retain a trailing evaluation after requesting removal. [Predicate](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lb_00B0.c#L39-L66) · [Destruction](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobjplink.c#L103-L127)

### Rendering and exit

`fn_80187C9C` calls `GXSetZMode(0, GX_NEVER, 0)`, forwards the object and pass to the standard JObj renderer, and invalidates HSD state mask `0x40`. It does not explicitly restore the previous depth mode. Both presentation models register this adapter. [Adapter](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1879.c#L159-L164)

`gm_Scene_IntroNormal_OnFrame` requests scene-runner control value 1 when done is set. Done is already set during the primary model's flash transition, so it does not prove that both terminal animations have finished. The runner breaks subsequent update processing on nonzero control, but state 1 still permits the iteration's rendering tail; state 2 has a separate early break. [Callback](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1879.c#L402-L407) · [Runner](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1A45.c#L281-L377)

`gm_Scene_IntroNormal_OnLeave` ignores its argument and unconditionally passes the retained archive to its destructor. The destructor asserts a non-null archive with `HSD_ARCHIVE_DONT_FREE`, then frees the backing DAT allocation and descriptor. Leave does not clear the archive, descriptor or camera slots and does not itself perform comprehensive GObj teardown. The loader's symbol lookup is nonfatal, while entry subsequently dereferences its outputs. Safe callback ordering and archive-backed object lifetime therefore depend on the surrounding scene framework. [Leave](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1879.c#L396-L400) · [Archive operations](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbarchive.c#L92-L153)

### Queries

`gm_801883C0` returns the retained camera's eye animation frame, then its interest animation frame, or zero. It guards the retained GObj and AObjs, not the CObj or WObjs, and cannot detect a stale retained pointer. Corneria consumes this frame to compute X translations for map objects 8, 9 and 4. [Getter](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1879.c#L409-L438) · [Consumer](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grcorneria.c#L2033-L2063)

`gm_8018841C` is a read-only `bool(void)` equality test against `GM_TRAINING`. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1879.c#L440-L446)

No compiled section placement or binary layout conclusions are made. Source-level declarations and the existing size assertion are not a substitute for compiled evidence.

Status: synthesized; independent review and live promotion pending.
