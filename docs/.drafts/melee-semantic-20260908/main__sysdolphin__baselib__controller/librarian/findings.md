# Controller semantic review

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. Full canonical and separately rendered C1–596/H1–134 cover730 manifest lines (728 nonterminal lines). Both renders have zero parser errors/substitutions and are exhausted. Counts: {'owned_files': 2, 'owned_lines': 730, 'targets': 18, 'function_targets': 14, 'writable_subjects': 42, 'parameter_entities': 23, 'file_entities': 1, 'existing_facts': 92, 'source_functions': 26, 'source_only_functions': 12, 'proposals': 10, 'dispositions': {'unresolved': 19, 'retain': 63, 'supersede': 10}}.

## Functionality

The controller layer queues four-port PAD reads, processes one oldest group into master state, and publishes independent copy/game snapshots with local edges and repeat counters. It also services rumble before polling and latches console reset press/release. Copy/game are not a chained pipeline: both read master directly.

### `HSD_PadGetRawQueueCount`

`u8 HSD_PadGetRawQueueCount(void)`

Saves interrupt state, reads qcount byte once and restores state; returns snapshot without consuming queue or checking its relation to qnum.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/controller.c#L21-L33

### `HSD_PadGetResetSwitch`

`s32 HSD_PadGetResetSwitch(void)`

Returns0 or1 according to reset_switch byte, without clearing it or masking interrupts.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/controller.c#L35-L40

### `HSD_PadRawQueueShift`

`static void HSD_PadRawQueueShift(u8 qnum, u8* qptr)`

Stores (index+1)%qnum into the u8 index. Nonzero qnum and valid storage are caller invariants; no guard.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/controller.c#L42-L45

### `HSD_PadRawMerge`

`static void HSD_PadRawMerge(PADStatus* src1, PADStatus* src2, PADStatus* dst)`

For four ports, writes only dst.button = src1.button | src2.button. Other destination PADStatus fields remain unchanged; aliasing with either source works for each field assignment.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/controller.c#L47-L53

### `HSD_PadRenewRawStatus`

`void HSD_PadRenewRawStatus(bool err_check)`

Services rumble before PADRead. If err_check and all four err fields are nonzero, returns before queue/reset processing. Otherwise writes one four-port group; full policy0 advances oldest and OR-merges buttons into surviving next group (or new sample when capacity1), policy1 drops oldest, policy2 skips insertion. Nonfull increments u8 count. Invalid policy has no full-queue read-index adjustment but still writes. After handling, error-1 port bits request PADReset and reset-switch press/release updates history/sticky latch. No local interrupt masking or queue validation.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/controller.c#L55-L125

### `HSD_PadFlushQueue`

`void HSD_PadFlushQueue(HSD_FlushType ftype)`

Interrupt-masked merge ORs old button activity forward until count<=1, preserving newer analog/error fields; throwaway sets read=write/count0; leave1 retains latest only when count>1. TERMINATE and other selectors do nothing. Restores saved interrupt state.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/controller.c#L127-L159

### `HSD_PadClampCheck1`

`static void HSD_PadClampCheck1(u8* val, u8 shift, u8 min, u8 max)`

For unsigned byte, below min becomes0 and returns; above max clamps to max. Exactly shift==1 then subtracts min and narrows to u8. No min<=max validation, so malformed bounds can wrap subtraction.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/controller.c#L161-L174

### `HSD_PadClampCheck3`

`static void HSD_PadClampCheck3(s8* x, s8* y, u8 shift, s8 min, s8 max)`

Computes stick radius; below signed min clears pair. Above signed max, scales components by max/r into s8, then recomputes radius from rounded components. If shift==1 and radius>1e-10, subtracts each component*min/r and narrows again. Integer conversion means exact boundary magnitude and direction are not guaranteed; negative bounds are not rejected.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/controller.c#L176-L197

### `HSD_PadClamp`

`static void HSD_PadClamp(HSD_PadStatus* mp)`

