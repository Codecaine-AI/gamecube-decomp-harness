# Disjoint Librarian Research

### shard-main__melee__lb__lbaudio_ax-000
Reviewed canonical and rendered `src/melee/lb/lbaudio_ax.c` lines 1–480 only. This range implements table lookup and inclusive ID-range classification, construction of a filtered priority list, conditional bidirectional ID remapping, audio-driver wrappers, language-dependent archive-list access, conditional SFX-bank replacement, and filename-based stream request deduplication. Playback forwarding doubles and clamps volume/pan to 0–255; track-specific dispatch handles a key-off sentinel. Bank replacement clears selected bookkeeping entries, loads an SSM file into bank 2, waits for completion, and forwards playback. Stream selection rejects invalid indices and avoids restarting an identical cached filename; its return reports whether a new request was issued, not driver success. Additional wrappers dispatch fixed table entries or channels 5 and 6. The range ends inside an ID-to-track switch.

### shard-main__melee__lb__lbaudio_ax-001
Reviewed canonical and rendered lines 481–960 of `src/melee/lb/lbaudio_ax.c`, not the complete translation unit.

- The opening switch tail and three complete wrappers select numeric track arguments and forward IDs to `fn_80023750`. One wrapper normalizes IDs 0x8A–0x8C to 0x8B; another uses a fallthrough switch to calculate tracks from a 0xCA default.
- Initialization restores volume-related values, multipliers, flags, cached values and sentinel IDs. Three setters clamp stored levels to 0–127; another clamps to 0–255.
- `fn_80024654` computes stream volume and several SFX volume groups from stored levels and multiplicative factors. It updates the synthesis APIs only when computed values change, unless its argument equals 1, which forces updates. It similarly caches a parameter used in four AXDriver calls.
- Voice-parameter wrappers clamp and forward pan, volume and a signed parameter bounded by ±0x4B0. Sound-mode access caches the synthesis mode; setting accepts two enum cases, maps through `{1, 0}`, and avoids redundant synthesis calls.
- Reset clears transient state, restores multipliers, keys off tracks 5 and 6, and invokes driver operations for numeric groups 5, 6, 8 and 7. A companion reset then sets one flag. A table-selection function assigns a stored level using nested stage-function results and the caller's index.
- A 16-slot registration routine refreshes an existing entry's associated value to 10, otherwise fills the first slot containing sentinel 0x83D60; a full table is left unchanged. Global pause directly invokes AXDriverPause/Resume. A separate boolean toggle selects multipliers of 0.2 or 1.0 and opposing driver operations for groups 5, 6, 8 and 7.

### shard-main__melee__lb__lbaudio_ax-002
Reviewed canonical and rendered lines 961–1440, with the constructor continuation through 1460 read for context; this is not complete TU coverage.

- Stream-volume controls set zero or restore `synth_volume`, alongside driver calls for channel arguments 2–9; restoration conditionally excludes 5–8. Other small setters manage two masks and saturating counters, boolean-derived float controls, and debugging.
- Pan callbacks support owner-position-relative panning, frame-based interpolation, mirrored interpolation, and one-shot initialization. Position lookup explicitly dispatches fighter and item owners. Relative panning defaults to center outside the strict camera/position bounds. `calcPan` interpolates from the smaller endpoint toward the larger, clamps to 0–127, and returns 64 for equal endpoints.
- The volume callback computes frame-dependent values while within the duration and assigns `VOL_MAX` afterward. Its descending branch subtracts the scaled difference from `end_vol`, rather than interpolating downward from `start_vol`.
- Sound-controller initialization copies parameters, optionally randomizes a sign-like field, selects one of ten callbacks, initializes pan/volume, and obtains a voice through one of two calls for modes 0–8 or adopts the supplied voice for mode 9. The scheduled procedure invokes the callback, forwards pan/volume for valid voice IDs, and requests object removal on callback failure or duration completion; otherwise it increments the frame.
- The constructor gates on the sound-ID upper bound, creates a sound-class object, allocates pool-backed user data, installs its free callback and scheduled procedure, and initializes the controller.

