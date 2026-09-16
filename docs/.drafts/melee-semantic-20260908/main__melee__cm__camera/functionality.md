# Camera Functionality Review

Draft semantic review for `main/melee/cm/camera` at `c302741689bd67c361cd7faadb221df3193992c3`, tree-equivalent to upstream `05a1394faea2aac458e4bdd030621d8a5631ae62`. Root must independently review and apply the proposals. Source names remain unchanged.

## Entry Points and State

`Camera_Init` seeds the static `Camera game_camera` and its transform copy from the perspective descriptor, resets mode and presentation fields, and allocates a fixed subject pool. The implementation assumes a positive subject capacity. `Camera_Create` builds a GObj, creates two HSD camera objects from the descriptor, attaches one camera to the GObj, and installs `fn_8002F360` as update procedure and `fn_800301D0` as render callback.

Evidence: [initialization](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L163-L227), [creation](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L4095-L4112).

`cm_804D645C` retains the pool allocation, `cm_804D6458` is its free-chain head, and `cm_804D6460` and `cm_804D6468` delimit the active list. Allocation removes the free head and appends to the active tail. Release reconnects active neighbors and prepends the record to the free chain. Exhaustion reports an error and loops indefinitely. `Camera_80029020` is the state-zero allocation wrapper.

Evidence: [pool operations](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L258-L302).

## Framing and Transforms

Active subjects supply position, extents and eligibility state. The geometry cluster reviews directional stage-bound tests, automatic subject lockout, gradual extent changes, aggregation of eligible bounds, interest smoothing, depth calculation and transform construction. Eligibility has side effects: the automatic lockout counts framing checks, and a routine that checks twice can decrement it twice. It is not an elapsed-frame clock. Subject-count weights combine with stage tracking coefficients, and counts above four use a coefficient of one.

Evidence: [eligibility](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L352-L386), [aggregate framing](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L464-L700).

`Camera_8002A768` constructs four rays from the constant world-forward vector, half target FOV, aspect ratio and view direction. It projects valid rays to the gameplay plane and derives corrections against camera or blast-zone bounds. This is a geometry calculation, not a general proof that every rendered object stays visible. `Camera_8002AF68` transfers camera transform state into an HSD CObj. Mode paths choose their own framing and control operations before rendering consumes the resulting state.

Evidence: [view rays](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L1087-L1175). Full branch behavior is in `controls.findings.json`. Opposing boundary violations can only be averaged, so a view larger than the available rectangle is not guaranteed to fit.

## Modes and Controls

The nine-slot callback table contains seven callbacks and two null slots. `fn_8002F360` invokes the current non-null callback. `Camera_8002F3AC` also invokes it, then copies target interest, eye position and FOV to both current transforms. It therefore performs a mode update as well as a snap.

Evidence: [table](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L57-L67), [dispatch and snap](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L3457-L3480).

Pause setup validates the selected slot and controller identifier, obtains stage position, angle and distance limits, initializes orbit and pan offsets, and chooses default or minimum initial distance. Slot `0xA` multiplies the starting distance by three. `Camera_SetBounds` writes stage bounds into its output vector despite its imperative canonical name. The current name remains authoritative; its behavior belongs in the purpose fact.

Evidence: [pause setup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L3487-L3585).

Training and clear entry select their modes and configure offsets. Clear mode selects angles using subject facing when available and random values. Boss-intro setup snapshots current eye, interest and FOV as transition origins. Its transition routines use selector flags, vectors or callbacks to resolve destinations. The transitions cluster records conditional initialization concerns separately from confirmed behavior.

Evidence: [training and clear](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L3588-L3650), [boss-intro origin](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L3819-L3833).

Debug-follow entry requires a player entity and camera subject. Debug-follow and debug-free preserve the previous mode only when it is at most `CAMERA_PAUSE`; restoration copies the saved mode back. Debug-follow's source variable names do not consistently describe eye versus interest values, so the review follows the HSD getter calls and assignments.

Evidence: [debug entry and restoration](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L3835-L3905).