clamp_stickType0 applies radial helper to both sticks; other types skip stick clamping. Always clamps analog L/R with LR settings and A/B with AB settings.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/controller.c#L199-L221

### `sq`

`static inline f32 sq(f32 x)`

Returns f32 x*x. Its result assigned to r in ADConvertCheck1 is immediately overwritten by vector length.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/controller.c#L223-L226

### `vec2DSqDist`

`static inline f32 vec2DSqDist(f32 x, f32 y)`

Returns f32 x*x+y*y.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/controller.c#L228-L233

### `vec2Dlen`

`static inline f32 vec2Dlen(s8 x, s8 y)`

Converts s8 inputs through squared-distance helper and returns square root.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/controller.c#L235-L238

### `HSD_PadADConvertCheck1`

`static void HSD_PadADConvertCheck1(HSD_PadStatus* mp, s8 x, s8 y, u32 up, u32 down, u32 left, u32 right)`

Computes magnitude and angle (x0 uses +/-pi/2 with y>=0 choosing positive), compares magnitude against signed adc_th, then ORs supplied masks using independent angular inequalities expanded by adc_angle/2. Left wraps across +/-pi. Does not clear existing bits or require positive threshold/angle; zero vector can be accepted when threshold<=0.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/controller.c#L240-L277

### `HSD_PadADConvert`

`static void HSD_PadADConvert(HSD_PadStatus* mp)`

Only adc_type0 converts both sticks. Main directions map to bits16–19 and substick directions to20–23; other types do nothing.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/controller.c#L279-L293

### `HSD_PadScale`

`static void HSD_PadScale(HSD_PadStatus* mp)`

Divides four signed stick components by scale_stick and unsigned LR/AB values by their group divisors into float fields. No zero-divisor check or output clamping.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/controller.c#L295-L307

### `HSD_PadCrossDir`

`static void HSD_PadCrossDir(HSD_PadStatus* mp)`

Filters physical D-pad low bits only. Mode0/unknown preserve input;1 favors vertical;2 favors horizontal;3 records sole-axis input as1/2 and when both axes active favors vertical only for remembered1, otherwise horizontal. Neither-axis case preserves memory. Mutates in place, returns void; synthetic stick bits are untouched.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/controller.c#L309-L349

### `HSD_PadRenewMasterStatus`

`void HSD_PadRenewMasterStatus(void)`

Under saved interrupt mask, empty queue leaves all statuses unchanged; otherwise consumes oldest four-port group. Saves previous buttons, copies err; err0 copies raw fields and runs clamp/AD/scale/cross in order. err-3 becomes0 while retaining prior input; other errors clear button/raw/normalized fields. Computes press/release masks. Any button change emits trigger as repeat and reloads repeat_start; unchanged decrements s32 counter, emits held mask/reloads interval only on exact zero, otherwise repeat0. Does not saturate counters.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/controller.c#L351-L425

### `HSD_PadCopyStatusFields`

`static inline void HSD_PadCopyStatusFields(HSD_PadStatus* dst, HSD_PadStatus* src)`

Copies button and eight raw plus eight normalized analog/stick components. Does not copy err/history/edges/repeat/cross_dir.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/controller.c#L427-L447

### `HSD_PadClearStatusFields`

`static inline void HSD_PadClearStatusFields(HSD_PadStatus* dst)`

Clears button and eight raw plus eight normalized components, without clearing err/history/edges/repeat/cross_dir.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/controller.c#L449-L468

### `HSD_PadRenewCopyStatus`

`void HSD_PadRenewCopyStatus(void)`

For each of four ports saves copy-local previous buttons and master err, copies current input on err0 or clears input otherwise, computes copy-local press/release and repeat countdown. Does not consume queue or copy master repeat/history/cross_dir. No local interrupt mask.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/controller.c#L470-L507

### `HSD_PadRenewGameStatus`

`void HSD_PadRenewGameStatus(void)`