### shard-main__melee__lb__lbaudio_ax-003
Reviewed canonical and rendered source lines 1441–1920 only.

- Sound-object helpers return a stored voice ID or -1, remove all sound objects owned by a non-null target, or key off and remove the first matching owner/valid-voice pair.
- A 55-entry SFX loading pipeline selects requested, absent entries in descending table priority, recomputes size totals, and evicts unrequested resident entries in ascending eviction priority until capacity is sufficient. Pending-load cleanup retries cancellation up to 64 times per eligible entry and falls back to waiting and unloading bank 2 when pending work remains.
- The load callback marks the matching entry as state 1, adjusts size counters, and starts the next eligible file using the same callback. Reload setup copies the selection array, checks capacity after eviction, and starts this chain. Completion checking waits while requested entries remain at -1, then promotes requested state-1 entries to state 2.
- Character and stage helpers produce table-derived masks. Category-mask operations clear selected entries to -1 or mark intersections as 1; their fixed-mask combinations use addition, not bitwise OR. A coordinating routine combines character/stage masks and explicit numeric exceptions, updates selection, starts loading, and waits.
- The final fragment selects `/audio/us/` or `/audio/`, records the filename insertion position, and begins a routine that keys off all SFX before comparing the stored language.

### shard-main__melee__lb__lbaudio_ax-004
Reviewed canonical and rendered lines 1921–2277 only. This range contains bank-reload logic, an audio key-off/cleanup call sequence, periodic audio-state maintenance, allocator and audio-system initialization, runtime initialization, two driver-result forwarding wrappers, and scalar decrement/reset helpers. The update routine conditionally ages timers, maintains two audio requests with coupled volume values, selects a scalar of 1.0 or 0.2 according to their handles, and either dispatches and clears 16 pending entries or ages their expiration counters. System initialization computes three bank capacities, initializes AR/ARQ/AI, configures reverb/delay storage, allocates banks, and resets tracking arrays. Runtime initialization conditionally reloads banks when the language value changes and restores pending-entry and runtime defaults.

### shard-main__melee__lb__lbaudio_ax-005
Reviewed the complete assigned header, `src/melee/lb/lbaudio_ax.h:1–92`, in canonical and rendered form. It defines `SFX_NONE` as -1, declares two unnamed-purpose audio-mode constants, and exposes the lbAudioAx function interface. Explicit signatures include an SFX-ID/volume/pan entry point, boolean parameters labeled pause and debug, HSD_GObj-based operations, CharacterKind/StKind inputs returning u64, and a flags/mask operation. The header contains declarations only; runtime behavior, gameplay mappings, and the rendered descriptive function names are not established by this range.

### shard-main__melee__lb__lbaudio_ax-006
Reviewed canonical and rendered `src/melee/lb/lbaudio_ax.static.h` lines 1–332 only. This header defines TU-local audio data rather than executable functions: a userdata structure containing object pointers, a callback, and integer/float fields; scalar defaults and working arrays; three 64-byte string buffers; SSM/HPS filename catalogs; and several numeric tables. Explicit defaults include `sound_mode = 1`, `synth_volume = 1.0F`, repeated integer values of `0x7F`, and `/audio/` prefixes. Table declarations establish element types and dimensions, but not their runtime interpretation or gameplay mappings.

### shard-main__melee__lb__lbaudio_ax-007
Reviewed the six assigned subjects. Current source implements allocator-backed sound controllers, timer-maintained sound slots, bank selection and asynchronous byte accounting, cached mixer updates, pause/attenuation controls, and timed pan interpolation. Catalog remapping is gated by bank state, not explicitly by language. Source declarations and arithmetic do not establish compiled section placement or literal-pool layout.

