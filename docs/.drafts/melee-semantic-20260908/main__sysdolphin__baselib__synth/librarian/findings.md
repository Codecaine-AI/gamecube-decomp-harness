# Synth review

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`; UTC 2026-09-08T15:49:50.865Z to 2026-09-08T16:00:38.093615+00:00. Complete canonical and separately rendered reads: synth.c1539lines, synth.h65lines, synth.static.h108lines. Zero parse errors. Rendered replacements were checked against canonical symbols, not used as evidence.

{"subjects": 155, "targets": 56, "function_targets": 51, "section_targets": 5, "parameter_entities": 98, "facts": 277, "retained": 160, "superseded": 95, "unresolved": 22, "proposed_facts": 193, "links": 75, "links_retained": 66, "links_unresolved": 8, "links_rejected": 1}

## Function and parameter ledger

### HSD_AudioMalloc

void* HSD_AudioMalloc(size_t size)

- size_t size: requested payload bytes; selected heap must already be configured.

purpose: Allocates caller-requested storage from the synthesizer's dedicated audio heap and treats exhaustion as an audio-heap overflow assertion instead of exposing an ordinary nullable allocation interface to audio-system callers.

data_flow: The caller's byte count is forwarded unchanged with the global synth heap handle HSD_Synth_804D6018 to OSAllocFromHeap. The resulting pointer flows through a non-null assertion and is returned unchanged; one concrete consumer, HSD_DevComRequest, uses this allocator to expand its asynchronous device-request descriptor pool by INIT_N_DEVCOMS entries.

state_behavior: On successful heap allocation, the function immediately returns the allocated payload without initialization. If the selected audio heap has no suitable free block, OSAllocFromHeap returns NULL and HSD_AudioMalloc enters its assertion-report path with the message "audio heap overflow" rather than normally returning the null pointer.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/synth.c#L20-L25

### HSD_AudioFree

void HSD_AudioFree(void* ptr)

- void* ptr: owned live payload from selected audio heap.

purpose: Provides the deallocation half of the synth subsystem's audio-heap interface, returning allocations made from its dedicated audio heap to reusable heap storage.

data_flow: Receives an audio-allocation payload pointer, reads HSD_Synth_804D6018 as the owning heap handle, and forwards both unchanged to OSFreeToHeap. The callee subtracts 0x20 from the payload address to recover its Cell header, removes that cell from the heap's allocated list, and inserts it into the free list.

state_behavior: Performs no local null, ownership, or allocation-state check; it delegates immediately. OSFreeToHeap enforces allocator initialization, arena range, 32-byte alignment, active heap, heap ownership, and allocated-list membership before transitioning the cell from allocated to free state.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/synth.c#L27-L30

### HSD_SynthSFXSampleLoadCallback

static void HSD_SynthSFXSampleLoadCallback(int result, int length, void* addr, bool cancelflag)

- int result: ignored request ID; declaration may use a recovered noncanonical type.
- int length: ignored opaque callback argument, not a byte count.
- void* addr: ignored destination buffer.
- bool cancelflag: ignored cancellation flag; not used to validate completion.

purpose: Finalizes an asynchronous sound-effect sample-bank load. It reorganizes the transferred metadata into persistent bank-owned records, relocates each sample descriptor to the bank's current audio-memory base, indexes the resulting sound definitions by SFX ID, invokes the request's completion callback, advances the bank write position, and then removes the completed request and starts the next queued load.

data_flow: The active queue entry supplies the destination bank, source file entry, requester callback, and callback mode, while `hsd_SynthSFXLoadBuf` supplies metadata size, sample-byte count, SFX-record count, base SFX ID, and four header words. The callback shifts transferred metadata backward inside its allocation to create an aligned prefix, restores the header words, and appends the allocation to the bank's allocation list. It then emits one indexed definition for each consecutive SFX ID, copies and relocates each definition's voice descriptors by the current bank offset, inserts it into hash bucket `sfx_id & 0x1F`, notifies the requester, and advances the bank write position. The playback path later resolves those indexed records to configure AX voices.

state_behavior: Ignores all callback parameters; global cancellation decides commit versus free. Normal path trusts sizes/counts, relocates descriptors, publishes lookup records and invokes the user callback BEFORE advancing the bank cursor and decrementing/compacting the queue. Reentrant enqueue can observe stale cursor/full queue; no reentrancy guarantee. The expression e+0x10 != NULL tests an address, not the u16 field, so for an ordinary allocated record the branch adds the ARAM base to offset0x14 regardless of the field; the alternative is not a valid field-zero fallback. Canceled path frees temporary storage and clears cancellation. Common tail masks interrupts, decrements queue, shifts slots and starts the next head.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/synth.c#L49-L149

### HSD_SynthSFXHeaderLoadCallback

static void HSD_SynthSFXHeaderLoadCallback(int result, int length, void* addr, bool cancelflag)

- int result: ignored request ID; declaration may use a recovered noncanonical type.
- int length: ignored opaque callback argument, not a byte count.
- void* addr: ignored destination buffer.
- bool cancelflag: ignored cancellation flag; not used to validate completion.

purpose: Continues a queued bank load by checking bank space, allocating metadata storage and submitting metadata and sample transfers at the same priority. The sample callback installs records; an already globally canceled load instead runs its cleanup path directly.

data_flow: Inputs arrive indirectly through the active load record and `hsd_SynthSFXLoadBuf`: the active record supplies the DVD entry number and bank ID, while header words supply metadata size, sample byte count, and stream-record count. The callback computes aligned temporary storage, records two returned DevCom handles, copies post-prefix metadata from file offset 0x20 into that storage, and copies the aligned sample region into the current bank write address with completion delegated to `HSD_SynthSFXSampleLoadCallback`.

state_behavior: Ignores all callback parameters including cancellation flag; global HSD_Synth_804D7738 decides the branch. Normal path asserts bank space, allocates remaining metadata and submits metadata/sample requests at priority1; no independent parallel completion guarantee is established. Header sizes and arithmetic are trusted. Global-canceled path clears temporary pointer and directly calls sample completion, advancing the queue.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/synth.c#L151-L184

### HSD_SynthSFXLoadNewProc

void HSD_SynthSFXLoadNewProc(void)


purpose: Starts asynchronous processing of the current sound-effect bank-load queue head by requesting the file's initial 0x20-byte header into the shared SFX load buffer and delegating completion to `HSD_SynthSFXHeaderLoadCallback` for validation and payload scheduling.

data_flow: When the pending count is nonzero, the function reads `HSD_Synth_804C2A60[0].entrynum` and submits a DevCom request with file offset zero, destination `hsd_SynthSFXLoadBuf`, size 0x20, transfer type 0x21, priority lane 1, and `HSD_SynthSFXHeaderLoadCallback`. The returned request handle is written to `HSD_Synth_804D6028[0]`, and the callback interprets the transferred header to issue continuation transfers.

state_behavior: No-op with an empty queue; otherwise masks interrupts, submits the current head header and stores its request ID. No in-flight guard prevents direct repeated calls from submitting the same head again.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/synth.c#L186-L195

### HSD_SynthSFXLoad

int HSD_SynthSFXLoad(const char* filename, int bankID, void (*cb)(int, int), int mode)

- const char* filename: DVD pathname; conversion errors not checked.
- int bankID: bank index asserted against current allocated-bank count.
- void (*cb)(int, int): optional completion callback called with entry number and mode before cursor/queue advance.
- int mode: opaque retained value forwarded to completion callback.

purpose: Submits a sound-effect bank load by resolving the requested DVD file, waiting for space in the synthesizer's load queue, enqueuing the file and bank parameters, and starting processing when the new request is the only pending load.

data_flow: The input filename is converted to a DVD FST entry number. That entry number, bank ID, callback, and mode are copied into the queue slot indexed by the current pending count; the count is incremented, processing starts if the resulting count is one, and the same entry number is returned.

state_behavior: Converts filename to DVD entry without checking conversion failure. Busy-waits while queue count>=6 before masking interrupts, then enqueues and starts processing on empty-to-nonempty transition. Bank ID is asserted against the current bank count before lookup. No timeout, yielding or reentrant full-queue protection.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/synth.c#L197-L224

### HSD_SynthSFXWaitForLoadCompletion

void HSD_SynthSFXWaitForLoadCompletion(void (*callback)(void))

- void (*callback)(void): required service callback while queue nonempty.

purpose: Provides a cooperative blocking barrier for asynchronous SFX-bank loading. While the Synth load queue is nonempty, it repeatedly invokes a caller-supplied service callback so surrounding systems can continue processing until every queued load has completed or been removed.

data_flow: Reads `HSD_Synth_804D772C`, the total queued SFX-load count, and repeatedly transfers control to the supplied callback while that value is nonzero. SFX load submission appends a request and increments the count; asynchronous sample completion removes the front request, decrements the count, and starts the next request. The wait routine returns only after those external loader operations reduce the count to zero.

state_behavior: If the SFX load queue is already empty, the routine returns immediately without invoking the callback. Otherwise it remains in the wait state, calling the callback once per iteration and rechecking the queue count afterward. It has no timeout, cancellation branch, delay, or null-callback guard, so termination depends entirely on external processing eventually reducing the queue count to zero.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/synth.c#L226-L231

### HSD_SynthSFXGetPendingLoadCount

int HSD_SynthSFXGetPendingLoadCount(void)


purpose: Reports how many SFX-bank load requests remain actionable, excluding an active head request as soon as cancellation has been initiated even though that request still occupies the queue until its callback completes.

data_flow: `HSD_Synth_804D772C` receives increments when loads are enqueued and decrements when loads complete or queued requests are cancelled. `HSD_Synth_804D7738` is set while the active queue head is being cancelled and cleared by callback cleanup. This function reads both globals and returns their difference.

state_behavior: Returns pending count minus global cancellation flag through separate unmasked reads. It discounts a canceling head under ordinary state, but no atomic snapshot across asynchronous updates is guaranteed.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/synth.c#L233-L236

### HSD_SynthSFXCancelLoad

int HSD_SynthSFXCancelLoad(int entrynum)

- int entrynum: DVD entry/load handle to cancel.

purpose: Cancels a pending asynchronous sound-effect bank load identified by its DVD filesystem entry number. A queued request is removed immediately, while the active head request is cancelled cooperatively by marking the synth load as cancelling and forwarding cancellation to both tracked DevCom operations.

data_flow: The input entry number is compared against records in the shared synth load queue. If it matches the active record at index 0, the routine sets the active-cancellation flag and passes each of the two tracked DevCom request IDs to HSD_DevComCancelEx. If it matches a record at index 1 or later, all following records are shifted down one slot and the pending-load count is decremented. The function returns whether either path found a match.

state_behavior: Masks interrupts while inspecting the queue. Matching uncanceled head sets global cancellation and forwards both retained request IDs; the second ID can be from an earlier stage/load. Repeated cancellation does not resend for the already marked head. Non-head match is removed by compaction; absence returns0. DevComCancelEx can deliver a queued cancellation callback synchronously, so callback-driven queue mutation can occur during this operation; no isolated cancellation transaction is guaranteed.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/synth.c#L238-L271

### HSD_SynthSFXAllocateBank

void HSD_SynthSFXAllocateBank(int size)

- int size: requested next bank byte extent; no negative/overflow validation.

purpose: Reserves the next contiguous partition of the synthesizer's preallocated SFX-bank ARAM arena and assigns that partition to a new bank.

data_flow: Reads `hsd_SynthSFXBankNum` to select the current bank slot, reads `hsd_SynthSFXBankHead[current]` as its base, writes that base to `hsd_SynthSFXBank[current]`, writes `base + size` to `hsd_SynthSFXBankHead[current + 1]`, compares the new boundary with `hsd_SynthSFXBankAREnd`, and finally increments `hsd_SynthSFXBankNum`.

state_behavior: Writes the new current bank cursor and next boundary before the capacity assertion, then increments the bank count. No local bank-count<32, negative-size or arithmetic-overflow guard exists. Assertion failure is not transactional rollback.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/synth.c#L273-L285

### HSD_SynthSFXUnloadBank

void HSD_SynthSFXUnloadBank(int bank_id)

- int bank_id: trusted bank index; no local bounds guard.

purpose: Fully tears down one loaded SFX bank: it stops sounds belonging to the bank, unregisters the SFX identifiers contributed by every loaded bank node, frees all of those nodes, and makes the bank's address range available again from its original head.

data_flow: bank_id is forwarded to HSD_SynthSFXStopRange and selects the list head HSD_Synth_804C2AE0[bank_id]. For each node, next1 is the first registered SFX identifier and priority is the number of consecutive identifiers to remove; the node's next pointer advances the list before the old node is freed. After the list becomes null, hsd_SynthSFXBank[bank_id] is reset from hsd_SynthSFXBankHead[bank_id].

state_behavior: Stops nodes selected by first-voice current-address membership, removes every listed block and its registrations, frees metadata, then resets the bank cursor to its fixed head. Does not validate bank index or cancel/wait for pending loads; range selection does not prove absence of every secondary/loop reference.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/synth.c#L303-L316

### HSD_Synth_80388DC8

void HSD_Synth_80388DC8(int sfx_id)

- int sfx_id: one SFX resource ID removed from hash chain; no freeing.

purpose: Unregisters one sound-effect definition from the synthesizer's SFX-ID lookup table, allowing bank and selective-file teardown paths to remove the definition without freeing it directly.

data_flow: Receives an SFX ID from a bank or selective-file cleanup loop, masks it with `0x1F` to select `HSD_Synth_804C29E0`, and traverses that bucket through pointer-to-pointer links. On an exact ID match, it replaces the incoming link with the node's successor; otherwise it advances to the next link. Ownership and deallocation remain with the cleanup caller.

state_behavior: The operation is a first-match unlink. An empty bucket or absent ID is a no-op; a matching head or interior node is removed and the function returns immediately. Other nodes in the collision chain retain their order, and the detached node itself is not modified or freed by this routine.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/synth.c#L318-L330

### HSD_Synth_80388E08

void HSD_Synth_80388E08(int sfx_id)

- int sfx_id: DVD entry/load handle despite sfx_id name.

purpose: Selectively unloads one previously loaded SFX file's registration block: it finds the block by the DVD entry number returned from HSD_SynthSFXLoad, unregisters every SFX ID contributed by that file, unlinks the block from its bank's loaded-file list, and frees the block's main-memory allocation.

data_flow: HSD_SynthSFXLoad converts a filename to a DVD entry number and returns it. After loading, the sample callback appends a block to one of 32 bank lists and records that entry number together with the first registered SFX ID and the number of consecutive IDs. This routine receives the retained entry number, searches every bank list, passes the matching block's SFX-ID range to HSD_Synth_80388DC8 for lookup-table removal, then splices the block out and frees it through the synth audio heap.

state_behavior: Searches all32bank lists for first matching DVD entry, unregisters its consecutive SFX IDs, unlinks/frees metadata and returns. Does not stop playing voices, reclaim the ARAM cursor, compact payloads or cancel pending loads. No match leaves state unchanged.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/synth.c#L332-L352

### HSD_SynthSFXGroupDataReaddressCallback

static void HSD_SynthSFXGroupDataReaddressCallback(void* result, int length, void* addr, int cancelflag)

- void* result: ignored request ID; declaration may use a recovered noncanonical type.
- int length: ignored opaque callback argument, not a byte count.
- void* addr: ignored destination buffer.
- int cancelflag: ignored cancellation flag; not used to validate completion.

purpose: Completes one asynchronous SFX group-data readdress request by asserting that an operation is outstanding and decrementing the shared outstanding-request counter.

data_flow: Its completion arguments are ignored. Its sole input is the global `sfxGroupDataReaddressCounter`, which the initiating readdress routine increments before submitting an `HSD_DevComRequest`; the callback validates and decrements that value, and `HSD_SynthSFXBankDeflagSync` consumes the resulting state by waiting for the counter to reach zero.

state_behavior: Ignores all completion parameters, asserts outstanding count>0 and decrements it. No request identity, cancellation or copy-success check; zero permits the polling barrier to exit without proving transfer success.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/synth.c#L354-L359

### HSD_SynthSFXGroupDataReaddress

void HSD_SynthSFXGroupDataReaddress(AXVPB* arg0, void* callback)

- AXVPB* arg0: metadata block cast as AXVPB; next1=first ID,priority=count,callback=payload address,userContext=payload bytes.
- void* callback: destination ARAM address cast as pointer; NOT an invoked callback.

purpose: Relocates one surviving SFX group's payload during sound-bank compaction. It submits an asynchronous copy from the group's current payload address to its new packed address, adjusts the group's embedded sample-address fields for the move, and records the new payload base in the group descriptor.

data_flow: Consumes an SFX group descriptor and a destination address. It increments the global outstanding-readdress counter, queues a transfer of `group->userContext` bytes from `group->callback` to the destination, and computes `2 * (destination - old_base)` as the adjustment for encoded addresses. Across `group->priority` metadata sections, it reads each section's record count, traverses 0x40-byte records, conditionally adjusts the field at offset 0x14 when the 16-bit field at 0x10 is nonzero, and always adjusts the fields at offsets 0x18 and 0x1C. It then writes the destination back to `group->callback`; the registered completion callback later decrements the outstanding counter.

state_behavior: Increments outstanding count, submits type0x1B copy, immediately rebases metadata and publishes new payload base. At offset0x10 it tests u16 content before changing0x14;0x18/0x1C always change. No size/count/index validation, copy-result check or rollback. The counter only tracks callback delivery; zero does not establish successful copy.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/synth.c#L370-L404

### HSD_SynthSFXBankDeflag

void HSD_SynthSFXBankDeflag(int bank_id)

- int bank_id: trusted bank index; no local bounds guard.

purpose: Calls StopRange using first-voice current-address membership, walks the selected bank list from its fixed head, and schedules displaced groups at packed addresses without waiting. The final expression writes HSD_Synth_804C2AE0[bank_id+32], beyond the declared 32-element array for ordinary bank IDs. Intended publication into the adjacent bank cursor is a layout hypothesis; source alone does not establish that destination or defined behavior. No bank-index guard or successful-copy guarantee.

data_flow: Calls StopRange using first-voice current-address membership, walks the selected bank list from its fixed head, and schedules displaced groups at packed addresses without waiting. The final expression writes HSD_Synth_804C2AE0[bank_id+32], beyond the declared 32-element array for ordinary bank IDs. Intended publication into the adjacent bank cursor is a layout hypothesis; source alone does not establish that destination or defined behavior. No bank-index guard or successful-copy guarantee.

state_behavior: Calls StopRange using first-voice current-address membership, walks the selected bank list from its fixed head, and schedules displaced groups at packed addresses without waiting. The final expression writes HSD_Synth_804C2AE0[bank_id+32], beyond the declared 32-element array for ordinary bank IDs. Intended publication into the adjacent bank cursor is a layout hypothesis; source alone does not establish that destination or defined behavior. No bank-index guard or successful-copy guarantee.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/synth.c#L406-L422

### HSD_SynthSFXBankDeflagSync

void HSD_SynthSFXBankDeflagSync(void)


purpose: Busy-waits for the shared readdress callback counter to become zero; this is a callback-delivery barrier, not proof that every copy succeeded.

data_flow: Reads `sfxGroupDataReaddressCounter` repeatedly without modifying it. The counter is incremented once before each HSD_DevComRequest made by HSD_SynthSFXGroupDataReaddress and decremented once by HSD_SynthSFXGroupDataReaddressCallback, so the target consumes that producer/completion count as its release condition.

state_behavior: If no group-data readdress operation is pending, the function returns immediately. Otherwise it busy-spins while the outstanding-operation counter is nonzero and returns only when callbacks have reduced it to zero; it contains no timeout, scheduler yield, cancellation branch, or fallback path.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/synth.c#L424-L429

### HSD_SynthGetSoundMode

u32 HSD_SynthGetSoundMode(void)


purpose: Exposes the console's persisted mono/stereo sound-output selection to HSD synth clients by acting as a thin accessor over Dolphin OS sound-mode storage.

data_flow: Receives no explicit input, calls OSGetSoundMode, and returns its value unchanged. Downstream callers therefore receive the normalized state of SRAM sound-mode flag bit 2 without accessing SRAM or HSD SFX state themselves.

state_behavior: Is a stateless, unconditional read wrapper: every invocation performs one OSGetSoundMode query and returns immediately, with no guard, cache, timer, branch, or mutation of HSD synth state. The delegated OS operation releases SRAM with commit disabled.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/synth.c#L431-L434

### HSD_SynthSetSoundMode

void HSD_SynthSetSoundMode(int mode)

- int mode: mode supplied to local mix before OS validates0or1.

purpose: Changes the synthesizer's mono/stereo mode, immediately recomputes the channel mix of every active sound effect for the new mode, and forwards the selection to the Dolphin OS so the console's persistent sound preference is updated.

data_flow: The caller maps its two sound-setting selections to mode values 1 and 0 and passes the selected value here. The function writes it to `HSD_Synth_804D7754`, passes every node with a positive sound ID to `HSD_SynthSFXUpdateMix(node, 1)`, and finally passes the same value to `OSSetSoundMode`. The mix updater reads the global to choose spatial left/right panning and delay behavior for nonzero mode or equal-channel mixing for zero mode, while the OS setter encodes the value into SRAM flag bit 2.

state_behavior: Stores caller mode and refreshes every active node mix before calling OSSetSoundMode. No local0/1 validation or bulk interrupt lock; OS validation occurs after synth mutation.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/synth.c#L436-L446

### HSD_SynthSFXStopNode

void HSD_SynthSFXStopNode(struct HSD_SynthSFXNode* node)

- struct HSD_SynthSFXNode* node: required borrowed synth node; no local NULL guard.

purpose: Immediately tears down every AX voice owned by one logical sound-effect node, optionally notifying the registered driver-inactivation callback first, and invalidates the node-table entries associated with the released voices.

data_flow: Consumes a logical SFX node whose `x0` field is its public handle and whose `voice_count` and `voice` array identify its AXVPBs. Under the callback guard it forwards `x0` to `driverInactivatedCallback`. Each AXVPB then flows to `AXFreeVoice`, while its stable index selects the `hsd_SynthSFXNodes` entry whose `x0` handle is cleared.

state_behavior: Requires valid node/voice pointers and externally safe access. Optional inactivation callback precedes release when flags bit0 clear,x27=1 and callback set. Frees every declared AX voice and clears its indexed synth slot. Reads voice index after AXFreeVoice; AX uses persistent pooled descriptors, not separately heap-freed storage. No own interrupt mask or reentrancy guard.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/synth.c#L448-L462

### dropcallback

void dropcallback(void* dropped)

- void* dropped: dropped AXVPB pointer carried through void*.

purpose: Handles notification that the AX driver dropped one hardware voice by retiring the logical sound-effect node that owns it, scheduling the node's remaining hardware voices for corresponding cleanup, and optionally notifying the synth client that the sound was inactivated.

data_flow: Consumes the dropped AXVPB, removes its first occurrence from HSD_Synth_804C28E0, and uses its index to locate hsd_SynthSFXNodes. A secondary-node sentinel redirects processing through voice[0] to the primary node. The primary node may supply x0 to driverInactivatedCallback; its voice array then supplies sibling AXVPBs to the queue while every associated node entry has x0 cleared.

state_behavior: Masks interrupts; first matching deferred-queue entry is setNULL without compaction. Inactive slot exits, secondary sentinel-1 follows voice0 to primary. Optional driver callback precedes clearing all owned slots. Other voices append to deferred queue with no capacity check. Callback may mutate shared state; no reentrancy guarantee.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/synth.c#L464-L510

### HSD_Synth_80389334

int HSD_Synth_80389334(int sfx_id, u8 vol, u8 vol2, u8 pan, int priority, int itd_flag, float pitch1, float pitch2, float mix_main, float mix_auxA, float mix_auxB)

- int sfx_id: SFX resource ID.
- u8 vol: first volume byte.
- u8 vol2: second volume byte.
- u8 pan: pan byte.
- int priority: AX priority.
- int itd_flag: volume channel stored as u8; not ITD enable.
- float pitch1: first pitch ratio.
- float pitch2: second pitch ratio.
- float mix_main: main gain.
- float mix_auxA: Aux A gain.
- float mix_auxB: Aux B gain.

purpose: Resolves a loaded SFX definition, acquires its expected one or two voices, initializes volume/pan/pitch/mix/channel controls and AX ADPCM playback, and returns a node handle or-1. The parameter named itd_flag selects the volume channel; ITD is computed separately from pan and sound mode.

data_flow: The SFX ID selects one of 32 linked-list buckets and is matched against each entry's sound ID. The matched entry supplies a voice count, base playback-rate value, and one packed address/ADPCM descriptor block per voice. Caller controls are normalized or copied into the primary HSD_SynthSFXNode, combined with master and channel volume factors to form the initial AX envelope, and combined with the entry rate to form the AX SRC ratio. Each acquired AXVPB receives priority, envelope, SRC, sample address, ADPCM coefficients, loop state, and running state. The function then returns a generation-qualified node handle that AXDriver retains for later control.

state_behavior: Masks interrupts across lookup/start. Missing definition or failed voice allocation returns-1 with partial cleanup; two identical acquired pointers also fail. Entry voice_count is trusted:0 dereferences uninitialized/null first voice and >2 overruns the local voice array. Caller itd_flag is stored as u8 channel and later indexes16channel records without validation. Acquires at priority+1 then installs requested priority. Secondary slot is sentinel-1 with primary backlink. Calls UpdateVolume before assigning new handle without first clearing old pending flag. Generation increases signed counter by0x40; overflow/wrap assumptions prevent an unconditional forever stale-handle guarantee.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/synth.c#L531-L639

### HSD_SynthSFXPlayWithGroup

bool HSD_SynthSFXPlayWithGroup(int sfx_id, u8 vol, u8 vol2, u8 pan, int priority, int itd_flag, int group, f32 pitch1, f32 pitch2, f32 mix_main, f32 mix_auxA, f32 mix_auxB)

- int sfx_id: SFX resource ID.
- u8 vol: first volume byte.
- u8 vol2: second volume byte.
- u8 pan: pan byte.
- int priority: AX priority.
- int itd_flag: volume channel stored as u8; not ITD enable.
- int group: group index0..255.
- f32 pitch1: first pitch ratio.
- f32 pitch2: second pitch ratio.
- f32 mix_main: main gain.
- f32 mix_auxA: Aux A gain.
- f32 mix_auxB: Aux B gain.

purpose: Starts an effect and records its integer handle in a group slot. Nonzero groups key off their previous eligible member before replacement; ordinary key-off fades can overlap the new sound, so immediate exclusivity is not guaranteed. Group0 bypasses replacement but still receives the new handle.

data_flow: Receives SFX ID, two volumes, pan, priority, volume channel, group, pitch ratios and bus gains. Nonzero group may notify/key off its old node; forwards controls except group to core player, stores returned integer handle (including-1) in every group slot including0, and returns it.

state_behavior: Asserts group0..255. Nonzero group with positive old handle and flags!=1 may notify driver then key off old node; exact inequality is not a bit test. Every group including0 stores new return value including-1. Declared bool is typedef int in pinned MSL header, preserving the integer-domain handle. No atomic/reentrant whole-operation guarantee; deferred key-off can overlap replacement.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/synth.c#L651-L682

### HSD_SynthSFXKeyOff

void HSD_SynthSFXKeyOff(int id)

- int id: logical playback handle.

purpose: Requests termination of the sound-effect instance identified by an integer handle. Special nodes marked with flag 0x8 release their AX voices immediately, while ordinary active nodes enter a key-off state that schedules their volume to fall to silence before their voices are reclaimed.

data_flow: Consumes an integer sound-instance handle and resolves it to an HSD_SynthSFXNode. For an immediate-release node, it may send node->x0 to driverInactivatedCallback before passing the node to freeVoices. For an ordinary active node, it writes key-off bit 0x1 into node->flags, submits the node to HSD_SynthSFXUpdateVolume, and passes each node->voice entry with priority 1 to AXSetVoicePriority; the later volume-update pass frees those voices after they reach silence.

state_behavior: Does nothing when the handle has no current node. If flag 0x8 is set, it optionally emits the driver-inactivated callback only when key-off bit 0x1 is still clear, node->x27 equals 1, and the callback is registered, then immediately frees the node's voices. Otherwise, an already-keyed-off node is left unchanged; a newly keyed-off node gains bit 0x1, enters the pending volume-update list, and has every AX voice demoted to priority 1. The update pass targets zero volume and reclaims the voices once the fade becomes inactive.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/synth.c#L693-L716

### HSD_SynthSFXStopRange

void HSD_SynthSFXStopRange(int bank_id)

- int bank_id: trusted bank index; no local bounds guard.

purpose: Immediately stops active nodes whose first AX voice current address is within the chosen bank half-open interval. It does not inspect secondary voices or future loop addresses and therefore does not prove that all references to the bank were removed.

data_flow: Reads `hsd_SynthSFXBankHead[bank_id]` and `[bank_id + 1]`, doubles them into a half-open address range, then scans all 64 `hsd_SynthSFXNodes`. For each node with `x0 > 0`, it reconstructs the first voice's current AX sample address; addresses satisfying `lower <= address < upper` cause that node to be passed to `HSD_SynthSFXStopNode`.

state_behavior: Only nodes marked active by `x0 > 0` are considered, and only those whose first voice currently lies inside the selected bank's half-open address interval transition to stopped. Stopping optionally invokes the driver-inactivation callback, frees every AX voice owned by the node, and clears each corresponding synthesizer-node handle; nodes outside the interval are unchanged.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/synth.c#L735-L739

### HSD_SynthSFXPause

void HSD_SynthSFXPause(int sfx_id)

- int sfx_id: logical playback handle validated through getNode.

purpose: Marks a resolved sound node paused and schedules deferred volume processing. Initialization-flag8 nodes also gain flags6; no immediate volume recomputation occurs here.

data_flow: Consumes sfx_id through getNode; on successful lookup it ORs 0x2 into node->flags, sends the same node to HSD_SynthSFXUpdateVolume, then conditionally writes additional flag state based on the node's post-update 0x8 bit.

state_behavior: Missing node is no-op. Existing node gains flag2 and calls UpdateVolume, which queues work unless flag8 suppresses it. Flag8 additionally causes flags|=6. Ordinary pause reaches muted/pitch-inhibited state in the later volume updater.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/synth.c#L741-L752

### HSD_SynthSFXResume

void HSD_SynthSFXResume(int sfx_id)

- int sfx_id: logical playback handle validated through getNode.

purpose: Clears flags2/4 on a paused node, refreshes pitch immediately when flag8 permits voice writes, and schedules deferred volume restoration.

data_flow: The caller supplies an SFX instance ID, which getNode converts to the corresponding HSD_SynthSFXNode pointer. If the lookup succeeds and the node is paused, the function mutates node->flags and passes that same node to the pitch and volume update routines so the changed state reaches the playback parameters.

state_behavior: Missing or not-paused node is no-op. Clears flags2/4, calls UpdatePitch and queues UpdateVolume; pitch writes and queue admission remain suppressed by flag8. Volume is not recomputed inline.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/synth.c#L754-L765

### HSD_SynthSFXCheck

int HSD_SynthSFXCheck(int sfx_id)

- int sfx_id: logical playback handle validated through getNode.

purpose: Checks whether an SFX identifier still denotes an acceptable playback node: the node must exist, have flag bit 0 clear, and have no attached voice whose AX parameter-block state is zero. It returns the original identifier on success and -1 otherwise.

data_flow: The input SFX identifier is passed to getNode. If a node is returned, the function reads node->flags, node->voice_count, and each node->voice[i]->pb.state in order. It performs no persistent writes and reduces those reads to either the unchanged input identifier or -1.

state_behavior: The query short-circuits to -1 when the SFX node is absent, when node flag bit 0 is set, or when any attached voice has pb.state equal to zero. Otherwise it returns the SFX identifier; consequently, an existing unflagged node with zero voices also succeeds because the voice loop has no iterations. The function does not change playback state itself.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/synth.c#L767-L784

### HSD_SynthSFXSetVolumeFade

void HSD_SynthSFXSetVolumeFade(int sfx_id, u8 vol, int flag)

- int sfx_id: logical playback handle.
- u8 vol: normalized volume target input.
- int flag: layer index0or1, sets one-step count.

purpose: Sets the normalized target for one of an active sound effect's two layered volume controls and schedules that sound node for deferred volume-envelope processing.

data_flow: Receives an SFX handle and byte volume from the AX driver, resolves the handle to an HSD_SynthSFXNode, stores `vol / 255.0` in the selected `user_vol` target, sets that slot's update count to 1, and requests volume processing. The pending synth pass advances the selected layered-volume state, combines the resulting volume with the node, channel, and master factors, and emits bounded AX volume-envelope deltas to each associated voice.

state_behavior: If `sfx_id` does not resolve to a live node, the call is a no-op. For a live node, an out-of-range layer index triggers the HSD assertion; otherwise the selected target is replaced and its update count is reset to 1. Scheduling is coalesced: HSD_SynthSFXUpdateVolume links the node only when it is not already pending and flag bit 8 does not suppress updates. The periodic synth pass decrements active layer counts, updates all associated voices, and removes the node from the pending list once no further volume work remains.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/synth.c#L786-L796

### HSD_SynthSFXSetUserVol

void HSD_SynthSFXSetUserVol(int sfx_id, u8 vol)

- int sfx_id: logical playback handle.
- u8 vol: pan byte, despite volume-oriented name.

purpose: Changes the stereo position of an active sound effect by storing an unsigned 8-bit pan value in its synth node and immediately recomputing that node's AX channel mix and interaural-delay targets.

data_flow: Takes an AXDriver-level pan byte and a live synth SFX ID, resolves the ID to `HSD_SynthSFXNode`, and writes the byte to `node->user_vol[1].x8`. `HSD_SynthSFXUpdateMix` then consumes that field to derive constant-power left/right amplitudes, scale the node's main and auxiliary bus gains, and derive ITD shift targets before submitting the results through `AXSetVoiceMix`, `AXSetVoiceItdOn`, or `AXSetVoiceItdTarget` for every voice belonging to the node.

state_behavior: Missing handle is no-op. Stores pan byte in user_vol[1].x8 and calls UpdateMix(node,1). Mix gain fields are submitted immediately; the argument affects current ITD shift initialization only. Mono/center target zero may leave ITD enabled. No general mix interpolation is provided.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/synth.c#L798-L806

### HSD_SynthSFXSetMix

void HSD_SynthSFXSetMix(int sfx_id, float mix_main, float mix_auxA, float mix_auxB)

- int sfx_id: logical playback handle.
- float mix_main: main gain.
- float mix_auxA: Aux A gain.
- float mix_auxB: Aux B gain.

purpose: Changes a currently active sound effect's gain on the main output and the Aux A and Aux B effect sends, then reapplies the sound's AX voice mix using its existing channel and panning configuration.

data_flow: The caller supplies an SFX handle and three mix multipliers. `getNode` maps the handle to an `HSD_SynthSFXNode`; on success the values are stored at node offsets `0x44`, `0x48`, and `0x4C` and passed indirectly to `HSD_SynthSFXUpdateMix`. That routine combines them with the node's current left/right pan gains, writes the resulting main and auxiliary channel levels to an AX mix parameter block, and submits the block to each applicable AX voice.

state_behavior: Missing handle is no-op. Replaces all three gain fields and calls UpdateMix(node,1), submitting AX mix immediately. The argument controls ITD current-shift initialization, not overall mix interpolation. Gains are unclamped and shared workspace assumes nonreentrant use.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/synth.c#L808-L820

### HSD_SynthSFXUpdatePitch

void HSD_SynthSFXUpdatePitch(struct HSD_SynthSFXNode* node)

- struct HSD_SynthSFXNode* node: required borrowed synth node; no local NULL guard.

purpose: Recomputes an HSD sound-effect node's effective playback ratio and, when voice updates are enabled for the node, applies that ratio to every AX voice composing the sound effect.

data_flow: Reads node->flags, node->x14, node->x18[0], node->x18[1], node->voice_count, and node->voice[]. If flag 4 is clear it multiplies the three stored ratio factors, otherwise it substitutes 0.0; if flag 8 is clear it forwards the selected result to AXSetVoiceSrcRatio for each voice, which stages the encoded ratio in that voice's AX parameter block.

state_behavior: The update has two independent flag-controlled states: flag 4 forces the effective ratio to zero, while flag 8 prevents any AX voice ratio writes. The SFX resume path clears flag bits 2 and 4 and immediately invokes this function, causing the stored pitch factors to be reapplied unless flag 8 still suppresses propagation.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/synth.c#L822-L837

### HSD_SynthSFXSetPitchRatio

void HSD_SynthSFXSetPitchRatio(int sfx_id, int flag, float ratio)

- int sfx_id: logical playback handle.
- int flag: factor selector0or1.
- float ratio: pitch ratio factor.

purpose: Sets one of an active sound-effect node's two multiplicative playback-ratio factors, then immediately recomputes and propagates the node's effective pitch ratio to its constituent AX voices.

data_flow: AXDriver converts pitch offsets expressed in cents into ratios with `2^(cents/1200)` and supplies them as ratio layer 0 or 1 together with an active synth handle. This function resolves that handle, stores the new factor in `node->x18[flag]`, and calls HSD_SynthSFXUpdatePitch; the update multiplies `node->x14`, `node->x18[0]`, and `node->x18[1]` and forwards the result to AXSetVoiceSrcRatio for each voice, which writes the encoded ratio into the AX parameter block and requests synchronization.

state_behavior: The call is a no-op when the SFX handle does not resolve or when node flag bit 0 is set. For an eligible node, an index other than 0 or 1 triggers the HSD assertion; otherwise the selected factor is replaced even if later propagation is suppressed. Recalculation uses zero while node flag bit 2 (`0x4`) is set, and node flag bit 3 (`0x8`) prevents writes to the AX voices, allowing the stored factors to persist until another update reapplies them.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/synth.c#L839-L850

### HSD_SynthSFXSetPriority

void HSD_SynthSFXSetPriority(int id, int prio)

- int id: logical playback handle.
- int prio: AX priority.

purpose: Changes the AX allocation priority of every underlying voice belonging to an active sound-effect instance.

data_flow: AXDriver supplies an HSD sound-effect voice ID and the sound manager's priority field when its priority-dirty flag is processed. HSD_SynthSFXSetPriority maps that ID to an HSD_SynthSFXNode, reads voice_count and each AXVPB pointer from the node, and forwards the same requested priority to AXSetVoicePriority for every voice.

state_behavior: Performs no update when the sound-effect ID does not resolve to a node or when bit 0 of the node flags is set. Otherwise it synchronously reprioritizes all voices from index 0 up to voice_count - 1; each individual AX stack transition is protected by AXSetVoicePriority's interrupt-masked critical section.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/synth.c#L852-L862

### HSD_Synth_8038A000

s32 HSD_Synth_8038A000(void)


purpose: Processes all pending sound-effect volume work for the current synthesis frame: it advances channel-wide and per-node volume fades, computes each node's composite target volume, applies bounded envelope deltas to its AX voices, finalizes settled envelopes, and completes deferred key-off or pause transitions.

data_flow: Channel masks/targets/counts and pending nodes feed fades and AX envelopes. user_vol offset helpers address the preceding float: layer0 maps to unk28 and layer1 to user_vol0.x8_float; these casts cross declared subobjects and are recovered source layout, not a general defined-C guarantee. Composite target multiplies node/user/channel/master gains by32767 without final clamp; only envelope delta clamps to[-20,20]. u16 envelope storage can truncate/wrap for out-of-domain inputs. Settled nodes may release voices or finish pause.

state_behavior: The entire update is performed with processor interrupts disabled and the prior interrupt state restored on exit. Each marked channel advances one interpolation step and is removed from the channel-update mask when its remaining count reaches zero. Pending nodes with nonpositive handles are immediately unlinked. Active nodes remain pending while user-volume or channel interpolation continues. Flags 0x1 or 0x2 force a zero-volume target; once the envelope settles and no interpolation remains, flag 0x1 frees every AX voice and clears its synth-node slot, while `(flags & 6) == 2` transitions the node to muted paused state, refreshes pitch, and optionally notifies the driver pause callback. Other settled nodes are removed from the pending list.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/synth.c#L874-L991

### HSD_SynthSFXUpdateVolume

void HSD_SynthSFXUpdateVolume(struct HSD_SynthSFXNode* node)

- struct HSD_SynthSFXNode* node: required borrowed synth node; no local NULL guard.

purpose: Schedules an active sound-effect node for deferred volume processing by the synthesizer callback, ensuring that volume fades and volume consequences of pause, resume, and key-off state changes are applied by the centralized AX voice update pass.

data_flow: Consumes an HSD_SynthSFXNode whose flags or volume targets were changed by playback-control code. With interrupts disabled, it reads the node's pending flag and streaming/inactive flag bit, then, when eligible, writes the pending flag, copies the current global list head into node->x20, and publishes the node as the new HSD_Synth_804D774C head. HSD_Synth_8038A000 later removes or advances that link, computes the node's effective volume from user, node, master, and channel factors, and sends envelope deltas or a final envelope to every associated AX voice.

state_behavior: The node is admitted only when volume_update_pending is false and flag bit 0x8 is clear. Admission changes it to pending and links it at the list head; repeated requests while pending are coalesced into the existing entry. The consumer clears pending and unlinks dead nodes immediately, keeps active fades linked across callback passes, and clears and unlinks a live node once its target is settled and no continuing channel or user-volume interpolation remains.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/synth.c#L993-L1002

### HSD_SynthSFXUpdateMix

void HSD_SynthSFXUpdateMix(struct HSD_SynthSFXNode* node, int interpolate)

- struct HSD_SynthSFXNode* node: required borrowed live node.
- int interpolate: nonzero preserves current ITD shift during initialization; not full mix interpolation.

purpose: Recomputes and applies an active sound-effect node's output mix and stereo panning. It derives left/right gains from the node's pan control and the global sound mode, scales the main, Aux A, and Aux B buses, distributes those values across one or two AX voices, and updates each voice's interaural-delay targets.

data_flow: HSD_SynthSFXSetUserVol writes the node's 0–255 pan byte, while HSD_SynthSFXSetMix writes its main, Aux A, and Aux B gains; both pass the node to this routine with interpolation requested. The routine converts the pan byte into complementary square-root left/right amplitudes in stereo mode, or fixed equal amplitudes in mono mode, multiplies them by each bus gain, and publishes the resulting mix through AXSetVoiceMix. It separately converts displacement from pan center into a lookup-derived left or right ITD shift and either initializes or retargets that shift on every associated AX voice.

state_behavior: Uses shared mix workspace and clears it after each submission, relying on zero prior state and nonreentrant use. Onevoice receives both sides; stereo2 splits sides, mono2 halves both. Pan derives ITD targets; interpolate controls current-shift initialization only, not general mix interpolation. Mono/center targets0 but can retain ITD enabled. Whether to enter ITD processing depends on voice0 flag. No node/count/resource validation or own whole-operation lock.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/synth.c#L1027-L1104

### HSD_SynthSFXUpdateAllVolume

void HSD_SynthSFXUpdateAllVolume(int vol, u16 fade_frames, int channel)

- int vol: unclamped integer normalized by255.
- u16 fade_frames: u16 remaining interpolation count.
- int channel: trusted channel index0..15.

purpose: Sets the normalized volume target for one sound-effect channel group and, when that target differs from the group's current level, records a fade duration and requests volume updates for every active sound-effect node assigned to the group.

data_flow: Receives byte-derived group levels from lbAudioAx's high-level mixer, normalizes the selected level into the channel's floating-point target, and stores the requested fade duration. The channel mask causes all active HSD_SynthSFXNode records assigned to that channel to enter volume processing. Subsequent synthesis updates advance the channel's current gain toward its target, multiply that gain into each affected node's final volume, and publish bounded envelope deltas to every AX voice owned by the node.

state_behavior: Always writes normalized target first, using int vol without clamp and trusted channel index. If target equals current value it leaves existing fade count/mask untouched; the whole request is not ignored. Otherwise stores u16 fade_frames and schedules matching nodes. Zero count snaps on next processing pass; nonzero count divides remaining difference by count. No channel0..15 check.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/synth.c#L1118-L1127

### HSD_SynthSFXSetDriverInactivatedCallback

void HSD_SynthSFXSetDriverInactivatedCallback(UNK_T callback)

- UNK_T callback: replacement nullable callback pointer; effective consumer receives logical handle.

purpose: Registers the single optional AXDriver-facing handler that HSD Synth notifies when a tracked sound-effect node becomes inactive, allowing the higher-level driver to retire the logical sound record associated with that synthesizer node.

data_flow: AXDriver initialization supplies `fn_8038CEA4`, which the setter stores unchanged in `driverInactivatedCallback`. When `HSD_SynthSFXStopNode` or `dropcallback` retires an eligible node, `node->x0` flows through the slot to that handler. The handler uses the identifier's low six bits to locate the matching AXDriver record, clears its lookup slot, pause-related flag, and active state, and decrements the active-record count.

state_behavior: Each call unconditionally replaces the one process-global inactivation handler; no previous handler is returned, chained, or preserved, and storing `NULL` disables notification. Later dispatch occurs only when node flag bit 0 is clear, `x27` equals 1, and the callback slot is non-NULL. Notification precedes voice release or node-slot clearing in both ordinary stop and dropped-voice paths.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/synth.c#L1129-L1132

### HSD_SynthSFXSetDriverMasterClockCallback

void HSD_SynthSFXSetDriverMasterClockCallback(UNK_T callback)

- UNK_T callback: replacement nullable callback pointer; effective consumer receives synth clock.

purpose: Registers the single optional AXDriver master-clock handler that the HSD synthesizer invokes during each audio-frame update, allowing the higher-level driver to advance sound sequencing and pending parameter changes in step with synthesizer time.

data_flow: AXDriver initialization supplies `fn_8038CC1C`; the setter stores the pointer unchanged in `driverMasterClockCallback`. `HSD_SynthCallback` later reads the slot and, when non-NULL, dispatches it with the current synth-frame counter before stream maintenance and counter increment.

state_behavior: Each call unconditionally replaces the one process-global driver master-clock callback; no prior callback is returned, chained, or preserved. Storing `NULL` disables driver-clock dispatch because `HSD_SynthCallback` tests the slot before calling it.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/synth.c#L1134-L1137

### HSD_SynthSFXSetDriverPauseCallback

void HSD_SynthSFXSetDriverPauseCallback(void (*callback)(s32))

- void (*callback)(s32): replacement nullable callback receiving logical handle.

purpose: Registers the AXDriver-facing handler that the HSD sound-effect synthesizer calls when a tracked sound effect has completed its transition into the paused state, allowing the driver to synchronize its logical sound-manager state with the synth node.

data_flow: AXDriver initialization supplies `fn_8038CF48`, which the setter stores unchanged in `driverPauseCallback`. When volume processing finishes silencing an eligible paused node, it passes `node->x0` through that slot; the AXDriver handler uses the identifier's low six bits to resolve the matching record and sets its `0x20000000` flag.

state_behavior: Each call unconditionally replaces the one stored pause handler; no previous handler is returned or chained, and `NULL` disables dispatch. For a non-NULL handler, dispatch occurs only after an eligible node requested pause, its volume processing reached silence, its pause bits advanced from the pending combination to the fully paused combination, and `node->x27` equals 1.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/synth.c#L1139-L1142

### HSD_SynthCallback

void HSD_SynthCallback(void)


purpose: Services HSD synthesis once per AX audio frame by reclaiming deferred voices, retiring sound-effect nodes whose AX voices have finished, running pending sound-effect parameter updates, notifying the optional driver master-clock client, servicing streamed-audio state, and advancing the synthesis frame counter.

data_flow: The synthesis frame counter selects one eight-node slice of the 64-entry sound-effect node array as `(clock % 8) * 8`, so successive calls inspect every node over an eight-frame cycle. The callback drains the deferred AXVPB queue in reverse order into AXFreeVoice, examines the selected nodes' activity, flags, voice count, and AX playback states to decide whether to stop them, invokes the main pending-parameter updater, passes the current clock to the optional master-clock callback, invokes streamed-audio maintenance, increments the clock, and leaves all resulting state in the shared synth and AX structures.

state_behavior: The entire callback runs with the caller's interrupt state saved and processor interrupts disabled, restoring that exact state only after all frame maintenance completes. It empties and resets the deferred-free count every call. Within the rotating eight-node slice, a node is stopped only when it is active, is not marked with flag 0x8, its first AX voice has reached state 0, and either it is mono or its second voice has also reached state 0. The optional master-clock callback is skipped when unset, and the synthesis clock advances exactly once on every invocation.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/synth.c#L1144-L1183

### HSD_SynthResetStreamCounters

void HSD_SynthResetStreamCounters(int result, int length, void* buf, bool b)

- int result: ignored request ID; declaration may use a recovered noncanonical type.
- int length: ignored opaque callback argument, not a byte count.
- void* buf: ignored destination buffer.
- bool b: ignored cancellation flag; not used to validate completion.

purpose: Resets streamed-audio bookkeeping by synchronizing one retained stream counter with another and clearing a second counter.

data_flow: Reads the retained global HSD_Synth_804D7768, copies its value to HSD_Synth_804D776C, and writes zero to HSD_Synth_804D7778. It consumes no parameter data and produces no return value.

state_behavior: Ignores all four callback arguments including cancellation. Copies current requested index to completed index and clears global in-flight latch. No request identity or successful-transfer check.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/synth.c#L1185-L1189

### HSD_Synth_8038AD74

void HSD_Synth_8038AD74(u32 offset, uintptr_t src)

- u32 offset: ignored request ID.
- uintptr_t src: opaque callback argument interpreted as DVD payload offset.

purpose: Continues an in-progress packetized stream refill after a ring slot's 0x20-byte metadata header has loaded: it submits the corresponding encoded sample payload for asynchronous transfer into that slot's audio-memory buffer and registers HSD_SynthResetStreamCounters to mark the slot complete when the transfer finishes.

data_flow: The recurring refill path reads a 0x20-byte metadata header from the current stream file and retains `header_src + 0x20` as callback data. HSD_DevCom passes that address to this routine, which uses it as the source of a type-0x23, lane-0 transfer. The destination is `stream_aram_base + (requested_ring_index << 16)`, and the byte count comes from the selected metadata entry's x0 field. Completion copies the requested ring index into the completed-ring index and clears the refill-in-flight flag.

state_behavior: The routine has no local guard or immediate stream-state mutation: every invocation unconditionally queues one payload transfer for the currently requested ring slot. The registered completion callback ignores transfer-result parameters, synchronizes the completed slot with the requested slot, and clears the in-flight flag, allowing the stream updater to schedule a later refill.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/synth.c#L1191-L1197

### HSD_Synth_8038ADD0

void HSD_Synth_8038ADD0(void)


purpose: Maintains the active packetized audio stream during each synthesis frame: it derives the AX voice's current position within a three-segment stream buffer, updates each stream voice's end and loop parameters when playback crosses a segment boundary, handles the stream's terminal marker, and schedules asynchronous loading of the next segment header and sample data before playback reaches it.

data_flow: The routine resolves the current stream node from the shared stream handle and derives a ring-segment index from the first AX voice's playback address relative to the stream ARAM base. A changed index is stored and converted with the segment table into a new AX end address for every voice. At a scheduled loop transition it advances modulo three and either disables normal segment looping at an end marker or installs the next segment's loop address and ADPCM loop state. When a safe slot is available, it marks a refill in flight and requests the next metadata header; HSD_Synth_8038AD74 then transfers the corresponding payload, and completion advances loaded-segment state and clears the in-flight flag.

state_behavior: Exits without node or with flag8. Observed segment is computed directly from the first voice current-address word at byte0x1B2 relative to ARAM base; it is not reduced modulo3 or bounds-checked. Scheduled transition/refill indices use modulo3. Boundary changes update voice end/loop and decoder state; terminal marker redirects loop. Refill helper masks interrupts, rejects in-flight or requested!=completed, then schedules header/payload or marks terminal complete. Global counters rely on callback delivery, not proven I/O success.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/synth.c#L1230-L1277

### HSD_Synth_8038B120

void HSD_Synth_8038B120(void)


purpose: Completes initial playback setup for the current HSD streamed-audio node after its first sample-data transfer: it installs the initial envelope, pitch ratio, and buffer addresses into every AX voice, starts those voices, moves the node out of its stream-loading state, schedules normal deferred volume processing, updates its output mix, and clears the stream-operation marker.

data_flow: The current stream handle resolves to an HSD_SynthSFXNode. Its user volume, node gain, global synth gain, and channel gain are multiplied and scaled to an AX 15-bit envelope value unless the node is paused; its node and user pitch ratios are multiplied into a 16.16 AX source ratio unless pitch is disabled. For each voice, the selected stream-ring slot and audio-memory base produce current and loop addresses at the slot's first sample and an end address from that slot's recorded extent. These values are published through AXSetVoiceVe, AXSetVoiceSrc, the AX address setters, and AXSetVoiceState, after which the node is linked into the pending-volume list and passed to HSD_SynthSFXUpdateMix.

state_behavior: If the current stream handle no longer resolves to a node, the routine only clears the shared stream-operation marker. For a valid node, pause flag 0x2 forces the initial envelope to zero and flag 0x4 forces the source ratio to zero; otherwise normal volume and pitch are installed. Every declared voice is pointed at the selected first stream buffer and changed to running state. The routine then clears stream-loading flag 0x8, atomically adds the node to the pending-volume list if it is not already present, refreshes its mix, and clears the operation marker.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/synth.c#L1279-L1339

### HSD_SynthPStreamFirstHakoHeaderCallback

void HSD_SynthPStreamFirstHakoHeaderCallback(void)


purpose: Continues initial streamed-audio loading after the selected ring slot's per-buffer header has arrived: it submits an asynchronous transfer for that slot's encoded sample payload and registers HSD_Synth_8038B120 to activate the current stream voices when the payload is ready.

data_flow: The current DVD entry in HSD_Synth_804D7764 supplies the transfer source file, with encoded payload data beginning at offset 0xA0. The selected ring index HSD_Synth_804D7768 chooses both a 64-KiB audio-memory slot at HSD_Synth_804D7780 + (index << 16) and a lbl_804C4540 metadata entry whose x0 field supplies the transfer size. These values are submitted on HSD_DevCom lane 0 as transfer type 0x23; completion flows to HSD_Synth_8038B120, which uses the same slot index, base, and metadata to set each AX voice's current, end, and loop addresses and begin playback.

state_behavior: This continuation performs no local node-validity guard or direct stream-state transition; whenever invoked, it advances the asynchronous startup chain by queueing the selected slot's payload transfer. The registered completion callback then resolves the current stream handle: a valid node leaves stream-loading state and starts its voices, while a missing node merely clears the shared stream-operation marker.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/synth.c#L1341-L1347

### HSD_SynthPStreamHeaderCallback

void HSD_SynthPStreamHeaderCallback(int arg0, int arg1, void* arg2, bool cancelflag)

- int arg0: ignored request ID.
- int arg1: ignored opaque callback argument.
- void* arg2: required loaded stream header buffer.
- bool cancelflag: ignored cancellation flag.

purpose: Processes a completed streamed-audio header transfer by configuring the current synth node's AX voices from that header, preparing the shared stream-buffer indices, and scheduling the selected buffer-header read; if the stream node no longer exists, it terminates the active stream state instead.

data_flow: Receives a packed header through the asynchronous callback's arg2 pointer, copies its voice count and normalized rate into the current HSD_SynthSFXNode, optionally acquires a second priority-0x1D AX voice, and sends each 14-word per-voice descriptor block to AXSetVoiceAddr and AXSetVoiceAdpcm. It then selects another entry in a three-slot shared buffer ring, copies that index into the stream counters, and submits a 0x20-byte HSD_DevCom transfer into the selected metadata slot with HSD_SynthPStreamFirstHakoHeaderCallback as the continuation.

state_behavior: Uses arg2 as trusted header; ignores request ID, opaque arg and cancelflag. Finds global current node, narrows header voice_count to u8, acquires second only when count==2 and asserts it nonNULL. No general count/buffer validation or secondary sentinel/backlink initialization shown. Configures ADPCM/address state, rotates scheduled indices and requests first packet header. Missing node clears latch. No request identity/success check.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/synth.c#L1349-L1380

### HSD_Synth_8038B5AC

int HSD_Synth_8038B5AC(int entrynum, u8 vol, u8 vol2, int channel)

- int entrynum: DVD entry number.
- u8 vol: first volume byte.
- u8 vol2: second volume byte.
- int channel: trusted channel stored u8.

purpose: Begins singleton stream setup by keying off an existing current stream, initializing a newly acquired AX voice/node and publishing a handle, then requesting the initial header asynchronously. An ordinary old stream can persist through its fade.

data_flow: A caller-supplied disc path is converted to entrynum before invocation. The function stores that entry globally for continuation requests, acquires a priority-0x1D AXVPB, maps the voice's stable index to one of the 64 synth-node slots, combines that index with a generation counter to form the returned handle, normalizes both volume bytes into node volume fields, stores the channel byte, and submits an asynchronous 0x80-byte header read. HSD_SynthPStreamHeaderCallback then uses the current handle to find this node, installs the loaded address and ADPCM descriptors into its AX voice or voices, and schedules the next stream-buffer transfer.

state_behavior: Busy-spins on global latch and sets it before masking interrupts. Existing stream is keyed off: ordinary stream fade is deferred, not immediate destruction. Acquires first AX voice at0x1D without NULL guard before dereferencing. Initializes flag8,x27=2 node and global entry/handle; header callback may acquire second. No entry/channel validation, request identity or full atomic/reentrant guarantee. Returned handle denotes asynchronous setup, not completed/audible playback.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/synth.c#L1409-L1459

### HSD_SynthStreamSetVolume

void HSD_SynthStreamSetVolume(f32 volume)

- f32 volume: unclamped master gain applied to AI and synth envelopes.

purpose: Sets the synthesizer's shared master-volume multiplier, immediately applies the resulting level to both channels of the hardware audio stream, and requests recalculation of all sound-effect volumes.

data_flow: Consumes a caller-provided f32 gain, stores it in HSD_Synth_804D6030, multiplies it by HSD_Synth_804D777C for both AI stream channels, and passes the products to the AI driver's unsigned 8-bit left and right hardware-volume fields. The retained gain is also consumed by the SFX update path when calculating AX voice envelope volumes, and updateAllVolume(0xFFFF) requests that those dependent volumes be refreshed.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/synth.c#L1461-L1467

### HSD_SynthInit

void HSD_SynthInit(int dsp_size, int voices, int stream_size, int bank_size)

- int dsp_size: unused.
- int voices: unused.
- int stream_size: unused.
- int bank_size: initial ARAM bank reservation size; unchecked ARAlloc result.

purpose: Initializes the HSD synthesizer by starting Dolphin AX at the DSP sample rate used by this subsystem, reserving its bootstrap, sound-bank, and streaming regions in ARAM, registering HSD_SynthCallback with AX, setting the initial stream volume, initializing all 16 channel-control records to unity multipliers with no pending transition, and caching the console sound mode.

data_flow: The caller's fourth configuration value flows into an ARAM reservation for sound-effect bank 0 and determines `hsd_SynthSFXBankAREnd`. Independently, fixed-size 0x500 and 0x30000 ARAM reservations become the synthesizer's bootstrap-transfer and stream-storage addresses; the 0x500 destination is submitted to HSD_DevCom and then converted to the address representation retained by the synth. The initial master stream level of 255 is scaled and sent to both AI output channels, while `HSD_SynthCallback` flows into AX's persistent user-frame callback slot.

state_behavior: Ignores first3parameters; reserves fixed0x500 bootstrap, caller-sized bank0 and fixed0x30000 stream regions with unchecked AR allocation failures. Sets stream level255 and sends master_gain*255 to AI, initializes16channel gains/counts, registers callback and caches OS mode. Does not configure audio heap (global starts-1), reset every synth global or guard repeated initialization. External heap/platform setup is required.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/synth.c#L1469-L1534

## Owned source-only helpers and types

Owned structs: SfxLoadStreamNode is a six-word metadata header; AXVPB casts on loaded blocks reuse next/next1/priority/callback/userContext as metadata, not live voices. HSD_SynthSFXNode has logical handle, flags/count/channel, two voice pointers, pitch/gain/fade/mix and pending-list linkage. Static header owns 64 node slots,32 lookup buckets,6load slots,32bank list heads,33bank boundaries,16channel records,256group handles,3stream metadata slots and callback/global counters. These source arrays do not establish compiled section placement.

{"SfxLoadStreamDataSize": [44, 47], "order_data_0": [287, 293], "order_data_1": [361, 368], "HSD_SynthSFXUnloadBank_inline": [295, 301], "getNode": [641, 649], "freeVoices": [684, 691], "stopRange": [718, 733], "user_vol_offset_helpers": [864, 872], "my_memzero": [1018, 1025], "updateAllVolume": [1106, 1116], "HSD_Synth_8038ADD0_inline": [1199, 1228], "HSD_Synth_8038B5AC_inline": [1382, 1407]}

SfxLoadStreamDataSize adds eight bytes of metadata overhead without rounding. getNode checks positive ID and exact slot handle. freeVoices releases and clears indexed slots without notification. stopRange checks first voice current address only. The two user-volume helpers return pointer offsets used to access preceding floats across declared subobjects. updateAllVolume sets a channel mask and queues matching active nodes. Stream inline helpers schedule packet refills and initialize shared stream parameters. order_data helpers are MUST_MATCH-only placement material; they establish no compiled section layout. No absent helper or parameter identity was created.

## Naming and evidence limits

Existing nine address/drop aliases remain semantic hypotheses. Canonical source labels are unchanged. Callback names result/length are not proof of status/size: DevCom passes request ID and opaque argument. bool is typedef int, so grouped-play handle return is preserved. The header commented old player signature is not an active declaration. The declared foo ADPCM view uses a0x40 per-voice traversal stride that overlaps recovered struct views; no exact serialized authored type is asserted.

Seven section links remain unresolved, one exclusivity link is rejected, and one archived pre-unload caller claim remains unresolved. Full original baseline link records and fact IDs/updated_at versions are retained in JSON. No source/shared KB changes, compilation, matching, server start or publication.
