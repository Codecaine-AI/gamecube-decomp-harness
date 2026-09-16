# lbAudioAx semantic reconciliation

Revision: `c302741689bd67c361cd7faadb221df3193992c3`.

## Scope and repair

Full owned-file, subject and link coverage is inherited from the hash-bound research. This lead performed a narrow repair and restored the prior targeted canonical/rendered evidence for independent semantic checks; it does not claim a fresh audit of every inherited retained fact or link. Supported retained knowledge is preserved verbatim through inheritance. Proposal indices 0–4 are preserved. The six register-qualified parameter writes formerly at indices 5–10 are removed because their subject identities lack pinned provenance.

## Audio requests and controls

The unit supplies table lookup, inclusive sound-ID range classification, category-filtered ranking, bank-state-dependent paired-ID remapping, SFX request normalization and filename-based stream selection. The playback adapter doubles and clamps volume and pan before forwarding track and channel. This is not an arbitrary signed-overflow safety guarantee. Stream selection avoids restarting an identical cached filename and reports whether replacement was requested, not playback success.

The channel-7 routing wrapper assigns fixed tracks to fourteen IDs. For ID `0x20D`, it preserves every supplied track except `-1`, which becomes zero; other IDs use zero. Other negative tracks can pass through this wrapper and are rejected by the driver. Numeric routing alone does not establish hit or announcer content.

Retained gains and multipliers feed cached or forced mixer updates. Separate per-handle wrappers clamp and forward pan, volume and pitch controls. The driver distinguishes logical SFX records from Synth assignments. Singleton DVD-path playback has separate stop, pause and resume handling; its pause control must not be categorized as managed SFX-channel pausing. Selective channel suppression also changes attenuation and gates timer aging. Broad restoration preserves that independent selective-pause latch.

## Managed controllers and lifetimes

Sound controllers use GObjs with pool-backed userdata, a selected callback and a recurring process. Initialization copies source parameters, chooses one of ten callback entries, creates a voice for modes 0–8 or adopts a supplied voice for mode 9, and installs userdata reclamation. Callback indexing has no local bounds check. Construction checks only `sfx_id < 0x83D60`; it does not reject negative IDs at that stage. Allocation failure paths are explicit, but allocation success is not a voice-creation guarantee.

Pan strategies include owner-position calculation, frame-dependent calculation, reflection against 127 and one-shot wrappers. `calcPan` orders unequal endpoints from smaller to larger, caps progress above the end and clamps ordinary numeric results to 0–127; equal endpoints return 64. Unequal endpoints divide by the end value without a zero guard. One-shot positional initialization latches before delegation, including when position acquisition fails.

The volume callback is asymmetric: its increasing branch adds the scaled difference to `start_vol`, while its other branch subtracts it from `end_vol`. After duration it assigns `VOL_MAX`. It is not a conventional bidirectional endpoint ramp. Its duration division is unguarded, including in the equal-endpoint branch. Exceptional arithmetic and conversion behavior remain unresolved.

The recurring process invokes the callback before forwarding controls. It tests `voice_id != -1`, not nonnegativity, and requests controller removal on callback failure or the duration condition. Controller retirement, logical-record retirement and physical Synth voice completion are distinct. AXDriver key-off optionally delegates to Synth and clears final record flags afterward; it does not guarantee a fresh Synth transition in every case.

## Banks, state and initialization

Tracking arrays have 56 source-declared entries; ordinary loading and selection traversals process slots 0–54. Category expansion and common-mask augmentation use arithmetic addition, not interchangeable OR semantics. Character and stage inputs contribute table-derived masks; numeric exceptions do not independently establish gameplay roles.

The loading pipeline ranks pending entries, accounts for resident and pending bytes, reclaims unrequested entries under pressure and chains asynchronous loads. The capacity check can still assert after reclamation. Callback completion establishes state 1; reload can also demote state 2 to 1. A separate completion scan promotes requested state-1 entries to state 2 once no requested absent entry remains. The predicate tests exactly state 2. Neither that predicate nor local post-wait assignments prove backend success in every path.

Language changes choose the JP/US directory, reload metadata and may issue the supplied sound request before resetting indices 1–54 and unloading/reloading banks. The request is not issued after the bank reload. Several paths assign state 2 after waiting without checking the returned load handle.

Initialization configures the allocator, AR/ARQ/AI, bank capacities and auxiliary effects. The delay heap query uses selector 2 whereas installation uses 4; a correct delay-specific size check is not established. Source declarations and initialization do not prove compiled section placement, aggregate layout or string/literal pooling.

## Periodic maintenance and diagnostics

The periodic updater maintains two retained SFX requests and their coupled volume controls. Both enable countdowns and deferred-slot aging are independently gated by `lbl_804D640C`. Retained-voice maintenance and requested dispatch execute outside that gate. Dispatch issues requests for nonempty entries among sixteen serviced slots, clears those entries and clears the request. Without dispatch, a set gate preserves deferred timers and IDs. Runtime initialization resets seventeen slots; the difference is retained without an inferred layout defect.

The diagnostic getters expose distinct physical-assignment and logical-record counters. The sound-status updater uses the physical sample for the PVoice recent peak, then overwrites its live sample variable with the logical count before printing both rows. The PVoice row therefore combines the logical live value with the physical peak.

## Qualified source-formal observations retained from the removed writes

These observations concern canonical C formals only and establish no `#r3` or `#r4` binding:

- `lbAudioAx_80024E50` copies its boolean formal to `paused` and selects AXDriverPause or AXDriverResume.
- `lbAudioAx_80024E84` stores its boolean formal in `lbl_804D640C`; true assigns 0.2 to two multipliers and suppresses channels 5, 6, 8 and 7, while false assigns 1.0 and invokes their restoration path.
- `lbAudioAx_8002500C` applies only positive decrements to `lbl_804D6420`, replacing results at or below zero with zero.
- `lbAudioAx_80025038` applies only positive decrements to `lbl_804D6424`, replacing negative results with zero.
- The two boolean formals of `lbAudioAx_80025064` independently select 1.0 or 0.0 for `lbl_804D38C4` and `lbl_804D38C8`.

## Evidence boundaries

Earlier bounded-read uncertainties are partly resolved by the restored evidence: the ranked array is signed `int[0x38]`; the stage table is `u8[0x6F][3]`; the routing switch is complete; physical/logical counter provenance and singleton path-playback handling are visible; driver pan, pitch and auxiliary forwarding mechanisms are visible. These resolutions do not authorize wholesale promotion of mixed unresolved rows.

Asset-specific meanings, untraced caller lifecycles, configuration persistence internals, exact synthesis timing, master-volume scope and storage-service guarantees remain deferred. Cancellation and waiting must retain their exceptional branches and cross-file lifetime qualifications. Rendered parse errors and the header's `shadowed_binding` status remain undiagnosed. All rendered descriptive names remain hypotheses rather than independent evidence or recovered original symbols.


Status: synthesized; independent review and live promotion pending.