### shard-main__melee__lb__lbaudio_ax-008
Reviewed six assigned functions, not the complete TU. They rank category-filtered bank indices for allocation sizing, normalize playback arguments, initialize runtime mix controls, apply cached or forced mix updates, and calculate camera-relative entity pan. Local control flow is established; some baseline interpretations of downstream driver operations and persisted settings require cross-unit verification.

### shard-main__melee__lb__lbaudio_ax-009
The six assigned callbacks update managed sound pan, either directly from frame-based interpolation, with optional 127-complement reflection, or through one-shot wrappers guarded by x44. The positional wrapper delegates to an owner-position calculation relative to camera bounds and latches before delegation, even if position acquisition fails. All six return false and tolerate null objects or userdata. The interpolation helper orders unequal endpoints from smaller to larger, caps current time above end, clamps ordinary numeric results to 0–127, and returns 64 for equal endpoints; it does not guard division by zero. This review covers only the assigned subjects and necessary local context.

### shard-main__melee__lb__lbaudio_ax-010
Reviewed the six assigned subjects and their 35 baseline facts. The sound callbacks compute complemented pan and frame-dependent volume; initialization selects a strategy and creates or adopts a voice, while the recurring process propagates parameters and advances or retires the controller. Bank helpers select pending loads by descending priority and reclaim unrequested slots under capacity pressure. The volume callback's decreasing branch subtracts from end_vol, not start_vol, contradicting the baseline's endpoint-to-endpoint ramp description. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__lb__lbaudio_ax-011
Reviewed six assigned functions and their relevant context. They rebuild SFX-bank memory accounting, cancel outstanding loads with conditional wait/unload fallback, continue a priority-ordered asynchronous load chain, query finalized bank state, and finalize requested banks after pending requests clear. A separate checked-row accessor supplies character-associated BGM variants to stage music resolution. The loading loops process 55 slots, although the tracking arrays are declared with 56 elements. Names remain semantic hypotheses, not recovered symbols.

### shard-main__melee__lb__lbaudio_ax-012
The six assigned functions provide bounded metadata access, optional range-endpoint outputs, inclusive SFX-range classification, bank-relative fighter-variant metadata, state-selected bidirectional ID remapping, and unconditional global SFX key-off delegation. Fighter and item callers confirm the principal ID flows. This review covers the assigned subjects, not the entire translation unit.

### shard-main__melee__lb__lbaudio_ax-013
Reviewed six assigned audio facades: per-handle key-off, singleton stream stop/reset, SFX and stream status predicates, and untracked/track-aware SFX dispatch. Stop commands return -1; predicates preserve driver results. SFX starts double and clamp volume/pan, use channel 7, and distinguish the untracked fallback threshold from the exact tracked key-off control ID. Caller reads confirm selective item/crowd shutdown, stage-handle polling, fighter track management, and stream sequencing. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__lb__lbaudio_ax-014
Reviewed the six assigned functions and their 35 baseline facts. They load the audio-list archive, count and index language-selected SFX lists, conditionally replace Synth bank 2 before preview playback, select cached HPS streams, and dispatch eleven interface-sound presets. Sound Test and name-entry callers substantiate the interface mappings. List-access guards are ineffective; preset dispatch lacks a lower-bound check. Stream selection reports whether a replacement was requested, not playback success. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__lb__lbaudio_ax-015
Reviewed the six assigned playback wrappers, their common control-conversion helper, driver allocation, and selected callers. The wrappers select fixed channels, optionally remap IDs or tracks, and return the driver result without retaining state. Crowd and Hand-animation callers confirm specific uses. The channel-7 track selector preserves every caller track except -1 for ID 0x20D, including other negative values that the driver subsequently rejects. Numeric dispatcher cases alone do not establish spoken character-name audio.