## Quakes and Rendering

Quake requests, timers, offsets and application are distinct operations. Canonical `Camera_RequestQuake` must take precedence over inherited `Camera_StartQuake`. The modes review corrects inherited claims that describe a different quake-array access pattern. Array-layout ownership remains a shared-type followup. `Camera_UpdateQuakes` decrements timers and only enters its destruction branch after observing an active timer and finding the loop timer zero. `Camera_ApplyQuake` applies the offset; its canonical name does not need an inferred replacement.

The main render callback updates the CObj, prepares refraction and shadow work, selects the current camera, erases the screen, configures ground lighting/fog, executes several GX-link passes, optionally draws collision and stage debugging, and ends the current camera. Lower-level helpers set render mode, stage group and link priorities. Their names do not establish the meaning of external render APIs.

Evidence: [main render callback](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L3997-L4058).

`Camera_SetBackgroundColor` stores RGB. `Camera_GetBackgroundColor` assigns RGB to its returned local `GXColor` but does not assign alpha. The getter is not evidence for a stable four-component color. Transform getters copy the retained current position or interest. `Camera_80030730` writes `cm_803BCCA0.x40`; local consumption at lines 1516-1519 assigns that field to target FOV. The proposed `Camera_SetDefaultFov` replaces inherited `Camera_SetVerticalTilt` on this evidence. Counted transition initialization does not clear the completion bit, so its getter can retain the previous value until the updater runs.

Evidence: [public getters](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L4119-L4144).

## Data and Ownership Limits

The six data targets are reviewed separately in `lead.findings.json`. Recovered declarations include the singleton and debug record, callback and perspective descriptors, a five-element subject-count coefficient table, four constant vectors, and five small pointer slots. `camera_sdata2_order` explicitly lists numeric literals for pool ordering. It is not a mutable tuning table. `CameraUnkGlobals cm_803BCCA0` has an early extern declaration and an actual initialized definition at lines 4623-4631, following two diagnostic strings and a DATA gap. Exact binary section mapping remains pending. The separate `.sdata` target has no sufficiently identified named C object and remains opaque.

Shared `cm/types.h` and `cm/forward.h` are outside this manifest's owned file set. Their layouts and claims about other families must wait for an explicit owner. The owned `camera.dox` also contains old prototypes, `_CameraBox` spelling, an obsolete background setter name and a `void` declaration where the current header returns `bool`. Dox comments asserting that a field is never read, only written by Home-Run Contest, or used by shadows require family review. They do not override current C definitions.

Evidence: [declarations](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L53-L155), [current public header](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.h#L13-L138), [legacy documentation](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.dox#L11-L155).

## Review Artifacts

[naming.md](naming.md) lists inherited aliases and decisions. [fact-dispositions.json](fact-dispositions.json) records each inherited fact by ID and version. [synthesis.json](synthesis.json) compares manifest scope with reviewed subjects and facts. [followups.md](followups.md) separates remaining family questions. Frozen canonical and rendered snapshots are retained in the [campaign unit pages directory](</Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__cm__camera/pages>) and individually linked by each cluster findings file.

## Completion

Reviewed 4,930 lines in three owned files in both canonical and rendered views, 123 function targets, six data targets, 140 parameter entities and the file entity. All 745 inherited facts have explicit dispositions. The dispositions are 361 retain, 194 supersede, 11 reject and 179 unresolved. The combined proposal contains 218 operations and passes dry-run validation with zero rejections. No shared KB writes or source changes were made. Independent review and family decisions remain pending.

## Live application status

Root confirmed live promotion. Evidence: [final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__cm__camera/final-render.json), [staged completion](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__cm__camera/staged-completion.json), [live promotion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/promotions/578d815367d37ac30a6b7bc6af9e5aa2373e82938ac970d2521ab10b95788b8c/2026-09-08T14-38-03.057Z-5b09a609-eb16-4a01-afc5-31499a2ab56a.receipt.json). Unresolved inherited claims remain unresolved; promotion does not validate them. Proposal and review hashes are preserved.