For each of four ports saves game-local previous buttons and master err, copies current input on err0 or clears input otherwise, computes game-local press/release and repeat countdown. Independent of CopyStatus and no local interrupt mask.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/controller.c#L509-L547

### `HSD_PadRenewStatus`

`void HSD_PadRenewStatus(void)`

Calls raw renewal with err_check0, then master, copy and game renewal exactly once in that order. Master can consume an older queued group rather than the just-polled group.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/controller.c#L549-L555

### `HSD_PadReset`

`void HSD_PadReset(void)`

Under saved interrupt mask removes queued rumble, writes direct-status0 on ports0..3 through OffN, throws away raw queue, requests PADRecalibrate(0xF0000000), clears reset_switch and restores interrupts. Does not clear reset_switch_status or published status arrays; does not directly issue PADControlMotor. Hardware recalibration completion is not guaranteed by this call.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/controller.c#L557-L577

### `HSD_PadInit`

`void HSD_PadInit(u8 qnum, HSD_PadData* queue, u16 nb_list, HSD_PadRumbleListData* listdatap)`

Copies default PadLibData, installs u8 qnum and borrowed queue pointer, initializes supplied rumble pool, copies default status to all12 records, calls PADInit. No qnum/storage validation or allocation. Reinitialization clears reset latch and press history through default copy.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/controller.c#L579-L595

### `HSD_PadGetNmlStickY`

`static inline float HSD_PadGetNmlStickY(u8 slot)`

Header inline returns CopyStatus[slot].nml_stickY without bounds checks or interrupt masking.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/controller.h#L111-L114

### `HSD_PadGetNmlSubStickY`

`static inline float HSD_PadGetNmlSubStickY(u8 slot)`

Header inline returns CopyStatus[slot].nml_subStickY without bounds checks or interrupt masking.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/controller.h#L116-L119

## Owned header and state

H11–36 defines u32 button masks and error-1. H38–43 defines four flush selectors; TERMINATE has no active implementation. H45–47 groups four PADStatus records per queue entry. H49–74 declares u32 button/history/edge masks, signed32 repeat counter, signed8 sticks/error, unsigned8 analog/cross fields and float normalized values. H76–105 declares u8 queue bookkeeping, borrowed queue pointer, signed timing/ADC/stick fields, float ADC angle, clamp/scaling bytes, reset history/request and embedded foreign RumbleInfo. H107–134 exports status arrays, two unchecked CopyStatus Y getters, public prototypes and library data.

C9–19 declares default records, three four-port live arrays, library state and pad_bit masks. Defaults set initial repeat delay45/interval8 and ADC threshold30. No compiled section mapping is inferred. Header comments about in-game Z macros and composite LR input do not establish synthesis by this TU.

## Review decisions

Every baseline fact, including the section-level pad_bit inferred name, retains its original ID/value/timestamp in the disposition ledger. No integer versions are exposed. Canonical function names stay unchanged. Parameter entity register suffixes are inherited identifiers, not newly established ABI allocation.

Ten proposed corrections cover radial quantization, void in-place filtering, TERMINATE/default flush handling, unchecked occupancy assumptions, reset-latch reinitialization, and asynchronous reset/motor semantics. Nineteen section facts remain unresolved. Invalid capacities and zero normalization divisors are not guarded; repeat counters use unsaturated signed subtraction and require sensible caller configuration.

Foreign canonical-only supporting reads: lb_0195.c1–165, gm_1A45.c256–316, Dolphin pad.c484–547, rumble.c21–65/217–275. They establish queue consumers, console reset shutdown, PAD startup/recalibration filters, and deferred motor dispatch. No foreign owned-file completion claimed.

Exact outgoing links: {'expected': 24, 'reviewed': 24, 'retain': 18, 'reject': 0, 'unresolved': 6}. Section attribution and explicit motor-off rationale remain unresolved. Proposal validation is dry-run only; no shared KB or source mutations.