### shard-main__melee__lb__lbaudio_ax-016-recovery5
Reviewed the six assigned audio setters and their supporting mixer, caller, and driver paths. Three setters retain saturated 0–127 stream or grouped-audio gains; another retains a 0–255 auxiliary send for channels 7 and 8. The shared mixer applies retained values on forced or changed updates. The two per-handle wrappers instead clamp and double pan or volume and immediately delegate to AXDriver, discarding its Boolean result. Sound-menu and Sound Test code support the complementary balance-gain interpretation. Inferred names remain descriptive hypotheses, not recovered original symbols. This review does not claim complete translation-unit coverage.

### shard-main__melee__lb__lbaudio_ax-017
Reviewed the six assigned functions and all 35 baseline facts. They implement bounded per-voice pitch adjustment, cached inverse sound-mode conversion, validated sound-mode application, transient audio-state reset, a reset variant requesting deferred tracked-entry processing, and an unchecked stage-dependent send-level lookup. The periodic consumer plays each pending tracked sound before clearing its entry; it is not simply an immediate voice-stop operation. Coverage is limited to this subject shard and the supporting ranges read.

### shard-main__melee__lb__lbaudio_ax-018
The six assigned helpers implement sixteen-slot SFX registration, pause control for one AXDriver-tracked instance, selective channel suppression with mix attenuation, broad audio suspension/restoration around disc recovery, and globally counted audio-mode acquisition. Broad restoration preserves the independent selective-pause latch. Gameplay-specific destruction, Camera Mode, and Super Star descriptions remain partially unverified; this is not complete TU coverage.

### shard-main__melee__lb__lbaudio_ax-019
The assigned functions acquire and release shared audio registrations, set independent BGM/FGM enable scalars and developer debug state, and construct allocator-backed sound controllers with scheduled updates. Fighter wrappers mirror registration counts locally. Hammer initialization and expiration bracket one registration pair; the other pair is tied to a timed fighter status whose Super Star identity remains unverified here. Controller construction persists parameters, creates or adopts a voice, and installs update and userdata-reclamation callbacks. This review covers only the assigned subjects.

### shard-main__melee__lb__lbaudio_ax-020-recovery5-retry154857-split1603-0
Reviewed three assigned managed-audio helpers. `lbAudioAx_800264E4` reads a controller's voice ID, returning -1 for a null controller or missing userdata. `lbAudioAx_80026510` removes every controller belonging to a non-null owner, keying off non-sentinel voices and preserving the successor before destruction. `lbAudioAx_800265C4` keys off and retires the first controller matching both owner and non-sentinel voice ID. Fighter sound commands retain extracted handles; fighter and item sound-cleanup routines use both termination helpers. The selective helper, unlike owner-wide cleanup, does not reject a null owner before searching.

### shard-main__melee__lb__lbaudio_ax-020-recovery5-retry154857-split1603-1
The assigned functions provide character-keyed SFX-bank masks, translate stage identifiers into zero-or-one-hot bank masks, and clear selected categories from desired-bank state. Adventure and Tournament callers combine character and stage contributions before selection and reload. Category clearing only writes -1 to selected slots; the separate reload path copies desired state and performs memory accounting, eviction, and load initiation. This review covers only the three assigned subjects.

### shard-main__melee__lb__lbaudio_ax-021
Reviewed the six assigned audio functions and their local loading helpers. They select desired resource slots, reconcile resident and pending loads with a memory budget, wait for requested slots, construct roster/stage-dependent selections, apply saved audio-language changes, and coordinate runtime cleanup. Selection uses arithmetic addition of the common mask, not bitwise OR. Language-change playback precedes bank unloading and reloading. This is bounded subject review, not complete TU coverage.

