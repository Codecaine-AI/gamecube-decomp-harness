# main/sysdolphin/baselib/rumble

Status: TU synthesis complete; independent root review pending.

# Rumble Semantic Review

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. Started 2026-09-08T15:12:24Z; ended 2026-09-08T15:15:28Z. Complete canonical and separate rendered reads cover C1–276 and H1–65. All renders succeed with zero errors/substitutions. All 33 subjects and 81 facts reviewed: {'unresolved': 17, 'retain': 56, 'supersede': 8}.

## Behavior

The scheduler visits four channels. Requests are ordered by stored u8 priority, after equal-priority entries. All requests advance unless paused or globally suppressed. Each emitted status overwrites the channel output, so the last emitter wins. A request can emit its final status and then be freed in the same pass.

Internal status0 maps to PAD_MOTOR_STOP_HARD,1 to PAD_MOTOR_STOP and2 to PAD_MOTOR_RUMBLE. HSD_PadRumbleOn stores1, so its source behavior is not a request for hardware rumble. Names are retained while semantic facts are corrected.

### `HSD_PadRumbleOn`

`void HSD_PadRumbleOn(u8 no)`

Under saved interrupt disable/restore, stores direct_status1 for unchecked port. Does not command hardware. With no overriding script, interpreter maps internal1 to PAD command0, STOP, despite the canonical On name.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/rumble.c#L12-L19.

### `HSD_PadRumbleOffN`

`void HSD_PadRumbleOffN(u8 no)`

Under saved interrupt disable/restore, stores direct_status0 for unchecked port. No immediate motor call; resolved0 maps to PAD command2, STOP_HARD.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/rumble.c#L21-L28.

### `HSD_PadRumbleFree`

`void HSD_PadRumbleFree(HSD_RumbleData* a, HSD_PadRumbleListData* b)`

Searches owner active list by exact node pointer without not-found guard, unlinks it, decrements owner count and prepends node to shared free list. Does not mask interrupts itself.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/rumble.c#L30-L42.

### `HSD_PadRumbleRemove`

`void HSD_PadRumbleRemove(u8 no)`

Masks interrupts, saves next before freeing each node in selected port list, restores prior state. Does not change direct/current/last statuses.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/rumble.c#L44-L56.

### `HSD_PadRumbleRemoveAll`

`void HSD_PadRumbleRemoveAll(void)`

Calls per-port removal for ports0–3; each has separate interrupt critical section. No motor command.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/rumble.c#L58-L65.

### `HSD_PadRumbleRemoveId`

`void HSD_PadRumbleRemoveId(u8 no, int id)`

Masks interrupts, walks all selected port nodes, removes every u32 id equal to unsigned conversion of caller int; preserves survivor order.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/rumble.c#L67-L81.

### `HSD_PadRumblePause`

`void HSD_PadRumblePause(u8 no, int status)`

Writes low byte of int status to every existing port node pause field under interrupt masking. Interpreter pauses only when stored byte equals1, not every nonzero value.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/rumble.c#L83-L95.

### `HSD_PadRumblePauseAll`

`void HSD_PadRumblePauseAll(void)`

Visits ports0–3 and sets existing nodes pause1. Does not latch a global pause for subsequently added requests or change direct_status.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/rumble.c#L97-L105.

### `HSD_PadRumbleUnpauseAll`

`void HSD_PadRumbleUnpauseAll(void)`

Visits ports0–3 and sets existing nodes pause0, without resetting their cursors/timers.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/rumble.c#L107-L115.

### `func_80378430_inline`

`void func_80378430_inline(HSD_PadRumbleListData** r6, HSD_PadRumbleListData* r7)`

Pointer-to-link insertion: advances over pri<=new stored pri and inserts after existing equal priorities. Ascending byte-priority ordering; no detach/count update.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/rumble.c#L117-L127.

### `HSD_PadRumbleAdd`

`int HSD_PadRumbleAdd(u8 no, int id, int frame, int pri, void* listp)`

Under interrupt masking, requires shared free node and port count<max_list. Pops node, stores int id as u32, int pri as u8, frame as s32 and caller stream as u16* head/current. Clears pause/status/count/wait and loop pointer. Inserts after equals, increments active count, returns1; otherwise returns0.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/rumble.c#L129-L155.

### `HSD_Rumble_80378524`

`void HSD_Rumble_80378524(int a)`

Stores low byte of int into global suppression field under interrupt masking. Nonzero stored value makes interpreter skip direct and script evaluation and resolve0, freezing all queued timers. Zero resumes. Does not command motors immediately.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/rumble.c#L157-L163.

### `HSD_PadRumbleInterpret1`

