# lbAudioAx functionality

Pinned revision: `c302741689bd67c361cd7faadb221df3193992c3`. Draft semantic review only. Canonical source and both paired headers, plus their proposed-name views, were read to EOF. `coverage.json` records UTC timestamps, every fact version and separate physical/rendered ranges. The 209 subjects contain 99 targets, 110 entities and 569 facts. Four historical parameter entities still refer to `fn_800250A0`; the current helper is `calcPan`, and no identity migration is assumed.

## Playback and streams

The common SFX adapter doubles volume and pan before clamping to 0–255, so arbitrary signed-int overflow is not protected. Per-handle setters instead clamp to 0–127 before doubling to 0–254. Ordinary playback uses channel7 and track0. IDs at or above `0x83D61` become the silent fallback tuple; negative IDs pass. On nonzero tracks only `0x83D61` means track key-off, whereas other IDs go directly to the adapter. Global and per-handle key-off wrappers always return -1, independently of driver success.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbaudio_ax.c#L195-L263 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbaudio_ax.c#L804-L836.

Indexed stream selection accepts0–97, compares a constructed HPS path with a cached path, stops the previous singleton, caches the replacement and attempts startup. Return0 means a changed path was attempted, not proven playback. The startup return is ignored and the same path is not retried. The low-level AXDriver starter itself returns true after submitting its path-derived DVD entry. Stop clears the high-level cached stem and marker and returns -1. The pause wrapper controls this same singleton stream, not all channelized SFX.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbaudio_ax.c#L379-L435 and code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/axdriver.c#L1276-L1321.

## Tables and sound identity

The character BGM table has33 rows and two columns; only the row is checked. The stage resolver uses this table for its -2 dynamic-BGM marker. The bank-range classifier examines55 inclusive ranges and returns sentinel55 for invalid or unclassified IDs. Optional range outputs may alias, in which case the upper bound wins. Bank33 is `kirbytm.ssm`: finalized state2 selects paired-ID mapping toward that bank, otherwise bank33 IDs map in reverse. This is distinct from JP/US path selection. The paired table does not establish regional remapping.

The archive supplies four language-dependent SFX-group tables. The nominal MUST_MATCH bounds guards use impossible conjunctions and do not validate group or entry indices. Sound Test uses the count to wrap selection and resolves an entry before bank-aware playback. Menu presets check only index<11, so a negative index is not rejected. Hit SFX IDs choose fixed tracks, except `0x20D`, which keeps any track other than -1. The announcer dispatcher selects IDs from `nr_name.ssm` and the local fallthrough switch assigns distinct tracks.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbaudio_ax.c#L39-L193; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbaudio_ax.c#L265-L328; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbaudio_ax.c#L438-L635; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbaudio_ax.static.h#L211-L248; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mn/mnsoundtest.c#L430-L469.

## Mix, pause and queued replay

Mix maintenance derives a stream gain, four SFX group outputs and auxiliary sends. Exactly force==1 bypasses caches. SFX group8 omits the shared fade factor that affects groups1–7. Integer-to-byte conversions are not a general final clamp for arbitrary corrupted global values. Auxiliary sends for channels5/6 use32;7/8 use the configured value. Saved sound balance feeds two complementary gains; developer controls independently gate BGM and FGM. Sound-mode0/1 maps through1/0 and matching cached state skips a hardware write.

Gameplay pause applies0.2 factors and pauses channels5,6,8,7. Broad suspension sets stream gain0 and pauses2–9 without changing the high-level stream-gain cache; restoration uses that retained gain and preserves gameplay pause. Transient reset clears the singleton paused latch but does not call singleton stream resume. A stored latch is not proof of actual resumed stream state.

The tracked-SFX backing arrays have17 entries, but registration, aging and replay use16. Registration refreshes a ten-tick TTL or inserts into the first empty slot; full queues drop new IDs. The reset variant sets a flag that REPLAYS queued IDs at full volume and centered pan before clearing them. It does not merely retire queued sounds. This replay still occurs while gameplay is paused. The two persistent voices use IDs0x84/0x85, tracks5/6 and channel4; TTLs510/480 and reference counters govern them. New activation mutes the other slot, and losing the final reference submits a sentinel request on the reserved track. Hammer registration and release are independently traced; exact Super Star item identity remains deferred.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbaudio_ax.c#L637-L1030; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbaudio_ax.c#L1976-L2083; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_HammerWait.c#L104-L214.

## Managed controllers

Each controller owns0x48 bytes of pooled userdata. Initialization indexes the ten-entry callback table before its unchecked mode switch. Modes0–8 start voices;9 adopts the supplied handle. Negative duration becomes0, not a safe positive duration. The constructor checks only an upper SFX-ID bound and allocation results; negative IDs and invalid modes are not generally rejected. A returned GObj does not prove successful sound playback.