### shard-main__melee__lb__lbaudio_ax-022-recovery5
Reviewed the six assigned audio functions and supporting source. They maintain two retained SFX voices and sixteen deferred-dispatch slots, initialize the controller allocator and audio resources, reload resources according to saved language while resetting runtime state, and expose physical/logical voice counters. Timer aging is gated independently of voice maintenance and dispatch. The diagnostic consumer tracks separate peaks but currently prints the logical-count sample in both current-count rows. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__lb__lbaudio_ax-023
Reviewed the assigned baseline facts, not the complete translation unit. The fade pair decrements a shared scale with a zero floor or resets it to 127; the mixer applies that scale to several SFX groups, but not every group or streamed audio. The object-release callback returns nullable user-data storage to a dedicated intrusive pool. The inspected unit code also coordinates bank selection/loading, audio initialization, streamed playback, and GObj-backed sound control.

### shard-main__melee__lb__lbaudio_ax-024
The six assigned parameter subjects contain no baseline facts, so there are no fact dispositions. Canonical source shows that calcPan interpolates from the smaller endpoint toward the larger, clamps the result to 0–127, and returns 64 for equal endpoints; callers supply pan_left and pan_right. fn_80023254 uses its argument to filter table rows while rebuilding an index list. fn_80023750 forwards its first argument unchanged and doubles and clamps its second and third arguments to 0–255 before calling AXDriver_8038CFF4. These are source-level observations, not verified compiled-register mappings.

### shard-main__melee__lb__lbaudio_ax-025
The assigned parameter subjects belong to three audio helpers. fn_80023750 forwards track and channel unchanged after doubling and clamping volume and pan. fn_80023ED4 forwards a path, doubles and clamps volume to 0–255, and clamps its third argument to 0–8. fn_80024654 recomputes audio mix values; an argument equal to 1 forces downstream updates, while other values use cached-value comparisons. All six assigned subjects have empty baseline fact arrays, so there are no fact dispositions to return. This review does not claim full translation-unit coverage.

### shard-main__melee__lb__lbaudio_ax-026
The assigned subjects have no baseline facts. The current source contains a four-integer helper, `calcPan`, that caps current progress at the end, interpolates from the smaller endpoint toward the larger, clamps the result to 0–127, and returns 64 for equal endpoints. Its association with the assigned legacy `fn_800250A0` parameter identities is not established. `fn_800251EC` accesses sound user data through its object argument and updates pan using an owner's position and camera-provided bounds; it returns true when required data or a supported owner position is unavailable. `fn_800253D8` accesses sound user data through its object argument and writes either the calculated pan or 127 minus that value, according to whether `x3C` equals 1.0; it always returns false.

### shard-main__melee__lb__lbaudio_ax-027
The six assigned parameter subjects correspond to functions taking an `HSD_GObj* gobj`. Each checks the object and its audio user data before operating and always returns false. `fn_800256BC` writes either calculated pan or its 127-complement according to `x3C`. `fn_800259A0` sets `x44` before invoking position-dependent pan calculation once; `fn_800259EC` and `fn_80025A98` similarly invoke `fn_800253D8` once. `fn_80025B44` writes calculated pan directly, whereas `fn_80025CBC` writes its 127-complement. All six appear in the callback table used to initialize `ud->x10`. The bundle contains no baseline facts for these subjects, so there are no fact dispositions.

### shard-main__melee__lb__lbaudio_ax-028
The assigned parameters belong to audio-object initialization, per-frame processing, volume calculation, and a chained load callback. fn_80025FAC takes an object, writable user data, and initialization parameters; its caller allocates and attaches that user data before initialization. fn_80025E38 accesses the supplied object's user data to calculate volume and always returns false. fn_800262A0 invokes the object's selected callback, updates its voice settings, and handles frame progression or object-removal calls. fn_80026C04 matches its first integer argument against stored load identifiers, updates matching bookkeeping, then attempts another load. All six assigned subjects have empty baseline fact arrays; there are no baseline fact dispositions to return.

