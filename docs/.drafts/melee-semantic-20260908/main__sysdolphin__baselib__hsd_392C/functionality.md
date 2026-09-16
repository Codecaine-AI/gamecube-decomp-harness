# MCC Host-I/O Connection Service

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. Canonical and rendered C1-309 and H1-13 were read to EOF. C rendering reports eight parse errors and suppresses substitutions; the header has no parse errors and substitutes four hypotheses. Started 2026-09-08T15:09:25.834Z; completed 2026-09-08T15:12:14.490271+00:00. Immutable page receipts are in `games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__hsd_392C/`.

## Discovery and Initialization

fn_80392CCC stores its channel argument and returns zero. The independently read MCC enumerator forwards the callback to HIO. HIO scans channels 0 through 2 for device ID 0x01010000 and stops successfully when the callback returns zero. Enumeration can also fail without invoking it. hsd_803931A4 sets discovery scratch to -1 for negative input, ignores the enumerator return and falls back to channel zero if scratch remains negative. Nonnegative input is forwarded without validation.

Before calling MCCInit, initialization clears the first 16 companion channel flags and sets 0,8,15, records the selected channel, sets companion level to 1, clears the FIO flag, owned event count/head and companion callback count/head. Failure retains those mutations and returns false. Success does not prove FIO readiness. MCCInit checks its already-initialized fast path before validating channels or installing the supplied callback, so repeated initialization does not necessarily install a new callback or device.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_392C.c#L34-L38, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_392C.c#L254-L308, code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/mcc/mcc.c#L664-L710, code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/mcc/mcc.c#L743-L753, code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/hio/hio.c#L62-L83 and code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3933.c#L303-L305.

## Queue and Service

fn_80392E2C accepts ordinary event values 1 and 2 while count <= 256. It writes at (head + count) % 256 and increments count. At count 256 it overwrites the unread head and increments to 257; this is not a lossless 256-entry queue. Without intervening writes, draining 257 entries revisits that overwritten slot. The extra six allocated words do not increase operational capacity. The callback itself has no interrupt guard. Dequeue disables interrupts only for count/head/storage access and restores them before handling the event.

READY clears two companion fields and attempts FIOInit. Success sets the FIO flag to one; failure prints NG but does not clear a prior flag or restart by itself. MCC channel 15 is opened regardless. Open failure or unsuccessful status polling through the three-second tick threshold triggers usb_exit_init. A successful status-3 check wins before the timeout check. That recovery helper calls FIOExit, clears the FIO flag, calls MCCExit and retries MCCInit, without explicitly resetting the owned queue. Successful MCC connection clears flags 0..15 then enables 0,8,15.

REBOOT calls the companion query. Zero triggers recovery; nonzero discards the event. The independently read query sends a notification, waits for response state and recursively calls hsd_80392E80 while waiting. The service loop therefore is not proven non-reentrant. After its queue is empty it invokes hsd_80393844, which drains companion callback records and dispatches recognized command packets. The service return is always zero, not an aggregate success status. Events arriving during service can extend the pass.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_392C.c#L126-L252, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3933.c#L47-L96 and code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3933.c#L231-L289.

## Error Reporting

fn_80392CD8 reads the retained MCC byte. Zero returns immediately without this helper issuing a report. Codes 1 through 21 select specific initialization, HIO, parameter and channel-state descriptions; other nonzero values select Unknown error. A nullable caller label chooses prefixed or plain format. The byte is returned unchanged. MCCGetLastError returns gLastError without clearing it, though its own debug-print macro remains part of the dependency.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_392C.c#L40-L124 and code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/mcc/mcc.c#L778-L780.

## Storage and Scope

.bss is zero-initialized s32[0x106], 0x418 bytes. .sbss contains five words, selected channel, enumeration result, count, head and exported FIO flag; source size 0x14 and target 0x18 include different trailing allocation padding. .data contains error/report strings plus a 22-entry compiled switch jump table at offset 0x268; source size 0x3DE and target 0x3E0 differ by trailing zeros. .sdata contains NG-newline and OK-newline, four bytes each. Saved object dumps and hashes identify these existing artifacts without asserting pinned build parity.

ParticleConsoleState is an unused local declaration. Its offset comment for x24 repeats 0x20; field order and the 0x28 size assertion do not make that comment a correct offset. The companion's ParticleLogEntry and ParticleUsbMessages names support historical aliases only. This packet does not infer player-facing particle behavior.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_392C.c#L9-L31, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_392C.c#L126-L143, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_392C.c#L40-L123, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_392C.c#L185-L215 and object-evidence.txt.

## Callers and Coverage

The observed launch-time caller initializes with -1 only when debug level is non-master and R was held. It services while waiting for the USB server. Separately, the main scene loop calls this service outside a debug-level guard. The inherited service-only-at-startup implication is corrected.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmmain.c#L174-L182 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1A45.c#L281-L283.

All 14 subjects and 45 baseline facts are versioned and dispositioned in coverage.json. Four parameter entities and .data/.sdata were fact-free. No source or KB application occurred.

## TU Lead Verification

Complete canonical/rendered C1–309/H1–13 and all19operations reviewed. Queue overflow, FIO failure flag retention, MCC restart branches, status-before-deadline and initializer partial mutations confirmed. Eight parser errors retained. [Lead receipt](lead-verification.json). Independent review pending.

Review correction: HSD_ParticleConsoleInit (fbbe3dc6) and TU particle alias (670c2a70) are unresolved historical names, not demonstrated particle ownership. File game_mapping8f53616d is superseded with MCC/FIO transport scope. Final20operations; dispositions {'retain': 29, 'reject': 1, 'supersede': 13, 'unresolved': 2}; SHA `0974b5e232c5a875762cb0bd893ded3d20558288f8df3d398309ead00739ad97`.