Pan interpolation moves from the lesser endpoint toward the greater regardless of argument ordering; equal endpoints return64. Unequal endpoints with duration0 divide by zero and negative progress is not raised to0. Endpoint subtraction is floating-point; a NaN result is not made safe by clamp comparisons before conversion to int. Mirroring changes64 to63. Entity-relative pan interpolates only strictly inside properly ordered camera bounds; at or beyond either edge it stays64, rather than clamping to the corresponding edge pan. Once callbacks set their latch before delegation and never retry failure.

Volume computation uses `start + delta` for increasing endpoints but `end - delta` otherwise. With start100, end20 and positive duration, the decreasing branch starts20 and ends-60 before the downstream setter clamps it; it does not fade100→20. Equal endpoints still perform division, so duration0 is unsafe here too. The process invokes the callback BEFORE checking expiration. It forwards any voice ID other than -1, destroys the controller on callback completion or enabled lifetime expiry, otherwise increments current_frame, even from -1. Ordinary controller destruction frees userdata without local voice key-off. Explicit owner/voice stop operations key off first. StopAll rejects NULL owner; StopOne permits it as an equality key.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbaudio_ax.static.h#L11-L31 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbaudio_ax.c#L1032-L1527.

## Bank lifecycle

Five56-entry arrays hold desired selection, active request, load state, load handle and ranking. Normal scans cover55 slots. State-1 is missing,1 is callback-completed and2 is finalized. Priority selection scans metadata column1 from4 down to0 and chooses the first missing requested slot. Eviction uses column2 from0 up to4, clears handles/state and subtracts resident bytes before synchronous bank2 compaction. Recalculation distinguishes requested, resident and missing requested bytes. The callback subtracts completed bytes from requested/missing totals, adds resident bytes and starts the next eligible load.

Cancellation tries each eligible handle at most64 times and clears tracking even without a successful cancellation; remaining pending work triggers a wait and bank2 unload. Finalization waits until no requested slot is-1 and then promotes requested1→2. No local timeout or error escape exists. Reload demotes nonpermanent2→1 BEFORE its early-return test. Category selection adds the fixed common mask with `+=`, not OR; overlapping bits may carry. Selection only enables, category clearing only disables. Stage conversion occurs before bounds checking the translated result.

Bank-aware preview uses metadata column1 to decide whether to replace, but clears arrays according to column2. It marks state2 after waiting without a local success-result check. Unclassified IDs may lead to sentinel55 and its NULL filename. Localization selects `/audio/` or `/audio/us/`; path state is refreshed even when no language reload is required.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbaudio_ax.c#L346-L377; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbaudio_ax.c#L1529-L1966.

## Initialization, storage and limits

Hardware startup calculates bank0 from the core bank size, bank1 from slots51,1,54, and bank2 from the largest category3 bank, four largest category4 banks and largest category5 bank. It initializes AR/ARQ/AI and installs fixed53KiB reverb and71KiB delay heaps. Reverb defaults and sizing use type2. Delay defaults use type4, but its assertion asks for heap size using type2 and a delay object; installation then uses type4. The assertion therefore does not correctly validate delay size. Installation return values are ignored and there is no one-time-call guard.

Existing source/split objects contain .data6161/6168 bytes, .bss128340/128344, .sdata194/200, .sbss104/104 and .sdata2 40/40. Small data also contains short SSM strings. Seven bank accounting variables are six signed ints plus one unsigned int. Objects were inspected without rebuilding or establishing current source/object equivalence; exact bytes and hashes are in `object-evidence.json`.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbaudio_ax.c#L2085-L2276 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbaudio_ax.static.h#L323-L331.

## Review boundary

`coverage.json` contains each subject and all569 fact IDs and versions. `link-dispositions.json` contains all166 original outgoing records with canonical evidence, including rejected wording and unresolved consumers. No facts or links were applied to the shared KB. No source, build, matching, UI, Git or publication work was performed.

Lead review:94 writes pass dry-run. Baseline569 facts:438 retain,94 supersede,37 unresolved. Exact166 links:143 retain,4 reject,19 unresolved. Optional language-change sound occurs after metadata replacement and before bank unloading/loading. Foreign match-pause, Camera Mode, disc-error and storage-service claims remain deferred where their exact evidence was not recorded; bounded-pan relation wording also awaits finite-input qualification.

Final overlay correction:95 writes validated;437 inherited facts retained,95 superseded,37 unresolved. dbsound.c overwrites x with the virtual count before printing both current columns, although the PVoice peak uses the earlier associated-node count. Final proposal73d363e2fd606a951ec5eac91c183f8a1493a659af2a2f51fc9f0b8038222218.