### shard-main__melee__lb__lbaudio_ax-029
The six assigned parameter subjects have no baseline facts. Current source shows an unused second integer parameter in fn_80026C04; an unchecked integer array index in fn_80026E58, which tests whether the selected state equals 2; row and column selectors in lbAudioAx_8002305C, with only the row checked; a checked index in lbAudioAx_80023090; and a checked row selector in lbAudioAx_800230C8, which optionally copies two table entries to output pointers. This review covers only the bounded subjects, not the entire translation unit.

### shard-main__melee__lb__lbaudio_ax-030
The six assigned parameter subjects have no baseline facts. Current source shows two optional integer output pointers for range endpoints, an integer searched against inclusive table ranges, a bounded table-row index, an integer conditionally translated through a two-column mapping table, and an integer forwarded to AXDriverKeyOff. This review covers only these assigned subjects, not the complete translation unit.

### shard-main__melee__lb__lbaudio_ax-031
Reviewed the current bodies associated with the six assigned parameter subjects. `lbAudioAx_80023710` forwards its integer argument unchanged to `AXDriver_8038D9D8`. `lbAudioAx_800237A8` passes id, volume, and pan through a helper, substituting fixed arguments for ids at or above 0x83D61. The helper doubles volume and pan and clamps each to 0–255 before forwarding to the driver. `lbAudioAx_80023870` delegates to that wrapper when track is zero; otherwise id 0x83D61 triggers track key-off and returns -1, while other ids reach the helper. All six assigned subjects have empty baseline fact arrays; there are no baseline facts to disposition.

### shard-main__melee__lb__lbaudio_ax-032
The assigned subjects have no baseline facts. Their containing functions forward pan and track arguments, select language-dependent audio-data lists for counting or indexed access, and conditionally unload/load a bank before forwarding an ID to the playback helper. This review covers these containing bodies, not the entire translation unit.

### shard-main__melee__lb__lbaudio_ax-033
The six assigned parameter subjects have no baseline facts. Their current function bodies select an HPS filename by a bounded index, select a fixed audio-request table entry, forward identifiers with fixed request arguments, or select a track from an identifier while forwarding a supplied volume. No gameplay categories or compiled register layouts are established by this review.

### shard-main__melee__lb__lbaudio_ax-034
The assigned function bodies implement ID-dependent audio request forwarding and a clamped stream-volume control. `lbAudioAx_80024184` forwards `pan` unchanged and selects or overrides `track` by ID; only ID 0x20D preserves a supplied track other than -1. `lbAudioAx_80024304` normalizes three IDs to 0x8B with track 0x16, otherwise using track zero. `lbAudioAx_8002438C` forwards its ID with fixed remaining arguments. `lbAudioAx_800243F4` derives a track through switch fallthrough while preserving the ID. `lbAudioAx_800245D4` clamps its input to 0–127 and stores it in the scalar subsequently used to compute stream volume. All six assigned subjects have empty baseline fact lists.

### shard-main__melee__lb__lbaudio_ax-035
The assigned subjects have no baseline facts. Their current containing functions implement three clamped integer setters and two driver wrappers: lbAudioAx_800245F4 stores and returns an input clamped to 0–127; lbAudioAx_80024614 stores an input clamped to 0–127; lbAudioAx_80024634 stores an input clamped to 0–255. lbAudioAx_80024B1C forwards voice unchanged and doubles its clamped pan argument; lbAudioAx_80024B58 forwards voice unchanged while clamping and doubling its separate volume argument. This review covers only the assigned parameter subjects, not the entire translation unit.

### shard-main__melee__lb__lbaudio_ax-036
The assigned parameters belong to wrappers that clamp and forward driver arguments, translate a sound-mode selector, select a table column, and refresh or insert a value in a 16-entry table. All six assigned subjects have empty baseline fact arrays; there are no baseline facts to disposition. Review is limited to this bounded shard.