`int HSD_PadRumbleInterpret1(HSD_PadRumbleListData* a, u8* b)`

Exactly pause1 returns0 without output or time changes. With wait0 decodes high three bits of first byte of u16 command:0 ends frame-2 or restarts head;1/2/3 set internal status2/1/0 and load low13 wait;4 loads low13 loop count and saves next cursor;5 decrements u16 count and loops or advances. Once wait nonzero, writes output, decrements wait and finite frame. Frame-1/-2 skip decrement; finite reaching0 returns1. Opcodes6/7 have no advancing case; malformed zero-wait streams can loop indefinitely.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/rumble.c#L165-L215.

### `HSD_PadRumbleInterpret`

`void HSD_PadRumbleInterpret(void)`

For each port seeds0, then if suppression clear uses direct_status and visits every node in list order, recycling completed nodes. Each interpreter output overwrites status; later emitting nodes win, so larger priorities and later equal-priority insertions dominate. Paused/early-ending nodes do not overwrite. Final status change maps0→PAD2 STOP_HARD,1→PAD0 STOP,2→PAD1 RUMBLE, then caches status. Does not mask interrupts locally.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/rumble.c#L217-L254.

### `HSD_PadRumbleInit`

`void HSD_PadRumbleInit(u16 a, void* b)`

Clears suppression, stores u16 capacity and caller void* as node array. For nonzero count links all supplied nodes and terminates NULL; zero count does no node writes. Copies authored zero template into all four channels. Does not call PAD motor or mask interrupts.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/rumble.c#L258-L275.

## Types and Naming

Owned header defines HSD_RumbleData, RumbleInfo and request fields. pause/pri/status and suppression are u8; wait/loop_count are u16; id is u32 and frame s32. Actual command cursors are u16*, despite commented HSD_Rumble* alternatives. RumbleCommand is two u16 fields, and HSD_Rumble unions that struct with u16; this is not proof that runtime streams use two-word commands. Runtime parsing advances one u16 at a time and extracts opcode from the first byte.

All 15 source functions are covered. HSD_PadRumblePause and func_80378430_inline lack report targets but have paired public declarations and explicit behavior/signature inventory. Address-only HSD_Rumble_80378524 receives proposed alias HSD_PadRumbleSetSuppression. Header parameter max is not capacity semantics. Existing useful canonical names remain unchanged.

The source declares a four-entry live array and zero-initialized template. Without compiled evidence, both full section targets and the inherited section-name alias remain unresolved. Specific callers supplying 12 nodes, match pause hooks, reset logic and disc-drive blocking behavior need separate review.

Pause affects only current entries and only pause byte1. New additions start unpaused. Interpreter and free helper do not locally mask interrupts; public mutators do, but caller synchronization is outside this review. No malformed-stream protections, port bounds, free-node not-found checks or nested-loop stack exist.

All fact IDs/timestamps and parameter roles are retained in JSON. Integer fact versions are unavailable from helper. Foreign canonical PAD header lines10–19 establishes hardware command constants; no foreign type ownership claimed. No source/shared KB writes.

Dry-run valid: 9 accepted, 0 rejected. Proposal SHA-256 `74e13774eee343ae385157e98d5076f585a003e4dd20e14023b22db2687323aa`.


## TU independent review

Owned C276/H65 independently reviewed canonically and separately rendered; no errors/substitutions. All81 facts and9 proposals reviewed. No port bounds checks; request IDs u32, priorities/pause/suppressionu8, loop/waitu16. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/rumble.h#L8-L44`.

On stores internal1, dispatcher maps it to command0. Foreign canonical-only pad.h13-15 confirms STOP0/RUMBLE1/HARDSTOP2. Controller.c64 and588 confirm servicing and initialization delegation. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/rumble.c#L217-L254`.

Insertion sorts stored byte priority ascending and preserves equal-priority arrival order. Every later unpaused request that emits output overrides earlier output, even on finite completion before removal. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/rumble.c#L117-L154`.

Pause requires exactly1. Opcodes6/7 do not advance, zero-duration control streams can fail to terminate, loop zero underflows, and there is one saved loop cursor. Opcode extraction reads first byte, consistent with big-endian packed u16 only under target byte order. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/rumble.c#L165-L215`.

Free assumes exact active membership and has no absent-node exit or local interrupt guard. Per-port removals mask interrupts; all-port helpers use four separate critical sections. Initialization resets last-status without sending a motor command. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/rumble.c#L30-L115`.

## Packet

[Coverage](coverage.json), [fact dispositions](dispositions.json), [subject coverage](subject-coverage.json), [unresolved claims](unresolved.json), [proposal](proposal.json), [validation](validation.json).
