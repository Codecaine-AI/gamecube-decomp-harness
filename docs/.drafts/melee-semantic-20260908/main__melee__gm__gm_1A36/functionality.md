## Controller input processing

The unit maintains a private controller map with four physical-port records and an additional aggregate record. Each record contains five `u64` masks and two signed repeat-state fields. Source declarations establish these types, but do not establish compiled section placement or total object size. [Declarations](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1A36.static.h#L9-L28).

`gm_GetButtonsPressed`, `gm_GetButtonsTriggered`, and `gm_801A36C0` directly return the selected record's `button`, `trigger`, and generated `repeat2` masks, respectively. They neither validate the index nor consume state. `repeat2` is distinct from the imported HSD `repeat` field. [Accessors](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1A36.c#L8-L21).

`gm_EvaluateAllControllerInputs` imports button, trigger, repeat, and release masks from `HSD_PadCopyStatus`; adds confirm, cancel, common directional and two chord aliases; invokes the configured callback for each physical port; then clears and rebuilds all five aggregate masks by OR reduction. It does not poll hardware or check controller errors itself. HSD copy-status processing clears fields on error and derives physical trigger/release edges upstream. [Evaluator](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1A36.c#L106-L144), [HSD producer](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/controller.c#L470-L507).

### Alias semantics

`gm_801A3714` independently adds a destination mask to each of four categories when any source bit intersects that category. It preserves existing bits and does not touch generated-repeat state. `gm_801A3820` instead requires the complete source mask in button or repeat. Its trigger and release branches both require the complete chord in current buttons plus at least one matching edge bit. In particular, the release branch is not ordinary chord-break detection. A zero source mask qualifies the chord helper's button/repeat tests but cannot qualify either edge intersection. [Helpers](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1A36.c#L35-L70).

Synthetic triggers are aliases of physical edges, not recomputed rising edges of semantic held state. Pressing Start while A remains held can produce another confirm trigger. Similarly, aggregate trigger masks are ORs of port triggers, not edges of aggregate held state.

### Repeat lifecycle and exceptional cases

`gm_801A3E88` copies a static reset template, seeds every physical and aggregate timer with 20, and installs `fn_801A396C`. The callback is invoked without a null check during evaluation, so initialization is a prerequisite; global call ordering is not established here. [Initialization](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1A36.c#L149-L162).

Any trigger or release resets duration to zero, reloads timer 20, and emits only the trigger mask. Thus release-only input resets the schedule while emitting zero. Otherwise duration advances up to 100. A nonzero timer is decremented and output cleared, including the invocation that decrements it to zero. Only an invocation entering with timer zero emits held buttons and reloads 8, 4, or 2 according to duration thresholds 40 and 100. These are countdown reloads, not exact emission periods: within a stable tier and without edges or overrides, emission spacing is 9, 5, or 3 callback invocations. [State machine](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1A36.c#L72-L100).

`gm_801A36E0` replaces one timer, except selector `PAD_MAX_CONTROLLERS` broadcasts to physical ports only. Unlike accessors, that selector does not address the aggregate record. Neither selector nor signed timer value is validated. Negative timers enter the nonzero decrement branch; the source provides no safe negative-countdown or wraparound policy. An edge overrides any supplied countdown. Aggregate timer/duration are not advanced during evaluation. [Setter](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1A36.c#L23-L33).

### Cross-file consumers

The progressive-scan prompt consumes aggregate directional and confirm triggers. The vibration menu consumes aggregate cancel and guarded per-port confirm, and combines generated repeats only from ports whose selection byte equals 1. That numeric selection test does not prove the nearby comment's claim that L is held. Rules-menu endpoint handling broadcasts countdown 25, with additional tournament-specific selection behavior. [Progressive prompt](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmprogressive.c#L136-L164), [Vibration inputs](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mn/mnvibration.c#L395-L537), [Rules endpoints](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mn/mnmainrule.c#L324-L379).

## Separate game-mode initialization dispatcher

`gm_801A3EF4` walks the `GameMode` descriptors returned by `gm_GetAllGameModes` until `kind == GM_COUNT`, invoking non-null `on_init` hooks in traversal order. It contains no once-only flag or rollback. Callback effects, registry mutation, and ordering relative to mode loading remain external responsibilities. [Dispatcher](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1A36.c#L164-L172).

## Rendered-name review

All owned canonical and rendered pages were reviewed. Renderers reported no parse errors; substitutions were limited to function names. The seven proposed descriptive function names fit canonical operations but remain hypotheses about historical spelling. Header and documentation placeholders for the evaluator and initializer remain less precise than their `void(void)` definitions. Annotated field offsets and section-target identities were not promoted into compiled-layout proof.

Status: synthesized; independent review and live promotion pending.