### shard-main__melee__lb__lbaudio_ax-037-schema6
The six assigned parameters control a stored pause flag and driver pause/resume selection, a separate flag with paired float-state changes and driver calls, two positive-only counter decrements clamped at zero, and two independent boolean-to-float assignments. All assigned subjects have empty baseline fact lists; there are no baseline dispositions to emit. This review covers only these bounded parameter subjects.

### shard-main__melee__lb__lbaudio_ax-038
The assigned subjects contain no baseline facts. The inspected canonical body of lbAudioAx_80025098 copies its boolean argument into debug_enabled. lbAudioAx_800263E8 packages its arguments into SoundParams, creates a sound-class GObj and pooled user data, installs an update procedure, and initializes the controller; it returns NULL for an out-of-range sound ID or allocation failure. These source-level observations do not establish the register-labeled parameter identities.

### shard-main__melee__lb__lbaudio_ax-039
The assigned parameters belong to lbAudioAx_800263E8. This function packages its arguments into SoundParams, creates a sound-class GObj and allocator-backed user data, installs fn_800262A0, and initializes the controller through fn_80025FAC. It returns NULL when the sound-ID threshold check fails or allocation fails. The initializer copies volume and pan endpoints into controller state, selects a callback, and either starts a voice or adopts the supplied voice. The six assigned subjects contain no baseline facts.

### shard-main__melee__lb__lbaudio_ax-040
The six assigned parameter subjects have no baseline facts. Their current function bodies cover retrieving a voice ID from an object's sound userdata; matching audio objects by owner, optionally also by a nonnegative-sentinel voice ID, before key-off and object-removal calls; bounds-checked CharacterKind table lookup; and conversion of a StKind input through Stage_8022519C to a checked table entry used to produce a single-bit u64 result. This review is limited to the assigned subjects, not complete translation-unit coverage.

### shard-main__melee__lb__lbaudio_ax-041
The assigned subjects have no baseline facts. Canonical source shows that lbAudioAx_80026F2C expands five flag bits into a mask and marks selected array entries -1. lbAudioAx_8002702C expands the same flag groups and intersects them with an input mask after adding a fixed mask, marking matching entries 1. lbAudioAx_80027AB0 conditionally forwards its ID during a saved-language change, except for 0x83D61. lbAudioAx_ObjFree returns a non-null user-data allocation to the audio object pool; the audio-object constructor registers it as the user-data destructor. These are source-level observations, not verified register-parameter bindings or gameplay mappings.

### shard-main__melee__lb__lbaudio_ax-042
Reviewed the 12 assigned links against current source. The examined routines support frame- and position-dependent panning, persistent-voice volume updates, SFX playback requests, character/stage bank selection and loading, entry audio, sound-mode selection, and developer audio statistics. Super Star attribution and the broader master-volume interpretation remain unresolved. This review does not establish complete TU coverage.

### shard-main__melee__lb__lbaudio_ax-043
The reviewed routines load and track synthesizer banks, maintain retained sound voices, initialize auxiliary-effect parameters, expose identifier ranges, convert sound-mode and pan controls, and manage sound-controller handles and cleanup. Review is limited to the twelve assigned links; lower-level driver semantics remain deferred where not independently established.

### shard-main__melee__lb__lbaudio_ax-044
Reviewed the 12 assigned links against current canonical bodies and relevant helpers. The bounded functions implement channel pause/resume, handle liveness and volume controls, managed-controller retirement, bank preparation/cancellation, stream cleanup, and group attenuation. One link incorrectly categorizes the singleton disc-audio pause control as sound-effect pausing.

### shard-main__melee__lb__lbaudio_ax-045
The reviewed functions manage sound-controller callbacks and termination, forward playback and pan controls to AXDriver, resolve audio-load archive data, and allocate, load, evict, and cancel SFX banks. Language changes conditionally reload three banks. Stream selection caches a filename and delegates changed selections to AXDriver. This review covers only the assigned links, not the entire translation unit.

