# Kirby Target Test stage controller

`grtkirby.c` registers `Gr_Kind_TKirby`, `/GrTKb.dat`, three populated Ground-object callback records and a trailing zero record. `grtkirby.h` exports only `grTKb_StageData`. These are source-level declarations, not proof of compiled section membership or ordering.

## Initialization and dispatch

The stage initializer passes `grTKirby_80221408` to `Ground_InitTargetStage`. The actual inline implementation clears `stage_info.unk8C.b4`, sets `b5`, requests object IDs 0, 1 and 2 in that order, ignores their returned pointers and then invokes four common Ground initialization routines. The meanings of those two flag bits are not inferred here.

The local object helper indexes the callback array with the supplied integer before retrieving the corresponding Ground GObj. It has no local bounds check. A non-null object receives callback setup; lookup failure produces an `OSReport` diagnostic and returns NULL. The setup inline clears `x8_callback` and `xC_callback`, registers rendering, conditionally stores callback3, invokes the initializer and schedules the process. It does not install or invoke callback1, nor consume the row flags. Consequently the constant-false callback1 functions are registered table entries, but this setup path alone does not establish their later invocation.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtkirby.c#L37-L111; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/inlines.h#L33-L62.

## Object behavior

- Object 0 initializes archive-backed model/animation state using its Ground map ID and animation index 0. Its process and callback3 are empty; callback1 returns false.
- Objects 1 and 2 both use `Ground_JObjInline1`: this first associates collision joints with the object's root JObj through `Ground_801C2ED0`, then initializes animation index 0. They are not merely animation-only initializers.
- Object 1's process calls `Ground_801C2FE0`; object 2 first calls `lb_800115F4` and then the same Ground routine. Both discard the collision routine's result. Object 2's row has bits 31 and 30 set; their gameplay meaning is not inferred.
- Collision refresh is gated by `Ground_804D6950[map_id] == 0`. An active call increments a shared generation marker, refreshes matching descriptor joints, and processes optional archive joints with stamp-based duplicate suppression. Kirby's descriptor supplies no direct joint list, but that does not eliminate archive-backed collision work.

The animation helper asserts archive availability, optionally descends to a child JObj, optionally replaces joint data, resets material state, replaces animations, requests frame 0, conditionally sets animation flags and evaluates the hierarchy. Its bool-typed third parameter is nevertheless indexed and tested against zero in the canonical implementation; this review does not generalize its numeric domain beyond Kirby's literal zero.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtkirby.c#L113-L161; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/inlines.h#L24-L30; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L1642-L1732; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/granime.c#L988-L1048.

## Lifecycle and integration hooks

Demo initialization and load are no-ops. Start invokes `grZakoGenerator_801CAE04(NULL)` once and ignores its result. The callee allocates generator data and attempts manager-GObj creation. Failure reports and frees the new data without publishing it; success schedules the manager process and publishes descriptor/data pointers globally. The Kirby wrapper supplies no retry, ownership handle or cleanup. Repeated-start safety and eventual manager teardown are not established by this wrapper.

The stage-level callback4 returns false, the touch-line callback returns NULL, and the shadow predicate returns true without inspecting its arguments. Shadow approval means this callback does not reject a request, not that every requested shadow necessarily reaches rendering.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtkirby.c#L78-L95; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtkirby.c#L163-L171; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grzakogenerator.c#L303-L329.

## Semantic review

Existing structural callback names fit their canonical slots. The differing `Callback0` versus `OnInit` naming styles do not warrant cosmetic replacement. The rendered view reports shadowed bindings for `setupStageCallbacks` and `grTKirby_OnTouchLine`; their unchanged display is a renderer limitation, not contrary semantic evidence. Rendered external callee names were not treated as proof. In particular, the wind-effects interpretation of `lb_800115F4` is not established by the reviewed local call sequence.

Corrections remove an unsupported compiled-section characterization, an incorrect static-function qualifier, and ambiguous non-returning terminology for a normal void callback. External appearance, target-count and mode-reachability details are explicitly deferred rather than rejected. No visible platform identity is assigned to an internal Ground-object ID.

Status: synthesized; independent review and live promotion pending.