### shard-main__melee__lb__lbaudio_ax-046
The reviewed links cover stream stop/reset, mix reset and developer controls, managed sound-controller termination and allocation, and character-dependent asynchronous sound-bank loading. Current source supports these relationships except the deferred Sound Test–Trophy Gallery metadata chain. This is bounded link review, not complete translation-unit coverage.

### shard-main__melee__lb__lbaudio_ax-047
Reviewed the twelve assigned links against current source. The bounded evidence supports bank-aware SFX playback, bank-load completion, managed voice access, volume and pan controls, Sound Test integration, temporary audio suppression during disc-error presentation, and singleton disc-audio status. Compiled .data-section attribution remains unresolved; this is not a full translation-unit review.

### shard-main__melee__lb__lbaudio_ax-048
Reviewed the 12 assigned links against current source and necessary callers. The examined code selects and reloads SFX banks, waits for completion and finalizes slot state, cleans up pending loads, forwards playback controls, applies volume mixing, and participates in match pause transitions. Function-to-TU relationships are supported; compiled-section ownership remains unverified. This is bounded link review, not complete TU coverage.

### shard-main__melee__lb__lbaudio_ax-049-recovery5
Reviewed the twelve assigned links against current canonical source. The inspected audio code starts and maintains SFX voices, creates callback-driven sound controllers, computes and forwards pan controls, reconciles asynchronous bank loads, and supplies audio operations used by camera snapshots, crowd reactions, collision sounds, and Sound Test. The Hammer-specific caller chain remains unverified. This is bounded link review, not complete translation-unit coverage.

### shard-main__melee__lb__lbaudio_ax-050
The reviewed functions submit scaled SFX requests, reset playback state, compose cached stream and grouped SFX levels, initiate selected bank loads, select language-dependent SFX configuration, and supply a developer audio diagnostic. This review covers only the assigned links, not the entire translation unit.

### shard-main__melee__lb__lbaudio_ax-051
The reviewed links cover SFX request normalization, managed voice creation and updates, one-shot pan initialization, mix defaults and gains, bank-selection clearing, and indexed HPS stream replacement. Current source supports these audio mechanisms, but does not by itself establish compiled .sbss membership or the claimed character-selection-screen context. Review is limited to the assigned links.

### shard-main__melee__lb__lbaudio_ax-052
Reviewed the 12 assigned links against current canonical source. The reviewed routines support audio restoration after the disc-status presentation, group fading and mix controls, bank-load completion tracking, language-specific resource replacement, debug-overlay state, and allocated sound controllers with frame-driven volume updates. Initialization belongs to this translation unit. Compiled .sdata attribution remains unverified; this is not complete TU coverage.

### shard-main__melee__lb__lbaudio_ax-053
Reviewed the twelve assigned links against current canonical source. The inspected routines participate in character-dependent stage BGM selection, sound request submission and track shutdown, managed pan/volume updates, stream cleanup, and sound-bank classification and loading. Bank reload on language change is conditional. The volume callback's descending formula is not ordinary endpoint interpolation. Debug-menu integration and the downstream pitch conversion remain explicitly deferred; this is not complete TU coverage.

### shard-main__melee__lb__lbaudio_ax-054
The reviewed links cover pan interpolation and one-time pan initialization, sound-ID remapping, playback submission, group-volume fade reset, debug voice reporting, sentinel-list counting, and character-selected asynchronous sound-bank loading. Current source supports these relationships with qualifications below. The global key-off-to-ramping connection and compiled .bss attribution remain unresolved; this review does not establish complete TU coverage.

### shard-main__melee__lb__lbaudio_ax-055
The reviewed relationships cover audio-bank capacity planning and stage selection, persistent stream-volume control, shared SFX attenuation, voice termination, stream replacement, match-ending audio reset, and language-dependent SFX resource replacement. This review is limited to the ten assigned links, not the complete translation unit.

Status: researched; no-change lead bypass; independent review and live promotion pending.
